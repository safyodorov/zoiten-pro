"use client"

import { useState, useTransition } from "react"
import { Pencil, Trash2, Plus, Check, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { SortableList, SortableItem } from "@/components/settings/SortableList"
import { Checkbox } from "@/components/ui/checkbox"
import {
  createProductDirection,
  updateProductDirection,
  deleteProductDirection,
  reorderProductDirections,
  setBrandDirection,
  setDirectionHasSizes,
} from "@/app/actions/reference"

// ── Types ─────────────────────────────────────────────────────────

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

interface DirectionsTabProps {
  directions: DirectionWithBrands[]
  brands: BrandLite[]
}

// ── DirectionRow — одно направление с inline-редактированием + список брендов

function DirectionRow({
  direction,
  brands,
}: {
  direction: DirectionWithBrands
  brands: BrandLite[]
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(direction.name)
  const [showAddBrand, setShowAddBrand] = useState(false)
  const [newBrandId, setNewBrandId] = useState("")
  const [isPending, startTransition] = useTransition()

  // Бренды, которые ещё не привязаны ни к одному направлению (для select)
  const unassignedBrands = brands.filter((b) => b.directionId === null)

  function handleSave() {
    const trimmed = value.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await updateProductDirection({ id: direction.id, name: trimmed })
      if (result.ok) {
        toast.success("Сохранено")
        setEditing(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDelete() {
    const msg =
      direction.brands.length > 0
        ? `Удалить направление "${direction.name}"? Связи с ${direction.brands.length} ${direction.brands.length === 1 ? "брендом" : "брендами"} будут разорваны.`
        : `Удалить направление "${direction.name}"?`
    if (!confirm(msg)) return
    startTransition(async () => {
      const result = await deleteProductDirection(direction.id)
      if (result.ok) {
        toast.success("Направление удалено")
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleCancel() {
    setValue(direction.name)
    setEditing(false)
  }

  function handleRemoveBrand(brandId: string) {
    startTransition(async () => {
      const result = await setBrandDirection({ brandId, directionId: null })
      if (!result.ok) toast.error(result.error)
    })
  }

  function handleAddBrand() {
    if (!newBrandId) return
    startTransition(async () => {
      const result = await setBrandDirection({ brandId: newBrandId, directionId: direction.id })
      if (result.ok) {
        setNewBrandId("")
        setShowAddBrand(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleToggleHasSizes(checked: boolean) {
    startTransition(async () => {
      const result = await setDirectionHasSizes({ directionId: direction.id, hasSizes: checked })
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <div className="py-2 border-b last:border-b-0">
      {/* Шапка: название + кнопки */}
      <div className="flex items-center gap-2 group">
        {editing ? (
          <>
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
          </>
        ) : (
          <>
            <span className="flex-1 text-sm font-medium">{direction.name}</span>
            <label
              className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer"
              title="Товары этого направления имеют размерную сетку"
            >
              <Checkbox
                checked={direction.hasSizes}
                onCheckedChange={(c) => handleToggleHasSizes(c === true)}
                disabled={isPending}
              />
              Размеры
            </label>
            <span className="text-xs text-muted-foreground shrink-0">
              {direction.brands.length === 0
                ? "нет брендов"
                : `${direction.brands.length} ${direction.brands.length === 1 ? "бренд" : "бренда"}`}
            </span>
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
          </>
        )}
      </div>

      {/* Список привязанных брендов */}
      {!editing && (
        <div className="pl-4 pt-1 space-y-1">
          {direction.brands.map((b) => (
            <div key={b.id} className="flex items-center gap-1.5 text-sm text-muted-foreground group/brand">
              <span>•</span>
              <span className="flex-1">{b.name}</span>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => handleRemoveBrand(b.id)}
                disabled={isPending}
                aria-label="Отвязать бренд"
                className="opacity-0 group-hover/brand:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}

          {showAddBrand ? (
            <div className="flex items-center gap-2 pt-1">
              <select
                value={newBrandId}
                onChange={(e) => setNewBrandId(e.target.value)}
                className="h-7 flex-1 rounded border border-input bg-transparent px-2 text-xs"
                disabled={isPending || unassignedBrands.length === 0}
              >
                <option value="">Выберите бренд</option>
                {unassignedBrands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <Button
                size="icon-sm"
                variant="outline"
                onClick={handleAddBrand}
                disabled={isPending || !newBrandId}
                aria-label="Привязать"
              >
                <Check className="size-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => {
                  setShowAddBrand(false)
                  setNewBrandId("")
                }}
                disabled={isPending}
                aria-label="Отмена"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ) : (
            unassignedBrands.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAddBrand(true)}
                disabled={isPending}
                className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
              >
                <Plus className="size-3" />
                Привязать бренд
              </Button>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ── AddDirectionRow

function AddDirectionRow() {
  const [value, setValue] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    const trimmed = value.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await createProductDirection({ name: trimmed })
      if (result.ok) {
        toast.success("Направление добавлено")
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
        placeholder="Новое направление…"
        className="h-7 flex-1"
        disabled={isPending}
      />
      <Button
        size="icon-sm"
        variant="outline"
        onClick={handleAdd}
        disabled={isPending || !value.trim()}
        aria-label="Добавить направление"
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  )
}

// ── DirectionsTab

export function DirectionsTab({ directions, brands }: DirectionsTabProps) {
  function handleReorder(ids: string[]) {
    reorderProductDirections(ids).then((r) => {
      if (!r.ok) toast.error(r.error)
    })
  }

  // Бренды, которые НЕ привязаны ни к какому направлению — показать отдельным блоком
  const unassignedBrands = brands.filter((b) => b.directionId === null)

  return (
    <div className="max-w-md space-y-4">
      <div className="border rounded-lg px-4 py-2">
        <SortableList items={directions} onReorder={handleReorder}>
          {directions.map((direction) => (
            <SortableItem key={direction.id} id={direction.id}>
              <DirectionRow direction={direction} brands={brands} />
            </SortableItem>
          ))}
        </SortableList>
        {directions.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">Направления не найдены</p>
        )}
      </div>
      <AddDirectionRow />

      {unassignedBrands.length > 0 && (
        <div className="border rounded-lg px-4 py-3 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
            Без направления
          </p>
          <ul className="text-sm text-muted-foreground space-y-0.5">
            {unassignedBrands.map((b) => (
              <li key={b.id}>• {b.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
