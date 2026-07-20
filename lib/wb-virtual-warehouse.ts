// lib/wb-virtual-warehouse.ts
// quick 260720-oh2: виртуальные склады «Электросталь БПЛА»/«Котовск БПЛА» — фиксация
// сгоревших 17.07.2026 остатков (атака БПЛА обнулила прод-склады Электросталь id=686 и
// Котовск id=90011). Виртуальные склады защищают эти данные от clean-replace синка
// (/api/wb-sync, /api/cron/wb-cards-refresh) и исключают их из «в пути от клиента»
// (WbCard.inWayFromClient), плана продаж, /stock, дефицита/оборачиваемости /stock/wb.
//
// DI-паттерн (см. lib/sales-plan/data.ts) — функции принимают db: PrismaClient |
// Prisma.TransactionClient, не импортируют глобальный prisma. Позволяет вызывать loaders
// как из обычного prisma-клиента, так и изнутри $transaction(async (tx) => ...).

import type { Prisma, PrismaClient } from "@prisma/client"

/** ID и названия виртуальных складов. 99001/99002 — вне занятого диапазона (реальный Котовск=90011, авто-insert 10_000_001+). */
export const BPLA_WAREHOUSES = [
  { id: 99001, name: "Электросталь БПЛА" },
  { id: 99002, name: "Котовск БПЛА" },
] as const

/** shortCluster для группировки в /stock/wb — отдельная группа «БПЛА», вне обычных кластеров ЦФО/ЮГ/... */
export const BPLA_SHORT_CLUSTER = "БПЛА"

type Db = PrismaClient | Prisma.TransactionClient

/**
 * PURE — вычитает сгоревшее qty из «в пути от клиента» (API-значение), floor на 0.
 * Тесты: (6414, 5142) → 1272; (100, 200) → 0; (100, 0) → 100.
 */
export function applyBurnedInWay(apiInWayFrom: number, burnedQty: number): number {
  return Math.max(0, apiInWayFrom - burnedQty)
}

/** Set ID виртуальных складов (isVirtual=true) — используется в фильтре clean-replace. */
export async function loadVirtualWarehouseIds(db: Db): Promise<Set<number>> {
  const rows = await db.wbWarehouse.findMany({
    where: { isVirtual: true },
    select: { id: true },
  })
  return new Set(rows.map((r) => r.id))
}

/**
 * Map<nmId, сумма qty на виртуальных складах> — используется для вычета из
 * inWayFromClient в денормализации обоих sync-роутов.
 */
export async function loadBurnedQtyByNmId(db: Db): Promise<Map<number, number>> {
  const rows = await db.wbCardWarehouseStock.findMany({
    where: { warehouse: { isVirtual: true } },
    select: { quantity: true, wbCard: { select: { nmId: true } } },
  })
  const result = new Map<number, number>()
  for (const r of rows) {
    const nmId = r.wbCard.nmId
    result.set(nmId, (result.get(nmId) ?? 0) + r.quantity)
  }
  return result
}
