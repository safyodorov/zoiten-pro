// lib/product-name.ts
// Phase 18: pure-функция генерации составного Product.name.
//
// Алгоритм по Brand.direction.hasSizes:
//   true  (одежда):     [Category] [Subcategory] [...properties с includeInName] [Article]
//   false (бытовая):    [Subcategory ?? Category] [Article]
//
// Пустые/null/whitespace-only части пропускаются.

export interface ProductNameInput {
  article: string
  category?: { name: string } | null
  subcategory?: { name: string } | null
  brand?: { direction?: { hasSizes: boolean } | null } | null
  // properties — все ProductPropertyValue товара с инфой про includeInName флаг свойства.
  // Порядок массива → порядок в названии. Caller должен сортировать по
  // CategoryProperty.sortOrder если важна стабильность.
  properties?: Array<{ value: string; includeInName: boolean }>
}

export function generateProductName(input: ProductNameInput): string {
  const hasSizes = input.brand?.direction?.hasSizes === true
  const parts: Array<string | null | undefined> = hasSizes
    ? [
        input.category?.name,
        input.subcategory?.name,
        ...(input.properties ?? [])
          .filter((p) => p.includeInName)
          .map((p) => p.value),
        input.article,
      ]
    : [input.subcategory?.name ?? input.category?.name, input.article]

  return parts
    .map((p) => (p ?? "").trim())
    .filter((s) => s.length > 0)
    .join(" ")
}
