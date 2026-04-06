---
phase: 06-deployment
plan: "02"
subsystem: deployment
tags: [deploy, runbook, nginx, systemd, vps, ssl, postgresql]
dependency_graph:
  requires: [06-01]
  provides: [deploy-runbook]
  affects: [vps-deployment]
tech_stack:
  added: []
  patterns: [deployment-runbook, copy-pasteable-ops]
key_files:
  created:
    - DEPLOY.md
  modified: []
decisions:
  - "DEPLOY.md is the single source of truth for VPS deployment — no improvisation required"
  - "SSL section explicitly marked DEFERRED until zoiten.pro DNS A record points to 85.198.97.89"
  - "CantonFairBot safety verification is a first-class step in sections 1, 2.1, 6, 7, and 10"
  - "Re-deploy (day-2) section documents deploy.sh as the canonical update workflow"
metrics:
  duration: "68 seconds"
  completed: "2026-04-06"
  tasks: 1
  files: 1
---

# Phase 06 Plan 02: Deployment Runbook Summary

Complete VPS deployment runbook (DEPLOY.md) — 528-line linear guide from blank VPS to running production Zoiten ERP, with CantonFairBot safety checks, deferred SSL section, and day-2 operations.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write DEPLOY.md — complete deployment runbook | ab67c69 | DEPLOY.md |

## What Was Built

### DEPLOY.md (528 lines, 10 sections)

A single-file, copy-pasteable deployment runbook that takes a developer from zero to running production app without improvisation. Structure:

**Section 1 — Prerequisites:** SSH key check, CantonFairBot warning established upfront.

**Section 2 — First-time VPS Setup:** `nginx -T` check before any changes (2.1), Node.js 22.x install via NodeSource (2.2), PostgreSQL 16 install via apt (2.3), DB + user creation via heredoc psql (2.4), upload directory creation (2.5), git clone to /opt/zoiten-pro (2.6).

**Section 3 — Environment Variables:** Creates /etc/zoiten.pro.env from .env.example, provides `openssl rand -hex 32` commands for both AUTH_SECRET and CRON_SECRET, documents `chmod 600` for security.

**Section 4 — Dependencies + Build:** `npm ci --omit=dev`, `npx prisma migrate deploy` (never `migrate dev`), `npx prisma db seed`, `npm run build`, mandatory `cp -r` of public/ and .next/static/ to standalone output.

**Section 5 — systemd:** Copies all three unit files (zoiten-erp.service, zoiten-purge.service, zoiten-purge.timer), daemon-reload, enables both, verification commands for status and timer.

**Section 6 — nginx:** Copies config to sites-available, creates symlink, `nginx -t` BEFORE reload, `systemctl reload nginx`, explicit CantonFairBot curl verification after reload.

**Section 7 — Smoke Test:** Browser checklist (login, products page, photo upload), reboot + 60s wait test, final CantonFairBot verification after reboot.

**Section 8 — SSL (DEFERRED):** Clearly marked "DO NOT run yet — domain not pointed." Includes DNS propagation check (`dig +short zoiten.pro`), certbot install, `certbot --nginx` command, AUTH_URL update after SSL.

**Section 9 — Re-deploy:** Single `ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"` command documents day-2 workflow. Also covers manual systemd/nginx config updates for config changes outside deploy.sh scope.

**Section 10 — Troubleshooting:** Six named scenarios — app not starting, nginx 502, photos 404, login fails, database connection error, CantonFairBot conflict — each with diagnostic commands and fix instructions.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — DEPLOY.md is a documentation file with no UI or data stubs.

## Self-Check: PASSED

Files verified:
- DEPLOY.md: EXISTS at /Users/macmini/zoiten.pro/DEPLOY.md
- DEPLOY.md: 528 lines (requirement: >= 120)
- DEPLOY.md: contains `migrate deploy` (PASS)
- DEPLOY.md: `migrate dev` appears only in warning text "NEVER `migrate dev`" (PASS)
- DEPLOY.md: CantonFairBot mentioned 13 times across sections 1, 2.1, 6, 7, 10 (PASS)
- DEPLOY.md: /etc/zoiten.pro.env referenced throughout (PASS)
- DEPLOY.md: SSL section 8 marked "DEFERRED" in header (PASS)

Commits verified:
- ab67c69: feat(06-02): add DEPLOY.md complete VPS deployment runbook
