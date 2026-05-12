// app/(dashboard)/admin/settings/page.tsx
import { requireSuperadmin } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { SettingsTabs } from "@/components/settings/SettingsTabs"
import { listWbTokens } from "@/app/actions/wb-tokens"

export default async function SettingsPage() {
  await requireSuperadmin() // SUPERADMIN only (D-03)

  const [brands, marketplaces, directions, wbTokens] = await Promise.all([
    prisma.brand.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          orderBy: { sortOrder: "asc" },
          include: {
            subcategories: { orderBy: { sortOrder: "asc" } },
            properties: { orderBy: { sortOrder: "asc" } }, // Phase 17
          },
        },
      },
    }),
    prisma.marketplace.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.productDirection.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        brands: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } },
      },
    }),
    listWbTokens(), // Quick 260512-jxh: page защищён requireSuperadmin → wbTokens всегда загружаются
  ])

  const brandsLite = brands.map((b) => ({
    id: b.id,
    name: b.name,
    directionId: b.directionId,
  }))

  return (
    <div className="space-y-6">
      <SettingsTabs
        brands={brands}
        marketplaces={marketplaces}
        directions={directions}
        brandsLite={brandsLite}
        wbTokens={wbTokens}
      />
    </div>
  )
}
