// components/finance-models/FinanceModelView.tsx
// Клиентский раздел «Финансовые модели».
// Две независимые оси сценариев (собственные средства × дельта рентабельности):
// матрица KPI + детальные помесячные таблицы выбранной комбинации.
// Движок pure → пересчёт в useMemo при изменении параметров/осей/товаров.
"use client"

import { useMemo, useState } from "react"
import { simulateVariant, computeProductMetrics } from "@/lib/finance-model/engine"
import { DEFAULT_PARAMS, PRODUCTS } from "@/lib/finance-model/inputs"
import type { GlobalParams, ProductInput, VariantResult } from "@/lib/finance-model/types"
import { ParamsEditor } from "./ParamsEditor"
import { ScenarioMatrix } from "./ScenarioMatrix"
import { VariantPanel } from "./VariantPanel"
import { ProductsTable } from "./ProductsTable"
import { mln } from "./format"

const DEFAULT_OWN_FUNDS = [0, 10_000_000, 20_000_000, 30_000_000]
const DEFAULT_MARGIN_DELTAS = [-0.01, 0, 0.01]
// Индекс варианта «20 млн» в DEFAULT_OWN_FUNDS — выбран по умолчанию в детальном просмотре.
const DEFAULT_OWN_IDX = 2
const DEFAULT_MARGIN_IDX = 1

function deltaLabel(d: number): string {
  if (Math.abs(d) < 1e-9) return "база"
  const pp = Math.round(d * 1000) / 10
  return `${pp > 0 ? "+" : ""}${pp} пп`
}

export function FinanceModelView() {
  const [params, setParams] = useState<GlobalParams>(DEFAULT_PARAMS)
  const [products, setProducts] = useState<ProductInput[]>(PRODUCTS)
  const [ownFundsLevels, setOwnFundsLevels] = useState<number[]>(DEFAULT_OWN_FUNDS)
  const [marginDeltas, setMarginDeltas] = useState<number[]>(DEFAULT_MARGIN_DELTAS)
  const [sel, setSel] = useState<{ ownIdx: number; marginIdx: number }>({ ownIdx: DEFAULT_OWN_IDX, marginIdx: DEFAULT_MARGIN_IDX })

  const setProduct = (index: number, patch: Partial<ProductInput>) =>
    setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))

  // Метрики товаров (на базовой марже) — считаются отдельно.
  const productMetrics = useMemo(
    () => computeProductMetrics(products, params),
    [products, params],
  )

  // Матрица результатов: [ownIdx][marginIdx]
  const results: VariantResult[][] = useMemo(
    () =>
      ownFundsLevels.map((ownFunds, i) =>
        marginDeltas.map((marginDeltaPct, j) =>
          simulateVariant(products, params, {
            id: i * 1000 + j,
            label: `Собств. ${mln(ownFunds)} млн · маржа ${deltaLabel(marginDeltaPct)}`,
            ownFunds,
            marginDeltaPct,
          }),
        ),
      ),
    [products, params, ownFundsLevels, marginDeltas],
  )

  // Безопасный выбранный индекс (на случай удаления значений оси)
  const ownIdx = Math.min(sel.ownIdx, ownFundsLevels.length - 1)
  const marginIdx = Math.min(sel.marginIdx, marginDeltas.length - 1)
  const selected = results[ownIdx]?.[marginIdx]

  const reset = () => {
    setParams(DEFAULT_PARAMS)
    setProducts(PRODUCTS)
    setOwnFundsLevels(DEFAULT_OWN_FUNDS)
    setMarginDeltas(DEFAULT_MARGIN_DELTAS)
    setSel({ ownIdx: DEFAULT_OWN_IDX, marginIdx: DEFAULT_MARGIN_IDX })
  }

  return (
    <div className="space-y-6">
      <ParamsEditor
        params={params}
        ownFundsLevels={ownFundsLevels}
        marginDeltas={marginDeltas}
        onParamsChange={setParams}
        onOwnFundsChange={setOwnFundsLevels}
        onMarginDeltasChange={setMarginDeltas}
        onReset={reset}
      />

      <section>
        <h2 className="mb-2 text-base font-semibold">Товары: рентабельность, оборачиваемость, потребность в оборотке</h2>
        <ProductsTable products={products} metrics={productMetrics} onChange={setProduct} />
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Матрица сценариев: собственные средства × рентабельность</h2>
        <ScenarioMatrix
          ownFundsLevels={ownFundsLevels}
          marginDeltas={marginDeltas}
          results={results}
          selected={{ ownIdx, marginIdx }}
          onSelect={(o, m) => setSel({ ownIdx: o, marginIdx: m })}
        />
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">Детальные модели по выбранной комбинации</h2>
          <div className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-1">
              <span className="text-muted-foreground">Собств.:</span>
              <select
                value={ownIdx}
                onChange={(e) => setSel((s) => ({ ...s, ownIdx: Number(e.target.value) }))}
                className="h-8 rounded-md border bg-background px-2"
              >
                {ownFundsLevels.map((of, i) => (
                  <option key={i} value={i}>{mln(of)} млн ₽</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <span className="text-muted-foreground">Маржа:</span>
              <select
                value={marginIdx}
                onChange={(e) => setSel((s) => ({ ...s, marginIdx: Number(e.target.value) }))}
                className="h-8 rounded-md border bg-background px-2"
              >
                {marginDeltas.map((d, j) => (
                  <option key={j} value={j}>{deltaLabel(d)}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {selected && <VariantPanel variant={selected} />}
      </section>
    </div>
  )
}
