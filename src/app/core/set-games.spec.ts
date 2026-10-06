import { BracketSet, SetState } from './api/models';
import { blankGame, displaySetScore, editableGamesFromSet } from './set-games';

function set(extra: Partial<BracketSet> = {}): BracketSet {
  return {
    id: 1,
    state: SetState.Completed,
    winnerId: 10,
    slots: [{ entrant: { id: 10, name: 'A' } }, { entrant: { id: 20, name: 'B' } }],
    ...extra,
  };
}

describe('displaySetScore', () => {
  it('uses game wins when game winners are present', () => {
    const games = [
      { ...blankGame(1), winnerId: 10 },
      { ...blankGame(2), winnerId: 20 },
      { ...blankGame(3), winnerId: 10 },
    ];
    expect(displaySetScore(set(), games)).toEqual([2, 1]);
  });

  it('falls back to non-negative slot standings when games have no winners', () => {
    const s = set({
      games: [{ orderNum: 1, selections: [{ entrant: { id: 10 }, character: { id: 1, name: 'X' } }] }],
      slots: [
        { entrant: { id: 10, name: 'A' }, standing: { stats: { score: { value: 2 } } } },
        { entrant: { id: 20, name: 'B' }, standing: { stats: { score: { value: 1 } } } },
      ],
    });
    const games = editableGamesFromSet(s, 10, 20);
    expect(displaySetScore(s, games)).toEqual([2, 1]);
  });

  it('does not show a misleading 0 – 0 for a completed set with a winner', () => {
    const s = set({ games: [] });
    expect(displaySetScore(s, [blankGame(1)])).toBeNull();
  });

  it('ignores DQ standing scores (-1)', () => {
    const s = set({
      slots: [
        { entrant: { id: 10, name: 'A' }, standing: { stats: { score: { value: 0 } } } },
        { entrant: { id: 20, name: 'B' }, standing: { stats: { score: { value: -1 } } } },
      ],
    });
    expect(displaySetScore(s, [blankGame(1)])).toBeNull();
  });
});
