// components/credits/LoanSummaryCards.tsx
// Summary-карточки детальной карточки кредита (D-18 п.1).
// Паттерн SpendSummary.tsx (grid + formatRub + бейджи).
// Phase 21 — Plan 06.
import type { LoanAggregates, LoanStatus } from "@/lib/loan-math"

interface Props {
  agg: LoanAggregates
  amount: number
  annualRatePct: number
  termMonths: number | null
  effectiveIssueDate: Date | null
  issueDateIsFallback: boolean
  status: LoanStatus
  lenderName: string
  companyName: string
}

/** Форматирование денег ru-RU + ₽ (D-19, паттерн SpendSummary). */
function formatRub(v: number): string {
  return (
    v.toLocaleString("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + " ₽"
  )
}

/** Форматирование даты ДД.ММ.ГГГГ (UTC компоненты). */
function formatDate(d: Date | null): string {
  if (!d) return "—"
  const day = String(d.getUTCDate()).padStart(2, "0")
  const month = String(d.getUTCMonth() + 1).padStart(2, "0")
  const year = d.getUTCFullYear()
  return `${day}.${month}.${year}`
}

export function LoanSummaryCards({
  agg,
  amount,
  annualRatePct,
  termMonths,
  effectiveIssueDate,
  issueDateIsFallback,
  status,
  lenderName,
}: Props) {
  const { totalPrincipalPaid, totalInterestPaid, currentBalance, overpayment } = agg

  const principalPct =
    amount > 0 ? ((totalPrincipalPaid / amount) * 100).toFixed(1) : "0"

  const balanceClass =
    status === "active"
      ? "text-sky-700 dark:text-sky-300"
      : "text-emerald-700 dark:text-emerald-300"

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      {/* 1: Сумма кредита */}
      <div className="rounded-md border bg-card p-3">
        <div className="text-xs text-muted-foreground">Сумма кредита</div>
        <div className="text-2xl font-semibold tabular-nums mt-1">
          {formatRub(amount)}
        </div>
      </div>

      {/* 2: Погашено тела */}
      <div className="rounded-md border bg-card p-3">
        <div className="text-xs text-muted-foreground">Погашено тела</div>
        <div className="text-2xl font-semibold tabular-nums mt-1">
          {formatRub(totalPrincipalPaid)}
        </div>
        <div className="text-xs text-muted-foreground mt-1 tabular-nums">
          {principalPct}% от суммы
        </div>
      </div>

      {/* 3: Уплачено процентов */}
      <div className="rounded-md border bg-card p-3">
        <div className="text-xs text-muted-foreground">Уплачено процентов</div>
        <div className="text-2xl font-semibold tabular-nums mt-1">
          {formatRub(totalInterestPaid)}
        </div>
      </div>

      {/* 4: Текущий остаток — выделенный цветом по статусу */}
      <div className="rounded-md border bg-card p-3">
        <div className="text-xs text-muted-foreground">Текущий остаток</div>
        <div className={`text-2xl font-semibold tabular-nums mt-1 ${balanceClass}`}>
          {formatRub(Math.max(0, currentBalance))}
        </div>
      </div>

      {/* 5: Переплата */}
      <div className="rounded-md border bg-card p-3">
        <div className="text-xs text-muted-foreground">Переплата</div>
        <div className="text-2xl font-semibold tabular-nums mt-1">
          {formatRub(overpayment)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          сумма процентов
        </div>
      </div>

      {/* 6: Параметры кредита */}
      <div className="rounded-md border bg-card p-3">
        <div className="text-xs text-muted-foreground mb-1">Параметры</div>
        <div className="flex flex-col gap-0.5 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Кредитор</span>
            <span className="font-medium text-right">{lenderName}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Ставка</span>
            <span className="tabular-nums font-medium">
              {annualRatePct.toLocaleString("ru-RU", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
              %
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Срок</span>
            <span className="tabular-nums">
              {termMonths != null ? `${termMonths} мес` : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Выдан</span>
            <span
              className={`tabular-nums ${issueDateIsFallback ? "italic text-muted-foreground/70" : ""}`}
              title={issueDateIsFallback ? "по первому платежу" : undefined}
            >
              {formatDate(effectiveIssueDate)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
