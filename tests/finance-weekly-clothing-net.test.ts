// tests/finance-weekly-clothing-net.test.ts
// Quick 260714-gt7: unit-тесты pure-функции netClothingSales — нетто-агрегация
// базиса одежды (выкупы − возвраты) в понедельном фин-отчёте /finance/weekly.
//
// Тест-файл pure: ноль импортов Prisma/React.

import { describe, it, expect } from "vitest"

import { netClothingSales, type ClothingSalesAgg } from "@/lib/finance-weekly/clothing-net"

describe("netClothingSales", () => {
  it("возвраты вычитаются: 12−4=8 шт, 24000−8000=16000 ₽ (848714305, неделя 06.07-12.07)", () => {
    const agg: ClothingSalesAgg = {
      buyoutsCount: 12,
      buyoutsRub: 24000,
      returnsCount: 4,
      returnsRub: -8000,
    }
    expect(netClothingSales(agg)).toEqual({ qty: 8, rub: 16000 })
  })

  it("отрицательное нетто клампится в 0 (qty), rub НЕ клампится", () => {
    const agg: ClothingSalesAgg = {
      buyoutsCount: 3,
      buyoutsRub: 6000,
      returnsCount: 5,
      returnsRub: -10000,
    }
    expect(netClothingSales(agg)).toEqual({ qty: 0, rub: -4000 })
  })

  it("нулевое нетто безопасно: не бросает, деления нет", () => {
    const agg: ClothingSalesAgg = {
      buyoutsCount: 4,
      buyoutsRub: 8000,
      returnsCount: 4,
      returnsRub: -8000,
    }
    expect(netClothingSales(agg)).toEqual({ qty: 0, rub: 0 })
  })

  it("null-поля _sum (Prisma groupBy без данных) → qty 0, rub 0", () => {
    const agg = {
      buyoutsCount: undefined as unknown as number,
      buyoutsRub: undefined as unknown as number,
      returnsCount: undefined as unknown as number,
      returnsRub: undefined as unknown as number,
    }
    expect(netClothingSales(agg)).toEqual({ qty: 0, rub: 0 })
  })

  it("нет возвратов: обратная совместимость с gross-неделями", () => {
    const agg: ClothingSalesAgg = {
      buyoutsCount: 5,
      buyoutsRub: 10000,
      returnsCount: 0,
      returnsRub: 0,
    }
    expect(netClothingSales(agg)).toEqual({ qty: 5, rub: 10000 })
  })
})
