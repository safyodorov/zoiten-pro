// components/support/stats/ManagerStatsTab.tsx
// Phase 13 SUP-38 — вкладка «По менеджерам» (RSC, D-07 без графиков).
// D-02 — AutoRepliesSummary глобально (не per-manager).

import type { ManagerStatRow } from "@/lib/support-stats"
import { AutoRepliesSummary } from "./AutoRepliesSummary"

function formatDuration(sec: number | null): string {
  if (sec === null) return "—"
  if (sec < 60) return `${sec} сек`
  if (sec < 3600) return `${Math.round(sec / 60)} мин`
  return `${(sec / 3600).toFixed(1)} ч`
}

function approvalPct(approved: number, decided: number): string {
  if (decided === 0) return "—"
  return `${Math.round((approved / decided) * 100)}%`
}

export interface ManagerStatsTabProps {
  managers: ManagerStatRow[]
  autoReplyCount: number
}

export function ManagerStatsTab({ managers, autoReplyCount }: ManagerStatsTabProps) {
  const totalProcessedAll = managers.reduce((s, m) => s + m.totalProcessed, 0)
  const responseTimes = managers
    .map((m) => m.avgResponseTimeSec)
    .filter((s): s is number => s !== null)
  const avgResponseGlobal =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length)
      : null

  const sorted = [...managers].sort((a, b) => b.totalProcessed - a.totalProcessed)

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-semibold">{totalProcessedAll}</div>
          <div className="text-xs text-muted-foreground">Всего обработано</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-semibold">{formatDuration(avgResponseGlobal)}</div>
          <div className="text-xs text-muted-foreground">Ср. время ответа (общее)</div>
        </div>
        <AutoRepliesSummary count={autoReplyCount} />
      </div>

      {/* Managers table */}
      {sorted.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          Нет менеджеров с доступом SUPPORT или нет активности за период
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs">
              <tr>
                <th className="text-left px-3 py-2">Менеджер</th>
                <th className="text-center px-3 py-2">Live</th>
                <th className="text-right px-3 py-2">Всего</th>
                <th className="text-right px-3 py-2">Отзывы</th>
                <th className="text-right px-3 py-2">Вопросы</th>
                <th className="text-right px-3 py-2">Чаты</th>
                <th className="text-right px-3 py-2">Возвраты</th>
                <th className="text-right px-3 py-2">% одобр.</th>
                <th className="text-right px-3 py-2">Обжалования</th>
                <th className="text-right px-3 py-2">Ср. время</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <tr key={m.userId} className="border-t">
                  <td className="px-3 py-2 font-medium">{m.name ?? "—"}</td>
                  <td className="text-center px-3 py-2">
                    {m.isLive && (
                      <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs">
                        сегодня
                      </span>
                    )}
                  </td>
                  <td className="text-right px-3 py-2 font-medium">{m.totalProcessed}</td>
                  <td className="text-right px-3 py-2">{m.feedbacksAnswered}</td>
                  <td className="text-right px-3 py-2">{m.questionsAnswered}</td>
                  <td className="text-right px-3 py-2">{m.chatsAnswered}</td>
                  <td className="text-right px-3 py-2">{m.returnsDecided}</td>
                  <td className="text-right px-3 py-2">
                    {approvalPct(m.returnsApproved, m.returnsDecided)}
                  </td>
                  <td className="text-right px-3 py-2">{m.appealsResolved}</td>
                  <td className="text-right px-3 py-2">
                    {formatDuration(m.avgResponseTimeSec)}
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
