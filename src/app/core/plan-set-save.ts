import { BracketSet, Id, SetState } from './api/models';
import { isDQSlot, sameId } from './bracket-layout';

export interface EditedSetState {
  winnerId: Id;
  isDQ: boolean;
}

export type SetSavePlan =
  | { action: 'none' }
  | { action: 'report'; setId: Id; winnerId: Id; isDQ: boolean }
  | { action: 'update'; setId: Id; winnerId: Id; isDQ: boolean }
  | {
      action: 'resetThenReport';
      setId: Id;
      resetDependentSets: boolean;
      winnerId: Id;
      isDQ: boolean;
      warnDependent: boolean;
    };

/**
 * Decides which start.gg mutations to run for a set editor save. Only the winner (and DQ) is reported.
 * Changing the winner of a completed set requires resetSet then reportBracketSet —
 * updateBracketSet cannot change the winner.
 */
export function planSetSave(original: BracketSet, edited: EditedSetState): SetSavePlan {
  const setId = original.id;
  const { winnerId, isDQ } = edited;

  if (original.state !== SetState.Completed) {
    return { action: 'report', setId, winnerId, isDQ };
  }

  if (!sameId(winnerId, original.winnerId)) {
    return { action: 'resetThenReport', setId, resetDependentSets: true, winnerId, isDQ, warnDependent: true };
  }

  const wasDQ = original.slots.some(isDQSlot);
  return wasDQ === isDQ ? { action: 'none' } : { action: 'update', setId, winnerId, isDQ };
}
