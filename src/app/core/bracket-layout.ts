import { BracketSet, BracketType, Entrant, Id, Seed, SetSlot } from './api/models';

export interface PositionedSet {
  set: BracketSet;
  col: number;
  /** Vertical slot; fractional for sets centred between their feeders. */
  y: number;
}

/** Connector from a feeder set into a slot of the destination set (start.gg W/L paths). */
export interface BracketEdge {
  from: string;
  to: string;
  /** 1 = winner exit, 2 = loser exit on the source set. */
  fromPlacement: number;
  /** 0 | 1 — destination slot on the target set. */
  toSlot: number;
}

export interface BracketSide {
  key: 'winners' | 'losers';
  columns: string[];
  sets: PositionedSet[];
  /** Number of vertical slots used. */
  height: number;
  edges: BracketEdge[];
}

/**
 * start.gg's bracket page hides sets that are never played: a bye in either slot (the other entrant
 * advances automatically) or two empty slots. Every double elimination group has whole losers rounds of them.
 */
export function isHiddenSet(set: BracketSet): boolean {
  const [a, b] = set.slots;
  return (
    set.slots.some((sl) => sl.prereqType?.toLowerCase() === 'bye') ||
    (isEmptySlot(a) && isEmptySlot(b))
  );
}

/** Bracket view mode when `bracketType` from the API is missing or stale. */
export function bracketViewMode(
  sets: BracketSet[],
  bracketType?: BracketType | null,
): 'elimination' | 'round-robin' | 'rounds' {
  if (bracketType === 'SINGLE_ELIMINATION' || bracketType === 'DOUBLE_ELIMINATION') return 'elimination';
  if (bracketType === 'ROUND_ROBIN') return 'round-robin';
  if (sets.some((s) => (s.round ?? 0) !== 0)) return 'elimination';
  return 'rounds';
}

function isEmptySlot(slot: SetSlot | undefined): boolean {
  return !slot || (!slot.entrant && !slot.prereqId);
}

/**
 * Lays out an elimination phase group like start.gg's bracket page: one column per round (`round`,
 * negative for losers), hidden sets dropped, leaf sets stacked in feed order and every other set
 * centred between the sets that feed it (followed through `prereqId`, skipping hidden sets).
 * Winners (round > 0) and losers (round < 0) are laid out separately.
 */
export function layoutElimination(sets: BracketSet[]): BracketSide[] {
  const byId = new Map(sets.map((s) => [String(s.id), s]));
  const sides: BracketSide[] = [];
  for (const key of ['winners', 'losers'] as const) {
    const side = sets.filter((s) => sideOf(s) === key && !isHiddenSet(s));
    if (side.length) sides.push(layoutSide(key, side, byId));
  }
  return sides;
}

function sideOf(set: BracketSet): BracketSide['key'] | null {
  const round = set.round ?? 0;
  return round > 0 ? 'winners' : round < 0 ? 'losers' : null;
}

/** Visible sets whose winner or loser fills a slot of `set`, in slot order, looking through hidden sets. */
function resolveVisibleSource(set: BracketSet, byId: Map<string, BracketSet>): BracketSet | null {
  if (!isHiddenSet(set)) return set;
  const link = set.slots.find((sl) => sl.prereqType === 'set' && sl.prereqId);
  if (!link?.prereqId) return null;
  const next = byId.get(String(link.prereqId));
  return next ? resolveVisibleSource(next, byId) : null;
}

function visibleSourceForSlot(slot: SetSlot, byId: Map<string, BracketSet>): BracketSet | null {
  if (slot.prereqType !== 'set' || !slot.prereqId) return null;
  const feeder = byId.get(String(slot.prereqId));
  return feeder ? resolveVisibleSource(feeder, byId) : null;
}

function visibleFeeders(
  set: BracketSet,
  byId: Map<string, BracketSet>,
  seen = new Set<string>(),
): BracketSet[] {
  const out: BracketSet[] = [];
  for (const slot of set.slots) {
    const src = visibleSourceForSlot(slot, byId);
    if (!src) continue;
    const id = String(src.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(src);
  }
  return out;
}

function layoutSide(
  key: BracketSide['key'],
  sets: BracketSet[],
  all: Map<string, BracketSet>,
): BracketSide {
  const inSide = new Set(sets.map((s) => String(s.id)));
  const feeders = new Map(
    sets.map((s) => [
      String(s.id),
      visibleFeeders(s, all)
        .map((f) => String(f.id))
        .filter((f) => inSide.has(f)),
    ]),
  );

  const depth = new Map<string, number>();
  const depthOf = (id: string, stack = new Set<string>()): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    stack.add(id);
    const d =
      Math.max(
        -1,
        ...feeders
          .get(id)!
          .filter((f) => !stack.has(f))
          .map((f) => depthOf(f, stack)),
      ) + 1;
    stack.delete(id);
    depth.set(id, d);
    return d;
  };

  // One column per round; grand final and its reset share a round, so the round text splits them.
  const groups = new Map<string, BracketSet[]>();
  for (const s of sets) {
    const k = `${s.round}|${s.fullRoundText ?? ''}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const groupDepth = (g: BracketSet[]) => Math.max(...g.map((s) => depthOf(String(s.id))));
  const ordered = [...groups.values()].sort(
    (a, b) =>
      Math.abs(a[0].round ?? 0) - Math.abs(b[0].round ?? 0) || groupDepth(a) - groupDepth(b),
  );
  const col = new Map<string, number>();
  ordered.forEach((g, i) => g.forEach((s) => col.set(String(s.id), i)));

  const used = new Map<string, number>();
  const columns = ordered.map(([first]) => {
    const base =
      first.fullRoundText ||
      `${key === 'losers' ? 'Losers ' : ''}Round ${Math.abs(first.round ?? 0)}`;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });

  const referenced = new Set([...feeders.values()].flat());
  const roots = sets
    .filter((s) => !referenced.has(String(s.id)))
    .sort((a, b) => col.get(String(b.id))! - col.get(String(a.id))!);

  const y = new Map<string, number>();
  let nextLeaf = 0;
  const place = (id: string, stack = new Set<string>()): number => {
    const cached = y.get(id);
    if (cached !== undefined) return cached;
    stack.add(id);
    const kids = feeders.get(id)!.filter((k) => !stack.has(k));
    const value = kids.length
      ? kids.map((k) => place(k, stack)).reduce((a, b) => a + b, 0) / kids.length
      : nextLeaf++;
    stack.delete(id);
    y.set(id, value);
    return value;
  };
  roots.forEach((r) => place(String(r.id)));
  sets.forEach((s) => place(String(s.id)));

  const edges: BracketEdge[] = [];
  const edgeKeys = new Set<string>();
  for (const s of sets) {
    s.slots.forEach((slot, toSlot) => {
      const src = visibleSourceForSlot(slot, all);
      if (!src) return;
      const from = String(src.id);
      if (!inSide.has(from)) return;
      const key = `${from}|${s.id}|${toSlot}`;
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edges.push({
        from,
        to: String(s.id),
        fromPlacement: slot.prereqPlacement ?? 1,
        toSlot,
      });
    });
  }

  return {
    key,
    columns,
    sets: sets.map((set) => ({ set, col: col.get(String(set.id))!, y: y.get(String(set.id))! })),
    height: Math.max(nextLeaf, 1),
    edges,
  };
}

/** Groups sets by round for round robin / swiss / unknown bracket types. */
export function groupByRound(
  sets: BracketSet[],
): { round: number; title: string; sets: BracketSet[] }[] {
  const map = new Map<number, BracketSet[]>();
  for (const s of sets) {
    if (isHiddenSet(s)) continue;
    const r = s.round ?? 0;
    map.set(r, [...(map.get(r) ?? []), s]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, list]) => ({
      round,
      title: list[0]?.fullRoundText ?? `Round ${round}`,
      sets: list,
    }));
}

export interface RoundRobinRow {
  entrant: Entrant;
  wins: number;
  losses: number;
  /** Result against each other entrant id ("W", "L", "DQ"), from this row's perspective. */
  cells: Record<string, { text: string; won: boolean | null; set: BracketSet }>;
}

/** Builds a round robin results matrix, ordered by wins then seed. */
export function roundRobinTable(sets: BracketSet[], seeds: Seed[]): RoundRobinRow[] {
  const rows = new Map<string, RoundRobinRow>();
  for (const seed of [...seeds].sort(
    (a, b) => (a.groupSeedNum ?? a.seedNum) - (b.groupSeedNum ?? b.seedNum),
  )) {
    if (seed.entrant)
      rows.set(String(seed.entrant.id), { entrant: seed.entrant, wins: 0, losses: 0, cells: {} });
  }
  for (const set of sets) {
    const [a, b] = set.slots;
    const ea = a?.entrant;
    const eb = b?.entrant;
    if (!ea || !eb) continue;
    const done = set.winnerId != null;
    const aWon = done ? sameId(set.winnerId, ea.id) : null;
    const rowA = rows.get(String(ea.id));
    const rowB = rows.get(String(eb.id));
    const text = (won: boolean | null, own: typeof a, other: typeof b) =>
      won == null ? '–' : won ? (isDQSlot(other) ? 'W (DQ)' : 'W') : isDQSlot(own) ? 'DQ' : 'L';
    if (rowA) {
      rowA.cells[String(eb.id)] = { text: text(aWon, a, b), won: aWon, set };
      if (done) aWon ? rowA.wins++ : rowA.losses++;
    }
    if (rowB) {
      const bWon = aWon == null ? null : !aWon;
      rowB.cells[String(ea.id)] = { text: text(bWon, b, a), won: bWon, set };
      if (done) aWon ? rowB.losses++ : rowB.wins++;
    }
  }
  return [...rows.values()].sort((x, y) => y.wins - x.wins || x.losses - y.losses);
}

export function slotScore(slot: BracketSet['slots'][number] | undefined): number | null {
  return slot?.standing?.stats?.score?.value ?? null;
}

/** start.gg marks a disqualified entrant with a slot score of -1. */
export function isDQSlot(slot: BracketSet['slots'][number] | undefined): boolean {
  return slotScore(slot) === -1;
}

export function sameId(a: Id | null | undefined, b: Id | null | undefined): boolean {
  return a != null && b != null && String(a) === String(b);
}

export function isPreviewSet(set: BracketSet): boolean {
  return String(set.id).startsWith('preview');
}
