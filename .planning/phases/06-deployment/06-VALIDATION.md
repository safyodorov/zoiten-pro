# Phase 6: Deployment — Validation

**Phase:** 06-deployment
**Created:** 2026-04-06
**Status:** Ready for execution

---

## Automated Verification Commands

Run these locally (after plans complete) to confirm all deployment files are correct before touching the VPS.

### All deployment files exist

```bash
for f in \
  "deploy.sh" \
  "scripts/systemd/zoiten-erp.service" \
  "scripts/systemd/zoiten-purge.service" \
  "scripts/systemd/zoiten-purge.timer" \
  "scripts/nginx/zoiten-pro.conf" \
  "DEPLOY.md"; do
  test -f "/Users/macmini/zoiten.pro/$f" && echo "PASS: $f" || echo "FAIL: $f missing"
done
```

### deploy.sh — safety checks

```bash
# Must use migrate deploy (NOT migrate dev)
grep -q "prisma migrate deploy" /Users/macmini/zoiten.pro/deploy.sh && echo "PASS: migrate deploy" || echo "FAIL: migrate dev would destroy production data"

# Must copy standalone assets (photo/CSS/JS 404 without this)
grep -q "cp -r public .next/standalone/public" /Users/macmini/zoiten.pro/deploy.sh && echo "PASS: standalone public copy" || echo "FAIL"
grep -q "cp -r .next/static .next/standalone/.next/static" /Users/macmini/zoiten.pro/deploy.sh && echo "PASS: standalone static copy" || echo "FAIL"

# Must restart the service
grep -q "systemctl restart zoiten-erp" /Users/macmini/zoiten.pro/deploy.sh && echo "PASS: service restart" || echo "FAIL"
```

### systemd service — critical config

```bash
# ExecStart must point to /usr/local/bin/node (PATH includes /usr/local/bin)
grep -q "ExecStart=/usr/local/bin/node" /Users/macmini/zoiten.pro/scripts/systemd/zoiten-erp.service && echo "PASS: node path" || echo "FAIL"

# Must load env from external file (secrets not embedded)
grep -q "EnvironmentFile=/etc/zoiten.pro.env" /Users/macmini/zoiten.pro/scripts/systemd/zoiten-erp.service && echo "PASS: EnvironmentFile" || echo "FAIL"

# Must have Restart=always for auto-recovery
grep -q "Restart=always" /Users/macmini/zoiten.pro/scripts/systemd/zoiten-erp.service && echo "PASS: Restart=always" || echo "FAIL"

# Must have WantedBy=multi-user.target for boot auto-start
grep -q "WantedBy=multi-user.target" /Users/macmini/zoiten.pro/scripts/systemd/zoiten-erp.service && echo "PASS: WantedBy" || echo "FAIL"
```

### systemd purge timer — cron setup

```bash
# Timer fires at 02:00 daily
grep -q "OnCalendar=\*-\*-\* 02:00:00" /Users/macmini/zoiten.pro/scripts/systemd/zoiten-purge.timer && echo "PASS: timer schedule" || echo "FAIL"

# Persistent=true ensures missed runs catch up after reboot
grep -q "Persistent=true" /Users/macmini/zoiten.pro/scripts/systemd/zoiten-purge.timer && echo "PASS: Persistent=true" || echo "FAIL"

# Purge service uses x-cron-secret header
grep -q "x-cron-secret" /Users/macmini/zoiten.pro/scripts/systemd/zoiten-purge.service && echo "PASS: cron secret header" || echo "FAIL"
```

### nginx config — correctness

```bash
# Proxy to Node.js
grep -q "proxy_pass http://127.0.0.1:3000" /Users/macmini/zoiten.pro/scripts/nginx/zoiten-pro.conf && echo "PASS: proxy_pass" || echo "FAIL"

# Static photo serving (does NOT hit Node.js)
grep -q "alias /var/www/zoiten-uploads/" /Users/macmini/zoiten.pro/scripts/nginx/zoiten-pro.conf && echo "PASS: alias for uploads" || echo "FAIL"

# Upload size limit (Next.js server actions have 3mb, nginx must allow 5m)
grep -q "client_max_body_size 5m" /Users/macmini/zoiten.pro/scripts/nginx/zoiten-pro.conf && echo "PASS: client_max_body_size" || echo "FAIL"

# server_name includes VPS IP (access before domain pointed)
grep -q "85.198.97.89" /Users/macmini/zoiten.pro/scripts/nginx/zoiten-pro.conf && echo "PASS: VPS IP in server_name" || echo "FAIL"
```

### .env.example — completeness

```bash
for var in DATABASE_URL AUTH_SECRET AUTH_URL CRON_SECRET UPLOAD_DIR; do
  grep -q "$var" /Users/macmini/zoiten.pro/.env.example && echo "PASS: $var in .env.example" || echo "FAIL: $var missing"
done
```

### DEPLOY.md — safety content

```bash
# Never mentions migrate dev in instructions
! grep -q "migrate dev" /Users/macmini/zoiten.pro/DEPLOY.md && echo "PASS: no migrate dev in DEPLOY.md" || echo "FAIL: migrate dev found — dangerous"

# CantonFairBot is addressed
grep -iq "cantonfairbot" /Users/macmini/zoiten.pro/DEPLOY.md && echo "PASS: CantonFairBot addressed" || echo "FAIL"

# SSL deferred
grep -iq "deferred\|DEFERRED" /Users/macmini/zoiten.pro/DEPLOY.md && echo "PASS: SSL deferred" || echo "FAIL"

# env file path is correct
grep -q "/etc/zoiten.pro.env" /Users/macmini/zoiten.pro/DEPLOY.md && echo "PASS: env file path" || echo "FAIL"
```

---

## Post-Deploy Verification (run on VPS after deployment)

These commands must be run on the VPS after following DEPLOY.md.

### Service is running

```bash
systemctl is-active zoiten-erp && echo "PASS: zoiten-erp active" || echo "FAIL"
systemctl is-enabled zoiten-erp && echo "PASS: zoiten-erp enabled on boot" || echo "FAIL"
```

### Timer is active

```bash
systemctl is-active zoiten-purge.timer && echo "PASS: purge timer active" || echo "FAIL"
```

### Application responds

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000 | grep -q "200\|301\|302" && echo "PASS: app responds" || echo "FAIL: app not responding"
```

### nginx is routing correctly

```bash
curl -s -o /dev/null -w "%{http_code}" http://85.198.97.89 | grep -q "200\|301\|302" && echo "PASS: nginx routing" || echo "FAIL"
```

### Photos directory exists with correct permissions

```bash
test -d /var/www/zoiten-uploads && echo "PASS: upload dir exists" || echo "FAIL"
ls -la /var/www/ | grep zoiten-uploads
```

### Cron purge endpoint responds correctly

```bash
# Without secret — must return 401
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/cron/purge-deleted)
[ "$STATUS" = "401" ] && echo "PASS: purge endpoint requires auth (401)" || echo "FAIL: got $STATUS"
```

### CantonFairBot still works

```bash
# Verify CantonFairBot's nginx config was not affected
nginx -T 2>&1 | grep -i canton && echo "INFO: CantonFairBot config present" || echo "WARN: CantonFairBot config not found in nginx -T output"
```

---

## Manual Verification Checklist

Complete after automated checks pass. Run from browser on the VPS IP.

### Authentication (DEPLOY-01)

- [ ] http://85.198.97.89 loads the landing page
- [ ] Navigating to /login shows the login form
- [ ] Login with sergey.fyodorov@gmail.com / stafurovonet succeeds
- [ ] Dashboard loads after login
- [ ] Browser refresh preserves session

### Products (DEPLOY-01, DEPLOY-03)

- [ ] /products page loads with product list
- [ ] Upload a product photo — it appears immediately (served from /uploads/ path)
- [ ] Photo URL in browser is http://85.198.97.89/uploads/... (not /api/uploads/)
- [ ] Soft-delete a product — it disappears from "Есть" tab

### Persistence (DEPLOY-01, DEPLOY-02)

- [ ] Reboot VPS: `reboot`
- [ ] Wait 60 seconds
- [ ] http://85.198.97.89 still responds (systemd auto-restart confirmed)
- [ ] Previously created products still exist (database persistence confirmed)

### CantonFairBot (DEPLOY-06)

- [ ] CantonFairBot domain/port still responds after nginx reconfiguration
- [ ] No nginx errors in `journalctl -u nginx`

---

## Requirement Coverage

| Requirement | Plan | Verified by |
|-------------|------|-------------|
| DEPLOY-01 — app deployed on VPS via systemd | 06-01 | `systemctl is-active zoiten-erp` |
| DEPLOY-02 — nginx reverse proxy zoiten.pro → :3000 | 06-01 | `curl -I http://85.198.97.89` |
| DEPLOY-03 — nginx serves /var/www/zoiten-uploads/ as /uploads/ | 06-01 | photo URL check in browser |
| DEPLOY-04 — PostgreSQL installed and configured | 06-02 (DEPLOY.md §2.3-2.4) | `systemctl is-active postgresql` |
| DEPLOY-05 — SSL/HTTPS via Let's Encrypt | 06-02 (DEPLOY.md §8 deferred) | after domain pointed |
| DEPLOY-06 — nginx coexists with CantonFairBot | 06-01 | CantonFairBot checklist above |
| DEPLOY-07 — prisma migrate deploy (not dev) | 06-01 (deploy.sh) | grep check above |
| DEPLOY-08 — env vars configured on VPS | 06-01 (.env.example + systemd EnvironmentFile) | service loads without env errors |

---

*Phase 6 validation | Created 2026-04-06*
