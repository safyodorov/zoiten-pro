import { describe, it, expect } from "vitest"
import { appSettingValueSchema, isValidAppSettingKey } from "@/lib/pricing-schemas"

// ──────────────────────────────────────────────────────────────────
// GREEN — план 07-05
// ──────────────────────────────────────────────────────────────────
//
// Этот файл проверяет Zod-валидацию значений AppSetting и whitelist ключей
// (D-02). Чистые Zod-схемы живут в lib/pricing-schemas.ts (вынесены из
// app/actions/pricing.ts, поскольку "use server" файлы Next.js 15 не
// экспортируют синхронные значения). Actions в app/actions/pricing.ts
// импортируют те же схемы из lib/pricing-schemas.
//
// Ключи AppSetting (6 штук):
//   wbWalletPct, wbAcquiringPct, wbJemPct,
//   wbCreditPct, wbOverheadPct, wbTaxPct
//
// Валидация value:
//   - строковое представление числа
//   - 0 ≤ value ≤ 100
//   - поддержка десятых (2.0, 2.7, 99.9)

describe("appSettingValueSchema — Zod валидация ставок", () => {
  it("принимает валидные значения в диапазоне 0..100", () => {
    expect(appSettingValueSchema.safeParse("2.0").success).toBe(true)
    expect(appSettingValueSchema.safeParse("2.5").success).toBe(true)
    expect(appSettingValueSchema.safeParse("2.7").success).toBe(true)
    expect(appSettingValueSchema.safeParse("0").success).toBe(true)
    expect(appSettingValueSchema.safeParse("99.9").success).toBe(true)
    expect(appSettingValueSchema.safeParse("100").success).toBe(true)
  })

  it("отклоняет значения > 100", () => {
    expect(appSettingValueSchema.safeParse("101").success).toBe(false)
    expect(appSettingValueSchema.safeParse("200").success).toBe(false)
    expect(appSettingValueSchema.safeParse("100.1").success).toBe(false)
  })

  it("отклоняет отрицательные значения", () => {
    expect(appSettingValueSchema.safeParse("-1").success).toBe(false)
    expect(appSettingValueSchema.safeParse("-0.5").success).toBe(false)
  })

  it("отклоняет не-числовые и пустые значения", () => {
    expect(appSettingValueSchema.safeParse("abc").success).toBe(false)
    expect(appSettingValueSchema.safeParse("").success).toBe(false)
    expect(appSettingValueSchema.safeParse("2.0%").success).toBe(false)
    expect(appSettingValueSchema.safeParse(" ").success).toBe(false)
  })
})

describe("isValidAppSettingKey — whitelist из 6 известных ключей", () => {
  it("принимает все 6 известных ключей", () => {
    expect(isValidAppSettingKey("wbWalletPct")).toBe(true)
    expect(isValidAppSettingKey("wbAcquiringPct")).toBe(true)
    expect(isValidAppSettingKey("wbJemPct")).toBe(true)
    expect(isValidAppSettingKey("wbCreditPct")).toBe(true)
    expect(isValidAppSettingKey("wbOverheadPct")).toBe(true)
    expect(isValidAppSettingKey("wbTaxPct")).toBe(true)
  })

  it("отклоняет неизвестные ключи (защита от SQL injection через key param)", () => {
    expect(isValidAppSettingKey("unknown")).toBe(false)
    expect(isValidAppSettingKey("wbEvilKey")).toBe(false)
    expect(isValidAppSettingKey("")).toBe(false)
    expect(isValidAppSettingKey("'; DROP TABLE AppSetting; --")).toBe(false)
  })

  it("регистрозависимая проверка (wbwalletpct != wbWalletPct)", () => {
    expect(isValidAppSettingKey("wbwalletpct")).toBe(false)
    expect(isValidAppSettingKey("WBWALLETPCT")).toBe(false)
  })
})
