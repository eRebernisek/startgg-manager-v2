import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BracketSet, Entrant } from '../../core/api/models';
import { isDQSlot, sameId } from '../../core/bracket-layout';
import { EntrantChipComponent } from '../../shared/entrant-chip.component';
import { setStateClass } from '../../shared/display';

/** Two-row set card used by the bracket and the set list. */
@Component({
  selector: 'app-set-box',
  imports: [EntrantChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (set().identifier) {
      <span class="ident">{{ set().identifier }}</span>
    }
    @for (row of rows(); track $index) {
      <div class="slot" [class.win]="row.win" [class.lose]="row.lose">
        <app-entrant-chip [entrant]="row.entrant" [placeholder]="row.placeholder" [size]="20" />
        @if (row.dq) {
          <span class="result dq" title="Disqualified">DQ</span>
        }
        @if (row.win) {
          <span class="result w" title="Winner">W</span>
        } @else if (row.lose && !row.dq) {
          <span class="result l">L</span>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: center;
      background: var(--surface-2);
      border: 1px solid var(--line);
      border-left: 3px solid var(--state, transparent);
      border-radius: 6px;
      overflow: hidden;
      font-size: 0.85rem;
      cursor: pointer;
    }
    :host(:hover) {
      border-color: var(--accent-2);
    }
    .ident {
      position: absolute;
      top: 50%;
      left: -1px;
      transform: translate(-100%, -50%);
      padding-right: 4px;
      color: var(--muted);
      font-size: 0.7rem;
    }
    .slot {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.35rem 0.25rem 0.45rem;
      min-width: 0;
    }
    .slot + .slot {
      border-top: 1px solid var(--line);
    }
    app-entrant-chip {
      flex: 1;
      min-width: 0;
    }
    .win app-entrant-chip {
      font-weight: 700;
    }
    .result {
      flex: none;
      min-width: 1.3rem;
      padding: 0.05rem 0.3rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 800;
      text-align: center;
      background: var(--surface-3);
    }
    .result.w {
      background: var(--accent);
      color: #fff;
    }
    .result.dq {
      background: var(--danger);
      color: #fff;
    }
    .lose {
      opacity: 0.5;
    }
  `,
  host: { '[class]': 'stateClass()' },
})
export class SetBoxComponent {
  readonly set = input.required<BracketSet>();
  /** Richer entrant data (avatars) keyed by entrant id, e.g. from phase group seeds. */
  readonly entrants = input<Map<string, Entrant> | null>(null);

  protected readonly stateClass = computed(() => setStateClass(this.set()));
  protected readonly rows = computed(() => {
    const s = this.set();
    const done = s.winnerId != null;
    return [0, 1].map((i) => {
      const slot = s.slots[i];
      const base = slot?.entrant;
      const entrant = base ? (this.entrants()?.get(String(base.id)) ?? base) : null;
      const win = done && sameId(s.winnerId, base?.id);
      return {
        entrant,
        placeholder: slot?.prereqType === 'bye' ? 'bye' : 'TBD',
        win,
        lose: done && !win,
        dq: isDQSlot(slot),
      };
    });
  });
}
