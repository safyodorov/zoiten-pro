import { describe, it, expect } from "vitest"
import { resolvePrimaryWrites } from "@/lib/supplier-primary"

// ──────────────────────────────────────────────────────────────────
// RED stub — план 20-00 Wave 0 (D-02)
// ──────────────────────────────────────────────────────────────────
//
// lib/supplier-primary.ts будет создан в плане 20-05. До этого тесты
// падают с "Cannot find module @/lib/supplier-primary" — корректное
// RED-состояние Wave 0.
//
// Почему PURE helper, а не сам server action: app/actions/suppliers.ts
// тянет auth chain (next-auth), который vitest не может загрузить.
// Контракт enforcement isPrimary извлекается в pure-helper, который
// 20-05 переиспользует внутри $transaction (updateMany-before-upsert).
//
// Контракт (D-02 / 20-RESEARCH.md §"Pitfall 4"):
//   resolvePrimaryWrites(contacts) → на каждую группу (supplierId, type)
//   не более ОДНОГО isPrimary=true (last-wins среди помеченных true;
//   если ни один не помечен — primary нет).

type Contact = {
  id?: string
  supplierId: string
  type: "SUPPLIER_MANAGER" | "SUPPLIER_BOSS"
  isPrimary: boolean
}

function countPrimaryPerGroup(contacts: Contact[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const c of contacts) {
    if (!c.isPrimary) continue
    const key = `${c.supplierId}::${c.type}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

describe("resolvePrimaryWrites (D-02 isPrimary enforcement)", () => {
  it("два SUPPLIER_MANAGER оба primary → ровно один остаётся primary", () => {
    const input: Contact[] = [
      { id: "a", supplierId: "s1", type: "SUPPLIER_MANAGER", isPrimary: true },
      { id: "b", supplierId: "s1", type: "SUPPLIER_MANAGER", isPrimary: true },
    ]
    const result = resolvePrimaryWrites(input)
    const counts = countPrimaryPerGroup(result)
    expect(counts.get("s1::SUPPLIER_MANAGER")).toBe(1)
  })

  it("MANAGER primary + BOSS primary (один supplier) → оба остаются (разные группы type)", () => {
    const input: Contact[] = [
      { id: "a", supplierId: "s1", type: "SUPPLIER_MANAGER", isPrimary: true },
      { id: "b", supplierId: "s1", type: "SUPPLIER_BOSS", isPrimary: true },
    ]
    const result = resolvePrimaryWrites(input)
    const counts = countPrimaryPerGroup(result)
    expect(counts.get("s1::SUPPLIER_MANAGER")).toBe(1)
    expect(counts.get("s1::SUPPLIER_BOSS")).toBe(1)
  })

  it("ни один не помечен → ноль primary", () => {
    const input: Contact[] = [
      { id: "a", supplierId: "s1", type: "SUPPLIER_MANAGER", isPrimary: false },
      { id: "b", supplierId: "s1", type: "SUPPLIER_MANAGER", isPrimary: false },
    ]
    const result = resolvePrimaryWrites(input)
    const counts = countPrimaryPerGroup(result)
    expect(counts.get("s1::SUPPLIER_MANAGER") ?? 0).toBe(0)
  })

  it("инвариант: helper никогда не возвращает >1 isPrimary на (supplierId, type)", () => {
    const input: Contact[] = [
      { id: "a", supplierId: "s1", type: "SUPPLIER_MANAGER", isPrimary: true },
      { id: "b", supplierId: "s1", type: "SUPPLIER_MANAGER", isPrimary: true },
      { id: "c", supplierId: "s1", type: "SUPPLIER_BOSS", isPrimary: true },
      { id: "d", supplierId: "s2", type: "SUPPLIER_MANAGER", isPrimary: true },
      { id: "e", supplierId: "s2", type: "SUPPLIER_MANAGER", isPrimary: true },
    ]
    const result = resolvePrimaryWrites(input)
    const counts = countPrimaryPerGroup(result)
    for (const [, n] of counts) {
      expect(n).toBeLessThanOrEqual(1)
    }
  })
})
