"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { BrandsTab } from "./BrandsTab"
import { CategoriesTab } from "./CategoriesTab"
import { MarketplacesTab } from "./MarketplacesTab"
import { DirectionsTab } from "./DirectionsTab"
import { WbTokensTab } from "./WbTokensTab"
import { CronScheduleTab } from "./CronScheduleTab"
import type { WbTokenListItem } from "@/app/actions/wb-tokens"
import type { CronSchedule } from "@/app/actions/cron-schedule"

// ── Types ─────────────────────────────────────────────────────────

interface Subcategory {
  id: string
  name: string
  categoryId: string
}

type PropertyKind = "STRING" | "ENUM" | "NUMBER"

interface CategoryPropertyRow {
  id: string
  categoryId: string
  name: string
  kind: PropertyKind
  options: string[]
  wbAttrName: string | null
  includeInName: boolean // Phase 18
  sortOrder: number
}

interface Category {
  id: string
  name: string
  brandId: string
  subcategories: Subcategory[]
  properties: CategoryPropertyRow[]
}

interface BrandWithCategories {
  id: string
  name: string
  categories: Category[]
}

interface MarketplaceRow {
  id: string
  name: string
  slug: string
}

interface BrandLite {
  id: string
  name: string
  directionId: string | null
}

interface DirectionWithBrands {
  id: string
  name: string
  hasSizes: boolean
  brands: { id: string; name: string }[]
}

interface SettingsTabsProps {
  brands: BrandWithCategories[]
  marketplaces: MarketplaceRow[]
  directions: DirectionWithBrands[]
  brandsLite: BrandLite[]
  wbTokens: WbTokenListItem[] | null // null = не показывать tab (non-superadmin)
  // 2026-05-15 (quick 260515-o4o): null = не показывать таб (non-superadmin)
  schedule: CronSchedule | null
}

// ── SettingsTabs ──────────────────────────────────────────────────

export function SettingsTabs({
  brands,
  marketplaces,
  directions,
  brandsLite,
  wbTokens,
  schedule,
}: SettingsTabsProps) {
  return (
    <Tabs defaultValue="directions">
      <TabsList>
        <TabsTrigger value="directions">Направления</TabsTrigger>
        <TabsTrigger value="brands">Бренды</TabsTrigger>
        <TabsTrigger value="categories">Категории</TabsTrigger>
        <TabsTrigger value="marketplaces">Маркетплейсы</TabsTrigger>
        {wbTokens && <TabsTrigger value="wb-tokens">WB API токены</TabsTrigger>}
        {schedule && (
          <TabsTrigger value="cron-schedule">Расписание</TabsTrigger>
        )}
      </TabsList>
      <TabsContent value="directions">
        <DirectionsTab directions={directions} brands={brandsLite} />
      </TabsContent>
      <TabsContent value="brands">
        <BrandsTab brands={brands} />
      </TabsContent>
      <TabsContent value="categories">
        <CategoriesTab brands={brands} />
      </TabsContent>
      <TabsContent value="marketplaces">
        <MarketplacesTab marketplaces={marketplaces} />
      </TabsContent>
      {wbTokens && (
        <TabsContent value="wb-tokens">
          <WbTokensTab tokens={wbTokens} />
        </TabsContent>
      )}
      {schedule && (
        <TabsContent value="cron-schedule">
          <CronScheduleTab schedule={schedule} />
        </TabsContent>
      )}
    </Tabs>
  )
}
