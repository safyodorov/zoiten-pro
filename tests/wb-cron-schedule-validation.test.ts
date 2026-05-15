// 2026-05-15 (quick 260515-o4o): Tests для isValidCronHHMM — HH:MM regex + 5-min granularity.
import { describe, it, expect } from "vitest"
import { isValidCronHHMM } from "@/lib/wb-cron-schedule"

describe("isValidCronHHMM", () => {
  it("accepts 05:10 (5-min boundary)", () => {
    expect(isValidCronHHMM("05:10")).toBe(true)
  })

  it("accepts 23:55 (max)", () => {
    expect(isValidCronHHMM("23:55")).toBe(true)
  })

  it("accepts 00:00 (min)", () => {
    expect(isValidCronHHMM("00:00")).toBe(true)
  })

  it("accepts 12:30 (mid-day)", () => {
    expect(isValidCronHHMM("12:30")).toBe(true)
  })

  it("rejects 5:10 (missing zero-pad)", () => {
    expect(isValidCronHHMM("5:10")).toBe(false)
  })

  it("rejects 25:00 (invalid hour)", () => {
    expect(isValidCronHHMM("25:00")).toBe(false)
  })

  it("rejects 05:07 (minute % 5 !== 0)", () => {
    expect(isValidCronHHMM("05:07")).toBe(false)
  })

  it("rejects 05:65 (invalid minute)", () => {
    expect(isValidCronHHMM("05:65")).toBe(false)
  })

  it("rejects empty string", () => {
    expect(isValidCronHHMM("")).toBe(false)
  })

  it("rejects garbage", () => {
    expect(isValidCronHHMM("hello")).toBe(false)
  })

  it("rejects HHMM without colon", () => {
    expect(isValidCronHHMM("0510")).toBe(false)
  })
})
