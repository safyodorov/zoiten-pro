// lib/finance-model/inputs.ts
//
// Входные данные финансовой модели — 9 товаров к запуску на WB + дефолтные
// глобальные параметры и варианты финансирования.
// Источник: вводная.xlsx (лист «Лист1»), уточнения собственника (2026-06-01).

import type { GlobalParams, ProductInput, VariantConfig } from "./types"

/** Товары из вводной.xlsx (обновление 2026-06-03). Себестоимость — колонка W (₽/шт).
 *  Убраны собственником из-за плохих показателей: «пылесос моющий 800» и кофемашины 1/2. */
export const PRODUCTS: ProductInput[] = [
  {
    name: "паровая швабра 1000",
    batchQty: 500, ordersPerDay: 30, price: 7200, costPerUnit: 1757,
    productionDays: 25, inspectionDays: 2, chinaLogisticsDays: 40,
    customsToIvanovoDays: 1, ivanovoReceiveDays: 1, shipToMpDays: 1, mpReceiveDays: 1,
    buyoutRate: 0.87, defectRate: 0.015, marginPct: 0.067, roi: 0.284,
  },
  {
    name: "паровая швабра 580",
    batchQty: 500, ordersPerDay: 30, price: 7200, costPerUnit: 1853,
    productionDays: 25, inspectionDays: 2, chinaLogisticsDays: 40,
    customsToIvanovoDays: 1, ivanovoReceiveDays: 1, shipToMpDays: 1, mpReceiveDays: 1,
    buyoutRate: 0.87, defectRate: 0.015, marginPct: 0.067, roi: 0.261,
  },
  {
    name: "пылесос сухой 700",
    batchQty: 300, ordersPerDay: 20, price: 12000, costPerUnit: 2818,
    productionDays: 25, inspectionDays: 2, chinaLogisticsDays: 40,
    customsToIvanovoDays: 1, ivanovoReceiveDays: 1, shipToMpDays: 1, mpReceiveDays: 1,
    buyoutRate: 0.87, defectRate: 0.015, marginPct: 0.107, roi: 0.458,
  },
  {
    name: "пылесос сухой 800",
    batchQty: 300, ordersPerDay: 20, price: 12000, costPerUnit: 2818,
    productionDays: 25, inspectionDays: 2, chinaLogisticsDays: 40,
    customsToIvanovoDays: 1, ivanovoReceiveDays: 1, shipToMpDays: 1, mpReceiveDays: 1,
    buyoutRate: 0.87, defectRate: 0.015, marginPct: 0.107, roi: 0.458,
  },
  {
    name: "пароочиститель",
    batchQty: 2700, ordersPerDay: 20, price: 6000, costPerUnit: 1083,
    productionDays: 14, inspectionDays: 2, chinaLogisticsDays: 40,
    customsToIvanovoDays: 1, ivanovoReceiveDays: 1, shipToMpDays: 1, mpReceiveDays: 1,
    buyoutRate: 0.87, defectRate: 0.015, marginPct: 0.094, roi: 0.558,
  },
  {
    name: "пылесос сухие",
    batchQty: 2200, ordersPerDay: 50, price: 14200, costPerUnit: 3500,
    productionDays: 14, inspectionDays: 2, chinaLogisticsDays: 40,
    customsToIvanovoDays: 1, ivanovoReceiveDays: 1, shipToMpDays: 1, mpReceiveDays: 1,
    buyoutRate: 0.87, defectRate: 0.015, marginPct: 0.093, roi: 0.379,
  },
]

/** Дефолтные глобальные параметры. */
export const DEFAULT_PARAMS: GlobalParams = {
  startDate: "2026-06-01",
  horizonMonths: 12,
  wbPayoutWeeks: 4,
  reinvestRate: 0.3,
  creditAnnualRate: 0.25,
  creditStepRub: 5_000_000,
  creditMinTermMonths: 12,
  safetyStockPct: 0.15,
  cashReservePct: 0.1,
  paymentSplit: { onOrder: 0.2, beforeShip: 0.5, atCustoms: 0.3 },
}

/** Три варианта финансирования. Вариант 2 — базовый. */
export const DEFAULT_VARIANTS: VariantConfig[] = [
  { id: 1, label: "Собств. 10 млн (маржа +1пп)", ownFunds: 10_000_000, marginDeltaPct: 0.01 },
  { id: 2, label: "Собств. 20 млн (база)", ownFunds: 20_000_000, marginDeltaPct: 0 },
  { id: 3, label: "Собств. 30 млн (маржа −1пп)", ownFunds: 30_000_000, marginDeltaPct: -0.01 },
]
