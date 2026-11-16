#!/usr/bin/env bash
# Nightly Kwick backup -> encrypted -> Google Drive (via rclone).
# Run on the VPS from cron. Setup + restore steps: docs/BACKUPS.md
#
# Backs up:  Postgres dump + uploaded media files.
# NOT backed up (on purpose): .env / PASSWORD_VAULT_KEY. Keep the vault key
# somewhere separate - a backup that contains both the data and its key defeats
# the encryption.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
REMOTE="${BACKUP_REMOTE:-gdrive:kwick-backups}"       # rclone remote:folder
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
PASS_FILE="${BACKUP_PASS_FILE:-$ROOT/.backup-passphrase}"
STAGE="$(mktemp -d /var/tmp/kwick-backup.XXXXXX)"
STAMP="$(date -u +%Y-%m-%d_%H%M)"
HEALTHCHECK_URL="${BACKUP_HEALTHCHECK_URL:-}"         # optional (healthchecks.io)

cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT
fail() {
  echo "[backup] FAILED: $*" >&2
  [ -n "$HEALTHCHECK_URL" ] && curl -fsS -m 10 "$HEALTHCHECK_URL/fail" >/dev/null 2>&1 || true
  exit 1
}

[ -s "$PASS_FILE" ] || fail "passphrase file missing or empty: $PASS_FILE"
command -v rclone >/dev/null || fail "rclone is not installed"

encrypt() {  # stdin -> stdout, AES-256 with the passphrase file
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$PASS_FILE"
}

echo "[backup] dumping database..."
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' \
  | gzip -9 > "$STAGE/db.sql.gz" || fail "pg_dump"
gzip -t "$STAGE/db.sql.gz" || fail "database dump is corrupt"
[ "$(stat -c %s "$STAGE/db.sql.gz")" -gt 2048 ] || fail "database dump is suspiciously small"
encrypt < "$STAGE/db.sql.gz" > "$STAGE/kwick-db-$STAMP.sql.gz.enc"
rm -f "$STAGE/db.sql.gz"

echo "[backup] archiving uploaded files..."
$COMPOSE exec -T backend tar czf - -C /app mediafiles > "$STAGE/media.tar.gz" || fail "media archive"
gzip -t "$STAGE/media.tar.gz" || fail "media archive is corrupt"
encrypt < "$STAGE/media.tar.gz" > "$STAGE/kwick-media-$STAMP.tar.gz.enc"
rm -f "$STAGE/media.tar.gz"

echo "[backup] uploading to $REMOTE ..."
rclone copy "$STAGE" "$REMOTE" --include "kwick-*.enc" || fail "upload to Google Drive"

echo "[backup] pruning backups older than ${KEEP_DAYS} days..."
rclone delete "$REMOTE" --min-age "${KEEP_DAYS}d" --include "kwick-*.enc" || echo "[backup] warning: prune failed"

echo "[backup] OK $STAMP"
[ -n "$HEALTHCHECK_URL" ] && curl -fsS -m 10 "$HEALTHCHECK_URL" >/dev/null 2>&1 || true
