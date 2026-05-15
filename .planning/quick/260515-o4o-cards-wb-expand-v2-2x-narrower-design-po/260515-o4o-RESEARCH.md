# Quick 260515-o4o: /cards/wb expand v2 + цены — Research

**Researched:** 2026-05-15
**Domain:** recharts ComposedChart, card.wb.ru v4 API (price formula), shadcn-chart CSS vars, systemd dispatcher, AppSetting KV
**Confidence:** HIGH (empirical curl verification + читали актуальный код)

## Summary

Эмпирическая проверка card.wb.ru v4 API на nmId 800750522 даёт жёсткий ответ на главный вопрос: `price.product / 100` — это **финальная цена покупателя на витрине, со всеми скидками (SPP + кошелёк + клуб + промо)**. Никакого дополнительного умножения `× (1-walletPct/100)` НЕ нужно. CONTEXT.md D-03 §4 содержит ошибочное предположение — это **должно быть исправлено в плане**.

Все остальные слои (ComposedChart, AppSetting KV, shadcn settings tabs) — стандартные паттерны проекта, реюз 100%. Главное архитектурное решение — переключиться с `wb-sync-spp` curl-логики на новую `fetchBuyerPricesViaCurlV4` функцию (вычленить общий код), потому что нам нужен сырой `price.product` без расчёта SPP %.

**Primary recommendation:** `buyerPrice = round(sizes[].price.product / 100)` — точка. `sellerPrice = WbCard.price` (current). НЕ умножать на walletPct. Документировать в коде: `// v4 price.product уже включает все WB-скидки (SPP, кошелёк, клуб, промо). См. эмпирику в 260515-o4o-RESEARCH.md`.

## КРИТИЧЕСКИЙ ОТВЕТ: формула buyerPrice

### Эмпирическая проверка (curl card.wb.ru v4, nmId=800750522, 2026-05-15)

```
GET https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=-1257786&nm=800750522
→ sizes[0].price = {
    "basic":    1770000,   // 17 700 ₽ — priceBeforeDiscount (до seller-скидки)
    "product":   420000,   // 4 200 ₽ — цена на витрине (что платит покупатель)
    "logistics": 0,
    "return":    0
  }
```

Implied effective discount: `1 - 4200/17700 = 76.27%`.

### Анализ существующего кода `fetchWbDiscounts` (lib/wb-api.ts:408-517)

Строка 461-466:
```typescript
const buyerPriceRub = sizeWithPrice.price.product / 100
const sellerPrice = sellerPriceMap?.get(nmId)?.discountedPrice ?? 0
if (sellerPrice > 0 && buyerPriceRub > 0) {
  const spp = Math.round((1 - buyerPriceRub / sellerPrice) * 1000) / 10
  ...
}
```

`buyerPriceRub` напрямую = финальная витринная цена. Из неё через делёж на `sellerPrice` (= WbCard.price = цена после seller-скидки) вычисляется **effective WB discount** (хранится как `WbCard.discountWb`). Сама формула SPP — `1 - product_price / sellerPrice`. Это означает: `buyerPrice = sellerPrice × (1 - discountWb_effective/100)`. Кошелёк УЖЕ в discountWb_effective баке (т.к. это «всё что отнимается от sellerPrice»).

### Финальная формула для кода

```typescript
// Дано: ответ v4 для nmId
const sizeWithPrice = product.sizes.find((s) => s.price?.product)
const buyerPrice = Math.round(sizeWithPrice.price.product / 100)  // целое ₽

// sellerPrice берём из БД (актуальная цена продавца после seller-скидки)
const sellerPrice = Math.round(wbCard.price ?? 0)  // целое ₽
```

Никакого `× (1 - walletPct/100)`. Кошелёк не отнимаем повторно. Тест-кейс из CONTEXT.md (5310 → 3817) — это значит: SPP-effective = `1 - 3817/5310 = 28.12%` (т.е. discountWb в БД ≈ 28.1).

### Verification matrix

| Случай | sellerPrice (БД) | v4 product/100 | buyerPrice финал | discountWb (computed) |
|--------|------------------|----------------|-------------------|------------------------|
| Пример из CONTEXT | 5310 | 3817 | **3817** | 28.12% (правильно) |
| Live 800750522 (сегодня) | (см. БД) | 4200 | **4200** | (зависит от WbCard.price) |

## Standard Stack

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| recharts | 3.8.0 | ComposedChart (Bar+Line dual-axis) | already in package.json |
| shadcn-chart wrapper | components/ui/chart.tsx | ChartContainer wrap ResponsiveContainer | already exists |
| Prisma | 6 | $transaction(callback, {timeout}) + upsert | паттерн из 260515-m5o |

## Architecture Patterns

### Pattern 1: ComposedChart с dual Y-axis (Bar + Line)

shadcn-chart wrapper НЕ требует доработок — `ChartContainer` принимает любой recharts root компонент через children: `typeof RechartsPrimitive.ResponsiveContainer["children"]`. ComposedChart валиден.

```tsx
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

<ChartContainer config={chartConfig} className="h-44 w-full">
  <ComposedChart data={timeSeries} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
    <CartesianGrid vertical={false} strokeDasharray="2 2" opacity={0.3} />
    <XAxis dataKey="date" tickFormatter={(s) => s.slice(5)} fontSize={10} tickLine={false} axisLine={false} interval={3} />
    <YAxis yAxisId="qty" orientation="left" allowDecimals={false} fontSize={10} tickLine={false} axisLine={false} />
    <YAxis yAxisId="price" orientation="right" fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
    <ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => `Дата: ${label}`} />} />
    <Bar yAxisId="qty" dataKey="qty" fill="var(--color-qty)" radius={[2, 2, 0, 0]} />
    <Line yAxisId="price" type="monotone" dataKey="buyerPrice" stroke="var(--color-buyerPrice)" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
  </ComposedChart>
</ChartContainer>
```

`connectNulls={false}` обязательно — для дней без цены (старые backfill-записи где price=null) линия рвётся, не «протягивается».

`chartConfig`:
```tsx
const chartConfig = {
  qty: { label: "Заказы", color: "hsl(var(--chart-1))" },
  buyerPrice: { label: "Цена покупателя", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig
```

### Pattern 2: AppSetting KV (already established)

`prisma.appSetting.upsert({ where: {key}, create: {key, value}, update: {value, updatedBy: userId} })`. Все значения — STRING. Парсинг на клиенте.

Существующий `getPricingSettings` (app/actions/pricing.ts:65) — паттерн lazy-seed с дефолтами. Для cron-времён повторить ту же логику: defaults `wbOrdersDailyCronTime="05:00"`, `wbPricesDailyCronTime="05:10"`.

**ВАЖНО:** новые ключи `wbOrdersDailyCronTime/wbPricesDailyCronTime/wbOrdersDailyLastRun/wbPricesDailyLastRun` НЕ нужно добавлять в `APP_SETTING_KEYS` whitelist из `lib/pricing-schemas.ts` — это whitelist для **Phase 7 pricing rates** (защита injection в /prices/wb UI). Новые ключи cron-расписания — отдельный домен, отдельный action (`updateCronSchedule`) с собственной валидацией HH:MM regex.

### Pattern 3: Systemd dispatcher (новый паттерн в проекте)

В проекте уже есть `zoiten-wb-orders.timer` (05:00 МСК) и `zoiten-purge.timer` (02:00 daily). Они **простые dedicated timers** — один OnCalendar = один endpoint. Dispatcher паттерна нет.

**Рекомендация:** dispatcher НЕ нужен. Проще — **два независимых timer'a с фиксированным `OnCalendar`**, и API `/admin/settings → Расписание` редактирует `OnCalendar` строку (но это требует SSH-доступа из ERP к VPS systemd — overkill).

**Альтернатива (упрощённая):** dispatcher всё-таки делаем, но реализация тривиальная:
- 1 timer `zoiten-cron-dispatch.timer` с `OnCalendar=*:0/5` (каждые 5 минут)
- 1 service `zoiten-cron-dispatch.service` → curl `/api/cron/dispatch`
- endpoint dispatch читает 2 AppSetting (wbOrdersDailyCronTime, wbPricesDailyCronTime), сравнивает с MSK `HH:MM` now, если совпадает И lastRunDate !== today → fires endpoint **через прямой импорт handler'а** (НЕ через HTTP-петлю, проще и быстрее)
- Сразу после успешного run обновляет `wbXLastRun = YYYY-MM-DD`

```ini
# zoiten-cron-dispatch.timer
[Unit]
Description=Zoiten cron dispatcher (every 5 min, fans out per AppSetting schedule)
[Timer]
OnCalendar=*:0/5
Persistent=true
[Install]
WantedBy=timers.target
```

`OnCalendar=*:0/5` — каждые 5 минут (системное время VPS = UTC, но MSK-арифметика делается в коде через `Date(Date.now() + 3 * 3600_000)` как в существующих хелперах).

### Pattern 4: `/admin/settings` новый таб

`SettingsTabs` (client component) — добавление таба = 1 TabsTrigger + 1 TabsContent + 1 новый client component `CronScheduleTab`.

Структура `CronScheduleTab` копирует визуально WbTokensTab (карточки в `grid gap-4`): 2 карточки (Заказы, Цены), каждая с native `<select>` (5-мин шаги, 00:00..23:55 = 288 опций) + display `wbXLastRun`. Server action `updateCronSchedule(key, hhmm)` с regex `/^([01]\d|2[0-3]):[0-5]\d$/` и проверкой `minutes % 5 === 0`. `requireSuperadmin()`.

Тип компонента: **client** (нужны useState + useTransition для optimistic save), как WbTokensTab.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Time-based dispatcher | Cron-парсер для строк типа `0 5 * * *` | Plain MSK HH:MM string + хелпер `getMskHHMM()` | 5-мин granularity достаточна (D-04), полный crontab парсинг overkill |
| Price snapshot fetch | Новая curl-логика | Извлечь общее с `lib/wb-api.ts:fetchWbDiscounts` в `fetchBuyerPricesViaCurlV4(nmIds): Map<nmId, {buyerPrice, sellerRatingFromV4?}>` | Тот же curl, та же логика TLS fingerprint bypass, тот же rate limit (батчи 20, пауза 3 сек) |
| Settings tab UI | Custom CSS / форму с нуля | Скопировать структуру `WbTokensTab` (grid карточек) | Уже верифицирован паттерн (Quick 260512-jxh) |
| Chart dual-axis | recharts LineChart + наложение | `ComposedChart` (Bar + Line) | Recharts API specifically for this |

**Key insight:** v4 уже даёт `buyerPrice` напрямую — НЕ пересчитываем через walletPct.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 2165 строк в `WbCardOrdersDaily` без price-колонок | DB migration ALTER + backfill UPDATE (одноразовый POST endpoint) |
| Live service config | Existing `zoiten-wb-orders.timer` будет **disabled+remove** в пользу `zoiten-cron-dispatch.timer`. Решает orchestration перевод. | Документировать в deploy notes: `systemctl disable --now zoiten-wb-orders.timer && rm /etc/systemd/system/zoiten-wb-orders.{service,timer}` |
| OS-registered state | systemd timer-units `zoiten-wb-orders.{service,timer}` зарегистрированы в /etc/systemd/system/ (см. SUMMARY 260515-m5o §Deploy) | Replace by `zoiten-cron-dispatch.{service,timer}` |
| Secrets/env vars | `CRON_SECRET` в `/etc/zoiten.pro.env` — reused. Никаких новых секретов. | Никаких — dispatch endpoint использует существующий header |
| Build artifacts | None — нет egg-info / compiled binaries | Никаких |

## Common Pitfalls

### Pitfall 1: Двойное удержание кошелька

**Что:** Если ошибочно делать `buyerPrice = (v4.price.product/100) × (1 - walletPct/100)`, получаются цены НИЖЕ реальных на 2% (кошелёк уже отнят в v4 product price).

**Avoid:** Прямое присвоение `buyerPrice = Math.round(price.product / 100)`. Тест-fixture: 5310 → 3817 (НЕ 3741, что было бы при двойном вычитании 2% кошелька).

### Pitfall 2: connectNulls={true} в Line

**Что:** Линия цены протянется через дни без записи (после backfill — дни без orders=no row, price=null) и нарисует артефактную «прямую через гэп», вводя в заблуждение.

**Avoid:** Явно `connectNulls={false}`. Honest visual gaps.

### Pitfall 3: dispatcher hits cron twice in one MSK minute

**Что:** Если dispatcher fires в `04:59:55 UTC = 07:59:55 MSK`, потом снова `05:04:55 UTC = 08:04:55 MSK`, и `wbOrdersDailyCronTime = "08:00"` — оба попадут в окно 08:00..08:04 если используется loose match. Может выполнить sync дважды.

**Avoid:** Точное сравнение `currentMskHHMM === storedHHMM` (HH:MM strings, без минутных окон). Поскольку storedHHMM кратно 5 минутам (UI ограничен), а dispatcher fires `:00/:05/:10/...`, то совпадение случается ровно 1 раз в сутки.

Plus `lastRunDate !== today` — двойной guard от повторного запуска (например если dispatcher fires 08:00 и затем какая-то systemd peculiarity — second match не fire actual sync).

### Pitfall 4: Storefront price = 0 при выпавшем товаре

**Что:** Если карточка soft-deleted в WB (out-of-stock + sold-out), v4 может возвращать `sizes[]` пустой или `price.product=0`. Текущий код `find(s => s.price?.product)` пропускает такие — buyerPrice не запишется (null).

**Avoid:** Это **ожидаемое поведение** — записываем `buyerPrice = null` в WbCardOrdersDaily, в графике `connectNulls=false` создаёт gap. OK.

### Pitfall 5: AppSetting last-run guard race

**Что:** Если dispatcher concurrent execution (несколько systemd instances из-за restart), две инстанции одновременно: A читает `wbOrdersDailyLastRun=2026-05-14`, видит !== today → fire. B читает то же → тоже fire. Дублирующая sync.

**Avoid:** Опционально — `prisma.$transaction` с `findUnique` + `update` для atomic guard. На практике systemd по умолчанию не делает overlapping execution (Type=oneshot ждёт previous). Можно проигнорировать.

## Code Examples

### Backfill endpoint (UPSERT existing 2165 rows)

```typescript
// app/api/wb-prices-retroactive-backfill/route.ts
export async function POST() {
  await requireSection("PRODUCTS", "MANAGE")

  const rates = await getPricingSettings()
  const walletPct = rates.ok ? rates.data.wbWalletPct : 2

  const cards = await prisma.wbCard.findMany({
    where: { deletedAt: null, price: { not: null } },
    select: { nmId: true, price: true, discountWb: true },
  })

  let updated = 0
  for (const card of cards) {
    if (!card.price) continue
    const sellerPrice = Math.round(card.price)
    // buyerPrice retro = compute from current discountWb (effective, уже включает кошелёк)
    // Если discountWb отсутствует — fallback на walletPct only.
    const effectiveDiscount = card.discountWb ?? walletPct
    const buyerPrice = Math.round(sellerPrice * (1 - effectiveDiscount / 100))

    const result = await prisma.wbCardOrdersDaily.updateMany({
      where: { nmId: card.nmId, sellerPrice: null },
      data: { sellerPrice, buyerPrice },
    })
    updated += result.count
  }
  return NextResponse.json({ updated })
}
```

**Note:** retro UPDATE использует `discountWb` (= effective SPP+кошелёк) — НЕ дополнительно умножает на walletPct. Это согласовано с фактической формулой v4 (см. КРИТИЧЕСКИЙ ОТВЕТ выше).

### Cron prices daily endpoint (новые цены через curl)

```typescript
// app/api/cron/wb-prices-daily/route.ts
export async function GET(req: NextRequest) {
  // x-cron-secret guard
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const cards = await prisma.wbCard.findMany({
    where: { deletedAt: null },
    select: { nmId: true, price: true },
  })
  const sellerMap = new Map(cards.map((c) => [c.nmId, Math.round(c.price ?? 0)]))
  const nmIds = cards.map((c) => c.nmId)

  // Reuse curl-логику. Можно либо локально (copy fetchSppViaCurlV4 minus SPP math),
  // либо extract в lib/wb-api.ts:fetchBuyerPricesViaCurlV4 (preferred).
  const buyerPrices = await fetchBuyerPricesViaCurlV4(nmIds)  // Map<nmId, number ₽>

  // Yesterday MSK 00:00 UTC
  const yesterday = new Date(Date.now() - 24 * 3600_000)
  yesterday.setUTCHours(0, 0, 0, 0)

  let upserted = 0
  for (const nmId of nmIds) {
    const buyerPrice = buyerPrices.get(nmId)
    if (!buyerPrice) continue
    const sellerPrice = sellerMap.get(nmId) ?? null

    await prisma.wbCardOrdersDaily.upsert({
      where: { nmId_date: { nmId, date: yesterday } },
      create: { nmId, date: yesterday, qty: 0, sellerPrice, buyerPrice },
      update: { sellerPrice, buyerPrice },  // qty не трогаем
    })
    upserted++
  }

  // Update lastRun marker for dispatcher idempotency
  await prisma.appSetting.upsert({
    where: { key: "wbPricesDailyLastRun" },
    create: { key: "wbPricesDailyLastRun", value: getMskTodayString() },
    update: { value: getMskTodayString() },
  })

  return NextResponse.json({ upserted })
}
```

### Dispatcher endpoint

```typescript
// app/api/cron/dispatch/route.ts
export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Current MSK HH:MM
  const mskNow = new Date(Date.now() + 3 * 3600_000)
  const hh = String(mskNow.getUTCHours()).padStart(2, "0")
  const mm = String(mskNow.getUTCMinutes()).padStart(2, "0")
  const currentHHMM = `${hh}:${mm}`
  const today = getMskTodayString()  // YYYY-MM-DD

  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ["wbOrdersDailyCronTime", "wbPricesDailyCronTime", "wbOrdersDailyLastRun", "wbPricesDailyLastRun"] } },
  })
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]))
  const ordersTime = map.wbOrdersDailyCronTime ?? "05:00"
  const pricesTime = map.wbPricesDailyCronTime ?? "05:10"

  const fired: string[] = []
  if (currentHHMM === ordersTime && map.wbOrdersDailyLastRun !== today) {
    // Direct internal call via dynamic import OR via fetch with cron header
    const { GET: ordersHandler } = await import("../wb-orders-daily/route")
    await ordersHandler(req)
    fired.push("orders")
  }
  if (currentHHMM === pricesTime && map.wbPricesDailyLastRun !== today) {
    const { GET: pricesHandler } = await import("../wb-prices-daily/route")
    await pricesHandler(req)
    fired.push("prices")
  }
  return NextResponse.json({ currentHHMM, fired })
}
```

**Note:** `dynamic import` для прямого вызова route handler'а — обход HTTP-петли. Альтернатива — `fetch("http://localhost:3001/api/cron/wb-orders-daily", {headers: {x-cron-secret: process.env.CRON_SECRET!}})`. Прямой import быстрее (no TCP), но требует чтобы handler принимал NextRequest и был exported. Оба работают, выберем направление в плане.

### shadcn-chart CSS vars — design tweak

Текущие значения в `app/globals.css` (lines 93-97 light, 128-132 dark):

```css
/* light */
--chart-1: oklch(0.62 0.22 28);   /* primary orange — нынешний bars color */
--chart-2: oklch(0.7 0.18 40);    /* warm orange — хорош для line */
/* dark */
--chart-1: oklch(0.87 0 0);       /* light grey — bars нейтральные */
--chart-2: oklch(0.556 0 0);      /* medium grey — line не выделяется! */
```

**Проблема dark mode:** оба `--chart-1` и `--chart-2` — оттенки серого. Линия цены не отличима от баров. Это **прямая ошибка дизайна**, которую CONTEXT.md D-06 хочет исправить.

**Рекомендуемые правки (соответствуют D-06):**

```css
/* light — bars нейтральные, line брендовый оранжевый */
--chart-1: oklch(0.85 0.05 200);  /* soft cool grey-cyan — bars muted secondary */
--chart-2: oklch(0.65 0.2 30);    /* vibrant orange — primary line */

/* dark */
--chart-1: oklch(0.45 0.05 200);  /* darker grey-cyan — bars читаются на тёмном */
--chart-2: oklch(0.7 0.18 30);    /* brighter orange — line pops on dark */
```

**Caveat:** другие чарты в проекте? Поиск `--chart-1`/`--chart-2` shows ТОЛЬКО `WbCardOrdersChart.tsx` использует `var(--color-qty)` (через ChartConfig). Изменение CSS vars НЕ затрагивает другие компоненты в репозитории (chart-1 не используется напрямую в JSX). **Безопасно перезаписать.**

## State of the Art

| Old Approach | Current Approach | Why |
|--------------|------------------|-----|
| Separate Bar + separate Line (overlay charts) | recharts `<ComposedChart>` with `yAxisId` | Standard recharts API since 1.x; правильная axis sync |
| Hard-coded HSL colors per chart | shadcn ChartConfig + `--color-{key}` CSS vars | Theme-aware (auto dark mode); reactively-resolved через `<ChartStyle>` |
| systemd dedicated timer per cron | systemd dispatcher + AppSetting time config | UI-configurable cron times without SSH access |

## Open Questions

1. **fetchBuyerPricesViaCurlV4 — extract или duplicate?**
   - Что знаем: 90% кода тот же что в `fetchWbDiscounts` (lines 420-481 в lib/wb-api.ts) и `wb-sync-spp/route.ts` (lines 38-112).
   - Что неясно: extracting может вызвать regressions в Phase 7 pricing flow.
   - Рекомендация: **новая отдельная функция `fetchBuyerPricesViaCurlV4(nmIds): Map<nmId, number>`** в `lib/wb-api.ts`, **без** изменения существующих `fetchWbDiscounts`/`wb-sync-spp`. Дублирование curl-инструкции ~30 строк — приемлемая цена за zero regression в Phase 7.

2. **Cron dispatcher — direct import или HTTP fetch?**
   - Direct import: проще, нет TCP loop, нет дополнительного RBAC checking.
   - HTTP fetch: чище разделение, легче переиспользовать `wb-orders-daily` логику.
   - Рекомендация: **direct import** через dynamic `await import("../wb-orders-daily/route")` + `.GET(req)`. Уже работает паттерн в Next.js 15 App Router.

3. **Cron schedule validation: 5-min шаги обязательны?**
   - Если пользователь хочет 05:07, dispatcher fires `:00, :05, :10` — выберет следующее совпадение `:10`, не `:07`. Backend должен валидировать `minutes % 5 === 0` и отдавать ошибку.
   - Альтернатива: round-down к ближайшему 5-минутному кратному. Менее explicit, но удобнее UX.
   - Рекомендация: **строгая валидация в schema** + `<select>` с pre-built options, чтобы пользователь физически не мог выбрать невалидное.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| recharts | ComposedChart | ✓ | 3.8.0 | — |
| Prisma | $transaction + upsert WbCardOrdersDaily | ✓ | 6 | — |
| systemd | dispatcher timer (deploy) | ✓ (VPS only) | — | manual cron task |
| curl | card.wb.ru v4 fetch | ✓ (Node.js execSync) | — | none — fetch() blocked by WB TLS fingerprint |
| PostgreSQL | DB | ✓ | 16 | — |

**Missing dependencies with no fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts |
| Quick run | `npm run test -- tests/<filename>` |
| Full suite | `npm run test` |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Command | File Exists? |
|-----|----------|-----------|---------|--------------|
| Price formula | `buyerPrice = round(v4.product/100)` (no walletPct multiplication) | unit | `npm run test -- tests/wb-prices-buyer-formula.test.ts` | ❌ Wave 0 |
| Retro backfill | UPDATE existing rows with computed buyerPrice from sellerPrice × (1 - discountWb/100) | unit | `npm run test -- tests/wb-prices-retroactive.test.ts` | ❌ Wave 0 |
| Cron dispatcher | MSK HH:MM match + lastRun guard | unit | `npm run test -- tests/wb-cron-dispatch.test.ts` | ❌ Wave 0 |
| Cron schedule validation | HH:MM regex + 5-min step | unit | `npm run test -- tests/wb-cron-schedule-validation.test.ts` | ❌ Wave 0 |
| ComposedChart fill | timeSeries with mixed qty/price/null gaps | unit | `npm run test -- tests/wb-orders-chart-prices.test.ts` | ❌ Wave 0 |
| Build | TypeScript + Next.js build | smoke | `npm run build` | ✓ existing |

### Sampling Rate
- **Per task commit:** `npm run test -- tests/<new-file>` (затронутый тест)
- **Per merge:** `npm run test -- tests/wb-*` (вся WB-связка)
- **Phase gate:** Full `npm run test` + `npm run build`

### Wave 0 Gaps
- [ ] `tests/wb-prices-buyer-formula.test.ts` — golden test: `parseV4Response({basic:1770000, product:420000}) → {sellerPrice:17700, buyerPrice:4200}` (NO walletPct multiplication)
- [ ] `tests/wb-prices-retroactive.test.ts` — backfill computes buyerPrice from sellerPrice × (1 - discountWb/100) для рядов с null
- [ ] `tests/wb-cron-dispatch.test.ts` — MSK HH:MM equality + lastRun guard prevents double-fire
- [ ] `tests/wb-cron-schedule-validation.test.ts` — Zod regex принимает "05:10", "23:55"; отклоняет "5:10", "25:00", "05:07"
- [ ] `tests/wb-orders-chart-prices.test.ts` — timeSeries содержит qty + buyerPrice + null gaps (для connectNulls=false проверки)

## Project Constraints (from CLAUDE.md)

- **WB v4 API:** ТОЛЬКО через `execSync('curl ...')`, НЕ через `fetch()` — TLS fingerprint блокировка
- **Server Actions:** `"use server"` + `requireSection()` или `requireSuperadmin()` + try/catch + `revalidatePath`
- **shadcn-chart wrapper:** не использовать base-ui Select — только native `<select>` для 288-опций (5-min steps)
- **Sticky data-таблицы:** не применимо к expandable panel (она вне scroll-container)
- **Тесты Phase 7 pricing:** golden test nmId 800750522 → profit≈567.68, ROI≈26% — наша price-фича НЕ должна сломать это (touch только новых таблиц)
- **CRON_SECRET в /etc/zoiten.pro.env** — общий для всех cron endpoints
- **`commit -am` НЕ берёт untracked** — используй `git add -A && git commit -m ...`

## Sources

### Primary (HIGH confidence)
- Empirical curl probe: `https://card.wb.ru/cards/v4/detail?nm=800750522` (2026-05-15)
- `lib/wb-api.ts:fetchWbDiscounts` lines 408-517 — existing SPP formula
- `app/api/wb-sync-spp/route.ts` — existing curl pattern
- `prisma/schema.prisma` lines 257-332 (WbCard), 567-572 (AppSetting), 1024-1035 (WbCardOrdersDaily)
- `app/globals.css` lines 93-97, 128-132 — chart CSS vars
- `components/ui/chart.tsx` — shadcn wrapper (supports arbitrary recharts root via children type)
- `components/settings/SettingsTabs.tsx` + `WbTokensTab.tsx` — settings tab pattern
- `node_modules/recharts/types/chart/ComposedChart.d.ts` — ComposedChart available in 3.8.0
- `.planning/quick/260515-m5o-.../260515-m5o-SUMMARY.md` — systemd unit reference

### Secondary (MEDIUM confidence)
- recharts ComposedChart docs (recharts.org) — standard API, well-documented
- shadcn-chart docs — wrapper accepts any recharts root via TS generic

### Tertiary (LOW confidence)
- None — все критические факты verified эмпирически или через файлы.

## Metadata

**Confidence breakdown:**
- Price formula (buyerPrice = product/100): **HIGH** — empirical curl + code analysis confirms
- ComposedChart support: **HIGH** — ComposedChart.d.ts exists in installed recharts
- AppSetting KV pattern: **HIGH** — Phase 7 reference
- Settings tab pattern: **HIGH** — WbTokensTab reference (Quick 260512-jxh)
- Dispatcher cron architecture: **MEDIUM** — новый паттерн, не доказан в проде; рекомендация direct import может потребовать корректировки на implementation
- CSS vars design choice: **MEDIUM** — другие чарты не используют --chart-1/--chart-2 напрямую, безопасно менять, но дизайн oklch values — мнение

**Research date:** 2026-05-15
**Valid until:** 30 дней (стабильный стек) — кроме v4 API empirical price (это live data, может измениться, формула стабильна)
