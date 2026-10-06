import { BracketSet, Id, Phase, SetState } from './api/models';
import { isPreviewSet } from './bracket-layout';

/** Set states that carry results or progress start.gg must clear. */
const RESETTABLE = new Set<number>([SetState.Completed, SetState.InProgress, SetState.Called]);

/** start.gg completes bye sets itself and rejects `resetSet` on them ("Cannot modify bye sets."). */
export function isByeSet(set: BracketSet): boolean {
  return set.slots.some((s) => s.prereqType === 'bye');
}

export function needsReset(set: BracketSet): boolean {
  return !isPreviewSet(set) && !isByeSet(set) && RESETTABLE.has(set.state);
}

/**
 * Sets to reset, dependents first (grand final reset → grand final → finals → … → round 1), so each
 * `resetSet` runs after every set fed by its result has already been cleared. Dependencies come from the
 * slots' `prereqType: "set"` links; losers round numbers alone are unreliable because start.gg pads them.
 */
export function resetOrder(sets: readonly BracketSet[]): BracketSet[] {
  const byId = new Map(sets.map((s) => [String(s.id), s]));
  const depth = new Map<string, number>();
  const depthOf = (set: BracketSet, seen: Set<string>): number => {
    const id = String(set.id);
    const known = depth.get(id);
    if (known != null) return known;
    if (seen.has(id)) return 0;
    seen.add(id);
    let d = 0;
    for (const slot of set.slots) {
      const prereq = slot.prereqType === 'set' && slot.prereqId != null ? byId.get(String(slot.prereqId)) : undefined;
      if (prereq) d = Math.max(d, depthOf(prereq, seen) + 1);
    }
    depth.set(id, d);
    return d;
  };
  for (const s of sets) depthOf(s, new Set());

  return sets
    .filter(needsReset)
    .sort(
      (a, b) =>
        depth.get(String(b.id))! - depth.get(String(a.id))! ||
        Math.abs(b.round ?? 0) - Math.abs(a.round ?? 0) ||
        Number(b.id) - Number(a.id),
    );
}

export interface ResetSummary {
  total: number;
  reported: number;
  inProgress: number;
}

export function resetSummary(sets: readonly BracketSet[]): ResetSummary {
  const real = sets.filter((s) => !isPreviewSet(s));
  const played = real.filter(needsReset);
  return {
    total: real.length,
    reported: played.filter((s) => s.state === SetState.Completed).length,
    inProgress: played.filter((s) => s.state !== SetState.Completed).length,
  };
}

/** Changes whenever start.gg regenerates sets or moves entrants between slots. */
export function bracketSignature(sets: readonly BracketSet[]): string {
  return sets
    .map((s) => `${s.id}:${s.state}:${s.winnerId ?? ''}:${s.slots.map((x) => x.entrant?.id ?? '-').join(',')}`)
    .sort()
    .join('|');
}

/** A reset pool is rebuilt once start.gg serves its preview sets (it briefly returns old or no sets). */
export function rebuiltAfterReset(sets: readonly BracketSet[]): boolean {
  return sets.length > 0 && sets.every(isPreviewSet);
}

/** A reseeded pool is rebuilt once its sets differ from the snapshot taken before saving. */
export function rebuiltAfterReseed(before: string) {
  return (sets: readonly BracketSet[]) => sets.length > 0 && bracketSignature(sets) !== before;
}

export interface ResetApi {
  resetSet(setId: Id, resetDependentSets?: boolean): Promise<unknown>;
  regeneratePhase(phase: Phase): Promise<Pick<Phase, 'id' | 'state' | 'phaseGroups'>>;
}

export type ResetProgress = { step: 'sets'; done: number; total: number } | { step: 'phase' };

/**
 * Clears every result in the phase, then re-saves the phase so start.gg un-starts its pools (resetting sets
 * alone leaves a started pool started, and start.gg keeps rejecting seeding with
 * "Cannot modify seeds in started pools").
 */
export async function resetPhase(
  api: ResetApi,
  phase: Phase,
  sets: readonly BracketSet[],
  onProgress?: (p: ResetProgress) => void,
): Promise<void> {
  const ordered = resetOrder(sets);
  for (const [i, set] of ordered.entries()) {
    onProgress?.({ step: 'sets', done: i, total: ordered.length });
    try {
      await api.resetSet(set.id, true);
    } catch (e) {
      const label = [set.fullRoundText, set.identifier].filter(Boolean).join(' ') || `set ${set.id}`;
      throw new Error(`Could not reset ${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  onProgress?.({ step: 'phase' });
  const updated = await api.regeneratePhase(phase);
  const started = (updated.phaseGroups?.nodes ?? []).filter((g) => g.state != null && Number(g.state) !== 1);
  if (started.length) {
    throw new Error(
      `start.gg kept ${started.length} pool(s) started. Use "Reset bracket" in the phase's admin page on start.gg.`,
    );
  }
}
