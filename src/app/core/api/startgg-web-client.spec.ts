import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { parse } from 'graphql';
import { WebSessionService } from '../web-session.service';
import { StartggError } from './startgg-client';
import { DEV_WEB_PROXY, SESSION_HEADER, StartggWebClient } from './startgg-web-client';
import * as W from './web-documents';

describe('StartggWebClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const session = signal<string | null>('sess123');
  const proxyUrl = signal<string | null>(null);

  beforeEach(() => {
    session.set('sess123');
    proxyUrl.set(null);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      providers: [{ provide: WebSessionService, useValue: { session, proxyUrl } }],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  const client = () => TestBed.inject(StartggWebClient);
  const respond = (body: unknown, status = 200) =>
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

  it('sends the session in a header (never as Cookie) to the dev proxy', async () => {
    respond({ data: { currentUser: { id: 1 } }, actionRecords: [] });
    const result = await client().request(W.WEB_CURRENT_USER, {});
    expect(result).toEqual({ data: { currentUser: { id: 1 } }, actionRecords: {} });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(DEV_WEB_PROXY);
    expect(init.headers[SESSION_HEADER]).toBe('sess123');
    expect(init.headers['client-version']).toBe('20');
    expect(init.headers).not.toHaveProperty('Cookie');
  });

  it('uses the configured proxy URL', async () => {
    proxyUrl.set('https://proxy.example.dev');
    respond({ data: { players: { nodes: [] } } });
    await client().request(W.WEB_PLAYER_SEARCH, { search: 'x', tournamentId: 1, perPage: 5 });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://proxy.example.dev');
  });

  it('refuses mutations without a session before calling start.gg', async () => {
    session.set(null);
    await expect(client().request(W.WEB_DELETE_PARTICIPANT, { participantId: 1 }, { isMutation: true })).rejects.toThrow(
      /website session/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats `data: []` (unrecognised session) as an auth error for mutations', async () => {
    respond({ data: [], actionRecords: [] });
    const call = client().request(W.WEB_DELETE_PARTICIPANT, { participantId: 1 }, { isMutation: true });
    await expect(call).rejects.toMatchObject({ kind: 'auth' });
  });

  it('surfaces start.gg’s exact validation message', async () => {
    respond({
      errors: [{ message: 'Must select phase group for started phase', fields: ['phaseGroupDest.1536286'] }],
      data: { registerPlayer: null },
    });
    const call = client().request(W.WEB_REGISTER_PLAYER, { tournamentId: 1, fields: {} }, { isMutation: true });
    await expect(call).rejects.toBeInstanceOf(StartggError);
    await expect(call).rejects.toThrow('Must select phase group for started phase');
  });

  it('returns actionRecords so callers can confirm what start.gg changed', async () => {
    respond({
      data: { registerPlayer: null },
      actionRecords: { update: { participants: [22780808], entrants: [24914271] } },
    });
    const { actionRecords } = await client().request(W.WEB_REGISTER_PLAYER, {}, { isMutation: true });
    expect(actionRecords.update?.['participants']).toEqual([22780808]);
  });

  it('reports a proxy that does not answer JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>502</html>', { status: 502 }));
    await expect(client().request(W.WEB_CURRENT_USER, {})).rejects.toThrow(/HTTP 502/);
  });
});

describe('website API documents', () => {
  for (const [name, source] of Object.entries(W)) {
    it(`${name} parses`, () => {
      expect(() => parse(source)).not.toThrow();
    });
  }
});
