import { TestBed } from '@angular/core/testing';
import { AttendeesApi } from './attendees-api.service';
import { StartggApi } from './startgg-api.service';
import { StartggWebClient } from './startgg-web-client';
import * as W from './web-documents';

/** Responses start.gg's website API gave live on many-api-test / teste-rivals-2. */
const SETUP = {
  data: {
    tournament: {
      id: 868650,
      registrationOptions: [{ id: 5399230, optionType: 'tournament', values: [{ id: 5911045, name: 'Venue Fee' }] }],
      events: [
        { id: 1536286, useEventSeeds: false, phases: [{ id: 2173645, state: 'ACTIVE', isDefault: true, phaseOrder: 1 }] },
      ],
    },
  },
  actionRecords: {},
};
const REGISTERED = {
  data: { registerPlayer: null },
  actionRecords: { update: { player: [5614532], participants: [22780808], entrants: [24914271] } },
};
const DELETED = {
  data: { deleteParticipant: [] },
  actionRecords: { delete: { participants: [22780808], entrants: [24914271] } },
};

describe('AttendeesApi', () => {
  let request: ReturnType<typeof vi.fn>;
  let userBySlug: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    request = vi.fn();
    userBySlug = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: StartggWebClient, useValue: { request } },
        { provide: StartggApi, useValue: { userBySlug } },
      ],
    });
  });

  const api = () => TestBed.inject(AttendeesApi);

  it('registers with the tournament pass type and reads the participant from actionRecords', async () => {
    request.mockResolvedValueOnce(SETUP).mockResolvedValueOnce(REGISTERED);
    const result = await api().register(868650, 1536286, { kind: 'new', gamerTag: 'ZZApiTest', prefix: 'TMP' });
    expect(result).toEqual({ participantId: 22780808, placement: { passTypeId: 5911045, phaseId: -1, phaseName: null } });
    const [doc, vars, opts] = request.mock.calls[1]!;
    expect(doc).toBe(W.WEB_REGISTER_PLAYER);
    expect(vars.fields.events).toEqual([{ eventId: 1536286, paid: true, phaseId: -1, phaseGroupId: -1 }]);
    expect(opts).toEqual({ isMutation: true });
  });

  it('does not report success when start.gg created nothing', async () => {
    request.mockResolvedValueOnce(SETUP).mockResolvedValueOnce({ data: { registerPlayer: null }, actionRecords: {} });
    await expect(api().register(868650, 1536286, { kind: 'existing', playerId: 1 })).rejects.toThrow(
      /did not report a new attendee/,
    );
  });

  it('confirms removal from actionRecords.delete', async () => {
    request.mockResolvedValueOnce(DELETED);
    await expect(api().remove(22780808)).resolves.toBeUndefined();
    request.mockResolvedValueOnce({ data: { deleteParticipant: [] }, actionRecords: {} });
    await expect(api().remove(22780808)).rejects.toThrow(/did not report the attendee as removed/);
  });

  it('renames with the trimmed tag and an empty prefix when cleared', async () => {
    request.mockResolvedValueOnce({
      data: { updateParticipantGamertag: { id: 22780808, gamerTag: 'ZZRenamed', prefix: '' } },
      actionRecords: {},
    });
    await api().rename(22780808, ' ZZRenamed ', null);
    expect(request.mock.calls[0]![1]).toEqual({ participantId: 22780808, gamerTag: 'ZZRenamed', prefix: '' });
  });

  it('looks up pasted profile URLs through the public API instead of searching', async () => {
    userBySlug.mockResolvedValueOnce({
      id: 353502,
      slug: 'user/7081a58b',
      name: 'Diego',
      player: { id: 494971, gamerTag: 'Guntadela', prefix: '' },
      images: [],
    });
    const hits = await api().searchPlayers('https://www.start.gg/user/7081a58b', 868650);
    expect(userBySlug).toHaveBeenCalledWith('user/7081a58b');
    expect(request).not.toHaveBeenCalled();
    expect(hits[0]).toMatchObject({ id: 494971, gamerTag: 'Guntadela' });
  });
});
