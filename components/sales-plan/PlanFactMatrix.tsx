"use client"

// components/sales-plan/PlanFactMatrix.tsx
// Sticky-матрица план/факт/ИУ по бакетам.
// Паттерн SummaryScheduleTable.tsx — raw HTML thead, border-separate, СПЛОШНОЙ bg.
// CLAUDE.md: bg-background/bg-muted БЕЗ /NN на sticky-ячейках.
// Phase 25-06.

import { useState } from "react"
import { cn } from "@/lib/utils"
import type { PlanFactBucket } from "@/lib/sales-plan/plan-fact"
import { bucketLabel } from "@/lib/date-buckets"
import type { Granularity } from "@/lib/date-buckets"

// ── Форматирование ────────────────────────────────────────────────────────────

function fmtM(v: number | null | undefined): string {
  if (v == null) return "—"
  if (v === 0) return "—"
  const abs = Math.abs(v)
  if (abs >= 1_000_000) {
    return `${(abs / 1_000_000).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} М`
  }
  if (abs >= 1_000) {
    return `${(abs / 1_000).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} К`
  }
  return abs.toLocaleString("ru-RU", { maximumFractionDigits: 0 })
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—"
  const sign = v > 0 ? "+" : ""
  return `${sign}${v.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

function fmtDev(v: number | null | undefined): string {
  if (v == null) return "—"
  if (v === 0) return "0"
  const sign = v > 0 ? "+" : "−"
  return `${sign}${fmtM(Math.abs(v))}`
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LABEL_WIDTH = 240

const STICKY_BASE =
  "sticky left-0 z-20 bg-background border-b border-r text-xs px-3 h-8 align-middle whitespace-nowrap"

const PERIOD_BASE =
  "border-b border-r border-r-border/40 text-xs px-2 h-8 align-middle text-right tabular-nums whitespace-nowrap"

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PlanFactMatrixProps {
  buckets: PlanFactBucket[]
  total: PlanFactBucket
  granularity: Granularity
  /** Скрывать ли ИУ-строки (при активных фильтрах) */
  hideIuRows?: boolean
  /** Есть ли активные каскадные фильтры */
  hasFilters?: boolean
  /** Метрика (для footer) */
  metric?: string
}

// ── Cell formatters ────────────────────────────────────────────────────────────

interface CellProps {
  value: number | null | undefined
  formatter?: (v: number | null | undefined) => string
  colorFn?: (v: number) => string
  className?: string
  title?: string
}

function Cell({ value, formatter = fmtM, colorFn, className, title }: CellProps) {
  const text = formatter(value)
  const colorClass = value != null && colorFn ? colorFn(value) : ""
  const isEmpty = text === "—"
  return (
    <td
      className={cn(PERIOD_BASE, colorClass, className)}
      title={title}
    >
      {isEmpty ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        text
      )}
    </td>
  )
}

function deviationColor(v: number): string {
  if (v > 0) return "text-emerald-600 dark:text-emerald-500 font-medium"
  if (v < 0) return "text-destructive font-medium"
  return ""
}

function iuGapColor(v: number): string {
  if (v >= 0) return "text-emerald-600 dark:text-emerald-500"
  if (v < 0) return "text-destructive"
  return ""
}

// ── Collapsible group ─────────────────────────────────────────────────────────

function CollapsibleRow({
  label,
  colCount,
  children,
}: {
  label: string
  colCount: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setOpen((o) => !o)}>
        <td
          className={cn(STICKY_BASE, "font-medium text-muted-foreground bg-muted")}
          style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
        >
          {open ? "▾" : "▸"} {label}
        </td>
        <td colSpan={colCount} className="border-b border-r text-xs px-2 h-8 bg-muted text-muted-foreground">
          {!open && <span className="text-xs text-muted-foreground">нажмите для раскрытия</span>}
        </td>
      </tr>
      {open && children}
    </>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlanFactMatrix({
  buckets,
  total,
  granularity,
  hideIuRows,
  hasFilters,
  metric = "buyouts-rub",
}: PlanFactMatrixProps) {
  const columns = [...buckets, total]
  const colCount = columns.length

  const iuNote = hasFilters && !hideIuRows
    ? "ИУ сравнивается только с полным фактом компании"
    : null

  // Footer-метка в зависимости от метрики
  const footerNote =
    metric === "buyouts-rub" || metric === "buyouts-units"
      ? "Факт включает 73 артикула WB без привязки к товарам (~2,4 М ₽/мес по выкупам, 3,2%)"
      : "Факт включает 73 артикула WB без привязки к товарам (~13,2 М ₽/мес по заказам, ~6%)"

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      {/* Notice при активных фильтрах */}
      {iuNote && (
        <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-b text-xs text-amber-700 dark:text-amber-400">
          {iuNote}
        </div>
      )}

      <div className="overflow-auto">
        <table className="w-full border-separate border-spacing-0">
          {/* ── Заголовок ── */}
          <thead className="bg-background">
            <tr>
              <th
                className={cn(
                  "sticky left-0 top-0 z-30 bg-background border-b border-r text-xs px-3 h-8 align-middle font-semibold whitespace-nowrap text-left",
                )}
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
                  {b.isCurrentBucket && (
                    <span className="ml-0.5 text-muted-foreground font-normal">*</span>
                  )}
                </th>
              ))}
              {/* Итог */}
              <th className="sticky top-0 z-10 bg-muted border-b border-r text-xs px-2 h-8 align-middle font-semibold text-right whitespace-nowrap">
                Итог
              </th>
            </tr>
          </thead>

          <tbody>
            {/* ── Раздел: План / Факт / Отклонение ── */}
            <tr>
              <td
                className={cn(STICKY_BASE, "bg-muted font-semibold text-foreground/70")}
                style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                colSpan={1}
              >
                Наш план / Факт
              </td>
              {columns.map((b, i) => (
                <td key={b.key}
                  className={cn("border-b text-xs h-8 bg-muted", i < colCount - 1 ? "border-r border-r-border/40" : "border-r")}
                />
              ))}
            </tr>

            {/* План ₽ */}
            <tr className="hover:bg-muted/20 transition-colors">
              <td
                className={cn(STICKY_BASE, "bg-background")}
                style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
              >
                <span className="text-muted-foreground">Метрика · </span>
                <span>
                  {metric === "buyouts-rub" ? "Выкупы ₽" :
                   metric === "buyouts-units" ? "Выкупы шт" :
                   metric === "orders-rub" ? "Заказы ₽" : "Заказы шт"}
                </span>
              </td>
              {columns.map((b) => (
                <Cell key={b.key} value={b.planRub} title={b.isCurrentBucket ? "pro-rata (только дни ≤ вчера)" : undefined} />
              ))}
            </tr>

            {/* Факт ₽ */}
            <tr className="hover:bg-muted/20 transition-colors">
              <td
                className={cn(STICKY_BASE, "bg-background pl-6")}
                style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
              >
                <span className="text-muted-foreground mr-1">└</span>
                Факт
              </td>
              {columns.map((b) => (
                <Cell
                  key={b.key}
                  value={b.factRub}
                  className={b.hasUnsettledDays ? "opacity-60" : undefined}
                />
              ))}
            </tr>

            {/* Отклонение ₽ */}
            <tr className="hover:bg-muted/20 transition-colors">
              <td
                className={cn(STICKY_BASE, "bg-background pl-6")}
                style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
              >
                <span className="text-muted-foreground mr-1">└</span>
                Отклонение
              </td>
              {columns.map((b) => (
                <td
                  key={b.key}
                  className={cn(
                    PERIOD_BASE,
                    b.deviationRub > 0 ? "text-emerald-600 dark:text-emerald-500 font-medium" :
                    b.deviationRub < 0 ? "text-destructive font-medium" : "text-muted-foreground",
                  )}
                >
                  {b.factRub === 0 ? <span className="text-muted-foreground">—</span> : fmtDev(b.deviationRub)}
                </td>
              ))}
            </tr>

            {/* Отклонение % */}
            <tr className="hover:bg-muted/20 transition-colors">
              <td
                className={cn(STICKY_BASE, "bg-background pl-6")}
                style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
              >
                <span className="text-muted-foreground mr-1">└</span>
                Отклонение, %
              </td>
              {columns.map((b) => (
                <td
                  key={b.key}
                  className={cn(
                    PERIOD_BASE,
                    b.deviationPct != null && b.deviationPct > 0 ? "text-emerald-600 dark:text-emerald-500" :
                    b.deviationPct != null && b.deviationPct < 0 ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {b.factRub === 0 ? <span className="text-muted-foreground">—</span> : fmtPct(b.deviationPct)}
                </td>
              ))}
            </tr>

            {/* ── Раздел: ИУ ── */}
            {!hideIuRows && (
              <>
                <tr>
                  <td
                    className={cn(STICKY_BASE, "bg-muted font-semibold text-foreground/70")}
                    style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                  >
                    ИУ (438,1 М ₽ на H2)
                  </td>
                  {columns.map((b, i) => (
                    <td key={b.key}
                      className={cn("border-b text-xs h-8 bg-muted", i < colCount - 1 ? "border-r border-r-border/40" : "border-r")}
                    />
                  ))}
                </tr>

                {/* ИУ-план ₽ */}
                <tr className="hover:bg-muted/20 transition-colors">
                  <td
                    className={cn(STICKY_BASE, "bg-background")}
                    style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                  >
                    ИУ-план, ₽
                  </td>
                  {columns.map((b) => (
                    <Cell key={b.key} value={b.iuRub} />
                  ))}
                </tr>

                {/* Факт − ИУ ₽ */}
                <tr className="hover:bg-muted/20 transition-colors">
                  <td
                    className={cn(STICKY_BASE, "bg-background pl-6")}
                    style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                  >
                    <span className="text-muted-foreground mr-1">└</span>
                    Факт − ИУ
                  </td>
                  {columns.map((b) => (
                    <td
                      key={b.key}
                      className={cn(
                        PERIOD_BASE,
                        b.factRub === 0 ? "text-muted-foreground" :
                        b.factVsIuRub >= 0 ? "text-emerald-600 dark:text-emerald-500 font-medium" :
                        "text-destructive font-medium",
                      )}
                    >
                      {b.factRub === 0 ? <span className="text-muted-foreground">—</span> : fmtDev(b.factVsIuRub)}
                    </td>
                  ))}
                </tr>

                {/* Выполнение ИУ % */}
                <tr className="hover:bg-muted/20 transition-colors">
                  <td
                    className={cn(STICKY_BASE, "bg-background pl-6")}
                    style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                  >
                    <span className="text-muted-foreground mr-1">└</span>
                    Выполнение ИУ, %
                  </td>
                  {columns.map((b) => (
                    <td
                      key={b.key}
                      className={cn(
                        PERIOD_BASE,
                        b.iuFulfillmentPct == null || b.factRub === 0 ? "text-muted-foreground" :
                        b.iuFulfillmentPct >= 100 ? "text-emerald-600 dark:text-emerald-500" :
                        b.iuFulfillmentPct >= 90 ? "text-amber-600 dark:text-amber-500" :
                        "text-destructive",
                      )}
                    >
                      {b.factRub === 0 ? <span className="text-muted-foreground">—</span> : fmtPct(b.iuFulfillmentPct ? b.iuFulfillmentPct - 100 : null)}
                    </td>
                  ))}
                </tr>

                {/* ИУ нарастающим: отклонение */}
                <tr className="hover:bg-muted/20 transition-colors">
                  <td
                    className={cn(STICKY_BASE, "bg-background pl-6")}
                    style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                  >
                    <span className="text-muted-foreground mr-1">└</span>
                    ИУ нараст.: откл.
                  </td>
                  {columns.map((b) => (
                    <td
                      key={b.key}
                      className={cn(
                        PERIOD_BASE,
                        b.factRub === 0 ? "text-muted-foreground" :
                        b.factVsIuRub >= 0 ? "text-emerald-600 dark:text-emerald-500" :
                        "text-destructive",
                      )}
                    >
                      {b.factRub === 0 ? <span className="text-muted-foreground">—</span> : fmtDev(b.factVsIuRub)}
                    </td>
                  ))}
                </tr>
              </>
            )}

            {/* ── Раздел: «Вне плана» ── */}
            {columns.some((b) => b.unplannedRub != null) && (
              <CollapsibleRow label="▾ Вне плана (73 арт. без привязки)" colCount={colCount}>
                <tr className="hover:bg-muted/20 transition-colors">
                  <td
                    className={cn(STICKY_BASE, "bg-background pl-6")}
                    style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                  >
                    <span className="text-muted-foreground mr-1">└</span>
                    Факт «Вне плана»
                  </td>
                  {columns.map((b) => (
                    <Cell
                      key={b.key}
                      value={b.unplannedRub}
                      className="text-muted-foreground"
                    />
                  ))}
                </tr>
              </CollapsibleRow>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer — метрико-зависимый footnote + текущий бакет */}
      <div className="px-3 py-2 border-t text-[11px] text-muted-foreground space-y-0.5">
        <div>* текущий бакет: факт по вчера, план pro-rata (полный план периода — в tooltip)</div>
        <div>{footerNote} — <a href="/cards/wb" className="underline hover:text-foreground">настроить → /cards/wb</a></div>
      </div>
    </div>
  )
}
