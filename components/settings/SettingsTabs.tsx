"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { BrandsTab } from "./BrandsTab"
import { CategoriesTab } from "./CategoriesTab"
import { MarketplacesTab } from "./MarketplacesTab"
import { DirectionsTab } from "./DirectionsTab"

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
}

// ── SettingsTabs ──────────────────────────────────────────────────

export function SettingsTabs({ brands, marketplaces, directions, brandsLite }: SettingsTabsProps) {
  return (
    <Tabs defaultValue="directions">
      <TabsList>
        <TabsTrigger value="directions">Направления</TabsTrigger>
        <TabsTrigger value="brands">Бренды</TabsTrigger>
        <TabsTrigger value="categories">Категории</TabsTrigger>
        <TabsTrigger value="marketplaces">Маркетплейсы</TabsTrigger>
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
    </Tabs>
  )
}
