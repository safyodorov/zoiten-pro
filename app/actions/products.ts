// app/actions/products.ts
// Server Actions for Products CRUD — create, update, softDelete, restore, duplicate
"use server"

import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { revalidatePath } from "next/cache"

// ── Types ─────────────────────────────────────────────────────────

type ActionResult = { ok: true } | { ok: false; error: string }
type CreateResult = { ok: true; id: string } | { ok: false; error: string }

// ── Schemas ────────────────────────────────────────────────────────
// 260421-iq7: barcodes теперь nested внутри articles, верхнеуровневый
// `barcodes` удалён. sortOrder генерируется сервером по индексу массива.

// Phase 17 (2026-05-11): productSizeValue — value привязанного ProductSize
// (например "46"). Резолвится в productSizeId внутри транзакции через lookup
// в ProductSize по (productId, value). null/undefined = «без размера».
const BarcodeSchema = z.object({
  value: z.string().min(1),
  productSizeValue: z.string().nullable().optional(),
})

const ArticleSchema = z.object({
  value: z.string().min(1),
  barcodes: z.array(BarcodeSchema).max(20),
})

const MarketplaceSchema = z.object({
  marketplaceId: z.string().min(1),
  articles: z.array(ArticleSchema).max(10),
})

const ProductSchema = z.object({
  name: z.string().min(1).max(100),
  photoUrl: z.string().nullable().optional(),
  brandId: z.string().min(1),
  categoryId: z.string().optional(),
  subcategoryId: z.string().optional(),
  label: z.string().max(100).nullable().optional(),
  abcStatus: z.enum(["A", "B", "C"]).optional(),
  availability: z
    .enum(["IN_STOCK", "OUT_OF_STOCK", "DISCONTINUED", "DELETED"])
    .default("IN_STOCK"),
  weightKg: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
  widthCm: z.number().positive().optional(),
  depthCm: z.number().positive().optional(),
  marketplaces: z.array(MarketplaceSchema),
})

const UpdateProductSchema = ProductSchema.extend({
  id: z.string().min(1),
})

// ── Error handler helper ──────────────────────────────────────────

function handleAuthError(e: unknown): { ok: false; error: string } | null {
  if (e instanceof Error) {
    if (e.message === "UNAUTHORIZED") return { ok: false, error: "Не авторизован" }
    if (e.message === "FORBIDDEN") return { ok: false, error: "Нет доступа" }
  }
  return null
}

// ── P2002 target helper ───────────────────────────────────────────
// 260421-iq7: новый partial unique index — (marketplaceId, value) WHERE productDeletedAt IS NULL.
// Target обычно содержит "marketplaceId,value" или имя индекса Barcode_marketplace_value_active_key.

function handleP2002(e: unknown): { ok: false; error: string } | null {
  const err = e as { code?: string; meta?: { target?: string | string[] } }
  if (err?.code !== "P2002") return null
  const target = err?.meta?.target
  const targetStr = Array.isArray(target) ? target.join(",") : String(target ?? "")
  const lower = targetStr.toLowerCase()
  if (
    lower.includes("barcode_marketplace_value_active") ||
    (lower.includes("marketplaceid") && lower.includes("value"))
  ) {
    return {
      ok: false,
      error: "Штрих-код уже используется в этом маркетплейсе",
    }
  }
  if (lower.includes("barcode")) {
    return { ok: false, error: "Штрих-код уже используется" }
  }
  if (lower.includes("article") || lower.includes("marketplace")) {
    return { ok: false, error: "Артикул уже используется для этого маркетплейса" }
  }
  return { ok: false, error: "Уже существует" }
}

// ── createProduct ─────────────────────────────────────────────────

export async function createProduct(
  data: z.infer<typeof ProductSchema>
): Promise<CreateResult> {
  try {
    await requireSection("PRODUCTS")
    const parsed = ProductSchema.parse(data)

    const product = await prisma.$transaction(async (tx) => {
      // Generate next SKU from PostgreSQL sequence
      const [{ nextval }] = await tx.$queryRaw<[{ nextval: bigint }]>`
        SELECT nextval('product_sku_seq')
      `
      const sku = `УКТ-${String(nextval).padStart(6, "0")}`

      // Phase 17 (2026-05-11): для новых товаров ProductSize ещё нет, поэтому
      // productSizeId не проставляется при create. Юзер сначала создаёт товар
      // и размеры (saveProductSizes отрабатывает после createProduct в форме),
      // потом при следующем save updateProduct сделает связку.
      // Здесь productSizeValue из incoming игнорируем — для новых товаров привязка
      // делается на втором save или через WB import.
      return tx.product.create({
        data: {
          sku,
          name: parsed.name,
          photoUrl: parsed.photoUrl ?? null,
          brandId: parsed.brandId,
          categoryId: parsed.categoryId ?? null,
          subcategoryId: parsed.subcategoryId ?? null,
          label: parsed.label ?? null,
          abcStatus: parsed.abcStatus ?? null,
          availability: parsed.availability,
          weightKg: parsed.weightKg ?? null,
          heightCm: parsed.heightCm ?? null,
          widthCm: parsed.widthCm ?? null,
          depthCm: parsed.depthCm ?? null,
          articles: {
            // 260421-iq7: nested create articles + barcodes. sortOrder = index массива.
            // Новый товар всегда создаётся активным → productDeletedAt = null.
            create: parsed.marketplaces.flatMap((mp) =>
              mp.articles.map((a, i) => ({
                marketplaceId: mp.marketplaceId,
                article: a.value,
                sortOrder: i,
                barcodes: {
                  create: a.barcodes.map((b) => ({
                    marketplaceId: mp.marketplaceId,
                    value: b.value,
                    productDeletedAt: null,
                  })),
                },
              }))
            ),
          },
        },
      })
    })

    revalidatePath("/products")
    return { ok: true, id: product.id }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    const p2002 = handleP2002(e)
    if (p2002) return p2002
    console.error("createProduct error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── updateProduct ─────────────────────────────────────────────────

export async function updateProduct(
  data: z.infer<typeof UpdateProductSchema>
): Promise<ActionResult> {
  try {
    await requireSection("PRODUCTS")
    const parsed = UpdateProductSchema.parse(data)

    await prisma.$transaction(async (tx) => {
      // 260421-iq7: читаем deletedAt товара для корректной денормализации
      // в Barcode.productDeletedAt при создании новых штрих-кодов.
      const existing = await tx.product.findUnique({
        where: { id: parsed.id },
        select: { deletedAt: true },
      })
      if (!existing) {
        throw Object.assign(new Error("Product not found"), { code: "P2025" })
      }
      const productDeletedAt = existing.deletedAt

      await tx.product.update({
        where: { id: parsed.id },
        data: {
          name: parsed.name,
          photoUrl: parsed.photoUrl ?? null,
          brandId: parsed.brandId,
          categoryId: parsed.categoryId ?? null,
          subcategoryId: parsed.subcategoryId ?? null,
          label: parsed.label ?? null,
          abcStatus: parsed.abcStatus ?? null,
          availability: parsed.availability,
          weightKg: parsed.weightKg ?? null,
          heightCm: parsed.heightCm ?? null,
          widthCm: parsed.widthCm ?? null,
          depthCm: parsed.depthCm ?? null,
        },
      })

      // 260421-iq7: replace-all стратегия. Удаляем все MarketplaceArticle товара —
      // Barcode каскадно удалятся через onDelete: Cascade на FK marketplaceArticleId.
      // Отдельно barcode.deleteMany не нужен.
      await tx.marketplaceArticle.deleteMany({ where: { productId: parsed.id } })

      // Phase 17 (2026-05-11): Map value→id для резолва productSizeValue→productSizeId.
      // ProductSize должны быть уже созданы через saveProductSizes ДО updateProduct
      // (см. ProductForm onSubmit). Если связь к несуществующему размеру — null.
      const sizesRows = await tx.productSize.findMany({
        where: { productId: parsed.id },
        select: { id: true, value: true },
      })
      const sizeIdByValue = new Map(sizesRows.map((s) => [s.value, s.id]))

      // Создаём articles + nested barcodes последовательно (createMany не поддерживает nested writes).
      for (const mp of parsed.marketplaces) {
        for (let i = 0; i < mp.articles.length; i++) {
          const a = mp.articles[i]
          await tx.marketplaceArticle.create({
            data: {
              productId: parsed.id,
              marketplaceId: mp.marketplaceId,
              article: a.value,
              sortOrder: i,
              barcodes: {
                create: a.barcodes.map((b) => ({
                  marketplaceId: mp.marketplaceId,
                  value: b.value,
                  productDeletedAt,
                  productSizeId: b.productSizeValue
                    ? sizeIdByValue.get(b.productSizeValue) ?? null
                    : null,
                })),
              },
            },
          })
        }
      }
    })

    revalidatePath("/products")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    const p2002 = handleP2002(e)
    if (p2002) return p2002
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Товар не найден" }
    }
    console.error("updateProduct error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── softDeleteProduct ─────────────────────────────────────────────
// 260421-iq7: в одной транзакции синхронизируем Product.deletedAt и
// Barcode.productDeletedAt (денормализация для partial unique index).

export async function softDeleteProduct(id: string): Promise<ActionResult> {
  try {
    await requireSection("PRODUCTS")
    await prisma.$transaction(async (tx) => {
      const now = new Date()
      await tx.product.update({
        where: { id },
        data: {
          deletedAt: now,
          availability: "DISCONTINUED",
        },
      })
      // Денормализация: обновляем productDeletedAt во всех Barcode этого product
      // через цепочку marketplaceArticle (у Barcode нет productId напрямую).
      await tx.barcode.updateMany({
        where: { marketplaceArticle: { productId: id } },
        data: { productDeletedAt: now },
      })
    })
    revalidatePath("/products")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Товар не найден" }
    }
    console.error("softDeleteProduct error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── restoreProduct ────────────────────────────────────────────────
// 260421-iq7: симметричная операция softDeleteProduct. Восстанавливает товар
// из корзины + обнуляет Barcode.productDeletedAt всех штрих-кодов этого товара.

export async function restoreProduct(id: string): Promise<ActionResult> {
  try {
    await requireSection("PRODUCTS")
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          deletedAt: null,
          availability: "IN_STOCK",
        },
      })
      await tx.barcode.updateMany({
        where: { marketplaceArticle: { productId: id } },
        data: { productDeletedAt: null },
      })
    })
    revalidatePath("/products")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    const p2002 = handleP2002(e)
    if (p2002) return p2002
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Товар не найден" }
    }
    console.error("restoreProduct error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── hardDeleteProduct (физическое удаление из корзины) ────────────

export async function hardDeleteProduct(id: string): Promise<ActionResult> {
  try {
    await requireSection("PRODUCTS")
    // Каскадно удалит articles и barcodes (onDelete: Cascade в schema)
    await prisma.product.delete({ where: { id } })
    revalidatePath("/products")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Товар не найден" }
    }
    console.error("hardDeleteProduct error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── duplicateProduct ──────────────────────────────────────────────
// 260421-iq7: сохраняем sortOrder оригинала + barcodes НЕ копируются
// (partial unique per marketplace приведёт к P2002).

export async function duplicateProduct(id: string): Promise<CreateResult> {
  try {
    await requireSection("PRODUCTS")

    // Читаем articles упорядоченно по sortOrder (порядок будет сохранён при копировании)
    const original = await prisma.product.findUnique({
      where: { id },
      include: {
        articles: {
          orderBy: { sortOrder: "asc" },
        },
      },
    })

    if (!original) {
      return { ok: false, error: "Товар не найден" }
    }

    const newProduct = await prisma.$transaction(async (tx) => {
      // Generate next SKU for the duplicate
      const [{ nextval }] = await tx.$queryRaw<[{ nextval: bigint }]>`
        SELECT nextval('product_sku_seq')
      `
      const sku = `УКТ-${String(nextval).padStart(6, "0")}`

      return tx.product.create({
        data: {
          sku,
          name: `Копия — ${original.name}`,
          photoUrl: null, // Per D-26: photo is NOT copied
          brandId: original.brandId,
          categoryId: original.categoryId ?? null,
          subcategoryId: original.subcategoryId ?? null,
          abcStatus: original.abcStatus ?? null,
          availability: original.availability,
          weightKg: original.weightKg ?? null,
          heightCm: original.heightCm ?? null,
          widthCm: original.widthCm ?? null,
          depthCm: original.depthCm ?? null,
          articles: {
            // 260421-iq7: sortOrder = индекс в уже отсортированном массиве
            // → воспроизводит порядок оригинала. Barcodes не копируются.
            create: original.articles.map((a, i) => ({
              marketplaceId: a.marketplaceId,
              article: a.article,
              sortOrder: i,
            })),
          },
        },
      })
    })

    revalidatePath("/products")
    return { ok: true, id: newProduct.id }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    const p2002 = handleP2002(e)
    if (p2002) return p2002
    console.error("duplicateProduct error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ──────────────────────────────────────────────────────────────────
// Phase 17 — Свойства товаров + Размерная сетка + Импорт из WB
// ──────────────────────────────────────────────────────────────────

const SavePropertiesSchema = z.object({
  productId: z.string().min(1),
  values: z.array(
    z.object({
      propertyId: z.string().min(1),
      value: z.string().max(2000),
    })
  ),
})

const SaveSizesSchema = z.object({
  productId: z.string().min(1),
  sizes: z
    .array(z.object({ value: z.string().min(1).max(50) }))
    .max(100),
})

const ImportFromWbSchema = z.object({
  productId: z.string().min(1),
  replaceExisting: z.boolean().default(false),
})

/**
 * Phase 17: Сохранить значения свойств товара (EAV upsert).
 * Пустое value → запись удаляется (NULL не хранится).
 */
export async function saveProductProperties(
  data: z.infer<typeof SavePropertiesSchema>
): Promise<ActionResult> {
  try {
    await requireSection("PRODUCTS", "MANAGE")
    const parsed = SavePropertiesSchema.parse(data)

    await prisma.$transaction(async (tx) => {
      for (const { propertyId, value } of parsed.values) {
        const trimmed = value.trim()
        if (trimmed === "") {
          await tx.productPropertyValue.deleteMany({
            where: { productId: parsed.productId, propertyId },
          })
        } else {
          await tx.productPropertyValue.upsert({
            where: {
              productId_propertyId: { productId: parsed.productId, propertyId },
            },
            create: { productId: parsed.productId, propertyId, value: trimmed },
            update: { value: trimmed },
          })
        }
      }
    })

    revalidatePath(`/products/${parsed.productId}/edit`)
    revalidatePath("/products")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    console.error("saveProductProperties error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

/**
 * Phase 17: Сохранить размерную сетку товара (upsert).
 *
 * 2026-05-11 (Barcode↔Size link): НЕ delete-all + recreate, иначе
 * Barcode.productSizeId всех привязанных штрих-кодов обнулится через onDelete: SetNull.
 *
 * Логика:
 *   1. Дедуп incoming по value
 *   2. Найти existing размеры
 *   3. Удалить те которых нет в incoming (их Barcode-связи обнулятся, это OK —
 *      юзер сам убрал размер)
 *   4. Update sortOrder для тех что остались (по value)
 *   5. Create новые
 */
export async function saveProductSizes(
  data: z.infer<typeof SaveSizesSchema>
): Promise<ActionResult> {
  try {
    await requireSection("PRODUCTS", "MANAGE")
    const parsed = SaveSizesSchema.parse(data)

    // Дедуп по value (case-sensitive), value → sortOrder
    const incomingByValue = new Map<string, number>()
    for (let i = 0; i < parsed.sizes.length; i++) {
      const v = parsed.sizes[i].value.trim()
      if (v && !incomingByValue.has(v)) {
        incomingByValue.set(v, i)
      }
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.productSize.findMany({
        where: { productId: parsed.productId },
      })
      const existingByValue = new Map(existing.map((e) => [e.value, e]))

      // 1) Удалить размеры, отсутствующие в incoming
      const toDeleteIds = existing
        .filter((e) => !incomingByValue.has(e.value))
        .map((e) => e.id)
      if (toDeleteIds.length > 0) {
        await tx.productSize.deleteMany({ where: { id: { in: toDeleteIds } } })
      }

      // 2) Update sortOrder для existing, если изменился
      for (const [value, sortOrder] of incomingByValue) {
        const ex = existingByValue.get(value)
        if (ex && ex.sortOrder !== sortOrder) {
          await tx.productSize.update({
            where: { id: ex.id },
            data: { sortOrder },
          })
        }
      }

      // 3) Create новые
      const toCreate: { productId: string; value: string; sortOrder: number }[] = []
      for (const [value, sortOrder] of incomingByValue) {
        if (!existingByValue.has(value)) {
          toCreate.push({ productId: parsed.productId, value, sortOrder })
        }
      }
      if (toCreate.length > 0) {
        await tx.productSize.createMany({ data: toCreate })
      }
    })

    revalidatePath(`/products/${parsed.productId}/edit`)
    revalidatePath("/products")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    console.error("saveProductSizes error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── Helpers для импорта из WB ─────────────────────────────────────

type WbCharacteristic = { id?: number; name?: string; value?: unknown }

function normalizeWbValue(raw: unknown): string {
  if (raw == null) return ""
  if (Array.isArray(raw)) {
    return raw
      .map((v) => String(v))
      .filter((s) => s.length > 0)
      .join(", ")
  }
  return String(raw)
}

/**
 * Phase 17: Найти WbCard, привязанную к товару через WB MarketplaceArticle (sortOrder=0 — основная).
 * Возвращает null если у товара нет WB-артикулов или WbCard не найдена.
 */
async function findPrimaryWbCardForProduct(productId: string) {
  const wbMarketplace = await prisma.marketplace.findUnique({
    where: { slug: "wb" },
    select: { id: true },
  })
  if (!wbMarketplace) return null

  const article = await prisma.marketplaceArticle.findFirst({
    where: { productId, marketplaceId: wbMarketplace.id },
    orderBy: { sortOrder: "asc" },
  })
  if (!article) return null

  const nmId = parseInt(article.article, 10)
  if (Number.isNaN(nmId)) return null

  return prisma.wbCard.findUnique({ where: { nmId } })
}

export type WbImportPreview = {
  ok: true
  hasWbCard: boolean
  properties: Array<{
    propertyId: string
    propertyName: string
    wbAttrName: string | null
    wbValue: string | null // null = свойство не найдено в WB
    currentValue: string | null
    action: "will-set" | "will-overwrite" | "no-source" | "matches"
  }>
  sizes: {
    fromWb: string[]
    existing: string[]
    toAdd: string[]
  }
}

export type WbImportResult =
  | { ok: true; properties: { applied: number; skipped: number }; sizes: { added: number; skipped: number } }
  | { ok: false; error: string }

/**
 * Phase 17: Preview — что подтянется при импорте из WB (без записи).
 */
export async function previewWbImport(
  productId: string
): Promise<WbImportPreview | { ok: false; error: string }> {
  try {
    await requireSection("PRODUCTS", "MANAGE")

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: { include: { properties: { orderBy: { sortOrder: "asc" } } } },
        propertyValues: true,
        sizes: true,
      },
    })
    if (!product) return { ok: false, error: "Товар не найден" }

    const wbCard = await findPrimaryWbCardForProduct(productId)
    if (!wbCard) {
      return { ok: true, hasWbCard: false, properties: [], sizes: { fromWb: [], existing: [], toAdd: [] } }
    }

    const characteristics = (wbCard.characteristics as WbCharacteristic[] | null) ?? []
    const charByName = new Map<string, WbCharacteristic>()
    for (const c of characteristics) {
      if (c.name) charByName.set(c.name, c)
    }

    const properties = (product.category?.properties ?? []).map((prop) => {
      const currentVal = product.propertyValues.find((v) => v.propertyId === prop.id)?.value ?? null
      const wbChar = prop.wbAttrName ? charByName.get(prop.wbAttrName) : undefined
      const wbValue = wbChar ? normalizeWbValue(wbChar.value) : null

      let action: "will-set" | "will-overwrite" | "no-source" | "matches"
      if (wbValue === null) action = "no-source"
      else if (currentVal === null) action = "will-set"
      else if (currentVal === wbValue) action = "matches"
      else action = "will-overwrite"

      return {
        propertyId: prop.id,
        propertyName: prop.name,
        wbAttrName: prop.wbAttrName,
        wbValue,
        currentValue: currentVal,
        action,
      }
    })

    const fromWb = wbCard.techSizes ?? []
    const existing = product.sizes.map((s) => s.value)
    const toAdd = fromWb.filter((v) => !existing.includes(v))

    return {
      ok: true,
      hasWbCard: true,
      properties,
      sizes: { fromWb, existing, toAdd },
    }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    console.error("previewWbImport error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

/**
 * Phase 17: Импорт свойств и размеров из основной WB-карточки в товар.
 *   - replaceExisting=false → не затирать существующие ProductPropertyValue
 *   - размеры — addOnly (новые добавляются, дубли пропускаются)
 */
export async function importFromWb(
  data: z.infer<typeof ImportFromWbSchema>
): Promise<WbImportResult> {
  try {
    await requireSection("PRODUCTS", "MANAGE")
    const parsed = ImportFromWbSchema.parse(data)

    const preview = await previewWbImport(parsed.productId)
    if (!preview.ok) return { ok: false, error: preview.error }
    if (!preview.hasWbCard) {
      return { ok: false, error: "У товара нет привязанной WB-карточки" }
    }

    let propApplied = 0
    let propSkipped = 0
    let sizesAdded = 0
    let sizesSkipped = 0

    await prisma.$transaction(async (tx) => {
      for (const p of preview.properties) {
        if (p.wbValue === null) {
          propSkipped++
          continue
        }
        if (p.action === "will-overwrite" && !parsed.replaceExisting) {
          propSkipped++
          continue
        }
        if (p.action === "matches") {
          propSkipped++
          continue
        }
        await tx.productPropertyValue.upsert({
          where: {
            productId_propertyId: {
              productId: parsed.productId,
              propertyId: p.propertyId,
            },
          },
          create: {
            productId: parsed.productId,
            propertyId: p.propertyId,
            value: p.wbValue,
          },
          update: { value: p.wbValue },
        })
        propApplied++
      }

      // Размеры — addOnly. Берём max sortOrder из существующих чтобы новые шли в конец.
      const existing = await tx.productSize.findMany({
        where: { productId: parsed.productId },
        orderBy: { sortOrder: "desc" },
        take: 1,
      })
      let nextOrder = (existing[0]?.sortOrder ?? -1) + 1

      for (const sz of preview.sizes.fromWb) {
        if (preview.sizes.existing.includes(sz)) {
          sizesSkipped++
          continue
        }
        await tx.productSize.create({
          data: {
            productId: parsed.productId,
            value: sz,
            sortOrder: nextOrder++,
          },
        })
        sizesAdded++
      }

      // Phase 17 (2026-05-11): связать существующие Barcode с ProductSize
      // по совпадению со skus из WB sizes[].
      // Источник: WbCard.rawJson.sizes — массив { techSize, skus[] } из Content API.
      // Логика: для каждого WB-size (techSize) → каждый sku из skus[] —
      // найти Barcode товара со value=sku → проставить productSizeId.
      // Это безопасный update — не создаёт новых barcode, не трогает не совпадающие.
      const wbCardRaw = await tx.wbCard.findFirst({
        where: {
          nmId: {
            in: await tx.marketplaceArticle
              .findMany({
                where: {
                  productId: parsed.productId,
                  marketplace: { slug: "wb" },
                },
                orderBy: { sortOrder: "asc" },
                take: 1,
                select: { article: true },
              })
              .then((rows) =>
                rows
                  .map((r) => parseInt(r.article, 10))
                  .filter((n) => !Number.isNaN(n))
              ),
          },
        },
        select: { rawJson: true },
      })

      const rawSizes = (wbCardRaw?.rawJson as { sizes?: Array<{ techSize?: string; skus?: string[] }> } | null)?.sizes ?? []

      // Карта value → id размеров товара (после возможного добавления выше)
      const allSizes = await tx.productSize.findMany({
        where: { productId: parsed.productId },
        select: { id: true, value: true },
      })
      const sizeIdByValue = new Map(allSizes.map((s) => [s.value, s.id]))

      for (const wbSize of rawSizes) {
        const ts = String(wbSize.techSize ?? "").trim()
        if (!ts || ts === "0") continue
        const sizeId = sizeIdByValue.get(ts)
        if (!sizeId) continue // размер не был создан (не в preview.sizes.fromWb)
        const skus = wbSize.skus ?? []
        if (skus.length === 0) continue

        await tx.barcode.updateMany({
          where: {
            value: { in: skus },
            marketplaceArticle: { productId: parsed.productId },
            // Только не привязанные или привязанные к другому размеру → обновим
            // (привязка к тому же размеру = noop, тоже не страшно)
          },
          data: { productSizeId: sizeId },
        })
      }

      // Touch Product.updatedAt чтобы edit page formKey (= product.updatedAt) сменился
      // → React пересоздаст ProductForm с новыми defaultValues после router.refresh().
      await tx.product.update({
        where: { id: parsed.productId },
        data: { updatedAt: new Date() },
      })
    })

    revalidatePath(`/products/${parsed.productId}/edit`)
    revalidatePath("/products")
    return {
      ok: true,
      properties: { applied: propApplied, skipped: propSkipped },
      sizes: { added: sizesAdded, skipped: sizesSkipped },
    }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    console.error("importFromWb error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}
