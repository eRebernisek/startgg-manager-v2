import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BracketSet, Entrant, Id, SetState } from '../../core/api/models';
import { StartggApi } from '../../core/api/startgg-api.service';
import { isDQSlot, isPreviewSet, sameId } from '../../core/bracket-layout';
import { planSetSave, planSetScoreSave } from '../../core/plan-set-save';
import {
  EditableGame,
  MAX_SET_GAMES,
  blankGame,
  deriveSetWinnerId,
  editableGamesFromSet,
  gamesEqual,
  toGameData,
} from '../../core/set-games';
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
  imports: [EntrantChipComponent, FormsModule],
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
  protected readonly games = signal<EditableGame[]>([blankGame(1)]);
  private initialGames: EditableGame[] = [blankGame(1)];
  private initialWinner: Side | null = null;
  private initialDq = false;

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly sides: Side[] = [0, 1];
  protected readonly stateLabel = setStateLabel;
  protected readonly maxGames = MAX_SET_GAMES;

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
  protected readonly dirty = computed(() => {
    const side = this.winner();
    return (
      side !== this.initialWinner ||
      this.dq() !== this.initialDq ||
      !gamesEqual(this.games(), this.initialGames)
    );
  });
  protected readonly canAddGame = computed(() => this.games().length < MAX_SET_GAMES);
  protected readonly gameScore = computed(() => {
    const [a, b] = this.entrants();
    if (!a || !b) return [0, 0] as const;
    let wa = 0;
    let wb = 0;
    for (const g of this.games()) {
      if (sameId(g.winnerId, a.id)) wa++;
      else if (sameId(g.winnerId, b.id)) wb++;
    }
    return [wa, wb] as const;
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

  protected setGameWinner(index: number, side: Side): void {
    const entrant = this.entrants()[side];
    if (!entrant) return;
    this.games.update((list) =>
      list.map((g, i) => (i === index ? { ...g, winnerId: entrant.id } : g)),
    );
    this.syncOverallFromGames();
  }

  protected setGameScore(index: number, side: Side, raw: string | number | null): void {
    const score =
      raw === '' || raw == null || (typeof raw === 'number' && Number.isNaN(raw))
        ? null
        : Number(raw);
    const value = score == null || Number.isNaN(score) ? null : score;
    this.games.update((list) =>
      list.map((g, i) =>
        i === index
          ? side === 0
            ? { ...g, entrant1Score: value }
            : { ...g, entrant2Score: value }
          : g,
      ),
    );
  }

  protected addGame(): void {
    if (!this.canAddGame()) return;
    this.games.update((list) => [...list, blankGame(list.length + 1)]);
  }

  protected removeGame(index: number): void {
    this.games.update((list) => {
      if (list.length <= 1) return list;
      return list.filter((_, i) => i !== index).map((g, i) => ({ ...g, orderNum: i + 1 }));
    });
    this.syncOverallFromGames();
  }

  protected sameWinner(winnerId: Id | null, side: Side): boolean {
    const entrant = this.entrants()[side];
    return !!entrant && sameId(winnerId, entrant.id);
  }

  protected shortName(entrant: Entrant | null): string {
    if (!entrant?.name) return 'TBD';
    const sep = ' | ';
    const i = entrant.name.indexOf(sep);
    return (i >= 0 ? entrant.name.slice(i + sep.length) : entrant.name).trim() || entrant.name;
  }

  /** Save game scores without completing the set (or refresh games on a completed set). */
  protected saveScore(): Promise<void> {
    const s = this.set();
    if (!s || !this.canMutate()) return Promise.resolve();
    const gameData = toGameData(this.games());
    if (!gameData.length && !this.dq()) {
      this.error.set('Add at least one game result before saving.');
      return Promise.resolve();
    }
    const plan = planSetScoreSave(s, { isDQ: this.dq(), gameData });
    if (plan.action !== 'update') return Promise.resolve();

    return this.mutate('Score saved.', async () => {
      if (s.state === SetState.Created || s.state === SetState.Ready || s.state === SetState.Called) {
        try {
          await this.api.markSetInProgress(this.setId);
        } catch {
          /* start.gg may already treat the set as active once games are written */
        }
      }
      return this.api.updateSet(plan.setId, plan.winnerId, plan.isDQ, plan.gameData);
    });
  }

  /** Submit / complete the set with an overall winner (+ optional games). */
  protected submit(): Promise<void> {
    const s = this.set();
    if (!s) return Promise.resolve();
    const [e0, e1] = this.entrants();
    if (!e0 || !e1) return Promise.resolve();

    let side = this.winner();
    if (side === null) {
      const derived = deriveSetWinnerId(this.games(), e0.id, e1.id);
      if (derived == null) {
        this.error.set('Pick a set winner, or mark enough game winners to decide the set.');
        return Promise.resolve();
      }
      side = sameId(derived, e0.id) ? 0 : 1;
      this.winner.set(side);
    }

    const gameData = toGameData(this.games());
    const plan = planSetSave(s, {
      winnerId: this.entrants()[side]!.id,
      isDQ: this.dq(),
      gameData,
    });
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

    return this.mutate('Result submitted.', async () => {
      if (plan.action === 'resetThenReport') {
        await this.api.resetSet(plan.setId, plan.resetDependentSets);
        return this.api.reportSet(plan.setId, plan.winnerId, plan.isDQ, plan.gameData);
      }
      if (plan.action === 'update') {
        return this.api.updateSet(plan.setId, plan.winnerId, plan.isDQ, plan.gameData);
      }
      return this.api.reportSet(plan.setId, plan.winnerId, plan.isDQ, plan.gameData);
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

  private syncOverallFromGames(): void {
    const [e0, e1] = this.entrants();
    if (!e0 || !e1) return;
    const derived = deriveSetWinnerId(this.games(), e0.id, e1.id);
    if (derived == null) return;
    this.winner.set(sameId(derived, e0.id) ? 0 : 1);
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
    const games = editableGamesFromSet(set);
    this.games.set(games);
    this.initialGames = games.map((g) => ({ ...g }));
    this.initialWinner = winner;
    this.initialDq = dq;
  }
}
