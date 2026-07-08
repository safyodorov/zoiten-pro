// lib/wb-box-tariffs.ts
// Фаза B (2026-07-07): синхронизация box-тарифов складов WB.
//
// syncBoxTariffs(db) — DI на PrismaClient (без импортов next-auth), тестируемо:
//   1) fetchBoxTariffs(сегодня) → парсинг /tariffs/box
//   2) upsert каждого склада в WbBoxTariff
//   3) computeEffective — срез по стоку ОТЛОЖЕН (спека §5): просто среднее
//      не-null значение по всем складам per поле (округа сейчас идентичны,
//      коэффициенты все 100%) → флэт-запись на все товары.
//   4) upsert AppSetting.wbBoxTariffEffective (JSON)

import type { PrismaClient } from "@prisma/client"
import {
  fetchBoxTariffs,
  fetchAcceptanceCoefficients,
  fetchReturnTariffs,
  type WbBoxTariffWarehouse,
} from "@/lib/wb-api"
import { getMskTodayString } from "@/lib/wb-cron-schedule"

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
 * → считает эффективные ставки (флэт, без взвешивания по стоку — отложено)
 * → upsert AppSetting.wbBoxTariffEffective.
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

  return {
    warehouses: warehouses.length,
    effective,
    acceptanceWarehouses: boxRows.length,
    returnToSellerRub: ret.returnToSellerRub,
  }
}
