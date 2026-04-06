"use client"

import { useState, useTransition } from "react"
import { Pencil, Trash2, Plus, Check, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import { cn } from "@/lib/utils"
import { SortableList, SortableItem } from "@/components/settings/SortableList"
import {
  createCategory,
  updateCategory,
  deleteCategory,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  reorderCategories,
  reorderSubcategories,
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

interface CategoriesTabProps {
  brands: BrandWithCategories[]
}

// ── SubcategoryRow — inline editing for subcategory ───────────────

function SubcategoryRow({ sub }: { sub: Subcategory }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(sub.name)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    const trimmed = value.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await updateSubcategory({ id: sub.id, name: trimmed })
      if (result.ok) {
        toast.success("Сохранено")
        setEditing(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDelete() {
    if (!confirm(`Удалить подкатегорию "${sub.name}"?`)) return
    startTransition(async () => {
      const result = await deleteSubcategory(sub.id)
      if (result.ok) {
        toast.success("Подкатегория удалена")
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleCancel() {
    setValue(sub.name)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-1.5 pl-2 border-b last:border-b-0">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave()
            if (e.key === "Escape") handleCancel()
          }}
          className="h-6 flex-1 text-xs"
          autoFocus
          disabled={isPending}
        />
        <Button size="icon-xs" variant="ghost" onClick={handleSave} disabled={isPending} aria-label="Сохранить">
          <Check className="size-3" />
        </Button>
        <Button size="icon-xs" variant="ghost" onClick={handleCancel} disabled={isPending} aria-label="Отмена">
          <X className="size-3" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-1.5 pl-2 border-b last:border-b-0 group">
      <span className="flex-1 text-xs text-muted-foreground">{sub.name}</span>
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={() => setEditing(true)}
        disabled={isPending}
        aria-label="Редактировать подкатегорию"
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Pencil className="size-3" />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={handleDelete}
        disabled={isPending}
        aria-label="Удалить подкатегорию"
        className={cn(
          "opacity-0 group-hover:opacity-100 transition-opacity",
          "text-destructive hover:text-destructive"
        )}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  )
}

// ── AddSubcategoryRow ─────────────────────────────────────────────

function AddSubcategoryRow({ categoryId }: { categoryId: string }) {
  const [value, setValue] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    const trimmed = value.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await createSubcategory({ name: trimmed, categoryId })
      if (result.ok) {
        toast.success("Подкатегория добавлена")
        setValue("")
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="flex items-center gap-2 pt-2 pl-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd()
        }}
        placeholder="Новая подкатегория…"
        className="h-6 flex-1 text-xs"
        disabled={isPending}
      />
      <Button
        size="icon-xs"
        variant="outline"
        onClick={handleAdd}
        disabled={isPending || !value.trim()}
        aria-label="Добавить подкатегорию"
      >
        <Plus className="size-3" />
      </Button>
    </div>
  )
}

// ── CategoryAccordionItem — category with inline edit + subcategories

function CategoryAccordionItem({ category }: { category: Category }) {
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(category.name)
  const [isPending, startTransition] = useTransition()

  function handleSaveName() {
    const trimmed = nameValue.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await updateCategory({ id: category.id, name: trimmed })
      if (result.ok) {
        toast.success("Сохранено")
        setEditingName(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDeleteCategory() {
    if (!confirm(`Удалить категорию "${category.name}" и все её подкатегории?`)) return
    startTransition(async () => {
      const result = await deleteCategory(category.id)
      if (result.ok) {
        toast.success("Категория удалена")
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleCancelName() {
    setNameValue(category.name)
    setEditingName(false)
  }

  function handleReorderSubs(ids: string[]) {
    reorderSubcategories(ids).then((r) => {
      if (!r.ok) toast.error(r.error)
    })
  }

  return (
    <AccordionItem value={category.id}>
      <div className="flex items-center gap-1">
        {editingName ? (
          <div className="flex items-center gap-2 flex-1 py-2">
            <Input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName()
                if (e.key === "Escape") handleCancelName()
              }}
              className="h-7 flex-1"
              autoFocus
              disabled={isPending}
            />
            <Button size="icon-sm" variant="ghost" onClick={handleSaveName} disabled={isPending} aria-label="Сохранить">
              <Check className="size-3.5" />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={handleCancelName} disabled={isPending} aria-label="Отмена">
              <X className="size-3.5" />
            </Button>
          </div>
        ) : (
          <>
            <AccordionTrigger className="flex-1 hover:no-underline">
              <span>{category.name}</span>
            </AccordionTrigger>
            <div className="flex items-center gap-1 pr-2 shrink-0">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setEditingName(true)}
                disabled={isPending}
                aria-label="Переименовать категорию"
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={handleDeleteCategory}
                disabled={isPending}
                aria-label="Удалить категорию"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </>
        )}
      </div>
      <AccordionContent>
        <div className="border-l ml-2 pl-2">
          <SortableList items={category.subcategories} onReorder={handleReorderSubs}>
            {category.subcategories.map((sub) => (
              <SortableItem key={sub.id} id={sub.id}>
                <SubcategoryRow sub={sub} />
              </SortableItem>
            ))}
          </SortableList>
          {category.subcategories.length === 0 && (
            <p className="py-1.5 pl-2 text-xs text-muted-foreground">Нет подкатегорий</p>
          )}
          <AddSubcategoryRow categoryId={category.id} />
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

// ── AddCategoryRow ────────────────────────────────────────────────

function AddCategoryRow({ brandId }: { brandId: string }) {
  const [value, setValue] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    const trimmed = value.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await createCategory({ name: trimmed, brandId })
      if (result.ok) {
        toast.success("Категория добавлена")
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
        placeholder="Новая категория…"
        className="h-7 flex-1"
        disabled={isPending}
      />
      <Button
        size="icon-sm"
        variant="outline"
        onClick={handleAdd}
        disabled={isPending || !value.trim()}
        aria-label="Добавить категорию"
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  )
}

// ── CategoriesTab ─────────────────────────────────────────────────

export function CategoriesTab({ brands }: CategoriesTabProps) {
  const defaultBrand = brands.find((b) => b.name === "Zoiten") ?? brands[0]
  const [selectedBrandId, setSelectedBrandId] = useState<string>(defaultBrand?.id ?? "")

  const selectedBrand = brands.find((b) => b.id === selectedBrandId)

  function handleReorderCats(ids: string[]) {
    reorderCategories(ids).then((r) => {
      if (!r.ok) toast.error(r.error)
    })
  }

  return (
    <div className="max-w-md space-y-4">
      {/* Brand picker */}
      <div className="flex items-center gap-3">
        <label htmlFor="brand-picker" className="text-sm font-medium shrink-0">
          Бренд:
        </label>
        <select
          id="brand-picker"
          value={selectedBrandId}
          onChange={(e) => setSelectedBrandId(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {/* Categories accordion */}
      {selectedBrand ? (
        <>
          <div className="border rounded-lg px-4 py-1">
            {selectedBrand.categories.length > 0 ? (
              <SortableList items={selectedBrand.categories} onReorder={handleReorderCats}>
                <Accordion>
                  {selectedBrand.categories.map((cat) => (
                    <SortableItem key={cat.id} id={cat.id}>
                      <CategoryAccordionItem category={cat} />
                    </SortableItem>
                  ))}
                </Accordion>
              </SortableList>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">Категории не найдены</p>
            )}
          </div>
          <AddCategoryRow brandId={selectedBrand.id} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Выберите бренд</p>
      )}
    </div>
  )
}
