// lib/wb-cooldown.ts
// 2026-05-12 (Backlog 999.1): глобальный WB Cooldown Bus.
// 2026-05-13 (Quick 260513-khv): Per-endpoint cooldown buckets.
//
// Когда любой endpoint WB_API_TOKEN scope (Statistics/Prices/Tariffs/Analytics/Orders/
// Content/Feedbacks/Questions) отдаёт 429 с retry-after > 60s — записываем
// момент разблокировки в AppSetting('wbCooldownUntil:<bucket>').
//
// До 2026-05-13 был ОДИН глобальный ключ `wbCooldownUntil`. Это давало collateral
// damage: 3h-бан Statistics запирал Prices/Tariffs/Content на тот же срок, хотя
// WB rate-limit per-domain. Сегодня каждый bucket изолирован.
//
// Buffer-formula (260513-dlr) ПРЕСЕРВ: unlockAt = now + max(retry, CRON_INTERVAL_SEC) + BUFFER_SEC
// — переживает интервал cron (15 мин) + 2 мин drift, чтобы lock не истекал между
// двумя tick'ами и не вызывал бесконечную эскалацию 429.
//
// Scope: ТОЛЬКО WB_API_TOKEN paths. НЕ затрагивает WB_RETURNS_TOKEN, WB_CHAT_TOKEN,
// СПП-v4-curl, dp-calendar-api — у них отдельный бюджет (resolveBucketFromUrl → null).

import { prisma } from "@/lib/prisma"

const LEGACY_COOLDOWN_KEY = "wbCooldownUntil"

export const WB_COOLDOWN_BUCKETS = [
  "statistics-stocks",
  "statistics-orders",
  "statistics-sales",
  "prices",
  "tariffs",
  "analytics",
  "content",
  "feedbacks",
  "questions",
  "advert", // Phase 19 — WB Advert API (advert-api.wildberries.ru, WB_ADS_TOKEN scope bit 30)
] as const
export type WbCooldownBucket = (typeof WB_COOLDOWN_BUCKETS)[number]

function bucketKey(bucket: WbCooldownBucket): string {
  return `${LEGACY_COOLDOWN_KEY}:${bucket}`
}

// 2026-05-13 (Quick 260513-dlr): Buffer для TTL persistent rate-limit lock'а.
// Cron support-sync.timer = 15 мин. Если lock истекает между двумя cron-tick'ами,
// next tick снова стучит WB → новый 429 → бесконечная эскалация.
// Формула: unlockAt = now + max(retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC.
// При retryAfterSec=720s → lock = now + 1020s (17 мин) — переживает T+15м tick.
// При retryAfterSec=60s → lock = now + 1020s — interval доминирует.
// При retryAfterSec=3600s → lock = now + 3720s (час + 2 мин).
export const CRON_INTERVAL_SEC = 900
export const BUFFER_SEC = 120

/**
 * Резолвит WB URL в bucket. Возвращает null для не-WB_API_TOKEN endpoint'ов
 * (Returns / Chat / Calendar / любой неизвестный host) — caller'ы должны skip
 * cooldown bus в этом случае.
 *
 * Используется в lib/wb-support-api.ts:callApi для baseUrl+path резолвинга.
 */
export function resolveBucketFromUrl(url: string): WbCooldownBucket | null {
  if (url.includes("statistics-api.wildberries.ru")) {
    if (url.includes("/supplier/stocks")) return "statistics-stocks"
    if (url.includes("/supplier/orders")) return "statistics-orders"
    if (url.includes("/supplier/sales")) return "statistics-sales"
    return null
  }
  if (url.includes("discounts-prices-api.wildberries.ru")) return "prices"
  if (url.includes("common-api.wildberries.ru/api/v1/tariffs")) return "tariffs"
  if (url.includes("seller-analytics-api.wildberries.ru")) return "analytics"
  if (url.includes("content-api.wildberries.ru")) return "content"
  if (url.includes("feedbacks-api.wildberries.ru")) {
    // Order matters: проверяем /questions ДО /feedbacks, потому что подстрока
    // `/feedbacks` совпадает и с `/feedbacks-api...` (hostname-часть после `https:/`).
    if (url.includes("/api/v1/questions")) return "questions"
    if (url.includes("/api/v1/feedbacks")) return "feedbacks"
    return null
  }
  // Phase 19 — WB Advert API (отдельный bucket для изоляции от WB_API_TOKEN scope).
  // Все /adv/v1/* и /adv/v3/* (promotion/count, fullstats, balance) попадают сюда.
  if (url.includes("advert-api.wildberries.ru")) return "advert"
  // returns-api, buyer-chat-api, dp-calendar-api → не наш bus, отдельные токены
  return null
}

// 2026-05-13 (Quick 260513-khv): Лениво мигрирует устаревший ключ wbCooldownUntil
// (без колона) на новые 9 bucket-keys при первом setWbCooldownUntil. Идемпотентно —
// in-process flag short-circuits повторные вызовы. На прод-restart Next.js модуль
// пересоздаётся → migration перепроверяется (no-op если legacy уже удалён).
let legacyMigrationDone = false

async function migrateLegacyCooldownKey(): Promise<void> {
  if (legacyMigrationDone) return
  const legacy = await prisma.appSetting
    .findUnique({ where: { key: LEGACY_COOLDOWN_KEY } })
    .catch(() => null)
  if (!legacy?.value) {
    legacyMigrationDone = true
    return
  }
  const d = new Date(legacy.value)
  const isFuture = !Number.isNaN(d.getTime()) && d.getTime() > Date.now()
  if (isFuture) {
    // Copy active legacy value на все 9 bucket-keys — пользователь сохраняет
    // защиту от ban'а, который сработал ДО апгрейда, по всем endpoint'ам.
    for (const bucket of WB_COOLDOWN_BUCKETS) {
      await prisma.appSetting
        .upsert({
          where: { key: bucketKey(bucket) },
          create: { key: bucketKey(bucket), value: legacy.value },
          update: { value: legacy.value },
        })
        .catch(() => {})
    }
  }
  await prisma.appSetting
    .delete({ where: { key: LEGACY_COOLDOWN_KEY } })
    .catch(() => {})
  legacyMigrationDone = true
}

/**
 * Возвращает Date момент разблокировки для bucket, или null если cooldown не активен.
 * Истёкший lock автоматически удаляется (lazy cleanup).
 */
export async function getWbCooldownUntil(bucket: WbCooldownBucket): Promise<Date | null> {
  const key = bucketKey(bucket)
  const row = await prisma.appSetting.findUnique({ where: { key } })
  if (!row?.value) return null
  const d = new Date(row.value)
  if (Number.isNaN(d.getTime())) return null
  if (d.getTime() <= Date.now()) {
    await prisma.appSetting.delete({ where: { key } }).catch(() => {})
    return null
  }
  return d
}

/**
 * Обновляет cooldown для bucket до max(существующий, now + max(retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC).
 * Идемпотентно: если уже стоит более далёкий unlock — короткое значение игнорируется,
 * чтобы более жёсткий блок не сокращался последующим лёгким 429.
 *
 * На первом вызове после module-load лениво мигрирует устаревший wbCooldownUntil
 * (без колона) на 9 bucket-keys (если future) или просто удаляет (если past).
 *
 * Возвращает реальный действующий unlock-Date (после max'а).
 */
export async function setWbCooldownUntil(
  bucket: WbCooldownBucket,
  retryAfterSec: number
): Promise<Date> {
  await migrateLegacyCooldownKey()
  if (!Number.isFinite(retryAfterSec) || retryAfterSec <= 0) {
    const fallback = await getWbCooldownUntil(bucket)
    return fallback ?? new Date()
  }
  // Lock переживает хотя бы 1 cron tick (15 мин) + 2 мин на drift.
  const effectiveSec = Math.max(retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC
  const proposed = new Date(Date.now() + effectiveSec * 1000)
  const key = bucketKey(bucket)
  const current = await prisma.appSetting.findUnique({ where: { key } })
  if (current?.value) {
    const existing = new Date(current.value)
    if (!Number.isNaN(existing.getTime()) && existing.getTime() > proposed.getTime()) {
      return existing
    }
  }
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: proposed.toISOString() },
    update: { value: proposed.toISOString() },
  })
  return proposed
}

/**
 * Хелпер для caller'ов: возвращает остаток в секундах если cooldown для bucket активен,
 * иначе 0. Удобно для построения retryAfterSec в WbRateLimitError.
 */
export async function getWbCooldownSecondsRemaining(
  bucket: WbCooldownBucket
): Promise<number> {
  const d = await getWbCooldownUntil(bucket)
  if (!d) return 0
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 1000))
}
