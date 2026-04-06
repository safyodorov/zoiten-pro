// app/(dashboard)/admin/settings/page.tsx
import { requireSuperadmin } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { SettingsTabs } from "@/components/settings/SettingsTabs"

export default async function SettingsPage() {
  await requireSuperadmin() // SUPERADMIN only (D-03)

  const [brands, marketplaces] = await Promise.all([
    prisma.brand.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          orderBy: { sortOrder: "asc" },
          include: { subcategories: { orderBy: { sortOrder: "asc" } } },
        },
      },
    }),
    prisma.marketplace.findMany({ orderBy: { sortOrder: "asc" } }),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Настройки</h1>
      <SettingsTabs brands={brands} marketplaces={marketplaces} />
    </div>
  )
}
