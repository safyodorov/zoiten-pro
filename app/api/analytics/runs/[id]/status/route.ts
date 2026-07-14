// GET /api/analytics/runs/[id]/status — лёгкий статус прогона для polling (D-02).
// Гейт: requireSection ANALYTICS VIEW. НЕ отдаёт payloadJson (его читает RSC-страница дашборда).
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: NextRequest,
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
    select: {
      status: true,
      progressNote: true,
      incompleteSkus: true,
      errorMessage: true,
      updatedAt: true,
    },
  })
  if (!run) return NextResponse.json({ error: "Прогон не найден" }, { status: 404 })

  return NextResponse.json({
    status: run.status,
    progressNote: run.progressNote,
    incompleteSkus: run.incompleteSkus,
    errorMessage: run.errorMessage,
    updatedAt: run.updatedAt,
  })
}
