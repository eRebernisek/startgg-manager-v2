# Publish to GitHub Pages

How this project is published for free at:

**https://erebernisek.github.io/startgg-manager-v2/**

## Prerequisites

- GitHub account
- Public repository (free Pages requires a public repo on a free personal account)
- Node.js 22+ (for local builds; CI uses Node 22)

## One-time setup

### 1. Repo is public

```bash
gh repo edit OWNER/REPO --visibility public --accept-visibility-change-consequences
```

Or: GitHub → repo → **Settings** → **General** → **Danger Zone** → Change visibility → Public.

### 2. Pages-friendly Angular build

Project sites live under `/REPO_NAME/`, so production assets need that base path.

In `angular.json`, a `github-pages` configuration sets:

```json
"baseHref": "/startgg-manager-v2/"
```

In `package.json`:

```json
"build:pages": "ng build --configuration=github-pages"
```

Default `npm run build` stays on `/` for Capacitor/Android. Only Pages uses `build:pages`.

Hash routing (`withHashLocation`) is already enabled, so client routes work without server rewrite rules.

### 3. GitHub Actions workflow

File: `.github/workflows/deploy-pages.yml`

On every push to `main` it:

1. Checks out the repo
2. Installs dependencies (`npm ci`)
3. Runs `npm run build:pages`
4. Adds `.nojekyll` (so GitHub does not ignore underscored paths)
5. Uploads `dist/startgg-manager-v2/browser` as a Pages artifact
6. Deploys with `actions/deploy-pages`

### 4. Enable GitHub Pages (Actions source)

```bash
gh api repos/OWNER/REPO/pages -X POST -f build_type=workflow
```

Or: **Settings** → **Pages** → Build and deployment → Source: **GitHub Actions**.

### 5. Push and wait

```bash
git add angular.json package.json .github/workflows/deploy-pages.yml README.md
git commit -m "chore: deploy static app to GitHub Pages on push to main"
git push origin main
```

Watch the run:

```bash
gh run list --limit 3
gh run watch
```

Site URL pattern:

`https://<username>.github.io/<repo>/`

## After it is live

1. Open the Pages URL — you can paste a start.gg event URL and **view** brackets without a token.
2. To **edit**, go to **Settings** and paste a [start.gg personal API token](https://start.gg/admin/profile/developer).
3. Editing unlocks when that token’s account is an admin of the tournament.

## Token-less view (CORS proxy)

The official API requires a personal token. TSH-style token-less reads use `www.start.gg/api/-/gql`, which browsers cannot call from `github.io` (CORS). The Worker in [`proxy/`](./proxy/) forwards POSTs with no secrets.

Default Worker URL is baked into the app (`DEFAULT_PUBLIC_PROXY_URL`). Redeploy:

```bash
npx wrangler deploy --config proxy/wrangler.toml
# or, without a Cloudflare login (temporary; claim within 60 minutes):
npx wrangler deploy --temporary --config proxy/wrangler.toml
```

Override the URL anytime in **Settings → Proxy URL**.

## Redeploying

Push to `main`. The workflow rebuilds and redeploys automatically. No extra fee.

## Limits / notes

| Topic | Detail |
| --- | --- |
| Cost | Free for public repos |
| View without token | Yes — website GraphQL via `proxy/` Worker |
| Entrants admin (add/rename/remove) | Needs `gg_session` (+ same proxy); browser CORS blocks the website API |
| Secrets | Never bake the API token into the build; users paste it in Settings |
| Android APK | Use `npm run build` + Capacitor; do not use `baseHref` `/startgg-manager-v2/` for the app |

## Manual deploy (optional)

Without Actions:

```bash
npm ci
npm run build:pages
# upload contents of dist/startgg-manager-v2/browser to any static host
```

For a branch-based Pages setup you would push that folder to a `gh-pages` branch; this project uses the Actions flow above instead.
