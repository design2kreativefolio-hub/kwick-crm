# Nginx / TLS notes

Placeholder domains are used throughout (`yourdomain.com`, `api.yourdomain.com`).
Swap them in [`nginx.conf`](./nginx.conf) and the root `.env` once DNS is ready.

## Enabling HTTPS (Let's Encrypt)

The simplest path on the VPS is Certbot in a companion container or on the host:

1. Point both A-records (`yourdomain.com`, `api.yourdomain.com`) at the VPS IP.
2. Uncomment the `443` port and the `certs` volume mount in `docker-compose.yml`.
3. Obtain certs (host Certbot example):
   ```bash
   sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com -d api.yourdomain.com
   ```
4. Mount `/etc/letsencrypt/live/<domain>/` into `./nginx/certs` and add `ssl_certificate` /
   `ssl_certificate_key` directives plus an HTTP→HTTPS redirect to each server block.
5. Reload: `docker compose exec nginx nginx -s reload`.

## IP-only testing (no domain yet)

Replace the two `server` blocks with one catch-all that routes by path:

```nginx
server {
    listen 80;
    server_name _;

    location /static/ { alias /var/www/static/; }
    location /media/  { alias /var/www/media/;  }

    location /api/ { proxy_pass http://backend; include /etc/nginx/proxy_common.conf; }
    location /ws/  { proxy_pass http://backend; # + upgrade headers }
    location /     { proxy_pass http://frontend; # + upgrade headers }
}
```

Then set `NEXT_PUBLIC_API_BASE_URL=http://<vps-ip>` (same origin) in `.env`.
