#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_ROOT/release"
TOOLS_DIR="$PROJECT_ROOT/tools"
TOOLS_BIN_DIR="$TOOLS_DIR/bin"
TOOLS_LIB_DIR="$TOOLS_DIR/lib"
TMP_DIR="$(mktemp -d)"
YTDLP_VERSION="${YTDLP_VERSION:-2025.12.08}"
DENO_VERSION="${DENO_VERSION:-2.7.5}"
YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp.exe"
DENO_URL="https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-x86_64-pc-windows-msvc.zip"
FFMPEG_URL="${FFMPEG_URL:-https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip}"

cleanup() {
  rm -rf "$TMP_DIR" "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR"
}

trap cleanup EXIT

mkdir -p "$RELEASE_DIR" "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR"
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

if unzip -l "$WIN_ZIP" | grep -Eiq 'cookie|subtitle-cleanup-config|user data'; then
  echo "Sensitive files were detected inside the Windows zip artifact."
  exit 1
fi

echo "Windows portable artifact:"
echo "$WIN_PORTABLE_EXE"
echo
echo "Windows zip artifact:"
echo "$WIN_ZIP"
