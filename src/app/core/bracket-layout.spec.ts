import { BracketSet, Seed } from './api/models';
import {
  BracketSide,
  bracketViewMode,
  isHiddenSet,
  layoutElimination,
  roundRobinTable,
} from './bracket-layout';
import { DE13, DE13_PREVIEW, DE4, DE8, SetRow } from './bracket-layout.fixtures';

type SlotSpec = [type: 'seed' | 'set', id: string, placement?: number, entrant?: number];

function set(
  id: number,
  round: number,
  text: string,
  slots: SlotSpec[],
  extra: Partial<BracketSet> = {},
): BracketSet {
  return {
    id,
    round,
    fullRoundText: text,
    state: 1,
    slots: slots.map(([prereqType, prereqId, prereqPlacement, entrant]) => ({
      prereqType,
      prereqId,
      prereqPlacement: prereqPlacement ?? null,
      entrant: entrant ? { id: entrant, name: `E${entrant}` } : null,
    })),
    ...extra,
  };
}

function fromRows(rows: SetRow[]): BracketSet[] {
  return rows.map(([id, identifier, round, fullRoundText, ...slots]) => ({
    id,
    identifier,
    round,
    fullRoundText,
    state: 1,
    slots: slots.map((spec) => {
      const [type, a, b] = spec.split(':');
      if (type === 'bye') return { prereqType: 'bye', prereqId: null, entrant: null };
      if (type === 'seed')
        return {
          prereqType: 'seed',
          prereqId: `seed${a ?? ''}`,
          entrant: a ? { id: +a, name: `E${a}` } : null,
        };
      return { prereqType: 'set', prereqId: a, prereqPlacement: +b, entrant: null };
    }),
  }));
}

const at = (side: BracketSide, identifier: string) => {
  const p = side.sets.find((s) => s.set.identifier === identifier);
  if (!p) throw new Error(`${identifier} not shown on ${side.key}`);
  return p;
};
const idents = (side: BracketSide, col: number) =>
  side.sets
    .filter((p) => p.col === col)
    .sort((a, b) => a.y - b.y)
    .map((p) => p.set.identifier);

/** Invariants every elimination layout must hold, whatever the bracket size. */
function expectWellFormed(sides: BracketSide[]) {
  for (const side of sides) {
    expect(new Set(side.columns).size).toBe(side.columns.length);
    side.columns.forEach((_, c) => expect(side.sets.some((p) => p.col === c)).toBe(true));
    expect(side.sets.some((p) => isHiddenSet(p.set))).toBe(false);

    for (let c = 0; c < side.columns.length; c++) {
      const ys = side.sets
        .filter((p) => p.col === c)
        .map((p) => p.y)
        .sort((a, b) => a - b);
      ys.slice(1).forEach((y, i) => expect(y - ys[i]).toBeGreaterThanOrEqual(1));
      ys.forEach((y) => expect(y).toBeLessThan(side.height));
    }

    const pos = new Map(side.sets.map((p) => [String(p.set.id), p]));
    for (const e of side.edges) expect(pos.get(e.from)!.col).toBeLessThan(pos.get(e.to)!.col);
    for (const p of side.sets) {
      const from = side.edges
        .filter((e) => e.to === String(p.set.id))
        .map((e) => pos.get(e.from)!.y);
      if (from.length) expect(p.y).toBeCloseTo(from.reduce((a, b) => a + b, 0) / from.length);
    }
  }
}

describe('bracketViewMode', () => {
  it('uses elimination layout when rounds are signed even without bracketType', () => {
    const sets = fromRows(DE4);
    expect(bracketViewMode(sets, null)).toBe('elimination');
    expect(bracketViewMode(sets, undefined)).toBe('elimination');
  });
});

describe('isHiddenSet', () => {
  it('hides bye sets and sets with two empty slots, like start.gg', () => {
    const sets = fromRows(DE13);
    expect(sets.filter((s) => !isHiddenSet(s)).length).toBe(24);
    expect(isHiddenSet(set(1, -1, 'Losers Round 1', []))).toBe(true);
    expect(
      isHiddenSet(
        set(1, 2, 'Winners Final', [
          ['set', '7', 1],
          ['set', '8', 1],
        ]),
      ),
    ).toBe(false);
  });
});

describe('layoutElimination — 4-player double elimination (live test event)', () => {
  const sides = layoutElimination(fromRows(DE4));
  const [winners, losers] = sides;

  it('is well formed', () => expectWellFormed(sides));

  it('puts grand final reset after grand final even though they share a round', () => {
    expect(winners.columns).toEqual([
      'Winners Semi-Final',
      'Winners Final',
      'Grand Final',
      'Grand Final Reset',
    ]);
    expect(idents(winners, 2)).toEqual(['D']);
    expect(idents(winners, 3)).toEqual(['E']);
  });

  it('centres a set between its feeders', () => {
    expect(at(winners, 'A').y).toBe(0);
    expect(at(winners, 'B').y).toBe(1);
    expect(at(winners, 'C').y).toBe(0.5);
    expect(at(winners, 'D').y).toBe(0.5);
    expect(at(winners, 'E').y).toBe(0.5);
    expect(winners.height).toBe(2);
  });

  it('drops the bye rounds of the losers bracket', () => {
    expect(losers.columns).toEqual(['Losers Semi-Final', 'Losers Final']);
    expect(losers.sets.map((p) => p.set.identifier).sort()).toEqual(['F', 'G']);
    expect(losers.height).toBe(1);
    expect(losers.edges).toEqual([
      { from: '2', to: '1', fromPlacement: 1, toSlot: 1 },
    ]);
  });

  it('builds edges only within a side', () => {
    expect(winners.edges).toContainEqual({ from: '9', to: '10', fromPlacement: 1, toSlot: 0 });
    expect(winners.edges).toContainEqual({ from: '10', to: '11', fromPlacement: 1, toSlot: 0 });
    expect(winners.edges.some((e) => e.from === '1')).toBe(false);
  });
});

describe('layoutElimination — 13 players with byes', () => {
  const sides = layoutElimination(fromRows(DE13));
  const [winners, losers] = sides;

  it('is well formed', () => expectWellFormed(sides));

  it('shows one column per round with start.gg labels and no duplicates', () => {
    expect(winners.columns).toEqual([
      'Winners Round 1',
      'Winners Quarter-Final',
      'Winners Semi-Final',
      'Winners Final',
      'Grand Final',
    ]);
    expect(losers.columns).toEqual([
      'Losers Round 1',
      'Losers Round 2',
      'Losers Round 3',
      'Losers Quarter-Final',
      'Losers Semi-Final',
      'Losers Final',
    ]);
  });

  it('keeps only the played sets of each round, in bracket order', () => {
    expect(idents(winners, 0)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(idents(winners, 1)).toEqual(['F', 'G', 'H', 'I']);
    expect(idents(losers, 0)).toEqual(['O']);
    expect(idents(losers, 1)).toEqual(['P', 'Q', 'R', 'S']);
    expect(idents(losers, 2)).toEqual(['T', 'U']);
  });

  it('lines a set fed by one visible set and one bye up with that set', () => {
    expect(at(winners, 'F').y).toBe(at(winners, 'A').y);
    expect(at(winners, 'G').y).toBe((at(winners, 'B').y + at(winners, 'C').y) / 2);
    expect(at(winners, 'H').y).toBe(at(winners, 'D').y);
    expect(at(losers, 'Q').y).toBe(at(losers, 'O').y);
    expect(at(losers, 'P').y).toBe(0);
    expect(at(losers, 'T').y).toBe(0.5);
    expect(losers.height).toBe(4);
  });

  it('lays out the preview bracket the same way, plus the grand final reset', () => {
    const preview = layoutElimination(fromRows(DE13_PREVIEW));
    expectWellFormed(preview);
    expect(preview[0].columns).toEqual([...winners.columns, 'Grand Final Reset']);
    expect(preview[1].columns).toEqual(losers.columns);
    for (const side of [0, 1]) {
      for (const p of sides[side].sets) {
        expect(at(preview[side], p.set.identifier!)).toMatchObject({ col: p.col, y: p.y });
      }
    }
  });
});

describe('layoutElimination — 8 players, no byes', () => {
  const sides = layoutElimination(fromRows(DE8));
  const [winners, losers] = sides;

  it('is well formed', () => expectWellFormed(sides));

  it('stacks the first round and centres the rest', () => {
    expect(winners.columns).toEqual([
      'Winners Quarter-Final',
      'Winners Semi-Final',
      'Winners Final',
      'Grand Final',
      'Grand Final Reset',
    ]);
    expect(idents(winners, 0)).toEqual(['A', 'B', 'C', 'D']);
    expect(at(winners, 'E').y).toBe(0.5);
    expect(at(winners, 'F').y).toBe(2.5);
    expect(at(winners, 'G').y).toBe(1.5);
  });

  it('starts the losers bracket at the first round that is actually played', () => {
    expect(losers.columns).toEqual([
      'Losers Round 1',
      'Losers Quarter-Final',
      'Losers Semi-Final',
      'Losers Final',
    ]);
    expect(idents(losers, 0)).toEqual(['J', 'K']);
    expect(at(losers, 'L').y).toBe(at(losers, 'J').y);
    expect(at(losers, 'N').y).toBe(0.5);
    expect(at(losers, 'O').y).toBe(0.5);
  });
});

describe('layoutElimination — 2 players', () => {
  it('shows only the winners side when every losers set is a bye', () => {
    const sides = layoutElimination(
      fromRows([
        [1, 'A', 1, 'Winners Final', 'seed:1', 'seed:2'],
        [2, 'C', -1, 'Losers Final', 'set:1:2', 'bye'],
        [3, 'B', 2, 'Grand Final', 'set:1:1', 'set:2:1'],
        [4, 'D', 2, 'Grand Final Reset', 'set:3:1', 'set:3:2'],
      ]),
    );
    expectWellFormed(sides);
    expect(sides.map((s) => s.key)).toEqual(['winners']);
    expect(sides[0].columns).toEqual(['Winners Final', 'Grand Final', 'Grand Final Reset']);
    expect(sides[0].sets.every((p) => p.y === 0)).toBe(true);
    expect(sides[0].height).toBe(1);
  });

  it('handles a single-set single elimination bracket', () => {
    const sides = layoutElimination(fromRows([[1, 'A', 1, 'Final', 'seed:1', 'seed:2']]));
    expect(sides).toHaveLength(1);
    expect(sides[0]).toMatchObject({ columns: ['Final'], height: 1, edges: [] });
  });
});

describe('roundRobinTable', () => {
  it('counts wins and builds the result matrix', () => {
    const seeds: Seed[] = [1, 2, 3].map((n) => ({
      id: n,
      seedNum: n,
      entrant: { id: n, name: `E${n}` },
    }));
    const withScore = (s: BracketSet, a: number, b: number, winnerId: number) => {
      s.slots[0].standing = { stats: { score: { value: a } } };
      s.slots[1].standing = { stats: { score: { value: b } } };
      s.winnerId = winnerId;
      return s;
    };
    const sets = [
      withScore(
        set(1, 1, 'R1', [
          ['seed', 'a', 0, 1],
          ['seed', 'b', 0, 2],
        ]),
        2,
        0,
        1,
      ),
      withScore(
        set(2, 2, 'R2', [
          ['seed', 'a', 0, 3],
          ['seed', 'b', 0, 1],
        ]),
        2,
        1,
        3,
      ),
      withScore(
        set(3, 3, 'R3', [
          ['seed', 'a', 0, 2],
          ['seed', 'b', 0, 3],
        ]),
        0,
        2,
        3,
      ),
    ];
    const rows = roundRobinTable(sets, seeds);
    expect(rows.map((r) => [r.entrant.id, r.wins, r.losses])).toEqual([
      [3, 2, 0],
      [1, 1, 1],
      [2, 0, 2],
    ]);
    expect(rows[1].cells['3']).toMatchObject({ text: 'L', won: false });
    expect(rows[0].cells['1']).toMatchObject({ text: 'W', won: true });
  });

  it('marks DQ results without scores', () => {
    const seeds: Seed[] = [1, 2].map((n) => ({
      id: n,
      seedNum: n,
      entrant: { id: n, name: `E${n}` },
    }));
    const s = set(1, 1, 'R1', [
      ['seed', 'a', 0, 1],
      ['seed', 'b', 0, 2],
    ]);
    s.slots[1].standing = { stats: { score: { value: -1 } } };
    s.winnerId = 1;
    const rows = roundRobinTable([s], seeds);
    expect(rows[0].cells['2']).toMatchObject({ text: 'W (DQ)', won: true });
    expect(rows[1].cells['1']).toMatchObject({ text: 'DQ', won: false });
  });
});
