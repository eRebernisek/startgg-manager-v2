import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { StorageService } from './storage.service';

const TOKEN_KEY = 'startgg_token';

/**
 * Holds the start.gg personal API token. OAuth is not used: start.gg's code exchange
 * requires the client secret, which cannot ship in a browser/mobile app (see PLAN.md).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storage = inject(StorageService);
  private readonly _token = signal<string | null>(null);
  private readonly authErrorSubject = new Subject<string>();

  readonly token = this._token.asReadonly();
  readonly hasToken = computed(() => !!this._token());
  /** Emits when the API reports an invalid token so the UI can toast + redirect. */
  readonly authError$ = this.authErrorSubject.asObservable();

  async load(): Promise<void> {
    this._token.set(await this.storage.get(TOKEN_KEY));
  }

  /** Persists a token that has already been verified with `currentUser`. */
  async setToken(token: string): Promise<void> {
    const trimmed = token.trim();
    if (!trimmed) return this.clear();
    await this.storage.set(TOKEN_KEY, trimmed);
    this._token.set(trimmed);
  }

  async clear(): Promise<void> {
    await this.storage.remove(TOKEN_KEY);
    this._token.set(null);
  }

  notifyAuthError(message = 'Your start.gg token is invalid. Please sign in again.'): void {
    void this.clear();
    this.authErrorSubject.next(message);
  }
}
