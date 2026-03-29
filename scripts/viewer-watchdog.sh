#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/packages/web"
PORT="${PORT:-3010}"
LOG_FILE="${LOG_FILE:-/tmp/brian-viewer-watchdog.log}"
PID_FILE="${PID_FILE:-/tmp/brian-viewer-watchdog.pid}"
if [[ -x /opt/homebrew/bin/node ]]; then
  NODE_BIN="/opt/homebrew/bin/node"
else
  NODE_BIN="$(command -v node)"
fi

ensure_build_artifacts() {
  local missing=0
  [[ -f "$WEB_DIR/dist/server/custom-server.js" ]] || missing=1
  [[ -f "$WEB_DIR/.next/BUILD_ID" ]] || missing=1
  [[ -f "$WEB_DIR/.next/required-server-files.json" ]] || missing=1
  [[ -f "$WEB_DIR/.next/server/middleware-manifest.json" ]] || missing=1
  if [[ "$missing" -eq 1 ]]; then
    echo "viewer artifacts missing; rebuilding packages/web..."
    (cd "$ROOT_DIR" && npm run build --workspace=packages/web)
  fi
}

if [[ "${1:-}" == "stop" ]]; then
  if [[ -f "$PID_FILE" ]]; then
    kill "$(cat "$PID_FILE")" >/dev/null 2>&1 || true
    rm -f "$PID_FILE"
  fi
  pkill -f "custom-server.js" >/dev/null 2>&1 || true
  exit 0
fi

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1; then
  echo "watchdog already running: $(cat "$PID_FILE")"
  exit 0
fi

(
  echo "$$" >"$PID_FILE"
  trap 'rm -f "$PID_FILE"' EXIT
  cd "$WEB_DIR"
  ensure_build_artifacts
  while true; do
    printf '[%s] starting viewer on port %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PORT" >>"$LOG_FILE"
    PORT="$PORT" NODE_ENV=production "$NODE_BIN" dist/server/custom-server.js >>"$LOG_FILE" 2>&1 || true
    printf '[%s] viewer exited; restarting in 1s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$LOG_FILE"
    sleep 1
  done
) &

echo "watchdog started: $(cat "$PID_FILE")"
