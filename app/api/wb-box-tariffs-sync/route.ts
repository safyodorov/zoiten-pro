// app/api/wb-box-tariffs-sync/route.ts
// Фаза B (2026-07-07): POST-эндпоинт кнопки «Тарифы складов» на /prices/wb.
// Тянет /tariffs/box → upsert WbBoxTariff → пересчитывает эффективные ставки
// (флэт, срез по стоку отложен) → AppSetting.wbBoxTariffEffective.
// RBAC: PRICES MANAGE (write-действие).

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { revalidatePath } from "next/cache"
import { syncBoxTariffs } from "@/lib/wb-box-tariffs"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST() {
  try {
    await requireSection("PRICES", "MANAGE")
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    }
    return NextResponse.json(
      { error: "Недостаточно прав для синхронизации тарифов складов" },
      { status: 403 },
    )
  }

  try {
    const result = await syncBoxTariffs(prisma)
    revalidatePath("/prices/wb")
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error("WB box tariffs sync error:", e)
    return NextResponse.json(
      { error: (e as Error).message || "Ошибка синхронизации тарифов складов" },
      { status: 500 },
    )
  }
}
