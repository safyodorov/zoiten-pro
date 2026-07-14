"use client"

// components/finance/WeeklyFinArticleDialog.tsx
//
// READ-ONLY drill-down модалка per-article юнит-экономики понедельного WB
// фин-отчёта (/finance/weekly). Клик по строке артикула в WeeklyFinReportTable
// → эта модалка: полная пооперационная разбивка (₽/ед) в ДВУХ сценариях
// (ИУ и Оферта), как строка Excel «Показатели». Строки, различающиеся между
// сценариями (комиссия %, цена минус комиссия, логистика, прибыль), подсвечены.
//
// Чисто презентационный компонент: никаких input/form/server action —
// отчёт фактический, параметры здесь не редактируются (правки → W2c, не тут).
// Образец структуры Dialog — components/prices/PricingCalculatorDialog.tsx,
// но без react-hook-form / useTransition / кнопок сохранения.
//
// Phase quick-260710-fr1 (W2b, 2026-07-10)

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { ArticleResult, CostBreakdown } from "@/lib/finance-weekly/types"

// ── Форматтеры ───────────────────────────────────────────────────────────────

/** ₽/ед с 2 знаками; нефинитное → «—». */
function fmtRub2(n: number): string {
  if (!Number.isFinite(n)) return "—"
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** ₽ целое (валовые суммы); нефинитное → «—». */
function fmtRub0(n: number): string {
  if (!Number.isFinite(n)) return "—"
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })
}

/** Кол-во ед.: бытовая — дробное (заказы×%выкупа), до 1 знака. */
const qtyFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 })

/** Доля 0..1 → «%» (для rePct / roi). */
function fmtPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—"
  return `${(fraction * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`
}

/** Уже проценты → «%» (для commissionPct). */
function fmtPctRaw(pct: number): string {
  if (!Number.isFinite(pct)) return "—"
  return `${pct.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`
}

function profitColor(n: number): string {
  return n > 0
    ? "text-emerald-600 dark:text-emerald-500"
    : n < 0
      ? "text-red-600 dark:text-red-400"
      : ""
}

/** Базис qtyOrders: одежда — нетто-выкупы; бытовая — заказы × % выкупа
 *  (quick 260714-maz, дробный H). */
function basisLabel(universe: ArticleResult["universe"]): string {
  return universe === "clothing" ? "выкупы нетто" : "заказы × %выкупа"
}

// ── Конфиг строк разбивки (порядок = Excel «Показатели») ─────────────────────

const HIGHLIGHT = "bg-amber-50 dark:bg-amber-500/10"

const ROWS: { label: string; key: keyof CostBreakdown; kind: "money" | "pct"; differs?: boolean }[] = [
  { label: "Цена", key: "pricePerUnit", kind: "money" },
  { label: "Комиссия %", key: "commissionPct", kind: "pct", differs: true },
  { label: "Цена минус комиссия", key: "netOfCommissionPerUnit", kind: "money", differs: true },
  { label: "Закупка", key: "costPerUnit", kind: "money" },
  { label: "Реклама", key: "adPerUnit", kind: "money" },
  { label: "Списание за отзыв", key: "reviewPerUnit", kind: "money" },
  { label: "Логистика", key: "logisticsPerUnit", kind: "money", differs: true },
  { label: "Доставка до МП", key: "deliveryPerUnit", kind: "money" },
  { label: "Кредит", key: "creditPerUnit", kind: "money" },
  { label: "Общие расходы", key: "overheadPerUnit", kind: "money" },
  { label: "Платная приёмка", key: "acceptancePerUnit", kind: "money" },
  { label: "Хранение", key: "storagePerUnit", kind: "money" },
  { label: "Брак", key: "defectPerUnit", kind: "money" },
  { label: "Джем 1%", key: "jemPerUnit", kind: "money" },
  { label: "Налог", key: "taxPerUnit", kind: "money" },
  { label: "Эквайринг", key: "acquiringPerUnit", kind: "money" },
]

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  article: ArticleResult | null
  meta: {
    brandName: string | null
    productName: string
    // Quick 260714-or9: транзит из data.ts meta для строк «базис количества».
    rawQtyOrders?: number
    appliedBuyoutPct?: number | null
  }
}

// ── Компонент ──────────────────────────────────────────────────────────────────

export function WeeklyFinArticleDialog({ open, onOpenChange, article, meta }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        {article && (
          <>
            <DialogHeader>
              <DialogTitle>{meta.productName || String(article.nmId)}</DialogTitle>
              <DialogDescription>
                Артикул: {article.nmId} · Бренд: {meta.brandName ?? "—"} · Кол-во, шт:{" "}
                {qtyFmt.format(article.qtyOrders)} ({basisLabel(article.universe)}) · Цена:{" "}
                {fmtRub2(article.iu.breakdown.pricePerUnit)} ₽
              </DialogDescription>
            </DialogHeader>

            {/* Quick 260714-or9: базис количества — сырые заказы, применённый % выкупа,
                скорректированное кол-во. Только бытовая (у одежды корректировка не применяется).
                Значения могут быть undefined на старых снапшотах → «—». */}
            {article.universe === "appliances" && (
              <div className="flex flex-col gap-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Процент выкупа (применённый)</span>
                  <span className="tabular-nums">
                    {meta.appliedBuyoutPct != null ? fmtPctRaw(meta.appliedBuyoutPct) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Заказы за период (без корректировки)</span>
                  <span className="tabular-nums">
                    {meta.rawQtyOrders != null ? qtyFmt.format(meta.rawQtyOrders) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Кол-во с корректировкой</span>
                  <span className="tabular-nums">{qtyFmt.format(article.qtyOrders)}</span>
                </div>
              </div>
            )}

            {/* ── Пооперационная разбивка (₽/ед) ── */}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-semibold">Статья</th>
                    <th className="px-3 py-2 text-right font-semibold tabular-nums">ИУ, ₽/ед</th>
                    <th className="px-3 py-2 text-right font-semibold tabular-nums">Оферта, ₽/ед</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => {
                    const iuVal = article.iu.breakdown[row.key]
                    const stdVal = article.std.breakdown[row.key]
                    const fmt = row.kind === "pct" ? fmtPctRaw : fmtRub2
                    return (
                      <tr
                        key={row.key}
                        className={cn("border-b last:border-b-0", row.differs && HIGHLIGHT)}
                      >
                        <td className="px-3 py-1.5 text-left">{row.label}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmt(iuVal)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmt(stdVal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              × {qtyFmt.format(article.qtyOrders)} шт ({basisLabel(article.universe)}) = валовая
              сумма за неделю
            </p>

            {/* ── Итоги обоих сценариев ── */}
            <div className="rounded-md bg-muted/50 p-3">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-1.5 text-left font-semibold">Показатель</th>
                    <th className="py-1.5 text-right font-semibold tabular-nums">ИУ</th>
                    <th className="py-1.5 text-right font-semibold tabular-nums">Оферта</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={cn("border-b", HIGHLIGHT)}>
                    <td className="py-1.5 text-left">Прибыль / ед</td>
                    <td className={cn("py-1.5 text-right tabular-nums", profitColor(article.iu.profitPerUnit))}>
                      {fmtRub2(article.iu.profitPerUnit)}
                    </td>
                    <td className={cn("py-1.5 text-right tabular-nums", profitColor(article.std.profitPerUnit))}>
                      {fmtRub2(article.std.profitPerUnit)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1.5 text-left">Выручка</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtRub0(article.iu.revenue)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtRub0(article.std.revenue)}</td>
                  </tr>
                  <tr className={cn("border-b", HIGHLIGHT)}>
                    <td className="py-1.5 text-left">Прибыль</td>
                    <td className={cn("py-1.5 text-right tabular-nums", profitColor(article.iu.profit))}>
                      {fmtRub0(article.iu.profit)}
                    </td>
                    <td className={cn("py-1.5 text-right tabular-nums", profitColor(article.std.profit))}>
                      {fmtRub0(article.std.profit)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1.5 text-left">Re продаж %</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtPct(article.iu.rePct)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtPct(article.std.rePct)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-left">ROI %</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtPct(article.iu.roi)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtPct(article.std.roi)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
