# Smoke test results

Date: 2026-10-06  
Method: read-only GraphQL against `https://api.start.gg/gql/alpha` using the local `startGGApiKey.txt` (token **not** recorded here).  
No mutations were run.

## Results

| Check | Result |
| --- | --- |
| `currentUser` | OK — authenticated (`user/ed3cbdcc`, gamerTag ManyTheGuy) |
| Event `tournament/many-api-test/event/teste-rivals-2` | OK — “Teste Rivals 2”, 4 entrants |
| Admin detection (`tournament.admins`) | OK — non-null admin list for this token |
| Phase / group | OK — phase `2173645` (DOUBLE_ELIMINATION), group `3162844` |
| Phase-group sets (page 1, perPage 30) | OK — 11 sets, 1 page, queryComplexity ≈ 102 |
| Winners / losers rounds present | OK — Winners SF/Final/GF/Reset + Losers R1–Final |
| Entrant names on opened sets | OK — e.g. ManyTheGuy vs VISIONÁRIOS \| Eetrexx |
| `currentUser.tournaments(tournamentView: "admin")` | OK — 48 admin tournaments returned |

## Entrants (live, 2026-10-06)

Tournament `many-api-test`, event `teste-rivals-2` (4 entrants). Personal token used for read-back only.

| Path | Result |
| --- | --- |
| Public `generateRegistrationToken` + `registerForTournament` | Only re-registers the **token owner**; does **not** add other players. |
| Website `registerPlayer` (no `gg_session`) | **Rejected** — “Login is required”. |
| Website `registerPlayer` + logged-in session | **Works** — temp without-account tag added and removed; existing player `{ id }` added and removed. Confirmed via public API entrant list (back to 4: Eetrexx, Guntadela, LukeLeal, ManyTheGuy). |

Website mutations match the payloads built in `registerPlayerFields()` / `AttendeesApi` (`actionRecords.update.participants` on success).

## Not exercised live

- Mutations (`reportBracketSet`, `resetSet`, `updateBracketSet`, seeding) — intentionally skipped (no safe disposable bracket consented for writes in this run). Covered by schema validation + `planSetSave` unit tests.
- Token-less public endpoint — CORS-blocked in browsers; Android/dev-proxy only.
- Capacitor APK install on a physical device.

## How to re-run

```bash
# From repo root — keep the key out of shell history logs if possible
TOKEN=$(awk 'NF && $0 !~ /^StartGG/ {print; exit}' startGGApiKey.txt | tr -d '\r\n ')
curl -sS https://api.start.gg/gql/alpha \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { currentUser { id player { gamerTag } } }"}'
```

Or open the built app, paste the token in Settings, and load  
`https://www.start.gg/tournament/many-api-test/event/teste-rivals-2/brackets/2173645/3162844`.
