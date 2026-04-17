// Count of new tickets — used by Sidebar badge via (dashboard)/layout.tsx.
import { prisma } from "@/lib/prisma"

export async function getSupportBadgeCount(): Promise<number> {
  try {
    return await prisma.supportTicket.count({ where: { status: "NEW" } })
  } catch {
    // DB недоступна или миграция ещё не применена — не валим layout
    return 0
  }
}
