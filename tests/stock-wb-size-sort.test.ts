import { describe, it, expect } from "vitest"
import { sortSizes } from "@/lib/wb-clusters"

// Phase 16 (STOCK-34): unit-тесты для стабильной сортировки техразмеров.
// Помимо happy-path числовая/буквенная — проверяем edge cases:
// case-insensitive, mixed (fallback на localeCompare), пустые строки в конце,
// неизменность входного массива.

describe("sortSizes (STOCK-34)", () => {
  it("числовые: 60, 46, 48 → 46, 48, 60", () => {
    expect(sortSizes(["60", "46", "48"])).toEqual(["46", "48", "60"])
  })

  it("буквенные: XL, S, M, L → S, M, L, XL", () => {
    expect(sortSizes(["XL", "S", "M", "L"])).toEqual(["S", "M", "L", "XL"])
  })

  it("case-insensitive: xl, s, M, l сортируются по позициям SIZE_ORDER", () => {
    const result = sortSizes(["xl", "s", "M", "l"])
    // Должны быть в позициях S(1) → M(2) → L(3) → XL(4) — независимо от регистра
    expect(result.map((s) => s.toUpperCase())).toEqual(["S", "M", "L", "XL"])
  })

  it("3XL, XL, 2XL → XL, 2XL, 3XL", () => {
    expect(sortSizes(["3XL", "XL", "2XL"])).toEqual(["XL", "2XL", "3XL"])
  })

  it("mixed (числа + буквы) → fallback localeCompare ru — длина и набор сохраняются", () => {
    const input = ["46", "M", "S"]
    const result = sortSizes(input)
    expect(result).toHaveLength(3)
    expect(new Set(result)).toEqual(new Set(input))
  })

  it("пустые '0' и '' попадают в конец: ['46', '0', '48'] → ['46', '48', '0']", () => {
    expect(sortSizes(["46", "0", "48"])).toEqual(["46", "48", "0"])
  })

  it("пустая строка попадает в конец: ['S', '', 'M'] → ['M', 'S', '']", () => {
    expect(sortSizes(["S", "", "M"])).toEqual(["M", "S", ""])
  })

  it("пустой массив: [] → []", () => {
    expect(sortSizes([])).toEqual([])
  })

  it("одиночный размер: ['46'] → ['46']", () => {
    expect(sortSizes(["46"])).toEqual(["46"])
  })

  it("input не мутируется", () => {
    const input = ["XL", "S", "M"]
    const before = [...input]
    sortSizes(input)
    expect(input).toEqual(before)
  })
})
