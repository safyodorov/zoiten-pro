---
phase: 260513-khv
plan: 01
type: quick
wave: 1
depends_on: []
files_modified:
  - lib/wb-cooldown.ts
  - lib/wb-api.ts
  - lib/wb-support-api.ts
  - tests/wb-cooldown.test.ts
  - tests/wb-fetch-rate-limit.test.ts
autonomous: true
requirements: [QUICK-260513-KHV]

must_haves:
  truths:
    - "Statistics 3h ban НЕ блокирует параллельный sync Prices / Tariffs / Content / Analytics — каждый endpoint имеет свой cooldown bucket."
    - "Перезапуск /api/wb-sync после 429 на /supplier/stocks продолжает работу на Prices/Tariffs/Content (не throws WbRateLimitError 'global cooldown' для соседей)."
    - "Существующий buffer-formula `unlockAt = now + max(retryAfterSec, 900) + 120` сохранён per-bucket — не сократился, не удвоился."
    - "Idempotent max() работает per bucket — более далёкий lock того же bucket не сокращается коротким retry."
    - "Legacy `wbCooldownUntil` key (без колона) лениво мигрирует на 9 bucket-keys при первом setWbCooldownUntil или удаляется если уже истёк — без потери активной защиты."
  artifacts:
    - path: "lib/wb-cooldown.ts"
      provides: "Bucket-aware API + resolveBucketFromUrl + migrateLegacyCooldownKey + WB_COOLDOWN_BUCKETS"
      contains: "WbCooldownBucket"
    - path: "lib/wb-api.ts"
      provides: "wbFetch с per-endpoint bucket resolution через endpoint string"
      contains: "resolveBucketFromEndpoint"
    - path: "lib/wb-support-api.ts"
      provides: "callApi с per-endpoint bucket resolution через baseUrl+path"
      contains: "resolveBucketFromUrl"
    - path: "tests/wb-cooldown.test.ts"
      provides: "Per-bucket isolation tests + legacy migration tests"
      contains: "bucket isolation"
  key_links:
    - from: "lib/wb-api.ts:wbFetch"
      to: "lib/wb-cooldown.ts:getWbCooldownSecondsRemaining(bucket)"
      via: "resolveBucketFromEndpoint(endpoint) → bucket | null"
      pattern: "getWbCooldownSecondsRemaining\\([a-z'\"-]+\\)"
    - from: "lib/wb-support-api.ts:callApi"
      to: "lib/wb-cooldown.ts:setWbCooldownUntil(bucket, retry)"
      via: "resolveBucketFromUrl(baseUrl + path) → bucket | null"
      pattern: "setWbCooldownUntil\\([a-z'\"-]+,"
---

<objective>
Превратить single-bucket WB cooldown bus (`AppSetting('wbCooldownUntil')`) в per-endpoint cooldown locks. Сегодня одна 429-блокировка от `/api/v1/supplier/stocks` (Statistics) запирает на 3 часа Prices / Tariffs / Content / Analytics / Orders / Feedbacks / Questions — endpoints у которых нет собственного бана. После рефакторинга каждый bucket (`statistics-stocks`, `prices`, `tariffs`, и т.д.) имеет свой `AppSetting('wbCooldownUntil:<bucket>')`, что устраняет collateral damage cross-endpoint.

Purpose: Прод 2026-05-13 показал что cooldown bus over-pessimistic — пользователь не может синхронизировать карточки/цены 3 часа из-за бана Statistics (который и так fixed-window TTL и не сбрасывается ретраями). WB rate-limits per-endpoint-domain, поэтому и наш cooldown должен быть per-domain.

Output:
- `lib/wb-cooldown.ts` с bucket-aware API (3 signatures changed, 1 helper added, 1 migration added, 1 enum added)
- `lib/wb-api.ts` wbFetch вызывает `getWbCooldownSecondsRemaining(bucket)` / `setWbCooldownUntil(bucket, ...)` с resolved bucket
- `lib/wb-support-api.ts` callApi то же самое для feedbacks / questions
- Обновлённые tests — per-bucket isolation, lazy migration, существующая buffer-formula GREEN
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@lib/wb-cooldown.ts
@lib/wb-api.ts
@lib/wb-support-api.ts
@tests/wb-cooldown.test.ts
@tests/wb-fetch-rate-limit.test.ts
@.planning/quick/260513-dlr-support-sync-lock-buffer-to-outlive-cron/260513-dlr-SUMMARY.md

<interfaces>
<!-- Текущие подписи lib/wb-cooldown.ts (BEFORE refactor) -->

```typescript
// lib/wb-cooldown.ts (current)
export const CRON_INTERVAL_SEC = 900
export const BUFFER_SEC = 120

export async function getWbCooldownUntil(): Promise<Date | null>
export async function setWbCooldownUntil(retryAfterSec: number): Promise<Date>
export async function getWbCooldownSecondsRemaining(): Promise<number>
```

<!-- Целевые подписи (AFTER refactor) -->

```typescript
// lib/wb-cooldown.ts (target)
export const CRON_INTERVAL_SEC = 900
export const BUFFER_SEC = 120

export const WB_COOLDOWN_BUCKETS = [
  "statistics-stocks",
  "statistics-orders",
  "statistics-sales",
  "prices",
  "tariffs",
  "analytics",
  "content",
  "feedbacks",
  "questions",
] as const
export type WbCooldownBucket = (typeof WB_COOLDOWN_BUCKETS)[number]

export async function getWbCooldownUntil(bucket: WbCooldownBucket): Promise<Date | null>
export async function setWbCooldownUntil(bucket: WbCooldownBucket, retryAfterSec: number): Promise<Date>
export async function getWbCooldownSecondsRemaining(bucket: WbCooldownBucket): Promise<number>
export function resolveBucketFromUrl(url: string): WbCooldownBucket | null
// Internal — called lazily at first setWbCooldownUntil invocation. Idempotent.
async function migrateLegacyCooldownKey(): Promise<void>
```

<!-- Existing wbFetch callsites в lib/wb-api.ts (endpoint string → bucket): -->

```
Line 198: wbFetch("Prices API", `${PRICES_API}/api/v2/list/goods/filter...`)            → "prices"
Line 246: wbFetch("Statistics API (stocks)", "https://statistics-api.../supplier/stocks") → "statistics-stocks"
Line 291: wbFetch("Analytics API (buyout)", "https://seller-analytics-api.../nm-report") → "analytics"
Line 500: wbFetch("Tariffs API", "https://common-api.../tariffs/commission")             → "tariffs"
Line 961: wbFetch("Statistics API (per-warehouse stocks)", url, ...)                     → "statistics-stocks"
Line 1049: wbFetch("Orders API (per-warehouse)", url, ...)                               → "statistics-orders"
```

<!-- Existing callApi callsites в lib/wb-support-api.ts (baseUrl + path → bucket): -->

```
callWb wraps callApi(FEEDBACKS_API, token, path) where path starts with /api/v1/feedbacks → "feedbacks"
callWb wraps callApi(FEEDBACKS_API, token, path) where path starts with /api/v1/questions → "questions"
callReturnsApi/callChatApi use OTHER tokens → bucket=null (no cooldown bus participation)
```

<!-- Existing buffer formula (MUST be preserved per-bucket): -->

```typescript
// In setWbCooldownUntil — preserved AS-IS, just keyed per bucket
const effectiveSec = Math.max(retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC
const proposed = new Date(Date.now() + effectiveSec * 1000)
// Idempotent max: if existing[bucket] > proposed → keep existing[bucket]
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Refactor lib/wb-cooldown.ts to per-bucket API + lazy migration</name>
  <files>lib/wb-cooldown.ts, tests/wb-cooldown.test.ts</files>
  <behavior>
    - Test 1: WB_COOLDOWN_BUCKETS exported as readonly tuple of 9 string slugs (statistics-stocks, statistics-orders, statistics-sales, prices, tariffs, analytics, content, feedbacks, questions).
    - Test 2: getWbCooldownUntil('prices') returns null when no row exists for key `wbCooldownUntil:prices`.
    - Test 3: getWbCooldownUntil('prices') returns Date when row exists with future value for key `wbCooldownUntil:prices`.
    - Test 4: Expired bucket lock auto-deletes itself (delete called with `where: { key: 'wbCooldownUntil:prices' }`).
    - Test 5: setWbCooldownUntil('prices', 60) writes to key `wbCooldownUntil:prices` with buffer formula (proposed = now + max(60,900)+120 = 1020s).
    - Test 6: setWbCooldownUntil('prices', 720) writes 1020s lock to `wbCooldownUntil:prices`.
    - Test 7: setWbCooldownUntil('prices', 3600) writes 3720s lock to `wbCooldownUntil:prices` (retry+buffer dominates).
    - Test 8: setWbCooldownUntil('prices', 0) is no-op (no upsert).
    - Test 9: Idempotent max() — setWbCooldownUntil('prices', 60) when existing `wbCooldownUntil:prices` value is now+3600s → no upsert, returns existing.
    - Test 10: getWbCooldownSecondsRemaining('prices') returns 0 when no lock; returns positive number when locked.
    - Test 11 (PER-BUCKET ISOLATION): setWbCooldownUntil('prices', 60) does NOT write to `wbCooldownUntil:statistics-stocks`; getWbCooldownSecondsRemaining('statistics-stocks') still returns 0 after. Verified by mocking findUnique to return null for `wbCooldownUntil:statistics-stocks` key while `wbCooldownUntil:prices` is set.
    - Test 12 (PER-BUCKET ISOLATION reverse): Independent max() for each bucket — setting 'prices' to 1020s and 'statistics-stocks' to 3720s leaves both intact; subsequent setWbCooldownUntil('prices', 60) does NOT affect statistics-stocks value.
    - Test 13 (LEGACY MIGRATION future): On setWbCooldownUntil call, if legacy key `wbCooldownUntil` (no colon) exists with future value, COPY value to all 9 `wbCooldownUntil:<bucket>` keys then DELETE legacy. Verified through prisma.appSetting.findMany mock returning legacy row + 0 bucket rows → expect upsert called 9 times with bucket keys + delete called once with `{ where: { key: 'wbCooldownUntil' } }`.
    - Test 14 (LEGACY MIGRATION past): On setWbCooldownUntil call, if legacy key `wbCooldownUntil` exists with past value, just DELETE it (no copying). Verified through findUnique('wbCooldownUntil') returning past value → expect delete called once, no upsert for bucket-prefix keys (other than the one being set by current setWbCooldownUntil).
    - Test 15 (LEGACY MIGRATION idempotent): Second call to setWbCooldownUntil does NOT re-migrate — legacy key already gone. Verified through 2 consecutive setWbCooldownUntil calls + assertion delete called at most once for legacy key across both.
    - Test 16: resolveBucketFromUrl returns correct bucket for each known URL pattern:
      - 'https://statistics-api.wildberries.ru/api/v1/supplier/stocks?...' → 'statistics-stocks'
      - 'https://statistics-api.wildberries.ru/api/v1/supplier/orders?...' → 'statistics-orders'
      - 'https://statistics-api.wildberries.ru/api/v1/supplier/sales?...' → 'statistics-sales'
      - 'https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter' → 'prices'
      - 'https://common-api.wildberries.ru/api/v1/tariffs/commission' → 'tariffs'
      - 'https://seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads' → 'analytics'
      - 'https://content-api.wildberries.ru/content/v2/get/cards/list' → 'content'
      - 'https://feedbacks-api.wildberries.ru/api/v1/feedbacks?...' → 'feedbacks'
      - 'https://feedbacks-api.wildberries.ru/api/v1/questions?...' → 'questions'
    - Test 17: resolveBucketFromUrl returns null for unknown hosts (e.g., 'https://returns-api.wildberries.ru/...', 'https://buyer-chat-api.wildberries.ru/...') — safe fallback so callers gracefully skip cooldown bus.
    - Test 18: Constants CRON_INTERVAL_SEC=900, BUFFER_SEC=120 still exported.
  </behavior>
  <action>
    Refactor `lib/wb-cooldown.ts` to bucket-aware API. Steps:

    1. **Add bucket enum + type at top of file:**
       ```typescript
       export const WB_COOLDOWN_BUCKETS = [
         "statistics-stocks",
         "statistics-orders",
         "statistics-sales",
         "prices",
         "tariffs",
         "analytics",
         "content",
         "feedbacks",
         "questions",
       ] as const
       export type WbCooldownBucket = (typeof WB_COOLDOWN_BUCKETS)[number]
       ```

    2. **Replace `const COOLDOWN_KEY = "wbCooldownUntil"` with helper:**
       ```typescript
       const LEGACY_COOLDOWN_KEY = "wbCooldownUntil"
       function bucketKey(bucket: WbCooldownBucket): string {
         return `${LEGACY_COOLDOWN_KEY}:${bucket}`
       }
       ```

    3. **Add `resolveBucketFromUrl(url: string): WbCooldownBucket | null` exported function.** Implementation — pattern-match on hostname+path substrings:
       ```typescript
       export function resolveBucketFromUrl(url: string): WbCooldownBucket | null {
         if (url.includes("statistics-api.wildberries.ru")) {
           if (url.includes("/supplier/stocks")) return "statistics-stocks"
           if (url.includes("/supplier/orders")) return "statistics-orders"
           if (url.includes("/supplier/sales")) return "statistics-sales"
           return null
         }
         if (url.includes("discounts-prices-api.wildberries.ru")) return "prices"
         if (url.includes("common-api.wildberries.ru/api/v1/tariffs")) return "tariffs"
         if (url.includes("seller-analytics-api.wildberries.ru")) return "analytics"
         if (url.includes("content-api.wildberries.ru")) return "content"
         if (url.includes("feedbacks-api.wildberries.ru")) {
           if (url.includes("/feedbacks")) return "feedbacks"
           if (url.includes("/questions")) return "questions"
           return null
         }
         return null  // returns-api, buyer-chat-api, dp-calendar-api → не наш bus
       }
       ```

    4. **Add `migrateLegacyCooldownKey()` internal helper (lazy, idempotent):**
       ```typescript
       let legacyMigrationDone = false  // module-scoped flag (in-process cache to skip prisma call after first run)

       async function migrateLegacyCooldownKey(): Promise<void> {
         if (legacyMigrationDone) return
         const legacy = await prisma.appSetting.findUnique({ where: { key: LEGACY_COOLDOWN_KEY } })
         if (!legacy?.value) {
           legacyMigrationDone = true
           return
         }
         const d = new Date(legacy.value)
         const isFuture = !Number.isNaN(d.getTime()) && d.getTime() > Date.now()
         if (isFuture) {
           // Copy to all 9 bucket keys
           for (const bucket of WB_COOLDOWN_BUCKETS) {
             await prisma.appSetting.upsert({
               where: { key: bucketKey(bucket) },
               create: { key: bucketKey(bucket), value: legacy.value },
               update: { value: legacy.value },
             }).catch(() => {})
           }
         }
         await prisma.appSetting.delete({ where: { key: LEGACY_COOLDOWN_KEY } }).catch(() => {})
         legacyMigrationDone = true
       }
       ```

    5. **Update `getWbCooldownUntil(bucket)`:** parameter added; uses `bucketKey(bucket)` instead of `COOLDOWN_KEY`. Auto-delete on expired uses bucket key. Legacy migration is NOT called here (avoid race with setWbCooldownUntil — migration runs on first setWbCooldownUntil only, get-only callers see legacy as null per migration absence).

    6. **Update `setWbCooldownUntil(bucket, retryAfterSec)`:** parameter `bucket` added. Call `await migrateLegacyCooldownKey()` at the very start (before validity check, idempotent — flag short-circuits second call). Uses `bucketKey(bucket)` in findUnique/upsert. Buffer formula preserved AS-IS: `effectiveSec = Math.max(retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC`. Idempotent max preserved — keyed per bucket.

    7. **Update `getWbCooldownSecondsRemaining(bucket)`:** parameter added; passes to getWbCooldownUntil.

    8. **Rewrite tests in `tests/wb-cooldown.test.ts`** following the behavior spec above (18 tests). Existing 13 tests are adapted: pass bucket as first arg (`getWbCooldownUntil('prices')`, etc.). `legacyMigrationDone` flag needs reset between tests — use a re-import pattern via `vi.resetModules()` in `beforeEach` (or expose `__resetMigrationFlagForTests()` from module for tests only — DO NOT expose for non-test use). Pick whichever is simpler in the current test setup; `vi.resetModules() + await import('@/lib/wb-cooldown')` pattern is already used in this file via top-of-each-test dynamic import — keep that style.

       For migration tests, also reset `findUniqueMock` between calls so that:
       - first findUnique on LEGACY_COOLDOWN_KEY returns the legacy row,
       - subsequent findUnique on bucket key returns null.

       Use `findUniqueMock.mockImplementation((args) => ...)` to switch behavior by `args.where.key`.

    Verification command runs only Task 1 file scope: `npx vitest run tests/wb-cooldown.test.ts`.

    Why these decisions (don't revisit):
    - In-process `legacyMigrationDone` flag is safe because Next.js server boot re-creates module — on prod restart, migration re-runs (idempotent — no-op if already done). Across tests we reset via `vi.resetModules()`.
    - `resolveBucketFromUrl` lives in this file (not separate constants module) per LOCKED constraint 7.
  </action>
  <verify>
    <automated>npx vitest run tests/wb-cooldown.test.ts</automated>
  </verify>
  <done>
    - `lib/wb-cooldown.ts` exports WB_COOLDOWN_BUCKETS (9 slugs), WbCooldownBucket type, resolveBucketFromUrl.
    - All 3 public functions (getWbCooldownUntil/setWbCooldownUntil/getWbCooldownSecondsRemaining) take `bucket: WbCooldownBucket` as first argument.
    - Buffer formula `Math.max(retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC` preserved verbatim per LOCKED constraint 2.
    - Idempotent max() vs existing per-bucket lock preserved per LOCKED constraint 2.
    - Lazy `migrateLegacyCooldownKey()` migrates future value to all 9 bucket keys then deletes legacy; past value just deletes; idempotent across calls.
    - `tests/wb-cooldown.test.ts` ≥18 tests all GREEN with bucket-aware signatures, per-bucket isolation, legacy migration paths covered.
    - `npx tsc --noEmit` GREEN (Task 1 may temporarily break wb-api.ts/wb-support-api.ts callers — Task 2 fixes them; Task 1's done criteria is `vitest tests/wb-cooldown.test.ts` GREEN only, full tsc is Task 3).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire bucket resolution into wb-api.ts wbFetch and wb-support-api.ts callApi</name>
  <files>lib/wb-api.ts, lib/wb-support-api.ts, tests/wb-fetch-rate-limit.test.ts</files>
  <behavior>
    - wbFetch: when endpoint resolves to a bucket and that bucket is in cooldown → throws WbRateLimitError WITHOUT calling global fetch (existing test 'активный global cooldown' adapted).
    - wbFetch: when endpoint resolves to a bucket and OTHER bucket is in cooldown → does NOT throw, proceeds to fetch (NEW test 'cooldown on statistics-stocks does NOT block prices').
    - wbFetch: when endpoint is unknown (resolveBucketFromEndpoint returns null) → bypasses cooldown bus, proceeds to fetch (safe fallback).
    - wbFetch: on 429 from WB → writes cooldown to resolved bucket only (test verifies upsert called with bucket-specific key `wbCooldownUntil:prices`, not legacy `wbCooldownUntil`).
    - callApi (FEEDBACKS_API + /api/v1/feedbacks/...): cooldown check + write target `feedbacks` bucket.
    - callApi (FEEDBACKS_API + /api/v1/questions/...): cooldown check + write target `questions` bucket.
    - callApi (RETURNS_API or CHAT_API): bucket=null → bypass cooldown bus entirely (NO changes to Returns/Chat behavior, regression-protected).
  </behavior>
  <action>
    **2a. `lib/wb-api.ts:wbFetch` — add bucket resolution from endpoint string.**

    Add internal helper above wbFetch:
    ```typescript
    /** Map English endpoint label (free text passed by callers) to WB cooldown bucket.
     *  Returns null for unknown labels → cooldown bus disabled for that call (safe). */
    function resolveBucketFromEndpoint(endpoint: string): WbCooldownBucket | null {
      // Matches based on the 7 existing call sites in this file.
      if (endpoint === "Prices API") return "prices"
      if (endpoint.startsWith("Statistics API")) {
        if (endpoint.includes("orders")) return "statistics-orders"
        if (endpoint.includes("sales")) return "statistics-sales"
        return "statistics-stocks"  // "stocks" or "per-warehouse stocks" → stocks bucket
      }
      if (endpoint.startsWith("Analytics API")) return "analytics"
      if (endpoint === "Tariffs API") return "tariffs"
      if (endpoint.startsWith("Orders API")) return "statistics-orders"
      if (endpoint.startsWith("Content API")) return "content"
      return null
    }
    ```

    Update import at top of file (already imports getWbCooldownSecondsRemaining/setWbCooldownUntil) — add `WbCooldownBucket` type to existing import line from `@/lib/wb-cooldown`.

    Replace wbFetch body (lines 694–712) with bucket-aware version:
    ```typescript
    async function wbFetch(endpoint: string, url: string, opts: RequestInit = {}): Promise<Response> {
      const bucket = resolveBucketFromEndpoint(endpoint)
      // Bucket=null → unknown endpoint label; do NOT participate in cooldown bus.
      if (bucket) {
        const cooldownSec = await getWbCooldownSecondsRemaining(bucket)
        if (cooldownSec > 0) {
          throw new WbRateLimitError(`${endpoint} (cooldown ${bucket})`, cooldownSec)
        }
      }

      const res = await fetch(url, opts)
      if (res.status === 429) {
        const retryAfterSec = parseInt(res.headers.get("X-Ratelimit-Retry") ?? "60", 10) || 60
        if (bucket) {
          await setWbCooldownUntil(bucket, retryAfterSec).catch(() => {})
        }
        throw new WbRateLimitError(endpoint, retryAfterSec)
      }
      return res
    }
    ```

    **2b. `lib/wb-support-api.ts:callApi` — use resolveBucketFromUrl(baseUrl + path).**

    Update import line 8–11:
    ```typescript
    import {
      getWbCooldownSecondsRemaining,
      setWbCooldownUntil,
      resolveBucketFromUrl,
    } from "@/lib/wb-cooldown"
    ```

    Replace lines 130–140 (cooldown pre-check) with:
    ```typescript
    // Per-endpoint cooldown bus: bucket resolved from full URL.
    // Returns/Chat APIs return null → bypass entirely (their tokens, their budget).
    const bucket = resolveBucketFromUrl(`${baseUrl}${path}`)
    if (bucket && attempt === 0) {
      const cooldownSec = await getWbCooldownSecondsRemaining(bucket)
      if (cooldownSec > 0) {
        throw new WbRateLimitError(cooldownSec, `${path} (cooldown ${bucket})`)
      }
    }
    ```

    Replace lines 160–166 (429 cooldown write) with:
    ```typescript
    if (requestedMs > MAX_RETRY_WAIT_MS) {
      if (bucket) {
        await setWbCooldownUntil(bucket, Math.round(requestedMs / 1000)).catch(() => {})
      }
      throw new WbRateLimitError(Math.round(requestedMs / 1000), path)
    }
    ```

    Remove now-unused `isWbApiToken` constant — bucket=null already encodes "не наш bus" for Returns/Chat.

    **2c. Update `tests/wb-fetch-rate-limit.test.ts` to reflect bucket-aware behavior.**

    Existing 5 tests pass bucket-agnostic — adapt them:
    - "активный global cooldown" test: fetchStocks resolves to `statistics-stocks`; appSettingFindUnique must return the future value WHEN called with `{where: {key: 'wbCooldownUntil:statistics-stocks'}}` — switch to `mockImplementation` keyed on args.where.key.
    - "429 от WB → пишет global cooldown" test: assert upsertMock called with `where: { key: 'wbCooldownUntil:statistics-stocks' }`, NOT bare `wbCooldownUntil`.

    Add NEW test "cooldown на statistics-stocks НЕ блокирует prices endpoint":
    ```typescript
    it("cooldown на statistics-stocks НЕ блокирует Prices endpoint (per-bucket isolation)", async () => {
      // statistics-stocks заблокирован на 720s, prices свободен
      const future = new Date(Date.now() + 720 * 1000).toISOString()
      appSettingFindUnique.mockImplementation(({ where: { key } }: { where: { key: string } }) => {
        if (key === "wbCooldownUntil:statistics-stocks") return Promise.resolve({ value: future })
        return Promise.resolve(null)
      })
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ data: { listGoods: [] } }),
      })
      vi.stubGlobal("fetch", fetchMock)

      const { fetchAllPrices } = await import("@/lib/wb-api")
      // Не должно throw — Prices не в cooldown.
      const result = await fetchAllPrices()
      expect(fetchMock).toHaveBeenCalled()  // WB запрос реально пошёл
      expect(result).toBeInstanceOf(Map)
    })
    ```

    Add NEW test "429 на Prices пишет только prices bucket, не задевает statistics-stocks":
    ```typescript
    it("429 на Prices пишет ТОЛЬКО prices bucket (не statistics-stocks)", async () => {
      appSettingFindUnique.mockResolvedValue(null)
      ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 429,
        headers: {
          get: (key: string) => (key === "X-Ratelimit-Retry" ? "1800" : null),
        },
      })

      const { fetchAllPrices } = await import("@/lib/wb-api")
      await expect(fetchAllPrices()).rejects.toThrow()

      // Upsert на prices bucket
      const upserts = appSettingUpsert.mock.calls
      const pricesUpsert = upserts.find(([arg]) => arg?.where?.key === "wbCooldownUntil:prices")
      const stocksUpsert = upserts.find(([arg]) => arg?.where?.key === "wbCooldownUntil:statistics-stocks")
      expect(pricesUpsert).toBeDefined()
      expect(stocksUpsert).toBeUndefined()
    })
    ```

    **Note on legacy migration in this test file:** `setWbCooldownUntil` lazy-migrates legacy key on first call. The `migrateLegacyCooldownKey` helper does `findUnique({where: {key: 'wbCooldownUntil'}})` first. In tests where we don't care about migration, just make findUnique return null for the legacy key — covered by the default `appSettingFindUnique.mockResolvedValue(null)` reset in beforeEach.
  </action>
  <verify>
    <automated>npx vitest run tests/wb-cooldown.test.ts tests/wb-fetch-rate-limit.test.ts tests/wb-support-api.test.ts</automated>
  </verify>
  <done>
    - `lib/wb-api.ts:wbFetch` calls `getWbCooldownSecondsRemaining(bucket)` and `setWbCooldownUntil(bucket, retryAfterSec)` where `bucket = resolveBucketFromEndpoint(endpoint)`.
    - When `bucket === null` (unknown endpoint label) → wbFetch bypasses cooldown bus entirely (safe fallback per LOCKED constraint 5).
    - `lib/wb-support-api.ts:callApi` calls `resolveBucketFromUrl(baseUrl + path)` and only participates in cooldown bus when bucket is not null.
    - Returns API (RETURNS_API) and Chat API (CHAT_API) bypass cooldown bus (resolveBucketFromUrl returns null for those hosts) — Phase 9/10 unchanged.
    - `tests/wb-fetch-rate-limit.test.ts` adapted + 2 new tests for per-bucket isolation; suite GREEN.
    - `tests/wb-support-api.test.ts` GREEN without changes (callApi's bucket=null path for Returns/Chat is the same as old `isWbApiToken === false` branch — existing assertions hold).
    - `tests/wb-cooldown.test.ts` still GREEN from Task 1.
  </done>
</task>

<task type="auto">
  <name>Task 3: Full regression — tsc + vitest GREEN baseline (no deploy)</name>
  <files>(no file changes — verification only)</files>
  <action>
    Run full verification gate:

    1. **TypeScript:**
       ```
       npx tsc --noEmit
       ```
       Must report 0 errors. If errors appear in files outside our scope (lib/wb-cooldown.ts, lib/wb-api.ts, lib/wb-support-api.ts) — investigate; we may have missed a caller. Search:
       ```
       grep -rn "getWbCooldownUntil\|setWbCooldownUntil\|getWbCooldownSecondsRemaining" lib app
       ```
       Should return ONLY:
       - lib/wb-cooldown.ts (declarations)
       - lib/wb-api.ts:wbFetch (Task 2)
       - lib/wb-support-api.ts:callApi (Task 2)

       Per LOCKED constraint 9, `lib/support-sync.ts` MUST NOT change — it uses its own per-feature locks (wbQuestionsLockedUntil / wbFeedbacksLockedUntil), not the wbCooldownUntil bus. Verify with `grep -n 'wbCooldownUntil' lib/support-sync.ts` → expected empty.

    2. **Targeted test suites (must all GREEN):**
       ```
       npx vitest run tests/wb-cooldown.test.ts tests/wb-fetch-rate-limit.test.ts tests/wb-support-api.test.ts tests/support-sync.test.ts
       ```

       Expected counts (from prior 260513-dlr baseline):
       - tests/wb-cooldown.test.ts: was 13, now ≥18 GREEN (Task 1 added 5+ new)
       - tests/wb-fetch-rate-limit.test.ts: was 5, now ≥7 GREEN (Task 2 added 2 new)
       - tests/wb-support-api.test.ts: 12 GREEN (no changes)
       - tests/support-sync.test.ts: 14 GREEN (no changes — support-sync.ts not touched)

    3. **Full regression sanity (allow pre-existing failures):**
       ```
       npx vitest run
       ```
       Baseline from 260513-dlr SUMMARY: 441 passed | 38 failed (38 are pre-existing, unrelated). Acceptable result: passed ≥ 441 + (new tests added in Tasks 1/2) AND failed ≤ 38. If `failed > 38` or any new failure appears in the 4 targeted suites above — fix before completion.

    4. **Sanity check production safety:**
       - Confirm `lib/support-sync.ts` not touched: `git diff --stat lib/support-sync.ts` → empty.
       - Confirm legacy key migration path: a current production DB has `wbCooldownUntil` key (without colon) from 2026-05-13 incident. After deploy, first call to `setWbCooldownUntil(...)` on the server will trigger `migrateLegacyCooldownKey()`. Document this in the SUMMARY's deploy section.

    NO DEPLOY in this plan per LOCKED constraint 8 — user deploys manually after merge.
  </action>
  <verify>
    <automated>npx tsc --noEmit &amp;&amp; npx vitest run tests/wb-cooldown.test.ts tests/wb-fetch-rate-limit.test.ts tests/wb-support-api.test.ts tests/support-sync.test.ts</automated>
  </verify>
  <done>
    - `npx tsc --noEmit` → 0 errors.
    - 4 targeted suites all GREEN (counts ≥ Task 1/2 expected).
    - `npx vitest run` full: passed ≥ baseline (441 + new), failed ≤ 38 (pre-existing).
    - `lib/support-sync.ts` not modified (grep confirms `wbCooldownUntil` absent — support-sync uses its own per-feature keys).
    - SUMMARY.md drafted with deploy instruction noting legacy key migration is automatic on first 429 after deploy.
  </done>
</task>

</tasks>

<verification>
**Goal-backward truths verified by suite GREEN:**

| Truth | Verified by test |
|-------|------------------|
| Statistics 3h ban does NOT block Prices/Tariffs/Content/Analytics | tests/wb-fetch-rate-limit.test.ts "cooldown на statistics-stocks НЕ блокирует Prices" |
| Statistics 3h ban does NOT block Feedbacks/Questions | bucket isolation generalises — feedbacks/questions resolve to own buckets, не задевают statistics-stocks |
| Buffer formula preserved per-bucket | tests/wb-cooldown.test.ts tests 5,6,7 (1020s for retry≤900, 3720s for retry=3600) |
| Idempotent max() preserved per-bucket | tests/wb-cooldown.test.ts test 9 |
| Per-bucket isolation (write to A does not affect B) | tests/wb-cooldown.test.ts tests 11, 12 |
| Legacy key migrates lazily on first set | tests/wb-cooldown.test.ts tests 13 (future), 14 (past), 15 (idempotent) |
| URL→bucket mapping works for all 9 buckets | tests/wb-cooldown.test.ts test 16 |
| Unknown URL → null → cooldown bus bypassed | tests/wb-cooldown.test.ts test 17 + wbFetch bypass behavior in Task 2 |
| Returns/Chat APIs unchanged | tests/wb-support-api.test.ts (12 GREEN no changes) |
| support-sync per-feature locks unchanged (260512-gvy, 260513-dlr) | tests/support-sync.test.ts (14 GREEN no changes) + git diff empty |

**Production rollback safety:**
- AppSetting keys are namespaced (`wbCooldownUntil:<bucket>`) — coexist with legacy `wbCooldownUntil` until migration runs.
- Migration is idempotent — no double-application on restart.
- If revert needed: revert commits + the 9 bucket AppSetting rows can be deleted manually; they're transient (auto-expire by definition).
</verification>

<success_criteria>
- 3 task `<verify>` commands GREEN.
- `lib/wb-cooldown.ts` exports bucket-aware API, WB_COOLDOWN_BUCKETS, resolveBucketFromUrl, migrateLegacyCooldownKey (internal).
- `lib/wb-api.ts:wbFetch` and `lib/wb-support-api.ts:callApi` route cooldown calls through bucket resolution.
- `lib/support-sync.ts` NOT touched (LOCKED constraint 9).
- Buffer formula `Math.max(retryAfterSec, 900) + 120` preserved verbatim (LOCKED constraint 2).
- Idempotent max() preserved per-bucket (LOCKED constraint 2).
- `npx tsc --noEmit` GREEN; 4 targeted suites GREEN; full vitest baseline preserved.
- No deploy attempted (LOCKED constraint 8).
</success_criteria>

<output>
After completion, create `.planning/quick/260513-khv-per-endpoint-cooldown-locks-refactor-wbc/260513-khv-SUMMARY.md` documenting:
- Files modified with line ranges
- Test counts before/after (wb-cooldown.test.ts, wb-fetch-rate-limit.test.ts)
- Buffer formula preservation evidence (single grep showing Math.max line in setWbCooldownUntil)
- support-sync.ts untouched (git diff --stat)
- Legacy migration behavior on production deploy (one-shot, idempotent, auto-runs on first setWbCooldownUntil call after restart)
- Deploy command: `ssh root@85.198.97.89 'cd /opt/zoiten-pro && bash deploy.sh'` (user runs manually)
- Verification SQL: `SELECT key, value FROM "AppSetting" WHERE key LIKE 'wbCooldownUntil%';` → after deploy + first 429, expect bucket-keyed rows only (no bare legacy key).
</output>
