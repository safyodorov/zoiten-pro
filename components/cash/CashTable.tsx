"use client"

// components/cash/CashTable.tsx
// Phase 23 (23-04): Sticky-таблица кассовых операций.
// CLAUDE.md sticky data-table pattern:
//   div overflow-auto h-full → table border-separate border-spacing-0 →
//   thead bg-background → tr (прямой HTML) → th sticky top-0 z-20 bg-background border-b
//   body — shadcn TableBody/TableRow/TableCell
// Блок итогов сверху: приход (зел.) / расход (кр.) / баланс.
// Индикатор усечения: «Показаны первые 1000 из N — уточните фильтры».
// Inline CategoryCell (native select) + CommentCell (input) с canManage gating.

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { TableBody, TableRow, TableCell } from "@/components/ui/table"
import { categorizeCashEntry, updateCashComment } from "@/app/actions/cash"
import { DIRECTION_LABELS } from "@/lib/cash-labels"

// ── Types ──────────────────────────────────────────────────────────────────

/** Сериализуемый плоский объект строки таблицы.
 *  Decimal → number и Date → ISO string выполняются на сервере в page.tsx. */
export interface CashRow {
  id: string
  date: string             // ISO date string YYYY-MM-DD
  direction: string        // "INCOME" | "EXPENSE"
  amount: number           // Decimal → number на сервере
  department: string | null
  categoryId: string | null
  categoryName: string | null
  purpose: string
  responsibleName: string | null
  comment: string | null
}

interface CashTotals {
  income: number
  expense: number
  balance: number
}

interface CashTableProps {
  rows: CashRow[]
  categories: { id: string; name: string }[]
  canManage: boolean
  totals: CashTotals
  totalCount: number
}

// ── CategoryCell ───────────────────────────────────────────────────────────

function CategoryCell({
  entryId,
  currentId,
  currentName,
  categories,
  canManage,
}: {
  entryId: string
  currentId: string | null
  currentName: string | null
  categories: { id: string; name: string }[]
  canManage: boolean
}) {
  const [value, setValue] = useState(currentId ?? "")
  const [, startTransition] = useTransition()

  if (!canManage) {
    return (
      <span className="text-xs">
        {currentName ?? <span className="text-muted-foreground">—</span>}
      </span>
    )
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        const next = e.target.value
        const prev = value
        setValue(next)
        startTransition(async () => {
          const result = await categorizeCashEntry(entryId, next || null)
          if (!result.ok) {
            toast.error(result.error)
            setValue(prev)
          }
        })
      }}
      className="h-7 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">Без категории</option>
      {categories.map((cat) => (
        <option key={cat.id} value={cat.id}>
          {cat.name}
        </option>
      ))}
    </select>
  )
}

// ── CommentCell ──────────────────────────────────────────────────────────────

function CommentCell({
  entryId,
  current,
  canManage,
}: {
  entryId: string
  current: string | null
  canManage: boolean
}) {
  const [value, setValue] = useState(current ?? "")
  const [saved, setSaved] = useState(current ?? "")
  const [, startTransition] = useTransition()

  if (!canManage) {
    return current ? (
      <span className="text-xs" title={current}>
        {current}
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    )
  }

  function commit() {
    if (value === saved) return
    const prev = saved
    setSaved(value)
    startTransition(async () => {
      const result = await updateCashComment(entryId, value)
      if (!result.ok) {
        toast.error(result.error)
        setValue(prev)
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
        if (e.key === "Escape") {
          setValue(saved)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      className="h-7 w-full min-w-[140px] rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
    />
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function CashTable({ rows, categories, canManage, totals, totalCount }: CashTableProps) {
  // ── Блок итогов (приход / расход / баланс) ─────────────────────────────
  const fmt = (n: number) =>
    n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const balancePositive = totals.balance >= 0

  const totalsBlock = (
    <div className="flex items-center gap-6 px-3 py-2 rounded-lg border bg-muted/50 text-sm flex-wrap">
      {/* Индикатор усечения — WARNING 1 */}
      {rows.length === 1000 && totalCount > 1000 && (
        <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">
          Показаны первые 1000 из {totalCount.toLocaleString("ru-RU")} — уточните фильтры
        </span>
      )}
      {/* Итоги */}
      <span className="text-muted-foreground">
        Приход:{" "}
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
          {fmt(totals.income)} ₽
        </span>
      </span>
      <span className="text-muted-foreground">
        Расход:{" "}
        <span className="font-semibold text-red-600 dark:text-red-400">
          {fmt(totals.expense)} ₽
        </span>
      </span>
      <span className="text-muted-foreground">
        Баланс:{" "}
        <span
          className={`font-semibold ${
            balancePositive
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {fmt(totals.balance)} ₽
        </span>
      </span>
    </div>
  )

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-3 h-full">
        {totalsBlock}
        <div className="flex-1 flex items-center justify-center">
          <div className="rounded-lg border bg-muted/20 py-12 px-8 text-center text-sm text-muted-foreground">
            <p className="font-medium mb-1">Нет операций</p>
            <p>Добавьте операцию или импортируйте бюджет.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 h-full">
      {totalsBlock}

      {/* CLAUDE.md sticky data-table: единственный scroll-контейнер, без shadcn Table-wrapper */}
      <div className="overflow-auto flex-1 rounded-lg border">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="bg-background">
            {/* tr прямой HTML — не shadcn TableRow (ломает sticky) */}
            <tr>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                Дата
              </th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">
                Направление
              </th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">
                Сумма
              </th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                Подразделение
              </th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap w-[160px]">
                Категория
              </th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap max-w-[280px]">
                Назначение
              </th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                Ответственный
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

                {/* Направление */}
                <TableCell className="px-3 py-2 text-center whitespace-nowrap">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.direction === "INCOME"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}
                  >
                    {DIRECTION_LABELS[row.direction] ?? row.direction}
                  </span>
                </TableCell>

                {/* Сумма — зелёная INCOME / красная EXPENSE */}
                <TableCell
                  className={`px-3 py-2 text-right whitespace-nowrap tabular-nums font-medium ${
                    row.direction === "INCOME" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {row.amount.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}
                </TableCell>

                {/* Подразделение */}
                <TableCell className="px-3 py-2 whitespace-nowrap text-xs">
                  {row.department ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                {/* Категория — inline CategoryCell (canManage) */}
                <TableCell className="px-3 py-2 whitespace-nowrap">
                  <CategoryCell
                    entryId={row.id}
                    currentId={row.categoryId}
                    currentName={row.categoryName}
                    categories={categories}
                    canManage={canManage}
                  />
                </TableCell>

                {/* Назначение — усечённое с полным текстом через title */}
                <TableCell className="px-3 py-2 max-w-[280px]">
                  <span
                    className="block text-xs whitespace-nowrap overflow-hidden text-ellipsis"
                    title={row.purpose}
                  >
                    {row.purpose}
                  </span>
                </TableCell>

                {/* Ответственный */}
                <TableCell className="px-3 py-2 whitespace-nowrap text-xs">
                  {row.responsibleName ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                {/* Комментарий — редактируемый */}
                <TableCell className="px-3 py-2 min-w-[160px]">
                  <CommentCell entryId={row.id} current={row.comment} canManage={canManage} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
    </div>
  )
}
