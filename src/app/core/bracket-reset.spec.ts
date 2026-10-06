import { BracketSet, SetState } from './api/models';
import { bracketSignature, rebuiltAfterReseed, rebuiltAfterReset, resetOrder, resetSummary } from './bracket-reset';

function set(id: number, round: number, state: SetState, prereqs: number[] = []): BracketSet {
  return {
    id,
    round,
    state,
    slots: prereqs.length
      ? prereqs.map((p) => ({ prereqType: 'set', prereqId: String(p) }))
      : [{ prereqType: 'seed' }, { prereqType: 'seed' }],
  };
}

/** The 4-entrant double elimination layout start.gg generated for teste-rivals-2 (losers rounds are padded). */
function doubleElim(state = SetState.Completed): BracketSet[] {
  return [
    set(1, 1, state), // A  Winners Semi
    set(2, 1, state), // B  Winners Semi
    set(3, 2, state, [1, 2]), // C  Winners Final
    set(8, -1, state, [1]), // H  Losers R1 (bye path)
    set(9, -1, state, [2]),
    set(10, -2, state, [8]),
    set(11, -2, state, [9]),
    set(6, -3, state, [10, 11]), // F  Losers Semi
    set(7, -4, state, [3, 6]), // G  Losers Final
    set(4, 3, state, [3, 7]), // D  Grand Final
    set(5, 3, state, [4]), // E  Grand Final Reset
  ];
}

describe('resetOrder', () => {
  it('resets grand final reset, grand final and finals before the rounds that feed them', () => {
    const order = resetOrder(doubleElim()).map((s) => s.id);
    expect(order.slice(0, 3)).toEqual([5, 4, 7]);
    expect(order.slice(-2).sort()).toEqual([1, 2]);

    const sets = doubleElim();
    const pos = new Map(order.map((id, i) => [id, i]));
    for (const s of sets) {
      for (const slot of s.slots) {
        if (slot.prereqType === 'set') expect(pos.get(Number(s.id))!).toBeLessThan(pos.get(Number(slot.prereqId))!);
      }
    }
  });

  it('even though losers round numbers are larger than the grand final round', () => {
    const order = resetOrder(doubleElim()).map((s) => s.id);
    expect(order.indexOf(4)).toBeLessThan(order.indexOf(7));
  });

  it('only includes reported, in-progress and called sets — never unplayed or preview sets', () => {
    const sets = [
      set(1, 1, SetState.Completed),
      set(2, 1, SetState.InProgress),
      set(3, 1, SetState.Called),
      set(4, 2, SetState.Created, [1, 2]),
      set(5, 1, SetState.Ready),
      { ...set(6, 1, SetState.Completed), id: 'preview_3162844_1_0' },
    ];
    expect(resetOrder(sets).map((s) => s.id).sort()).toEqual([1, 2, 3]);
  });

  it('skips bye sets, which start.gg completes itself and refuses to reset', () => {
    const bye: BracketSet = {
      id: 9,
      round: -2,
      state: SetState.Completed,
      slots: [{ prereqType: 'set', prereqId: '1' }, { prereqType: 'bye' }],
    };
    expect(resetOrder([set(1, 1, SetState.Completed), bye]).map((s) => s.id)).toEqual([1]);
    expect(resetSummary([set(1, 1, SetState.Completed), bye])).toEqual({ total: 2, reported: 1, inProgress: 0 });
  });

  it('falls back to round depth when prereq links are missing', () => {
    const sets = [1, 2, 3].map((r) => ({ ...set(r, r, SetState.Completed), slots: [] }));
    expect(resetOrder(sets).map((s) => s.id)).toEqual([3, 2, 1]);
  });
});

describe('resetSummary', () => {
  it('counts reported and in-progress real sets', () => {
    const sets = [
      set(1, 1, SetState.Completed),
      set(2, 1, SetState.InProgress),
      set(3, 1, SetState.Called),
      set(4, 2, SetState.Created),
      { ...set(5, 1, SetState.Created), id: 'preview_1' },
    ];
    expect(resetSummary(sets)).toEqual({ total: 4, reported: 1, inProgress: 2 });
  });
});

describe('rebuilt checks', () => {
  const preview = (id: string): BracketSet => ({ id, state: SetState.Created, slots: [] });

  it('waits after a reset until start.gg serves only preview sets', () => {
    expect(rebuiltAfterReset([])).toBe(false);
    expect(rebuiltAfterReset([set(1, 1, SetState.Created), preview('preview_1_1_0')])).toBe(false);
    expect(rebuiltAfterReset([preview('preview_1_1_0'), preview('preview_1_1_1')])).toBe(true);
  });

  it('waits after a reseed until the sets differ and are not empty', () => {
    const before = bracketSignature([preview('preview_1_1_0')]);
    const ready = rebuiltAfterReseed(before);
    expect(ready([])).toBe(false);
    expect(ready([preview('preview_1_1_0')])).toBe(false);
    expect(ready([{ ...preview('preview_1_1_0'), slots: [{ entrant: { id: 1, name: 'A' } }] }])).toBe(true);
  });
});

describe('bracketSignature', () => {
  it('changes when start.gg regenerates sets or moves entrants', () => {
    const a: BracketSet = { id: 1, state: 1, slots: [{ entrant: { id: 10, name: 'A' } }, { entrant: { id: 20, name: 'B' } }] };
    const swapped: BracketSet = { ...a, slots: [a.slots[0]!, { entrant: { id: 30, name: 'C' } }] };
    expect(bracketSignature([a])).toBe(bracketSignature([{ ...a }]));
    expect(bracketSignature([a])).not.toBe(bracketSignature([swapped]));
    expect(bracketSignature([a])).not.toBe(bracketSignature([{ ...a, id: 'preview_1_1_0' }]));
  });
});
