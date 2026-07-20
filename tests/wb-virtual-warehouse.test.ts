// tests/wb-virtual-warehouse.test.ts
// quick 260720-oh2: виртуальные склады БПЛА (сгоревшие остатки Электросталь/Котовск).

import { describe, it, expect } from "vitest"
import { applyBurnedInWay } from "@/lib/wb-virtual-warehouse"

describe("applyBurnedInWay", () => {
  it("вычитает сгоревшее qty из API-значения in-way", () => {
    expect(applyBurnedInWay(6414, 5142)).toBe(1272)
  })

  it("floor на 0 когда сгоревшее больше API-значения", () => {
    expect(applyBurnedInWay(100, 200)).toBe(0)
  })

  it("burnedQty=0 → значение не меняется", () => {
    expect(applyBurnedInWay(100, 0)).toBe(100)
  })
})
