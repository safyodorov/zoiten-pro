// Badge counts для пунктов Sidebar — используется из (dashboard)/layout.tsx.
import { prisma } from "@/lib/prisma"

export async function getSupportBadgeCount(): Promise<number> {
  try {
    return await prisma.supportTicket.count({ where: { status: "NEW" } })
  } catch {
    // DB недоступна или миграция ещё не применена — не валим layout
    return 0
  }
}

export async function getReturnsBadgeCount(): Promise<number> {
  try {
    return await prisma.supportTicket.count({
      where: { channel: "RETURN", returnState: "PENDING" },
    })
  } catch {
    return 0
  }
}

export async function getSidebarBadgeCounts(
  hasSupportAccess: boolean,
): Promise<Record<string, number>> {
  if (!hasSupportAccess) return {}
  const [support, returns] = await Promise.all([
    getSupportBadgeCount(),
    getReturnsBadgeCount(),
  ])
  return {
    "/support": support,
    "/support/returns": returns,
  }
}
