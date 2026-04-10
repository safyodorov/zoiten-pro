---
phase: 07-prices-wb
plan: 01
subsystem: database
tags: [prisma, postgresql, migration, pricing, wb, schema]

requires:
  - phase: 07-prices-wb/07-00
    provides: утверждённые decisions D-01..D-04, D-09 и canonical references

provides:
  - SQL-миграция 20260409_prices_wb (4 новые таблицы + 6 новых полей + seed 6 ставок)
  - Prisma schema с моделями AppSetting, CalculatedPrice, WbPromotion, WbPromotionNomenclature
  - Новые поля в Category/Subcategory/Product/WbCard для pricing overrides и скорости продаж
  - TypeScript-типы Prisma Client для всех новых моделей и полей

affects:
  - 07-02 pricing-math
  - 07-03 wb-promotions-api
  - 07-04 wb-promotions-excel
  - 07-05 wb-sync-avg-speed
  - 07-06 pricing-actions
  - 07-07 pricing-table-ui
  - 07-08 pricing-calculator-dialog
  - 07-11 deploy

tech-stack:
  added: []
  patterns:
    - "Manual SQL migration (не prisma migrate dev) — файлы в prisma/migrations/{timestamp}_name/migration.sql применяются через prisma migrate deploy на VPS"
    - "AppSetting KeyValue pattern — глобальные настройки через одну таблицу (key PK + value TEXT + updatedAt/updatedBy), сериализация value через Zod в server actions"
    - "Seed через INSERT ... ON CONFLICT DO NOTHING — идемпотентно при повторном применении миграции"

key-files:
  created:
    - prisma/migrations/20260409_prices_wb/migration.sql
  modified:
    - prisma/schema.prisma

key-decisions:
  - "D-01: Pricing overrides как поля в Category/Subcategory/Product (не отдельная PricingOverride таблица) — PostgreSQL COALESCE быстрее JOIN'а"
  - "D-02: Глобальные ставки в AppSetting (key PK, value TEXT) — генерическое хранилище, 6 ключей seed'ятся при первой миграции"
  - "D-03: CalculatedPrice с @@unique([wbCardId, slot]) — максимум 3 слота на карточку, snapshot: Json фиксирует полный слепок параметров"
  - "D-04: WbPromotion.id = Int (а не cuid) — соответствует promotionID из WB API, прямое сопоставление без lookup"
  - "D-09: WbCard.avgSalesSpeed7d: Float? — подтягивается из Statistics Sales API (sales за 7 дней / 7) при синхронизации"

patterns-established:
  - "Manual SQL migrations: формат 20YYMMDD_slug/migration.sql, Prisma-compatible имена constraints ({Table}_{field}_fkey, {Table}_{fields}_key), применяется deploy.sh на VPS"
  - "Phase 7 pricing models: все Float? для опциональных процентных полей, JSONB для rawJson/snapshot, TEXT[] для массивов (совместимо с Prisma String[])"

requirements-completed:
  - PRICES-01
  - PRICES-06
  - PRICES-08
  - PRICES-09
  - PRICES-12

duration: 3min
completed: 2026-04-10
---

# Phase 07 Plan 01: DB Migration Summary

**Ручная SQL-миграция для Phase 7 pricing-wb: 4 новые таблицы (AppSetting, CalculatedPrice, WbPromotion, WbPromotionNomenclature) + 6 новых полей в Category/Subcategory/Product/WbCard + seed 6 глобальных ставок**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-10T07:05:20Z
- **Completed:** 2026-04-10T07:07:51Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Создана ручная SQL-миграция `20260409_prices_wb` — готова к применению через `prisma migrate deploy` на VPS
- Prisma schema синхронно обновлена: 4 новые модели + 6 новых полей + обратная relation `WbCard.calculatedPrices`
- Seed 6 глобальных ставок AppSetting с дефолтными значениями (wbWalletPct=2.0, wbAcquiringPct=2.7, wbJemPct=1.0, wbCreditPct=7.0, wbOverheadPct=6.0, wbTaxPct=8.0) через идемпотентный `INSERT ... ON CONFLICT DO NOTHING`
- `npx prisma validate` проходит, `npx prisma generate` генерирует TypeScript Client с новыми типами для всех моделей Phase 7

## Task Commits

1. **Task 1: Написать SQL миграцию** - `b5c0938` (feat)
2. **Task 2: Обновить prisma/schema.prisma и генерировать клиент** - `1f19550` (feat)

## Files Created/Modified

### Created
- `prisma/migrations/20260409_prices_wb/migration.sql` (84 строки) — ручная SQL-миграция с:
  - 4× `CREATE TABLE` (AppSetting, CalculatedPrice, WbPromotion, WbPromotionNomenclature)
  - 2× `CREATE UNIQUE INDEX` (CalculatedPrice_wbCardId_slot_key, WbPromotionNomenclature_promotionId_nmId_key)
  - 2× FK `ALTER TABLE ADD CONSTRAINT` (CalculatedPrice → WbCard Cascade, WbPromotionNomenclature → WbPromotion Cascade)
  - 6× `ALTER TABLE ADD COLUMN` для новых полей
  - 1× `INSERT INTO AppSetting` с 6 seed-строками (ON CONFLICT DO NOTHING)

### Modified
- `prisma/schema.prisma` — добавлено:
  - `Category.defaultDefectRatePct: Float?`
  - `Subcategory.defaultDrrPct: Float?`
  - `Product.drrOverridePct`, `defectRateOverridePct`, `deliveryCostRub: Float?`
  - `WbCard.avgSalesSpeed7d: Float?`
  - `WbCard.calculatedPrices: CalculatedPrice[]` (обратная relation)
  - 4 новых модели в конце файла (в секции «Phase 7: Управление ценами WB»)

## SQL миграция (первые строки)

```sql
-- prisma/migrations/20260409_prices_wb/migration.sql
-- Phase 7: Управление ценами WB
-- Добавляет 4 новые таблицы (AppSetting, CalculatedPrice, WbPromotion, WbPromotionNomenclature)
-- и 6 новых полей в существующие (Category/Subcategory/Product/WbCard).
-- Seed-ит 6 глобальных ставок в AppSetting.

-- 1. AppSetting (глобальные ставки KeyValue)
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
```

## Новые таблицы

| Таблица | Назначение | Ключевые поля |
| --- | --- | --- |
| `AppSetting` | Глобальные ставки (D-02) | key PK, value TEXT, updatedAt, updatedBy |
| `CalculatedPrice` | Расчётные цены пользователя, до 3 слотов на WbCard (D-03) | id, wbCardId FK Cascade, slot 1\|2\|3, name, sellerPrice, snapshot JSONB, `@@unique([wbCardId, slot])` |
| `WbPromotion` | Акции WB (D-04), id = promotionID из WB API | id Int PK, name, type auto\|regular, startDateTime, endDateTime, rangingJson, source API\|EXCEL |
| `WbPromotionNomenclature` | nmId ↔ WbPromotion связь | id, promotionId FK Cascade, nmId, inAction, planPrice, planDiscount, `@@unique([promotionId, nmId])` |

## Новые поля в существующих таблицах

| Модель | Поле | Тип | Назначение |
| --- | --- | --- | --- |
| `Category` | `defaultDefectRatePct` | Float? | Default процент брака per категория (D-01) |
| `Subcategory` | `defaultDrrPct` | Float? | Default ДРР per подкатегория (D-01) |
| `Product` | `drrOverridePct` | Float? | Override ДРР на товар (D-01) |
| `Product` | `defectRateOverridePct` | Float? | Override брака на товар (D-01) |
| `Product` | `deliveryCostRub` | Float? | Доставка на маркетплейс per товар (D-01) |
| `WbCard` | `avgSalesSpeed7d` | Float? | Средняя скорость продаж за 7 дней (D-09) |

## Seed значения AppSetting

| Ключ | Значение | Описание |
| --- | --- | --- |
| `wbWalletPct` | `2.0` | Кошелёк WB, % |
| `wbAcquiringPct` | `2.7` | Эквайринг, % |
| `wbJemPct` | `1.0` | Тариф Джем, % |
| `wbCreditPct` | `7.0` | Кредит, % |
| `wbOverheadPct` | `6.0` | Общие расходы, % |
| `wbTaxPct` | `8.0` | Налог, % |

## Decisions Made

- **Следовали D-01..D-04 и D-09 из 07-CONTEXT.md** — никаких новых архитектурных решений, только реализация утверждённых.
- **`@default([])` для `advantages String[]`** в Prisma schema (было `DEFAULT ARRAY[]::TEXT[]` в SQL) — соответствует паттерну Prisma, синхронно с SQL.
- **Обратная relation `WbCard.calculatedPrices`** добавлена для Prisma Client type-safe доступа (план упоминал `calculatedPrices` в WbCard — реализовано).
- **Комментарии в schema.prisma на русском** — следовали CLAUDE.md convention (язык проекта — русский).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **`npx prisma validate` без DATABASE_URL fails** — `datasource db { url = env("DATABASE_URL") }` требует env var даже для validate. Решение: запускать с inline dummy URL (`DATABASE_URL="postgresql://user:pass@localhost:5432/zoiten_erp" npx prisma validate`). Это характерно для проекта — нет локального PostgreSQL, миграция применяется только на VPS (precedent — Phase 01).
- **Prisma format reformatted schema** — при `npx prisma format` все комментарии `//` переехали в конец строк, и отступы пересчитались. Это ожидаемое поведение форматирования Prisma, не deviation.
- **CRLF warnings при git add** на Windows — ожидаемо, `.gitattributes` (если есть) обработает, не блокирует commit.

## User Setup Required

**Миграция НЕ применялась локально** (нет dev PostgreSQL).

Миграция применится автоматически на VPS через `deploy.sh`:
```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
```
внутри которого уже есть `npx prisma migrate deploy`.

**Важно:** в рамках этого плана миграция на прод **НЕ применяется**. Применение — только в финальном плане 07-11 (deploy) вместе со всем остальным Phase 7 кодом.

Если кто-то захочет применить миграцию руками в изоляции:
```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && DATABASE_URL='postgresql://zoiten:<pass>@localhost:5432/zoiten_erp' npx prisma migrate deploy"
```

## Next Phase Readiness

- ✅ Готово для 07-02 pricing-math: TypeScript типы `AppSetting`, `CalculatedPrice`, `WbPromotion` доступны через Prisma Client
- ✅ Готово для 07-03 wb-promotions-api: `prisma.wbPromotion.upsert()`, `prisma.wbPromotionNomenclature.upsert()` типизированы
- ✅ Готово для 07-05 wb-sync-avg-speed: `WbCard.avgSalesSpeed7d` добавлено
- ✅ Готово для 07-06 pricing-actions: `prisma.appSetting.findMany()`, `prisma.calculatedPrice.create()` типизированы
- ⚠️ Напоминание: перед финальным deploy (07-11) убедиться что в `.env` на VPS DATABASE_URL указывает на правильную БД — `prisma migrate deploy` выполнится автоматически

## Self-Check: PASSED

- ✅ `prisma/migrations/20260409_prices_wb/migration.sql` существует (84 строки)
- ✅ `prisma/schema.prisma` модифицирован: 4 новых модели + 6 новых полей + 1 relation
- ✅ Commit `b5c0938` (Task 1) — в git log
- ✅ Commit `1f19550` (Task 2) — в git log
- ✅ `npx prisma validate` → valid
- ✅ `npx prisma generate` → Generated Prisma Client (v6.19.3)
- ✅ Grep подтвердил 4× `CREATE TABLE`, 8× `ALTER TABLE`, 2× `CREATE UNIQUE INDEX`, 1× `INSERT INTO` в SQL миграции

---
*Phase: 07-prices-wb*
*Completed: 2026-04-10*
