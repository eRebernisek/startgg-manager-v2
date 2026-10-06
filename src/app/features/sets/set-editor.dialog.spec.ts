import { BracketSet, SetState } from '../../core/api/models';
import { initialChoice } from './set-editor.dialog';

function set(extra: Partial<BracketSet> = {}): BracketSet {
  return {
    id: 1,
    state: SetState.Ready,
    winnerId: null,
    slots: [{ entrant: { id: 10, name: 'A' } }, { entrant: { id: 20, name: 'B' } }],
    ...extra,
  };
}

describe('initialChoice', () => {
  it('has no winner for unreported sets', () => {
    expect(initialChoice(set())).toEqual({ winner: null, dq: false });
  });

  it('maps the reported winner to its side', () => {
    expect(initialChoice(set({ state: SetState.Completed, winnerId: 20 }))).toEqual({ winner: 1, dq: false });
  });

  it('detects a DQ from the slot score', () => {
    const s = set({
      state: SetState.Completed,
      winnerId: 10,
      slots: [
        { entrant: { id: 10, name: 'A' } },
        { entrant: { id: 20, name: 'B' }, standing: { stats: { score: { value: -1 } } } },
      ],
    });
    expect(initialChoice(s)).toEqual({ winner: 0, dq: true });
  });
});
