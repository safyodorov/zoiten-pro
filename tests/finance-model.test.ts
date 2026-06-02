import { describe, it, expect } from "vitest"
import { runModel, simulateVariant } from "@/lib/finance-model/engine"
import { DEFAULT_PARAMS, DEFAULT_VARIANTS, PRODUCTS } from "@/lib/finance-model/inputs"

describe("finance-model engine", () => {
  const model = runModel()
  const base = model.variants.find((v) => v.config.id === 2)!

  it("базовый вариант: годовая выручка в разумном диапазоне (~877 млн ± старт-рамп)", () => {
    // Полный стационар = 73.1М/мес × 12 = 877М, но первые месяцы — наполнение трубы,
    // поэтому годовая выручка ниже. Ожидаем 600–877 млн.
    const annualRevenue = base.profitTotals.revenue
    expect(annualRevenue).toBeGreaterThan(600_000_000)
    expect(annualRevenue).toBeLessThan(877_000_000)
  })

  it("ROI-консистентность: профит/себест проданного ≈ ROI из таблицы (взвешенно)", () => {
    // Чистая прибыль / себестоимость проданного по базовому варианту.
    const ratio = base.profitTotals.netProfit / base.profitTotals.cogs
    // Взвешенный ROI по товарам лежит около 0.35–0.45.
    expect(ratio).toBeGreaterThan(0.3)
    expect(ratio).toBeLessThan(0.5)
  })

  it("прибыль положительна и опекс — основная доля выручки", () => {
    expect(base.profitTotals.netProfit).toBeGreaterThan(0)
    expect(base.profitTotals.opex).toBeGreaterThan(base.profitTotals.netProfit)
    // выведено = 70% прибыли
    expect(base.profitTotals.withdrawn).toBeCloseTo(base.profitTotals.netProfit * 0.7, 0)
    expect(base.profitTotals.reinvested).toBeCloseTo(base.profitTotals.netProfit * 0.3, 0)
  })

  it("кредит необходим во всех вариантах (собств. средств недостаточно)", () => {
    for (const v of model.variants) {
      expect(v.credit.peakCredit).toBeGreaterThan(0)
      expect(v.credit.ownFundsSufficient).toBe(false)
      // пиковая совокупная потребность в капитале существенно выше собств. средств
      expect(v.credit.peakCapitalNeed).toBeGreaterThan(v.config.ownFunds)
    }
  })

  it("кредит привлекается траншами кратно 5 млн и гасится дифференцированно", () => {
    const step = DEFAULT_PARAMS.creditStepRub
    for (const v of model.variants) {
      // каждый добор кратен шагу 5 млн
      for (const r of v.cashFlow) {
        expect(r.creditDrawn % step).toBeCloseTo(0, 3)
      }
      // тело гасится в течение года (сумма гашений > 0)
      const principal = v.cashFlow.reduce((a, r) => a + r.creditPrincipalRepaid, 0)
      expect(principal).toBeGreaterThan(0)
      // амортизация снижает остаток ниже пика
      expect(v.credit.endingCredit).toBeLessThan(v.credit.peakCredit)
      // проценты в первые месяцы выше, чем в последние (на убывающий остаток) —
      // на каком-то месяце с долгом проценты должны быть > 0
      expect(v.credit.totalInterest).toBeGreaterThan(0)
    }
  })

  it("больше собственных средств → меньше пиковый кредит", () => {
    const v1 = model.variants.find((v) => v.config.id === 1)!
    const v2 = model.variants.find((v) => v.config.id === 2)!
    const v3 = model.variants.find((v) => v.config.id === 3)!
    expect(v1.credit.peakCredit).toBeGreaterThan(v2.credit.peakCredit)
    expect(v2.credit.peakCredit).toBeGreaterThan(v3.credit.peakCredit)
  })

  it("маржа варианта 1 (+1пп) даёт больше прибыли, чем вариант 3 (−1пп)", () => {
    const v1 = model.variants.find((v) => v.config.id === 1)!
    const v3 = model.variants.find((v) => v.config.id === 3)!
    expect(v1.profitTotals.netProfit).toBeGreaterThan(v3.profitTotals.netProfit)
  })

  it("прибыль после процентов = чистая прибыль − проценты", () => {
    for (const v of model.variants) {
      expect(v.profitAfterInterest).toBeCloseTo(
        v.profitTotals.netProfit - v.credit.totalInterest, 3,
      )
    }
  })

  it("при равной марже больше собств. средств → больше прибыль после процентов", () => {
    // изолируем эффект финансирования: дельта маржи = 0 во всех вариантах
    const variants = [
      { id: 1, label: "10", ownFunds: 10_000_000, marginDeltaPct: 0 },
      { id: 2, label: "20", ownFunds: 20_000_000, marginDeltaPct: 0 },
      { id: 3, label: "30", ownFunds: 30_000_000, marginDeltaPct: 0 },
    ]
    const [a, b, c] = variants.map((v) => simulateVariant(PRODUCTS, DEFAULT_PARAMS, v))
    // одинаковая операционная прибыль (маржа равна)
    expect(a.profitTotals.netProfit).toBeCloseTo(b.profitTotals.netProfit, 3)
    // меньше процентов при больших собств. средствах → больше прибыль после процентов
    expect(a.credit.totalInterest).toBeGreaterThan(b.credit.totalInterest)
    expect(b.credit.totalInterest).toBeGreaterThan(c.credit.totalInterest)
    expect(c.profitAfterInterest).toBeGreaterThan(b.profitAfterInterest)
    expect(b.profitAfterInterest).toBeGreaterThan(a.profitAfterInterest)
  })

  it("12 месяцев в каждой таблице", () => {
    expect(base.profit).toHaveLength(12)
    expect(base.cashFlow).toHaveLength(12)
    expect(base.profit[0].monthLabel).toBe("Июн’26")
    expect(base.profit[11].monthLabel).toBe("Май’27")
  })

  it("проценты по кредиту положительны и согласованы со ставкой", () => {
    expect(base.credit.totalInterest).toBeGreaterThan(0)
    // грубо: проценты ≈ средний долг × 25% (год ± рамп)
    const implied = base.credit.avgCredit * DEFAULT_PARAMS.creditAnnualRate
    expect(base.credit.totalInterest).toBeGreaterThan(implied * 0.5)
    expect(base.credit.totalInterest).toBeLessThan(implied * 1.5)
  })

  it("первые месяцы — наполнение трубы: продаж ещё нет (выручка 0 в Июн)", () => {
    // Минимальная доступность ~60 дней → в июне продаж нет.
    expect(base.profit[0].revenue).toBe(0)
    expect(base.profit[2].revenue).toBeGreaterThan(0) // к августу продажи идут
  })

  it("метрики товаров: 9 шт, прибыль и доходность капитала положительны", () => {
    expect(model.productMetrics).toHaveLength(9)
    for (const pm of model.productMetrics) {
      expect(pm.annualProfit).toBeGreaterThan(0)
      expect(pm.avgWorkingCapital).toBeGreaterThan(0)
      expect(pm.peakWorkingCapital).toBeGreaterThanOrEqual(pm.avgWorkingCapital)
      expect(pm.capitalTurnsPerYear).toBeGreaterThan(0)
      expect(pm.returnOnWorkingCapital).toBeGreaterThan(0)
      expect(pm.cashCycleDays).toBeGreaterThan(50) // лид-тайм 60–91 дн + отсрочка WB
    }
  })

  it("сумма прибыли по товарам ≈ прибыль базового варианта", () => {
    const sumProfit = model.productMetrics.reduce((a, m) => a + m.annualProfit, 0)
    // productMetrics на базовой марже = вариант 2
    expect(sumProfit).toBeCloseTo(base.profitTotals.netProfit, -3)
  })

  it("детерминированность: повторный прогон идентичен", () => {
    const a = simulateVariant(PRODUCTS, DEFAULT_PARAMS, DEFAULT_VARIANTS[1])
    const b = simulateVariant(PRODUCTS, DEFAULT_PARAMS, DEFAULT_VARIANTS[1])
    expect(a.credit.peakCredit).toBe(b.credit.peakCredit)
    expect(a.profitTotals.revenue).toBe(b.profitTotals.revenue)
  })
})
