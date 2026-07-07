// app/(dashboard)/credits/[id]/page.tsx
// RSC детальная карточка кредита (D-18).
// Phase 21 — Plan 06.
import { notFound } from "next/navigation"
import Link from "next/link"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import {
  computeSchedule,
  computeLoanAggregates,
  computeStatus,
  computeAccruedInterest,
} from "@/lib/loan-math"
import { LoanSummaryCards } from "@/components/credits/LoanSummaryCards"
import { LoanBalanceChart } from "@/components/credits/LoanBalanceChart"
import { LoanScheduleTable } from "@/components/credits/LoanScheduleTable"

interface Props {
  params: Promise<{ id: string }>
}

export default async function CreditDetailPage({ params }: Props) {
  await requireSection("CREDITS")

  const { id } = await params

  const loan = await prisma.loan.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: true,
      lender: true,
      payments: { orderBy: { date: "asc" } },
    },
  })

  if (!loan) notFound()

  const amount = Number(loan.amount)
  const payments = loan.payments.map((p) => ({
    date: p.date,
    principal: Number(p.principal),
    interest: Number(p.interest),
  }))

  const schedule = computeSchedule(amount, payments)
  // agg на сегодня: будущие плановые платежи графика не считаются оплаченными
  // (без asOf Σprincipal == amount → остаток 0 → кредит ошибочно «погашен»)
  const agg = computeLoanAggregates(amount, payments, new Date())
  const status = computeStatus(agg.currentBalance)
  const accruedInterest = computeAccruedInterest(amount, payments, new Date(), loan.issueDate ?? null)

  // D-07: effectiveIssueDate = issueDate ?? дата первого платежа
  const effectiveIssueDate: Date | null =
    loan.issueDate ?? payments[0]?.date ? (loan.issueDate ?? new Date(payments[0]!.date)) : null
  const issueDateIsFallback = !loan.issueDate && !!payments[0]?.date

  const annualRatePct = Number(loan.annualRatePct)

  // Форматирование даты ДД.ММ.ГГГГ
  const formatDate = (d: Date | null) => {
    if (!d) return "—"
    const day = String(d.getUTCDate()).padStart(2, "0")
    const month = String(d.getUTCMonth() + 1).padStart(2, "0")
    const year = d.getUTCFullYear()
    return `${day}.${month}.${year}`
  }

  const statusLabel = status === "active" ? "Активен" : "Погашён"
  const statusClass =
    status === "active"
      ? "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
      : "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-auto">
      {/* Заголовок */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/credits"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            prefetch={false}
          >
            ← Назад к списку
          </Link>
        </div>
        <div className="flex items-center gap-3 flex-wrap mt-1">
          <h2 className="text-lg font-semibold">
            {loan.contractNumber}
          </h2>
          <span className="text-muted-foreground text-sm">{loan.company.name}</span>
          <span className="text-muted-foreground text-sm">·</span>
          <span className="text-sm font-medium">{loan.lender.name}</span>
          <span className={statusClass}>{statusLabel}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Дата выдачи:{" "}
          {effectiveIssueDate ? (
            <span title={issueDateIsFallback ? "по первому платежу" : undefined}>
              {formatDate(effectiveIssueDate)}
              {issueDateIsFallback && (
                <span className="italic ml-1 text-muted-foreground/70">
                  (по первому платежу)
                </span>
              )}
            </span>
          ) : (
            "—"
          )}
        </div>
      </div>

      {/* Сводные карточки */}
      <LoanSummaryCards
        agg={agg}
        amount={amount}
        annualRatePct={annualRatePct}
        termMonths={loan.termMonths ?? null}
        effectiveIssueDate={effectiveIssueDate}
        issueDateIsFallback={issueDateIsFallback}
        status={status}
        lenderName={loan.lender.name}
        companyName={loan.company.name}
        accruedInterest={accruedInterest}
      />

      {/* Line-chart остатка */}
      <LoanBalanceChart schedule={schedule} amount={amount} />

      {/* Таблица графика */}
      <LoanScheduleTable schedule={schedule} />
    </div>
  )
}
