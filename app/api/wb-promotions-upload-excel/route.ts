// app/api/wb-promotions-upload-excel/route.ts
// Phase 7 (D-06): Загрузка Excel отчёта из кабинета WB для auto-акций.
// Причина: WB API не даёт nomenclatures для auto-акций (422), поэтому данные берутся из Excel.
//
// Парсер вынесен в `lib/parse-auto-promo-excel.ts` (pure TS без next импортов),
// чтобы его можно было unit-тестировать через vitest без проблем с
// "next/server" transform.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { parseAutoPromoExcel } from "@/lib/parse-auto-promo-excel"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  // RBAC: write action → MANAGE
  try {
    await requireSection("PRICES", "MANAGE")
  } catch {
    return NextResponse.json(
      { error: "Недостаточно прав для загрузки отчёта" },
      { status: 403 },
    )
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json(
      { error: "Неверный формат запроса" },
      { status: 400 },
    )
  }

  const file = formData.get("file") as File | null
  const promotionIdRaw = formData.get("promotionId") as string | null

  if (!file) {
    return NextResponse.json({ error: "Файл не указан" }, { status: 400 })
  }
  if (!promotionIdRaw) {
    return NextResponse.json(
      { error: "ID акции не указан" },
      { status: 400 },
    )
  }

  const promotionId = parseInt(promotionIdRaw, 10)
  if (Number.isNaN(promotionId) || promotionId <= 0) {
    return NextResponse.json(
      { error: "Неверный ID акции" },
      { status: 400 },
    )
  }

  // Проверка: акция существует и type = "auto"
  const promo = await prisma.wbPromotion.findUnique({
    where: { id: promotionId },
  })
  if (!promo) {
    return NextResponse.json(
      {
        error:
          "Акция не найдена. Сначала синхронизируйте акции через кнопку «Синхронизировать акции».",
      },
      { status: 404 },
    )
  }
  if (promo.type !== "auto") {
    return NextResponse.json(
      {
        error:
          "Excel-загрузка доступна только для auto-акций. Для regular-акций данные синхронизируются через API автоматически.",
      },
      { status: 400 },
    )
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const parsed = parseAutoPromoExcel(buf)

    if (parsed.length === 0) {
      return NextResponse.json(
        {
          error:
            "Не удалось распознать строки в файле. Проверьте формат — ожидается отчёт из кабинета WB по auto-акции.",
        },
        { status: 400 },
      )
    }

    // Upsert: удаляем старые номенклатуры этой акции, вставляем новые (транзакционно)
    await prisma.$transaction([
      prisma.wbPromotionNomenclature.deleteMany({
        where: { promotionId },
      }),
      prisma.wbPromotionNomenclature.createMany({
        data: parsed.map((p) => ({
          promotionId,
          nmId: p.nmId,
          inAction: p.inAction,
          planPrice: p.planPrice,
          currentPrice: p.currentPrice,
          planDiscount: p.planDiscount,
          status: p.status,
        })),
        skipDuplicates: true,
      }),
      prisma.wbPromotion.update({
        where: { id: promotionId },
        data: {
          lastSyncedAt: new Date(),
          source: "EXCEL",
        },
      }),
    ])

    return NextResponse.json({
      imported: parsed.length,
      promotionName: promo.name,
    })
  } catch (e) {
    console.error("Auto promo Excel upload error:", e)
    return NextResponse.json(
      {
        error:
          (e as Error).message ||
          "Не удалось распознать Excel. Проверьте формат файла.",
      },
      { status: 500 },
    )
  }
}
