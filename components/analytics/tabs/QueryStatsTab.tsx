"use client"

// components/analytics/tabs/QueryStatsTab.tsx
// Phase 30 (ANL-10) — вкладка «Статистика запросов»: тепловая карта «запрос × день» на CSS-grid
// (БЕЗ сторонней библиотеки — RESEARCH). Цвет ячейки = глубина органической позиции
// (топ→зелёный, глубоко→красный); день отсутствия (organic===null) → прочерк (не входит в среднюю).
// Слева у запроса — бейдж средней позиции (avgPosition из движка, игнор прочерков).
// 5 запросов по умолчанию + вертикальный скролл внутри строки. Sticky-заголовок дат — сплошной bg-background.
import type { SkuPayload, QueryPositionSeries } from "@/lib/analytics/types"

// Цвет по глубине позиции: 1..≈50. Малое → зелёный, большое → красный. null → нейтральный прочерк.
function posCellStyle(organic: number | null): { bg: string; label: string } {
  if (organic === null || organic <= 0) return { bg: "transparent", label: "" }
  const clamped = Math.min(Math.max(organic, 1), 50)
  // hue 130 (зелёный) → 0 (красный) линейно по глубине
  const hue = 130 - ((clamped - 1) / 49) * 130
  return { bg: `hsl(${hue} 65% 45%)`, label: String(organic) }
}

function avgBadge(avg: number | null): { bg: string; text: string } {
  if (avg === null) return { bg: "var(--muted)", text: "—" }
  const { bg } = posCellStyle(Math.round(avg))
  return { bg, text: avg.toFixed(1) }
}

export function QueryStatsTab({ skus }: { skus: SkuPayload[] }) {
  return (
    <div className="overflow-auto h-full">
      <div className="flex flex-col divide-y">
        {skus.map((s) => (
          <SkuQueryBlock key={s.nmId} sku={s} />
        ))}
      </div>
    </div>
  )
}

function SkuQueryBlock({ sku }: { sku: SkuPayload }) {
  const queries: QueryPositionSeries[] = sku.queries
  // Ось дат — из первого запроса (единая шкала периода).
  const days = queries[0]?.days.map((d) => d.dt) ?? []

  return (
    <div className="flex gap-3 p-3">
      {/* Левая колонка — товар */}
      <div className="w-[200px] shrink-0">
        <div className="font-medium text-sm truncate">{sku.name || sku.nmId}</div>
        <div className="text-xs text-muted-foreground">{sku.brand} · {sku.nmId}</div>
        <div className="text-xs text-muted-foreground mt-1">{queries.length} запросов</div>
      </div>

      {/* Тепловая карта: 5 запросов видно, остальные скроллом */}
      <div className="flex-1 min-w-0">
        {queries.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4">Нет данных по запросам (MPSTATS)</div>
        ) : (
          <div className="max-h-[220px] overflow-y-auto overflow-x-auto">
            <table className="border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-20 bg-background p-1 text-left min-w-[180px]">Запрос</th>
                  <th className="sticky top-0 z-10 bg-background p-1 text-center min-w-[52px]">Ср. поз.</th>
                  {days.map((dt) => (
                    <th key={dt} className="sticky top-0 z-10 bg-background p-1 text-center min-w-[26px] font-normal text-muted-foreground">
                      {dt.slice(8)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queries.map((q) => {
                  const badge = avgBadge(q.avgPosition)
                  return (
                    <tr key={q.query}>
                      <td className="sticky left-0 z-10 bg-background p-1 truncate max-w-[180px]" title={`${q.query} · частотность ${q.frequency}`}>
                        {q.query}
                      </td>
                      <td className="p-0.5 text-center">
                        <span
                          className="inline-block rounded px-1.5 py-0.5 text-white tabular-nums"
                          style={{ backgroundColor: badge.bg }}
                        >
                          {badge.text}
                        </span>
                      </td>
                      {q.days.map((d) => {
                        const cell = posCellStyle(d.organic)
                        return (
                          <td key={d.dt} className="p-px text-center">
                            <div
                              className="h-5 w-full rounded-sm flex items-center justify-center text-[9px] text-white"
                              style={{ backgroundColor: cell.bg }}
                              title={`${q.query} · ${d.dt} · ${d.organic === null ? "нет в органике" : `поз. ${d.organic}`}${d.ad ? ` · реклама ${d.ad.position}` : ""}`}
                            >
                              {cell.label}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
