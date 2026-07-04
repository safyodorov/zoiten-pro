// scripts/bootstrap-sales-plan-monthly.ts
//
// Phase 25 Plan 03: однократный bootstrap-скрипт — перенос старых пользовательских
// настроек плана продаж в новую модель данных v2.
//
// Что переносится:
//   1. baselineOverrides (AppSetting "salesPlan.baselineOverrides") →
//      SalesPlanMonthLevel.targetOrdersPerDay с учётом семантики plannedSalesPerDay (§2.7):
//      - для месяцев ДО expectedDate → baselineOverride (или null если нет)
//      - для месяцев ОТ expectedDate → plannedSalesPerDay ?? baselineOverride ?? null
//      - товар без ProductIncoming → baselineOverride ?? null на все месяцы
//   2. priceOverrides (AppSetting "salesPlan.priceOverrides") →
//      SalesPlanMonthLevel.priceRub на все месяцы горизонта
//   3. leadTimes (AppSetting "salesPlan.leadTimes") →
//      AppSetting "salesPlan.leadTimes2" (только если пользователь изменил значение с 3/3)
//
// Идемпотентность: deleteMany(horizonMonths) + createMany внутри транзакции.
// Горизонт: 2026-07-01 … 2026-12-01 (6 первых чисел месяцев H2-2026).
//
// НЕ удаляет старые ключи (зачистка — этап 6).
//
// Запуск:
//   npx tsx scripts/bootstrap-sales-plan-monthly.ts
//   На VPS: set -a; . /etc/zoiten.pro.env; set +a; npx tsx scripts/bootstrap-sales-plan-monthly.ts

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// H2-2026: первые числа каждого месяца
const HORIZON_MONTHS = [
  "2026-07-01",
  "2026-08-01",
  "2026-09-01",
  "2026-10-01",
  "2026-11-01",
  "2026-12-01",
]

// Дефолтные lead times — только если НЕ менялись, перенос не нужен
const DEFAULT_DELIVERY_DAYS = 3
const DEFAULT_RETURN_DAYS = 3

async function main() {
  console.log("=== bootstrap-sales-plan-monthly: запуск ===")
  console.log(`Горизонт: ${HORIZON_MONTHS[0]} … ${HORIZON_MONTHS[HORIZON_MONTHS.length - 1]}`)

  // ── 1. Читаем AppSetting-ключи ────────────────────────────────────────────
  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          "salesPlan.baselineOverrides",
          "salesPlan.priceOverrides",
          "salesPlan.leadTimes",
        ],
      },
    },
  })
  const settingMap = new Map(settings.map((s) => [s.key, s.value]))

  const baselineOverrides: Record<string, number> = parseJsonSetting(
    settingMap.get("salesPlan.baselineOverrides"),
    {},
  )
  const priceOverrides: Record<string, number> = parseJsonSetting(
    settingMap.get("salesPlan.priceOverrides"),
    {},
  )
  const leadTimes: { deliveryDays: number; returnDays: number } = parseJsonSetting(
    settingMap.get("salesPlan.leadTimes"),
    { deliveryDays: DEFAULT_DELIVERY_DAYS, returnDays: DEFAULT_RETURN_DAYS },
  )

  console.log(
    `Прочитано: baselineOverrides=${Object.keys(baselineOverrides).length} товаров, ` +
      `priceOverrides=${Object.keys(priceOverrides).length} товаров, ` +
      `leadTimes=${JSON.stringify(leadTimes)}`,
  )

  // ── 2. Читаем ProductIncoming для товаров с baselineOverrides/priceOverrides ─
  const productIds = [
    ...new Set([...Object.keys(baselineOverrides), ...Object.keys(priceOverrides)]),
  ]

  const incomingByProductId = new Map<
    string,
    { expectedDate: Date | null; plannedSalesPerDay: number | null }
  >()

  if (productIds.length > 0) {
    const incomingList = await prisma.productIncoming.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, expectedDate: true, plannedSalesPerDay: true },
    })
    for (const inc of incomingList) {
      incomingByProductId.set(inc.productId, {
        expectedDate: inc.expectedDate,
        plannedSalesPerDay: inc.plannedSalesPerDay,
      })
    }
  }

  // ── 3. Строим строки SalesPlanMonthLevel ─────────────────────────────────
  type MonthLevelRow = {
    productId: string
    month: Date
    targetOrdersPerDay: number | null
    priceRub: number | null
  }

  const rows: MonthLevelRow[] = []

  for (const productId of productIds) {
    const baselineVal = baselineOverrides[productId] ?? null
    const priceVal = priceOverrides[productId] ?? null
    const incoming = incomingByProductId.get(productId) ?? null

    // Определяем месяц прихода (первое число месяца expectedDate)
    let expectedMonthIso: string | null = null
    if (incoming?.expectedDate != null) {
      const d = incoming.expectedDate
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, "0")
      expectedMonthIso = `${y}-${m}-01`
    }

    for (const monthIso of HORIZON_MONTHS) {
      // Определяем targetOrdersPerDay по семантике §2.7
      let targetOrdersPerDay: number | null = null

      if (expectedMonthIso == null) {
        // Нет даты прихода → baselineOverride на все месяцы
        targetOrdersPerDay = baselineVal
      } else if (monthIso < expectedMonthIso) {
        // Месяц до прихода → baselineOverride (или null = baseline из funnel)
        targetOrdersPerDay = baselineVal
      } else {
        // Месяц от expectedDate и позже → plannedSalesPerDay ?? baselineOverride ?? null
        // Семантика: «target ПОСЛЕ прихода» убирает завышение плана до прихода
        targetOrdersPerDay =
          incoming?.plannedSalesPerDay != null
            ? incoming.plannedSalesPerDay
            : baselineVal
      }

      // Пропускаем строку если оба поля null — нет смысла создавать пустую запись
      if (targetOrdersPerDay === null && priceVal === null) continue

      rows.push({
        productId,
        month: new Date(monthIso + "T00:00:00Z"),
        targetOrdersPerDay,
        priceRub: priceVal,
      })
    }
  }

  console.log(`Подготовлено ${rows.length} строк SalesPlanMonthLevel для upsert`)

  // ── 4. Идемпотентная транзакция: deleteMany + createMany ──────────────────
  if (rows.length > 0) {
    const horizonDates = HORIZON_MONTHS.map((iso) => new Date(iso + "T00:00:00Z"))

    await prisma.$transaction(async (tx) => {
      // Удаляем только строки затронутых товаров на горизонте (не всех!)
      await tx.salesPlanMonthLevel.deleteMany({
        where: {
          productId: { in: productIds },
          month: { in: horizonDates },
        },
      })
      await tx.salesPlanMonthLevel.createMany({
        data: rows,
        skipDuplicates: true,
      })
    })

    console.log(`Записано ${rows.length} строк SalesPlanMonthLevel`)
  } else {
    console.log("Нет данных для записи в SalesPlanMonthLevel (baselineOverrides пусты)")
  }

  // ── 5. Перенос leadTimes → leadTimes2 (если пользователь менял с 3/3) ────
  const deliveryDays = leadTimes.deliveryDays ?? DEFAULT_DELIVERY_DAYS
  const returnDays = leadTimes.returnDays ?? DEFAULT_RETURN_DAYS

  if (deliveryDays !== DEFAULT_DELIVERY_DAYS || returnDays !== DEFAULT_RETURN_DAYS) {
    const leadTimes2Value = JSON.stringify({ deliveryDays, returnDays })
    await prisma.appSetting.upsert({
      where: { key: "salesPlan.leadTimes2" },
      create: { key: "salesPlan.leadTimes2", value: leadTimes2Value },
      update: { value: leadTimes2Value },
    })
    console.log(
      `Перенесено leadTimes → leadTimes2: deliveryDays=${deliveryDays}, returnDays=${returnDays}`,
    )
  } else {
    console.log(
      `leadTimes совпадают с дефолтом (3/3) — leadTimes2 не создаётся (будет использоваться дефолт)`,
    )
  }

  console.log("=== bootstrap-sales-plan-monthly: успешно завершён ===")
  console.log("")
  console.log(
    "⚠  Применение миграции (20260705_sales_plan_v2) и запуск этого скрипта — деплой-задачи VPS.",
  )
  console.log("   Порядок: git pull → npm ci → prisma migrate deploy → npx tsx scripts/bootstrap-sales-plan-monthly.ts")
}

// ── Хелпер: безопасный JSON.parse с дефолтом ─────────────────────────────────

function parseJsonSetting<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    console.warn(`[bootstrap] Не удалось разобрать JSON: ${value}`)
    return fallback
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
