# Kwick — VPS deployment & Git workflow

Production runs on **OVH VPS** via Docker Compose. Code is deployed by **pushing to GitHub** and **pulling on the server** — do not copy files manually unless Git is unavailable.

---

## Quick reference

| Item | Value |
|------|--------|
| **GitHub repo** | `git@github.com:design2kreativefolio-hub/kwick-crm.git` (private) |
| **Branch** | `main` |
| **Live app path on VPS** | `/opt/kwick` |
| **VPS user** | `debian` |
| **Live site** | https://kwick.kreativefolio.com |
| **Compose (prod)** | `docker compose -f docker-compose.yml -f docker-compose.prod.yml` |

Legacy backup folders (keep until no longer needed):

- `/home/debian/kwick` — old live copy before Git migration
- `/home/debian/kwick-old` — older backup

---

## Every deploy (normal workflow)

### 1. On your PC (Windows)

```powershell
cd "C:\Users\Hp\Desktop\Projects\Kwick - Revamp"
git add .
git commit -m "describe your change"
git push origin main
```

### 2. On the VPS

```bash
cd /opt/kwick
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python manage.py migrate
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend frontend
```

Or run the helper script (after pull):

```bash
cd /opt/kwick
bash scripts/deploy-vps.sh
```

### 3. Verify

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs backend --tail 50
```

Open https://kwick.kreativefolio.com and smoke-test the changed area.

---

## One-time VPS setup (private repo)

### SSH deploy key (recommended)

On the VPS:

```bash
ssh-keygen -t ed25519 -C "kwick-vps-deploy" -f ~/.ssh/kwick_deploy -N ""
cat ~/.ssh/kwick_deploy.pub
```

Add the printed public key in GitHub:

**Repo → Settings → Deploy keys → Add deploy key** (read-only is enough)

Configure SSH:

```bash
nano ~/.ssh/config
```

```
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/kwick_deploy
  IdentitiesOnly yes
```

```bash
chmod 600 ~/.ssh/config ~/.ssh/kwick_deploy
ssh -T git@github.com
```

### Clone (first time only)

```bash
sudo mkdir -p /opt/kwick
sudo chown $USER:$USER /opt/kwick
cd /opt/kwick
git clone git@github.com:design2kreativefolio-hub/kwick-crm.git .
```

### Production `.env`

Copy from the previous install if migrating:

```bash
cp /home/debian/kwick/.env /opt/kwick/.env
```

Never commit `.env`. Never overwrite production `.env` with `.env.example`.

### First start

```bash
cd /opt/kwick
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python manage.py migrate
```

---

## Data safety

Docker stores persistent data in **named volumes**, not in the git folder:

| Volume | Contents |
|--------|----------|
| `kwick_pgdata` | PostgreSQL database |
| `kwick_media` | Uploaded files |
| `kwick_redisdata` | Redis |
| `kwick_static` | Collected static files |

| Command | Safe? |
|---------|-------|
| `docker compose down` | ✅ Stops containers; **keeps data** |
| `git pull` | ✅ Code only |
| `docker compose down -v` | ❌ **Deletes all volumes and data** |

Optional backup before major changes:

```bash
cd /opt/kwick
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > ~/kwick-db-backup-$(date +%F).sql
```

---

## TLS / nginx

Production HTTPS uses `docker-compose.prod.yml` and certs under `/etc/letsencrypt`. See [`nginx/README.md`](../nginx/README.md).

---

## Troubleshooting

**`git pull` asks for password** — SSH key not set up; use deploy key flow above.

**Site up but old code** — rebuild frontend/backend:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend frontend
```

**Migration errors** — read the traceback, fix locally, push, pull, migrate again.

**Permission denied (GitHub)** — re-add deploy key or check `~/.ssh/config` points to `~/.ssh/kwick_deploy`.
