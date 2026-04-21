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

// Хардкод-фоллбэки (совпадают с HARDCODED_* в lib/pricing-math.ts)
const HARDCODED_DRR_PCT_FALLBACK = 10
const HARDCODED_DELIVERY_FALLBACK = 30

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
  "wbDefectRatePct",
] as const

type RateKey = (typeof RATE_KEYS)[number]

const DEFAULT_RATES: Record<RateKey, number> = {
  wbWalletPct: 2.0,
  wbAcquiringPct: 2.7,
  wbJemPct: 1.0,
  wbCreditPct: 7.0,
  wbOverheadPct: 6.0,
  wbTaxPct: 8.0,
  wbDefectRatePct: 2.0,
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
    /** "0" = скрыть акции в таблице (regular+auto). По умолчанию показываем. */
    promos?: string
    /** "0" = скрыть расчётные цены. По умолчанию показываем. */
    calc?: string
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
    promos: promosParam,
    calc: calcParam,
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
  // По умолчанию акции и расчётные цены показываем. Скрываем только при явном "0".
  const showPromos = promosParam !== "0"
  const showCalculated = calcParam !== "0"

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
    hiddenColumnsPref,
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
    // Per-user список скрытых колонок (фильтр «Вид»)
    getUserPreference<string[]>("prices.wb.hiddenColumns"),
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
      // ── Fallback chain для per-product параметров (D-01 + 2026-04-16) ──
      // Priority: Product.override → source (card / rates / subcategory) → default.
      // Для calc-строк накладывается ещё один слой (CalculatedPrice.*) ниже.
      const resolvedDrr = resolveDrrPct({
        productOverride: product.drrOverridePct ?? null,
        subcategoryDefault: product.subcategory?.defaultDrrPct ?? null,
      })
      const resolvedDefect = resolveDefectRatePct({
        productOverride: product.defectRateOverridePct ?? null,
        categoryDefault: product.category?.defaultDefectRatePct ?? null,
        globalDefault: rates.wbDefectRatePct,
      })
      const resolvedDelivery = resolveDeliveryCostRub(
        product.deliveryCostRub ?? null,
      )

      // Per-product override → card source → default для buyout / clubDiscount / commission
      const resolvedBuyout =
        product.buyoutOverridePct ?? card.buyoutPercent ?? 100
      const resolvedClubDiscount =
        product.clubDiscountOverridePct ?? card.clubDiscount ?? 0
      const resolvedCommission =
        product.commissionOverridePct ??
        card.commFbwIu ??
        card.commFbwStd ??
        0

      // Per-product override → rates (global AppSetting) для глобальных ставок
      const resolvedWallet = product.walletOverridePct ?? rates.wbWalletPct
      const resolvedAcquiring =
        product.acquiringOverridePct ?? rates.wbAcquiringPct
      const resolvedJem = product.jemOverridePct ?? rates.wbJemPct
      const resolvedCredit = product.creditOverridePct ?? rates.wbCreditPct
      const resolvedOverhead =
        product.overheadOverridePct ?? rates.wbOverheadPct
      const resolvedTax = product.taxOverridePct ?? rates.wbTaxPct

      const costPrice = product.cost?.costPrice ?? 0
      const wbDiscountPct = card.discountWb ?? 0

      // Базовые inputs для calculatePricing (перекрываются на каждой строке)
      const baseInputs: Omit<
        PricingInputs,
        "priceBeforeDiscount" | "sellerDiscountPct"
      > = {
        wbDiscountPct,
        clubDiscountPct: resolvedClubDiscount,
        commFbwPct: resolvedCommission,
        costPrice,
        buyoutPct: resolvedBuyout,
        drrPct: resolvedDrr,
        defectRatePct: resolvedDefect,
        deliveryCostRub: resolvedDelivery,
        walletPct: resolvedWallet,
        acquiringPct: resolvedAcquiring,
        jemPct: resolvedJem,
        creditPct: resolvedCredit,
        overheadPct: resolvedOverhead,
        taxPct: resolvedTax,
      }

      // Общие «видимые» input-поля, которые попадают в каждую PriceRow
      // (таблица рендерит их как значения колонок — см. PriceRow interface).
      const baseRowFields = {
        wbDiscountPct,
        clubDiscountPct: resolvedClubDiscount,
        walletPct: resolvedWallet,
        commFbwPct: resolvedCommission,
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

      // «Глобальные» значения каждого параметра — fallback-цепочка БЕЗ учёта
      // Product.XOverride и CalculatedPrice.X. Используются модалкой при «↻».
      const globalValues = {
        buyoutPct: card.buyoutPercent ?? 100,
        clubDiscountPct: card.clubDiscount ?? 0,
        walletPct: rates.wbWalletPct,
        acquiringPct: rates.wbAcquiringPct,
        commissionPct: card.commFbwIu ?? card.commFbwStd ?? 0,
        jemPct: rates.wbJemPct,
        drrPct:
          product.subcategory?.defaultDrrPct ?? HARDCODED_DRR_PCT_FALLBACK,
        defectRatePct:
          product.category?.defaultDefectRatePct ?? rates.wbDefectRatePct,
        creditPct: rates.wbCreditPct,
        overheadPct: rates.wbOverheadPct,
        taxPct: rates.wbTaxPct,
        deliveryCostRub: HARDCODED_DELIVERY_FALLBACK,
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
        globalValues,
      })

      // Хелпер: из финальной цены продавца и скидки % восстанавливаем
      // «Цену для установки» (priceBeforeDiscount).
      //   sellerPrice = priceBeforeDiscount × (1 − sellerDiscountPct/100)
      //   ⇒ priceBeforeDiscount = sellerPrice / (1 − sellerDiscountPct/100)
      // При sellerDiscountPct ≥ 100 деление на 0/отрицательное → возвращаем sellerPrice
      // как безопасный fallback (в реальности такое невозможно).
      const deriveBefore = (sellerPrice: number, sellerDiscountPct: number) => {
        if (sellerDiscountPct >= 100 || sellerDiscountPct < 0) return sellerPrice
        return sellerPrice / (1 - sellerDiscountPct / 100)
      }

      // b) Regular акции для этой nmId (DESC по финальной цене продавца).
      // Если фильтр «Без акций» активен — пропускаем оба блока (regular + auto).
      if (showPromos) {
      // planPrice из WB API = финальная цена продавца (после скидки продавца).
      // API часто не задаёт planDiscount — тогда берём текущую скидку с карточки
      // (акция не меняет структуру скидки, только минимальную цену).
      const regularRows: PriceRow[] = []
      for (const promo of promotions) {
        if (promo.type === "auto") continue
        const nom = promo.nomenclatures.find((n) => n.nmId === card.nmId)
        if (!nom || nom.planPrice == null) continue

        const finalSellerPrice = nom.planPrice
        const sellerDiscountPct =
          nom.planDiscount != null && nom.planDiscount > 0
            ? nom.planDiscount
            : currentSellerDiscountPct
        const priceBeforeDiscount = deriveBefore(finalSellerPrice, sellerDiscountPct)

        const regularInputs: PricingInputs = {
          ...baseInputs,
          priceBeforeDiscount,
          sellerDiscountPct,
        }

        regularRows.push({
          id: `${card.id}-regular-${promo.id}`,
          type: "regular",
          label: promo.displayName ?? promo.name,
          promotionId: promo.id,
          sellerPriceBeforeDiscount: priceBeforeDiscount,
          sellerDiscountPct,
          ...baseRowFields,
          promotionDescription: promo.description,
          promotionAdvantages: promo.advantages,
          promotionStartDateTime: promo.startDateTime.toISOString(),
          promotionEndDateTime: promo.endDateTime.toISOString(),
          computed: calculatePricing(regularInputs),
          inputs: regularInputs,
          context: rowContext,
          globalValues,
        })
      }
      // Сортировка по ФИНАЛЬНОЙ цене продавца (то что видит покупатель) DESC
      regularRows.sort(
        (a, b) => b.computed.sellerPrice - a.computed.sellerPrice,
      )
      priceRows.push(...regularRows)

      // c) Auto акции (только те, у которых planPrice задан — из Excel)
      // planPrice из Excel = финальная цена продавца, planDiscount = скидка продавца.
      // Если planDiscount отсутствует — fallback на текущую скидку.
      const autoRows: PriceRow[] = []
      for (const promo of promotions) {
        if (promo.type !== "auto") continue
        const nom = promo.nomenclatures.find((n) => n.nmId === card.nmId)
        if (!nom || nom.planPrice == null) continue

        const finalSellerPrice = nom.planPrice
        const sellerDiscountPct =
          nom.planDiscount != null && nom.planDiscount > 0
            ? nom.planDiscount
            : currentSellerDiscountPct
        const priceBeforeDiscount = deriveBefore(finalSellerPrice, sellerDiscountPct)

        const autoInputs: PricingInputs = {
          ...baseInputs,
          priceBeforeDiscount,
          sellerDiscountPct,
        }

        autoRows.push({
          id: `${card.id}-auto-${promo.id}`,
          type: "auto",
          label: promo.displayName ?? promo.name,
          promotionId: promo.id,
          sellerPriceBeforeDiscount: priceBeforeDiscount,
          sellerDiscountPct,
          ...baseRowFields,
          promotionDescription: promo.description,
          promotionAdvantages: promo.advantages,
          promotionStartDateTime: promo.startDateTime.toISOString(),
          promotionEndDateTime: promo.endDateTime.toISOString(),
          computed: calculatePricing(autoInputs),
          inputs: autoInputs,
          context: rowContext,
          globalValues,
        })
      }
      autoRows.sort(
        (a, b) => b.computed.sellerPrice - a.computed.sellerPrice,
      )
      priceRows.push(...autoRows)
      } // end if (showPromos)

      // d) Расчётные цены (slot 1, 2, 3) — по возрастанию slot.
      // Если фильтр «Без расчётных цен» активен — пропускаем блок.
      if (showCalculated) {
      // cp.sellerPrice = финальная цена продавца (хранится из модалки как
      // priceBeforeDiscount × (1 − sellerDiscountPct/100)).
      // cp.sellerDiscountPct — переопределение скидки (если задано в модалке),
      // иначе fallback на текущую скидку с карточки.
      const cardCalcs = calculatedPrices
        .filter((cp) => cp.wbCardId === card.id)
        .sort((a, b) => a.slot - b.slot)

      for (const cp of cardCalcs) {
        // Per-slot overrides (если заданы) → глобальные значения БЕЗ учёта
        // Product.XOverride. Это обеспечивает полную ИЗОЛЯЦИЮ расчётных слотов
        // от изменений на уровне товара: пользователь, меняющий параметр через
        // Текущую/Акционную строку, не должен случайно изменить и расчётные.
        // Если нужно применить новое значение к слоту — редактируй слот напрямую.
        const cpDrr = cp.drrPct ?? globalValues.drrPct
        const cpDefect = cp.defectRatePct ?? globalValues.defectRatePct
        const cpDelivery = cp.deliveryCostRub ?? globalValues.deliveryCostRub
        const cpBuyout = cp.buyoutPct ?? globalValues.buyoutPct
        const cpClubDiscount = cp.clubDiscountPct ?? globalValues.clubDiscountPct
        const cpCommission = cp.commissionPct ?? globalValues.commissionPct
        const cpWallet = cp.walletPct ?? globalValues.walletPct
        const cpAcquiring = cp.acquiringPct ?? globalValues.acquiringPct
        const cpJem = cp.jemPct ?? globalValues.jemPct
        const cpCredit = cp.creditPct ?? globalValues.creditPct
        const cpOverhead = cp.overheadPct ?? globalValues.overheadPct
        const cpTax = cp.taxPct ?? globalValues.taxPct
        const cpCostPrice = cp.costPrice ?? costPrice
        const cpSellerDiscountPct =
          cp.sellerDiscountPct ?? currentSellerDiscountPct
        const cpPriceBeforeDiscount = deriveBefore(
          cp.sellerPrice,
          cpSellerDiscountPct,
        )
        const calcInputs: PricingInputs = {
          wbDiscountPct,
          clubDiscountPct: cpClubDiscount,
          commFbwPct: cpCommission,
          costPrice: cpCostPrice,
          buyoutPct: cpBuyout,
          drrPct: cpDrr,
          defectRatePct: cpDefect,
          deliveryCostRub: cpDelivery,
          walletPct: cpWallet,
          acquiringPct: cpAcquiring,
          jemPct: cpJem,
          creditPct: cpCredit,
          overheadPct: cpOverhead,
          taxPct: cpTax,
          priceBeforeDiscount: cpPriceBeforeDiscount,
          sellerDiscountPct: cpSellerDiscountPct,
        }

        priceRows.push({
          id: `${card.id}-calc-${cp.slot}`,
          type: "calculated",
          label: cp.name,
          sellerPriceBeforeDiscount: cpPriceBeforeDiscount,
          sellerDiscountPct: cpSellerDiscountPct,
          // Row fields — per-slot resolved values
          wbDiscountPct,
          clubDiscountPct: cpClubDiscount,
          walletPct: cpWallet,
          commFbwPct: cpCommission,
          drrPct: cpDrr,
          costPrice: cpCostPrice,
          defectRatePct: cpDefect,
          deliveryCostRub: cpDelivery,
          calculatedSlot: cp.slot as 1 | 2 | 3,
          calculatedPriceId: cp.id,
          computed: calculatePricing(calcInputs),
          inputs: calcInputs,
          context: rowContext,
          globalValues,
        })
      }
      } // end if (showCalculated)

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
    const totalOrdersYesterday = cardRefs.reduce(
      (s, { card }) => s + (card.ordersYesterday ?? 0),
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
        totalOrdersYesterday,
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
    // h-full + flex-col: шапка (ставки/фильтры/алерт) неподвижна,
    // таблица снизу получает весь остаток высоты и имеет свой внутренний scroll.
    <div className="flex flex-col h-full gap-4">
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
          showPromos={showPromos}
          showCalculated={showCalculated}
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

      {/* flex-1 + min-h-0: таблица занимает оставшееся место и сама скроллится */}
      <div className="flex-1 min-h-0">
        <PriceCalculatorTableWrapper
          groups={filteredGroups}
          initialColumnWidths={columnWidthsPref ?? {}}
          initialHiddenColumns={hiddenColumnsPref ?? []}
        />
      </div>
    </div>
  )
}
