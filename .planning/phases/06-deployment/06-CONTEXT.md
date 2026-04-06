# Phase 6: Deployment - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy Zoiten ERP to VPS (root@85.198.97.89). Install PostgreSQL, configure nginx reverse proxy (coexist with CantonFairBot), create systemd service, run migrations + seed, set up photo upload directory, prepare SSL config for when domain is pointed.

</domain>

<decisions>
## Implementation Decisions

### VPS Access
- **D-01:** SSH as root@85.198.97.89 (key-based auth already configured).
- **D-02:** Application directory: /opt/zoiten-pro/
- **D-03:** Node.js 22.x LTS must be installed (check if exists first).

### PostgreSQL
- **D-04:** Install via apt: `apt install postgresql postgresql-contrib`
- **D-05:** Create user: `zoiten` with password (generate secure random).
- **D-06:** Create database: `zoiten_erp` owned by `zoiten` user.
- **D-07:** DATABASE_URL format: `postgresql://zoiten:{password}@localhost:5432/zoiten_erp`

### Application Setup
- **D-08:** Clone repo to /opt/zoiten-pro/ via git clone (HTTPS, not SSH — simpler).
- **D-09:** Create .env file with: DATABASE_URL, AUTH_SECRET, AUTH_URL, CRON_SECRET, UPLOAD_DIR.
- **D-10:** AUTH_URL = https://zoiten.pro (or http://85.198.97.89:3000 until domain pointed).
- **D-11:** UPLOAD_DIR = /var/www/zoiten-uploads/
- **D-12:** npm install → npx prisma migrate deploy → npx prisma db seed → npm run build

### Deploy Script
- **D-13:** deploy.sh in project root: git pull, npm install, prisma migrate deploy, npm run build, systemctl restart zoiten-erp.
- **D-14:** Script is idempotent — safe to run multiple times.

### systemd
- **D-15:** Service file: /etc/systemd/system/zoiten-erp.service
- **D-16:** ExecStart: /usr/local/bin/node /opt/zoiten-pro/.next/standalone/server.js
- **D-17:** Environment: NODE_ENV=production, PORT=3000
- **D-18:** Restart=always, WantedBy=multi-user.target (auto-start on boot).
- **D-19:** WorkingDirectory=/opt/zoiten-pro

### nginx
- **D-20:** New server block: /etc/nginx/sites-available/zoiten-pro
- **D-21:** Listen 80 (HTTP), server_name zoiten.pro www.zoiten.pro 85.198.97.89
- **D-22:** proxy_pass http://127.0.0.1:3000 for / location
- **D-23:** location /uploads/ → alias /var/www/zoiten-uploads/ (static file serving)
- **D-24:** DO NOT modify existing CantonFairBot nginx config
- **D-25:** Check existing nginx config first: `nginx -T` to understand current setup

### SSL/HTTPS
- **D-26:** Prepare certbot command but DON'T run until domain zoiten.pro is pointed to VPS IP.
- **D-27:** Document the command: `certbot --nginx -d zoiten.pro -d www.zoiten.pro`
- **D-28:** For now, HTTP-only access via IP address.

### Photo Directory
- **D-29:** Create /var/www/zoiten-uploads/ with proper permissions (www-data or node user).
- **D-30:** Nginx serves this directory at /uploads/ path.

### Cron Purge
- **D-31:** systemd timer for daily purge: calls /api/cron/purge-deleted endpoint.
- **D-32:** Timer file: /etc/systemd/system/zoiten-purge.timer + zoiten-purge.service

### Claude's Discretion
- Exact systemd service configuration details
- nginx performance tuning (worker_connections, etc.)
- PostgreSQL performance tuning
- Backup strategy (future)

</decisions>

<canonical_refs>
## Canonical References

### Project Code
- `next.config.ts` — output: "standalone" for production build
- `prisma/schema.prisma` — Database schema
- `prisma/seed.ts` — Seed script (superadmin + reference data)
- `app/api/cron/purge-deleted/route.ts` — Cron endpoint requiring CRON_SECRET
- `.env.example` — Environment variable template

### Project Specs
- `.planning/REQUIREMENTS.md` — DEPLOY-01..08
- `.planning/ROADMAP.md` — Phase 6 success criteria
- `.planning/research/PITFALLS.md` — nginx coexistence, prisma migrate deploy vs dev

</canonical_refs>

<code_context>
## Existing Code Insights

### Key Files for Deploy
- `next.config.ts` has `output: "standalone"` — production build creates .next/standalone/
- `.env.example` lists all required env vars
- `prisma/seed.ts` is idempotent (upsert pattern)
- CantonFairBot is at /opt/CantonFairBot/ on VPS

### Integration Points
- nginx must proxy port 3000 AND serve /uploads/ static files
- systemd manages both zoiten-erp service and purge timer
- PostgreSQL accessed via localhost connection string

</code_context>

<specifics>
## Specific Ideas

- Check CantonFairBot nginx config BEFORE adding zoiten config
- Use `next build` standalone output mode (copies only needed node_modules)
- Copy static and public dirs to standalone after build
- CRON_SECRET should be a random 32-char hex string

</specifics>

<deferred>
## Deferred Ideas

- CI/CD pipeline (GitHub Actions) — future improvement
- Database backup strategy — future
- Monitoring/alerting — future
- Domain DNS setup — user will do manually

</deferred>

---

*Phase: 06-deployment*
*Context gathered: 2026-04-06*
