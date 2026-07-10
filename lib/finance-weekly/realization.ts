// lib/finance-weekly/realization.ts
//
// W1 (quick 260710-jgs): pure-хелперы агрегации/распределения недельного отчёта
// реализации WB (WbRealizationWeekly) для lib/finance-weekly/data.ts.
//
// ИУ-факт из реализации: баллы за отзывы (reviewPoints), возвратная логистика
// (delivery), пулы хранения (storage) и приёмки/штрафов (acceptance+penalty).
// forPayRub / promotionRub / deductionOtherRub здесь НЕ используются —
// только хранение/сверка (D-scope 2026-07-10).
//
// Account-level строки (nmId=0 — удержания без nm_id) распределяются
// пропорционально выручке (reviewPoints per nmId) или базам вселенных (пулы).
// Бакеты nmId, не разрешившихся ни в один universe (непривязанные артикулы),
// присоединяются к account-level — иначе их суммы тихо терялись бы.
//
// Pure — ноль импортов Prisma / React / Next (паттерн attribution.ts).

export interface RealizationBuckets {
  forPayRub: number
  deliveryRub: number
  storageRub: number
  acceptanceRub: number
  penaltyRub: number
  reviewPointsRub: number
  promotionRub: number
  deductionOtherRub: number
}

/** Строка WbRealizationWeekly (сериализуемый вход — без Prisma-типов). */
export interface RealizationRow extends RealizationBuckets {
  nmId: number
}

export interface RealizationPoolTotals {
  storageAppl: number
  storageCloth: number
  acceptanceAppl: number
  acceptanceCloth: number
}

function emptyBuckets(): RealizationBuckets {
  return {
    forPayRub: 0,
    deliveryRub: 0,
    storageRub: 0,
    acceptanceRub: 0,
    penaltyRub: 0,
    reviewPointsRub: 0,
    promotionRub: 0,
    deductionOtherRub: 0,
  }
}

const BUCKET_KEYS = [
  "forPayRub",
  "deliveryRub",
  "storageRub",
  "acceptanceRub",
  "penaltyRub",
  "reviewPointsRub",
  "promotionRub",
  "deductionOtherRub",
] as const

function addInto(target: RealizationBuckets, source: RealizationBuckets): void {
  for (const key of BUCKET_KEYS) target[key] += source[key]
}

/**
 * Разделяет строки недели: nmId=0 (account-level, удержания без nm_id) →
 * accountLevel; остальные → byNmId (суммируются при дублях).
 */
export function splitRealizationRows(rows: RealizationRow[]): {
  byNmId: Map<number, RealizationBuckets>
  accountLevel: RealizationBuckets
} {
  const byNmId = new Map<number, RealizationBuckets>()
  const accountLevel = emptyBuckets()
  for (const row of rows) {
    if (row.nmId === 0) {
      addInto(accountLevel, row)
      continue
    }
    let buckets = byNmId.get(row.nmId)
    if (!buckets) {
      buckets = emptyBuckets()
      byNmId.set(row.nmId, buckets)
    }
    addInto(buckets, row)
  }
  return { byNmId, accountLevel }
}

/**
 * Раскладывает total (₽) по nmId пропорционально выручке.
 * Σ долей = total (float без округления — display-округление делает UI).
 * Guard: пустая/нулевая база → все доли 0 (не NaN/Infinity).
 */
export function distributeByRevenue(
  total: number,
  revenueByNmId: ReadonlyMap<number, number>,
): Map<number, number> {
  const result = new Map<number, number>()
  let base = 0
  for (const rev of revenueByNmId.values()) base += rev > 0 ? rev : 0
  if (base <= 0 || total === 0) {
    for (const nmId of revenueByNmId.keys()) result.set(nmId, 0)
    return result
  }
  for (const [nmId, rev] of revenueByNmId) {
    result.set(nmId, total * ((rev > 0 ? rev : 0) / base))
  }
  return result
}

/**
 * Пулы хранения и приёмки/штрафов per universe из реализации:
 *   storage = Σ storageRub nmId своей вселенной + account-level доля;
 *   acceptance = Σ (acceptanceRub + penaltyRub) аналогично.
 *
 * universeByNmId ОБЯЗАН строиться из ВСЕХ привязанных WB-артикулов
 * (productByNmId в data.ts), НЕ из candidates недели — товары без продаж
 * (qty<=0) всё равно несут хранение/приёмку и попадают в пул своей вселенной.
 *
 * Бакеты nmId вне universeByNmId (непривязанные артикулы) присоединяются
 * к account-level для пропорционального распределения по базам —
 * их суммы НЕ теряются.
 *
 * Guard: combinedBase=0 → account-level доля 0 (не NaN).
 */
export function buildRealizationPools(
  byNmId: ReadonlyMap<number, RealizationBuckets>,
  accountLevel: RealizationBuckets,
  universeByNmId: ReadonlyMap<number, "appliances" | "clothing">,
  applBase: number,
  clothBase: number,
): RealizationPoolTotals {
  let storageAppl = 0
  let storageCloth = 0
  let acceptanceAppl = 0
  let acceptanceCloth = 0
  let unresolvedStorage = 0
  let unresolvedAcceptance = 0

  for (const [nmId, b] of byNmId) {
    const universe = universeByNmId.get(nmId)
    const acceptance = b.acceptanceRub + b.penaltyRub
    if (universe === "appliances") {
      storageAppl += b.storageRub
      acceptanceAppl += acceptance
    } else if (universe === "clothing") {
      storageCloth += b.storageRub
      acceptanceCloth += acceptance
    } else {
      unresolvedStorage += b.storageRub
      unresolvedAcceptance += acceptance
    }
  }

  const combinedBase = applBase + clothBase
  const applShare = combinedBase > 0 ? applBase / combinedBase : 0
  const clothShare = combinedBase > 0 ? clothBase / combinedBase : 0

  const accountStorage = accountLevel.storageRub + unresolvedStorage
  const accountAcceptance =
    accountLevel.acceptanceRub + accountLevel.penaltyRub + unresolvedAcceptance

  return {
    storageAppl: storageAppl + accountStorage * applShare,
    storageCloth: storageCloth + accountStorage * clothShare,
    acceptanceAppl: acceptanceAppl + accountAcceptance * applShare,
    acceptanceCloth: acceptanceCloth + accountAcceptance * clothShare,
  }
}

// ── Per-бакет выбор источника пулов (quick 260710-kvf) ─────────────────────────

export type PoolSource = "realization" | "manual"

export interface ResolvedRealizationPools {
  totals: RealizationPoolTotals
  sources: Record<keyof RealizationPoolTotals, PoolSource>
}

const POOL_KEYS = [
  "storageAppl",
  "storageCloth",
  "acceptanceAppl",
  "acceptanceCloth",
] as const

/**
 * Per-бакет выбор источника пула: реализация (если бакет строго > 0), иначе
 * manual. Кейс ИУ (ground truth первого синка 2026-07-10): paidStorage=0 в
 * отчёте реализации НЕ должен затирать ручное значение хранения — раньше
 * наличие ЛЮБЫХ строк реализации замещало ВСЕ 4 пула целиком, и первый же
 * синк обнулял хранение/приёмку, введённые вручную.
 *
 * sources — для per-пул бейджа «из реализации / вручную» в Controls.
 */
export function resolvePoolTotals(
  realization: RealizationPoolTotals | null,
  manual: RealizationPoolTotals,
): ResolvedRealizationPools {
  const totals = {} as RealizationPoolTotals
  const sources = {} as Record<keyof RealizationPoolTotals, PoolSource>
  for (const key of POOL_KEYS) {
    if (realization !== null && realization[key] > 0) {
      totals[key] = realization[key]
      sources[key] = "realization"
    } else {
      totals[key] = manual[key]
      sources[key] = "manual"
    }
  }
  return { totals, sources }
}

/**
 * Списание за баллы-за-отзывы per nmId: собственные reviewPointsRub строки
 * + доля account-level reviewPoints (accountShareByNmId — результат
 * distributeByRevenue по выручке недели).
 */
export function reviewWriteoffFor(
  nmId: number,
  byNmId: ReadonlyMap<number, RealizationBuckets>,
  accountShareByNmId: ReadonlyMap<number, number>,
): number {
  return (byNmId.get(nmId)?.reviewPointsRub ?? 0) + (accountShareByNmId.get(nmId) ?? 0)
}

/**
 * Логистика ИУ / ед: deliveryRub недели (возвраты/брак из реализации) / qty.
 * Guard: qty <= 0 → 0 (не Infinity).
 */
export function logisticsIuPerUnit(deliveryRub: number, qty: number): number {
  return qty > 0 ? deliveryRub / qty : 0
}
