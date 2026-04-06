// app/actions/products.ts
// Server Actions for Products CRUD — create, update, softDelete, duplicate
"use server"

import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { revalidatePath } from "next/cache"

// ── Types ─────────────────────────────────────────────────────────

type ActionResult = { ok: true } | { ok: false; error: string }
type CreateResult = { ok: true; id: string } | { ok: false; error: string }

// ── Schemas ────────────────────────────────────────────────────────

const ArticleSchema = z.object({
  marketplaceId: z.string().min(1),
  articles: z.array(z.object({ value: z.string().min(1) })).max(10),
})

const ProductSchema = z.object({
  name: z.string().min(1).max(100),
  photoUrl: z.string().nullable().optional(),
  brandId: z.string().min(1),
  categoryId: z.string().optional(),
  subcategoryId: z.string().optional(),
  abcStatus: z.enum(["A", "B", "C"]).optional(),
  availability: z
    .enum(["IN_STOCK", "OUT_OF_STOCK", "DISCONTINUED", "DELETED"])
    .default("IN_STOCK"),
  weightKg: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
  widthCm: z.number().positive().optional(),
  depthCm: z.number().positive().optional(),
  barcodes: z.array(z.object({ value: z.string().min(1) })).min(0).max(20),
  marketplaces: z.array(ArticleSchema),
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

function handleP2002(e: unknown): { ok: false; error: string } | null {
  const err = e as { code?: string; meta?: { target?: string | string[] } }
  if (err?.code !== "P2002") return null
  const target = err?.meta?.target
  const targetStr = Array.isArray(target) ? target.join(",") : String(target ?? "")
  if (targetStr.toLowerCase().includes("barcode")) {
    return { ok: false, error: "Штрих-код уже используется" }
  }
  if (
    targetStr.toLowerCase().includes("article") ||
    targetStr.toLowerCase().includes("marketplace")
  ) {
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
      return tx.product.create({
        data: {
          name: parsed.name,
          photoUrl: parsed.photoUrl ?? null,
          brandId: parsed.brandId,
          categoryId: parsed.categoryId ?? null,
          subcategoryId: parsed.subcategoryId ?? null,
          abcStatus: parsed.abcStatus ?? null,
          availability: parsed.availability,
          weightKg: parsed.weightKg ?? null,
          heightCm: parsed.heightCm ?? null,
          widthCm: parsed.widthCm ?? null,
          depthCm: parsed.depthCm ?? null,
          barcodes: {
            create: parsed.barcodes.map((b) => ({ value: b.value })),
          },
          articles: {
            create: parsed.marketplaces.flatMap((mp) =>
              mp.articles.map((a) => ({
                marketplaceId: mp.marketplaceId,
                article: a.value,
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
      await tx.product.update({
        where: { id: parsed.id },
        data: {
          name: parsed.name,
          photoUrl: parsed.photoUrl ?? null,
          brandId: parsed.brandId,
          categoryId: parsed.categoryId ?? null,
          subcategoryId: parsed.subcategoryId ?? null,
          abcStatus: parsed.abcStatus ?? null,
          availability: parsed.availability,
          weightKg: parsed.weightKg ?? null,
          heightCm: parsed.heightCm ?? null,
          widthCm: parsed.widthCm ?? null,
          depthCm: parsed.depthCm ?? null,
        },
      })

      // Replace barcodes
      await tx.barcode.deleteMany({ where: { productId: parsed.id } })
      if (parsed.barcodes.length > 0) {
        await tx.barcode.createMany({
          data: parsed.barcodes.map((b) => ({
            productId: parsed.id,
            value: b.value,
          })),
        })
      }

      // Replace marketplace articles
      await tx.marketplaceArticle.deleteMany({ where: { productId: parsed.id } })
      const articlesData = parsed.marketplaces.flatMap((mp) =>
        mp.articles.map((a) => ({
          productId: parsed.id,
          marketplaceId: mp.marketplaceId,
          article: a.value,
        }))
      )
      if (articlesData.length > 0) {
        await tx.marketplaceArticle.createMany({ data: articlesData })
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

export async function softDeleteProduct(id: string): Promise<ActionResult> {
  try {
    await requireSection("PRODUCTS")
    await prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        availability: "DISCONTINUED",
      },
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

// ── duplicateProduct ──────────────────────────────────────────────

export async function duplicateProduct(id: string): Promise<CreateResult> {
  try {
    await requireSection("PRODUCTS")

    // Fetch original with articles only (barcodes NOT copied — globally unique constraint)
    const original = await prisma.product.findUnique({
      where: { id },
      include: { articles: true },
    })

    if (!original) {
      return { ok: false, error: "Товар не найден" }
    }

    const newProduct = await prisma.product.create({
      data: {
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
          create: original.articles.map((a) => ({
            marketplaceId: a.marketplaceId,
            article: a.article,
          })),
        },
      },
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
