// lib/finance-weekly/jem-option.ts
//
// Quick 260714-gff: pure carry-forward резолвер «Опции Джема» — надбавки к
// комиссии WB (п.п.), применяемой аддитивно к ОБОИМ сценариям (ИУ и Оферта)
// понедельного фин-отчёта (/finance/weekly). ДРУГАЯ сущность, чем
// WeeklyConstants.jemPct (тариф Джем — per-unit статья % от K).
//
// Ставка задаётся per неделя через AppSetting-ключи с префиксом
// financeWeekly.jemOptionPct.<weekStartISO>. Carry-forward: если для запрошенной
// недели значение не задано — берётся ближайшая ПРЕДЫДУЩАЯ заданная неделя
// (ISO-даты сортируются лексикографически как строки). Будущие недели
// (key > weekStart) игнорируются. Ничего не задано → DEFAULT_JEM_OPTION_PCT.
//
// PURE-модуль: ноль импортов Prisma / React / Next (паттерн bank-pools.ts) —
// vitest-изоляция без Prisma. Prisma-запрос — в data.ts.

/** Дефолтная ставка Опции Джема (п.п.), когда для недели ничего не задано. */
export const DEFAULT_JEM_OPTION_PCT = 0.75

/** Префикс AppSetting-ключа: financeWeekly.jemOptionPct.<weekStartISO>. */
export const JEM_OPTION_PREFIX = "financeWeekly.jemOptionPct."

/** Ключ AppSetting для конкретной ISO-недели (Пн). */
export function financeWeeklyJemOptionKey(weekStartISO: string): string {
  return JEM_OPTION_PREFIX + weekStartISO
}

/**
 * Резолвит ставку Опции Джема для недели weekStartISO из строк AppSetting
 * (только с префиксом JEM_OPTION_PREFIX):
 *   1. точный ключ недели задан и валиден → его значение;
 *   2. иначе — значение строки с максимальным (лексикографически) ключом-датой
 *      СТРОГО МЕНЬШЕ weekStartISO (ближайшая предыдущая заданная неделя);
 *   3. будущие недели (ключ-дата > weekStartISO) игнорируются полностью;
 *   4. ничего не подошло → DEFAULT_JEM_OPTION_PCT.
 *
 * Нечисловое/повреждённое value пропускается (не роняет резолв, не участвует
 * в выборе). Отрицательные значения приводятся к 0 (Опция Джем — надбавка,
 * отрицательная ставка не имеет экономического смысла в этом отчёте).
 */
export function resolveJemOptionPct(
  rows: { key: string; value: string }[],
  weekStartISO: string,
): number {
  let exact: number | null = null
  let bestPrevKey: string | null = null
  let bestPrevValue = 0

  for (const row of rows) {
    if (!row.key.startsWith(JEM_OPTION_PREFIX)) continue
    const dateKey = row.key.slice(JEM_OPTION_PREFIX.length)
    const parsed = Number(row.value)
    if (!Number.isFinite(parsed)) continue
    const clean = Math.max(0, parsed)

    if (dateKey === weekStartISO) {
      exact = clean
      continue
    }
    if (dateKey < weekStartISO) {
      if (bestPrevKey === null || dateKey > bestPrevKey) {
        bestPrevKey = dateKey
        bestPrevValue = clean
      }
    }
    // dateKey > weekStartISO (будущая неделя) → игнор
  }

  if (exact !== null) return exact
  if (bestPrevKey !== null) return bestPrevValue
  return DEFAULT_JEM_OPTION_PCT
}
