---
phase: quick-260515-m5o
verified: 2026-05-15T16:48:00Z
status: human_needed
score: 9/10 must-haves verified (1 требует UAT в браузере)
must_haves_checked: 10
must_haves_passed: 9
must_haves_human_needed: 1
must_haves_failed: 0
re_verification: false
human_verification:
  - test: "Клик по строке карточки в /cards/wb раскрывает панель с bar chart + средними; single-open; stopPropagation на чекбокс/артикул; sticky header не дёргается"
    expected: "Bar chart 28 столбцов, avg30d/avg7d, плавная анимация раскрытия; клик по чекбоксу/артикулу не раскрывает строку; sticky header стабилен"
    why_human: "UI behavior — DOM/анимация/sticky scroll нельзя 100% подтвердить без браузера. Код подтверждён (Fragment+AnimatePresence+motion.div, expandedId single-open, stopPropagation на 2 cells), но визуальная корректность требует UAT."
---

# Quick 260515-m5o: /cards/wb expandable row + WbCardOrdersDaily Verification

**Task Goal:** /cards/wb: expandable row на клике по строке карточки с bar chart заказов за 4 недели + средние за месяц/7 дней; новая БД-таблица WbCardOrdersDaily + daily cron 05:00 МСК; backfill с 2026-04-01

**Verified:** 2026-05-15
**Status:** human_needed (UI поведение → UAT в браузере)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Клик по строке карточки в /cards/wb раскрывает панель с bar chart и средними | ? HUMAN | Код в `WbCardsTable.tsx:375` `onClick={() => setExpandedId(...)}` + `WbCardOrdersChart` рендерится при `isExpanded` (line 510-525) — визуальная корректность требует UAT |
| 2 | Bar chart показывает ровно 28 столбцов (today-28 .. today-1), пустые дни = qty=0 | VERIFIED | `getLast28DaysMsk(now)` строит 28 ключей; `fillTimeSeries` reduce → `qty: byKey.get(date) ?? 0`. Тесты `wb-orders-chart-fill.test.ts` (4/4) подтверждают boundary + empty + out-of-window |
| 3 | Среднее заказов/день за 30 дней и за 7 дней отображается числом | VERIFIED | `WbCardOrdersChart.tsx:27-31`: `sumAll/timeSeries.length` (sum28/28 = ср/мес), `sum7/last7.length` (ср/7д). Рендер `avg30d.toFixed(1)` + `avg7d.toFixed(1)` |
| 4 | Одновременно открыта только одна строка; клик по другой переключает | VERIFIED | `useState<string \| null>(null)` single-state pattern; `setExpandedId(isExpanded ? null : card.id)` (line 375). По коду только один id хранится — переключение неизбежно. UAT подтвердит визуально |
| 5 | Клик по чекбоксу или артикулу не раскрывает строку (stopPropagation) | VERIFIED | `TableCell onClick={(e) => e.stopPropagation()}` на чекбокс cell (line 378) + `e.stopPropagation()` в onClick артикула (line 413) |
| 6 | Sticky header не ломается при раскрытии строки | VERIFIED | Не изменены: `<thead className="bg-background">` + `sticky top-0 z-20 bg-background border-b` на TableHead cells. Expanded row отрисовывается как обычный `<TableRow>` ниже, не trogает `<thead>`. UAT подтвердит scroll behavior |
| 7 | Daily cron 05:00 МСК пишет qty за вчерашний день в WbCardOrdersDaily | VERIFIED | `app/api/cron/wb-orders-daily/route.ts` существует, `mode=delta` ветка: `dateFrom = getMskYesterdayDate()` → `fetchOrdersForRange` → `upsertOrdersDaily`. Systemd инструкции в SUMMARY.md — после deploy + setup timer cron триггерится в 05:00 МСК (`OnCalendar=*-*-* 05:00:00 Europe/Moscow`) |
| 8 | Backfill с 2026-04-01 запускается автоматически при пустой таблице или вручную через кнопку | VERIFIED | Cron route: `if (existing === 0) { dateFrom = BACKFILL_START; mode = "backfill" }` (line 31-34). Manual: `POST /api/wb-orders-backfill` → `fetchOrdersForRange(BACKFILL_START)` (line 32). Кнопка `WbOrdersBackfillButton` в шапке page.tsx:163 |
| 9 | Повторный backfill идемпотентен (upsert по @@unique([nmId, date])) | VERIFIED | `prisma.wbCardOrdersDaily.upsert({ where: { nmId_date: {...} }, create:..., update:{qty:r.qty} })` (wb-api.ts:1357-1361). Schema имеет `@@unique([nmId, date])` (line 1032). ON CONFLICT overwrite qty — rerun корректирует число |
| 10 | Cron endpoint защищён x-cron-secret == process.env.CRON_SECRET (401 без секрета) | VERIFIED | `const secret = req.headers.get("x-cron-secret"); if (!secret \|\| secret !== process.env.CRON_SECRET) return 401` (route.ts:21-24). Канонический паттерн из `/api/cron/purge-deleted` |

**Score:** 9/10 truths VERIFIED + 1 HUMAN (UI behavior — нормально для expandable row).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `prisma/schema.prisma` | model WbCardOrdersDaily с @@unique + индексы | VERIFIED | Lines 1024-1035: model найден, поля корректные (`id`, `nmId`, `date @db.Date`, `qty`, `createdAt`), `@@unique([nmId, date])`, `@@index([nmId])`, `@@index([date])` |
| `prisma/migrations/20260515_wb_card_orders_daily/migration.sql` | CREATE TABLE + UNIQUE + индексы | VERIFIED | 17 lines, корректный SQL: SERIAL PK + INTEGER nmId + DATE + INTEGER qty + TIMESTAMP createdAt + 3 индекса |
| `lib/wb-api.ts` | fetchOrdersForRange + upsertOrdersDaily | VERIFIED | `fetchOrdersForRange` (line 1274) + `upsertOrdersDaily` (line 1344). Pagination 80k handled, isCancel фильтр, callback-variant $transaction с timeout 90s |
| `lib/wb-orders-chart.ts` | getMskTodayDate / getMskYesterdayDate / getLast28DaysMsk / fillTimeSeries | VERIFIED | 72 lines, 4 exports все присутствуют. Pure-helpers без Prisma/Next deps |
| `app/api/cron/wb-orders-daily/route.ts` | GET с x-cron-secret guard, backfill if empty, delta иначе, maxDuration=600 | VERIFIED | 70 lines. Guard на 21-24, mode выбор 27-39, `maxDuration = 600`, WbRateLimitError → 429 |
| `app/api/wb-orders-backfill/route.ts` | POST с requireSection('PRODUCTS','MANAGE'), maxDuration=600 | VERIFIED | 57 lines. `await requireSection("PRODUCTS", "MANAGE")` line 23 (B-1 fix), `maxDuration = 600`, BACKFILL_START="2026-04-01T00:00:00" |
| `components/cards/WbCardOrdersChart.tsx` | recharts BarChart + avg30d/avg7d | VERIFIED | 82 lines. recharts BarChart с XAxis interval=3, CartesianGrid, ChartTooltip; avg30d/avg7d вычисляются и рендерятся |
| `components/cards/WbCardsTable.tsx` | Expand state + onClick row + motion expanded TableRow | VERIFIED | Fragment import (line 3), `expandedId` state (line 166), TableRow onClick (375), AnimatePresence+motion.div+WbCardOrdersChart (509-525), stopPropagation на checkbox cell + article cell |
| `components/cards/WbOrdersBackfillButton.tsx` | Кнопка с confirm + POST + toast | VERIFIED | 52 lines. confirm() → POST /api/wb-orders-backfill → toast.loading/success/error → router.refresh() |
| `components/ui/chart.tsx` | shadcn-charts wrapper | VERIFIED | Файл присутствует с ChartContainer + ChartTooltip + ChartTooltipContent + ChartConfig type |
| `tests/wb-card-orders-daily.test.ts` | golden + isCancel + 80k + empty + snake_case | VERIFIED | 5 tests passed (per test run) |
| `tests/wb-orders-chart-fill.test.ts` | 28-day fill (empty days → qty=0) | VERIFIED | 4 tests passed (per test run) |
| `tests/wb-orders-chart-msk.test.ts` | MSK midnight boundary | VERIFIED | 4 tests passed (per test run) |
| `package.json` | recharts | VERIFIED | `"recharts": "^3.8.0"` (line 49) — близко к плановому ^3.8.1, semver-совместимо |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `WbCardsTable.tsx` | `WbCardOrdersChart.tsx` | `import + <WbCardOrdersChart>` | WIRED | Import line 35, render `<WbCardOrdersChart nmId={card.nmId} timeSeries={ts} />` line 520 при `isExpanded` |
| `app/(dashboard)/cards/wb/page.tsx` | `prisma.wbCardOrdersDaily.findMany` | query за visible nmIds [today-28, today-1] | WIRED | Lines 129-138: findMany с in/gte/lte, byNm Map, fillTimeSeries (line 149). Использует `getMskTodayDate()` (line 124) |
| `app/api/cron/wb-orders-daily/route.ts` | `lib/wb-api.ts → fetchOrdersForRange + upsertOrdersDaily` | GET handler | WIRED | Imports lines 8-12, вызывает на line 44 + 45. dateFrom = backfill / getMskYesterdayDate() |
| `WbOrdersBackfillButton.tsx` | `/api/wb-orders-backfill` | fetch POST | WIRED | `fetch("/api/wb-orders-backfill", { method: "POST" })` line 19. Endpoint защищён requireSection("PRODUCTS","MANAGE") |
| `WbCardsTable.tsx` | row onClick + stopPropagation | useState<expandedId> | WIRED | `onClick={() => setExpandedId(isExpanded ? null : card.id)}` line 375; stopPropagation на 2 cells (378, 413) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `WbCardOrdersChart` | `timeSeries` prop | `ordersTimeSeries[nmId]` from page.tsx (built from `prisma.wbCardOrdersDaily.findMany` + `fillTimeSeries`) | Yes — реальная PG-таблица заполняется через cron/backfill (Statistics Orders API). До первого backfill таблица пустая → все qty=0 (ожидаемое поведение) | FLOWING |
| `WbCardsTable` expanded row | `ts = ordersTimeSeries[String(card.nmId)] ?? []` | page.tsx prop | Same as above | FLOWING |
| Cron endpoint | `rows` | `fetchOrdersForRange(dateFrom)` → WB Statistics API | Yes — реальный WB endpoint, токен из `getToken()` (existing pattern) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Tests pass | `npm run test -- tests/wb-card-orders-daily.test.ts tests/wb-orders-chart-fill.test.ts tests/wb-orders-chart-msk.test.ts` | 13/13 passed (322ms) | PASS |
| Prisma model экспортирован | grep `model WbCardOrdersDaily` в schema.prisma | Found (lines 1024-1035) | PASS |
| Recharts установлен | grep `recharts` в package.json | `"recharts": "^3.8.0"` | PASS |
| Cron endpoint защищён | grep `x-cron-secret` в route.ts | Found in `/api/cron/wb-orders-daily/route.ts:21-24` | PASS |
| Backfill RBAC | grep `requireSection.*PRODUCTS.*MANAGE` в backfill route | Found line 23 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| M5O-01 | 260515-m5o-PLAN.md | Implied: БД-таблица + миграция | SATISFIED | schema.prisma + migration.sql |
| M5O-02 | 260515-m5o-PLAN.md | Implied: WB API helpers + tests | SATISFIED | fetchOrdersForRange + upsertOrdersDaily + 5 tests |
| M5O-03 | 260515-m5o-PLAN.md | Implied: Cron + backfill endpoints | SATISFIED | 2 routes + secrets + maxDuration=600 |
| M5O-04 | 260515-m5o-PLAN.md | Implied: UI expandable row + chart | SATISFIED | WbCardsTable update + WbCardOrdersChart + WbOrdersBackfillButton |

Примечание: M5O-* IDs объявлены в plan frontmatter но не присутствуют в `.planning/REQUIREMENTS.md` (это нормально для quick tasks — не каждая quick task регистрирует formal requirements).

### Anti-Patterns Found

None. Проверено:
- TODO/FIXME/XXX/HACK/PLACEHOLDER: нет matches в новых файлах
- "not implemented" placeholders: нет
- Empty stub returns (return null/return [] без data fetching): нет — все возвраты обоснованы (`if (rows.length === 0) return { upserted: 0 }` в upsertOrdersDaily, `visibleNmIds.length > 0 ? findMany : []` в page.tsx)
- Hardcoded empty props: нет — `ordersTimeSeries` строится из реальной БД

### Human Verification Required

#### 1. UI behavior — expandable row + sticky header

**Test:** Открыть https://zoiten.pro/cards/wb после deploy + первого backfill. Поэтапно:

1. Кликнуть по строке карточки → раскрывается панель с bar chart + 2 числами (avg30d / avg7d).
2. Bar chart показывает **28 столбцов**; дни без заказов = нулевые столбцы.
3. Кликнуть по другой строке → старая закрывается, новая раскрывается (single-open).
4. Кликнуть по чекбоксу → переключает selection, **НЕ** раскрывает строку.
5. Кликнуть по артикулу → копирует nmId в clipboard, **НЕ** раскрывает строку.
6. Sticky header при scroll работает как раньше — не дёргается, не перекрывается expanded panel.
7. Кнопка «Backfill заказов» в шапке → confirm → toast.loading → success или ошибка с retryAfter.

**Expected:** Все 7 пунктов работают визуально корректно. Раскрытие плавное (motion easeOut 0.2s).

**Why human:** UI-поведение (DOM, анимация, sticky scroll, event propagation в реальном браузере) нельзя 100% подтвердить статическим анализом. Код подтверждён (Fragment+AnimatePresence+motion.div, expandedId single-state, stopPropagation на 2 cells) — все артефакты на месте, но визуальная корректность требует UAT.

### Gaps Summary

Нет блокирующих gaps. Все 10 must-haves покрыты:
- 9 truths VERIFIED через статический анализ + 13 passed unit tests + проверку wiring + data-flow
- 1 truth HUMAN_NEEDED (UI поведение раскрывающейся панели) — нормально, не gap. Код корректный; требуется UAT в браузере после deploy.

Deploy-зависимости (вне scope verification):
- Применить миграцию через `prisma migrate deploy` на VPS (через `bash deploy.sh`)
- Создать systemd unit + timer для daily cron (инструкции в SUMMARY.md разделы Deploy)
- Запустить ручной backfill через systemctl start zoiten-wb-orders.service или через UI кнопку

---

_Verified: 2026-05-15T16:48:00Z_
_Verifier: Claude (gsd-verifier)_
