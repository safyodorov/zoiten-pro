---
phase: 06-deployment
verified: 2026-04-06T00:00:00Z
status: human_needed
score: 6/6 must-haves verified (infrastructure files); 2/5 success criteria need human (live VPS)
human_verification:
  - test: "https://zoiten.pro resolves to the running application with a valid SSL certificate"
    expected: "curl -s -o /dev/null -w '%{http_code}' https://zoiten.pro returns 200 or 302; certbot certificate is valid and auto-renewing"
    why_human: "Phase creates config files only. HTTPS requires domain DNS pointed to VPS and certbot run. Cannot verify from local machine."
  - test: "Application restarts automatically after VPS reboot"
    expected: "systemctl status zoiten-erp shows 'active (running)' after 'reboot' + 60s wait"
    why_human: "Requires live VPS. systemd enable is documented in DEPLOY.md steps 5.4–5.5, but execution state is not verifiable from files alone."
  - test: "Product photos are served by nginx from /var/www/zoiten-uploads/ without hitting Node.js"
    expected: "curl http://85.198.97.89/uploads/test.jpg returns photo with nginx headers, not a Node.js response"
    why_human: "Requires nginx running on VPS with the config deployed. The config file is verified correct — execution requires the VPS."
  - test: "CantonFairBot continues to function after nginx reconfiguration"
    expected: "CantonFairBot domain/port returns the same HTTP status code as before Zoiten nginx config was added"
    why_human: "Requires SSH access to VPS and knowledge of CantonFairBot's domain/port. Cannot check remotely."
  - test: "prisma migrate deploy runs without errors on the VPS database on deploy"
    expected: "bash deploy.sh exits 0 with 'No pending migrations' or successful migration output"
    why_human: "Requires VPS with PostgreSQL installed and /etc/zoiten.pro.env populated. Not runnable locally."
---

# Phase 6: Deployment Verification Report

**Phase Goal:** The application runs in production at zoiten.pro on the VPS, with HTTPS, without disrupting CantonFairBot
**Verified:** 2026-04-06
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Important Scope Note

Phase 6 produces deployment infrastructure files (scripts, config, runbook) — not a running service. All automated verification confirms the files exist and contain correct content. The five success criteria from ROADMAP.md that describe a live running system require human verification on the actual VPS.

---

## Goal Achievement

### Observable Truths (from PLAN must_haves)

| #  | Truth                                                                                    | Status     | Evidence                                                                 |
|----|------------------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------|
| 1  | deploy.sh is idempotent: git pull, npm install, prisma migrate deploy, npm run build     | VERIFIED  | Lines 8, 11, 14, 17, 20–21, 24 all present and correct                  |
| 2  | systemd service starts server.js from .next/standalone with NODE_ENV=production port 3000 | VERIFIED  | ExecStart=/usr/local/bin/node ...standalone/server.js; PORT=3000; NODE_ENV=production |
| 3  | systemd timer triggers daily cron purge via curl with x-cron-secret header               | VERIFIED  | zoiten-purge.service has curl with `-H "x-cron-secret: ${CRON_SECRET}"`; timer OnCalendar=*-*-* 02:00:00 |
| 4  | nginx config proxies / to 127.0.0.1:3000 and serves /uploads/ from /var/www/zoiten-uploads/ | VERIFIED  | proxy_pass http://127.0.0.1:3000 and alias /var/www/zoiten-uploads/ confirmed |
| 5  | nginx config is a standalone file (sites-available) — never modifies CantonFairBot config | VERIFIED  | Standalone server block; comment warns "Never edit /etc/nginx/nginx.conf directly" |
| 6  | .env.example has all required production env vars including CRON_SECRET and UPLOAD_DIR   | VERIFIED  | DATABASE_URL, AUTH_SECRET, AUTH_URL, CRON_SECRET, UPLOAD_DIR all present |

**Score (infrastructure files):** 6/6 truths verified

### DEPLOY.md Additional Truths (from Plan 02 must_haves)

| #  | Truth                                                                                | Status     | Evidence                                                                            |
|----|--------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------|
| 1  | Developer can follow DEPLOY.md from a fresh VPS state to a running https://zoiten.pro | VERIFIED  | 528-line, 10-section linear runbook; all commands copy-pasteable                    |
| 2  | Every command in DEPLOY.md is copy-pasteable with no gaps                            | VERIFIED  | All 10 sections have complete shell commands; no placeholder `YOUR_VALUE` gaps      |
| 3  | SSL section is clearly marked as a deferred step                                     | VERIFIED  | Section 8 header: "DEFERRED — domain must be pointed first"; "DO NOT run yet"       |
| 4  | CantonFairBot verification step is included                                          | VERIFIED  | CantonFairBot mentioned 15 times across sections 1, 2.1, 6, 7, 10                  |
| 5  | Re-deploy section (day-2 operations) documents deploy.sh workflow                   | VERIFIED  | Section 9 documents exact ssh + bash deploy.sh command with step-by-step breakdown  |

---

## Required Artifacts

| Artifact                               | Expected                                          | Status    | Details                                                                      |
|----------------------------------------|---------------------------------------------------|-----------|------------------------------------------------------------------------------|
| `deploy.sh`                            | Idempotent deploy script                          | VERIFIED  | 27 lines; contains all required steps in correct order                       |
| `scripts/systemd/zoiten-erp.service`   | systemd unit: runs standalone/server.js           | VERIFIED  | ExecStart, EnvironmentFile, NODE_ENV=production, PORT=3000, Restart=always   |
| `scripts/systemd/zoiten-purge.service` | One-shot unit: curls /api/cron/purge-deleted      | VERIFIED  | Type=oneshot; curl with x-cron-secret: ${CRON_SECRET}; EnvironmentFile set  |
| `scripts/systemd/zoiten-purge.timer`   | Daily timer at 02:00 with Persistent=true         | VERIFIED  | OnCalendar=*-*-* 02:00:00; Persistent=true; WantedBy=timers.target          |
| `scripts/nginx/zoiten-pro.conf`        | nginx server block: proxy + static uploads + SSL comment | VERIFIED  | All elements present; client_max_body_size 5m; certbot SSL comment           |
| `.env.example`                         | Template for all required production env vars     | VERIFIED  | 5 vars with CHANGE_ME placeholders and generation instructions               |
| `DEPLOY.md`                            | Complete deployment runbook                       | VERIFIED  | 528 lines (req: >= 120); 10 sections; linear; all commands complete          |

---

## Key Link Verification

### Plan 01 Key Links

| From                                    | To                                           | Via                    | Status    | Details                                                                         |
|-----------------------------------------|----------------------------------------------|------------------------|-----------|---------------------------------------------------------------------------------|
| scripts/systemd/zoiten-erp.service      | /opt/zoiten-pro/.next/standalone/server.js  | ExecStart path         | WIRED    | `ExecStart=/usr/local/bin/node /opt/zoiten-pro/.next/standalone/server.js`      |
| scripts/systemd/zoiten-erp.service      | /etc/zoiten.pro.env                         | EnvironmentFile        | WIRED    | `EnvironmentFile=/etc/zoiten.pro.env`                                           |
| scripts/systemd/zoiten-purge.service    | /api/cron/purge-deleted                     | curl with cron secret  | WIRED    | `-H "x-cron-secret: ${CRON_SECRET}" http://127.0.0.1:3000/api/cron/purge-deleted` |
| scripts/nginx/zoiten-pro.conf           | 127.0.0.1:3000                              | proxy_pass directive   | WIRED    | `proxy_pass http://127.0.0.1:3000;`                                             |
| scripts/nginx/zoiten-pro.conf           | /var/www/zoiten-uploads/                    | alias under /uploads/  | WIRED    | `alias /var/www/zoiten-uploads/;`                                               |

### Plan 02 Key Links

| From      | To                                      | Via                         | Status    | Details                                                                        |
|-----------|-----------------------------------------|-----------------------------|-----------|--------------------------------------------------------------------------------|
| DEPLOY.md | scripts/systemd/zoiten-erp.service     | cp command in steps         | WIRED    | `cp scripts/systemd/zoiten-erp.service /etc/systemd/system/` (section 5)       |
| DEPLOY.md | scripts/nginx/zoiten-pro.conf          | cp + symlink command        | WIRED    | `cp ...nginx/zoiten-pro.conf /etc/nginx/sites-available/zoiten-pro` (section 6) |
| DEPLOY.md | /etc/zoiten.pro.env                    | env file creation step      | WIRED    | Referenced 15 times; creation step in section 3; chmod 600 included            |

---

## Data-Flow Trace (Level 4)

Not applicable. Phase produces static configuration files and documentation. No dynamic data rendering.

---

## Behavioral Spot-Checks

| Behavior                              | Command                                                                           | Result                                   | Status  |
|---------------------------------------|-----------------------------------------------------------------------------------|------------------------------------------|---------|
| deploy.sh uses migrate deploy not dev | `grep "migrate dev" /Users/macmini/zoiten.pro/deploy.sh`                         | No matches                               | PASS   |
| DEPLOY.md uses migrate deploy not dev | `grep "migrate dev" DEPLOY.md` (only appears in warning text "NEVER migrate dev") | Warning text only, no actual command     | PASS   |
| systemd service has PATH-safe node    | `grep ExecStart .../zoiten-erp.service`                                          | /usr/local/bin/node (full path, no PATH dependency) | PASS   |
| purge service escapes % for systemd  | `grep "%%{http_code}" .../zoiten-purge.service`                                  | `%%{http_code}` — correctly escaped      | PASS   |
| deploy.sh copies standalone assets   | `grep "cp -r public .next/standalone" deploy.sh`                                 | Present on line 20                       | PASS   |
| DEPLOY.md line count >= 120           | `wc -l DEPLOY.md`                                                                | 528 lines                                | PASS   |

---

## Requirements Coverage

| Requirement | Source Plan | Description                                                   | Status         | Evidence                                                            |
|-------------|-------------|---------------------------------------------------------------|----------------|---------------------------------------------------------------------|
| DEPLOY-01   | 06-01       | Application deployed on VPS via systemd service               | SATISFIED (files) | zoiten-erp.service + deploy.sh + DEPLOY.md section 5 cover this |
| DEPLOY-02   | 06-01       | Nginx reverse proxy: zoiten.pro → localhost:3000              | SATISFIED (files) | nginx conf has proxy_pass http://127.0.0.1:3000; DEPLOY.md section 6 |
| DEPLOY-03   | 06-01       | Nginx serves uploaded photos from /var/www/zoiten-uploads/    | SATISFIED (files) | nginx conf: `alias /var/www/zoiten-uploads/` under /uploads/       |
| DEPLOY-04   | 06-01       | PostgreSQL installed and configured on VPS                    | SATISFIED (docs) | DEPLOY.md sections 2.3–2.4 cover pg install + db/user creation     |
| DEPLOY-05   | 06-01       | SSL/HTTPS via Let's Encrypt (when domain is pointed)          | SATISFIED (docs) | DEPLOY.md section 8 covers certbot; nginx conf has SSL comment. Execution deferred. |
| DEPLOY-06   | 06-01       | Nginx coexists with CantonFairBot without breaking it         | SATISFIED (files) | Standalone sites-available file; nginx -T warning in config; 15 CantonFairBot checks in DEPLOY.md |
| DEPLOY-07   | 06-01       | Deploy script runs `prisma migrate deploy` (not dev)          | SATISFIED (files) | deploy.sh line 14: `npx prisma migrate deploy`; DEPLOY.md section 4 reinforces this |
| DEPLOY-08   | 06-01       | Environment variables properly configured on VPS              | SATISFIED (files) | .env.example covers all 5 vars; systemd EnvironmentFile=/etc/zoiten.pro.env; DEPLOY.md section 3 |

---

## Anti-Patterns Found

| File           | Pattern                          | Severity | Impact                                                                        |
|----------------|----------------------------------|----------|-------------------------------------------------------------------------------|
| `.env.example` | CHANGE_ME placeholders           | Info     | Intentional — these are template values. Generation commands provided inline.  |

No blockers. The CHANGE_ME values are correct template placeholders, not implementation stubs.

---

## Human Verification Required

### 1. HTTPS Availability at zoiten.pro

**Test:** After domain DNS A record points to 85.198.97.89, run: `curl -s -o /dev/null -w "%{http_code}" https://zoiten.pro`
**Expected:** Returns `200` or `302`. Browser shows valid SSL certificate from Let's Encrypt.
**Why human:** Phase creates config files only. HTTPS requires DNS propagation to VPS IP and `certbot --nginx` run per DEPLOY.md section 8.

### 2. Automatic Restart After VPS Reboot

**Test:** Run `reboot` on VPS, wait 60 seconds, then: `ssh root@85.198.97.89 "systemctl status zoiten-erp"`
**Expected:** `active (running)`. The `--now` flag in `systemctl enable --now zoiten-erp` enables auto-start on boot.
**Why human:** Requires live VPS with systemd unit deployed per DEPLOY.md section 5.

### 3. Static File Serving by nginx

**Test:** After deploying, upload a product photo. Then: `curl -I http://85.198.97.89/uploads/<filename>.jpg`
**Expected:** Response headers show nginx server, not Node.js. No `/api/` route is hit.
**Why human:** Requires nginx running on VPS with the config deployed and a real uploaded file in /var/www/zoiten-uploads/.

### 4. CantonFairBot Still Works After Nginx Reconfiguration

**Test:** Check CantonFairBot domain/port response BEFORE adding Zoiten config. Then add it per DEPLOY.md section 6. Re-check CantonFairBot.
**Expected:** Same HTTP status code. No connection refused or nginx error page.
**Why human:** Requires VPS SSH access and knowledge of CantonFairBot's nginx server_name. Cannot check remotely.

### 5. prisma migrate deploy Succeeds on VPS Database

**Test:** After completing DEPLOY.md sections 2–4, run: `npx prisma migrate deploy` inside /opt/zoiten-pro
**Expected:** Exits 0 with either "No pending migrations" or lists applied migrations. No "connection refused" or auth errors.
**Why human:** Requires VPS with PostgreSQL running and /etc/zoiten.pro.env with valid DATABASE_URL.

---

## Gaps Summary

No infrastructure file gaps found. All 7 deployment artifacts exist with correct, substantive content. All key links between files are wired. All 8 DEPLOY requirements are satisfied at the file level.

The 5 human verification items represent the live execution state of a properly-configured VPS — they cannot be verified from a local repository. They are all achievable by following DEPLOY.md verbatim.

One contextual note: DEPLOY-05 (SSL) is intentionally deferred per the phase design — the domain is not yet pointed to the VPS, and the nginx config and DEPLOY.md section 8 are correctly prepared for when it is.

---

_Verified: 2026-04-06_
_Verifier: Claude (gsd-verifier)_
