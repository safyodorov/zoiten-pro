import { describe, it, expect } from "vitest"

describe("parseIvanovoExcel", () => {
  // TODO: Real fixture от пользователя в Plan 14-04 Zero Wave.
  // После получения ivanovo-sample.xlsx:
  //   1. Проверить реальные индексы колонок (A=SKU, B=qty — предположение, off-by-one возможен)
  //   2. Реализовать lib/parse-ivanovo-excel.ts на основе реального файла
  //   3. Заменить этот stub реальными тестами с fixtures/ivanovo-sample.xlsx
  it.skip("happy path с реальной fixture (ждёт Plan 14-04 Zero Wave)", () => {
    expect(true).toBe(false)
  })
})
