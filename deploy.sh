#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/zoiten-pro"

echo "==> Pulling latest code..."
cd "$APP_DIR"
git pull

echo "==> Installing dependencies..."
npm ci --omit=dev

echo "==> Running database migrations..."
npx prisma migrate deploy

# ── Phase 10: WB_CHAT_TOKEN проверка (warning only, не fail) ──
echo "==> [Phase 10] Проверка WB_CHAT_TOKEN..."
if ! grep -q "^WB_CHAT_TOKEN=" /etc/zoiten.pro.env 2>/dev/null; then
  echo "⚠ WARNING: WB_CHAT_TOKEN не найден в /etc/zoiten.pro.env"
  echo "  Синхронизация чата и автоответы не будут работать без этого токена."
  echo "  Выпустите токен в seller.wildberries.ru → Настройки → Доступ к API"
  echo "  → scope 'Чат с покупателями' (bit 9)"
  echo "  Затем: echo 'WB_CHAT_TOKEN=<token>' >> /etc/zoiten.pro.env"
  echo "         systemctl restart zoiten-erp.service"
else
  echo "✓ WB_CHAT_TOKEN присутствует в /etc/zoiten.pro.env"
fi

# ── Phase 10: systemd timer для /api/cron/support-sync-chat (каждые 5 минут) ──
echo "==> [Phase 10] Настройка systemd timer zoiten-chat-sync (5 min)..."
cat > /etc/systemd/system/zoiten-chat-sync.service <<'SVC'
[Unit]
Description=Zoiten Chat Sync (WB Buyer Chat + AutoReply)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/zoiten.pro.env
ExecStart=/usr/bin/curl -fsS -H "x-cron-secret: ${CRON_SECRET}" http://localhost:3001/api/cron/support-sync-chat
SVC

cat > /etc/systemd/system/zoiten-chat-sync.timer <<'TMR'
[Unit]
Description=Zoiten Chat Sync (every 5 minutes)

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true
Unit=zoiten-chat-sync.service

[Install]
WantedBy=timers.target
TMR

systemctl daemon-reload
systemctl enable --now zoiten-chat-sync.timer
echo "✓ zoiten-chat-sync.timer активирован (интервал 5 мин)"

# ── Phase 8/9 fix: systemd timer для /api/cron/support-sync-reviews (каждые 15 мин) ──
echo "==> [Phase 8/9 fix] Настройка systemd timer zoiten-support-sync (15 min)..."
cat > /etc/systemd/system/zoiten-support-sync.service <<'SVC'
[Unit]
Description=Zoiten Support Sync (WB Feedbacks + Questions + Returns)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/zoiten.pro.env
ExecStart=/usr/bin/curl -fsS --max-time 500 -H "x-cron-secret: ${CRON_SECRET}" http://localhost:3001/api/cron/support-sync-reviews
SVC

cat > /etc/systemd/system/zoiten-support-sync.timer <<'TMR'
[Unit]
Description=Zoiten Support Sync (every 15 minutes)

[Timer]
OnBootSec=3min
OnUnitActiveSec=15min
Persistent=true
Unit=zoiten-support-sync.service

[Install]
WantedBy=timers.target
TMR

systemctl daemon-reload
systemctl enable --now zoiten-support-sync.timer
echo "✓ zoiten-support-sync.timer активирован (интервал 15 мин)"

# ── Phase 9 fix: systemd timer для /api/cron/support-sync-returns (каждые 15 мин) ──
echo "==> [Phase 9 fix] Настройка systemd timer zoiten-returns-sync (15 min)..."
cat > /etc/systemd/system/zoiten-returns-sync.service <<'SVC'
[Unit]
Description=Zoiten Returns Sync (WB Buyers Claims)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/zoiten.pro.env
ExecStart=/usr/bin/curl -fsS --max-time 300 -H "x-cron-secret: ${CRON_SECRET}" http://localhost:3001/api/cron/support-sync-returns
SVC

cat > /etc/systemd/system/zoiten-returns-sync.timer <<'TMR'
[Unit]
Description=Zoiten Returns Sync (раз в 65 минут — WB Basic tier лимит 1 req/hour)

[Timer]
OnBootSec=10min
OnUnitActiveSec=65min
Persistent=true
Unit=zoiten-returns-sync.service

[Install]
WantedBy=timers.target
TMR

systemctl daemon-reload
systemctl enable --now zoiten-returns-sync.timer
echo "✓ zoiten-returns-sync.timer активирован (интервал 15 мин)"

# ── Phase 13: systemd timer для /api/cron/support-stats-refresh (раз в сутки 03:00 МСК) ──
echo "==> [Phase 13] Настройка systemd timer zoiten-stats-refresh (daily 03:00 МСК)..."
cat > /etc/systemd/system/zoiten-stats-refresh.service <<'SVC'
[Unit]
Description=Zoiten Support Stats Refresh (ManagerSupportStats upsert для текущего месяца)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/zoiten.pro.env
ExecStart=/usr/bin/curl -fsS --max-time 300 -H "x-cron-secret: ${CRON_SECRET}" http://localhost:3001/api/cron/support-stats-refresh
SVC

cat > /etc/systemd/system/zoiten-stats-refresh.timer <<'TMR'
[Unit]
Description=Zoiten Support Stats Refresh (daily 03:00 Europe/Moscow)

[Timer]
OnCalendar=*-*-* 03:00:00 Europe/Moscow
Persistent=true
Unit=zoiten-stats-refresh.service

[Install]
WantedBy=timers.target
TMR

systemctl daemon-reload
systemctl enable --now zoiten-stats-refresh.timer
echo "✓ zoiten-stats-refresh.timer активирован (OnCalendar=*-*-* 03:00:00 Europe/Moscow)"

echo "==> Building application..."
npm run build

echo "==> Copying static assets to standalone..."
[ -d public ] && cp -r public .next/standalone/public || mkdir -p .next/standalone/public
cp -r .next/static .next/standalone/.next/static

echo "==> Restarting service..."
systemctl restart zoiten-erp

echo "==> Done. Checking status..."
systemctl status zoiten-erp --no-pager -l
