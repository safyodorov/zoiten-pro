// GET /api/analytics/runs/[id]/pdf?sort=revenue|clickToOrder
// Стримит PDF прогона ниши из иммутабельного снапшота (ANL-11). Гейт: requireSection VIEW.
// Порядок SKU = query sort (дефолт revenue) — совпадает с экранной сортировкой (req.6/req.11):
// кнопка «Скачать PDF» в дашборде (30-11) передаёт активный ?sort=.
export const runtime = "nodejs"
export const maxDuration = 300

import { NextRequest, NextResponse } from "next/server"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { parseNicheRunPayload } from "@/lib/analytics/snapshot"
import { renderNicheRunPdf } from "@/lib/analytics/pdf"
import type { SortMode } from "@/lib/analytics/types"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireSection("ANALYTICS", "VIEW")
  } catch (e) {
    const status = e instanceof Error && e.message === "FORBIDDEN" ? 403 : 401
    return NextResponse.json({ error: "Нет доступа" }, { status })
  }

  const { id } = await params
  const run = await prisma.nicheRun.findUnique({
    where: { id },
    select: { payloadJson: true },
  })
  if (!run) return NextResponse.json({ error: "Прогон не найден" }, { status: 404 })

  const payload = parseNicheRunPayload(run.payloadJson)
  if (!payload) return NextResponse.json({ error: "Прогон не готов (нет снапшота)" }, { status: 409 })

  const sortParam = req.nextUrl.searchParams.get("sort")
  const sortMode: SortMode = sortParam === "clickToOrder" ? "clickToOrder" : "revenue"

  const pdf = await renderNicheRunPdf(payload, sortMode)

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="niche-run-${id}.pdf"`,
    },
  })
}
