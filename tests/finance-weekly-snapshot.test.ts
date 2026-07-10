// tests/finance-weekly-snapshot.test.ts
//
// W3c (quick 260710-mih): пейлоад снапшота недели понедельного фин-отчёта.
// Pure — БЕЗ импорта Prisma/next: из snapshot.ts только runtime-функции,
// из data.ts ТОЛЬКО type-импорты (стираются), engine.ts/types.ts pure.
//
// Покрытие:
//   - roundtrip build → JSON.stringify/parse → parse → deepEqual (version 1);
//   - roundtrip с planFact: null → parse возвращает null (не undefined);
//   - version-guard (null / {} / version 2 / строка / без articles);
//   - toIsoMonday (среда / понедельник / воскресенье → тот же ISO-понедельник).

import { describe, it, expect } from "vitest"
import {
  WEEKLY_SNAPSHOT_VERSION,
  buildWeeklySnapshotPayload,
  parseWeeklySnapshotPayload,
  toIsoMonday,
  type WeeklySnapshotPlanFact,
} from "@/lib/finance-weekly/snapshot"
import { computeWeeklyFinReport } from "@/lib/finance-weekly/engine"
import {
  DEFAULT_WEEKLY_CONSTANTS,
  type UniversePools,
  type WeeklyArticleInput,
} from "@/lib/finance-weekly/types"
import type { WeeklyFinReportPageData } from "@/lib/finance-weekly/data"

// ── Фейковые входы (минимальные, удовлетворяют типам) ─────────────────────────

function emptyPools(): UniversePools {
  const zero = { total: 0, baseRevenue: 0 }
  return {
    deliveryToMp: { ...zero },
    creditInterest: { ...zero },
    overhead: { ...zero },
    acceptance: { ...zero },
    storage: { ...zero },
  }
}

const fakeArticle: WeeklyArticleInput = {
  nmId: 111,
  universe: "appliances",
  qtyOrders: 2,
  grossPricePerUnit: 1000,
  commIuPct: 30,
  commStdPct: 25,
  costPerUnit: 400,
  adSpendTotal: 50,
  reviewWriteoffTotal: 0,
  logisticsIuPerUnit: 0,
  logisticsStdPerUnit: 120,
}

const fakeData: WeeklyFinReportPageData = {
  weekStart: "2026-07-06",
  weekEnd: "2026-07-12",
  articles: [fakeArticle],
  meta: {
    111: {
      brandName: "Zoiten",
      productName: "Тестовый товар",
      productId: "p1",
      directionName: null,
      categoryName: null,
      subcategoryName: null,
    },
  },
  pools: {
    appliances: {
      deliveryToMp: { total: 100, baseRevenue: 2000 },
      creditInterest: { total: 50, baseRevenue: 2000 },
      overhead: { total: 200, baseRevenue: 2000 },
      acceptance: { total: 10, baseRevenue: 2000 },
      storage: { total: 5, baseRevenue: 2000 },
    },
    clothing: emptyPools(),
  },
  constants: DEFAULT_WEEKLY_CONSTANTS,
  manualPools: {
    delivery: 100,
    overheadAppl: 200,
    acceptanceAppl: 10,
    storageAppl: 5,
    overheadCloth: 0,
    acceptanceCloth: 0,
    storageCloth: 0,
  },
  hasRealization: false,
  poolSources: {
    storageAppl: "manual",
    storageCloth: "manual",
    acceptanceAppl: "manual",
    acceptanceCloth: "manual",
  },
  bankAutos: { opexRub: 0, deliveryMpRub: 0 },
  clothingOverheadFixedRub: 0,
  bankPoolSources: { delivery: "none", overheadAppl: "none" },
}

// Результат — через pure-движок (валидный WeeklyFinReportOutput без ручной сборки)
const fakeResult = computeWeeklyFinReport({
  articles: fakeData.articles,
  pools: fakeData.pools,
  constants: fakeData.constants,
})

const fakePlanFact: WeeklySnapshotPlanFact = {
  planWeekByNmId: { 111: 5000 },
  kpi: { planWeek: 5000, factWeek: 4200, planMonth: 20000, factMonthMtd: 15000 },
  weekEndISO: "2026-07-12",
}

// ── Roundtrip ──────────────────────────────────────────────────────────────────

describe("buildWeeklySnapshotPayload → JSON → parseWeeklySnapshotPayload", () => {
  it("roundtrip с planFact: payload переживает JSON-сериализацию 1:1", () => {
    const payload = buildWeeklySnapshotPayload(fakeData, fakeResult, fakePlanFact)
    expect(payload.version).toBe(1)
    expect(payload.version).toBe(WEEKLY_SNAPSHOT_VERSION)

    const roundtripped: unknown = JSON.parse(JSON.stringify(payload))
    const parsed = parseWeeklySnapshotPayload(roundtripped)

    expect(parsed).not.toBeNull()
    expect(parsed).toEqual(payload)
  })

  it("roundtrip с planFact: null — parse возвращает planFact: null (не undefined)", () => {
    const payload = buildWeeklySnapshotPayload(fakeData, fakeResult, null)
    const parsed = parseWeeklySnapshotPayload(JSON.parse(JSON.stringify(payload)))

    expect(parsed).not.toBeNull()
    expect(parsed!.planFact).toBeNull()
    expect(parsed).toEqual(payload)
  })
})

// ── Version-guard ──────────────────────────────────────────────────────────────

describe("parseWeeklySnapshotPayload version-guard", () => {
  it("null → null", () => {
    expect(parseWeeklySnapshotPayload(null)).toBeNull()
  })

  it("пустой объект (без version) → null", () => {
    expect(parseWeeklySnapshotPayload({})).toBeNull()
  })

  it("чужая version (2) → null", () => {
    expect(parseWeeklySnapshotPayload({ version: 2, articles: [] })).toBeNull()
  })

  it("не-объект (строка) → null", () => {
    expect(parseWeeklySnapshotPayload("строка")).toBeNull()
  })

  it("version 1 без articles-массива → null", () => {
    expect(parseWeeklySnapshotPayload({ version: 1 })).toBeNull()
  })
})

// ── toIsoMonday ────────────────────────────────────────────────────────────────

describe("toIsoMonday", () => {
  it("среда 2026-07-08 → понедельник 2026-07-06", () => {
    expect(toIsoMonday("2026-07-08")).toBe("2026-07-06")
  })

  it("понедельник 2026-07-06 → сам себе понедельник", () => {
    expect(toIsoMonday("2026-07-06")).toBe("2026-07-06")
  })

  it("воскресенье 2026-07-12 → понедельник той же ISO-недели 2026-07-06", () => {
    expect(toIsoMonday("2026-07-12")).toBe("2026-07-06")
  })
})
