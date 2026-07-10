import { describe, it, expect } from "vitest"
import { computeWeeklyFinReport, poolPerUnit } from "@/lib/finance-weekly/engine"
import type {
  UniversePools,
  WeeklyArticleInput,
  WeeklyFinReportInputs,
} from "@/lib/finance-weekly/types"

// ──────────────────────────────────────────────────────────────────
// Golden test — nmId 165967746 «Массажер для ног 250» (appliances)
// ──────────────────────────────────────────────────────────────────
//
// Source of truth: Excel «Финансовый отчёт 3 (1).xlsx», лист «Показатели»,
// неделя 29.06-05.07. Все формулы движка выведены из формул этого листа
// (§2 дизайн-спеки docs/superpowers/specs/2026-07-08-weekly-finreport-design.md).
//
// Вход: H=4 (заказы), K=11748.8 (цена/ед), O=4339 (закупка), L=4015 (реклама),
//       M=0 (отзывы). Константы: налог 8%, джем 1%, брак 2%, эквайринг 2.87%.
// Пулы заданы так, чтобы per-unit разрешились в ТОЧНЫЕ значения (baseRevenue=K,
// total=нужный perUnit → poolPerUnit = total): доставка 175, кредит 365.1,
// общие 542.05, приёмка 10.77, хранение 0.
// Ожидания (±0.5 ₽):
//   ИУ  (comm=31.5, N=0):    I≈8047.93, profitPerUnit≈130.90, profit≈523.6.
//   Оферта (comm=25.5, N=1380): I≈8752.86, profitPerUnit≈−544.18, profit≈−2176.7.

// Нулевой набор пулов — для мира, который не участвует в конкретном тесте.
function zeroPools(): UniversePools {
  const zero = { total: 0, baseRevenue: 0 }
  return {
    deliveryToMp: { ...zero },
    creditInterest: { ...zero },
    overhead: { ...zero },
    acceptance: { ...zero },
    storage: { ...zero },
  }
}

const goldenArticle: WeeklyArticleInput = {
  nmId: 165967746,
  universe: "appliances",
  qtyOrders: 4, // H
  grossPricePerUnit: 11748.8, // K
  commIuPct: 31.5,
  commStdPct: 25.5,
  costPerUnit: 4339, // O
  adSpendTotal: 4015, // L
  reviewWriteoffTotal: 0, // M
  logisticsIuPerUnit: 0, // N_iu
  logisticsStdPerUnit: 1380, // N_std
  storagePerUnit: 0, // per-article override хранения = 0
}

const goldenInputs: WeeklyFinReportInputs = {
  articles: [goldenArticle],
  pools: {
    appliances: {
      // baseRevenue=K → poolPerUnit = total (точное разрешение per-unit)
      deliveryToMp: { total: 175, baseRevenue: 11748.8 },
      creditInterest: { total: 365.1, baseRevenue: 11748.8 },
      overhead: { total: 542.05, baseRevenue: 11748.8 },
      acceptance: { total: 10.77, baseRevenue: 11748.8 },
      storage: { total: 0, baseRevenue: 11748.8 },
    },
    clothing: zeroPools(),
  },
}

describe("computeWeeklyFinReport — golden nmId 165967746 (дуал ИУ/Оферта)", () => {
  const out = computeWeeklyFinReport(goldenInputs)
  const art = out.articles[0]

  it("возвращает ровно 1 артикул, universe=appliances", () => {
    expect(out.articles).toHaveLength(1)
    expect(art.nmId).toBe(165967746)
    expect(art.universe).toBe("appliances")
  })

  // ── Сценарий ИУ ──
  it("ИУ: I (цена−комиссия/ед) ≈ 8047.93 ₽", () => {
    expect(Math.abs(art.iu.cutPricePerUnit - 8047.93)).toBeLessThan(0.5)
  })

  it("ИУ: profitPerUnit ≈ 130.90 ₽ (±0.5)", () => {
    expect(art.iu.profitPerUnit).toBeCloseTo(130.9, 0)
  })

  it("ИУ: profit ≈ 523.6 ₽ (±0.5)", () => {
    expect(art.iu.profit).toBeCloseTo(523.6, 0)
  })

  it("ИУ: revenue = 46995.2 ₽ (K×H)", () => {
    expect(art.iu.revenue).toBeCloseTo(46995.2, 2)
  })

  // ── Сценарий Оферта ──
  it("Оферта: I (цена−комиссия/ед) ≈ 8752.86 ₽", () => {
    expect(Math.abs(art.std.cutPricePerUnit - 8752.86)).toBeLessThan(0.5)
  })

  it("Оферта: profitPerUnit ≈ −544.18 ₽ (±0.5)", () => {
    expect(art.std.profitPerUnit).toBeCloseTo(-544.18, 0)
  })

  it("Оферта: profit ≈ −2176.7 ₽ (±0.5)", () => {
    expect(art.std.profit).toBeCloseTo(-2176.7, 0)
  })

  it("Оферта: revenue = 46995.2 ₽ (та же K×H)", () => {
    expect(art.std.revenue).toBeCloseTo(46995.2, 2)
  })

  // ── Пооперационная per-unit разбивка (breakdown, для drill-down модалки) ──
  it("ИУ: breakdown.netOfCommissionPerUnit ≈ 8047.93", () => {
    expect(Math.abs(art.iu.breakdown.netOfCommissionPerUnit - 8047.93)).toBeLessThan(0.5)
  })

  it("ИУ: breakdown.taxPerUnit ≈ 939.9 и acquiringPerUnit ≈ 337.19", () => {
    expect(art.iu.breakdown.taxPerUnit).toBeCloseTo(939.9, 1)
    expect(art.iu.breakdown.acquiringPerUnit).toBeCloseTo(337.19, 1)
  })

  it("Оферта: breakdown.logisticsPerUnit ≈ 1380 (N_std)", () => {
    expect(art.std.breakdown.logisticsPerUnit).toBeCloseTo(1380, 6)
  })

  it("ArticleResult несёт qtyOrders=4 (H)", () => {
    expect(art.qtyOrders).toBe(4)
  })

  it("breakdown.commissionPct различается ИУ (31.5) vs Оферта (25.5)", () => {
    expect(art.iu.breakdown.commissionPct).toBe(31.5)
    expect(art.std.breakdown.commissionPct).toBe(25.5)
  })

  // ── Роллап + водопад ──
  it("роллап appliances iu.profit совпадает с per-article", () => {
    expect(out.rollup.byUniverse).toHaveLength(1)
    expect(out.rollup.byUniverse[0].universe).toBe("appliances")
    expect(out.rollup.byUniverse[0].iu.profit).toBeCloseTo(art.iu.profit, 6)
    expect(out.rollup.grand.std.profit).toBeCloseTo(art.std.profit, 6)
  })

  it("водопад: логистика различается по сценариям (iu=0, std=N×H=5520)", () => {
    expect(out.waterfall.iu.logistics).toBeCloseTo(0, 6)
    expect(out.waterfall.std.logistics).toBeCloseTo(1380 * 4, 6)
    // закупка одинакова в обоих сценариях (O×H)
    expect(out.waterfall.iu.cost).toBeCloseTo(4339 * 4, 6)
    expect(out.waterfall.std.cost).toBeCloseTo(4339 * 4, 6)
  })
})

// ──────────────────────────────────────────────────────────────────
// poolPerUnit — распределение пропорц. выручке (revenue-share) в изоляции
// ──────────────────────────────────────────────────────────────────
//
// Доказывает формулу (K / baseRevenue) × poolTotal на реальных числах недели:
// K=11748.8, база=17614883 (Зойтен бытовая+одежда), пул доставки=262300 → ≈174.95.

describe("poolPerUnit — revenue-share распределение", () => {
  it("poolPerUnit(11748.8, 17614883, 262300) ≈ 175 (факт ≈174.95)", () => {
    expect(poolPerUnit(11748.8, 17614883, 262300)).toBeCloseTo(175, 0)
  })

  it("baseRevenue=0 → 0 (zero-guard, не Infinity/NaN)", () => {
    const v = poolPerUnit(100, 0, 999)
    expect(v).toBe(0)
    expect(Number.isFinite(v)).toBe(true)
  })

  it("отрицательная baseRevenue → 0 (guard)", () => {
    expect(poolPerUnit(100, -50, 999)).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────────
// Guard: одежда (clothing) НЕ получает проценты по кредиту (§2.2)
// ──────────────────────────────────────────────────────────────────
//
// В Excel у строк одежды U=0. Движок игнорирует пул кредита для clothing —
// profit при НЕнулевом creditInterest РАВЕН profit при creditInterest.total=0.

describe("computeWeeklyFinReport — clothing НЕ несёт кредит (guard)", () => {
  const clothingArticle: WeeklyArticleInput = {
    nmId: 990001,
    universe: "clothing",
    qtyOrders: 10,
    grossPricePerUnit: 2000,
    commIuPct: 30,
    commStdPct: 24,
    costPerUnit: 500,
    adSpendTotal: 1000,
    reviewWriteoffTotal: 0,
    logisticsIuPerUnit: 0,
    logisticsStdPerUnit: 100,
    storagePerUnit: 0,
  }

  function buildInputs(creditTotal: number): WeeklyFinReportInputs {
    const clothingPools: UniversePools = {
      deliveryToMp: { total: 300, baseRevenue: 2000 },
      creditInterest: { total: creditTotal, baseRevenue: 2000 }, // задан НЕнулевым
      overhead: { total: 200, baseRevenue: 2000 },
      acceptance: { total: 50, baseRevenue: 2000 },
      storage: { total: 0, baseRevenue: 2000 },
    }
    return {
      articles: [clothingArticle],
      pools: { appliances: zeroPools(), clothing: clothingPools },
    }
  }

  it("profit одежды одинаков при creditInterest.total=100000 и =0 (кредит игнорируется)", () => {
    const withCredit = computeWeeklyFinReport(buildInputs(100000)).articles[0]
    const noCredit = computeWeeklyFinReport(buildInputs(0)).articles[0]

    expect(withCredit.iu.profit).toBeCloseTo(noCredit.iu.profit, 6)
    expect(withCredit.std.profit).toBeCloseTo(noCredit.std.profit, 6)
    // водопад кредита для clothing нулевой независимо от пула
    const wf = computeWeeklyFinReport(buildInputs(100000)).waterfall
    expect(wf.iu.credit).toBe(0)
    expect(wf.std.credit).toBe(0)
  })
})
