import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Tournament } from '../../core/api/models';
import { StartggApi } from '../../core/api/startgg-api.service';
import { shortSlug, startggAdminUrl } from '../../core/bracket-url';
import { AvatarComponent } from '../../shared/avatar.component';
import { errorMessage, formatDate, profileImage } from '../../shared/display';

@Component({
  selector: 'app-tournament-page',
  imports: [RouterLink, AvatarComponent],
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
            <div class="muted small">{{ formatDate(t.startAt) }}{{ t.city ? ' · ' + t.city : '' }}</div>
          </div>
          @if (t.admins) {
            <span class="badge ok">Admin</span>
            <a class="btn sm" [href]="adminUrl(t.slug)" target="_blank" rel="noopener">start.gg admin ↗</a>
          } @else {
            <span class="badge">Read-only</span>
          }
        </div>
        <h2>Events</h2>
        <div class="grid">
          @for (e of t.events ?? []; track e.id) {
            <a class="card list-item clickable" [routerLink]="['event', shortSlug(e.slug)]">
              <app-avatar [src]="profileImage(e.videogame?.images)" [name]="e.videogame?.name" [size]="40" />
              <div class="spacer">
                <strong>{{ e.name }}</strong>
                <div class="muted small">
                  {{ e.videogame?.displayName ?? e.videogame?.name }} · {{ e.numEntrants ?? 0 }} entrants
                </div>
              </div>
            </a>
          } @empty {
            <p class="muted">No events.</p>
          }
        </div>
      </div>
    }
  `,
})
export class TournamentPage {
  private readonly api = inject(StartggApi);
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
      if (!t) throw new Error(`Tournament "${slug}" not found.`);
      this.data.set(t);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
