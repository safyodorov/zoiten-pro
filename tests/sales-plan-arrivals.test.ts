import { describe, it, expect } from "vitest"
import { resolveArrivalBatches } from "@/lib/sales-plan/arrivals"

// ──────────────────────────────────────────────────────────────────
// Контракт resolveArrivalBatches() — fallback-цепочка 5 уровней
// Реализуется в Wave 1; этот стаб фиксирует интерфейс ДО реализации (RED).
//
// Уровни:
//   1. plannedArrivalDate (ручной план — приоритет)    → dateSource "manual"
//   2. TRANSIT.date + transitDays                       → dateSource "transit-eta"
//      Частичный TRANSIT → сплит на 2 партии
//      TRANSIT.qty=0 или date=null → пропуск
//   3. createdAt + leadTimeDays (fallback 45)           → dateSource "leadtime-eta"
//   4. ProductIncoming.expectedDate (legacy fallback)   → dateSource "legacy-expected"
//   5. null → партия не создаётся
// ──────────────────────────────────────────────────────────────────

// Минимальные фикстуры для тестов (типы без полного Prisma-объекта)
function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    productId: "prod-1",
    purchases: [],
    virtualPurchases: [],
    legacyIncoming: null,
    wbInboundLagDays: 0,
    transitDays: 20,
    defaultLeadTimeDays: 45,
    today: "2026-07-05",
    ...overrides,
  }
}

describe("resolveArrivalBatches — уровень 1: plannedArrivalDate (приоритет)", () => {
  it("когда задан plannedArrivalDate → dateSource = 'manual'", () => {
    const input = makeInput({
      purchases: [
        {
          id: "pur-1",
          plannedArrivalDate: "2026-08-15",
          createdAt: "2026-06-01",
          qtyRemaining: 100,
          transitQty: 0,
          transitDate: null,
          leadTimeDays: 45,
          reachedStages: [],
        },
      ],
    })
    const batches = resolveArrivalBatches(input)
    expect(batches.length).toBeGreaterThan(0)
    const batch = batches.find((b: { refId: string }) => b.refId === "pur-1")
    expect(batch?.dateSource).toBe("manual")
    expect(batch?.date).toBe("2026-08-15")
  })
})

describe("resolveArrivalBatches — уровень 2: TRANSIT.date + transitDays", () => {
  it("TRANSIT.qty > 0 и date != null → dateSource = 'transit-eta'", () => {
    const input = makeInput({
      purchases: [
        {
          id: "pur-2",
          plannedArrivalDate: null,
          createdAt: "2026-05-01",
          qtyRemaining: 100,
          transitQty: 100,
          transitDate: "2026-07-10",
          leadTimeDays: 20,
          reachedStages: [],
        },
      ],
    })
    const batches = resolveArrivalBatches(input)
    const batch = batches.find((b: { refId: string }) => b.refId === "pur-2")
    expect(batch?.dateSource).toBe("transit-eta")
    // дата = transitDate + transitDays(20) = "2026-07-30"
    expect(batch?.date).toBe("2026-07-30")
  })

  it("TRANSIT.qty = 0 → пропускается на уровень 3 (leadtime-eta)", () => {
    const input = makeInput({
      today: "2026-05-01",  // floor = 2026-05-01+45 = 2026-06-15; createdAt+45 = 2026-06-15 → floor tie, OK
      purchases: [
        {
          id: "pur-3",
          plannedArrivalDate: null,
          createdAt: "2026-05-01",
          qtyRemaining: 50,
          transitQty: 0,
          transitDate: "2026-07-10",
          leadTimeDays: 45,
          reachedStages: [],
        },
      ],
    })
    const batches = resolveArrivalBatches(input)
    const batch = batches.find((b: { refId: string }) => b.refId === "pur-3")
    expect(batch?.dateSource).toBe("leadtime-eta")
  })

  it("TRANSIT.date = null → пропускается на уровень 3 (leadtime-eta)", () => {
    const input = makeInput({
      today: "2026-05-01",
      purchases: [
        {
          id: "pur-4",
          plannedArrivalDate: null,
          createdAt: "2026-05-01",
          qtyRemaining: 50,
          transitQty: 30,
          transitDate: null,
          leadTimeDays: 45,
          reachedStages: [],
        },
      ],
    })
    const batches = resolveArrivalBatches(input)
    const batch = batches.find((b: { refId: string }) => b.refId === "pur-4")
    expect(batch?.dateSource).toBe("leadtime-eta")
  })

  it("частичный TRANSIT (qty < qtyRemaining) → 2 партии: transit-eta + leadtime-eta", () => {
    const input = makeInput({
      purchases: [
        {
          id: "pur-5",
          plannedArrivalDate: null,
          createdAt: "2026-05-01",
          qtyRemaining: 100,
          transitQty: 40, // < qtyRemaining(100) → сплит
          transitDate: "2026-07-10",
          leadTimeDays: 45,
          reachedStages: [],
        },
      ],
    })
    const batches = resolveArrivalBatches(input)
    const pur5Batches = batches.filter((b: { refId: string }) => b.refId === "pur-5")
    expect(pur5Batches).toHaveLength(2)
    const transitBatch = pur5Batches.find(
      (b: { dateSource: string }) => b.dateSource === "transit-eta",
    )
    const leadtimeBatch = pur5Batches.find(
      (b: { dateSource: string }) => b.dateSource === "leadtime-eta",
    )
    expect(transitBatch?.qty).toBe(40)
    expect(leadtimeBatch?.qty).toBe(60) // остаток = 100 - 40
  })
})

describe("resolveArrivalBatches — уровень 3: createdAt + leadTimeDays", () => {
  it("нет планов/транзита → dateSource = 'leadtime-eta', дата = createdAt + 45", () => {
    const input = makeInput({
      today: "2026-05-01", // floor = 2026-05-01+45 = 2026-06-15; createdAt+45 = 2026-07-16 > 2026-06-15 → max=2026-07-16
      purchases: [
        {
          id: "pur-6",
          plannedArrivalDate: null,
          createdAt: "2026-06-01",
          qtyRemaining: 80,
          transitQty: 0,
          transitDate: null,
          leadTimeDays: 45,
          reachedStages: [],
        },
      ],
    })
    const batches = resolveArrivalBatches(input)
    const batch = batches.find((b: { refId: string }) => b.refId === "pur-6")
    expect(batch?.dateSource).toBe("leadtime-eta")
    // createdAt "2026-06-01" + 45 дней = "2026-07-16"
    expect(batch?.date).toBe("2026-07-16")
  })
})

describe("resolveArrivalBatches — уровень 4: legacy ProductIncoming.expectedDate", () => {
  it("одна открытая закупка без дат + legacyIncoming → dateSource = 'legacy-expected'", () => {
    const input = makeInput({
      purchases: [
        {
          id: "pur-7",
          plannedArrivalDate: null,
          createdAt: null,
          qtyRemaining: 60,
          transitQty: 0,
          transitDate: null,
          leadTimeDays: null, // без lead time → уровень 3 не даёт дату → уровень 4
          reachedStages: [],
        },
      ],
      legacyIncoming: {
        expectedDate: "2026-08-20",
        qty: 60,
      },
    })
    const batches = resolveArrivalBatches(input)
    const batch = batches.find((b: { refId: string }) => b.refId === "pur-7")
    expect(batch?.dateSource).toBe("legacy-expected")
    expect(batch?.date).toBe("2026-08-20")
  })
})

describe("resolveArrivalBatches — уровень 5: нет данных → партия не создаётся", () => {
  it("нет ни одной даты → закупка не попадает в батчи", () => {
    const input = makeInput({
      purchases: [
        {
          id: "pur-8",
          plannedArrivalDate: null,
          createdAt: null,
          qtyRemaining: 50,
          transitQty: 0,
          transitDate: null,
          leadTimeDays: null,
          reachedStages: [],
        },
      ],
      legacyIncoming: null,
    })
    const batches = resolveArrivalBatches(input)
    const pur8Batches = batches.filter((b: { refId: string }) => b.refId === "pur-8")
    expect(pur8Batches).toHaveLength(0)
  })
})

describe("resolveArrivalBatches — виртуальные закупки", () => {
  it("SUGGESTED виртуальная закупка → source = 'virtual', dateSource = 'manual'", () => {
    const input = makeInput({
      virtualPurchases: [
        {
          id: "vp-1",
          qty: 200,
          expectedArrivalDate: "2026-09-15",
          status: "SUGGESTED",
        },
      ],
    })
    const batches = resolveArrivalBatches(input)
    const batch = batches.find((b: { refId: string }) => b.refId === "vp-1")
    expect(batch?.source).toBe("virtual")
    expect(batch?.date).toBe("2026-09-15")
  })
})

describe("resolveArrivalBatches — floor по текущему этапу (D-1)", () => {
  // today = "2026-07-05", transitDays = 20, defaultLeadTimeDays = 45

  it("Кейс A: PRODUCTION этап → floor = today+45 = 2026-08-19 побеждает createdAt+45 = 2026-07-16", () => {
    // createdAt "2026-06-01" + 45 = "2026-07-16"; floor "2026-07-05"+45 = "2026-08-19" → max = "2026-08-19"
    const input = makeInput({
      purchases: [
        {
          id: "pur-A",
          plannedArrivalDate: null,
          createdAt: "2026-06-01",
          qtyRemaining: 100,
          transitQty: 0,
          transitDate: null,
          leadTimeDays: 45,
          reachedStages: ["PRODUCTION"],
        },
      ],
    })
    const batches = resolveArrivalBatches(input)
    const batch = batches.find((b: { refId: string }) => b.refId === "pur-A")
    expect(batch?.dateSource).toBe("leadtime-eta")
    expect(batch?.date).toBe("2026-08-19") // floor today+45
  })

  it("Кейс B: SHIPMENT этап → floor = today+transit = 2026-07-25 побеждает createdAt+45 = 2026-07-16", () => {
    // createdAt "2026-06-01" + 45 = "2026-07-16"; floor "2026-07-05"+20 = "2026-07-25" → max = "2026-07-25"
    const input = makeInput({
      purchases: [
        {
          id: "pur-B",
          plannedArrivalDate: null,
          createdAt: "2026-06-01",
          qtyRemaining: 100,
          transitQty: 0,
          transitDate: null,
          leadTimeDays: 45,
          reachedStages: ["PRODUCTION", "INSPECTION", "SHIPMENT"],
        },
      ],
    })
    const batches = resolveArrivalBatches(input)
    const batch = batches.find((b: { refId: string }) => b.refId === "pur-B")
    expect(batch?.dateSource).toBe("leadtime-eta")
    expect(batch?.date).toBe("2026-07-25") // SHIPMENT floor: today+transit
  })

  it("Кейс C: max сохраняет позднейшую — createdAt+45 > floor → ETA = createdAt+45", () => {
    // createdAt "2026-08-01" + 45 = "2026-09-15"; floor "2026-07-05"+45 = "2026-08-19" → max = "2026-09-15"
    const input = makeInput({
      purchases: [
        {
          id: "pur-C",
          plannedArrivalDate: null,
          createdAt: "2026-08-01",
          qtyRemaining: 100,
          transitQty: 0,
          transitDate: null,
          leadTimeDays: 45,
          reachedStages: ["PRODUCTION"],
        },
      ],
    })
    const batches = resolveArrivalBatches(input)
    const batch = batches.find((b: { refId: string }) => b.refId === "pur-C")
    expect(batch?.dateSource).toBe("leadtime-eta")
    expect(batch?.date).toBe("2026-09-15") // createdAt+45 > floor
  })

  it("Кейс D: plannedArrivalDate → floor НЕ применяется (dateSource = manual)", () => {
    // plannedArrivalDate "2026-07-06" < today+45 = "2026-08-19", но manual имеет приоритет
    const input = makeInput({
      purchases: [
        {
          id: "pur-D",
          plannedArrivalDate: "2026-07-06",
          createdAt: "2026-06-01",
          qtyRemaining: 100,
          transitQty: 0,
          transitDate: null,
          leadTimeDays: 45,
          reachedStages: ["PRODUCTION"],
        },
      ],
    })
    const batches = resolveArrivalBatches(input)
    const batch = batches.find((b: { refId: string }) => b.refId === "pur-D")
    expect(batch?.dateSource).toBe("manual") // floor НЕ применён
    expect(batch?.date).toBe("2026-07-06")
  })
})
