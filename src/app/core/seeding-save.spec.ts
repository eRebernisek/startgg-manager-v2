import { Phase } from './api/models';
import { buildSeedMapping, phaseStarted, seedingApplied, seedingErrorMessage } from './seeding-save';

const seed = (id: number, seedNum: number, group = 3162844) => ({ id, seedNum, phaseGroup: { id: group } });

describe('buildSeedMapping', () => {
  it('maps seed IDs (not entrant IDs) in display order, numbered from 1', () => {
    expect(buildSeedMapping([seed(4, 4), seed(1, 1), seed(2, 2)])).toEqual([
      { seedId: 4, seedNum: 1, phaseGroupId: 3162844 },
      { seedId: 1, seedNum: 2, phaseGroupId: 3162844 },
      { seedId: 2, seedNum: 3, phaseGroupId: 3162844 },
    ]);
  });

  it('omits phaseGroupId when the seed has no group', () => {
    expect(buildSeedMapping([{ id: 7, seedNum: 1 }])).toEqual([{ seedId: 7, seedNum: 1 }]);
  });
});

describe('seedingApplied', () => {
  it('is true when start.gg returns the requested order', () => {
    const requested = [seed(2, 2), seed(1, 1)];
    expect(seedingApplied([seed(1, 2), seed(2, 1)], requested)).toBe(true);
  });

  it('is false when start.gg kept the old order', () => {
    const requested = [seed(2, 2), seed(1, 1)];
    expect(seedingApplied([seed(1, 1), seed(2, 2)], requested)).toBe(false);
  });

  it('is false when seeds are missing', () => {
    expect(seedingApplied([seed(1, 1)], [seed(1, 1), seed(2, 2)])).toBe(false);
  });
});

describe('phaseStarted', () => {
  const phase = (extra: Partial<Phase>): Phase => ({ id: 1, name: 'Bracket', ...extra });

  it('detects an active phase', () => {
    expect(phaseStarted(phase({ state: 'ACTIVE' }))).toBe(true);
  });

  it('detects a started pool even if the phase state is missing', () => {
    expect(phaseStarted(phase({ phaseGroups: { nodes: [{ id: 1, state: 1 }, { id: 2, state: 2 }] } }))).toBe(true);
  });

  it('trusts created pools over an ACTIVE phase (state after a bracket reset)', () => {
    expect(phaseStarted(phase({ state: 'ACTIVE', phaseGroups: { nodes: [{ id: 1, state: 1 }] } }))).toBe(false);
  });

  it('is false for a created phase with created pools', () => {
    expect(phaseStarted(phase({ state: 'CREATED', phaseGroups: { nodes: [{ id: 1, state: 1 }] } }))).toBe(false);
    expect(phaseStarted(null)).toBe(false);
  });
});

describe('seedingErrorMessage', () => {
  it('explains start.gg refusing to reseed a started bracket', () => {
    expect(seedingErrorMessage('Cannot modify seeds in started pools')).toBe(
      'Bracket already started — use Reset bracket to reseed. (start.gg: Cannot modify seeds in started pools)',
    );
    expect(seedingErrorMessage('Cannot modify seeds on started phases.')).toMatch(/^Bracket already started/);
  });

  it('passes other reasons through', () => {
    expect(seedingErrorMessage('Seed mapping is missing entrants')).toBe(
      'Seeding not saved: Seed mapping is missing entrants',
    );
  });
});
