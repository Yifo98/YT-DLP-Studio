# YT-DLP Studio 1.0.1

## Summary

This release refreshes the shared desktop package with the latest download flow and telemetry improvements.

## Included artifacts

- `YT-DLP Studio-1.0.1-arm64-mac.zip`
- `YT-DLP Studio-1.0.1-win.zip`
- `YT-DLP Studio 1.0.1.exe`
- `README-mac.txt`

## Highlights

- Fixed real-time download progress so active jobs now report incremental progress instead of jumping straight to 100 percent
- Reworked the download panel so the main action buttons are easier to reach
- Split telemetry into clearer sections for queue overview and active download focus
- Kept bundled `yt-dlp` `ffmpeg` `ffprobe` and `deno` inside the standard shared builds
- Refined runtime refresh cookies guidance and local media tool integration

## Packaging and privacy

- Shared builds are intended to be unpack-and-run
- Packaging scripts now clear old platform artifacts before building new ones
- Packaging scripts verify that cookies history user-data session files subtitle cleanup configs API keys and similar private files are not included in release archives
- macOS and Windows builds are currently unsigned so first-run security prompts are expected
