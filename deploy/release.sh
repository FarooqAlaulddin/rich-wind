#!/usr/bin/env bash
# Install an `npm pack` tarball as a new release, switch to it, and roll back
# automatically if /health does not come up. Usage: release.sh <package.tgz>
set -euo pipefail

APP_DIR="${RW_APP_DIR:-/opt/rich-wind}"
SERVICE="${RW_SERVICE:-rich-wind}"
HEALTH_URL="${RW_HEALTH_URL:-http://127.0.0.1:3001/health}"
KEEP="${KEEP_RELEASES:-5}"
TRIES="${RW_HEALTH_TRIES:-30}"
SUDO="${RW_SUDO:-sudo}"   # set RW_SUDO= (empty) when running as root

TARBALL="${1:?usage: release.sh <package.tgz>}"
[ -f "$TARBALL" ] || { echo "not a file: $TARBALL" >&2; exit 2; }

RELEASES="$APP_DIR/releases"
CURRENT="$APP_DIR/current"
NEW="$RELEASES/$(date -u +%Y%m%dT%H%M%SZ)"

switch_to() {
  # Atomic: build a temp link, then rename it over `current`.
  ln -sfn "$1" "$APP_DIR/.current.tmp"
  mv -T "$APP_DIR/.current.tmp" "$CURRENT"
}

healthy() {
  local i
  for ((i = 1; i <= TRIES; i++)); do
    if curl -fsS -o /dev/null "$HEALTH_URL"; then return 0; fi
    sleep 1
  done
  return 1
}

mkdir -p "$RELEASES"
PREV=""
[ -L "$CURRENT" ] && PREV="$(readlink -f "$CURRENT")"

mkdir "$NEW"
tar -xzf "$TARBALL" -C "$NEW" --strip-components=1
(cd "$NEW" && npm install --omit=dev --no-audit --no-fund)

switch_to "$NEW"
$SUDO systemctl restart "$SERVICE"

if healthy; then
  echo "release $NEW is healthy"
else
  echo "health check failed for $NEW" >&2
  if [ -n "$PREV" ]; then
    switch_to "$PREV"
    $SUDO systemctl restart "$SERVICE"
    echo "rolled back to $PREV; failed release kept at $NEW" >&2
  else
    echo "no previous release to roll back to; failed release kept at $NEW" >&2
  fi
  exit 1
fi

# Prune only after a healthy start. Never remove the current or previous release.
NEW_REAL="$(readlink -f "$NEW")"
PREV_REAL="${PREV:+$(readlink -f "$PREV" 2>/dev/null || true)}"
count=0
for dir in $(ls -1d "$RELEASES"/*/ 2>/dev/null | sort -r); do
  dir="${dir%/}"
  count=$((count + 1))
  [ "$count" -le "$KEEP" ] && continue
  real="$(readlink -f "$dir")"
  [ "$real" = "$NEW_REAL" ] && continue
  [ -n "$PREV_REAL" ] && [ "$real" = "$PREV_REAL" ] && continue
  rm -rf -- "$dir"
done
