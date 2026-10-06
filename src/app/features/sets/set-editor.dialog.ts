import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { BracketSet, Character, Entrant, Id, SetState } from '../../core/api/models';
import { StartggApi } from '../../core/api/startgg-api.service';
import { isDQSlot, isPreviewSet, sameId } from '../../core/bracket-layout';
import { planSetSave, planSetScoreSave } from '../../core/plan-set-save';
import {
  EditableGame,
  MAX_SET_GAMES,
  blankGame,
  characterIconUrl,
  deriveSetWinnerId,
  editableGamesFromSet,
  gamesEqual,
  nextGameFromPrevious,
  toGameData,
} from '../../core/set-games';
import { EntrantChipComponent } from '../../shared/entrant-chip.component';
import { askConfirm } from '../../shared/confirm.dialog';
import { errorMessage, setStateLabel } from '../../shared/display';
import { EventStore } from '../event/event.store';
import { openPlayerDialog } from '../players/player.dialog';
import { askResetSet } from './reset-set.dialog';

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
  protected readonly games = signal<EditableGame[]>([blankGame(1)]);
  protected readonly characters = signal<Character[]>([]);
  protected readonly charPicker = signal<{ gameIndex: number; side: Side } | null>(null);

  private initialGames: EditableGame[] = [blankGame(1)];
  private initialWinner: Side | null = null;
  private initialDq = false;

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly sides: Side[] = [0, 1];
  protected readonly stateLabel = setStateLabel;
  protected readonly maxGames = MAX_SET_GAMES;
  protected readonly iconUrl = characterIconUrl;

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
      const [set] = await Promise.all([this.api.set(this.setId), this.loadCharacters()]);
      this.applySet(set);
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

  protected openCharacterPicker(gameIndex: number, side: Side): void {
    if (!this.canMutate() || this.busy()) return;
    this.charPicker.set({ gameIndex, side });
  }

  protected closeCharacterPicker(): void {
    this.charPicker.set(null);
  }

  protected pickCharacter(characterId: Id): void {
    const ctx = this.charPicker();
    if (!ctx) return;
    this.games.update((list) =>
      list.map((g, i) => {
        if (i !== ctx.gameIndex) return g;
        const current = ctx.side === 0 ? g.entrant1CharacterId : g.entrant2CharacterId;
        const next = sameId(current, characterId) ? null : characterId;
        return ctx.side === 0
          ? { ...g, entrant1CharacterId: next }
          : { ...g, entrant2CharacterId: next };
      }),
    );
    this.charPicker.set(null);
  }

  protected characterFor(game: EditableGame, side: Side): Character | null {
    const id = side === 0 ? game.entrant1CharacterId : game.entrant2CharacterId;
    if (id == null) return null;
    return this.characters().find((c) => sameId(c.id, id)) ?? null;
  }

  protected isPickedCharacter(characterId: Id): boolean {
    const ctx = this.charPicker();
    if (!ctx) return false;
    const g = this.games()[ctx.gameIndex];
    if (!g) return false;
    const current = ctx.side === 0 ? g.entrant1CharacterId : g.entrant2CharacterId;
    return sameId(current, characterId);
  }

  protected addGame(): void {
    if (!this.canAddGame()) return;
    this.games.update((list) => {
      const prev = list[list.length - 1];
      return [...list, nextGameFromPrevious(prev, list.length + 1)];
    });
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

  /** Save games/characters without completing the set. */
  protected saveScore(): Promise<void> {
    const s = this.set();
    const [e0, e1] = this.entrants();
    if (!s || !e0 || !e1 || !this.canMutate()) return Promise.resolve();
    const gameData = toGameData(this.games(), e0.id, e1.id);
    if (!gameData.length && !this.dq()) {
      this.error.set('Pick a game winner or characters before saving.');
      return Promise.resolve();
    }
    const plan = planSetScoreSave(s, { isDQ: this.dq(), gameData });
    if (plan.action !== 'update') return Promise.resolve();

    return this.mutate('Games saved.', async () => {
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
  protected async submit(): Promise<void> {
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

    const gameData = toGameData(this.games(), e0.id, e1.id);
    const plan = planSetSave(s, {
      winnerId: this.entrants()[side]!.id,
      isDQ: this.dq(),
      gameData,
    });
    if (plan.action === 'none') return Promise.resolve();

    if (plan.action === 'resetThenReport' && plan.warnDependent) {
      const ok = await askConfirm(this.dialog, {
        title: 'Change winner?',
        body: 'Changing the winner will reset this set and any dependent sets that already advanced.',
        detail: 'Those later results will be cleared on start.gg. This cannot be undone.',
        confirmLabel: 'Continue',
        danger: true,
      });
      if (!ok) return Promise.resolve();
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

  protected async reset(): Promise<void> {
    const choice = await askResetSet(this.dialog);
    if (!choice) return;
    return this.mutate('Set reset.', () => this.api.resetSet(this.setId, choice === 'dependents'));
  }

  private async loadCharacters(): Promise<void> {
    const vgId = this.store.event()?.videogame?.id;
    if (vgId == null) {
      this.characters.set([]);
      return;
    }
    try {
      const vg = await this.api.videogame(vgId);
      this.characters.set([...(vg?.characters ?? [])].sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      this.characters.set([]);
    }
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
    const e0 = set.slots[0]?.entrant?.id;
    const e1 = set.slots[1]?.entrant?.id;
    const games = editableGamesFromSet(set, e0, e1);
    this.games.set(games);
    this.initialGames = games.map((g) => ({ ...g }));
    this.initialWinner = winner;
    this.initialDq = dq;
  }
}
