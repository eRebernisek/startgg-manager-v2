import { BracketSet, SetState } from './api/models';
import {
  blankGame,
  countGameWins,
  deriveSetWinnerId,
  displaySetScore,
  editableGamesFromSet,
  syncSetWinner,
  toGameData,
} from './set-games';

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

  it('scores an MD5 (3–2) from every game', () => {
    const games = [10, 20, 10, 20, 10].map((winnerId, i) => ({ ...blankGame(i + 1), winnerId }));
    expect(displaySetScore(set(), games)).toEqual([3, 2]);
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

describe('unlimited games', () => {
  it('loads every game from the API, past a best of 3', () => {
    const s = set({
      games: [1, 2, 3, 4, 5, 6, 7].map((orderNum) => ({
        orderNum,
        winnerId: orderNum <= 4 ? 10 : 20,
      })),
    });
    const games = editableGamesFromSet(s, 10, 20);
    expect(games).toHaveLength(7);
    expect(games.map((g) => g.orderNum)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(countGameWins(games, 10, 20)).toEqual([4, 3]);
    expect(deriveSetWinnerId(games, 10, 20)).toBe(10);
    expect(toGameData(games, 10, 20)).toHaveLength(7);
  });

  it('clears a game-derived set winner when removing a game leaves 2–2', () => {
    const md5 = [10, 20, 10, 20, 10].map((winnerId, i) => ({ ...blankGame(i + 1), winnerId }));
    const derived = syncSetWinner(md5, 10, 20, { side: null, fromGames: false });
    expect(derived).toEqual({ side: 0, fromGames: true });
    const tied = md5.slice(0, 4);
    expect(syncSetWinner(tied, 10, 20, derived)).toEqual({ side: null, fromGames: false });
  });

  it('keeps a winner the user picked on the set when the games are tied', () => {
    const tied = [10, 20, 10, 20].map((winnerId, i) => ({ ...blankGame(i + 1), winnerId }));
    expect(syncSetWinner(tied, 10, 20, { side: 0, fromGames: false })).toEqual({ side: 0, fromGames: false });
  });

  it('reports an MD5 3–2 with one payload row per game', () => {
    const games = [10, 20, 10, 20, 10].map((winnerId, i) => ({ ...blankGame(i + 1), winnerId }));
    expect(countGameWins(games, 10, 20)).toEqual([3, 2]);
    expect(deriveSetWinnerId(games, 10, 20)).toBe(10);
    expect(toGameData(games, 10, 20)).toEqual([
      { gameNum: 1, winnerId: 10 },
      { gameNum: 2, winnerId: 20 },
      { gameNum: 3, winnerId: 10 },
      { gameNum: 4, winnerId: 20 },
      { gameNum: 5, winnerId: 10 },
    ]);
  });
});
