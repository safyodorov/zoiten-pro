"use client"

// components/analytics/tabs/OverviewTab.tsx
// Phase 30 (ANL-08) — вкладка «Общая информация» (по умолчанию). Поля ТЗ §4:
// фото, бренд, артикул, продавец, рейтинг+отзывы, средняя цена/мес, сумма заказов/мес, конв.клик→заказ.
// Все 30 SKU. Sticky-заголовок — сплошной bg-background (CLAUDE.md §471).
import type { SkuPayload } from "@/lib/analytics/types"

const money = (n: number) => Math.round(n).toLocaleString("ru-RU")
const pct = (x: number) => `${(x * 100).toFixed(1)}%`

export function OverviewTab({ skus }: { skus: SkuPayload[] }) {
  return (
    <div className="overflow-auto h-full">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-left w-14">#</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-left w-16">Фото</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-left">Товар / бренд</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-left">Артикул</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-left">Продавец</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-right">Рейтинг</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-right">Отзывы</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-right">Ср. цена/мес</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-right">Сумма заказов/мес</th>
            <th className="sticky top-0 z-20 bg-background border-b p-2 text-right">Клик→заказ</th>
          </tr>
        </thead>
        <tbody>
          {skus.map((s, i) => (
            <tr key={s.nmId} className="hover:bg-muted/30">
              <td className="border-b p-2 text-muted-foreground tabular-nums">{i + 1}</td>
              <td className="border-b p-2">
                {s.mainPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.mainPhoto} alt="" className="h-14 w-auto rounded object-cover" loading="lazy" />
                ) : (
                  <div className="h-14 w-11 rounded bg-muted" />
                )}
              </td>
              <td className="border-b p-2">
                <div className="font-medium truncate max-w-[280px]">{s.name || "—"}</div>
                <div className="text-xs text-muted-foreground">{s.brand || "—"}</div>
              </td>
              <td className="border-b p-2 tabular-nums">{s.nmId}</td>
              <td className="border-b p-2 text-muted-foreground">{s.seller || "—"}</td>
              <td className="border-b p-2 text-right tabular-nums">{s.rating ?? "—"}</td>
              <td className="border-b p-2 text-right tabular-nums">{s.feedbacksCount ?? 0}</td>
              <td className="border-b p-2 text-right tabular-nums">{money(s.funnel.medianPriceWallet)} ₽</td>
              <td className="border-b p-2 text-right tabular-nums">{money(s.revenue)} ₽</td>
              <td className="border-b p-2 text-right tabular-nums">{pct(s.funnel.clickToOrder)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
