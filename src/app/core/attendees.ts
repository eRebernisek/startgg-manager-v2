import { Entrant, Id } from './api/models';

/** start.gg's own limits from the Add Attendee form. */
export const MAX_GAMER_TAG = 25;
export const MAX_PREFIX = 15;

/** One row of the Entrants list, flattened from a singles entrant's participant. */
export interface AttendeeRow {
  entrantId: Id;
  participantId: Id | null;
  playerId: Id | null;
  tag: string;
  prefix: string | null;
  realName: string | null;
  avatar: string | null;
  country: string | null;
  seed: number | null;
  userSlug: string | null;
  /** Number of events of the tournament this attendee is registered in (`null` when unknown). */
  eventCount: number | null;
  /** True when the attendee has no start.gg account. */
  noAccount: boolean;
  /** Team entrants list every member; actions only apply to singles. */
  memberCount: number;
}

/**
 * Uses the participant's own tag/prefix: that is what the tournament shows and what `updateParticipantGamertag`
 * changes. `player` holds the global profile tag, which can differ.
 */
export function attendeeRow(e: Entrant): AttendeeRow {
  const parts = e.participants ?? [];
  const p = parts.length === 1 ? parts[0]! : null;
  const user = p?.user ?? null;
  const images = user?.images ?? [];
  return {
    entrantId: e.id,
    participantId: p?.id ?? null,
    playerId: p?.player?.id ?? null,
    tag: (p ? (p.gamerTag ?? p.player?.gamerTag) : null) || e.name,
    prefix: (p ? (p.prefix ?? p.player?.prefix) : null) || null,
    realName: user?.name || null,
    avatar: (images.find((i) => i.type === 'profile') ?? images[0])?.url ?? null,
    country: user?.location?.country || null,
    seed: e.initialSeedNum ?? null,
    userSlug: user?.slug ?? null,
    eventCount: (p as { events?: unknown[] | null } | null)?.events?.length ?? null,
    noAccount: !!p && !user,
    memberCount: parts.length,
  };
}

/** "Displaying 1 - 4 of 4 attendees", like start.gg. */
export function displayingText(shown: number, total: number): string {
  if (!total || !shown) return 'No attendees';
  return `Displaying 1 - ${shown} of ${total} ${total === 1 ? 'attendee' : 'attendees'}`;
}

export type NewAttendee =
  | { kind: 'existing'; playerId: Id }
  | { kind: 'new'; gamerTag: string; prefix?: string | null; name?: string | null };

export interface RegistrationSetup {
  registrationOptions?: {
    id: Id;
    name?: string | null;
    optionType?: string | null;
    values?: { id: Id; name?: string | null }[] | null;
  }[] | null;
  events?: {
    id: Id;
    useEventSeeds?: boolean | null;
    phases?: { id: Id; name?: string | null; state?: string | null; isDefault?: boolean | null; phaseOrder?: number | null }[] | null;
  }[] | null;
}

export interface Placement {
  passTypeId: number;
  phaseId: number;
  /** Name of the phase the attendee is seeded into, or null when they are only registered for the event. */
  phaseName: string | null;
}

/**
 * Mirrors start.gg's Add Attendee defaults: pass type = the "competitor" value of the tournament-level option (else
 * its first value); phase = the default (else first) phase that is not completed. start.gg refuses started phases
 * without a pool ("Must select phase group for started phase"), and placing someone in a running pool would change
 * its bracket, so for a started phase the attendee is registered for the event without a phase (`-1`).
 */
export function registrationPlacement(setup: RegistrationSetup | null | undefined, eventId: Id): Placement {
  const passOption = setup?.registrationOptions?.find((o) => o.optionType === 'tournament');
  const values = passOption?.values ?? [];
  const pass = values.find((v) => /competitor/i.test(v.name ?? '')) ?? values[0];
  if (!pass) {
    throw new Error('start.gg did not return a pass type for this tournament. Add the attendee on start.gg instead.');
  }
  const event = setup?.events?.find((e) => String(e.id) === String(eventId));
  if (!event) throw new Error('This event is not part of the tournament returned by start.gg.');
  if (event.useEventSeeds) return { passTypeId: Number(pass.id), phaseId: -2, phaseName: null };

  const open = (event.phases ?? []).filter((p) => p.state !== 'COMPLETED');
  const phase =
    open.find((p) => p.isDefault) ?? [...open].sort((a, b) => (a.phaseOrder ?? 0) - (b.phaseOrder ?? 0))[0];
  if (!phase || phase.state === 'ACTIVE') return { passTypeId: Number(pass.id), phaseId: -1, phaseName: null };
  return { passTypeId: Number(pass.id), phaseId: Number(phase.id), phaseName: phase.name ?? 'Bracket' };
}

/** Payload for the website API's `registerPlayer(tournamentId, fields: RegisterPlayerData!)`. */
export function registerPlayerFields(attendee: NewAttendee, eventId: Id, placement: Placement) {
  const base = {
    passTypeId: placement.passTypeId,
    venueFeePaid: true,
    events: [{ eventId: Number(eventId), paid: true, phaseId: placement.phaseId, phaseGroupId: -1 }],
    registrationOptions: [],
  };
  if (attendee.kind === 'existing') return { ...base, player: { id: Number(attendee.playerId) } };
  const name = attendee.name?.trim();
  return {
    ...base,
    player: { gamerTag: attendee.gamerTag.trim(), prefix: attendee.prefix?.trim() ?? '' },
    // start.gg has no name field for attendees without an account; keep it visible to admins.
    ...(name ? { adminNotes: `Name: ${name}` } : {}),
  };
}

/** Returns an error message, or null when the tag/prefix are acceptable. */
export function validateTag(gamerTag: string, prefix: string | null | undefined): string | null {
  const tag = gamerTag.trim();
  if (!tag) return 'Enter a gamer tag.';
  if (tag.length > MAX_GAMER_TAG) return `Gamer tag can have at most ${MAX_GAMER_TAG} characters.`;
  if ((prefix ?? '').trim().length > MAX_PREFIX) return `Prefix can have at most ${MAX_PREFIX} characters.`;
  if (/[|]/.test(tag) || /[|]/.test(prefix ?? '')) return 'Tags cannot contain "|".';
  return null;
}

/** `user/abc123`, `start.gg/user/abc123/...` or a full profile URL → `user/abc123`. */
export function parseUserSlug(input: string): string | null {
  const m = /(?:^|\/)user\/([0-9a-z]{6,})(?:[/?#]|$)/i.exec(input.trim());
  return m ? `user/${m[1]!.toLowerCase()}` : null;
}
