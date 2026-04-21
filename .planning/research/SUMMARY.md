# Research Summary — Milestone v1.2 «Управление остатками»

**Milestone:** v1.2 Управление остатками (Phase 14)
**Synthesized:** 2026-04-21
**Source files:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md
**Overall confidence:** HIGH (существующий стек, known codebase) / MEDIUM (WB warehouses dictionary — нет официального API, manual seed)

---

## Executive Summary

Phase 14 — первый milestone, вводящий полноценный раздел поверх зрелого стека Next.js 15 + Prisma 6 + PostgreSQL с уже работающей WB-синхронизацией, AppSetting KV, паттерном sticky-таблиц и Excel-парсерами. **Новых зависимостей не нужно** — весь функционал строится на pattern-reuse из Phase 7 (`PriceCalculatorTable`, `parse-auto-promo-excel.ts`, `GlobalRatesBar`, shadcn Tooltip, AppSetting KV). Единственный действительно новый слой — **per-warehouse остатки WB** с собственным справочником складов и кластеров.

Домен — управление остатками marketplace-продавца (50-200 SKU, команда 10+): агрегация РФ (Иваново + Производство + МП), per-кластер разрез WB (7 кластеров), метрики О/З/Об/Д, глобальная норма оборачиваемости, Excel-импорт склада Иваново, ручной ввод производства. Исследование МойСклад/MPStats/1С показывает, что must-have — это не формулы (стандартные), а **простота загрузки данных + наглядность дефицита**. Сложные supply-chain фичи (EOQ, safety stock с σ-расчётом) избыточны на 200 SKU и деферятся в v1.3+ «Планирование закупок».

Главный риск — **WB Statistics API deprecation** (`/api/v1/supplier/stocks` sunset 2026-06-23) + **отсутствие официального API для cluster mapping**. Обе проблемы решаются в рамках Phase 14: миграция на новый endpoint `POST /api/analytics/v1/stocks-report/wb-warehouses` (уже decided) и manual seed `WbWarehouse` через DevTools → hardcoded array с auto-insert `cluster="Прочие"` + `needsClusterReview` fallback для новых неизвестных складов. Второстепенные риски — null vs 0 семантика, Infinity/NaN в формулах, 28+ колонок в UI — адресуются pure-function модулем `lib/stock-math.ts` + expand-on-demand UX.

---

## Stack Additions — резюме из STACK.md

**Новые зависимости: НЕТ.** Весь milestone на существующем стеке.

Переиспользуется:
- `xlsx@0.18.5` — парсер Иваново, pattern из `parse-auto-promo-excel.ts`
- `zod@4.3.6`, `react-hook-form@7.72.1`, `@hookform/resolvers@5.2.2`
- shadcn `<Tooltip>`, `<Dialog>`, `sonner@2.0.7`, `motion@12.38.0`
- `vitest@4.1.4` — golden tests
- `AppSetting` KV (Phase 7) — новый ключ `stock.turnoverNormDays`

Осознанно **НЕ добавляется**: TanStack Table/Virtual (overkill), Playwright/cheerio (одноразовая задача), react-spreadsheet-import (Chakra конфликт), TreeView (2-уровневая иерархия = row-level toggle).

Новые Prisma модели:
- `WbWarehouse(id Int PK, name, cluster, shortCluster, isActive, needsClusterReview)`
- `WbCardWarehouseStock(wbCardId, warehouseId, quantity)` с `@@unique([wbCardId, warehouseId])`
- `Product.ivanovoStock Int?`, `productionStock Int?` + `*UpdatedAt DateTime?`

---

## Feature Landscape — резюме из FEATURES.md

### Table Stakes (obligatory v1.2)

1. Агрегация РФ = Иваново + Производство + SUM(МП) на Product-level
2. Per-артикул разрез (MarketplaceArticle, не только nmId)
3. Разрез по маркетплейсам (WB; Ozon/ДМ/ЯМ — колонки `—`)
4. Per-кластер разрез WB (7 кластеров)
5. Expand кластер → конкретные склады WB
6. Метрики О/З/Об/Д на всех уровнях
7. Глобальная «Норма оборачиваемости» (default 37, AppSetting, 1..100)
8. Excel-импорт Иваново по УКТ с preview+confirm UI
9. Ручной ввод Производства
10. Цветовая кодировка дефицита (green/yellow/red)
11. RBAC `requireSection("STOCK")` VIEW/MANAGE

### Differentiators

- Единый экран Иваново + Производство + ВСЕ МП (у конкурентов разрозненно)
- Per-артикул вместо per-nmId
- ↻ «Применить глобальную норму» per-строка
- Кнопка «Обновить из WB» на /stock
- Sticky колонки «Товар + УКТ»
- Expand-state в searchParams (shareable links)
- Toggle «Показать только дефицитные» (Д > 0)

### Anti-Features (явно НЕ делаем)

- ❌ Автосписание Иваново по WB заказам (разные физические склады)
- ❌ Real-time polling (rate limit → бан)
- ❌ Остатки per-размер (techSize)
- ❌ Inline-редактирование остатков Иваново/WB (ломает audit trail)
- ❌ Ozon API сейчас (удвоит scope)
- ❌ Fuzzy-matching УКТ (silent errors)
- ❌ Multi-warehouse Иваново (YAGNI, один физический склад)
- ❌ ML-прогноз продаж (линейной экстраполяции достаточно)

### Deferrable → v1.3+

StockMovement log, резервирование, алерты, safety stock/Reorder Point/EOQ, sparkline-графики, Ozon/ДМ/ЯМ API.

---

## Architecture Key Decisions — резюме из ARCHITECTURE.md

1. **`WbCard.stockQty` остаётся как denormalized sum** — 4 read-точки сохраняют backward compat через write-one-transaction.
2. **`Product.ivanovoStock`/`productionStock` — поля** (не отдельные таблицы). YAGNI на multi-warehouse, оба nullable (null ≠ 0).
3. **Per-warehouse write strategy = clean-replace per sync** — `deleteMany + upsert` в транзакции per card. Зомби-записи элиминируются.
4. **Cluster storage: денормализованно в `WbWarehouse.shortCluster`**. Lookup строго по `warehouseId` (int), не по name.
5. **Auto-insert неизвестных складов** с `cluster="Прочие"` + `needsClusterReview`. Sync не падает.
6. **JS-агрегация в RSC** (не SQL GROUP BY) — 2500 rows fit in memory. Паттерн `/prices/wb`.
7. **Expand-state в searchParams** (`?expandedClusters=cfo,yug`). `UserPreference` — только widths/hidden cols.
8. **Отдельный `/stock/wb`**: главная = Product-level, `/stock/wb` = nmId-level + per-warehouse expand. `/stock/ozon` = ComingSoon.
9. **Pure function `lib/stock-math.ts`** (mirror `pricing-math.ts`), guards на З=0, О=null, normDays=0.

### Suggested Build Order — 7 планов

| # | Plan | Зависимости |
|---|------|-------------|
| 14-01 | Schema + routing rename `/inventory → /stock` + Wave 0 smoke tests | — |
| 14-02 | WbWarehouse seed script | 14-01 |
| 14-03 | wb-sync extension (per-warehouse + WB API migration) | 14-01, 14-02 |
| 14-04 | Excel upload Иваново + parser | 14-01 |
| 14-05 | Production manual input + turnover norm | 14-01 |
| 14-06 | /stock RSC page + flat table | 14-01, 14-03, 14-04, 14-05 |
| 14-07 | /stock/wb + cluster expand | 14-06 |

Параллелизация: 14-04 и 14-05 независимы после 14-01. 14-02 и 14-03 можно совмещать если 14-03 использует auto-insert fallback.

---

## Watch Out For — Топ-5 critical pitfalls

### #1. WB Stocks API deprecation (2026-06-23)
Текущий `fetchStocks()` deprecated. **Mitigation:** Wave 0 smoke test, новый endpoint `POST /api/analytics/v1/stocks-report/wb-warehouses`, chunked helper, retry 60s на 429, batch до 1000 nmIds, rate limit 3/min + 20s burst, Personal/Service token.

### #2. Missing row ≠ 0 (zombie data)
WB не возвращает строки с 0 остатком. Upsert без clean-replace → вчерашний quantity остаётся. **Mitigation:** `deleteMany({wbCardId, warehouseId notIn}) + upsert` в транзакции per-card.

### #3. Null vs 0 семантика в Product.ivanovoStock/productionStock
`null` = «ни разу не импортировали», `0` = «точно пусто». `?? 0` → ложный дефицит → ошибочная закупка. **Mitigation:** `Int?` без default, миграция не бэкфиллит, UI рендерит `—` для null, агрегация РФ возвращает null если любой источник null.

### #4. Формула Д при edge cases (З=0, О=0, Norma=0, Infinity/NaN)
`Об = О/З` при З=0 → Infinity → "Infinity" в UI. **Mitigation:** pure `lib/stock-math.ts` с guards (return null), Zod `int().min(1).max(100)` на norm, golden test.

### #5. SKU normalization в Excel Иваново
Excel `{t:"n", v:1}` для `000001`, em-dash U+2014, whitespace. **Mitigation:** `lib/normalize-sku.ts` — trim + upper + em-dash→hyphen + regex `^(?:УКТ-?)?(\d+)$` + padStart(6, "0"). Parser возвращает `{imported, notFound, duplicates, invalid}` + downloadable CSV.

### Дополнительно (moderate):
- **#7 Миграции 2 компа + VPS** — всегда `migrate dev --name <semver>`, одна большая миграция в Wave 0
- **#10 UI 28+ колонок** — expand-on-demand обязателен, default view «только Д > 0», desktop-only
- **#14 Cascade delete** — `WbCardWarehouseStock.wbCard onDelete: Cascade`

---

## Confirmed Decisions

### Decision 1: Route rename `/inventory` → `/stock`

**Rationale:** PROJECT.md говорит `/stock`, код использует `/inventory` (Phase 5 stub). Унификация в Plan 14-01.

**Scope:**
- Переименовать `app/(dashboard)/inventory/` → `app/(dashboard)/stock/`
- Обновить `lib/sections.ts` (строка 11), `components/layout/nav-items.ts` (строка 34), `lib/section-titles.ts`
- **Nginx rewrite** `/inventory(.*)` → `/stock$1` на 1 релиз для закладок
- Release note о переезде

**Confidence:** HIGH. Одна PR, совмещается с schema migration.

### Decision 2: WB API migration в рамках Phase 14

**Scope:**
- **Добавить** `fetchStocksPerWarehouse()` на `POST https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses`
  - Scope: **Аналитика** (не Статистика)
  - Method: **POST**, body `{nmIds, limit, offset}`
  - Rate limit: **3 req/min + 1 req/20s burst**
  - Batch: **до 1000 nmIds** per request
  - Token type: **Personal или Service**
  - Response: `warehouseId, warehouseName, regionName, quantity, inWayToClient, inWayFromClient`
- **Старую `fetchStocks()` не трогаем** — пишет agg `stockQty` как fallback (backward compat)
- **Fallback снять** отдельным quick task **после validation новой функции в production** (1-2 sync-цикла)
- Пометить старую `@deprecated — sunset 2026-06-23`

**Wave 0:** smoke test curl с реальным `WB_API_TOKEN` **до кода** — проверить scope Аналитика + Personal token.

**Confidence:** HIGH.

---

## Implications for Roadmap

**Overall phase structure:** 1 phase (Phase 14) с 7 планами — soft subdivided inside. Последовательность с параллелизацией 14-04/14-05 и 14-02/14-03.

### Research Flags

**Нужен `/gsd:research-phase` перед:**
- **Plan 14-02** — real сбор справочника складов WB через DevTools + валидация cluster names с пользователем
- **Plan 14-04** — real sample Excel Иваново от клиента для golden fixture

**Стандартные паттерны (skip research, pattern-reuse):**
- 14-01 migration + rename
- 14-03 WB API pattern ≈ `fetchBuyoutPercent`
- 14-05 server actions ≈ GlobalRatesBar
- 14-06 таблица ≈ PriceCalculatorTable
- 14-07 expand `useState<Set>`

### Gaps to Address

1. Real Excel sample Иваново — Plan 14-04 Zero Wave
2. Точные cluster names — Plan 14-02 Zero Wave (valid с пользователем)
3. SSR smoke test WB endpoint — Wave 0 Plan 14-01
4. UI mockup review — до Plan 14-06 (28+ колонок)

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new deps, pattern-reuse Phase 7. MEDIUM на WbWarehouse seed workflow (manual) |
| Features | HIGH | Формулы индустриальные, MPSTATS/МойСклад подтверждение. MEDIUM на UX 28 колонок |
| Architecture | HIGH | Integration points verified (wb-api.ts, wb-sync route, schema.prisma). MEDIUM на stockQty backward compat — mitigation sum-on-write |
| Pitfalls | HIGH | 14 pitfalls verified против официальной документации + schema. Critical #1 решается Decision 2 |

**Overall milestone confidence:** HIGH.
