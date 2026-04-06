---
phase: 06-deployment
plan: "01"
subsystem: deployment
tags: [deploy, systemd, nginx, vps, infrastructure]
dependency_graph:
  requires: []
  provides: [deploy-script, systemd-units, nginx-config, env-template]
  affects: [vps-deployment, zoiten-erp-service, purge-cron]
tech_stack:
  added: []
  patterns: [systemd-service, systemd-timer, nginx-reverse-proxy, standalone-nextjs]
key_files:
  created:
    - deploy.sh
    - scripts/systemd/zoiten-erp.service
    - scripts/systemd/zoiten-purge.service
    - scripts/systemd/zoiten-purge.timer
    - scripts/nginx/zoiten-pro.conf
  modified:
    - .env.example
decisions:
  - "systemd EnvironmentFile=/etc/zoiten.pro.env keeps secrets off the command line and out of git"
  - "nginx serves /uploads/ via alias (not proxy_pass) — nginx handles static files faster than Node.js"
  - "deploy.sh uses prisma migrate deploy (not dev) — dev would reset data in production"
  - "standalone build requires manual cp of public/ and .next/static/ — Next.js does not auto-copy on build"
  - "%%{http_code} double-escapes % in systemd unit files — required by systemd specifier syntax"
metrics:
  duration: "87 seconds"
  completed: "2026-04-06"
  tasks: 2
  files: 6
---

# Phase 06 Plan 01: Deployment Infrastructure Summary

Deployment config files created: systemd units (service + timer pair for app and cron purge), nginx server block (proxy + static uploads), idempotent deploy script, and complete .env.example production template.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create systemd service, timer, and deploy script | 414331c | deploy.sh, scripts/systemd/*.service, scripts/systemd/*.timer |
| 2 | Create nginx config and update .env.example | 3b68b91 | scripts/nginx/zoiten-pro.conf, .env.example |

## What Was Built

### deploy.sh
Idempotent VPS deploy script: `git pull` → `npm ci --omit=dev` → `prisma migrate deploy` → `npm run build` → copy standalone assets → `systemctl restart zoiten-erp`. The static asset copy (`cp -r public` and `cp -r .next/static`) is mandatory for Next.js standalone output — omitting it causes 404s for all CSS/JS in production.

### scripts/systemd/zoiten-erp.service
Main app service. Runs `/usr/local/bin/node /opt/zoiten-pro/.next/standalone/server.js` as root with `EnvironmentFile=/etc/zoiten.pro.env` for secrets and inline `NODE_ENV=production PORT=3000`. Restarts on failure with 5s back-off.

### scripts/systemd/zoiten-purge.service + zoiten-purge.timer
One-shot service that curls `/api/cron/purge-deleted` with `x-cron-secret: ${CRON_SECRET}` header. Timer fires daily at 02:00 with `Persistent=true` (catches missed runs after downtime).

### scripts/nginx/zoiten-pro.conf
Standalone `sites-available` server block. Proxies all traffic to `127.0.0.1:3000` except `/uploads/` which is served directly via `alias /var/www/zoiten-uploads/`. `client_max_body_size 5m` supports photo uploads. Includes certbot SSL comment and prominent warning to run `nginx -T` before enabling (to avoid impacting CantonFairBot).

### .env.example (updated)
Complete production template covering: `DATABASE_URL`, `AUTH_SECRET` (openssl rand -hex 32), `AUTH_URL`, `CRON_SECRET` (openssl rand -hex 32), `UPLOAD_DIR`. All secrets have `CHANGE_ME_` placeholders with generation hints. `NODE_ENV` and `PORT` are commented out (set by systemd unit inline).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — these are config files, no UI or data stubs.

## Self-Check: PASSED

Files verified:
- deploy.sh: EXISTS, contains `prisma migrate deploy`, `cp -r public .next/standalone/public`
- scripts/systemd/zoiten-erp.service: EXISTS, contains `EnvironmentFile=/etc/zoiten.pro.env`
- scripts/systemd/zoiten-purge.service: EXISTS, contains `x-cron-secret: ${CRON_SECRET}`
- scripts/systemd/zoiten-purge.timer: EXISTS, contains `OnCalendar=*-*-* 02:00:00`, `Persistent=true`
- scripts/nginx/zoiten-pro.conf: EXISTS, contains `proxy_pass http://127.0.0.1:3000`, `alias /var/www/zoiten-uploads/`, `client_max_body_size 5m`
- .env.example: EXISTS, contains `CRON_SECRET`, `UPLOAD_DIR`, `AUTH_SECRET`, `AUTH_URL`, `DATABASE_URL`

Commits verified:
- 414331c: feat(06-01): add systemd units and deploy script
- 3b68b91: feat(06-01): add nginx config and update .env.example
