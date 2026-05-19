---
phase: 19-wb-ads
plan: "01"
subsystem: data-model
tags: [prisma, schema, migration, wb-advert, phase-19, wave-2]
dependency_graph:
  requires:
    - "Phase 19 W0 smoke check (.planning/phases/19-wb-ads/19-W0-NOTES.md)"
    - "Existing ERP_SECTION enum in prisma/schema.prisma"
  provides:
    - "Prisma client types: WbAdvertCampaign, WbAdvertTarget, WbAdvertStatDaily, WbAdvertBalanceSnapshot"
    - "ERP_SECTION.ADS — RBAC scope for /ads/* server actions and middleware"
    - "Manual SQL migration ready for `prisma migrate deploy` on VPS"
  affects:
    - "Plan 19-02 (token scope) — будет дописывать ADS в WB_SCOPE_LABELS отдельно"
    - "Plan 19-03 (WB Advert API client) — Prisma client types станут доступны"
    - "Plan 19-04 (cron sync) — будет писать в новые таблицы"
    - "Plan 19-05 (UI /ads/wb) — RBAC через requireSection('ADS')"
tech_stack:
  added: []
  patterns:
    - "nmId БЕЗ FK на WbCard — паттерн проекта (исторические данные выживают при soft/hard delete)"
    - "Ручная SQL миграция (нет локальной PostgreSQL — применяется через deploy.sh)"
    - "Compound unique для idempotent upsert (WbAdvertStatDaily, WbAdvertTarget)"
    - "ALTER TYPE ENUM ADD VALUE IF NOT EXISTS — PG 12+ idempotent enum extension"
key_files:
  created:
    - "prisma/migrations/20260519_phase19_wb_advert/migration.sql"
    - ".planning/phases/19-wb-ads/19-01-SUMMARY.md"
  modified:
    - "prisma/schema.prisma — добавлен ADS в ERP_SECTION, 4 новые модели в конце файла"
decisions:
  - "Применены W0-корректировки: WbAdvertBalanceSnapshot.bonus УБРАН (отсутствует в /balance response), добавлены currency: String @default('RUB') и WbAdvertStatDaily.canceled (technical cancels из API)"
  - "WbAdvertTarget заполняется не из /promotion/adverts (404 deprecated), а derive из fullstats.days[].apps[].nms[].nmId (Plan 19-04). Сама модель остаётся как есть — это implementation detail cron'а."
  - "nmId хранится Int без FK на WbCard — единый паттерн с WbCardOrdersDaily. Исторические рекламные данные должны выживать при soft/hard delete WbCard."
  - "Compound unique @@unique([advertId, date, nmId, appType]) — обеспечивает idempotent upsert при повторных запусках cron'а."
  - "ADS вставлен между EMPLOYEES и USER_MANAGEMENT в ERP_SECTION (USER_MANAGEMENT остаётся последним — логичнее для admin sections)."
metrics:
  duration_minutes: 3
  tasks_total: 2
  tasks_completed: 2
  files_changed: 2
  completed_date: "2026-05-19"
---

# Phase 19 Plan 01: Prisma Schema + Migration Summary

Добавлены 4 модели (WbAdvertCampaign, WbAdvertTarget, WbAdvertStatDaily, WbAdvertBalanceSnapshot) + значение ADS в ERP_SECTION, плюс ручная SQL-миграция готовая к `prisma migrate deploy` на VPS. Применены W0-корректировки shape: без `bonus` в balance snapshot, с `canceled` и `currency` в schema.

## What Changed

### prisma/schema.prisma

- **ERP_SECTION enum** — добавлено значение `ADS` (между `EMPLOYEES` и `USER_MANAGEMENT`).
- **4 новые модели** в конце файла, после `WbCardOrdersDaily`:
  - `WbAdvertCampaign` — primary key `advertId Int`, поля `name`, `type`, `status`, `cpm`, `dailyBudget`, `startDate`, `endDate`, `changeTime`, `raw Json?`, индексы по `status` и `type`. Relations: `targets WbAdvertTarget[]`, `stats WbAdvertStatDaily[]`.
  - `WbAdvertTarget` — M:N association через `@@unique([advertId, nmId])`. nmId без FK на WbCard. FK на campaign с `onDelete: Cascade`.
  - `WbAdvertStatDaily` — дневная статистика, `@@unique([advertId, date, nmId, appType])` для idempotent upsert. Все 15 полей из W0 verified API shape (`views`, `clicks`, `ctr`, `cpc`, `sum`, `atbs`, `orders`, `cr`, `shks`, `sumPrice`, `canceled`).
  - `WbAdvertBalanceSnapshot` — `balance Int`, `net Int`, `currency String @default("RUB")`. Поле `bonus` НЕ добавлено (W0: отсутствует в API response).

### prisma/migrations/20260519_phase19_wb_advert/migration.sql

77-line ручная DDL-миграция с идемпотентными `CREATE TABLE IF NOT EXISTS` + индексы + FK + `ALTER TYPE "ERP_SECTION" ADD VALUE IF NOT EXISTS 'ADS'`. Применяется на VPS через `bash deploy.sh` (вызывает `prisma migrate deploy`).

## Verification Results

| Check | Result |
|-------|--------|
| `npx prisma format` | OK — отступы выровнены |
| `npx prisma validate` | exits 0 (с DATABASE_URL placeholder) |
| `npx prisma generate` | exits 0 — Prisma Client сгенерирован, новые типы доступны |
| grep `model WbAdvertCampaign` в schema.prisma | line 1051 |
| grep `model WbAdvertTarget` в schema.prisma | line 1075 |
| grep `model WbAdvertStatDaily` в schema.prisma | line 1092 |
| grep `model WbAdvertBalanceSnapshot` в schema.prisma | line 1121 |
| grep `ADS` enum value в schema.prisma | line 31 |
| `@@unique([advertId, nmId])` | line 1084 |
| `@@unique([advertId, date, nmId, appType])` | line 1113 |
| migration.sql — `CREATE TABLE IF NOT EXISTS "WbAdvertCampaign"` | line 9 |
| migration.sql — `CREATE TABLE IF NOT EXISTS "WbAdvertTarget"` | line 28 |
| migration.sql — `CREATE TABLE IF NOT EXISTS "WbAdvertStatDaily"` | line 42 |
| migration.sql — `CREATE TABLE IF NOT EXISTS "WbAdvertBalanceSnapshot"` | line 69 |
| migration.sql — `ADD VALUE IF NOT EXISTS 'ADS'` | line 6 |
| migration.sql — compound index `advertId_date_nmId_appType_key` | line 64 |

Все automated `<verify>` блоки пройдены.

## Deviations from Plan

**None.** Plan был revised до запуска с уже встроенными W0-корректировками (`canceled` field в WbAdvertStatDaily, `bonus` УБРАН из WbAdvertBalanceSnapshot, `currency String`). Schema создана точно по plan task 1, migration.sql точно по plan task 2.

Единственное минорное отклонение от инструкций plan task 1 (пункт 4): `npx prisma generate` потребовал `DATABASE_URL` placeholder в окружении (Prisma 6 валидирует datasource даже для generate). Решено через временный `DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"` inline. Это не влияет на корректность сгенерированного клиента.

## Authentication Gates

None — Plan 19-01 не требует никакого внешнего API доступа (чистая работа с локальной схемой).

## Known Stubs

None. Все модели готовы к production-использованию. Поле `WbAdvertCampaign.raw Json?` — это legitimate audit log, не stub. Поле `WbAdvertTarget` будет заполняться через Plan 19-04 (cron) — пустая таблица в момент деплоя миграции это нормально.

## Deferred Issues

Не обнаружены.

## Follow-up Notes

1. **На VPS** при выполнении `bash deploy.sh`: `prisma migrate deploy` должен подхватить новый каталог `20260519_phase19_wb_advert/` и применить migration.sql. Идемпотентные `IF NOT EXISTS` обеспечивают safe re-run в случае partial failure.
2. **Plan 19-02** (parallel в Wave 2) отвечает за добавление `ADS: bit X` в `WB_SCOPE_LABELS` ([lib/wb-jwt.ts](../../../lib/wb-jwt.ts)) — не делать в этом плане.
3. **Plan 19-03** (wave 3) сможет начать импорт `import { prisma } from "@/lib/prisma"; prisma.wbAdvertCampaign...` сразу после merge этого plan'а.
4. **appType maps** (32=web, 0/1=mobile?, etc.) — нужно подтвердить через несколько кампаний с разными платформами в Plan 19-04. Хранится Int — расширения схемы не понадобится.

## Files Changed

- `prisma/schema.prisma` (modified)
- `prisma/migrations/20260519_phase19_wb_advert/migration.sql` (created)
- `.planning/phases/19-wb-ads/19-01-SUMMARY.md` (created)

## Self-Check: PASSED

- prisma/schema.prisma — FOUND (modified, validated)
- prisma/migrations/20260519_phase19_wb_advert/migration.sql — FOUND (77 lines)
- .planning/phases/19-wb-ads/19-01-SUMMARY.md — FOUND (this file)
- All 4 models grep-confirmed
- ADS enum value grep-confirmed
- Compound uniques grep-confirmed
- npx prisma validate exits 0
- npx prisma generate exits 0

No commits were made — files left staged for user review per execution constraints.
