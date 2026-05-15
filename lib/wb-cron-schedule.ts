// lib/wb-cron-schedule.ts
// 2026-05-15 (quick 260515-o4o) — pure helpers для dispatcher cron + Settings UI validation.
// Используется в app/api/cron/dispatch + app/actions/cron-schedule + tests.
// Никаких импортов — модуль полностью pure для безопасной vitest-загрузки.

/** Текущее MSK-время в формате "HH:MM" (всегда 2 цифры). */
export function getMskHHMM(now?: Date): string {
  const ms = (now ?? new Date()).getTime() + 3 * 3600_000
  const d = new Date(ms)
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const mm = String(d.getUTCMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

/** "YYYY-MM-DD" дня в MSK для lastRun guard. */
export function getMskTodayString(now?: Date): string {
  const ms = (now ?? new Date()).getTime() + 3 * 3600_000
  const d = new Date(ms)
  const yy = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `${yy}-${mo}-${dd}`
}

/** Валидация "HH:MM" с шагом 5 минут. Регекс + minute % 5. */
const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/
export function isValidCronHHMM(value: string): boolean {
  if (!HHMM_REGEX.test(value)) return false
  const minute = Number(value.slice(3, 5))
  return minute % 5 === 0
}

/** Чистый guard — должен ли cron сработать сейчас?
 *  Точное совпадение HH:MM + проверка что сегодня ещё не запускался.
 */
export function shouldFireCron(args: {
  currentHHMM: string
  storedTime: string
  lastRunDate: string | null
  today: string
}): boolean {
  if (args.currentHHMM !== args.storedTime) return false
  if (args.lastRunDate === args.today) return false
  return true
}

/** computeBuyerPriceRetro — формула retroactive backfill.
 *  buyerPrice = round(sellerPrice × (1 - discountWb/100))
 *  - discountWb=null/undefined → возвращаем sellerPrice без скидки
 *  - sellerPrice<=0/null/undefined → null
 */
export function computeBuyerPriceRetro(args: {
  sellerPrice: number | null | undefined
  discountWb: number | null | undefined
}): number | null {
  if (!args.sellerPrice || args.sellerPrice <= 0) return null
  const disc = args.discountWb ?? 0
  return Math.round(args.sellerPrice * (1 - disc / 100))
}
