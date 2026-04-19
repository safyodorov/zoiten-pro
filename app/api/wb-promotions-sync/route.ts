// app/api/wb-promotions-sync/route.ts
// Phase 7 (D-05): Синхронизация акций WB из Promotions Calendar API.
// Окно: [today, today + 60 days]. Rate limit compliant (через lib/wb-api.ts).
// Cleanup: удаляет акции с endDateTime < today - 7 дней (Cascade удалит nomenclatures).

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import {
  fetchAllPromotions,
  fetchPromotionDetails,
  fetchPromotionNomenclatures,
} from "@/lib/wb-api"

export const runtime = "nodejs"
// 5 минут — sync может быть медленным из-за rate limit WB Promotions API
// (10 req/6 sec ≈ 600ms пауза между запросами)
export const maxDuration = 300

export async function POST() {
  // RBAC: write action → требуется MANAGE
  try {
    await requireSection("PRICES", "MANAGE")
  } catch {
    return NextResponse.json(
      { error: "Недостаточно прав для синхронизации акций" },
      { status: 403 },
    )
  }

  try {
    const now = new Date()
    const endWindow = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)

    // 1. Получить список всех акций в окне 60 дней
    const raw = await fetchAllPromotions(now, endWindow)

    // 2. Upsert акций в WbPromotion
    for (const p of raw) {
      await prisma.wbPromotion.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          name: p.name,
          description: p.description ?? null,
          advantages: p.advantages ?? [],
          startDateTime: new Date(p.startDateTime),
          endDateTime: new Date(p.endDateTime),
          type: p.type,
          source: "API",
          lastSyncedAt: new Date(),
        },
        update: {
          name: p.name,
          description: p.description ?? null,
          advantages: p.advantages ?? [],
          startDateTime: new Date(p.startDateTime),
          endDateTime: new Date(p.endDateTime),
          type: p.type,
          lastSyncedAt: new Date(),
        },
      })
    }

    // 3. Получить детали акций батчами по 10 ID
    const ids = raw.map((p) => p.id)
    const details = await fetchPromotionDetails(ids)
    for (const d of details) {
      await prisma.wbPromotion.update({
        where: { id: d.id },
        data: {
          description: d.description ?? undefined,
          advantages: d.advantages ?? undefined,
          // Prisma Json field: передаём как unknown чтобы обойти strict типы InputJsonValue
          rangingJson: (d.ranging ?? undefined) as never,
        },
      })
    }

    // 4. Номенклатуры — ТОЛЬКО для regular-акций
    // Auto-акции заполняются через Excel upload (/api/wb-promotions-upload-excel, D-06)
    let nomTotal = 0
    for (const p of raw.filter((pp) => pp.type !== "auto")) {
      const noms = await fetchPromotionNomenclatures(p.id)
      // Удалить старые номенклатуры этой акции и вставить новые
      await prisma.wbPromotionNomenclature.deleteMany({
        where: { promotionId: p.id },
      })
      const validNoms = noms
        .map((n) => ({
          promotionId: p.id,
          nmId: n.nmID ?? n.nmId ?? n.id,
          inAction: n.inAction ?? false,
          planPrice: n.planPrice ?? null,
          planDiscount: n.planDiscount ?? null,
        }))
        .filter((n): n is typeof n & { nmId: number } => typeof n.nmId === "number")
      if (validNoms.length > 0) {
        await prisma.wbPromotionNomenclature.createMany({
          data: validNoms,
          skipDuplicates: true,
        })
      }
      nomTotal += validNoms.length
    }

    // 5. Cleanup — удалить акции закончившиеся > 7 дней назад
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const deleted = await prisma.wbPromotion.deleteMany({
      where: { endDateTime: { lt: cutoff } },
    })

    return NextResponse.json({
      synced: raw.length,
      nomenclatures: nomTotal,
      deleted: deleted.count,
    })
  } catch (e) {
    console.error("WB promotions sync error:", e)
    return NextResponse.json(
      {
        error: (e as Error).message || "Ошибка синхронизации акций",
      },
      { status: 500 },
    )
  }
}
