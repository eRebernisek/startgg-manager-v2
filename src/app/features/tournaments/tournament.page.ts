import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Tournament } from '../../core/api/models';
import { StartggApi } from '../../core/api/startgg-api.service';
import { shortSlug, startggAdminUrl } from '../../core/bracket-url';
import { BreadcrumbService, tournamentCrumbKey } from '../../core/breadcrumbs';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { AvatarComponent } from '../../shared/avatar.component';
import { errorMessage, formatDate, profileImage } from '../../shared/display';

@Component({
  selector: 'app-tournament-page',
  imports: [RouterLink, AvatarComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="spinner"></div>
    }
    @if (error()) {
      <div class="alert error">{{ error() }}</div>
    }
    @if (data(); as t) {
      <div class="stack">
        <div class="row">
          <app-avatar [src]="profileImage(t.images)" [name]="t.name" [size]="56" />
          <div class="spacer">
            <h1>{{ t.name }}</h1>
            <div class="muted small">
              {{ formatDate(t.startAt, i18n.lang()) }}{{ t.city ? ' · ' + t.city : '' }}
            </div>
          </div>
          @if (t.admins) {
            <span class="badge ok">{{ 'tournament.admin' | t }}</span>
            <a class="btn sm" [href]="adminUrl(t.slug)" target="_blank" rel="noopener">{{
              'tournament.adminLink' | t
            }}</a>
          } @else {
            <span class="badge">{{ 'tournament.readOnly' | t }}</span>
          }
        </div>
        <h2>{{ 'tournament.events' | t }}</h2>
        <div class="grid">
          @for (e of t.events ?? []; track e.id) {
            <a class="card list-item clickable" [routerLink]="['event', shortSlug(e.slug)]">
              <app-avatar [src]="profileImage(e.videogame?.images)" [name]="e.videogame?.name" [size]="40" />
              <div class="spacer">
                <strong>{{ e.name }}</strong>
                <div class="muted small">
                  {{ e.videogame?.displayName ?? e.videogame?.name }} ·
                  {{ 'tournament.entrantsCount' | t: { n: e.numEntrants ?? 0 } }}
                </div>
              </div>
            </a>
          } @empty {
            <p class="muted">{{ 'tournament.noEvents' | t }}</p>
          }
        </div>
      </div>
    }
  `,
})
export class TournamentPage {
  private readonly api = inject(StartggApi);
  private readonly breadcrumbs = inject(BreadcrumbService);
  protected readonly i18n = inject(I18nService);
  readonly tournament = input.required<string>();

  protected readonly data = signal<Tournament | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly shortSlug = shortSlug;
  protected readonly profileImage = profileImage;
  protected readonly formatDate = formatDate;

  constructor() {
    effect(() => void this.load(this.tournament()));
  }

  protected adminUrl(slug: string): string {
    return startggAdminUrl(shortSlug(slug));
  }

  private async load(slug: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const t = await this.api.tournament(slug);
      if (slug !== this.tournament()) return;
      if (!t) throw new Error(this.i18n.t('tournament.notFound', { slug }));
      this.data.set(t);
      this.breadcrumbs.setLabel(tournamentCrumbKey(slug), t.name);
    } catch (e) {
      if (slug !== this.tournament()) return;
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
