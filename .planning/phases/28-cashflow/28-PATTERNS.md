# Phase 28: ПДДС — план движения денежных средств - Pattern Map

**Mapped:** 2026-07-05
**Files analyzed:** 11 (новых/изменяемых)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/finance-cashflow/types.ts` | utility/types | transform | `lib/sales-plan/types.ts` | exact |
| `lib/finance-cashflow/engine.ts` | service/engine | transform (pure) | `lib/sales-plan/engine.ts` | exact |
| `lib/finance-cashflow/data.ts` | service/loader | CRUD + transform | `lib/sales-plan/data.ts` | exact |
| `tests/finance-cashflow-engine.test.ts` | test | batch | `tests/sales-plan-engine.test.ts` | exact |
| `app/(dashboard)/finance/cashflow/page.tsx` | controller/page | request-response | `app/(dashboard)/finance/balance/page.tsx` | exact |
| `app/actions/cashflow.ts` | controller/action | request-response | `app/actions/pricing.ts` | role-match |
| `components/finance/CashflowAssumptionsBar.tsx` | component | event-driven | `components/prices/GlobalRatesBar.tsx` | exact |
| `components/finance/CashflowMatrix.tsx` | component | transform | `components/sales-plan/PlanFactMatrix.tsx` | exact |
| `components/finance/CashflowChart.tsx` | component | transform | `components/sales-plan/PlanFactChart.tsx` | exact |
| `components/finance/CashflowKpiCards.tsx` | component | transform | `components/finance/BalanceSheetTable.tsx` (KPI-pattern) | role-match |
| `components/finance/CashflowMethodologyDialog.tsx` | component | request-response | `components/finance/BalanceMethodologyDialog.tsx` | exact |

---

## Pattern Assignments

### `lib/finance-cashflow/types.ts` (utility/types, transform)

**Analog:** `lib/sales-plan/types.ts` (lines 1-132)

**Imports pattern** (lines 1-9 из аналога):
```typescript
// lib/finance-cashflow/types.ts
//
// Все публичные интерфейсы движка ПДДС (Phase 28).
// Pure — ноль импортов Prisma / React / Next.
// Входы сериализуемые (string/number/boolean/null, без Date/Decimal)
// — одни и те же объекты используются на сервере (RSC) и на клиенте.
```

**Core pattern — структура типов** (копировать из `lib/sales-plan/types.ts` lines 33-131):
```typescript
// Интерфейс payout-модели (D-1 из CONTEXT — сменная архитектура)
export type PayoutModelType = 'coefficient' | 'per-product'

export interface CashflowInputs {
  horizonFrom: string        // "2026-07-01"
  horizonTo: string          // "2026-12-31"
  startingBalance: number    // банк + касса на horizonFrom (₽)
  gapThresholdRub: number    // порог тревоги (дефолт 0)
  // Плановые выкупы (из getPlannedRevenueSeries)
  revenueSeries: Array<{ date: string; buyoutsRub: number }>
  // WB payout-параметры (D-1, D-2)
  wbPayoutPct: number        // 55 (% net-to-bank от buyoutsRub)
  wbPayoutLagWeeks: number   // 1
  payoutModel: PayoutModelType  // v1 = 'coefficient'
  // Оттоки
  realPurchasePayments: Array<{ date: string; amountRub: number }>  // PurchasePayment PLANNED
  virtualPayments: Array<{ date: string; amountRub: number }>       // getPlannedVirtualPayments
  loanPayments: Array<{ date: string; amountRub: number }>          // principal + interest
  taxPayments: Array<{ date: string; amountRub: number }>           // computeQuarterAccrual per квартал
  opexMonthlyRub: number     // равномерно ÷ дни месяца
  // Факт-ряд остатка (D-4)
  actualBalanceSeries?: Array<{ date: string; balanceRub: number }> // банк+касса по дням
  versionStale?: boolean     // предупреждение в UI
}

export interface CashflowDay {
  date: string
  wbPayoutRub: number      // приток WB (в день выплаты)
  realPurchaseRub: number  // отток реальные закупки
  virtualPurchaseRub: number
  loanRub: number
  taxRub: number
  opexRub: number
  totalInflow: number
  totalOutflow: number
  netFlow: number
  balanceEnd: number       // остаток на конец дня
  isGap: boolean           // balanceEnd < gapThresholdRub
  actualBalance: number | null   // факт-остаток за прошедшие дни, null для будущих (D-4)
}

export interface CashflowBucket {
  key: string              // "2026-07" / "2026-W28" / "2026-07-01"
  label: string
  wbPayoutRub: number
  realPurchaseRub: number
  virtualPurchaseRub: number
  loanRub: number
  taxRub: number
  opexRub: number
  totalInflow: number
  totalOutflow: number
  netFlow: number
  balanceEnd: number       // остаток на конец последнего дня бакета
  hasGap: boolean
}

export interface CashflowResult {
  days: CashflowDay[]
  buckets: CashflowBucket[]   // агрегированные бакеты (granularity-зависимо)
  granularity: Granularity
  // KPI
  startingBalance: number
  minBalance: number
  firstGapDate: string | null
  netTotal: number
  versionStale: boolean       // проброс inputs.versionStale — предупреждение в UI
}
```

---

### `lib/finance-cashflow/engine.ts` (service/engine, pure transform)

**Analog:** `lib/sales-plan/engine.ts` (lines 1-293) + `lib/finance-model/engine.ts:wbCashDay` (lines 66-74)

**Imports pattern** (lines 1-25 из аналога):
```typescript
// lib/finance-cashflow/engine.ts
//
// Pure функции для расчёта ПДДС.
// **Никаких side effects**: детерминированные, без импортов Prisma / React / Next.
// Golden test: tests/finance-cashflow-engine.test.ts
//
// Phase 28

import type {
  CashflowInputs,
  CashflowDay,
  CashflowBucket,
  CashflowResult,
} from "./types"
import type { Granularity } from "@/lib/date-buckets"
import { bucketKey, bucketLabel } from "@/lib/date-buckets"
```

**Core pattern — wbCashDay helper** (извлечь из `lib/finance-model/engine.ts` lines 66-74):
```typescript
/**
 * День прихода денег от WB за выкупы в неделю, содержащую saleDate.
 * reportMonday = понедельник недели выкупа + 7 дней
 * cashDate = reportMonday + wbPayoutLagWeeks × 7
 *
 * Формула из lib/finance-model/engine.ts:wbCashDay() (legacy) — скопировать,
 * legacy-движок целиком НЕ переиспользовать.
 */
function wbCashDay(saleDateIso: string, wbPayoutLagWeeks: number): string {
  const date = new Date(saleDateIso + "T00:00:00Z")
  const dow = date.getUTCDay()
  const daysSinceMonday = (dow + 6) % 7
  const weekMondayMs = date.getTime() - daysSinceMonday * 86_400_000
  const reportMondayMs = weekMondayMs + 7 * 86_400_000
  const cashMs = reportMondayMs + wbPayoutLagWeeks * 7 * 86_400_000
  return new Date(cashMs).toISOString().slice(0, 10)
}
```

**Core pattern — wbPayoutSchedule и computeCashflow** (образец `lib/sales-plan/engine.ts:computeSalesPlan`):
```typescript
/** Агрегирует buyoutsRub по cashDate (понедельники) × wbPayoutPct/100.
 * Дневной ряд выкупов обязателен (не помесячный) — §8 Phase 25. */
function buildWbPayoutSchedule(
  revenueSeries: CashflowInputs["revenueSeries"],
  wbPayoutPct: number,
  wbPayoutLagWeeks: number,
): Map<string, number> {
  const schedule = new Map<string, number>()
  for (const { date, buyoutsRub } of revenueSeries) {
    const cashDate = wbCashDay(date, wbPayoutLagWeeks)
    schedule.set(cashDate, (schedule.get(cashDate) ?? 0) + buyoutsRub * (wbPayoutPct / 100))
  }
  return schedule
}

export function computeCashflow(inputs: CashflowInputs, granularity: Granularity = "month"): CashflowResult {
  // 1. Строим индексы: дата → сумма для каждого типа оттока/притока
  // 2. Идём по [horizonFrom .. horizonTo] день за днём
  // 3. Детектируем isGap: balanceEnd < gapThresholdRub
  // 4. Агрегируем бакеты через bucketKey/bucketLabel
  // 5. Считаем KPI (min, firstGapDate, netTotal)
  // ... (аналогично simulateProductPlan из lib/sales-plan/engine.ts)
}
```

**Gap-детекция** (новое, без аналога — вставить в основной цикл):
```typescript
const isGap = balanceEnd < inputs.gapThresholdRub
if (firstGapDate === null && isGap) firstGapDate = d
```

**Инъекция payout-модели (D-1 — задел под v2)**:
```typescript
// v1: coefficient; v2 подключит per-product функцию без переписывания engine
type PayoutFn = (date: string, buyoutsRub: number) => number
const payoutFn: PayoutFn =
  inputs.payoutModel === 'coefficient'
    ? (_date, rub) => rub * (inputs.wbPayoutPct / 100)
    : /* v2: per-product из pricing-math */ (_date, rub) => rub * (inputs.wbPayoutPct / 100)
```

---

### `lib/finance-cashflow/data.ts` (service/loader, CRUD + transform)

**Analog:** `lib/sales-plan/data.ts` (lines 1-483) + `lib/sales-plan/pdds-feed.ts` (lines 1-346)

**Imports pattern** (lines 1-20 из аналога `lib/sales-plan/data.ts`):
```typescript
// lib/finance-cashflow/data.ts
//
// Prisma-загрузчик для ПДДС (мост между БД и computeCashflow).
// DI-паттерн: принимает `db: PrismaClient`, не импортирует глобальный prisma.
// Ноль импортов React / Next.
//
// Phase 28

import type { PrismaClient } from "@prisma/client"
import { getPlannedRevenueSeries, getPlannedVirtualPayments } from "@/lib/sales-plan/pdds-feed"
import { getRateForDate } from "@/lib/balance-data"
import { computeQuarterAccrual } from "@/lib/balance-math"
import type { CashflowInputs } from "./types"
```

**Core pattern — loadCashflowInputs** (образец `lib/sales-plan/data.ts:loadSalesPlanInputs`):
```typescript
export interface LoadCashflowParams {
  versionId: string
  horizonFrom: string      // "2026-07-01"
  horizonTo: string        // "2026-12-31"
}

export async function loadCashflowInputs(
  db: PrismaClient,
  params: LoadCashflowParams,
): Promise<CashflowInputs> {
  // 1. AppSetting: wbPayoutPct, wbPayoutLagWeeks, opexMonthlyRub, gapThresholdRub
  //    + finance.vatPct, finance.incomeTaxPct (для tax calc)
  // 2. Стартовая позиция: Σ getBankBalanceAsOf (все RUR BankAccount) + касса running balance
  // 3. Притоки: getPlannedRevenueSeries(db, versionId) → revenueSeries
  // 4. Оттоки виртуальные: getPlannedVirtualPayments(db, versionId) → virtualPayments
  //    + versionStale флаг
  // 5. PurchasePayment PLANNED: amountRub ?? amount × getRateForDate(currency, dueDate)
  // 6. LoanPayment: date + principal + interest (оба в ₽)
  // 7. Налоги: computeQuarterAccrual(buyoutsQtr, vatPct, incomeTaxPct) per квартал
  //    → уплата конец квартала (упрощение v1)
  // 8. Факт-ряд (D-4): агрегация BankTransaction + CashEntry по дням
}
```

**PurchasePayment конвертация** (паттерн balance-data B1 / quick-260704-go2):
```typescript
// amountRub приоритет над amount × rate (паттерн D-3 из CONTEXT)
const amountRub = payment.amountRub != null
  ? Number(payment.amountRub)
  : (() => {
      const rate = await getRateForDate(payment.currency, new Date(payment.dueDate + "T00:00:00Z"))
      return Number(payment.amount) * (rate?.rateToRub ?? 1)
    })()
```

**AppSetting upsert pattern** (из `app/actions/pricing.ts` lines 103-139):
```typescript
// Читать настройки: не upsert, только findMany + fallback-дефолт
const settingRows = await db.appSetting.findMany({
  where: { key: { in: CASHFLOW_SETTING_KEYS } },
})
const settingsMap = new Map(settingRows.map((r) => [r.key, r.value]))
const wbPayoutPct = Number(settingsMap.get("finance.cashflow.wbPayoutPct") ?? "55")
```

---

### `tests/finance-cashflow-engine.test.ts` (test, batch)

**Analog:** `tests/sales-plan-engine.test.ts` (lines 1-80+)

**Test structure pattern** (lines 1-43 из аналога):
```typescript
import { describe, it, expect } from "vitest"
import { computeCashflow } from "@/lib/finance-cashflow/engine"
import type { CashflowInputs } from "@/lib/finance-cashflow/types"

const goldenInputs: CashflowInputs = {
  horizonFrom: "2026-07-01",
  horizonTo: "2026-07-14",   // 2 недели для проверки тайминга
  startingBalance: 15_600_000,
  gapThresholdRub: 0,
  revenueSeries: [/* ... 14 дней buyoutsRub */],
  wbPayoutPct: 55,
  wbPayoutLagWeeks: 1,
  payoutModel: "coefficient",
  realPurchasePayments: [],
  virtualPayments: [{ date: "2026-07-05", amountRub: 1_000_000 }],
  loanPayments: [{ date: "2026-07-15", amountRub: 5_200_000 }],
  taxPayments: [],
  opexMonthlyRub: 0,
}

describe("computeCashflow — golden test", () => {
  it("остаток = старт + Σпритоки − Σоттоки (conservation)", () => { ... })
  it("wbPayout выплачивается в понедельник + лаг (тайминг)", () => {
    // выкупы 2026-07-01 → reportMonday = 2026-07-06 (Пн + 7д) → cashDay + 1w = 2026-07-13 (Пн)
    const day = result.days.find((d) => d.date === "2026-07-13")
    expect(day?.wbPayoutRub).toBeGreaterThan(0)
  })
  it("gap-детекция: balanceEnd < 0 → isGap=true", () => { ... })
  it("анти-двойной счёт: CONVERTED VP не дублируется в virtualPayments", () => { ... })
  it("payout-инъекция: кастомная payoutFn применяется", () => { ... })
})
```

---

### `app/(dashboard)/finance/cashflow/page.tsx` (controller/page, request-response)

**Analog:** `app/(dashboard)/finance/balance/page.tsx` (lines 1-115) — текущий файл является заглушкой, заменить полностью.

**Imports pattern** (lines 12-22 из аналога):
```typescript
import { requireSection, getSectionRole } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { FinanceTabs } from "@/components/finance/FinanceTabs"
import { CashflowAssumptionsBar } from "@/components/finance/CashflowAssumptionsBar"
import { CashflowKpiCards } from "@/components/finance/CashflowKpiCards"
import { CashflowChart } from "@/components/finance/CashflowChart"
import { CashflowMatrix } from "@/components/finance/CashflowMatrix"
import { CashflowMethodologyDialog } from "@/components/finance/CashflowMethodologyDialog"
import { loadCashflowInputs } from "@/lib/finance-cashflow/data"
import { computeCashflow } from "@/lib/finance-cashflow/engine"
```

**Auth + metadata pattern** (lines 23-43 из аналога):
```typescript
export const metadata = { title: "Финансы — ОДДС — Zoiten ERP" }
export const dynamic = "force-dynamic"

export default async function FinanceCashflowPage({
  searchParams,
}: {
  searchParams: Promise<{ granularity?: string }>
}) {
  await requireSection("FINANCE")
  const canManage = (await getSectionRole("FINANCE")) === "MANAGE"
  const sp = await searchParams
  // granularity URL searchParam: "day" | "week" | "month" (default "month")
  const granularity = (["day","week","month"].includes(sp.granularity ?? "") ? sp.granularity : "month") as Granularity
```

**Пустое состояние при отсутствии activeVersionId** (новое, нет аналога — добавить перед рендером):
```typescript
  const activeVersionId = settingsMap.get("salesPlan.activeVersionId") ?? null
  if (!activeVersionId) {
    return (
      <div className="h-full flex flex-col gap-4">
        <FinanceTabs />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <p className="text-sm">Нет активной версии плана продаж</p>
            <p className="text-xs mt-1">Зафиксируйте план продаж в разделе «План продаж»</p>
          </div>
        </div>
      </div>
    )
  }
```

**RSC rендер pattern** (lines 94-115 из аналога):
```typescript
  return (
    <div className="h-full flex flex-col gap-4">
      <FinanceTabs />
      <div className="flex items-center gap-2">
        <CashflowMethodologyDialog />
        {canManage && (
          <CashflowAssumptionsBar initialSettings={cashflowSettings} />
        )}
        {/* granularity switcher (URL searchParam) */}
      </div>
      {result.versionStale && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30">
          Виртуальные закупки изменили статус — рекомендуется перефиксация плана продаж.
        </div>
      )}
      <CashflowKpiCards result={cashflowResult} />
      <CashflowChart days={cashflowResult.days} today={todayIso} />
      <CashflowMatrix buckets={cashflowResult.buckets} gapThresholdRub={cashflowSettings.gapThresholdRub} />
    </div>
  )
```

**КРИТИЧЕСКИ ВАЖНО — RSC trap** (из CLAUDE.md + `memory/project_rsc_client_fn_runtime_trap.md`): не вызывать `buttonVariants` или другие client-функции из RSC. Использовать статические классы Tailwind в RSC.

---

### `app/actions/cashflow.ts` (controller/action, request-response)

**Analog:** `app/actions/pricing.ts` (lines 1-139)

**Imports pattern** (lines 16-36 из аналога):
```typescript
"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { revalidatePath } from "next/cache"
```

**RBAC pattern** (lines 103-115 из аналога `app/actions/pricing.ts`):
```typescript
// Read FINANCE — без MANAGE
// Write (допущения) — MANAGE
export async function updateCashflowSetting(
  key: string,
  value: string,
): Promise<ActionResult> {
  try {
    await requireSection("FINANCE", "MANAGE")   // D-8 из CONTEXT
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    return { ok: false, error: (e as Error).message }
  }
  if (!isValidCashflowSettingKey(key)) {
    return { ok: false, error: `Неизвестный ключ: ${key}` }
  }
  // Zod-валидация числовых границ (wbPayoutPct: 0-100, lagWeeks: 0-8, ...)
  const parsed = cashflowSettingSchema.safeParse({ key, value })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: parsed.data.value },   // колонки: key/value/updatedAt (NO createdAt)
    update: { value: parsed.data.value },
  })
  revalidatePath("/finance/cashflow")
  return { ok: true }
}
```

**AppSetting INSERT колонки** (из CLAUDE.md — КРИТИЧЕСКИ: `createdAt` НЕТ в схеме AppSetting):
```typescript
// ПРАВИЛЬНО:
await prisma.appSetting.upsert({
  where: { key },
  create: { key, value: normalized, updatedAt: new Date() },
  update: { value: normalized, updatedAt: new Date() },
})
// НЕПРАВИЛЬНО: { key, value, createdAt: ... } — поля createdAt нет в AppSetting
```

---

### `components/finance/CashflowAssumptionsBar.tsx` (component, event-driven)

**Analog:** `components/prices/GlobalRatesBar.tsx` (lines 1-136) — точный образец.

**Imports pattern** (lines 1-20 из аналога):
```typescript
"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateCashflowSetting } from "@/app/actions/cashflow"
```

**Core debounced-save pattern** (lines 59-103 из аналога):
```typescript
export function CashflowAssumptionsBar({ initialSettings }: CashflowAssumptionsBarProps) {
  const router = useRouter()
  const [values, setValues] = useState<Record<SettingKey, string>>(() => { /* init */ })
  const [isPending, startTransition] = useTransition()
  const timersRef = useRef<Partial<Record<SettingKey, ReturnType<typeof setTimeout>>>>({})

  const handleChange = useCallback((key: SettingKey, newValue: string) => {
    setValues((prev) => ({ ...prev, [key]: newValue }))
    const existingTimer = timersRef.current[key]
    if (existingTimer) clearTimeout(existingTimer)
    timersRef.current[key] = setTimeout(() => {
      startTransition(async () => {
        const result = await updateCashflowSetting(key, newValue)
        if (result.ok) {
          toast.success("Настройка сохранена")
          router.refresh()         // пересчёт RSC-страницы с новыми допущениями
        } else {
          toast.error(result.error || "Не удалось сохранить")
        }
      })
    }, 500)                        // debounce 500ms — паттерн GlobalRatesBar
  }, [router])
```

**Поля AssumptionsBar** (4 допущения из D-9 CONTEXT):
```typescript
const SETTINGS: readonly SettingSpec[] = [
  { key: "finance.cashflow.wbPayoutPct",    label: "Выплата WB",  unit: "%",  min: 0, max: 100, step: 1 },
  { key: "finance.cashflow.wbPayoutLagWeeks", label: "Лаг (нед.)", unit: "нед", min: 0, max: 8, step: 1 },
  { key: "finance.cashflow.opexMonthlyRub", label: "Опекс/мес",  unit: "₽",  min: 0, max: undefined, step: 100_000 },
  { key: "finance.cashflow.gapThresholdRub", label: "Порог тревоги", unit: "₽", min: 0, max: undefined, step: 100_000 },
] as const
```

---

### `components/finance/CashflowMatrix.tsx` (component, transform / sticky table)

**Analog:** `components/sales-plan/PlanFactMatrix.tsx` (lines 1-220+)

**КРИТИЧЕСКИ ВАЖНЫЕ sticky-правила** (CLAUDE.md — повторяющийся баг):

```typescript
// ПРАВИЛЬНО — СПЛОШНОЙ bg-background БЕЗ /NN на sticky-ячейках:
"sticky left-0 z-20 bg-background border-b border-r"
"sticky top-0 z-10 bg-background border-b"
"sticky top-0 left-0 z-30 bg-background border-b border-r"

// НЕПРАВИЛЬНО — /NN прозрачность = прокручиваемый контент просвечивает:
"sticky left-0 bg-background/40"  // ЗАПРЕЩЕНО
"sticky top-0 bg-muted/60"        // ЗАПРЕЩЕНО
```

**HTML table pattern** (lines 160-200 из аналога `PlanFactMatrix.tsx`):
```typescript
// НЕ использовать shadcn <Table>/<TableHeader>/<TableRow> в шапке!
// Использовать:
<div className="rounded-md border bg-card overflow-hidden">
  <div className="overflow-auto">
    <table className="w-full border-separate border-spacing-0">
      <thead className="bg-background">
        <tr>
          {/* НЕ <TableRow> — прямой <tr> */}
          <th className="sticky left-0 top-0 z-30 bg-background border-b border-r text-xs px-3 h-8 align-middle font-semibold whitespace-nowrap text-left"
              style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}>
            Показатель
          </th>
          {buckets.map((b) => (
            <th key={b.key}
                className="sticky top-0 z-10 bg-background border-b border-r border-r-border/40 text-xs px-2 h-8 align-middle font-semibold text-right whitespace-nowrap">
              {b.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {/* TableBody + TableRow от shadcn — здесь hover OK */}
        {/* Строки ПДДС: Стартовый остаток → [Притоки: WB, прочие] → [Оттоки] → Net → Остаток */}
      </tbody>
    </table>
  </div>
</div>
```

**Sticky constants** (из `PlanFactMatrix.tsx` lines 43-51):
```typescript
const LABEL_WIDTH = 240

const STICKY_BASE =
  "sticky left-0 z-20 bg-background border-b border-r text-xs px-3 h-8 align-middle whitespace-nowrap"

const PERIOD_BASE =
  "border-b border-r border-r-border/40 text-xs px-2 h-8 align-middle text-right tabular-nums whitespace-nowrap"
```

**Gap-подсветка** (новое, расширение паттерна PlanFactMatrix — deviationColor):
```typescript
function gapColorClass(isGap: boolean): string {
  return isGap ? "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 font-medium" : ""
}
// Остаток на конец бакета: bg-red-50 при hasGap=true (аналог deviationColor в PlanFactMatrix)
```

---

### `components/finance/CashflowChart.tsx` (component, transform)

**Analog:** `components/sales-plan/PlanFactChart.tsx` (lines 1-202)

**Imports pattern** (lines 1-20 из аналога):
```typescript
"use client"

import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts"
```

**Recharts token pattern** (lines 130-200 из аналога):
```typescript
// Тики: fill: "var(--muted-foreground)" — паттерн из PlanFactChart.tsx
<XAxis
  dataKey="label"
  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
/>
<YAxis
  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
  tickFormatter={fmtTick}
/>

// Линия остатка: stroke="var(--chart-2)" — токены var(--chart-*)
<Line
  dataKey="balanceEnd"
  name="Остаток (прогноз)"
  type="monotone"
  stroke="var(--chart-2)"
  strokeWidth={2}
  dot={false}
/>

// Линия факта (D-4): stroke="var(--chart-1)" до today, dashed после
<Line
  dataKey="actualBalance"
  name="Остаток (факт)"
  type="monotone"
  stroke="var(--chart-1)"
  strokeWidth={2}
  dot={false}
/>

// Zero-line (порог тревоги) — ReferenceLine y=gapThresholdRub
<ReferenceLine
  y={gapThresholdRub}
  stroke="var(--destructive)"
  strokeDasharray="4 4"
  label={{ value: "порог", position: "right", fontSize: 10, fill: "var(--muted-foreground)" }}
/>

// ReferenceLine «сегодня» — аналогично PlanFactChart.tsx lines 184-197
<ReferenceLine
  x={todayLabel}
  stroke="var(--muted-foreground)"
  strokeDasharray="4 4"
  label={{ value: "сегодня", position: "top", fontSize: 10, fill: "var(--muted-foreground)" }}
/>
```

---

### `components/finance/CashflowKpiCards.tsx` (component, transform)

**Analog:** `components/finance/BalanceSheetTable.tsx` (KPI pattern) + паттерн карточек из `/dashboard`

**Core pattern** (KPI-карточки — образец дашборда):
```typescript
"use client"

interface CashflowKpiCardsProps {
  result: CashflowResult
}

export function CashflowKpiCards({ result }: CashflowKpiCardsProps) {
  // 4 KPI из CONTEXT §Specific Ideas:
  // Стартовый остаток · Мин. остаток за горизонт · Дата первого разрыва · Net за горизонт
  const cards = [
    { label: "Стартовый остаток", value: fmtRub(result.startingBalance), color: "default" },
    { label: "Мин. остаток",     value: fmtRub(result.minBalance), color: result.minBalance < 0 ? "destructive" : "default" },
    { label: "Первый разрыв",    value: result.firstGapDate ? fmtDate(result.firstGapDate) : "нет", color: result.firstGapDate ? "destructive" : "emerald" },
    { label: "Net за горизонт",  value: fmtRub(result.netTotal), color: result.netTotal < 0 ? "destructive" : "default" },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">{c.label}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{c.value}</div>
        </div>
      ))}
    </div>
  )
}
```

---

### `components/finance/CashflowMethodologyDialog.tsx` (component, request-response)

**Analog:** `components/finance/BalanceMethodologyDialog.tsx` (lines 1-165) — точный образец.

**Imports + Dialog pattern** (lines 1-49 из аналога):
```typescript
"use client"

import type { ReactNode } from "react"
import { HelpCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export function CashflowMethodologyDialog() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" />
            Как считается
          </Button>
        }
      />
      <DialogContent className="sm:max-w-6xl">   {/* sm:-префикс обязателен для ширины (base-ui gotcha) */}
        <DialogHeader>
          <DialogTitle>Как считается ОДДС</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-sm">
          {/* Структура аналогична BalanceMethodologyDialog: SectionTitle + Item */}
          {/* Источник контента: docs/finance-cashflow-methodology.md */}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

**ВАЖНО — base-ui Dialog gotcha** (из memory/project_baseui_dialog_gotchas.md):
- `sm:max-w-Xxl` с `sm:`-префиксом обязателен — без него ширина перебивается
- `DialogTrigger` использует `render={...}`, НЕ `asChild`
- Данные грузить через `useEffect(open)`, НЕ при открытии через `onOpenChange` (не срабатывает при программном открытии)

---

## Shared Patterns

### RBAC (requireSection)
**Source:** `lib/rbac.ts`, pattern from `app/(dashboard)/finance/balance/page.tsx` lines 42-43
**Apply to:** page.tsx (READ), `app/actions/cashflow.ts` (WRITE)
```typescript
// RSC page:
await requireSection("FINANCE")
const canManage = (await getSectionRole("FINANCE")) === "MANAGE"

// Server actions (допущения):
await requireSection("FINANCE", "MANAGE")
```

### Error Handling (server actions)
**Source:** `app/actions/pricing.ts` lines 48-55 + 110-115
**Apply to:** `app/actions/cashflow.ts`
```typescript
type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

function handleAuthError(e: unknown): { ok: false; error: string } | null {
  if (e instanceof Error) {
    if (e.message === "UNAUTHORIZED") return { ok: false, error: "Не авторизован" }
    if (e.message === "FORBIDDEN") return { ok: false, error: "Нет доступа к разделу «Финансы»" }
  }
  return null
}
```

### AppSetting upsert (key/value, NO createdAt)
**Source:** `app/actions/pricing.ts` lines 126-135 + CLAUDE.md §AppSetting INSERT
**Apply to:** `app/actions/cashflow.ts:updateCashflowSetting`
```typescript
// AppSetting схема имеет только key/value/updatedAt — поля createdAt НЕТ
await prisma.appSetting.upsert({
  where: { key },
  create: { key, value: normalized, updatedAt: new Date() },
  update: { value: normalized, updatedAt: new Date() },
})
revalidatePath("/finance/cashflow")
```

### Debounced AppSetting Save + router.refresh()
**Source:** `components/prices/GlobalRatesBar.tsx` lines 77-103
**Apply to:** `CashflowAssumptionsBar.tsx`
```typescript
// setTimeout(500) + startTransition + router.refresh() после ok
// router.refresh() обязателен — пересчёт RSC с новыми допущениями
```

### Sticky Table Pattern
**Source:** `components/sales-plan/PlanFactMatrix.tsx` lines 160-200 + CLAUDE.md §Sticky data-таблицы
**Apply to:** `CashflowMatrix.tsx`
```
- НЕ shadcn <Table>/<TableHeader>/<TableRow> в шапке
- <table className="border-separate border-spacing-0">
- <thead className="bg-background"> (сплошной фон)
- sticky-ячейки: bg-background БЕЗ /NN прозрачности
- Flex layout для sticky: h-full flex flex-col → flex-1 min-h-0
```

### Recharts Tokens
**Source:** `components/sales-plan/PlanFactChart.tsx` lines 130-200
**Apply to:** `CashflowChart.tsx`
```
- XAxis/YAxis tick: fill: "var(--muted-foreground)"
- Line/Bar: stroke/fill: "var(--chart-1)", "var(--chart-2)", etc.
- CartesianGrid: className="stroke-muted"
- Tooltip: bg-background border shadow-md
```

### Pure Engine Pattern (DI-совместимость)
**Source:** `lib/sales-plan/engine.ts` lines 1-30 + `lib/sales-plan/data.ts` lines 1-20
**Apply to:** `lib/finance-cashflow/engine.ts`, `lib/finance-cashflow/data.ts`
```
- engine.ts: ноль импортов Prisma/React/Next, только типы
- data.ts: принимает `db: PrismaClient` (не импортирует глобальный prisma)
- Оба файла: Date → ISO string на входе (сериализуемые)
```

### RSC force-dynamic + Date helpers
**Source:** `app/(dashboard)/finance/balance/page.tsx` lines 23-35
**Apply to:** `app/(dashboard)/finance/cashflow/page.tsx`
```typescript
export const dynamic = "force-dynamic"

// MSK-сегодня (паттерн balance/page.tsx:31-34):
function mskTodayDateString(): string {
  const ms = Date.now() + 3 * 3600_000
  return new Date(ms).toISOString().split("T")[0]
}
```

### FinanceTabs (уже существует, переиспользовать)
**Source:** `components/finance/FinanceTabs.tsx` — уже включает вкладку «ОДДС» → `/finance/cashflow`
**Apply to:** page.tsx — просто вставить `<FinanceTabs />` первым элементом

---

## No Analog Found

Все файлы фазы 28 имеют близкие аналоги. Два места без прямого аналога:

| File/Pattern | Role | Reason |
|---|---|---|
| `wbCashDay` as inline helper в `engine.ts` | utility | Существует в `lib/finance-model/engine.ts:66-74` — скопировать формулу, НЕ импортировать legacy-движок целиком |
| Gap-детекция (`isGap: boolean`) | logic | Новая для проекта, без прямого аналога; аналог по принципу — `firstStockoutDate` в `lib/sales-plan/engine.ts:272-282` |
| `docs/finance-cashflow-methodology.md` | doc | Образец `docs/finance-balance-methodology.md` (структура и стиль) |

---

## Metadata

**Analog search scope:** `lib/sales-plan/`, `lib/finance-model/`, `lib/balance-data.ts`, `lib/balance-math.ts`, `lib/date-buckets.ts`, `components/prices/`, `components/finance/`, `components/sales-plan/`, `app/(dashboard)/finance/`, `app/actions/pricing.ts`, `tests/`
**Files scanned:** 15 аналоговых файлов прочитаны, 5 найдено через Glob/Grep
**Pattern extraction date:** 2026-07-05
