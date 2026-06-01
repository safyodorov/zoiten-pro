// components/finance-models/format.ts
// Форматтеры чисел для таблиц финансовой модели.

/** В млн ₽ с 2 знаками, напр. 34.92 */
export function mln(n: number): string {
  return (n / 1_000_000).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Полная сумма ₽ с разделителями тысяч, напр. «34 920 000 ₽» */
export function rub(n: number): string {
  return Math.round(n).toLocaleString("ru-RU") + " ₽"
}

/** Проценты из доли, напр. 0.25 → «25%» */
export function pct(frac: number, digits = 0): string {
  return (frac * 100).toFixed(digits) + "%"
}
