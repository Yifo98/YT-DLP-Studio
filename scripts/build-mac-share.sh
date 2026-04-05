#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_ROOT/release"
TOOLS_DIR="$PROJECT_ROOT/tools"
TOOLS_BIN_DIR="$TOOLS_DIR/bin"
TOOLS_LIB_DIR="$TOOLS_DIR/lib"
README_PATH="$RELEASE_DIR/README-mac.txt"
APP_VERSION="$(node -p "require('$PROJECT_ROOT/package.json').version")"
VERSION_DIR="$RELEASE_DIR/$APP_VERSION"
DEFAULT_ENV_ROOT="$HOME/.conda/envs/yt-dlp"
ENV_ROOT="${YTDLP_ENV_ROOT:-$DEFAULT_ENV_ROOT}"
ARCH_NAME="$(uname -m)"
YTDLP_VERSION="${YTDLP_VERSION:-2025.12.08}"
DENO_VERSION="${DENO_VERSION:-2.7.5}"

case "$ARCH_NAME" in
  arm64)
    DENO_ARCHIVE_NAME="deno-aarch64-apple-darwin.zip"
    BUILDER_ARCH_FLAG="--arm64"
    ;;
  x86_64)
    DENO_ARCHIVE_NAME="deno-x86_64-apple-darwin.zip"
    BUILDER_ARCH_FLAG="--x64"
    ;;
  *)
    echo "Unsupported macOS architecture: $ARCH_NAME"
    exit 1
    ;;
esac

YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp"
DENO_URL="https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/${DENO_ARCHIVE_NAME}"
ZIP_PRIVACY_PATTERN='cookie|history|config\.json|user[- ]data|electron-session|electron-user-data|subtitle-cleanup-config|api[_-]?key'

cleanup_tools() {
  rm -rf "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR"
}

prepare_release_dir() {
  mkdir -p "$RELEASE_DIR" "$VERSION_DIR"
  rm -rf "$RELEASE_DIR"/win-unpacked "$RELEASE_DIR"/mac-unpacked
  rm -f "$RELEASE_DIR"/.DS_Store(N) "$VERSION_DIR"/.DS_Store(N)
  rm -f "$RELEASE_DIR"/*mac*.zip(N) "$RELEASE_DIR"/*mac*.zip.blockmap(N) "$RELEASE_DIR"/*.txt(N) "$RELEASE_DIR"/latest-mac.yml(N)
  rm -f "$VERSION_DIR"/*mac*.zip(N) "$VERSION_DIR"/*.txt(N) "$VERSION_DIR"/latest-mac.yml(N)
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

trap cleanup_tools EXIT

mkdir -p "$TOOLS_DIR"
cleanup_tools
mkdir -p "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR"
prepare_release_dir

cd "$PROJECT_ROOT"

if [[ ! -d "$ENV_ROOT" ]]; then
  echo "Missing yt-dlp Conda environment: $ENV_ROOT"
  exit 1
fi

if [[ ! -x "$ENV_ROOT/bin/ffmpeg" || ! -x "$ENV_ROOT/bin/ffprobe" ]]; then
  echo "Missing ffmpeg/ffprobe in $ENV_ROOT/bin"
  exit 1
fi

curl -L "$YTDLP_URL" -o "$TOOLS_BIN_DIR/yt-dlp"
chmod +x "$TOOLS_BIN_DIR/yt-dlp"

TMP_DENO_DIR="$(mktemp -d)"
curl -L "$DENO_URL" -o "$TMP_DENO_DIR/$DENO_ARCHIVE_NAME"
unzip -q "$TMP_DENO_DIR/$DENO_ARCHIVE_NAME" -d "$TMP_DENO_DIR"
mv "$TMP_DENO_DIR/deno" "$TOOLS_BIN_DIR/deno"
chmod +x "$TOOLS_BIN_DIR/deno"
rm -rf "$TMP_DENO_DIR"

cp "$ENV_ROOT/bin/ffmpeg" "$TOOLS_BIN_DIR/ffmpeg"
cp "$ENV_ROOT/bin/ffprobe" "$TOOLS_BIN_DIR/ffprobe"
chmod +x "$TOOLS_BIN_DIR/ffmpeg" "$TOOLS_BIN_DIR/ffprobe"

python3 - "$ENV_ROOT" "$TOOLS_LIB_DIR" "$TOOLS_BIN_DIR/ffmpeg" "$TOOLS_BIN_DIR/ffprobe" <<'PY'
import shutil
import subprocess
import sys
from pathlib import Path

env_root = Path(sys.argv[1])
lib_dir = Path(sys.argv[2])
targets = [Path(arg) for arg in sys.argv[3:]]
search_dirs = [
    env_root / "lib",
    Path("/opt/homebrew/lib"),
    Path("/usr/local/lib"),
]

copied: set[Path] = set()
queue = list(targets)

def deps_for(path: Path) -> list[str]:
    output = subprocess.check_output(["otool", "-L", str(path)], text=True)
    deps = []
    for line in output.splitlines()[1:]:
        line = line.strip()
        if not line:
            continue
        deps.append(line.split(" (compatibility version", 1)[0])
    return deps

def resolve_dep(dep: str) -> Path | None:
    if dep.startswith("/System/") or dep.startswith("/usr/lib/"):
      return None
    if dep.startswith("@rpath/"):
      base = dep.split("/", 1)[1]
      for search_dir in search_dirs:
        candidate = search_dir / base
        if candidate.exists():
          return candidate
      return None
    candidate = Path(dep)
    return candidate if candidate.exists() else None

while queue:
    current = queue.pop(0)
    for dep in deps_for(current):
        resolved = resolve_dep(dep)
        if resolved is None or resolved in copied:
            continue
        destination = lib_dir / resolved.name
        if not destination.exists():
            shutil.copy2(resolved, destination)
        copied.add(resolved)
        queue.append(destination)
PY

for executable in "$TOOLS_BIN_DIR/ffmpeg" "$TOOLS_BIN_DIR/ffprobe"; do
  install_name_tool -add_rpath "@executable_path/../lib" "$executable" 2>/dev/null || true
done

for dylib in "$TOOLS_LIB_DIR"/*.dylib(N); do
  install_name_tool -add_rpath "@loader_path" "$dylib" 2>/dev/null || true
done

npm run build
npx electron-builder --mac zip "$BUILDER_ARCH_FLAG"

MAC_ZIP="$(find "$RELEASE_DIR" -maxdepth 1 -type f -name '*mac.zip' | head -n 1)"
if [[ -z "$MAC_ZIP" ]]; then
  echo "macOS zip artifact was not created as expected."
  exit 1
fi

if unzip -l "$MAC_ZIP" | grep -Eiq "$ZIP_PRIVACY_PATTERN"; then
  echo "Sensitive files were detected inside the macOS zip artifact."
  exit 1
fi

cat > "$README_PATH" <<'EOF'
YT-DLP Studio for macOS

This build is an unsigned macOS app bundle packaged as a zip.
yt-dlp, ffmpeg, ffprobe, and deno are bundled inside the app.

Before first use on another Mac:
1. Unzip the archive.
2. Right-click "YT-DLP Studio.app" and choose "Open" the first time.

If Gatekeeper warns about the app being unsigned, use "Open Anyway" from
System Settings or right-click the app and choose "Open".
EOF

cp "$MAC_ZIP" "$VERSION_DIR/"
cp "$README_PATH" "$VERSION_DIR/"
rm -f "$RELEASE_DIR"/*mac*.zip.blockmap(N) "$RELEASE_DIR"/latest-mac.yml(N)
write_release_notes

echo "macOS app bundle:"
find "$RELEASE_DIR" -maxdepth 2 -name 'YT-DLP Studio.app' -print
echo
echo "macOS zip artifact:"
echo "$MAC_ZIP"
echo
echo "Share notes:"
echo "$README_PATH"
