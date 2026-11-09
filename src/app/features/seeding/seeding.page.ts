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
  buildSeedMapping,
  phaseStarted,
  seedingApplied,
  seedingErrorMessage,
} from '../../core/seeding-save';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { ToastService } from '../../core/toast.service';
import { EventStore } from '../event/event.store';
import { confirmBracketReset } from './reset-bracket.dialog';

@Component({
  selector: 'app-seeding-page',
  imports: [FormsModule, DragDropModule, EntrantChipComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack">
      @if (store.canEdit()) {
        <div class="alert info small">{{ 'seeding.editHint' | t }}</div>
      } @else {
        <div class="alert info small">{{ 'seeding.viewHint' | t: { reason: store.readOnlyReason() } }}</div>
      }

      <div class="row">
        <label class="field">
          {{ 'common.phase' | t }}
          <select [ngModel]="phaseId()" (ngModelChange)="onPhase($event)">
            @for (p of phases(); track p.id) {
              <option [value]="p.id">{{ 'seeding.seedsCount' | t: { name: p.name, n: p.numSeeds ?? '?' } }}</option>
            }
          </select>
        </label>
        <span class="spacer"></span>
        @if (store.canEdit()) {
          @if (started()) {
            <button type="button" class="danger" [disabled]="busy()" (click)="resetBracket()">{{ 'seeding.reset' | t }}</button>
          }
          <button type="button" class="primary" [disabled]="busy() || !dirty()" (click)="save()">
            {{ (saving() ? 'common.saving' : 'seeding.save') | t }}
          </button>
        } @else {
          <span class="badge" [title]="store.readOnlyReason()">{{ 'common.readOnly' | t }}</span>
        }
      </div>

      @if (progress(); as p) {
        <div class="alert info small row"><span class="spinner sm"></span>{{ p }}</div>
      } @else if (started() && store.canEdit()) {
        <div class="alert warn small row">
          <span class="spacer">{{ 'seeding.startedWarn' | t: { hint: startedHint } }}</span>
          <button type="button" class="danger sm" [disabled]="busy()" (click)="resetBracket()">{{ 'seeding.reset' | t }}</button>
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
            <p class="muted" style="padding: 1rem">{{ 'seeding.empty' | t }}</p>
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
  private readonly i18n = inject(I18nService);

  protected readonly phases = computed(() => this.store.phases());
  protected readonly phaseId = signal('');
  protected readonly seeds = signal<Seed[]>([]);
  protected readonly original = signal<Seed[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly saving = signal(false);
  protected readonly progress = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected get startedHint(): string {
    return this.i18n.t('seeding.startedHint');
  }
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
        throw new Error(this.i18n.t('seeding.orderMismatch'));
      }
      this.apply(saved);
      this.toast.ok(this.i18n.t('seeding.saved'));
      await this.store.bracketChanged(
        phaseId,
        before == null ? null : rebuiltAfterReseed(before),
        this.i18n.t('seeding.savedWaiting'),
        this.i18n.t('seeding.updated'),
      );
    } catch (e) {
      const message = seedingErrorMessage(errorMessage(e), (key, params) => this.i18n.t(key, params));
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
      this.progress.set(this.i18n.t('seeding.loadingBracket'));
      const sets = await this.store.phaseSets(phase.id);
      this.progress.set(null);
      const ref = confirmBracketReset(this.dialog, { ...resetSummary(sets), phaseName: phase.name });
      if (!(await firstValueFrom(ref.closed))) return;

      await resetPhase(
        this.api,
        phase,
        sets,
        (p) =>
          this.progress.set(
            p.step === 'sets'
              ? this.i18n.t('seeding.resettingSet', { done: p.done + 1, total: p.total })
              : this.i18n.t('seeding.askingRebuild'),
          ),
        (key, params) => this.i18n.t(key, params),
      );
      this.progress.set(this.i18n.t('seeding.reloading'));
      this.toast.ok(this.i18n.t('seeding.resetOk'));
      await Promise.all([
        this.store.bracketChanged(
          phase.id,
          rebuiltAfterReset,
          this.i18n.t('seeding.resetWaiting'),
          this.i18n.t('seeding.rebuilt'),
        ),
        this.load(String(phase.id)),
      ]);
    } catch (e) {
      const message = this.i18n.t('seeding.notReset', { message: errorMessage(e) });
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
