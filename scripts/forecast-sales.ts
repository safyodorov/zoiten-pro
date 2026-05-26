// scripts/forecast-sales.ts
// Прогноз выкупов до END_DATE — CLI-обёртка над lib/sales-forecast.ts.
// Логика и fallback chain — в lib (единый источник правды между дашбордом и скриптом).
//
// Запуск на VPS:
//   cd /opt/zoiten-pro
//   DATABASE_URL=$(grep '^DATABASE_URL' /etc/zoiten.pro.env | cut -d= -f2-) \
//     npx tsx scripts/forecast-sales.ts [YYYY-MM-DD]
//
// Без аргумента — END_DATE=2026-06-30.

import { computeForecast, getMskTodayIso } from "@/lib/sales-forecast"

const DEFAULT_END = "2026-06-30"
const MAY_END = "2026-05-31"

function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}
function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + "%"
}

function sourceMarker(s: string): string {
  if (s === "subcategory") return "↑"
  if (s === "global") return "*"
  return ""
}

async function main() {
  const arg = process.argv[2]
  const endDate = arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : DEFAULT_END
  const today = getMskTodayIso()

  console.error(`\nПрогноз продаж ${today} → ${endDate}\n`)
  const result = await computeForecast({ endDate, today })
  const { products, globalBuyoutPct, bySource } = result
  console.error(`  Товаров: ${products.length}`)
  console.error(
    `  Источники % выкупа: own=${bySource.own}, legacy=${bySource.legacy}, subcategory=${bySource.subcategory}, global=${bySource.global}`,
  )
  console.error(`  Глобальный % выкупа: ${fmtPct(globalBuyoutPct)}\n`)

  // Сортировка по выручке
  const sorted = [...products].sort((a, b) => b.salesRub - a.salesRub)

  // ── Таблица ──
  const headers = [
    "SKU",
    "Название",
    "Стат",
    "База/день",
    "Цена",
    "Выкуп%",
    "Подкат",
    "План",
    "Приход",
    "Дата прих.",
    "Заказы шт",
    "Продажи шт",
    "Продажи ₽",
  ]
  console.log(headers.join("\t"))
  for (const r of sorted) {
    const row = [
      r.sku,
      r.name.length > 40 ? r.name.slice(0, 38) + "…" : r.name,
      fmtNum(r.stockNow),
      fmtNum(r.baselineOrdersPerDay, 2),
      fmtNum(r.avgPrice),
      fmtPct(r.buyoutPct) + sourceMarker(r.buyoutSource),
      r.subcategoryName ?? "—",
      r.plannedTargetPerDay != null ? fmtNum(r.plannedTargetPerDay, 1) : "—",
      r.arrivalQty > 0 ? fmtNum(r.arrivalQty) : "—",
      r.arrivalDate ?? "—",
      fmtNum(r.ordersUnits, 1),
      fmtNum(r.salesUnits, 1),
      fmtNum(r.salesRub),
    ]
    console.log(row.join("\t"))
  }

  // ── Итоги ──
  const totalUnits = products.reduce((s, p) => s + p.salesUnits, 0)
  const totalRub = products.reduce((s, p) => s + p.salesRub, 0)
  const totalOrders = products.reduce((s, p) => s + p.ordersUnits, 0)
  // Per-month разбивка
  let mayUnits = 0
  let mayRub = 0
  let juneUnits = 0
  let juneRub = 0
  for (const p of products) {
    for (const d of p.dailySales) {
      if (d.date <= MAY_END) {
        mayUnits += d.units
        mayRub += d.rub
      } else {
        juneUnits += d.units
        juneRub += d.rub
      }
    }
  }

  console.log("")
  console.log(`↑ — % по подкатегории (нет своей funnel-истории)`)
  console.log(`* — % глобальный (нет ни своей, ни по подкатегории)`)
  console.log("")
  console.log(
    `МАЙ-остаток: ${fmtNum(mayUnits, 1)} шт / ${fmtNum(mayRub)} ₽`,
  )
  console.log(`ИЮНЬ:        ${fmtNum(juneUnits, 1)} шт / ${fmtNum(juneRub)} ₽`)
  console.log("")
  console.log(`ИТОГО ЗАКАЗОВ (шт):   ${fmtNum(totalOrders, 1)}`)
  console.log(`ИТОГО ВЫКУПОВ (шт):   ${fmtNum(totalUnits, 1)}`)
  console.log(`ИТОГО ВЫРУЧКА (₽):    ${fmtNum(totalRub)}`)
  console.log("")
  console.log("TOP-10 ПО ВЫРУЧКЕ:")
  for (let i = 0; i < Math.min(10, sorted.length); i++) {
    const r = sorted[i]
    console.log(
      `  ${i + 1}. ${r.sku} ${r.name.slice(0, 50)}: ${fmtNum(r.salesUnits, 1)} шт / ${fmtNum(r.salesRub)} ₽ ${sourceMarker(r.buyoutSource)}`,
    )
  }
}

main().catch((err) => {
  console.error("ERROR:", err)
  process.exit(1)
})
