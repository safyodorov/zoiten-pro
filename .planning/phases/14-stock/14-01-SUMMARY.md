---
phase: 14-stock
plan: 01
subsystem: stock-foundation
tags: [prisma, migration, route-rename, rbac, pure-functions, vitest, wave0]
dependency_graph:
  requires: []
  provides:
    - prisma/schema.prisma WbWarehouse+WbCardWarehouseStock
    - lib/stock-math.ts calculateStockMetrics+deficitThreshold
    - lib/normalize-sku.ts normalizeSku
    - lib/wb-clusters.ts CLUSTER_FULL_NAMES+CLUSTER_ORDER
    - app/(dashboard)/stock/ layout+page RSC с RBAC
    - tests/stock-math.test.ts 11 GREEN
    - tests/normalize-sku.test.ts 11 GREEN
    - next.config.ts redirects /inventory → /stock
  affects:
    - middleware.ts (RBAC route guard читает lib/sections.ts)
    - nav-items.ts (sidebar href)
    - Вся фаза 14 разблокирована (Plans 14-02..14-07 зависят от схемы)
tech_stack:
  added: []
  patterns:
    - Prisma manual migration (нет локальной PG → pending для VPS deploy)
    - Pure TypeScript modules без внешних зависимостей (stock-math, normalize-sku)
    - Vitest unit tests с alias @
    - Next.js redirects() в next.config.ts для 308 permanent redirect
key_files:
  created:
    - prisma/migrations/20260421_phase14_stock/migration.sql
    - lib/stock-math.ts
    - lib/normalize-sku.ts
    - lib/wb-clusters.ts
    - app/(dashboard)/stock/layout.tsx
    - app/(dashboard)/stock/page.tsx
    - tests/stock-math.test.ts
    - tests/normalize-sku.test.ts
    - tests/parse-ivanovo-excel.test.ts
  modified:
    - prisma/schema.prisma
    - prisma/seed.ts
    - lib/sections.ts
    - components/layout/section-titles.ts
    - components/layout/nav-items.ts
    - next.config.ts
    - app/(dashboard)/dashboard/page.tsx
    - components/landing/SectionCards.tsx
    - components/landing/variants/Glassmorphism.tsx
  deleted:
    - app/(dashboard)/inventory/page.tsx
decisions:
  - "Prisma миграция создана вручную (нет локальной PG) — применится через deploy.sh на VPS"
  - "plan 14-01 разблокирован без Wave 0 curl (Tasks 1+2 не зависят от WB endpoint scope)"
  - "[Rule 2] dashboard/page.tsx + landing компоненты исправлены /inventory→/stock (критическая корректность ссылок)"
metrics:
  duration: "~7 минут (391 секунда)"
  completed_date: "2026-04-21"
  tasks_completed: 2
  files_created: 9
  files_modified: 9
  files_deleted: 1
---

# Phase 14 Plan 01: Foundation Stock — Summary

**One-liner:** Prisma миграция WbWarehouse+WbCardWarehouseStock+Product fields, pure-функции stock-math/normalize-sku/wb-clusters с vitest тестами, rename /inventory→/stock с 308 redirect и RBAC layout.

---

## Wave 0: Smoke Test нового WB Analytics Endpoint

**Статус:** PENDING — ожидает выполнения пользователем на VPS.

**Endpoint:** `POST https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses`

**Команда для выполнения на VPS:**

```bash
source /etc/zoiten.pro.env
curl -X POST \
  "https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses" \
  -H "Authorization: $WB_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nmIds":[800750522],"limit":10,"offset":0}' \
  -w "\nHTTP %{http_code}\n"
```

**Ожидаемые результаты:**
- HTTP 200 → scope OK, токен подходит, Plan 14-03 разблокирован
- HTTP 401 → токен невалиден → регенерировать в seller.wildberries.ru
- HTTP 403 → scope неверный ИЛИ тип токена Standard → нужен Personal/Service token
- HTTP 429 → rate limit, подождать 20 сек и повторить
- HTTP 422/400 → body неверный (не блокер, endpoint отвечает → scope OK)

**Что нужно вернуть Claude:**
Полный ответ curl (включая HTTP статус и первые 20 строк тела).

**Влияние на планирование:**
- Plans 14-01, 14-02, 14-04, 14-05 — НЕ зависят от результата (выполнены)
- Plan 14-03 — ЗАВИСИТ: если 200/422 → кодировать fetchStocksPerWarehouse; если 401/403 → сначала регенерация токена

---

## Выполненные задачи

### Task 1: Prisma миграция + 3 pure-функции + Wave 0 тесты

**Commit:** `2f9b0cc`

**Созданные файлы:**

#### prisma/schema.prisma (обновлён)
- Добавлена модель `WbWarehouse` (id Int PK, name, cluster, shortCluster, isActive, needsClusterReview)
- Добавлена модель `WbCardWarehouseStock` (id cuid, wbCardId FK cascade, warehouseId FK, quantity, updatedAt, @@unique + 2 @@index)
- WbCard: добавлено поле `warehouses WbCardWarehouseStock[]`
- Product: добавлены поля `ivanovoStock Int?`, `productionStock Int?`, `ivanovoStockUpdatedAt DateTime?`, `productionStockUpdatedAt DateTime?`

#### prisma/migrations/20260421_phase14_stock/migration.sql
- CREATE TABLE WbWarehouse + CREATE TABLE WbCardWarehouseStock
- CREATE UNIQUE INDEX + CREATE INDEX (2 шт)
- ALTER TABLE Product ADD COLUMN (4 колонки)
- INSERT INTO AppSetting ON CONFLICT DO NOTHING (stock.turnoverNormDays=37)

#### prisma/seed.ts (обновлён)
- Добавлен upsert AppSetting `stock.turnoverNormDays = "37"` в конце main()

#### lib/stock-math.ts
- Экспорты: `calculateStockMetrics`, `deficitThreshold`, интерфейсы `StockMetricsInput`, `StockMetricsOutput`
- Все null-guards: О=null, З=null, З=0, normDays≤0, Infinity

#### lib/normalize-sku.ts
- Экспорт: `normalizeSku(raw: string): string`
- Обработка em-dash (U+2014), trim+upper, padStart(6,"0"), throw на invalid

#### lib/wb-clusters.ts
- Экспорты: `CLUSTER_FULL_NAMES` (7 ключей), `CLUSTER_ORDER` (7 элементов), `ClusterShortName` тип

#### tests/stock-math.test.ts — 11 тестов, все GREEN
- calculateStockMetrics: 8 тестов (happy path, О=null, З=0, З=null, norm=0, О=0, norm=37, norm=-1)
- deficitThreshold: 4 теста (happy path, З=null, З=0, крупные числа)

#### tests/normalize-sku.test.ts — 11 тестов, все GREEN
- Canonical: 8 тестов (canonical, short+prefix, only digits, lowercase+spaces, em-dash, 123, no-hyphen, max)
- Invalid: 3 теста (abc, УКТ-, empty)

#### tests/parse-ivanovo-excel.test.ts — 1 skipped (RED stub)
- it.skip("happy path с реальной fixture (ждёт Plan 14-04 Zero Wave)")

**Верификация:**
```
npx prisma validate → "The schema is valid"
npm run test → 2 passed (23 tests GREEN), 1 skipped (1 test)
npx prisma generate → Generated Prisma Client v6.19.3
```

---

### Task 2: Route rename /inventory → /stock + RBAC + layout + placeholder page

**Commit:** `e795c7f`

**Изменённые файлы:**

| Файл | Изменение |
|------|-----------|
| `lib/sections.ts` | `"/inventory": "STOCK"` → `"/stock": "STOCK"` |
| `components/layout/section-titles.ts` | regex `/^\/inventory/` → `/^\/stock/` |
| `components/layout/nav-items.ts` | `href: "/inventory"` → `href: "/stock"` |
| `next.config.ts` | Добавлен `redirects()` с source `/inventory/:path*` → `/stock/:path*`, permanent: true |
| `app/(dashboard)/inventory/page.tsx` | УДАЛЁН (redirect обрабатывает старый URL) |
| `app/(dashboard)/stock/layout.tsx` | СОЗДАН: RSC с `requireSection("STOCK")`, placeholder для StockTabs |
| `app/(dashboard)/stock/page.tsx` | СОЗДАН: RSC placeholder, Plan 14-06 реализует реальную таблицу |

**Верификация:**
- `lib/sections.ts` содержит `"/stock": "STOCK"` — middleware автоматически подхватил
- `next.config.ts` содержит `redirects()` с `source: "/inventory/:path*"` → 308
- `app/(dashboard)/inventory/page.tsx` не существует
- `app/(dashboard)/stock/layout.tsx` содержит `requireSection("STOCK")`
- `npx tsc --noEmit` → 0 ошибок

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Критическая корректность] Исправлены ссылки /inventory в landing и dashboard**

- **Found during:** Task 2, grep проверка
- **Issue:** Компоненты `components/landing/SectionCards.tsx`, `components/landing/variants/Glassmorphism.tsx`, `app/(dashboard)/dashboard/page.tsx` содержали hardcoded `href: "/inventory"` — после rename ссылки вели на несуществующий URL (хотя redirect ловил бы — UX проблема + SEO)
- **Fix:** Заменены на `/stock` в трёх файлах
- **Files modified:** SectionCards.tsx, Glassmorphism.tsx, dashboard/page.tsx
- **Commit:** e795c7f

**2. [Rule 1 - Bug] Исправлен синтаксис prisma/seed.ts**

- **Found during:** Task 2 TypeScript check
- **Issue:** Добавленный upsert AppSetting оказался вне функции `main()` — TypeScript error TS1128
- **Fix:** Перезаписан seed.ts с правильным расположением кода внутри `main()`
- **Files modified:** prisma/seed.ts
- **Commit:** e795c7f

**3. [Rule 3 - Blocking] Очищен .next кэш**

- **Found during:** Task 2 TypeScript check
- **Issue:** `.next/types/app/(dashboard)/inventory/page.ts` содержал устаревшие типы → TypeScript error после удаления папки
- **Fix:** `rm -rf .next` — кэш пересоберётся при следующем `npm run dev`/`npm run build`

---

## Known Stubs

| Файл | Стаб | Причина |
|------|------|---------|
| `app/(dashboard)/stock/page.tsx` | Placeholder текст "Раздел в разработке" | Plan 14-06 реализует реальную таблицу Product-level остатков |
| `tests/parse-ivanovo-excel.test.ts` | `it.skip(...)` | Plan 14-04 Zero Wave: пользователь предоставит реальный .xlsx fixture |

Стабы не блокируют цель плана (Foundation структура создана).

---

## Pending Actions

**До Plan 14-03 (БЛОКЕР):** Пользователь должен выполнить Wave 0 curl smoke test (см. секцию выше) и сообщить HTTP статус. Если 401/403 — регенерировать WB_API_TOKEN в seller.wildberries.ru с типом Personal + scope Аналитика.

**В Plan 14-07 (deploy):** Применить миграцию `prisma migrate deploy` на VPS — `prisma/migrations/20260421_phase14_stock/migration.sql` пока pending.

---

## Self-Check: PASSED

| Проверка | Результат |
|---------|-----------|
| lib/stock-math.ts | FOUND |
| lib/normalize-sku.ts | FOUND |
| lib/wb-clusters.ts | FOUND |
| prisma/migrations/20260421_phase14_stock/migration.sql | FOUND |
| tests/stock-math.test.ts | FOUND |
| tests/normalize-sku.test.ts | FOUND |
| tests/parse-ivanovo-excel.test.ts | FOUND |
| app/(dashboard)/stock/layout.tsx | FOUND |
| app/(dashboard)/stock/page.tsx | FOUND |
| app/(dashboard)/inventory/page.tsx | DELETED (confirmed) |
| Commit 2f9b0cc (Task 1) | FOUND |
| Commit e795c7f (Task 2) | FOUND |
