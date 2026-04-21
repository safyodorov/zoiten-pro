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

const BarcodeSchema = z.object({ value: z.string().min(1) })

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
