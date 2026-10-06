import { Dialog } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BracketSet, EventDetail, Phase, SetState } from '../../core/api/models';
import { StartggApi } from '../../core/api/startgg-api.service';
import { StartggError } from '../../core/api/startgg-client';
import { ToastService } from '../../core/toast.service';
import { EventStore } from '../event/event.store';
import { BracketPage } from './bracket.page';

const preview = (id: string): BracketSet => ({
  id,
  round: 1,
  state: SetState.Created,
  slots: [{ entrant: { id: 1, name: 'A' } }, { entrant: { id: 2, name: 'B' } }],
});

describe('BracketPage start bracket', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let store: Record<string, unknown> & {
    bracketChanged: ReturnType<typeof vi.fn>;
    syncing: ReturnType<typeof signal<string | null>>;
    syncFailed: ReturnType<typeof signal<string | null>>;
    retrySync: ReturnType<typeof vi.fn>;
  };
  let toast: { ok: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };

  async function setup(poolState: number): Promise<ComponentFixture<BracketPage>> {
    const phase: Phase = {
      id: 2173645,
      name: 'Bracket',
      bracketType: 'DOUBLE_ELIMINATION',
      phaseGroups: { nodes: [{ id: 3162844, state: poolState, bracketType: 'DOUBLE_ELIMINATION' }] },
    };
    store = {
      event: signal({ id: 1 } as EventDetail),
      phases: signal([phase]),
      canEdit: () => true,
      revision: signal(0),
      seededPhaseId: signal(null),
      bracketChanged: vi.fn().mockResolvedValue(undefined),
      syncing: signal<string | null>(null),
      syncFailed: signal<string | null>(null),
      retrySync: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [BracketPage],
      providers: [
        provideRouter([]),
        { provide: StartggApi, useValue: api },
        { provide: EventStore, useValue: store },
        { provide: ToastService, useValue: toast },
        { provide: Dialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(BracketPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const button = (f: ComponentFixture<BracketPage>) =>
    [...(f.nativeElement as HTMLElement).querySelectorAll('button')].find((b) =>
      /Start bracket|Running|Starting/.test(b.textContent ?? ''),
    )!;

  beforeEach(() => {
    api = {
      phaseGroupSets: vi.fn().mockResolvedValue([preview('preview_3162844_1_0'), preview('preview_3162844_1_1')]),
      phaseGroupSeeds: vi.fn().mockResolvedValue([]),
      markSetCalled: vi.fn().mockResolvedValue({ id: 108599537, state: SetState.Called, slots: [] }),
      resetSet: vi.fn().mockResolvedValue({ id: 108599537, state: SetState.Created }),
    };
    toast = { ok: vi.fn(), error: vi.fn() };
    dialog = { open: vi.fn(() => ({ closed: of(true) })) };
  });

  it('shows a disabled "Running" button when the pool is started', async () => {
    const f = await setup(2);
    expect(button(f).textContent?.trim()).toBe('Running');
    expect(button(f).disabled).toBe(true);
  });

  it('confirms, starts via the first preview set, clears the call and waits for the real sets', async () => {
    const f = await setup(1);
    const b = button(f);
    expect(b.textContent?.trim()).toBe('Start bracket');
    expect(b.disabled).toBe(false);

    b.click();
    await f.whenStable();

    expect(dialog.open.mock.calls[0]![1].data).toEqual({ poolName: 'Bracket', setCount: 2 });
    expect(api['markSetCalled']).toHaveBeenCalledWith('preview_3162844_1_0');
    expect(api['resetSet']).toHaveBeenCalledWith(108599537, false);
    expect(toast.ok).toHaveBeenCalledWith('Bracket started');
    const [phaseId, ready] = store.bracketChanged.mock.calls[0]! as [number, (s: BracketSet[]) => boolean];
    expect(phaseId).toBe(2173645);
    expect(ready([preview('preview_3162844_1_0')])).toBe(false);
    expect(ready([{ ...preview('x'), id: 108599537 }])).toBe(true);
  });

  it('keeps the bracket visible while start.gg returns empty sets during a rebuild', async () => {
    const f = await setup(1);
    await f.whenStable();
    expect(f.componentInstance['displaySets']().length).toBe(2);

    store.syncing.set('Rebuilding…');
    api['phaseGroupSets']!.mockResolvedValue([]);
    await f.componentInstance['load']('3162844');
    f.detectChanges();

    expect(f.componentInstance['sets']().length).toBe(2);
    expect(f.componentInstance['displaySets']().length).toBe(2);
    expect((f.nativeElement as HTMLElement).querySelector('.rebuild-banner')?.textContent).toContain('Rebuilding');
  });

  it('clears the canvas when switching phase so the previous pool is not shown', async () => {
    const phase2: Phase = {
      id: 2365688,
      name: 'Round 2',
      bracketType: 'DOUBLE_ELIMINATION',
      phaseGroups: {
        nodes: [
          { id: 9990001, displayIdentifier: 'A1', state: 2, bracketType: 'DOUBLE_ELIMINATION' },
          { id: 9990002, displayIdentifier: 'B1', state: 2, bracketType: 'DOUBLE_ELIMINATION' },
        ],
      },
    };
    const f = await setup(1);
    await f.whenStable();
    expect(f.componentInstance['displaySets']().length).toBe(2);

    (store['phases'] as ReturnType<typeof signal<Phase[]>>).set([
      {
        id: 2173645,
        name: 'Bracket',
        bracketType: 'DOUBLE_ELIMINATION',
        phaseGroups: { nodes: [{ id: 3162844, state: 1, bracketType: 'DOUBLE_ELIMINATION', displayIdentifier: 'A1' }] },
      },
      phase2,
    ]);
    f.detectChanges();

    api['phaseGroupSets']!.mockImplementation(
      () => new Promise<BracketSet[]>(() => undefined), // hang — stay on loading
    );
    f.componentInstance['onPhaseChange']('2365688');
    f.detectChanges();

    expect(f.componentInstance['phaseId']()).toBe('2365688');
    expect(f.componentInstance['groupId']()).toBe('9990001'); // same pool letter A1
    expect(f.componentInstance['displaySets']().length).toBe(0);
    expect(f.componentInstance['loading']()).toBe(true);
    expect((f.nativeElement as HTMLElement).querySelector('.spinner')).toBeTruthy();
  });

  it('does nothing when the dialog is cancelled', async () => {
    dialog.open.mockReturnValue({ closed: of(false) });
    const f = await setup(1);
    button(f).click();
    await f.whenStable();
    expect(api['markSetCalled']).not.toHaveBeenCalled();
  });

  it("shows start.gg's exact error", async () => {
    api['markSetCalled']!.mockRejectedValue(new StartggError('You do not have permission to edit this set', 'permission'));
    const f = await setup(1);
    button(f).click();
    await f.whenStable();
    f.detectChanges();
    const message = 'Bracket not started: You do not have permission to edit this set';
    expect(toast.error).toHaveBeenCalledWith(message);
    expect((f.nativeElement as HTMLElement).querySelector('.alert.error')?.textContent).toContain(message);
    expect(button(f).textContent?.trim()).toBe('Start bracket');
  });
});
