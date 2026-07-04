---
phase: 25-v2-h2-2026
plan: "01"
subsystem: database
tags: [prisma, postgres, migration, sales-plan, ddl]

requires:
  - phase: 24-finance
    provides: "AppSetting паттерн seed + FinanceStockSnapshot no-FK паттерн для SalesPlanVersionDay"
  - phase: 20-procurement
    provides: "Purchase, Supplier, SupplierProductLink модели — расширяются back-relations и новым полем"

provides:
  - "5 новых Prisma-моделей: SalesPlanMonthLevel, SalesPlanDayOverride, VirtualPurchase, SalesPlanVersion, SalesPlanVersionDay"
  - "enum VirtualPurchaseStatus (SUGGESTED/ACCEPTED/DISMISSED/CONVERTED)"
  - "Purchase.plannedArrivalDate Date? — приоритетный источник дат для resolver §3.4"
  - "Back-relations в Product/Supplier/User для навигации к новым сущностям"
  - "Рукописная миграция 20260705_sales_plan_v2 с полным DDL + сид 9 AppSetting-ключей"
  - "Prisma-клиент сгенерирован — типы SalesPlanMonthLevel, VirtualPurchase и др. доступны downstream"

affects:
  - "25-02 (движок lib/sales-plan/): types.ts, engine.ts — использует новые типы Prisma"
  - "25-03 (data-loader): loadSalesPlanInputs — читает SalesPlanMonthLevel, SalesPlanDayOverride, VirtualPurchase"
  - "25-04 (UI): server actions, page.tsx — записывает в новые таблицы"
  - "25-05 (версионирование): fixSalesPlanVersion — пишет SalesPlanVersion + SalesPlanVersionDay"

tech-stack:
  added: []
  patterns:
    - "SalesPlanVersionDay: BigInt BIGSERIAL PK + productId без @relation (паттерн FinanceStockSnapshot — переживает hard-purge товара)"
    - "VirtualPurchase: отдельная таблица вместо флага isVirtual на Purchase (структурная изоляция от production-sync)"
    - "AppSetting seed: ON CONFLICT (key) DO NOTHING — идемпотентный сид в теле миграции"

key-files:
  created:
    - "prisma/migrations/20260705_sales_plan_v2/migration.sql — DDL 5 таблиц + enum + ALTER Purchase + 9 AppSetting-ключей"
  modified:
    - "prisma/schema.prisma — 5 новых моделей + enum VirtualPurchaseStatus + Purchase.plannedArrivalDate + 5 back-relations"
    - "package.json — prisma переехал в devDependencies (побочный эффект prisma generate)"
    - "package-lock.json — Prisma client установлен в node_modules"

key-decisions:
  - "Миграция применяется к БД через prisma migrate deploy на VPS при деплое — локальной PostgreSQL нет"
  - "prisma generate выполнен с фиктивным DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy (generate не подключается к БД)"
  - "SalesPlanVersionDay использует BigInt PK (BIGSERIAL) по паттерну FinanceStockSnapshot, без @relation на Product"
  - "VirtualPurchase — отдельная таблица, НЕ флаг isVirtual на Purchase: структурная изоляция от production-sync"

patterns-established:
  - "No-FK snapshot pattern для иммутабельных строк версий: productId String без @relation, денорм sku/name"
  - "Аддитивная рукописная миграция: только CREATE/ALTER/INSERT, никаких DROP"

requirements-completed: [SP-01]

duration: 25min
completed: 2026-07-05
---

# Phase 25, Plan 01: Schema + Migration для плана продаж v2

**5 Prisma-моделей (SalesPlanMonthLevel/DayOverride/VirtualPurchase/Version/VersionDay) + enum VirtualPurchaseStatus + Purchase.plannedArrivalDate + аддитивная миграция 20260705_sales_plan_v2 с сидом 9 AppSetting-ключей**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-05T00:00:00Z
- **Completed:** 2026-07-05T00:25:00Z
- **Tasks:** 2
- **Files modified:** 4 (schema.prisma, migration.sql, package.json, package-lock.json)

## Accomplishments

- Добавлены 5 новых моделей плана продаж v2 в prisma/schema.prisma с правильными back-relations
- Создана рукописная аддитивная миграция с полным DDL (5 таблиц, 1 enum, 1 ALTER TABLE, 9 INSERT AppSetting)
- Prisma-клиент сгенерирован: типы SalesPlanMonthLevel, VirtualPurchase, SalesPlanVersionDay и др. доступны для Wave 1 (движок + data-loader)
- Старый sales-plan (lib/sales-forecast.ts, AppSetting salesPlan.baselineOverrides) не тронут — миграция строго аддитивна

## Task Commits

1. **Task 1: Prisma-модели + back-relations + plannedArrivalDate** — `63eeb50` (feat)
2. **Task 2: Рукописная миграция migration.sql + сид AppSetting** — `58bab1f` (feat)

**Plan metadata:** см. ниже (docs commit)

## Files Created/Modified

- `prisma/schema.prisma` — 5 новых моделей, enum VirtualPurchaseStatus, Purchase.plannedArrivalDate, 5 back-relations (Product×3, Supplier×1, User×1)
- `prisma/migrations/20260705_sales_plan_v2/migration.sql` — DDL + сид (127 строк)
- `package.json` — prisma перемещён в devDependencies (побочный эффект prisma generate)
- `package-lock.json` — @prisma/client установлен локально

## Decisions Made

- **Применение миграции к БД:** `prisma migrate deploy` применяется на VPS при деплое (deploy.sh). Локально запускать нельзя — прод-БД только на VPS. Это ожидаемый паттерн проекта (Phase 14, 24 и др.).
- **prisma generate:** выполнен с временным `DATABASE_URL=postgresql://dummy:...` — generate не устанавливает соединение, только генерирует TypeScript-типы из схемы. Успешно завершён.
- **VirtualPurchaseStatus enum:** размещён после SalesPlanDayOverride перед VirtualPurchase (декларативный порядок в Prisma не важен, но удобен для чтения).

## Деплой-задачи (для пользователя)

1. **Применить миграцию к прод-БД** (стандартный деплой-шаг):
   ```bash
   ssh root@85.198.97.89 "cd /opt/zoiten-pro && nohup bash deploy.sh > /var/log/zoiten-deploy.log 2>&1 &"
   ```
   deploy.sh уже содержит `npx prisma migrate deploy` — миграция 20260705_sales_plan_v2 применится автоматически.

2. **Verify после деплоя:**
   ```bash
   ssh root@85.198.97.89 "psql -U zoiten -d zoiten_erp -c '\dt \"SalesPlanMonthLevel\"'"
   ```

## Deviations from Plan

None — план выполнен точно. Единственная адаптация: `prisma generate` запущен с фиктивным DATABASE_URL (документировано в environment_notes плана как ожидаемый паттерн, не отклонение).

## Issues Encountered

- `npx prisma` без версии подтянул v7.8.0 (breaking change — убрал `url` из datasource). Решение: `npx prisma@6 validate/generate` — проект использует Prisma 6.19.3.

## Self-Check

- [x] `prisma/schema.prisma` содержит все 5 моделей: `grep -c "model SalesPlanMonthLevel\|..."` → 5
- [x] `enum VirtualPurchaseStatus` присутствует: count → 1
- [x] `plannedArrivalDate` в схеме: count → 1
- [x] 5 back-relations в Product/Supplier/User: count → 5
- [x] `migration.sql` создан: 5 CREATE TABLE, 1 CREATE TYPE, 1 ALTER TABLE, 9 AppSetting INSERT
- [x] BIGSERIAL в migration.sql → 1
- [x] ON DELETE CASCADE → 4 (MonthLevel, DayOverride, VirtualPurchase.product, VersionDay)
- [x] Никаких DROP в migration.sql → 0
- [x] `npx prisma@6 validate` → "The schema at prisma\schema.prisma is valid"
- [x] `npx prisma@6 generate` → "Generated Prisma Client (v6.19.3)"
- [x] Коммиты 63eeb50, 58bab1f существуют в git log

## Self-Check: PASSED

## Next Phase Readiness

- **25-02 (движок lib/sales-plan/):** Prisma-типы SalesPlanMonthLevel, SalesPlanDayOverride, VirtualPurchase, SalesPlanVersion, SalesPlanVersionDay доступны после `prisma generate` — движок может импортировать из `@prisma/client`.
- **25-03 (data-loader):** новые таблицы описаны в схеме — data.ts может писать Prisma-запросы к ним. На проде таблицы появятся после деплоя и `prisma migrate deploy`.
- **Без блокеров:** Wave 1 (движок + data-loader) не требует прод-БД — только TypeScript-типы.

---
*Phase: 25-v2-h2-2026*
*Completed: 2026-07-05*
