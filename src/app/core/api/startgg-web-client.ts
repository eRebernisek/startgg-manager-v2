import { Injectable, inject, isDevMode } from '@angular/core';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { WebSessionService } from '../web-session.service';
import { DEFAULT_PUBLIC_PROXY_URL } from './public-proxy';
import { StartggError } from './startgg-client';

export const WEB_ENDPOINT = 'https://www.start.gg/api/-/gql';
/** `ng serve` route (proxy.conf.mjs) that forwards to WEB_ENDPOINT and turns the session header into the cookie. */
export const DEV_WEB_PROXY = '/sgg-web';
/** Header the proxies read the session from; browsers cannot set `Cookie` on cross-origin requests. */
export const SESSION_HEADER = 'X-Startgg-Session';
/** start.gg answers "Out of date client" without it. */
const CLIENT_VERSION = '20';
const REQUEST_TIMEOUT_MS = 20_000;

/** Rows start.gg created/updated/deleted, e.g. `{ update: { participants: [123] } }`. */
export type ActionRecords = Partial<Record<'update' | 'delete', Record<string, number[]>>>;

export interface WebResult<T> {
  data: T;
  actionRecords: ActionRecords;
}

interface WebResponse<T> {
  data?: T | unknown[] | null;
  errors?: { message: string }[];
  success?: boolean;
  message?: string;
  actionRecords?: ActionRecords | unknown[];
}

export type WebTransportKind = 'native' | 'proxy' | 'dev-proxy' | 'none';

/**
 * Client for start.gg's unofficial website GraphQL API. Its CORS only allows https://www.start.gg, so:
 * - Android: CapacitorHttp calls it natively (no CORS) and sends the session as the `gg_session` cookie.
 * - Web: requests go through a proxy (the optional proxy in `proxy/`, or the `ng serve` dev proxy).
 */
@Injectable({ providedIn: 'root' })
export class StartggWebClient {
  private readonly web = inject(WebSessionService);

  transport(): WebTransportKind {
    if (Capacitor.isNativePlatform()) return 'native';
    // Prefer the ng serve proxy locally unless the user set an explicit Worker URL.
    if (isDevMode() && !this.web.proxyUrl()) return 'dev-proxy';
    if (this.web.proxyUrl() || DEFAULT_PUBLIC_PROXY_URL) return 'proxy';
    return 'none';
  }

  /** Effective proxy URL: Settings override, else the shipped default Worker. */
  proxyEndpoint(): string {
    return this.web.proxyUrl() ?? DEFAULT_PUBLIC_PROXY_URL;
  }

  /** Mutations need a website session; queries are sent anonymously when there is none. */
  async request<T>(
    query: string,
    variables: Record<string, unknown>,
    opts: { isMutation?: boolean } = {},
  ): Promise<WebResult<T>> {
    const session = this.web.session();
    if (opts.isMutation && !session) {
      throw new StartggError(
        'This needs your start.gg website session. Paste it in Settings → start.gg website session.',
        'auth',
      );
    }
    const body = await this.send<T>(JSON.stringify({ query, variables }), session);

    if (body.success === false) {
      throw new StartggError(body.message ?? 'start.gg rejected the request.', classify(body.message ?? ''));
    }
    if (body.errors?.length) {
      const message = body.errors.map((e) => e.message).join('; ');
      throw new StartggError(message, classify(message));
    }
    // Hidden admin mutations answer `data: []` when start.gg does not recognise the session.
    if (Array.isArray(body.data) || body.data == null) {
      throw new StartggError(
        opts.isMutation
          ? 'start.gg did not accept the website session (logged out or expired). Paste a fresh gg_session in Settings.'
          : 'start.gg returned no data.',
        opts.isMutation ? 'auth' : 'graphql',
      );
    }
    const records = Array.isArray(body.actionRecords) ? {} : (body.actionRecords ?? {});
    return { data: body.data as T, actionRecords: records };
  }

  private async send<T>(payload: string, session: string | null): Promise<WebResponse<T>> {
    const base: Record<string, string> = {
      'Content-Type': 'application/json',
      'client-version': CLIENT_VERSION,
      'x-web-source': 'gg-web-gql-client',
    };
    const kind = this.transport();
    try {
      if (kind === 'native') {
        const res = await CapacitorHttp.request({
          url: WEB_ENDPOINT,
          method: 'POST',
          headers: {
            ...base,
            Origin: 'https://www.start.gg',
            Referer: 'https://www.start.gg/',
            ...(session ? { Cookie: `gg_session=${session}` } : {}),
          },
          data: JSON.parse(payload),
          connectTimeout: REQUEST_TIMEOUT_MS,
          readTimeout: REQUEST_TIMEOUT_MS,
        });
        return (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) as WebResponse<T>;
      }
      if (kind === 'none') {
        throw new StartggError(
          'Browsers cannot call start.gg’s website API directly (CORS). Set a proxy URL in Settings, or use the Android app.',
          'network',
        );
      }
      const url = kind === 'proxy' ? this.proxyEndpoint() : DEV_WEB_PROXY;
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...base, ...(session ? { [SESSION_HEADER]: session } : {}) },
        body: payload,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await res.text();
      try {
        return JSON.parse(text) as WebResponse<T>;
      } catch {
        throw new StartggError(`The start.gg website API proxy answered HTTP ${res.status} without JSON.`, 'network');
      }
    } catch (e) {
      if (e instanceof StartggError) throw e;
      throw new StartggError(
        kind === 'proxy'
          ? 'Could not reach the start.gg proxy. Check the proxy URL in Settings.'
          : 'Could not reach start.gg’s website API.',
        'network',
      );
    }
  }
}

function classify(message: string) {
  if (/rate limit/i.test(message)) return 'rateLimit' as const;
  if (/permission|not authorized|unauthorized|admin/i.test(message)) return 'permission' as const;
  if (/log ?in|session|auth/i.test(message)) return 'auth' as const;
  return 'graphql' as const;
}
