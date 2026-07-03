// tests/balance-data.test.ts
// Phase 24 Plan 24-04 — тесты знаков/границ/fallback для point-in-time хелперов баланса.
// Паттерн mock prisma — см. tests/wb-adv-api.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankAccount: {
      findUnique: vi.fn(),
    },
    bankTransaction: {
      findMany: vi.fn(),
    },
    currencyRate: {
      findFirst: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/prisma"
import { getBankBalanceAsOf, getRateForDate, stageAsOf } from "@/lib/balance-data"

beforeEach(() => {
  vi.mocked(prisma.bankAccount.findUnique).mockReset()
  vi.mocked(prisma.bankTransaction.findMany).mockReset()
  vi.mocked(prisma.currencyRate.findFirst).mockReset()
})

describe("getBankBalanceAsOf", () => {
  it("asOf в прошлом относительно anchor: closing минус delta (знак вычитания корректен)", async () => {
    vi.mocked(prisma.bankAccount.findUnique).mockResolvedValueOnce({
      closingBalance: 1000 as unknown as never,
      balanceDate: new Date("2026-07-10"),
    } as never)
    vi.mocked(prisma.bankTransaction.findMany).mockResolvedValueOnce([
      { direction: "CREDIT", amount: 200 as unknown as never },
      { direction: "DEBIT", amount: 50 as unknown as never },
    ] as never)

    const result = await getBankBalanceAsOf("acc1", new Date("2026-07-05"))

    // delta = 200 - 50 = 150; asOf < anchor → closing - delta = 1000 - 150 = 850
    expect(result).toBe(850)
    expect(prisma.bankTransaction.findMany).toHaveBeenCalledWith({
      where: { accountId: "acc1", date: { gt: new Date("2026-07-05"), lte: new Date("2026-07-10") } },
      select: { direction: true, amount: true },
    })
  })

  it("asOf >= anchor: closing плюс delta", async () => {
    vi.mocked(prisma.bankAccount.findUnique).mockResolvedValueOnce({
      closingBalance: 1000 as unknown as never,
      balanceDate: new Date("2026-07-01"),
    } as never)
    vi.mocked(prisma.bankTransaction.findMany).mockResolvedValueOnce([
      { direction: "CREDIT", amount: 300 as unknown as never },
    ] as never)

    const result = await getBankBalanceAsOf("acc1", new Date("2026-07-10"))

    // asOf >= anchor → closing + delta = 1000 + 300 = 1300
    expect(result).toBe(1300)
    expect(prisma.bankTransaction.findMany).toHaveBeenCalledWith({
      where: { accountId: "acc1", date: { gt: new Date("2026-07-01"), lte: new Date("2026-07-10") } },
      select: { direction: true, amount: true },
    })
  })

  it("нет closingBalance → null", async () => {
    vi.mocked(prisma.bankAccount.findUnique).mockResolvedValueOnce({
      closingBalance: null,
      balanceDate: new Date("2026-07-01"),
    } as never)

    const result = await getBankBalanceAsOf("acc1", new Date("2026-07-10"))

    expect(result).toBeNull()
    expect(prisma.bankTransaction.findMany).not.toHaveBeenCalled()
  })
})

describe("getRateForDate", () => {
  it("exact: курс найден на дату <= asOf → approximate=false", async () => {
    vi.mocked(prisma.currencyRate.findFirst).mockResolvedValueOnce({
      rateToRub: 12.5 as unknown as never,
      date: new Date("2026-07-01"),
    } as never)

    const result = await getRateForDate("CNY", new Date("2026-07-05"))

    expect(result).toEqual({ rateToRub: 12.5, date: new Date("2026-07-01"), approximate: false })
    expect(prisma.currencyRate.findFirst).toHaveBeenCalledTimes(1)
  })

  it("fallback: курса на дату нет → самый ранний доступный с approximate=true", async () => {
    vi.mocked(prisma.currencyRate.findFirst)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({
        rateToRub: 11.0 as unknown as never,
        date: new Date("2026-06-09"),
      } as never)

    const result = await getRateForDate("CNY", new Date("2026-05-01"))

    expect(result).toEqual({ rateToRub: 11.0, date: new Date("2026-06-09"), approximate: true })
    expect(prisma.currencyRate.findFirst).toHaveBeenCalledTimes(2)
  })

  it("нет ни одной записи курса → null", async () => {
    vi.mocked(prisma.currencyRate.findFirst)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(null as never)

    const result = await getRateForDate("USD", new Date("2026-05-01"))

    expect(result).toBeNull()
  })
})

describe("stageAsOf", () => {
  const stages = [
    { stage: "PRODUCTION", date: new Date("2026-06-01") },
    { stage: "SHIPMENT", date: new Date("2026-07-05") },
    { stage: "TRANSIT", date: null }, // undated этап (m7)
  ]

  it("историческая дата ДО SHIPMENT.date → PRODUCTION (undated TRANSIT не учитывается)", () => {
    const now = new Date("2026-07-10")
    const asOf = new Date("2026-06-15")
    const result = stageAsOf(stages, asOf, now)
    expect(result).toBe("PRODUCTION")
  })

  it("историческая дата ПОСЛЕ SHIPMENT.date → SHIPMENT (undated TRANSIT не поднимает этап в прошлом)", () => {
    const now = new Date("2026-07-20")
    const asOf = new Date("2026-07-10")
    const result = stageAsOf(stages, asOf, now)
    expect(result).toBe("SHIPMENT")
  })

  it("m7: undated-этап достигнут на текущей дате (asOf === now) → TRANSIT (паритет с /procurement)", () => {
    const now = new Date("2026-07-20")
    const asOf = now
    const result = stageAsOf(stages, asOf, now)
    expect(result).toBe("TRANSIT")
  })
})
