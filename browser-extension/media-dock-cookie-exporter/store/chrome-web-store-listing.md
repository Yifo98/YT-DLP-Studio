# Chrome Web Store Listing Draft

## Name

XF MediaCookies

## Short Description

Export selected site cookies as Media Dock compatible cookies.txt packages.

## Detailed Description

XF MediaCookies helps Media Dock users export cookies from selected video and media sites into local `cookies.txt` files.

The `XF` prefix matches the existing XF browser-tool family, such as XF FullPage Capture, so users can find related tools together.

Use it when a site requires a signed-in browser session for downloads in Media Dock. Pick the target services, preview cookie status, then export a ZIP containing a raw `cookies.txt`, service-specific files, domain-specific files, a manifest summary, and a source-only common profile.

The extension is built for local use:

- No password export.
- No network upload.
- No telemetry or analytics.
- No cookie values in `manifest.json`.
- No preview cache files; preview data stays in the current popup session until cleared or closed.
- Common profiles store only source IDs, not cookie values, and can be exported/imported as JSON for portable reuse.
- Default preview keeps only cookies that match the official yt-dlp supported sites list; unmatched cookies are counted and then excluded from selection/export.
- Advanced all-cookie preview is available only when the user explicitly selects it.
- The optional all-sites host permission is requested only when the user clicks Preview, because Chrome requires host permission before an extension can inspect cookies across sites.

The default filter is based on the official yt-dlp supported sites list: https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md. A service being listed by yt-dlp does not guarantee every target URL will download successfully; site encryption, login state, membership, captcha, and risk-control rules can still block downloads. Douyin and TikTok are selectable when detected, but the built-in Common profile stays conservative because these sites often require direct video/share URLs rather than feed pages.

For services that are sensitive to incomplete login cookies, the extension asks users to refresh the normal site login state first. It does not collect passwords; it only checks whether the browser has the expected cookie markers before export.

## Single Purpose

Export user-selected browser cookies into Media Dock compatible local files.

## Permission Justification

- `cookies`: Required to read cookies for user-selected supported sites.
- `downloads`: Required to save the export ZIP.
- `storage`: Required to remember the selected service list and optional Common profile source IDs locally. Cookie values are not stored.
- Host permissions: Common Media Dock services are declared for convenience. Optional `<all_urls>` host permission is requested only from the Preview button so the extension can locally analyze which browser cookies match yt-dlp supported sites, or all cookies when the user explicitly chooses advanced mode.

## Privacy Disclosure

The extension processes cookie data locally in Chrome. It does not export passwords, upload data, run telemetry, or share data with third parties.

## Screenshot Checklist

- Site selection panel with services selected.
- Preview panel showing cookie counts and login-state status.
- Export success message showing the generated ZIP name.

## Icon Status

The extension uses the `XF` prefix so it can sit next to 小夫's other XF browser tools. Runtime icons use AI icon option 2 selected by 小夫 and are included as `icons/icon16.png`, `icons/icon32.png`, `icons/icon48.png`, and `icons/icon128.png`.
