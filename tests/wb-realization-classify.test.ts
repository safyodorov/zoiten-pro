// tests/wb-realization-classify.test.ts
// W1 (quick 260710-jgs): unit-тесты pure-хелперов клиента отчёта реализации WB
// (lib/wb-realization-api.ts). Импортируются ТОЛЬКО pure-экспорты — ни одного
// сетевого вызова / обращения к Prisma при выполнении тестов.

import { describe, it, expect } from "vitest"
import {
  parseMoney,
  normalizeRealizationRow,
  classifyRealizationRow,
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
    quantity: 0,
    ...overrides,
  }
}

// ── classifyRealizationRow: по одному кейсу на КАЖДЫЙ бакет ────────────────────

describe("classifyRealizationRow", () => {
  it("«Логистика» → delivery (сумма из delivery-поля)", () => {
    const res = classifyRealizationRow(
      mkRow({ supplierOperName: "Логистика", deliveryRub: 87.5 }),
    )
    expect(res).toEqual({ bucket: "delivery", amountRub: 87.5 })
  })

  it("«Хранение» → storage", () => {
    const res = classifyRealizationRow(
      mkRow({ supplierOperName: "Хранение", storageRub: 12.3 }),
    )
    expect(res).toEqual({ bucket: "storage", amountRub: 12.3 })
  })

  it("«Платная приёмка» → acceptance", () => {
    const res = classifyRealizationRow(
      mkRow({ supplierOperName: "Платная приёмка", acceptanceRub: 44 }),
    )
    expect(res).toEqual({ bucket: "acceptance", amountRub: 44 })
  })

  it("«Штраф» → penalty (сумма из penalty-поля)", () => {
    const res = classifyRealizationRow(
      mkRow({ supplierOperName: "Штраф", penaltyRub: 500 }),
    )
    expect(res).toEqual({ bucket: "penalty", amountRub: 500 })
  })

  it("bonus_type_name «Аванс за услугу Баллы за отзывы» → reviewPoints (из deduction)", () => {
    const res = classifyRealizationRow(
      mkRow({
        supplierOperName: "Удержание",
        bonusTypeName: "Аванс за услугу Баллы за отзывы",
        deductionRub: 300,
      }),
    )
    expect(res).toEqual({ bucket: "reviewPoints", amountRub: 300 })
  })

  it("«ВБ.Продвижение» → promotion (из deduction)", () => {
    const res = classifyRealizationRow(
      mkRow({
        supplierOperName: "Удержание",
        bonusTypeName: "Оказание услуг «ВБ.Продвижение»",
        deductionRub: 1500,
      }),
    )
    expect(res).toEqual({ bucket: "promotion", amountRub: 1500 })
  })

  it("«Продажа» → forPay (сумма из forPay-поля)", () => {
    const res = classifyRealizationRow(
      mkRow({ supplierOperName: "Продажа", docTypeName: "Продажа", forPay: 1234.56 }),
    )
    expect(res).toEqual({ bucket: "forPay", amountRub: 1234.56 })
  })

  it("«Возврат» → forPay с ОТРИЦАТЕЛЬНЫМ вкладом (знак как отдаёт WB, не инвертируем)", () => {
    const res = classifyRealizationRow(
      mkRow({ supplierOperName: "Возврат", docTypeName: "Возврат", forPay: -820.4 }),
    )
    expect(res).toEqual({ bucket: "forPay", amountRub: -820.4 })
  })

  it("неизвестная операция с ненулевым deduction → deductionOther", () => {
    const res = classifyRealizationRow(
      mkRow({ supplierOperName: "Прочие удержания по акту", deductionRub: 99.9 }),
    )
    expect(res).toEqual({ bucket: "deductionOther", amountRub: 99.9 })
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
    expect(row.quantity).toBe(2)
  })

  it("читает camelCase поля (deliveryService как алиас доставки)", () => {
    const row = normalizeRealizationRow({
      nmId: 165967746,
      supplierOperName: "Продажа",
      docTypeName: "Продажа",
      bonusTypeName: "",
      deliveryService: 10.5,
      paidStorage: 1,
      paidAcceptance: 2,
      penalty: 3,
      deduction: 4,
      forPay: 555.55,
      quantity: 1,
    })
    expect(row.nmId).toBe(165967746)
    expect(row.supplierOperName).toBe("Продажа")
    expect(row.docTypeName).toBe("Продажа")
    expect(row.deliveryRub).toBe(10.5)
    expect(row.storageRub).toBe(1)
    expect(row.acceptanceRub).toBe(2)
    expect(row.penaltyRub).toBe(3)
    expect(row.deductionRub).toBe(4)
    expect(row.forPay).toBe(555.55)
  })

  it("отсутствие nmId → 0 (account-level строка)", () => {
    const row = normalizeRealizationRow({
      supplier_oper_name: "Удержание",
      deduction: "100",
    })
    expect(row.nmId).toBe(0)
    expect(row.deductionRub).toBe(100)
  })
})

// ── accumulateRealizationRows ──────────────────────────────────────────────────

describe("accumulateRealizationRows", () => {
  it("суммирует бакеты по nmId; account-level строка nmId=0 — отдельный ключ", () => {
    const rows = [
      mkRow({ nmId: 1, supplierOperName: "Продажа", forPay: 100 }),
      mkRow({ nmId: 1, supplierOperName: "Продажа", forPay: 50 }),
      mkRow({ nmId: 1, supplierOperName: "Логистика", deliveryRub: 30 }),
      mkRow({ nmId: 2, supplierOperName: "Штраф", penaltyRub: 500 }),
      mkRow({
        nmId: 0,
        supplierOperName: "Удержание",
        bonusTypeName: "Аванс за услугу Баллы за отзывы",
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
})
