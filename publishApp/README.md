# SGG Manager — Play Store assets

Upload map for Google Play Console → **Grow → Store presence → Main store listing**.

| Console field | File | Spec check |
| --- | --- | --- |
| App icon | `icon/sgg-icon-512.png` | 512×512, 32-bit PNG (RGBA), full square, no rounded corners or shadow |
| Feature graphic (en-US) | `feature-graphic/feature-graphic-1024x500-en.png` | 1024×500, 24-bit PNG, no transparency |
| Feature graphic (pt-BR) | `feature-graphic/feature-graphic-1024x500-pt.png` | same |
| Phone screenshots (en-US) | `screenshots/en/1-bracket.png` … `6-home.png` | 6 × 1080×1920 PNG, upload in numeric order |
| Phone screenshots (pt-BR) | `screenshots/pt/1-bracket.png` … `6-home.png` | same |

The pt-BR files go in the **Portuguese (Brazil)** translation of the listing. If you only publish an English listing, use the `en` files.

## Current app icon (vector)

- `icon/sgg-icon.svg` — full launcher icon: black "SGG" on `#FF4655`, same proportions as `android/app/src/main/res/mipmap-*/ic_launcher.png`
- `icon/sgg-mark.svg` — the "SGG" mark alone, transparent background

Both use real glyph outlines from Noto Sans ExtraBold Italic, so they render the same everywhere without the font installed.

## Screenshot content

Captured from the real app (English and Portuguese UI) in view-only mode, using the public event *HAUNTED HOUSE #2 — FANTASMINHAS of AETHER [Singles]*. Players' legal names were removed from the Entrants screen; only public gamertags appear.

## Regenerating (`source/`)

The scripts expect a scratch working directory with `playwright-core` installed and `CHROME` pointing to a Chromium binary:

```bash
mkdir -p /tmp/shots && cp publishApp/source/*.js /tmp/shots && cd /tmp/shots
npm init -y && npm i playwright-core
export CHROME=~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome
# with `npx ng serve --port 4300` running in the repo:
node capture.js && node entrants.js   # raw app captures (en + pt)
node compose.js                        # framed screenshots -> publishApp/screenshots
node feature.js                        # feature graphic renders (then convert to RGB, see below)
```

`feature.js` writes `feature-<lang>.png` into the working directory; convert them to 24-bit RGB before uploading (for example with Pillow: `Image.open(p).convert('RGB').save(...)`). `make-mark.py` regenerates the vector mark (requires `fonttools`).
