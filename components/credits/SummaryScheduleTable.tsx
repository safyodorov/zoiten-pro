"use client"

// components/credits/SummaryScheduleTable.tsx
// Phase 21-07: Горизонтальная sticky-таблица сводного графика выплат.
// D-13..D-17, U-03, CLAUDE.md «Sticky data-таблицы» + «Иерархия границ» + «mixed rowSpan».
//
// Структура:
// - Левый sticky-блок: Тип строки / Организация / Кредитор / № КД / Сумма / Ставка / Остаток
// - Период-колонки с горизонтальным скроллом
// - Каждый кредит = 2 строки (Тело + %) — БЕЗ rowSpan на левом блоке (CLAUDE.md mixed-rowSpan)
// - Per-org подытоги (2 строки) + Grand total (2 строки)
// - Клик строки кредита → /credits/[id]
// - Деньги: ru-RU + ₽, 0 → «—»

import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import type { SummarySchedule, LoanScheduleRow } from "@/lib/credits-schedule-data"

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  schedule: SummarySchedule
  canManage?: boolean
}

// ── Форматирование ────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  if (n === 0) return "—"
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽"
}

function formatRate(pct: number): string {
  return pct.toLocaleString("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 3,
  }) + " %"
}

// ── Ширины sticky-колонок (px) ────────────────────────────────────────────────

const COL_WIDTHS = {
  type: 72,       // Тело / %
  org: 140,       // Организация
  lender: 110,    // Кредитор
  contract: 150,  // № КД
  amount: 110,    // Сумма
  rate: 72,       // Ставка
  balance: 110,   // Остаток
}

const LEFT_OFFSETS = {
  type: 0,
  org: COL_WIDTHS.type,
  lender: COL_WIDTHS.type + COL_WIDTHS.org,
  contract: COL_WIDTHS.type + COL_WIDTHS.org + COL_WIDTHS.lender,
  amount: COL_WIDTHS.type + COL_WIDTHS.org + COL_WIDTHS.lender + COL_WIDTHS.contract,
  rate: COL_WIDTHS.type + COL_WIDTHS.org + COL_WIDTHS.lender + COL_WIDTHS.contract + COL_WIDTHS.amount,
  balance: COL_WIDTHS.type + COL_WIDTHS.org + COL_WIDTHS.lender + COL_WIDTHS.contract + COL_WIDTHS.amount + COL_WIDTHS.rate,
}

const TOTAL_STICKY_WIDTH =
  COL_WIDTHS.type + COL_WIDTHS.org + COL_WIDTHS.lender + COL_WIDTHS.contract +
  COL_WIDTHS.amount + COL_WIDTHS.rate + COL_WIDTHS.balance

// ── Классы ячеек ──────────────────────────────────────────────────────────────

/** Базовые классы для sticky left ячеек */
const STICKY_BASE = "sticky z-20 bg-background border-b text-xs px-2 h-8 align-middle whitespace-nowrap overflow-hidden text-ellipsis"

/** Sticky ячейка с border-r (граница sticky/periods) */
const STICKY_LAST = cn(STICKY_BASE, "border-r border-r-border")

/** Обычная ячейка (не sticky) */
const PERIOD_BASE = "border-b text-xs px-2 h-8 align-middle text-right tabular-nums whitespace-nowrap"

// ── Компонент периодной ячейки ────────────────────────────────────────────────

function PeriodCell({
  value,
  className,
}: {
  value: number | undefined
  className?: string
}) {
  const amount = value ?? 0
  return (
    <td className={cn(PERIOD_BASE, "border-r border-r-border/30", className)}>
      {amount === 0 ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        formatMoney(amount)
      )}
    </td>
  )
}

// ── Строки кредита (Тело + Проценты) ─────────────────────────────────────────

interface LoanRowsProps {
  row: LoanScheduleRow
  columns: SummarySchedule["columns"]
  onClick: () => void
  isLastInGroup: boolean
}

function LoanRows({ row, columns, onClick, isLastInGroup }: LoanRowsProps) {
  // Строка 1: Тело
  const bodyRowClass = cn(
    "cursor-pointer hover:bg-muted/30 transition-colors group",
  )
  // Строка 2: % (intra-credit boundary — тонкая)
  const interestRowClass = cn(
    "cursor-pointer hover:bg-muted/30 transition-colors",
    isLastInGroup ? "" : "border-b-2"
  )

  return (
    <>
      {/* Строка «Тело» — все данные кредита в левом блоке */}
      <tr className={bodyRowClass} onClick={onClick}>
        {/* Тип */}
        <td
          className={cn(STICKY_BASE, "font-medium text-blue-600 dark:text-blue-400")}
          style={{ left: LEFT_OFFSETS.type, width: COL_WIDTHS.type, minWidth: COL_WIDTHS.type }}
        >
          Тело
        </td>
        {/* Организация */}
        <td
          className={STICKY_BASE}
          style={{ left: LEFT_OFFSETS.org, width: COL_WIDTHS.org, minWidth: COL_WIDTHS.org }}
        >
          <span className="text-muted-foreground">{row.companyName}</span>
        </td>
        {/* Кредитор (U-03) */}
        <td
          className={STICKY_BASE}
          style={{ left: LEFT_OFFSETS.lender, width: COL_WIDTHS.lender, minWidth: COL_WIDTHS.lender }}
        >
          {row.lenderName}
        </td>
        {/* № КД */}
        <td
          className={STICKY_BASE}
          style={{ left: LEFT_OFFSETS.contract, width: COL_WIDTHS.contract, minWidth: COL_WIDTHS.contract }}
        >
          {row.contractNumber}
        </td>
        {/* Сумма */}
        <td
          className={cn(STICKY_BASE, "text-right")}
          style={{ left: LEFT_OFFSETS.amount, width: COL_WIDTHS.amount, minWidth: COL_WIDTHS.amount }}
        >
          {formatMoney(row.amount)}
        </td>
        {/* Ставка */}
        <td
          className={cn(STICKY_BASE, "text-right")}
          style={{ left: LEFT_OFFSETS.rate, width: COL_WIDTHS.rate, minWidth: COL_WIDTHS.rate }}
        >
          {formatRate(row.annualRatePct)}
        </td>
        {/* Остаток — последняя sticky-колонка, border-r полный */}
        <td
          className={cn(STICKY_BASE, "border-r border-r-border text-right")}
          style={{ left: LEFT_OFFSETS.balance, width: COL_WIDTHS.balance, minWidth: COL_WIDTHS.balance }}
        >
          {formatMoney(row.currentBalance)}
        </td>
        {/* Период-ячейки: principal */}
        {columns.map((col) => (
          <PeriodCell key={col.key} value={row.principalByPeriod[col.key]} />
        ))}
      </tr>

      {/* Строка «%» — placeholder «—» в левом блоке (CLAUDE.md: no rowSpan) */}
      <tr
        className={interestRowClass}
        onClick={onClick}
      >
        {/* Тип */}
        <td
          className={cn(STICKY_BASE, "font-medium text-amber-600 dark:text-amber-400 border-b border-b-border/40")}
          style={{ left: LEFT_OFFSETS.type, width: COL_WIDTHS.type, minWidth: COL_WIDTHS.type }}
        >
          %
        </td>
        {/* Организация — placeholder */}
        <td
          className={cn(STICKY_BASE, "border-b border-b-border/40 text-muted-foreground")}
          style={{ left: LEFT_OFFSETS.org, width: COL_WIDTHS.org, minWidth: COL_WIDTHS.org }}
        >
          —
        </td>
        {/* Кредитор — placeholder */}
        <td
          className={cn(STICKY_BASE, "border-b border-b-border/40 text-muted-foreground")}
          style={{ left: LEFT_OFFSETS.lender, width: COL_WIDTHS.lender, minWidth: COL_WIDTHS.lender }}
        >
          —
        </td>
        {/* № КД — placeholder */}
        <td
          className={cn(STICKY_BASE, "border-b border-b-border/40 text-muted-foreground")}
          style={{ left: LEFT_OFFSETS.contract, width: COL_WIDTHS.contract, minWidth: COL_WIDTHS.contract }}
        >
          —
        </td>
        {/* Сумма — placeholder */}
        <td
          className={cn(STICKY_BASE, "border-b border-b-border/40 text-muted-foreground text-right")}
          style={{ left: LEFT_OFFSETS.amount, width: COL_WIDTHS.amount, minWidth: COL_WIDTHS.amount }}
        >
          —
        </td>
        {/* Ставка — placeholder */}
        <td
          className={cn(STICKY_BASE, "border-b border-b-border/40 text-muted-foreground text-right")}
          style={{ left: LEFT_OFFSETS.rate, width: COL_WIDTHS.rate, minWidth: COL_WIDTHS.rate }}
        >
          —
        </td>
        {/* Остаток — последняя sticky, border-r */}
        <td
          className={cn(STICKY_BASE, "border-r border-r-border border-b border-b-border/40 text-muted-foreground text-right")}
          style={{ left: LEFT_OFFSETS.balance, width: COL_WIDTHS.balance, minWidth: COL_WIDTHS.balance }}
        >
          —
        </td>
        {/* Период-ячейки: interest */}
        {columns.map((col) => (
          <PeriodCell
            key={col.key}
            value={row.interestByPeriod[col.key]}
            className="border-b border-b-border/40"
          />
        ))}
      </tr>
    </>
  )
}

// ── Подытоговые строки орг ────────────────────────────────────────────────────

interface OrgSubtotalRowsProps {
  companyName: string
  subtotalPrincipalByPeriod: Record<string, number>
  subtotalInterestByPeriod: Record<string, number>
  columns: SummarySchedule["columns"]
}

function OrgSubtotalRows({
  companyName,
  subtotalPrincipalByPeriod,
  subtotalInterestByPeriod,
  columns,
}: OrgSubtotalRowsProps) {
  const subtotalStickyClass = cn(
    "sticky z-20 bg-muted/40 border-b text-xs px-2 h-8 align-middle whitespace-nowrap overflow-hidden text-ellipsis font-medium"
  )

  return (
    <>
      {/* Подытог тела орг */}
      <tr className="bg-muted/40">
        <td
          className={cn(subtotalStickyClass, "text-blue-700 dark:text-blue-300")}
          style={{ left: LEFT_OFFSETS.type, width: COL_WIDTHS.type, minWidth: COL_WIDTHS.type }}
        >
          Тело
        </td>
        <td
          className={subtotalStickyClass}
          colSpan={5}
          style={{ left: LEFT_OFFSETS.org }}
        >
          {companyName} — итого
        </td>
        <td
          className={cn(subtotalStickyClass, "border-r border-r-border")}
          style={{ left: LEFT_OFFSETS.balance, width: COL_WIDTHS.balance, minWidth: COL_WIDTHS.balance }}
        />
        {columns.map((col) => (
          <td
            key={col.key}
            className={cn(PERIOD_BASE, "border-r border-r-border/30 bg-muted/40 font-medium")}
          >
            {(subtotalPrincipalByPeriod[col.key] ?? 0) === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              formatMoney(subtotalPrincipalByPeriod[col.key])
            )}
          </td>
        ))}
      </tr>

      {/* Подытог процентов орг */}
      <tr className="bg-muted/40">
        <td
          className={cn(subtotalStickyClass, "text-amber-700 dark:text-amber-300 border-b-2 border-b-border")}
          style={{ left: LEFT_OFFSETS.type, width: COL_WIDTHS.type, minWidth: COL_WIDTHS.type }}
        >
          %
        </td>
        <td
          className={cn(subtotalStickyClass, "border-b-2 border-b-border")}
          colSpan={5}
          style={{ left: LEFT_OFFSETS.org }}
        >
          {companyName} — проценты
        </td>
        <td
          className={cn(subtotalStickyClass, "border-r border-r-border border-b-2 border-b-border")}
          style={{ left: LEFT_OFFSETS.balance, width: COL_WIDTHS.balance, minWidth: COL_WIDTHS.balance }}
        />
        {columns.map((col) => (
          <td
            key={col.key}
            className={cn(PERIOD_BASE, "border-r border-r-border/30 bg-muted/40 font-medium border-b-2 border-b-border")}
          >
            {(subtotalInterestByPeriod[col.key] ?? 0) === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              formatMoney(subtotalInterestByPeriod[col.key])
            )}
          </td>
        ))}
      </tr>
    </>
  )
}

// ── Grand Total строки ────────────────────────────────────────────────────────

interface GrandTotalRowsProps {
  grandTotalPrincipalByPeriod: Record<string, number>
  grandTotalInterestByPeriod: Record<string, number>
  columns: SummarySchedule["columns"]
}

function GrandTotalRows({
  grandTotalPrincipalByPeriod,
  grandTotalInterestByPeriod,
  columns,
}: GrandTotalRowsProps) {
  const totalStickyClass = cn(
    "sticky z-20 bg-background border-t-2 border-b text-xs px-2 h-8 align-middle whitespace-nowrap overflow-hidden text-ellipsis font-semibold"
  )

  return (
    <>
      {/* Итого тело */}
      <tr>
        <td
          className={cn(totalStickyClass, "text-blue-700 dark:text-blue-300")}
          style={{ left: LEFT_OFFSETS.type, width: COL_WIDTHS.type, minWidth: COL_WIDTHS.type }}
        >
          Тело
        </td>
        <td
          className={totalStickyClass}
          colSpan={5}
          style={{ left: LEFT_OFFSETS.org }}
        >
          ИТОГО
        </td>
        <td
          className={cn(totalStickyClass, "border-r border-r-border")}
          style={{ left: LEFT_OFFSETS.balance, width: COL_WIDTHS.balance, minWidth: COL_WIDTHS.balance }}
        />
        {columns.map((col) => (
          <td
            key={col.key}
            className={cn(PERIOD_BASE, "border-r border-r-border/30 border-t-2 border-t-border font-semibold")}
          >
            {(grandTotalPrincipalByPeriod[col.key] ?? 0) === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              formatMoney(grandTotalPrincipalByPeriod[col.key])
            )}
          </td>
        ))}
      </tr>

      {/* Итого проценты */}
      <tr>
        <td
          className={cn(totalStickyClass, "text-amber-700 dark:text-amber-300")}
          style={{ left: LEFT_OFFSETS.type, width: COL_WIDTHS.type, minWidth: COL_WIDTHS.type }}
        >
          %
        </td>
        <td
          className={totalStickyClass}
          colSpan={5}
          style={{ left: LEFT_OFFSETS.org }}
        >
          ИТОГО проценты
        </td>
        <td
          className={cn(totalStickyClass, "border-r border-r-border")}
          style={{ left: LEFT_OFFSETS.balance, width: COL_WIDTHS.balance, minWidth: COL_WIDTHS.balance }}
        />
        {columns.map((col) => (
          <td
            key={col.key}
            className={cn(PERIOD_BASE, "border-r border-r-border/30 font-semibold")}
          >
            {(grandTotalInterestByPeriod[col.key] ?? 0) === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              formatMoney(grandTotalInterestByPeriod[col.key])
            )}
          </td>
        ))}
      </tr>
    </>
  )
}

// ── Основной компонент ────────────────────────────────────────────────────────

export function SummaryScheduleTable({ schedule, canManage }: Props) {
  const router = useRouter()

  const { columns, groups, grandTotalPrincipalByPeriod, grandTotalInterestByPeriod } = schedule

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Нет кредитов для отображения. Добавьте кредиты через раздел «Список».
      </div>
    )
  }

  return (
    // Единственный scroll-контейнер (CLAUDE.md sticky pattern)
    <div className="overflow-auto h-full border rounded-md">
      <table
        className="border-separate border-spacing-0"
        style={{ width: "max-content", minWidth: "100%" }}
      >
        {/* ── thead sticky ── */}
        <thead className="bg-background sticky top-0 z-30">
          <tr>
            {/* Тип */}
            <th
              className="sticky z-40 bg-background border-b text-xs font-medium text-muted-foreground px-2 h-8 align-middle text-left whitespace-nowrap"
              style={{ left: LEFT_OFFSETS.type, width: COL_WIDTHS.type, minWidth: COL_WIDTHS.type }}
            >
              Тип
            </th>
            {/* Организация */}
            <th
              className="sticky z-40 bg-background border-b text-xs font-medium text-muted-foreground px-2 h-8 align-middle text-left whitespace-nowrap"
              style={{ left: LEFT_OFFSETS.org, width: COL_WIDTHS.org, minWidth: COL_WIDTHS.org }}
            >
              Организация
            </th>
            {/* Кредитор (U-03: не «Банк») */}
            <th
              className="sticky z-40 bg-background border-b text-xs font-medium text-muted-foreground px-2 h-8 align-middle text-left whitespace-nowrap"
              style={{ left: LEFT_OFFSETS.lender, width: COL_WIDTHS.lender, minWidth: COL_WIDTHS.lender }}
            >
              Кредитор
            </th>
            {/* № КД */}
            <th
              className="sticky z-40 bg-background border-b text-xs font-medium text-muted-foreground px-2 h-8 align-middle text-left whitespace-nowrap"
              style={{ left: LEFT_OFFSETS.contract, width: COL_WIDTHS.contract, minWidth: COL_WIDTHS.contract }}
            >
              № КД
            </th>
            {/* Сумма */}
            <th
              className="sticky z-40 bg-background border-b text-xs font-medium text-muted-foreground px-2 h-8 align-middle text-right whitespace-nowrap"
              style={{ left: LEFT_OFFSETS.amount, width: COL_WIDTHS.amount, minWidth: COL_WIDTHS.amount }}
            >
              Сумма
            </th>
            {/* Ставка */}
            <th
              className="sticky z-40 bg-background border-b text-xs font-medium text-muted-foreground px-2 h-8 align-middle text-right whitespace-nowrap"
              style={{ left: LEFT_OFFSETS.rate, width: COL_WIDTHS.rate, minWidth: COL_WIDTHS.rate }}
            >
              Ставка
            </th>
            {/* Остаток — последняя sticky с border-r */}
            <th
              className="sticky z-40 bg-background border-b border-r border-r-border text-xs font-medium text-muted-foreground px-2 h-8 align-middle text-right whitespace-nowrap"
              style={{ left: LEFT_OFFSETS.balance, width: COL_WIDTHS.balance, minWidth: COL_WIDTHS.balance }}
            >
              Остаток
            </th>
            {/* Период-колонки */}
            {columns.map((col) => (
              <th
                key={col.key}
                className="border-b border-r border-r-border/30 text-xs font-medium text-muted-foreground px-2 h-8 align-middle text-center whitespace-nowrap min-w-[90px]"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        {/* ── tbody ── */}
        <tbody>
          {groups.map((group, groupIdx) => {
            const isLastGroup = groupIdx === groups.length - 1
            return (
              <>
                {/* Строки кредитов группы */}
                {group.loans.map((loan, loanIdx) => {
                  const isLastLoan = loanIdx === group.loans.length - 1
                  return (
                    <LoanRows
                      key={loan.loanId}
                      row={loan}
                      columns={columns}
                      onClick={() => router.push(`/credits/${loan.loanId}`)}
                      isLastInGroup={isLastLoan}
                    />
                  )
                })}

                {/* Per-org подытоги (2 строки) */}
                <OrgSubtotalRows
                  companyName={group.companyName}
                  subtotalPrincipalByPeriod={group.subtotalPrincipalByPeriod}
                  subtotalInterestByPeriod={group.subtotalInterestByPeriod}
                  columns={columns}
                />
              </>
            )
          })}

          {/* Grand total (2 строки) */}
          <GrandTotalRows
            grandTotalPrincipalByPeriod={grandTotalPrincipalByPeriod}
            grandTotalInterestByPeriod={grandTotalInterestByPeriod}
            columns={columns}
          />
        </tbody>
      </table>
    </div>
  )
}
