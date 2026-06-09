// components/credits/LoanScheduleTable.tsx
// Таблица графика погашения кредита с computed остатком per row (D-18 п.2).
// Sticky thead — паттерн CLAUDE.md «Sticky data-таблицы».
// Phase 21 — Plan 06.
import type { ScheduleRow } from "@/lib/loan-math"

interface Props {
  schedule: ScheduleRow[]
}

/** Форматирование даты ДД.ММ.ГГГГ (UTC компоненты). */
function formatDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0")
  const month = String(d.getUTCMonth() + 1).padStart(2, "0")
  const year = d.getUTCFullYear()
  return `${day}.${month}.${year}`
}

/** Форматирование денег ru-RU + ₽. */
function formatRub(v: number): string {
  return (
    v.toLocaleString("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + " ₽"
  )
}

export function LoanScheduleTable({ schedule }: Props) {
  // Итоговые суммы
  let totalPrincipal = 0
  let totalInterest = 0
  for (const row of schedule) {
    totalPrincipal += row.principal
    totalInterest += row.interest
  }

  if (schedule.length === 0) {
    return (
      <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
        График платежей отсутствует
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-card">
      <div className="px-3 py-2 border-b">
        <span className="text-sm font-medium">График погашения</span>
        <span className="text-xs text-muted-foreground ml-2">
          {schedule.length} строк
        </span>
      </div>

      {/* Sticky таблица — паттерн CLAUDE.md: overflow-auto единственный scroll-контейнер */}
      <div className="overflow-auto max-h-[480px]">
        <table className="w-full border-separate border-spacing-0">
          {/* thead bg-background + raw <tr> + sticky <th> — НЕ shadcn TableHeader/TableRow */}
          <thead className="bg-card">
            <tr>
              <th className="sticky top-0 z-20 bg-card border-b px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                Дата
              </th>
              <th className="sticky top-0 z-20 bg-card border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">
                Тело
              </th>
              <th className="sticky top-0 z-20 bg-card border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">
                Проценты
              </th>
              <th className="sticky top-0 z-20 bg-card border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">
                Остаток осн. долга
              </th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((row, i) => (
              <tr
                key={i}
                className="hover:bg-muted/40 transition-colors"
              >
                <td className="border-b border-border/40 px-3 py-1.5 text-sm whitespace-nowrap">
                  {formatDate(row.date)}
                </td>
                <td className="border-b border-border/40 px-3 py-1.5 text-sm text-right tabular-nums whitespace-nowrap">
                  {row.principal > 0 ? formatRub(row.principal) : "—"}
                </td>
                <td className="border-b border-border/40 px-3 py-1.5 text-sm text-right tabular-nums whitespace-nowrap">
                  {row.interest > 0 ? formatRub(row.interest) : "0 ₽"}
                </td>
                <td className="border-b border-border/40 px-3 py-1.5 text-sm text-right tabular-nums whitespace-nowrap font-medium">
                  {formatRub(Math.max(0, row.balance))}
                </td>
              </tr>
            ))}

            {/* Итоговая строка */}
            <tr className="bg-muted/30 font-semibold">
              <td className="px-3 py-2 text-sm text-muted-foreground">Итого</td>
              <td className="px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap">
                {formatRub(totalPrincipal)}
              </td>
              <td className="px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap">
                {formatRub(totalInterest)}
              </td>
              <td className="px-3 py-2 text-sm text-right tabular-nums text-muted-foreground">
                —
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
