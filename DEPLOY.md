# DEPLOY.md — Zoiten ERP Deployment Runbook

Complete, copy-pasteable guide to deploy Zoiten ERP to VPS from zero to running production app.

**VPS:** root@85.198.97.89 (key-based SSH — no password prompt expected)
**App directory on VPS:** /opt/zoiten-pro/
**Repo:** https://github.com/safyodorov/zoiten-pro

> **CRITICAL:** CantonFairBot runs at /opt/CantonFairBot/ on this VPS. Every nginx step
> includes a verification that CantonFairBot still works. Do NOT skip those checks.

---

## 1. Prerequisites

Before starting, confirm on your local machine:

- [ ] SSH key is configured for root@85.198.97.89 — test with `ssh root@85.198.97.89 "whoami"`
- [ ] Git repo is cloned locally and you know the GitHub remote URL
- [ ] You know the CantonFairBot domain or port (check step 2.1 to discover it)

**CantonFairBot is at /opt/CantonFairBot/ on this VPS. You must NOT break it.**

---

## 2. First-time VPS Setup

### 2.1 Check existing nginx config (do this FIRST — before any nginx changes)

```bash
ssh root@85.198.97.89 "nginx -T 2>&1 | head -60"
```

This shows all active nginx configuration. Note:
- Which domains are currently configured (look for `server_name` directives)
- Which ports are listening (look for `listen` directives)
- Where CantonFairBot's config file lives (note the path for step 6)

Expected output will show CantonFairBot's server block. Record the `server_name` and any
upstream ports so you can verify it still works after adding the Zoiten config.

### 2.2 Install Node.js 22.x LTS

SSH in and check if Node.js is already installed:

```bash
ssh root@85.198.97.89
node --version
```

If Node.js is already v22.x.x, skip the install. If not installed or wrong version:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
```

Verify:

```bash
node --version    # expect: v22.x.x
npm --version     # expect: 10.x.x or higher
```

### 2.3 Install PostgreSQL 16

```bash
apt install -y postgresql postgresql-contrib
systemctl enable --now postgresql
systemctl status postgresql   # confirm: active (running)
```

### 2.4 Create PostgreSQL database and user

Choose a secure password for the database user (replace `CHANGE_ME_DB_PASSWORD` below).
You will use this same password in /etc/zoiten.pro.env in step 3.

```bash
sudo -u postgres psql <<'SQL'
CREATE USER zoiten WITH PASSWORD 'CHANGE_ME_DB_PASSWORD';
CREATE DATABASE zoiten_erp OWNER zoiten;
GRANT ALL PRIVILEGES ON DATABASE zoiten_erp TO zoiten;
SQL
```

Verify the database exists:

```bash
sudo -u postgres psql -c "\l" | grep zoiten_erp
```

### 2.5 Create photo upload directory

```bash
mkdir -p /var/www/zoiten-uploads
chown -R root:root /var/www/zoiten-uploads
chmod 755 /var/www/zoiten-uploads
```

This directory is served by nginx at /uploads/ and used by the app for product photos.
It must match the `UPLOAD_DIR` value in /etc/zoiten.pro.env (set in step 3).

### 2.6 Clone application

```bash
git clone https://github.com/safyodorov/zoiten-pro /opt/zoiten-pro
cd /opt/zoiten-pro
ls -la   # confirm files are present
```

---

## 3. Configure Environment Variables

Create the production secrets file at /etc/zoiten.pro.env (outside the project directory — never inside it).

```bash
cp /opt/zoiten-pro/.env.example /etc/zoiten.pro.env
```

Generate secrets (run these now and paste the output into the env file):

```bash
openssl rand -hex 32   # use for AUTH_SECRET
openssl rand -hex 32   # use for CRON_SECRET (run separately)
```

Edit the env file:

```bash
nano /etc/zoiten.pro.env
```

Fill in these values:

```
DATABASE_URL="postgresql://zoiten:CHANGE_ME_DB_PASSWORD@localhost:5432/zoiten_erp"
AUTH_SECRET="<output of first openssl rand -hex 32>"
AUTH_URL="http://85.198.97.89:3000"
CRON_SECRET="<output of second openssl rand -hex 32>"
UPLOAD_DIR="/var/www/zoiten-uploads"
```

> Note: `AUTH_URL` uses HTTP and the VPS IP for now. After domain is pointed and SSL
> configured (step 8), change this to `https://zoiten.pro` and restart the service.

Lock down the secrets file:

```bash
chmod 600 /etc/zoiten.pro.env
ls -la /etc/zoiten.pro.env   # expect: -rw------- 1 root root ...
```

---

## 4. Install Dependencies, Run Migrations, Seed, Build

All commands run inside the application directory:

```bash
cd /opt/zoiten-pro
```

Install production dependencies only:

```bash
npm ci --omit=dev
```

Run database migrations (use `migrate deploy` — NEVER `migrate dev` in production):

```bash
npx prisma migrate deploy
```

Seed the database (creates superadmin account and reference data — idempotent, safe to re-run):

```bash
npx prisma db seed
```

Build the Next.js application:

```bash
npm run build
```

Copy static assets to the standalone output (required — Next.js does not do this automatically):

```bash
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static
```

Verify the build output exists:

```bash
ls .next/standalone/server.js   # must exist
ls .next/standalone/public/     # must contain static files
```

---

## 5. Install systemd Service and Purge Timer

Copy unit files to systemd:

```bash
cp /opt/zoiten-pro/scripts/systemd/zoiten-erp.service /etc/systemd/system/
cp /opt/zoiten-pro/scripts/systemd/zoiten-purge.service /etc/systemd/system/
cp /opt/zoiten-pro/scripts/systemd/zoiten-purge.timer /etc/systemd/system/
```

Reload systemd, enable and start the app service:

```bash
systemctl daemon-reload
systemctl enable --now zoiten-erp
systemctl enable --now zoiten-purge.timer
```

Verify the app service is running:

```bash
systemctl status zoiten-erp
```

Expected output: `active (running)` and no error lines.

Verify the purge timer is scheduled:

```bash
systemctl list-timers zoiten-purge.timer
```

Expected output: shows next trigger time (02:00 AM).

Verify the app responds on port 3000 (before nginx):

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000
```

Expected: `200` or `302` (redirect to /login).

Tail logs if something is wrong:

```bash
journalctl -u zoiten-erp -f
```

---

## 6. Configure nginx

**CRITICAL:** Confirm CantonFairBot's nginx config location from step 2.1 before proceeding.
You are adding a NEW server block — you are NOT modifying the existing one.

Copy the Zoiten nginx config to sites-available:

```bash
cp /opt/zoiten-pro/scripts/nginx/zoiten-pro.conf /etc/nginx/sites-available/zoiten-pro
```

Enable by creating a symlink:

```bash
ln -s /etc/nginx/sites-available/zoiten-pro /etc/nginx/sites-enabled/zoiten-pro
```

Validate the full nginx config BEFORE reloading (catches syntax errors that would break nginx entirely):

```bash
nginx -t
```

Expected output: `nginx: configuration file /etc/nginx/nginx.conf syntax is ok` and
`nginx: configuration file /etc/nginx/nginx.conf test is successful`

If `nginx -t` passes, reload nginx:

```bash
systemctl reload nginx
```

Verify Zoiten is accessible via nginx:

```bash
curl -s -o /dev/null -w "%{http_code}" http://85.198.97.89
```

Expected: `200` or `302`.

**CRITICAL — CantonFairBot verification:**

Confirm CantonFairBot still responds on its domain/port (use the domain/port you noted in step 2.1):

```bash
curl -s -o /dev/null -w "%{http_code}" http://<cantonfairbot-domain-or-ip>
```

Expected: same status code as before you added the Zoiten config.
If CantonFairBot is broken, check `nginx -T` to diagnose which config is conflicting.

---

## 7. Smoke Test

Complete these checks before considering deployment done:

- [ ] Open http://85.198.97.89 in browser — redirects to /login page
- [ ] Login with `sergey.fyodorov@gmail.com` / `stafurovonet` — lands on dashboard
- [ ] Navigate to /products — product list loads (may be empty if seeded without products)
- [ ] Navigate to /admin/users — user management page loads
- [ ] Upload a test photo on any product — image appears at /uploads/filename.jpg
- [ ] Reboot VPS and verify auto-restart:
  ```bash
  reboot
  ```
  Wait 60 seconds, then:
  ```bash
  ssh root@85.198.97.89 "systemctl status zoiten-erp"
  curl -s -o /dev/null -w "%{http_code}" http://85.198.97.89
  ```
  Expected: service is `active (running)`, HTTP returns 200 or 302.

- [ ] **CantonFairBot final check:** After reboot, verify CantonFairBot still responds on its domain/port.

---

## 8. SSL / HTTPS Setup (DEFERRED — domain must be pointed first)

> **DO NOT run these commands yet.**
> SSL requires zoiten.pro DNS A record to point to 85.198.97.89.
> Current status: domain not yet pointed.

**Step 8a — Check DNS propagation (run this when domain is pointed):**

```bash
dig +short zoiten.pro
```

Expected: `85.198.97.89`. If empty or different IP, wait for DNS propagation (up to 48h).

**Step 8b — Install certbot:**

```bash
apt install -y certbot python3-certbot-nginx
```

**Step 8c — Obtain SSL certificate:**

```bash
certbot --nginx -d zoiten.pro -d www.zoiten.pro
```

certbot will automatically modify /etc/nginx/sites-available/zoiten-pro to add the HTTPS
redirect and SSL server block. It will also set up auto-renewal.

**Step 8d — Update AUTH_URL after SSL:**

```bash
nano /etc/zoiten.pro.env
# Change: AUTH_URL="http://85.198.97.89:3000"
# To:     AUTH_URL="https://zoiten.pro"
systemctl restart zoiten-erp
```

**Step 8e — Verify HTTPS:**

```bash
curl -s -o /dev/null -w "%{http_code}" https://zoiten.pro
```

Expected: `200` or `302`.

---

## 9. Re-deploy (Day-2 Operations)

After initial setup, every future code update uses the deploy script. Run from your local machine:

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
```

What deploy.sh does automatically:

1. `git pull` — fetches latest code from GitHub
2. `npm ci --omit=dev` — installs/updates production dependencies
3. `npx prisma migrate deploy` — applies any new database migrations
4. `npm run build` — rebuilds the Next.js app
5. `cp -r public .next/standalone/public` — copies static assets
6. `cp -r .next/static .next/standalone/.next/static` — copies built assets
7. `systemctl restart zoiten-erp` — reloads the running service

The script exits immediately on any error (`set -euo pipefail`). Check logs if it fails:

```bash
ssh root@85.198.97.89 "journalctl -u zoiten-erp -n 50 --no-pager"
```

**Updating systemd or nginx configs after a deploy:**

systemd service files and nginx config are NOT updated automatically by deploy.sh.
If scripts/systemd/ or scripts/nginx/ files change:

```bash
ssh root@85.198.97.89
cd /opt/zoiten-pro && git pull
cp scripts/systemd/zoiten-erp.service /etc/systemd/system/
systemctl daemon-reload && systemctl restart zoiten-erp
# For nginx changes:
cp scripts/nginx/zoiten-pro.conf /etc/nginx/sites-available/zoiten-pro
nginx -t && systemctl reload nginx
```

**Updating environment variables:**

```bash
ssh root@85.198.97.89
nano /etc/zoiten.pro.env
systemctl restart zoiten-erp
```

---

## 10. Troubleshooting

### App not starting

```bash
journalctl -u zoiten-erp -n 50 --no-pager
systemctl status zoiten-erp
```

Common causes:
- Missing or malformed /etc/zoiten.pro.env — check the file exists and `chmod 600`
- Build not run or standalone assets not copied — re-run step 4
- Port 3000 in use by another process: `lsof -i :3000`

### nginx 502 Bad Gateway

The app is not running or not listening on port 3000.

```bash
systemctl status zoiten-erp
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000
```

If curl returns nothing, restart the service: `systemctl restart zoiten-erp`

### Photos returning 404

nginx alias path mismatch between nginx config and UPLOAD_DIR env var.

```bash
# Check nginx config alias path:
grep -A2 "location /uploads/" /etc/nginx/sites-available/zoiten-pro

# Check env var:
grep UPLOAD_DIR /etc/zoiten.pro.env

# Verify the directory exists and has files:
ls -la /var/www/zoiten-uploads/

# Check permissions:
stat /var/www/zoiten-uploads
```

Both the nginx `alias` path and `UPLOAD_DIR` must match: `/var/www/zoiten-uploads/`

### Login fails or redirects loop

AUTH_SECRET or AUTH_URL mismatch.

```bash
grep AUTH_ /etc/zoiten.pro.env
```

- `AUTH_SECRET` must be a 64-character hex string (32 bytes)
- `AUTH_URL` must match the URL you're accessing the app from (http vs https, IP vs domain)
- After changing AUTH_URL: `systemctl restart zoiten-erp`

### Database connection error

```bash
grep DATABASE_URL /etc/zoiten.pro.env

# Test the connection:
sudo -u postgres psql -U zoiten -d zoiten_erp -h localhost -c "SELECT 1;"
```

If it fails: the password in DATABASE_URL must match the PostgreSQL user password set in step 2.4.
Reset it with:

```bash
sudo -u postgres psql -c "ALTER USER zoiten WITH PASSWORD 'NEW_PASSWORD';"
# Update /etc/zoiten.pro.env DATABASE_URL to use NEW_PASSWORD
systemctl restart zoiten-erp
```

### CantonFairBot broke after nginx change

```bash
nginx -T   # full nginx config dump — look for conflicts
nginx -t   # syntax check
```

If there is a server_name conflict between Zoiten and CantonFairBot, check that
/etc/nginx/sites-available/zoiten-pro uses `server_name zoiten.pro www.zoiten.pro 85.198.97.89`
and does NOT include CantonFairBot's domain. If conflict persists, remove the IP from
Zoiten's server_name line if CantonFairBot is also serving from port 80 on the same IP.

### Purge cron not running

```bash
systemctl list-timers zoiten-purge.timer
journalctl -u zoiten-purge.service -n 20 --no-pager
```

The timer fires daily at 02:00. Check that `zoiten-purge.timer` is `active (waiting)` in the timer list.
If the service failed, confirm the CRON_SECRET in /etc/zoiten.pro.env matches what the app expects.

---

## 11. Phase 14: Управление остатками (v1.2)

### 11.1 Первый deploy Phase 14

Миграция Phase 14 (`prisma/migrations/20260421_phase14_stock/`) создана вручную и применится автоматически при запуске `npx prisma migrate deploy` в deploy.sh.

**После deploy скрипта выполнить:**

**1. Seed справочника WB складов** (один раз после первого deploy Phase 14):

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && npm run seed:wb-warehouses"
```

Проверить:

```bash
ssh root@85.198.97.89 "psql \$DATABASE_URL -tAc 'SELECT COUNT(*) FROM \"WbWarehouse\"'"
```

Ожидается: > 10 складов.

**2. Nginx rewrite `/inventory → /stock`** (для поддержки старых закладок):

Добавить в `/etc/nginx/sites-enabled/zoiten-pro` ПЕРЕД `location /`:

```nginx
location ~* ^/inventory(.*)$ {
  return 301 /stock$1;
}
```

Применить:

```bash
ssh root@85.198.97.89 "nginx -t && systemctl reload nginx"
```

Проверить:

```bash
curl -I https://zoiten.pro/inventory
# Ожидается: 301 Location: https://zoiten.pro/stock
```

> Примечание: Next.js также настроен на 308 redirect /inventory → /stock через `next.config.ts`.
> nginx 301 обрабатывает прямые запросы к /inventory до того как они достигают Next.js.

**3. Первый sync per-warehouse остатков:**

- Открыть https://zoiten.pro/stock
- Нажать «Обновить из WB» → ждать ~1-2 мин
- Проверить: таблица показывает остатки в колонках Иваново/Производство/МП

**4. Проверить /stock/wb:**

- Перейти на вкладку «WB склады» — должна появиться таблица с 7 кластерными колонками
- Если пусто (empty state) — сначала нажать «Обновить из WB» на странице /stock

### 11.2 Troubleshooting Phase 14

**HTTP 403 при нажатии «Обновить из WB» (WB API):**

```
WB Statistics API 403 → base token не имеет scope Статистика (bit 6)
```

Решение:
- Регенерировать токен в seller.wildberries.ru → Настройки → Доступ к API
- Тип: Personal (не Standard)
- Scope: Контент, Цены, Статистика, Аналитика, Отзывы, Тарифы
- Обновить `WB_API_TOKEN` в `/etc/zoiten.pro.env`
- `systemctl restart zoiten-erp.service`

**Миграция Phase 14 не применилась:**

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && npx prisma migrate deploy"
```

**seed:wb-warehouses завершился с ошибкой:**

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && npx ts-node prisma/seed-wb-warehouses.ts"
# или
ssh root@85.198.97.89 "cd /opt/zoiten-pro && npx tsx prisma/seed-wb-warehouses.ts"
```

---

*Last updated: 2026-04-22*
*Covers: Phase 06 deployment (Plans 01 and 02); Phase 14 v1.2 (Plans 01–07)*
