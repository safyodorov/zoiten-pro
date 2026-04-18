// app/(dashboard)/support/stats/search-params.ts
// Phase 13 — pure helper для парсинга searchParams страницы /support/stats.
// Вынесен из page.tsx потому что Next.js 15 запрещает произвольные экспорты из Page.

import { z } from "zod"

export const statsSearchParamsSchema = z.object({
  tab: z.enum(["products", "managers"]).default("products"),
  period: z.enum(["7d", "30d", "quarter", "custom"]).default("30d"),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  nmId: z.coerce.number().int().positive().optional(),
  userId: z.string().optional(),
})

export type StatsSearchParams = z.infer<typeof statsSearchParamsSchema>

export function parseStatsSearchParams(
  sp: Record<string, string | string[] | undefined>
): StatsSearchParams {
  const flat: Record<string, string | undefined> = {}
  for (const k of Object.keys(sp)) {
    const v = sp[k]
    flat[k] = Array.isArray(v) ? v[0] : v
  }
  // Try parse; on failure — per-field salvage (дропаем только невалидные поля).
  const full = statsSearchParamsSchema.safeParse(flat)
  if (full.success) return full.data

  const salvage: Record<string, string | undefined> = { ...flat }
  const invalidFields = new Set(full.error.issues.map((i) => String(i.path[0])))
  for (const f of invalidFields) delete salvage[f]
  return statsSearchParamsSchema.parse(salvage)
}
