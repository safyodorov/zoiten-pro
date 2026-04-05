"use client"

import { useState, useTransition } from "react"
import { Pencil, Trash2, Plus, Check, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  createMarketplace,
  updateMarketplace,
  deleteMarketplace,
} from "@/app/actions/reference"

// ── Types ─────────────────────────────────────────────────────────

interface MarketplaceRow {
  id: string
  name: string
  slug: string
}

interface MarketplacesTabProps {
  marketplaces: MarketplaceRow[]
}

const SEEDED_SLUGS = ["wb", "ozon", "dm", "ym"]

// ── MarketplaceRowItem — single marketplace with inline editing ───

function MarketplaceRowItem({ mp }: { mp: MarketplaceRow }) {
  const [editing, setEditing] = useState(false)
  const [nameValue, setNameValue] = useState(mp.name)
  const [slugValue, setSlugValue] = useState(mp.slug)
  const [isPending, startTransition] = useTransition()
  const isSystem = SEEDED_SLUGS.includes(mp.slug)

  function handleSave() {
    const trimmedName = nameValue.trim()
    const trimmedSlug = slugValue.trim()
    if (!trimmedName || !trimmedSlug) return
    startTransition(async () => {
      const result = await updateMarketplace({
        id: mp.id,
        name: trimmedName,
        slug: trimmedSlug,
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
    if (!confirm(`Удалить маркетплейс "${mp.name}"?`)) return
    startTransition(async () => {
      const result = await deleteMarketplace(mp.id)
      if (result.ok) {
        toast.success("Маркетплейс удалён")
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleCancel() {
    setNameValue(mp.name)
    setSlugValue(mp.slug)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-2 border-b last:border-b-0">
        <Input
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          placeholder="Название"
          className="h-7 flex-1"
          autoFocus
          disabled={isPending}
        />
        <Input
          value={slugValue}
          onChange={(e) => setSlugValue(e.target.value)}
          placeholder="slug"
          className="h-7 w-24"
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
      <span className="flex-1 text-sm">{mp.name}</span>
      <span className="text-xs text-muted-foreground font-mono w-12 shrink-0">{mp.slug}</span>
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
      {!isSystem && (
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

// ── AddMarketplaceRow ─────────────────────────────────────────────

function AddMarketplaceRow() {
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleNameChange(value: string) {
    setName(value)
    // Auto-generate slug from name if slug hasn't been manually edited
    if (!slugTouched) {
      setSlug(value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))
    }
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true)
    setSlug(value)
  }

  function handleAdd() {
    const trimmedName = name.trim()
    const trimmedSlug = slug.trim()
    if (!trimmedName || !trimmedSlug) return
    startTransition(async () => {
      const result = await createMarketplace({ name: trimmedName, slug: trimmedSlug })
      if (result.ok) {
        toast.success("Маркетплейс добавлен")
        setName("")
        setSlug("")
        setSlugTouched(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="flex items-center gap-2 pt-3">
      <Input
        value={name}
        onChange={(e) => handleNameChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd()
        }}
        placeholder="Название…"
        className="h-7 flex-1"
        disabled={isPending}
      />
      <Input
        value={slug}
        onChange={(e) => handleSlugChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd()
        }}
        placeholder="slug"
        className="h-7 w-24"
        disabled={isPending}
      />
      <Button
        size="icon-sm"
        variant="outline"
        onClick={handleAdd}
        disabled={isPending || !name.trim() || !slug.trim()}
        aria-label="Добавить маркетплейс"
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  )
}

// ── MarketplacesTab ───────────────────────────────────────────────

export function MarketplacesTab({ marketplaces }: MarketplacesTabProps) {
  return (
    <div className="max-w-md">
      <div className="border rounded-lg px-4 py-2">
        {marketplaces.map((mp) => (
          <MarketplaceRowItem key={mp.id} mp={mp} />
        ))}
        {marketplaces.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">Маркетплейсы не найдены</p>
        )}
      </div>
      <AddMarketplaceRow />
    </div>
  )
}
