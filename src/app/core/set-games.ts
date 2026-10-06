import { BracketSet, BracketSetGameDataInput, Character, Id, SetGame } from './api/models';
import { sameId } from './bracket-layout';

/** Cap for the set editor (best-of-3 style). */
export const MAX_SET_GAMES = 3;

export interface EditableGame {
  orderNum: number;
  winnerId: Id | null;
  entrant1CharacterId: Id | null;
  entrant2CharacterId: Id | null;
}

export function blankGame(orderNum: number): EditableGame {
  return {
    orderNum,
    winnerId: null,
    entrant1CharacterId: null,
    entrant2CharacterId: null,
  };
}

/** New game row that copies character picks from the previous game (TSH-style continuity). */
export function nextGameFromPrevious(prev: EditableGame | undefined, orderNum: number): EditableGame {
  return {
    orderNum,
    winnerId: null,
    entrant1CharacterId: prev?.entrant1CharacterId ?? null,
    entrant2CharacterId: prev?.entrant2CharacterId ?? null,
  };
}

/** Build editor rows from API games (or one empty row). Caps at {@link MAX_SET_GAMES}. */
export function editableGamesFromSet(set: BracketSet, entrant1Id?: Id | null, entrant2Id?: Id | null): EditableGame[] {
  const api = [...(set.games ?? [])].sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0));
  if (api.length === 0) return [blankGame(1)];
  return api.slice(0, MAX_SET_GAMES).map((g, i) => fromApiGame(g, i + 1, entrant1Id, entrant2Id));
}

function fromApiGame(
  g: SetGame,
  fallbackNum: number,
  entrant1Id?: Id | null,
  entrant2Id?: Id | null,
): EditableGame {
  let entrant1CharacterId: Id | null = null;
  let entrant2CharacterId: Id | null = null;
  for (const sel of g.selections ?? []) {
    const eid = sel.entrant?.id;
    const cid = sel.character?.id;
    if (eid == null || cid == null) continue;
    if (entrant1Id != null && sameId(eid, entrant1Id)) entrant1CharacterId = cid;
    else if (entrant2Id != null && sameId(eid, entrant2Id)) entrant2CharacterId = cid;
  }
  return {
    orderNum: g.orderNum ?? fallbackNum,
    winnerId: g.winnerId ?? null,
    entrant1CharacterId,
    entrant2CharacterId,
  };
}

/** Prefer stock icons (TSH / start.gg admin style). */
export function characterIconUrl(character: Character | null | undefined): string | null {
  if (!character?.images?.length) return null;
  return (
    character.images.find((i) => i.type === 'stockIcon')?.url ??
    character.images.find((i) => i.type === 'icon')?.url ??
    character.images[0]?.url ??
    null
  );
}

/**
 * Games with a winner and/or characters — sent as `gameData` on report/update.
 * `characterId` must be an Int per start.gg `BracketSetGameSelectionInput`.
 * @see https://developer.start.gg/docs/examples/mutations/report-set/
 */
export function toGameData(
  games: EditableGame[],
  entrant1Id: Id,
  entrant2Id: Id,
): BracketSetGameDataInput[] {
  return games
    .filter(
      (g) =>
        g.winnerId != null || g.entrant1CharacterId != null || g.entrant2CharacterId != null,
    )
    .map((g) => {
      const row: BracketSetGameDataInput = { gameNum: g.orderNum };
      if (g.winnerId != null) row.winnerId = g.winnerId;
      const selections: NonNullable<BracketSetGameDataInput['selections']> = [];
      if (g.entrant1CharacterId != null) {
        selections.push({
          entrantId: entrant1Id,
          characterId: Number(g.entrant1CharacterId),
        });
      }
      if (g.entrant2CharacterId != null) {
        selections.push({
          entrantId: entrant2Id,
          characterId: Number(g.entrant2CharacterId),
        });
      }
      if (selections.length) row.selections = selections;
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
      sameId(g.entrant1CharacterId, o.entrant1CharacterId) &&
      sameId(g.entrant2CharacterId, o.entrant2CharacterId)
    );
  });
}
