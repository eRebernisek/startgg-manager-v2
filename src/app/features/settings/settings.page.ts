import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AttendeesApi, WebUser } from '../../core/api/attendees-api.service';
import { StartggApi } from '../../core/api/startgg-api.service';
import { StartggError } from '../../core/api/startgg-client';
import { StartggWebClient } from '../../core/api/startgg-web-client';
import { CurrentUser } from '../../core/api/models';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { ToastService } from '../../core/toast.service';
import { WebSessionService, normalizeSession } from '../../core/web-session.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { errorMessage, profileImage } from '../../shared/display';

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule, RouterLink, AvatarComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.page.html',
})
export class SettingsPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly web = inject(WebSessionService);
  private readonly webClient = inject(StartggWebClient);
  private readonly attendees = inject(AttendeesApi);
  private readonly api = inject(StartggApi);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly tokenInput = signal('');
  protected readonly showToken = signal(false);
  protected readonly user = signal<CurrentUser | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly profileImage = profileImage;

  protected readonly sessionInput = signal('');
  protected readonly showSession = signal(false);
  protected readonly proxyInput = signal('');
  protected readonly sessionBusy = signal(false);
  protected readonly sessionError = signal<string | null>(null);
  protected readonly sessionUser = signal<WebUser | null>(null);
  protected readonly transport = () => this.webClient.transport();

  ngOnInit(): void {
    this.tokenInput.set(this.auth.token() ?? '');
    this.sessionInput.set(this.web.session() ?? '');
    this.proxyInput.set(this.web.proxyUrl() ?? '');
    if (this.auth.hasToken()) void this.verify();
  }

  protected async save(): Promise<void> {
    const trimmed = this.tokenInput().trim();
    if (!trimmed) {
      await this.clear();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.user.set(null);
    try {
      // Temporarily set so the client can authenticate the verification call.
      await this.auth.setToken(trimmed);
      const user = await this.api.currentUser();
      if (!user) throw new StartggError(this.i18n.t('settings.tokenNoUser'), 'auth');
      this.user.set(user);
      this.toast.ok(
        this.i18n.t('settings.signedIn', {
          name: user.player?.gamerTag ?? user.name ?? this.i18n.t('settings.userFallback'),
        }),
      );
    } catch (e) {
      await this.auth.clear();
      this.error.set(errorMessage(e));
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async clear(): Promise<void> {
    await this.auth.clear();
    this.tokenInput.set('');
    this.user.set(null);
    this.error.set(null);
  }

  protected async saveProxy(): Promise<void> {
    await this.web.setProxyUrl(this.proxyInput());
  }

  /** Saves the session, then keeps it only if start.gg's website API recognises it. */
  protected async saveSession(): Promise<void> {
    this.sessionError.set(null);
    this.sessionUser.set(null);
    if (!this.sessionInput().trim()) {
      await this.clearSession();
      return;
    }
    const value = normalizeSession(this.sessionInput());
    if (!value) {
      this.sessionError.set(this.i18n.t('settings.sessionBadPaste'));
      return;
    }
    this.sessionBusy.set(true);
    try {
      await this.saveProxy();
      await this.web.setSession(value);
      const user = await this.attendees.sessionUser();
      if (!user) throw new StartggError(this.i18n.t('settings.sessionUnrecognized'), 'auth');
      this.sessionUser.set(user);
      this.sessionInput.set(value);
      this.toast.ok(
        this.i18n.t('settings.sessionToast', { name: user.player?.gamerTag ?? user.slug ?? '' }),
      );
    } catch (e) {
      await this.web.clearSession();
      this.sessionError.set(errorMessage(e));
    } finally {
      this.sessionBusy.set(false);
    }
  }

  protected async clearSession(): Promise<void> {
    await this.web.clearSession();
    this.sessionInput.set('');
    this.sessionUser.set(null);
    this.sessionError.set(null);
  }

  private async verify(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.user.set(await this.api.currentUser());
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
