---
phase: quick-260515-o4o
verified: 2026-05-15T18:10:00Z
status: human_needed
score: 13/13 automated must-haves verified, 4 visual/operational items need human UAT
must_haves_checked: 13
must_haves_passed: 13
must_haves_human_needed: 4
must_haves_failed: 0
human_verification:
  - test: "Width/centering: открыть /cards/wb → клик по строке → expand panel ≤ 640px шириной + центрирована"
    expected: "Панель НЕ растягивается на всю ширину строки, видна Card-shape (тонкая граница + slightly darker bg)"
    why_human: "Визуальная ширина / layout — нельзя проверить grep'ом; требует рендеринга в браузере"
  - test: "Dark-mode цвета: переключить тёмную тему → expand row → линия = vibrant orange, бары = muted cool grey-cyan"
    expected: "В тёмной теме линия и бары контрастно различимы; раньше оба были оттенки grey"
    why_human: "Цвет/контраст — визуальная UAT, oklch CSS vars подтверждены в коде но рендер видит только человек"
  - test: "Cron lifecycle (на следующее утро после deploy): systemctl list-timers | grep zoiten-cron-dispatch + journalctl -u zoiten-cron-dispatch.service"
    expected: "5-минутные fires; в 05:00 МСК fired:[orders:200]; в 05:10 МСК fired:[prices:200]; AppSetting *LastRun обновлены"
    why_human: "Требует deploy + ожидание реального ночного fire; не воспроизводится локально"
  - test: "Retroactive backfill button → клик → confirm → toast.success + DB SELECT COUNT(*) FROM WbCardOrdersDaily WHERE sellerPrice IS NOT NULL ≈ 2165"
    expected: "Запрос проходит, обновлено ~2165 строк, в /cards/wb expand row для nmId 800750522 видна линия цены ≈ 3817₽"
    why_human: "Требует POST-запрос с авторизацией + production DB; интеграционный тест с авторизованным пользователем"
---

# Quick 260515-o4o: /cards/wb expand v2 + цены — Verification Report

**Task Goal:** /cards/wb expand v2 + 2 prices в WbCardOrdersDaily + retro backfill + cron 05:10 МСК + cron schedule UI + line chart цены

**Verified:** 2026-05-15T18:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | WbCardOrdersDaily содержит 2 новые INTEGER nullable колонки sellerPrice + buyerPrice | VERIFIED | prisma/schema.prisma:1033-1034 `sellerPrice Int?` + `buyerPrice Int?`; migration.sql:5-6 `ADD COLUMN` |
| 2 | After retroactive backfill все 2165 строк имеют непустые sellerPrice/buyerPrice (формула sellerPrice × (1 − discountWb/100)) | VERIFIED (code) / NEEDS HUMAN (data) | `app/api/wb-prices-retroactive-backfill/route.ts` uses `computeBuyerPriceRetro` + UPDATE only `sellerPrice IS NULL`; golden test 5310/28.12 → 3817 passes |
| 3 | Daily cron 05:10 МСК пишет snapshot цен UPSERT по (nmId, date) | VERIFIED (code) / NEEDS HUMAN (lifecycle) | `app/api/cron/wb-prices-daily/route.ts` lines 36-40 `prisma.wbCardOrdersDaily.upsert` + `wbPricesDailyLastRun` marker |
| 4 | Cron расписания настраиваются через /admin/settings → таб «Расписание» с 5-мин granularity | VERIFIED | `CronScheduleTab.tsx:16-24` buildTimeOptions → 288 options (24×60/5); Zod schema enforces minute%5==0 |
| 5 | Single systemd timer zoiten-cron-dispatch.timer fires /api/cron/dispatch каждые 5 минут → AppSetting fan-out via dynamic import | VERIFIED (code) / NEEDS HUMAN (systemd deploy) | `dispatch/route.ts:56,74` `await import("../wb-orders-daily/route")` + `await import("../wb-prices-daily/route")`; deploy instructions в SUMMARY |
| 6 | Expandable panel уменьшилась до max-w-[640px] mx-auto, центрирована | VERIFIED (code) / NEEDS HUMAN (visual UAT) | `WbCardOrdersChart.tsx:44` `<div className="max-w-[640px] mx-auto py-4 px-2">` |
| 7 | ComposedChart показывает bars (qty) на левой оси + Line (buyerPrice) на правой оси, connectNulls=false | VERIFIED | `WbCardOrdersChart.tsx:51` `<ComposedChart>`; lines 94-110: `<Bar yAxisId="qty">` + `<Line yAxisId="price" connectNulls={false}>` |
| 8 | В тёмной теме линия цены — оранжевая (контрастная), бары — приглушённый cool grey-cyan | VERIFIED (CSS) / NEEDS HUMAN (visual UAT) | `app/globals.css:96-97` light + `134-135` dark: `--chart-1: oklch(0.45 0.05 200)` grey-cyan, `--chart-2: oklch(0.7 0.18 30)` orange |
| 9 | buyerPrice from v4 API = round(sizes[].price.product / 100) БЕЗ × (1 − walletPct/100) | VERIFIED | `lib/wb-api.ts:1422` `Math.round(sizeWithPrice.price.product / 100)` — NO walletPct multiplier |
| 10 | requireSuperadmin() returns Promise<void> not assigned to const session | VERIFIED | `app/actions/cron-schedule.ts:31,58` — both `await requireSuperadmin()` без `const session = ...` |
| 11 | WbCardOrdersDaily migration file exists в prisma/migrations | VERIFIED | `prisma/migrations/20260515_wb_card_orders_daily_prices/migration.sql` (528 bytes, 2 ALTER TABLE) |
| 12 | ordersTimeSeries explicit `Record<string, DayPoint[]>` type prevents RSC→client structural subtyping loss | VERIFIED | `app/(dashboard)/cards/wb/page.tsx:163` `const ordersTimeSeries: Record<string, DayPoint[]> = {}` + `import { type DayPoint }` |
| 13 | All tests pass (24+ new + regression) | VERIFIED | 29/29 passed (wb-prices-retro 8, wb-prices-cron-dispatch 5, wb-cron-schedule-validation 11, wb-orders-chart-fill 5); pricing-math 23/23 (Phase 7 no regression); tsc --noEmit clean |

**Score:** 13/13 automated truths verified, 4 require human UAT for full goal achievement

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/migrations/20260515_wb_card_orders_daily_prices/migration.sql` | ALTER TABLE ADD sellerPrice + buyerPrice | VERIFIED | 528 bytes, 2 ALTER TABLE ADD COLUMN |
| `lib/wb-cron-schedule.ts` | Pure helpers (getMskHHMM, getMskTodayString, isValidCronHHMM, shouldFireCron, computeBuyerPriceRetro) | VERIFIED | 2430 bytes, all 5 exports present; pure (no imports beyond types) |
| `lib/wb-api.ts:fetchBuyerPricesViaCurlV4` | Map<nmId, buyerPriceRub> via curl v4 + batch 20 + 3000ms pause | VERIFIED | line 1390, returns `Promise<Map<number, number>>`, separate from fetchWbDiscounts (no regression on Phase 7) |
| `app/api/wb-prices-retroactive-backfill/route.ts` | POST + requireSection("PRODUCTS","MANAGE") + UPDATE sellerPrice IS NULL | VERIFIED | 1923 bytes, RBAC + computeBuyerPriceRetro + updateMany |
| `app/api/cron/wb-prices-daily/route.ts` | GET + x-cron-secret + UPSERT + maxDuration=600 + wbPricesDailyLastRun marker | VERIFIED | 2046 bytes, all guards + markers present |
| `app/api/cron/dispatch/route.ts` | GET + reads AppSetting + dynamic import fan-out | VERIFIED | 2473 bytes, dynamic imports на orders/prices routes |
| `app/actions/cron-schedule.ts` | getCronSchedule + updateCronSchedule with requireSuperadmin() not assigned | VERIFIED | 2739 bytes, `await requireSuperadmin()` без const session |
| `components/settings/CronScheduleTab.tsx` | Client component с native select 288 опций | VERIFIED | 3663 bytes (>80 min_lines), 130 lines, buildTimeOptions yields 288 |
| `components/cards/WbPricesRetroactiveBackfillButton.tsx` | Кнопка retro-backfill в шапке | VERIFIED | 1862 bytes (>40 min_lines), 58 lines, confirm includes "Безопасно повторять" (W-5 fix verified) |
| `components/cards/WbCardOrdersChart.tsx` | ComposedChart + dual Y-axis + Card-shape | VERIFIED | ComposedChart import, max-w-[640px] mx-auto, Bar + Line + connectNulls={false}, dot.r=3 (W-7 fix verified) |
| `tests/wb-prices-retro.test.ts` | Golden 5310/28.12 → 3817 | VERIFIED | 8/8 tests pass |
| `tests/wb-prices-cron-dispatch.test.ts` | HH:MM match + lastRun guard | VERIFIED | 5/5 tests pass |
| `tests/wb-cron-schedule-validation.test.ts` | Zod regex + minute%5 step | VERIFIED | 11/11 tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `dispatch/route.ts` | `wb-orders-daily/route.ts` + `wb-prices-daily/route.ts` | dynamic import | WIRED | lines 56, 74: `await import("../wb-orders-daily/route")` + `await import("../wb-prices-daily/route")` |
| `wb-prices-daily/route.ts` | `lib/wb-api.ts:fetchBuyerPricesViaCurlV4` | import + call с active nmIds | WIRED | line 8 import, line 28 `await fetchBuyerPricesViaCurlV4(nmIds)`, `where: { deletedAt: null }` |
| `CronScheduleTab.tsx` | `app/actions/cron-schedule.ts:updateCronSchedule` | useTransition | WIRED | lines 10, 89: import + call with key + Zod-validated hhmm |
| `WbPricesRetroactiveBackfillButton.tsx` | `/api/wb-prices-retroactive-backfill` | fetch POST + router.refresh() | WIRED | lines 26-28 fetch POST + line 35 router.refresh() |
| `WbCardOrdersChart.tsx` | `page.tsx` ordersTimeSeries via DayPoint | extended DayPoint interface | WIRED | type DayPoint imported in page.tsx:15 + chart.tsx:14; Line reads `dataKey="buyerPrice"` |
| `app/globals.css` | `WbCardOrdersChart` via --chart-1/--chart-2 | oklch CSS vars light + dark | WIRED | lines 96-97 (`:root`) + 134-135 (`.dark`); chart uses `var(--color-qty)` + `var(--color-buyerPrice)` resolving via chartConfig |
| `wb-orders-daily/route.ts` | `AppSetting wbOrdersDailyLastRun` | upsert after success | WIRED | lines 54-58: upsert wbOrdersDailyLastRun (required for dispatcher idempotency) |
| `admin/settings/page.tsx` | `getCronSchedule()` action | Promise.all loader | WIRED | line 6 import + line 36 `getCronSchedule()` in Promise.all |
| `SettingsTabs.tsx` | `CronScheduleTab` | TabsTrigger + TabsContent | WIRED | lines 9, 96, 117-118: import + tab trigger + tab content |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `WbCardOrdersChart` | `timeSeries: DayPoint[]` with buyerPrice | `page.tsx:153-160` builds from `prisma.wbCardOrdersDaily.findMany` with `buyerPrice: true` select | Yes (after retro backfill — see human_verification #4) | FLOWING (post-backfill) |
| `CronScheduleTab` | `schedule: CronSchedule` | `getCronSchedule()` reads 4 AppSetting rows | Yes — defaults "05:00"/"05:10" applied even if rows absent | FLOWING |
| Dispatch route | `ordersTime, pricesTime, *LastRun` | `prisma.appSetting.findMany` | Yes — falls back to defaults if AppSetting не существует | FLOWING |
| Retroactive backfill | `cards[]` with `nmId, price, discountWb` | `prisma.wbCard.findMany({ where: { deletedAt: null, price: { not: null } } })` | Yes — real WbCard data from production | FLOWING |
| Daily prices cron | `buyerMap: Map<nmId, buyerPriceRub>` | `fetchBuyerPricesViaCurlV4` execSync curl card.wb.ru v4 | Yes (production WB API) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| New + regression tests pass | `npx vitest run tests/wb-prices-retro tests/wb-prices-cron-dispatch tests/wb-cron-schedule-validation tests/wb-orders-chart-fill` | 29/29 passed (Test Files 4 passed) | PASS |
| Phase 7 golden test no regression | `npx vitest run tests/pricing-math` | 23/23 passed (nmId 800750522 profit/ROI unchanged) | PASS |
| TypeScript clean | `npx tsc --noEmit` | 0 errors (silent exit) | PASS |
| Live cron dispatcher on prod | `journalctl -u zoiten-cron-dispatch.service` | n/a — requires VPS deploy | SKIP (human UAT) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | — | — | — | No TODO/FIXME/placeholder/stub in new files; all empty returns are properly guarded (e.g., `return null` in computeBuyerPriceRetro is correct for null sellerPrice input) |

### Human Verification Required

#### 1. Width / centering visual UAT

**Test:** Открыть /cards/wb → клик по строке → визуально проверить ширину панели
**Expected:** Панель ≤ 640px, центрирована (НЕ растягивается на всю строку), видна тонкая граница Card + slightly darker bg-card
**Why human:** Визуальный layout — нельзя проверить grep'ом; CSS подтверждён (`max-w-[640px] mx-auto`), но финальный рендер видит только человек

#### 2. Dark-mode цвета визуальная UAT

**Test:** Переключить тёмную тему → /cards/wb → expand row
**Expected:** Линия = vibrant orange (--chart-2), бары = muted cool grey-cyan (--chart-1); в тёмной теме они контрастно различимы (раньше оба были оттенки grey)
**Why human:** Цвет/контраст — визуальная UAT; oklch CSS vars подтверждены в коде но рендер на разных экранах видит только человек

#### 3. Cron lifecycle production verification

**Test:** После deploy (см. SUMMARY раздел B):
- `systemctl list-timers | grep zoiten-cron-dispatch` → next fire через ≤5 мин
- `journalctl -u zoiten-cron-dispatch.service -n 30` → 5-min fires (большинство noop fired=[])
- Утром 05:00 МСК → `fired:["orders:200"]`
- Утром 05:10 МСК → `fired:["prices:200"]`
- `AppSetting.wbOrdersDailyLastRun + wbPricesDailyLastRun` обновлены на сегодняшнюю дату

**Expected:** Все 4 пункта зелёные, dispatch видит exact HH:MM match + не fires повторно тот же день
**Why human:** Требует deploy на VPS + ожидание реального ночного fire; не воспроизводится локально (только моки в unit-тестах)

#### 4. Retroactive backfill production verification

**Test:**
1. Открыть https://zoiten.pro/cards/wb (авторизованный)
2. Кнопка «Backfill цен» (Coins icon) → confirm → toast.success
3. `SELECT COUNT(*) FROM "WbCardOrdersDaily" WHERE "sellerPrice" IS NOT NULL;` ≈ 2165
4. Spot check nmId 800750522: `SELECT date, qty, "sellerPrice", "buyerPrice" FROM "WbCardOrdersDaily" WHERE "nmId" = 800750522 ORDER BY date DESC LIMIT 5;`
5. Ожидается: sellerPrice ≈ 5310, buyerPrice ≈ 3817 (точное значение зависит от текущей цены в БД)

**Expected:** POST проходит, ~2165 строк обновлено, в /cards/wb expand row для 800750522 видна горизонтальная линия цены ≈ 3817₽
**Why human:** Требует POST-запрос с авторизацией PRODUCTS,MANAGE + production DB write; интеграционный тест с авторизованным пользователем (не воспроизводится в unit-тестах)

### Gaps Summary

**Нет gaps.** Все 13 must-have truths верифицированы через файловые/grep/test проверки:
- 9 truths полностью автоматически верифицированы (схема, код, key-links, tests, tsc)
- 4 truths имеют код-уровень verification + дополнительный human UAT (визуальный rendering / live cron / data backfill результат)

Verification mode: автоматическая проверка PASSED для всех артефактов, key-links, tests и regression. Однако визуальные элементы (width, dark-mode colors) + операционные элементы (cron lifecycle, retro backfill результат) требуют human UAT перед claim'ом "goal fully achieved" в production.

Phase ready for deploy.sh + UAT checklist (см. SUMMARY раздел «UAT Checklist»).

---

_Verified: 2026-05-15T18:10:00Z_
_Verifier: Claude (gsd-verifier)_
