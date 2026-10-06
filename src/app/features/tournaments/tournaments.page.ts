import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Tournament } from '../../core/api/models';
import { StartggApi } from '../../core/api/startgg-api.service';
import { shortSlug } from '../../core/bracket-url';
import { AvatarComponent } from '../../shared/avatar.component';
import { errorMessage, formatDate, profileImage } from '../../shared/display';

const PER_PAGE = 25;

@Component({
  selector: 'app-tournaments-page',
  imports: [RouterLink, FormsModule, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack">
      <div class="row">
        <h1>My tournaments</h1>
        <span class="spacer"></span>
        <input placeholder="Filter…" [ngModel]="filter()" (ngModelChange)="filter.set($event)" />
      </div>
      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }
      <div class="card" style="padding: 0">
        @for (t of visible(); track t.id) {
          <a class="list-item clickable" [routerLink]="['/tournament', shortSlug(t.slug)]">
            <app-avatar [src]="profileImage(t.images)" [name]="t.name" [size]="44" />
            <div class="spacer">
              <strong>{{ t.name }}</strong>
              <div class="muted small">
                {{ formatDate(t.startAt) }}{{ t.city ? ' · ' + t.city : '' }}
              </div>
            </div>
          </a>
        } @empty {
          @if (!loading()) {
            <p class="muted" style="padding: 1rem">No tournaments where you are an admin.</p>
          }
        }
      </div>
      @if (loading()) {
        <div class="spinner"></div>
      } @else if (page() < totalPages()) {
        <button (click)="loadMore()">Load more</button>
      }
    </div>
  `,
})
export class TournamentsPage implements OnInit {
  private readonly api = inject(StartggApi);

  protected readonly tournaments = signal<Tournament[]>([]);
  protected readonly page = signal(0);
  protected readonly totalPages = signal(1);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly filter = signal('');
  protected readonly visible = computed(() => {
    const f = this.filter().toLowerCase();
    return this.tournaments().filter((t) => !f || t.name.toLowerCase().includes(f));
  });
  protected readonly shortSlug = shortSlug;
  protected readonly profileImage = profileImage;
  protected readonly formatDate = formatDate;

  ngOnInit(): void {
    void this.loadMore();
  }

  protected async loadMore(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const next = this.page() + 1;
      const conn = await this.api.adminTournaments(next, PER_PAGE);
      this.tournaments.update((list) => [...list, ...(conn.nodes ?? [])]);
      this.totalPages.set(conn.pageInfo?.totalPages ?? 1);
      this.page.set(next);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
