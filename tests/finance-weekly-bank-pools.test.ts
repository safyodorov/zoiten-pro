// tests/finance-weekly-bank-pools.test.ts
// Quick 260710-lmb (W3a): unit-тесты pure-хелперов авто-пулов из банка —
// sumBankPoolAutos (Σ|amount| DEBIT-операций по тегам OPEX / DELIVERY_MP;
// CAPEX и null — игнор) + resolveHybridPool (гибрид §7-1: manual > 0 → manual,
// иначе банк-авто > 0 → bank, иначе 0; manual=0 = «не задано»).
//
// Тест-файл pure: ноль импортов Prisma/React (паттерн attribution.ts/realization.ts).

import { describe, it, expect } from "vitest"

import {
  sumBankPoolAutos,
  resolveHybridPool,
  type BankTxForPools,
} from "@/lib/finance-weekly/bank-pools"

describe("sumBankPoolAutos", () => {
  it("суммирует DEBIT по тегам: OPEX 1000+500, DELIVERY_MP 300 → {opexRub: 1500, deliveryMpRub: 300}", () => {
    const rows: BankTxForPools[] = [
      { direction: "DEBIT", amountRub: 1000, weeklyCostTag: "OPEX" },
      { direction: "DEBIT", amountRub: 500, weeklyCostTag: "OPEX" },
      { direction: "DEBIT", amountRub: 300, weeklyCostTag: "DELIVERY_MP" },
    ]
    expect(sumBankPoolAutos(rows)).toEqual({ opexRub: 1500, deliveryMpRub: 300 })
  })

  it("игнорирует CREDIT-операции даже с тегом OPEX (только расход)", () => {
    const rows: BankTxForPools[] = [
      { direction: "CREDIT", amountRub: 9999, weeklyCostTag: "OPEX" },
      { direction: "DEBIT", amountRub: 100, weeklyCostTag: "OPEX" },
    ]
    expect(sumBankPoolAutos(rows)).toEqual({ opexRub: 100, deliveryMpRub: 0 })
  })

  it("игнорирует CAPEX полностью (тег только для исключения/аналитики)", () => {
    const rows: BankTxForPools[] = [
      { direction: "DEBIT", amountRub: 50000, weeklyCostTag: "CAPEX" },
      { direction: "DEBIT", amountRub: 200, weeklyCostTag: "DELIVERY_MP" },
    ]
    expect(sumBankPoolAutos(rows)).toEqual({ opexRub: 0, deliveryMpRub: 200 })
  })

  it("игнорирует операции без тега (weeklyCostTag = null)", () => {
    const rows: BankTxForPools[] = [
      { direction: "DEBIT", amountRub: 777, weeklyCostTag: null },
      { direction: "DEBIT", amountRub: 400, weeklyCostTag: "OPEX" },
    ]
    expect(sumBankPoolAutos(rows)).toEqual({ opexRub: 400, deliveryMpRub: 0 })
  })

  it("отрицательный amount берётся по модулю (|amount|)", () => {
    const rows: BankTxForPools[] = [
      { direction: "DEBIT", amountRub: -1500, weeklyCostTag: "OPEX" },
      { direction: "DEBIT", amountRub: -300, weeklyCostTag: "DELIVERY_MP" },
    ]
    expect(sumBankPoolAutos(rows)).toEqual({ opexRub: 1500, deliveryMpRub: 300 })
  })

  it("пустой массив → нулевые пулы", () => {
    expect(sumBankPoolAutos([])).toEqual({ opexRub: 0, deliveryMpRub: 0 })
  })
})

describe("resolveHybridPool", () => {
  it("manual=584400, bank=600000 → manual приоритетен (Excel W331)", () => {
    expect(resolveHybridPool(584_400, 600_000)).toEqual({
      total: 584_400,
      source: "manual",
    })
  })

  it("manual=0 (не задано), bank=262300 → банк-авто (Excel P149)", () => {
    expect(resolveHybridPool(0, 262_300)).toEqual({
      total: 262_300,
      source: "bank",
    })
  })

  it("manual=0, bank=0 → 0 / none", () => {
    expect(resolveHybridPool(0, 0)).toEqual({ total: 0, source: "none" })
  })

  it("manual=100, bank=0 → manual (ручное сохраняется без банка)", () => {
    expect(resolveHybridPool(100, 0)).toEqual({ total: 100, source: "manual" })
  })
})
