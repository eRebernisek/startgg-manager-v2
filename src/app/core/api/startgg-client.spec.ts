import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../auth.service';
import { WebSessionService } from '../web-session.service';
import { DEFAULT_PUBLIC_PROXY_URL } from './public-proxy';
import { OFFICIAL_ENDPOINT, PUBLIC_ENDPOINT_WEB, StartggClient, StartggError } from './startgg-client';

/** Body start.gg returned live when reseeding a started bracket (HTTP 200). */
const STARTED_POOLS_RESPONSE = {
  errors: [
    {
      message: 'Cannot modify seeds in started pools',
      extensions: { category: 'validation' },
      path: ['updatePhaseSeeding'],
      type: 'validation',
    },
  ],
  data: { updatePhaseSeeding: null },
};

describe('StartggClient', () => {
  let client: StartggClient;
  let fetchMock: ReturnType<typeof vi.fn>;
  let token: ReturnType<typeof signal<string | null>>;
  let proxyUrl: ReturnType<typeof signal<string | null>>;
  let notifyAuthError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    token = signal<string | null>('test-token');
    proxyUrl = signal<string | null>(null);
    notifyAuthError = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { token, notifyAuthError } },
        { provide: WebSessionService, useValue: { proxyUrl } },
      ],
    });
    client = TestBed.inject(StartggClient);
  });

  afterEach(() => vi.unstubAllGlobals());

  const respond = (body: unknown, status = 200) =>
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

  it('throws GraphQL errors from mutations even when data is present', async () => {
    respond(STARTED_POOLS_RESPONSE);
    const call = client.request('mutation { updatePhaseSeeding }', {}, { isMutation: true });
    await expect(call).rejects.toBeInstanceOf(StartggError);
    await expect(call).rejects.toThrow('Cannot modify seeds in started pools');
  });

  it('keeps partial data for queries', async () => {
    respond({ errors: [{ message: 'subfield failed' }], data: { event: { id: 1 } } });
    await expect(client.request('query { event }')).resolves.toEqual({ event: { id: 1 } });
  });

  it('serves fresh data after invalidate()', async () => {
    respond({ data: { n: 1 } });
    respond({ data: { n: 2 } });
    expect(await client.request('query { n }', {}, { cacheTtlMs: 60_000 })).toEqual({ n: 1 });
    expect(await client.request('query { n }', {}, { cacheTtlMs: 60_000 })).toEqual({ n: 1 });
    client.invalidate();
    expect(await client.request('query { n }', {}, { cacheTtlMs: 60_000 })).toEqual({ n: 2 });
  });

  it('uses the official API with a Bearer token', async () => {
    respond({ data: { ok: true } });
    await client.request('query { ok }');
    expect(fetchMock).toHaveBeenCalledWith(
      OFFICIAL_ENDPOINT,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
  });

  it('refuses mutations without a token', async () => {
    token.set(null);
    const call = client.request('mutation { reportBracketSet }', {}, { isMutation: true });
    await expect(call).rejects.toThrow(/Editing requires a start\.gg API token/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the default public proxy for token-less queries off localhost', async () => {
    token.set(null);
    const loc = { hostname: 'erebernisek.github.io' };
    vi.stubGlobal('location', loc);
    respond({ data: { event: { id: 1 } } });
    await expect(client.request('query { event }')).resolves.toEqual({ event: { id: 1 } });
    expect(fetchMock).toHaveBeenCalledWith(
      DEFAULT_PUBLIC_PROXY_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ 'client-version': '20' }),
      }),
    );
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('prefers a Settings proxy URL over the default for token-less reads', async () => {
    token.set(null);
    proxyUrl.set('https://custom-proxy.example');
    vi.stubGlobal('location', { hostname: 'erebernisek.github.io' });
    respond({ data: { ok: 1 } });
    await client.request('query { ok }');
    expect(fetchMock.mock.calls[0]![0]).toBe('https://custom-proxy.example');
  });

  it('uses the ng serve /sgg-public path on localhost without a token', async () => {
    token.set(null);
    vi.stubGlobal('location', { hostname: 'localhost' });
    respond({ data: { ok: 1 } });
    await client.request('query { ok }');
    expect(fetchMock.mock.calls[0]![0]).toBe(PUBLIC_ENDPOINT_WEB);
  });

  it('does not clear the stored token on public-endpoint auth-shaped errors', async () => {
    token.set(null);
    vi.stubGlobal('location', { hostname: 'localhost' });
    respond({ success: false, message: 'Invalid authentication token' }, 400);
    await expect(client.request('query { x }')).rejects.toBeInstanceOf(StartggError);
    expect(notifyAuthError).not.toHaveBeenCalled();
  });
});
