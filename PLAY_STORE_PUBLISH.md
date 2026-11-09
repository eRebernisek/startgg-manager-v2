# Play Store publish brief — SGG Manager

Machine-readable brief for filling Google Play Console (listing, Data safety, content rating, access notes, and first AAB upload). Use values exactly as written unless noted.

**Not affiliated with, endorsed by, or sponsored by start.gg or Smash.gg.** Independent third-party tool.

---

## 1. App identity (immutable after first upload)

| Field | Value |
| --- | --- |
| App name (display) | SGG Manager |
| Package name / applicationId | `gg.startmanager.app` |
| Default language | English (United States) — also provide Portuguese (Brazil) if locale listing is offered |
| versionName | `1.0.0` |
| versionCode | `1` (increase by 1 on every new upload) |
| minSdk | 24 (Android 7.0+) |
| targetSdk | 36 |
| compileSdk | 36 |
| Free / paid | Free |
| Contains ads | No |
| In-app purchases | No |
| Category (pick closest) | Tools (fallback: Sports or Productivity) |
| Public developer name | ManyTheDeveloper |
| Account type | Personal |
| Contact / support email | eder.rebernisek@gmail.com |
| Website | https://erebernisek.github.io/startgg-manager-v2/ |
| Contact / support (issues) | https://github.com/erebernisek/startgg-manager-v2/issues |
| Privacy policy URL | https://erebernisek.github.io/startgg-manager-v2/privacy.html |
| Privacy policy source in repo | `public/privacy.html` (must be deployed to GitHub Pages on `main` before submit) |

### Developer disclaimer (required in listing + About)

> Not affiliated with, endorsed by, or sponsored by start.gg or Smash.gg. This is an independent third-party tool.

Do **not** use official start.gg / Smash.gg logos or trademarks as the store icon or feature graphic.

---

## 2. Store listing copy

### Short description (max 80 characters)

**EN**

```
View start.gg brackets. Report sets and manage entrants with your own token.
```

**PT-BR**

```
Veja brackets no start.gg. Reporte sets e gerencie entrants com seu token.
```

### Full description

**EN**

```
SGG Manager helps tournament organizers view start.gg brackets on Android.

View-only mode works without an account. Editing (report sets, seeding, entrants) needs your own personal start.gg API token and admin access on the event. Optional website session support is for entrant add/rename/remove via start.gg’s website APIs.

Features:
• Browse tournaments and phases
• Bracket view and set list
• Report set scores / games (with token)
• Seeding and entrant management (with credentials)
• English and Portuguese UI

Not affiliated with, endorsed by, or sponsored by start.gg or Smash.gg. Independent third-party tool. Your API token and session stay on your device and are sent only to start.gg.
```

**PT-BR**

```
SGG Manager ajuda organizadores a ver brackets do start.gg no Android.

O modo somente leitura funciona sem conta. Para editar (reportar sets, seeding, entrants) use seu próprio token de API do start.gg e acesso de admin no evento. Sessão do site é opcional para adicionar/renomear/remover entrants.

Recursos:
• Torneios e fases
• Bracket e lista de sets
• Reportar placar/jogos (com token)
• Seeding e entrants (com credenciais)
• Interface em inglês e português

Não afiliado, endossado ou patrocinado pelo start.gg ou Smash.gg. Ferramenta independente de terceiros. Token e sessão ficam no dispositivo e vão apenas para o start.gg.
```

---

## 3. App access for reviewers

- Login required for core features? **No** (view-only works without credentials).
- Editing requires a personal start.gg API token with admin rights on a tournament the reviewer controls — the developer cannot supply a shared production admin token.

**App access notes (paste into Play Console):**

```
View-only mode works without any login or API token: open the app and browse public start.gg brackets.

Editing features (report sets, seeding, entrants) require the reviewer’s own personal start.gg API token and admin rights on a tournament they control. We cannot provide a shared admin token. Optional website session (gg_session) is only needed for certain entrant add/rename/remove actions.
```

---

## 4. Data safety form (recommended answers)

Align with `public/privacy.html`. Framing: the **developer does not collect or share** user data via a developer backend; credentials may be stored **on device** and sent **only to start.gg** when the user uses edit features.

| Topic | Answer |
| --- | --- |
| Does the developer collect user data? | **No** (no developer-operated analytics, ads, crash, or account backend) |
| Data shared with third parties by the developer? | **No** |
| Data encrypted in transit? | **Yes** (HTTPS) |
| Users can request deletion? | **Yes** — clear credentials/settings in Settings, or uninstall the app |
| Ads in the app? | **No** |
| Independent security review? | **No** (unless you later obtain one) |
| Data collection optional vs required | Optional — view-only needs none; edit needs user-supplied token/session |

### On-device processing (if the form asks what the app handles locally)

- Personal start.gg **API token** (optional)
- Optional start.gg website **session** (`gg_session`)
- App settings (e.g. language, optional proxy URL on web)

Destination when used: **start.gg** only (user-initiated requests). Not sold. Not used for advertising. Not shared by the developer for analytics.

### Permissions declared in the APK/AAB

- `android.permission.INTERNET` only
- `android:allowBackup="false"`

No developer analytics / advertising / crash-reporting SDKs are included.

---

## 5. Content rating & target audience

- Complete the official IARC questionnaire honestly.
- Suggested target audience: **13+** (privacy policy: not directed at children under 13).
- Expected content profile for questionnaire guidance:
  - No simulated gambling
  - No user-generated social network / dating
  - No location sharing
  - Competitive esports / tournament bracket utility (no graphic violence beyond typical fighting-game tournament context; the app itself does not render game violence)
  - No paid content / loot boxes

If a question does not apply, answer **No** / **Not present**.

---

## 6. Store graphic assets (ready in `publishApp/`)

| Asset | File(s) | Spec |
| --- | --- | --- |
| High-res icon | `publishApp/icon/sgg-icon-512.png` | 512×512 32-bit PNG, full square |
| Feature graphic (en-US) | `publishApp/feature-graphic/feature-graphic-1024x500-en.png` | 1024×500 24-bit PNG |
| Feature graphic (pt-BR) | `publishApp/feature-graphic/feature-graphic-1024x500-pt.png` | 1024×500 24-bit PNG |
| Phone screenshots (en-US) | `publishApp/screenshots/en/1-bracket.png` … `6-home.png` | 6 × 1080×1920, upload in numeric order |
| Phone screenshots (pt-BR) | `publishApp/screenshots/pt/1-bracket.png` … `6-home.png` | 6 × 1080×1920, upload in numeric order |
| Tablet screenshots | — | Optional; skip |

Use the `pt` files in the Portuguese (Brazil) translation of the listing. See `publishApp/README.md` for details.

---

## 7. Build artifact for upload

Play accepts **AAB**, not APK, for production.

### Signing (one-time, local secrets — never commit)

```bash
keytool -genkey -v -keystore android/upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
cp android/keystore.properties.example android/keystore.properties
# Edit android/keystore.properties: storeFile, storePassword, keyAlias, keyPassword
```

Example keys in `android/keystore.properties.example`:

```
storeFile=upload-keystore.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=upload
keyPassword=YOUR_KEY_PASSWORD
```

Ignored by git: `*.jks`, `*.keystore`, `android/keystore.properties`.

Enable **Play App Signing** when creating the app (Google holds the app signing key; this keystore is the upload key). Back up the keystore offline.

### Release command

```bash
npm run android:release
```

Output:

```
android/app/build/outputs/bundle/release/app-release.aab
```

Version fields to bump on every upload:

- `android/app/build.gradle` → `versionCode`, `versionName`
- `package.json` → `version` (keep in sync with `versionName`)

---

## 8. Play Console workflow

1. Google Play developer account ($25 one-time) + identity verification complete (personal account: **ManyTheDeveloper** / `eder.rebernisek@gmail.com`).
2. Create app with package name **`gg.startmanager.app`** (must match the AAB).
3. Fill Store listing (name, descriptions, graphics, privacy URL, website, support email).
4. Complete Data safety, Content rating, Target audience, News apps / COVID / Finance declarations as **No** where not applicable.
5. Upload AAB to **Internal testing** → smoke test on a device.
6. Promote to **Closed testing**. Personal accounts created after Nov 2023 typically need **at least 12 testers for 14 consecutive days** before applying for production.
7. Apply for **Production** after closed-test requirements and policy review.

### Closed testing (personal account)

- Recruit **≥ 12 testers** who opt in and keep the closed track active for **14 consecutive days**.
- Closed-testing **opt-in link**: **TODO** — not available yet; paste the Play Console closed-test join URL here once Console generates it (Testing → Closed testing → Testers → copy link).
- Use the contact email above when inviting testers who need a reply path outside GitHub issues.

### Smoke test checklist (release build)

- [ ] Token-less bracket viewing works
- [ ] Personal token login works
- [ ] Report a set (with admin token)
- [ ] Entrant add/rename/remove if session used
- [ ] EN / PT language switch
- [ ] Settings → Privacy policy link opens the hosted policy

---

## 9. Technical summary for bots / reviewers

| Item | Detail |
| --- | --- |
| Stack | Angular 22 + Capacitor 8 Android |
| Repo | https://github.com/erebernisek/startgg-manager-v2 |
| Auth model | No OAuth client secret in the app. Personal API token for edits; view-only via start.gg website GraphQL with Capacitor native HTTP on Android |
| Data storage | Capacitor Preferences (device-local); not backed up to cloud (`allowBackup=false`) |
| Third-party network | start.gg HTTPS endpoints only (plus optional user-configured CORS proxy on web builds — not required on Android) |

---

## 10. Pre-submit checklist

- [ ] Privacy URL returns 200 on GitHub Pages
- [ ] Signed `app-release.aab` with `versionCode` 1 / `versionName` 1.0.0
- [ ] 512 icon + 1024×500 feature graphic + ≥2 phone screenshots uploaded
- [ ] EN short + full description pasted (PT-BR if adding locale)
- [ ] Data safety filled per section 4
- [ ] Content rating + 13+ audience completed
- [ ] App access notes pasted (section 3)
- [ ] Non-affiliation disclaimer in full description
- [ ] Upload keystore backed up offline
- [ ] Closed-testing testers recruited (≥12 / 14 days for personal account)
- [ ] Closed-testing opt-in link copied into this brief (TODO until Console provides it)
