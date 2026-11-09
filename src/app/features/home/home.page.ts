import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { parseBracketUrl } from '../../core/bracket-url';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';

@Component({
  selector: 'app-home-page',
  imports: [FormsModule, RouterLink, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.page.html',
})
export class HomePage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  protected readonly url = signal('');
  protected readonly error = signal<string | null>(null);

  protected open(): void {
    const parts = parseBracketUrl(this.url());
    if (!parts) {
      this.error.set(this.i18n.t('home.badUrl'));
      return;
    }
    this.error.set(null);
    if (!parts.eventSlug) {
      void this.router.navigate(['/tournament', parts.tournamentSlug]);
      return;
    }
    void this.router.navigate(['/tournament', parts.tournamentSlug, 'event', parts.eventSlug, 'bracket'], {
      queryParams: { phase: parts.phaseId, group: parts.phaseGroupId },
    });
  }
}
