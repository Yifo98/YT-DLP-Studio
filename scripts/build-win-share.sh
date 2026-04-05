#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_ROOT/release"
TOOLS_DIR="$PROJECT_ROOT/tools"
TOOLS_BIN_DIR="$TOOLS_DIR/bin"
TOOLS_LIB_DIR="$TOOLS_DIR/lib"
TMP_DIR="$(mktemp -d)"
APP_VERSION="$(node -p "require('$PROJECT_ROOT/package.json').version")"
VERSION_DIR="$RELEASE_DIR/$APP_VERSION"
YTDLP_VERSION="${YTDLP_VERSION:-2025.12.08}"
DENO_VERSION="${DENO_VERSION:-2.7.5}"
YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp.exe"
DENO_URL="https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-x86_64-pc-windows-msvc.zip"
FFMPEG_URL="${FFMPEG_URL:-https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip}"
ZIP_PRIVACY_PATTERN='cookie|history|config\.json|user[- ]data|electron-session|electron-user-data|subtitle-cleanup-config|api[_-]?key'

cleanup() {
  rm -rf "$TMP_DIR" "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR"
}

prepare_release_dir() {
  mkdir -p "$RELEASE_DIR" "$VERSION_DIR"
  rm -rf "$RELEASE_DIR"/win-unpacked
  rm -f "$RELEASE_DIR"/.DS_Store(N) "$VERSION_DIR"/.DS_Store(N)
  rm -f "$RELEASE_DIR"/*win*.zip(N) "$RELEASE_DIR"/*.exe(N) "$RELEASE_DIR"/*win*.zip.blockmap(N) "$RELEASE_DIR"/builder-debug.yml(N)
  rm -f "$VERSION_DIR"/*win*.zip(N) "$VERSION_DIR"/*.exe(N)
}

write_release_notes() {
  cat > "$VERSION_DIR/RELEASE-NOTES.md" <<EOF
# YT-DLP Studio $APP_VERSION

## Summary

This release refreshes the shared desktop package with the latest download flow and telemetry improvements.

## Included artifacts

- \`YT-DLP Studio-$APP_VERSION-arm64-mac.zip\`
- \`YT-DLP Studio-$APP_VERSION-win.zip\`
- \`YT-DLP Studio $APP_VERSION.exe\`
- \`README-mac.txt\`

## Highlights

- Fixed real-time download progress so active jobs now report incremental progress instead of jumping straight to 100 percent
- Reworked the download panel so the main action buttons are easier to reach
- Split telemetry into clearer sections for queue overview and active download focus
- Kept bundled \`yt-dlp\` \`ffmpeg\` \`ffprobe\` and \`deno\` inside the standard shared builds
- Refined runtime refresh cookies guidance and local media tool integration

## Packaging and privacy

- Shared builds are intended to be unpack-and-run
- Packaging scripts now clear old platform artifacts before building new ones
- Packaging scripts verify that cookies history user-data session files subtitle cleanup configs API keys and similar private files are not included in release archives
- macOS and Windows builds are currently unsigned so first-run security prompts are expected
EOF
}

trap cleanup EXIT

prepare_release_dir
mkdir -p "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR"
rm -rf "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR"
mkdir -p "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR"

cd "$PROJECT_ROOT"

curl -L "$YTDLP_URL" -o "$TOOLS_BIN_DIR/yt-dlp.exe"
curl -L "$DENO_URL" -o "$TMP_DIR/deno-win.zip"
unzip -q "$TMP_DIR/deno-win.zip" -d "$TMP_DIR/deno"
cp "$TMP_DIR/deno/deno.exe" "$TOOLS_BIN_DIR/deno.exe"

curl -L "$FFMPEG_URL" -o "$TMP_DIR/ffmpeg-win.zip"
unzip -q "$TMP_DIR/ffmpeg-win.zip" -d "$TMP_DIR/ffmpeg"
FFMPEG_EXE="$(find "$TMP_DIR/ffmpeg" -type f -name 'ffmpeg.exe' | head -n 1)"
FFPROBE_EXE="$(find "$TMP_DIR/ffmpeg" -type f -name 'ffprobe.exe' | head -n 1)"

if [[ -z "$FFMPEG_EXE" || -z "$FFPROBE_EXE" ]]; then
  echo "Failed to locate ffmpeg.exe or ffprobe.exe inside Windows FFmpeg archive."
  exit 1
fi

cp "$FFMPEG_EXE" "$TOOLS_BIN_DIR/ffmpeg.exe"
cp "$FFPROBE_EXE" "$TOOLS_BIN_DIR/ffprobe.exe"

npm run build
npx electron-builder --win portable zip --x64

WIN_ZIP="$(find "$RELEASE_DIR" -maxdepth 1 -type f -name '*win*.zip' | head -n 1)"
WIN_PORTABLE_EXE="$(find "$RELEASE_DIR" -maxdepth 1 -type f -name '*.exe' | head -n 1)"

if [[ -z "$WIN_ZIP" || -z "$WIN_PORTABLE_EXE" ]]; then
  echo "Windows build artifacts were not created as expected."
  exit 1
fi

if unzip -l "$WIN_ZIP" | grep -Eiq "$ZIP_PRIVACY_PATTERN"; then
  echo "Sensitive files were detected inside the Windows zip artifact."
  exit 1
fi

cp "$WIN_ZIP" "$VERSION_DIR/"
cp "$WIN_PORTABLE_EXE" "$VERSION_DIR/"
rm -rf "$RELEASE_DIR"/win-unpacked
rm -f "$RELEASE_DIR"/builder-debug.yml(N)
write_release_notes

echo "Windows portable artifact:"
echo "$WIN_PORTABLE_EXE"
echo
echo "Windows zip artifact:"
echo "$WIN_ZIP"
