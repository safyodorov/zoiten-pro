// lib/balance-data.ts
// Phase 24 Plan 24-04 — point-in-time хелперы для отчёта «Баланс» (loadBalanceSheet, Plan 24-05).
//
// getBankBalanceAsOf — знак CREDIT=+ (приход) / DEBIT=− (расход); границы интервала
// (X, anchor] строгие по X (см. app/(dashboard)/bank/page.tsx — прецедент anchor=MAX(balanceDate)).
// getRateForDate — курс ЦБ РФ на дату X (не только «последний»); fallback на самый ранний
// доступный курс с флагом approximate=true (CurrencyRate — forward-only sync с 2026-06-09,
// см. 24-RESEARCH.md Pitfall 4).
// stageAsOf — этап закупки на дату X через pre-filter (date <= X) + существующий
// currentStageOf() (lib/purchase-stages.ts, D-12). m7: этап с progress.date=null считается
// достигнутым ТОЛЬКО когда asOf — текущая дата (паритет с /procurement, который дату игнорирует);
// на исторические даты undated-этап не учитывается (не завышаем прошлое).

import { prisma } from "@/lib/prisma"
import { currentStageOf } from "@/lib/purchase-stages"
import { startOfDayMsk } from "@/lib/date-periods"

/** Остаток банковского счёта на произвольную дату asOf (не только anchor = balanceDate). */
export async function getBankBalanceAsOf(accountId: string, asOf: Date): Promise<number | null> {
  const account = await prisma.bankAccount.findUnique({
    where: { id: accountId },
    select: { closingBalance: true, balanceDate: true },
  })
  if (!account?.closingBalance || !account.balanceDate) return null
  const closing = Number(account.closingBalance)
  const anchor = account.balanceDate
  if (asOf.getTime() >= anchor.getTime()) {
    // asOf в будущем (или равно anchor) относительно anchor: closing + транзакции (anchor, asOf]
    const txs = await prisma.bankTransaction.findMany({
      where: { accountId, date: { gt: anchor, lte: asOf } },
      select: { direction: true, amount: true },
    })
    const delta = txs.reduce((s, t) => s + (t.direction === "CREDIT" ? 1 : -1) * Number(t.amount), 0)
    return closing + delta
  }
  // asOf в прошлом относительно anchor: closing минус транзакции (asOf, anchor]
  const txs = await prisma.bankTransaction.findMany({
    where: { accountId, date: { gt: asOf, lte: anchor } },
    select: { direction: true, amount: true },
  })
  const delta = txs.reduce((s, t) => s + (t.direction === "CREDIT" ? 1 : -1) * Number(t.amount), 0)
  return closing - delta
}

export interface RateAsOf {
  rateToRub: number
  date: Date
  approximate: boolean
}

/** Курс ЦБ РФ на дату платежа asOf (point-in-time, не «последний известный»). */
export async function getRateForDate(code: string, asOf: Date): Promise<RateAsOf | null> {
  const exact = await prisma.currencyRate.findFirst({
    where: { code, date: { lte: asOf } },
    orderBy: { date: "desc" },
  })
  if (exact) return { rateToRub: Number(exact.rateToRub), date: exact.date, approximate: false }
  // fallback: самый ранний доступный курс (курсы forward-only с 2026-06-09), с флагом approximate
  const earliest = await prisma.currencyRate.findFirst({ where: { code }, orderBy: { date: "asc" } })
  return earliest ? { rateToRub: Number(earliest.rateToRub), date: earliest.date, approximate: true } : null
}

/**
 * Текущий этап закупки на дату asOf. Pre-filter достигнутых этапов (date <= asOf) →
 * делегирует в currentStageOf() (самый дальний по STAGE_ORDER).
 *
 * m7: этап с progress.date=null («достигнут, время неизвестно») учитывается достигнутым
 * ТОЛЬКО когда asOf соответствует текущей дате (паритет с /procurement currentStageOf,
 * который дату вообще игнорирует). Для исторических дат undated-этап во времени
 * разместить нельзя → не учитывается (не завышаем прошлое).
 */
export function stageAsOf(
  stages: Array<{ stage: string; date: Date | null }>,
  asOf: Date,
  now: Date = new Date()
): string | null {
  const asOfIsCurrent = asOf.getTime() >= startOfDayMsk(now).getTime()
  const reached = stages
    .filter(
      (s) =>
        (s.date != null && s.date.getTime() <= asOf.getTime()) ||
        (s.date == null && asOfIsCurrent) // undated → достигнут только «сейчас» (m7, паритет с /procurement)
    )
    .map((s) => s.stage)
  return currentStageOf(reached)
}
