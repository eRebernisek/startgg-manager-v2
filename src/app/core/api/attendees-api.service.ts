import { Injectable, inject } from '@angular/core';
import {
  NewAttendee,
  Placement,
  RegistrationSetup,
  parseUserSlug,
  registerPlayerFields,
  registrationPlacement,
} from '../attendees';
import { Id, Image } from './models';
import { StartggApi } from './startgg-api.service';
import { StartggError } from './startgg-client';
import { StartggWebClient } from './startgg-web-client';
import * as W from './web-documents';

export interface PlayerHit {
  id: Id;
  gamerTag: string;
  prefix?: string | null;
  /** `null` when start.gg could not tell (no website session). */
  isInTournament?: boolean | null;
  user?: {
    id: Id;
    slug?: string | null;
    name?: string | null;
    location?: { country?: string | null } | null;
    images?: Image[] | null;
  } | null;
}

export interface WebUser {
  id: Id;
  slug?: string | null;
  player?: { id: Id; gamerTag: string } | null;
}

export interface Registered {
  participantId: Id;
  placement: Placement;
}

/**
 * Adds, renames and removes tournament attendees. The public API has no mutation for any of this, so these go
 * through start.gg's website API with the user's website session (see README → Entrants).
 */
@Injectable({ providedIn: 'root' })
export class AttendeesApi {
  private readonly web = inject(StartggWebClient);
  private readonly api = inject(StartggApi);

  /** The account behind the website session, or null when start.gg does not recognise it. */
  async sessionUser(): Promise<WebUser | null> {
    return (await this.web.request<{ currentUser: WebUser | null }>(W.WEB_CURRENT_USER, {})).data.currentUser;
  }

  /**
   * Players by gamer tag or name (website API), or the player of a pasted profile URL / `user/<slug>` (public API,
   * which has no player search).
   */
  async searchPlayers(search: string, tournamentId: Id, perPage = 8): Promise<PlayerHit[]> {
    const slug = parseUserSlug(search);
    if (slug) {
      const user = await this.api.userBySlug(slug);
      if (!user?.player) return [];
      return [
        {
          id: user.player.id,
          gamerTag: user.player.gamerTag,
          prefix: user.player.prefix,
          isInTournament: null,
          user: { id: user.id, slug: user.slug, name: user.name, images: user.images },
        },
      ];
    }
    const { data } = await this.web.request<{ players: { nodes: PlayerHit[] | null } | null }>(W.WEB_PLAYER_SEARCH, {
      search: search.trim(),
      tournamentId,
      perPage,
    });
    return data.players?.nodes ?? [];
  }

  /** Registers the attendee for the tournament and the event, the way start.gg's Add Attendee form does. */
  async register(tournamentId: Id, eventId: Id, attendee: NewAttendee): Promise<Registered> {
    const setup = await this.web.request<{ tournament: RegistrationSetup | null }>(W.WEB_REGISTRATION_SETUP, {
      tournamentId,
    });
    const placement = registrationPlacement(setup.data.tournament, eventId);
    const { actionRecords } = await this.web.request<{ registerPlayer: { id: Id } | null }>(
      W.WEB_REGISTER_PLAYER,
      { tournamentId, fields: registerPlayerFields(attendee, eventId, placement) },
      { isMutation: true },
    );
    const participantId = actionRecords.update?.['participants']?.[0];
    if (!participantId) throw new StartggError('start.gg did not report a new attendee.', 'graphql');
    return { participantId, placement };
  }

  async rename(participantId: Id, gamerTag: string, prefix: string | null) {
    const { data } = await this.web.request<{
      updateParticipantGamertag: { id: Id; gamerTag: string; prefix: string | null } | null;
    }>(
      W.WEB_UPDATE_PARTICIPANT_GAMERTAG,
      { participantId, gamerTag: gamerTag.trim(), prefix: prefix?.trim() ?? '' },
      { isMutation: true },
    );
    if (!data.updateParticipantGamertag) throw new StartggError('start.gg did not change the tag.', 'graphql');
    return data.updateParticipantGamertag;
  }

  /** Removes the attendee from the tournament (and so from every event of it). */
  async remove(participantId: Id): Promise<void> {
    const { actionRecords } = await this.web.request<{ deleteParticipant: unknown }>(
      W.WEB_DELETE_PARTICIPANT,
      { participantId },
      { isMutation: true },
    );
    const deleted = actionRecords.delete?.['participants'] ?? [];
    if (!deleted.some((id) => String(id) === String(participantId))) {
      throw new StartggError('start.gg did not report the attendee as removed.', 'graphql');
    }
  }
}
