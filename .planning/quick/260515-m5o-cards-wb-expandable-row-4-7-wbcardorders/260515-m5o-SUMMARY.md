---
phase: quick-260515-m5o
plan: 01
subsystem: cards-wb / wb-statistics-api
tags: [wb-api, cards-wb, statistics-orders, cron, recharts, expandable-row]
requires:
  - "prisma 6 (compound unique upsert)"
  - "recharts 3.8.1 (React 19 peerDeps)"
  - "WB Statistics Orders API (token scope bit 6 — Статистика)"
  - "CRON_SECRET в /etc/zoiten.pro.env (уже используется другими cron endpoints)"
  - "lib/wb-api.ts:wbFetch с per-bucket cooldown (statistics-orders)"
provides:
  - "WbCardOrdersDaily — snapshot заказов per (nmId, date)"
  - "fetchOrdersForRange / upsertOrdersDaily в lib/wb-api.ts"
  - "MSK date helpers в lib/wb-orders-chart.ts (single source of truth)"
  - "GET /api/cron/wb-orders-daily (x-cron-secret guard, backfill+delta)"
  - "POST /api/wb-orders-backfill (requireSection PRODUCTS MANAGE)"
  - "Expandable row UX в /cards/wb с bar chart за 28 дней"
affects:
  - "/cards/wb (DOM: новые expand-rows, header: новая кнопка)"
tech-stack:
  added:
    - "recharts@^3.8.1"
    - "shadcn-charts wrapper (components/ui/chart.tsx)"
  patterns:
    - "Single-open expandable row via useState<string|null>"
    - "Fragment-wrap для inline TableRow expansion"
    - "AnimatePresence + motion/react для height animation"
    - "MSK date helpers через UTC+3 shift + UTC accessors (без TZ-зависимости от runtime)"
key-files:
  created:
    - "prisma/migrations/20260515_wb_card_orders_daily/migration.sql"
    - "lib/wb-orders-chart.ts"
    - "app/api/cron/wb-orders-daily/route.ts"
    - "app/api/wb-orders-backfill/route.ts"
    - "components/cards/WbCardOrdersChart.tsx"
    - "components/cards/WbOrdersBackfillButton.tsx"
    - "components/ui/chart.tsx"
    - "tests/wb-card-orders-daily.test.ts"
    - "tests/wb-orders-chart-fill.test.ts"
    - "tests/wb-orders-chart-msk.test.ts"
  modified:
    - "prisma/schema.prisma (+model WbCardOrdersDaily)"
    - "lib/wb-api.ts (+fetchOrdersForRange, +upsertOrdersDaily)"
    - "components/cards/WbCardsTable.tsx (+expand state, Fragment wrap)"
    - "app/(dashboard)/cards/wb/page.tsx (+ordersTimeSeries query, +button)"
    - "package.json (+recharts)"
decisions:
  - "ERP_SECTION enum НЕ содержит CARDS — все /cards/wb actions используют PRODUCTS (B-1 plan-check fix)"
  - "maxDuration=600 на обоих API route (W-3 plan-check fix) — backfill 45 дней может занимать 1-2 мин"
  - "MSK math вынесен в lib/wb-orders-chart.ts (W-4 plan-check fix) — single source of truth для cron+page+chart"
  - "@db.Date поле — date stored as JS Date 00:00 UTC, чтение через +3h MSK shift в fillTimeSeries"
  - "nmId БЕЗ FK на WbCard — исторические orders выживают при soft/hard-delete карточки"
  - "Callback variant Prisma $transaction с options{timeout:90s} — array variant не поддерживает timeout в Prisma 6"
metrics:
  duration: "13min"
  completed: "2026-05-15"
  tasks: 3
  files_created: 10
  files_modified: 5
  tests_added: 13
---

# Quick 260515-m5o: /cards/wb expandable row + WbCardOrdersDaily Summary

Раскрывающаяся панель на строках карточек /cards/wb с bar chart заказов за 28 дней + среднее за 30/7 дней. Daily cron 05:00 МСК + одноразовый backfill с 2026-04-01 в новую таблицу WbCardOrdersDaily через WB Statistics Orders API.

## What Got Built

### БД-слой (Task 1)

- **`WbCardOrdersDaily`** — расширяемая таблица snapshot заказов:
  - `id` (SERIAL PRIMARY KEY), `nmId` (INTEGER), `date` (DATE), `qty` (INTEGER), `createdAt` (TIMESTAMP DEFAULT now())
  - `@@unique([nmId, date])` — идемпотентный upsert по compound ключу
  - `@@index([nmId])` + `@@index([date])` — query path для bar chart (per visible nmIds + date window)
  - **БЕЗ FK на WbCard** — исторические orders выживают при soft/hard-delete карточки
  - Future: `sumRub`, `returnsQty`, `cancelQty` — расширение в следующих фазах
- Ручная миграция `prisma/migrations/20260515_wb_card_orders_daily/migration.sql` — применяется через `prisma migrate deploy` на VPS в составе `bash deploy.sh`

### WB API helpers (Task 1)

В `lib/wb-api.ts` добавлены:

- **`fetchOrdersForRange(dateFrom: Date): Promise<OrdersDailyRow[]>`** — запрашивает Statistics Orders API через существующий `wbFetch` (bucket `statistics-orders` per-bucket cooldown), фильтрует `isCancel=true`, группирует в (nmId, date MSK) с правильной интерпретацией ISO без TZ как MSK-локального времени. 80k pagination через `lastChangeDate` (safety check + лог `[wb-orders backfill] page=N rowsReturned=X total=Y`)
- **`upsertOrdersDaily(rows)`** — idempotent upsert chunks по 500 (callback `$transaction({timeout:90s})`); ON CONFLICT overwrite qty (backfill rerun корректирует число); лог `[wb-orders upsert] chunk=N/total processed=X/Y`

### MSK date helpers (Task 2)

В `lib/wb-orders-chart.ts` (pure helpers без Prisma/Next deps — легко тестируются):

- `getMskTodayDate(now?: Date): Date` — 00:00 UTC даты, соответствующей сегодняшнему дню в MSK
- `getMskYesterdayDate(now?)` — = today - 24h
- `getLast28DaysMsk(now?): string[]` — 28 YYYY-MM-DD дат от today-28 до today-1
- `fillTimeSeries(raw, now?): DayPoint[]` — собирает 28 точек с qty=0 для дней без записей; игнорирует записи вне окна

**W-4 fix:** Раньше MSK math дублировался в 3 местах (cron route, page.tsx, helper). Теперь — единая точка истины.

### Cron + Backfill endpoints (Task 2)

- **`GET /api/cron/wb-orders-daily`** — daily 05:00 МСК. `x-cron-secret` guard, count() check → auto-backfill (с 2026-04-01) при пустой таблице или daily delta (за вчера MSK). `maxDuration = 600`, WbRateLimitError → 429 response с retryAfterSec.
- **`POST /api/wb-orders-backfill`** — manual re-run для UI кнопки. `requireSection("PRODUCTS", "MANAGE")` (B-1 fix: ERP_SECTION enum НЕ содержит CARDS). `maxDuration = 600`. Возвращает rowsFetched/upserted.

### UI слой (Task 3)

- **`components/ui/chart.tsx`** — shadcn-charts wrapper над recharts (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`)
- **`WbCardOrdersChart`** — recharts BarChart 28 баров (XAxis interval=3, CartesianGrid горизонтальная пунктирная), tooltip с датой, +2 числа avg30d / avg7d (sum/period)
- **`WbOrdersBackfillButton`** — `<Button variant="outline">` с History иконкой; `confirm()` → POST + toast.loading/success/error; `router.refresh()` после успеха
- **`WbCardsTable` обновления:**
  - Импорт `Fragment`, `motion/react`, `cn`, `WbCardOrdersChart`
  - Новый prop `ordersTimeSeries: Record<string, Array<{date,qty}>>`
  - State `expandedId: string | null` — single-open
  - Каждая card-row обёрнута в `<Fragment>`; `onClick={() => setExpandedId(isExpanded ? null : card.id)}`
  - Дополнительный `<TableRow>` ниже с `colSpan={19}` + `<AnimatePresence>` + `<motion.div height:0/auto>` для smooth раскрытия
  - `onClick={(e) => e.stopPropagation()}` на cell с чекбоксом — чтобы клик в pad не раскрывал
  - Артикул-cell уже имел stopPropagation; checkbox base-ui сам гасит event
  - Tooltip cell `cursor-default` без onClick → клик по имени раскрывает (естественное UX)
- **`page.tsx`:** добавлены импорты `getMskTodayDate / fillTimeSeries`; после загрузки cards — запрос `prisma.wbCardOrdersDaily.findMany` для visible nmIds в окне [today-28, today-1] MSK; группировка → `Record<nmId, DayPoint[]>` через `fillTimeSeries`; `<WbOrdersBackfillButton />` в шапке (первая в группе кнопок); prop `ordersTimeSeries` передан в `<WbCardsTable>`

## Files Created

- `prisma/migrations/20260515_wb_card_orders_daily/migration.sql` — ручная миграция (CREATE TABLE + UNIQUE + 2 INDEX)
- `lib/wb-orders-chart.ts` — pure MSK + chart fill helpers
- `app/api/cron/wb-orders-daily/route.ts` — cron endpoint
- `app/api/wb-orders-backfill/route.ts` — manual backfill endpoint
- `components/cards/WbCardOrdersChart.tsx` — recharts BarChart wrapper
- `components/cards/WbOrdersBackfillButton.tsx` — UI кнопка backfill
- `components/ui/chart.tsx` — shadcn-charts wrapper (через `npx shadcn add chart`)
- `tests/wb-card-orders-daily.test.ts` — 5 тестов (grouping, MSK, snake_case, 80k pagination, empty)
- `tests/wb-orders-chart-fill.test.ts` — 4 теста (fill, empty, out-of-window, boundary)
- `tests/wb-orders-chart-msk.test.ts` — 4 теста (midnight boundary, around-flip)

## Files Modified

- `prisma/schema.prisma` — +model WbCardOrdersDaily (после WbApiToken)
- `lib/wb-api.ts` — +OrdersDailyRow, +fetchOrdersForRange, +upsertOrdersDaily (приложение в конец файла)
- `components/cards/WbCardsTable.tsx` — Fragment-wrap rows, expand state, AnimatePresence, stopPropagation на checkbox cell
- `app/(dashboard)/cards/wb/page.tsx` — ordersTimeSeries query, WbOrdersBackfillButton, getMskTodayDate import
- `package.json` — +recharts@^3.8.1

## Deviations from Plan

**None — план выполнен полностью как написан**, с одной микро-коррекцией:

### Rule 3 fix — Prisma 6 transaction timeout option

**Найдено:** Task 1. План использовал `prisma.$transaction(array, {timeout: 90_000})` синтаксис, но Prisma 6 не принимает `timeout` в array-overload типе (только `isolationLevel`).

**Issue:** TS2769 ошибка — `Object literal may only specify known properties, and 'timeout' does not exist in type '{ isolationLevel?: TransactionIsolationLevel }'`

**Fix:** Переключил `upsertOrdersDaily` на **callback variant** `prisma.$transaction(async (tx) => { for (...) await tx.X.upsert(...) }, {timeout: 90_000})` — callback overload поддерживает options.

**Files modified:** `lib/wb-api.ts`

**Commit:** c43a690 (Task 1) — fix включён сразу в первый коммит, чтобы тесты прошли

## Authentication Gates

None. Все тесты + build прошли без необходимости в external auth.

## Self-Check

Files verification:
- prisma/schema.prisma — FOUND (modified)
- prisma/migrations/20260515_wb_card_orders_daily/migration.sql — FOUND
- lib/wb-api.ts — FOUND (modified)
- lib/wb-orders-chart.ts — FOUND
- app/api/cron/wb-orders-daily/route.ts — FOUND
- app/api/wb-orders-backfill/route.ts — FOUND
- components/cards/WbCardOrdersChart.tsx — FOUND
- components/cards/WbOrdersBackfillButton.tsx — FOUND
- components/cards/WbCardsTable.tsx — FOUND (modified)
- components/ui/chart.tsx — FOUND
- app/(dashboard)/cards/wb/page.tsx — FOUND (modified)
- tests/wb-card-orders-daily.test.ts — FOUND
- tests/wb-orders-chart-fill.test.ts — FOUND
- tests/wb-orders-chart-msk.test.ts — FOUND

Commits verification:
- c43a690 (Task 1: schema + WB API helpers + tests) — FOUND
- 13c9972 (Task 2: MSK helpers + cron + backfill endpoints + tests) — FOUND
- 61a7961 (Task 3: shadcn chart + chart component + expandable row + page query) — FOUND

Test results:
- `npm run test -- tests/wb-card-orders-daily.test.ts tests/wb-orders-chart-fill.test.ts tests/wb-orders-chart-msk.test.ts` → **13/13 passed**
- `npx tsc --noEmit` → **0 errors**
- `npm run build` → **passed** (новые routes зарегистрированы, /cards/wb=119kB)

Pre-existing test failures (41 failed в полном suite — НЕ относятся к этой задаче, подтверждено через `git stash` + повторный запуск тестов на main без моих изменений): template-picker, appeal-actions, customer-actions, customer-sync-chat, merge-customers, return-actions, response-templates, wb-sync-route, chat-reply-panel, support-stats-server. Они мокают Prisma по-разному и валятся одинаково до/после.

## Self-Check: PASSED

---

## Deploy инструкции

После того как пользователь сделает `git pull && bash deploy.sh` (применит миграцию через `prisma migrate deploy`):

### 1. Проверить CRON_SECRET

```bash
grep CRON_SECRET /etc/zoiten.pro.env
# Должна быть одна строка вида: CRON_SECRET=<some-random-string>
# Если её нет — создать:
echo "CRON_SECRET=$(openssl rand -hex 32)" >> /etc/zoiten.pro.env
chmod 600 /etc/zoiten.pro.env
systemctl restart zoiten-erp.service
```

### 2. Создать `/etc/systemd/system/zoiten-wb-orders.service`

```ini
[Unit]
Description=Zoiten WB orders daily sync runner
After=network.target zoiten-erp.service

[Service]
Type=oneshot
EnvironmentFile=/etc/zoiten.pro.env
ExecStart=/usr/bin/curl -fsS -X GET -H "x-cron-secret: ${CRON_SECRET}" http://localhost:3001/api/cron/wb-orders-daily
```

### 3. Создать `/etc/systemd/system/zoiten-wb-orders.timer`

```ini
[Unit]
Description=Zoiten WB orders daily sync (05:00 MSK)

[Timer]
OnCalendar=*-*-* 05:00:00 Europe/Moscow
Persistent=true

[Install]
WantedBy=timers.target
```

`Persistent=true` важен — если VPS лежал в 05:00, cron выполнится при подъёме.

### 4. Активировать

```bash
systemctl daemon-reload
systemctl enable --now zoiten-wb-orders.timer
systemctl list-timers | grep zoiten-wb-orders         # → проверка что timer виден и NEXT валиден
systemctl start zoiten-wb-orders.service              # ручной триггер первого backfill
journalctl -u zoiten-wb-orders.service -n 100         # лог backfill (должны быть строки [wb-orders backfill] page=N + [wb-orders upsert] chunk=N/M)
```

### 5. Проверка БД после backfill

```bash
sudo -u postgres psql -d zoiten_erp -c 'SELECT COUNT(*), MIN(date), MAX(date) FROM "WbCardOrdersDaily";'
# Ожидание: COUNT > 0 (для активных карточек), MIN = 2026-04-01 (или раньше первого заказа), MAX = вчерашняя дата
```

## UAT Checklist

После шагов 1-5 — открыть https://zoiten.pro/cards/wb и проверить:

- [ ] Клик по строке карточки → раскрывается панель с bar chart + 2 числами (avg30d / avg7d)
- [ ] Bar chart показывает **28 столбцов** (за last 4 weeks); дни без заказов = qty=0 (нулевые столбцы)
- [ ] Клик по другой строке → старая закрывается, новая раскрывается (single-open)
- [ ] Клик по чекбоксу → переключает selection, **НЕ** раскрывает строку
- [ ] Клик по артикулу → копирует nmId в clipboard, **НЕ** раскрывает строку
- [ ] Sticky header при scroll работает как раньше — не дёргается, не перекрывается expanded panel
- [ ] Кнопка «Backfill заказов» в шапке → confirm → toast.loading → success или ошибка с retryAfter
- [ ] После backfill — `router.refresh()` подтягивает данные, графы показывают данные

Дополнительно — стресс-тесты:
- [ ] Карточка появилась после 2026-04-01: дни до появления = qty=0 (нормальное поведение fill)
- [ ] Карточка-новинка без заказов: все 28 баров пустые, avg30d=0, avg7d=0 — без ошибок
- [ ] `journalctl -u zoiten-wb-orders.service -f` через сутки в 05:00 МСК → должна выполниться daily delta

## Logs to monitor

```bash
# Realtime лог cron при ручном triggering или после 05:00:
journalctl -u zoiten-wb-orders.service -f

# Лог Next.js (видно [wb-orders backfill] / [wb-orders-daily cron] записи):
journalctl -u zoiten-erp.service -f | grep wb-orders
```

## Rollback Plan

Если что-то пойдёт не так и нужно откатить:

```bash
# 1. Остановить cron
systemctl stop zoiten-wb-orders.timer
systemctl disable zoiten-wb-orders.timer
rm /etc/systemd/system/zoiten-wb-orders.{service,timer}
systemctl daemon-reload

# 2. Удалить новую таблицу (откат миграции вручную)
sudo -u postgres psql -d zoiten_erp -c 'DROP TABLE "WbCardOrdersDaily";'
sudo -u postgres psql -d zoiten_erp -c 'DELETE FROM _prisma_migrations WHERE migration_name = '\''20260515_wb_card_orders_daily'\'';'

# 3. git revert трёх коммитов
cd /opt/zoiten-pro && git revert 61a7961 13c9972 c43a690
bash deploy.sh
```
