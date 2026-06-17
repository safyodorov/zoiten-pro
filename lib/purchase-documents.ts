// Документы закупки: категории, лейблы, маппинг папок для ZIP.
// Используется и на сервере (route handlers), и на клиенте (UI).

export const DOC_CATEGORIES = [
  "INVOICE",
  "CONTRACT",
  "CERTIFICATION",
  "PACKING_LIST",
  "PAYMENT",
  "CUSTOMS_OTHER",
  "OTHER",
] as const

export type DocCategory = (typeof DOC_CATEGORIES)[number]

export const DOC_CATEGORY_LABEL: Record<DocCategory, string> = {
  INVOICE: "Инвойсы",
  CONTRACT: "Контракты",
  CERTIFICATION: "Сертификация",
  PACKING_LIST: "Упаковочные листы",
  PAYMENT: "Платёжки",
  CUSTOMS_OTHER: "Прочие",
  OTHER: "Документы прочие",
}

// Таможенные категории (со структурой) в нужном порядке.
export const CUSTOMS_CATEGORIES: DocCategory[] = [
  "INVOICE",
  "CONTRACT",
  "CERTIFICATION",
  "PACKING_LIST",
  "PAYMENT",
  "CUSTOMS_OTHER",
]

export const MAX_DOC_BYTES = 10 * 1024 * 1024 // 10 МБ на файл
export const MAX_DOCS_PER_CATEGORY = 100

// Путь папки внутри ZIP-архива для данной категории.
export function zipFolderFor(category: DocCategory): string {
  if (category === "OTHER") return "Документы прочие"
  return `Документы для таможни/${DOC_CATEGORY_LABEL[category]}`
}

export function isDocCategory(v: unknown): v is DocCategory {
  return typeof v === "string" && (DOC_CATEGORIES as readonly string[]).includes(v)
}
