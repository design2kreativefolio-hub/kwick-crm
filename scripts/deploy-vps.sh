#!/usr/bin/env bash
# Run on the VPS from /opt/kwick after `git pull origin main`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

echo "==> Rebuilding backend, workers, and frontend..."
$COMPOSE up -d --build backend frontend celery-worker celery-beat

echo "==> Reloading nginx (picks up nginx.prod.conf bind mount)..."
$COMPOSE exec -T nginx nginx -s reload

echo "==> Status:"
$COMPOSE ps

echo "Done. Check https://kwick.kreativefolio.com"
