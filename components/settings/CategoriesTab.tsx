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
  createCategoryProperty,
  updateCategoryProperty,
  deleteCategoryProperty,
  reorderCategoryProperties,
} from "@/app/actions/reference"

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

interface CategoriesTabProps {
  brands: BrandWithCategories[]
}

const KIND_LABELS: Record<PropertyKind, string> = {
  STRING: "Строка",
  ENUM: "Список",
  NUMBER: "Число",
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

// ── PropertyRow — одно свойство категории, inline edit (Phase 17) ──

function PropertyRow({ property }: { property: CategoryPropertyRow }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(property.name)
  const [kind, setKind] = useState<PropertyKind>(property.kind)
  const [optionsText, setOptionsText] = useState(property.options.join(", "))
  const [wbAttrName, setWbAttrName] = useState(property.wbAttrName ?? "")
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName) return
    const options =
      kind === "ENUM"
        ? optionsText
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean)
        : []
    startTransition(async () => {
      const result = await updateCategoryProperty({
        id: property.id,
        name: trimmedName,
        kind,
        options,
        wbAttrName: wbAttrName.trim() || null,
      })
      if (result.ok) {
        toast.success("Сохранено")
        setEditing(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDelete() {
    if (
      !confirm(
        `Удалить свойство "${property.name}"? Значения в товарах будут потеряны.`
      )
    )
      return
    startTransition(async () => {
      const result = await deleteCategoryProperty(property.id)
      if (result.ok) {
        toast.success("Свойство удалено")
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleCancel() {
    setName(property.name)
    setKind(property.kind)
    setOptionsText(property.options.join(", "))
    setWbAttrName(property.wbAttrName ?? "")
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="space-y-2 py-2 pl-2 border-b last:border-b-0 bg-muted/30 rounded">
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название (Пол, Цвет)"
            className="h-7 flex-1 text-xs"
            disabled={isPending}
            autoFocus
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PropertyKind)}
            disabled={isPending}
            className="h-7 rounded border border-input bg-transparent px-2 text-xs"
          >
            <option value="STRING">Строка</option>
            <option value="ENUM">Список</option>
            <option value="NUMBER">Число</option>
          </select>
        </div>
        {kind === "ENUM" && (
          <Input
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder="Варианты через запятую (мужской, женский, унисекс)"
            className="h-7 text-xs"
            disabled={isPending}
          />
        )}
        <Input
          value={wbAttrName}
          onChange={(e) => setWbAttrName(e.target.value)}
          placeholder="Имя в WB Content API (опционально) — например «Пол»"
          className="h-7 text-xs"
          disabled={isPending}
        />
        <div className="flex justify-end gap-1">
          <Button size="icon-xs" variant="ghost" onClick={handleSave} disabled={isPending} aria-label="Сохранить">
            <Check className="size-3" />
          </Button>
          <Button size="icon-xs" variant="ghost" onClick={handleCancel} disabled={isPending} aria-label="Отмена">
            <X className="size-3" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-1.5 pl-2 border-b last:border-b-0 group">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">
          {property.name}{" "}
          <span className="text-muted-foreground font-normal">
            ({KIND_LABELS[property.kind]})
          </span>
        </div>
        {property.kind === "ENUM" && property.options.length > 0 && (
          <div className="text-[10px] text-muted-foreground truncate">
            [{property.options.join(", ")}]
          </div>
        )}
        {property.wbAttrName && (
          <div className="text-[10px] text-muted-foreground truncate">
            WB: «{property.wbAttrName}»
          </div>
        )}
      </div>
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={() => setEditing(true)}
        disabled={isPending}
        aria-label="Редактировать свойство"
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Pencil className="size-3" />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={handleDelete}
        disabled={isPending}
        aria-label="Удалить свойство"
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

// ── AddPropertyRow — добавление нового свойства ───────────────────

function AddPropertyRow({ categoryId }: { categoryId: string }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [kind, setKind] = useState<PropertyKind>("STRING")
  const [optionsText, setOptionsText] = useState("")
  const [wbAttrName, setWbAttrName] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    const trimmedName = name.trim()
    if (!trimmedName) return
    const options =
      kind === "ENUM"
        ? optionsText
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean)
        : []
    startTransition(async () => {
      const result = await createCategoryProperty({
        categoryId,
        name: trimmedName,
        kind,
        options,
        wbAttrName: wbAttrName.trim() || null,
      })
      if (result.ok) {
        toast.success("Свойство добавлено")
        setName("")
        setOptionsText("")
        setWbAttrName("")
        setKind("STRING")
        setAdding(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  if (!adding) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setAdding(true)}
        className="h-6 px-2 mt-1 ml-2 gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-3" />
        Свойство
      </Button>
    )
  }

  return (
    <div className="space-y-2 pt-2 pl-2 border-l-2 border-primary/30 ml-2">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd()
            if (e.key === "Escape") setAdding(false)
          }}
          placeholder="Название (Пол, Цвет)"
          className="h-7 flex-1 text-xs"
          disabled={isPending}
          autoFocus
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as PropertyKind)}
          disabled={isPending}
          className="h-7 rounded border border-input bg-transparent px-2 text-xs"
        >
          <option value="STRING">Строка</option>
          <option value="ENUM">Список</option>
          <option value="NUMBER">Число</option>
        </select>
      </div>
      {kind === "ENUM" && (
        <Input
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
          placeholder="Варианты через запятую"
          className="h-7 text-xs"
          disabled={isPending}
        />
      )}
      <Input
        value={wbAttrName}
        onChange={(e) => setWbAttrName(e.target.value)}
        placeholder="Имя в WB Content API (опционально)"
        className="h-7 text-xs"
        disabled={isPending}
      />
      <div className="flex justify-end gap-1">
        <Button
          size="icon-xs"
          variant="outline"
          onClick={handleAdd}
          disabled={isPending || !name.trim()}
          aria-label="Добавить"
        >
          <Check className="size-3" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => {
            setAdding(false)
            setName("")
            setOptionsText("")
            setWbAttrName("")
          }}
          disabled={isPending}
          aria-label="Отмена"
        >
          <X className="size-3" />
        </Button>
      </div>
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

  function handleReorderProps(ids: string[]) {
    reorderCategoryProperties(ids).then((r) => {
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
        <div className="border-l ml-2 pl-2 space-y-3">
          {/* Подкатегории */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 pl-2">
              Подкатегории
            </p>
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

          {/* Свойства (Phase 17) */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 pl-2">
              Свойства
            </p>
            <SortableList items={category.properties} onReorder={handleReorderProps}>
              {category.properties.map((prop) => (
                <SortableItem key={prop.id} id={prop.id}>
                  <PropertyRow property={prop} />
                </SortableItem>
              ))}
            </SortableList>
            {category.properties.length === 0 && (
              <p className="py-1.5 pl-2 text-xs text-muted-foreground">Нет свойств</p>
            )}
            <AddPropertyRow categoryId={category.id} />
          </div>
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
