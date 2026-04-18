// components/support/stats/ProductStatsTab.tsx
// Phase 13 SUP-37 — вкладка «По товарам» (RSC, D-07 без графиков).
// Composes TopReturnReasonsList (D-03 глобально).

import type { ProductStatRow } from "@/lib/support-stats"
import { TopReturnReasonsList } from "./TopReturnReasonsList"

function formatDuration(sec: number | null): string {
  if (sec === null) return "—"
  if (sec < 60) return `${sec} сек`
  if (sec < 3600) return `${Math.round(sec / 60)} мин`
  return `${(sec / 3600).toFixed(1)} ч`
}

export interface ProductStatsTabProps {
  products: ProductStatRow[]
  topReasons: Array<{ reason: string; count: number }>
}

export function ProductStatsTab({ products, topReasons }: ProductStatsTabProps) {
  const totalFeedbacks = products.reduce((s, p) => s + p.feedbacksTotal, 0)
  const totalReturns = products.reduce((s, p) => s + p.returnsTotal, 0)
  const ratings = products
    .map((p) => p.avgRating)
    .filter((r): r is number => r !== null)
  const avgRatingOverall =
    ratings.length > 0
      ? (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1)
      : "—"

  const sorted = [...products].sort((a, b) => b.feedbacksTotal - a.feedbacksTotal)

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-semibold">{totalFeedbacks}</div>
          <div className="text-xs text-muted-foreground">Всего отзывов</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-semibold">{totalReturns}</div>
          <div className="text-xs text-muted-foreground">Всего возвратов</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-semibold">{avgRatingOverall}</div>
          <div className="text-xs text-muted-foreground">Средний рейтинг</div>
        </div>
      </div>

      <TopReturnReasonsList reasons={topReasons} />

      {/* Products table */}
      {sorted.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          Нет данных за выбранный период
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs">
              <tr>
                <th className="text-left px-3 py-2 w-12">Фото</th>
                <th className="text-left px-3 py-2">Товар</th>
                <th className="text-right px-3 py-2">Отзывов</th>
                <th className="text-right px-3 py-2">Рейтинг</th>
                <th className="text-right px-3 py-2">% отв.</th>
                <th className="text-right px-3 py-2">Вопросов</th>
                <th className="text-right px-3 py-2">Возвраты</th>
                <th className="text-right px-3 py-2">Одобрено</th>
                <th className="text-right px-3 py-2">Отклонено</th>
                <th className="text-right px-3 py-2">Ср. время</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.nmId} className="border-t">
                  <td className="px-3 py-2">
                    {p.photoUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={p.photoUrl}
                        alt={p.name ?? String(p.nmId)}
                        className="h-10 w-10 object-cover rounded"
                      />
                    ) : (
                      <div className="h-10 w-10 bg-muted rounded" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-xs truncate max-w-xs">
                      {p.name ?? "Карточка не найдена"}
                    </div>
                    <div className="text-xs text-muted-foreground">{p.nmId}</div>
                  </td>
                  <td className="text-right px-3 py-2">{p.feedbacksTotal}</td>
                  <td className="text-right px-3 py-2">
                    {p.avgRating !== null ? p.avgRating.toFixed(1) : "—"}
                  </td>
                  <td className="text-right px-3 py-2">
                    {p.feedbacksAnsweredPct !== null ? `${p.feedbacksAnsweredPct}%` : "—"}
                  </td>
                  <td className="text-right px-3 py-2">{p.questionsTotal}</td>
                  <td className="text-right px-3 py-2">{p.returnsTotal}</td>
                  <td className="text-right px-3 py-2">{p.returnsApproved}</td>
                  <td className="text-right px-3 py-2">{p.returnsRejected}</td>
                  <td className="text-right px-3 py-2">
                    {formatDuration(p.avgResponseTimeSec)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
