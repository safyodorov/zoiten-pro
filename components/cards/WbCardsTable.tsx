"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Star, Video } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  createProductFromCards,
  addCardsToProduct,
  searchProducts,
} from "@/app/actions/wb-cards"

// ── Типы ──────────────────────────────────────────────────────────

interface WbCard {
  id: string
  nmId: number
  article: string
  name: string
  brand: string | null
  category: string | null
  photoUrl: string | null
  rating: number | null
  reviewsTotal: number | null
  price: number | null
  hasVideo: boolean
  availability: string
}

interface WbCardsTableProps {
  cards: WbCard[]
  currentPage: number
  totalPages: number
  searchQuery: string
}

// ── Компонент ─────────────────────────────────────────────────────

export function WbCardsTable({
  cards,
  currentPage,
  totalPages,
  searchQuery,
}: WbCardsTableProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showExistingDialog, setShowExistingDialog] = useState(false)
  const [productSearch, setProductSearch] = useState("")
  const [productResults, setProductResults] = useState<
    Array<{ id: string; name: string; photoUrl: string | null }>
  >([])
  const [searchingProducts, setSearchingProducts] = useState(false)

  // ── Выделение ───────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === cards.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(cards.map((c) => c.id)))
    }
  }

  // ── Создать новый товар ─────────────────────────────────────────

  function handleCreateProduct() {
    const ids = Array.from(selected)
    startTransition(async () => {
      const result = await createProductFromCards(ids)
      if (result.ok) {
        toast.success("Товар создан")
        setSelected(new Set())
        router.push(`/products/${result.id}/edit`)
      } else {
        toast.error(result.error)
      }
    })
  }

  // ── Добавить в существующий ─────────────────────────────────────

  async function handleSearchProducts() {
    setSearchingProducts(true)
    const results = await searchProducts(productSearch)
    setProductResults(results)
    setSearchingProducts(false)
  }

  function handleAddToProduct(productId: string) {
    const ids = Array.from(selected)
    startTransition(async () => {
      const result = await addCardsToProduct(ids, productId)
      if (result.ok) {
        toast.success("Артикулы добавлены в товар")
        setSelected(new Set())
        setShowExistingDialog(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  // ── Пагинация ───────────────────────────────────────────────────

  function buildPageUrl(page: number) {
    const params = new URLSearchParams()
    params.set("page", String(page))
    if (searchQuery) params.set("q", searchQuery)
    return `/cards/wb?${params.toString()}`
  }

  // ── Рендер ──────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Панель действий */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">
            Выбрано: {selected.size}
          </span>
          <Button
            size="sm"
            onClick={handleCreateProduct}
            disabled={isPending}
          >
            Новый товар
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowExistingDialog(true)}
            disabled={isPending}
          >
            В существующий товар
          </Button>
        </div>
      )}

      {/* Таблица */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={cards.length > 0 && selected.size === cards.length}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead className="w-16">Фото</TableHead>
              <TableHead>Наименование</TableHead>
              <TableHead>Артикул</TableHead>
              <TableHead>Бренд</TableHead>
              <TableHead>Категория WB</TableHead>
              <TableHead>Рейтинг</TableHead>
              <TableHead>Цена</TableHead>
              <TableHead className="w-12">Видео</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-12 text-muted-foreground"
                >
                  Карточки не найдены. Запустите парсинг для загрузки данных с WB.
                </TableCell>
              </TableRow>
            )}
            {cards.map((card) => (
              <TableRow
                key={card.id}
                className={selected.has(card.id) ? "bg-muted/50" : ""}
              >
                <TableCell>
                  <Checkbox
                    checked={selected.has(card.id)}
                    onCheckedChange={() => toggleSelect(card.id)}
                  />
                </TableCell>
                <TableCell>
                  {card.photoUrl ? (
                    <img
                      src={card.photoUrl}
                      alt={card.name}
                      className="w-12 h-16 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-16 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-medium max-w-[250px] truncate">
                  {card.name}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {card.article}
                </TableCell>
                <TableCell>{card.brand ?? "—"}</TableCell>
                <TableCell className="text-xs max-w-[150px] truncate">
                  {card.category ?? "—"}
                </TableCell>
                <TableCell>
                  {card.rating != null ? (
                    <div className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      <span className="text-sm">{card.rating.toFixed(1)}</span>
                      {card.reviewsTotal != null && (
                        <span className="text-xs text-muted-foreground">
                          ({card.reviewsTotal})
                        </span>
                      )}
                    </div>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  {card.price != null
                    ? `${card.price.toLocaleString("ru-RU")} ₽`
                    : "—"}
                </TableCell>
                <TableCell>
                  {card.hasVideo && (
                    <Video className="h-4 w-4 text-blue-500" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Страница {currentPage} из {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => router.push(buildPageUrl(currentPage - 1))}
            >
              Назад
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => router.push(buildPageUrl(currentPage + 1))}
            >
              Вперёд
            </Button>
          </div>
        </div>
      )}

      {/* Диалог «В существующий товар» */}
      <Dialog open={showExistingDialog} onOpenChange={setShowExistingDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить в существующий товар</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Поиск товара по названию…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearchProducts()
                }}
              />
              <Button
                onClick={handleSearchProducts}
                disabled={searchingProducts || !productSearch.trim()}
                variant="outline"
              >
                Найти
              </Button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {productResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleAddToProduct(p.id)}
                  disabled={isPending}
                  className="w-full flex items-center gap-3 p-2 rounded hover:bg-muted text-left transition-colors"
                >
                  {p.photoUrl ? (
                    <img
                      src={p.photoUrl}
                      alt=""
                      className="w-8 h-10 object-cover rounded shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-10 bg-muted rounded shrink-0" />
                  )}
                  <span className="text-sm truncate">{p.name}</span>
                </button>
              ))}
              {productResults.length === 0 && productSearch && (
                <p className="text-sm text-muted-foreground py-2 text-center">
                  Введите название и нажмите «Найти»
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowExistingDialog(false)}
            >
              Отмена
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
