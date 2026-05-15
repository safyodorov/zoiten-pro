---
phase: quick-260515-o4o
plan: 01
subsystem: cards-wb-expand-prices
tags: [wb-cards, prices, cron, settings, recharts, dark-mode]
status: ready-for-uat
requires:
  - WbCard (deletedAt, price, discountWb)
  - WbCardOrdersDaily (nmId, date, qty — Phase 260515-m5o)
  - AppSetting KV store (Phase 7)
  - shadcn-charts wrapper components/ui/chart.tsx
provides:
  - WbCardOrdersDaily.sellerPrice + buyerPrice columns (INTEGER nullable)
  - fetchBuyerPricesViaCurlV4 helper (lib/wb-api.ts)
  - Pure helpers in lib/wb-cron-schedule.ts (getMskHHMM, getMskTodayString, isValidCronHHMM, shouldFireCron, computeBuyerPriceRetro)
  - /api/wb-prices-retroactive-backfill (POST, RBAC PRODUCTS MANAGE)
  - /api/cron/wb-prices-daily (GET, x-cron-secret)
  - /api/cron/dispatch (GET, x-cron-secret, fan-out)
  - /admin/settings → таб «Расписание» (SUPERADMIN only)
  - ComposedChart (Bar qty + Line buyerPrice) в /cards/wb expand row
  - dark-aware --chart-1/--chart-2 CSS vars
affects:
  - /cards/wb expand row UX (panel narrower + line chart + design colors)
  - /admin/settings UI (new tab)
  - systemd: zoiten-wb-orders.timer DEPRECATED → zoiten-cron-dispatch.timer
  - WbCardOrdersDaily schema (2 new INT? columns)
  - app/globals.css palette
decisions:
  - D-01: 2 INT? columns в существующей WbCardOrdersDaily (не отдельная таблица)
  - D-02: retro = sellerPrice × (1 - discountWb/100) БЕЗ walletPct (RESEARCH-corrected)
  - D-03: daily cron buyerPrice = round(v4 sizes[].price.product / 100) БЕЗ walletPct (v4 already final)
  - D-04: single systemd dispatcher timer (*:0/5) + AppSetting fan-out via dynamic import
  - D-05: max-w-[640px] mx-auto + Card-shape obрамление
  - D-06: --chart-1 muted grey-cyan / --chart-2 brand orange (light + dark)
  - D-07: Settings tab «Расписание», SUPERADMIN-only, 5-min granularity
key-files:
  created:
    - prisma/migrations/20260515_wb_card_orders_daily_prices/migration.sql
    - lib/wb-cron-schedule.ts
    - app/api/wb-prices-retroactive-backfill/route.ts
    - app/api/cron/wb-prices-daily/route.ts
    - app/api/cron/dispatch/route.ts
    - app/actions/cron-schedule.ts
    - components/settings/CronScheduleTab.tsx
    - components/cards/WbPricesRetroactiveBackfillButton.tsx
    - tests/wb-prices-retro.test.ts
    - tests/wb-prices-cron-dispatch.test.ts
    - tests/wb-cron-schedule-validation.test.ts
  modified:
    - prisma/schema.prisma (sellerPrice, buyerPrice fields)
    - lib/wb-api.ts (fetchBuyerPricesViaCurlV4 appended)
    - lib/wb-orders-chart.ts (DayPoint расширен + fillTimeSeries прокидывает buyerPrice)
    - app/api/cron/wb-orders-daily/route.ts (wbOrdersDailyLastRun marker)
    - app/(dashboard)/admin/settings/page.tsx (getCronSchedule loader)
    - app/(dashboard)/cards/wb/page.tsx (buyerPrice select + DayPoint[] type)
    - components/settings/SettingsTabs.tsx (новый таб «Расписание»)
    - components/cards/WbCardsTable.tsx (prop type для DayPoint compatibility)
    - components/cards/WbCardOrdersChart.tsx (BarChart → ComposedChart)
    - app/globals.css (--chart-1/--chart-2 light + dark)
    - tests/wb-orders-chart-fill.test.ts (DayPoint shape update)
metrics:
  duration: 12 min
  tasks_completed: 3
  files_created: 11
  files_modified: 12
  tests_added: 24 (52 total passing)
  commits: 3
completed: 2026-05-15
---

# Quick 260515-o4o: /cards/wb expand v2 + цены — Summary

**One-liner:** ComposedChart (bar заказов + line цены) в /cards/wb expand row через WbCardOrdersDaily.sellerPrice/buyerPrice + dispatcher cron 05:10 МСК (UI-settable) + retroactive backfill цен из v4 API.

## What Got Built

### 1. БД схема
- 2 nullable INTEGER колонки `sellerPrice` + `buyerPrice` в `WbCardOrdersDaily`
- Migration `prisma/migrations/20260515_wb_card_orders_daily_prices/migration.sql` (2 ALTER TABLE ADD COLUMN)
- Prisma Client регенерирован

### 2. Pure helpers (lib/wb-cron-schedule.ts)
- `getMskHHMM(now?)` → `"HH:MM"` в Moscow timezone
- `getMskTodayString(now?)` → `"YYYY-MM-DD"`
- `isValidCronHHMM(value)` — regex `^([01]\d|2[0-3]):[0-5]\d$` + `minute % 5 === 0`
- `shouldFireCron({currentHHMM, storedTime, lastRunDate, today})` — exact match + idempotent guard
- `computeBuyerPriceRetro({sellerPrice, discountWb})` — `Math.round(sellerPrice × (1 - discountWb/100))`

### 3. WB API helper (lib/wb-api.ts)
- `fetchBuyerPricesViaCurlV4(nmIds): Promise<Map<number, number>>` — Map nmId → buyer price (₽)
- Pattern: батчи по 20, пауза 3000ms, execSync curl (TLS fingerprint workaround)
- НЕ модифицирует существующий `fetchWbDiscounts` (Phase 7 regression risk)
- buyerPrice = `Math.round(sizes[].price.product / 100)` — финальная витринная цена WB
  (уже включает SPP + кошелёк + клуб + промо — НЕ умножать на (1 - walletPct/100))

### 4. Endpoints (3 новых + 1 модификация)
- **POST `/api/wb-prices-retroactive-backfill`** (RBAC `PRODUCTS, MANAGE`):
  одноразовый UPDATE существующих строк WbCardOrdersDaily через `computeBuyerPriceRetro`.
  Safe to retry — UPDATE'ит только `sellerPrice IS NULL`.
- **GET `/api/cron/wb-prices-daily`** (x-cron-secret guard):
  Daily snapshot через `fetchBuyerPricesViaCurlV4` + UPSERT по `(nmId, date=today MSK)`.
  Записывает `wbPricesDailyLastRun`.
- **GET `/api/cron/dispatch`** (x-cron-secret guard):
  Читает AppSetting `wbOrdersDailyCronTime`/`wbPricesDailyCronTime`, сравнивает с MSK now,
  fan-out на orders/prices через `await import("../X/route")` + `GET(req)`.
- **GET `/api/cron/wb-orders-daily`** (модификация):
  Записывает `wbOrdersDailyLastRun` AppSetting после успешного run — нужно для dispatcher idempotency.

### 5. Settings UI таб «Расписание»
- Server actions `getCronSchedule` + `updateCronSchedule` (RBAC `requireSuperadmin()`, Zod HH:MM validation)
- `requireSuperadmin()` returns `Promise<void>` — НЕ присваивается; `updatedBy` в AppSetting опускается
- Client component `CronScheduleTab` — 2 карточки с native `<select>` (288 опций), useTransition + toast
- Добавлен в `SettingsTabs` через optional prop `schedule: CronSchedule | null`
- `admin/settings/page.tsx` Promise.all + 5-й loader `getCronSchedule()`

### 6. /cards/wb expand UX
- Кнопка `WbPricesRetroactiveBackfillButton` в шапке (рядом с Backfill заказов)
  - confirm-текст содержит "Безопасно повторять" (W-5 fix)
- `prisma.wbCardOrdersDaily.findMany` select расширен `buyerPrice: true`
- `ordersTimeSeries: Record<string, DayPoint[]>` с импортом `type DayPoint`
  (B-2 critical: structural subtyping без явного типа потерял бы buyerPrice через RSC→client)
- `byNm` map включает buyerPrice per row
- `WbCardOrdersChart` переписан на `<ComposedChart>`:
  - `yAxisId="qty"` (left) + `yAxisId="price"` (right)
  - `<Bar fill="var(--color-qty)">`, `<Line stroke="var(--color-buyerPrice)" strokeWidth={2} dot={{r:3}}>`
  - `connectNulls={false}`, `isAnimationActive={false}`
  - `max-w-[640px] mx-auto` + `rounded-md border bg-card p-3` (Card-shape)
  - Третья метрика «Цена сейчас» — последняя не-null buyerPrice (цвет: var(--chart-2))
  - `tabular-nums` на всех числах

### 7. CSS palette (app/globals.css)
- Light `:root` — `--chart-1: oklch(0.85 0.05 200)` cool grey-cyan, `--chart-2: oklch(0.65 0.2 30)` vibrant orange
- Dark `.dark` — `--chart-1: oklch(0.45 0.05 200)` darker cool grey-cyan, `--chart-2: oklch(0.7 0.18 30)` bright orange
- Раньше в dark оба были оттенки grey — линия не отличима от баров (исправлено)

### 8. Tests (24 новых + 5 обновлённых, 52 total в проекте)
- `tests/wb-prices-retro.test.ts` — 8 кейсов: golden 5310/28.12 → 3817, rounding boundary 28.123 → 3817, edge nulls
- `tests/wb-prices-cron-dispatch.test.ts` — 5 кейсов: exact HH:MM match + idempotent lastRun guard
- `tests/wb-cron-schedule-validation.test.ts` — 11 кейсов: regex + minute % 5 step
- `tests/wb-orders-chart-fill.test.ts` — обновлён под новый DayPoint shape (Rule 1, +1 кейс)

## Files Created (11)

- `prisma/migrations/20260515_wb_card_orders_daily_prices/migration.sql`
- `lib/wb-cron-schedule.ts`
- `app/api/wb-prices-retroactive-backfill/route.ts`
- `app/api/cron/wb-prices-daily/route.ts`
- `app/api/cron/dispatch/route.ts`
- `app/actions/cron-schedule.ts`
- `components/settings/CronScheduleTab.tsx`
- `components/cards/WbPricesRetroactiveBackfillButton.tsx`
- `tests/wb-prices-retro.test.ts`
- `tests/wb-prices-cron-dispatch.test.ts`
- `tests/wb-cron-schedule-validation.test.ts`

## Files Modified (12)

- `prisma/schema.prisma` — 2 new fields в WbCardOrdersDaily
- `lib/wb-api.ts` — `fetchBuyerPricesViaCurlV4` appended (existing `fetchWbDiscounts` НЕ тронут)
- `lib/wb-orders-chart.ts` — `DayPoint.buyerPrice?`, `fillTimeSeries` принимает buyerPrice
- `app/api/cron/wb-orders-daily/route.ts` — пишет `wbOrdersDailyLastRun` маркер
- `app/(dashboard)/admin/settings/page.tsx` — `getCronSchedule()` в Promise.all
- `app/(dashboard)/cards/wb/page.tsx` — кнопка + `buyerPrice` select + `DayPoint[]` тип
- `components/settings/SettingsTabs.tsx` — новый таб «Расписание»
- `components/cards/WbCardsTable.tsx` — prop type расширен buyerPrice?
- `components/cards/WbCardOrdersChart.tsx` — BarChart → ComposedChart
- `app/globals.css` — `--chart-1` + `--chart-2` light + dark
- `tests/wb-orders-chart-fill.test.ts` — toEqual обновлён под новый shape

## Commits

| Task | Hash | Title |
|------|------|-------|
| 1 | `f1e6c75` | DB migration + WB v4 buyerPrice helper + cron endpoints + tests |
| 2 | `4a76ccb` | CronScheduleTab UI + retroactive backfill button + page wiring |
| 3 | `6c7f382` | ComposedChart Bar+Line + dark-aware CSS vars + narrower panel |

## Verification Results

| Check | Status | Notes |
|-------|--------|-------|
| `npx vitest run tests/wb-prices-retro tests/wb-prices-cron-dispatch tests/wb-cron-schedule-validation` | ✅ 24/24 passed | 3 new test files |
| `npx vitest run tests/wb-orders-chart-fill` | ✅ 5/5 passed | Updated for new DayPoint shape |
| `npx vitest run tests/pricing-math` (Phase 7 golden) | ✅ passed | NO regression: nmId 800750522 profit/ROI unchanged |
| `npx tsc --noEmit` | ✅ 0 errors | After all 3 tasks |
| `npm run build` | ✅ success | /cards/wb bundle: 120 kB → 125 kB (+5 kB, в пределах нормы из плана) |

## Deviations from Plan

**None.** Plan executed exactly as written. All critical correctness checks from checker round 1 honored:
- `requireSuperadmin()` Promise<void> — корректно НЕ присвоено в const session
- `updatedBy` в AppSetting upsert — omitted (опциональное поле)
- `ordersTimeSeries: Record<string, DayPoint[]>` с импортом `type DayPoint` (B-2)
- `buyerPrice` formula: retro = `sellerPrice × (1 - discountWb/100)`, daily = `round(price.product / 100)` — НЕТ дополнительного walletPct
- Existing `fetchWbDiscounts` НЕ модифицирован (Phase 7 SPP-расчёт сохранён)
- `dot.r = 3` (W-7 fix)
- Retroactive backfill confirm-текст содержит "Безопасно повторять" (W-5 fix)

One minor Rule 1 fix during execution:
- `tests/wb-orders-chart-fill.test.ts` — два `toEqual({date, qty})` asserts стали неверны после расширения `DayPoint` полем `buyerPrice: null`. Обновлены до `toEqual({date, qty, buyerPrice: null})` + добавлен 1 новый assert для buyerPrice прокидывания. Не deviation плана — следствие интерфейс-изменения, плановая активность.

## Deploy инструкции

### A. Запустить deploy.sh на VPS (применит Prisma migration)

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
```

Migration `20260515_wb_card_orders_daily_prices` добавит 2 nullable INTEGER колонки —
никаких данных не теряется, не блокирует production traffic.

### B. Заменить старый zoiten-wb-orders.timer на новый dispatcher

```bash
# 1) Disable + remove старый (W-3 defensive — не падает если timer не существует)
systemctl is-enabled zoiten-wb-orders.timer && systemctl disable --now zoiten-wb-orders.timer || true
rm -f /etc/systemd/system/zoiten-wb-orders.{service,timer}

# 2) Создать /etc/systemd/system/zoiten-cron-dispatch.service
cat > /etc/systemd/system/zoiten-cron-dispatch.service <<'EOF'
[Unit]
Description=Zoiten cron dispatcher
After=network.target zoiten-erp.service

[Service]
Type=oneshot
EnvironmentFile=/etc/zoiten.pro.env
ExecStart=/usr/bin/curl -fsS -X GET -H "x-cron-secret: ${CRON_SECRET}" http://localhost:3001/api/cron/dispatch
EOF

# 3) Создать /etc/systemd/system/zoiten-cron-dispatch.timer
# AccuracySec=1s — иначе systemd может дрейфовать на 1 минуту от *:0/5 и пропустить exact HH:MM match.
cat > /etc/systemd/system/zoiten-cron-dispatch.timer <<'EOF'
[Unit]
Description=Zoiten cron dispatcher (every 5 min)

[Timer]
OnCalendar=*:0/5
AccuracySec=1s
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now zoiten-cron-dispatch.timer
systemctl list-timers | grep zoiten-cron-dispatch
```

### C. CRON_SECRET notes

`CRON_SECRET` уже определён в `/etc/zoiten.pro.env` (используется существующими /api/cron/* endpoints).
Никаких новых секретов добавлять не нужно. Проверь что переменная читается:

```bash
grep CRON_SECRET /etc/zoiten.pro.env
```

### D. (Опционально) Pre-populate AppSetting defaults

`wbOrdersDailyCronTime` и `wbPricesDailyCronTime` имеют hardcoded defaults `"05:00"`/`"05:10"`
в коде (`?? "05:00"`/`?? "05:10"`), поэтому при отсутствии записи cron будет fire по дефолтам.
Если хочешь explicit-row для consistency:

```bash
sudo -u postgres psql -d zoiten_erp <<'SQL'
INSERT INTO "AppSetting" (key, value, "updatedAt") VALUES
  ('wbOrdersDailyCronTime', '05:00', NOW()),
  ('wbPricesDailyCronTime', '05:10', NOW())
ON CONFLICT (key) DO NOTHING;
SQL
```

### E. После deploy: UI flow для retroactive backfill

1. Открыть https://zoiten.pro/cards/wb
2. Нажать **«Backfill цен»** (кнопка с иконкой Coins, рядом с «Backfill заказов»)
3. Подтвердить confirm() → дождаться `toast.success("Backfill цен завершён: ~2165 строк обновлено")`
4. Проверка в БД:
   ```bash
   sudo -u postgres psql -d zoiten_erp -c 'SELECT COUNT(*) FROM "WbCardOrdersDaily" WHERE "sellerPrice" IS NOT NULL;'
   # ожидается ~2165
   ```

## UAT Checklist

### Visual / Functional
- [ ] Клик по строке /cards/wb → раскрывается панель ~640px шириной (НЕ во всю строку)
- [ ] Card-shape обрамление: видна тонкая граница + slightly darker bg
- [ ] График ComposedChart: видны bars (заказы) И линия (цена)
- [ ] В **тёмной теме** линия — **оранжевая** (контрастная), бары — приглушённый cool grey-cyan
- [ ] В **светлой теме** линия — vibrant orange, бары — soft cool grey-cyan
- [ ] Tooltip при hover на bar/point показывает дату + qty + buyerPrice (₽)
- [ ] Третья метрика «Цена сейчас» справа от графика, цвет оранжевый
- [ ] Дни без snapshot → break в линии (НЕ протянутая прямая через gap — connectNulls=false)
- [ ] Tabular numbers на 30d/7d/«Цена сейчас» — стабильная ширина

### Settings UI
- [ ] /admin/settings → 5-й таб «Расписание» виден (только для SUPERADMIN)
- [ ] 2 карточки (Заказы / Цены)
- [ ] `<select>` содержит 288 опций от 00:00 до 23:55 (шаг 5 мин)
- [ ] Default value: Заказы=05:00, Цены=05:10
- [ ] Изменение времени → `toast.success("Заказы WB: расписание сохранено (XX:XX МСК)")`
- [ ] Перезагрузка страницы → новое значение сохранено
- [ ] Поле «Последний запуск» = `—` до первого ночного fire; затем `YYYY-MM-DD`

### Cron lifecycle (на следующее утро)
- [ ] `systemctl list-timers | grep zoiten-cron-dispatch` → показывает next fire через ≤5 мин
- [ ] `journalctl -u zoiten-cron-dispatch.service -n 30` → видны успешные dispatch hits каждые 5 мин (большинство — noop fired=[])
- [ ] В 05:00 МСК: `fired:["orders:200"]` появляется в journalctl
- [ ] В 05:10 МСК: `fired:["prices:200"]` появляется в journalctl
- [ ] AppSetting `wbOrdersDailyLastRun` и `wbPricesDailyLastRun` обновились на сегодняшнюю дату

### DB consistency
- [ ] `SELECT COUNT(*) FROM "WbCardOrdersDaily" WHERE "sellerPrice" IS NOT NULL;` ≈ 2165 (после backfill)
- [ ] `SELECT COUNT(*) FROM "WbCardOrdersDaily" WHERE date = CURRENT_DATE AND "sellerPrice" IS NOT NULL;` > 0 после 05:10 запуска
- [ ] Spot check nmId 800750522: `SELECT date, qty, "sellerPrice", "buyerPrice" FROM "WbCardOrdersDaily" WHERE "nmId" = 800750522 ORDER BY date DESC LIMIT 5;`
  - Ожидается: `sellerPrice ≈ 5310`, `buyerPrice ≈ 3817` (точное значение зависит от текущей цены в БД)

### Regression
- [ ] Phase 7 /prices/wb страница: открывается, golden nmId 800750522 → profit ≈ 567.68 ₽, ROI ≈ 26%
- [ ] /cards/wb обычные операции (sync, sync-spp, sync-ratings) — работают как до плана
- [ ] /admin/settings другие табы (Направления, Бренды, Категории, Маркетплейсы, WB API токены) — без изменений

## Self-Check: PASSED

### Files created (11/11)
- [x] `prisma/migrations/20260515_wb_card_orders_daily_prices/migration.sql` ✓ FOUND
- [x] `lib/wb-cron-schedule.ts` ✓ FOUND
- [x] `app/api/wb-prices-retroactive-backfill/route.ts` ✓ FOUND
- [x] `app/api/cron/wb-prices-daily/route.ts` ✓ FOUND
- [x] `app/api/cron/dispatch/route.ts` ✓ FOUND
- [x] `app/actions/cron-schedule.ts` ✓ FOUND
- [x] `components/settings/CronScheduleTab.tsx` ✓ FOUND
- [x] `components/cards/WbPricesRetroactiveBackfillButton.tsx` ✓ FOUND
- [x] `tests/wb-prices-retro.test.ts` ✓ FOUND
- [x] `tests/wb-prices-cron-dispatch.test.ts` ✓ FOUND
- [x] `tests/wb-cron-schedule-validation.test.ts` ✓ FOUND

### Commits (3/3)
- [x] `f1e6c75` — Task 1 ✓ FOUND in git log
- [x] `4a76ccb` — Task 2 ✓ FOUND in git log
- [x] `6c7f382` — Task 3 ✓ FOUND in git log

### Tests (52 total)
- [x] tests/wb-prices-retro.test.ts: 8 passed
- [x] tests/wb-prices-cron-dispatch.test.ts: 5 passed
- [x] tests/wb-cron-schedule-validation.test.ts: 11 passed
- [x] tests/wb-orders-chart-fill.test.ts: 5 passed (regression)
- [x] tests/pricing-math.test.ts: passed (Phase 7 golden no-regression)

### TypeScript / Build
- [x] `npx tsc --noEmit` → 0 errors
- [x] `npm run build` → success, /cards/wb bundle 125 kB (+5 kB delta, within tolerance)
