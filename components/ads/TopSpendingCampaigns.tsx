// Phase 19+ 2026-05-20: Top spending campaigns table для /ads/wb.

import type { TopCampaign } from "@/lib/wb-advert-spend-data"

const STATUS_LABELS: Record<number, { label: string; className: string }> = {
  4: { label: "Готова", className: "bg-muted text-muted-foreground" },
  7: { label: "Завершена", className: "bg-muted text-muted-foreground" },
  8: { label: "Отменена", className: "bg-muted text-muted-foreground" },
  9: { label: "Активна", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  11: { label: "На паузе", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
}

const TYPE_LABELS: Record<number, string> = {
  4: "Каталог",
  5: "Карточка",
  6: "Поиск",
  7: "Рекомендации",
  8: "Авто (deprecated)",
  9: "Аукцион",
}

function formatRub(v: number): string {
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 0 })
}

interface Props {
  rows: TopCampaign[]
  periodDays: number
}

export function TopSpendingCampaigns({ rows, periodDays }: Props) {
  return (
    <div className="px-4 py-2">
      <div className="rounded-md border bg-card">
        <div className="flex items-baseline justify-between px-3 py-2 border-b">
          <div className="text-sm font-medium">Топ-10 кампаний по расходу</div>
          <div className="text-xs text-muted-foreground">за {periodDays} дн.</div>
        </div>
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            Нет данных. Запустите backfill или дождитесь следующего cron.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="text-left font-medium text-xs text-muted-foreground px-3 py-2 border-b">
                    #
                  </th>
                  <th className="text-left font-medium text-xs text-muted-foreground px-3 py-2 border-b">
                    Кампания
                  </th>
                  <th className="text-left font-medium text-xs text-muted-foreground px-3 py-2 border-b">
                    Тип
                  </th>
                  <th className="text-left font-medium text-xs text-muted-foreground px-3 py-2 border-b">
                    Статус
                  </th>
                  <th className="text-right font-medium text-xs text-muted-foreground px-3 py-2 border-b">
                    Списаний
                  </th>
                  <th className="text-right font-medium text-xs text-muted-foreground px-3 py-2 border-b">
                    Расход
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const statusInfo = STATUS_LABELS[r.advertStatus] ?? {
                    label: `Статус ${r.advertStatus}`,
                    className: "bg-muted text-muted-foreground",
                  }
                  return (
                    <tr key={r.advertId} className="hover:bg-muted/30">
                      <td className="px-3 py-2 border-b text-xs text-muted-foreground tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2 border-b">
                        <div className="text-foreground truncate max-w-[420px]">
                          {r.campName}
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          ID {r.advertId}
                        </div>
                      </td>
                      <td className="px-3 py-2 border-b text-xs text-muted-foreground">
                        {TYPE_LABELS[r.advertType] ?? `Тип ${r.advertType}`}
                      </td>
                      <td className="px-3 py-2 border-b">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${statusInfo.className}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b text-right tabular-nums text-muted-foreground">
                        {r.count.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-3 py-2 border-b text-right tabular-nums font-mono font-medium">
                        {formatRub(r.spend)}
                        <span className="text-xs text-muted-foreground font-normal"> ₽</span>
                      </td>
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
