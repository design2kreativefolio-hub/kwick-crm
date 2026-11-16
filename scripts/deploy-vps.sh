#!/usr/bin/env bash
# Run on the VPS from /opt/kwick after `git pull origin main`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

echo "==> Rebuilding backend, workers, and frontend..."
$COMPOSE up -d --build backend frontend celery-worker celery-beat

# nginx.prod.conf is a single-file bind mount: `git pull` replaces the file, but
# a running container keeps the OLD copy, so `nginx -s reload` silently reloads
# stale config. Recreating the container (a few seconds) picks up the new file.
echo "==> Recreating nginx so it picks up nginx.prod.conf..."
$COMPOSE up -d --force-recreate nginx

echo "==> Status:"
$COMPOSE ps

echo "Done. Check https://kwick.kreativefolio.com"
