import { Entrant } from './api/models';
import {
  RegistrationSetup,
  attendeeRow,
  displayingText,
  parseUserSlug,
  registerPlayerFields,
  registrationPlacement,
  validateTag,
} from './attendees';

/** Shape of many-api-test's options/phases as start.gg's website API returned them. */
const LIVE_SETUP: RegistrationSetup = {
  registrationOptions: [
    { id: 5399230, name: 'Venue Fee', optionType: 'tournament', values: [{ id: 5911045, name: 'Venue Fee' }] },
    { id: 5399231, name: 'Teste Rivals 2', optionType: 'event', values: [{ id: 5911046, name: 'Teste Rivals 2' }] },
  ],
  events: [
    {
      id: 1536286,
      useEventSeeds: false,
      phases: [{ id: 2173645, name: 'Bracket', state: 'ACTIVE', isDefault: true, phaseOrder: 1 }],
    },
  ],
};

describe('attendeeRow', () => {
  it('uses the tournament participant tag, not the global player tag', () => {
    const entrant: Entrant = {
      id: 24914271,
      name: 'TMP2 | ZZRenamed',
      initialSeedNum: null,
      participants: [
        {
          id: 22780808,
          gamerTag: 'ZZRenamed',
          prefix: 'TMP2',
          player: { id: 5614532, gamerTag: 'ZZApiTest', prefix: 'TMP' },
          user: null,
        },
      ],
    };
    expect(attendeeRow(entrant)).toMatchObject({
      participantId: 22780808,
      playerId: 5614532,
      tag: 'ZZRenamed',
      prefix: 'TMP2',
      seed: null,
      noAccount: true,
      memberCount: 1,
    });
  });

  it('maps account details and treats an empty prefix as none', () => {
    const row = attendeeRow({
      id: 22299032,
      name: 'Guntadela',
      initialSeedNum: 4,
      participants: [
        {
          id: 20498228,
          gamerTag: 'Guntadela',
          prefix: '',
          player: { id: 494971, gamerTag: 'Guntadela', prefix: '' },
          user: {
            id: 353502,
            slug: 'user/7081a58b',
            name: 'Diego Liao de Almeida',
            location: { country: 'Brazil' },
            images: [
              { url: 'banner.png', type: 'banner' },
              { url: 'profile.png', type: 'profile' },
            ],
          },
        },
      ],
    });
    expect(row).toMatchObject({
      prefix: null,
      realName: 'Diego Liao de Almeida',
      country: 'Brazil',
      avatar: 'profile.png',
      seed: 4,
      noAccount: false,
      userSlug: 'user/7081a58b',
    });
  });

  it('falls back to the entrant name for teams', () => {
    const row = attendeeRow({ id: 1, name: 'Team A', participants: [{ id: 1 }, { id: 2 }] });
    expect(row).toMatchObject({ tag: 'Team A', participantId: null, memberCount: 2 });
  });
});

describe('displayingText', () => {
  it('matches start.gg wording', () => {
    expect(displayingText(4, 4)).toBe('Displaying 1 - 4 of 4 attendees');
    expect(displayingText(1, 1)).toBe('Displaying 1 - 1 of 1 attendee');
    expect(displayingText(0, 0)).toBe('No attendees');
  });
});

describe('registrationPlacement', () => {
  it('registers for a started phase without placing the attendee in it', () => {
    expect(registrationPlacement(LIVE_SETUP, 1536286)).toEqual({ passTypeId: 5911045, phaseId: -1, phaseName: null });
  });

  it('seeds into the default phase while it has not started', () => {
    const setup: RegistrationSetup = {
      ...LIVE_SETUP,
      events: [
        {
          id: 1,
          phases: [
            { id: 10, name: 'Pools', state: 'CREATED', phaseOrder: 2 },
            { id: 11, name: 'Main', state: 'CREATED', isDefault: true, phaseOrder: 1 },
          ],
        },
      ],
    };
    expect(registrationPlacement(setup, '1')).toEqual({ passTypeId: 5911045, phaseId: 11, phaseName: 'Main' });
  });

  it('prefers the competitor pass and uses event seeds when the event does', () => {
    const setup: RegistrationSetup = {
      registrationOptions: [
        {
          id: 1,
          optionType: 'tournament',
          values: [
            { id: 7, name: 'Spectator' },
            { id: 8, name: 'Competitor' },
          ],
        },
      ],
      events: [{ id: 1, useEventSeeds: true, phases: [] }],
    };
    expect(registrationPlacement(setup, 1)).toEqual({ passTypeId: 8, phaseId: -2, phaseName: null });
  });

  it('explains when start.gg returns no pass type or no such event', () => {
    expect(() => registrationPlacement({ registrationOptions: [], events: [] }, 1)).toThrow(/pass type/);
    expect(() => registrationPlacement(LIVE_SETUP, 999)).toThrow(/not part of the tournament/);
  });
});

describe('registerPlayerFields', () => {
  const placement = { passTypeId: 5911045, phaseId: -1, phaseName: null };

  it('builds the payload start.gg accepted live for a player without an account', () => {
    expect(
      registerPlayerFields({ kind: 'new', gamerTag: ' ZZApiTest ', prefix: 'TMP', name: 'Temporary API test' }, '1536286', placement),
    ).toEqual({
      passTypeId: 5911045,
      venueFeePaid: true,
      player: { gamerTag: 'ZZApiTest', prefix: 'TMP' },
      events: [{ eventId: 1536286, paid: true, phaseId: -1, phaseGroupId: -1 }],
      registrationOptions: [],
      adminNotes: 'Name: Temporary API test',
    });
  });

  it('references an existing player by id and omits empty notes', () => {
    const fields = registerPlayerFields({ kind: 'existing', playerId: '494971' }, 1536286, placement);
    expect(fields.player).toEqual({ id: 494971 });
    expect(fields).not.toHaveProperty('adminNotes');
  });
});

describe('validateTag', () => {
  it('enforces start.gg limits', () => {
    expect(validateTag('  ', '')).toMatch(/Enter a gamer tag/);
    expect(validateTag('x'.repeat(26), '')).toMatch(/at most 25/);
    expect(validateTag('Tag', 'p'.repeat(16))).toMatch(/at most 15/);
    expect(validateTag('A|B', '')).toMatch(/\|/);
    expect(validateTag('ZZRenamed', 'TMP2')).toBeNull();
  });
});

describe('parseUserSlug', () => {
  it('accepts slugs and profile URLs', () => {
    expect(parseUserSlug('user/7081a58b')).toBe('user/7081a58b');
    expect(parseUserSlug('https://www.start.gg/user/7081A58B/details')).toBe('user/7081a58b');
    expect(parseUserSlug('start.gg/user/ed3cbdcc?x=1')).toBe('user/ed3cbdcc');
    expect(parseUserSlug('Guntadela')).toBeNull();
  });
});
