import { TestBed } from '@angular/core/testing';
import { BracketSet, SetState } from '../../core/api/models';
import { StartggApi } from '../../core/api/startgg-api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { EventStore } from './event.store';

const preview = (id: string): BracketSet => ({ id, state: SetState.Created, slots: [] });

describe('EventStore bracket sync', () => {
  let store: EventStore;
  let api: {
    invalidate: ReturnType<typeof vi.fn>;
    event: ReturnType<typeof vi.fn>;
    phaseGroupSets: ReturnType<typeof vi.fn>;
  };
  let toast: { ok: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let hasToken: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    hasToken = vi.fn(() => true);
    api = {
      invalidate: vi.fn(),
      event: vi.fn().mockResolvedValue({
        id: 1,
        phases: [{ id: 10, phaseOrder: 1, phaseGroups: { nodes: [{ id: 20 }] } }],
      }),
      phaseGroupSets: vi.fn(),
    };
    toast = { ok: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        EventStore,
        { provide: StartggApi, useValue: api },
        { provide: AuthService, useValue: { hasToken } },
        { provide: ToastService, useValue: toast },
      ],
    });
    store = TestBed.inject(EventStore);
    store.tournamentSlug.set('t');
    store.eventSlug.set('e');
    store.event.set({
      id: 1,
      name: 'Event',
      tournament: { id: 1, name: 'T', slug: 't' },
      phases: [{ id: 10, phaseOrder: 1, phaseGroups: { nodes: [{ id: 20 }] } }],
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls until rebuilt, then refreshes and clears syncing', async () => {
    const rebuilt = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    api.phaseGroupSets.mockResolvedValue([preview('preview_1_1_0')]);

    await store.bracketChanged(10, rebuilt, 'waiting', 'done');
    expect(store.syncing()).toBe('waiting');

    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(rebuilt).toHaveBeenCalledTimes(2);
    expect(toast.ok).toHaveBeenCalledWith('done');
    expect(store.syncing()).toBeNull();
    expect(store.syncFailed()).toBeNull();
  });

  it('sets syncFailed on timeout and retrySync runs another poll cycle', async () => {
    const rebuilt = vi.fn().mockReturnValue(false);
    api.phaseGroupSets.mockResolvedValue([]);

    void store.bracketChanged(10, rebuilt, 'waiting', 'done');
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(120_000);
    await Promise.resolve();

    expect(store.syncFailed()).toContain('rebuilding');
    expect(toast.error).toHaveBeenCalled();

    rebuilt.mockReturnValueOnce(true);
    api.phaseGroupSets.mockResolvedValue([preview('preview_1_1_0')]);
    void store.retrySync();
    expect(store.syncFailed()).toBeNull();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(toast.ok).toHaveBeenCalledWith('done');
  });

  it('distinguishes no-token vs token-not-admin in readOnlyReason', () => {
    hasToken.mockReturnValue(false);
    expect(store.readOnlyReason()).toMatch(/Settings/);
    hasToken.mockReturnValue(true);
    expect(store.readOnlyReason()).toMatch(/not an admin/);
  });
});
