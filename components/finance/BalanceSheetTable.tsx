// components/finance/BalanceSheetTable.tsx
// Phase 24 Plan 24-07 — вертикальная таблица баланса: АКТИВЫ → ПАССИВЫ → КАПИТАЛ (D-06),
// с двумя датами и колонками дельты Δ₽/Δ% (D-09). Server component — интерактивности нет,
// кроме нативного <details> для расшифровки «Без оценки» (D-11).
//
// CNY-строки (line.currency==="CNY", m4/Pitfall 2): справочные, НЕ входят в рублёвые
// subtotal/total (это уже сделано в lib/balance-data.ts sumRubLines) — дельта для них
// не считается, значение показывается с ¥, не ₽.
import type { BalanceGroup, BalanceLine, BalanceSection, BalanceSheet } from "@/lib/balance-data"
import { computeDelta } from "@/lib/balance-math"

interface BalanceSheetTableProps {
  current: BalanceSheet
  compare: BalanceSheet
  currentLabel: string
  compareLabel: string
}

// ── Форматирование ────────────────────────────────────────────────────────

const rubFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })

function fmtRub(n: number): string {
  return `${rubFmt.format(n)} ₽`
}

function fmtCny(n: number): string {
  return `${rubFmt.format(n)} ¥`
}

function fmtDeltaRub(n: number): string {
  if (n === 0) return fmtRub(0)
  return (n > 0 ? "+" : "") + fmtRub(n)
}

function fmtDeltaPct(pct: number | null): string {
  if (pct === null) return "—"
  return (pct > 0 ? "+" : "") + pct.toFixed(1) + "%"
}

function deltaColorClass(n: number): string {
  if (n > 0) return "text-emerald-600"
  if (n < 0) return "text-red-600"
  return "text-muted-foreground"
}

// ── Compare-side lookup maps (по key, без CNY-строк) ────────────────────────

function buildLineMap(section: BalanceSection): Map<string, number> {
  const map = new Map<string, number>()
  for (const group of section.groups) {
    for (const line of group.lines) {
      if (line.currency === "CNY") continue
      map.set(`${group.key}:${line.key}`, line.amountRub)
    }
  }
  return map
}

function buildGroupMap(section: BalanceSection): Map<string, number> {
  return new Map(section.groups.map((g) => [g.key, g.subtotalRub]))
}

// ── Δ ₽ / Δ % ячейки ─────────────────────────────────────────────────────

function DeltaCells({ current, compare }: { current: number; compare: number }) {
  const { abs, pct } = computeDelta(current, compare)
  const cls = deltaColorClass(abs)
  return (
    <>
      <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${cls}`}>{fmtDeltaRub(abs)}</td>
      <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${cls}`}>{fmtDeltaPct(pct)}</td>
    </>
  )
}

// ── Строка статьи ────────────────────────────────────────────────────────

function LineRow({
  groupKey,
  line,
  compareLineMap,
}: {
  groupKey: string
  line: BalanceLine
  compareLineMap: Map<string, number>
}) {
  const isCny = line.currency === "CNY"

  return (
    <tr>
      <td className="px-3 py-1.5 pl-8 border-b border-border/40">
        <span>{line.label}</span>
        {line.approximate && (
          <span title={line.note ?? "Приближённая оценка"} className="ml-1.5 text-amber-600 cursor-help">
            ⚠
          </span>
        )}
        {isCny && <span className="ml-1.5 text-xs text-muted-foreground">(справочно)</span>}
        {line.note && !line.approximate && (
          <div className="text-xs text-muted-foreground">{line.note}</div>
        )}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap border-b border-border/40">
        {isCny ? fmtCny(line.amountRub) : fmtRub(line.amountRub)}
      </td>
      {isCny ? (
        <td
          colSpan={3}
          className="px-3 py-1.5 text-center text-xs text-muted-foreground border-b border-border/40"
        >
          справочно, без дельты (валютная переоценка не выполняется, v1)
        </td>
      ) : (
        <>
          <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap border-b border-border/40">
            {fmtRub(compareLineMap.get(`${groupKey}:${line.key}`) ?? 0)}
          </td>
          <DeltaCells current={line.amountRub} compare={compareLineMap.get(`${groupKey}:${line.key}`) ?? 0} />
        </>
      )}
    </tr>
  )
}

// ── Группа (подытог "Итого {group.label}") ──────────────────────────────

function GroupBlock({
  group,
  compareGroupMap,
  compareLineMap,
}: {
  group: BalanceGroup
  compareGroupMap: Map<string, number>
  compareLineMap: Map<string, number>
}) {
  const compareSubtotal = compareGroupMap.get(group.key) ?? 0
  return (
    <>
      <tr>
        <td
          colSpan={5}
          className="px-3 pt-2 pb-0.5 text-xs font-medium text-muted-foreground uppercase tracking-wide"
        >
          {group.label}
        </td>
      </tr>
      {group.lines.map((line) => (
        <LineRow key={line.key} groupKey={group.key} line={line} compareLineMap={compareLineMap} />
      ))}
      <tr className="bg-muted font-medium">
        <td className="px-3 py-1.5 pl-6">Итого {group.label}</td>
        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtRub(group.subtotalRub)}</td>
        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtRub(compareSubtotal)}</td>
        <DeltaCells current={group.subtotalRub} compare={compareSubtotal} />
      </tr>
    </>
  )
}

// ── Секция (АКТИВЫ / ПАССИВЫ) ────────────────────────────────────────────

function SectionBlock({
  section,
  compareSection,
  totalLabel,
}: {
  section: BalanceSection
  compareSection: BalanceSection
  totalLabel: string
}) {
  const compareGroupMap = buildGroupMap(compareSection)
  const compareLineMap = buildLineMap(compareSection)
  return (
    <>
      <tr className="bg-muted font-semibold">
        <td colSpan={5} className="px-3 py-1.5 uppercase">
          {section.label}
        </td>
      </tr>
      {section.groups.map((group) => (
        <GroupBlock key={group.key} group={group} compareGroupMap={compareGroupMap} compareLineMap={compareLineMap} />
      ))}
      <tr className="bg-muted font-semibold">
        <td className="px-3 py-1.5">{totalLabel}</td>
        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtRub(section.totalRub)}</td>
        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtRub(compareSection.totalRub)}</td>
        <DeltaCells current={section.totalRub} compare={compareSection.totalRub} />
      </tr>
    </>
  )
}

// ── Главный компонент ────────────────────────────────────────────────────

export function BalanceSheetTable({ current, compare, currentLabel, compareLabel }: BalanceSheetTableProps) {
  const capitalDelta = computeDelta(current.capitalRub, compare.capitalRub)
  const capitalCls = deltaColorClass(capitalDelta.abs)

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="bg-background">
            <tr>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left font-semibold">
                Статья
              </th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right font-semibold whitespace-nowrap">
                На {currentLabel}
              </th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right font-semibold whitespace-nowrap">
                На {compareLabel}
              </th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right font-semibold whitespace-nowrap">
                Δ ₽
              </th>
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right font-semibold whitespace-nowrap">
                Δ %
              </th>
            </tr>
          </thead>
          <tbody>
            <SectionBlock section={current.assets} compareSection={compare.assets} totalLabel="ИТОГО АКТИВЫ" />
            <SectionBlock
              section={current.liabilities}
              compareSection={compare.liabilities}
              totalLabel="ИТОГО ПАССИВЫ"
            />
            <tr className="bg-muted font-bold">
              <td className="px-3 py-2">КАПИТАЛ</td>
              <td
                className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${current.capitalRub < 0 ? "text-red-600" : ""}`}
              >
                {fmtRub(current.capitalRub)}
              </td>
              <td
                className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${compare.capitalRub < 0 ? "text-red-600" : ""}`}
              >
                {fmtRub(compare.capitalRub)}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${capitalCls}`}>
                {fmtDeltaRub(capitalDelta.abs)}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${capitalCls}`}>
                {fmtDeltaPct(capitalDelta.pct)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {current.unvaluedStock.productCount > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-400">
            ⚠ Без оценки: {current.unvaluedStock.productCount} товаров, {current.unvaluedStock.qtySum} шт
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
            У перечисленных товаров нет себестоимости (ProductCost) — их остатки не включены в стоимость
            запасов. Баланс занижен на неизвестную величину.
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-medium text-amber-800 dark:text-amber-400">
              Показать товары
            </summary>
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground max-h-64 overflow-auto">
              {current.unvaluedStock.products.map((p) => (
                <li key={p.sku}>
                  {p.sku} {p.name} — {p.qty} шт
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  )
}
