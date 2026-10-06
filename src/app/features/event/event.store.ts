import { Injectable, computed, inject, signal } from '@angular/core';
import { BracketSet, EventDetail, Id, Phase } from '../../core/api/models';
import { StartggApi } from '../../core/api/startgg-api.service';
import { AuthService } from '../../core/auth.service';
import { eventApiSlug } from '../../core/bracket-url';
import { ToastService } from '../../core/toast.service';
import { errorMessage } from '../../shared/display';

/** start.gg regenerates preview sets ~30 s after a reset or reseed. */
const SYNC_POLL_MS = 5_000;
const SYNC_TIMEOUT_MS = 120_000;

/** State shared by the event page and its tabs. Provided by EventPage. */
@Injectable()
export class EventStore {
  private readonly api = inject(StartggApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly tournamentSlug = signal('');
  readonly eventSlug = signal('');
  readonly event = signal<EventDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Bumped after every successful mutation so open views reload. */
  readonly revision = signal(0);
  /** Phase whose seeding was saved last, so the bracket tab opens on it. */
  readonly seededPhaseId = signal<string | null>(null);
  /** Shown while waiting for start.gg to regenerate a bracket. */
  readonly syncing = signal<string | null>(null);
  /** Set when polling times out; cleared on retry or a new bracketChanged. */
  readonly syncFailed = signal<string | null>(null);
  private syncToken = 0;
  private lastSync: {
    phaseId: Id;
    rebuilt: (sets: BracketSet[]) => boolean;
    waiting: string;
    done: string;
  } | null = null;

  /** start.gg only returns `tournament.admins` to admins, so it doubles as a permission check. */
  readonly canEdit = computed(() => this.auth.hasToken() && !!this.event()?.tournament.admins);
  readonly phases = computed<Phase[]>(() =>
    [...(this.event()?.phases ?? [])].sort((a, b) => (a.phaseOrder ?? 0) - (b.phaseOrder ?? 0)),
  );

  async load(tournamentSlug: string, eventSlug: string): Promise<void> {
    this.tournamentSlug.set(tournamentSlug);
    this.eventSlug.set(eventSlug);
    this.loading.set(true);
    this.error.set(null);
    this.seededPhaseId.set(null);
    try {
      const event = await this.api.event({ slug: eventApiSlug(tournamentSlug, eventSlug) });
      if (!event) throw new Error('Event not found. Check the URL or whether the event is published.');
      this.event.set(event);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  changed(): void {
    this.revision.update((r) => r + 1);
  }

  /** After an attendee add/rename/remove: drop cached entrants and seeds, refetch the event, reload open views. */
  async entrantsChanged(): Promise<void> {
    this.api.invalidate();
    await this.refreshEvent();
    this.changed();
  }

  /** Every set of the phase, across its pools. */
  async phaseSets(phaseId: Id): Promise<BracketSet[]> {
    const phase = this.phases().find((p) => String(p.id) === String(phaseId));
    const groups = phase?.phaseGroups?.nodes ?? [];
    return (await Promise.all(groups.map((g) => this.api.phaseGroupSets(g.id)))).flat();
  }

  /**
   * Call after a seeding save or bracket reset (both clear the API cache): refetches the event and reloads
   * open bracket/set views now, then again once `rebuilt` says start.gg has regenerated the sets.
   */
  async bracketChanged(
    phaseId: Id,
    rebuilt: ((sets: BracketSet[]) => boolean) | null,
    waiting: string,
    done: string,
  ): Promise<void> {
    this.seededPhaseId.set(String(phaseId));
    this.syncFailed.set(null);
    await this.refreshEvent();
    this.changed();
    if (rebuilt) {
      this.lastSync = { phaseId, rebuilt, waiting, done };
      void this.awaitRebuilt(phaseId, rebuilt, waiting, done);
    }
  }

  /** Re-runs the last bracket sync poll after a timeout (e.g. from the Bracket tab). */
  async retrySync(): Promise<void> {
    const sync = this.lastSync;
    if (!sync) return;
    this.syncFailed.set(null);
    this.api.invalidate();
    await this.refreshEvent();
    this.changed();
    void this.awaitRebuilt(sync.phaseId, sync.rebuilt, sync.waiting, sync.done);
  }

  private async awaitRebuilt(
    phaseId: Id,
    rebuilt: (sets: BracketSet[]) => boolean,
    waiting: string,
    done: string,
  ): Promise<void> {
    const token = ++this.syncToken;
    this.syncing.set(waiting);
    const deadline = Date.now() + SYNC_TIMEOUT_MS;
    try {
      while (Date.now() < deadline) {
        if (rebuilt(await this.phaseSets(phaseId))) {
          if (token !== this.syncToken) return;
          await this.refreshEvent();
          this.changed();
          this.toast.ok(done);
          return;
        }
        await new Promise((r) => setTimeout(r, SYNC_POLL_MS));
        if (token !== this.syncToken) return;
        this.api.invalidate();
      }
      const message = 'start.gg has not finished rebuilding the bracket yet. Try again in a moment.';
      this.syncFailed.set(message);
      this.toast.error(message);
    } catch (e) {
      const message = `Could not reload the bracket: ${errorMessage(e)}`;
      this.syncFailed.set(message);
      this.toast.error(message);
    } finally {
      if (token === this.syncToken) this.syncing.set(null);
    }
  }

  private async refreshEvent(): Promise<void> {
    try {
      const event = await this.api.event({ slug: eventApiSlug(this.tournamentSlug(), this.eventSlug()) });
      if (event) this.event.set(event);
    } catch {
      // Keep the previous event; views still reload their sets.
    }
  }
}
