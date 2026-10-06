import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BracketSet, SetState } from '../../core/api/models';
import { StartggApi } from '../../core/api/startgg-api.service';
import { errorMessage, setStateLabel } from '../../shared/display';
import { EventStore } from '../event/event.store';
import { SetBoxComponent } from './set-box.component';
import { openSetEditor } from './set-editor.dialog';

const PER_PAGE = 40;

@Component({
  selector: 'app-sets-page',
  imports: [FormsModule, SetBoxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack">
      <div class="row">
        <label class="field">
          Filter
          <select [ngModel]="filter()" (ngModelChange)="filter.set($event); reload()">
            <option value="all">All</option>
            <option value="live">In progress / called</option>
            <option value="ready">Ready</option>
            <option value="done">Completed</option>
          </select>
        </label>
        <span class="spacer"></span>
        <button type="button" class="sm" (click)="reload()" [disabled]="loading()">Refresh</button>
      </div>

      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }

      <div class="set-grid">
        @for (s of sets(); track s.id) {
          <button type="button" class="set-wrap" (click)="open(s)">
            <div class="muted small meta">
              {{ s.fullRoundText || s.identifier }}
              @if (s.phaseGroup?.displayIdentifier) {
                · {{ s.phaseGroup!.displayIdentifier }}
              }
              · {{ setStateLabel(s.state) }}
            </div>
            <app-set-box [set]="s" />
          </button>
        } @empty {
          @if (!loading()) {
            <p class="muted">No sets match this filter.</p>
          }
        }
      </div>

      @if (loading()) {
        <div class="spinner"></div>
      } @else if (page() < totalPages()) {
        <button type="button" (click)="loadMore()">Load more</button>
      }
    </div>
  `,
  styles: `
    .set-grid {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    }
    .set-wrap {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .meta {
      padding: 0 0.15rem;
    }
    app-set-box {
      min-height: 56px;
    }
  `,
})
export class SetsPage {
  private readonly api = inject(StartggApi);
  private readonly store = inject(EventStore);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);

  protected readonly sets = signal<BracketSet[]>([]);
  protected readonly page = signal(0);
  protected readonly totalPages = signal(1);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly filter = signal<'all' | 'live' | 'ready' | 'done'>('all');
  protected readonly setStateLabel = setStateLabel;
  private loadToken = 0;

  constructor() {
    effect(() => {
      this.store.revision();
      untracked(() => this.reload());
    });
  }

  protected open(s: BracketSet): void {
    openSetEditor(this.dialog, this.injector, s.id);
  }

  protected reload(): void {
    this.loadToken++;
    this.sets.set([]);
    this.page.set(0);
    this.totalPages.set(1);
    void this.loadMore();
  }

  protected async loadMore(): Promise<void> {
    const eventId = this.store.event()?.id;
    if (!eventId) return;
    const token = this.loadToken;
    this.loading.set(true);
    this.error.set(null);
    try {
      const next = this.page() + 1;
      const conn = await this.api.eventSets(eventId, next, PER_PAGE, this.filters());
      if (token !== this.loadToken) return;
      this.sets.update((list) => [...list, ...(conn.nodes ?? [])]);
      this.totalPages.set(conn.pageInfo?.totalPages ?? 1);
      this.page.set(next);
    } catch (e) {
      if (token === this.loadToken) this.error.set(errorMessage(e));
    } finally {
      if (token === this.loadToken) this.loading.set(false);
    }
  }

  private filters() {
    switch (this.filter()) {
      case 'live':
        return { state: [SetState.InProgress, SetState.Called] };
      case 'ready':
        return { state: [SetState.Ready, SetState.Queued] };
      case 'done':
        return { state: [SetState.Completed] };
      default:
        return {};
    }
  }
}
