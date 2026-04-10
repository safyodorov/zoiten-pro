---
phase: 07-prices-wb
subsystem: pricing, wb-integration, ui, testing
tags: [prices, wb, promotions, unit-economics, vitest, prisma, rsc, rate-limit, calendar-api, excel-parsing, realtime]

requires:
  - phase: 04-products-module
    provides: Product/Category/Subcategory модели, Prisma schema, server actions pattern
  - phase: 05-ui-module-stubs
    provides: PricesStub → заменён на реальный раздел /prices/wb
  - phase: 06-deployment
    provides: deploy.sh, systemd zoiten-erp.service, nginx SSL, VPS infra

provides:
  - "/prices/wb — онлайн-калькулятор юнит-экономики WB карточек (RSC + client hydration для realtime модалки)"
  - "4 новые Prisma модели: AppSetting (KeyValue), CalculatedPrice (1-3 слота на карточку), WbPromotion (id=promotionID), WbPromotionNomenclature"
  - "6 новых полей: Category.defaultDefectRatePct, Subcategory.defaultDrrPct, Product.drrOverridePct, Product.defectRateOverridePct, Product.deliveryCostRub, WbCard.avgSalesSpeed7d"
  - "Pure function lib/pricing-math.ts — 30 колонок расчёта, fallback chain (Product.override → Subcategory/Category.default → hardcoded), golden test nmId 800750522 → profit 567.68 ₽"
  - "WB Promotions Calendar API интеграция (dp-calendar-api.wildberries.ru) с rate limit 10 req/6 sec"
  - "Excel парсер auto-акций (lib/parse-auto-promo-excel.ts) — колонки по индексам, устойчив к изменениям заголовков"
  - "7 server actions в app/actions/pricing.ts с RBAC (requireSection PRICES + MANAGE)"
  - "PriceCalculatorTable — rowSpan + sticky колонки + indicator strips; GlobalRatesBar — debounced save; PricingCalculatorDialog — realtime pure function пересчёт"
  - "vitest 4.1.4 установлен в проект; 5 test suites (pricing-math, pricing-fallback, pricing-settings, wb-promotions-api, excel-auto-promo), 52 passing tests"
  - "Production live: https://zoiten.pro/prices/wb"

affects: [08-*, phase-работающие-с-WB-Prices-API, phase-Ozon-Pricing]

tech-stack:
  added:
    - vitest@4.1.4 + @vitest/ui
    - xlsx (для парсинга Excel auto-акций)
  patterns:
    - "Pure function pricing-math — source of truth для server и client, работает без импортов"
    - "WB Promotions Calendar API — base URL https://dp-calendar-api.wildberries.ru, sleep(600ms) между запросами + sleep(6000ms) retry на 429"
    - "Excel auto-акции парсятся по индексам колонок (0, 5, 11, 12, 18, 19), не по названиям"
    - "CalculatedPrice.snapshot: Json — полный snapshot входных параметров для воспроизводимости расчётов"
    - "Zod схемы в отдельном файле lib/pricing-schemas.ts (не в server actions — Next.js 'use server' не экспортирует sync values)"
    - "Realtime пересчёт модалки через useWatch + useMemo → calculatePricing (пересчёт только outputs, не inputs)"
    - "Scope checkboxes ДРР/Брак: checked=per-product override, unchecked=category/subcategory default"

key-files:
  created:
    - app/(dashboard)/prices/layout.tsx
    - app/(dashboard)/prices/page.tsx (redirect → /prices/wb)
    - app/(dashboard)/prices/wb/page.tsx (RSC, 431 строк)
    - app/(dashboard)/prices/ozon/page.tsx (ComingSoon stub)
    - app/actions/pricing.ts (333 строк, 7 server actions)
    - app/api/wb-promotions-sync/route.ts (124 строк)
    - app/api/wb-promotions-upload-excel/route.ts (137 строк)
    - lib/pricing-math.ts (404 строк — 30 колонок расчёта, fallback chain)
    - lib/pricing-schemas.ts (87 строк — Zod схемы)
    - lib/parse-auto-promo-excel.ts (89 строк)
    - components/prices/GlobalRatesBar.tsx (126 строк, debounced save)
    - components/prices/PriceCalculatorTable.tsx (523 строк, rowSpan + sticky + indicator strips)
    - components/prices/PriceCalculatorTableWrapper.tsx (67 строк — client hydration для модалки)
    - components/prices/PricingCalculatorDialog.tsx (589 строк — realtime пересчёт)
    - components/prices/PromoTooltip.tsx (67 строк)
    - components/prices/PricesTabs.tsx (33 строк)
    - components/prices/WbPromotionsSyncButton.tsx (63 строк)
    - components/prices/WbAutoPromoUploadButton.tsx (170 строк)
    - components/ui/tooltip.tsx (59 строк — shadcn base-ui wrapper)
    - prisma/migrations/20260409_prices_wb/migration.sql (84 строк, 4 таблицы + 6 полей + seed)
    - tests/pricing-math.test.ts (184 строк — golden test nmId 800750522)
    - tests/pricing-fallback.test.ts (83 строк)
    - tests/pricing-settings.test.ts (73 строк)
    - tests/wb-promotions-api.test.ts (149 строк — mocked rate limit)
    - tests/excel-auto-promo.test.ts (194 строк — реальный fixture)
    - tests/fixtures/auto-promo-sample.xlsx (8 KB)
    - vitest.config.ts
  modified:
    - prisma/schema.prisma (4 новые модели + 6 новых полей)
    - lib/wb-api.ts (+278 строк — Promotions Calendar API клиенты + fetchAvgSalesSpeed7d)
    - app/api/wb-sync/route.ts (интеграция avgSalesSpeed7d)
    - package.json + package-lock.json (vitest, @vitest/ui, xlsx)
    - tsconfig.json (exclude vitest.config.ts + tests/**)
    - CLAUDE.md (+80 строк — секция Phase 7)
    - README.md (+17 строк — подсекция + API endpoints)

key-decisions:
  - "Pricing overrides как поля в Category/Subcategory/Product (не отдельная таблица) — COALESCE быстрее JOIN на 1000-10k товарах"
  - "AppSetting KeyValue (key PK TEXT, value TEXT) — генерическое хранилище глобальных ставок"
  - "WbPromotion.id = Int (= promotionID из WB API), не cuid — прямое сопоставление без lookup"
  - "Pricing formulas извлечены напрямую из raw Excel cell formulas: acquiring/commission/credit/overhead/tax все от sellerPrice (I17*X%), не от priceAfterWallet"
  - "COLUMN_ORDER = 30 элементов; compile-time assertion через conditional type"
  - "lib/pricing-math.ts — pure TypeScript без импортов, используется одновременно в RSC (сервер) и realtime пересчёте (клиент)"
  - "WB Promotions Calendar base URL = https://dp-calendar-api.wildberries.ru (origin s2sauth-calendar), НЕ discounts-prices-api"
  - "fetchPromotionNomenclatures silent return [] при 422 — auto-акции обрабатываются через Excel (D-06), не через API"
  - "fetchAvgSalesSpeed7d обёрнут в try/catch (degraded mode) — sync не падает, если Sales API недоступен"
  - "Excel auto-акций: реальные индексы S=18 (planDiscount), T=19 (status) — план 07-04 ошибочно указывал T=19/U=20 (off-by-one), исправлено"
  - "shadcn tooltip создан вручную как @base-ui/react wrapper (не через CLI) — паттерн dialog.tsx"
  - "GlobalRatesBar: debounced save через useRef<Partial<Record<key, timer>>> — отдельный таймер на поле"
  - "Indicator strip (border-l-4 blue/purple/amber) рендерится на первой не-sticky ячейке, не на <tr> — чтобы не конфликтовать с sticky колонками"
  - "PricingCalculatorDialog: z.number() + valueAsNumber (не z.coerce.number()) — несовместимо с zod 4.x + RHF 7.72 + zodResolver"
  - "Realtime пересчёт через useWatch({name: [5 полей]}) + useMemo → calculatePricing"
  - "Scope checkboxes ДРР/Брак: checked=per-product (updateProductOverride), unchecked=subcategory/category default; Доставка всегда per-product по D-14"
  - "Plan 07-11: tsconfig exclude vitest.config.ts + tests/** — Rule 3 fix, обнаружено при прод deploy"

requirements-completed:
  - PRICES-01
  - PRICES-02
  - PRICES-03
  - PRICES-04
  - PRICES-05
  - PRICES-06
  - PRICES-07
  - PRICES-08
  - PRICES-09
  - PRICES-10
  - PRICES-11
  - PRICES-12
  - PRICES-13
  - PRICES-14
  - PRICES-15
  - PRICES-16

duration: ~2h 40min (сумма по waves 0-9)
completed: 2026-04-10
---

# Phase 07: Управление ценами WB — Phase Summary

**Раздел /prices/wb — онлайн-калькулятор юнит-экономики WB карточек с синхронизацией акций через WB Promotions Calendar API, загрузкой Excel auto-акций из кабинета WB, realtime модалкой пересчёта 30 колонок расчёта, и расчётными ценами в 1-3 слота. Live на https://zoiten.pro/prices/wb.**

## Phase Scope

- **Planning artifacts:** 07-CONTEXT.md, 07-RESEARCH.md (1504 строк), 07-UI-SPEC.md, 07-VALIDATION.md, 07-WAVE0-NOTES.md
- **Plans executed:** 12 (07-00 Wave 0 smoke tests → 07-11 final deploy)
- **Waves:** 0 (research/smoke) → 1 (DB) → 2 (pricing-math) → 3 (WB API) → 4 (routes/upload) → 5 (server actions) → 6 (UI infra) → 7 (UI components) → 8 (RSC page) → 9 (modal + triggers + docs/deploy)
- **Tasks executed:** ~22 (1-3 tasks per plan)
- **Test suites:** 5 (52 passing tests)

## Plan Chain

| Plan | Wave | Topic | Summary |
|------|------|-------|---------|
| 07-00 | 0 | Smoke tests + research | Верификация WB Promotions Calendar URL, golden test nmId 800750522, Excel fixture |
| 07-01 | 1 | Prisma schema + migration | 4 новые модели, 6 полей, seed 6 глобальных ставок |
| 07-02 | 2 | lib/pricing-math.ts | Pure function 30 колонок + fallback chain + golden test |
| 07-03 | 3 | WB Promotions API клиенты | fetchPromotionsList/Details/Nomenclatures + fetchAvgSalesSpeed7d |
| 07-04 | 4 | /api/wb-promotions-sync + /api/wb-promotions-upload-excel | Routes + Excel parser |
| 07-05 | 5 | app/actions/pricing.ts | 7 server actions + Zod схемы в lib/pricing-schemas.ts |
| 07-06 | 6 | UI инфраструктура | PricesTabs, layout, routes, shadcn tooltip |
| 07-07 | 7 | UI компоненты | GlobalRatesBar, PromoTooltip, PriceCalculatorTable |
| 07-08 | 8 | RSC страница /prices/wb | 431 строк, parallel data fetch |
| 07-09 | 9 | PricingCalculatorDialog | Модалка realtime пересчёта |
| 07-10 | 9 | Triggers + empty state | WbPromotionsSyncButton, WbAutoPromoUploadButton, Alert |
| 07-11 | 9 | Docs update + deploy | CLAUDE.md, README.md, VPS deploy, миграция применена |

## Requirements Status (16/16 COMPLETE)

| ID | Требование | Status |
|----|------------|--------|
| PRICES-01 | Раздел /prices/wb с табличной формой юнит-экономики | ✅ (07-08) |
| PRICES-02 | 6 глобальных ставок с editable UI | ✅ (07-07) |
| PRICES-03 | Регулярные акции WB через Calendar API sync | ✅ (07-03, 07-04, 07-10) |
| PRICES-04 | Auto-акции через Excel upload | ✅ (07-04, 07-10) |
| PRICES-05 | 30 колонок расчёта с формулами из Excel | ✅ (07-02, 07-07) |
| PRICES-06 | Fallback chain: product override → subcategory/category default → hardcoded | ✅ (07-02) |
| PRICES-07 | Модалка realtime пересчёта | ✅ (07-09) |
| PRICES-08 | Расчётные цены в 1-3 слота на карточку | ✅ (07-09, CalculatedPrice модель) |
| PRICES-09 | Indicator strips (голубая/фиолетовая/янтарная) | ✅ (07-07) |
| PRICES-10 | RBAC: requireSection PRICES / MANAGE | ✅ (07-05, 07-08) |
| PRICES-11 | rowSpan + sticky колонки в таблице | ✅ (07-07) |
| PRICES-12 | Tooltip с description + advantages | ✅ (07-06, 07-07) |
| PRICES-13 | avgSalesSpeed7d из WB Sales API | ✅ (07-03) |
| PRICES-14 | Доставка per-product override | ✅ (07-01, 07-07) |
| PRICES-15 | Snapshot Json в CalculatedPrice | ✅ (07-01, 07-05) |
| PRICES-16 | Документация + production deploy | ✅ (07-11) |

## Golden Test Result

**File:** `tests/pricing-math.test.ts`

**Input:** nmId 800750522, sellerPrice = 2480, cost = 650, wbDiscountPct = 0, walletPct = 2.0, commFbwPct = 18, drrPct = 10, defectRatePct = 2, deliveryCostRub = 130, avgSalesSpeed7d = 1.5

**Expected from canonical Excel (07-WAVE0-NOTES.md §2):**
- profit ≈ 567.68 ₽
- ROI ≈ 26%
- Re продаж ≈ 7%

**Actual:** exactly ≈ 567.68 (tolerance 0.01) → ✅ PASS

## Test Coverage

```
 Test Files  5 passed (5)
      Tests  52 passed (52)
```

- `pricing-math.test.ts` — golden test + zero guards + edge cases (10 tests)
- `pricing-fallback.test.ts` — fallback chain ДРР/брак/доставка (8 tests)
- `pricing-settings.test.ts` — Zod валидация input schemas (11 tests)
- `wb-promotions-api.test.ts` — mocked rate limit 10/6 sec + 429 retry (12 tests)
- `excel-auto-promo.test.ts` — реальный fixture парсинг по индексам (11 tests)

## Database Changes

**Migration:** `prisma/migrations/20260409_prices_wb/migration.sql`

**Новые таблицы:**
1. `AppSetting` (key PK TEXT, value TEXT, updatedAt, updatedBy) — 6 seed записей
2. `CalculatedPrice` (id, wbCardId FK → WbCard CASCADE, slot 1/2/3, name, sellerPrice, drrPct, defectRatePct, deliveryCostRub, snapshot Json, createdAt, updatedAt) — unique (wbCardId, slot)
3. `WbPromotion` (id INT PK = promotionID, name, description, advantages TEXT[], startDateTime, endDateTime, type, rangingJson Json, source, lastSyncedAt, createdAt)
4. `WbPromotionNomenclature` (id, promotionId FK → WbPromotion CASCADE, nmId, inAction, planPrice, planDiscount, currentPrice, status) — unique (promotionId, nmId)

**Новые поля:**
- `Category.defaultDefectRatePct` DOUBLE PRECISION
- `Subcategory.defaultDrrPct` DOUBLE PRECISION
- `Product.drrOverridePct`, `Product.defectRateOverridePct`, `Product.deliveryCostRub` DOUBLE PRECISION
- `WbCard.avgSalesSpeed7d` DOUBLE PRECISION

**Seed:**
```sql
INSERT INTO "AppSetting" VALUES
  ('wbWalletPct', '2.0'), ('wbAcquiringPct', '2.7'), ('wbJemPct', '1.0'),
  ('wbCreditPct', '7.0'), ('wbOverheadPct', '6.0'), ('wbTaxPct', '8.0')
ON CONFLICT DO NOTHING;
```

Применена на VPS 2026-04-10 → 4 таблицы существуют, 6 ключей засидены с правильными дефолтами.

## Deployment Status

- **Git:** все 12 планов запушены в `origin/main` (последний HEAD: 46cc42a)
- **VPS pull:** успешен, 68 файлов изменено, 18169+ строк добавлено
- **Prisma migrate deploy:** `20260409_prices_wb` применён
- **deploy.sh:** `git pull` → `npm ci --omit=dev` → `npx prisma migrate deploy` → `npm run build` → `systemctl restart zoiten-erp` → ✅
- **Service status:** `zoiten-erp.service — active (running)`
- **Health check:** `curl https://zoiten.pro/prices/wb` → HTTP 302 → `/login` (RBAC корректно защищает read)
- **DB verification:** 4 таблицы + 6 ставок с дефолтами (2.0/2.7/1.0/7.0/6.0/8.0)

## Known Issues / Deferred Items

- **Pre-existing TS error from 07-03** — `tests/pricing-settings.test.ts(2,61)` — разрешено в 07-04 (модуль app/actions/pricing.ts создан в 07-05)
- **Auto-акции через API:** WB возвращает 422 на `/nomenclatures` для auto-акций — обработано через Excel upload (D-06)
- **WB_API_TOKEN scope:** токен на VPS должен иметь scope «Цены и скидки» (bit 3); уже проверено в Wave 0 smoke test
- **Sales API degraded mode:** если Sales API недоступен при sync, `avgSalesSpeed7d` остаётся null (не блокирует sync)

## Next Phase Recommendations

Если планируется Phase 8 — возможные направления:
1. **Отправка цен в WB через Prices API** — из CalculatedPrice в продакшн через `/api/v2/upload/task`
2. **История расчётов** — audit log для CalculatedPrice (кто/когда/что поменял)
3. **Экспорт расчётных цен в Excel** — для выгрузки в другие системы
4. **Ozon Pricing** — аналог для Ozon маркетплейса (сейчас заглушка)
5. **Bulk-редактирование** — применить параметры к нескольким товарам одним действием
6. **Графики ROI/маржи по времени** — на основе снапшотов
7. **Алерты при падении ROI ниже порога** — интеграция с notification системой

## Files Delivered (сводно)

- **Планирование:** 5 docs (07-CONTEXT.md, 07-RESEARCH.md, 07-UI-SPEC.md, 07-VALIDATION.md, 07-WAVE0-NOTES.md) + 12 PLAN.md + 12 SUMMARY.md
- **Backend:** 3 API routes, 7 server actions, 2 pure lib modules, 1 Prisma migration, 1 schema update
- **Frontend:** 1 RSC page, 1 client wrapper, 1 tabs component, 9 UI компонентов в components/prices, 1 shadcn tooltip
- **Tests:** 5 vitest suites, 1 Excel fixture, 1 vitest.config.ts
- **Docs:** CLAUDE.md секция Phase 7, README.md подсекция + API endpoints

**Total impact (в одном прод pull):** 68 файлов изменено, 18169+ строк добавлено

---
*Phase: 07-prices-wb*
*Completed: 2026-04-10*
*Production: https://zoiten.pro/prices/wb*
