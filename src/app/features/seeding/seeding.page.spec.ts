import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { BracketSet, Phase, Seed, SetState } from '../../core/api/models';
import { StartggApi } from '../../core/api/startgg-api.service';
import { StartggError } from '../../core/api/startgg-client';
import { ToastService } from '../../core/toast.service';
import { EventStore } from '../event/event.store';
import { SeedingPage } from './seeding.page';

const seed = (id: number, seedNum: number, name: string): Seed => ({
  id,
  seedNum,
  phaseGroup: { id: 3162844 },
  entrant: { id: id + 1000, name },
});

const ORIGINAL = [seed(1, 1, 'A'), seed(2, 2, 'B'), seed(3, 3, 'C')];
const STARTED: Partial<Phase> = { state: 'ACTIVE', phaseGroups: { nodes: [{ id: 3162844, state: 2 }] } };
const CREATED: Partial<Phase> = { state: 'ACTIVE', phaseGroups: { nodes: [{ id: 3162844, state: 1 }] } };

const set = (id: number, state: SetState, prereqs: number[] = []): BracketSet => ({
  id,
  state,
  round: 1,
  slots: prereqs.map((p) => ({ prereqType: 'set', prereqId: String(p) })),
});

interface PageInternals {
  seeds: () => Seed[];
  dirty: () => boolean;
  error: () => string | null;
  started: () => boolean;
  drop(e: { previousIndex: number; currentIndex: number }): void;
  save(): Promise<void>;
  resetBracket(): Promise<void>;
}

describe('SeedingPage', () => {
  let api: {
    phaseSeeds: ReturnType<typeof vi.fn>;
    updatePhaseSeeding: ReturnType<typeof vi.fn>;
    resetSet: ReturnType<typeof vi.fn>;
    regeneratePhase: ReturnType<typeof vi.fn>;
  };
  let store: {
    phases: ReturnType<typeof signal<Phase[]>>;
    canEdit: () => boolean;
    phaseSets: ReturnType<typeof vi.fn>;
    bracketChanged: ReturnType<typeof vi.fn>;
  };
  let toast: { ok: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };

  async function setup(phase: Partial<Phase> = {}): Promise<PageInternals> {
    store.phases.set([{ id: 2173645, name: 'Bracket', ...phase }]);
    TestBed.configureTestingModule({
      imports: [SeedingPage],
      providers: [
        { provide: StartggApi, useValue: api },
        { provide: EventStore, useValue: store },
        { provide: ToastService, useValue: toast },
        { provide: Dialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(SeedingPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.componentInstance as unknown as PageInternals;
  }

  beforeEach(() => {
    api = {
      phaseSeeds: vi.fn().mockResolvedValue(ORIGINAL),
      updatePhaseSeeding: vi.fn(),
      resetSet: vi.fn().mockResolvedValue({}),
      regeneratePhase: vi.fn().mockResolvedValue({ id: 2173645, phaseGroups: { nodes: [{ id: 3162844, state: 1 }] } }),
    };
    store = {
      phases: signal<Phase[]>([]),
      canEdit: () => true,
      phaseSets: vi.fn().mockResolvedValue([set(10, SetState.Created)]),
      bracketChanged: vi.fn().mockResolvedValue(undefined),
    };
    toast = { ok: vi.fn(), error: vi.fn() };
    dialog = { open: vi.fn(() => ({ closed: of(true) })) };
  });

  describe('save', () => {
    it('sends seed IDs in the new order, confirms with a refetch, toasts and waits for the new bracket', async () => {
      const page = await setup(CREATED);
      page.drop({ previousIndex: 2, currentIndex: 0 });
      expect(page.dirty()).toBe(true);

      const saved = [seed(3, 1, 'C'), seed(1, 2, 'A'), seed(2, 3, 'B')];
      api.updatePhaseSeeding.mockResolvedValue({ id: 2173645 });
      api.phaseSeeds.mockResolvedValue(saved);
      await page.save();

      expect(api.updatePhaseSeeding).toHaveBeenCalledWith(
        '2173645',
        [
          { seedId: 3, seedNum: 1, phaseGroupId: 3162844 },
          { seedId: 1, seedNum: 2, phaseGroupId: 3162844 },
          { seedId: 2, seedNum: 3, phaseGroupId: 3162844 },
        ],
        true,
      );
      expect(toast.ok).toHaveBeenCalledWith('Seeding saved');
      expect(store.bracketChanged).toHaveBeenCalledWith('2173645', expect.any(Function), expect.any(String), expect.any(String));
      const rebuilt = store.bracketChanged.mock.calls[0]![1] as (sets: BracketSet[]) => boolean;
      expect(rebuilt([set(10, SetState.Created)])).toBe(false);
      expect(rebuilt([{ ...set(10, SetState.Created), slots: [{ entrant: { id: 1003, name: 'C' } }] }])).toBe(true);
      expect(page.seeds().map((s) => s.id)).toEqual([3, 1, 2]);
      expect(page.dirty()).toBe(false);
      expect(page.error()).toBeNull();
    });

    it("shows start.gg's reason when the bracket has started", async () => {
      const page = await setup(STARTED);
      expect(page.started()).toBe(true);
      page.drop({ previousIndex: 2, currentIndex: 0 });
      api.updatePhaseSeeding.mockRejectedValue(new StartggError('Cannot modify seeds in started pools', 'graphql'));
      await page.save();

      const message =
        'Bracket already started — use Reset bracket to reseed. (start.gg: Cannot modify seeds in started pools)';
      expect(toast.ok).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(message);
      expect(page.error()).toBe(message);
      expect(store.bracketChanged).not.toHaveBeenCalled();
      expect(page.dirty()).toBe(true);
    });

    it('reports an error when start.gg returns success but keeps the old order', async () => {
      const page = await setup(CREATED);
      page.drop({ previousIndex: 2, currentIndex: 0 });
      api.updatePhaseSeeding.mockResolvedValue({ id: 2173645 });
      await page.save();

      expect(toast.ok).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/kept a different order/));
      expect(store.bracketChanged).not.toHaveBeenCalled();
    });
  });

  describe('reset then reseed', () => {
    it('confirms in a dialog naming the reported sets, resets dependents first, then lets the seeding save', async () => {
      // 10 → 11 → 12 (grand final); 12 is reported last, so it must be reset first.
      store.phaseSets.mockResolvedValue([
        set(10, SetState.Completed),
        set(11, SetState.Completed, [10]),
        set(12, SetState.InProgress, [11]),
        set(13, SetState.Created, [12]),
      ]);
      const page = await setup(STARTED);
      await page.resetBracket();

      expect(dialog.open.mock.calls[0]![1].data).toEqual({ total: 4, reported: 2, inProgress: 1, phaseName: 'Bracket' });
      expect(api.resetSet.mock.calls.map((c) => c[0])).toEqual([12, 11, 10]);
      expect(api.regeneratePhase).toHaveBeenCalledWith(expect.objectContaining({ id: 2173645, name: 'Bracket' }));
      expect(api.resetSet.mock.invocationCallOrder.at(-1)!).toBeLessThan(
        api.regeneratePhase.mock.invocationCallOrder[0]!,
      );
      expect(toast.ok).toHaveBeenCalledWith('Bracket reset — reorder the seeds and save');
      expect(store.bracketChanged).toHaveBeenCalled();
      expect(page.error()).toBeNull();

      // start.gg now reports the pool as created, so the reseed goes through.
      store.phases.set([{ id: 2173645, name: 'Bracket', ...CREATED }]);
      expect(page.started()).toBe(false);
      page.drop({ previousIndex: 2, currentIndex: 0 });
      api.updatePhaseSeeding.mockResolvedValue({ id: 2173645 });
      api.phaseSeeds.mockResolvedValue([seed(3, 1, 'C'), seed(1, 2, 'A'), seed(2, 3, 'B')]);
      await page.save();
      expect(toast.ok).toHaveBeenCalledWith('Seeding saved');
      expect(page.error()).toBeNull();
    });

    it('does nothing when the dialog is cancelled', async () => {
      store.phaseSets.mockResolvedValue([set(10, SetState.Completed)]);
      dialog.open.mockReturnValue({ closed: of(false) });
      const page = await setup(STARTED);
      await page.resetBracket();

      expect(api.resetSet).not.toHaveBeenCalled();
      expect(api.regeneratePhase).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("shows start.gg's exact reason when a reset fails", async () => {
      store.phaseSets.mockResolvedValue([{ ...set(10, SetState.Completed), fullRoundText: 'Grand Final' }]);
      api.resetSet.mockRejectedValue(new StartggError('You do not have permission to reset this set', 'permission'));
      const page = await setup(STARTED);
      await page.resetBracket();

      const message = 'Bracket not reset: Could not reset Grand Final: You do not have permission to reset this set';
      expect(toast.error).toHaveBeenCalledWith(message);
      expect(page.error()).toBe(message);
      expect(api.regeneratePhase).not.toHaveBeenCalled();
    });

    it('reports when start.gg keeps the pool started', async () => {
      api.regeneratePhase.mockResolvedValue({ id: 2173645, phaseGroups: { nodes: [{ id: 3162844, state: 2 }] } });
      const page = await setup(STARTED);
      await page.resetBracket();

      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/^Bracket not reset: start.gg kept 1 pool/));
      expect(store.bracketChanged).not.toHaveBeenCalled();
    });
  });
});
