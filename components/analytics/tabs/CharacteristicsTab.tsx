"use client"

// components/analytics/tabs/CharacteristicsTab.tsx
// Phase 30 (ANL-08) — вкладка «Характеристики»: артикул+бренд, выручка+конв.клик→заказ,
// блок характеристик (name/value из card.json). Все 30 SKU. Sticky — сплошной bg-background.
import type { SkuPayload } from "@/lib/analytics/types"

const money = (n: number) => Math.round(n).toLocaleString("ru-RU")
const pct = (x: number) => `${(x * 100).toFixed(1)}%`

export function CharacteristicsTab({ skus }: { skus: SkuPayload[] }) {
  return (
    <div className="overflow-auto h-full">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-left w-12">#</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-left w-[220px]">Товар</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-right w-28">Выручка/мес</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-right w-24">Клик→заказ</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-left">Характеристики</th>
          </tr>
        </thead>
        <tbody>
          {skus.map((s, i) => (
            <tr key={s.nmId} className="hover:bg-muted/30 align-top">
              <td className="border-b p-2 text-muted-foreground tabular-nums">{i + 1}</td>
              <td className="border-b p-2">
                <div className="font-medium truncate max-w-[210px]">{s.name || "—"}</div>
                <div className="text-xs text-muted-foreground">{s.brand || "—"} · {s.nmId}</div>
              </td>
              <td className="border-b p-2 text-right tabular-nums">{money(s.revenue)} ₽</td>
              <td className="border-b p-2 text-right tabular-nums">{pct(s.funnel.clickToOrder)}</td>
              <td className="border-b p-2">
                {s.characteristics.length === 0 ? (
                  <span className="text-xs text-muted-foreground">нет характеристик</span>
                ) : (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 max-w-[720px]">
                    {s.characteristics.map((c, idx) => (
                      <div key={idx} className="flex justify-between gap-3 text-xs border-b border-border/40 py-0.5">
                        <span className="text-muted-foreground truncate">{c.name}</span>
                        <span className="text-right truncate">{c.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
