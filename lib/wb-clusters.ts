// lib/wb-clusters.ts
// Справочник кластеров WB: полные названия и порядок отображения.
// Source: REQUIREMENTS.md STOCK-23; Phase 14 Research §CLUSTER_FULL_NAMES.

/**
 * Полные названия кластеров WB по сокращённому коду.
 * Используется в ClusterTooltip на странице /stock/wb.
 */
export const CLUSTER_FULL_NAMES: Record<string, string> = {
  "ЦФО": "Центральный федеральный округ",
  "ЮГ": "Южный + Северо-Кавказский ФО",
  "Урал": "Уральский федеральный округ",
  "ПФО": "Приволжский федеральный округ",
  "СЗО": "Северо-Западный федеральный округ",
  "СФО": "Сибирский + Дальневосточный ФО",
  "Прочие": "Прочие склады",
} as const

/**
 * Порядок отображения кластеров слева направо в таблице /stock/wb.
 * Неизменяемый — менять только при добавлении новых кластеров WB.
 */
export const CLUSTER_ORDER = ["ЦФО", "ЮГ", "Урал", "ПФО", "СЗО", "СФО", "Прочие"] as const

export type ClusterShortName = typeof CLUSTER_ORDER[number]

/**
 * Phase 16 (STOCK-34): известный порядок буквенных размеров одежды/обуви.
 * Регистр case-insensitive — input нормализуется через `.toUpperCase()`.
 */
const SIZE_ORDER: Record<string, number> = {
  XS: 0,
  S: 1,
  M: 2,
  L: 3,
  XL: 4,
  "2XL": 5,
  XXL: 5,
  "3XL": 6,
  XXXL: 6,
  "4XL": 7,
  XXXXL: 7,
}

/**
 * Phase 16 (STOCK-34): стабильная сортировка техразмеров для UI размерных строк
 * в /stock/wb.
 *
 * Правила:
 *   1. Пустые ("" и "0") — всегда в конец (товары без размера / одно-размерные)
 *   2. Все числовые → numeric ASC (46, 48, 50, …)
 *   3. Все буквенные (по SIZE_ORDER) → по карте порядка (XS<S<M<L<XL<2XL<3XL<4XL)
 *   4. Mixed (числа + буквы) → localeCompare("ru") fallback
 *
 * Возвращает НОВЫЙ массив (input не мутируется).
 */
export function sortSizes(sizes: string[]): string[] {
  const empty = sizes.filter((s) => !s || s === "0")
  const real = sizes.filter((s) => s && s !== "0")

  const allNumeric = real.length > 0 && real.every((s) => /^\d+$/.test(s))
  let sortedReal: string[]
  if (allNumeric) {
    sortedReal = [...real].sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
  } else {
    const allKnown =
      real.length > 0 && real.every((s) => s.toUpperCase() in SIZE_ORDER)
    if (allKnown) {
      sortedReal = [...real].sort(
        (a, b) => SIZE_ORDER[a.toUpperCase()]! - SIZE_ORDER[b.toUpperCase()]!,
      )
    } else {
      sortedReal = [...real].sort((a, b) => a.localeCompare(b, "ru"))
    }
  }

  return [...sortedReal, ...empty]
}
