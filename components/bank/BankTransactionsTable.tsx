"use client"

// components/bank/BankTransactionsTable.tsx
// Phase 22 (22-05): Sticky-таблица банковских операций + inline CategoryCell.
// CLAUDE.md sticky data-table pattern:
//   div overflow-auto h-full → table border-separate border-spacing-0 →
//   thead bg-background → tr (прямой HTML) → th sticky top-0 z-20 bg-background border-b
//   body — shadcn TableBody/TableRow/TableCell (OK)

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { TableBody, TableRow, TableCell } from "@/components/ui/table"
import { categorizeTx, updateTxComment } from "@/app/actions/bank"
import { CATEGORY_LABELS, CATEGORY_OPTIONS, DIRECTION_LABELS } from "@/lib/bank-labels"

// ── Types ──────────────────────────────────────────────────────────────────

/** Сериализуемый плоский объект строки таблицы.
 *  Decimal → number и Date → ISO string выполняются на сервере в page.tsx. */
export interface BankTxRow {
  id: string
  date: string          // ISO date string (YYYY-MM-DD)
  direction: string     // "DEBIT" | "CREDIT"
  amount: number        // Decimal → number на сервере
  currency: string
  docNumber: string | null
  operationType: string | null
  purpose: string
  counterpartyName: string | null
  counterpartyInn: string | null
  category: string      // TxCategory value
  comment: string | null // ручной комментарий (управленческий учёт)
  companyName: string
  accountNumber: string
  bankName: string
}

interface BankTransactionsTableProps {
  rows: BankTxRow[]
  canManage: boolean
}

// ── CategoryCell ───────────────────────────────────────────────────────────

function CategoryCell({
  txId,
  current,
  canManage,
}: {
  txId: string
  current: string
  canManage: boolean
}) {
  const [value, setValue] = useState(current)
  const [, startTransition] = useTransition()

  if (!canManage) {
    return <span className="text-xs">{CATEGORY_LABELS[value] ?? value}</span>
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        const next = e.target.value
        const prev = value
        setValue(next)
        startTransition(async () => {
          const result = await categorizeTx(txId, next)
          if (!result.ok) {
            toast.error(result.error)
            setValue(prev) // откат при ошибке
          }
        })
      }}
      className="h-7 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
    >
      {CATEGORY_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

// ── CommentCell ──────────────────────────────────────────────────────────────

function CommentCell({
  txId,
  current,
  canManage,
}: {
  txId: string
  current: string | null
  canManage: boolean
}) {
  const [value, setValue] = useState(current ?? "")
  const [saved, setSaved] = useState(current ?? "")
  const [, startTransition] = useTransition()

  if (!canManage) {
    return current ? (
      <span className="text-xs" title={current}>{current}</span>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    )
  }

  function commit() {
    if (value === saved) return // нет изменений
    const prev = saved
    setSaved(value)
    startTransition(async () => {
      const result = await updateTxComment(txId, value)
      if (!result.ok) {
        toast.error(result.error)
        setValue(prev) // откат
        setSaved(prev)
      }
    })
  }

  return (
    <input
      type="text"
      value={value}
      placeholder="—"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        if (e.key === "Escape") { setValue(saved); (e.target as HTMLInputElement).blur() }
      }}
      className="h-7 w-full min-w-[140px] rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
    />
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function BankTransactionsTable({ rows, canManage }: BankTransactionsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="rounded-lg border bg-muted/20 py-12 px-8 text-center text-sm text-muted-foreground">
          <p className="font-medium mb-1">Нет операций</p>
          <p>Загрузите выписку через кнопку «Загрузить выписку»</p>
        </div>
      </div>
    )
  }

  return (
    // CLAUDE.md sticky data-table: единственный scroll-контейнер, без shadcn Table-wrapper
    <div className="overflow-auto h-full rounded-lg border">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="bg-background">
          {/* tr прямой HTML — не shadcn TableRow (ломает sticky) */}
          <tr>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Дата
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Компания
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Счёт
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Банк
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Направление
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Сумма
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Валюта
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              № doc
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap w-[110px]">
              Контрагент
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap max-w-[240px]">
              Назначение
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Категория
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Комментарий
            </th>
          </tr>
        </thead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="hover:bg-muted/40">
              {/* Дата */}
              <TableCell className="px-3 py-2 whitespace-nowrap tabular-nums text-xs">
                {new Date(row.date).toLocaleDateString("ru-RU")}
              </TableCell>

              {/* Компания */}
              <TableCell className="px-3 py-2 whitespace-nowrap text-xs">
                {row.companyName}
              </TableCell>

              {/* Счёт — моно шрифт */}
              <TableCell className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                {row.accountNumber}
              </TableCell>

              {/* Банк */}
              <TableCell className="px-3 py-2 whitespace-nowrap text-xs">
                {row.bankName}
              </TableCell>

              {/* Направление */}
              <TableCell className="px-3 py-2 text-center whitespace-nowrap">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    row.direction === "CREDIT"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  }`}
                >
                  {DIRECTION_LABELS[row.direction] ?? row.direction}
                </span>
              </TableCell>

              {/* Сумма — красная/зелёная в зависимости от направления */}
              <TableCell
                className={`px-3 py-2 text-right whitespace-nowrap tabular-nums font-medium ${
                  row.direction === "CREDIT" ? "text-green-600" : "text-red-600"
                }`}
              >
                {row.amount.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}
              </TableCell>

              {/* Валюта */}
              <TableCell className="px-3 py-2 text-center whitespace-nowrap text-xs text-muted-foreground">
                {row.currency}
              </TableCell>

              {/* № документа */}
              <TableCell className="px-3 py-2 whitespace-nowrap font-mono text-xs text-muted-foreground">
                {row.docNumber ?? "—"}
              </TableCell>

              {/* Контрагент: имя + ИНН — узкая колонка, усечение + полный текст в title */}
              <TableCell className="px-3 py-2 w-[110px] max-w-[110px]">
                <div
                  className="text-xs overflow-hidden text-ellipsis whitespace-nowrap"
                  title={`${row.counterpartyName ?? "—"}${row.counterpartyInn ? ` · ИНН ${row.counterpartyInn}` : ""}`}
                >
                  {row.counterpartyName ?? "—"}
                </div>
                {row.counterpartyInn && (
                  <div className="text-[10px] text-muted-foreground font-mono overflow-hidden text-ellipsis whitespace-nowrap">
                    {row.counterpartyInn}
                  </div>
                )}
              </TableCell>

              {/* Назначение — усечённое с полным текстом через title */}
              <TableCell className="px-3 py-2 max-w-[240px]">
                <span
                  className="block text-xs whitespace-nowrap overflow-hidden text-ellipsis"
                  title={row.purpose}
                >
                  {row.purpose}
                </span>
              </TableCell>

              {/* Категория — inline-select (canManage) или текст */}
              <TableCell className="px-3 py-2 whitespace-nowrap">
                <CategoryCell txId={row.id} current={row.category} canManage={canManage} />
              </TableCell>

              {/* Комментарий — редактируемый текст (управленческий учёт) */}
              <TableCell className="px-3 py-2 min-w-[160px]">
                <CommentCell txId={row.id} current={row.comment} canManage={canManage} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </table>
    </div>
  )
}
