// components/finance-models/VariantPanel.tsx
// Панель одного варианта финансирования: модель прибыли + денежных потоков + оценка кредита.
"use client"

import type { VariantResult } from "@/lib/finance-model/types"
import { MetricsTable, type MetricRow } from "./MetricsTable"
import { mln, rub } from "./format"

function profitRows(v: VariantResult): MetricRow[] {
  const get = (k: keyof VariantResult["profit"][number]) =>
    v.profit.map((r) => r[k] as number)
  return [
    { label: "Выручка", values: get("revenue"), kind: "bold" },
    { label: "Себестоимость проданного", values: get("cogs") },
    { label: "Операционные расходы", values: get("opex"), kind: "subtle" },
    { label: "Операционная прибыль", values: get("netProfit") },
    { label: "− Проценты по кредиту", values: get("interest"), kind: "subtle" },
    { label: "Чистая прибыль после процентов", values: get("profitAfterInterest"), kind: "accent" },
    { label: "  Реинвест 30% (удержано)", values: get("reinvested"), kind: "subtle" },
    { label: "  Выведено собственнику 70%", values: get("withdrawn"), kind: "subtle" },
  ]
}

function cashRows(v: VariantResult): MetricRow[] {
  const get = (k: keyof VariantResult["cashFlow"][number]) =>
    v.cashFlow.map((r) => r[k] as number)
  return [
    { label: "Поступления от WB", values: get("wbReceipts"), kind: "bold" },
    { label: "− Закупка товара", values: get("procurement") },
    { label: "− Проценты по кредиту", values: get("interest") },
    { label: "− Вывод собственнику", values: get("ownerWithdrawal") },
    { label: "Чистый денежный поток", values: get("netCashFlow"), kind: "accent" },
    { label: "Привлечение кредита", values: get("creditDrawn") },
    { label: "Гашение тела кредита", values: get("creditPrincipalRepaid") },
    { label: "Остаток кредита (к.м.)", values: get("creditBalanceEnd"), noTotal: true, kind: "bold" },
    { label: "Остаток ДС (к.м.)", values: get("cashBalanceEnd"), noTotal: true },
  ]
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  )
}

export function VariantPanel({ variant }: { variant: VariantResult }) {
  const months = variant.profit.map((r) => r.monthLabel)
  const c = variant.credit
  return (
    <div className="space-y-6">
      {/* Оценка кредита */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Оценка кредита</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Собственные средства" value={rub(variant.config.ownFunds)} />
          <Stat label="Пиковый кредит" value={rub(c.peakCredit)} hint={`пик: ${c.peakMonthLabel}`} />
          <Stat label="Совокупный капитал (пик)" value={rub(c.peakCapitalNeed)} hint="собств. + кредит" />
          <Stat label="Проценты за год" value={rub(c.totalInterest)} />
          <Stat label="Прибыль после %" value={rub(variant.profitAfterInterest)} hint="чистая − проценты" />
          <Stat label="Долг на конец года" value={rub(c.endingCredit)} />
        </div>
      </div>

      {/* Модель прибыли */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">
          Модель прибыли <span className="text-muted-foreground font-normal">(начисление, по месяцу продажи)</span>
        </h3>
        <MetricsTable monthLabels={months} rows={profitRows(variant)} />
      </div>

      {/* Модель денежных потоков */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">
          Модель денежных потоков <span className="text-muted-foreground font-normal">(по дате движения денег)</span>
        </h3>
        <MetricsTable monthLabels={months} rows={cashRows(variant)} />
        <p className="mt-2 text-xs text-muted-foreground">
          Операционная прибыль за год: <b>{mln(variant.profitTotals.netProfit)} млн ₽</b>, после процентов:{" "}
          <b>{mln(variant.profitAfterInterest)} млн ₽</b> (из неё реинвест 30% / вывод 70%). Кредит привлекается
          траншами кратно шагу (мин. 5 млн ₽) и гасится <b>дифференцированно</b>: тело — равными долями за срок
          кредита, проценты — на остаток долга (убывающие).
        </p>
      </div>
    </div>
  )
}
