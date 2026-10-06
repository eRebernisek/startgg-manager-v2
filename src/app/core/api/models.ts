/** start.gg returns numeric IDs, except un-started "preview" sets (e.g. "preview_3162844_1_0"). */
export type Id = string | number;

export interface Image {
  url: string;
  type?: string | null;
}

export interface PageInfo {
  total?: number | null;
  totalPages?: number | null;
}

export interface Connection<T> {
  pageInfo?: PageInfo | null;
  nodes: T[] | null;
}

export interface Player {
  id: Id;
  gamerTag: string;
  prefix?: string | null;
}

export interface Location {
  country?: string | null;
  state?: string | null;
  city?: string | null;
}

export interface User {
  id: Id;
  slug?: string | null;
  name?: string | null;
  genderPronoun?: string | null;
  location?: Location | null;
  images?: Image[] | null;
  authorizations?: { type?: string | null; externalUsername?: string | null }[] | null;
  player?: Player | null;
}

export interface Participant {
  id?: Id;
  gamerTag?: string | null;
  prefix?: string | null;
  player?: Player | null;
  user?: User | null;
}

export interface Entrant {
  id: Id;
  name: string;
  initialSeedNum?: number | null;
  isDisqualified?: boolean | null;
  participants?: Participant[] | null;
}

export interface SetSlot {
  id?: string | null;
  prereqType?: string | null;
  prereqId?: string | null;
  prereqPlacement?: number | null;
  entrant?: Entrant | null;
  standing?: {
    placement?: number | null;
    stats?: { score?: { value?: number | null } | null } | null;
  } | null;
}

export interface Character {
  id: Id;
  name: string;
  images?: Image[] | null;
}

export interface Stage {
  id: Id;
  name: string;
}

export type BracketType =
  | 'SINGLE_ELIMINATION'
  | 'DOUBLE_ELIMINATION'
  | 'ROUND_ROBIN'
  | 'SWISS'
  | 'EXHIBITION'
  | 'CUSTOM_SCHEDULE'
  | 'MATCHMAKING'
  | 'ELIMINATION_ROUNDS'
  | 'RACE'
  | 'CIRCUIT';

/** Numeric set states used by start.gg (`ActivityState` ids). */
export enum SetState {
  Created = 1,
  InProgress = 2,
  Completed = 3,
  Ready = 4,
  Invalid = 5,
  Called = 6,
  Queued = 7,
}

export interface PhaseGroupRef {
  id: Id;
  displayIdentifier?: string | null;
  bracketType?: BracketType | null;
  state?: number | null;
}

/** A single game within a set (from the API). */
export interface SetGame {
  id?: Id;
  orderNum?: number | null;
  winnerId?: number | null;
  entrant1Score?: number | null;
  entrant2Score?: number | null;
  selections?: {
    entrant?: { id: Id } | null;
    character?: { id: Id; name?: string | null; images?: Image[] | null } | null;
  }[] | null;
}

/** Input for `reportBracketSet` / `updateBracketSet` `gameData`. */
export interface BracketSetGameDataInput {
  gameNum: number;
  winnerId?: Id | null;
  entrant1Score?: number | null;
  entrant2Score?: number | null;
  stageId?: Id | null;
  selections?: { entrantId: Id; characterId?: number | null }[] | null;
}

export interface BracketSet {
  id: Id;
  identifier?: string | null;
  round?: number | null;
  fullRoundText?: string | null;
  state: number;
  winnerId?: number | null;
  totalGames?: number | null;
  startedAt?: number | null;
  completedAt?: number | null;
  phaseGroup?: (PhaseGroupRef & { phase?: { id: Id; name: string } | null }) | null;
  slots: SetSlot[];
  stream?: { streamName?: string | null } | null;
  station?: { number?: number | null } | null;
  games?: SetGame[] | null;
}

export interface Phase {
  id: Id;
  name: string;
  bracketType?: BracketType | null;
  numSeeds?: number | null;
  phaseOrder?: number | null;
  groupCount?: number | null;
  state?: string | null;
  phaseGroups?: Connection<PhaseGroupRef> | null;
}

export interface Videogame {
  id: Id;
  name: string;
  displayName?: string | null;
  images?: Image[] | null;
  characters?: Character[] | null;
  stages?: Stage[] | null;
}

export interface EventSummary {
  id: Id;
  name: string;
  slug: string;
  state?: string | null;
  numEntrants?: number | null;
  startAt?: number | null;
  videogame?: Videogame | null;
}

export interface Tournament {
  id: Id;
  name: string;
  slug: string;
  startAt?: number | null;
  endAt?: number | null;
  city?: string | null;
  countryCode?: string | null;
  images?: Image[] | null;
  /** `null` when the current token is not an admin of the tournament. */
  admins?: { id: Id }[] | null;
  events?: EventSummary[] | null;
}

export interface EventDetail extends EventSummary {
  teamRosterSize?: { maxPlayers?: number | null } | null;
  tournament: Tournament;
  phases: Phase[] | null;
}

export interface Seed {
  id: Id;
  seedNum: number;
  groupSeedNum?: number | null;
  phaseGroup?: PhaseGroupRef | null;
  entrant?: Entrant | null;
}

export interface CurrentUser {
  id: Id;
  slug?: string | null;
  name?: string | null;
  player?: Player | null;
  images?: Image[] | null;
}

export interface SeedMappingInput {
  seedId: Id;
  seedNum: Id;
  phaseGroupId?: Id;
}
