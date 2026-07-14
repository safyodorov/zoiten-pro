// lib/finance-weekly/clothing-net.ts
//
// Quick 260714-gt7: pure-хелпер нетто-агрегации базиса одежды (clothing) в
// понедельном фин-отчёте /finance/weekly. Заменяет прежний GROSS-базис (W2d,
// Фикс 1) на НЕТТО (выкупы − возвраты) — на 10 проверенных артикулах недели
// 06.07–12.07 нетто совпадает с цифрами экономиста (пример 848714305:
// выкупы 12 − возвраты 4 = 8 = Excel), GROSS-решение опровергнуто сверкой.
//
// Конвенция БД (WbSalesDaily, см. prisma/schema.prisma):
//   buyoutsCount Int   — счётчик выкупов, ПОЛОЖИТЕЛЬНЫЙ
//   buyoutsRub   Float — Σ priceWithDisc по выкупам, ПОЛОЖИТЕЛЬНАЯ
//   returnsCount Int   — счётчик возвратов, ПОЛОЖИТЕЛЬНЫЙ
//   returnsRub   Float — Σ priceWithDisc по возвратам, ОТРИЦАТЕЛЬНАЯ
// → qty = buyoutsCount − returnsCount (вычитание, оба положительные)
// → rub = buyoutsRub + returnsRub (сложение, т.к. returnsRub уже < 0)
//
// Кламп применяется к НЕДЕЛЬНОМУ агрегату per nmId (не к дневным значениям) —
// отрицательное нетто (возвратов за неделю больше, чем выкупов) клампится в 0,
// rub при этом не клампится (deliver.rub не участвует в делении, если qty=0 —
// артикул отсекается guard'ом qty<=0 в data.ts до вычисления K = rub/qty).
//
// Канонический прецедент нетто-агрегации в проекте:
//   lib/sales-plan/data.ts:678       → buyoutsRub + returnsRub
//   app/actions/sales-plan.ts:880    → Math.max(0, buyoutsCount − returnsCount)

export interface ClothingSalesAgg {
  buyoutsCount: number
  buyoutsRub: number
  returnsCount: number
  returnsRub: number
}

/** Нетто qty/rub базиса одежды за неделю per nmId (выкупы − возвраты). */
export function netClothingSales(agg: ClothingSalesAgg): { qty: number; rub: number } {
  const qty = Math.max(0, (agg.buyoutsCount ?? 0) - (agg.returnsCount ?? 0))
  const rub = (agg.buyoutsRub ?? 0) + (agg.returnsRub ?? 0)
  return { qty, rub }
}
