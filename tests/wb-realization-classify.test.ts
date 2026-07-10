// tests/wb-realization-classify.test.ts
// Quick 260710-kvf: unit-тесты explode-классификатора отчёта реализации WB
// (lib/wb-realization-api.ts). Мульти-поле разнос: одна строка отчёта несёт
// деньги НЕСКОЛЬКИМИ полями (forPay + deliveryService + penalty + deduction + …)
// — ground truth зонда detailed 772161985 (29 014 строк, 2026-07-10).
// Импортируются ТОЛЬКО pure-экспорты — ни одного сетевого вызова / Prisma.

import { describe, it, expect } from "vitest"
import {
  parseMoney,
  normalizeRealizationRow,
  explodeRealizationRow,
  accumulateRealizationRows,
  type NormalizedRealizationRow,
} from "@/lib/wb-realization-api"

function mkRow(
  overrides: Partial<NormalizedRealizationRow> = {},
): NormalizedRealizationRow {
  return {
    nmId: 100,
    supplierOperName: "",
    docTypeName: "",
    bonusTypeName: "",
    forPay: 0,
    deliveryRub: 0,
    storageRub: 0,
    penaltyRub: 0,
    acceptanceRub: 0,
    deductionRub: 0,
    rebillLogisticCost: 0,
    quantity: 0,
    ...overrides,
  }
}

// ── explodeRealizationRow: мульти-поле разнос ──────────────────────────────────

describe("explodeRealizationRow", () => {
  it("(а) «Продажа» с forPay + delivery + penalty → РОВНО 3 вклада в 3 бакета", () => {
    const contributions = explodeRealizationRow(
      mkRow({
        supplierOperName: "Продажа",
        docTypeName: "Продажа",
        forPay: 1234.56,
        deliveryRub: 84.5,
        penaltyRub: 11.5,
      }),
    )
    expect(contributions).toHaveLength(3)
    expect(contributions).toContainEqual({ bucket: "forPay", amountRub: 1234.56 })
    expect(contributions).toContainEqual({ bucket: "delivery", amountRub: 84.5 })
    expect(contributions).toContainEqual({ bucket: "penalty", amountRub: 11.5 })
  })

  it("(б) deduction с bonus «Списание за отзыв …» → reviewPoints", () => {
    const contributions = explodeRealizationRow(
      mkRow({
        supplierOperName: "Удержание",
        bonusTypeName: "Списание за отзыв 123: акция №7, товар 999",
        deductionRub: 71.2,
      }),
    )
    expect(contributions).toEqual([{ bucket: "reviewPoints", amountRub: 71.2 }])
  })

  it("(в) deduction с bonus «Оказание услуг «WB Продвижение», документ №42» → promotion", () => {
    const contributions = explodeRealizationRow(
      mkRow({
        supplierOperName: "Удержание",
        bonusTypeName: "Оказание услуг «WB Продвижение», документ №42",
        deductionRub: 1306.1,
      }),
    )
    expect(contributions).toEqual([{ bucket: "promotion", amountRub: 1306.1 }])
  })

  it("(г) deduction с пустым bonusTypeName → deductionOther", () => {
    const contributions = explodeRealizationRow(
      mkRow({ supplierOperName: "Удержание", deductionRub: 99.9 }),
    )
    expect(contributions).toEqual([{ bucket: "deductionOther", amountRub: 99.9 }])
  })

  it("(д) rebillLogisticCost (остальные поля 0) → deductionOther", () => {
    const contributions = explodeRealizationRow(
      mkRow({
        supplierOperName: "Возмещение издержек по перевозке/по складским операциям с товаром",
        rebillLogisticCost: 308.6,
      }),
    )
    expect(contributions).toEqual([{ bucket: "deductionOther", amountRub: 308.6 }])
  })

  it("storage / acceptance поля → свои бакеты", () => {
    const contributions = explodeRealizationRow(
      mkRow({ storageRub: 12.3, acceptanceRub: 44 }),
    )
    expect(contributions).toHaveLength(2)
    expect(contributions).toContainEqual({ bucket: "storage", amountRub: 12.3 })
    expect(contributions).toContainEqual({ bucket: "acceptance", amountRub: 44 })
  })

  it("«Возврат» с forPay=-820.4 → отрицательный вклад (знак WB не инвертируем)", () => {
    const contributions = explodeRealizationRow(
      mkRow({ supplierOperName: "Возврат", docTypeName: "Возврат", forPay: -820.4 }),
    )
    expect(contributions).toEqual([{ bucket: "forPay", amountRub: -820.4 }])
  })

  it("строка без денег → 0 вкладов", () => {
    expect(explodeRealizationRow(mkRow())).toEqual([])
  })
})

// ── parseMoney ─────────────────────────────────────────────────────────────────

describe("parseMoney", () => {
  it('"1234,56" → 1234.56 (запятая как десятичный разделитель)', () => {
    expect(parseMoney("1234,56")).toBe(1234.56)
  })

  it('"1234.56" → 1234.56', () => {
    expect(parseMoney("1234.56")).toBe(1234.56)
  })

  it("число 10 → 10 (как есть)", () => {
    expect(parseMoney(10)).toBe(10)
  })

  it("null / пустая строка / мусор / undefined → 0", () => {
    expect(parseMoney(null)).toBe(0)
    expect(parseMoney("")).toBe(0)
    expect(parseMoney("абв")).toBe(0)
    expect(parseMoney(undefined)).toBe(0)
  })
})

// ── normalizeRealizationRow ────────────────────────────────────────────────────

describe("normalizeRealizationRow", () => {
  it("читает snake_case поля, деньги-строки через parseMoney", () => {
    const row = normalizeRealizationRow({
      nm_id: 800750522,
      supplier_oper_name: "Логистика",
      doc_type_name: "",
      bonus_type_name: "",
      delivery_rub: "87,50",
      paid_storage: "1,20",
      paid_acceptance: "3,40",
      penalty: "5,60",
      deduction: "7,80",
      ppvz_for_pay: "900,10",
      rebill_logistic_cost: "2,50",
      quantity: 2,
    })
    expect(row.nmId).toBe(800750522)
    expect(row.supplierOperName).toBe("Логистика")
    expect(row.deliveryRub).toBe(87.5)
    expect(row.storageRub).toBe(1.2)
    expect(row.acceptanceRub).toBe(3.4)
    expect(row.penaltyRub).toBe(5.6)
    expect(row.deductionRub).toBe(7.8)
    expect(row.forPay).toBe(900.1)
    expect(row.rebillLogisticCost).toBe(2.5)
    expect(row.quantity).toBe(2)
  })

  it("(е) читает реальный camelCase API: sellerOperName + деньги-строками + rebillLogisticCost", () => {
    // Ground truth зонда 2026-07-10: реальный API отдаёт sellerOperName
    // (НЕ supplier_oper_name / supplierOperName), деньги частью строками.
    const row = normalizeRealizationRow({
      nmId: 165967746,
      sellerOperName: "Продажа",
      docTypeName: "Продажа",
      bonusTypeName: "",
      deliveryService: "84,5",
      paidStorage: 1,
      paidAcceptance: 2,
      penalty: "11,5",
      deduction: 4,
      forPay: "555,55",
      rebillLogisticCost: "308,6",
      quantity: 1,
    })
    expect(row.nmId).toBe(165967746)
    expect(row.supplierOperName).toBe("Продажа")
    expect(row.docTypeName).toBe("Продажа")
    expect(row.deliveryRub).toBe(84.5)
    expect(row.storageRub).toBe(1)
    expect(row.acceptanceRub).toBe(2)
    expect(row.penaltyRub).toBe(11.5)
    expect(row.deductionRub).toBe(4)
    expect(row.forPay).toBe(555.55)
    expect(row.rebillLogisticCost).toBe(308.6)
  })

  it("читает camelCase поля (supplierOperName как алиас оператора)", () => {
    const row = normalizeRealizationRow({
      nmId: 165967746,
      supplierOperName: "Продажа",
      docTypeName: "Продажа",
      deliveryService: 10.5,
      forPay: 555.55,
      quantity: 1,
    })
    expect(row.supplierOperName).toBe("Продажа")
    expect(row.deliveryRub).toBe(10.5)
    expect(row.forPay).toBe(555.55)
  })

  it("отсутствие nmId → 0 (account-level строка)", () => {
    const row = normalizeRealizationRow({
      sellerOperName: "Удержание",
      deduction: "100",
    })
    expect(row.nmId).toBe(0)
    expect(row.deductionRub).toBe(100)
  })
})

// ── accumulateRealizationRows ──────────────────────────────────────────────────

describe("accumulateRealizationRows", () => {
  it("суммирует вклады explode по nmId; account-level строка nmId=0 — отдельный ключ", () => {
    const rows = [
      mkRow({ nmId: 1, supplierOperName: "Продажа", forPay: 100, deliveryRub: 30 }),
      mkRow({ nmId: 1, supplierOperName: "Продажа", forPay: 50 }),
      mkRow({ nmId: 2, supplierOperName: "Штраф", penaltyRub: 500 }),
      mkRow({
        nmId: 0,
        supplierOperName: "Удержание",
        bonusTypeName: "Списание за отзыв 1: акция №1, товар 2",
        deductionRub: 300,
      }),
    ]
    const acc = accumulateRealizationRows(rows)
    expect(acc.size).toBe(3)
    expect(acc.get(1)?.forPay).toBe(150)
    expect(acc.get(1)?.delivery).toBe(30)
    expect(acc.get(1)?.penalty).toBe(0)
    expect(acc.get(2)?.penalty).toBe(500)
    expect(acc.get(0)?.reviewPoints).toBe(300)
  })

  it("(ж) golden: сырые строки API (sellerOperName, camelCase, деньги-строками) → normalize → accumulate", () => {
    const raw: unknown[] = [
      {
        nmId: 1,
        sellerOperName: "Продажа",
        docTypeName: "Продажа",
        forPay: 1000,
        deliveryService: "84,5",
        quantity: 1,
      },
      {
        nmId: 1,
        sellerOperName: "Возмещение издержек по перевозке/по складским операциям с товаром",
        rebillLogisticCost: 308.6,
      },
      {
        nmId: 1,
        sellerOperName: "Штраф",
        penalty: "11,5",
      },
      {
        sellerOperName: "Удержание",
        bonusTypeName: "Оказание услуг «WB Продвижение», документ №42",
        deduction: 1306.1,
      },
      {
        sellerOperName: "Удержание",
        bonusTypeName: "Списание за отзыв 123: акция №7, товар 999",
        deduction: 71.2,
      },
    ]
    const acc = accumulateRealizationRows(raw.map(normalizeRealizationRow))

    expect(acc.get(1)).toEqual({
      forPay: 1000,
      delivery: 84.5,
      storage: 0,
      acceptance: 0,
      penalty: 11.5,
      reviewPoints: 0,
      promotion: 0,
      deductionOther: 308.6,
    })
    expect(acc.get(0)).toEqual({
      forPay: 0,
      delivery: 0,
      storage: 0,
      acceptance: 0,
      penalty: 0,
      reviewPoints: 71.2,
      promotion: 1306.1,
      deductionOther: 0,
    })
  })
})
