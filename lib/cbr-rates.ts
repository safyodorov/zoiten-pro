// lib/cbr-rates.ts — интеграция с курсами ЦБ РФ (D-09).
// Plain Node.js fetch РАБОТАЕТ — у cbr-xml-daily.ru нет TLS-fingerprint блокировки
// (в отличие от WB v4 card.wb.ru, где обязателен curl).
// Verified against live endpoint 2026-06-09.

import type { PrismaClient } from "@prisma/client"
import type { Prisma } from "@prisma/client"

export interface CbrValute {
  ID: string
  NumCode: string
  CharCode: string // "CNY", "USD", "EUR", etc.
  Nominal: number // e.g. 1 for USD, 10 for CNY
  Name: string
  Value: number // rate for Nominal units, e.g. 73.2644 per 1 USD
  Previous: number // previous business day rate
}

export interface CbrResponse {
  Date: string // "2026-06-09T11:30:00+03:00"
  PreviousDate: string
  Timestamp: string // last update timestamp
  Valute: Record<string, CbrValute>
}

/** Запрос дневных курсов ЦБ РФ. Plain fetch — без curl/execSync. */
export async function fetchCbrRates(): Promise<CbrResponse> {
  const res = await fetch("https://www.cbr-xml-daily.ru/daily_json.js", {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`CBR fetch failed: ${res.status}`)
  return res.json() as Promise<CbrResponse>
}

/**
 * rateToRub = Valute.Value / Valute.Nominal.
 * CNY: Value=8.1, Nominal=10 → 0.81 RUB за 1 CNY.
 */
export function ratePerUnit(valute: CbrValute): number {
  return valute.Value / valute.Nominal
}

/**
 * Курсы ЦБ РФ за КОНКРЕТНУЮ дату через архивный эндпоинт cbr-xml-daily.ru.
 * Используется для бэкфилла исторических курсов (260704-fzt).
 *
 * URL: https://www.cbr-xml-daily.ru/archive/YYYY/MM/DD/daily_json.js
 * Формат ответа идентичен daily_json.js — переиспользуем CbrResponse/CbrValute.
 * На !res.ok (404 — выходной, праздник, дата слишком ранняя) возвращает null
 * (не бросает), чтобы скрипт бэкфилла мог спокойно пропустить дату.
 */
export async function fetchCbrRatesForDate(date: Date): Promise<CbrResponse | null> {
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(date.getUTCDate()).padStart(2, "0")
  const url = `https://www.cbr-xml-daily.ru/archive/${yyyy}/${mm}/${dd}/daily_json.js`

  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    // 404 = нет курса за эту дату (выходной/праздник) — нормальная ситуация
    return null
  }
  return res.json() as Promise<CbrResponse>
}

/**
 * Fallback: последняя сохранённая запись курса для кода валюты.
 * Используется когда сегодняшнего курса ещё нет (выходные/праздники ЦБ РФ).
 */
export async function getLatestRate(
  code: string,
  prismaClient: PrismaClient
): Promise<{ rateToRub: Prisma.Decimal; date: Date } | null> {
  const rate = await prismaClient.currencyRate.findFirst({
    where: { code },
    orderBy: { date: "desc" },
  })
  return rate ? { rateToRub: rate.rateToRub, date: rate.date } : null
}
