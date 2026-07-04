"use client"
// components/finance/BalanceSheetTable.tsx
// Phase 24 Plan 24-07 — вертикальная таблица баланса: АКТИВЫ → ПАССИВЫ → КАПИТАЛ (D-06),
// с двумя датами и колонками дельты Δ₽/Δ% (D-09).
//
// 260704-cvz: client-компонент с expandable строками (useState), chevron-кнопки,
// рекурсивный рендер детей с нарастающим отступом по глубине.
//
// CNY-строки (line.currency==="CNY", m4/Pitfall 2): справочные, НЕ входят в рублёвые
// subtotal/total (это уже сделано в lib/balance-data.ts sumRubLines) — дельта для них
// не считается, значение показывается с ¥, не ₽.

import { useState } from "react"
import { ChevronRight, ChevronDown } from "lucide-react"
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

// ── Compare-side lookup maps ──────────────────────────────────────────────────

/**
 * Рекурсивно обходит дерево BalanceLine и добавляет все узлы (включая вложенные children)
 * в map: `${groupKey}:${node.key}` → amountRub.
 * Поскольку child.key уже является полным path-ключом (вида "bank-rub/acct:..."),
 * достаточно использовать его напрямую.
 */
function addLineToMap(map: Map<string, number>, groupKey: string, node: BalanceLine): void {
  if (node.currency === "CNY") return // CNY-строки без дельты
  map.set(`${groupKey}:${node.key}`, node.amountRub)
  if (node.children) {
    for (const child of node.children) {
      addLineToMap(map, groupKey, child)
    }
  }
}

function buildLineMap(section: BalanceSection): Map<string, number> {
  const map = new Map<string, number>()
  for (const group of section.groups) {
    for (const line of group.lines) {
      addLineToMap(map, group.key, line)
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

// ── Отступ по глубине ─────────────────────────────────────────────────────

const DEPTH_PADDING: Record<number, string> = {
  0: "pl-8",
  1: "pl-12",
  2: "pl-16",
  3: "pl-20",
}

function paddingForDepth(depth: number): string {
  return DEPTH_PADDING[depth] ?? "pl-24"
}

// ── Рекурсивный рендер дерева детализации ────────────────────────────────

/**
 * Рекурсивно рендерит узел дерева и его детей.
 * Возвращает массив <tr> (JSX-фрагменты).
 *
 * @param node          - узел BalanceLine (может иметь children)
 * @param depth         - глубина вложенности (0 = верхний уровень строки)
 * @param groupKey      - ключ группы для compare-lookup
 * @param compareLineMap - Map compare-стороны для δ
 * @param expandedKeys  - Set раскрытых ключей
 * @param toggle        - функция toggle по ключу
 * @param currentLabel  - заголовок текущей даты
 * @param compareLabel  - заголовок сравниваемой даты
 */
function renderLineTree(
  node: BalanceLine,
  depth: number,
  groupKey: string,
  compareLineMap: Map<string, number>,
  expandedKeys: Set<string>,
  toggle: (key: string) => void,
  currentLabel: string,
  compareLabel: string
): React.ReactNode[] {
  const hasChildren = node.children && node.children.length > 0
  const isExpanded = hasChildren && expandedKeys.has(node.key)
  const compareAmount = compareLineMap.get(`${groupKey}:${node.key}`) ?? 0
  const paddingClass = paddingForDepth(depth)

  const rows: React.ReactNode[] = [
    <tr key={node.key}>
      <td className={`px-3 py-1.5 ${paddingClass} border-b border-border/40`}>
        <span className="flex items-center gap-1">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(node.key)}
              aria-label={isExpanded ? "Свернуть" : "Развернуть"}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            // Плейсхолдер-отступ для выравнивания листовых узлов
            <span className="inline-block w-[14px] shrink-0" />
          )}
          <span>{node.label}</span>
        </span>
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap border-b border-border/40">
        {fmtRub(node.amountRub)}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap border-b border-border/40">
        {fmtRub(compareAmount)}
      </td>
      <DeltaCells current={node.amountRub} compare={compareAmount} />
    </tr>,
  ]

  // Рекурсивно рендерим детей, если узел раскрыт
  if (isExpanded && node.children) {
    for (const child of node.children) {
      const childRows = renderLineTree(
        child,
        depth + 1,
        groupKey,
        compareLineMap,
        expandedKeys,
        toggle,
        currentLabel,
        compareLabel
      )
      rows.push(...childRows)
    }
  }

  return rows
}

// ── Строка статьи ─────────────────────────────────────────────────────────

function LineRow({
  groupKey,
  line,
  compareLineMap,
  expandedKeys,
  toggle,
  currentLabel,
  compareLabel,
}: {
  groupKey: string
  line: BalanceLine
  compareLineMap: Map<string, number>
  expandedKeys: Set<string>
  toggle: (key: string) => void
  currentLabel: string
  compareLabel: string
}) {
  const isCny = line.currency === "CNY"
  const hasChildren = !isCny && line.children && line.children.length > 0
  const isExpanded = hasChildren && expandedKeys.has(line.key)

  return (
    <>
      <tr>
        <td className="px-3 py-1.5 pl-8 border-b border-border/40">
          <span className="flex items-center gap-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggle(line.key)}
                aria-label={isExpanded ? "Свернуть" : "Развернуть"}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              // Плейсхолдер-отступ для выравнивания (CNY-строки и строки без children)
              <span className="inline-block w-[14px] shrink-0" />
            )}
            <span>{line.label}</span>
            {line.approximate && (
              <span title={line.note ?? "Приближённая оценка"} className="ml-1.5 text-amber-600 cursor-help">
                ⚠
              </span>
            )}
            {isCny && <span className="ml-1.5 text-xs text-muted-foreground">(справочно)</span>}
          </span>
          {line.note && !line.approximate && (
            <div className="text-xs text-muted-foreground pl-[18px]">{line.note}</div>
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
      {/* Рекурсивный рендер детей при раскрытии (depth=1, т.к. верхний уровень = LineRow) */}
      {isExpanded &&
        line.children!.map((child) =>
          renderLineTree(
            child,
            1, // depth 1 (дети верхнеуровневой строки)
            groupKey,
            compareLineMap,
            expandedKeys,
            toggle,
            currentLabel,
            compareLabel
          )
        )}
    </>
  )
}

// ── Группа (подытог "Итого {group.label}") ──────────────────────────────

function GroupBlock({
  group,
  compareGroupMap,
  compareLineMap,
  expandedKeys,
  toggle,
  currentLabel,
  compareLabel,
}: {
  group: BalanceGroup
  compareGroupMap: Map<string, number>
  compareLineMap: Map<string, number>
  expandedKeys: Set<string>
  toggle: (key: string) => void
  currentLabel: string
  compareLabel: string
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
        <LineRow
          key={line.key}
          groupKey={group.key}
          line={line}
          compareLineMap={compareLineMap}
          expandedKeys={expandedKeys}
          toggle={toggle}
          currentLabel={currentLabel}
          compareLabel={compareLabel}
        />
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
  expandedKeys,
  toggle,
  currentLabel,
  compareLabel,
}: {
  section: BalanceSection
  compareSection: BalanceSection
  totalLabel: string
  expandedKeys: Set<string>
  toggle: (key: string) => void
  currentLabel: string
  compareLabel: string
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
        <GroupBlock
          key={group.key}
          group={group}
          compareGroupMap={compareGroupMap}
          compareLineMap={compareLineMap}
          expandedKeys={expandedKeys}
          toggle={toggle}
          currentLabel={currentLabel}
          compareLabel={compareLabel}
        />
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
  // Состояние раскрытых строк (иммутабельное обновление Set)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  function toggle(key: string): void {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
            <SectionBlock
              section={current.assets}
              compareSection={compare.assets}
              totalLabel="ИТОГО АКТИВЫ"
              expandedKeys={expandedKeys}
              toggle={toggle}
              currentLabel={currentLabel}
              compareLabel={compareLabel}
            />
            <SectionBlock
              section={current.liabilities}
              compareSection={compare.liabilities}
              totalLabel="ИТОГО ПАССИВЫ"
              expandedKeys={expandedKeys}
              toggle={toggle}
              currentLabel={currentLabel}
              compareLabel={compareLabel}
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
