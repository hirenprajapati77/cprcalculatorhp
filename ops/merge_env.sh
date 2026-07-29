#!/usr/bin/env bash
# Merge uploaded .env.server into production .env without wiping server-only keys.
set -euo pipefail

APP_DIR=/home/ubuntu/cpr-calculator-platform
SERVER_ENV="$APP_DIR/.env"
INCOMING=/home/ubuntu/cpr.env.server
BACKUP="$APP_DIR/.env.bak.$(date +%Y%m%d-%H%M%S)"
MERGED=$(mktemp)

cleanup() {
  rm -f "$MERGED" "${MERGED}.tmp" 2>/dev/null || true
}
trap cleanup EXIT

if [ ! -f "$INCOMING" ]; then
  echo "Missing incoming env file $INCOMING" >&2
  exit 1
fi

if [ -f "$SERVER_ENV" ]; then
  cp "$SERVER_ENV" "$BACKUP"
  cp "$SERVER_ENV" "$MERGED"
else
  : > "$MERGED"
fi

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    ''|\#*) continue ;;
  esac
  key="${line%%=*}"
  if [ -z "$key" ] || [ "$key" = "$line" ]; then
    continue
  fi
  if grep -qE "^${key}=" "$MERGED"; then
    grep -vE "^${key}=" "$MERGED" > "${MERGED}.tmp"
    mv "${MERGED}.tmp" "$MERGED"
  fi
  printf '%s\n' "$line" >> "$MERGED"
done < "$INCOMING"

mv "$MERGED" "$SERVER_ENV"
chmod 600 "$SERVER_ENV"
rm -f "$INCOMING"
echo "Merged .env.server into $SERVER_ENV (backup: $BACKUP)"
