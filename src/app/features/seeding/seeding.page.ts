import { Dialog } from '@angular/cdk/dialog';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Seed } from '../../core/api/models';
import { StartggApi } from '../../core/api/startgg-api.service';
import {
  bracketSignature,
  rebuiltAfterReseed,
  rebuiltAfterReset,
  resetPhase,
  resetSummary,
} from '../../core/bracket-reset';
import { EntrantChipComponent } from '../../shared/entrant-chip.component';
import { errorMessage } from '../../shared/display';
import {
  STARTED_PHASE_HINT,
  buildSeedMapping,
  phaseStarted,
  seedingApplied,
  seedingErrorMessage,
} from '../../core/seeding-save';
import { ToastService } from '../../core/toast.service';
import { EventStore } from '../event/event.store';
import { confirmBracketReset } from './reset-bracket.dialog';

@Component({
  selector: 'app-seeding-page',
  imports: [FormsModule, DragDropModule, EntrantChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack">
      <div class="alert info small">
        Seeding uses <strong>seed IDs</strong>, not entrant IDs. Drag to reorder, then save the full mapping for the
        phase.
      </div>

      <div class="row">
        <label class="field">
          Phase
          <select [ngModel]="phaseId()" (ngModelChange)="onPhase($event)">
            @for (p of phases(); track p.id) {
              <option [value]="p.id">{{ p.name }} ({{ p.numSeeds ?? '?' }} seeds)</option>
            }
          </select>
        </label>
        <span class="spacer"></span>
        @if (store.canEdit()) {
          @if (started()) {
            <button type="button" class="danger" [disabled]="busy()" (click)="resetBracket()">Reset bracket</button>
          }
          <button type="button" class="primary" [disabled]="busy() || !dirty()" (click)="save()">
            {{ saving() ? 'Saving…' : 'Save seeding' }}
          </button>
        } @else {
          <span class="badge">Read-only</span>
        }
      </div>

      @if (progress(); as p) {
        <div class="alert info small row"><span class="spinner sm"></span>{{ p }}</div>
      } @else if (started() && store.canEdit()) {
        <div class="alert warn small row">
          <span class="spacer">This phase has started on start.gg, which rejects seeding changes. {{ startedHint }}</span>
          <button type="button" class="danger sm" [disabled]="busy()" (click)="resetBracket()">Reset bracket</button>
        </div>
      }
      @if (error()) {
        <div class="alert error">{{ error() }}</div>
      }
      @if (loading()) {
        <div class="spinner"></div>
      }

      <div
        class="card seed-list"
        cdkDropList
        [cdkDropListDisabled]="!store.canEdit()"
        (cdkDropListDropped)="drop($event)"
      >
        @for (s of seeds(); track s.id; let i = $index) {
          <div class="list-item seed-row" cdkDrag [cdkDragDisabled]="!store.canEdit()">
            <span class="seed-num">{{ i + 1 }}</span>
            <app-entrant-chip class="spacer" [entrant]="s.entrant" [size]="32" />
            @if (s.phaseGroup?.displayIdentifier) {
              <span class="muted small">{{ s.phaseGroup!.displayIdentifier }}</span>
            }
          </div>
        } @empty {
          @if (!loading()) {
            <p class="muted" style="padding: 1rem">No seeds for this phase.</p>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .seed-list {
      padding: 0;
    }
    .seed-row {
      cursor: grab;
      background: var(--surface);
    }
    .seed-num {
      width: 2rem;
      font-weight: 700;
      color: var(--muted);
      text-align: right;
    }
    .cdk-drag-preview {
      box-sizing: border-box;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }
    .cdk-drag-placeholder {
      opacity: 0.4;
    }
  `,
})
export class SeedingPage implements OnInit {
  protected readonly store = inject(EventStore);
  private readonly api = inject(StartggApi);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);

  protected readonly phases = computed(() => this.store.phases());
  protected readonly phaseId = signal('');
  protected readonly seeds = signal<Seed[]>([]);
  protected readonly original = signal<Seed[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly saving = signal(false);
  protected readonly progress = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly startedHint = STARTED_PHASE_HINT;
  protected readonly started = computed(() =>
    phaseStarted(this.phases().find((p) => String(p.id) === this.phaseId())),
  );

  protected readonly dirty = computed(() => {
    const a = this.seeds();
    const b = this.original();
    if (a.length !== b.length) return true;
    return a.some((s, i) => String(s.id) !== String(b[i]?.id));
  });

  ngOnInit(): void {
    const first = this.phases()[0];
    if (first) {
      this.phaseId.set(String(first.id));
      void this.load(String(first.id));
    }
  }

  protected onPhase(id: string): void {
    this.phaseId.set(id);
    void this.load(id);
  }

  protected drop(event: CdkDragDrop<Seed[]>): void {
    const list = [...this.seeds()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.seeds.set(list);
  }

  protected async save(): Promise<void> {
    const phaseId = this.phaseId();
    if (!phaseId) return;
    const requested = this.seeds();
    this.busy.set(true);
    this.saving.set(true);
    this.error.set(null);
    try {
      const before = await this.signature(phaseId);
      await this.api.updatePhaseSeeding(phaseId, buildSeedMapping(requested), true);
      const saved = await this.api.phaseSeeds(phaseId);
      if (!seedingApplied(saved, requested)) {
        throw new Error('start.gg accepted the request but kept a different order. Reload and try again.');
      }
      this.apply(saved);
      this.toast.ok('Seeding saved');
      await this.store.bracketChanged(
        phaseId,
        before == null ? null : rebuiltAfterReseed(before),
        'Seeding saved — waiting for start.gg to rebuild the bracket with the new seeds…',
        'Bracket updated with the new seeding',
      );
    } catch (e) {
      const message = seedingErrorMessage(errorMessage(e));
      this.error.set(message);
      this.toast.error(message);
    } finally {
      this.busy.set(false);
      this.saving.set(false);
    }
  }

  protected async resetBracket(): Promise<void> {
    const phase = this.phases().find((p) => String(p.id) === this.phaseId());
    if (!phase) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.progress.set('Loading the bracket…');
      const sets = await this.store.phaseSets(phase.id);
      this.progress.set(null);
      const ref = confirmBracketReset(this.dialog, { ...resetSummary(sets), phaseName: phase.name });
      if (!(await firstValueFrom(ref.closed))) return;

      await resetPhase(this.api, phase, sets, (p) =>
        this.progress.set(
          p.step === 'sets'
            ? `Resetting set ${p.done + 1} of ${p.total}…`
            : 'Asking start.gg to rebuild the bracket…',
        ),
      );
      this.progress.set('Reloading…');
      this.toast.ok('Bracket reset — reorder the seeds and save');
      await Promise.all([
        this.store.bracketChanged(
          phase.id,
          rebuiltAfterReset,
          'Bracket reset — waiting for start.gg to rebuild it…',
          'Bracket rebuilt from the current seeding',
        ),
        this.load(String(phase.id)),
      ]);
    } catch (e) {
      const message = `Bracket not reset: ${errorMessage(e)}`;
      this.error.set(message);
      this.toast.error(message);
    } finally {
      this.progress.set(null);
      this.busy.set(false);
    }
  }

  /** Snapshot of the current sets so the store can tell when start.gg has regenerated them. */
  private async signature(phaseId: string): Promise<string | null> {
    try {
      return bracketSignature(await this.store.phaseSets(phaseId));
    } catch {
      return null;
    }
  }

  private apply(seeds: Seed[]): void {
    const sorted = [...seeds].sort((a, b) => a.seedNum - b.seedNum);
    this.seeds.set(sorted);
    this.original.set(sorted);
  }

  private async load(phaseId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.apply(await this.api.phaseSeeds(phaseId));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
