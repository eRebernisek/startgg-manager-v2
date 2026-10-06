/**
 * Documents for start.gg's unofficial website API (`www.start.gg/api/-/gql`), copied from the operations the
 * start.gg admin Attendees page sends (RegisterPlayer, RemoveParticipant, UpdateParticipantGamertag,
 * AddAttendeeSpotlightResultsQuery). They are not part of the public schema in schema/startgg.graphql, and the
 * mutations are hidden from introspection unless a logged-in website session is sent.
 */
const gql = String.raw;

export const WEB_CURRENT_USER = gql`
  query WebCurrentUser {
    currentUser {
      id
      slug
      player {
        id
        gamerTag
      }
    }
  }
`;

/** `isInTournament` is only filled in with a website session; anonymous calls get `null`. */
export const WEB_PLAYER_SEARCH = gql`
  query WebPlayerSearch($search: String!, $tournamentId: ID!, $perPage: Int!) {
    players(query: { page: 1, perPage: $perPage, filter: { searchField: $search } }) {
      pageInfo {
        total
      }
      nodes {
        id
        gamerTag
        prefix
        isInTournament(tournamentId: $tournamentId)
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
`;

/** What the Add Attendee form preloads: the pass type (tournament-level option) and each event's phases. */
export const WEB_REGISTRATION_SETUP = gql`
  query WebRegistrationSetup($tournamentId: ID!) {
    tournament(id: $tournamentId) {
      id
      registrationOptions {
        id
        name
        optionType
        values {
          id
          name
        }
      }
      events {
        id
        useEventSeeds
        phases {
          id
          name
          state
          isDefault
          phaseOrder
        }
      }
    }
  }
`;

/**
 * `fields.player` is `{ id }` of an existing player, or `{ gamerTag, prefix }` to create a player without an
 * account. `fields.events` lists the events to enter. Returns `registerPlayer: null` even on success; the new
 * participant is only reported in the response's `actionRecords.update.participants`.
 */
export const WEB_REGISTER_PLAYER = gql`
  mutation RegisterPlayer($tournamentId: ID!, $fields: RegisterPlayerData!) {
    registerPlayer(tournamentId: $tournamentId, fields: $fields) {
      id
    }
  }
`;

/** Removes the attendee from the tournament and every event in it. */
export const WEB_DELETE_PARTICIPANT = gql`
  mutation RemoveParticipant($participantId: ID!) {
    deleteParticipant(participantId: $participantId)
  }
`;

export const WEB_UPDATE_PARTICIPANT_GAMERTAG = gql`
  mutation UpdateParticipantGamertag($participantId: ID!, $gamerTag: String!, $prefix: String) {
    updateParticipantGamertag(participantId: $participantId, gamerTag: $gamerTag, prefix: $prefix) {
      id
      gamerTag
      prefix
    }
  }
`;
