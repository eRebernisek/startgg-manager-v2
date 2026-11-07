import { BracketSet, Seed } from './api/models';
import {
  BracketSide,
  bracketViewMode,
  grandFinalResetVisible,
  groupByRound,
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

  it('hides the grand final reset until it is actually needed', () => {
    expect(winners.columns).toEqual(['Winners Semi-Final', 'Winners Final', 'Grand Final']);
    expect(idents(winners, 2)).toEqual(['D']);
    expect(winners.sets.some((p) => p.set.identifier === 'E')).toBe(false);
  });

  it('centres a set between its feeders', () => {
    expect(at(winners, 'A').y).toBe(0);
    expect(at(winners, 'B').y).toBe(1);
    expect(at(winners, 'C').y).toBe(0.5);
    expect(at(winners, 'D').y).toBe(0.5);
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
    expect(winners.edges.some((e) => e.to === '11')).toBe(false);
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

  it('omits the unplayed grand final reset and keeps the rest of the preview aligned', () => {
    const preview = layoutElimination(fromRows(DE13_PREVIEW));
    expectWellFormed(preview);
    expect(preview[0].columns).toEqual(winners.columns);
    expect(preview[0].sets.some((p) => p.set.identifier === 'N')).toBe(false);
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
    expect(sides[0].columns).toEqual(['Winners Final', 'Grand Final']);
    expect(sides[0].sets.every((p) => p.y === 0)).toBe(true);
    expect(sides[0].height).toBe(1);
  });

  it('handles a single-set single elimination bracket', () => {
    const sides = layoutElimination(fromRows([[1, 'A', 1, 'Final', 'seed:1', 'seed:2']]));
    expect(sides).toHaveLength(1);
    expect(sides[0]).toMatchObject({ columns: ['Final'], height: 1, edges: [] });
  });
});

describe('grand final reset visibility', () => {
  function withGrandFinalWinner(rows: typeof DE4, winner: 'losers' | 'winners'): BracketSet[] {
    const sets = fromRows(rows);
    const gf = sets.find((s) => s.fullRoundText === 'Grand Final');
    if (!gf) throw new Error('missing grand final');
    const losersSlot = gf.slots.find((slot) => {
      const src = sets.find((s) => String(s.id) === String(slot.prereqId));
      return (src?.round ?? 0) < 0;
    });
    const winnersSlot = gf.slots.find((slot) => slot !== losersSlot);
    if (!losersSlot || !winnersSlot) throw new Error('missing grand final slots');
    winnersSlot.entrant = { id: 100, name: 'From Winners' };
    losersSlot.entrant = { id: 200, name: 'From Losers' };
    gf.state = 3;
    gf.winnerId = winner === 'losers' ? 200 : 100;
    return sets;
  }

  it('shows the reset after the losers player wins grand final, without moving earlier sets', () => {
    const dormant = layoutElimination(fromRows(DE4));
    const played = layoutElimination(withGrandFinalWinner(DE4, 'losers'));
    expectWellFormed(played);
    const winners = played[0];
    expect(winners.columns).toEqual([
      'Winners Semi-Final',
      'Winners Final',
      'Grand Final',
      'Grand Final Reset',
    ]);
    expect(idents(winners, 3)).toEqual(['E']);
    expect(at(winners, 'E').y).toBe(at(winners, 'D').y);
    expect(winners.edges).toContainEqual({ from: '10', to: '11', fromPlacement: 1, toSlot: 0 });
    expect(winners.edges).toContainEqual({ from: '10', to: '11', fromPlacement: 2, toSlot: 1 });
    for (const placed of dormant[0].sets) {
      expect(at(winners, placed.set.identifier!)).toMatchObject({ col: placed.col, y: placed.y });
    }
  });

  it('hides the reset while grand final is in progress, even if losers lead 2–1', () => {
    const sets = fromRows(DE4);
    const gf = sets.find((s) => s.fullRoundText === 'Grand Final');
    if (!gf) throw new Error('missing grand final');
    gf.state = 2;
    gf.winnerId = null;
    gf.slots[0].entrant = { id: 100, name: 'From Winners' };
    gf.slots[0].standing = { stats: { score: { value: 1 } } };
    gf.slots[1].entrant = { id: 200, name: 'From Losers' };
    gf.slots[1].standing = { stats: { score: { value: 2 } } };
    expect(layoutElimination(sets)[0].columns).not.toContain('Grand Final Reset');
  });

  it('uses the final score when grand final is completed without a winner id', () => {
    const sets = fromRows(DE4);
    const gf = sets.find((s) => s.fullRoundText === 'Grand Final');
    if (!gf) throw new Error('missing grand final');
    gf.state = 3;
    gf.winnerId = null;
    gf.slots[0].entrant = { id: 100, name: 'From Winners' };
    gf.slots[0].standing = { stats: { score: { value: 1 } } };
    gf.slots[1].entrant = { id: 200, name: 'From Losers' };
    gf.slots[1].standing = { stats: { score: { value: 2 } } };
    const sides = layoutElimination(sets);
    expectWellFormed(sides);
    expect(sides[0].columns).toContain('Grand Final Reset');
  });

  it('keeps the reset hidden when the winners player wins grand final', () => {
    const sides = layoutElimination(withGrandFinalWinner(DE4, 'winners'));
    expectWellFormed(sides);
    expect(sides[0].columns).not.toContain('Grand Final Reset');
  });

  it('shows a reset start.gg already filled or started, even before grand final has a winner', () => {
    const filled = fromRows(DE4);
    const reset = filled.find((s) => s.identifier === 'E');
    if (!reset) throw new Error('missing reset');
    reset.slots[0].entrant = { id: 200, name: 'From Losers' };
    reset.slots[1].entrant = { id: 100, name: 'From Winners' };
    expect(layoutElimination(filled)[0].columns).toContain('Grand Final Reset');

    const called = fromRows(DE4);
    const calledReset = called.find((s) => s.identifier === 'E');
    if (!calledReset) throw new Error('missing reset');
    calledReset.state = 6;
    const byId = new Map(called.map((s) => [String(s.id), s]));
    expect(grandFinalResetVisible(calledReset, byId)).toBe(true);
    expect(layoutElimination(called)[0].columns).toContain('Grand Final Reset');
    expectWellFormed(layoutElimination(called));
  });

  it('drops a dormant reset from round groups and keeps an active one', () => {
    expect(groupByRound(fromRows(DE4)).some((g) => g.title === 'Grand Final Reset')).toBe(false);
    const live = fromRows(DE8);
    const reset = live.find((s) => s.fullRoundText === 'Grand Final Reset');
    if (!reset) throw new Error('missing reset');
    reset.state = 2;
    expect(groupByRound(live).some((g) => g.sets.some((s) => s.id === reset.id))).toBe(true);
  });

  it('understands a Portuguese reset label', () => {
    const sets = fromRows([
      [1, 'A', 1, 'Final de Vencedores', 'seed:1', 'seed:2'],
      [2, 'C', -1, 'Final de Perdedores', 'set:1:2', 'bye'],
      [3, 'B', 2, 'Grande Final', 'set:1:1', 'set:2:1'],
      [4, 'D', 2, 'Reset da Grande Final', 'set:3:1', 'set:3:2'],
    ]);
    expect(layoutElimination(sets)[0].columns).toEqual(['Final de Vencedores', 'Grande Final']);
    const gf = sets.find((s) => s.id === 3);
    if (!gf) throw new Error('missing gf');
    gf.slots[0].entrant = { id: 1, name: 'W' };
    gf.slots[1].entrant = { id: 2, name: 'L' };
    gf.winnerId = 2;
    gf.state = 3;
    const shown = layoutElimination(sets);
    expectWellFormed(shown);
    expect(shown[0].columns).toEqual(['Final de Vencedores', 'Grande Final', 'Reset da Grande Final']);
  });

  it('matches a bracket that never included the reset set', () => {
    const all = fromRows(DE4);
    const stripped = all.filter((s) => s.fullRoundText !== 'Grand Final Reset');
    expect(layoutElimination(all)).toEqual(layoutElimination(stripped));
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
