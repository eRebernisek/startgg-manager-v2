import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { BracketSet, Character, Entrant, Id, SetState } from '../../core/api/models';
import { StartggApi } from '../../core/api/startgg-api.service';
import { AppNavigation } from '../../core/app-navigation';
import { isDQSlot, isPreviewSet, sameId } from '../../core/bracket-layout';
import { planSetSave, planSetScoreSave } from '../../core/plan-set-save';
import {
  EditableGame,
  blankGame,
  characterIconUrl,
  deriveSetWinnerId,
  displaySetScore,
  editableGamesFromSet,
  gamesEqual,
  nextGameFromPrevious,
  SetWinnerChoice,
  syncSetWinner,
  toGameData,
} from '../../core/set-games';
import { I18nService } from '../../core/i18n/i18n.service';
import { translateRoundName } from '../../core/i18n/round-names';
import { TPipe } from '../../core/i18n/t.pipe';
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
  imports: [EntrantChipComponent, TPipe],
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
  private readonly navigation = inject(AppNavigation);
  private readonly i18n = inject(I18nService);
  private readonly gamesList = viewChild<ElementRef<HTMLElement>>('gamesList');
  private readonly gamesActions = viewChild<ElementRef<HTMLElement>>('gamesActions');

  protected readonly set = signal<BracketSet | null>(null);
  protected readonly winner = signal<Side | null>(null);
  protected readonly dq = signal(false);
  protected readonly games = signal<EditableGame[]>([blankGame(1)]);
  protected readonly characters = signal<Character[]>([]);
  protected readonly charPicker = signal<{ gameIndex: number; side: Side } | null>(null);

  private initialGames: EditableGame[] = [blankGame(1)];
  private initialWinner: Side | null = null;
  private initialDq = false;
  /** Whether {@link winner} was derived from game wins (so a later tie can clear it). */
  private winnerFromGames = false;

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly sides: Side[] = [0, 1];
  protected readonly iconUrl = characterIconUrl;

  protected stateLabel(state: number): string {
    this.i18n.lang();
    return setStateLabel(state, (key, params) => this.i18n.t(key, params));
  }

  protected roundLabel(): string {
    this.i18n.lang();
    const raw = this.set()?.fullRoundText;
    return translateRoundName(raw, (key, params) => this.i18n.t(key, params)) || this.i18n.t('setEditor.set');
  }

  constructor() {
    const navigation = this.navigation;
    effect((onCleanup) => {
      if (!this.charPicker()) return;
      onCleanup(
        navigation.registerOverlay(() => {
          this.closeCharacterPicker();
          return true;
        }),
      );
    });
  }

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
  /** Game wins, or slot standings — never a fake `0 – 0` on a completed set. */
  protected readonly gameScoreLabel = computed(() => {
    const s = this.set();
    if (!s) return '–';
    const score = displaySetScore(s, this.games());
    return score ? `${score[0]} – ${score[1]}` : '–';
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

  protected pickSetWinner(side: Side): void {
    this.winnerFromGames = false;
    this.winner.set(side);
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
    if (!this.canMutate() || this.busy()) return;
    this.games.update((list) => {
      const prev = list[list.length - 1];
      return [...list, nextGameFromPrevious(prev, list.length + 1)];
    });
    afterNextRender(() => this.scrollGamesToBottom(), { injector: this.injector });
  }

  protected removeGame(index: number): void {
    this.games.update((list) => {
      if (list.length <= 1) return list;
      return list.filter((_, i) => i !== index).map((g, i) => ({ ...g, orderNum: i + 1 }));
    });
    this.syncOverallFromGames();
  }

  /** Removes the last game in the list (bottom "Remove game" control). */
  protected removeLastGame(): void {
    const last = this.games().length - 1;
    if (last < 1) return;
    this.removeGame(last);
  }

  private scrollGamesToBottom(): void {
    const actions = this.gamesActions()?.nativeElement;
    const list = this.gamesList()?.nativeElement;
    const target = actions ?? list?.lastElementChild;
    if (!(target instanceof HTMLElement)) return;
    const body = target.closest('.body');
    if (body instanceof HTMLElement) {
      body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  protected sameWinner(winnerId: Id | null, side: Side): boolean {
    const entrant = this.entrants()[side];
    return !!entrant && sameId(winnerId, entrant.id);
  }

  protected shortName(entrant: Entrant | null): string {
    if (!entrant?.name) return this.i18n.t('common.tbd');
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
      this.error.set(this.i18n.t('setEditor.pickBeforeSave'));
      return Promise.resolve();
    }
    const plan = planSetScoreSave(s, { isDQ: this.dq(), gameData });
    if (plan.action !== 'update') return Promise.resolve();

    return this.mutate(this.i18n.t('setEditor.gamesSaved'), async () => {
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
        this.error.set(this.i18n.t('setEditor.pickWinner'));
        return Promise.resolve();
      }
      side = sameId(derived, e0.id) ? 0 : 1;
      this.winnerFromGames = true;
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
        title: this.i18n.t('setEditor.changeWinnerTitle'),
        body: this.i18n.t('setEditor.changeWinnerBody'),
        detail: this.i18n.t('setEditor.changeWinnerDetail'),
        confirmLabel: this.i18n.t('common.continue'),
        danger: true,
      });
      if (!ok) return Promise.resolve();
    }

    return this.mutate(this.i18n.t('setEditor.resultSubmitted'), async () => {
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
    return this.mutate(this.i18n.t('setEditor.setCalled'), () => this.api.markSetCalled(this.setId));
  }

  protected markInProgress(): Promise<void> {
    return this.mutate(this.i18n.t('setEditor.setInProgress'), () => this.api.markSetInProgress(this.setId));
  }

  protected async reset(): Promise<void> {
    const choice = await askResetSet(this.dialog);
    if (!choice) return;
    return this.mutate(this.i18n.t('setEditor.setReset'), () =>
      this.api.resetSet(this.setId, choice === 'dependents'),
    );
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
    const next: SetWinnerChoice = syncSetWinner(this.games(), e0.id, e1.id, {
      side: this.winner(),
      fromGames: this.winnerFromGames,
    });
    this.winnerFromGames = next.fromGames;
    this.winner.set(next.side);
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
    this.winnerFromGames = false;
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
