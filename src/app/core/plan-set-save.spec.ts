import { BracketSet, SetState } from './api/models';
import { blankGame, deriveSetWinnerId, nextGameFromPrevious, toGameData } from './set-games';
import { planSetSave, planSetScoreSave } from './plan-set-save';

function baseSet(extra: Partial<BracketSet> = {}): BracketSet {
  return {
    id: 42,
    state: SetState.Ready,
    winnerId: null,
    slots: [
      { entrant: { id: 1, name: 'A' } },
      { entrant: { id: 2, name: 'B' } },
    ],
    ...extra,
  };
}

describe('planSetSave', () => {
  it('reports incomplete sets with only the winner', () => {
    expect(planSetSave(baseSet(), { winnerId: 1, isDQ: false })).toEqual({
      action: 'report',
      setId: 42,
      winnerId: 1,
      isDQ: false,
      gameData: undefined,
    });
  });

  it('includes gameData on report', () => {
    const gameData = [{ gameNum: 1, winnerId: 1 }];
    expect(planSetSave(baseSet(), { winnerId: 1, isDQ: false, gameData })).toMatchObject({
      action: 'report',
      gameData,
    });
  });

  it('does nothing when a completed set keeps its winner and has no games', () => {
    const plan = planSetSave(baseSet({ state: SetState.Completed, winnerId: 1 }), {
      winnerId: 1,
      isDQ: false,
    });
    expect(plan).toEqual({ action: 'none' });
  });

  it('updates a completed set when only the DQ flag changes', () => {
    const plan = planSetSave(baseSet({ state: SetState.Completed, winnerId: 1 }), {
      winnerId: 1,
      isDQ: true,
    });
    expect(plan).toEqual({ action: 'update', setId: 42, winnerId: 1, isDQ: true, gameData: undefined });
  });

  it('updates a completed set when gameData is provided', () => {
    const gameData = [
      { gameNum: 1, winnerId: 1 },
      { gameNum: 2, winnerId: 1 },
    ];
    expect(
      planSetSave(baseSet({ state: SetState.Completed, winnerId: 1 }), {
        winnerId: 1,
        isDQ: false,
        gameData,
      }),
    ).toMatchObject({ action: 'update', gameData });
  });

  it('detects an existing DQ from the slot score', () => {
    const set = baseSet({
      state: SetState.Completed,
      winnerId: 1,
      slots: [
        { entrant: { id: 1, name: 'A' } },
        { entrant: { id: 2, name: 'B' }, standing: { stats: { score: { value: -1 } } } },
      ],
    });
    expect(planSetSave(set, { winnerId: 1, isDQ: true })).toEqual({ action: 'none' });
    expect(planSetSave(set, { winnerId: 1, isDQ: false })).toMatchObject({ action: 'update', isDQ: false });
  });

  it('resets then reports when changing the winner of a completed set', () => {
    const plan = planSetSave(baseSet({ state: SetState.Completed, winnerId: 1 }), {
      winnerId: 2,
      isDQ: false,
    });
    expect(plan).toEqual({
      action: 'resetThenReport',
      setId: 42,
      resetDependentSets: true,
      winnerId: 2,
      isDQ: false,
      warnDependent: true,
      gameData: undefined,
    });
  });

  it('treats DQ as a normal report on open sets', () => {
    const plan = planSetSave(baseSet(), { winnerId: 2, isDQ: true });
    expect(plan).toMatchObject({ action: 'report', isDQ: true, winnerId: 2 });
  });
});

describe('planSetScoreSave', () => {
  it('saves open sets without a set winner', () => {
    const gameData = [{ gameNum: 1, winnerId: 1 }];
    expect(planSetScoreSave(baseSet(), { isDQ: false, gameData })).toEqual({
      action: 'update',
      setId: 42,
      winnerId: null,
      isDQ: false,
      gameData,
    });
  });

  it('keeps the winner when saving games on a completed set', () => {
    const gameData = [{ gameNum: 1, winnerId: 1 }];
    expect(
      planSetScoreSave(baseSet({ state: SetState.Completed, winnerId: 1 }), { isDQ: false, gameData }),
    ).toMatchObject({ action: 'update', winnerId: 1, gameData });
  });
});

describe('set-games helpers', () => {
  it('derives the set winner from game wins', () => {
    const games = [
      { ...blankGame(1), winnerId: 1 },
      { ...blankGame(2), winnerId: 2 },
      { ...blankGame(3), winnerId: 1 },
    ];
    expect(deriveSetWinnerId(games, 1, 2)).toBe(1);
  });

  it('builds gameData with character selections (Int characterId)', () => {
    expect(
      toGameData(
        [
          {
            orderNum: 1,
            winnerId: 1,
            entrant1CharacterId: 10,
            entrant2CharacterId: 20,
          },
          blankGame(2),
        ],
        1,
        2,
      ),
    ).toEqual([
      {
        gameNum: 1,
        winnerId: 1,
        selections: [
          { entrantId: 1, characterId: 10 },
          { entrantId: 2, characterId: 20 },
        ],
      },
    ]);
  });

  it('copies characters onto the next game', () => {
    const prev = {
      orderNum: 1,
      winnerId: 1,
      entrant1CharacterId: 7,
      entrant2CharacterId: 9,
    };
    expect(nextGameFromPrevious(prev, 2)).toEqual({
      orderNum: 2,
      winnerId: null,
      entrant1CharacterId: 7,
      entrant2CharacterId: 9,
    });
  });
});
