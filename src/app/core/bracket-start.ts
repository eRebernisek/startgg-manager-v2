import { BracketSet, Id, PhaseGroupRef } from './api/models';
import { isPreviewSet } from './bracket-layout';
import { bracketSignature } from './bracket-reset';

/** Pool `ActivityState` 1 = created (not started). */
export function poolStarted(group: PhaseGroupRef | null | undefined): boolean {
  return group?.state != null && Number(group.state) !== 1;
}

/**
 * The preview set used to start the pool: an earliest-round set with two entrants, so start.gg has a real
 * match to call. start.gg has no start-bracket mutation; calling any preview set starts its pool.
 */
export function pickStartSet(sets: readonly BracketSet[]): BracketSet | null {
  const previews = sets.filter(isPreviewSet);
  const playable = previews.filter((s) => s.slots.filter((x) => x.entrant).length === 2);
  const pool = playable.length ? playable : previews;
  const byRound = [...pool].sort(
    (a, b) => Number((a.round ?? 0) <= 0) - Number((b.round ?? 0) <= 0) || Math.abs(a.round ?? 0) - Math.abs(b.round ?? 0),
  );
  return byRound[0] ?? null;
}

export interface StartApi {
  markSetCalled(setId: Id): Promise<BracketSet>;
  resetSet(setId: Id, resetDependentSets?: boolean): Promise<unknown>;
}

/**
 * Starts the pool by calling one preview set, then resets that set so it does not stay marked as called
 * (the pool stays started). start.gg replaces every preview set with a real one in the process.
 */
/**
 * After starting a pool, start.gg briefly clears sets then serves real (non-preview) IDs.
 * The starter set id is enough when it survives; otherwise wait for a new real bracket signature.
 */
export function rebuiltAfterStart(beforeSignature: string, starterSetId?: Id) {
  return (sets: readonly BracketSet[]): boolean => {
    if (!sets.length) return false;
    if (starterSetId != null && sets.some((s) => String(s.id) === String(starterSetId))) return true;
    const real = sets.filter((s) => !isPreviewSet(s));
    return real.length > 0 && bracketSignature(sets) !== beforeSignature;
  };
}

/** Keeps the same pool when start.gg replaces phase group IDs after a reset. */
export function resolvePhaseGroupId(
  groups: readonly PhaseGroupRef[],
  currentId: string,
  hint?: Pick<PhaseGroupRef, 'displayIdentifier' | 'bracketType'> | null,
): string {
  if (!groups.length) return currentId;
  if (groups.some((g) => String(g.id) === currentId)) return currentId;
  if (hint?.displayIdentifier != null) {
    const byLabel = groups.find((g) => g.displayIdentifier === hint.displayIdentifier);
    if (byLabel) return String(byLabel.id);
  }
  if (hint?.bracketType) {
    const byType = groups.find((g) => g.bracketType === hint.bracketType);
    if (byType) return String(byType.id);
  }
  return String(groups[0]!.id);
}

export async function startPool(api: StartApi, sets: readonly BracketSet[]): Promise<Id> {
  const first = pickStartSet(sets);
  if (!first) throw new Error('No preview sets to start. Reload the bracket and try again.');
  const called = await api.markSetCalled(first.id);
  if (!called || isPreviewSet(called)) throw new Error('start.gg did not start the bracket.');
  try {
    await api.resetSet(called.id, false);
    return called.id;
  } catch (e) {
    const label = [called.fullRoundText, called.identifier].filter(Boolean).join(' ') || `set ${called.id}`;
    throw new Error(
      `Bracket started, but ${label} is still marked as called: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
