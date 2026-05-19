---
phase: 19-wb-ads
plan: "03"
subsystem: infra
tags: [wb-api, wb-advert-api, rate-limit, cooldown-bus, tdd]

# Dependency graph
requires:
  - phase: 19-W0
    provides: "Empirical shapes для /promotion/count (двухуровневая), /adv/v3/fullstats (GET+query+null), /balance (без bonus) + per-seller global limiter"
  - phase: 19-02
    provides: "WB_ADS_TOKEN в WB_TOKEN_NAMES; scope bit 30; REQUIRED_SCOPE_BITS[WB_ADS_TOKEN]"
  - phase: quick/260513-khv-per-endpoint-cooldown-locks
    provides: "WB_COOLDOWN_BUCKETS infrastructure (per-bucket cooldown locks)"
provides:
  - "lib/wb-adv-api.ts — type-safe WB Advert API client (3 функции: fetchPromotionCount, fetchFullStats, fetchBalance)"
  - "WbAdvertCount, WbAdvertStat, WbAdvertBalance TypeScript interfaces"
  - "Cooldown bus bucket 'advert' (изолирован от WB_API_TOKEN scope; resolveBucketFromUrl распознаёт advert-api.wildberries.ru)"
  - "Batch logic для /adv/v3/fullstats: ≤100 advertId per request, 1100ms sleep между батчами"
  - "429 handler: читает x-ratelimit-retry (WB) с fallback на Retry-After, бросает WbRateLimitError + setWbCooldownUntil('advert', N)"
affects: [19-04 (cron импортирует fetchPromotionCount/fetchFullStats/fetchBalance), 19-05+ (UI читает persisted данные)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED→GREEN: failing tests первыми, затем реализация под них"
    - "Pure type-safe API client паттерн (как lib/wb-support-api.ts): callAdvert(url, init) единая точка с cooldown-bus check + 429 → WbRateLimitError"
    - "fetchMock.mockImplementation(async () => new Response(...)) для тестов с несколькими батчами — Response.body можно прочитать только раз, factory возвращает свежий объект на каждый call"

key-files:
  created:
    - lib/wb-adv-api.ts
    - tests/wb-adv-api.test.ts
  modified:
    - lib/wb-cooldown.ts
    - tests/wb-cooldown.test.ts

key-decisions:
  - "3 функции (НЕ 4) — fetchPromotionAdverts deprecated (404 в W0); nmId targets выводятся из fullstats.days[].apps[].nms[].nmId union в Plan 19-04"
  - "GET /adv/v3/fullstats с query params (НЕ POST /adv/v2/fullstats body) — endpoint мигрирован, W0 verified"
  - "x-ratelimit-retry header (lowercase, WB-specific) приоритетнее стандартного Retry-After"
  - "FULLSTATS_RATE_SLEEP_MS = 1100ms: WB лимит 1 req/sec + 100ms буфер от per-seller global limiter"
  - "Bucket 'advert' изолирован от WB_API_TOKEN buckets — 429 на Advert API НЕ блокирует Statistics/Prices/Content"
  - "WbAdvertStat.canceled и .name прокидываются из API: canceled = technical cancels (НЕ buyer refusals), name = product label из nms[]"
  - "WbAdvertBalance shape: {balance, net, currency} — БЕЗ поля bonus (W0 проверка)"
  - "fetchFullStats возвращает [] при null response (W0: WB literal null если по period/IDs нет данных)"

patterns-established:
  - "Pattern: новый WB API client → lib/wb-*-api.ts + tests/wb-*-api.test.ts + extend WB_COOLDOWN_BUCKETS + resolveBucketFromUrl branch + WbRateLimitError + setWbCooldownUntil"

requirements-completed: [API-PROMOTION-COUNT, API-PROMOTION-ADVERTS, API-FULLSTATS, API-BALANCE, API-RATE-LIMIT-PROTECTION]

# Metrics
duration: 4min
completed: 2026-05-19
---

# Phase 19 Plan 03: WB Advert API Client Summary

**Создал type-safe WB Advert API client (`lib/wb-adv-api.ts`) с 3 функциями (fetchPromotionCount/fetchFullStats/fetchBalance), интегрированный в существующий cooldown bus через новый bucket 'advert' — обеспечивает rate-limit изоляцию от WB_API_TOKEN scope.**

## What Changed

### `lib/wb-cooldown.ts` (modified)

- Расширил `WB_COOLDOWN_BUCKETS` 10-м значением `"advert"` (было 9).
- В `resolveBucketFromUrl` добавил ветку:
  ```typescript
  if (url.includes("advert-api.wildberries.ru")) return "advert"
  ```
- Bucket `'advert'` изолирован от WB_API_TOKEN scope-ов: 429 на Advert API НЕ блокирует Statistics / Prices / Tariffs / Analytics / Content / Feedbacks / Questions.

### `tests/wb-cooldown.test.ts` (extended)

- Обновил `WB_COOLDOWN_BUCKETS` assertion с 9 → 10 (добавил `"advert"` в конец массива).
- Добавил Test: `WB_COOLDOWN_BUCKETS.toContain("advert")` + `.length === 10`.
- Расширил `resolveBucketFromUrl` it.each с 3 URL-ами для advert-api:
  - `/adv/v1/promotion/count` → `"advert"`
  - `/adv/v3/fullstats?ids=...&beginDate=...&endDate=...` → `"advert"`
  - `/adv/v1/balance` → `"advert"`
- Legacy-migration test переименован «9 bucket-keys» → «все bucket-keys» (текст комментария; цикл уже по `WB_COOLDOWN_BUCKETS` — работает с любым размером массива).
- Итого: **31 теста** (было 22) — все GREEN.

### `lib/wb-adv-api.ts` (NEW)

Type-safe API client (≈200 lines) с 3 публичными функциями + helpers:

```typescript
fetchPromotionCount(): Promise<WbAdvertCount[]>
  // GET /adv/v1/promotion/count
  // Flatten двухуровневой структуры {adverts: [{type, status, count, advert_list: [...]}]}
  // → плоский массив {advertId, type, status, changeTime}

fetchFullStats(advertIds: number[], range: {beginDate, endDate}): Promise<WbAdvertStat[]>
  // GET /adv/v3/fullstats?ids=N1,N2&beginDate=YYYY-MM-DD&endDate=YYYY-MM-DD
  // Батчи ≤100 advertId с sleep(1100ms) между ними
  // Flatten 4-level nesting: campaign → days[] → apps[] → nms[]
  // Возвращает [] при null response (WB W0 behaviour)

fetchBalance(): Promise<WbAdvertBalance>
  // GET /adv/v1/balance
  // Shape: {balance, net, currency} — НЕТ поля bonus
```

Все три:
- Вызывают `await getWbToken("WB_ADS_TOKEN")` (Phase 19-02).
- Делают cooldown-bus check (`getWbCooldownSecondsRemaining("advert")`) перед fetch — если >0, бросают `WbRateLimitError` без обращения к WB.
- На 429: читают `x-ratelimit-retry` (WB header, lowercase) с fallback на `Retry-After`, вызывают `setWbCooldownUntil("advert", N)`, бросают `WbRateLimitError`.

### `tests/wb-adv-api.test.ts` (NEW)

**7 тестов**, все GREEN:

1. `fetchPromotionCount` парсит двухуровневую структуру `adverts[].advert_list[]` → плоский список.
2. На 429 с `x-ratelimit-retry: 60` бросает `WbRateLimitError` + вызывает `setWbCooldownUntil("advert", 60)`.
3. `fetchFullStats` на 250 IDs шлёт 3 GET-запроса (100/100/50) с query params `ids=`, `beginDate=`, `endDate=` (URL-encoded comma `%2C`), последний батч содержит 50 ids.
4. `fetchFullStats` корректно обрабатывает `null` response (вернёт `[]` без падения).
5. (4b) `fetchFullStats` flatten'ит 4-уровневую структуру `campaign → days → apps → nms`, прокидывая `name`, `canceled`, `sum_price → sumPrice` и пр.
6. `fetchBalance` парсит shape `{balance, net, currency}` без `bonus`.
7. Если cooldown активен (`getWbCooldownSecondsRemaining("advert")` > 0) — `fetchPromotionCount` бросает `WbRateLimitError` БЕЗ обращения к WB (fetchMock не вызывается).

## Verification

- `npx vitest run --pool=vmThreads tests/wb-cooldown.test.ts tests/wb-adv-api.test.ts` → **38 passed (2 files, 31+7)**
- `npx tsc --noEmit` → **exits 0** (нет TS errors)
- Grep checks:
  - `grep -q '"advert"' lib/wb-cooldown.ts` → OK
  - `grep -nE "toHaveLength\(9\)|length.*toBe\(9\)" tests/wb-cooldown.test.ts` → no matches (stale assertions удалены)
  - `grep -c "export async function" lib/wb-adv-api.ts` → **3** (fetchPromotionCount + fetchFullStats + fetchBalance, БЕЗ fetchPromotionAdverts)

## Deviations from Plan

### Deviation 1 — `<verification>` block в плане ожидает ≥4 функций (legacy spec)

**Found during:** Task 2 verification.
**Issue:** Plan `<verification>` блок (line 614) утверждает `grep -c "export async function" lib/wb-adv-api.ts ≥ 4`, что не согласуется с revised W0-corrected планом body, который явно требует **3 функции** ("3 функции (БЕЗ fetchPromotionAdverts)" — frontmatter `must_haves`, action раздел Task 2, acceptance_criteria Task 2).
**Resolution:** Following plan body (3 функции). `<verification>` ≥4 — leftover from pre-W0 planning, не обновился при revision. User-prompt also confirms "3 functions: fetchPromotionCount, fetchFullStats, fetchBalance (NO fetchPromotionAdverts)".
**Impact:** None for code; `<verification>` block ≥4 не выполняется, но acceptance_criteria и frontmatter truths удовлетворены.

### Deviation 2 — [Rule 1 — Test bug] Test 3 fixture неправильно использовал mockResolvedValue для multi-batch

**Found during:** Task 2 первый прогон тестов (3/7 failed).
**Issue:** Test 3 (`fetchFullStats sends GET batches of 100 with query params + sleep`) использовал `fetchMock.mockResolvedValue(new Response(JSON.stringify([])))` — один и тот же `Response` объект возвращался для всех 3 батчей. Однако `Response.body` можно прочитать только один раз — на втором батче падает `TypeError: Body is unusable: Body has already been read`. Этот unhandled rejection нарушал event loop, и следующие 2 теста (Test 5 балланс + Test 6 cooldown) падали по timeout 5000ms.
**Fix:** Заменил `mockResolvedValue(...)` на `mockImplementation(async () => new Response(JSON.stringify([])))` — каждый call возвращает свежий Response. Также добавил `vi.useRealTimers()` в `beforeEach` как defensive cleanup (Test 3 переключает на fakeTimers; если test fail произойдёт до `vi.useRealTimers()`, fakeTimers могут утечь в следующие тесты).
**Files modified:** tests/wb-adv-api.test.ts
**Commit:** не делается (per user instruction: don't commit, leave staged for review)

### Deviation 3 — [Rule 1 — Test infra] vitest pool=forks broken project-wide (pre-existing)

**Found during:** Initial test runs.
**Issue:** Дефолтный `npm run test` (= `vitest run`, pool=forks) падает с runner-not-found / TypeError config — это known issue из Plan 19-02 (см. `.planning/phases/19-wb-ads/deferred-items.md`).
**Fix:** Использовал `npx vitest run --pool=vmThreads ...` per documented workaround.
**Files modified:** none (workaround только в verify-команде).

## No Stubs

Все 3 функции полностью реализованы с реальной батч-логикой / 429-handler / cooldown-bus check. Никаких TODO/FIXME/placeholder в `lib/wb-adv-api.ts`.

## Self-Check: PASSED

Created files exist:
- `lib/wb-adv-api.ts` — FOUND
- `tests/wb-adv-api.test.ts` — FOUND

Modified files have expected changes:
- `lib/wb-cooldown.ts` contains `"advert"` and `advert-api.wildberries.ru` branch — FOUND
- `tests/wb-cooldown.test.ts` updated assertions (no stale `toHaveLength(9)` / `toBe(9)`) — FOUND

Verification commands pass:
- vitest run on both files → 38 passed
- tsc --noEmit → 0 errors
- All grep checks pass

No commits made (per user instruction). Files are staged for user review.
