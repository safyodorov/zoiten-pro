// lib/wb-sync-format.ts
// 2026-05-12: Хелперы для форматирования ответа /api/wb-sync на стороне клиента.
// Общие для WbSyncButton (cards/wb) и WbRefreshButton (stock).

export interface SyncFailure {
  endpoint: string
  fields: string[]
  /** Секунды до восстановления (из X-Ratelimit-Retry). null для не-rate-limit ошибок. */
  retryAfterSec: number | null
  message: string
}

/** Форматирует секунды в «Xч Yмин» или «Yмин» или «N сек». */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${seconds} сек`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m} мин`
  const h = Math.floor(m / 60)
  const mins = m % 60
  return mins > 0 ? `${h}ч ${mins}мин` : `${h}ч`
}

/** Форматирует «когда разблокируется» — HH:MM МСК. */
export function formatUnlockTime(seconds: number): string {
  const unlock = new Date(Date.now() + seconds * 1000)
  return unlock.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  })
}

/**
 * Строит текст для warning-toast при частичном sync.
 * Возвращает { title, description, maxRetryAfterSec } для sonner toast.warning.
 */
export function buildPartialSyncMessage(failures: SyncFailure[]): {
  title: string
  description: string
  maxRetryAfterSec: number
} {
  // Группируем по endpoint, выводим список упавших + поля
  const lines = failures.map((f) => {
    const fields = f.fields.length > 0 ? ` (${f.fields.join(", ")})` : ""
    if (f.retryAfterSec !== null && f.retryAfterSec > 0) {
      return `• ${f.endpoint}${fields} — WB просит подождать ${formatRetryAfter(f.retryAfterSec)} (до ${formatUnlockTime(f.retryAfterSec)} МСК)`
    }
    return `• ${f.endpoint}${fields} — ${f.message}`
  })

  const retryValues = failures
    .map((f) => f.retryAfterSec ?? 0)
    .filter((s) => s > 0)
  const maxRetryAfterSec = retryValues.length > 0 ? Math.max(...retryValues) : 0

  return {
    title: `Обновлено частично: упало ${failures.length} ${failures.length === 1 ? "API" : "API"}`,
    description: lines.join("\n"),
    maxRetryAfterSec,
  }
}
