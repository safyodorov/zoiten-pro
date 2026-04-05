"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { BrandsTab } from "./BrandsTab"
import { CategoriesTab } from "./CategoriesTab"
import { MarketplacesTab } from "./MarketplacesTab"

// ── Types ─────────────────────────────────────────────────────────

interface Subcategory {
  id: string
  name: string
  categoryId: string
}

interface Category {
  id: string
  name: string
  brandId: string
  subcategories: Subcategory[]
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

interface SettingsTabsProps {
  brands: BrandWithCategories[]
  marketplaces: MarketplaceRow[]
}

// ── SettingsTabs ──────────────────────────────────────────────────

export function SettingsTabs({ brands, marketplaces }: SettingsTabsProps) {
  return (
    <Tabs defaultValue="brands">
      <TabsList>
        <TabsTrigger value="brands">Бренды</TabsTrigger>
        <TabsTrigger value="categories">Категории</TabsTrigger>
        <TabsTrigger value="marketplaces">Маркетплейсы</TabsTrigger>
      </TabsList>
      <TabsContent value="brands">
        <BrandsTab brands={brands} />
      </TabsContent>
      <TabsContent value="categories">
        <CategoriesTab brands={brands} />
      </TabsContent>
      <TabsContent value="marketplaces">
        <MarketplacesTab marketplaces={marketplaces} />
      </TabsContent>
    </Tabs>
  )
}
