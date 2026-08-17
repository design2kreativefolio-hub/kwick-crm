#!/usr/bin/env bash
# Run on the VPS from /opt/kwick after `git pull origin main`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

echo "==> Migrating database..."
$COMPOSE exec -T backend python manage.py migrate

echo "==> Rebuilding backend + frontend..."
$COMPOSE up -d --build backend frontend

echo "==> Status:"
$COMPOSE ps

echo "Done. Check https://kwick.kreativefolio.com"
