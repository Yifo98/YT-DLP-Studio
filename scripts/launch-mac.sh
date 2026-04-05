#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_ENV_ROOT="$HOME/.conda/envs/yt-dlp"
ENV_ROOT="${YTDLP_ENV_ROOT:-$DEFAULT_ENV_ROOT}"
DEFAULT_DENO_BIN="/opt/homebrew/bin/deno"

if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
  echo "Missing node_modules in $PROJECT_ROOT"
  echo "Installing dependencies first..."
  cd "$PROJECT_ROOT"
  npm install
fi

if [[ -d "$ENV_ROOT" ]]; then
  HAS_CONDA_ENV="1"
else
  HAS_CONDA_ENV="0"
fi

if [[ -x "${DENO_BIN:-}" ]]; then
  SELECTED_DENO_BIN="$DENO_BIN"
elif [[ -x "$DEFAULT_DENO_BIN" ]]; then
  SELECTED_DENO_BIN="$DEFAULT_DENO_BIN"
elif command -v deno >/dev/null 2>&1; then
  SELECTED_DENO_BIN="$(command -v deno)"
else
  SELECTED_DENO_BIN=""
fi

if [[ "$HAS_CONDA_ENV" == "1" ]]; then
  export YTDLP_ENV_ROOT="$ENV_ROOT"
  export PATH="$ENV_ROOT/bin:${SELECTED_DENO_BIN:+$(dirname "$SELECTED_DENO_BIN"):}$PATH"
else
  export PATH="${SELECTED_DENO_BIN:+$(dirname "$SELECTED_DENO_BIN"):}$PATH"
fi

if [[ -n "$SELECTED_DENO_BIN" ]]; then
  export DENO_BIN="$SELECTED_DENO_BIN"
fi

cd "$PROJECT_ROOT"

echo "Launching YT-DLP Studio on macOS..."
echo "Project root: $PROJECT_ROOT"
if [[ "$HAS_CONDA_ENV" == "1" ]]; then
  echo "Tool env: $YTDLP_ENV_ROOT"
else
  echo "Tool env: not found, falling back to bundled tools or PATH"
fi
if [[ -n "${DENO_BIN:-}" ]]; then
  echo "Deno: $DENO_BIN"
else
  echo "Deno: not found in Homebrew or PATH"
fi

npm run dev
