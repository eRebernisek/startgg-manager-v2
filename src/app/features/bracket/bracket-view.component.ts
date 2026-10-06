import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BracketSet, BracketType, Entrant, Id, Seed } from '../../core/api/models';
import {
  BracketEdge,
  BracketSide,
  bracketViewMode,
  groupByRound,
  layoutElimination,
  roundRobinTable,
} from '../../core/bracket-layout';
import { EntrantChipComponent } from '../../shared/entrant-chip.component';
import { SetBoxComponent } from '../sets/set-box.component';

const W = 210;
const H = 56;
const GAP_X = 44;
const GAP_Y = 14;
const HEADER = 30;

interface RenderedSide {
  side: BracketSide;
  width: number;
  height: number;
  boxes: { set: BracketSet; left: number; top: number }[];
  paths: string[];
}

@Component({
  selector: 'app-bracket-view',
  imports: [NgTemplateOutlet, SetBoxComponent, EntrantChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bracket-view.component.html',
  styleUrl: './bracket-view.component.scss',
})
export class BracketViewComponent {
  readonly sets = input.required<BracketSet[]>();
  readonly seeds = input<Seed[]>([]);
  readonly bracketType = input<BracketType | null | undefined>(null);
  readonly selectSet = output<Id>();

  protected readonly W = W;
  protected readonly H = H;
  protected readonly COL = W + GAP_X;

  protected readonly entrants = computed(() => {
    const map = new Map<string, Entrant>();
    for (const s of this.seeds()) if (s.entrant) map.set(String(s.entrant.id), s.entrant);
    return map;
  });

  protected readonly mode = computed(() => bracketViewMode(this.sets(), this.bracketType()));

  protected readonly sides = computed<RenderedSide[]>(() =>
    this.mode() === 'elimination' ? layoutElimination(this.sets()).map(render) : [],
  );
  protected readonly rounds = computed(() => groupByRound(this.sets()));
  protected readonly table = computed(() =>
    this.mode() === 'round-robin' ? roundRobinTable(this.sets(), this.seeds()) : [],
  );
}

/** Vertical center of a set-box row (0 = top entrant / winner path, 1 = bottom / loser path). */
function rowY(top: number, row: 0 | 1): number {
  return top + (row === 0 ? H * 0.28 : H * 0.72);
}

function connectorPath(
  edge: BracketEdge,
  pos: Map<string, { left: number; top: number }>,
): string[] {
  const a = pos.get(edge.from);
  const b = pos.get(edge.to);
  if (!a || !b) return [];
  const x1 = a.left + W;
  const y1 = rowY(a.top, edge.fromPlacement === 2 ? 1 : 0);
  const x2 = b.left;
  const y2 = rowY(b.top, edge.toSlot === 1 ? 1 : 0);
  const mid = x2 - GAP_X / 2;
  return [`M${x1} ${y1}H${mid}V${y2}H${x2}`];
}

function render(side: BracketSide): RenderedSide {
  const pos = new Map<string, { left: number; top: number }>();
  const boxes = side.sets.map(({ set, col, y }) => {
    const p = { left: col * (W + GAP_X), top: HEADER + y * (H + GAP_Y) };
    pos.set(String(set.id), p);
    return { set, ...p };
  });
  const paths = side.edges.flatMap((edge) => connectorPath(edge, pos));
  return {
    side,
    boxes,
    paths,
    width: side.columns.length * (W + GAP_X) - GAP_X,
    height: HEADER + side.height * (H + GAP_Y),
  };
}
