import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { BracketSet, Entrant, Id, SetState } from '../../core/api/models';
import { StartggApi } from '../../core/api/startgg-api.service';
import { isDQSlot, isPreviewSet, sameId } from '../../core/bracket-layout';
import { planSetSave } from '../../core/plan-set-save';
import { EntrantChipComponent } from '../../shared/entrant-chip.component';
import { errorMessage, setStateLabel } from '../../shared/display';
import { EventStore } from '../event/event.store';
import { openPlayerDialog } from '../players/player.dialog';

export type Side = 0 | 1;

export function openSetEditor(dialog: Dialog, injector: Injector, setId: Id) {
  return dialog.open(SetEditorDialog, {
    data: setId,
    injector,
    panelClass: 'app-dialog-panel',
    backdropClass: ['cdk-overlay-backdrop', 'app-dialog-backdrop'],
  });
}

/** Reads the reported winner side and DQ flag of a set, if any. */
export function initialChoice(set: BracketSet): { winner: Side | null; dq: boolean } {
  const ids = [set.slots[0]?.entrant?.id, set.slots[1]?.entrant?.id];
  const winner = sameId(set.winnerId, ids[0]) ? 0 : sameId(set.winnerId, ids[1]) ? 1 : null;
  return { winner, dq: set.slots.some(isDQSlot) };
}

@Component({
  selector: 'app-set-editor',
  imports: [EntrantChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './set-editor.dialog.html',
  styleUrl: './set-editor.dialog.scss',
})
export class SetEditorDialog implements OnInit {
  private readonly api = inject(StartggApi);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  protected readonly store = inject(EventStore);
  protected readonly ref = inject(DialogRef);
  private readonly setId = inject<Id>(DIALOG_DATA);

  protected readonly set = signal<BracketSet | null>(null);
  protected readonly winner = signal<Side | null>(null);
  protected readonly dq = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly sides: Side[] = [0, 1];
  protected readonly stateLabel = setStateLabel;

  protected readonly entrants = computed<(Entrant | null)[]>(() => {
    const s = this.set();
    return [s?.slots[0]?.entrant ?? null, s?.slots[1]?.entrant ?? null];
  });
  protected readonly completed = computed(() => this.set()?.state === SetState.Completed);
  protected readonly preview = computed(() => {
    const s = this.set();
    return !!s && isPreviewSet(s);
  });
  protected readonly canMutate = computed(
    () => this.store.canEdit() && !this.preview() && this.entrants().every((e) => !!e),
  );
  protected readonly unchanged = computed(() => {
    const s = this.set();
    const side = this.winner();
    if (!s || side === null) return true;
    return planSetSave(s, { winnerId: this.entrants()[side]!.id, isDQ: this.dq() }).action === 'none';
  });

  async ngOnInit(): Promise<void> {
    this.busy.set(true);
    try {
      this.applySet(await this.api.set(this.setId));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected openPlayer(entrant: Entrant | null): void {
    const playerId = entrant?.participants?.[0]?.player?.id;
    if (playerId) openPlayerDialog(this.dialog, this.injector, playerId);
  }

  // ---------- Mutations ----------

  protected submit(): Promise<void> {
    const side = this.winner();
    const s = this.set();
    if (side === null || !s) return Promise.resolve();
    const plan = planSetSave(s, { winnerId: this.entrants()[side]!.id, isDQ: this.dq() });
    if (plan.action === 'none') return Promise.resolve();

    if (plan.action === 'resetThenReport' && plan.warnDependent) {
      if (
        !confirm(
          'Changing the winner will reset this set and any dependent sets that already advanced. Continue?',
        )
      ) {
        return Promise.resolve();
      }
    }

    return this.mutate('Result reported.', async () => {
      if (plan.action === 'resetThenReport') {
        await this.api.resetSet(plan.setId, plan.resetDependentSets);
        return this.api.reportSet(plan.setId, plan.winnerId, plan.isDQ);
      }
      if (plan.action === 'update') {
        return this.api.updateSet(plan.setId, plan.winnerId, plan.isDQ);
      }
      return this.api.reportSet(plan.setId, plan.winnerId, plan.isDQ);
    });
  }

  protected markCalled(): Promise<void> {
    return this.mutate('Set called.', () => this.api.markSetCalled(this.setId));
  }

  protected markInProgress(): Promise<void> {
    return this.mutate('Set marked in progress.', () => this.api.markSetInProgress(this.setId));
  }

  protected reset(): Promise<void> {
    if (!confirm('Reset this set? The reported result will be cleared.')) return Promise.resolve();
    const dependents = confirm('Also reset sets that depend on this result? (OK = yes, Cancel = only this set)');
    return this.mutate('Set reset.', () => this.api.resetSet(this.setId, dependents));
  }

  private async mutate(success: string, action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await action();
      this.applySet(await this.api.set(this.setId));
      this.store.changed();
      this.notice.set(success);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  private applySet(set: BracketSet | null): void {
    this.set.set(set);
    if (!set) return;
    const { winner, dq } = initialChoice(set);
    this.winner.set(winner);
    this.dq.set(dq);
  }
}
