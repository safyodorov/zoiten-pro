// lib/wb-virtual-warehouse.ts
// quick 260720-oh2 (волна 1) + quick 260723-hr5-2-gate (волна 2): виртуальные склады
// «Электросталь БПЛА»/«Котовск БПЛА»/«Невинномысск БПЛА»/«Краснодар БПЛА» — фиксация
// сгоревших остатков (атаки БПЛА обнулили прод-склады): волна 1 — Электросталь id=686 и
// Котовск id=90011 (пожар 17.07.2026); волна 2 — Невинномысск id=90024 и Краснодар id=304
// (пожар 22.07.2026 утром). Виртуальные склады защищают эти данные от clean-replace синка
// (/api/wb-sync, /api/cron/wb-cards-refresh) и исключают их из «в пути от клиента»
// (WbCard.inWayFromClient), плана продаж, /stock, дефицита/оборачиваемости /stock/wb.
//
// DI-паттерн (см. lib/sales-plan/data.ts) — функции принимают db: PrismaClient |
// Prisma.TransactionClient, не импортируют глобальный prisma. Позволяет вызывать loaders
// как из обычного prisma-клиента, так и изнутри $transaction(async (tx) => ...).

import type { Prisma, PrismaClient } from "@prisma/client"

/**
 * ID и названия виртуальных складов. 99001-99004 — вне занятого диапазона (реальный
 * Котовск=90011, авто-insert неизвестных складов начинается с 10_000_001).
 * wave — волна пожара; realWarehouseId — реальный склад-прообраз (для gate-проверки
 * в scripts/seed-bpla-warehouses.ts: сеять виртуальный склад только после обнуления
 * реального, см. decideBplaSeedAction).
 */
export const BPLA_WAREHOUSES = [
  { id: 99001, name: "Электросталь БПЛА", wave: 1, realWarehouseId: 686 },
  { id: 99002, name: "Котовск БПЛА", wave: 1, realWarehouseId: 90011 },
  { id: 99003, name: "Невинномысск БПЛА", wave: 2, realWarehouseId: 90024 },
  { id: 99004, name: "Краснодар БПЛА", wave: 2, realWarehouseId: 304 },
] as const

/** shortCluster для группировки в /stock/wb — отдельная группа «БПЛА», вне обычных кластеров ЦФО/ЮГ/... */
export const BPLA_SHORT_CLUSTER = "БПЛА"

type Db = PrismaClient | Prisma.TransactionClient

export type BplaSeedAction = "seed" | "gate-blocked" | "already-seeded"

/**
 * PURE — решает, что делать с одним виртуальным складом волны 2 при очередном запуске
 * scripts/seed-bpla-warehouses.ts (в т.ч. ежедневном крон-тике).
 *
 * Инвариант: сеять виртуальный склад можно ТОЛЬКО после того, как WB обнулил реальный
 * склад-прообраз (realWarehouseQty === 0), и ровно ОДИН раз — повторные запуски после
 * успешного сида должны быть no-op, даже если WB снова временно повезёт товар на тот же
 * реальный склад (иначе двойной счёт в /finance/balance + преждевременный вычет из
 * inWayFromClient).
 *
 * - virtualHasRows=true  → "already-seeded" (уже засеян ранее — idempotent skip, НЕ пересеиваем)
 * - virtualHasRows=false, realWarehouseQty>0 → "gate-blocked" (реальный склад ещё не обнулён WB)
 * - virtualHasRows=false, realWarehouseQty=0 → "seed" (обнулён и ещё не засеян)
 */
export function decideBplaSeedAction(input: {
  virtualHasRows: boolean
  realWarehouseQty: number
}): BplaSeedAction {
  if (input.virtualHasRows) return "already-seeded"
  if (input.realWarehouseQty > 0) return "gate-blocked"
  return "seed"
}

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
