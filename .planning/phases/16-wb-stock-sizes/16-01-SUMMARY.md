---
phase: 16-wb-stock-sizes
plan: "01"
subsystem: schema-migration
tags:
  - schema
  - migration
  - per-user-prefs
dependency-graph:
  requires:
    - prisma/schema.prisma (existing WbCardWarehouseStock + User)
    - prisma/migrations/20260422_add_user_stock_wb_hidden_warehouses (паттерн manual SQL)
  provides:
    - "WbCardWarehouseStock.techSize String"
    - "WbCardWarehouseStock @@unique([wbCardId, warehouseId, techSize])"
    - "User.stockWbShowSizes Boolean"
    - prisma/migrations/20260423_phase16_size_breakdown/migration.sql
  affects:
    - prisma/schema.prisma
tech-stack:
  added: []
  patterns:
    - manual SQL migration (Phase 14/15/quick 260422-oy5 паттерн)
    - per-user UI preference на User (Boolean)
    - compound unique key для multi-tenant rows
key-files:
  created:
    - prisma/migrations/20260423_phase16_size_breakdown/migration.sql
  modified:
    - prisma/schema.prisma
decisions:
  - techSize именовано как в WB API (а не "size") — соответствует Statistics API response
  - DELETE legacy rows WHERE techSize = '' — clean re-sync вместо UPDATE миграции
  - Локально миграция НЕ применяется — Plan 16-06 запустит prisma migrate deploy на VPS
metrics:
  duration: 85s
  completed: "2026-04-28T10:53:36Z"
  tasks: 2
  files: 2
  commits:
    - 760ffa7
    - 85dcff4
requirements:
  - STOCK-31
---

# Phase 16 Plan 01: Schema Migration Foundation Summary

Foundation для Phase 16 (размерная разбивка остатков WB): расширены `WbCardWarehouseStock` (добавлено `techSize` + compound unique) и `User` (`stockWbShowSizes` Boolean) — manual SQL миграция готова к deploy на VPS в Plan 16-06.

## Что сделано

### Task 1: prisma/schema.prisma расширен

**`WbCardWarehouseStock`** (was: nm-level aggregate per warehouse → became: per-size per warehouse):

```prisma
model WbCardWarehouseStock {
  id          String      @id @default(cuid())
  wbCardId    String
  wbCard      WbCard      @relation(fields: [wbCardId], references: [id], onDelete: Cascade)
  warehouseId Int
  warehouse   WbWarehouse @relation(fields: [warehouseId], references: [id])
  // Phase 16 (STOCK-31): per-size остаток. "" = legacy/неизвестно (после миграции
  // все rows с techSize="" удалены, при первом sync API заполнит реальные значения
  // вроде "46", "48", "S", "M" или "0" для одно-размерных товаров).
  techSize    String      @default("")
  quantity    Int         @default(0)
  updatedAt   DateTime    @updatedAt

  @@unique([wbCardId, warehouseId, techSize])  // ← было [wbCardId, warehouseId]
  @@index([wbCardId])
  @@index([warehouseId])
}
```

**`User`** (новое поле рядом с `stockWbHiddenWarehouses`):

```prisma
  // Per-user список скрытых WB-складов на странице /stock/wb (quick 260422-oy5).
  // Чисто визуальный фильтр — НЕ влияет на агрегаты.
  stockWbHiddenWarehouses Int[]                 @default([])
  // Phase 16 (STOCK-31): per-user toggle кнопки «По размерам» в /stock/wb.
  stockWbShowSizes        Boolean               @default(false)  // ← добавлено
  preferences      UserPreference[] // ...
```

`npx prisma generate` запущен — Prisma client обновлён, новые поля доступны для типов в TS.

### Task 2: prisma/migrations/20260423_phase16_size_breakdown/migration.sql создан

Manual SQL миграция (паттерн Phase 14/15) с 5 DDL операциями:

```sql
-- Phase 16 (STOCK-31): per-size breakdown в WbCardWarehouseStock + User.stockWbShowSizes
--
-- WARNING (UAT): шаг DELETE стирает все legacy rows. После применения миграции
-- /stock/wb пустой до re-sync. Plan 16-06: bash deploy.sh + node scripts/wb-sync-stocks.js
-- ИЛИ нажать «Обновить из WB» в UI. Окно отсутствия данных ~30s.

-- ─── 1. WbCardWarehouseStock + techSize ──────────────────────────

ALTER TABLE "WbCardWarehouseStock"
  ADD COLUMN "techSize" TEXT NOT NULL DEFAULT '';

ALTER TABLE "WbCardWarehouseStock"
  DROP CONSTRAINT IF EXISTS "WbCardWarehouseStock_wbCardId_warehouseId_key";

DROP INDEX IF EXISTS "WbCardWarehouseStock_wbCardId_warehouseId_key";

CREATE UNIQUE INDEX "WbCardWarehouseStock_wbCardId_warehouseId_techSize_key"
  ON "WbCardWarehouseStock" ("wbCardId", "warehouseId", "techSize");

-- Truncate legacy aggregates чтобы избежать конфликта с per-size rows при первом sync.
-- После применения этой миграции UI /stock/wb пустой ~30 секунд до re-sync (Plan 16-06).
DELETE FROM "WbCardWarehouseStock" WHERE "techSize" = '';

-- ─── 2. User.stockWbShowSizes ────────────────────────────────────

ALTER TABLE "User"
  ADD COLUMN "stockWbShowSizes" BOOLEAN NOT NULL DEFAULT false;
```

## Коммиты

| # | Hash | Файл | Сообщение |
|---|------|------|-----------|
| 1 | `760ffa7` | prisma/schema.prisma | feat(16-01): расширить Prisma schema для размерной разбивки WB остатков |
| 2 | `85dcff4` | prisma/migrations/20260423_phase16_size_breakdown/migration.sql | feat(16-01): manual SQL миграция Phase 16 — size breakdown + stockWbShowSizes |

## Verification Results

| Acceptance Criteria | Status |
|--------------------|--------|
| `grep -c 'techSize\s*String\s*@default("")' prisma/schema.prisma` >= 1 | PASS (1) |
| `grep -c '@@unique(\[wbCardId, warehouseId, techSize\])' prisma/schema.prisma` == 1 | PASS (1) |
| Старый `@@unique([wbCardId, warehouseId])` удалён из WbCardWarehouseStock | PASS (0) |
| `grep -c 'stockWbShowSizes\s*Boolean\s*@default(false)' prisma/schema.prisma` == 1 | PASS (1) |
| `grep -c 'stockWbHiddenWarehouses' prisma/schema.prisma` == 1 | PASS (1) |
| migration.sql существует и содержит 5 DDL операций | PASS |
| `ADD COLUMN "techSize" TEXT NOT NULL DEFAULT` | PASS |
| `DROP CONSTRAINT IF EXISTS "WbCardWarehouseStock_wbCardId_warehouseId_key"` | PASS |
| `CREATE UNIQUE INDEX "WbCardWarehouseStock_wbCardId_warehouseId_techSize_key"` | PASS |
| `DELETE FROM "WbCardWarehouseStock" WHERE "techSize" = ''` | PASS |
| `ADD COLUMN "stockWbShowSizes" BOOLEAN NOT NULL DEFAULT false` | PASS |
| `npx prisma generate` успешно — Prisma client v6.19.3 сгенерирован | PASS |

**ВАЖНО:** `WbCardWarehouseOrders` (Phase 15) сохраняет старый `@@unique([wbCardId, warehouseId])` — корректно, размерная разбивка не делается для orders в Phase 16 (см. CONTEXT.md «Per-size З» — TBD).

## Что использует Plan 16-02..06

| Plan | Использует |
|------|------------|
| **16-02** (lib/wb-api.ts) | `WbCardWarehouseStock.techSize` для upsert per-size; compound unique key `wbCardId_warehouseId_techSize` для idempotent write |
| **16-03** (lib/stock-wb-data.ts) | Запросы по новому compound unique; группировка per-size в `WbStockRow` |
| **16-04** (UI кнопка «По размерам») | `User.stockWbShowSizes` через `prisma.user.findUnique` + server action toggle |
| **16-05** (StockWbTable per-size rows) | Чтение sizeBreakdown из data helper |
| **16-06** (deploy + UAT) | `prisma migrate deploy` применит миграцию на VPS → re-sync через UI кнопку или `node scripts/wb-sync-stocks.js` |

## Deviations from Plan

None — план выполнен точно как написан.

## Auth Gates

None — локальные изменения без внешних API вызовов.

## Self-Check: PASSED

**Files verified:**
- FOUND: prisma/schema.prisma (modified, 7 insertions / 1 deletion)
- FOUND: prisma/migrations/20260423_phase16_size_breakdown/migration.sql (27 lines)

**Commits verified:**
- FOUND: 760ffa7 (feat: schema.prisma)
- FOUND: 85dcff4 (feat: migration.sql)

**Schema validation:**
- Prisma client успешно сгенерирован (v6.19.3) — schema синтаксически корректна

**Reminder:** Миграция НЕ применена локально (нет PostgreSQL). Plan 16-06 запустит её на VPS через `bash deploy.sh` (`prisma migrate deploy`). Между этим — Plan 16-02..05 пишут код, который компилируется и тестируется против обновлённого Prisma client, но базы данных в окружении dev/test не касается.
