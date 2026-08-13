# Nginx / TLS notes

| Environment | Config | Command |
|-------------|--------|---------|
| **Local** | `nginx.conf` (HTTP only) | `docker compose up --build` |
| **VPS / prod** | `nginx.prod.conf` + SSL | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` |

Local does **not** need certificates. Production mounts `/etc/letsencrypt`.

## Enabling HTTPS on the VPS (Let's Encrypt)

1. DNS A-records for `kwick.kreativefolio.com` and `api.kwick.kreativefolio.com` → VPS IP.
2. Install Certbot and stop nginx briefly (standalone needs port 80):
   ```bash
   sudo apt update && sudo apt install -y certbot
   cd ~/kwick
   docker compose stop nginx
   sudo certbot certonly --standalone \
     -d kwick.kreativefolio.com \
     -d api.kwick.kreativefolio.com \
     --email design@kreativefolio.com \
     --agree-tos --non-interactive
   ```
3. Start with the prod compose file:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```
4. Set `.env` to `https://` / `wss://` and rebuild frontend.

Renewal tip: stop nginx before `certbot renew` if using standalone, then start again with the prod compose files.
