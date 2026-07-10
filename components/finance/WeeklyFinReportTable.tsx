"use client"

// components/finance/WeeklyFinReportTable.tsx
// Sticky-роллап понедельного WB фин-отчёта: Вселенная → Бренд → Артикул
// с дуальными сценариями ИУ / Оферта + подытоги + итого + «Водопад затрат».
// CLAUDE.md sticky-паттерн: прямой <table border-separate>, <thead bg-background>,
// сплошной bg-background/bg-muted на КАЖДОЙ sticky-ячейке (НЕ /NN alpha — баг).
// Образец: components/finance/CashflowMatrix.tsx.
// Phase quick-260710-evz (W2a, 2026-07-10)

import { cn } from "@/lib/utils"
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

interface Props {
  articles: ArticleResult[]
  rollup: WeeklyRollup
  waterfall: WeeklyWaterfall
  meta: Record<number, { brandName: string | null; productName: string }>
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
  // Числовые колонки (undefined → пустая ячейка для заголовочных строк)
  revenue?: number
  profitIu?: number
  reIu?: number
  profitStd?: number
  reStd?: number
}

/** Собирает плоский список строк Вселенная → Бренд → Артикул + подытоги + итого. */
function buildRows(
  articles: ArticleResult[],
  rollup: WeeklyRollup,
  meta: Props["meta"],
): Row[] {
  const rows: Row[] = []

  for (const universe of UNIVERSE_ORDER) {
    const uniArticles = articles.filter((a) => a.universe === universe)
    if (uniArticles.length === 0) continue

    rows.push({ kind: "universe", label: UNIVERSE_LABEL[universe] })

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
        rows.push({
          kind: "article",
          label: meta[a.nmId]?.productName ?? String(a.nmId),
          revenue: a.iu.revenue, // iu.revenue === std.revenue (K·H)
          profitIu: a.iu.profit,
          reIu: a.iu.rePct,
          profitStd: a.std.profit,
          reStd: a.std.rePct,
        })
      }
    }

    // Подытог вселенной из роллапа
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
  })

  return rows
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

export function WeeklyFinReportTable({ articles, rollup, waterfall, meta }: Props) {
  if (articles.length === 0) {
    return (
      <div className="rounded-md border bg-card p-4">
        <div className="py-8 text-center text-sm text-muted-foreground">
          Нет данных за выбранную неделю
        </div>
      </div>
    )
  }

  const rows = buildRows(articles, rollup, meta)

  return (
    <div className="flex flex-col gap-4">
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
                {["Выручка", "Прибыль ИУ", "Re ИУ", "Прибыль Оферта", "Re Оферта"].map(
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

                return (
                  <tr
                    key={`${row.kind}-${row.label}-${i}`}
                    className={heavy || isUniverse ? "" : "hover:bg-muted/20 transition-colors"}
                  >
                    <td
                      className={cn(LABEL_STICKY, solidBg, labelWeight, labelIndent)}
                      style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                    >
                      {row.label}
                    </td>

                    {row.revenue === undefined ? (
                      // Заголовочные строки (вселенная / бренд) — пустые числовые ячейки
                      <td className={cn(NUM_CELL, solidBg)} colSpan={5} />
                    ) : (
                      <>
                        <td className={cn(NUM_CELL, solidBg, heavy && "font-semibold")}>
                          {fmtRub(row.revenue)}
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
    </div>
  )
}

// Отступ метки для артикульных строк (2 уровня вложенности под бренд).
function isArticleIndent(kind: RowKind): string {
  if (kind === "article") return "pl-8"
  if (kind === "brand") return "pl-5"
  return ""
}
