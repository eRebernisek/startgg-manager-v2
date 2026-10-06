/**
 * Optional CORS proxy for the web build. start.gg's website API only allows CORS from
 * https://www.start.gg, so browsers on GitHub Pages (and other static hosts) cannot call it
 * directly. This Worker forwards POSTs to https://www.start.gg/api/-/gql with no secrets stored.
 *
 * Used for:
 * - Token-less **view** (anonymous GraphQL, same approach as TournamentStreamHelper)
 * - Attendee admin: the app sends `gg_session` in `X-Startgg-Session`; this turns it into the cookie
 *
 * - Forwards only POST requests; the upstream URL is fixed (not taken from input).
 * - Stores and logs nothing; the session only lives for the duration of the request.
 * - ALLOWED_ORIGINS (comma-separated, optional) restricts which app origins may use it; default allows any origin.
 *
 * Deploy: `npx wrangler deploy --config proxy/wrangler.toml`
 * Temporary (claim within 60m): `npx wrangler deploy --temporary --config proxy/wrangler.toml`
 */
const TARGET = 'https://www.start.gg/api/-/gql';
const SESSION_RE = /^[\w.%-]{10,512}$/;
const MAX_BODY = 64 * 1024;

export async function handle(request, env = {}) {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (allowed.length && !allowed.includes(origin)) return json({ success: false, message: 'Origin not allowed.' }, 403, '');
  const allowOrigin = allowed.length ? origin : '*';

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(allowOrigin) });
  if (request.method !== 'POST') return json({ success: false, message: 'Use POST.' }, 405, allowOrigin);

  const body = await request.text();
  if (body.length > MAX_BODY) return json({ success: false, message: 'Request too large.' }, 413, allowOrigin);

  const headers = {
    'Content-Type': 'application/json',
    'client-version': request.headers.get('client-version') ?? '20',
    'x-web-source': 'gg-web-gql-client',
    Origin: 'https://www.start.gg',
    Referer: 'https://www.start.gg/',
  };
  const session = request.headers.get('X-Startgg-Session');
  if (session) {
    if (!SESSION_RE.test(session)) return json({ success: false, message: 'Malformed session.' }, 400, allowOrigin);
    headers.Cookie = `gg_session=${session}`;
  }

  const upstream = await fetch(TARGET, { method: 'POST', headers, body, redirect: 'manual' });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json', ...cors(allowOrigin) },
  });
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, client-version, x-web-source, X-Startgg-Session',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(value, status, origin) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', ...(origin ? cors(origin) : {}) },
  });
}

export default { fetch: (request, env) => handle(request, env) };
