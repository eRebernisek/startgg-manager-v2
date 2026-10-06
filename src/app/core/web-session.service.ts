import { Injectable, computed, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';

const SESSION_KEY = 'startgg_web_session';
const PROXY_KEY = 'startgg_web_proxy';

/**
 * Credentials for start.gg's unofficial website API (`www.start.gg/api/-/gql`), which is the only API that can add,
 * rename and remove attendees. It authenticates with the `gg_session` cookie of a logged-in browser, not with the
 * personal API token. Stored like the token (Preferences / localStorage) and never logged.
 */
@Injectable({ providedIn: 'root' })
export class WebSessionService {
  private readonly storage = inject(StorageService);
  private readonly _session = signal<string | null>(null);
  private readonly _proxyUrl = signal<string | null>(null);

  readonly session = this._session.asReadonly();
  readonly proxyUrl = this._proxyUrl.asReadonly();
  readonly hasSession = computed(() => !!this._session());

  async load(): Promise<void> {
    this._session.set(await this.storage.get(SESSION_KEY));
    this._proxyUrl.set(await this.storage.get(PROXY_KEY));
  }

  async setSession(input: string): Promise<void> {
    const value = normalizeSession(input);
    if (!value) return this.clearSession();
    await this.storage.set(SESSION_KEY, value);
    this._session.set(value);
  }

  async clearSession(): Promise<void> {
    await this.storage.remove(SESSION_KEY);
    this._session.set(null);
  }

  async setProxyUrl(input: string): Promise<void> {
    const url = input.trim().replace(/\/+$/, '');
    if (!url) {
      await this.storage.remove(PROXY_KEY);
      this._proxyUrl.set(null);
      return;
    }
    await this.storage.set(PROXY_KEY, url);
    this._proxyUrl.set(url);
  }
}

/**
 * Accepts the bare cookie value, `gg_session=<value>`, or a whole pasted `Cookie:` header, and returns the value.
 */
export function normalizeSession(input: string | null | undefined): string | null {
  const text = (input ?? '').trim().replace(/^cookie:\s*/i, '');
  if (!text) return null;
  const match = /(?:^|;\s*)gg_session=([^;\s]+)/.exec(text);
  if (match) return match[1]!;
  if (text.includes('=') || /[;\s]/.test(text)) return null;
  return text;
}
