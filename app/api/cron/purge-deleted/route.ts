// app/api/cron/purge-deleted/route.ts
// GET /api/cron/purge-deleted — permanently deletes soft-deleted products older than 30 days
// Protected by x-cron-secret header matching CRON_SECRET env var

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  try {
    const result = await prisma.product.deleteMany({
      where: { deletedAt: { lt: cutoff } },
    })
    return NextResponse.json({ deleted: result.count })
  } catch (e) {
    console.error("purge-deleted error:", e)
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 })
  }
}
