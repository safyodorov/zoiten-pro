// lib/supplier-primary.ts
// Pure helper (НЕТ импортов) — enforcement правила isPrimary для контактов
// поставщика (D-02). Переиспользуется в app/actions/suppliers.ts внутри
// $transaction (updateMany-before-upsert) и тестируется через
// tests/supplier-actions.test.ts.
//
// Почему PURE helper, а не server action: app/actions/suppliers.ts тянет
// next-auth chain, который vitest не может загрузить. Контракт извлечён сюда.
//
// Контракт (D-02 / 20-RESEARCH.md §"Pitfall 4"):
//   resolvePrimaryWrites(contacts) → на каждую группу (supplierId, type)
//   не более ОДНОГО isPrimary=true (last-wins среди помеченных true;
//   если ни один не помечен — primary нет).

export type PrimaryContactInput = {
  id?: string
  supplierId: string
  type: "SUPPLIER_MANAGER" | "SUPPLIER_BOSS"
  isPrimary: boolean
}

/**
 * Корректирует флаги isPrimary так, чтобы в каждой группе (supplierId, type)
 * оставался максимум один primary.
 *
 * Логика last-wins: если несколько контактов в группе помечены isPrimary=true,
 * primary остаётся только у ПОСЛЕДНЕГО в массиве; остальные → false.
 * Если в группе никто не помечен — все остаются false.
 *
 * Возвращает НОВЫЙ массив той же длины и порядка, с исправленными isPrimary.
 * Остальные поля сохраняются как есть (через spread).
 */
export function resolvePrimaryWrites<T extends PrimaryContactInput>(
  contacts: T[]
): T[] {
  // Для каждой группы (supplierId::type) находим индекс последнего contact,
  // помеченного isPrimary=true. Только он останется primary.
  const lastPrimaryIndexByGroup = new Map<string, number>()
  contacts.forEach((c, idx) => {
    if (!c.isPrimary) return
    const key = `${c.supplierId}::${c.type}`
    lastPrimaryIndexByGroup.set(key, idx)
  })

  return contacts.map((c, idx) => {
    const key = `${c.supplierId}::${c.type}`
    const winnerIdx = lastPrimaryIndexByGroup.get(key)
    const isPrimary = winnerIdx === idx
    return { ...c, isPrimary }
  })
}
