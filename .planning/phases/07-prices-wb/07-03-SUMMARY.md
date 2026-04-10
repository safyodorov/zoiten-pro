---
phase: 07-prices-wb
plan: 03
subsystem: wb-api
tags: [wb-api, promotions, sales-speed, rate-limiting]
requires:
  - lib/wb-api.ts (существующий: fetchAllCards, fetchAllPrices, fetchWbDiscounts, fetchStocks, fetchBuyoutPercent, fetchStandardCommissions)
  - app/api/wb-sync/route.ts (существующий endpoint)
  - prisma.WbCard.avgSalesSpeed7d (поле добавлено в 07-01)
  - tests/wb-promotions-api.test.ts (RED stub из 07-00 Wave 0)
provides:
  - lib/wb-api.ts::fetchAllPromotions
  - lib/wb-api.ts::fetchPromotionDetails
  - lib/wb-api.ts::fetchPromotionNomenclatures
  - lib/wb-api.ts::fetchAvgSalesSpeed7d
  - lib/wb-api.ts::PROMO_API (константа)
  - lib/wb-api.ts::WbPromotionRaw
  - lib/wb-api.ts::WbPromotionDetailsRaw
  - lib/wb-api.ts::WbPromotionNomenclatureRaw
affects:
  - app/api/wb-sync/route.ts (добавлен вызов fetchAvgSalesSpeed7d + поле avgSalesSpeed7d в upsert)
  - tests/wb-promotions-api.test.ts (RED → GREEN, добавлены stubEnv WB_API_TOKEN)
tech_stack:
  added: []
  patterns:
    - rate-limit через sleep(600ms) между pagination-запросами
    - backoff sleep(6000ms) + retry(1) при 429
    - silent return [] при 422 для auto-акций (Promotions nomenclatures)
    - degraded mode (пустой Map) при ошибке Statistics Sales API
    - vi.stubEnv в тестах для подмены WB_API_TOKEN
key_files:
  created:
    - .planning/phases/07-prices-wb/deferred-items.md
    - .planning/phases/07-prices-wb/07-03-SUMMARY.md
  modified:
    - lib/wb-api.ts (+260 строк: 4 функции + 3 interface + 3 константы + sleep helper)
    - app/api/wb-sync/route.ts (+23 строк: импорт + try/catch блок + поле в upsert)
    - tests/wb-promotions-api.test.ts (+6 строк: stubEnv WB_API_TOKEN в 2 beforeEach)
decisions:
  - PROMO_API = https://dp-calendar-api.wildberries.ru (верифицировано Wave 0 smoke test, НЕ discounts-prices-api)
  - Rate delay = 600ms (10 req / 6 sec даёт безопасный интервал)
  - 429 backoff = 6000ms + retry(1) — один повтор, потом throw
  - fetchPromotionNomenclatures silent return [] при 422 (auto-акции обрабатываются через Excel, D-06)
  - fetchAvgSalesSpeed7d degraded mode — при ошибке возвращает пустой Map, поле в БД останется null
  - Ключ возврата avgPerDay = count(sales) / 7 (простая агрегация по Sales API за 7 дней)
  - В тестах используется vi.stubEnv + vi.unstubAllEnvs для WB_API_TOKEN (getToken валидирует наличие)
metrics:
  duration: 6min
  completed_date: 2026-04-10
  tasks: 2
  files_modified: 3
  files_created: 2
---

# Phase 07 Plan 03: WB Promotions API + avgSalesSpeed7d Summary

Расширил `lib/wb-api.ts` 4 экспортными функциями для работы с WB Promotions Calendar API (синхронизация акций) и Statistics Sales API (средняя скорость продаж за 7 дней), интегрировал `fetchAvgSalesSpeed7d` в существующий `/api/wb-sync/route.ts` с degraded mode.

## Что сделано

### Task 1: 4 новые функции в `lib/wb-api.ts`

Все функции добавлены **в конец файла** (существующий код нетронут). Новые identifiers:

```typescript
// Константы
const PROMO_API = "https://dp-calendar-api.wildberries.ru"
const PROMO_RATE_DELAY_MS = 600
const PROMO_429_BACKOFF_MS = 6000

// Interfaces
export interface WbPromotionRaw { id, name, description?, advantages?, startDateTime, endDateTime, type }
export interface WbPromotionDetailsRaw { id, name?, description?, advantages?, ranging? }
export interface WbPromotionNomenclatureRaw { nmID, price?, planPrice?, discount?, planDiscount?, inAction? }

// Functions
export async function fetchAllPromotions(startDate: Date, endDate: Date): Promise<WbPromotionRaw[]>
export async function fetchPromotionDetails(ids: number[]): Promise<WbPromotionDetailsRaw[]>
export async function fetchPromotionNomenclatures(promotionId: number): Promise<WbPromotionNomenclatureRaw[]>
export async function fetchAvgSalesSpeed7d(nmIds: number[]): Promise<Map<number, number>>
```

**Rate limit стратегия (WB Promotions: 10 req / 6 sec):**

- `fetchAllPromotions` — pagination через `limit=100` + `offset`, пауза 600ms между страницами, при 429 один retry после sleep(6000), затем throw.
- `fetchPromotionDetails` — батчи по 10 promotionIDs, пауза 600ms между батчами, retry(1) на 429.
- `fetchPromotionNomenclatures` — одиночный запрос, **silent return `[]` при 422** (это код для auto-акций — они обрабатываются через Excel в D-06), retry(1) на 429.

**fetchAvgSalesSpeed7d — стратегия:**

- Вызывает `GET /api/v1/supplier/sales?dateFrom={7d_ago}&flag=0` на Statistics API
- Агрегация: `count(sales) по nmId / 7 = avgPerDay`
- Возвращает только те nmId, что переданы на вход (фильтрация по Set)
- При 429 ждёт 60 секунд (Statistics API ~1 req/min) и рекурсивно retry
- При любой другой ошибке — **degraded mode**: возвращает пустой Map, лог в `console.error`
- Это обеспечивает, что основная синхронизация не падает, если Sales API недоступен

### Task 2: Интеграция `fetchAvgSalesSpeed7d` в `/api/wb-sync/route.ts`

Аддитивная правка — ни один существующий шаг не удалён/изменён.

1. Добавлен импорт `fetchAvgSalesSpeed7d` (вместе с остальными из `@/lib/wb-api`).
2. После `fetchWbDiscounts(nmIds)` добавлен try/catch блок:
   ```typescript
   let salesSpeedMap = new Map<number, number>()
   try {
     salesSpeedMap = await fetchAvgSalesSpeed7d(nmIds)
   } catch (e) {
     console.error("fetchAvgSalesSpeed7d failed:", e)
   }
   ```
3. В цикле обработки карточек извлекается значение:
   ```typescript
   const avgSalesSpeed7d = salesSpeedMap.get(card.nmId) ?? null
   ```
4. Поле `avgSalesSpeed7d` добавлено в **оба** объекта `prisma.wbCard.upsert` — `update` и `create`.
5. `maxDuration` уже был 300 секунд (строка 4) — изменений не требовалось.

### Зафиксированный PROMO_API URL

**`https://dp-calendar-api.wildberries.ru`**

Верифицировано Wave 0 smoke test (07-WAVE0-NOTES.md §3):
- DNS резолвится, TLS handshake успешен
- Endpoint `/api/v1/calendar/promotions` отвечает 401 без токена (ожидаемо)
- `origin: s2sauth-calendar` в ответе — это именно Promotions Calendar auth-шлюз
- Альтернатива `discounts-prices-api.wildberries.ru` относится к другому шлюзу (Prices API), не использовать для Promotions

Scope-проверка токена (bit 3 «Цены и скидки», bit 4 «Продвижения») отложена до VPS deploy (07-11).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Добавлен `vi.stubEnv("WB_API_TOKEN", ...)` в тесты**

- **Found during:** Task 1 (после добавления функций)
- **Issue:** Тесты `tests/wb-promotions-api.test.ts` падали с `Error: WB_API_TOKEN не настроен`, потому что `getToken()` вызывается до замоканного `fetch`. RED stub от 07-00 не учитывал, что функции используют `getToken()`.
- **Fix:** В двух `describe` блоках добавлен `vi.stubEnv("WB_API_TOKEN", "test-token")` в `beforeEach` и `vi.unstubAllEnvs()` в `afterEach`.
- **Files modified:** `tests/wb-promotions-api.test.ts` (+6 строк)
- **Commit:** 79c778b (в том же коммите что и Task 1, т.к. это нужный компонент для GREEN)

**2. [Rule 3 - Blocking] Зафиксирован out-of-scope TS error в deferred-items.md**

- **Found during:** TypeScript compile check после Task 1
- **Issue:** `tests/pricing-settings.test.ts(2,61)` ругается на отсутствующий модуль `@/app/actions/pricing` — это RED stub от 07-00 Wave 0 Task 2 для плана 07-04.
- **Fix:** Не трогать — задокументировать в `.planning/phases/07-prices-wb/deferred-items.md`. Станет GREEN после реализации actions/pricing в 07-04.
- **Files created:** `.planning/phases/07-prices-wb/deferred-items.md`
- **Commit:** 79c778b

### Architectural changes

Нет. План 07-03 выполнен чисто аддитивно.

## Что тестировалось локально

```bash
npx vitest run tests/wb-promotions-api.test.ts
# → 4 passed (4), Duration 348ms
```

Проверяемые сценарии (mocked fetch + fake timers):

1. `fetchAllPromotions` делает pagination до пустого ответа — 2 вызова fetch
2. `fetchAllPromotions` на 429 делает sleep(6000) и retry — также 2 вызова fetch
3. `fetchAllPromotions` использует правильный base URL `dp-calendar-api.wildberries.ru`
4. `fetchPromotionDetails` разбивает 25 ID на 3 батча (10+10+5)

TypeScript compile (`npx tsc --noEmit`) — чисто, кроме pre-existing ошибки в `tests/pricing-settings.test.ts` (задокументирована в deferred-items.md).

## Что будет работать после деплоя

- **План 07-04** (`/api/wb-promotions-sync` и `/api/wb-promotions-upload-excel`) сможет использовать `fetchAllPromotions`, `fetchPromotionDetails`, `fetchPromotionNomenclatures` из `lib/wb-api.ts`.
- **План 07-07** (`PriceCalculatorTable`) сможет читать `wbCard.avgSalesSpeed7d` и показывать в колонке «Сводка» (формат `N шт./день`).
- При следующем ручном нажатии «Синхронизировать с WB» → поле `WbCard.avgSalesSpeed7d` автоматически заполнится для всех карточек, у которых были продажи за последние 7 дней.

## Примечание: существующие WbCards

Существующие записи `WbCard` в БД получат значение `avgSalesSpeed7d` **только после следующей полной синхронизации** через `/api/wb-sync`. До этого поле останется `NULL` (default из миграции 07-01).

Для карточек, у которых нет продаж за 7 дней, `salesSpeedMap.get()` вернёт `undefined` → `?? null` → поле останется `NULL`. Это ожидаемое поведение (не ошибка).

## Known Stubs

Нет. Все функции реализованы полностью, интеграция в `/api/wb-sync` активна.

## Commits

- `79c778b` — feat(07-03): добавить 4 функции WB Promotions + avgSalesSpeed7d в lib/wb-api.ts
- `72f0a0c` — feat(07-03): интегрировать fetchAvgSalesSpeed7d в /api/wb-sync route

## Self-Check: PASSED

- `lib/wb-api.ts` — FOUND, 4 новые функции присутствуют (`grep` matches: fetchAllPromotions, fetchPromotionDetails, fetchPromotionNomenclatures, fetchAvgSalesSpeed7d)
- `app/api/wb-sync/route.ts` — FOUND, содержит `fetchAvgSalesSpeed7d` (импорт + вызов) и `avgSalesSpeed7d` (2 раза в upsert)
- `tests/wb-promotions-api.test.ts` — FOUND, 4/4 tests GREEN
- Commit `79c778b` — FOUND in git log
- Commit `72f0a0c` — FOUND in git log
- `.planning/phases/07-prices-wb/deferred-items.md` — FOUND
- `.planning/phases/07-prices-wb/07-03-SUMMARY.md` — FOUND (этот файл)
