import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { startggAdminUrl } from '../../core/bracket-url';
import { EventStore } from './event.store';

@Component({
  selector: 'app-event-page',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  providers: [EventStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.error()) {
      <div class="alert error">{{ store.error() }}</div>
    }
    @if (store.event(); as e) {
      <div class="row" style="margin-bottom: 0.75rem">
        <div class="spacer">
          <a class="muted small" [routerLink]="['/tournament', tournament()]">{{ e.tournament.name }}</a>
          <h1>{{ e.name }}</h1>
          <div class="muted small">
            {{ e.videogame?.displayName ?? e.videogame?.name }} · {{ e.numEntrants ?? 0 }} entrants
          </div>
        </div>
        @if (store.canEdit()) {
          <span class="badge ok">Admin · can edit</span>
        } @else {
          <span class="badge" [title]="readOnlyReason()">Read-only</span>
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
      <router-outlet />
    } @else if (store.loading()) {
      <div class="spinner"></div>
    }
  `,
})
export class EventPage {
  protected readonly store = inject(EventStore);
  private readonly auth = inject(AuthService);
  readonly tournament = input.required<string>();
  readonly event = input.required<string>();

  constructor() {
    effect(() => void this.store.load(this.tournament(), this.event()));
  }

  protected readOnlyReason(): string {
    return this.auth.hasToken()
      ? 'Your token is not an admin of this tournament.'
      : 'View-only — add an API token in Settings to edit when you are an admin.';
  }

  protected startggUrl(): string {
    return this.store.canEdit()
      ? startggAdminUrl(this.tournament(), `brackets`)
      : `https://www.start.gg/tournament/${this.tournament()}/event/${this.event()}`;
  }
}
