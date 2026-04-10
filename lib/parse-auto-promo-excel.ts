// lib/parse-auto-promo-excel.ts
// Phase 7 (D-06): Парсер Excel-отчёта из кабинета WB для auto-акций.
//
// Pure-TS модуль без импортов next/next-auth — безопасен для vitest
// (роут app/api/wb-promotions-upload-excel/route.ts тянет "next/server"
//  и ломает vitest transform, поэтому парсер вынесен отдельно).
//
// Колонки Excel читаются по индексам (НЕ по именам — кириллица, BOM,
// whitespace в заголовках из кабинета WB).
//
// Проверено по реальному fixture (tests/fixtures/auto-promo-sample.xlsx,
// выгрузка из кабинета WB 2026-04-09, 20 колонок индексы 0..19):
//
//   A=0:   "Товар уже участвует в акции" (Да/Нет)            → inAction
//   F=5:   "Артикул WB"                                      → nmId
//   L=11:  "Плановая цена для акции"                         → planPrice
//   M=12:  "Текущая розничная цена"                          → currentPrice
//   S=18:  "Загружаемая скидка для участия в акции"          → planDiscount
//   T=19:  "Статус"                                          → status
//
// Примечание: план 07-04 ошибочно указывал T=19/U=20 (off-by-one), реальные
// индексы зафиксированы по fixture — у файла нет 21-й колонки.

import * as XLSX from "xlsx"

/** Результат парсинга одной строки Excel auto-акции. */
export interface ParsedAutoPromoRow {
  nmId: number
  inAction: boolean
  planPrice: number | null
  currentPrice: number | null
  planDiscount: number | null
  status: string | null
}

/** Парсит Excel buffer в массив ParsedAutoPromoRow.
 *  Пропускает строки с невалидным nmId или пустые.
 */
export function parseAutoPromoExcel(buf: Buffer): ParsedAutoPromoRow[] {
  const wb = XLSX.read(buf, { type: "buffer" })
  const sheet = wb.Sheets[wb.SheetNames[0]!]!
  const rows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(
    sheet,
    { header: 1, defval: null },
  )

  const result: ParsedAutoPromoRow[] = []

  // Пропускаем первую строку (заголовки)
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.length === 0) continue

    const nmIdRaw = r[5]
    if (nmIdRaw == null || nmIdRaw === "") continue
    const nmId = parseInt(String(nmIdRaw), 10)
    if (Number.isNaN(nmId) || nmId <= 0) continue

    const inActionRaw = String(r[0] ?? "")
      .trim()
      .toLowerCase()
    const planPriceRaw = r[11]
    const currentPriceRaw = r[12]
    const planDiscountRaw = r[18]
    const statusRaw = r[19]

    const parseNum = (
      v: string | number | null | undefined,
    ): number | null => {
      if (v == null || v === "") return null
      const n = parseFloat(String(v))
      return Number.isFinite(n) ? n : null
    }

    result.push({
      nmId,
      inAction: inActionRaw === "да" || inActionRaw === "yes",
      planPrice: parseNum(planPriceRaw),
      currentPrice: parseNum(currentPriceRaw),
      planDiscount: parseNum(planDiscountRaw),
      status:
        statusRaw != null && String(statusRaw).trim() !== ""
          ? String(statusRaw).trim()
          : null,
    })
  }

  return result
}
