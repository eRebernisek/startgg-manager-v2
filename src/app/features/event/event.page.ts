import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { shortSlug, startggAdminUrl } from '../../core/bracket-url';
import { BreadcrumbService, eventCrumbKey, tournamentCrumbKey } from '../../core/breadcrumbs';
import { EventStore } from './event.store';

@Component({
  selector: 'app-event-page',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  providers: [EventStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.error()) {
      <div class="alert error row">
        <span class="spacer">{{ store.error() }}</span>
        <button type="button" class="sm" (click)="retry()">Retry</button>
      </div>
    }
    @if (store.event(); as e) {
      <div class="row" style="margin-bottom: 0.75rem">
        <div class="spacer">
          <a class="muted small" [routerLink]="['/tournament', tournament()]">{{ e.tournament.name }}</a>
          <h1>{{ e.name }}</h1>
          <div class="muted small">
            {{ e.videogame?.displayName ?? e.videogame?.name }} · {{ e.numEntrants ?? 0 }} entrants
            @if (store.phases().length) {
              · {{ store.phases().length }} phases
            }
          </div>
        </div>
        @if (store.canEdit()) {
          <span class="badge ok">Admin · can edit</span>
        } @else {
          <span class="badge" [title]="store.readOnlyReason()">Read-only</span>
        }
        <a class="btn sm" [href]="startggUrl()" target="_blank" rel="noopener">start.gg ↗</a>
      </div>
      <nav class="tabs">
        <a routerLink="bracket" routerLinkActive="active">Bracket</a>
        <a routerLink="sets" routerLinkActive="active">Sets</a>
        <a routerLink="entrants" routerLinkActive="active">Entrants</a>
        <a routerLink="seeding" routerLinkActive="active">Seeding</a>
      </nav>
      @if (store.syncing(); as msg) {
        <div class="alert info small row" style="margin-bottom: 0.75rem">
          <span class="spinner sm"></span>{{ msg }}
        </div>
      }
      @if (!store.phases().length) {
        <p class="muted">This event has no phases yet.</p>
      } @else {
        <router-outlet />
      }
    } @else if (store.loading()) {
      <div class="spinner" aria-label="Loading event"></div>
    }
  `,
})
export class EventPage {
  protected readonly store = inject(EventStore);
  private readonly breadcrumbs = inject(BreadcrumbService);
  readonly tournament = input.required<string>();
  readonly event = input.required<string>();

  constructor() {
    effect(() => void this.store.load(this.tournament(), this.event()));
    effect(() => {
      const loaded = this.store.event();
      const tournament = this.tournament();
      const event = this.event();
      if (!loaded || shortSlug(loaded.slug) !== event) return;
      const loadedTournament = shortSlug(loaded.tournament.slug);
      if (loadedTournament !== tournament && loaded.tournament.slug !== tournament) return;
      this.breadcrumbs.setLabel(tournamentCrumbKey(tournament), loaded.tournament.name);
      this.breadcrumbs.setLabel(eventCrumbKey(tournament, event), loaded.name);
    });
  }

  protected retry(): void {
    void this.store.load(this.tournament(), this.event());
  }

  protected startggUrl(): string {
    return this.store.canEdit()
      ? startggAdminUrl(this.tournament(), `brackets`)
      : `https://www.start.gg/tournament/${this.tournament()}/event/${this.event()}`;
  }
}
