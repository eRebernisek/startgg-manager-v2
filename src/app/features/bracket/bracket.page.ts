import { Dialog } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BracketSet, PhaseGroupRef, Seed } from '../../core/api/models';
import { firstValueFrom } from 'rxjs';
import { StartggApi } from '../../core/api/startgg-api.service';
import { bracketSignature } from '../../core/bracket-reset';
import {
  poolStarted,
  rebuiltAfterStart,
  resolvePhaseGroupId,
  sortPhaseGroups,
  startPool,
} from '../../core/bracket-start';
import { ToastService } from '../../core/toast.service';
import { errorMessage } from '../../shared/display';
import { EventStore } from '../event/event.store';
import { openSetEditor } from '../sets/set-editor.dialog';
import { BracketViewComponent } from './bracket-view.component';
import { confirmBracketStart } from './start-bracket.dialog';

@Component({
  selector: 'app-bracket-page',
  imports: [FormsModule, BracketViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack">
      @if (!phases().length) {
        <p class="muted">No phases published for this event yet.</p>
      } @else {
        <div class="row">
          <label class="field">
            Phase
            <select
              [ngModel]="phaseId()"
              (ngModelChange)="onPhaseChange($event)"
              [attr.aria-label]="'Phase'"
            >
              @for (p of phases(); track p.id) {
                <option [value]="'' + p.id">{{ p.name }}</option>
              }
            </select>
          </label>
          @if (groups().length > 1) {
            <label class="field">
              Group
              <select
                [ngModel]="groupId()"
                (ngModelChange)="onGroupChange($event)"
                [attr.aria-label]="'Group'"
              >
                @for (g of groups(); track g.id) {
                  <option [value]="'' + g.id">{{ g.displayIdentifier || g.id }}</option>
                }
              </select>
            </label>
          }
          <span class="spacer"></span>
          @if (progress()) {
            <span class="muted small">{{ progress() }}</span>
          } @else if (loading() && displaySets().length) {
            <span class="muted small">Updating…</span>
          }
          @if (store.canEdit() && group()) {
            @if (started()) {
              <button type="button" class="sm start-btn running" disabled title="This bracket is running on start.gg">
                <span class="dot" aria-hidden="true"></span>Running
              </button>
            } @else {
              <button type="button" class="primary sm start-btn" [disabled]="starting()" (click)="startBracket()">
                {{ starting() ? 'Starting…' : 'Start bracket' }}
              </button>
            }
          }
        </div>

        @if (store.syncFailed(); as syncErr) {
          <div class="alert error row">
            <span class="spacer">{{ syncErr }}</span>
            <button type="button" class="sm" (click)="retrySync()">Retry</button>
          </div>
        }
        @if (error()) {
          <div class="alert error">{{ error() }}</div>
        }
        @if (rebuilding()) {
          <div class="alert info small row rebuild-banner">
            <span class="spinner sm"></span>Rebuilding…
          </div>
        }
        @if (loading() && !displaySets().length) {
          <div class="spinner" aria-label="Loading bracket"></div>
        } @else if (displaySets().length) {
          <app-bracket-view
            class="bracket-canvas"
            [class.rebuilding]="rebuilding()"
            [class.switching]="loading()"
            [sets]="displaySets()"
            [seeds]="seeds()"
            [bracketType]="bracketType()"
            (selectSet)="openSet($event)"
          />
        } @else if (!loading() && !rebuilding()) {
          @if (!groups().length) {
            <p class="muted">This phase has no pools yet.</p>
          } @else {
            <p class="muted">No sets in this phase group yet.</p>
          }
        }
      }
    </div>
  `,
  styles: `
    .start-btn {
      flex-shrink: 0;
      white-space: nowrap;
      align-self: flex-end;
    }
    .start-btn.running:disabled {
      opacity: 1;
      cursor: default;
      color: var(--ok);
      border-color: color-mix(in srgb, var(--ok) 45%, transparent);
    }
    .dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: currentColor;
    }
    .rebuild-banner {
      margin-bottom: 0.25rem;
    }
    .bracket-canvas.rebuilding,
    .bracket-canvas.switching {
      opacity: 0.55;
      pointer-events: none;
    }
  `,
})
export class BracketPage implements OnDestroy {
  private readonly api = inject(StartggApi);
  private readonly store = inject(EventStore);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  /** Reactive query params — URL is the source of truth for phase/group. */
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly phaseId = signal('');
  protected readonly groupId = signal('');
  protected readonly sets = signal<BracketSet[]>([]);
  /** Last non-empty bracket for the current group; kept visible while start.gg rebuilds. */
  private readonly staleSets = signal<BracketSet[]>([]);
  /** Group id that `sets` / `staleSets` belong to — avoids flashing another pool while switching. */
  private readonly loadedGroupId = signal('');
  protected readonly seeds = signal<Seed[]>([]);
  protected readonly loading = signal(false);
  protected readonly progress = signal('');
  protected readonly error = signal<string | null>(null);

  protected readonly phases = computed(() => this.store.phases());
  protected readonly groups = computed<PhaseGroupRef[]>(() => {
    const phase = this.phases().find((p) => String(p.id) === this.phaseId());
    return sortPhaseGroups(phase?.phaseGroups?.nodes ?? []);
  });
  protected readonly group = computed(() => this.groups().find((g) => String(g.id) === this.groupId()) ?? null);
  protected readonly started = computed(() => poolStarted(this.group()));
  protected readonly starting = signal(false);
  protected readonly bracketType = computed(
    () =>
      this.phases().find((p) => String(p.id) === this.phaseId())?.bracketType ??
      this.groups()[0]?.bracketType ??
      null,
  );
  protected readonly rebuilding = computed(() => !!this.store.syncing());
  protected readonly displaySets = computed(() => {
    const current = this.sets();
    const stale = this.staleSets();
    const sameGroup = this.loadedGroupId() === this.groupId();
    if (!sameGroup) return current;
    if (this.rebuilding() && !current.length && stale.length) return stale;
    return current.length ? current : stale;
  });

  private pollTimer?: ReturnType<typeof setInterval>;
  private syncPollTimer?: ReturnType<typeof setInterval>;
  private loadToken = 0;

  constructor() {
    // URL (+ defaults) → phase/group signals. Does not read the signals so user edits
    // that write the URL first are not overwritten by a stale snapshot.
    effect(() => {
      const event = this.store.event();
      const qp = this.queryParams();
      const phases = this.store.phases();
      if (!event || !phases.length) return;

      let phase = qp.get('phase') || untracked(this.store.seededPhaseId) || '';
      let group = qp.get('group') || '';
      if (!phase || !phases.some((p) => String(p.id) === phase)) {
        phase = String(phases[0]!.id);
      }
      const groups = sortPhaseGroups(phases.find((p) => String(p.id) === phase)?.phaseGroups?.nodes ?? []);
      const byId = groups.find((g) => String(g.id) === group) ?? null;
      // Prefer the previous pool letter when the URL group is missing/stale after a phase switch.
      const prevLabel = untracked(() => this.group()?.displayIdentifier);
      const byLabel = prevLabel ? groups.find((g) => g.displayIdentifier === prevLabel) : null;
      const hint = byId ?? byLabel ?? groups[0] ?? null;
      group = resolvePhaseGroupId(groups, group, hint);

      const curPhase = untracked(this.phaseId);
      const curGroup = untracked(this.groupId);
      if (phase !== curPhase || group !== curGroup) {
        if (group !== curGroup) this.clearBracketCanvas();
        this.phaseId.set(phase);
        this.groupId.set(group);
      }
      if (qp.get('phase') !== phase || (group ? qp.get('group') !== group : !!qp.get('group'))) {
        void this.writeQuery(phase, group);
      }
    });

    effect(() => {
      const phase = this.phaseId();
      let group = this.groupId();
      this.store.revision();
      const groups = sortPhaseGroups(this.phases().find((p) => String(p.id) === phase)?.phaseGroups?.nodes ?? []);
      if (group && groups.length) {
        const hint = this.group() ?? groups.find((g) => String(g.id) === group) ?? null;
        const resolved = resolvePhaseGroupId(groups, group, hint);
        if (resolved !== group) {
          this.groupId.set(resolved);
          void this.writeQuery(phase, resolved);
          return;
        }
      }
      if (group) void this.load(group);
    });

    effect(() => {
      if (this.store.syncing()) this.startSyncPolling();
      else this.stopSyncPolling();
    });
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.stopSyncPolling();
  }

  protected retrySync(): void {
    void this.store.retrySync();
  }

  protected onPhaseChange(id: string): void {
    const groups = sortPhaseGroups(this.phases().find((p) => String(p.id) === id)?.phaseGroups?.nodes ?? []);
    // Keep the same pool letter when the next phase has it (A1 → A1).
    const prev = this.group()?.displayIdentifier;
    const next =
      (prev && groups.find((g) => g.displayIdentifier === prev)) || groups[0] || null;
    const group = next ? String(next.id) : '';
    this.clearBracketCanvas();
    this.phaseId.set(id);
    this.groupId.set(group);
    void this.writeQuery(id, group);
  }

  protected onGroupChange(id: string): void {
    this.clearBracketCanvas();
    this.groupId.set(id);
    void this.writeQuery(this.phaseId(), id);
  }

  protected async startBracket(): Promise<void> {
    const group = this.group();
    const phase = this.phases().find((p) => String(p.id) === this.phaseId());
    if (!group || !phase) return;
    const poolName =
      this.groups().length > 1 ? `${phase.name} pool ${group.displayIdentifier ?? group.id}` : phase.name;
    this.error.set(null);
    try {
      const sets = this.sets().length ? this.sets() : await this.api.phaseGroupSets(group.id);
      const ref = confirmBracketStart(this.dialog, { poolName, setCount: sets.length });
      if (!(await firstValueFrom(ref.closed))) return;

      this.starting.set(true);
      const beforeSignature = bracketSignature(sets);
      const realSetId = await startPool(this.api, sets);
      this.toast.ok('Bracket started');
      await this.store.bracketChanged(
        phase.id,
        rebuiltAfterStart(beforeSignature, realSetId),
        'Bracket started — waiting for start.gg to create the sets…',
        'Bracket sets ready — you can report results',
      );
    } catch (e) {
      const message = `Bracket not started: ${errorMessage(e)}`;
      this.error.set(message);
      this.toast.error(message);
    } finally {
      this.starting.set(false);
    }
  }

  protected openSet(setId: BracketSet['id']): void {
    openSetEditor(this.dialog, this.injector, setId);
  }

  private writeQuery(phase: string, group: string): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { phase: phase || null, group: group || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private clearBracketCanvas(): void {
    this.loadToken++;
    this.sets.set([]);
    this.staleSets.set([]);
    this.seeds.set([]);
    this.loadedGroupId.set('');
    this.progress.set('');
    this.error.set(null);
    this.loading.set(true);
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private async load(groupId: string): Promise<void> {
    const token = ++this.loadToken;
    this.loading.set(true);
    this.error.set(null);
    this.progress.set('');
    try {
      const [sets, seeds] = await Promise.all([
        this.api.phaseGroupSets(groupId, (page, total) => {
          if (token === this.loadToken) this.progress.set(total > 1 ? `Loading bracket ${page}/${total}` : '');
        }),
        this.api.phaseGroupSeeds(groupId).catch(() => [] as Seed[]),
      ]);
      if (token !== this.loadToken) return;
      const syncing = untracked(() => this.store.syncing());
      if (sets.length === 0 && syncing && this.staleSets().length && this.loadedGroupId() === groupId) {
        // start.gg cleared the pool mid-rebuild — keep the previous bracket on screen.
      } else {
        this.sets.set(sets);
        this.loadedGroupId.set(groupId);
        if (sets.length) this.staleSets.set(sets);
      }
      this.seeds.set(seeds);
      this.startPolling(groupId);
    } catch (e) {
      if (token === this.loadToken) this.error.set(errorMessage(e));
    } finally {
      if (token === this.loadToken) {
        this.loading.set(false);
        this.progress.set('');
      }
    }
  }

  private startPolling(groupId: string): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (document.hidden || this.store.syncing()) return;
      void this.api.phaseGroupSets(groupId).then(
        (sets) => this.applyLoadedSets(groupId, sets),
        () => undefined,
      );
    }, 25_000);
  }

  /** Poll the visible pool while the event store waits for start.gg to finish rebuilding. */
  private startSyncPolling(): void {
    if (this.syncPollTimer) return;
    const poll = () => {
      const groupId = this.groupId();
      if (!groupId || document.hidden) return;
      void this.api.phaseGroupSets(groupId).then(
        (sets) => this.applyLoadedSets(groupId, sets),
        () => undefined,
      );
    };
    poll();
    this.syncPollTimer = setInterval(poll, 5_000);
  }

  private stopSyncPolling(): void {
    if (this.syncPollTimer) {
      clearInterval(this.syncPollTimer);
      this.syncPollTimer = undefined;
    }
  }

  private applyLoadedSets(groupId: string, sets: BracketSet[]): void {
    if (groupId !== this.groupId()) return;
    if (sets.length === 0 && this.store.syncing() && this.staleSets().length && this.loadedGroupId() === groupId) {
      return;
    }
    this.sets.set(sets);
    this.loadedGroupId.set(groupId);
    if (sets.length) this.staleSets.set(sets);
  }
}
