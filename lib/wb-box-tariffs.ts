// lib/wb-box-tariffs.ts
// Фаза B (2026-07-07) + Фаза B v2 (2026-07-08): синхронизация box-тарифов складов WB.
//
// syncBoxTariffs(db) — DI на PrismaClient (без импортов next-auth), тестируемо:
//   1) fetchBoxTariffs(сегодня) → парсинг /tariffs/box → upsert WbBoxTariff
//   2) computeEffectiveBoxTariff — флэт-среднее по всем складам (v1, теперь
//      используется как fallback для среза §5) → upsert AppSetting.wbBoxTariffEffective
//   3) fetchAcceptanceCoefficients() (короб, boxTypeID=2) → upsert WbAcceptanceCoef
//   4) fetchReturnTariffs() → upsert AppSetting.wbReturnToSellerRub
//   5) срез §5: computeEffCoefForDirection взвешивает эфф-ставки логистики/хранения
//      по НАШЕМУ стоку ОТДЕЛЬНО для бытовой техники / одежды (product.brand.direction.hasSizes)
//      → upsert AppSetting.wbEffCoef.appliances / wbEffCoef.clothing

import type { PrismaClient } from "@prisma/client"
import {
  fetchBoxTariffs,
  fetchAcceptanceCoefficients,
  fetchReturnTariffs,
  type WbBoxTariffWarehouse,
} from "@/lib/wb-api"
import { getMskTodayString } from "@/lib/wb-cron-schedule"
import {
  computeEffCoefForDirection,
  normalizeWarehouseName,
  type EffCoefRates,
  type EffCoefResult,
} from "@/lib/wb-eff-coef"

/** Эффективные (усреднённые по складам) box-ставки — флэт на все товары. */
export interface WbBoxTariffEffective {
  delivBase: number | null
  delivLiter: number | null
  delivCoefPct: number | null
  storageBasePerLiter: number | null
  storageLiterPerDay: number | null
  storageCoefPct: number | null
  dtTillMax: string | null
}

/** Среднее не-null значений; пустой массив/все-null → null. */
function avgNonNull(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/** Считает эффективные ставки из списка складов (pure, экспортируется для тестов). */
export function computeEffectiveBoxTariff(
  warehouses: WbBoxTariffWarehouse[],
  dtTillMax: Date | null,
): WbBoxTariffEffective {
  return {
    delivBase: avgNonNull(warehouses.map((w) => w.deliveryBase)),
    delivLiter: avgNonNull(warehouses.map((w) => w.deliveryLiter)),
    delivCoefPct: avgNonNull(warehouses.map((w) => w.deliveryCoefPct)),
    storageBasePerLiter: avgNonNull(warehouses.map((w) => w.storageBase)),
    storageLiterPerDay: avgNonNull(warehouses.map((w) => w.storageLiter)),
    storageCoefPct: avgNonNull(warehouses.map((w) => w.storageCoefPct)),
    dtTillMax: dtTillMax ? dtTillMax.toISOString() : null,
  }
}

/**
 * Полный цикл: тянет /tariffs/box → upsert WbBoxTariff (сырые данные per склад)
 * → считает эффективные ставки (флэт, v1 fallback) → upsert AppSetting.wbBoxTariffEffective
 * → тянет acceptance/coefficients (короб) + return → upsert WbAcceptanceCoef +
 * AppSetting.wbReturnToSellerRub → срез §5 (Фаза B v2): взвешивает эфф-ставки
 * логистики/хранения по нашему стоку ОТДЕЛЬНО для бытовой техники / одежды →
 * upsert AppSetting.wbEffCoef.appliances/clothing.
 *
 * `db` инъецируется (DI) — без прямых импортов next-auth/prisma singleton,
 * чтобы функция была тестируема через prismaMock.
 */
export async function syncBoxTariffs(
  db: PrismaClient,
): Promise<{
  warehouses: number
  effective: WbBoxTariffEffective
  acceptanceWarehouses: number
  returnToSellerRub: number | null
  effCoef: { appliances: EffCoefResult; clothing: EffCoefResult }
}> {
  const { warehouses, dtTillMax } = await fetchBoxTariffs(getMskTodayString())

  for (const w of warehouses) {
    if (!w.warehouseName) continue
    await db.wbBoxTariff.upsert({
      where: { warehouseName: w.warehouseName },
      create: {
        warehouseName: w.warehouseName,
        deliveryBase: w.deliveryBase,
        deliveryLiter: w.deliveryLiter,
        deliveryCoefPct: w.deliveryCoefPct,
        storageBase: w.storageBase,
        storageLiter: w.storageLiter,
        storageCoefPct: w.storageCoefPct,
        dtTillMax,
      },
      update: {
        deliveryBase: w.deliveryBase,
        deliveryLiter: w.deliveryLiter,
        deliveryCoefPct: w.deliveryCoefPct,
        storageBase: w.storageBase,
        storageLiter: w.storageLiter,
        storageCoefPct: w.storageCoefPct,
        dtTillMax,
      },
    })
  }

  const effective = computeEffectiveBoxTariff(warehouses, dtTillMax)

  await db.appSetting.upsert({
    where: { key: "wbBoxTariffEffective" },
    create: { key: "wbBoxTariffEffective", value: JSON.stringify(effective) },
    update: { value: JSON.stringify(effective) },
  })

  // ── Фаза B v2 (2026-07-08): acceptance/coefficients (короб) + return ────
  const accRows = await fetchAcceptanceCoefficients()
  const boxRows = accRows.filter((r) => r.boxTypeID === 2)

  for (const r of boxRows) {
    await db.wbAcceptanceCoef.upsert({
      where: { warehouseID_boxTypeID: { warehouseID: r.warehouseID, boxTypeID: r.boxTypeID } },
      create: {
        warehouseID: r.warehouseID,
        warehouseName: r.warehouseName,
        boxTypeID: r.boxTypeID,
        coefficient: r.coefficient,
        deliveryCoef: r.deliveryCoef,
        storageCoef: r.storageCoef,
        deliveryBaseLiter: r.deliveryBaseLiter,
        deliveryAdditionalLiter: r.deliveryAdditionalLiter,
        storageBaseLiter: r.storageBaseLiter,
        storageAdditionalLiter: r.storageAdditionalLiter,
      },
      update: {
        warehouseName: r.warehouseName,
        coefficient: r.coefficient,
        deliveryCoef: r.deliveryCoef,
        storageCoef: r.storageCoef,
        deliveryBaseLiter: r.deliveryBaseLiter,
        deliveryAdditionalLiter: r.deliveryAdditionalLiter,
        storageBaseLiter: r.storageBaseLiter,
        storageAdditionalLiter: r.storageAdditionalLiter,
      },
    })
  }

  const ret = await fetchReturnTariffs(getMskTodayString())
  if (ret.returnToSellerRub != null) {
    await db.appSetting.upsert({
      where: { key: "wbReturnToSellerRub" },
      create: { key: "wbReturnToSellerRub", value: String(ret.returnToSellerRub) },
      update: { value: String(ret.returnToSellerRub) },
    })
  }

  // ── Фаза B v2 (2026-07-08): срез §5 — эфф-ставки, взвешенные по нашему
  // стоку ОТДЕЛЬНО для бытовой техники / одежды (product.brand.direction.hasSizes).
  const products = await db.product.findMany({
    where: {
      deletedAt: null,
      articles: { some: { marketplace: { name: { in: ["WB", "wb", "Wildberries"] } } } },
    },
    include: {
      brand: { include: { direction: true } },
      articles: { include: { marketplace: true } },
    },
  })

  const clothingNmIds: number[] = []
  const appliancesNmIds: number[] = []
  for (const p of products) {
    const isClothing = p.brand?.direction?.hasSizes ?? false
    for (const a of p.articles) {
      if (!a.marketplace.name.toLowerCase().includes("wb") && a.marketplace.name.toLowerCase() !== "wildberries") continue
      const nmId = parseInt(a.article, 10)
      if (Number.isNaN(nmId)) continue
      ;(isClothing ? clothingNmIds : appliancesNmIds).push(nmId)
    }
  }

  const wbWarehouses = await db.wbWarehouse.findMany({ select: { id: true, name: true } })
  const warehouseNameById = new Map(wbWarehouses.map((w) => [w.id, w.name]))

  async function buildStockMap(nmIds: number[]): Promise<Map<string, number>> {
    const map = new Map<string, number>()
    if (nmIds.length === 0) return map
    const grouped = await db.wbCardWarehouseStock.groupBy({
      by: ["warehouseId"],
      _sum: { quantity: true },
      where: { wbCard: { nmId: { in: nmIds }, deletedAt: null } },
    })
    for (const g of grouped) {
      const name = warehouseNameById.get(g.warehouseId)
      if (!name) continue
      const key = normalizeWarehouseName(name)
      const qty = g._sum.quantity ?? 0
      map.set(key, (map.get(key) ?? 0) + qty)
    }
    return map
  }

  const acceptanceByName = new Map<string, EffCoefRates>()
  for (const r of boxRows) {
    acceptanceByName.set(normalizeWarehouseName(r.warehouseName), {
      delivBaseLiter: r.deliveryBaseLiter,
      delivAddLiter: r.deliveryAdditionalLiter,
      storageBaseLiter: r.storageBaseLiter,
      storageAddLiter: r.storageAdditionalLiter,
    })
  }

  // v1-box fallback (коэф был 100% → базовые ставки ≈ применённые, годятся как fallback).
  const effCoefFallback: EffCoefRates = {
    delivBaseLiter: effective.delivBase,
    delivAddLiter: effective.delivLiter,
    storageBaseLiter: effective.storageBasePerLiter,
    storageAddLiter: effective.storageLiterPerDay,
  }

  const [appliancesStockMap, clothingStockMap] = await Promise.all([
    buildStockMap(appliancesNmIds),
    buildStockMap(clothingNmIds),
  ])

  const appliancesEff: EffCoefResult = computeEffCoefForDirection(
    appliancesStockMap,
    acceptanceByName,
    effCoefFallback,
  )
  const clothingEff: EffCoefResult = computeEffCoefForDirection(
    clothingStockMap,
    acceptanceByName,
    effCoefFallback,
  )

  console.warn(
    "[wb-eff-coef] appliances unmatched:",
    appliancesEff.unmatched,
    "coverage:",
    appliancesEff.coveragePct,
  )
  console.warn(
    "[wb-eff-coef] clothing unmatched:",
    clothingEff.unmatched,
    "coverage:",
    clothingEff.coveragePct,
  )

  await db.appSetting.upsert({
    where: { key: "wbEffCoef.appliances" },
    create: {
      key: "wbEffCoef.appliances",
      value: JSON.stringify({ ...appliancesEff, updatedAt: new Date().toISOString() }),
    },
    update: {
      value: JSON.stringify({ ...appliancesEff, updatedAt: new Date().toISOString() }),
    },
  })
  await db.appSetting.upsert({
    where: { key: "wbEffCoef.clothing" },
    create: {
      key: "wbEffCoef.clothing",
      value: JSON.stringify({ ...clothingEff, updatedAt: new Date().toISOString() }),
    },
    update: {
      value: JSON.stringify({ ...clothingEff, updatedAt: new Date().toISOString() }),
    },
  })

  return {
    warehouses: warehouses.length,
    effective,
    acceptanceWarehouses: boxRows.length,
    returnToSellerRub: ret.returnToSellerRub,
    effCoef: { appliances: appliancesEff, clothing: clothingEff },
  }
}
