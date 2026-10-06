import { BracketSet, SetState } from './api/models';
import { planSetSave } from './plan-set-save';

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
    });
  });

  it('does nothing when a completed set keeps its winner', () => {
    const plan = planSetSave(baseSet({ state: SetState.Completed, winnerId: 1 }), { winnerId: 1, isDQ: false });
    expect(plan).toEqual({ action: 'none' });
  });

  it('updates a completed set when only the DQ flag changes', () => {
    const plan = planSetSave(baseSet({ state: SetState.Completed, winnerId: 1 }), { winnerId: 1, isDQ: true });
    expect(plan).toEqual({ action: 'update', setId: 42, winnerId: 1, isDQ: true });
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
    const plan = planSetSave(baseSet({ state: SetState.Completed, winnerId: 1 }), { winnerId: 2, isDQ: false });
    expect(plan).toEqual({
      action: 'resetThenReport',
      setId: 42,
      resetDependentSets: true,
      winnerId: 2,
      isDQ: false,
      warnDependent: true,
    });
  });

  it('treats DQ as a normal report on open sets', () => {
    const plan = planSetSave(baseSet(), { winnerId: 2, isDQ: true });
    expect(plan).toMatchObject({ action: 'report', isDQ: true, winnerId: 2 });
  });
});
