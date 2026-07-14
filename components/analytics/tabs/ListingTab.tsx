"use client"

// components/analytics/tabs/ListingTab.tsx
// Phase 30 (ANL-08) — вкладка «Листинг»: артикул+бренд, узкие колонки выручки и конв.клик→заказ,
// КРУПНО 5 фото листинга (приоритет по площади). Все 30 SKU. Sticky — сплошной bg-background.
import type { SkuPayload } from "@/lib/analytics/types"

const money = (n: number) => Math.round(n).toLocaleString("ru-RU")
const pct = (x: number) => `${(x * 100).toFixed(1)}%`

export function ListingTab({ skus }: { skus: SkuPayload[] }) {
  return (
    <div className="overflow-auto h-full">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-left w-12">#</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-left w-[200px]">Товар</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-right w-28">Выручка/мес</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-right w-24">Клик→заказ</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-left">Листинг (5 фото)</th>
          </tr>
        </thead>
        <tbody>
          {skus.map((s, i) => (
            <tr key={s.nmId} className="hover:bg-muted/30 align-top">
              <td className="border-b p-2 text-muted-foreground tabular-nums">{i + 1}</td>
              <td className="border-b p-2">
                <div className="font-medium truncate max-w-[190px]">{s.name || "—"}</div>
                <div className="text-xs text-muted-foreground">{s.brand || "—"} · {s.nmId}</div>
              </td>
              <td className="border-b p-2 text-right tabular-nums">{money(s.revenue)} ₽</td>
              <td className="border-b p-2 text-right tabular-nums">{pct(s.funnel.clickToOrder)}</td>
              <td className="border-b p-2">
                <div className="flex gap-2">
                  {s.listingPhotos.length === 0 ? (
                    <span className="text-xs text-muted-foreground">нет фото</span>
                  ) : (
                    s.listingPhotos.slice(0, 5).map((url, idx) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={idx}
                        src={url}
                        alt=""
                        className="h-40 w-auto rounded-md border object-cover"
                        loading="lazy"
                      />
                    ))
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
