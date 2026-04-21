// app/actions/wb-cards.ts
// Серверные экшены для карточек WB — создание товаров из карточек
"use server"

import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

type ActionResult = { ok: true } | { ok: false; error: string }
type CreateResult = { ok: true; id: string } | { ok: false; error: string }

// ── Создать новый товар из выбранных карточек WB ─────────────────
// 260421-iq7: штрих-коды создаются nested в articles с marketplaceArticleId/marketplaceId/
// productDeletedAt. Дедуп barcode per-marketplace (partial unique index), не глобально.

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

    // Упорядочиваем cards детерминированно по исходному массиву cardIds
    const cardOrderMap = new Map(cardIds.map((id, idx) => [id, idx]))
    const cardsOrdered = [...cards].sort(
      (a, b) => (cardOrderMap.get(a.id) ?? 0) - (cardOrderMap.get(b.id) ?? 0)
    )

    const firstCard = cardsOrdered[0]

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

    // Находим маркетплейс WB
    const wbMarketplace = await prisma.marketplace.findFirst({
      where: { slug: "wb" },
    })

    if (!wbMarketplace) {
      return { ok: false, error: "Маркетплейс WB не найден в настройках" }
    }

    // Удаляем осиротевшие артикулы от soft-deleted товаров (их barcodes
    // каскадно удалятся через FK onDelete: Cascade).
    const articleValues = cardsOrdered.map((c) => String(c.nmId))
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

    // Собираем все новые штрих-коды с карточек (для дедупа per-marketplace)
    const allCardBarcodes = new Set<string>()
    for (const card of cardsOrdered) {
      if (card.barcode) allCardBarcodes.add(card.barcode)
      for (const bc of card.barcodes) allCardBarcodes.add(bc)
    }

    // Дедуп barcode только внутри WB marketplaceId среди активных товаров.
    // productDeletedAt: null в WHERE = только активные конфликты блокируют создание
    // (тот же штрих-код на soft-deleted товаре разрешён по partial unique).
    const wbExisting = await prisma.barcode.findMany({
      where: {
        marketplaceId: wbMarketplace.id,
        value: { in: Array.from(allCardBarcodes) },
        productDeletedAt: null,
      },
      select: { value: true },
    })
    const wbExistingSet = new Set(wbExisting.map((b) => b.value))

    // Набор уже использованных штрих-кодов внутри текущего запроса (чтобы
    // одна и та же карточка не создала дубль между артикулами)
    const usedInThisRequest = new Set<string>()

    // Создаём товар с уникальным SKU
    const product = await prisma.$transaction(async (tx) => {
      const [{ nextval }] = await tx.$queryRaw<[{ nextval: bigint }]>`
        SELECT nextval('product_sku_seq')
      `
      const sku = `УКТ-${String(nextval).padStart(6, "0")}`

      // Nested articles: пропускаем карточки с уже занятыми артикулами.
      const articlesCreate: Array<{
        marketplaceId: string
        article: string
        sortOrder: number
        barcodes: { create: Array<{ marketplaceId: string; value: string; productDeletedAt: null }> }
      }> = []

      let sortOrder = 0
      for (const card of cardsOrdered) {
        const articleValue = String(card.nmId)
        if (existingArticleSet.has(articleValue)) continue

        // Штрих-коды для этой карточки — уникальные (не в wbExisting, не ранее добавленные)
        const cardBarcodes = new Set<string>()
        if (card.barcode) cardBarcodes.add(card.barcode)
        for (const bc of card.barcodes) cardBarcodes.add(bc)
        const barcodesForThisCard = Array.from(cardBarcodes).filter(
          (v) => !wbExistingSet.has(v) && !usedInThisRequest.has(v)
        )
        for (const v of barcodesForThisCard) usedInThisRequest.add(v)

        articlesCreate.push({
          marketplaceId: wbMarketplace.id,
          article: articleValue,
          sortOrder,
          barcodes: {
            create: barcodesForThisCard.map((value) => ({
              marketplaceId: wbMarketplace.id,
              value,
              productDeletedAt: null,
            })),
          },
        })
        sortOrder++
      }

      return tx.product.create({
        data: {
          sku,
          name: firstCard.name,
          photoUrl: firstCard.photoUrl,
          brandId,
          weightKg: firstCard.weightKg,
          heightCm: firstCard.heightCm,
          widthCm: firstCard.widthCm,
          depthCm: firstCard.depthCm,
          articles: {
            create: articlesCreate,
          },
        },
      })
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
// 260421-iq7: полная переработка — каждый barcode создаётся с marketplaceArticleId
// нового WB артикула, marketplaceId=WB, productDeletedAt=product.deletedAt.
// Создание per-article последовательное (createMany не поддерживает nested writes).

export async function addCardsToProduct(
  cardIds: string[],
  productId: string
): Promise<ActionResult> {
  try {
    await requireSection("PRODUCTS")

    if (cardIds.length === 0) {
      return { ok: false, error: "Не выбрано ни одной карточки" }
    }

    const [cards, wbMarketplace] = await Promise.all([
      prisma.wbCard.findMany({
        where: { id: { in: cardIds } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.marketplace.findFirst({ where: { slug: "wb" } }),
    ])

    if (!wbMarketplace) return { ok: false, error: "Маркетплейс WB не найден" }

    // 260421-iq7: читаем articles (WB) с nested barcodes — больше нет Product.barcodes.
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        articles: {
          where: { marketplaceId: wbMarketplace.id },
          include: { barcodes: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    })

    if (!product) return { ok: false, error: "Товар не найден" }

    // Существующие артикулы WB этого товара
    const existingArticleSet = new Set(product.articles.map((a) => a.article))

    // Макс. sortOrder среди WB-артикулов товара — новые пишутся в конец
    const maxSortOrder = product.articles.reduce(
      (max, a) => Math.max(max, a.sortOrder),
      -1
    )

    // Существующие штрих-коды этого товара (по всем WB артикулам)
    const existingBarcodeValues = new Set<string>(
      product.articles.flatMap((a) => a.barcodes.map((b) => b.value))
    )

    // Упорядочиваем cards детерминированно по исходному массиву cardIds
    // (пользователь выбрал в конкретном порядке — sortOrder должен это отражать).
    const cardOrderMap = new Map(cardIds.map((id, idx) => [id, idx]))
    const cardsOrdered = [...cards].sort(
      (a, b) => (cardOrderMap.get(a.id) ?? 0) - (cardOrderMap.get(b.id) ?? 0)
    )

    // Дедуп barcode per-marketplace среди активных товаров (partial unique).
    const allNewBarcodes = new Set<string>()
    for (const card of cardsOrdered) {
      if (card.barcode && !existingBarcodeValues.has(card.barcode)) {
        allNewBarcodes.add(card.barcode)
      }
      for (const bc of card.barcodes) {
        if (!existingBarcodeValues.has(bc)) allNewBarcodes.add(bc)
      }
    }

    const wbExisting = await prisma.barcode.findMany({
      where: {
        marketplaceId: wbMarketplace.id,
        value: { in: Array.from(allNewBarcodes) },
        productDeletedAt: null,
      },
      select: { value: true },
    })
    const wbExistingSet = new Set(wbExisting.map((b) => b.value))

    await prisma.$transaction(async (tx) => {
      let offset = 0
      for (const card of cardsOrdered) {
        const articleValue = String(card.nmId)
        if (existingArticleSet.has(articleValue)) continue // этот nmId уже привязан

        // Штрих-коды для этой карточки
        const cardBarcodes = new Set<string>()
        if (card.barcode) cardBarcodes.add(card.barcode)
        for (const bc of card.barcodes) cardBarcodes.add(bc)
        const barcodesForThisCard = Array.from(cardBarcodes).filter(
          (v) => !existingBarcodeValues.has(v) && !wbExistingSet.has(v)
        )

        await tx.marketplaceArticle.create({
          data: {
            productId,
            marketplaceId: wbMarketplace.id,
            article: articleValue,
            sortOrder: maxSortOrder + 1 + offset,
            barcodes: {
              create: barcodesForThisCard.map((value) => ({
                marketplaceId: wbMarketplace.id,
                value,
                productDeletedAt: product.deletedAt, // null для активного товара
              })),
            },
          },
        })

        offset++
        for (const v of barcodesForThisCard) {
          existingBarcodeValues.add(v)
          wbExistingSet.add(v)
        }
      }
    })

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
