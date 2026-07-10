// lib/wb-commission-history.ts
//
// W2d (quick 260710-hkj): история комиссий WB per nmId (таблица WbCommissionSnapshot).
//
// Зачем: комиссии оферты выросли с 07.07.2026 — без истории /finance/weekly
// пересчитывал бы ПРОШЛЫЕ недели по НОВЫМ ставкам задним числом. Снапшоты
// фиксируют ставки на дату изменения; отчёт недели берёт последнюю запись
// с validFrom <= weekEnd (см. loadCommissionsForDate).
//
// Backfill: миграция 20260710_wb_commission_snapshot сохранила текущие ставки
// всех WbCard как снапшот от 2026-06-01 (заведомо ДО роста 07.07.2026).
//
// ВАЖНО (задокументированное ограничение): после роста ставок будущий синк
// создаст записи validFrom = дата синка (> 05.07) — неделя 29.06–05.07 останется
// на старых ставках. При необходимости пользователь корректирует validFrom
// новых записей на дату реального роста SQL-ом:
//   UPDATE "WbCommissionSnapshot" SET "validFrom" = DATE '2026-07-07'
//   WHERE "validFrom" = DATE '<дата синка>';
//
// НЕ pure — импортирует prisma. Вызывается из /api/wb-sync (после upsert-цикла
// WbCard) и /api/wb-commission-iu (обычно no-op — route пишет только WbCommissionIu,
// но захватывает изменения после ручного UPDATE WbCard между синками).

import { prisma } from "@/lib/prisma"

interface CommissionFields {
  commFbwIu: number | null
  commFbwStd: number | null
  commFbsIu: number | null
  commFbsStd: number | null
}

interface SnapshotRow extends CommissionFields {
  nmId: number
}

/** Сегодня МСК как UTC-полночь (паттерн lib/sales-plan/dates.ts getMskTodayIso). */
function mskTodayUtcMidnight(): Date {
  const msk = new Date(Date.now() + 3 * 3600_000)
  return new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate()))
}

/**
 * Сравнивает текущие ставки WbCard с ПОСЛЕДНИМ снапшотом per nmId и записывает
 * новый снапшот (validFrom = сегодня МСК) для каждого nmId, у которого хотя бы
 * одно из 4 полей изменилось (null-safe !==) либо снапшота ещё нет вовсе.
 *
 * Upsert по (validFrom, nmId) — если ставки изменились дважды за день, вторая
 * правка перезаписывает дневную запись (не теряется). Изменившихся обычно
 * единицы — цикл upsert'ов допустим.
 *
 * @returns число записанных снапшотов (для лога)
 */
export async function snapshotCommissionChanges(): Promise<number> {
  // Последний снапшот per nmId одним запросом (DISTINCT ON — PostgreSQL)
  const lastSnapshots = await prisma.$queryRaw<SnapshotRow[]>`
    SELECT DISTINCT ON ("nmId") "nmId", "commFbwIu", "commFbwStd", "commFbsIu", "commFbsStd"
    FROM "WbCommissionSnapshot"
    ORDER BY "nmId", "validFrom" DESC
  `
  const lastByNmId = new Map<number, CommissionFields>()
  for (const row of lastSnapshots) {
    lastByNmId.set(row.nmId, {
      commFbwIu: row.commFbwIu,
      commFbwStd: row.commFbwStd,
      commFbsIu: row.commFbsIu,
      commFbsStd: row.commFbsStd,
    })
  }

  const cards = await prisma.wbCard.findMany({
    where: { deletedAt: null },
    select: {
      nmId: true,
      commFbwIu: true,
      commFbwStd: true,
      commFbsIu: true,
      commFbsStd: true,
    },
  })

  const validFrom = mskTodayUtcMidnight()
  let written = 0

  for (const card of cards) {
    const last = lastByNmId.get(card.nmId)
    const changed =
      !last ||
      last.commFbwIu !== card.commFbwIu ||
      last.commFbwStd !== card.commFbwStd ||
      last.commFbsIu !== card.commFbsIu ||
      last.commFbsStd !== card.commFbsStd
    if (!changed) continue

    const fields: CommissionFields = {
      commFbwIu: card.commFbwIu,
      commFbwStd: card.commFbwStd,
      commFbsIu: card.commFbsIu,
      commFbsStd: card.commFbsStd,
    }
    await prisma.wbCommissionSnapshot.upsert({
      where: { validFrom_nmId: { validFrom, nmId: card.nmId } },
      create: { validFrom, nmId: card.nmId, ...fields },
      update: fields,
    })
    written++
  }

  return written
}

/**
 * Ставки комиссий, действовавшие на дату `date`: последняя запись per nmId
 * с validFrom <= date (DISTINCT ON + ORDER BY validFrom DESC).
 *
 * DOUBLE PRECISION приходит из $queryRaw как number (не Prisma.Decimal).
 * nmId без снапшотов на дату → отсутствует в Map (caller делает fallback
 * на текущие WbCard-поля).
 */
export async function loadCommissionsForDate(
  date: Date,
): Promise<Map<number, CommissionFields>> {
  const rows = await prisma.$queryRaw<SnapshotRow[]>`
    SELECT DISTINCT ON ("nmId") "nmId", "commFbwIu", "commFbwStd", "commFbsIu", "commFbsStd"
    FROM "WbCommissionSnapshot"
    WHERE "validFrom" <= ${date}
    ORDER BY "nmId", "validFrom" DESC
  `
  const map = new Map<number, CommissionFields>()
  for (const row of rows) {
    map.set(row.nmId, {
      commFbwIu: row.commFbwIu,
      commFbwStd: row.commFbwStd,
      commFbsIu: row.commFbsIu,
      commFbsStd: row.commFbsStd,
    })
  }
  return map
}
