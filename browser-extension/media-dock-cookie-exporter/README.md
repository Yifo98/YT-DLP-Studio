# XF MediaCookies

Chrome extension for exporting selected browser cookies into Media Dock compatible `cookies.txt` packages.

## What It Does

- Preview scans the current browser cookies in memory, then lets users choose what to export.
- Defaults to keeping only cookies that match the official [yt-dlp supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md). Unmatched cookies are counted, then excluded from the selectable/exportable preview.
- Provides an advanced "all cookies" mode for users who explicitly need every browser cookie.
- Provides Common, Select All, and Clear actions after preview. The built-in Common profile defaults to the steadier Bilibili and YouTube sources; Douyin and TikTok remain selectable, but are not selected by Common unless the user saves them into a custom profile.
- Lets users save the current selected sources as a Common profile, export that profile as JSON, and import it again on another machine. The profile contains only source IDs, not cookie values.
- Links to the official [yt-dlp supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md) for broader extractor coverage.
- Shows a local preview with domain, name, path, expiry, `HttpOnly`, `Secure`, and service grouping.
- Shows missing key login markers per service before export.
- Preview data stays in the current popup session only. Use Clear Preview to remove the temporary preview table from memory.
- Exports a ZIP containing:
  - `cookies.txt`
  - `by-service/<service>.cookies.txt`
  - `by-domain/<domain>.cookies.txt`
  - `manifest.json`
  - `common-profile.json`
  - `README.txt`
- Keeps all processing local in the browser.

## What It Does Not Do

- Does not read, export, or store passwords.
- Does not upload cookies or account data.
- Does not run analytics or telemetry.
- Does not bypass login, membership, captcha, or platform risk-control requirements.
- Does not create preview cache files. The only files written by the extension are user-confirmed downloads: the cookie ZIP, optional preview diagnostic log, and optional Common profile JSON.
- Does not store cookie values in extension storage. It stores only selected source IDs and the optional Common profile source IDs.
- A service being listed by yt-dlp does not guarantee every target URL will download successfully; site encryption, login state, membership, captcha, and risk-control rules can still block downloads.

## Local Development

From the Media Dock repo root:

```bash
npm run extension:build
```

Then load this folder in Chrome:

```text
browser-extension/media-dock-cookie-exporter/dist
```

Chrome path:

```text
chrome://extensions -> Developer mode -> Load unpacked
```

## Package for Chrome Web Store

```bash
npm run extension:pack
```

The upload ZIP is written to:

```text
release/extensions/media-dock-cookie-exporter-<version>.zip
```

The extension uses the `XF` prefix so it can sit next to other XF browser tools in Chrome Web Store and local extension lists. Runtime icons use AI icon option 2 selected by 小夫. The source image is kept at `assets/icon-option-2-source.png`, and the Chrome runtime icons are generated as 16/32/48/128 PNG files.

## Media Dock Usage

1. Export a ZIP from the extension.
2. Open Media Dock and use the Cookies area to import the ZIP directly.
3. If importing manually, unzip it and put the exported folder or selected `by-service/*.cookies.txt` files into `Media Dock Data/cookies/`.
4. Paste a target link; Media Dock will recommend the best matching cookie file.
5. If you want the same Common source choices on another machine, export the Common profile JSON and keep it next to the Media Dock folder, then import it from the extension on that machine.

Cookie files are sensitive login data. Keep them local and never commit them.

## Recommended Flow

### Windows Chrome

1. Open the target site in the same Chrome profile.
2. When possible, refresh the normal site login in the same browser profile before export.
3. Open and play the target content once so the site refreshes the browser login state.
4. Open the extension, select the needed services, and click Preview.
5. Click Common for the built-in Bilibili/YouTube profile, or manually select sources and save them as your Common profile.
6. If the selected service still shows missing key login markers, sign out and sign in again, then preview again.
7. Export ZIP and import it from Media Dock's Cookies area.

### Douyin / TikTok Notes

yt-dlp lists Douyin and TikTok as supported, but not every page URL is a download target:

- Douyin works best with `https://www.douyin.com/video/<id>`. Popup, featured, or recommendation pages may need to be opened and copied again as a direct video URL.
- TikTok works best with `https://www.tiktok.com/@user/video/<id>` or `vm.tiktok.com` / `vt.tiktok.com` share links. `/foryou` is a feed page, not a direct video.

For that reason, Douyin and TikTok are visible and exportable, but not part of the built-in Common profile.

### macOS Chrome

Use the same flow as Windows. If you loaded the unpacked extension manually, reload it from `chrome://extensions` after every rebuild.

### Atlas / Other Chromium Browsers

Atlas may not expose every Chrome extension API consistently. If clicking the extension does nothing, reload the latest built `dist` folder, confirm extension permissions are enabled, then test again. For final download testing, use Google Chrome first as the baseline.
