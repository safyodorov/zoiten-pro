// components/finance-models/FinanceModelView.tsx
// Клиентский раздел «Финансовые модели»: редактор параметров + сравнение + вкладки вариантов.
// Движок pure → пересчёт в useMemo при изменении параметров.
"use client"

import { useMemo, useState } from "react"
import { runModel } from "@/lib/finance-model/engine"
import { DEFAULT_PARAMS, DEFAULT_VARIANTS, PRODUCTS } from "@/lib/finance-model/inputs"
import type { GlobalParams, VariantConfig } from "@/lib/finance-model/types"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ParamsEditor } from "./ParamsEditor"
import { ComparisonSummary } from "./ComparisonSummary"
import { VariantPanel } from "./VariantPanel"

export function FinanceModelView() {
  const [params, setParams] = useState<GlobalParams>(DEFAULT_PARAMS)
  const [variants, setVariants] = useState<VariantConfig[]>(DEFAULT_VARIANTS)

  const model = useMemo(() => runModel(PRODUCTS, params, variants), [params, variants])

  const reset = () => {
    setParams(DEFAULT_PARAMS)
    setVariants(DEFAULT_VARIANTS)
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
