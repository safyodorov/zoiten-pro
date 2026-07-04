# Phase 25: План продаж v2 — Pattern Map

**Составлено:** 2026-07-04
**Файлов проанализировано:** 35 (новые/изменяемые)
**Аналогов найдено:** 33 / 35

---

## Классификация файлов

| Новый / изменяемый файл | Роль | Поток данных | Ближайший аналог | Качество совпадения |
|-------------------------|------|--------------|-----------------|---------------------|
| `prisma/migrations/20260705_sales_plan_v2/migration.sql` | migration | batch | `prisma/migrations/20260415_*/migration.sql` | role-match |
| `lib/sales-plan/types.ts` | utility | transform | `lib/pricing-math.ts` (блок Types) | role-match |
| `lib/sales-plan/engine.ts` | utility | transform | `lib/pricing-math.ts` | exact |
| `lib/sales-plan/arrivals.ts` | utility | transform | `lib/stock-data.ts` (productionBreakdown) | role-match |
| `lib/sales-plan/iu.ts` | utility | transform | `lib/pricing-math.ts` | role-match |
| `lib/sales-plan/virtual-purchases.ts` | utility | transform | `lib/pricing-math.ts` | role-match |
| `lib/sales-plan/plan-fact.ts` | utility | transform | `lib/loan-math.ts` (computeSchedule) | role-match |
| `lib/sales-plan/data.ts` | service | CRUD | `lib/sales-forecast.ts` | exact |
| `lib/sales-plan/pdds-feed.ts` | service | request-response | `lib/procurement-math.ts` + `lib/sales-forecast.ts` | role-match |
| `lib/date-buckets.ts` | utility | transform | `lib/loan-math.ts` (bucketKey/bucketLabel) | exact |
| `lib/sales-plan/dates.ts` | utility | transform | `lib/sales-forecast.ts` (date helpers) | exact |
| `app/actions/sales-plan.ts` | service | CRUD | `app/actions/sales-plan.ts` (текущий) | exact (переработка) |
| `scripts/bootstrap-sales-plan-monthly.ts` | utility | batch | `scripts/bootstrap-balance-snapshot.ts` | exact |
| `app/(dashboard)/sales-plan/page.tsx` | component | request-response | `app/(dashboard)/sales-plan/page.tsx` (текущий) | exact (переработка) |
| `app/(dashboard)/sales-plan/products/page.tsx` | component | request-response | `app/(dashboard)/prices/wb/page.tsx` | role-match |
| `app/(dashboard)/sales-plan/purchases/page.tsx` | component | request-response | `app/(dashboard)/procurement/purchases/page.tsx` | role-match |
| `components/sales-plan/SalesPlanTabs` | component | request-response | `components/credits/CreditsTabs.tsx` | exact |
| `components/sales-plan/PlanVersionBar` | component | request-response | `components/credits/ScheduleControls.tsx` | role-match |
| `components/sales-plan/FixPlanVersionDialog` | component | CRUD | `components/procurement/PurchaseModal.tsx` | role-match |
| `components/sales-plan/PlanFactControls` | component | request-response | `components/credits/ScheduleControls.tsx` | exact |
| `components/sales-plan/PlanFactSummaryCards` | component | request-response | `components/credits/LoanSummaryCards.tsx` | role-match |
| `components/sales-plan/PlanFactChart` | component | request-response | `components/sales-plan/SalesForecastDailyChart.tsx` | role-match |
| `components/sales-plan/PlanFactMatrix` | component | request-response | `components/credits/SummaryScheduleTable.tsx` | exact |
| `components/sales-plan/ProductPlanTable` | component | CRUD | `components/sales-plan/SalesForecastTable.tsx` | exact (переработка) |
| `components/sales-plan/ProductPlanCell` | component | CRUD | `components/cost/CostTable.tsx` (CostCell) | exact |
| `components/sales-plan/ProductPlanDialog` | component | request-response | `components/sales-plan/ProductForecastDialog.tsx` | exact (переработка) |
| `components/sales-plan/IncomingBadges` | component | request-response | нет аналога | no-analog |
| `components/sales-plan/VirtualPurchasesTable` | component | CRUD | `components/procurement/PurchasesTable.tsx` | role-match |
| `components/sales-plan/VirtualPurchaseDialog` | component | CRUD | `components/procurement/PurchaseModal.tsx` | role-match |
| `components/sales-plan/ModelParamsBar` | component | CRUD | `components/prices/wb/GlobalRatesBar.tsx` | role-match |
| `components/sales-plan/SalesPlanFilters` | component | request-response | `components/sales-plan/SalesForecastFilters.tsx` | exact (rename) |
| `tests/sales-plan-engine.test.ts` | test | transform | `tests/pricing-math.test.ts` | exact |
| `tests/sales-plan-arrivals.test.ts` | test | transform | `tests/pricing-math.test.ts` | role-match |
| `tests/sales-plan-iu.test.ts` | test | transform | `tests/pricing-math.test.ts` | role-match |
| `tests/sales-plan-plan-fact.test.ts` | test | transform | `tests/pricing-math.test.ts` | role-match |
| `tests/sales-plan-virtual.test.ts` | test | transform | `tests/pricing-math.test.ts` | role-match |
| `tests/sales-plan-pdds-feed.test.ts` | test | transform | `tests/pricing-math.test.ts` | role-match |
| `tests/date-buckets.test.ts` | test | transform | `tests/pricing-math.test.ts` | role-match |

---

## Назначения паттернов

---

### `lib/sales-plan/engine.ts` (utility, transform)

**Аналог:** `lib/pricing-math.ts`

**Паттерн заголовка файла** (строки 1–24):
```typescript
// lib/sales-plan/engine.ts
//
// Pure функции для симуляции плана продаж H2-2026.
// Используется и на сервере (RSC рендер таблицы), и на клиенте (realtime пересчёт в модалке).
//
// **Никаких side effects**: детерминированные, без импортов Prisma / React / Next.
// Golden test: tests/sales-plan-engine.test.ts
//   1 товар, 2 месяца, уровень + day override + 2 партии → toBeCloseTo по дням
//   iuTotalForRange("2026-07-01","2026-12-31") === 438_068_120 (lib/sales-plan/iu.ts)
```

**Паттерн типов** (из `lib/pricing-math.ts` строки 31–60):
```typescript
// Принцип: отдельный export interface для входов и для выходов.
// Входы — сериализуемые (без Date-объектов, без Decimal) — они же
// возвращаются read-action'ом getProductPlanDays для клиентского realtime.
export interface SalesPlanInputs { ... }
export interface ProductPlanInput { ... }
export interface PlanDayRow { ... }
export interface ProductPlanResult { ... }
export function computeSalesPlan(inputs: SalesPlanInputs): SalesPlanResult
// НЕ экспортируем внутренние промежуточные типы
```

**Паттерн pure-функции** (из `lib/pricing-math.ts` — вся функция `calculatePricing`):
```typescript
// Правило: одна функция = одна отвественность, zero Prisma-импортов.
// Внутренние хелперы — не-экспортируемые локальные функции.
// Все числа — обычные number (не Decimal), round через Math.round.
export function computeSalesPlan(inputs: SalesPlanInputs): SalesPlanResult {
  // 1. Вычисляем rateRequested per день для каждого товара
  // 2. Запускаем simulateProductPlan per товар
  // 3. Агрегируем company-level daily/monthly
}

function simulateProductPlan(product: ProductPlanInput, params: ModelParams): ProductPlanResult {
  // Копируем механику lib/sales-forecast.ts:computeForecast — проверенный алгоритм
  // T+3 выкупы, T+6 возвраты, clamp stock ≥ 0, rateRequested vs stock
}
```

---

### `lib/sales-plan/types.ts` (utility, transform)

**Аналог:** `lib/pricing-math.ts` (блок Types строки 31–95) + `lib/sales-forecast.ts` (строки 78–162)

**Принципы типизации** (из `lib/sales-forecast.ts` строки 80–148):
```typescript
// BuyoutSource — union string literal, экспортируется отдельно (не инлайн в интерфейсе)
export type BuyoutSource = "own" | "legacy" | "subcategory" | "global"

// Все export interface — публичный контракт для компонентов
// Внутренние типы (interface ProductMeta) — НЕ экспортируются
export interface ProductForecast {
  productId: string
  // ... поля: всё string/number/boolean/null, без Date-объектов
  dailySales: Array<{ date: string; units: number; rub: number }>
}

// Для ArrivalBatch — тег dateSource как union:
export type ArrivalDateSource = "manual" | "transit-eta" | "leadtime-eta" | "legacy-expected"
```

---

### `lib/sales-plan/arrivals.ts` (utility, transform)

**Аналог:** `lib/stock-data.ts` (productionBreakdown, строки 134–175)

**Паттерн per-закупка qtyRemaining** (из `lib/stock-data.ts` строки 160–175):
```typescript
// Формула production-sync, per закупка (не схлопывая):
// qty = max(0, item.quantity - stage(WAREHOUSE).qty)
const qty = Math.max(0, item.quantity - (item.stages[0]?.quantity ?? 0))
if (qty <= 0) continue
```

**Пояснение:** `resolveArrivalBatches()` — pure функция (не async), принимает уже загруженные данные. Fallback-цепочка: `plannedArrivalDate` → TRANSIT.date + transitDays → `createdAt + leadTimeDays` → `ProductIncoming.expectedDate` → null. Каждый уровень тегирует `dateSource`.

---

### `lib/date-buckets.ts` (utility, transform)

**Аналог:** `lib/loan-math.ts` (строки 172–237) — **точное копирование + расширение**

**Копировать целиком** из `lib/loan-math.ts` строки 50–86 (getIsoWeek), 172–237 (bucketKey, bucketLabel):
```typescript
// ВЫНЕСТИ из lib/loan-math.ts как есть, затем добавить:
export type Granularity = "day" | "week" | "month" | "quarter" | "halfyear" | "year"

// bucketKey — добавить case "quarter" | "halfyear" | "year":
case "quarter": {
  const q = Math.ceil((date.getUTCMonth() + 1) / 3)
  return `${y}-Q${q}`
}
case "halfyear": {
  const h = date.getUTCMonth() < 6 ? 1 : 2
  return `${y}-H${h}`
}
case "year":
  return `${y}`

// bucketLabel — добавить соответствующие ветки:
case "quarter": return `Q${key.split("-Q")[1]} ${key.split("-")[0]}`
case "halfyear": return `H${key.split("-H")[1]} ${key.split("-")[0]}`
case "year": return key
```

После выноса `lib/loan-math.ts` переключается на `import { bucketKey, bucketLabel, type Granularity } from "@/lib/date-buckets"`.

---

### `lib/sales-plan/plan-fact.ts` (utility, transform)

**Аналог:** `lib/loan-math.ts` (computeSchedule, buildAggregates) + `lib/sales-forecast.ts` (агрегация)

**Паттерн бакетирования** (из `lib/loan-math.ts` строки 96–110):
```typescript
// Группировка по бакетам — через bucketKey из lib/date-buckets.ts
const byBucket = new Map<string, { plan: number; fact: number; iu: number }>()
for (const row of versionDays) {
  const key = bucketKey(parseDate(row.date), granularity)
  const cur = byBucket.get(key) ?? { plan: 0, fact: 0, iu: 0 }
  cur.plan += row.planBuyoutsRub
  byBucket.set(key, cur)
}
```

**Pro-rata незавершённого бакета:** для текущего бакета (содержит today) план берётся только за дни `≤ yesterday`.

---

### `lib/sales-plan/iu.ts` (utility, transform)

**Аналог:** `lib/pricing-math.ts` (паттерн pure-вычисления)

**Паттерн** (golden test anchored):
```typescript
// Pure, без Prisma. iuTargets из AppSetting передаются снаружи.
export interface IuTarget {
  from: string   // "2026-07-01"
  to: string     // "2026-12-31"
  dailyRub: number  // 2_380_805
}

export function iuTotalForRange(from: string, to: string, targets: IuTarget[]): number
export function iuSeriesForRange(from: string, to: string, targets: IuTarget[]): Array<{ date: string; cumulative: number }>

// Golden test: iuTotalForRange("2026-07-01","2026-12-31", [{from:"2026-07-01",to:"2026-12-31",dailyRub:2_380_805}]) === 438_068_120
// 184 дней × 2_380_805 = 438_068_120
```

---

### `lib/sales-plan/data.ts` (service, CRUD)

**Аналог:** `lib/sales-forecast.ts` — **главный образец структуры Prisma-загрузчика**

**Паттерн импортов** (из `lib/sales-forecast.ts` строки 1–15):
```typescript
import { prisma } from "@/lib/prisma"
import { PRODUCT_HIERARCHY_ORDER_BY } from "@/lib/product-order"
// НЕТ import React, НЕТ import next
```

**Паттерн запроса товаров** (из `lib/sales-forecast.ts` строки 239–252):
```typescript
const products = await prisma.product.findMany({
  where: { deletedAt: null },
  include: {
    brand: { include: { direction: true } },
    category: true,
    subcategory: true,
    articles: {
      where: { marketplaceId: wbMarketplace.id },
      select: { article: true },
    },
    // Phase 25: добавить salesPlanMonthLevels, salesPlanDayOverrides
  },
  orderBy: PRODUCT_HIERARCHY_ORDER_BY,
})
```

**Паттерн funnel-запроса (company-level + product-level)** (из `lib/sales-forecast.ts` строки 280–358):
```typescript
// Один запрос funnel — два разреза в JS:
// (а) company-level: SUM по ВСЕМ nmId → сравнение с ИУ
// (б) product-level: через MarketplaceArticle JOIN
const funnel = await prisma.wbCardFunnelDaily.findMany({
  where: {
    nmId: { in: allNmIds },
    date: { gte: parseDate(settledFrom), lte: parseDate(yesterday) },
  },
  select: { nmId: true, date: true, ordersCount: true, buyoutsCount: true,
            buyoutsSumRub: true, buyoutPercent: true },
})
// Settled окно [today-37, today-7] для % выкупа и avgPrice
// Last 7d [today-7, today-1] для baseline
// Seed [today-3, today-1] для T+3 выкупов первых дней плана
```

**DI-паттерн загрузчика** (из `lib/stock-data.ts` строка 1 — принимает `prisma` инстанс):
```typescript
// loadSalesPlanInputs(db: PrismaClient): Promise<SalesPlanInputs>
// loadFactDaily(db: PrismaClient, from: string, to: string): Promise<Map<...>>
// Prisma передаётся через DI — не импортируется глобально (паттерн production-sync)
```

---

### `lib/sales-plan/pdds-feed.ts` (service, request-response)

**Аналог:** `lib/procurement-math.ts` (pure-ядро) + `lib/sales-forecast.ts` (loader-обёртка)

**Паттерн разделения pure/loader** (из `lib/procurement-math.ts` строки 1–6):
```typescript
// Pure расчётный слой — без Prisma/Next.
// Нет зависимостей от Prisma/Next — используется и на сервере, и на клиенте.
```

**Паттерн дат платежей** (из `lib/procurement-math.ts` строки 15–29):
```typescript
export function computeDepositDueDate(createdAt: Date): Date {
  const d = new Date(createdAt)
  d.setDate(d.getDate() + 3)   // +3 калдн. дня
  return d
}
export function computeBalanceDueDate(depositDueDate: Date, leadTimeDays: number): Date {
  const d = new Date(depositDueDate)
  d.setDate(d.getDate() + leadTimeDays)
  return d
}
// Phase 25: использовать ТЕ ЖЕ функции для платежей VirtualPurchase
```

**Структура файла:**
```typescript
// ── PURE-ядро (формулы, экспортируются) ──────────────────────
export function buildVirtualPurchasePayments(vpSnapshot: VpSnapshot): Array<{
  type: "DEPOSIT" | "BALANCE"; dueDate: string; amount: number; currency: string
}>

// ── LOADER-обёртка (async, Prisma-coupled) ────────────────────
export async function getPlannedRevenueSeries(db: PrismaClient, versionId: string): Promise<...>
export async function getPlannedVirtualPayments(db: PrismaClient, versionId: string): Promise<...>
// Здесь: live-сверка статусов VP (CONVERTED→исключить), forward-fill курса валют
```

---

### `app/actions/sales-plan.ts` (service, CRUD) — переработка

**Аналог:** `app/actions/sales-plan.ts` (текущий) + `app/actions/pricing.ts`

**Паттерн заголовка + imports** (из текущего `app/actions/sales-plan.ts` строки 1–12):
```typescript
"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"

type ActionResult = { ok: true } | { ok: false; error: string }
```

**Паттерн setGlobalJson** (из `app/actions/sales-plan.ts` строки 21–32) — **копировать точно**:
```typescript
/** Записать (или удалить, если пусто) глобальную JSON-настройку. */
async function setGlobalJson(key: string, obj: Record<string, unknown>) {
  if (Object.keys(obj).length === 0) {
    await prisma.appSetting.deleteMany({ where: { key } })
  } else {
    const value = JSON.stringify(obj)
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    })
  }
}
```

**Паттерн action с MANAGE** (из `app/actions/pricing.ts` строки 100–118):
```typescript
export async function saveMonthLevels(payload: ...): Promise<ActionResult> {
  await requireSection("SALES", "MANAGE")   // ← все write-actions Phase 25
  const parsed = Schema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: "Невалидные данные" }
  try {
    // ... Prisma операции ...
    revalidatePath("/sales-plan")
    revalidatePath("/sales-plan/products")
    revalidatePath("/sales-plan/purchases")
    return { ok: true }
  } catch (err) {
    console.error("[saveMonthLevels]", err)
    return { ok: false, error: "Не удалось сохранить" }
  }
}
```

**Ключевое отличие от текущего:** все write-actions требуют `MANAGE` (сейчас ошибочно `VIEW`).

**Паттерн revalidatePath:** при любом write — `revalidatePath` трёх роутов: `/sales-plan`, `/sales-plan/products`, `/sales-plan/purchases`. При конвертации VP → добавить `/procurement/purchases`.

---

### `scripts/bootstrap-sales-plan-monthly.ts` (utility, batch)

**Аналог:** `scripts/bootstrap-balance-snapshot.ts` строки 44–60

**Паттерн заголовка и DI** (из `scripts/bootstrap-balance-snapshot.ts` строки 44–60):
```typescript
import { PrismaClient } from "@prisma/client"
// НЕ импортировать из "@/lib/..." — скрипт запускается напрямую через tsx

const prisma = new PrismaClient()

async function main() {
  // ...
  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
```

**Паттерн idempotent-транзакции** (из `scripts/bootstrap-balance-snapshot.ts`):
```typescript
// deleteMany + createMany внутри транзакции — повторный запуск безопасен
await prisma.$transaction(async (tx) => {
  await tx.salesPlanMonthLevel.deleteMany({ where: { month: { in: horizonMonths } } })
  await tx.salesPlanMonthLevel.createMany({ data: rows })
})
```

**Запуск:**
```
npx tsx scripts/bootstrap-sales-plan-monthly.ts
На VPS: set -a; . /etc/zoiten.pro.env; set +a; npx tsx scripts/...
```

---

### `app/(dashboard)/sales-plan/page.tsx` (component, request-response) — переработка

**Аналог:** `app/(dashboard)/sales-plan/page.tsx` (текущий) строки 1–60

**Паттерн RSC-страницы** (строки 1–38):
```typescript
// app/(dashboard)/sales-plan/page.tsx
// Таб «Сводный» — план/факт/ИУ матрица.

import { prisma } from "@/lib/prisma"
import { requireSection, getSectionRole } from "@/lib/rbac"
// ... компоненты ...

export default async function SalesPlanPage({
  searchParams,
}: {
  searchParams: Promise<{
    granularity?: string
    from?: string
    to?: string
    metric?: string
    cumulative?: string
    version?: string
  }>
}) {
  await requireSection("SALES")
  const canManage = (await getSectionRole("SALES")) === "MANAGE"
  const sp = await searchParams
  // ... parse searchParams ...
  // ... load data ...
  return (
    <>
      <SalesPlanTabs />
      <PlanVersionBar ... />
      {/* Amber-баннер при просмотре версии */}
      <PlanFactControls ... />
      <PlanFactSummaryCards ... />
      <PlanFactChart ... />
      <PlanFactMatrix ... />
    </>
  )
}
```

---

### `app/(dashboard)/sales-plan/products/page.tsx` (component, request-response)

**Аналог:** `app/(dashboard)/prices/wb/page.tsx` (RSC с большим payload данных)

**Паттерн:** аналогичен `app/(dashboard)/sales-plan/page.tsx` выше, но загружает `loadSalesPlanInputs(prisma)` и передаёт в `ProductPlanTable`. `?mode=compare|edit` из searchParams — `readOnly = mode !== "edit" || !canManage`.

```typescript
export default async function SalesPlanProductsPage({ searchParams }) {
  await requireSection("SALES")
  const canManage = (await getSectionRole("SALES")) === "MANAGE"
  // ... load SalesPlanInputs + runComputeSalesPlan ...
  // ... load cascade filter options ...
  return (
    <>
      <SalesPlanTabs />
      <PlanVersionBar />
      <ModelParamsBar params={modelParams} readOnly={!canManage} />
      <SalesPlanFilters ... />
      <ProductPlanTable products={planResult.products} readOnly={readOnly} ... />
    </>
  )
}
```

---

### `app/(dashboard)/sales-plan/purchases/page.tsx` (component, request-response)

**Аналог:** `app/(dashboard)/procurement/purchases/page.tsx` строки 1–50

**Паттерн фильтров через searchParams + where:**
```typescript
export default async function SalesPlanPurchasesPage({ searchParams }) {
  await requireSection("SALES")
  const canManage = (await getSectionRole("SALES")) === "MANAGE"
  const sp = await searchParams

  // Фильтр по status: suggested|accepted|dismissed|all (default suggested)
  const statusFilter = sp.status ?? "suggested"

  // Загрузка VP из БД + simulate plan для «Сток до» (первый stockout)
  const virtualPurchases = await prisma.virtualPurchase.findMany({
    where: statusFilter !== "all" ? { status: statusFilter.toUpperCase() } : {},
    include: { product: { ... }, supplier: true },
    orderBy: { orderDate: "asc" },
  })
  return (
    <>
      <SalesPlanTabs />
      <VirtualPurchasesTable rows={...} canManage={canManage} />
    </>
  )
}
```

---

### `components/sales-plan/SalesPlanTabs` (component, request-response)

**Аналог:** `components/credits/CreditsTabs.tsx` — **копировать структуру точно**

```typescript
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/sales-plan",           label: "Сводный" },
  { href: "/sales-plan/products",  label: "Товары" },
  { href: "/sales-plan/purchases", label: "Пора заказывать" }, // + бейдж N
]

export function SalesPlanTabs({ urgentCount }: { urgentCount?: number }) {
  const pathname = usePathname()
  return (
    <div className="flex gap-1 border-b">
      {TABS.map((tab) => {
        const isActive = tab.href === "/sales-plan"
          ? pathname === "/sales-plan"
          : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch={false}    // ← ОБЯЗАТЕЛЬНО: prefetch={false} во всех nav-ссылках
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {/* бейдж urgentCount для «Пора заказывать» */}
          </Link>
        )
      })}
    </div>
  )
}
```

---

### `components/sales-plan/PlanFactControls` (component, request-response)

**Аналог:** `components/credits/ScheduleControls.tsx` — **копировать паттерн URL-state**

```typescript
"use client"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

// Все состояния через URL searchParams (shareable), паттерн из ScheduleControls:
const pushParams = useCallback(
  (updates: Partial<{ granularity: string; from: string; to: string; metric: string }>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) params.set(key, value)
    }
    router.push(`/sales-plan?${params.toString()}`)
  },
  [router, searchParams]
)

// Сегментированный переключатель разбивки (паттерн ScheduleControls строки 91-106):
const GRANULARITY_OPTIONS = [
  { value: "day",       label: "День" },
  { value: "week",      label: "Неделя" },
  { value: "month",     label: "Месяц" },
  { value: "quarter",   label: "Квартал" },
  { value: "halfyear",  label: "Полугодие" },
]
// + пресеты: Тек. неделя / Тек. месяц / 3 мес / Полугодие
// + native <input type="date"> для from/to (паттерн ScheduleControls строки 110-125)
// + native <select> для метрики (НЕ base-ui Select — CLAUDE.md конвенция)
```

---

### `components/sales-plan/PlanFactMatrix` (component, request-response)

**Аналог:** `components/credits/SummaryScheduleTable.tsx` — **главный образец sticky-таблицы с периодными колонками**

**Паттерн sticky-колонок** (из `SummaryScheduleTable.tsx` строки 42–96):
```typescript
// ── Ширины sticky-колонок (px) ────────────────────────────────────────────────
const COL_WIDTHS = { label: 240 } // «Показатель» — единственная sticky-left
const STICKY_BASE = "sticky z-20 bg-background border-b text-xs px-2 h-8 align-middle whitespace-nowrap"
const PERIOD_BASE = "border-b text-xs px-2 h-8 align-middle text-right tabular-nums whitespace-nowrap"

// КРИТИЧНО — сплошной bg на КАЖДОЙ sticky-ячейке (CLAUDE.md):
// bg-background / bg-muted — НЕ bg-muted/40 или bg-muted/60 (прокрутка просвечивает!)
```

**Паттерн raw HTML таблицы** (из `SummaryScheduleTable.tsx` строки 117–160):
```typescript
// НЕ использовать shadcn <Table>/<TableHeader>/<TableRow> в шапке — ломает sticky
// Использовать:
<div className="overflow-auto h-full">
  <table className="w-full border-separate border-spacing-0">
    <thead className="bg-background">
      <tr>  {/* ← raw <tr>, не <TableRow> */}
        <th className={cn(STICKY_BASE, "sticky top-0 z-20 border-r border-b font-semibold")}
            style={{ left: 0, width: COL_WIDTHS.label }}>
          Показатель
        </th>
        {columns.map(col => (
          <th key={col.key} className={cn(PERIOD_BASE, "sticky top-0 z-10 bg-background border-b font-semibold")}>
            {col.label}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {/* строки Plan/Fact/IU/Deviation — обычные <tr><td> */}
    </tbody>
  </table>
</div>
```

---

### `components/sales-plan/ProductPlanTable` (component, CRUD)

**Аналог:** `components/sales-plan/SalesForecastTable.tsx` — **переработка, сохранить паттерн bulk-drafts**

**Паттерн bulk-drafts** (из `SalesForecastTable.tsx` строки 107–200):
```typescript
"use client"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

// drafts: Record<productId, Record<month, string>> — двойной ключ для Phase 25
const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({})

// pendingChangedCount — счётчик изменений для кнопки «Пересчитать план (N)»
const pendingChangedCount = useMemo(() => {
  let cnt = 0
  for (const [pid, months] of Object.entries(drafts)) {
    for (const [month, txt] of Object.entries(months)) {
      const parsed = txt.trim() === "" ? null : parseFloat(txt.replace(",", "."))
      const cur = currentLevels[pid]?.[month] ?? null
      if (parsed !== cur) cnt++
    }
  }
  return cnt
}, [drafts, currentLevels])

// Кнопка «Пересчитать план (N)» → saveMonthLevels + regenerateVirtualPurchases + router.refresh()
function handleRecalculate() {
  startTransition(async () => {
    const result = await saveMonthLevels(draftPayload)
    if (!result.ok) { toast.error(result.error); return }
    await regenerateVirtualPurchases()
    router.refresh()
    setDrafts({})
  })
}

// «Отменить правки» — только локально:
function handleCancel() { setDrafts({}) }
```

**Паттерн sticky-таблицы** (CLAUDE.md + `SummaryScheduleTable.tsx`):
```typescript
// Sticky-left: Фото · SKU · Название · Приходы
// Scroll: Сток · Июл…Дек · Итог ₽
// Итоговая строка: <tr className="sticky bottom-0 bg-muted"> — СПЛОШНОЙ bg-muted
// Формат чисел: fmtRub / fmtAdaptive из SalesForecastTable.tsx — скопировать
```

---

### `components/sales-plan/ProductPlanCell` (component, CRUD)

**Аналог:** `components/cost/CostTable.tsx` (компонент `CostCell`, строки 64–80)

```typescript
// Inline-редактируемая ячейка месяца (mode=edit):
function ProductPlanCell({ productId, month, value, baseline, onChange, readOnly }) {
  const [editing, setEditing] = useState(false)
  const [localVal, setLocalVal] = useState(value ?? "")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  // Клик → показать Input; Enter/Escape → скрыть
  // placeholder = `авто ${baseline.toFixed(1)}` (baseline из funnel)
  // ✕ сбрасывает на null → placeholder снова показывается
  // Подпись: `≈ ${Math.round(effectiveRate * daysInMonth)} шт · ${fmtRub(monthTotal)}₽`
  // Маркер •д если в месяце есть dayOverrides
}
```

---

### `components/sales-plan/ProductPlanDialog` (component, request-response)

**Аналог:** `components/sales-plan/ProductForecastDialog.tsx` + `components/credits/ScheduleControls.tsx`

**Паттерн диалога** (из `ProductForecastDialog.tsx` строки 1–57):
```typescript
"use client"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

// Вкладки: «Дни» / «Параметры» / «График» — native state (не URL, модалка)
// Данные дней — ленивая загрузка через read server action getProductPlanDays(productId, month)
// Realtime «Сток(расч)» при вводе — клиентский вызов pure simulateProductPlan (нет Prisma)

// Кнопка «Сохранить и пересчитать» → saveDayOverrides + regenerateVirtualPurchases + revalidatePath
// (та же пост-обработка что у «Пересчитать план (N)»)
```

---

### `components/sales-plan/PlanVersionBar` (component, request-response)

**Аналог:** `components/credits/ScheduleControls.tsx` (URL-state) + native select (CLAUDE.md)

```typescript
"use client"
// native <select> для списка версий (НЕ base-ui Select — CLAUDE.md конвенция):
<select
  value={currentVersionId ?? "draft"}
  onChange={e => {
    const params = new URLSearchParams(searchParams.toString())
    if (e.target.value === "draft") params.delete("version")
    else params.set("version", e.target.value)
    router.push(`${pathname}?${params.toString()}`)
  }}
>
  <option value="draft">Рабочий план (черновик)</option>
  {versions.map(v => (
    <option key={v.id} value={v.id}>{v.label} — {formatDate(v.createdAt)}</option>
  ))}
</select>

// При просмотре версии — amber-баннер (НЕ toast):
{versionId && (
  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 ...">
    Просмотр версии «{version.label}». Редактирование недоступно.
    <Link href="/sales-plan/products">Вернуться к рабочему плану</Link>
  </div>
)}
```

---

### `components/sales-plan/ModelParamsBar` (component, CRUD)

**Аналог:** `components/prices/wb/GlobalRatesBar.tsx` — паттерн debounced-save глобальных параметров

```typescript
// Collapsible (details/summary) — без сложной анимации
// Параметры: lead time fallback, страховой запас, покрытие VP, транзит, lag WB
// Debounced save (500ms) + router.refresh() после каждого изменения
// readOnly prop — disable inputs при просмотре версии или VIEW-роли
```

---

### `components/sales-plan/VirtualPurchasesTable` (component, CRUD)

**Аналог:** `components/procurement/PurchasesTable.tsx`

**Паттерн таблицы с действиями:**
```typescript
// Sticky raw-HTML таблица (паттерн CLAUDE.md)
// Групповые чекбоксы → bulk-действия (подтвердить/убрать выбранные)
// Кнопка «→ Создать закупку» → router.push("/procurement/purchases?create=1&from-virtual=" + id)
// Сортировка по умолчанию: orderDate ASC (просроченные вверху)
// «Сток до» = первый stockout из simulated plan (передаётся из page.tsx)
```

---

### `components/sales-plan/SalesPlanFilters` (component, request-response)

**Аналог:** `components/sales-plan/SalesForecastFilters.tsx` — **rename + добавить поле**

Паттерн каскадных фильтров (CLAUDE.md «Каскадные фильтры в product-таблицах»):
- Направление → Бренд → Категория → Подкатегория
- Каждый dropdown сужает дочерние опции
- При смене родителя — невалидные дочерние выборы тихо вычищаются из URL
- URL: `?directions=...&brands=...&categories=...&subcategories=...`

---

### `tests/sales-plan-engine.test.ts` (test, transform)

**Аналог:** `tests/pricing-math.test.ts` строки 1–90 — **точно такая же структура**

```typescript
import { describe, it, expect } from "vitest"
import { computeSalesPlan, type SalesPlanInputs } from "@/lib/sales-plan/engine"

// Golden test — 1 товар, 2 месяца, 2 партии прихода
const goldenInputs: SalesPlanInputs = {
  today: "2026-07-01",
  horizonFrom: "2026-07-01",
  horizonTo: "2026-08-31",
  deliveryDays: 3,
  returnDays: 3,
  wbInboundLagDays: 0,
  products: [{
    productId: "test-1",
    // ... sku, name, stockNow: 100, baselineOrdersPerDay: 10 ...
    monthLevels: [
      { month: "2026-07-01", targetOrdersPerDay: 12, priceRub: 5000, buyoutPct: 0.8 },
      { month: "2026-08-01", targetOrdersPerDay: 15, priceRub: 5500, buyoutPct: 0.8 },
    ],
    dayOverrides: { "2026-07-15": 20 },  // day override
    arrivals: [
      { date: "2026-07-20", qty: 500, source: "purchase", refId: "p1", dateSource: "manual" },
      { date: "2026-08-10", qty: 300, source: "virtual", refId: "vp1", dateSource: "manual" },
    ],
    seedOrders: { "2026-06-28": 10, "2026-06-29": 12, "2026-06-30": 11 },
    // ...
  }],
}

describe("computeSalesPlan — golden test", () => {
  const result = computeSalesPlan(goldenInputs)

  it("T+3 выкупы: заказ 2026-07-01 → выкуп 2026-07-04", () => {
    const day = result.products[0].days.find(d => d.date === "2026-07-04")
    expect(day?.buyoutsUnits).toBeCloseTo(12 * 0.8, 2)
  })
  it("day override 2026-07-15 = 20 шт/д", () => { ... })
  it("ступенька: 2026-08-01 ставка = 15 (не 12)", () => { ... })
  it("сток-лимит: orders ≤ stockEnd предыдущего дня", () => { ... })
  it("zero-guard: stockNow = 0 → orders = 0 до прихода", () => { ... })
})
```

---

### `tests/date-buckets.test.ts` (test, transform)

**Аналог:** `tests/pricing-math.test.ts` (структура)

```typescript
import { describe, it, expect } from "vitest"
import { bucketKey, bucketLabel, type Granularity } from "@/lib/date-buckets"

describe("bucketKey", () => {
  it("quarter: 2026-07-15 → '2026-Q3'", () => {
    expect(bucketKey(new Date("2026-07-15"), "quarter")).toBe("2026-Q3")
  })
  it("halfyear: 2026-07-15 → '2026-H2'", () => {
    expect(bucketKey(new Date("2026-07-15"), "halfyear")).toBe("2026-H2")
  })
  it("year: 2026-07-15 → '2026'", () => {
    expect(bucketKey(new Date("2026-07-15"), "year")).toBe("2026")
  })
  // + существующие: day, week, month из loan-math.ts
})
```

---

## Общие паттерны (применять ко всем новым файлам)

---

### Аутентификация + RBAC

**Источник:** `lib/rbac.ts` строки 17–43, `app/actions/sales-plan.ts` строка 39

**Применять:** все server actions, все RSC page.tsx

```typescript
// Read-only операции — в page.tsx:
await requireSection("SALES")
const canManage = (await getSectionRole("SALES")) === "MANAGE"

// Write-операции — в actions/sales-plan.ts:
await requireSection("SALES", "MANAGE")

// Исключение: convertVirtualPurchase требует оба:
await requireSection("SALES", "MANAGE")
await requireSection("PROCUREMENT", "MANAGE")
```

---

### Обработка ошибок в server actions

**Источник:** `app/actions/sales-plan.ts` строки 36–53, `app/actions/pricing.ts` строки 40–55

```typescript
type ActionResult = { ok: true } | { ok: false; error: string }

export async function saveMonthLevels(...): Promise<ActionResult> {
  await requireSection("SALES", "MANAGE")
  const parsed = Schema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: "Невалидные данные" }
  try {
    // ... операции ...
    revalidatePath("/sales-plan")
    revalidatePath("/sales-plan/products")
    revalidatePath("/sales-plan/purchases")
    return { ok: true }
  } catch (err) {
    console.error("[saveMonthLevels]", err)
    return { ok: false, error: "Не удалось сохранить" }
  }
}
```

---

### Sticky-таблицы (критические правила)

**Источник:** CLAUDE.md «Sticky data-таблицы (pattern)» + `components/credits/SummaryScheduleTable.tsx`

```typescript
// 1. НЕ использовать shadcn <Table>/<TableHeader>/<TableRow> в шапке
// 2. Единственный scroll-контейнер:
<div className="overflow-auto h-full">
// 3. border-separate border-spacing-0
<table className="w-full border-separate border-spacing-0">
// 4. СПЛОШНОЙ фон на КАЖДОЙ sticky-ячейке (НЕ bg-muted/40, НЕ bg-muted/60):
className="sticky z-20 bg-background border-b"   // ← bg-background, без /NN
className="sticky bottom-0 bg-muted"             // ← bg-muted, без /NN
// 5. Flex layout для sticky:
<div className="h-full flex flex-col">
  <div className="flex-1 min-h-0">
    {/* таблица */}
  </div>
</div>
```

---

### Форматирование чисел (скопировать из SalesForecastTable.tsx)

**Источник:** `components/sales-plan/SalesForecastTable.tsx` строки 54–79

```typescript
function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

// Адаптивный: целые если |n| >= 2, иначе 1 знак после запятой
function fmtAdaptive(n: number): string {
  return Math.abs(n) >= 2 ? fmtNum(Math.round(n), 0) : fmtNum(n, 1)
}

function fmtRub(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} М`
  }
  if (Math.abs(n) >= 10_000) {
    return `${(n / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} К`
  }
  return fmtNum(Math.round(n))
}

// Отклонение в %: (fact/plan - 1) × 100, с цветом:
// > 0 → text-emerald-600; 0..-5% → text-amber-600; < -5% → text-red-600
```

---

### AppSetting JSON — паттерн чтения/записи

**Источник:** `app/actions/sales-plan.ts` строки 21–32 (setGlobalJson) + `app/actions/pricing.ts` строки 65–98 (getPricingSettings)

```typescript
// Запись:
async function setGlobalJson(key: string, obj: Record<string, unknown>) {
  const value = JSON.stringify(obj)
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
}

// Чтение с парсингом:
const setting = await prisma.appSetting.findUnique({ where: { key: "salesPlan.iuTargets" } })
const iuTargets = setting ? JSON.parse(setting.value) : defaultTargets

// Ключи Phase 25: "salesPlan.horizon", "salesPlan.iuTargets", "salesPlan.iuMetric",
// "salesPlan.activeVersionId", "salesPlan.leadTimes2", "salesPlan.wbInboundLagDays",
// "salesPlan.transitDays", "salesPlan.defaultLeadTimeDays",
// "salesPlan.safetyStockDays", "salesPlan.vpCoverDays"
```

---

### Снапшот immutable без FK (паттерн SalesPlanVersionDay)

**Источник:** `prisma/schema.prisma` строки 1813–1828 (FinanceStockSnapshot)

```prisma
// БЕЗ @relation на Product — переживает hard-purge товара (PROD-10 cron).
// Денормализация sku/name для читаемости после удаления.
model SalesPlanVersionDay {
  id        BigInt   @id @default(autoincrement())  // BIGSERIAL для высокого объёма
  versionId String
  version   SalesPlanVersion @relation(...)
  productId String   // без @relation!
  sku       String   // денормализовано
  name      String   // денормализовано
  // ... поля ...
  @@unique([versionId, productId, date])
  @@index([versionId, date])
}
```

---

### Иерархический порядок товаров

**Источник:** CLAUDE.md «Глобальная иерархическая сортировка товаров»

```typescript
import { PRODUCT_HIERARCHY_ORDER_BY } from "@/lib/product-order"
// В Prisma-запросах:
prisma.product.findMany({ orderBy: PRODUCT_HIERARCHY_ORDER_BY })

// Для in-memory сортировки (plan результаты):
import { compareProductsByHierarchy } from "@/lib/product-order"
planResult.products.sort((a, b) => compareProductsByHierarchy(a.product, b.product))
```

---

### prefetch={false} во всех nav-ссылках

**Источник:** CLAUDE.md «Production performance gotchas»

```typescript
// ОБЯЗАТЕЛЬНО для всех Link в SalesPlanTabs, PlanVersionBar, IncomingBadges:
<Link href="/sales-plan/products" prefetch={false}>...</Link>
// Иначе после revalidatePath Next.js prefetches все ссылки → блокирует HTTP/2 queue
```

---

### WB no-FK паттерн

**Источник:** CLAUDE.md «WB no-FK pattern» + `prisma/schema.prisma` строки 1104–1110

```prisma
// WbCardFunnelDaily.nmId — БЕЗ FK на WbCard.nmId
// SalesPlanVersionDay.productId — БЕЗ @relation на Product
// Аналитические таблицы без FK переживают soft/hard delete
```

---

## Файлы без аналога

| Файл | Роль | Поток данных | Причина |
|------|------|--------------|---------|
| `components/sales-plan/IncomingBadges` | component | request-response | Нет аналога компонента «бейджи приходов с popover»; ближайший по смыслу — tooltips в `StockProductTable`, но структурно отличается. Использовать shadcn Popover + иконки Lucide (Package/Diamond/AlertTriangle). |

---

## Метаданные

**Область поиска аналогов:** `lib/`, `components/`, `app/(dashboard)/`, `app/actions/`, `tests/`, `scripts/`, `prisma/`
**Файлов прочитано:** 22
**Дата составления:** 2026-07-04
