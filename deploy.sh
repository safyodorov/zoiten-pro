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

echo "==> Building application..."
npm run build

echo "==> Copying static assets to standalone..."
[ -d public ] && cp -r public .next/standalone/public || mkdir -p .next/standalone/public
cp -r .next/static .next/standalone/.next/static

echo "==> Restarting service..."
systemctl restart zoiten-erp

echo "==> Done. Checking status..."
systemctl status zoiten-erp --no-pager -l
