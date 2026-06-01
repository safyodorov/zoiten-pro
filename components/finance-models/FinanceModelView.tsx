// components/finance-models/FinanceModelView.tsx
// Клиентский раздел «Финансовые модели»: редактор параметров + сравнение + вкладки вариантов.
// Движок pure → пересчёт в useMemo при изменении параметров.
"use client"

import { useMemo, useState } from "react"
import { runModel } from "@/lib/finance-model/engine"
import { DEFAULT_PARAMS, DEFAULT_VARIANTS, PRODUCTS } from "@/lib/finance-model/inputs"
import type { GlobalParams, ProductInput, VariantConfig } from "@/lib/finance-model/types"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ParamsEditor } from "./ParamsEditor"
import { ComparisonSummary } from "./ComparisonSummary"
import { VariantPanel } from "./VariantPanel"
import { ProductsTable } from "./ProductsTable"

export function FinanceModelView() {
  const [params, setParams] = useState<GlobalParams>(DEFAULT_PARAMS)
  const [variants, setVariants] = useState<VariantConfig[]>(DEFAULT_VARIANTS)
  const [products, setProducts] = useState<ProductInput[]>(PRODUCTS)

  const model = useMemo(() => runModel(products, params, variants), [products, params, variants])

  const setProduct = (index: number, patch: Partial<ProductInput>) =>
    setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))

  const reset = () => {
    setParams(DEFAULT_PARAMS)
    setVariants(DEFAULT_VARIANTS)
    setProducts(PRODUCTS)
  }

  return (
    <div className="space-y-6">
      <ParamsEditor
        params={params}
        variants={variants}
        onParamsChange={setParams}
        onVariantsChange={setVariants}
        onReset={reset}
      />

      <section>
        <h2 className="mb-2 text-base font-semibold">Товары: рентабельность, оборачиваемость, потребность в оборотке</h2>
        <ProductsTable products={products} metrics={model.productMetrics} onChange={setProduct} />
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Сравнение вариантов финансирования</h2>
        <ComparisonSummary model={model} />
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Помесячные модели по вариантам</h2>
        <Tabs defaultValue="2" className="w-full">
          <TabsList>
            {model.variants.map((v) => (
              <TabsTrigger key={v.config.id} value={String(v.config.id)}>
                Вариант {v.config.id}
              </TabsTrigger>
            ))}
          </TabsList>
          {model.variants.map((v) => (
            <TabsContent key={v.config.id} value={String(v.config.id)} className="mt-4">
              <div className="mb-3 text-sm text-muted-foreground">{v.config.label}</div>
              <VariantPanel variant={v} />
            </TabsContent>
          ))}
        </Tabs>
      </section>
    </div>
  )
}
