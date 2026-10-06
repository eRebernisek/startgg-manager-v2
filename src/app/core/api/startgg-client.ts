import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { AuthService } from '../auth.service';
import { WebSessionService } from '../web-session.service';
import { DEFAULT_PUBLIC_PROXY_URL } from './public-proxy';

export const OFFICIAL_ENDPOINT = 'https://api.start.gg/gql/alpha';
/**
 * Unofficial website endpoint used for token-less reads (same approach as TournamentStreamHelper).
 * CORS is locked to start.gg origins, so browsers need a same-origin or hosted proxy
 * (`DEFAULT_PUBLIC_PROXY_URL` / Settings → Proxy URL / `ng serve` `/sgg-public`).
 * Android can call it directly via CapacitorHttp.
 */
export const PUBLIC_ENDPOINT_NATIVE = 'https://www.start.gg/api/-/gql';
/** Dev-server proxy path only — see proxy.conf.mjs. Not available in static deploys. */
export const PUBLIC_ENDPOINT_WEB = '/sgg-public';
const PUBLIC_CLIENT_VERSION = '20';

export type StartggErrorKind =
  | 'auth'
  | 'permission'
  | 'rateLimit'
  | 'complexity'
  | 'graphql'
  | 'network';

export class StartggError extends Error {
  constructor(
    message: string,
    readonly kind: StartggErrorKind,
  ) {
    super(message);
    this.name = 'StartggError';
  }
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: { message: string }[];
  success?: boolean;
  message?: string;
  extensions?: { queryComplexity?: number };
}

interface CacheEntry {
  expires: number;
  value: unknown;
}

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3;
/** Stay under start.gg's ~80/min soft limit. */
const RATE_PER_MINUTE = 65;
const RATE_WINDOW_MS = 60_000;
const MAX_CONCURRENCY = 3;

@Injectable({ providedIn: 'root' })
export class StartggClient {
  private readonly auth = inject(AuthService);
  private readonly web = inject(WebSessionService);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly timestamps: number[] = [];
  private generation = 0;
  private active = 0;
  private readonly waiters: (() => void)[] = [];

  /**
   * Runs a GraphQL operation. Queries are cached/de-duped when `cacheTtlMs` is set.
   * Mutations should pass `cacheTtlMs: 0` (default) and call `invalidate`.
   */
  async request<T>(
    query: string,
    variables: Record<string, unknown> = {},
    opts: { cacheTtlMs?: number; isMutation?: boolean; signal?: AbortSignal } = {},
  ): Promise<T> {
    const cacheKey = opts.cacheTtlMs ? `${query}\0${JSON.stringify(variables)}` : null;
    if (cacheKey) {
      const hit = this.cache.get(cacheKey);
      if (hit && hit.expires > Date.now()) return hit.value as T;
      const pending = this.inflight.get(cacheKey);
      if (pending) return pending as Promise<T>;
    }

    const run = this.enqueue(() => this.execute<T>(query, variables, opts));
    if (cacheKey) {
      const generation = this.generation;
      this.inflight.set(cacheKey, run);
      try {
        const value = await run;
        // Responses that started before an invalidate() may predate the mutation.
        if (generation === this.generation) {
          this.cache.set(cacheKey, { expires: Date.now() + (opts.cacheTtlMs ?? 0), value });
        }
        return value;
      } finally {
        if (this.inflight.get(cacheKey) === run) this.inflight.delete(cacheKey);
      }
    }
    return run;
  }

  invalidate(predicate?: (key: string) => boolean): void {
    this.generation++;
    if (!predicate) {
      this.cache.clear();
      this.inflight.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (predicate(key)) this.cache.delete(key);
    }
    for (const key of this.inflight.keys()) {
      if (predicate(key)) this.inflight.delete(key);
    }
  }

  private async execute<T>(
    query: string,
    variables: Record<string, unknown>,
    opts: { isMutation?: boolean; signal?: AbortSignal },
  ): Promise<T> {
    const token = this.auth.token();
    if (!token && opts.isMutation) {
      throw new StartggError(
        'Editing requires a start.gg API token. Add one in Settings.',
        'auth',
      );
    }

    const publicUrl = token ? null : this.resolvePublicEndpoint();
    if (!token && !publicUrl) {
      throw new StartggError(
        'Cannot load start.gg without a token (browser CORS). Deploy proxy/ and set its URL in Settings, or add an API token.',
        'network',
      );
    }

    const [url, headers] = token
      ? [OFFICIAL_ENDPOINT, { Authorization: `Bearer ${token}` }]
      : [publicUrl!, { 'client-version': PUBLIC_CLIENT_VERSION }];

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      opts.signal?.addEventListener('abort', onAbort);
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ query, variables }),
          signal: controller.signal,
        });
      } catch (e) {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
        const aborted = e instanceof DOMException && e.name === 'AbortError';
        if (aborted && opts.signal?.aborted) throw e;
        // Never auto-retry mutations on network errors — the request may have succeeded.
        if (!opts.isMutation && attempt < MAX_RETRIES) {
          await delay(jitter(800 * 2 ** attempt));
          continue;
        }
        throw new StartggError(
          token
            ? 'Could not reach start.gg. Check your connection.'
            : 'Could not reach start.gg in view-only mode. Check your connection, or add an API token in Settings.',
          'network',
        );
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
      }

      if (res.status === 429 && attempt < MAX_RETRIES && !opts.isMutation) {
        await delay(jitter(1000 * 2 ** attempt));
        continue;
      }

      const body = (await res.json().catch(() => ({}))) as GraphqlResponse<T>;

      if (res.status === 429 || isRateLimitBody(body)) {
        if (attempt < MAX_RETRIES && !opts.isMutation) {
          await delay(jitter(1000 * 2 ** attempt));
          continue;
        }
        throw new StartggError('start.gg rate limit reached, try again in a minute.', 'rateLimit');
      }

      // Website API answers `data: []` for rejected admin mutations when there is no session.
      if (!token && Array.isArray((body as { data?: unknown }).data)) {
        throw new StartggError(
          opts.isMutation
            ? 'Editing requires a start.gg API token. Add one in Settings.'
            : 'start.gg returned no data.',
          opts.isMutation ? 'auth' : 'graphql',
        );
      }

      if (body.success === false || res.status === 401 || res.status === 400) {
        const msg = body.message ?? `Request failed (HTTP ${res.status}).`;
        if (isRateLimitMessage(msg)) {
          throw new StartggError(msg, 'rateLimit');
        }
        if (res.status === 401 || /token|auth|authentication/i.test(msg)) {
          if (token) this.auth.notifyAuthError();
          throw new StartggError(msg, 'auth');
        }
        throw new StartggError(msg, 'graphql');
      }

      if (body.errors?.length) {
        const message = body.errors.map((e) => e.message).join('; ');
        if (/complexity/i.test(message)) {
          throw new StartggError(message, 'complexity');
        }
        if (/you do not have permission|not authorized|unauthorized/i.test(message)) {
          throw new StartggError(message, 'permission');
        }
        // Partial data is usable for queries — start.gg often errors on one null subfield. Mutations that
        // fail come back as HTTP 200 with `data: { mutationField: null }`, so they must always throw.
        if (!opts.isMutation && body.data != null) return body.data;
        throw new StartggError(message, 'graphql');
      }

      if (!res.ok || body.data == null) {
        if (res.status >= 500 && attempt < MAX_RETRIES && !opts.isMutation) {
          await delay(jitter(800 * 2 ** attempt));
          continue;
        }
        throw new StartggError(`start.gg request failed (HTTP ${res.status}).`, 'network');
      }
      return body.data;
    }
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const tryRun = () => {
        if (this.active >= MAX_CONCURRENCY || !this.canTakeToken()) {
          this.waiters.push(tryRun);
          return;
        }
        this.takeToken();
        this.active++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            this.active--;
            this.pump();
          });
      };
      tryRun();
    });
  }

  private canTakeToken(): boolean {
    const now = Date.now();
    while (this.timestamps.length && this.timestamps[0]! < now - RATE_WINDOW_MS) {
      this.timestamps.shift();
    }
    return this.timestamps.length < RATE_PER_MINUTE;
  }

  private takeToken(): void {
    this.timestamps.push(Date.now());
  }

  private pump(): void {
    while (this.waiters.length && this.active < MAX_CONCURRENCY && this.canTakeToken()) {
      this.waiters.shift()!();
    }
    if (this.waiters.length && this.active < MAX_CONCURRENCY) {
      const wait = Math.max(50, RATE_WINDOW_MS - (Date.now() - (this.timestamps[0] ?? Date.now())));
      setTimeout(() => this.pump(), wait);
    }
  }

  /** Token-less read path: native → website API; localhost → ng serve proxy; else hosted CORS proxy. */
  private resolvePublicEndpoint(): string | null {
    if (Capacitor.isNativePlatform()) return PUBLIC_ENDPOINT_NATIVE;
    if (isDevProxyAvailable()) return PUBLIC_ENDPOINT_WEB;
    return this.web.proxyUrl() ?? DEFAULT_PUBLIC_PROXY_URL;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number): number {
  return Math.round(ms * (0.7 + Math.random() * 0.6));
}

function isRateLimitBody(body: GraphqlResponse<unknown>): boolean {
  return body.success === false && isRateLimitMessage(body.message ?? '');
}

function isRateLimitMessage(msg: string): boolean {
  return /rate limit/i.test(msg);
}

/** True when Angular's proxy is serving `/sgg-public` (dev only). */
function isDevProxyAvailable(): boolean {
  return typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);
}
