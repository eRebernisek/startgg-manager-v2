import { BracketSet, BracketSetGameDataInput, Id, SetState } from './api/models';
import { isDQSlot, sameId } from './bracket-layout';

export interface EditedSetState {
  winnerId: Id;
  isDQ: boolean;
  gameData?: BracketSetGameDataInput[];
}

export type SetSavePlan =
  | { action: 'none' }
  | { action: 'report'; setId: Id; winnerId: Id; isDQ: boolean; gameData?: BracketSetGameDataInput[] }
  | { action: 'update'; setId: Id; winnerId: Id | null; isDQ: boolean; gameData?: BracketSetGameDataInput[] }
  | {
      action: 'resetThenReport';
      setId: Id;
      resetDependentSets: boolean;
      winnerId: Id;
      isDQ: boolean;
      warnDependent: boolean;
      gameData?: BracketSetGameDataInput[];
    };

/**
 * Decides which start.gg mutations to run when submitting a completed set result.
 * `gameData` is optional and overwrites all games on the set when sent.
 * Changing the winner of a completed set requires resetSet then reportBracketSet.
 */
export function planSetSave(original: BracketSet, edited: EditedSetState): SetSavePlan {
  const setId = original.id;
  const { winnerId, isDQ, gameData } = edited;
  const games = gameData?.length ? gameData : undefined;

  if (original.state !== SetState.Completed) {
    return { action: 'report', setId, winnerId, isDQ, gameData: games };
  }

  if (!sameId(winnerId, original.winnerId)) {
    return {
      action: 'resetThenReport',
      setId,
      resetDependentSets: true,
      winnerId,
      isDQ,
      warnDependent: true,
      gameData: games,
    };
  }

  const wasDQ = original.slots.some(isDQSlot);
  const dqChanged = wasDQ !== isDQ;
  const hasGames = !!games;
  if (!dqChanged && !hasGames) return { action: 'none' };
  return { action: 'update', setId, winnerId, isDQ, gameData: games };
}

/**
 * Save in-progress game scores without completing the set (`updateBracketSet` with no set winner).
 * For completed sets, keeps the existing winner and only refreshes game data / DQ.
 */
export function planSetScoreSave(
  original: BracketSet,
  edited: { isDQ: boolean; gameData: BracketSetGameDataInput[] },
): SetSavePlan {
  const setId = original.id;
  const games = edited.gameData.length ? edited.gameData : undefined;
  if (original.state === SetState.Completed) {
    const winnerId = original.winnerId;
    if (winnerId == null) return { action: 'none' };
    return { action: 'update', setId, winnerId, isDQ: edited.isDQ, gameData: games };
  }
  return { action: 'update', setId, winnerId: null, isDQ: edited.isDQ, gameData: games };
}
