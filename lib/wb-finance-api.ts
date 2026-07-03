// lib/wb-finance-api.ts
// Phase 24 (D-14): WB Finance API — дебиторка WB для управленческого баланса.
//
// Двухслойная схема:
//   1. fetchAccountBalance() — GET finance-api.wildberries.ru/api/v1/account/balance
//      (официальный баланс по ЗАКРЫТЫМ отчётам). Rate limit 1 req/мин на
//      Персональном/Сервисном токене (⚠ базовый = 1 req/СУТКИ — недопустим).
//      Scope «Финансы» (бит 13). Ошибки: 401 / 402 Payment Required / 429.
//   2. fetchWeeklyForPayTail() — Σ forPay из Statistics Sales API за незакрытую
//      неделю (с понедельника). ⚠ B4: этот endpoint требует scope «Статистика»
//      (WB_API_TOKEN), НЕ «Финансы» — WB_FINANCE_TOKEN здесь гарантированно даст 401.
//
// Дебиторка на дату = balance.current + weeklyTail.
//
// Deferred (слой 3, будущая фаза — точная сверка): finance-api.wildberries.ru
// /api/finance/v1/sales-reports/list|detailed — деньги там СТРОКИ (не числа!),
// paymentSchedule тоже строка, daily reportId требует BigInt. НЕ используется в v1.
//
// ⚠ Deprecated v5 supplier report endpoint (удаляется 15.07.2026, см. CONTEXT D-14) —
// НЕ используется здесь и не должен использоваться впредь.

import { getWbToken } from "@/lib/wb-token"
import {
  getWbCooldownSecondsRemaining,
  setWbCooldownUntil,
} from "@/lib/wb-cooldown"
import { WbRateLimitError } from "@/lib/wb-api"

const BALANCE_URL = "https://finance-api.wildberries.ru/api/v1/account/balance"
const SALES_URL = "https://statistics-api.wildberries.ru/api/v1/supplier/sales"

export interface WbAccountBalance {
  currency: string
  current: number
  forWithdraw: number
}

/** Читает Retry-After (секунды) из 429-ответа, дефолт 60. */
function parseRetryAfter(res: Response): number {
  const header = res.headers.get("Retry-After") ?? res.headers.get("X-Ratelimit-Retry")
  const parsed = header ? parseInt(header, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60
}

/**
 * GET /api/v1/account/balance → { currency, current, for_withdraw } (ЧИСЛА, не строки —
 * официально верифицировано). Требует WB_FINANCE_TOKEN (scope «Финансы», бит 13).
 * Rate limit 1 req/мин (Персональный/Сервисный) — cooldown bucket 'finance'.
 */
export async function fetchAccountBalance(): Promise<WbAccountBalance> {
  const cooldown = await getWbCooldownSecondsRemaining("finance")
  if (cooldown > 0) {
    throw new WbRateLimitError("Finance API balance (cooldown finance)", cooldown)
  }

  const token = await getWbToken("WB_FINANCE_TOKEN")
  const res = await fetch(BALANCE_URL, {
    headers: { Authorization: token },
  })

  if (res.status === 429) {
    const retryAfter = parseRetryAfter(res)
    await setWbCooldownUntil("finance", retryAfter)
    throw new WbRateLimitError("Finance API balance", retryAfter)
  }
  if (res.status === 402) {
    throw new Error(
      "WB Finance API 402 Payment Required — проверьте оплату подписки WB API в ЛК"
    )
  }
  if (res.status === 401) {
    throw new Error(
      "WB Finance API 401 — токен недействителен или без scope «Финансы»"
    )
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`WB Finance API balance → HTTP ${res.status}: ${text}`)
  }

  const data = (await res.json()) as {
    currency: string
    current: number
    for_withdraw: number
  }
  return {
    currency: data.currency,
    current: Number(data.current),
    forWithdraw: Number(data.for_withdraw),
  }
}

interface WbSalesRow {
  forPay?: number | null
  saleDt?: string
  date?: string
}

/**
 * Σ forPay из Statistics Sales API за незакрытую неделю [mondayOfWeek, snapshotDate].
 * ⚠ B4: токен — Статистика (WB_API_TOKEN), НЕ Финансы! supplier/sales требует scope
 * «Статистика» — WB_FINANCE_TOKEN тут гарантированно даст 401.
 * ⚠ M1: `dateFrom` при flag=0 фильтрует по lastChangeDate, НЕ по дате продажи → в ответ
 * попадают строки прошлых недель (уже вошедшие в balance.current) → пост-фильтр по
 * saleDt ОБЯЗАТЕЛЕН, иначе двойной счёт дебиторки.
 */
export async function fetchWeeklyForPayTail(
  mondayOfWeek: Date,
  snapshotDate: Date
): Promise<number> {
  const cooldown = await getWbCooldownSecondsRemaining("statistics-sales")
  if (cooldown > 0) {
    throw new WbRateLimitError("Statistics API sales (cooldown statistics-sales)", cooldown)
  }

  const statToken = await getWbToken("WB_API_TOKEN")
  const dateFrom = mondayOfWeek.toISOString().slice(0, 10)
  const url = `${SALES_URL}?dateFrom=${dateFrom}&flag=0`
  const res = await fetch(url, {
    headers: { Authorization: statToken },
  })

  if (res.status === 429) {
    const retryAfter = parseRetryAfter(res)
    await setWbCooldownUntil("statistics-sales", retryAfter)
    throw new WbRateLimitError("Statistics API sales", retryAfter)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`WB Statistics API sales → HTTP ${res.status}: ${text}`)
  }

  const rows = (await res.json()) as WbSalesRow[]
  const mondayTime = mondayOfWeek.getTime()
  const snapshotTime = snapshotDate.getTime()

  let sum = 0
  for (const row of Array.isArray(rows) ? rows : []) {
    const saleDt = new Date(row.saleDt ?? row.date ?? "")
    const saleTime = saleDt.getTime()
    if (Number.isNaN(saleTime)) continue
    if (saleTime < mondayTime || saleTime > snapshotTime) continue
    sum += Number(row.forPay ?? 0)
  }
  return Math.round(sum * 100) / 100
}
