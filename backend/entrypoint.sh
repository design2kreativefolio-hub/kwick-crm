#!/usr/bin/env bash
set -e

# Only the web role runs migrations / collectstatic; workers just wait for the DB.
ROLE="${CONTAINER_ROLE:-web}"

echo "[entrypoint] waiting for Postgres at ${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}..."
until python -c "import socket,os,sys; s=socket.socket(); s.settimeout(2); s.connect((os.environ.get('POSTGRES_HOST','postgres'), int(os.environ.get('POSTGRES_PORT','5432')))); s.close()" 2>/dev/null; do
  sleep 1
done
echo "[entrypoint] Postgres is up."

if [ "$ROLE" = "web" ]; then
  echo "[entrypoint] running migrations..."
  python manage.py migrate --noinput --skip-checks
  echo "[entrypoint] collecting static..."
  python manage.py collectstatic --noinput || true
fi

exec "$@"
