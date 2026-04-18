// Pure helpers для профиля покупателя (Plan 12-02).
// Без зависимостей на Prisma клиент/Next — тестируются как чистые функции.
// Используется в RSC /support/customers/[id] для агрегации счётчиков по каналам и average rating.

import type { TicketChannel } from "@prisma/client"

export interface TicketForAggregation {
  channel: TicketChannel
  rating: number | null
}

// Счётчик тикетов по каналам.
// Возвращает Record<TicketChannel, number> со всеми ключами (нули для отсутствующих).
export function countTicketsByChannel(
  tickets: TicketForAggregation[]
): Record<TicketChannel, number> {
  const acc = {
    FEEDBACK: 0,
    QUESTION: 0,
    CHAT: 0,
    RETURN: 0,
    MESSENGER: 0,
  } as Record<TicketChannel, number>
  for (const t of tickets) acc[t.channel] = (acc[t.channel] ?? 0) + 1
  return acc
}

// Средний рейтинг FEEDBACK тикетов (игнорируем null и прочие каналы).
// Возвращает null если нет ни одного FEEDBACK с rating. Округление до 2 знаков.
export function averageFeedbackRating(
  tickets: TicketForAggregation[]
): number | null {
  const ratings = tickets
    .filter((t) => t.channel === "FEEDBACK" && t.rating !== null)
    .map((t) => t.rating as number)
  if (ratings.length === 0) return null
  const sum = ratings.reduce((a, b) => a + b, 0)
  return Math.round((sum / ratings.length) * 100) / 100
}
