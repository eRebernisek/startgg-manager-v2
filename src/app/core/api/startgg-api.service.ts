import { Injectable, inject } from '@angular/core';
import * as D from './documents';
import {
  BracketSet,
  BracketSetGameDataInput,
  Connection,
  CurrentUser,
  Entrant,
  EventDetail,
  Id,
  Phase,
  Seed,
  SeedMappingInput,
  Tournament,
  User,
  Videogame,
} from './models';
import { StartggClient, StartggError } from './startgg-client';

export interface PlayerProfile {
  id: Id;
  gamerTag: string;
  prefix?: string | null;
  user?: User | null;
  recentStandings?: {
    placement: number;
    container?: { id: Id; name: string; numEntrants?: number; tournament?: { name: string } } | null;
  }[] | null;
}

export interface SetFilterInput {
  state?: number[];
  phaseGroupIds?: Id[];
  phaseIds?: Id[];
  hideEmpty?: boolean;
  showByes?: boolean;
  updatedAfter?: number;
}

/** Complexity budget: SetLight ≈ 20 objects/set with participants; keep perPage ≤ 30. */
const SETS_PER_PAGE = 30;
const SEEDS_PER_PAGE = 32;
const MAX_PAGES = 50;

/** Typed wrappers around every start.gg query/mutation the app uses. */
@Injectable({ providedIn: 'root' })
export class StartggApi {
  private readonly client = inject(StartggClient);

  // ---------- Queries ----------

  async currentUser(): Promise<CurrentUser | null> {
    return (await this.client.request<{ currentUser: CurrentUser | null }>(D.CURRENT_USER, {}, { cacheTtlMs: 30_000 }))
      .currentUser;
  }

  async adminTournaments(page = 1, perPage = 25): Promise<Connection<Tournament>> {
    const data = await this.client.request<{ currentUser: { tournaments: Connection<Tournament> } | null }>(
      D.ADMIN_TOURNAMENTS,
      { page, perPage },
      { cacheTtlMs: 15_000 },
    );
    return data.currentUser?.tournaments ?? { nodes: [] };
  }

  async tournament(slug: string): Promise<Tournament | null> {
    return (
      await this.client.request<{ tournament: Tournament | null }>(D.TOURNAMENT, { slug }, { cacheTtlMs: 30_000 })
    ).tournament;
  }

  async event(ref: { id?: Id; slug?: string }): Promise<EventDetail | null> {
    return (await this.client.request<{ event: EventDetail | null }>(D.EVENT, ref, { cacheTtlMs: 20_000 })).event;
  }

  phaseGroupSets(phaseGroupId: Id, onProgress?: (page: number, total: number) => void): Promise<BracketSet[]> {
    return this.fetchAll(
      SETS_PER_PAGE,
      async (page, perPage) => {
        const data = await this.client.request<{ phaseGroup: { sets: Connection<BracketSet> } | null }>(
          D.PHASE_GROUP_SETS,
          { id: phaseGroupId, page, perPage },
          { cacheTtlMs: page === 1 ? 8_000 : 0 },
        );
        return data.phaseGroup?.sets;
      },
      onProgress,
    );
  }

  phaseGroupSeeds(phaseGroupId: Id): Promise<Seed[]> {
    return this.fetchAll(SEEDS_PER_PAGE, async (page, perPage) => {
      const data = await this.client.request<{ phaseGroup: { seeds: Connection<Seed> } | null }>(
        D.PHASE_GROUP_SEEDS,
        { id: phaseGroupId, page, perPage },
        { cacheTtlMs: 15_000 },
      );
      return data.phaseGroup?.seeds;
    });
  }

  async eventSets(eventId: Id, page: number, perPage: number, filters: SetFilterInput = {}) {
    const data = await this.client.request<{ event: { sets: Connection<BracketSet> } | null }>(D.EVENT_SETS, {
      eventId,
      page,
      perPage,
      filters,
    });
    return data.event?.sets ?? { nodes: [] };
  }

  async set(id: Id): Promise<BracketSet | null> {
    return (await this.client.request<{ set: BracketSet | null }>(D.SET_DETAIL, { id })).set;
  }

  async videogame(id: Id): Promise<Videogame | null> {
    return (
      await this.client.request<{ videogame: Videogame | null }>(D.VIDEOGAME, { id }, { cacheTtlMs: 3_600_000 })
    ).videogame;
  }

  async eventEntrants(eventId: Id, page: number, perPage: number, name?: string) {
    const data = await this.client.request<{ event: { entrants: Connection<Entrant> } | null }>(
      D.EVENT_ENTRANTS,
      { eventId, page, perPage, name: name || null },
    );
    return data.event?.entrants ?? { nodes: [] };
  }

  /**
   * Not cached: the Entrants tab must show adds, renames and removals right away. `name` is omitted when empty
   * because start.gg returns no entrants for `filter: { name: null }`.
   */
  async eventAttendees(eventId: Id, page: number, perPage: number, name?: string) {
    const data = await this.client.request<{ event: { entrants: Connection<Entrant> } | null }>(
      D.EVENT_ATTENDEES,
      { eventId, page, perPage, ...(name ? { name } : {}) },
    );
    return data.event?.entrants ?? { nodes: [] };
  }

  phaseSeeds(phaseId: Id): Promise<Seed[]> {
    return this.fetchAll(64, async (page, perPage) => {
      const data = await this.client.request<{ phase: { seeds: Connection<Seed> } | null }>(D.PHASE_SEEDS, {
        phaseId,
        page,
        perPage,
      });
      return data.phase?.seeds;
    });
  }

  async player(id: Id): Promise<PlayerProfile | null> {
    return (await this.client.request<{ player: PlayerProfile | null }>(D.PLAYER, { id }, { cacheTtlMs: 60_000 }))
      .player;
  }

  async userBySlug(slug: string) {
    const data = await this.client.request<{ user: (User & { player?: { id: Id; gamerTag: string } }) | null }>(
      D.USER_BY_SLUG,
      { slug },
    );
    return data.user;
  }

  // ---------- Mutations (admin token required) ----------

  /** Completes the set with `winnerId`. Optional `gameData` overwrites all games. */
  async reportSet(setId: Id, winnerId: Id, isDQ = false, gameData?: BracketSetGameDataInput[]) {
    const data = await this.client.request<{ reportBracketSet: BracketSet[] }>(
      D.REPORT_BRACKET_SET,
      { setId, winnerId, isDQ, gameData: gameData?.length ? gameData : undefined },
      { isMutation: true },
    );
    this.client.invalidate();
    return data.reportBracketSet;
  }

  /**
   * Updates game data and/or DQ. Pass `winnerId: null` to save scores without completing.
   * Cannot change the winner of a completed set (use resetSet).
   */
  async updateSet(setId: Id, winnerId: Id | null, isDQ = false, gameData?: BracketSetGameDataInput[]) {
    const data = await this.client.request<{ updateBracketSet: BracketSet }>(
      D.UPDATE_BRACKET_SET,
      { setId, winnerId, isDQ, gameData: gameData?.length ? gameData : undefined },
      { isMutation: true },
    );
    this.client.invalidate();
    return data.updateBracketSet;
  }

  async resetSet(setId: Id, resetDependentSets = false) {
    const data = await this.client.request<{ resetSet: BracketSet }>(
      D.RESET_SET,
      { setId, resetDependentSets },
      { isMutation: true },
    );
    this.client.invalidate();
    return data.resetSet;
  }

  async markSetInProgress(setId: Id) {
    const data = await this.client.request<{ markSetInProgress: BracketSet }>(
      D.MARK_SET_IN_PROGRESS,
      { setId },
      { isMutation: true },
    );
    this.client.invalidate();
    return data.markSetInProgress;
  }

  async markSetCalled(setId: Id) {
    const data = await this.client.request<{ markSetCalled: BracketSet }>(
      D.MARK_SET_CALLED,
      { setId },
      { isMutation: true },
    );
    this.client.invalidate();
    return data.markSetCalled;
  }

  async updatePhaseSeeding(phaseId: Id, seedMapping: SeedMappingInput[], strictMode = true) {
    const data = await this.client.request<{ updatePhaseSeeding: { id: Id } | null }>(
      D.UPDATE_PHASE_SEEDING,
      { phaseId, seedMapping, options: { strictMode } },
      { isMutation: true },
    );
    this.client.invalidate();
    if (!data.updatePhaseSeeding) throw new StartggError('start.gg did not update the seeding.', 'graphql');
    return data.updatePhaseSeeding;
  }

  /** Re-saves the phase with its current name/type/pool count, which un-starts its pools and deletes their sets. */
  async regeneratePhase(phase: Pick<Phase, 'id' | 'name' | 'bracketType' | 'groupCount'>) {
    const payload = {
      name: phase.name,
      ...(phase.bracketType ? { bracketType: phase.bracketType } : {}),
      ...(phase.groupCount ? { groupCount: phase.groupCount } : {}),
    };
    const data = await this.client.request<{ upsertPhase: Pick<Phase, 'id' | 'state' | 'phaseGroups'> | null }>(
      D.UPSERT_PHASE,
      { phaseId: phase.id, payload },
      { isMutation: true },
    );
    this.client.invalidate();
    if (!data.upsertPhase) throw new StartggError('start.gg did not reset the bracket.', 'graphql');
    return data.upsertPhase;
  }

  /** Drops cached responses, e.g. while waiting for start.gg to regenerate a bracket. */
  invalidate(): void {
    this.client.invalidate();
  }

  async swapSeeds(phaseId: Id, seed1Id: Id, seed2Id: Id) {
    const data = await this.client.request<{ swapSeeds: Seed[] }>(
      D.SWAP_SEEDS,
      { phaseId, seed1Id, seed2Id },
      { isMutation: true },
    );
    this.client.invalidate();
    return data.swapSeeds;
  }

  /**
   * Registers an existing start.gg user into events. Uses the "on behalf of user" token flow;
   * start.gg may restrict this to approved apps, so callers must handle permission errors.
   */
  async registerUser(userId: Id, eventIds: Id[]) {
    const registration = { eventIds };
    const { generateRegistrationToken: registrationToken } = await this.client.request<{
      generateRegistrationToken: string;
    }>(D.GENERATE_REGISTRATION_TOKEN, { registration, userId }, { isMutation: true });
    return (
      await this.client.request<{ registerForTournament: { id: Id; gamerTag: string } | null }>(
        D.REGISTER_FOR_TOURNAMENT,
        { registration, registrationToken },
        { isMutation: true },
      )
    ).registerForTournament;
  }

  // ---------- Helpers ----------

  /**
   * Fetches every page. First page establishes totalPages; remaining pages run in parallel
   * through the rate-limited client. On complexity errors, halves perPage and retries.
   */
  private async fetchAll<T>(
    perPage: number,
    fetchPage: (page: number, perPage: number) => Promise<Connection<T> | null | undefined>,
    onProgress?: (page: number, total: number) => void,
  ): Promise<T[]> {
    let size = perPage;
    for (;;) {
      try {
        const first = await fetchPage(1, size);
        const totalPages = Math.min(first?.pageInfo?.totalPages ?? 1, MAX_PAGES);
        onProgress?.(1, totalPages);
        const all = [...(first?.nodes ?? [])];
        if (totalPages <= 1) return all;

        const rest = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, i) => {
            const page = i + 2;
            return fetchPage(page, size).then((conn) => {
              onProgress?.(page, totalPages);
              return conn?.nodes ?? [];
            });
          }),
        );
        for (const nodes of rest) all.push(...nodes);
        return all;
      } catch (e) {
        if (e instanceof StartggError && e.kind === 'complexity' && size > 8) {
          size = Math.floor(size / 2);
          continue;
        }
        throw e;
      }
    }
  }
}
