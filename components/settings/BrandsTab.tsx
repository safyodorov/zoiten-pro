"use client"

import { useState, useTransition } from "react"
import { Pencil, Trash2, Plus, Check, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { SortableList, SortableItem } from "@/components/settings/SortableList"
import {
  createBrand,
  updateBrand,
  deleteBrand,
  reorderBrands,
} from "@/app/actions/reference"

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

interface BrandsTabProps {
  brands: BrandWithCategories[]
}

// ── BrandRow — single brand with inline editing ───────────────────

function BrandRow({ brand }: { brand: BrandWithCategories }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(brand.name)
  const [isPending, startTransition] = useTransition()
  const isProtected = brand.name === "Zoiten"

  function handleSave() {
    const trimmed = value.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await updateBrand({ id: brand.id, name: trimmed })
      if (result.ok) {
        toast.success("Сохранено")
        setEditing(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDelete() {
    if (!confirm(`Удалить бренд "${brand.name}"?`)) return
    startTransition(async () => {
      const result = await deleteBrand(brand.id)
      if (result.ok) {
        toast.success("Бренд удалён")
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleCancel() {
    setValue(brand.name)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-2 border-b last:border-b-0">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave()
            if (e.key === "Escape") handleCancel()
          }}
          className="h-7 flex-1"
          autoFocus
          disabled={isPending}
        />
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={handleSave}
          disabled={isPending}
          aria-label="Сохранить"
        >
          <Check className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={handleCancel}
          disabled={isPending}
          aria-label="Отмена"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-2 border-b last:border-b-0 group">
      <span className="flex-1 text-sm">{brand.name}</span>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={() => setEditing(true)}
        disabled={isPending}
        aria-label="Редактировать"
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Pencil className="size-3.5" />
      </Button>
      {!isProtected && (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={handleDelete}
          disabled={isPending}
          aria-label="Удалить"
          className={cn(
            "opacity-0 group-hover:opacity-100 transition-opacity",
            "text-destructive hover:text-destructive"
          )}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

// ── AddBrandRow — input row for creating a new brand ─────────────

function AddBrandRow() {
  const [value, setValue] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    const trimmed = value.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await createBrand({ name: trimmed })
      if (result.ok) {
        toast.success("Бренд добавлен")
        setValue("")
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="flex items-center gap-2 pt-3">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd()
        }}
        placeholder="Новый бренд…"
        className="h-7 flex-1"
        disabled={isPending}
      />
      <Button
        size="icon-sm"
        variant="outline"
        onClick={handleAdd}
        disabled={isPending || !value.trim()}
        aria-label="Добавить бренд"
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  )
}

// ── BrandsTab ─────────────────────────────────────────────────────

export function BrandsTab({ brands }: BrandsTabProps) {
  function handleReorder(ids: string[]) {
    reorderBrands(ids).then((r) => {
      if (!r.ok) toast.error(r.error)
    })
  }

  return (
    <div className="max-w-md">
      <div className="border rounded-lg px-4 py-2">
        <SortableList items={brands} onReorder={handleReorder}>
          {brands.map((brand) => (
            <SortableItem key={brand.id} id={brand.id}>
              <BrandRow brand={brand} />
            </SortableItem>
          ))}
        </SortableList>
        {brands.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">Бренды не найдены</p>
        )}
      </div>
      <AddBrandRow />
    </div>
  )
}
