// lib/wb-eff-coef.ts
// Фаза B v2 (2026-07-08): срез §5 — взвешивание эффективных ставок логистики/хранения
// по НАШЕМУ стоку ОТДЕЛЬНО для каждого направления (бытовая техника / одежда).
//
// Pure, БЕЗ импортов prisma/next — тестируется через unit-тесты (tests/wb-eff-coef.test.ts).
// Ставки acceptance/coefficients (deliveryBaseLiter/…) — УЖЕ применённые per-склад
// (коэффициент вшит), поэтому взвешиваем их напрямую по qty стока на складе.

/** Четыре взвешиваемых поля эфф-ставок (все ₽; коэф уже вшит). */
export interface EffCoefRates {
  /** ₽ первый литр логистики. */
  delivBaseLiter: number | null
  /** ₽ каждый доп. литр логистики. */
  delivAddLiter: number | null
  /** ₽/л/сут первый литр хранения. */
  storageBaseLiter: number | null
  /** ₽/л/сут доп. хранения. */
  storageAddLiter: number | null
}

/** Результат среза: взвешенные ставки + метрики покрытия. */
export interface EffCoefResult extends EffCoefRates {
  /** % qty стока на сматченных складах от всего qty стока направления (0..100). */
  coveragePct: number
  /** Отсортированные имена складов стока (qty>0), отсутствующие в acceptance. */
  unmatched: string[]
}

/** Нормализация имени склада для джойна по имени: trim + lowercase. */
export function normalizeWarehouseName(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * Взвешенные эфф-ставки направления по стоку.
 *
 * @param stockByWarehouseName Map<нормализованное_имя, qty> — сток направления.
 * @param acceptanceByName     Map<нормализованное_имя, EffCoefRates> — короб-ставки.
 * @param fallback             ставки, если ни одного сматченного склада с non-null полем.
 *
 * Для каждого из 4 полей: взвеш. среднее = Σ(qty × ставка) / Σ(qty) по складам,
 * где имя СМАТЧЕНО в acceptanceByName И ставка этого поля != null.
 * Если ни одного такого склада → значение поля = fallback[поле].
 *
 * coveragePct = Σ qty по сматченным / Σ qty по всем × 100 (0 если сток пуст).
 * unmatched = отсортированные имена складов стока (qty>0) без записи в acceptance.
 */
export function computeEffCoefForDirection(
  stockByWarehouseName: Map<string, number>,
  acceptanceByName: Map<string, EffCoefRates>,
  fallback: EffCoefRates,
): EffCoefResult {
  const FIELDS: (keyof EffCoefRates)[] = [
    "delivBaseLiter",
    "delivAddLiter",
    "storageBaseLiter",
    "storageAddLiter",
  ]

  // Взвешенное среднее одного поля по сматченным складам с non-null ставкой.
  const weightedField = (key: keyof EffCoefRates): number | null => {
    let num = 0
    let den = 0
    for (const [name, qty] of stockByWarehouseName) {
      if (qty <= 0) continue
      const acc = acceptanceByName.get(name)
      if (!acc) continue
      const rate = acc[key]
      if (rate == null) continue
      num += qty * rate
      den += qty
    }
    return den > 0 ? num / den : fallback[key]
  }

  const result: EffCoefRates = {
    delivBaseLiter: null,
    delivAddLiter: null,
    storageBaseLiter: null,
    storageAddLiter: null,
  }
  for (const f of FIELDS) {
    result[f] = weightedField(f)
  }

  // coveragePct + unmatched
  let totalQty = 0
  let matchedQty = 0
  const unmatched: string[] = []
  for (const [name, qty] of stockByWarehouseName) {
    if (qty <= 0) continue
    totalQty += qty
    if (acceptanceByName.has(name)) {
      matchedQty += qty
    } else {
      unmatched.push(name)
    }
  }
  const coveragePct = totalQty > 0 ? (matchedQty / totalQty) * 100 : 0
  unmatched.sort()

  return { ...result, coveragePct, unmatched }
}
