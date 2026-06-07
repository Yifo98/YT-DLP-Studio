# Privacy Policy

XF MediaCookies has one purpose: help users export selected site cookies from their own Chrome browser into files that Media Dock can read.

## Data Access

The extension declares Chrome site permissions for common Media Dock services and an optional `<all_urls>` host permission. The optional permission is requested only when the user clicks Preview, because Chrome requires host permission before an extension can inspect browser cookies across sites. By default, the preview keeps only cookies that match the official [yt-dlp supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md); unmatched cookies are counted and then excluded from the selectable/exportable preview. Users can explicitly switch to an advanced all-cookie preview mode.

## Data Use

Cookie data is used only to build local export files:

- `cookies.txt`
- `by-service/*.cookies.txt`
- `by-domain/*.cookies.txt`
- `manifest.json`
- `common-profile.json`
- `README.txt`

The preview screen shows cookie metadata such as domain, cookie name, path, expiry, `HttpOnly`, and `Secure`. It does not display cookie values.

Preview data is held only in the popup's current memory state. The extension does not create preview cache files, and users can clear the current preview table with the Clear Preview button.

## Data Sharing

The extension does not upload, sell, share, or transmit cookie data. It does not include analytics, telemetry, remote logging, or advertising code.

## Passwords

The extension does not read, export, request, or store passwords.

The extension may recommend that users sign in with the site's normal account/password flow before export. That recommendation is only about refreshing the browser's cookie login state; the extension still cannot see or export the password.

## Storage

The extension stores only source IDs in Chrome local extension storage: the user's current selected service list and optional Common profile. It does not store cookie values, exported cookies, preview tables, passwords, or downloaded ZIP contents after generation.

Users can export the Common profile as a JSON file and keep that file next to their Media Dock folder for portable reuse. That JSON contains only source IDs and timestamps; it does not contain cookie values.

## User Control

Users manually choose which services to export and manually confirm the browser download. Users can delete exported ZIP files at any time.
