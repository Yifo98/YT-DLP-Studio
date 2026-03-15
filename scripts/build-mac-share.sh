#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_ROOT/release"
TOOLS_DIR="$PROJECT_ROOT/tools"
TOOLS_BIN_DIR="$TOOLS_DIR/bin"
TOOLS_LIB_DIR="$TOOLS_DIR/lib"
README_PATH="$RELEASE_DIR/README-mac.txt"
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

cleanup_tools() {
  rm -rf "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR"
}

trap cleanup_tools EXIT

mkdir -p "$TOOLS_DIR" "$RELEASE_DIR"
cleanup_tools
mkdir -p "$TOOLS_BIN_DIR" "$TOOLS_LIB_DIR"

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

echo "macOS app bundle:"
find "$RELEASE_DIR" -maxdepth 2 -name 'YT-DLP Studio.app' -print
echo
echo "macOS zip artifact:"
find "$RELEASE_DIR" -maxdepth 1 -name '*.zip' -print
echo
echo "Share notes:"
echo "$README_PATH"
