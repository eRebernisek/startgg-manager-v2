import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../auth.service';
import { StartggClient, StartggError } from './startgg-client';

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

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { token: signal('test-token'), notifyAuthError: vi.fn() } }],
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
});
