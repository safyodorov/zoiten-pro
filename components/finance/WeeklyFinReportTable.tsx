"use client"

// components/finance/WeeklyFinReportTable.tsx
// Sticky-роллап понедельного WB фин-отчёта: Вселенная → Бренд → Артикул
// с дуальными сценариями ИУ / Оферта + подытоги + итого + «Водопад затрат».
// CLAUDE.md sticky-паттерн: прямой <table border-separate>, <thead bg-background>,
// сплошной bg-background/bg-muted на КАЖДОЙ sticky-ячейке (НЕ /NN alpha — баг).
// Образец: components/finance/CashflowMatrix.tsx.
// Phase quick-260710-evz (W2a, 2026-07-10)
// Quick 260710-gem (W2c, 2026-07-10): колонки «План (нед), ₽» / «% вып. (нед)»
// + KPI-блок план-факт недели и месяца-to-date (optional prop planFact).

import { useState } from "react"
import { cn } from "@/lib/utils"
import { WeeklyFinArticleDialog } from "@/components/finance/WeeklyFinArticleDialog"
import type {
  ArticleResult,
  CostWaterfall,
  Universe,
  WeeklyRollup,
  WeeklyWaterfall,
} from "@/lib/finance-weekly/types"

// ── Константы ──────────────────────────────────────────────────────────────────

const LABEL_WIDTH = 340

const UNIVERSE_LABEL: Record<Universe, string> = {
  appliances: "Бытовая техника",
  clothing: "Одежда",
}
const UNIVERSE_ORDER: Universe[] = ["appliances", "clothing"]

// ── Форматирование ─────────────────────────────────────────────────────────────

const rubFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })
const pctFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 })

function fmtRub(n: number): string {
  return rubFmt.format(n)
}

/** rePct хранится как доля 0..1 → ×100 + «%». */
function fmtPct(fraction: number): string {
  return `${pctFmt.format(fraction * 100)}%`
}

function profitColor(n: number): string {
  return n > 0
    ? "text-emerald-600 dark:text-emerald-500"
    : n < 0
      ? "text-red-600 dark:text-red-400"
      : ""
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface PlanFactProps {
  /** План недели per nmId (Record, НЕ Map — RSC→client boundary, Phase 09-03). */
  planWeekByNmId: Record<number, number>
  kpi: { planWeek: number; factWeek: number; planMonth: number; factMonthMtd: number }
  /** ISO weekEnd — для подписи «Месяц (по dd.MM)». */
  weekEndISO: string
}

interface Props {
  articles: ArticleResult[]
  rollup: WeeklyRollup
  waterfall: WeeklyWaterfall
  meta: Record<number, { brandName: string | null; productName: string }>
  /** null/undefined → активной версии плана нет: KPI скрыт, колонки «—». */
  planFact?: PlanFactProps | null
}

// ── Классы ячеек ────────────────────────────────────────────────────────────────

const LABEL_STICKY =
  "sticky left-0 z-20 border-b border-r text-xs px-3 h-8 align-middle whitespace-nowrap text-left"
const NUM_CELL =
  "border-b border-r border-r-border/40 text-xs px-3 h-8 align-middle text-right tabular-nums whitespace-nowrap"

// ── Строки роллапа ──────────────────────────────────────────────────────────────

type RowKind = "universe" | "brand" | "article" | "subtotal" | "grand"

interface Row {
  kind: RowKind
  label: string
  nmId?: number // только у строк kind==="article" (для клика → drill-down модалка)
  // Числовые колонки (undefined → пустая ячейка для заголовочных строк)
  revenue?: number
  profitIu?: number
  reIu?: number
  profitStd?: number
  reStd?: number
  // План-факт (W2c): null → «—» (нет активной версии / нет плана у товара)
  planWeek?: number | null
  fulfillPct?: number | null
}

/** Собирает плоский список строк Вселенная → Бренд → Артикул + подытоги + итого. */
function buildRows(
  articles: ArticleResult[],
  rollup: WeeklyRollup,
  meta: Props["meta"],
  planFact: PlanFactProps | null | undefined,
): Row[] {
  const rows: Row[] = []

  // План-факт суммируется локально по article-строкам (роллап движка план не знает)
  let grandPlanSum = 0
  let grandRevSum = 0

  for (const universe of UNIVERSE_ORDER) {
    const uniArticles = articles.filter((a) => a.universe === universe)
    if (uniArticles.length === 0) continue

    rows.push({ kind: "universe", label: UNIVERSE_LABEL[universe] })

    let uniPlanSum = 0
    let uniRevSum = 0

    // Группировка по бренду
    const byBrand = new Map<string, ArticleResult[]>()
    for (const a of uniArticles) {
      const brand = meta[a.nmId]?.brandName ?? "—"
      const list = byBrand.get(brand) ?? []
      list.push(a)
      byBrand.set(brand, list)
    }
    const brandNames = Array.from(byBrand.keys()).sort((x, y) => x.localeCompare(y, "ru"))

    for (const brand of brandNames) {
      rows.push({ kind: "brand", label: brand })
      const brandArticles = (byBrand.get(brand) ?? [])
        .slice()
        .sort((x, y) => x.nmId - y.nmId)
      for (const a of brandArticles) {
        const revenue = a.iu.revenue // iu.revenue === std.revenue (K·H)
        const planWeek = planFact ? (planFact.planWeekByNmId[a.nmId] ?? null) : null
        uniRevSum += revenue
        uniPlanSum += planWeek ?? 0
        rows.push({
          kind: "article",
          label: meta[a.nmId]?.productName ?? String(a.nmId),
          nmId: a.nmId,
          revenue,
          profitIu: a.iu.profit,
          reIu: a.iu.rePct,
          profitStd: a.std.profit,
          reStd: a.std.rePct,
          planWeek,
          fulfillPct: planWeek != null && planWeek > 0 ? revenue / planWeek : null,
        })
      }
    }

    grandPlanSum += uniPlanSum
    grandRevSum += uniRevSum

    // Подытог вселенной из роллапа (план-факт — локальная Σ по article-строкам)
    const uni = rollup.byUniverse.find((u) => u.universe === universe)
    if (uni) {
      rows.push({
        kind: "subtotal",
        label: `Итого — ${UNIVERSE_LABEL[universe]}`,
        revenue: uni.iu.revenue,
        profitIu: uni.iu.profit,
        reIu: uni.iu.rePct,
        profitStd: uni.std.profit,
        reStd: uni.std.rePct,
        planWeek: planFact ? uniPlanSum : null,
        fulfillPct: planFact && uniPlanSum > 0 ? uniRevSum / uniPlanSum : null,
      })
    }
  }

  // Grand total
  rows.push({
    kind: "grand",
    label: "Итого",
    revenue: rollup.grand.iu.revenue,
    profitIu: rollup.grand.iu.profit,
    reIu: rollup.grand.iu.rePct,
    profitStd: rollup.grand.std.profit,
    reStd: rollup.grand.std.rePct,
    planWeek: planFact ? grandPlanSum : null,
    fulfillPct: planFact && grandPlanSum > 0 ? grandRevSum / grandPlanSum : null,
  })

  return rows
}

// ── KPI-блок план-факта (W2c) ───────────────────────────────────────────────────

function fulfillColor(pct: number | null): string {
  return pct != null && pct >= 1 ? "text-emerald-600 dark:text-emerald-500" : ""
}

function PlanFactKpiCard({
  title,
  plan,
  fact,
  pctLabel,
}: {
  title: string
  plan: number
  fact: number
  pctLabel: string
}) {
  const pct = plan > 0 ? fact / plan : null
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground font-medium">{title}</div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div>
          <span className="text-xs text-muted-foreground">План </span>
          <span className="text-sm font-semibold tabular-nums">{fmtRub(plan)} ₽</span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Факт </span>
          <span className="text-sm font-semibold tabular-nums">{fmtRub(fact)} ₽</span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">{pctLabel} </span>
          <span className={cn("text-sm font-semibold tabular-nums", fulfillColor(pct))}>
            {pct != null ? fmtPct(pct) : "—"}
          </span>
        </div>
      </div>
    </div>
  )
}

function PlanFactKpiBlock({ planFact }: { planFact: PlanFactProps }) {
  const { kpi, weekEndISO } = planFact
  const ddMM = `${weekEndISO.slice(8, 10)}.${weekEndISO.slice(5, 7)}`
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <PlanFactKpiCard
        title="Неделя"
        plan={kpi.planWeek}
        fact={kpi.factWeek}
        pctLabel="% вып."
      />
      <PlanFactKpiCard
        title={`Месяц (по ${ddMM})`}
        plan={kpi.planMonth}
        fact={kpi.factMonthMtd}
        pctLabel="% вып. МТД"
      />
    </div>
  )
}

// ── Водопад затрат ──────────────────────────────────────────────────────────────

const WATERFALL_BUCKETS: { key: keyof CostWaterfall; label: string }[] = [
  { key: "cost", label: "Закупка" },
  { key: "ad", label: "Реклама" },
  { key: "review", label: "Отзывы" },
  { key: "logistics", label: "Логистика" },
  { key: "delivery", label: "Доставка до МП" },
  { key: "credit", label: "Кредит" },
  { key: "overhead", label: "Общие расходы" },
  { key: "acceptance", label: "Приёмка / штрафы" },
  { key: "storage", label: "Хранение" },
  { key: "defect", label: "Брак" },
  { key: "jem", label: "Джем" },
  { key: "tax", label: "Налог" },
  { key: "acquiring", label: "Эквайринг" },
]

function sumWaterfall(w: CostWaterfall): number {
  return WATERFALL_BUCKETS.reduce((acc, b) => acc + w[b.key], 0)
}

// ── Компонент ───────────────────────────────────────────────────────────────────

export function WeeklyFinReportTable({
  articles,
  rollup,
  waterfall,
  meta,
  planFact,
}: Props) {
  // ⚠ Хуки объявлены ПЕРВЫМИ — выше early-return для пустой недели. Иначе
  // число хуков меняется при empty↔non-empty (rules-of-hooks violation).
  const [open, setOpen] = useState(false)
  const [selectedNmId, setSelectedNmId] = useState<number | null>(null)

  const selectedArticle =
    selectedNmId == null ? null : (articles.find((a) => a.nmId === selectedNmId) ?? null)
  const selectedMeta =
    selectedNmId == null
      ? { brandName: null, productName: "" }
      : (meta[selectedNmId] ?? { brandName: null, productName: String(selectedNmId) })

  if (articles.length === 0) {
    // KPI-блок рендерится и на пустой неделе — план месяца/недели виден всегда
    return (
      <div className="flex flex-col gap-4">
        {planFact != null && <PlanFactKpiBlock planFact={planFact} />}
        <div className="rounded-md border bg-card p-4">
          <div className="py-8 text-center text-sm text-muted-foreground">
            Нет данных за выбранную неделю
          </div>
        </div>
      </div>
    )
  }

  const rows = buildRows(articles, rollup, meta, planFact)

  return (
    <div className="flex flex-col gap-4">
      {/* ── KPI план-факт (W2c): скрыт без активной версии плана ── */}
      {planFact != null && <PlanFactKpiBlock planFact={planFact} />}

      {/* ── Роллап-таблица ── */}
      <div className="rounded-md border bg-card overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full border-separate border-spacing-0">
            <thead className="bg-background">
              <tr>
                <th
                  className="sticky left-0 top-0 z-30 bg-background border-b border-r text-xs px-3 h-8 align-middle font-semibold whitespace-nowrap text-left"
                  style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                >
                  Вселенная / Бренд / Артикул
                </th>
                {[
                  "Выручка",
                  "План (нед), ₽",
                  "% вып. (нед)",
                  "Прибыль ИУ",
                  "Re ИУ",
                  "Прибыль Оферта",
                  "Re Оферта",
                ].map(
                  (h) => (
                    <th
                      key={h}
                      className="sticky top-0 z-10 bg-background border-b border-r border-r-border/40 text-xs px-3 h-8 align-middle font-semibold text-right whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, i) => {
                const isUniverse = row.kind === "universe"
                const isBrand = row.kind === "brand"
                const isSubtotal = row.kind === "subtotal"
                const isGrand = row.kind === "grand"
                const heavy = isSubtotal || isGrand

                // Фон строки: подытоги/итого/вселенная — сплошной bg-muted
                const solidBg =
                  isSubtotal || isGrand || isUniverse ? "bg-muted" : "bg-background"
                const labelWeight = isGrand
                  ? "font-bold"
                  : isUniverse || isSubtotal
                    ? "font-semibold"
                    : isBrand
                      ? "font-medium text-muted-foreground"
                      : ""
                const labelIndent = isArticleIndent(row.kind)
                const isClickable = row.kind === "article" && row.nmId != null

                return (
                  <tr
                    key={`${row.kind}-${row.label}-${i}`}
                    className={cn(
                      heavy || isUniverse ? "" : "hover:bg-muted/20 transition-colors",
                      isClickable && "cursor-pointer",
                    )}
                    onClick={
                      isClickable
                        ? () => {
                            setSelectedNmId(row.nmId!)
                            setOpen(true)
                          }
                        : undefined
                    }
                  >
                    <td
                      className={cn(LABEL_STICKY, solidBg, labelWeight, labelIndent)}
                      style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                    >
                      {row.label}
                    </td>

                    {row.revenue === undefined ? (
                      // Заголовочные строки (вселенная / бренд) — пустые числовые ячейки
                      <td className={cn(NUM_CELL, solidBg)} colSpan={7} />
                    ) : (
                      <>
                        <td className={cn(NUM_CELL, solidBg, heavy && "font-semibold")}>
                          {fmtRub(row.revenue)}
                        </td>
                        <td className={cn(NUM_CELL, solidBg, heavy && "font-semibold")}>
                          {row.planWeek != null ? (
                            fmtRub(row.planWeek)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td
                          className={cn(
                            NUM_CELL,
                            solidBg,
                            heavy && "font-semibold",
                            fulfillColor(row.fulfillPct ?? null),
                          )}
                        >
                          {row.fulfillPct != null ? (
                            fmtPct(row.fulfillPct)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td
                          className={cn(
                            NUM_CELL,
                            solidBg,
                            heavy && "font-semibold",
                            profitColor(row.profitIu ?? 0),
                          )}
                        >
                          {fmtRub(row.profitIu ?? 0)}
                        </td>
                        <td className={cn(NUM_CELL, solidBg, heavy && "font-semibold")}>
                          {fmtPct(row.reIu ?? 0)}
                        </td>
                        <td
                          className={cn(
                            NUM_CELL,
                            solidBg,
                            heavy && "font-semibold",
                            profitColor(row.profitStd ?? 0),
                          )}
                        >
                          {fmtRub(row.profitStd ?? 0)}
                        </td>
                        <td className={cn(NUM_CELL, solidBg, heavy && "font-semibold")}>
                          {fmtPct(row.reStd ?? 0)}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Водопад затрат ── */}
      <div className="rounded-md border bg-card overflow-hidden">
        <div className="px-3 py-2 text-sm font-semibold border-b bg-muted">
          Водопад затрат
        </div>
        <div className="overflow-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead className="bg-background">
              <tr>
                <th className="border-b border-r text-xs px-3 h-8 align-middle font-semibold text-left whitespace-nowrap">
                  Статья
                </th>
                <th className="border-b border-r border-r-border/40 text-xs px-3 h-8 align-middle font-semibold text-right whitespace-nowrap">
                  ИУ, ₽
                </th>
                <th className="border-b text-xs px-3 h-8 align-middle font-semibold text-right whitespace-nowrap">
                  Оферта, ₽
                </th>
              </tr>
            </thead>
            <tbody>
              {WATERFALL_BUCKETS.map((b) => (
                <tr key={b.key} className="hover:bg-muted/20 transition-colors">
                  <td className="border-b border-r text-xs px-3 h-8 align-middle text-left whitespace-nowrap text-muted-foreground">
                    {b.label}
                  </td>
                  <td className="border-b border-r border-r-border/40 text-xs px-3 h-8 align-middle text-right tabular-nums whitespace-nowrap">
                    {fmtRub(waterfall.iu[b.key])}
                  </td>
                  <td className="border-b text-xs px-3 h-8 align-middle text-right tabular-nums whitespace-nowrap">
                    {fmtRub(waterfall.std[b.key])}
                  </td>
                </tr>
              ))}
              <tr className="bg-muted">
                <td className="border-b border-r text-xs px-3 h-8 align-middle text-left font-semibold whitespace-nowrap">
                  Итого затрат
                </td>
                <td className="border-b border-r border-r-border/40 text-xs px-3 h-8 align-middle text-right tabular-nums font-semibold whitespace-nowrap">
                  {fmtRub(sumWaterfall(waterfall.iu))}
                </td>
                <td className="border-b text-xs px-3 h-8 align-middle text-right tabular-nums font-semibold whitespace-nowrap">
                  {fmtRub(sumWaterfall(waterfall.std))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Drill-down модалка per-article (открывается кликом по строке артикула) ── */}
      <WeeklyFinArticleDialog
        open={open}
        onOpenChange={setOpen}
        article={selectedArticle}
        meta={selectedMeta}
      />
    </div>
  )
}

// Отступ метки для артикульных строк (2 уровня вложенности под бренд).
function isArticleIndent(kind: RowKind): string {
  if (kind === "article") return "pl-8"
  if (kind === "brand") return "pl-5"
  return ""
}
