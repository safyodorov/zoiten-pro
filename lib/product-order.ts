// Глобальная иерархическая сортировка товаров.
// Порядок: Направление.sortOrder → Бренд.sortOrder → Категория.sortOrder →
//          Подкатегория.sortOrder → name (по алфавиту, RU).
//
// sortOrder каждого уровня настраивается через drag-and-drop в /admin/settings.
// Внутри одного уровня иерархии (например 2 товара с одинаковыми direction/brand/
// category/subcategory) — порядок по алфавиту названия товара.
//
// Применяется в RSC pages: /products, /prices/wb, /stock, /stock/wb, /batches.
// Фильтры (Бренд, Категория и т.д.) сужают выборку, но порядок остаётся
// глобальный — это удобно: одинаковый порядок во всех разделах.
//
// Nullable relations (brand.direction, category, subcategory): null сортируется
// в конец (Prisma 6 default для nested relation orderBy).

import { Prisma } from "@prisma/client"

export const PRODUCT_HIERARCHY_ORDER_BY: Prisma.ProductOrderByWithRelationInput[] = [
  { brand: { direction: { sortOrder: "asc" } } },
  { brand: { sortOrder: "asc" } },
  { category: { sortOrder: "asc" } },
  { subcategory: { sortOrder: "asc" } },
  { name: "asc" },
]

// Компаратор для in-memory sort (используется когда сортируем не через
// prisma.product.findMany напрямую, а уже собранные группы Product[] —
// например /prices/wb, где product загружается через MarketplaceArticle).
interface ProductForCompare {
  brand: { sortOrder: number; direction: { sortOrder: number } | null } | null
  category: { sortOrder: number } | null
  subcategory: { sortOrder: number } | null
  name: string
}

const NULL_LAST = 99_999_999

export function compareProductsByHierarchy(
  a: ProductForCompare,
  b: ProductForCompare,
): number {
  const dirA = a.brand?.direction?.sortOrder ?? NULL_LAST
  const dirB = b.brand?.direction?.sortOrder ?? NULL_LAST
  if (dirA !== dirB) return dirA - dirB

  const brA = a.brand?.sortOrder ?? NULL_LAST
  const brB = b.brand?.sortOrder ?? NULL_LAST
  if (brA !== brB) return brA - brB

  const catA = a.category?.sortOrder ?? NULL_LAST
  const catB = b.category?.sortOrder ?? NULL_LAST
  if (catA !== catB) return catA - catB

  const subA = a.subcategory?.sortOrder ?? NULL_LAST
  const subB = b.subcategory?.sortOrder ?? NULL_LAST
  if (subA !== subB) return subA - subB

  return a.name.localeCompare(b.name, "ru")
}
