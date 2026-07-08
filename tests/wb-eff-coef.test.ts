// tests/wb-eff-coef.test.ts
// Фаза B v2 (2026-07-08): unit-тесты computeEffCoefForDirection (срез §5 —
// взвешивание эфф-ставок логистики/хранения по нашему стоку per направление).
//
// Source: .planning/quick/260708-f23-b-v2-acceptance-api/260708-f23-PLAN.md, Task 2 <behavior>.

import { describe, it, expect } from "vitest"
import {
  computeEffCoefForDirection,
  normalizeWarehouseName,
  type EffCoefRates,
} from "@/lib/wb-eff-coef"

const FALLBACK: EffCoefRates = {
  delivBaseLiter: 46,
  delivAddLiter: 14,
  storageBaseLiter: 0.07,
  storageAddLiter: 0.07,
}

describe("normalizeWarehouseName", () => {
  it("trim + lowercase", () => {
    expect(normalizeWarehouseName("  Коледино ")).toBe("коледино")
    expect(normalizeWarehouseName("КАЗАНЬ")).toBe("казань")
  })
})

describe("computeEffCoefForDirection — взвешивание", () => {
  it("2 склада, оба сматчены → взвешенное среднее Σ(qty×ставка)/Σqty", () => {
    const stock = new Map([
      ["коледино", 10],
      ["казань", 30],
    ])
    const acceptance = new Map<string, EffCoefRates>([
      [
        "коледино",
        { delivBaseLiter: 100, delivAddLiter: 20, storageBaseLiter: 0.1, storageAddLiter: 0.1 },
      ],
      [
        "казань",
        { delivBaseLiter: 200, delivAddLiter: 40, storageBaseLiter: 0.2, storageAddLiter: 0.2 },
      ],
    ])

    const result = computeEffCoefForDirection(stock, acceptance, FALLBACK)

    // (10×100 + 30×200)/40 = 175
    expect(result.delivBaseLiter).toBeCloseTo(175, 6)
    // (10×20 + 30×40)/40 = 35
    expect(result.delivAddLiter).toBeCloseTo(35, 6)
    // (10×0.1 + 30×0.2)/40 = 0.175
    expect(result.storageBaseLiter).toBeCloseTo(0.175, 6)
    expect(result.storageAddLiter).toBeCloseTo(0.175, 6)
    expect(result.coveragePct).toBe(100)
    expect(result.unmatched).toEqual([])
  })
})

describe("computeEffCoefForDirection — несматченные склады + coverage", () => {
  it("склад без записи в acceptance попадает в unmatched, coveragePct считает только сматченных", () => {
    const stock = new Map([
      ["коледино", 10],
      ["казань", 30],
      ["новосибирск", 20],
    ])
    const acceptance = new Map<string, EffCoefRates>([
      [
        "коледино",
        { delivBaseLiter: 100, delivAddLiter: 20, storageBaseLiter: 0.1, storageAddLiter: 0.1 },
      ],
      [
        "казань",
        { delivBaseLiter: 200, delivAddLiter: 40, storageBaseLiter: 0.2, storageAddLiter: 0.2 },
      ],
    ])

    const result = computeEffCoefForDirection(stock, acceptance, FALLBACK)

    // Поля считаются только по сматченным (коледино+казань) — как в тесте выше
    expect(result.delivBaseLiter).toBeCloseTo(175, 6)
    // matched=40, total=60 → coveragePct = 40/60×100 ≈ 66.667
    expect(result.coveragePct).toBeCloseTo((40 / 60) * 100, 6)
    expect(result.unmatched).toEqual(["новосибирск"])
  })
})

describe("computeEffCoefForDirection — fallback (пусто в acceptance)", () => {
  it("ни один склад стока не сматчен → все 4 поля = fallback, coveragePct=0", () => {
    const stock = new Map([
      ["коледино", 10],
      ["казань", 30],
    ])
    const acceptance = new Map<string, EffCoefRates>() // пусто — ничего не сматчено

    const result = computeEffCoefForDirection(stock, acceptance, FALLBACK)

    expect(result.delivBaseLiter).toBe(FALLBACK.delivBaseLiter)
    expect(result.delivAddLiter).toBe(FALLBACK.delivAddLiter)
    expect(result.storageBaseLiter).toBe(FALLBACK.storageBaseLiter)
    expect(result.storageAddLiter).toBe(FALLBACK.storageAddLiter)
    expect(result.coveragePct).toBe(0)
    expect(result.unmatched).toEqual(["казань", "коледино"])
  })
})

describe("computeEffCoefForDirection — null-ставка одного поля (частичный fallback)", () => {
  it("склад сматчен, но storageAddLiter=null → это поле берётся из fallback, остальные взвешены", () => {
    const stock = new Map([["коледино", 10]])
    const acceptance = new Map<string, EffCoefRates>([
      [
        "коледино",
        { delivBaseLiter: 100, delivAddLiter: 20, storageBaseLiter: 0.1, storageAddLiter: null },
      ],
    ])

    const result = computeEffCoefForDirection(stock, acceptance, FALLBACK)

    expect(result.delivBaseLiter).toBe(100)
    expect(result.delivAddLiter).toBe(20)
    expect(result.storageBaseLiter).toBe(0.1)
    // storageAddLiter null на единственном сматченном складе → нет ни одного
    // non-null значения → fallback
    expect(result.storageAddLiter).toBe(FALLBACK.storageAddLiter)
    // coverage считается по наличию склада в acceptance, а не по non-null полям
    expect(result.coveragePct).toBe(100)
    expect(result.unmatched).toEqual([])
  })
})

describe("computeEffCoefForDirection — сток пуст", () => {
  it("stockByWarehouseName пуст → все поля fallback, coveragePct=0, unmatched=[]", () => {
    const stock = new Map<string, number>()
    const acceptance = new Map<string, EffCoefRates>([
      [
        "коледино",
        { delivBaseLiter: 100, delivAddLiter: 20, storageBaseLiter: 0.1, storageAddLiter: 0.1 },
      ],
    ])

    const result = computeEffCoefForDirection(stock, acceptance, FALLBACK)

    expect(result.delivBaseLiter).toBe(FALLBACK.delivBaseLiter)
    expect(result.delivAddLiter).toBe(FALLBACK.delivAddLiter)
    expect(result.storageBaseLiter).toBe(FALLBACK.storageBaseLiter)
    expect(result.storageAddLiter).toBe(FALLBACK.storageAddLiter)
    expect(result.coveragePct).toBe(0)
    expect(result.unmatched).toEqual([])
  })
})
