# Phase 6: Deployment - Discussion Log

> **Audit trail only.**

**Date:** 2026-04-06
**Phase:** 06-deployment
**Areas discussed:** Deploy Script, Nginx, PostgreSQL, SSL
**Mode:** --auto

---

## Deploy Script
| Option | Description | Selected |
|--------|-------------|----------|
| Bash deploy.sh | git pull + install + migrate + build + restart | ✓ |
| Docker | Контейнеризация приложения | |
**User's choice:** [auto] Bash deploy.sh (recommended)

## Nginx Configuration
| Option | Description | Selected |
|--------|-------------|----------|
| Отдельный server block | Не трогать CantonFairBot конфиг | ✓ |
| Общий конфиг | Добавить location в существующий | |
**User's choice:** [auto] Отдельный server block (recommended)

## PostgreSQL Setup
| Option | Description | Selected |
|--------|-------------|----------|
| apt install | Стандартная установка + createuser/createdb | ✓ |
| Docker PostgreSQL | PostgreSQL в контейнере | |
**User's choice:** [auto] apt install (recommended)

## SSL
| Option | Description | Selected |
|--------|-------------|----------|
| Подготовить, не включать | Certbot команда готова, запустить когда домен привязан | ✓ |
| Сразу SSL | Self-signed или Let's Encrypt | |
**User's choice:** [auto] Подготовить, не включать (recommended)
