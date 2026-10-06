import { BracketSet, BracketSetGameDataInput, Id, SetGame } from './api/models';
import { sameId } from './bracket-layout';

/** Cap for the set editor (best-of-3 style). */
export const MAX_SET_GAMES = 3;

export interface EditableGame {
  orderNum: number;
  winnerId: Id | null;
  entrant1Score: number | null;
  entrant2Score: number | null;
}

export function blankGame(orderNum: number): EditableGame {
  return { orderNum, winnerId: null, entrant1Score: null, entrant2Score: null };
}

/** Build editor rows from API games (or one empty row). Caps at {@link MAX_SET_GAMES}. */
export function editableGamesFromSet(set: BracketSet): EditableGame[] {
  const api = [...(set.games ?? [])].sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0));
  if (api.length === 0) return [blankGame(1)];
  return api.slice(0, MAX_SET_GAMES).map((g, i) => fromApiGame(g, i + 1));
}

function fromApiGame(g: SetGame, fallbackNum: number): EditableGame {
  return {
    orderNum: g.orderNum ?? fallbackNum,
    winnerId: g.winnerId ?? null,
    entrant1Score: g.entrant1Score ?? null,
    entrant2Score: g.entrant2Score ?? null,
  };
}

/** Games that have a winner or any score — these are sent to start.gg. */
export function toGameData(games: EditableGame[]): BracketSetGameDataInput[] {
  return games
    .filter((g) => g.winnerId != null || g.entrant1Score != null || g.entrant2Score != null)
    .map((g) => {
      const row: BracketSetGameDataInput = { gameNum: g.orderNum };
      if (g.winnerId != null) row.winnerId = g.winnerId;
      if (g.entrant1Score != null) row.entrant1Score = g.entrant1Score;
      if (g.entrant2Score != null) row.entrant2Score = g.entrant2Score;
      return row;
    });
}

/** Overall set winner from game wins (ties / incomplete → null). */
export function deriveSetWinnerId(games: EditableGame[], entrant1Id: Id, entrant2Id: Id): Id | null {
  let a = 0;
  let b = 0;
  for (const g of games) {
    if (g.winnerId == null) continue;
    if (sameId(g.winnerId, entrant1Id)) a++;
    else if (sameId(g.winnerId, entrant2Id)) b++;
  }
  if (a === b) return null;
  return a > b ? entrant1Id : entrant2Id;
}

export function gamesEqual(a: EditableGame[], b: EditableGame[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((g, i) => {
    const o = b[i];
    return (
      g.orderNum === o.orderNum &&
      sameId(g.winnerId, o.winnerId) &&
      g.entrant1Score === o.entrant1Score &&
      g.entrant2Score === o.entrant2Score
    );
  });
}
