# startgg-manager-v2 — Plan

## Goal

Browser + Capacitor Android app to view start.gg brackets and (with an admin personal token) report sets, reset sets, seed phases, and deep-link for entrant management.

## Decisions

| Topic | Choice |
| --- | --- |
| Auth | Personal API token only (OAuth needs a client secret; cannot ship in-app). |
| Token-less web | **Not supported in production.** Official API requires a token; the unofficial `www.start.gg/api/-/gql` endpoint is CORS-locked. Dev `ng serve` proxies `/sgg-public` for experiments; Android may call it via CapacitorHttp. Prefer pasting a personal token for all web use. |
| UI | Custom dark esports theme (CSS variables in `styles.scss`) + Angular CDK dialog / drag-drop. |
| GraphQL typing | Hand-written models + string documents validated against `schema/startgg.graphql` in Vitest. |
| Caching | In-memory query cache + de-dupe + rate-limit queue (~65/min) in `StartggClient`. |
| Adding entrants | No public mutation for arbitrary players. **Add / rename / remove** use start.gg’s unofficial website API (`registerPlayer`, `updateParticipantGamertag`, `deleteParticipant`) with the user’s `gg_session` in Settings; web needs `/sgg-web` (dev) or `proxy/` forwarder. List + profile URL lookup use the public API token. |
| Winner change | `resetSet(resetDependentSets: true)` then `reportBracketSet`. |

## Status

- [x] Angular 22 + Capacitor 8 Android project
- [x] Hardened `StartggClient` (rate queue, retries, error kinds, cache, timeout)
- [x] Mutations return `SetLight`; bracket merges results
- [x] `planSetSave` + unit tests
- [x] Auth validate-before-save; clear on auth errors + toast
- [x] Bracket (SVG connectors), sets list, set editor, entrants (list + add/rename/remove via website API), seeding
- [x] Unit tests (`npm test`) + production build (`npm run build`)
- [x] Live read-only smoke test → `SMOKE_TEST.md`
- [x] README deploy docs (static web + Android APK)

## API limits (honest)

- ~80 requests / 60s; paginate sets/seeds (~30/page); adapt on complexity errors.
- No add-arbitrary-entrant mutation.
- Preview set IDs (`preview_*`) open read-only until the bracket is started on start.gg.
- `updateBracketSet` cannot change winner.
- Seeding uses **seed** IDs, not entrant IDs.
- Seeding is rejected in started pools. No reset-phase mutation exists; re-saving the phase with `upsertPhase` (same config) un-starts its pools and deletes their sets. Bye sets cannot be `resetSet`.
- Failed mutations come back as HTTP 200 with `data.<field>: null` + `errors`; the client always throws for mutations.
