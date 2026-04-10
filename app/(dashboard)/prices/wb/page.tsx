// app/(dashboard)/prices/wb/page.tsx
// Phase 7: RSC страница раздела «Управление ценами → WB».
//
// Загружает все данные параллельно через Promise.all, группирует WbCards
// по Product через MarketplaceArticle (slug="wb"), строит priceRows
// (current + regular + auto + calculated), серверно считает calculatePricing
// для каждой строки и рендерит GlobalRatesBar + кнопки шапки + PriceCalculatorTable.
//
// Заменяет временную заглушку из плана 07-06.

import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import {
  calculatePricing,
  resolveDrrPct,
  resolveDefectRatePct,
  resolveDeliveryCostRub,
  type PricingInputs,
} from "@/lib/pricing-math"
import { GlobalRatesBar } from "@/components/prices/GlobalRatesBar"
import {
  type ProductGroup,
  type PriceRow,
  type WbCardRowGroup,
} from "@/components/prices/PriceCalculatorTable"
import { PriceCalculatorTableWrapper } from "@/components/prices/PriceCalculatorTableWrapper"
import { getUserPreference } from "@/app/actions/user-preferences"
import { WbSyncButton } from "@/components/cards/WbSyncButton"
import { WbSyncSppButton } from "@/components/cards/WbSyncSppButton"
import { WbPromotionsSyncButton } from "@/components/prices/WbPromotionsSyncButton"
import { WbAutoPromoUploadButton } from "@/components/prices/WbAutoPromoUploadButton"
import { PricesFilters } from "@/components/prices/PricesFilters"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Info } from "lucide-react"

export const dynamic = "force-dynamic"

// ──────────────────────────────────────────────────────────────────
// Константы: ключи и дефолты 6 глобальных ставок (AppSetting)
// ──────────────────────────────────────────────────────────────────

const RATE_KEYS = [
  "wbWalletPct",
  "wbAcquiringPct",
  "wbJemPct",
  "wbCreditPct",
  "wbOverheadPct",
  "wbTaxPct",
] as const

type RateKey = (typeof RATE_KEYS)[number]

const DEFAULT_RATES: Record<RateKey, number> = {
  wbWalletPct: 2.0,
  wbAcquiringPct: 2.7,
  wbJemPct: 1.0,
  wbCreditPct: 7.0,
  wbOverheadPct: 6.0,
  wbTaxPct: 8.0,
}

// ──────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────

interface PricesWbPageProps {
  searchParams: Promise<{
    brands?: string
    categories?: string
    subcategories?: string
    stock?: string
    cardStock?: string
  }>
}

export default async function PricesWbPage({ searchParams }: PricesWbPageProps) {
  // RBAC: VIEW достаточно для чтения таблицы (запись — через server actions с MANAGE)
  await requireSection("PRICES")

  // ── 0. Разобрать searchParams (фильтры) ─────────────────────────
  const {
    brands: brandsParam,
    categories: categoriesParam,
    subcategories: subcategoriesParam,
    stock: stockParam,
    cardStock: cardStockParam,
  } = await searchParams

  const selectedBrandIds = brandsParam ? brandsParam.split(",").filter(Boolean) : []
  const selectedCategoryIds = categoriesParam
    ? categoriesParam.split(",").filter(Boolean)
    : []
  const selectedSubcategoryIds = subcategoriesParam
    ? subcategoriesParam.split(",").filter(Boolean)
    : []
  const productsInStockOnly = stockParam === "1"
  const cardsInStockOnly = cardStockParam === "1"

  // ── 1. Найти WB marketplace ─────────────────────────────────────
  const wbMarketplace = await prisma.marketplace.findFirst({
    where: { slug: "wb" },
  })

  if (!wbMarketplace) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <p className="text-sm">
          WB marketplace не найден в справочнике. Проверьте настройки администратора.
        </p>
      </div>
    )
  }

  // Составляем product-level фильтры для Prisma
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productWhere: any = { deletedAt: null }
  if (selectedBrandIds.length > 0) {
    productWhere.brandId = { in: selectedBrandIds }
  }
  if (selectedCategoryIds.length > 0) {
    productWhere.categoryId = { in: selectedCategoryIds }
  }
  if (selectedSubcategoryIds.length > 0) {
    productWhere.subcategoryId = { in: selectedSubcategoryIds }
  }

  // ── 2. Параллельная загрузка данных ─────────────────────────────
  const [
    appSettings,
    promotions,
    linkedArticles,
    columnWidthsPref,
    allBrands,
    allCategories,
    allSubcategories,
  ] = await Promise.all([
    // 6 глобальных ставок
    prisma.appSetting.findMany({
      where: { key: { in: [...RATE_KEYS] } },
    }),
    // Активные акции (endDateTime >= now) + номенклатуры
    prisma.wbPromotion.findMany({
      where: { endDateTime: { gte: new Date() } },
      include: { nomenclatures: true },
    }),
    // Привязанные статьи WB с учётом фильтров бренд/категория/подкатегория
    prisma.marketplaceArticle.findMany({
      where: {
        marketplaceId: wbMarketplace.id,
        product: productWhere,
      },
      include: {
        product: {
          include: {
            cost: true,
            subcategory: true,
            category: true,
          },
        },
      },
    }),
    // Per-user сохранённые ширины столбцов таблицы (план 260410-mya)
    getUserPreference<Record<string, number>>("prices.wb.columnWidths"),
    // Справочники для фильтров
    prisma.brand.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.subcategory.findMany({ orderBy: { sortOrder: "asc" } }),
  ])

  // ── 3. Построить ratesMap из AppSetting (fallback → DEFAULT_RATES) ──
  const rates: Record<RateKey, number> = { ...DEFAULT_RATES }
  for (const setting of appSettings) {
    if ((RATE_KEYS as readonly string[]).includes(setting.key)) {
      const parsed = parseFloat(setting.value)
      if (!Number.isNaN(parsed)) {
        rates[setting.key as RateKey] = parsed
      }
    }
  }

  // ── 4. Собрать nmId → Product map ───────────────────────────────
  type LinkedProduct = (typeof linkedArticles)[number]["product"]
  const articleToProduct = new Map<number, LinkedProduct>()
  for (const a of linkedArticles) {
    const nmId = parseInt(a.article, 10)
    if (!Number.isNaN(nmId) && !articleToProduct.has(nmId)) {
      articleToProduct.set(nmId, a.product)
    }
  }
  const linkedNmIds = Array.from(articleToProduct.keys())

  // ── 5. Загрузить WbCards + CalculatedPrice ──────────────────────
  const wbCards =
    linkedNmIds.length > 0
      ? await prisma.wbCard.findMany({ where: { nmId: { in: linkedNmIds } } })
      : []

  const wbCardIds = wbCards.map((c) => c.id)
  const calculatedPrices =
    wbCardIds.length > 0
      ? await prisma.calculatedPrice.findMany({
          where: { wbCardId: { in: wbCardIds } },
        })
      : []

  // ── 6. Группировать WbCards по Product ──────────────────────────
  type CardRef = {
    card: (typeof wbCards)[number]
    product: LinkedProduct
  }
  const productToCards = new Map<string, CardRef[]>()
  for (const card of wbCards) {
    const product = articleToProduct.get(card.nmId)
    if (!product) continue
    // Фильтр «Карточки с остатком» — отсеиваем карточки с нулевым остатком
    if (cardsInStockOnly && (card.stockQty ?? 0) <= 0) continue
    if (!productToCards.has(product.id)) {
      productToCards.set(product.id, [])
    }
    productToCards.get(product.id)!.push({ card, product })
  }

  // ── 7. Построить ProductGroup[] ─────────────────────────────────
  const groups: ProductGroup[] = []

  for (const [, cardRefs] of productToCards) {
    const firstProduct = cardRefs[0].product
    const cardGroups: WbCardRowGroup[] = []

    for (const { card, product } of cardRefs) {
      // Resolved per-product параметры (fallback chain) — единожды на WbCard
      const resolvedDrr = resolveDrrPct({
        productOverride: product.drrOverridePct ?? null,
        subcategoryDefault: product.subcategory?.defaultDrrPct ?? null,
      })
      const resolvedDefect = resolveDefectRatePct({
        productOverride: product.defectRateOverridePct ?? null,
        categoryDefault: product.category?.defaultDefectRatePct ?? null,
      })
      const resolvedDelivery = resolveDeliveryCostRub(
        product.deliveryCostRub ?? null,
      )

      const costPrice = product.cost?.costPrice ?? 0
      const buyoutPct = card.buyoutPercent ?? 100
      const commFbwPct = card.commFbwIu ?? card.commFbwStd ?? 0
      const wbDiscountPct = card.discountWb ?? 0
      const clubDiscountPct = card.clubDiscount ?? 0

      // Базовые inputs для calculatePricing (перекрываются на каждой строке)
      const baseInputs: Omit<
        PricingInputs,
        "priceBeforeDiscount" | "sellerDiscountPct"
      > = {
        wbDiscountPct,
        clubDiscountPct,
        commFbwPct,
        costPrice,
        buyoutPct,
        drrPct: resolvedDrr,
        defectRatePct: resolvedDefect,
        deliveryCostRub: resolvedDelivery,
        walletPct: rates.wbWalletPct,
        acquiringPct: rates.wbAcquiringPct,
        jemPct: rates.wbJemPct,
        creditPct: rates.wbCreditPct,
        overheadPct: rates.wbOverheadPct,
        taxPct: rates.wbTaxPct,
      }

      // Общие «видимые» input-поля, которые попадают в каждую PriceRow
      // (таблица рендерит их как значения колонок — см. PriceRow interface).
      const baseRowFields = {
        wbDiscountPct,
        clubDiscountPct,
        walletPct: rates.wbWalletPct,
        commFbwPct,
        drrPct: resolvedDrr,
        costPrice,
        defectRatePct: resolvedDefect,
        deliveryCostRub: resolvedDelivery,
      }

      // Контекст для модалки (план 07-09): productId + scope ids для
      // server actions updateSubcategoryDefault / updateCategoryDefault.
      const rowContext = {
        productId: product.id,
        subcategoryId: product.subcategoryId ?? null,
        categoryId: product.categoryId ?? null,
      }

      const priceRows: PriceRow[] = []

      // a) Текущая цена — берётся напрямую из WbCard
      const currentPriceBeforeDiscount = card.priceBeforeDiscount ?? 0
      const currentSellerDiscountPct = card.sellerDiscount ?? 0
      const currentInputs: PricingInputs = {
        ...baseInputs,
        priceBeforeDiscount: currentPriceBeforeDiscount,
        sellerDiscountPct: currentSellerDiscountPct,
      }
      priceRows.push({
        id: `${card.id}-current`,
        type: "current",
        label: "Текущая",
        sellerPriceBeforeDiscount: currentPriceBeforeDiscount,
        sellerDiscountPct: currentSellerDiscountPct,
        ...baseRowFields,
        computed: calculatePricing(currentInputs),
        inputs: currentInputs,
        context: rowContext,
      })

      // b) Regular акции для этой nmId (DESC по planPrice)
      const regularRows: PriceRow[] = []
      for (const promo of promotions) {
        if (promo.type === "auto") continue
        const nom = promo.nomenclatures.find((n) => n.nmId === card.nmId)
        if (!nom || nom.planPrice == null) continue

        const planPrice = nom.planPrice
        const planDiscount = nom.planDiscount ?? 0
        const regularInputs: PricingInputs = {
          ...baseInputs,
          priceBeforeDiscount: planPrice,
          sellerDiscountPct: planDiscount,
        }

        regularRows.push({
          id: `${card.id}-regular-${promo.id}`,
          type: "regular",
          label: promo.name,
          sellerPriceBeforeDiscount: planPrice,
          sellerDiscountPct: planDiscount,
          ...baseRowFields,
          promotionDescription: promo.description,
          promotionAdvantages: promo.advantages,
          computed: calculatePricing(regularInputs),
          inputs: regularInputs,
          context: rowContext,
        })
      }
      regularRows.sort(
        (a, b) => b.sellerPriceBeforeDiscount - a.sellerPriceBeforeDiscount,
      )
      priceRows.push(...regularRows)

      // c) Auto акции (только те, у которых planPrice задан — из Excel)
      const autoRows: PriceRow[] = []
      for (const promo of promotions) {
        if (promo.type !== "auto") continue
        const nom = promo.nomenclatures.find((n) => n.nmId === card.nmId)
        if (!nom || nom.planPrice == null) continue

        const planPrice = nom.planPrice
        const planDiscount = nom.planDiscount ?? 0
        const autoInputs: PricingInputs = {
          ...baseInputs,
          priceBeforeDiscount: planPrice,
          sellerDiscountPct: planDiscount,
        }

        autoRows.push({
          id: `${card.id}-auto-${promo.id}`,
          type: "auto",
          label: promo.name,
          sellerPriceBeforeDiscount: planPrice,
          sellerDiscountPct: planDiscount,
          ...baseRowFields,
          promotionDescription: promo.description,
          promotionAdvantages: promo.advantages,
          computed: calculatePricing(autoInputs),
          inputs: autoInputs,
          context: rowContext,
        })
      }
      autoRows.sort(
        (a, b) => b.sellerPriceBeforeDiscount - a.sellerPriceBeforeDiscount,
      )
      priceRows.push(...autoRows)

      // d) Расчётные цены (slot 1, 2, 3) — по возрастанию slot
      const cardCalcs = calculatedPrices
        .filter((cp) => cp.wbCardId === card.id)
        .sort((a, b) => a.slot - b.slot)

      for (const cp of cardCalcs) {
        // Per-calc overrides (если заданы — иначе fallback chain)
        const cpDrr = cp.drrPct ?? resolvedDrr
        const cpDefect = cp.defectRatePct ?? resolvedDefect
        const cpDelivery = cp.deliveryCostRub ?? resolvedDelivery
        const calcInputs: PricingInputs = {
          ...baseInputs,
          drrPct: cpDrr,
          defectRatePct: cpDefect,
          deliveryCostRub: cpDelivery,
          priceBeforeDiscount: cp.sellerPrice,
          sellerDiscountPct: 0,
        }

        priceRows.push({
          id: `${card.id}-calc-${cp.slot}`,
          type: "calculated",
          label: cp.name,
          // Расчётная цена хранит уже Цену продавца — скидка продавца 0
          sellerPriceBeforeDiscount: cp.sellerPrice,
          sellerDiscountPct: 0,
          ...baseRowFields,
          drrPct: cpDrr,
          defectRatePct: cpDefect,
          deliveryCostRub: cpDelivery,
          calculatedSlot: cp.slot as 1 | 2 | 3,
          computed: calculatePricing(calcInputs),
          inputs: calcInputs,
          context: rowContext,
        })
      }

      cardGroups.push({
        card: {
          id: card.id,
          nmId: card.nmId,
          label: card.label ?? null,
          buyoutPct: card.buyoutPercent ?? null,
        },
        priceRows,
      })
    }

    // Агрегаты по Product (суммы по карточкам)
    const totalStock = cardRefs.reduce(
      (s, { card }) => s + (card.stockQty ?? 0),
      0,
    )
    const totalAvgSalesSpeed = cardRefs.reduce(
      (s, { card }) => s + (card.avgSalesSpeed7d ?? 0),
      0,
    )
    const totalRowsInProduct = cardGroups.reduce(
      (s, cg) => s + cg.priceRows.length,
      0,
    )

    groups.push({
      product: {
        id: firstProduct.id,
        name: firstProduct.name,
        photoUrl: firstProduct.photoUrl ?? null,
        totalStock,
        totalAvgSalesSpeed,
      },
      cards: cardGroups,
      totalRowsInProduct,
    })
  }

  // Фильтр «Товар с остатком» — после агрегации totalStock
  const filteredGroups = productsInStockOnly
    ? groups.filter((g) => g.product.totalStock > 0)
    : groups

  // Сортировка групп по названию Product (для детерминизма)
  filteredGroups.sort((a, b) =>
    a.product.name.localeCompare(b.product.name, "ru"),
  )

  return (
    <div className="space-y-4">
      <GlobalRatesBar initialRates={rates} />

      {/* Шапка: фильтры слева + кнопки синхронизации справа */}
      <div className="flex items-center gap-2 flex-wrap">
        <PricesFilters
          brands={allBrands.map((b) => ({ id: b.id, name: b.name }))}
          categories={allCategories.map((c) => ({ id: c.id, name: c.name }))}
          subcategories={allSubcategories.map((s) => ({ id: s.id, name: s.name }))}
          selectedBrandIds={selectedBrandIds}
          selectedCategoryIds={selectedCategoryIds}
          selectedSubcategoryIds={selectedSubcategoryIds}
          productsInStockOnly={productsInStockOnly}
          cardsInStockOnly={cardsInStockOnly}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <WbSyncButton />
          <WbSyncSppButton />
          <WbPromotionsSyncButton />
          <WbAutoPromoUploadButton
            autoPromotions={promotions
              .filter((p) => p.type === "auto")
              .map((p) => ({ id: p.id, name: p.name }))}
          />
        </div>
      </div>

      {/* Empty state для promotions — призыв синхронизировать акции */}
      {promotions.length === 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Акции не синхронизированы</AlertTitle>
          <AlertDescription>
            Нажмите «Синхронизировать акции», чтобы загрузить текущие и будущие
            акции WB на 60 дней вперёд.
          </AlertDescription>
        </Alert>
      )}

      <PriceCalculatorTableWrapper
        groups={filteredGroups}
        initialColumnWidths={columnWidthsPref ?? {}}
      />
    </div>
  )
}
