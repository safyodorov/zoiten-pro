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
import { compareProductsByHierarchy } from "@/lib/product-order"
import {
  calculatePricing,
  calculatePricingStandard,
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
import { getMskTodayDate, fillTimeSeries, type DayPoint } from "@/lib/wb-orders-chart"
import { mergeOrdersAndFunnel } from "@/lib/wb-funnel-merge"
import { loadLegendMetrics } from "@/lib/wb-legend-metrics"
import { WbSyncButton } from "@/components/cards/WbSyncButton"
import { WbSyncSppButton } from "@/components/cards/WbSyncSppButton"
import { WbPromotionsSyncButton } from "@/components/prices/WbPromotionsSyncButton"
import { WbAutoPromoUploadButton } from "@/components/prices/WbAutoPromoUploadButton"
import { WbBoxTariffsSyncButton } from "@/components/prices/WbBoxTariffsSyncButton"
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
  // Фаза B (2026-07-07): второй фин-рез «на стандартных условиях».
  "wbReturnLogisticsRub",
  "wbLocalizationIndex",
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
  wbReturnLogisticsRub: 50.0,
  wbLocalizationIndex: 1.0,
}

// ──────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────

interface PricesWbPageProps {
  searchParams: Promise<{
    directions?: string
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
    directions: directionsParam,
    brands: brandsParam,
    categories: categoriesParam,
    subcategories: subcategoriesParam,
    stock: stockParam,
    cardStock: cardStockParam,
    promos: promosParam,
    calc: calcParam,
  } = await searchParams

  const selectedDirectionIds = directionsParam
    ? directionsParam.split(",").filter(Boolean)
    : []
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
  // Направление живёт на Brand → фильтр через nested brand.directionId
  if (selectedDirectionIds.length > 0) {
    productWhere.brand = { directionId: { in: selectedDirectionIds } }
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
    allDirections,
  ] = await Promise.all([
    // Глобальные ставки + Фаза B: эффективные box-тарифы складов (JSON, флэт).
    prisma.appSetting.findMany({
      where: { key: { in: [...RATE_KEYS, "wbBoxTariffEffective"] } },
    }),
    // Активные акции (endDateTime >= now) + номенклатуры
    prisma.wbPromotion.findMany({
      where: { endDateTime: { gte: new Date() } },
      include: { nomenclatures: true },
    }),
    // Привязанные статьи WB с учётом фильтров бренд/категория/подкатегория.
    // orderBy: sortOrder — чтобы порядок карточек в /prices/wb совпадал
    // с drag-and-drop-ом из /products/[id]/edit (первый = основной).
    // Дополнительно подтягиваем sortOrder + direction для in-memory sort групп ниже.
    prisma.marketplaceArticle.findMany({
      where: {
        marketplaceId: wbMarketplace.id,
        product: productWhere,
      },
      orderBy: { sortOrder: "asc" },
      include: {
        product: {
          include: {
            cost: true,
            // sortOrder поля нужны для compareProductsByHierarchy;
            // defaultDrrPct/defaultDefectRatePct используются в pricing-math
            subcategory: {
              select: { id: true, name: true, sortOrder: true, defaultDrrPct: true },
            },
            category: {
              select: { id: true, name: true, sortOrder: true, defaultDefectRatePct: true },
            },
            brand: {
              select: {
                id: true,
                name: true,
                sortOrder: true,
                direction: { select: { id: true, name: true, sortOrder: true } },
              },
            },
          },
        },
      },
    }),
    // Per-user сохранённые ширины столбцов таблицы (план 260410-mya)
    getUserPreference<Record<string, number>>("prices.wb.columnWidths"),
    // Per-user список скрытых колонок (фильтр «Вид»)
    getUserPreference<string[]>("prices.wb.hiddenColumns"),
    // Справочники для фильтров (cascade: каждый dependent с FK на родителя)
    prisma.brand.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, directionId: true },
    }),
    prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, brandId: true },
    }),
    prisma.subcategory.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, categoryId: true },
    }),
    prisma.productDirection.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
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

  // ── 3.1 Фаза B (2026-07-07): эффективные box-тарифы складов ─────
  // Флэт (срез по стоку отложен, спека §5) — одна запись на все товары.
  // Фоллбэк-дефолты используются, пока «Тарифы складов» ни разу не нажималась.
  const BOX_TARIFF_FALLBACK = {
    delivBase: 46,
    delivLiter: 14,
    delivCoefPct: 100,
    storageBasePerLiter: 0.07,
    storageCoefPct: 100,
  }
  let boxTariff = { ...BOX_TARIFF_FALLBACK }
  const boxTariffSetting = appSettings.find((s) => s.key === "wbBoxTariffEffective")
  if (boxTariffSetting) {
    try {
      const parsed = JSON.parse(boxTariffSetting.value)
      boxTariff = {
        delivBase: parsed.delivBase ?? BOX_TARIFF_FALLBACK.delivBase,
        delivLiter: parsed.delivLiter ?? BOX_TARIFF_FALLBACK.delivLiter,
        delivCoefPct: parsed.delivCoefPct ?? BOX_TARIFF_FALLBACK.delivCoefPct,
        storageBasePerLiter:
          parsed.storageBasePerLiter ?? BOX_TARIFF_FALLBACK.storageBasePerLiter,
        storageCoefPct: parsed.storageCoefPct ?? BOX_TARIFF_FALLBACK.storageCoefPct,
      }
    } catch {
      // Некорректный JSON → используем фоллбэк-дефолты
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
  // 2026-05-15 (quick 260515-kes): не показываем soft-deleted карточки.
  const wbCards =
    linkedNmIds.length > 0
      ? await prisma.wbCard.findMany({
          where: { nmId: { in: linkedNmIds }, deletedAt: null },
        })
      : []

  const wbCardIds = wbCards.map((c) => c.id)
  const calculatedPrices =
    wbCardIds.length > 0
      ? await prisma.calculatedPrice.findMany({
          where: { wbCardId: { in: wbCardIds } },
        })
      : []

  // ── 6. Группировать WbCards по Product ──────────────────────────
  // Итерируем по linkedArticles (уже отсортирован по sortOrder),
  // а не по wbCards — чтобы порядок карточек в группе соответствовал
  // порядку артикулов из /products/[id]/edit.
  type CardRef = {
    card: (typeof wbCards)[number]
    product: LinkedProduct
  }
  const cardByNmId = new Map<number, (typeof wbCards)[number]>()
  for (const c of wbCards) cardByNmId.set(c.nmId, c)

  const productToCards = new Map<string, CardRef[]>()
  for (const a of linkedArticles) {
    const nmId = parseInt(a.article, 10)
    if (Number.isNaN(nmId)) continue
    const card = cardByNmId.get(nmId)
    if (!card) continue
    // Фильтр «Карточки с остатком» — отсеиваем карточки с нулевым остатком
    if (cardsInStockOnly && (card.stockQty ?? 0) <= 0) continue
    if (!productToCards.has(a.product.id)) {
      productToCards.set(a.product.id, [])
    }
    productToCards.get(a.product.id)!.push({ card, product: a.product })
  }

  // ── 6.5. Загрузить orders history per nmId (для expand-панели графиков) ──
  // Окно [today-28, today-1] MSK — совпадает с /cards/wb chart.
  // Используется только для рендера графиков в раскрываемой панели Сводки.
  const todayMsk = getMskTodayDate()
  const windowStart = new Date(todayMsk.getTime() - 28 * 24 * 3600_000)
  const windowEnd = new Date(todayMsk.getTime() - 1 * 24 * 3600_000)

  // Visible nmId — те, что прошли фильтр cardsInStockOnly выше (т.е. остались
  // в productToCards). Если фильтр отключён — это все nmId.
  const visibleNmIds = Array.from(productToCards.values())
    .flat()
    .map(({ card }) => card.nmId)

  // Quick 260519-funnel: orders data merged из 2 источников —
  // WbCardOrdersDaily (Statistics, для цен) + WbCardFunnelDaily (Analytics,
  // cabinet-matched ordersCount). funnel.ordersCount > orders.qty в приоритете.
  const [ordersRows, funnelRows] =
    visibleNmIds.length > 0
      ? await Promise.all([
          prisma.wbCardOrdersDaily.findMany({
            where: {
              nmId: { in: visibleNmIds },
              date: { gte: windowStart, lte: windowEnd },
            },
            select: {
              nmId: true,
              date: true,
              qty: true,
              sellerPrice: true,
              buyerPrice: true,
              discountWb: true,
            },
          }),
          prisma.wbCardFunnelDaily.findMany({
            where: {
              nmId: { in: visibleNmIds },
              date: { gte: windowStart, lte: windowEnd },
            },
            select: { nmId: true, date: true, ordersCount: true },
          }),
        ])
      : [[], []]

  const ordersByNmId = mergeOrdersAndFunnel(ordersRows, funnelRows)

  // ── 6.5.1. Метрики легенды per-nmId (% выкупа + ДРР nmId/subcat/cat) ──
  // Окно: вчера (single day) и 7 полных прошедших дней. Scope под/категорий —
  // всех linkedNmIds в текущем filter-state (визуально согласовано с фильтрами).
  const nmIdToSubcategoryId = new Map<number, string | null>()
  const nmIdToCategoryId = new Map<number, string | null>()
  for (const a of linkedArticles) {
    const nmId = parseInt(a.article, 10)
    if (Number.isNaN(nmId)) continue
    if (!nmIdToSubcategoryId.has(nmId)) {
      nmIdToSubcategoryId.set(nmId, a.product.subcategoryId ?? null)
    }
    if (!nmIdToCategoryId.has(nmId)) {
      nmIdToCategoryId.set(nmId, a.product.categoryId ?? null)
    }
  }
  const legendMetrics = await loadLegendMetrics(
    linkedNmIds,
    nmIdToSubcategoryId,
    nmIdToCategoryId,
    todayMsk,
  )

  // ── 6.6. Загрузить последние отзывы per nmId (для ленты в expand-панели) ──
  // quick 260518-gg3: SupportTicket channel=FEEDBACK, rating IS NOT NULL,
  // top-10 desc per nmId. Текст отзыва — из первого INBOUND SupportMessage;
  // fallback на previewText.
  // quick 260518-h6p: расширение — две ленты per nmId-блок:
  //   byImt  = top-10 desc по ВСЕМ nmId той же склейки (imtId)
  //   byNmId = top-10 desc по конкретному nmId
  type FeedbackItem = {
    id: string
    rating: number
    text: string
    createdAt: string // ISO string для RSC→client serialization
  }

  // quick 260518-h6p: индексы для группировки отзывов по imtId.
  // imtIdsByNmId: для каждого visible nmId → его imtId (или null).
  // nmIdsByImtId: для каждой imtId → ВСЕ nmId этой склейки (включая невидимые!).
  //   Нам нужны feedbacks с любого nmId склейки — даже если конкретный вариант
  //   отфильтрован (cardsInStockOnly), его отзывы должны попасть в byImt.
  const imtIdsByNmId = new Map<number, number | null>()
  for (const c of wbCards) {
    if (visibleNmIds.includes(c.nmId)) imtIdsByNmId.set(c.nmId, c.imtId ?? null)
  }
  const relevantImtIds = Array.from(
    new Set(Array.from(imtIdsByNmId.values()).filter((v): v is number => v != null)),
  )

  // Подтянуть ВСЕ WbCard с этими imtId (нам нужны их nmId для расширения запроса
  // SupportTicket). Используем lightweight select, soft-deleted тоже включаем —
  // удалённая карточка может содержать релевантные исторические отзывы.
  const cardsInImts = relevantImtIds.length > 0
    ? await prisma.wbCard.findMany({
        where: { imtId: { in: relevantImtIds } },
        select: { nmId: true, imtId: true },
      })
    : []

  const nmIdsByImtId = new Map<number, number[]>()
  for (const c of cardsInImts) {
    if (c.imtId == null) continue
    const arr = nmIdsByImtId.get(c.imtId) ?? []
    arr.push(c.nmId)
    nmIdsByImtId.set(c.imtId, arr)
  }

  // allRelatedNmIds = union(visibleNmIds, всех nmId всех relevant imtId)
  const allRelatedNmIds = Array.from(
    new Set([
      ...visibleNmIds,
      ...cardsInImts.map((c) => c.nmId),
    ]),
  )

  const reviewsRaw =
    visibleNmIds.length > 0
      ? await prisma.supportTicket.findMany({
          where: {
            channel: "FEEDBACK",
            nmId: { in: allRelatedNmIds },
            rating: { not: null },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            nmId: true,
            rating: true,
            previewText: true,
            createdAt: true,
            messages: {
              where: { direction: "INBOUND" },
              orderBy: { sentAt: "asc" },
              take: 1,
              select: { text: true },
            },
          },
        })
      : []

  // Группируем feedbacks один раз по nmId.
  const allByNmId = new Map<number, FeedbackItem[]>()
  for (const t of reviewsRaw) {
    if (t.nmId == null || t.rating == null) continue
    const arr = allByNmId.get(t.nmId) ?? []
    const text = t.messages[0]?.text ?? t.previewText ?? ""
    arr.push({
      id: t.id,
      rating: t.rating,
      text,
      createdAt: t.createdAt.toISOString(),
    })
    allByNmId.set(t.nmId, arr)
  }

  // Per visibleNmId формируем два feed:
  //  - byNmId: top-10 desc только по этому nmId
  //  - byImt: top-10 desc по ВСЕМ nmId той же склейки (если imtId есть)
  // reviewsRaw уже отсортирован orderBy createdAt desc → slice(0,10) даст top-10.
  const reviewsByNmId: Record<
    number,
    { byImt: FeedbackItem[]; byNmId: FeedbackItem[] }
  > = {}
  for (const nmId of visibleNmIds) {
    const imtId = imtIdsByNmId.get(nmId) ?? null
    const byNmIdArr = (allByNmId.get(nmId) ?? []).slice(0, 10)
    let byImtArr: FeedbackItem[] = []
    if (imtId != null) {
      const siblingNmIds = nmIdsByImtId.get(imtId) ?? []
      // Собираем feedbacks всех nmId склейки, сортировка по createdAt desc.
      const merged: FeedbackItem[] = []
      for (const s of siblingNmIds) {
        const arr = allByNmId.get(s)
        if (arr) merged.push(...arr)
      }
      merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      byImtArr = merged.slice(0, 10)
    }
    reviewsByNmId[nmId] = { byImt: byImtArr, byNmId: byNmIdArr }
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

      // ── Фаза B (2026-07-07): std-параметры для второго фин-реза ─────
      // commStdPct: per-product override (общий commissionOverridePct, тот же
      // что и в ИУ-блоке) → card.commFbwStd (стандартная комиссия из Tariffs API).
      const commStdPct = product.commissionOverridePct ?? card.commFbwStd ?? 0
      // Литраж из габаритов Product (0, если габариты не заполнены).
      const volumeLiters =
        ((product.heightCm ?? 0) * (product.widthCm ?? 0) * (product.depthCm ?? 0)) /
        1000
      // avgSalesSpeed7d в WbCard уже per-day (см. totalAvgSalesSpeed выше в этом
      // файле — используется напрямую БЕЗ доп. деления на 7, «шт./д.»).
      const salesPerDay = card.avgSalesSpeed7d ?? 0
      const daysInStock =
        salesPerDay > 0 && (card.stockQty ?? 0) > 0
          ? (card.stockQty as number) / salesPerDay
          : 60
      const stdParams = {
        commStdPct,
        volumeLiters,
        delivBase: boxTariff.delivBase,
        delivLiter: boxTariff.delivLiter,
        delivCoefPct: boxTariff.delivCoefPct,
        storageBasePerLiter: boxTariff.storageBasePerLiter,
        storageCoefPct: boxTariff.storageCoefPct,
        localizationIndex: rates.wbLocalizationIndex,
        returnLogisticsRub: rates.wbReturnLogisticsRub,
        daysInStock,
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
        computedStd: calculatePricingStandard({ ...currentInputs, ...stdParams }),
        inputs: currentInputs,
        context: rowContext,
        globalValues,
        stdContext: stdParams,
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

      // a2) Плановая цена — по умолчанию = Текущей; override из WbCard.plannedSellerPrice (ФИНАЛЬНАЯ цена).
      const plannedSellerDiscountPct = card.plannedSellerDiscountPct ?? currentSellerDiscountPct
      const plannedPriceBeforeDiscount =
        card.plannedSellerPrice != null
          ? deriveBefore(card.plannedSellerPrice, plannedSellerDiscountPct)
          : currentPriceBeforeDiscount
      const plannedInputs: PricingInputs = {
        ...baseInputs,
        priceBeforeDiscount: plannedPriceBeforeDiscount,
        sellerDiscountPct: plannedSellerDiscountPct,
      }
      priceRows.push({
        id: `${card.id}-planned`,
        type: "planned",
        label: "Плановая",
        sellerPriceBeforeDiscount: plannedPriceBeforeDiscount,
        sellerDiscountPct: plannedSellerDiscountPct,
        ...baseRowFields,
        computed: calculatePricing(plannedInputs),
        computedStd: calculatePricingStandard({ ...plannedInputs, ...stdParams }),
        inputs: plannedInputs,
        context: rowContext,
        globalValues,
        stdContext: stdParams,
      })

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
          computedStd: calculatePricingStandard({ ...regularInputs, ...stdParams }),
          inputs: regularInputs,
          context: rowContext,
          globalValues,
          stdContext: stdParams,
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
          computedStd: calculatePricingStandard({ ...autoInputs, ...stdParams }),
          inputs: autoInputs,
          context: rowContext,
          globalValues,
          stdContext: stdParams,
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
          computedStd: calculatePricingStandard({ ...calcInputs, ...stdParams }),
          inputs: calcInputs,
          context: rowContext,
          globalValues,
          stdContext: stdParams,
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
    const totalInWayToClient = cardRefs.reduce(
      (s, { card }) => s + (card.inWayToClient ?? 0),
      0,
    )
    const totalInWayFromClient = cardRefs.reduce(
      (s, { card }) => s + (card.inWayFromClient ?? 0),
      0,
    )
    // Quick 260519-funnel: totalAvgSalesSpeed / totalOrdersYesterday теперь
    // считаются из merged orders (Funnel приоритет, fallback на Statistics qty),
    // а не из WbCard.avgSalesSpeed7d/ordersYesterday (которые пишутся в /api/wb-sync
    // из Statistics). Цифры теперь cabinet-matched.
    // sevenDaysBackStart / yesterdayStart — границы окна для агрегации.
    const yesterdayMsk = new Date(todayMsk.getTime() - 1 * 24 * 3600_000)
    const sevenDaysBackStart = new Date(todayMsk.getTime() - 7 * 24 * 3600_000)
    const yesterdayKey = yesterdayMsk.toISOString().slice(0, 10)
    const totalAvgSalesSpeed = cardRefs.reduce((s, { card }) => {
      const rows = ordersByNmId.get(card.nmId) ?? []
      const sum7d = rows
        .filter(r => r.date >= sevenDaysBackStart && r.date <= yesterdayMsk)
        .reduce((acc, r) => acc + r.qty, 0)
      // Если merged пусто — fallback на legacy WbCard.avgSalesSpeed7d
      if (rows.length === 0) return s + (card.avgSalesSpeed7d ?? 0)
      return s + sum7d / 7
    }, 0)
    const totalOrdersYesterday = cardRefs.reduce((s, { card }) => {
      const rows = ordersByNmId.get(card.nmId) ?? []
      const yest = rows.find(r => r.date.toISOString().slice(0, 10) === yesterdayKey)
      if (!yest && rows.length === 0) return s + (card.ordersYesterday ?? 0)
      return s + (yest?.qty ?? 0)
    }, 0)
    const totalRowsInProduct = cardGroups.reduce(
      (s, cg) => s + cg.priceRows.length,
      0,
    )

    // Per-product: список nmId+timeSeries, прошедших фильтр
    // (stock>0 OR sales>0 за 28д). Используется в expand-панели Сводки.
    // quick 260518-gg3: расширено per-nmId метаданными для legend + лента отзывов.
    const productNmIdsWithCharts: Array<{
      nmId: number
      timeSeries: DayPoint[]
      stockQty: number | null
      inWayToClient: number | null
      inWayFromClient: number | null
      avgSalesSpeed7d: number | null
      rating: number | null
      reviewsTotal: number | null
      reviews: { byImt: FeedbackItem[]; byNmId: FeedbackItem[] }
      buyoutPct: number | null
      drrNmIdYesterday: number | null
      drrNmId7d: number | null
      drrSubcategoryYesterday: number | null
      drrSubcategory7d: number | null
      subcategoryName: string | null
      drrCategoryYesterday: number | null
      drrCategory7d: number | null
      categoryName: string | null
    }> = []
    for (const { card, product } of cardRefs) {
      const rawRows = ordersByNmId.get(card.nmId) ?? []
      const hasStock = (card.stockQty ?? 0) > 0
      const hasSales = rawRows.some((r) => r.qty > 0)
      if (!hasStock && !hasSales) continue
      const nmMetrics = legendMetrics.perNmId.get(card.nmId)
      const subMetrics = product.subcategoryId
        ? legendMetrics.perSubcategoryId.get(product.subcategoryId)
        : undefined
      const catMetrics = product.categoryId
        ? legendMetrics.perCategoryId.get(product.categoryId)
        : undefined
      productNmIdsWithCharts.push({
        nmId: card.nmId,
        timeSeries: fillTimeSeries(rawRows),
        stockQty: card.stockQty ?? null,
        inWayToClient: card.inWayToClient ?? null,
        inWayFromClient: card.inWayFromClient ?? null,
        avgSalesSpeed7d: card.avgSalesSpeed7d ?? null,
        rating: card.wbStoreRating ?? card.ratingImt ?? card.rating ?? null,
        reviewsTotal:
          card.wbStoreFeedbacks ?? card.reviewsTotalImt ?? card.reviewsTotal ?? null,
        reviews: reviewsByNmId[card.nmId] ?? { byImt: [], byNmId: [] },
        buyoutPct: nmMetrics?.buyoutPct ?? null,
        drrNmIdYesterday: nmMetrics?.drrYesterday ?? null,
        drrNmId7d: nmMetrics?.drr7d ?? null,
        drrSubcategoryYesterday: subMetrics?.drrYesterday ?? null,
        drrSubcategory7d: subMetrics?.drr7d ?? null,
        subcategoryName: product.subcategory?.name ?? null,
        drrCategoryYesterday: catMetrics?.drrYesterday ?? null,
        drrCategory7d: catMetrics?.drr7d ?? null,
        categoryName: product.category?.name ?? null,
      })
    }

    groups.push({
      product: {
        id: firstProduct.id,
        name: firstProduct.name,
        photoUrl: firstProduct.photoUrl ?? null,
        // quick 260513-phu: brand-line под product name в Сводной
        brandName: firstProduct.brand?.name ?? null,
        totalStock,
        totalInWayToClient,
        totalInWayFromClient,
        totalAvgSalesSpeed,
        totalOrdersYesterday,
      },
      cards: cardGroups,
      totalRowsInProduct,
      ordersCharts: productNmIdsWithCharts,
    })
  }

  // Фильтр «Товар с остатком» — после агрегации totalStock
  const filteredGroups = productsInStockOnly
    ? groups.filter((g) => g.product.totalStock > 0)
    : groups

  // Глобальная иерархическая сортировка: Направление → Бренд → Категория → Подкатегория → name
  // groups[].product содержит только агрегированные поля — для иерархии берём
  // оригинальный LinkedProduct через productByProductId Map.
  const productByProductId = new Map<string, LinkedProduct>()
  for (const a of linkedArticles) {
    if (!productByProductId.has(a.product.id)) {
      productByProductId.set(a.product.id, a.product)
    }
  }
  filteredGroups.sort((a, b) => {
    const pa = productByProductId.get(a.product.id)
    const pb = productByProductId.get(b.product.id)
    if (!pa || !pb) return 0
    return compareProductsByHierarchy(pa, pb)
  })

  return (
    // h-full + flex-col: шапка (ставки/фильтры/алерт) неподвижна,
    // таблица снизу получает весь остаток высоты и имеет свой внутренний scroll.
    <div className="flex flex-col h-full gap-4">
      <GlobalRatesBar initialRates={rates} />

      {/* Шапка: фильтры слева + кнопки синхронизации справа */}
      <div className="flex items-center gap-2 flex-wrap">
        <PricesFilters
          directions={allDirections}
          brands={allBrands}
          categories={allCategories}
          subcategories={allSubcategories}
          selectedDirectionIds={selectedDirectionIds}
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
          <WbBoxTariffsSyncButton />
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
