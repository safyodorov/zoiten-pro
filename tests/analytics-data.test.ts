import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import {
  parseDetailFile,
  mergeDetailFiles,
  extractTop30,
  REQUIRED_FILE_COUNT,
  REQUIRED_SKU_COUNT,
} from "@/lib/analytics/data"

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "analytics-detail-sample-1.json"), "utf8"),
)

// ── Синтетические файлы для тестов порогов/периода (реальный только 1) ──
function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(from + "T00:00:00Z")
  const end = new Date(to + "T00:00:00Z")
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

function buildDetailFile(
  nmIds: number[],
  from = "2026-06-11",
  to = "2026-07-10",
): unknown {
  const dates = datesBetween(from, to)
  const byDay = nmIds.flatMap((nm) =>
    dates.map((dt) => ({
      nmID: nm,
      nmName: "x",
      dt,
      openCard: 100,
      addToCart: 10,
      openToCart: 10,
      orders: 5,
      cartToOrder: 5,
      ordersSum: 5000,
      buyoutCount: 4,
      buyoutSum: 4000,
      buyoutPercent: 80,
      cancelCount: 0,
      cancelSum: 0,
      avgPosition: 4,
      viewCount: 1000,
      CTR: 7,
      medianPrice: 9000,
    })),
  )
  // Две «месячные» строки как в реальном файле (окно пересекает месяцы) — Σ = Σ(byDay).
  const byMonth = nmIds.flatMap((nm) => [
    { nmID: nm, dt: "2026-06-01", viewCount: 12000, orders: 60, ordersSum: 60000 },
    { nmID: nm, dt: "2026-07-01", viewCount: 18000, orders: 90, ordersSum: 90000 },
  ])
  const commonParams = nmIds.map((nm) => ({
    nmId: nm,
    nmName: "x",
    mainPhoto: `https://basket-1.wbbasket.ru/vol1/part1/${nm}/images/c246x328/1.webp`,
    subject: "s",
    item: "i",
    brandName: "b",
    nmRating: 5,
    feedbacksCount: { current: 10, dynamics: 0 },
    medianPrice: 9000,
  }))
  return {
    error: false,
    errorText: "",
    data: { ID: 1, salesFunnel: { byDay, byWeek: [], byMonth }, commonParams, searchQueries: [] },
  }
}

describe("parseDetailFile — реальная фикстура (Wave 0)", () => {
  it("парсит 5 SKU с непустым byDay", () => {
    const p = parseDetailFile(fixture)
    expect(p.nmIds).toHaveLength(5)
    expect(p.nmIds).toContain(899301731)
    expect(p.byDay.length).toBe(150) // 5 SKU × 30 дней
    expect(p.dateFrom).toBe("2026-06-11")
    expect(p.dateTo).toBe("2026-07-10")
  })

  it("месячные тоталы (byMonth) = Σ(byDay) по каждому nmId — источник ÷30", () => {
    const p = parseDetailFile(fixture)
    // Σ(byMonth) подтверждён равным Σ(byDay): nmId 899301731 → viewCount 3051279, orders 1676.
    const m = p.monthByNmId.get(899301731)
    expect(m).toBeDefined()
    expect(m!.viewCount).toBe(3051279)
    expect(m!.orders).toBe(1676)
    expect(m!.ordersSum).toBe(21413461) // 12883561 + 8529900
    // сверка с Σ(byDay)
    const days = p.byDay.filter((d) => d.nmId === 899301731)
    const sumView = days.reduce((a, d) => a + d.viewCount, 0)
    expect(m!.viewCount).toBe(sumView)
  })

  it("commonParams нормализованы: feedbacksCount {current} → число, mainPhoto/brand извлечены", () => {
    const p = parseDetailFile(fixture)
    const cp = p.commonParams.find((c) => c.nmId === 899301731)
    expect(cp).toBeDefined()
    expect(cp!.feedbacksCount).toBe(1438) // из {current:1438}
    expect(cp!.mainPhoto).toContain("basket-39.wbbasket.ru")
    expect(cp!.subject).toBe("Техника для кухни")
  })
})

describe("parseDetailFile — отклонение битой структуры (T-30-09)", () => {
  it("нет data.salesFunnel.byDay → throw про структуру", () => {
    expect(() => parseDetailFile({ data: {} })).toThrow(/структур/i)
    expect(() => parseDetailFile({ data: { salesFunnel: {} } })).toThrow(/структур/i)
    expect(() => parseDetailFile(null)).toThrow(/структур/i)
  })

  it("byDay без обязательного числового поля → throw с указанием поля", () => {
    const broken = {
      data: {
        salesFunnel: {
          byDay: [{ nmID: 1, dt: "2026-06-11" /* нет openCard/orders/... */ }],
          byMonth: [],
        },
        commonParams: [{ nmId: 1 }],
      },
    }
    expect(() => parseDetailFile(broken)).toThrow(/невалидн|поле/i)
  })
})

describe("mergeDetailFiles — кросс-файловая дедупликация (T-30-02 / Pitfall #8)", () => {
  it("уникальные nmID по файлам → объединённое множество", () => {
    const a = parseDetailFile(buildDetailFile([1, 2, 3]))
    const b = parseDetailFile(buildDetailFile([4, 5, 6]))
    expect(mergeDetailFiles([a, b]).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it("повтор nmID между файлами → throw с указанием nmID", () => {
    const a = parseDetailFile(buildDetailFile([1, 2, 3]))
    const b = parseDetailFile(buildDetailFile([3, 4, 5])) // 3 повторяется
    expect(() => mergeDetailFiles([a, b])).toThrow(/дубликат nmID 3/)
  })
})

describe("extractTop30 — пороги, период, месячные тоталы (ANL-01)", () => {
  const sixFiles = () =>
    Array.from({ length: REQUIRED_FILE_COUNT }, (_, i) =>
      buildDetailFile([i * 10 + 1, i * 10 + 2, i * 10 + 3, i * 10 + 4, i * 10 + 5]),
    )

  it("6 валидных файлов × 5 SKU → ровно 30 уникальных + период + 30 месячных тоталов", () => {
    const r = extractTop30(sixFiles())
    expect(r.skus).toHaveLength(REQUIRED_SKU_COUNT)
    expect(new Set(r.skus).size).toBe(REQUIRED_SKU_COUNT)
    expect(r.byDayByNmId.size).toBe(REQUIRED_SKU_COUNT)
    expect(r.monthlyTotalsByNmId.size).toBe(REQUIRED_SKU_COUNT)
    expect(r.commonParamsByNmId.size).toBe(REQUIRED_SKU_COUNT)
    expect(r.dateFrom).toBe("2026-06-11")
    expect(r.dateTo).toBe("2026-07-10")
    // месячный тотал синтетики: 12000+18000 = 30000 view, orders 60+90=150
    const m = r.monthlyTotalsByNmId.get(1)!
    expect(m.viewCount).toBe(30000)
    expect(m.orders).toBe(150)
  })

  it("5 файлов → throw «6 файлов»", () => {
    expect(() => extractTop30(sixFiles().slice(0, 5))).toThrow(/6 файл/)
  })

  it("несовпадающие окна byDay → throw про периоды", () => {
    const files = sixFiles()
    // сдвигаем окно у последнего файла
    files[5] = buildDetailFile([51, 52, 53, 54, 55], "2026-06-12", "2026-07-11")
    expect(() => extractTop30(files)).toThrow(/период/i)
  })

  it("менее 30 уникальных SKU (файл с 4 SKU) → throw «29 ... из 30»", () => {
    const files = sixFiles()
    files[5] = buildDetailFile([51, 52, 53, 54]) // только 4 → всего 29
    expect(() => extractTop30(files)).toThrow(/29.*30/)
  })

  it("дубликат SKU между файлами → throw про дубликат (не «тихая» потеря)", () => {
    const files = sixFiles()
    files[5] = buildDetailFile([1, 52, 53, 54, 55]) // 1 повторяет файл №0
    expect(() => extractTop30(files)).toThrow(/дубликат nmID 1/)
  })
})
