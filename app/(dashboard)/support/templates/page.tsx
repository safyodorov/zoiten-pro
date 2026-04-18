// app/(dashboard)/support/templates/page.tsx
// RSC — список локальных шаблонов ответов WB (Phase 11 Plan 03).
// Read доступ: requireSection("SUPPORT"). Write (через server actions клиентских
// кнопок) — requireSection("SUPPORT", "MANAGE") в app/actions/templates.ts.

import Link from "next/link"
import { Plus } from "lucide-react"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { TemplatesTable } from "@/components/support/templates/TemplatesTable"
import { TemplatesFilters } from "@/components/support/templates/TemplatesFilters"
import { TemplateExportButton } from "@/components/support/templates/TemplateExportButton"
import { TemplateImportButton } from "@/components/support/templates/TemplateImportButton"
import type { Prisma, TicketChannel } from "@prisma/client"

export const dynamic = "force-dynamic"

const VALID_CHANNELS: TicketChannel[] = ["FEEDBACK", "QUESTION", "CHAT"]

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; active?: string; q?: string }>
}) {
  await requireSection("SUPPORT")
  const sp = await searchParams

  const channelFilter = (sp.channel ?? "")
    .split(",")
    .filter(Boolean)
    .filter((v): v is TicketChannel => VALID_CHANNELS.includes(v as TicketChannel))
  const active = sp.active // "active" | "inactive" | undefined
  const q = sp.q?.trim()

  const where: Prisma.ResponseTemplateWhereInput = {}
  if (channelFilter.length > 0) where.channel = { in: channelFilter }
  if (active === "active") where.isActive = true
  if (active === "inactive") where.isActive = false
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { text: { contains: q, mode: "insensitive" } },
      { situationTag: { contains: q, mode: "insensitive" } },
    ]
  }

  const templates = await prisma.responseTemplate.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Локальные шаблоны ответов для отзывов, вопросов и чатов. Хранятся
            только в этой ERP (WB Templates API отключён).
          </p>
        </div>
        <div className="flex gap-2">
          <TemplateExportButton />
          <TemplateImportButton />
          <Link href="/support/templates/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Новый шаблон
            </Button>
          </Link>
        </div>
      </div>
      <TemplatesFilters />
      <TemplatesTable templates={templates} />
    </div>
  )
}
