// components/bank/BankDashboard.tsx
// Phase 22 (22-06): Дашборд-сводка банковского раздела.
// Агрегаты вычисляются на сервере в page.tsx и передаются как props.
// Показывает: остатки per-компания (по валютам) + приход/расход за 7 и 30 дней,
// дату последнего обновления. Кнопка «развернуть счета» — разбивка банк/счёт под компанией.
"use client"

import { useState } from "react"
import { ChevronRight, ChevronDown } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────

export interface AccountRow {
  bankName: string
  accountNumber: string
  currency: string
  closingBalance: number | null
  income7d: number
  expense7d: number
  income30d: number
  expense30d: number
}

export interface CompanyRow {
  companyName: string
  /** Сумма closingBalance по счетам компании, разбитая по валютам */
  balancesByCurrency: Partial<Record<string, number>>
  income7d: number
  expense7d: number
  income30d: number
  expense30d: number
  /** Разбивка по счетам (банк + номер + суммы) — для «развернуть счета» */
  accounts: AccountRow[]
}

export interface BankDashboardData {
  /** Дата последнего обновления (MAX balanceDate или MAX tx.date) */
  anchorDate: string | null
  /** Компании с остатками, потоками и разбивкой по счетам */
  companies: CompanyRow[]
  /** Суммарный остаток по всем компаниям, разбитый по валютам */
  grandTotalByCurrency: Partial<Record<string, number>>
  /** Суммарный приход/расход (RUR) по всем компаниям, только внешние контрагенты */
  grandFlow: {
    income7d: number
    expense7d: number
    income30d: number
    expense30d: number
  }
}

// ── Форматирование ────────────────────────────────────────────────────────

const NUM_FMT = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })

function fmtRub(v: number): string {
  return NUM_FMT.format(v) + " ₽"
}
function fmtCny(v: number): string {
  return NUM_FMT.format(v) + " ¥"
}
function fmtByCurrency(currency: string, v: number): string {
  return currency === "CNY" ? fmtCny(v) : fmtRub(v)
}

// ── Component ──────────────────────────────────────────────────────────────

export function BankDashboard({ data }: { data: BankDashboardData }) {
  const { anchorDate, companies, grandTotalByCurrency, grandFlow } = data
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // Показываемые валюты — RUR первой, CNY если есть
  const allCurrencies = Object.keys(grandTotalByCurrency).sort((a, b) => {
    if (a === "RUR") return -1
    if (b === "RUR") return 1
    return a.localeCompare(b)
  })

  const hasRur = allCurrencies.includes("RUR")
  const hasCny = allCurrencies.some((c) => c === "CNY")

  return (
    <div className="flex flex-col gap-2">
      {/* ── Строка заголовка с датой ─────────────────────────────────────── */}
      {anchorDate && (
        <div className="text-xs text-muted-foreground">
          Обновлено:{" "}
          <span className="font-medium text-foreground">
            {new Date(anchorDate).toLocaleDateString("ru-RU", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              timeZone: "Europe/Moscow",
            })}
          </span>
        </div>
      )}

      {/* ── Карточки-сводки ──────────────────────────────────────────────── */}
      <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
        {hasRur && (
          <div className="rounded-md border bg-card px-2.5 py-1.5">
            <div className="text-[11px] leading-tight text-muted-foreground">Общий остаток</div>
            <div className="text-base font-semibold tabular-nums mt-0.5 text-orange-600 dark:text-orange-400">
              {fmtRub(grandTotalByCurrency["RUR"] ?? 0)}
            </div>
            <div className="text-[10px] text-muted-foreground">RUR по всем компаниям</div>
          </div>
        )}
        {hasCny && (
          <div className="rounded-md border bg-card px-2.5 py-1.5">
            <div className="text-[11px] leading-tight text-muted-foreground">Остаток CNY</div>
            <div className="text-base font-semibold tabular-nums mt-0.5 text-orange-600 dark:text-orange-400">
              {fmtCny(grandTotalByCurrency["CNY"] ?? 0)}
            </div>
            <div className="text-[10px] text-muted-foreground">CNY по всем компаниям</div>
          </div>
        )}
        {hasRur && (
          <div className="rounded-md border bg-card px-2.5 py-1.5">
            <div className="text-[11px] leading-tight text-muted-foreground">Приход 30 дней</div>
            <div className="text-base font-semibold tabular-nums mt-0.5 text-emerald-600 dark:text-emerald-400">
              {fmtRub(grandFlow.income30d)}
            </div>
            <div className="text-[10px] text-muted-foreground">внешние, RUR</div>
          </div>
        )}
        {hasRur && (
          <div className="rounded-md border bg-card px-2.5 py-1.5">
            <div className="text-[11px] leading-tight text-muted-foreground">Расход 30 дней</div>
            <div className="text-base font-semibold tabular-nums mt-0.5 text-red-600 dark:text-red-400">
              {fmtRub(grandFlow.expense30d)}
            </div>
            <div className="text-[10px] text-muted-foreground">внешние, RUR</div>
          </div>
        )}
      </div>

      {/* ── Таблица per-компания (с разворачиванием счетов) ───────────────── */}
      {companies.length > 0 && (
        <div className="overflow-auto rounded-md border">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead className="bg-muted">
              <tr>
                <th className="sticky top-0 bg-muted border-b px-3 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap">
                  Компания / счёт
                </th>
                {allCurrencies.map((cur) => (
                  <th key={cur} className="sticky top-0 bg-muted border-b px-3 py-1.5 text-right font-semibold text-muted-foreground whitespace-nowrap">
                    Остаток {cur}
                  </th>
                ))}
                <th className="sticky top-0 bg-muted border-b px-3 py-1.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Приход 7д</th>
                <th className="sticky top-0 bg-muted border-b px-3 py-1.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Расход 7д</th>
                <th className="sticky top-0 bg-muted border-b px-3 py-1.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Приход 30д</th>
                <th className="sticky top-0 bg-muted border-b px-3 py-1.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Расход 30д</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const isOpen = expanded.has(c.companyName)
                return (
                  <FragmentRows
                    key={c.companyName}
                    company={c}
                    isOpen={isOpen}
                    onToggle={() => toggle(c.companyName)}
                    allCurrencies={allCurrencies}
                  />
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-semibold">
                <td className="px-3 py-1.5 whitespace-nowrap">Итого</td>
                {allCurrencies.map((cur) => (
                  <td key={cur} className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-orange-600 dark:text-orange-400">
                    {grandTotalByCurrency[cur] !== undefined ? fmtByCurrency(cur, grandTotalByCurrency[cur]!) : "—"}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                  {grandFlow.income7d > 0 ? fmtRub(grandFlow.income7d) : "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-red-600 dark:text-red-400">
                  {grandFlow.expense7d > 0 ? fmtRub(grandFlow.expense7d) : "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                  {grandFlow.income30d > 0 ? fmtRub(grandFlow.income30d) : "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-red-600 dark:text-red-400">
                  {grandFlow.expense30d > 0 ? fmtRub(grandFlow.expense30d) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// Строка компании + (если развёрнуто) под-строки по счетам
function FragmentRows({
  company,
  isOpen,
  onToggle,
  allCurrencies,
}: {
  company: CompanyRow
  isOpen: boolean
  onToggle: () => void
  allCurrencies: string[]
}) {
  return (
    <>
      <tr className="hover:bg-muted/40 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-1.5 border-b border-border/40 whitespace-nowrap font-medium">
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              aria-label={isOpen ? "Свернуть счета" : "Развернуть счета"}
              className="text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onToggle() }}
            >
              {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
            {company.companyName}
            <span className="text-[10px] text-muted-foreground font-normal">
              ({company.accounts.length})
            </span>
          </span>
        </td>
        {allCurrencies.map((cur) => (
          <td key={cur} className="px-3 py-1.5 border-b border-border/40 text-right tabular-nums whitespace-nowrap">
            {company.balancesByCurrency[cur] !== undefined ? fmtByCurrency(cur, company.balancesByCurrency[cur]!) : "—"}
          </td>
        ))}
        <td className="px-3 py-1.5 border-b border-border/40 text-right tabular-nums whitespace-nowrap text-emerald-600 dark:text-emerald-400">
          {company.income7d > 0 ? fmtRub(company.income7d) : "—"}
        </td>
        <td className="px-3 py-1.5 border-b border-border/40 text-right tabular-nums whitespace-nowrap text-red-600 dark:text-red-400">
          {company.expense7d > 0 ? fmtRub(company.expense7d) : "—"}
        </td>
        <td className="px-3 py-1.5 border-b border-border/40 text-right tabular-nums whitespace-nowrap text-emerald-600 dark:text-emerald-400">
          {company.income30d > 0 ? fmtRub(company.income30d) : "—"}
        </td>
        <td className="px-3 py-1.5 border-b border-border/40 text-right tabular-nums whitespace-nowrap text-red-600 dark:text-red-400">
          {company.expense30d > 0 ? fmtRub(company.expense30d) : "—"}
        </td>
      </tr>

      {isOpen &&
        company.accounts.map((a) => (
          <tr key={a.accountNumber} className="bg-muted/20">
            <td className="px-3 py-1 border-b border-border/40 whitespace-nowrap text-muted-foreground">
              <span className="pl-6 inline-flex items-center gap-1.5">
                <span className="font-medium text-foreground">{a.bankName}</span>
                <span className="tabular-nums">····{a.accountNumber.slice(-6)}</span>
                <span className="text-[10px]">{a.currency}</span>
              </span>
            </td>
            {allCurrencies.map((cur) => (
              <td key={cur} className="px-3 py-1 border-b border-border/40 text-right tabular-nums whitespace-nowrap">
                {cur === a.currency && a.closingBalance !== null ? fmtByCurrency(cur, a.closingBalance) : "—"}
              </td>
            ))}
            <td className="px-3 py-1 border-b border-border/40 text-right tabular-nums whitespace-nowrap text-emerald-600/80 dark:text-emerald-400/80">
              {a.income7d > 0 ? fmtRub(a.income7d) : "—"}
            </td>
            <td className="px-3 py-1 border-b border-border/40 text-right tabular-nums whitespace-nowrap text-red-600/80 dark:text-red-400/80">
              {a.expense7d > 0 ? fmtRub(a.expense7d) : "—"}
            </td>
            <td className="px-3 py-1 border-b border-border/40 text-right tabular-nums whitespace-nowrap text-emerald-600/80 dark:text-emerald-400/80">
              {a.income30d > 0 ? fmtRub(a.income30d) : "—"}
            </td>
            <td className="px-3 py-1 border-b border-border/40 text-right tabular-nums whitespace-nowrap text-red-600/80 dark:text-red-400/80">
              {a.expense30d > 0 ? fmtRub(a.expense30d) : "—"}
            </td>
          </tr>
        ))}
    </>
  )
}
