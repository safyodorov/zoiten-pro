// app/actions/wb-cards.ts
// Серверные экшены для карточек WB — создание товаров из карточек
"use server"

import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

type ActionResult = { ok: true } | { ok: false; error: string }
type CreateResult = { ok: true; id: string } | { ok: false; error: string }

// ── Создать новый товар из выбранных карточек WB ─────────────────

export async function createProductFromCards(
  cardIds: string[]
): Promise<CreateResult> {
  try {
    await requireSection("PRODUCTS")

    if (cardIds.length === 0) {
      return { ok: false, error: "Не выбрано ни одной карточки" }
    }

    const cards = await prisma.wbCard.findMany({
      where: { id: { in: cardIds } },
      orderBy: { createdAt: "asc" },
    })

    if (cards.length === 0) {
      return { ok: false, error: "Карточки не найдены" }
    }

    const firstCard = cards[0]

    // Попытка найти бренд по названию
    let brandId: string | null = null
    if (firstCard.brand) {
      const brand = await prisma.brand.findFirst({
        where: { name: { equals: firstCard.brand, mode: "insensitive" } },
      })
      brandId = brand?.id ?? null
    }

    // Если бренд не найден, используем первый доступный
    if (!brandId) {
      const defaultBrand = await prisma.brand.findFirst({
        orderBy: { sortOrder: "asc" },
      })
      brandId = defaultBrand?.id ?? null
    }

    if (!brandId) {
      return { ok: false, error: "Нет доступных брендов. Создайте бренд в настройках." }
    }

    // Собираем уникальные штрихкоды
    const allBarcodes = new Set<string>()
    for (const card of cards) {
      if (card.barcode) allBarcodes.add(card.barcode)
      for (const bc of card.barcodes) {
        allBarcodes.add(bc)
      }
    }

    // Исключаем штрихкоды, уже существующие в БД
    const existingBarcodes = await prisma.barcode.findMany({
      where: { value: { in: Array.from(allBarcodes) } },
      select: { value: true },
    })
    const existingSet = new Set(existingBarcodes.map((b) => b.value))
    const newBarcodes = Array.from(allBarcodes).filter((bc) => !existingSet.has(bc))

    // Находим маркетплейс WB
    const wbMarketplace = await prisma.marketplace.findFirst({
      where: { slug: "wb" },
    })

    if (!wbMarketplace) {
      return { ok: false, error: "Маркетплейс WB не найден в настройках" }
    }

    // Удаляем осиротевшие артикулы от soft-deleted товаров
    const articleValues = cards.map((c) => String(c.nmId))
    await prisma.marketplaceArticle.deleteMany({
      where: {
        marketplaceId: wbMarketplace.id,
        article: { in: articleValues },
        product: { deletedAt: { not: null } },
      },
    })

    // Проверяем какие артикулы уже заняты активными товарами
    const existingArticles = await prisma.marketplaceArticle.findMany({
      where: {
        marketplaceId: wbMarketplace.id,
        article: { in: articleValues },
      },
      select: { article: true },
    })
    const existingArticleSet = new Set(existingArticles.map((a) => a.article))
    const newArticles = articleValues.filter((a) => !existingArticleSet.has(a))

    // Создаём товар
    const product = await prisma.product.create({
      data: {
        name: firstCard.name,
        photoUrl: firstCard.photoUrl,
        brandId,
        weightKg: firstCard.weightKg,
        heightCm: firstCard.heightCm,
        widthCm: firstCard.widthCm,
        depthCm: firstCard.depthCm,
        articles: {
          create: newArticles.map((article) => ({
            marketplaceId: wbMarketplace.id,
            article,
          })),
        },
        barcodes: {
          create: newBarcodes.map((value) => ({ value })),
        },
      },
    })

    revalidatePath("/products")
    revalidatePath("/cards/wb")
    return { ok: true, id: product.id }
  } catch (e) {
    console.error("createProductFromCards error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── Добавить карточки WB в существующий товар ────────────────────

export async function addCardsToProduct(
  cardIds: string[],
  productId: string
): Promise<ActionResult> {
  try {
    await requireSection("PRODUCTS")

    if (cardIds.length === 0) {
      return { ok: false, error: "Не выбрано ни одной карточки" }
    }

    const [cards, product, wbMarketplace] = await Promise.all([
      prisma.wbCard.findMany({ where: { id: { in: cardIds } } }),
      prisma.product.findUnique({
        where: { id: productId },
        include: { articles: true, barcodes: true },
      }),
      prisma.marketplace.findFirst({ where: { slug: "wb" } }),
    ])

    if (!product) return { ok: false, error: "Товар не найден" }
    if (!wbMarketplace) return { ok: false, error: "Маркетплейс WB не найден" }

    // Существующие артикулы WB этого товара
    const existingArticles = new Set(
      product.articles
        .filter((a) => a.marketplaceId === wbMarketplace.id)
        .map((a) => a.article)
    )

    // Новые артикулы (не дублируем)
    const newArticles = cards
      .filter((card) => !existingArticles.has(String(card.nmId)))
      .map((card) => ({
        productId,
        marketplaceId: wbMarketplace.id,
        article: String(card.nmId),
      }))

    // Собираем уникальные штрихкоды
    const existingBarcodeValues = new Set(product.barcodes.map((b) => b.value))
    const allNewBarcodes = new Set<string>()
    for (const card of cards) {
      if (card.barcode && !existingBarcodeValues.has(card.barcode)) {
        allNewBarcodes.add(card.barcode)
      }
      for (const bc of card.barcodes) {
        if (!existingBarcodeValues.has(bc)) allNewBarcodes.add(bc)
      }
    }

    // Исключаем штрихкоды, существующие глобально
    const globalExisting = await prisma.barcode.findMany({
      where: { value: { in: Array.from(allNewBarcodes) } },
      select: { value: true },
    })
    const globalSet = new Set(globalExisting.map((b) => b.value))
    const barcodesToCreate = Array.from(allNewBarcodes).filter(
      (bc) => !globalSet.has(bc)
    )

    await prisma.$transaction([
      ...(newArticles.length > 0
        ? [prisma.marketplaceArticle.createMany({ data: newArticles })]
        : []),
      ...(barcodesToCreate.length > 0
        ? [
            prisma.barcode.createMany({
              data: barcodesToCreate.map((value) => ({ productId, value })),
            }),
          ]
        : []),
    ])

    revalidatePath("/products")
    revalidatePath("/cards/wb")
    return { ok: true }
  } catch (e) {
    console.error("addCardsToProduct error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── Поиск товаров для диалога «В существующий товар» ─────────────

export async function searchProducts(query: string) {
  await requireSection("PRODUCTS")
  if (!query.trim()) return []

  return prisma.product.findMany({
    where: {
      deletedAt: null,
      name: { contains: query.trim(), mode: "insensitive" },
    },
    select: { id: true, name: true, photoUrl: true },
    orderBy: { name: "asc" },
    take: 10,
  })
}
