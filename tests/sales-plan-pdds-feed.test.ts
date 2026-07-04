import { describe, it, expect } from "vitest"
import { buildVirtualPurchasePayments } from "@/lib/sales-plan/pdds-feed"

// ──────────────────────────────────────────────────────────────────
// Контракт buildVirtualPurchasePayments() — pure-ядро ПДДС
// Реализуется в Wave 6; этот стаб фиксирует контракт ДО реализации (RED).
//
// Функция PURE (синхронная, без Prisma/fetch): принимает VP-снапшот,
// возвращает массив платежей { type, dueDate, amount, currency }.
//
// Источник: §8 RESEARCH.md
// Формулы:
//   DEPOSIT.dueDate = orderDate + 3
//   BALANCE.dueDate = depositDueDate + leadTimeDays
//   depositPct default = 30, balancePct default = 70
//   amount в валюте закупки (CNY/USD), конвертация — в loader-обёртке
// ──────────────────────────────────────────────────────────────────

// Минимальный VP-снапшот (из paramsJson версии)
function makeVpSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: "vp-1",
    productId: "prod-1",
    qty: 500,
    orderDate: "2026-07-20",
    expectedArrivalDate: "2026-09-03", // orderDate + 45 дней
    leadTimeDaysUsed: 45,
    unitPrice: 120.5, // CNY
    currency: "CNY",
    depositPct: 30, // override
    balancePct: 70, // override
    status: "SUGGESTED",
    ...overrides,
  }
}

describe("buildVirtualPurchasePayments — DEPOSIT dueDate", () => {
  it("DEPOSIT.dueDate = orderDate + 3 дня", () => {
    const vp = makeVpSnapshot({ orderDate: "2026-07-20" })
    const payments = buildVirtualPurchasePayments(vp)
    const deposit = payments.find((p: { type: string }) => p.type === "DEPOSIT")
    expect(deposit).toBeDefined()
    // 2026-07-20 + 3 = 2026-07-23
    expect(deposit?.dueDate).toBe("2026-07-23")
  })

  it("DEPOSIT.type === 'DEPOSIT'", () => {
    const payments = buildVirtualPurchasePayments(makeVpSnapshot())
    expect(payments.some((p: { type: string }) => p.type === "DEPOSIT")).toBe(true)
  })
})

describe("buildVirtualPurchasePayments — BALANCE dueDate", () => {
  it("BALANCE.dueDate = DEPOSIT.dueDate + leadTimeDays", () => {
    const vp = makeVpSnapshot({ orderDate: "2026-07-20", leadTimeDaysUsed: 45 })
    const payments = buildVirtualPurchasePayments(vp)
    const deposit = payments.find((p: { type: string }) => p.type === "DEPOSIT")
    const balance = payments.find((p: { type: string }) => p.type === "BALANCE")
    expect(balance).toBeDefined()
    expect(deposit).toBeDefined()
    // BALANCE.dueDate = depositDueDate(2026-07-23) + leadTime(45) = 2026-09-06
    expect(balance?.dueDate).toBe("2026-09-06")
  })

  it("BALANCE.type === 'BALANCE'", () => {
    const payments = buildVirtualPurchasePayments(makeVpSnapshot())
    expect(payments.some((p: { type: string }) => p.type === "BALANCE")).toBe(true)
  })
})

describe("buildVirtualPurchasePayments — depositPct/balancePct fallback", () => {
  it("fallback: нет depositPct → default 30/70", () => {
    const vp = makeVpSnapshot({ depositPct: undefined, balancePct: undefined, qty: 100, unitPrice: 100 })
    const payments = buildVirtualPurchasePayments(vp)
    const deposit = payments.find((p: { type: string }) => p.type === "DEPOSIT")
    const balance = payments.find((p: { type: string }) => p.type === "BALANCE")
    // deposit = qty × unitPrice × 30% = 100 × 100 × 0.30 = 3000
    expect(deposit?.amount).toBeCloseTo(3000, 2)
    // balance = qty × unitPrice × 70% = 100 × 100 × 0.70 = 7000
    expect(balance?.amount).toBeCloseTo(7000, 2)
  })

  it("override: depositPct=40, balancePct=60 → другие суммы", () => {
    const vp = makeVpSnapshot({ depositPct: 40, balancePct: 60, qty: 100, unitPrice: 100 })
    const payments = buildVirtualPurchasePayments(vp)
    const deposit = payments.find((p: { type: string }) => p.type === "DEPOSIT")
    const balance = payments.find((p: { type: string }) => p.type === "BALANCE")
    expect(deposit?.amount).toBeCloseTo(4000, 2)
    expect(balance?.amount).toBeCloseTo(6000, 2)
  })

  it("deposit + balance amounts в сумме = qty × unitPrice", () => {
    const vp = makeVpSnapshot({ qty: 200, unitPrice: 150.75 })
    const payments = buildVirtualPurchasePayments(vp)
    const deposit = payments.find((p: { type: string }) => p.type === "DEPOSIT")
    const balance = payments.find((p: { type: string }) => p.type === "BALANCE")
    if (deposit && balance) {
      expect(deposit.amount + balance.amount).toBeCloseTo(200 * 150.75, 1)
    }
  })
})

describe("buildVirtualPurchasePayments — валюта закупки", () => {
  it("currency = CNY — сохраняется в платежах", () => {
    const vp = makeVpSnapshot({ currency: "CNY" })
    const payments = buildVirtualPurchasePayments(vp)
    for (const p of payments) {
      expect(p.currency).toBe("CNY")
    }
  })

  it("currency = USD — сохраняется в платежах", () => {
    const vp = makeVpSnapshot({ currency: "USD" })
    const payments = buildVirtualPurchasePayments(vp)
    for (const p of payments) {
      expect(p.currency).toBe("USD")
    }
  })

  it("amount в валюте закупки (НЕ конвертируется в ₽)", () => {
    // Pure-ядро не должно делать конвертацию
    // Для CNY × 12 (курс) — amount НЕ умножается на курс
    const vp = makeVpSnapshot({ currency: "CNY", qty: 10, unitPrice: 100, depositPct: 30 })
    const payments = buildVirtualPurchasePayments(vp)
    const deposit = payments.find((p: { type: string }) => p.type === "DEPOSIT")
    // deposit = 10 × 100 × 0.30 = 300 CNY (не 3600 ₽)
    expect(deposit?.amount).toBeCloseTo(300, 2)
  })
})

describe("buildVirtualPurchasePayments — структура результата", () => {
  it("возвращает ровно 2 платежа (DEPOSIT + BALANCE)", () => {
    const payments = buildVirtualPurchasePayments(makeVpSnapshot())
    expect(payments).toHaveLength(2)
  })

  it("каждый платёж имеет поля type, dueDate, amount, currency", () => {
    const payments = buildVirtualPurchasePayments(makeVpSnapshot())
    for (const p of payments) {
      expect(p).toHaveProperty("type")
      expect(p).toHaveProperty("dueDate")
      expect(p).toHaveProperty("amount")
      expect(p).toHaveProperty("currency")
    }
  })

  it("amount всегда ≥ 0", () => {
    const payments = buildVirtualPurchasePayments(makeVpSnapshot())
    for (const p of payments) {
      expect(p.amount).toBeGreaterThanOrEqual(0)
    }
  })
})
