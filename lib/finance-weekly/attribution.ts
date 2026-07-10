// lib/finance-weekly/attribution.ts
//
// W2d (quick 260710-hkj, Фикс 3): распределение недельного тотала рекламы по nmId.
//
// Почему upd: /adv/v1/upd — ground truth списаний с рекламного счёта (WB Медиа,
// баланс, счёт, бонусы — ВСЕ типы). fullstats (WbAdvertStatDaily.sum) недосчитывает
// ~30% (сверка 2026-07-10: 578 950 ₽ fullstats vs 820 853 ₽ upd за неделю).
// Поэтому ТОТАЛ недели = Σ WbAdvertSpendRow.updSum, а fullstats используется
// только как ДОЛИ распределения по nmId.
//
// Нераспределённый остаток updTotal (доля nmId вне переданной map — непривязанные
// к товарам артикулы) в водопад затрат НЕ добавляется — известное v1-ограничение,
// задокументировано в SUMMARY.
//
// Pure — ноль импортов (паттерн lib/finance-weekly/types.ts).

/**
 * Раскладывает updTotal (₽ списаний недели) по nmId пропорционально долям.
 *
 * @param updTotal    Σ WbAdvertSpendRow.updSum за неделю (ground truth)
 * @param sharesByNmId числители долей — fullstats spend per nmId (только nmId отчёта)
 * @param totalShares знаменатель — Σ fullstats по ВСЕМ nmId недели (может быть
 *                    больше Σ переданной map: доля непривязанных nmId остаётся
 *                    нераспределённой намеренно)
 *
 * value = updTotal × (share / totalShares) — float без округления
 * (display-округление делает UI, паттерн distributePlanAcrossNmIds).
 *
 * Guard: totalShares <= 0 || updTotal === 0 → все nmId получают 0 (не NaN/Infinity).
 */
export function attributeSpendByShares(
  updTotal: number,
  sharesByNmId: ReadonlyMap<number, number>,
  totalShares: number,
): Map<number, number> {
  const result = new Map<number, number>()

  if (totalShares <= 0 || updTotal === 0) {
    for (const nmId of sharesByNmId.keys()) result.set(nmId, 0)
    return result
  }

  for (const [nmId, share] of sharesByNmId) {
    result.set(nmId, updTotal * (share / totalShares))
  }
  return result
}
