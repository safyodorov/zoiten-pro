"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

interface WbFiltersProps {
  brands: string[]
  categories: string[]
  selectedBrands: string[]
  selectedCategories: string[]
}

export function WbFilters({
  brands,
  categories,
  selectedBrands,
  selectedCategories,
}: WbFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    // При смене фильтра сбрасываем на первую страницу
    params.delete("page")
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const qs = params.toString()
    return `/cards/wb${qs ? `?${qs}` : ""}`
  }

  function toggleBrand(brand: string) {
    const current = new Set(selectedBrands)
    if (current.has(brand)) current.delete(brand)
    else current.add(brand)
    router.push(buildUrl({ brands: Array.from(current).join(",") }))
  }

  function toggleCategory(cat: string) {
    const current = new Set(selectedCategories)
    if (current.has(cat)) current.delete(cat)
    else current.add(cat)
    router.push(buildUrl({ categories: Array.from(current).join(",") }))
  }

  function clearAll() {
    router.push(buildUrl({ brands: "", categories: "" }))
  }

  const hasFilters = selectedBrands.length > 0 || selectedCategories.length > 0

  return (
    <div className="space-y-2">
      {/* Бренды */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">Бренд:</span>
        {brands.map((brand) => (
          <Badge
            key={brand}
            variant={selectedBrands.includes(brand) ? "default" : "outline"}
            className="cursor-pointer select-none"
            onClick={() => toggleBrand(brand)}
          >
            {brand}
          </Badge>
        ))}
      </div>

      {/* Категории */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">Категория:</span>
        {categories.map((cat) => (
          <Badge
            key={cat}
            variant={selectedCategories.includes(cat) ? "default" : "outline"}
            className="cursor-pointer select-none text-xs"
            onClick={() => toggleCategory(cat)}
          >
            {cat}
          </Badge>
        ))}
      </div>

      {/* Сброс */}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1 text-xs">
          <X className="h-3 w-3" />
          Сбросить фильтры
        </Button>
      )}
    </div>
  )
}
