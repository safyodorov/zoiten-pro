// app/(dashboard)/support/stats/page.tsx
// Phase 13 — RSC страница /support/stats (SUP-36/37/38).
// RBAC D-10: SUPPORT VIEW (не MANAGE — read-only).
// D-05 квартал = календарный (hint в UI PeriodFilter).
// D-07 только числа и таблицы (без recharts/графиков).

import { z } from "zod"
import { requireSection } from "@/lib/rbac"
import { getPeriod } from "@/lib/date-periods"
import {
  listProductsWithStats,
  listManagersWithStats,
  getTopReturnReasons,
  getAutoReplyCount,
} from "@/lib/support-stats"
import { StatsTabs } from "@/components/support/stats/StatsTabs"
import { PeriodFilter } from "@/components/support/stats/PeriodFilter"
import { ProductStatsTab } from "@/components/support/stats/ProductStatsTab"
import { ManagerStatsTab } from "@/components/support/stats/ManagerStatsTab"

export const dynamic = "force-dynamic"

const searchParamsSchema = z.object({
  tab: z.enum(["products", "managers"]).default("products"),
  period: z.enum(["7d", "30d", "quarter", "custom"]).default("30d"),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  nmId: z.coerce.number().int().positive().optional(),
  userId: z.string().optional(),
})

export type StatsSearchParams = z.infer<typeof searchParamsSchema>

export function parseStatsSearchParams(
  sp: Record<string, string | string[] | undefined>
): StatsSearchParams {
  const flat: Record<string, string | undefined> = {}
  for (const k of Object.keys(sp)) {
    const v = sp[k]
    flat[k] = Array.isArray(v) ? v[0] : v
  }
  // Try parse; on failure fall back per-field (strip невалидных значений).
  const full = searchParamsSchema.safeParse(flat)
  if (full.success) return full.data

  // Per-field salvage: дропаем невалидные, оставляем остальные.
  const salvage: Record<string, string | undefined> = { ...flat }
  const invalidFields = new Set(full.error.issues.map((i) => String(i.path[0])))
  for (const f of invalidFields) delete salvage[f]
  return searchParamsSchema.parse(salvage)
}

export default async function SupportStatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSection("SUPPORT")
  const sp = await searchParams
  const parsed = parseStatsSearchParams(sp)

  const period =
    parsed.period === "custom" && parsed.dateFrom && parsed.dateTo
      ? getPeriod("custom", { from: parsed.dateFrom, to: parsed.dateTo })
      : getPeriod(parsed.period === "custom" ? "30d" : parsed.period)

  let tabContent: React.ReactNode
  if (parsed.tab === "products") {
    const [products, topReasons] = await Promise.all([
      listProductsWithStats(
        period.dateFrom,
        period.dateTo,
        parsed.nmId ? { nmIds: [parsed.nmId] } : undefined
      ),
      getTopReturnReasons(period.dateFrom, period.dateTo, 10),
    ])
    tabContent = <ProductStatsTab products={products} topReasons={topReasons} />
  } else {
    const [managers, autoReplyCount] = await Promise.all([
      listManagersWithStats(period.dateFrom, period.dateTo),
      getAutoReplyCount(period.dateFrom, period.dateTo),
    ])
    tabContent = <ManagerStatsTab managers={managers} autoReplyCount={autoReplyCount} />
  }

  return (
    <div className="space-y-6">
      <PeriodFilter
        currentPeriod={parsed.period}
        currentFrom={parsed.dateFrom}
        currentTo={parsed.dateTo}
      />
      <StatsTabs currentTab={parsed.tab} />
      {tabContent}
    </div>
  )
}
