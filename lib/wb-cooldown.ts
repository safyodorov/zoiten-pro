// lib/wb-cooldown.ts
// 2026-05-12 (Backlog 999.1): Глобальный WB Cooldown Bus.
//
// Когда любой endpoint WB_API_TOKEN scope (Statistics/Prices/Tariffs/Analytics/Orders/
// Content/Feedbacks/Questions) отдаёт 429 с retry-after > 60s — записываем глобальный
// момент разблокировки в AppSetting('wbCooldownUntil'). Все WB-вызовы того же scope
// до этого момента короткозамыкаются БЕЗ обращения к WB.
//
// Цель: убрать класс эскалаций «когда Statistics блокирован, мы продолжаем долбить
// соседние Tariffs/Prices/Analytics, и WB anti-abuse продлевает блок шире и дольше».
//
// Scope: ТОЛЬКО WB_API_TOKEN paths. НЕ затрагивает WB_RETURNS_TOKEN, WB_CHAT_TOKEN,
// СПП-v4-curl — у них отдельный бюджет.

import { prisma } from "@/lib/prisma"

const COOLDOWN_KEY = "wbCooldownUntil"

/**
 * Возвращает Date момент разблокировки, или null если cooldown не активен.
 * Истёкший lock автоматически удаляется (lazy cleanup).
 */
export async function getWbCooldownUntil(): Promise<Date | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: COOLDOWN_KEY } })
  if (!row?.value) return null
  const d = new Date(row.value)
  if (Number.isNaN(d.getTime())) return null
  if (d.getTime() <= Date.now()) {
    await prisma.appSetting.delete({ where: { key: COOLDOWN_KEY } }).catch(() => {})
    return null
  }
  return d
}

/**
 * Обновляет cooldown до max(существующий, now + retryAfterSec).
 * Идемпотентно: если уже стоит более далёкий unlock — короткое значение игнорируется,
 * чтобы более жёсткий блок не сокращался последующим лёгким 429.
 *
 * Возвращает реальный действующий unlock-Date (после max'а).
 */
export async function setWbCooldownUntil(retryAfterSec: number): Promise<Date> {
  if (!Number.isFinite(retryAfterSec) || retryAfterSec <= 0) {
    const fallback = await getWbCooldownUntil()
    return fallback ?? new Date()
  }
  const proposed = new Date(Date.now() + retryAfterSec * 1000)
  const current = await prisma.appSetting.findUnique({ where: { key: COOLDOWN_KEY } })
  if (current?.value) {
    const existing = new Date(current.value)
    if (!Number.isNaN(existing.getTime()) && existing.getTime() > proposed.getTime()) {
      return existing
    }
  }
  await prisma.appSetting.upsert({
    where: { key: COOLDOWN_KEY },
    create: { key: COOLDOWN_KEY, value: proposed.toISOString() },
    update: { value: proposed.toISOString() },
  })
  return proposed
}

/**
 * Хелпер для caller'ов: возвращает остаток в секундах если cooldown активен,
 * иначе 0. Удобно для построения retryAfterSec в WbRateLimitError.
 */
export async function getWbCooldownSecondsRemaining(): Promise<number> {
  const d = await getWbCooldownUntil()
  if (!d) return 0
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 1000))
}
