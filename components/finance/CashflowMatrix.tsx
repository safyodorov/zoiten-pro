"use client"

// components/finance/CashflowMatrix.tsx
// Sticky-матрица потоков ПДДС × бакеты с gap-подсветкой.
// CLAUDE.md: sticky-ячейки — сплошной bg-background или bg-muted, БЕЗ прозрачности (/NN) — повторяющийся баг.
// Образец: components/sales-plan/PlanFactMatrix.tsx
// Phase 28-02.

import type { CashflowBucket } from "@/lib/finance-cashflow/types"

// ── Constants ─────────────────────────────────────────────────────────────────

const LABEL_WIDTH = 240

const STICKY_BASE =
  "sticky left-0 z-20 bg-background border-b border-r text-xs px-3 h-8 align-middle whitespace-nowrap"

const PERIOD_BASE =
  "border-b border-r border-r-border/40 text-xs px-2 h-8 align-middle text-right tabular-nums whitespace-nowrap"

// ── Форматирование ────────────────────────────────────────────────────────────

const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })

function fmtN(n: number): string {
  return fmt.format(n)
}

// ── Gap-подсветка ─────────────────────────────────────────────────────────────

function gapCellClass(hasGap: boolean): string {
  return hasGap
    ? "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 font-medium"
    : ""
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CashflowMatrixProps {
  buckets: CashflowBucket[]
}

// ── Строки матрицы ────────────────────────────────────────────────────────────

interface MatrixRow {
  label: string
  getValue: (b: CashflowBucket) => number
  isSubtotal?: boolean
  isGapRow?: boolean
  indent?: boolean
}

const ROWS: MatrixRow[] = [
  // Притоки
  {
    label: "Выплаты WB",
    getValue: (b) => b.wbPayoutRub,
    indent: true,
  },
  {
    label: "Итого притоки",
    getValue: (b) => b.totalInflow,
    isSubtotal: true,
  },
  // Оттоки
  {
    label: "Закупки (реальные)",
    getValue: (b) => b.realPurchaseRub,
    indent: true,
  },
  {
    label: "Виртуальные закупки",
    getValue: (b) => b.virtualPurchaseRub,
    indent: true,
  },
  {
    label: "Кредиты",
    getValue: (b) => b.loanRub,
    indent: true,
  },
  {
    label: "Налоги",
    getValue: (b) => b.taxRub,
    indent: true,
  },
  {
    label: "Опекс",
    getValue: (b) => b.opexRub,
    indent: true,
  },
  {
    label: "Итого оттоки",
    getValue: (b) => b.totalOutflow,
    isSubtotal: true,
  },
  // Net + остаток
  {
    label: "Net поток",
    getValue: (b) => b.netFlow,
  },
  {
    label: "Остаток на конец",
    getValue: (b) => b.balanceEnd,
    isGapRow: true,
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function CashflowMatrix({ buckets }: CashflowMatrixProps) {
  if (buckets.length === 0) {
    return (
      <div className="rounded-md border bg-card p-4">
        <div className="text-center py-8 text-sm text-muted-foreground">Нет данных</div>
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full border-separate border-spacing-0">
          {/* ── Заголовок (прямой HTML, НЕ shadcn TableHeader/TableRow) ── */}
          <thead className="bg-background">
            <tr>
              <th
                className="sticky left-0 top-0 z-30 bg-background border-b border-r text-xs px-3 h-8 align-middle font-semibold whitespace-nowrap text-left"
                style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
              >
                Показатель
              </th>
              {buckets.map((b) => (
                <th
                  key={b.key}
                  className="sticky top-0 z-10 bg-background border-b border-r border-r-border/40 text-xs px-2 h-8 align-middle font-semibold text-right whitespace-nowrap"
                >
                  {b.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {ROWS.map((row) => {
              const isSubtotal = row.isSubtotal ?? false
              const isGapRow = row.isGapRow ?? false
              const indent = row.indent ?? false

              return (
                <tr key={row.label} className={isSubtotal ? "" : "hover:bg-muted/20 transition-colors"}>
                  {/* Label cell — sticky левая колонка */}
                  <td
                    className={`${STICKY_BASE} ${isSubtotal ? "bg-muted font-semibold text-foreground/80" : "bg-background"}`}
                    style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                  >
                    {indent && (
                      <span className="text-muted-foreground mr-1">└</span>
                    )}
                    {row.label}
                  </td>

                  {/* Cells per бакет */}
                  {buckets.map((b) => {
                    const value = row.getValue(b)
                    const gapClass = isGapRow ? gapCellClass(b.hasGap) : ""
                    const subtotalClass = isSubtotal ? "bg-muted font-semibold" : ""
                    const netClass =
                      !isSubtotal && !isGapRow && row.label === "Net поток"
                        ? value > 0
                          ? "text-emerald-600 dark:text-emerald-500"
                          : value < 0
                          ? "text-red-600 dark:text-red-400"
                          : ""
                        : ""

                    return (
                      <td
                        key={b.key}
                        className={`${PERIOD_BASE} ${gapClass} ${subtotalClass} ${netClass}`}
                      >
                        {fmtN(value)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
