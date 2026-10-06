# Start.gg Manager v2

Angular + Capacitor app to **view** start.gg brackets and **edit** them when you have an admin personal API token (report sets, reset, call/start, seeding). Inspired by [TournamentStreamHelper](https://github.com/joaorb64/TournamentStreamHelper).

See [PLAN.md](./PLAN.md) for architecture decisions and API limits.

## Quick start (web)

```bash
cd startgg-manager-v2
npm install
npm start          # http://localhost:4200  (dev proxy for experimental token-less reads)
```

1. Open **Settings** and paste a [personal API token](https://start.gg/admin/profile/developer).
2. Paste a bracket URL on **Home**, or open **My tournaments**.

```bash
npm test           # Vitest via Angular unit-test builder
npm run build      # static files in dist/startgg-manager-v2/browser
```

## Deploy — static web hosting

Production builds **require a personal token** in the browser. The official API allows CORS `*`; the unofficial website GraphQL endpoint does not.

```bash
npm run build
# Upload dist/startgg-manager-v2/browser to any static host
# (Netlify, Cloudflare Pages, S3, nginx, GitHub Pages, …)
```

Hash routing (`#/…`) is enabled, so no server rewrite rules are needed.

Optional: for local experiments without a token, `npm start` proxies `/sgg-public` → `www.start.gg/api/-/gql`. Do **not** rely on that for production.

## Deploy — Android APK (Capacitor)

Prerequisites: JDK 21+, Android SDK / Android Studio.

```bash
npm run build
npx cap sync android
npx cap open android    # Android Studio → Build → Build APK(s)
# or:
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

App id: `gg.startmanager.app`. On Android, CapacitorHttp is enabled so an experimental token-less read against the website endpoint can work; prefer a personal token for editing.

## Features

| Mode | What works |
| --- | --- |
| Token + admin | Tournament picker → event → bracket / sets / entrants / seeding. Report, update, reset, call, start sets. Change seeds. |
| Token, not admin | Full read of public events; mutations return permission errors. |
| No token (web prod) | Blocked — add a token in Settings. |
| No token (Android / `ng serve`) | Experimental read-only via unofficial endpoint. |

### Set reporting rules

- The app only records who won — no per-game scores or game data are shown or sent.
- Completing a set: `reportBracketSet` with `winnerId` (+ `isDQ`).
- Toggling DQ on a completed set **without** changing the winner: `updateBracketSet`.
- Changing the winner of a completed set: `resetSet(resetDependentSets: true)` then `reportBracketSet` (the UI confirms first).
- Saving seeding (`updatePhaseSeeding`) clears the API cache, refetches the event and reloads the bracket and sets tabs.

### Entrants

The **Entrants** tab lists event attendees (search, count, avatar, tag/prefix, seed, actions menu) and supports **Add attendee**, **Change tag**, and **Remove from event** when you can reach start.gg’s website API.

| Capability | Public API (`api.start.gg`) + personal token | Website API (`www.start.gg/api/-/gql`) + `gg_session` |
| --- | --- | --- |
| List / search attendees | Yes | Yes (player search includes `isInTournament` when logged in) |
| Add existing start.gg player | **No** — `generateRegistrationToken` / `registerForTournament` only re-register the token owner | **Yes** — `registerPlayer` with `fields.player.id` |
| Add player without account | **No** | **Yes** — `registerPlayer` with `fields.player.gamerTag` / `prefix` |
| Rename tag for this tournament | **No** | **Yes** — `updateParticipantGamertag` |
| Remove from tournament | **No** | **Yes** — `deleteParticipant` |

**Unofficial / risks:** The website API is what start.gg’s own Attendees admin uses. It is undocumented, can change without notice, and is not covered by the public developer terms. A pasted **`gg_session`** cookie is as powerful as your logged-in browser session — treat it like a password, store it only on-device, and revoke it by logging out on start.gg. The app never sends your personal API token to the website endpoint.

**Web vs Android:** Browsers block cross-origin calls to the website API (CORS). Options:

1. **`npm start`** — dev proxy at `/sgg-web` (session sent in `X-Startgg-Session`).
2. **Production web** — deploy the tiny forwarder in [`proxy/startgg-web-proxy.mjs`](./proxy/startgg-web-proxy.mjs) (Cloudflare Worker, Netlify, etc.) and paste its URL in **Settings → Proxy URL**.
3. **Android** — Capacitor native HTTP calls start.gg directly; no proxy needed.

Paste the **`gg_session`** cookie in **Settings → start.gg website session** (DevTools → Application → Cookies → `www.start.gg`). The personal API token is still required for brackets, sets, and seeding.

If add/rename/remove is blocked, use **Manage on start.gg ↗** (`https://www.start.gg/admin/tournament/{slug}/attendees`).

### Seeding

`updatePhaseSeeding` uses **seed IDs** (and seed numbers), not entrant IDs. Drag to reorder, then save. The app re-reads the seeding to confirm start.gg kept it and shows start.gg's reason when it doesn't.

start.gg rejects seeding once a pool has started (`Cannot modify seeds in started pools`), even with no reported sets. **Reset bracket** (seeding page, after an in-app confirmation) handles that:

1. `resetSet` on every reported / in-progress / called set, dependents first (grand final reset → … → round 1, from the slots' `prereqId` links). Bye sets are skipped — start.gg refuses them.
2. `upsertPhase` with the phase's own name, bracket type and pool count. start.gg answers by deleting the pool's sets and returning the pool to *created*; this is the only API route that un-starts a pool (there is no reset-phase mutation, and `resetSet` alone leaves the pool started).
3. start.gg serves `preview_*` sets about 30 s later; the app polls until they appear, then reloads bracket, sets and seeding.

**Start bracket** (Bracket tab, shown while the pool is not started; shows a disabled "Running" once it is) starts the pool again. There is no start mutation in the API, so after an in-app confirmation the app calls `markSetCalled` on an opening `preview_*` set — which makes start.gg start the pool and create real sets — then `resetSet` on the resulting real set so nothing stays marked as called. It then polls until the real sets replace the previews (~20 s) and reloads bracket, sets and seeding.

## Rate limits & robustness

- Client-side queue ≈ 65 requests / 60s, concurrency 3.
- Paginated sets/seeds (`perPage` 30); halves page size on complexity errors.
- Retries 429 / transient network for **queries** only (not non-idempotent mutations).
- In-memory query cache + de-duplication.

## Secrets

Never commit tokens. Ignored:

- `startGGApiKey.txt`, `*.token`, `.env*`

## Smoke test

See [SMOKE_TEST.md](./SMOKE_TEST.md).
