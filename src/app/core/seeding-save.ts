import { Id, Phase, SeedMappingInput } from './api/models';

interface SeedLike {
  id: Id;
  seedNum: number;
  phaseGroup?: { id: Id } | null;
}

/** Full-phase mapping for `updatePhaseSeeding` (strict mode): seed IDs in display order, numbered from 1. */
export function buildSeedMapping(seeds: readonly SeedLike[]): SeedMappingInput[] {
  return seeds.map((s, i) => ({
    seedId: s.id,
    seedNum: i + 1,
    ...(s.phaseGroup?.id != null ? { phaseGroupId: s.phaseGroup.id } : {}),
  }));
}

/** True when the seeds read back from start.gg, ordered by seed number, match the requested display order. */
export function seedingApplied(saved: readonly SeedLike[], requested: readonly SeedLike[]): boolean {
  const got = [...saved].sort((a, b) => a.seedNum - b.seedNum).map((s) => String(s.id));
  return got.length === requested.length && requested.every((s, i) => String(s.id) === got[i]);
}

/** Pool `ActivityState` ids: 1 = created; anything later means the bracket has started. */
const POOL_CREATED = 1;

/**
 * start.gg rejects seeding changes once any pool of the phase has started. Pool state wins over phase state:
 * after a bracket reset the phase stays ACTIVE while its pools are back to created.
 */
export function phaseStarted(phase: Phase | null | undefined): boolean {
  if (!phase) return false;
  const pools = (phase.phaseGroups?.nodes ?? []).filter((g) => g.state != null);
  if (pools.length) return pools.some((g) => Number(g.state) !== POOL_CREATED);
  return !!phase.state && phase.state !== 'CREATED';
}

export const STARTED_PHASE_HINT = 'Bracket already started — use Reset bracket to reseed.';

/** Turns start.gg's seeding errors into an actionable message, keeping start.gg's own reason. */
export function seedingErrorMessage(message: string): string {
  if (/started (pools|phases)/i.test(message)) return `${STARTED_PHASE_HINT} (start.gg: ${message})`;
  return `Seeding not saved: ${message}`;
}
