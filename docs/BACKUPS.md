# Nightly backups to Google Drive

`scripts/backup.sh` dumps Postgres, archives uploaded media, encrypts both
(AES-256), uploads them to Google Drive with rclone, and deletes copies older
than 14 days. This is in addition to OVH's daily whole-server snapshot.

## One-time setup (on the VPS)

### 1. Install tools
```
sudo apt update && sudo apt install -y rclone openssl
```

### 2. Connect Google Drive
The VPS has no browser, so authorize on your own computer:

1. On your **PC** install rclone (https://rclone.org/downloads/) and run:
   `rclone authorize "drive" "" "" --drive-scope drive.file`
   (scope `drive.file` = rclone can only touch files it creates itself).
2. Sign in with the Google account in the browser window that opens and allow
   access. The terminal prints a long `{"access_token": ...}` block - copy it.
3. On the **VPS** run `rclone config`:
   - `n` (new remote) -> name: `gdrive` -> storage: `drive`
   - leave client id / secret blank, scope: `3` (drive.file)
   - "Use web browser to automatically authenticate?" -> **n**
   - paste the token block from step 2 -> not a shared drive -> save.
4. Test: `rclone mkdir gdrive:kwick-backups && rclone lsd gdrive:`

### 3. Create the encryption passphrase
```
cd /opt/kwick
openssl rand -base64 32 > .backup-passphrase
chmod 600 .backup-passphrase
cat .backup-passphrase
```
**Copy that passphrase into your password manager now.** Without it the backups
cannot be decrypted. (It is gitignored - do not commit it.) Also keep a copy of
`PASSWORD_VAULT_KEY` from `.env` somewhere separate: backups do not include it.

### 4. First run and schedule
```
cd /opt/kwick
chmod +x scripts/backup.sh
./scripts/backup.sh        # watch for "[backup] OK"
rclone ls gdrive:kwick-backups
```
Then schedule it nightly at 02:00 server time (`crontab -e`):
```
0 2 * * * /opt/kwick/scripts/backup.sh >> /var/log/kwick-backup.log 2>&1
```
Optional: create a free check at https://healthchecks.io and set
`BACKUP_HEALTHCHECK_URL=<url>` in the cron line to get an email if a night is missed.

## Restore (test this once, don't wait for an emergency)
```
# download the files you want from Google Drive
rclone copy gdrive:kwick-backups/kwick-db-<STAMP>.sql.gz.enc /tmp/restore/

# decrypt + decompress
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:/opt/kwick/.backup-passphrase \
  -in /tmp/restore/kwick-db-<STAMP>.sql.gz.enc | gunzip > /tmp/restore/db.sql
```
To load it into a **scratch** database (safe test):
```
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  sh -c 'createdb -U "$POSTGRES_USER" kwick_restore_test'
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d kwick_restore_test' < /tmp/restore/db.sql
```
Restoring into the live database replaces current data - stop the app first and
only do it deliberately. Media: decrypt the same way, then `tar xzf` it back into
`/app/mediafiles` in the backend container.
