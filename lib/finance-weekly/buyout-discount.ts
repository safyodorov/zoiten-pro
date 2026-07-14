// lib/finance-weekly/buyout-discount.ts
//
// Quick 260714-maz: pure-хелпер дисконта базиса БЫТОВОЙ ТЕХНИКИ (appliances) в
// понедельном фин-отчёте /finance/weekly. Модель экономиста: недельное кол-во
// H = заказы × (rolling-% выкупа / 100) — его лист H = F × коэф (неделя 22.06
// коэф 0.87). База остаётся ЗАКАЗЫ (WbCardFunnelDaily), пересчитывается в
// «выкупленные» единицы. rolling-% — тот же, что подключён к N_std
// (quick 260714-kuh, loadBuyoutPctRolling30dMap → BuyoutResolver.resolve).
//
// Инвариант: сумму дисконтируем ТЕМ ЖЕ коэффициентом → grossPricePerUnit
// K = rub/qty = ordersSumRub/сырые_заказы СОХРАНЯЕТСЯ; выручка K×H =
// ordersSumRub × %выкупа/100. Per-unit статьи из недельных ТОТАЛОВ (реклама,
// отзывы, логистика ИУ = deliveryRub/H) ложатся на выкупленные ед., тоталы
// затрат не искажаются. НЕ округляем (движок линеен; экономист — дробный H).
//
// Одежда (clothing) сюда НЕ идёт — нетто-выкупы (lib/finance-weekly/clothing-net.ts).

/** Дисконт бытовой техники: {qty, rub} = сырые × (buyoutPct/100). Коэффициент
 *  общий → K=rub/qty сохраняет валовую цену/ед. buyoutPct в процентах. */
export function discountAppliancesByBuyout(
  rawOrders: number,
  rawRub: number,
  buyoutPct: number,
): { qty: number; rub: number } {
  const factor = buyoutPct / 100
  return { qty: rawOrders * factor, rub: rawRub * factor }
}
