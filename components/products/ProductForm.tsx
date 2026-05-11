"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { useForm, useFieldArray, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, X, Trash2, GripVertical } from "lucide-react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { cn } from "@/lib/utils"
import {
  createProduct,
  updateProduct,
  saveProductProperties,
  saveProductSizes,
} from "@/app/actions/products"
import { createBrand, createCategory, createSubcategory } from "@/app/actions/reference"
import { WbImportDialog } from "@/components/products/WbImportDialog"
import { CreatableCombobox } from "@/components/combobox/CreatableCombobox"
import { PhotoUploadField } from "@/components/products/PhotoUploadField"
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
// Native select wrapper styled with Tailwind (base-ui Select crashes with empty values)
function NativeSelect({
  value,
  onChange,
  children,
  className,
}: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {children}
    </select>
  )
}

// ── Types ─────────────────────────────────────────────────────────

interface MarketplaceOption {
  id: string
  name: string
  slug: string
}

interface SubcategoryOption {
  id: string
  name: string
}

// Phase 17
type PropertyKind = "STRING" | "ENUM" | "NUMBER"
interface CategoryPropertyOption {
  id: string
  name: string
  kind: PropertyKind
  options: string[]
  wbAttrName: string | null
}

interface CategoryOption {
  id: string
  name: string
  subcategories: SubcategoryOption[]
  properties: CategoryPropertyOption[]
}

interface BrandWithCategories {
  id: string
  name: string
  direction: { id: string; name: string; hasSizes: boolean } | null
  categories: CategoryOption[]
}

// 260421-iq7: barcodes теперь вложены в article, верхнеуровневый Product.barcodes удалён
// 2026-05-11 (Phase 17 ext): barcodes расширены productSize (опциональная связь).
interface BarcodeDB {
  id?: string
  value: string
  productSize?: { id: string; value: string } | null
}

interface ProductArticleDB {
  id?: string
  marketplaceId: string
  article: string
  sortOrder: number
  barcodes: BarcodeDB[]
}

interface ProductData {
  id?: string
  sku?: string
  name?: string
  photoUrl?: string | null
  brandId?: string
  categoryId?: string | null
  subcategoryId?: string | null
  label?: string | null
  abcStatus?: string | null
  availability?: string
  weightKg?: number | null
  heightCm?: number | null
  widthCm?: number | null
  depthCm?: number | null
  articles?: ProductArticleDB[]
  // Phase 17
  propertyValues?: Array<{ propertyId: string; value: string }>
  sizes?: Array<{ value: string; sortOrder: number }>
}

interface ProductFormProps {
  brands: BrandWithCategories[]
  marketplaces: MarketplaceOption[]
  product?: ProductData
}

// ── Zod schema ─────────────────────────────────────────────────────
// 260421-iq7: barcodes вложены в articles. sortOrder не в schema — генерируется
// сервером по индексу массива.

const formSchema = z.object({
  name: z.string().min(1, "Введите название").max(100, "Максимум 100 символов"),
  brandId: z.string().min(1, "Выберите бренд"),
  categoryId: z.string().nullable().optional(),
  subcategoryId: z.string().nullable().optional(),
  label: z.string().max(100, "Максимум 100 символов").nullable().optional(),
  abcStatus: z.enum(["A", "B", "C"]).nullable().optional(),
  availability: z.enum(["IN_STOCK", "OUT_OF_STOCK", "DISCONTINUED", "DELETED"]),
  weightKg: z.number().positive().nullable().optional(),
  heightCm: z.number().positive().nullable().optional(),
  widthCm: z.number().positive().nullable().optional(),
  depthCm: z.number().positive().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  marketplaces: z.array(
    z.object({
      marketplaceId: z.string().min(1),
      articles: z
        .array(
          z.object({
            value: z.string().min(1, "Введите артикул"),
            barcodes: z
              .array(
                z.object({
                  value: z.string().min(1, "Введите штрих-код"),
                  // Phase 17 ext: привязка к размеру (опционально, "" = без размера)
                  productSizeValue: z.string().nullable().optional(),
                })
              )
              .max(20),
          })
        )
        .max(10),
    })
  ),
  // Phase 17: динамические свойства (Record<propertyId, value>) + размерная сетка
  // NB: без .default() — zodResolver конфликтует с RHF 7.72 (см. CLAUDE.md Phase 4)
  properties: z.record(z.string(), z.string()),
  sizes: z.array(z.object({ value: z.string() })),
})

type FormValues = z.infer<typeof formSchema>

// ── Helper: group articles by marketplaceId preserving sortOrder ───

function groupArticlesWithBarcodes(
  articles: ProductArticleDB[]
): Array<{
  marketplaceId: string
  articles: Array<{
    value: string
    barcodes: Array<{ value: string; productSizeValue: string | null }>
  }>
}> {
  const map = new Map<string, ProductArticleDB[]>()
  // sort globally by sortOrder — внутри каждого маркетплейса порядок сохранится
  for (const a of [...articles].sort((x, y) => x.sortOrder - y.sortOrder)) {
    const list = map.get(a.marketplaceId) ?? []
    list.push(a)
    map.set(a.marketplaceId, list)
  }
  return Array.from(map.entries()).map(([marketplaceId, arts]) => ({
    marketplaceId,
    articles: arts.map((a) => ({
      value: a.article,
      barcodes: a.barcodes.map((b) => ({
        value: b.value,
        // Phase 17 ext: productSize?.value хранится в form state
        productSizeValue: b.productSize?.value ?? null,
      })),
    })),
  }))
}

// ── ProductForm ─────────────────────────────────────────────────────

export function ProductForm({ brands, marketplaces, product }: ProductFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [brandsState, setBrandsState] = useState<BrandWithCategories[]>(brands)
  const [showMarketplaceSelect, setShowMarketplaceSelect] = useState(false)
  const [newMarketplaceId, setNewMarketplaceId] = useState<string>("")

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: product?.name ?? "",
      brandId: product?.brandId ?? "",
      categoryId: product?.categoryId ?? null,
      subcategoryId: product?.subcategoryId ?? null,
      label: product?.label ?? null,
      abcStatus: (product?.abcStatus as "A" | "B" | "C" | null | undefined) ?? null,
      availability:
        (product?.availability as FormValues["availability"]) ?? "IN_STOCK",
      weightKg: product?.weightKg ?? null,
      heightCm: product?.heightCm ?? null,
      widthCm: product?.widthCm ?? null,
      depthCm: product?.depthCm ?? null,
      photoUrl: product?.photoUrl ?? null,
      marketplaces: product?.articles
        ? groupArticlesWithBarcodes(product.articles)
        : [],
      properties: Object.fromEntries(
        (product?.propertyValues ?? []).map((pv) => [pv.propertyId, pv.value])
      ),
      sizes: (product?.sizes ?? []).map((s) => ({ value: s.value })),
    },
  })

  // Phase 17: WB import dialog state
  const [wbImportOpen, setWbImportOpen] = useState(false)

  // ── Field arrays ──────────────────────────────────────────────────

  const {
    fields: marketplaceFields,
    append: appendMarketplace,
    remove: removeMarketplace,
  } = useFieldArray({ control: form.control, name: "marketplaces" })

  // Phase 17: размеры
  const {
    fields: sizeFields,
    append: appendSize,
    remove: removeSize,
  } = useFieldArray({ control: form.control, name: "sizes" })

  // ── Watched values ─────────────────────────────────────────────────

  const watchedBrandId = useWatch({ control: form.control, name: "brandId" })
  const watchedCategoryId = useWatch({ control: form.control, name: "categoryId" })
  const watchedHeight = useWatch({ control: form.control, name: "heightCm" })
  const watchedWidth = useWatch({ control: form.control, name: "widthCm" })
  const watchedDepth = useWatch({ control: form.control, name: "depthCm" })

  // Skip the first render so initial values are not cleared
  const brandMounted = useRef(false)
  const categoryMounted = useRef(false)

  // Clear category+subcategory when brand changes (per D-10)
  useEffect(() => {
    if (!brandMounted.current) {
      brandMounted.current = true
      return
    }
    form.setValue("categoryId", null)
    form.setValue("subcategoryId", null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedBrandId])

  // Clear subcategory when category changes (per D-10)
  useEffect(() => {
    if (!categoryMounted.current) {
      categoryMounted.current = true
      return
    }
    form.setValue("subcategoryId", null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCategoryId])

  // ── Volume auto-calculation ────────────────────────────────────────

  const volumeDisplay =
    watchedHeight && watchedWidth && watchedDepth
      ? ((watchedHeight * watchedWidth * watchedDepth) / 1000).toFixed(1) + " л"
      : "—"

  // ── Reference data derived from current brand ──────────────────────

  const currentBrand = brandsState.find((b) => b.id === watchedBrandId)
  const currentDirectionName = currentBrand?.direction?.name ?? null
  const currentDirectionHasSizes = currentBrand?.direction?.hasSizes ?? false
  const categoryOptions =
    currentBrand?.categories.map((c) => ({ value: c.id, label: c.name })) ?? []

  const currentCategory = currentBrand?.categories.find(
    (c) => c.id === watchedCategoryId
  )
  const subcategoryOptions =
    currentCategory?.subcategories.map((s) => ({ value: s.id, label: s.name })) ?? []

  // Phase 17: свойства активной категории
  const categoryProperties = currentCategory?.properties ?? []

  const brandOptions = brandsState.map((b) => ({ value: b.id, label: b.name }))

  // ── Marketplaces not yet added ─────────────────────────────────────

  const addedMarketplaceIds = new Set(marketplaceFields.map((f) => f.marketplaceId))
  const availableMarketplaces = marketplaces.filter(
    (m) => !addedMarketplaceIds.has(m.id)
  )

  // ── Inline create handlers ─────────────────────────────────────────

  async function handleCreateBrand(name: string) {
    const result = await createBrand({ name })
    if (result.ok) {
      const newBrand: BrandWithCategories = {
        id: result.id,
        name,
        direction: null,
        categories: [],
      }
      setBrandsState((prev) => [...prev, newBrand])
      form.setValue("brandId", result.id)
    } else {
      toast.error(result.error)
    }
  }

  async function handleCreateCategory(name: string) {
    if (!watchedBrandId) return
    const result = await createCategory({ name, brandId: watchedBrandId })
    if (result.ok) {
      const newCategory: CategoryOption = {
        id: result.id,
        name,
        subcategories: [],
        properties: [],
      }
      setBrandsState((prev) =>
        prev.map((b) =>
          b.id === watchedBrandId
            ? { ...b, categories: [...b.categories, newCategory] }
            : b
        )
      )
      form.setValue("categoryId", result.id)
    } else {
      toast.error(result.error)
    }
  }

  async function handleCreateSubcategory(name: string) {
    if (!watchedCategoryId) return
    const result = await createSubcategory({ name, categoryId: watchedCategoryId })
    if (result.ok) {
      setBrandsState((prev) =>
        prev.map((b) =>
          b.id === watchedBrandId
            ? {
                ...b,
                categories: b.categories.map((c) =>
                  c.id === watchedCategoryId
                    ? {
                        ...c,
                        subcategories: [
                          ...c.subcategories,
                          { id: result.id, name },
                        ],
                      }
                    : c
                ),
              }
            : b
        )
      )
      form.setValue("subcategoryId", result.id)
    } else {
      toast.error(result.error)
    }
  }

  // ── Add marketplace group ──────────────────────────────────────────

  function handleAddMarketplace() {
    if (!newMarketplaceId) return
    appendMarketplace({ marketplaceId: newMarketplaceId, articles: [] })
    setNewMarketplaceId("")
    setShowMarketplaceSelect(false)
  }

  // ── Submit handler ─────────────────────────────────────────────────

  async function onSubmit(values: FormValues) {
    // 260421-iq7: marketplaces[].articles[].{value, barcodes[]} — sortOrder генерируется сервером
    // Phase 17 ext: barcodes теперь также содержат productSizeValue (резолвится в FK на сервере)
    const marketplacesData = values.marketplaces.map((mp) => ({
      marketplaceId: mp.marketplaceId,
      articles: mp.articles.map((a) => ({
        value: a.value,
        barcodes: a.barcodes.map((b) => ({
          value: b.value,
          productSizeValue: b.productSizeValue || null,
        })),
      })),
    }))

    // UX warning: товар в наличии без штрих-кодов — не блокирует submit
    const totalBarcodes = values.marketplaces.reduce(
      (sum, mp) =>
        sum + mp.articles.reduce((s, a) => s + a.barcodes.length, 0),
      0
    )
    if (values.availability === "IN_STOCK" && totalBarcodes === 0) {
      toast.warning("Товар без штрих-кодов")
    }

    // Phase 17: подготовка properties + sizes
    // Values формы для свойств — только тех, что есть в текущей категории (если категория сменилась — старые игнорим)
    const propsForSave = categoryProperties.map((p) => ({
      propertyId: p.id,
      value: (values.properties?.[p.id] ?? "").toString(),
    }))
    const sizesForSave = (values.sizes ?? [])
      .map((s) => ({ value: s.value.trim() }))
      .filter((s) => s.value.length > 0)

    startTransition(async () => {
      if (product?.id) {
        // Phase 17 ext (2026-05-11): saveProductSizes ДО updateProduct.
        // updateProduct резолвит barcode.productSizeValue → productSizeId через
        // lookup ProductSize по (productId, value) — размеры должны существовать
        // на момент create Barcode.
        if (currentDirectionHasSizes) {
          const r = await saveProductSizes({ productId: product.id, sizes: sizesForSave })
          if (!r.ok) {
            toast.error(`Размеры: ${r.error}`)
            return
          }
        }
        const result = await updateProduct({
          ...values,
          id: product.id,
          marketplaces: marketplacesData,
          categoryId: values.categoryId ?? undefined,
          subcategoryId: values.subcategoryId ?? undefined,
          abcStatus: values.abcStatus ?? undefined,
          weightKg: values.weightKg ?? undefined,
          heightCm: values.heightCm ?? undefined,
          widthCm: values.widthCm ?? undefined,
          depthCm: values.depthCm ?? undefined,
        })
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        if (propsForSave.length > 0) {
          const r = await saveProductProperties({ productId: product.id, values: propsForSave })
          if (!r.ok) toast.error(`Свойства: ${r.error}`)
        }
        toast.success("Товар сохранён")
        router.refresh()
      } else {
        const result = await createProduct({
          ...values,
          marketplaces: marketplacesData,
          categoryId: values.categoryId ?? undefined,
          subcategoryId: values.subcategoryId ?? undefined,
          abcStatus: values.abcStatus ?? undefined,
          weightKg: values.weightKg ?? undefined,
          heightCm: values.heightCm ?? undefined,
          widthCm: values.widthCm ?? undefined,
          depthCm: values.depthCm ?? undefined,
        })
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        // Phase 17: сохраняем свойства/размеры по id нового товара перед редиректом
        if (propsForSave.length > 0) {
          await saveProductProperties({ productId: result.id, values: propsForSave })
        }
        if (currentDirectionHasSizes && sizesForSave.length > 0) {
          await saveProductSizes({ productId: result.id, sizes: sizesForSave })
        }
        toast.success("Товар создан")
        router.push(`/products/${result.id}/edit`)
      }
    })
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-8">

        {/* Section 1: Основное */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium border-b pb-2">Основное</h2>

          {/* SKU — read-only, only in edit mode */}
          {product?.sku && (
            <div className="space-y-1">
              <p className="text-sm font-medium">УКТ</p>
              <p className="text-sm text-muted-foreground font-mono bg-muted px-3 py-2 rounded-md">{product.sku}</p>
            </div>
          )}

          {/* Name */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Наименование</FormLabel>
                <FormControl>
                  <Input placeholder="Введите название товара" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Brand */}
          <FormField
            control={form.control}
            name="brandId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Бренд</FormLabel>
                <FormControl>
                  <CreatableCombobox
                    options={brandOptions}
                    value={field.value || null}
                    onValueChange={(v) => field.onChange(v ?? "")}
                    onCreate={handleCreateBrand}
                    placeholder="Выберите бренд"
                    createLabel="Создать бренд"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Direction — read-only, derived from selected brand */}
          <div className="space-y-1">
            <p className="text-sm font-medium">Направление</p>
            <p className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-md">
              {currentDirectionName ?? (watchedBrandId ? "Не назначено" : "—")}
            </p>
          </div>

          {/* Category */}
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Категория</FormLabel>
                <FormControl>
                  <CreatableCombobox
                    options={categoryOptions}
                    value={field.value ?? null}
                    onValueChange={(v) => field.onChange(v)}
                    onCreate={handleCreateCategory}
                    placeholder="Выберите категорию"
                    createLabel="Создать категорию"
                    disabled={!watchedBrandId}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Subcategory */}
          <FormField
            control={form.control}
            name="subcategoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Подкатегория</FormLabel>
                <FormControl>
                  <CreatableCombobox
                    options={subcategoryOptions}
                    value={field.value ?? null}
                    onValueChange={(v) => field.onChange(v)}
                    onCreate={handleCreateSubcategory}
                    placeholder="Выберите подкатегорию"
                    createLabel="Создать подкатегорию"
                    disabled={!watchedCategoryId}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Label */}
          <FormField
            control={form.control}
            name="label"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ярлык</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Введите ярлык"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value || null)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* ABC Status */}
          <FormField
            control={form.control}
            name="abcStatus"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ABC-статус</FormLabel>
                <FormControl>
                  <NativeSelect
                    value={field.value ?? ""}
                    onChange={(v) => field.onChange(v === "" ? null : v)}
                  >
                    <option value="">Не указан</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </NativeSelect>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Availability */}
          <FormField
            control={form.control}
            name="availability"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Наличие</FormLabel>
                <FormControl>
                  <NativeSelect value={field.value} onChange={field.onChange}>
                    <option value="IN_STOCK">Есть</option>
                    <option value="OUT_OF_STOCK">Нет в наличии</option>
                    <option value="DISCONTINUED">Выведен из ассортимента</option>
                  </NativeSelect>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        {/* Section 1.5: Свойства (Phase 17) — динамические по категории товара */}
        {watchedCategoryId && categoryProperties.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-medium border-b pb-2 flex items-center justify-between">
              <span>Свойства</span>
              {product?.id && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setWbImportOpen(true)}
                >
                  Импортировать из WB
                </Button>
              )}
            </h2>
            {categoryProperties.map((prop) => (
              <FormField
                key={prop.id}
                control={form.control}
                name={`properties.${prop.id}` as const}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{prop.name}</FormLabel>
                    <FormControl>
                      {prop.kind === "ENUM" ? (
                        <NativeSelect
                          value={field.value ?? ""}
                          onChange={(v) => field.onChange(v)}
                        >
                          <option value="">— не указано —</option>
                          {prop.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                          {/* Если текущее значение не входит в options (например, multi-value из WB) — оставляем как «прочее» */}
                          {field.value &&
                            !prop.options.includes(field.value) && (
                              <option value={field.value}>{field.value}</option>
                            )}
                        </NativeSelect>
                      ) : prop.kind === "NUMBER" ? (
                        <Input
                          type="number"
                          step="any"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value)}
                          placeholder="0"
                        />
                      ) : (
                        <Input
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value)}
                          placeholder={prop.wbAttrName ? `Из WB: «${prop.wbAttrName}»` : ""}
                        />
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </section>
        )}

        {/* Section 1.6: Размерная сетка (Phase 17) — только если у направления hasSizes.
            Компактный chips-layout: все размеры в одну строку с inline-добавлением. */}
        {currentDirectionHasSizes && (
          <section className="space-y-3">
            <h2 className="text-lg font-medium border-b pb-2 flex items-center justify-between">
              <span>Размерная сетка</span>
              {product?.id && categoryProperties.length === 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setWbImportOpen(true)}
                >
                  Импортировать из WB
                </Button>
              )}
            </h2>
            <SizesChipEditor
              sizeFields={sizeFields}
              form={form}
              onAdd={(value) => appendSize({ value })}
              onRemove={removeSize}
            />
          </section>
        )}

        {/* Section 2: Фото */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium border-b pb-2">Фото</h2>

          <FormField
            control={form.control}
            name="photoUrl"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <PhotoUploadField
                    productId={product?.id}
                    currentPhotoUrl={field.value ?? null}
                    onUploadComplete={(url) => field.onChange(url)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        {/* Section 3: Артикулы маркетплейсов (со штрих-кодами справа) */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium border-b pb-2">
            Артикулы маркетплейсов
          </h2>

          <div className="space-y-3">
            {marketplaceFields.map((mpField, groupIndex) => {
              const mp = marketplaces.find((m) => m.id === mpField.marketplaceId)
              return (
                <MarketplaceGroupInline
                  key={mpField.id}
                  groupIndex={groupIndex}
                  marketplaceName={mp?.name ?? mpField.marketplaceId}
                  form={form}
                  directionHasSizes={currentDirectionHasSizes}
                  onRemoveGroup={() => removeMarketplace(groupIndex)}
                />
              )
            })}
          </div>

          {showMarketplaceSelect ? (
            <div className="flex gap-2 items-center">
              <NativeSelect
                value={newMarketplaceId}
                onChange={(v) => setNewMarketplaceId(v)}
                className="flex-1"
              >
                <option value="">Выберите маркетплейс</option>
                {availableMarketplaces.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </NativeSelect>
              <Button
                type="button"
                size="sm"
                onClick={handleAddMarketplace}
                disabled={!newMarketplaceId}
              >
                Добавить
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowMarketplaceSelect(false)
                  setNewMarketplaceId("")
                }}
              >
                Отмена
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowMarketplaceSelect(true)}
              disabled={availableMarketplaces.length === 0}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Добавить маркетплейс
            </Button>
          )}
        </section>

        {/* Section 4: Характеристики */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium border-b pb-2">Характеристики</h2>

          {/* Weight */}
          <FormField
            control={form.control}
            name="weightKg"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Вес, кг</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={field.value ?? ""}
                    onChange={(e) => {
                      const val = e.target.value
                      field.onChange(val === "" ? null : parseFloat(val))
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Dimensions — порядок как на WB: Длина × Ширина × Высота */}
          <div className="grid grid-cols-3 gap-3">
            <FormField
              control={form.control}
              name="depthCm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Длина, см</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="0"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const val = e.target.value
                        field.onChange(val === "" ? null : parseFloat(val))
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="widthCm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ширина, см</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="0"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const val = e.target.value
                        field.onChange(val === "" ? null : parseFloat(val))
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="heightCm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Высота, см</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="0"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const val = e.target.value
                        field.onChange(val === "" ? null : parseFloat(val))
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Volume — read-only, auto-calculated */}
          <div className="space-y-1">
            <p className="text-sm font-medium">Объём</p>
            <p className="text-sm text-muted-foreground">{volumeDisplay}</p>
          </div>
        </section>

        {/* Submit */}
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending ? "Сохранение..." : "Сохранить товар"}
        </Button>
      </form>

      {/* Phase 17: WB import dialog */}
      {product?.id && (
        <WbImportDialog
          productId={product.id}
          open={wbImportOpen}
          onOpenChange={setWbImportOpen}
        />
      )}
    </Form>
  )
}

// ── MarketplaceGroupInline ──────────────────────────────────────────
// 260421-iq7: DnD артикулов внутри маркетплейса + каждый артикул двухколоночный
// (артикул слева, штрих-коды справа).

interface MarketplaceGroupInlineProps {
  groupIndex: number
  marketplaceName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: ReturnType<typeof useForm<FormValues, any, any>>
  onRemoveGroup: () => void
  directionHasSizes: boolean
}

function MarketplaceGroupInline({
  groupIndex,
  marketplaceName,
  form,
  onRemoveGroup,
  directionHasSizes,
}: MarketplaceGroupInlineProps) {
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: `marketplaces.${groupIndex}.articles`,
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = fields.findIndex((f) => f.id === active.id)
    const newIndex = fields.findIndex((f) => f.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    move(oldIndex, newIndex)
  }

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{marketplaceName}</span>
        <button
          type="button"
          onClick={onRemoveGroup}
          className="text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Удалить маркетплейс"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={fields.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {fields.map((field, articleIndex) => (
              <SortableArticleRow
                key={field.id}
                id={field.id}
                groupIndex={groupIndex}
                articleIndex={articleIndex}
                form={form}
                directionHasSizes={directionHasSizes}
                onRemove={() => remove(articleIndex)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={fields.length >= 10}
        onClick={() => append({ value: "", barcodes: [] })}
        className="gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        Добавить артикул
      </Button>
    </div>
  )
}

// ── SortableArticleRow ─────────────────────────────────────────────
// 260421-iq7: двухколоночный блок — артикул с drag-handle слева, штрих-коды справа.

interface SortableArticleRowProps {
  id: string
  groupIndex: number
  articleIndex: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: ReturnType<typeof useForm<FormValues, any, any>>
  onRemove: () => void
  directionHasSizes: boolean
}

function SortableArticleRow({
  id,
  groupIndex,
  articleIndex,
  form,
  onRemove,
  directionHasSizes,
}: SortableArticleRowProps) {
  // Phase 17 ext: реактивно читаем актуальный список размеров товара из form state
  const watchedSizes = useWatch({ control: form.control, name: "sizes" }) as
    | Array<{ value: string }>
    | undefined
  const sizeOptions = (watchedSizes ?? [])
    .map((s) => (s?.value ?? "").trim())
    .filter((v) => v.length > 0)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : undefined,
  }

  const {
    fields: barcodeFields,
    append: appendBarcode,
    remove: removeBarcode,
  } = useFieldArray({
    control: form.control,
    name: `marketplaces.${groupIndex}.articles.${articleIndex}.barcodes`,
  })

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-md border bg-background p-3"
    >
      <div className="grid gap-3 md:grid-cols-2">
        {/* Левая колонка — drag handle + артикул + удалить */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <button
              type="button"
              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-0.5 shrink-0 touch-none mt-1.5"
              {...attributes}
              {...listeners}
              aria-label="Перетащить для изменения порядка"
            >
              <GripVertical className="h-4 w-4" />
            </button>

            <div className="flex-1 min-w-0">
              <FormField
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                control={form.control as any}
                name={`marketplaces.${groupIndex}.articles.${articleIndex}.value`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">
                      Артикул
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Артикул" {...f} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <button
              type="button"
              onClick={onRemove}
              className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-6"
              aria-label="Удалить артикул"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Правая колонка — штрих-коды */}
        <div className="space-y-2">
          <FormLabel className="text-xs text-muted-foreground">
            Штрих-коды
          </FormLabel>
          <div className="space-y-2">
            {barcodeFields.map((bField, barcodeIndex) => (
              <div key={bField.id} className="flex gap-2 items-start">
                <FormField
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  control={form.control as any}
                  name={`marketplaces.${groupIndex}.articles.${articleIndex}.barcodes.${barcodeIndex}.value`}
                  render={({ field: f }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input placeholder="Штрих-код" {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Phase 17 ext: select «Размер» — виден только если у направления hasSizes */}
                {directionHasSizes && (
                  <FormField
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    control={form.control as any}
                    name={`marketplaces.${groupIndex}.articles.${articleIndex}.barcodes.${barcodeIndex}.productSizeValue`}
                    render={({ field: f }) => (
                      <FormItem className="w-24 shrink-0">
                        <FormControl>
                          <select
                            value={f.value ?? ""}
                            onChange={(e) => f.onChange(e.target.value || null)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            title="Привязать к размеру"
                          >
                            <option value="">— размер —</option>
                            {sizeOptions.map((sz) => (
                              <option key={sz} value={sz}>
                                {sz}
                              </option>
                            ))}
                            {/* Если текущее значение не в options — оставляем чтобы не потерять связь */}
                            {f.value && !sizeOptions.includes(f.value) && (
                              <option value={f.value}>{f.value} (нет)</option>
                            )}
                          </select>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeBarcode(barcodeIndex)}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-2"
                  aria-label="Удалить штрих-код"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={barcodeFields.length >= 20}
            onClick={() => appendBarcode({ value: "", productSizeValue: null })}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить штрих-код
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── SizesChipEditor (Phase 17 ext, 2026-05-11) ─────────────────────
// Компактный chips-layout для размерной сетки: все размеры в одну строку.
// Click на chip → edit. Inline-input «+ добавить» в конце. Без DnD пока —
// порядок задаётся очередностью добавления (sortOrder = index).

interface SizesChipEditorProps {
  sizeFields: Array<{ id: string; value: string }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: ReturnType<typeof useForm<FormValues, any, any>>
  onAdd: (value: string) => void
  onRemove: (index: number) => void
}

function SizesChipEditor({ sizeFields, form, onAdd, onRemove }: SizesChipEditorProps) {
  const [newValue, setNewValue] = useState("")
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")

  function handleAdd() {
    const v = newValue.trim()
    if (!v) return
    onAdd(v)
    setNewValue("")
  }

  function handleStartEdit(index: number, currentValue: string) {
    setEditingIndex(index)
    setEditValue(currentValue)
  }

  function handleSaveEdit() {
    if (editingIndex === null) return
    const v = editValue.trim()
    if (v) {
      form.setValue(`sizes.${editingIndex}.value`, v, { shouldDirty: true })
    }
    setEditingIndex(null)
    setEditValue("")
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {sizeFields.map((field, index) => (
        <FormField
          key={field.id}
          control={form.control}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          name={`sizes.${index}.value` as any}
          render={({ field: f }) => {
            const isEditing = editingIndex === index
            return (
              <FormItem>
                <FormControl>
                  {isEditing ? (
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleSaveEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleSaveEdit()
                        } else if (e.key === "Escape") {
                          setEditingIndex(null)
                          setEditValue("")
                        }
                      }}
                      autoFocus
                      className="h-7 w-20 text-xs px-2"
                    />
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs hover:bg-muted/60 cursor-pointer group"
                      onClick={() => handleStartEdit(index, f.value ?? "")}
                      title="Клик чтобы изменить"
                    >
                      <span>{f.value || "—"}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemove(index)
                        }}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Удалить размер"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </FormControl>
              </FormItem>
            )
          }}
        />
      ))}

      {/* Inline-добавление */}
      <div className="flex items-center gap-1">
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              handleAdd()
            }
          }}
          placeholder={sizeFields.length === 0 ? "S, M, 46…" : "+"}
          className="h-7 w-20 text-xs px-2"
        />
        {newValue.trim() && (
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            onClick={handleAdd}
            aria-label="Добавить размер"
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  )
}
