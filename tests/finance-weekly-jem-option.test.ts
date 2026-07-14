import { describe, it, expect } from "vitest"
import {
  DEFAULT_JEM_OPTION_PCT,
  JEM_OPTION_PREFIX,
  financeWeeklyJemOptionKey,
  resolveJemOptionPct,
} from "@/lib/finance-weekly/jem-option"

// ──────────────────────────────────────────────────────────────────
// Quick 260714-gff: carry-forward резолвер Опции Джема.
// ──────────────────────────────────────────────────────────────────

describe("financeWeeklyJemOptionKey", () => {
  it("формирует ключ с префиксом + ISO-неделя", () => {
    expect(financeWeeklyJemOptionKey("2026-07-06")).toBe(
      JEM_OPTION_PREFIX + "2026-07-06",
    )
  })
})

describe("resolveJemOptionPct — carry-forward", () => {
  it("точный ключ недели задан → его значение", () => {
    const rows = [
      { key: JEM_OPTION_PREFIX + "2026-06-29", value: "0.5" },
      { key: JEM_OPTION_PREFIX + "2026-07-06", value: "1.2" },
    ]
    expect(resolveJemOptionPct(rows, "2026-07-06")).toBe(1.2)
  })

  it("ключ недели отсутствует, есть предыдущая неделя → значение ближайшей ПРЕДЫДУЩЕЙ (max key < weekStart)", () => {
    const rows = [
      { key: JEM_OPTION_PREFIX + "2026-06-15", value: "0.6" },
      { key: JEM_OPTION_PREFIX + "2026-06-29", value: "0.9" },
    ]
    // неделя 2026-07-06 не задана → берём максимальный ключ < неё → 2026-06-29 → 0.9
    expect(resolveJemOptionPct(rows, "2026-07-06")).toBe(0.9)
  })

  it("будущие недели (key > weekStart) игнорируются", () => {
    const rows = [
      { key: JEM_OPTION_PREFIX + "2026-06-29", value: "0.8" },
      { key: JEM_OPTION_PREFIX + "2026-07-20", value: "5" }, // будущее — должно игнорироваться
    ]
    expect(resolveJemOptionPct(rows, "2026-07-06")).toBe(0.8)
  })

  it("ничего не задано → DEFAULT_JEM_OPTION_PCT (0.75)", () => {
    expect(resolveJemOptionPct([], "2026-07-06")).toBe(DEFAULT_JEM_OPTION_PCT)
    expect(DEFAULT_JEM_OPTION_PCT).toBe(0.75)
  })

  it("нечисловое/повреждённое value пропускается (не роняет резолв)", () => {
    const rows = [
      { key: JEM_OPTION_PREFIX + "2026-06-29", value: "not-a-number" },
      { key: JEM_OPTION_PREFIX + "2026-07-06", value: "NaN" },
    ]
    // оба значения невалидны → fallback на DEFAULT
    expect(resolveJemOptionPct(rows, "2026-07-06")).toBe(DEFAULT_JEM_OPTION_PCT)
  })

  it("рядом валидное предыдущее значение при повреждённом точном ключе недели используется как fallback", () => {
    const rows = [
      { key: JEM_OPTION_PREFIX + "2026-06-29", value: "0.65" },
      { key: JEM_OPTION_PREFIX + "2026-07-06", value: "garbage" },
    ]
    expect(resolveJemOptionPct(rows, "2026-07-06")).toBe(0.65)
  })

  it("отрицательное значение приводится к 0", () => {
    const rows = [{ key: JEM_OPTION_PREFIX + "2026-07-06", value: "-1" }]
    expect(resolveJemOptionPct(rows, "2026-07-06")).toBe(0)
  })

  it("строки без префикса JEM_OPTION_PREFIX игнорируются полностью", () => {
    const rows = [{ key: "financeWeekly.pools.2026-07-06", value: "999" }]
    expect(resolveJemOptionPct(rows, "2026-07-06")).toBe(DEFAULT_JEM_OPTION_PCT)
  })
})
