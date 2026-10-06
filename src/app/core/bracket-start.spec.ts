import { BracketSet, SetState } from './api/models';
import { pickStartSet, poolStarted, rebuiltAfterStart, resolvePhaseGroupId, startPool } from './bracket-start';
import { bracketSignature } from './bracket-reset';

const entrant = (id: number) => ({ entrant: { id, name: `E${id}` } });
const preview = (id: string, round: number, entrants = 2): BracketSet => ({
  id,
  round,
  state: SetState.Created,
  slots: [entrants > 0 ? entrant(1) : {}, entrants > 1 ? entrant(2) : {}],
});

describe('poolStarted', () => {
  it('is false only for created pools', () => {
    expect(poolStarted({ id: 1, state: 1 })).toBe(false);
    expect(poolStarted({ id: 1, state: 2 })).toBe(true);
    expect(poolStarted({ id: 1, state: 3 })).toBe(true);
    expect(poolStarted(null)).toBe(false);
  });
});

describe('pickStartSet', () => {
  it('picks the earliest winners-side preview set with two entrants', () => {
    const sets = [
      preview('preview_1_3_0', 3, 0),
      preview('preview_1_-1_0', -1, 0),
      preview('preview_1_1_0', 1),
      preview('preview_1_1_1', 1),
    ];
    expect(pickStartSet(sets)?.id).toBe('preview_1_1_0');
  });

  it('skips sets that are not previews and falls back to any preview', () => {
    expect(pickStartSet([{ ...preview('x', 1), id: 42 }, preview('preview_1_2_0', 2, 0)])?.id).toBe('preview_1_2_0');
    expect(pickStartSet([{ ...preview('x', 1), id: 42 }])).toBeNull();
  });
});

describe('rebuiltAfterStart', () => {
  it('waits until the starter set or a new real bracket appears', () => {
    const before = bracketSignature([preview('preview_1_1_0', 1)]);
    const ready = rebuiltAfterStart(before, 108599537);
    expect(ready([])).toBe(false);
    expect(ready([preview('preview_1_1_0', 1)])).toBe(false);
    expect(ready([{ ...preview('x', 1), id: 108599537 }])).toBe(true);
    expect(ready([{ ...preview('x', 1), id: 42 }, { ...preview('y', 1), id: 43 }])).toBe(true);
  });
});

describe('resolvePhaseGroupId', () => {
  it('keeps the id when it still exists and otherwise matches displayIdentifier', () => {
    const groups = [
      { id: 99, displayIdentifier: 'A', bracketType: 'DOUBLE_ELIMINATION' as const },
      { id: 100, displayIdentifier: 'B', bracketType: 'DOUBLE_ELIMINATION' as const },
    ];
    expect(resolvePhaseGroupId(groups, '99', groups[0]!)).toBe('99');
    expect(resolvePhaseGroupId(groups, '3162844', { displayIdentifier: 'B' })).toBe('100');
    expect(resolvePhaseGroupId(groups, '3162844', null)).toBe('99');
  });
});

describe('startPool', () => {
  const real: BracketSet = { id: 108599537, identifier: 'A', fullRoundText: 'Winners Semi-Final', state: 6, slots: [] };

  it('calls the opening preview set, then clears the call so no set stays marked', async () => {
    const api = { markSetCalled: vi.fn().mockResolvedValue(real), resetSet: vi.fn().mockResolvedValue({ id: real.id, state: 1 }) };
    await expect(startPool(api, [preview('preview_1_1_0', 1)])).resolves.toBe(real.id);
    expect(api.markSetCalled).toHaveBeenCalledWith('preview_1_1_0');
    expect(api.resetSet).toHaveBeenCalledWith(real.id, false);
    expect(api.markSetCalled.mock.invocationCallOrder[0]!).toBeLessThan(api.resetSet.mock.invocationCallOrder[0]!);
  });

  it("passes start.gg's error through when the call fails", async () => {
    const api = { markSetCalled: vi.fn().mockRejectedValue(new Error('You do not have permission')), resetSet: vi.fn() };
    await expect(startPool(api, [preview('preview_1_1_0', 1)])).rejects.toThrow('You do not have permission');
    expect(api.resetSet).not.toHaveBeenCalled();
  });

  it('says which set is still called when clearing it fails', async () => {
    const api = { markSetCalled: vi.fn().mockResolvedValue(real), resetSet: vi.fn().mockRejectedValue(new Error('nope')) };
    await expect(startPool(api, [preview('preview_1_1_0', 1)])).rejects.toThrow(
      'Bracket started, but Winners Semi-Final A is still marked as called: nope',
    );
  });

  it('refuses when there is no preview set', async () => {
    const api = { markSetCalled: vi.fn(), resetSet: vi.fn() };
    await expect(startPool(api, [])).rejects.toThrow(/No preview sets/);
    expect(api.markSetCalled).not.toHaveBeenCalled();
  });
});
