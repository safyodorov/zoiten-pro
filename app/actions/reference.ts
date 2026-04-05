// app/actions/reference.ts
// Server Actions for reference data CRUD — brands, categories, subcategories, marketplaces
// All actions require superadmin role (D-13)
"use server"

import { requireSuperadmin } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { revalidatePath } from "next/cache"

// ── Types ─────────────────────────────────────────────────────────

type ActionResult = { ok: true } | { ok: false; error: string }
type CreateResult = { ok: true; id: string } | { ok: false; error: string }

// ── Schemas ────────────────────────────────────────────────────────

const BrandSchema = z.object({
  name: z.string().min(1, "Не может быть пустым").max(100),
})

const UpdateBrandSchema = BrandSchema.extend({
  id: z.string().min(1),
})

const CategorySchema = z.object({
  name: z.string().min(1, "Не может быть пустым").max(100),
  brandId: z.string().min(1),
})

const UpdateCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Не может быть пустым").max(100),
})

const SubcategorySchema = z.object({
  name: z.string().min(1, "Не может быть пустым").max(100),
  categoryId: z.string().min(1),
})

const UpdateSubcategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Не может быть пустым").max(100),
})

const MarketplaceSchema = z.object({
  name: z.string().min(1, "Не может быть пустым").max(100),
  slug: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[a-z0-9-]+$/, "Только строчные буквы и цифры"),
})

const UpdateMarketplaceSchema = MarketplaceSchema.extend({
  id: z.string().min(1),
})

// ── Seeded slugs that cannot be deleted (D-12) ────────────────────

const PROTECTED_MARKETPLACE_SLUGS = ["wb", "ozon", "dm", "ym"]

// ── Error handler helper ──────────────────────────────────────────

function handleAuthError(e: unknown): { ok: false; error: string } | null {
  if (e instanceof Error) {
    if (e.message === "UNAUTHORIZED") return { ok: false, error: "Не авторизован" }
    if (e.message === "FORBIDDEN") return { ok: false, error: "Нет доступа" }
  }
  return null
}

// ── Brand Actions ─────────────────────────────────────────────────

export async function createBrand(
  data: z.infer<typeof BrandSchema>
): Promise<CreateResult> {
  try {
    await requireSuperadmin()
    const parsed = BrandSchema.parse(data)
    const brand = await prisma.brand.create({
      data: { name: parsed.name },
    })
    revalidatePath("/admin/settings")
    return { ok: true, id: brand.id }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2002") {
      return { ok: false, error: "Бренд с таким названием уже существует" }
    }
    console.error("createBrand error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

export async function updateBrand(
  data: z.infer<typeof UpdateBrandSchema>
): Promise<ActionResult> {
  try {
    await requireSuperadmin()
    const parsed = UpdateBrandSchema.parse(data)
    await prisma.brand.update({
      where: { id: parsed.id },
      data: { name: parsed.name },
    })
    revalidatePath("/admin/settings")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2002") {
      return { ok: false, error: "Бренд с таким названием уже существует" }
    }
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Бренд не найден" }
    }
    console.error("updateBrand error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

export async function deleteBrand(id: string): Promise<ActionResult> {
  try {
    await requireSuperadmin()
    // Guard: Zoiten brand cannot be deleted (per D-05)
    const brand = await prisma.brand.findUnique({ where: { id } })
    if (brand?.name === "Zoiten") {
      return { ok: false, error: "Бренд Zoiten нельзя удалить" }
    }
    await prisma.brand.delete({ where: { id } })
    revalidatePath("/admin/settings")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2003") {
      return { ok: false, error: "Бренд используется в товарах" }
    }
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Бренд не найден" }
    }
    console.error("deleteBrand error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── Category Actions ──────────────────────────────────────────────

export async function createCategory(
  data: z.infer<typeof CategorySchema>
): Promise<CreateResult> {
  try {
    await requireSuperadmin()
    const parsed = CategorySchema.parse(data)
    const category = await prisma.category.create({
      data: { name: parsed.name, brandId: parsed.brandId },
    })
    revalidatePath("/admin/settings")
    return { ok: true, id: category.id }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2002") {
      return {
        ok: false,
        error: "Категория с таким названием уже существует в этом бренде",
      }
    }
    console.error("createCategory error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

export async function updateCategory(
  data: z.infer<typeof UpdateCategorySchema>
): Promise<ActionResult> {
  try {
    await requireSuperadmin()
    const parsed = UpdateCategorySchema.parse(data)
    await prisma.category.update({
      where: { id: parsed.id },
      data: { name: parsed.name },
    })
    revalidatePath("/admin/settings")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2002") {
      return {
        ok: false,
        error: "Категория с таким названием уже существует в этом бренде",
      }
    }
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Категория не найдена" }
    }
    console.error("updateCategory error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  try {
    await requireSuperadmin()
    // Subcategories cascade-deleted via schema OnDelete:Cascade
    await prisma.category.delete({ where: { id } })
    revalidatePath("/admin/settings")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Категория не найдена" }
    }
    if ((e as { code?: string })?.code === "P2003") {
      return { ok: false, error: "Категория используется в товарах" }
    }
    console.error("deleteCategory error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── Subcategory Actions ───────────────────────────────────────────

export async function createSubcategory(
  data: z.infer<typeof SubcategorySchema>
): Promise<CreateResult> {
  try {
    await requireSuperadmin()
    const parsed = SubcategorySchema.parse(data)
    const subcategory = await prisma.subcategory.create({
      data: { name: parsed.name, categoryId: parsed.categoryId },
    })
    revalidatePath("/admin/settings")
    return { ok: true, id: subcategory.id }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2002") {
      return { ok: false, error: "Подкатегория с таким названием уже существует" }
    }
    console.error("createSubcategory error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

export async function updateSubcategory(
  data: z.infer<typeof UpdateSubcategorySchema>
): Promise<ActionResult> {
  try {
    await requireSuperadmin()
    const parsed = UpdateSubcategorySchema.parse(data)
    await prisma.subcategory.update({
      where: { id: parsed.id },
      data: { name: parsed.name },
    })
    revalidatePath("/admin/settings")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2002") {
      return { ok: false, error: "Подкатегория с таким названием уже существует" }
    }
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Подкатегория не найдена" }
    }
    console.error("updateSubcategory error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

export async function deleteSubcategory(id: string): Promise<ActionResult> {
  try {
    await requireSuperadmin()
    await prisma.subcategory.delete({ where: { id } })
    revalidatePath("/admin/settings")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Подкатегория не найдена" }
    }
    if ((e as { code?: string })?.code === "P2003") {
      return { ok: false, error: "Подкатегория используется в товарах" }
    }
    console.error("deleteSubcategory error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── Marketplace Actions ───────────────────────────────────────────

export async function createMarketplace(
  data: z.infer<typeof MarketplaceSchema>
): Promise<CreateResult> {
  try {
    await requireSuperadmin()
    const parsed = MarketplaceSchema.parse(data)
    const marketplace = await prisma.marketplace.create({
      data: { name: parsed.name, slug: parsed.slug },
    })
    revalidatePath("/admin/settings")
    return { ok: true, id: marketplace.id }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2002") {
      return { ok: false, error: "Маркетплейс с таким названием уже существует" }
    }
    console.error("createMarketplace error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

export async function updateMarketplace(
  data: z.infer<typeof UpdateMarketplaceSchema>
): Promise<ActionResult> {
  try {
    await requireSuperadmin()
    const parsed = UpdateMarketplaceSchema.parse(data)
    // Per D-12: seeded marketplaces CAN be renamed — no guard needed here
    await prisma.marketplace.update({
      where: { id: parsed.id },
      data: { name: parsed.name, slug: parsed.slug },
    })
    revalidatePath("/admin/settings")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2002") {
      return { ok: false, error: "Маркетплейс с таким названием уже существует" }
    }
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Маркетплейс не найден" }
    }
    console.error("updateMarketplace error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

export async function deleteMarketplace(id: string): Promise<ActionResult> {
  try {
    await requireSuperadmin()
    // Guard: seeded system marketplaces cannot be deleted (per D-12)
    const marketplace = await prisma.marketplace.findUnique({ where: { id } })
    if (marketplace && PROTECTED_MARKETPLACE_SLUGS.includes(marketplace.slug)) {
      return { ok: false, error: "Системный маркетплейс нельзя удалить" }
    }
    await prisma.marketplace.delete({ where: { id } })
    revalidatePath("/admin/settings")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2003") {
      return { ok: false, error: "Маркетплейс используется в товарах" }
    }
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Маркетплейс не найден" }
    }
    console.error("deleteMarketplace error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}
