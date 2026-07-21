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
// общие 542.05, приёмка 10.77, пул хранения 0 (per-article override GOLDEN_STORAGE_STD
// применяется ВМЕСТО пула, см. ниже — quick 260721-o4b).
// Ожидания (±0.5 ₽):
//   ИУ  (comm=31.5, N=0):    I≈8047.93, profitPerUnit≈130.90, profit≈523.6.
//   Оферта (comm=25.5, N=1380, storagePerUnit=S=417.6): I≈8752.86,
//     profitPerUnit≈−544.18−S≈−961.78, profit≈−2176.7−S×4≈−3847.1.

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

// Quick 260721-o4b: Решение 2026-07-21 — хранение Оферты = расчётная модель
// (S ₽/ед); ИУ хранение=0 (движок вычитает 0 для ИУ независимо от storagePerUnit).
// S выведен из РЕАЛЬНЫХ габаритов Product nmId 165967746 (прод-БД, 2026-07-21):
// 38×26×44 см → V = 38×26×44/1000 = 43.472 л, округл. до 0.1 → V=43.5 л.
// storageBaseLiter=0.16, storageAddLiter=0.16 (EFF_FALLBACK, data.ts), daysInStock=60:
//   S = (0.16 + 0.16×max(0, 43.5−1)) × 60 = (0.16 + 0.16×42.5) × 60 = 6.96×60 = 417.6
const GOLDEN_STORAGE_STD = 417.6

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
  storagePerUnit: GOLDEN_STORAGE_STD, // Оферта-only override (модель); ИУ вычитает 0
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
      storage: { total: 0, baseRevenue: 11748.8 }, // пул=0 — Оферта берёт per-article override GOLDEN_STORAGE_STD (goldenArticle.storagePerUnit)
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

  it("Оферта: profitPerUnit ≈ −544.18−S ≈ −961.78 ₽ (±0.5, S=417.6 модель хранения)", () => {
    expect(art.std.profitPerUnit).toBeCloseTo(-544.18 - GOLDEN_STORAGE_STD, 0)
  })

  it("Оферта: profit ≈ −2176.7−S×4 ≈ −3847.1 ₽ (±0.5)", () => {
    expect(art.std.profit).toBeCloseTo(-2176.7 - GOLDEN_STORAGE_STD * 4, 0)
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

  // Quick 260721-o4b (WK-03): хранение только в Оферте — водопад отражает override.
  it("водопад: хранение iu=0, std=S×H (per-article override GOLDEN_STORAGE_STD)", () => {
    expect(out.waterfall.iu.storage).toBeCloseTo(0, 6)
    expect(out.waterfall.std.storage).toBeCloseTo(GOLDEN_STORAGE_STD * 4, 6)
  })

  // Quick 260721-o4b (WK-01): бакет «Комиссия» = (K−I)×H в обоих сценариях.
  it("водопад: commission ≈ (K−I)×H в обоих сценариях", () => {
    expect(out.waterfall.iu.commission).toBeCloseTo(
      (goldenArticle.grossPricePerUnit - art.iu.cutPricePerUnit) * goldenArticle.qtyOrders,
      4,
    )
    expect(out.waterfall.std.commission).toBeCloseTo(
      (goldenArticle.grossPricePerUnit - art.std.cutPricePerUnit) * goldenArticle.qtyOrders,
      4,
    )
  })

  // Инвариант: с бакетом «Комиссия» Σ водопада = Выручка − Прибыль (без tails).
  it("инвариант: Σ водопада ИУ = revenue − profit (без waterfallTails)", () => {
    const sumIu = Object.values(out.waterfall.iu).reduce((s, v) => s + v, 0)
    expect(sumIu).toBeCloseTo(art.iu.revenue - art.iu.profit, 4)
  })

  it("инвариант: Σ водопада Оферта = revenue − profit (без waterfallTails)", () => {
    const sumStd = Object.values(out.waterfall.std).reduce((s, v) => s + v, 0)
    expect(sumStd).toBeCloseTo(art.std.revenue - art.std.profit, 4)
  })

  // Quick 260721-o4b (WK-02): waterfallTails добавляется лямп-суммой в ОБА сценария.
  it("waterfallTails: добавляет лямп-суммы к обоим сценариям водопада", () => {
    const withTails = computeWeeklyFinReport({
      ...goldenInputs,
      waterfallTails: { ad: 100, review: 20 },
    })
    expect(withTails.waterfall.iu.ad).toBeCloseTo(out.waterfall.iu.ad + 100, 6)
    expect(withTails.waterfall.std.ad).toBeCloseTo(out.waterfall.std.ad + 100, 6)
    expect(withTails.waterfall.iu.review).toBeCloseTo(out.waterfall.iu.review + 20, 6)
    expect(withTails.waterfall.std.review).toBeCloseTo(out.waterfall.std.review + 20, 6)
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

// ──────────────────────────────────────────────────────────────────
// Quick 260714-gff: Опция Джема — аддитивная надбавка к комиссии обоих
// сценариев (K×0.75/100 = 88.116 ₽ падения cutPricePerUnit в ОБОИХ сценариях).
// Golden БЕЗ constants.jemOptionPct (default 0 через coalesce) — 523.6 / −2176.7
// НЕ меняются.
// ──────────────────────────────────────────────────────────────────

describe("computeWeeklyFinReport — Опция Джема (jemOptionPct) аддитивна к комиссии", () => {
  const withJemInputs: WeeklyFinReportInputs = {
    ...goldenInputs,
    constants: { jemOptionPct: 0.75 },
  }
  const withJem = computeWeeklyFinReport(withJemInputs)
  const withoutJem = computeWeeklyFinReport(goldenInputs)
  const artWithJem = withJem.articles[0]
  const artWithoutJem = withoutJem.articles[0]

  it("commissionPct вырастает на 0.75 п.п. в ОБОИХ сценариях (ИУ 31.5→32.25, Оферта 25.5→26.25)", () => {
    expect(artWithJem.iu.breakdown.commissionPct).toBeCloseTo(32.25, 6)
    expect(artWithJem.std.breakdown.commissionPct).toBeCloseTo(26.25, 6)
  })

  it("cutPricePerUnit падает ровно на K×0.75/100 = 88.116 ₽ в ОБОИХ сценариях", () => {
    const expectedDrop = (goldenArticle.grossPricePerUnit * 0.75) / 100 // 88.116
    expect(expectedDrop).toBeCloseTo(88.116, 3)
    expect(artWithoutJem.iu.cutPricePerUnit - artWithJem.iu.cutPricePerUnit).toBeCloseTo(
      expectedDrop,
      6,
    )
    expect(artWithoutJem.std.cutPricePerUnit - artWithJem.std.cutPricePerUnit).toBeCloseTo(
      expectedDrop,
      6,
    )
  })

  it("profit соответственно падает (та же дельта × H) в обоих сценариях", () => {
    const expectedDropPerUnit = (goldenArticle.grossPricePerUnit * 0.75) / 100
    const expectedDropTotal = expectedDropPerUnit * goldenArticle.qtyOrders
    expect(artWithoutJem.iu.profit - artWithJem.iu.profit).toBeCloseTo(expectedDropTotal, 4)
    expect(artWithoutJem.std.profit - artWithJem.std.profit).toBeCloseTo(expectedDropTotal, 4)
  })

  it("golden БЕЗ constants (jemOptionPct отсутствует) — прежние значения (523.6 / −2176.7−S×4) НЕ меняются", () => {
    // Quick 260721-o4b: std.profit сдвинут на −S×4 (goldenArticle.storagePerUnit
    // теперь модель хранения GOLDEN_STORAGE_STD, не 0) — shared const влияет на
    // ВСЕ describe-блоки файла, использующие goldenInputs.
    expect(artWithoutJem.iu.profit).toBeCloseTo(523.6, 0)
    expect(artWithoutJem.std.profit).toBeCloseTo(-2176.7 - GOLDEN_STORAGE_STD * 4, 0)
  })
})

// ──────────────────────────────────────────────────────────────────
// Quick 260714-kke: хранение (Z) — статья ТОЛЬКО Оферты.
// WB не берёт хранение на ИУ (зашито в комиссию; в отчёте реализации
// paidStorage по ИУ-аккаунту = 0, экономист колонку Z для ИУ не заполняет).
// Указание пользователя 2026-07-14: в ИУ хранение НЕ вычитать.
// ──────────────────────────────────────────────────────────────────

describe("computeWeeklyFinReport — хранение вычитается только в Оферте (ИУ=0)", () => {
  const storageArticle: WeeklyArticleInput = {
    nmId: 700001,
    universe: "appliances",
    qtyOrders: 5, // H
    grossPricePerUnit: 1000, // K
    commIuPct: 30,
    commStdPct: 24,
    costPerUnit: 300, // O
    adSpendTotal: 0,
    reviewWriteoffTotal: 0,
    logisticsIuPerUnit: 0,
    logisticsStdPerUnit: 100,
    // storagePerUnit НЕ задаём → Оферта берёт из пула, ИУ = 0
  }

  // baseRevenue=K → poolPerUnit = total (точное разрешение per-unit).
  function buildStorageInputs(storageTotal: number): WeeklyFinReportInputs {
    return {
      articles: [storageArticle],
      pools: {
        appliances: {
          deliveryToMp: { total: 0, baseRevenue: 1000 },
          creditInterest: { total: 0, baseRevenue: 1000 },
          overhead: { total: 0, baseRevenue: 1000 },
          acceptance: { total: 0, baseRevenue: 1000 },
          storage: { total: storageTotal, baseRevenue: 1000 },
        },
        clothing: zeroPools(),
      },
    }
  }

  const withStorage = computeWeeklyFinReport(buildStorageInputs(50))
  const noStorage = computeWeeklyFinReport(buildStorageInputs(0))
  const artWith = withStorage.articles[0]
  const artNo = noStorage.articles[0]

  it("ИУ: breakdown.storagePerUnit = 0 при пуле хранения 50 (WB не берёт хранение)", () => {
    expect(artWith.iu.breakdown.storagePerUnit).toBe(0)
  })

  it("Оферта: breakdown.storagePerUnit ≈ 50 (пул применяется)", () => {
    expect(artWith.std.breakdown.storagePerUnit).toBeCloseTo(50, 6)
  })

  it("ИУ-прибыль не зависит от хранения (profit при пуле 50 = profit при пуле 0)", () => {
    expect(artWith.iu.profitPerUnit).toBeCloseTo(artNo.iu.profitPerUnit, 6)
    expect(artWith.iu.profit).toBeCloseTo(artNo.iu.profit, 6)
  })

  it("Оферта-прибыль падает ровно на storage×H = 50×5 = 250 ₽", () => {
    expect(artNo.std.profit - artWith.std.profit).toBeCloseTo(50 * 5, 6)
    expect(artNo.std.breakdown.storagePerUnit).toBe(0)
  })

  it("водопад: iu.storage = 0, std.storage = 50×H = 250", () => {
    expect(withStorage.waterfall.iu.storage).toBe(0)
    expect(withStorage.waterfall.std.storage).toBeCloseTo(50 * 5, 6)
  })

  it("per-article override storagePerUnit действует ТОЛЬКО на Оферту (ИУ=0)", () => {
    const overrideInputs: WeeklyFinReportInputs = {
      articles: [{ ...storageArticle, nmId: 700002, storagePerUnit: 33 }],
      pools: {
        appliances: {
          deliveryToMp: { total: 0, baseRevenue: 1000 },
          creditInterest: { total: 0, baseRevenue: 1000 },
          overhead: { total: 0, baseRevenue: 1000 },
          acceptance: { total: 0, baseRevenue: 1000 },
          storage: { total: 0, baseRevenue: 1000 }, // пул пуст — только override
        },
        clothing: zeroPools(),
      },
    }
    const ov = computeWeeklyFinReport(overrideInputs).articles[0]
    expect(ov.iu.breakdown.storagePerUnit).toBe(0)
    expect(ov.std.breakdown.storagePerUnit).toBeCloseTo(33, 6)
  })
})

// ──────────────────────────────────────────────────────────────────
// Quick 260715-f4c: overheadFixedPerUnit — фикс общих одежды/ед (256 ₽),
// аддитивно к пулу overhead в ОБОИХ сценариях. Указание 2026-07-15.
// ──────────────────────────────────────────────────────────────────
describe("computeWeeklyFinReport — overheadFixedPerUnit (фикс общих/ед)", () => {
  const base: WeeklyArticleInput = {
    nmId: 810001, universe: "clothing", qtyOrders: 10, grossPricePerUnit: 1000,
    commIuPct: 30, commStdPct: 24, costPerUnit: 300, adSpendTotal: 0,
    reviewWriteoffTotal: 0, logisticsIuPerUnit: 0, logisticsStdPerUnit: 0,
    storagePerUnit: 0,
  }
  // baseRevenue=K → poolPerUnit = total; пул overhead=100 → доля=100/ед.
  function build(article: WeeklyArticleInput): WeeklyFinReportInputs {
    return {
      articles: [article],
      pools: {
        appliances: zeroPools(),
        clothing: {
          deliveryToMp: { total: 0, baseRevenue: 1000 },
          creditInterest: { total: 0, baseRevenue: 1000 },
          overhead: { total: 100, baseRevenue: 1000 },
          acceptance: { total: 0, baseRevenue: 1000 },
          storage: { total: 0, baseRevenue: 1000 },
        },
      },
    }
  }
  const withFix = computeWeeklyFinReport(build({ ...base, overheadFixedPerUnit: 256 })).articles[0]
  const noFix = computeWeeklyFinReport(build({ ...base })).articles[0]

  it("overheadPerUnit = 256 + доля пула (100) = 356 в ОБОИХ сценариях", () => {
    expect(withFix.iu.breakdown.overheadPerUnit).toBeCloseTo(356, 6)
    expect(withFix.std.breakdown.overheadPerUnit).toBeCloseTo(356, 6)
  })
  it("без поля overheadPerUnit = только пул (100); дельта = ровно 256/ед", () => {
    expect(noFix.iu.breakdown.overheadPerUnit).toBeCloseTo(100, 6)
    expect(withFix.iu.breakdown.overheadPerUnit - noFix.iu.breakdown.overheadPerUnit).toBeCloseTo(256, 6)
  })
  it("profit падает ровно на 256×H = 2560 (оба сценария)", () => {
    expect(noFix.iu.profit - withFix.iu.profit).toBeCloseTo(256 * 10, 4)
    expect(noFix.std.profit - withFix.std.profit).toBeCloseTo(256 * 10, 4)
  })
  it("appliances без поля не затронут (golden ИУ 523.6 / Оферта −2176.7−S×4 неизменны)", () => {
    // Quick 260721-o4b: goldenArticle.storagePerUnit теперь модель GOLDEN_STORAGE_STD.
    const g = computeWeeklyFinReport(goldenInputs).articles[0]
    expect(g.iu.profit).toBeCloseTo(523.6, 0)
    expect(g.std.profit).toBeCloseTo(-2176.7 - GOLDEN_STORAGE_STD * 4, 0)
  })
})
