/**
 * All GraphQL documents used by the app. Every document is validated against
 * schema/startgg.graphql in documents.spec.ts, so keep them as plain strings.
 *
 * start.gg rejects requests above 1000 objects, so list queries use light
 * fragments and paginate; heavy data (full entrant info) is fetched per set.
 */
const gql = String.raw;

const PARTICIPANT = gql`
  fragment ParticipantInfo on Participant {
    id
    gamerTag
    prefix
    player {
      id
      gamerTag
      prefix
    }
    user {
      id
      slug
      name
      genderPronoun
      location {
        country
        state
        city
      }
      images(type: "profile") {
        url
        type
      }
      authorizations(types: [TWITTER]) {
        type
        externalUsername
      }
    }
  }
`;

const ENTRANT = gql`
  fragment EntrantInfo on Entrant {
    id
    name
    initialSeedNum
    isDisqualified
    participants {
      ...ParticipantInfo
    }
  }
  ${PARTICIPANT}
`;

const SET_LIGHT = gql`
  fragment SetLight on Set {
    id
    identifier
    round
    fullRoundText
    state
    winnerId
    totalGames
    startedAt
    completedAt
    slots(includeByes: true) {
      id
      prereqType
      prereqId
      prereqPlacement
      entrant {
        id
        name
        participants {
          id
          gamerTag
          prefix
          user {
            id
            images(type: "profile") {
              url
              type
            }
          }
        }
      }
      standing {
        placement
        stats {
          score {
            value
          }
        }
      }
    }
  }
`;

export const CURRENT_USER = gql`
  query CurrentUser {
    currentUser {
      id
      slug
      name
      player {
        id
        gamerTag
        prefix
      }
      images(type: "profile") {
        url
        type
      }
    }
  }
`;

/** Root `tournaments(filter: { isCurrentUserAdmin: true })` returns nothing; `tournamentView: "admin"` works. */
export const ADMIN_TOURNAMENTS = gql`
  query AdminTournaments($page: Int!, $perPage: Int!) {
    currentUser {
      id
      tournaments(query: { page: $page, perPage: $perPage, filter: { tournamentView: "admin" } }) {
        pageInfo {
          total
          totalPages
        }
        nodes {
          id
          name
          slug
          startAt
          endAt
          city
          countryCode
          images {
            url
            type
          }
        }
      }
    }
  }
`;

export const TOURNAMENT = gql`
  query Tournament($slug: String!) {
    tournament(slug: $slug) {
      id
      name
      slug
      startAt
      endAt
      city
      countryCode
      images {
        url
        type
      }
      admins {
        id
      }
      events {
        id
        name
        slug
        state
        numEntrants
        startAt
        videogame {
          id
          name
          displayName
          images {
            url
            type
          }
        }
      }
    }
  }
`;

export const EVENT = gql`
  query Event($id: ID, $slug: String) {
    event(id: $id, slug: $slug) {
      id
      name
      slug
      state
      numEntrants
      startAt
      teamRosterSize {
        maxPlayers
      }
      videogame {
        id
        name
        displayName
      }
      tournament {
        id
        name
        slug
        images {
          url
          type
        }
        admins {
          id
        }
      }
      phases {
        id
        name
        bracketType
        numSeeds
        phaseOrder
        groupCount
        state
        phaseGroups(query: { page: 1, perPage: 100 }) {
          nodes {
            id
            displayIdentifier
            bracketType
            state
          }
        }
      }
    }
  }
`;

export const PHASE_GROUP_SETS = gql`
  query PhaseGroupSets($id: ID!, $page: Int!, $perPage: Int!) {
    phaseGroup(id: $id) {
      id
      sets(
        page: $page
        perPage: $perPage
        sortType: ROUND
        filters: { showByes: true, hideEmpty: false }
      ) {
        pageInfo {
          total
          totalPages
        }
        nodes {
          ...SetLight
        }
      }
    }
  }
  ${SET_LIGHT}
`;

export const PHASE_GROUP_SEEDS = gql`
  query PhaseGroupSeeds($id: ID!, $page: Int!, $perPage: Int!) {
    phaseGroup(id: $id) {
      id
      seeds(query: { page: $page, perPage: $perPage }) {
        pageInfo {
          total
          totalPages
        }
        nodes {
          id
          seedNum
          groupSeedNum
          entrant {
            ...EntrantInfo
          }
        }
      }
    }
  }
  ${ENTRANT}
`;

export const EVENT_SETS = gql`
  query EventSets($eventId: ID!, $page: Int!, $perPage: Int!, $filters: SetFilters) {
    event(id: $eventId) {
      id
      sets(page: $page, perPage: $perPage, sortType: CALL_ORDER, filters: $filters) {
        pageInfo {
          total
          totalPages
        }
        nodes {
          ...SetLight
          phaseGroup {
            id
            displayIdentifier
            bracketType
            phase {
              id
              name
            }
          }
        }
      }
    }
  }
  ${SET_LIGHT}
`;

export const SET_DETAIL = gql`
  query SetDetail($id: ID!) {
    set(id: $id) {
      id
      identifier
      round
      fullRoundText
      state
      winnerId
      totalGames
      startedAt
      completedAt
      phaseGroup {
        id
        displayIdentifier
        bracketType
      }
      stream {
        streamName
      }
      station {
        number
      }
      games {
        id
        orderNum
        winnerId
        entrant1Score
        entrant2Score
        selections {
          entrant {
            id
          }
          character {
            id
            name
            images {
              url
              type
            }
          }
        }
      }
      slots(includeByes: true) {
        id
        prereqType
        prereqId
        prereqPlacement
        entrant {
          ...EntrantInfo
        }
        standing {
          placement
          stats {
            score {
              value
            }
          }
        }
      }
    }
  }
  ${ENTRANT}
`;

export const VIDEOGAME = gql`
  query Videogame($id: ID!) {
    videogame(id: $id) {
      id
      name
      displayName
      characters {
        id
        name
        images {
          url
          type
        }
      }
      stages {
        id
        name
      }
    }
  }
`;

export const EVENT_ENTRANTS = gql`
  query EventEntrants($eventId: ID!, $page: Int!, $perPage: Int!, $name: String) {
    event(id: $eventId) {
      id
      entrants(query: { page: $page, perPage: $perPage, filter: { name: $name } }) {
        pageInfo {
          total
          totalPages
        }
        nodes {
          ...EntrantInfo
        }
      }
    }
  }
  ${ENTRANT}
`;

export const PHASE_SEEDS = gql`
  query PhaseSeeds($phaseId: ID!, $page: Int!, $perPage: Int!) {
    phase(id: $phaseId) {
      id
      name
      seeds(query: { page: $page, perPage: $perPage }) {
        pageInfo {
          total
          totalPages
        }
        nodes {
          id
          seedNum
          groupSeedNum
          phaseGroup {
            id
            displayIdentifier
          }
          entrant {
            id
            name
            initialSeedNum
            participants {
              id
              gamerTag
              prefix
              user {
                id
                images(type: "profile") {
                  url
                  type
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const PLAYER = gql`
  query Player($id: ID!) {
    player(id: $id) {
      id
      gamerTag
      prefix
      user {
        id
        slug
        name
        genderPronoun
        location {
          country
          state
          city
        }
        images {
          url
          type
        }
        authorizations(types: [TWITTER, TWITCH, DISCORD]) {
          type
          externalUsername
        }
      }
      recentStandings(limit: 5) {
        placement
        container {
          ... on Event {
            id
            name
            numEntrants
            tournament {
              name
            }
          }
        }
      }
    }
  }
`;

// ---------- Mutations (require a token with admin rights on the tournament) ----------
// Mutations return SetLight so the bracket store can merge advanced winners without a refetch.

export const REPORT_BRACKET_SET = gql`
  mutation ReportBracketSet($setId: ID!, $winnerId: ID, $isDQ: Boolean, $gameData: [BracketSetGameDataInput]) {
    reportBracketSet(setId: $setId, winnerId: $winnerId, isDQ: $isDQ, gameData: $gameData) {
      ...SetLight
    }
  }
  ${SET_LIGHT}
`;

export const UPDATE_BRACKET_SET = gql`
  mutation UpdateBracketSet($setId: ID!, $winnerId: ID, $isDQ: Boolean, $gameData: [BracketSetGameDataInput]) {
    updateBracketSet(setId: $setId, winnerId: $winnerId, isDQ: $isDQ, gameData: $gameData) {
      ...SetLight
    }
  }
  ${SET_LIGHT}
`;

export const RESET_SET = gql`
  mutation ResetSet($setId: ID!, $resetDependentSets: Boolean) {
    resetSet(setId: $setId, resetDependentSets: $resetDependentSets) {
      ...SetLight
    }
  }
  ${SET_LIGHT}
`;

export const MARK_SET_IN_PROGRESS = gql`
  mutation MarkSetInProgress($setId: ID!) {
    markSetInProgress(setId: $setId) {
      ...SetLight
    }
  }
  ${SET_LIGHT}
`;

export const MARK_SET_CALLED = gql`
  mutation MarkSetCalled($setId: ID!) {
    markSetCalled(setId: $setId) {
      ...SetLight
    }
  }
  ${SET_LIGHT}
`;

export const UPDATE_PHASE_SEEDING = gql`
  mutation UpdatePhaseSeeding(
    $phaseId: ID!
    $seedMapping: [UpdatePhaseSeedInfo]!
    $options: UpdatePhaseSeedingOptions
  ) {
    updatePhaseSeeding(phaseId: $phaseId, seedMapping: $seedMapping, options: $options) {
      id
    }
  }
`;

/** Re-saving a phase's own config makes start.gg regenerate its pools: sets are deleted, pools return to created. */
export const UPSERT_PHASE = gql`
  mutation UpsertPhase($phaseId: ID!, $payload: PhaseUpsertInput!) {
    upsertPhase(phaseId: $phaseId, payload: $payload) {
      id
      state
      phaseGroups(query: { page: 1, perPage: 100 }) {
        nodes {
          id
          state
        }
      }
    }
  }
`;

export const SWAP_SEEDS = gql`
  mutation SwapSeeds($phaseId: ID!, $seed1Id: ID!, $seed2Id: ID!) {
    swapSeeds(phaseId: $phaseId, seed1Id: $seed1Id, seed2Id: $seed2Id) {
      id
      seedNum
    }
  }
`;

export const GENERATE_REGISTRATION_TOKEN = gql`
  mutation GenerateRegistrationToken($registration: TournamentRegistrationInput!, $userId: ID!) {
    generateRegistrationToken(registration: $registration, userId: $userId)
  }
`;

export const REGISTER_FOR_TOURNAMENT = gql`
  mutation RegisterForTournament(
    $registration: TournamentRegistrationInput
    $registrationToken: String
  ) {
    registerForTournament(registration: $registration, registrationToken: $registrationToken) {
      id
      gamerTag
    }
  }
`;

export const USER_BY_SLUG = gql`
  query UserBySlug($slug: String!) {
    user(slug: $slug) {
      id
      slug
      name
      player {
        id
        gamerTag
        prefix
      }
      images(type: "profile") {
        url
        type
      }
    }
  }
`;

/** Entrants list of the Entrants tab: participant tag/prefix as shown in the tournament, plus their events. */
export const EVENT_ATTENDEES = gql`
  query EventAttendees($eventId: ID!, $page: Int!, $perPage: Int!, $name: String) {
    event(id: $eventId) {
      id
      entrants(query: { page: $page, perPage: $perPage, filter: { name: $name } }) {
        pageInfo {
          total
          totalPages
        }
        nodes {
          id
          name
          initialSeedNum
          participants {
            id
            gamerTag
            prefix
            player {
              id
              gamerTag
              prefix
            }
            events {
              id
            }
            user {
              id
              slug
              name
              location {
                country
              }
              images(type: "profile") {
                url
                type
              }
            }
          }
        }
      }
    }
  }
`;
