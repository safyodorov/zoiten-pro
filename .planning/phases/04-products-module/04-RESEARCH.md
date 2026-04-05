# Phase 4: Products Module - Research

**Researched:** 2026-04-05
**Domain:** Next.js 15 App Router — full CRUD module with file upload, dynamic form arrays, soft delete, partial unique indexes
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Product List**
- D-01: Table layout — фото (48x64 thumbnail), наименование, бренд, категория, ABC badge, наличие badge, действия
- D-02: Filter by availability — tabs/button group: "Есть" (default), "Нет в наличии", "Выведен", "Удалено", "Все"
- D-03: Text search, debounced, filters by product name
- D-04: Server-side pagination, 20 items per page
- D-05: Click row → navigate to /products/[id]/edit
- D-06: Action buttons per row: Копировать, Удалить (soft delete)

**Product Form**
- D-07: Separate page, NOT modal — /products/new and /products/[id]/edit
- D-08: Form sections: Основное, Фото, Артикулы маркетплейсов, Штрих-коды, Характеристики
- D-09: Brand and category use CreatableCombobox from Phase 3
- D-10: Subcategory combobox filters by selected category

**Photo Upload**
- D-11: Drag-n-drop zone + file select button. Preview in 3:4 aspect ratio
- D-12: Client-side validation: JPEG/PNG only, max 2048×2048 pixels
- D-13: Upload via Route Handler (POST /api/upload) — multipart/form-data, NOT Server Action
- D-14: Store at /var/www/zoiten-uploads/ (prod) or /tmp/zoiten-uploads/ (dev)
- D-15: Filename: {productId}-{timestamp}.{ext}
- D-16: Nginx serves /uploads/ → /var/www/zoiten-uploads/ (Phase 6)
- D-17: Dev: serve via /api/uploads/[...path] catch-all Route Handler

**Marketplace Articles**
- D-18: Grouped by marketplace
- D-19: "Добавить артикул" per marketplace. Integer input, max 10 per marketplace
- D-20: "Добавить маркетплейс" button at bottom
- D-21: Stored in MarketplaceArticle table (normalized, not JSON)

**Barcodes**
- D-22: Dynamic list — min 1, max 20
- D-23: Each barcode = text input + delete button

**Dimensions & Volume**
- D-24: Weight (kg), Height, Width, Depth (cm) — number inputs
- D-25: Volume = (H × W × D) / 1000 liters — read-only, auto-calculated

**Duplicate Product**
- D-26: Server Action copies all fields except: id, photo, createdAt, updatedAt
- D-27: Duplicate name prefixed with "Копия — "
- D-28: Redirect to edit page of new product

**Soft Delete**
- D-29: Server Action sets deletedAt = now() and availability = DISCONTINUED
- D-30: Soft-deleted products hidden from default list
- D-31: "Удалено" tab shows soft-deleted with deletion date
- D-32: Auto-purge: /api/cron/purge-deleted deletes products where deletedAt < 30 days ago
- D-33: Purge endpoint protected by CRON_SECRET env var
- D-34: systemd timer calls purge endpoint daily (Phase 6)

**Partial Unique Indexes**
- D-35: Barcode uniqueness: partial index WHERE deletedAt IS NULL (raw SQL migration)
- D-36: MarketplaceArticle uniqueness: per-marketplace partial index WHERE deletedAt IS NULL

### Claude's Discretion
- Exact form layout and spacing
- Loading skeletons for product list
- Image compression/resizing (Sharp optional — defer to Phase 6 if complex)
- Form autosave vs explicit save button (recommend explicit save)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROD-01 | Product list with pagination, filtered by availability | Server-side searchParams pattern, Prisma where + skip/take |
| PROD-02 | Toggle buttons for other availability statuses | URL-based filter state via searchParams |
| PROD-03 | Create product with all fields: name, photo, brand, category, subcategory, ABC, availability | react-hook-form + zod, CreatableCombobox integration |
| PROD-04 | Add marketplace articles (up to 10 per marketplace) | useFieldArray nested pattern (marketplace groups → articles) |
| PROD-05 | Add barcodes (1-20 per product) | useFieldArray simple list |
| PROD-06 | Dimensions + auto-calculated volume | watch() for live computed value in RHF |
| PROD-07 | Clicking product opens edit form | Route /products/[id]/edit, server-side data prefill |
| PROD-08 | Duplicate product (deep copy except photo) | Server Action with prisma.product.create from existing data |
| PROD-09 | Soft delete (status = "удалено") | Server Action sets deletedAt + availability = DISCONTINUED |
| PROD-10 | Auto-purge after 30 days | /api/cron/purge-deleted Route Handler protected by CRON_SECRET |
| PROD-11 | Photo upload to VPS filesystem | POST /api/upload Route Handler, node:fs, /tmp vs /var/www |
| PROD-12 | Text search across product names | Prisma where { name: { contains: q, mode: 'insensitive' } } |
| PROD-13 | Marketplace articles with DB-level uniqueness per marketplace | Partial unique index on MarketplaceArticle |
| PROD-14 | Barcode uniqueness constraint with partial index WHERE deletedAt IS NULL | Raw SQL migration adding partial unique index on Barcode.value |
</phase_requirements>

---

## Summary

Phase 4 implements the full Products module — the core ERP entity. It is the largest phase (14 requirements) and spans: a paginated/searchable product list, a multi-section creation/edit form, photo upload to VPS filesystem, dynamic marketplace article groups, barcode lists, soft delete with cron purge, and database-level partial unique indexes.

The technical complexity is concentrated in three areas: (1) the product form, which uses react-hook-form with nested `useFieldArray` for marketplace article groups; (2) photo handling, which requires a Route Handler (not Server Action) for binary uploads plus a dev-time catch-all Route Handler to serve files outside `/public`; and (3) partial unique indexes, which require raw SQL migration because `partialIndexes` is not available as a preview feature in Prisma 6.

All patterns follow the conventions established in Phases 1-3: RSC pages for server data, Server Actions with `requireSection("PRODUCTS")` + Zod validation, shadcn/ui components, and CreatableCombobox for brand/category selection.

**Primary recommendation:** Follow established codebase patterns strictly. The only truly new patterns are (a) Route Handler for file upload with node:fs, (b) nested useFieldArray for marketplace article groups, and (c) raw SQL migration for partial indexes.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-hook-form | ^7.72.1 (installed) | Form state, validation, dynamic arrays | Already in project, useFieldArray for dynamic lists |
| zod | ^4.3.6 (installed) | Schema validation on client + server | Already in project, matches server action pattern |
| @hookform/resolvers | ^5.2.2 (installed) | zodResolver bridge for RHF | Already in project |
| next (App Router) | ^15.5.14 (installed) | Route Handlers, Server Actions, RSC | Project framework |
| prisma | ^6.19.3 (installed) | ORM for all DB operations | Project ORM |
| node:fs | built-in | Write uploaded file to filesystem | No external library needed |
| node:path | built-in | Path construction for upload dirs | No external library needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonner | ^2.0.7 (installed) | Toast notifications | Form save, duplicate, delete feedback |
| lucide-react | ^1.7.0 (installed) | Icons (Upload, X, Plus, Trash2) | All action icons |
| shadcn/ui components | all installed | Table, Badge, Tabs, Card, Input, Button | All UI primitives |

### No New Dependencies Required

All required functionality is achievable with libraries already installed. No new `npm install` is needed for Phase 4.

**Confirm installed versions:**
```bash
cat package.json | grep -E '"react-hook-form"|"zod"|"next"'
# react-hook-form: ^7.72.1 ✓
# zod: ^4.3.6 ✓
# next: ^15.5.14 ✓
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native drag-drop (HTML5 events) | react-dropzone | react-dropzone is simpler but adds a dependency; native is sufficient for single-file 3:4 photo |
| node:fs.writeFile | Sharp + resize | Sharp adds image processing but CONTEXT.md defers compression to Phase 6 |
| Raw SQL migration for partial index | partialIndexes preview feature | partialIndexes is not available in Prisma 6.x, only 7.x+ |

---

## Architecture Patterns

### Recommended Project Structure

```
app/
├── (dashboard)/
│   └── products/
│       ├── page.tsx                    # Product list (RSC, searchParams)
│       ├── new/
│       │   └── page.tsx                # New product form (RSC, loads reference data)
│       └── [id]/
│           └── edit/
│               └── page.tsx            # Edit product form (RSC, loads product + references)
├── api/
│   ├── upload/
│   │   └── route.ts                    # POST — multipart upload, writes to filesystem
│   ├── uploads/
│   │   └── [...path]/
│   │       └── route.ts                # GET — serve files from filesystem (dev only)
│   └── cron/
│       └── purge-deleted/
│           └── route.ts                # GET — delete products where deletedAt < 30d
app/
└── actions/
    └── products.ts                     # Server Actions: create, update, softDelete, duplicate
components/
└── products/
    ├── ProductTable.tsx                 # Client component: table with actions
    ├── ProductFilters.tsx               # Client component: status tabs + search input
    ├── ProductForm.tsx                  # Client component: full form with RHF
    ├── PhotoUpload.tsx                  # Client component: drag-drop + preview
    ├── MarketplaceArticleSection.tsx    # Client component: grouped useFieldArray
    └── BarcodeSection.tsx               # Client component: simple useFieldArray
```

### Pattern 1: Server-Side Pagination with searchParams (Next.js 15)

**What:** Page component receives `searchParams` as an async Promise. Await it, pass `q`, `status`, `page` to Prisma query.

**When to use:** All product list filtering, searching, paging.

```typescript
// app/(dashboard)/products/page.tsx
// Source: Next.js docs — searchParams is async in Next.js 15
type SearchParams = Promise<{
  q?: string
  status?: string
  page?: string
}>

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const q = params.q ?? ""
  const status = params.status ?? "IN_STOCK"
  const page = Number(params.page ?? "1")
  const PAGE_SIZE = 20

  const where = {
    deletedAt: status === "DELETED" ? { not: null } : null,
    availability: status !== "ALL" && status !== "DELETED"
      ? status as Availability
      : undefined,
    name: q ? { contains: q, mode: "insensitive" as const } : undefined,
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { brand: true, category: true },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.count({ where }),
  ])

  return <ProductsClientShell products={products} total={total} page={page} />
}
```

**CRITICAL:** In Next.js 15, `searchParams` is a `Promise` — always `await` it. Synchronous access is deprecated.

### Pattern 2: Route Handler for File Upload

**What:** POST Route Handler reads `formData()`, validates file type/size, writes to filesystem with `node:fs/promises`.

**When to use:** D-13 — binary uploads cannot go through Server Actions reliably.

```typescript
// app/api/upload/route.ts
// Source: Next.js Route Handler docs — formData() native API
import { writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export const runtime = "nodejs" // explicit: need node:fs

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const form = await req.formData()
  const file = form.get("file")
  const productId = form.get("productId") as string

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 })
  }

  // Server-side MIME validation
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    return NextResponse.json({ error: "JPEG or PNG only" }, { status: 400 })
  }

  const uploadDir =
    process.env.NODE_ENV === "production"
      ? "/var/www/zoiten-uploads"
      : "/tmp/zoiten-uploads"

  await mkdir(uploadDir, { recursive: true })

  const ext = file.type === "image/jpeg" ? "jpg" : "png"
  const filename = `${productId}-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  await writeFile(join(uploadDir, filename), buffer)

  return NextResponse.json({ url: `/uploads/${filename}` })
}
```

**Note:** `export const runtime = "nodejs"` is optional (Node.js is the default runtime) but recommended for clarity when using `node:fs`.

### Pattern 3: Dev File Serving Catch-All Route Handler

**What:** In development, nginx is not configured yet. A catch-all Route Handler reads files from `/tmp/zoiten-uploads/` and streams them.

**When to use:** D-17 — dev environment only. Production uses nginx (Phase 6).

```typescript
// app/api/uploads/[...path]/route.ts
// Source: Next.js catch-all routes + node:fs.readFile
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // Only serve in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { path } = await params  // params is async in Next.js 15
  const filename = path.join("/")
  const uploadDir = "/tmp/zoiten-uploads"

  try {
    const buffer = await readFile(join(uploadDir, filename))
    const ext = filename.split(".").pop()?.toLowerCase()
    const contentType = ext === "png" ? "image/png" : "image/jpeg"

    return new NextResponse(buffer, {
      headers: { "Content-Type": contentType },
    })
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
}
```

**CRITICAL:** In Next.js 15, dynamic route `params` is also a Promise — `await params`.

### Pattern 4: useFieldArray for Barcodes (Simple List)

**What:** Single `useFieldArray` for a flat list of barcode strings.

```typescript
// Inside ProductForm.tsx
// Source: react-hook-form.com/docs/usefieldarray
const { fields, append, remove } = useFieldArray({
  control,
  name: "barcodes",
})

// Render
{fields.map((field, index) => (
  <div key={field.id} className="flex gap-2">
    <Input {...register(`barcodes.${index}.value`)} />
    <Button type="button" variant="ghost" onClick={() => remove(index)}>
      <Trash2 className="h-4 w-4" />
    </Button>
  </div>
))}
<Button type="button" onClick={() => append({ value: "" })}>
  Добавить штрих-код
</Button>
```

**Key rule:** Use `field.id` (not `index`) as the React `key`.

### Pattern 5: Nested useFieldArray for Marketplace Articles

**What:** An array of marketplace objects, each containing an array of article strings. Two-level nesting.

**When to use:** D-18 — marketplace groups with per-marketplace articles.

```typescript
// Zod schema shape:
// marketplaces: Array<{ marketplaceId: string; articles: Array<{ value: string }> }>

// Outer array (marketplace groups)
const { fields: mpFields, append: appendMp, remove: removeMp } = useFieldArray({
  control,
  name: "marketplaces",
})

// Inner component handles one marketplace's articles
function MarketplaceRow({ index, control, register }: { index: number; ... }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `marketplaces.${index}.articles` as const,
  })
  // render articles for this marketplace
}
```

**Key rule:** Extract inner `useFieldArray` into a sub-component to avoid Rules of Hooks violations. Cast the `name` string with `as const` for TypeScript.

### Pattern 6: Soft Delete Server Action

```typescript
// app/actions/products.ts
"use server"
export async function softDeleteProduct(id: string): Promise<ActionResult> {
  try {
    await requireSection("PRODUCTS")
    await prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        availability: "DISCONTINUED",
      },
    })
    revalidatePath("/products")
    return { ok: true }
  } catch (e) {
    // ... standard error handling
  }
}
```

### Pattern 7: Cron Purge Endpoint

```typescript
// app/api/cron/purge-deleted/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const result = await prisma.product.deleteMany({
    where: { deletedAt: { lt: cutoff } },
  })
  return NextResponse.json({ deleted: result.count })
}
```

### Pattern 8: Partial Unique Index via Raw SQL Migration

**What:** Prisma 6 does NOT support `partialIndexes` preview feature (available only in Prisma 7+). Must use raw SQL migration.

**Process:**
1. Schema change (remove `@unique` from `Barcode.value`, add `@@unique` or leave unmarked)
2. Run `npx prisma migrate dev --create-only` to generate blank migration
3. Edit `.sql` file to add raw index SQL
4. Run `npx prisma migrate dev` to apply

```sql
-- Migration SQL for Barcode partial unique index
-- Drop the old global unique constraint first
DROP INDEX IF EXISTS "Barcode_value_key";

-- Create partial unique index: barcodes unique only among non-deleted products
CREATE UNIQUE INDEX "Barcode_value_active_idx"
  ON "Barcode"("value")
  WHERE (SELECT "deletedAt" FROM "Product" WHERE "Product"."id" = "Barcode"."productId") IS NULL;
```

**Alternative simpler approach** (recommended): The partial index goes on the product's `deletedAt` field directly. Since `Barcode` has a `productId` FK, the partial index should be on the product. A simpler partial index:

```sql
-- Barcode value unique among products that are not deleted
-- This is a functional partial index — unique on barcode value where product not deleted
CREATE UNIQUE INDEX "barcode_value_not_deleted_idx"
  ON "Barcode"("value")
  WHERE EXISTS (
    SELECT 1 FROM "Product"
    WHERE "Product"."id" = "Barcode"."productId"
    AND "Product"."deletedAt" IS NULL
  );
```

**IMPORTANT NOTE:** The existing `Barcode.value @unique` in schema.prisma creates a global unique constraint. The migration must DROP that constraint first, then CREATE the partial one. Also update schema.prisma to remove `@unique` from `Barcode.value` to prevent Prisma from trying to add it back. Leave a comment explaining why.

**For MarketplaceArticle:** The `@@unique([productId, marketplaceId, article])` already prevents duplicate articles per product+marketplace combo. D-36 calls for a partial index to allow reuse of article numbers across deleted products:

```sql
DROP INDEX IF EXISTS "MarketplaceArticle_productId_marketplaceId_article_key";

CREATE UNIQUE INDEX "marketplace_article_active_idx"
  ON "MarketplaceArticle"("marketplaceId", "article")
  WHERE EXISTS (
    SELECT 1 FROM "Product"
    WHERE "Product"."id" = "MarketplaceArticle"."productId"
    AND "Product"."deletedAt" IS NULL
  );
```

### Pattern 9: Client-Side Image Validation

**What:** Before uploading, validate MIME type and resolution in the browser using `FileReader` + `Image` object.

```typescript
async function validateImage(file: File): Promise<string | null> {
  // MIME check
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    return "Только JPEG или PNG"
  }

  // Resolution check via Image element
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url) // cleanup
      if (img.naturalWidth > 2048 || img.naturalHeight > 2048) {
        resolve("Максимальное разрешение 2048×2048")
      } else {
        resolve(null) // valid
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve("Не удалось прочитать изображение")
    }
    img.src = url
  })
}
```

**Memory management:** Always call `URL.revokeObjectURL()` after the Image loads or errors.

### Anti-Patterns to Avoid

- **Server Action for file upload:** Binary `File` objects cannot be reliably serialized through Server Action boundaries. Use Route Handler (D-13).
- **Storing volume in DB:** Volume = H × W × D / 1000 is computed at read time. Never store it (per schema comment).
- **Using index as React key with useFieldArray:** Use `field.id` (auto-generated stable UUID) as the key to prevent re-render bugs.
- **Synchronous searchParams access:** In Next.js 15, `searchParams` is a Promise. Synchronous access logs deprecation warnings and will break in a future version.
- **Global `@unique` on Barcode.value after migration:** Once replaced with partial index, remove `@unique` from schema to prevent Prisma from fighting the migration.
- **Using `prisma migrate dev` on VPS:** Production uses `prisma migrate deploy`. The migration plan must note this distinction.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form state with dynamic arrays | Custom array state + handlers | react-hook-form useFieldArray | Handles key stability, dirty tracking, validation |
| Zod validation bridge | Manual error parsing | @hookform/resolvers zodResolver | Already installed, prevents type mismatches |
| Toast notifications | Custom alert components | sonner (toast()) | Already installed and wired |
| UUID/unique IDs for form fields | Custom id generator | useFieldArray's auto-generated `field.id` | Stable, React-safe |
| MIME type validation | File extension check | `file.type` MIME check + Image.naturalWidth | Extension can be spoofed; also check server-side |
| Availability tab state in URL | useState / localStorage | URL searchParams | Shareable, refresh-safe, no hydration issues |

**Key insight:** Every problem in this phase has a solved library or platform pattern. The form complexity (nested arrays) is the one area where incorrect hand-rolling causes subtle bugs; `useFieldArray` handles this correctly.

---

## Common Pitfalls

### Pitfall 1: Prisma Removes Custom Partial Index on Next Migration

**What goes wrong:** After manually adding a partial index SQL to a migration file, running `prisma migrate dev` again generates a `DROP INDEX` statement for it in the next migration (because Prisma sees schema drift).

**Why it happens:** The Prisma schema has `@unique` on `Barcode.value`, but the DB has a partial index (different shape). Prisma sees the standard `@unique` is missing and tries to add it back.

**How to avoid:**
1. Remove `@unique` from `Barcode.value` in schema.prisma before creating the migration.
2. Add a comment in schema.prisma explaining the partial index is managed manually.
3. The migration that drops the old constraint and creates the partial index must be written carefully.

**Warning signs:** `prisma migrate status` shows pending migrations or drift warning after partial index creation.

### Pitfall 2: File Not Found After Upload (Path Mismatch)

**What goes wrong:** Upload writes to `/tmp/zoiten-uploads/foo.jpg` but the app stores `photoUrl = '/uploads/foo.jpg'`. The dev serve route reads from wrong directory.

**How to avoid:** Keep a single source of truth for the upload dir: `UPLOAD_DIR` constant or env var. The stored `photoUrl` should be just `/uploads/filename` (relative path). The dev route maps `/uploads/{filename}` → `${UPLOAD_DIR}/filename`.

**Warning signs:** Images show broken icon in product list.

### Pitfall 3: useFieldArray Key Instability

**What goes wrong:** Using `index` as React `key` instead of `field.id` causes inputs to lose focus and values to shift when items are removed from the middle of the array.

**How to avoid:** Always `key={field.id}`. The `id` is auto-generated by `useFieldArray` as a stable UUID.

**Warning signs:** Deleting a middle item shifts all subsequent item values unexpectedly.

### Pitfall 4: Next.js 15 — params and searchParams Are Promises

**What goes wrong:** `const { id } = params` (synchronous) works in dev but causes errors or deprecation warnings. `const { q } = searchParams` fails silently or returns undefined.

**How to avoid:** Always `const { id } = await params` and `const params = await searchParams` in page/route components. Use `Promise<{ ... }>` type annotations.

**Warning signs:** TypeScript type errors on `params.id` — TypeScript sees `Promise<{id: string}>` not `{id: string}`.

### Pitfall 5: Soft Delete Not Filtering from Joins

**What goes wrong:** When querying products, you filter by `deletedAt: null` but forget to also handle the "DELETED" tab correctly. Or: subcategory/brand queries accidentally include deleted products.

**How to avoid:** The `where` clause for the list must explicitly handle all 5 states: IN_STOCK, OUT_OF_STOCK, DISCONTINUED, DELETED (deletedAt not null), ALL. Test each tab.

### Pitfall 6: File Upload Route in Edge Runtime

**What goes wrong:** Next.js routes can silently run in Edge runtime where `node:fs` is unavailable.

**How to avoid:** Add `export const runtime = "nodejs"` at the top of `app/api/upload/route.ts` and `app/api/uploads/[...path]/route.ts`.

### Pitfall 7: Zod 4 + react-hook-form Coerce for Number Fields

**What goes wrong:** HTML `<input type="number">` returns string values. `z.number()` rejects strings. Form doesn't validate.

**How to avoid:** Use `z.coerce.number().optional()` for all numeric fields (weightKg, heightCm, etc.). Zod 4 `z.coerce.number()` converts `""` to `0` — use `.optional().nullable()` with `.or(z.literal(""))` or a custom transform to handle empty inputs as `null`.

**Recommended schema for optional numeric fields:**
```typescript
weightKg: z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z.number().positive().optional()
)
```

---

## Code Examples

### Prisma Query for Product List with All Filters

```typescript
// Source: Prisma docs — where, skip, take, orderBy
const isDeleted = status === "DELETED"
const where: Prisma.ProductWhereInput = {
  ...(isDeleted
    ? { deletedAt: { not: null } }
    : { deletedAt: null }),
  ...(status !== "ALL" && status !== "DELETED"
    ? { availability: status as Availability }
    : {}),
  ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
}

const [products, total] = await Promise.all([
  prisma.product.findMany({
    where,
    include: { brand: true, category: true },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  }),
  prisma.product.count({ where }),
])
```

### Debounced Search Input (Client Component)

```typescript
// Client component — filters update URL searchParams
"use client"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useCallback, useTransition } from "react"
import { useDebouncedCallback } from "use-debounce" // OR manual setTimeout

// Without extra library — manual debounce with useCallback + setTimeout
const handleSearch = useCallback(
  (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set("q", value)
    else params.delete("q")
    params.delete("page") // reset pagination
    router.push(`${pathname}?${params.toString()}`)
  },
  [router, pathname, searchParams]
)
```

**Note:** No extra debounce library needed. Use `setTimeout` + `clearTimeout` in a `useRef` for a clean implementation.

### Duplicate Product Server Action

```typescript
"use server"
export async function duplicateProduct(id: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    await requireSection("PRODUCTS")

    const source = await prisma.product.findUniqueOrThrow({
      where: { id },
      include: { articles: true, barcodes: true },
    })

    const newProduct = await prisma.product.create({
      data: {
        name: `Копия — ${source.name}`,
        brandId: source.brandId,
        categoryId: source.categoryId,
        subcategoryId: source.subcategoryId,
        abcStatus: source.abcStatus,
        availability: source.availability,
        weightKg: source.weightKg,
        heightCm: source.heightCm,
        widthCm: source.widthCm,
        depthCm: source.depthCm,
        // photoUrl intentionally omitted (D-26)
        barcodes: {
          create: source.barcodes.map((b) => ({ value: `${b.value}-copy-${Date.now()}` })),
        },
        articles: {
          create: source.articles.map((a) => ({
            marketplaceId: a.marketplaceId,
            article: a.article,
          })),
        },
      },
    })

    revalidatePath("/products")
    return { ok: true, id: newProduct.id }
  } catch (e) {
    // standard error handling
  }
}
```

**Note on barcode duplication:** Barcodes must be unique. Duplicating barcodes verbatim will violate the unique constraint. Either omit barcodes from the copy, or append a suffix. Product spec says "all fields except photo" — clarify in plan that barcodes are NOT copied (they are external references, not internal fields) or copied with a suffix. Recommend: copy barcodes with `-kopiya` suffix and let user edit.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getServerSideProps` + query params | RSC page + async `searchParams` | Next.js 13+ App Router | Simpler, no extra API layer |
| `formidable` / `busboy` for multipart | Native `req.formData()` | Next.js 13+ Route Handlers | No extra library needed |
| Pages Router API routes | App Router Route Handlers (`route.ts`) | Next.js 13+ | Different export pattern (named functions) |
| `params` / `searchParams` as sync props | `params` / `searchParams` as async Promises | Next.js 15 | Must `await` both |
| Raw SQL migration for partial indexes | `partialIndexes` preview feature | Prisma 7.x (NOT Prisma 6) | Prisma 6 must still use raw SQL migration |
| `@unique` on barcode value (Phase 1 MVP) | Partial unique index WHERE deletedAt IS NULL | Phase 4 migration task | Allows reuse of barcodes after soft-delete |

**Deprecated/outdated in this project:**
- `Barcode.value @unique`: Must be replaced with partial unique index in Phase 4 migration (noted in schema.prisma)
- `export const config` (Pages Router): Not needed in App Router Route Handlers

---

## Open Questions

1. **Barcode duplication in copy action**
   - What we know: D-26 says copy "all fields except photo, id, createdAt, updatedAt"
   - What's unclear: Barcodes are globally unique — exact copy would conflict. Recommendation: omit barcodes from duplicate (user adds fresh ones) rather than copying with suffix. Flag this in plan as a decision to make explicit.

2. **Photo cleanup on product update**
   - What we know: Phase 4 stores files at `{productId}-{timestamp}.ext`. Each re-upload creates a new file.
   - What's unclear: Should old photo files be deleted from disk when a new photo is uploaded? D-15 (timestamped filenames) implies accumulation. Recommendation: delete old file during update — log it, don't fail if file missing.

3. **`/api/uploads/[...path]` in production standalone build**
   - What we know: `next.config.ts` has `output: "standalone"`. The catch-all route is guarded by `NODE_ENV !== production`.
   - What's unclear: Whether the standalone build correctly skips this route guard. Recommendation: Test in dev; production photos served by nginx (Phase 6).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Next.js dev server | Product list, form, upload | Not running (dev starts manually) | 15.5.14 (package.json) | `npm run dev` |
| PostgreSQL | All Prisma queries | Not locally installed | — | VPS only (Phase 6); test with mock or skip DB tests |
| node:fs | Upload Route Handler | Built-in Node.js | Node.js runtime | — |
| /tmp/zoiten-uploads/ | Dev photo serving | Created at runtime by mkdir({ recursive: true }) | — | Auto-created |

**Missing dependencies with no fallback:**
- PostgreSQL locally — migrations and data-dependent tests cannot run locally; the established project pattern is to run migrations on VPS during Phase 6 deploy.

**Missing dependencies with fallback:**
- Local Next.js server — start with `npm run dev` as part of task execution.

---

## Validation Architecture

### Test Framework

No test framework is currently installed. `package.json` `test` script returns error code 1.

| Property | Value |
|----------|-------|
| Framework | None installed — Wave 0 must add vitest |
| Config file | None — `vitest.config.ts` to be created in Wave 0 |
| Quick run command | `npx vitest run --reporter=verbose` (after Wave 0 install) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROD-01 | Product list pagination returns 20 items, correct total | unit | `npx vitest run tests/products/list.test.ts` | ❌ Wave 0 |
| PROD-02 | Status filter WHERE clause correct for each tab value | unit | `npx vitest run tests/products/list.test.ts` | ❌ Wave 0 |
| PROD-03 | Product create Server Action validates required fields, rejects invalid | unit | `npx vitest run tests/products/actions.test.ts` | ❌ Wave 0 |
| PROD-04 | Articles max-10-per-marketplace enforced in service layer | unit | `npx vitest run tests/products/actions.test.ts` | ❌ Wave 0 |
| PROD-05 | Barcodes min-1, max-20 enforced in service layer | unit | `npx vitest run tests/products/actions.test.ts` | ❌ Wave 0 |
| PROD-06 | Volume formula = (H × W × D) / 1000 — pure function test | unit | `npx vitest run tests/products/volume.test.ts` | ❌ Wave 0 |
| PROD-07 | Edit page loads product data for form prefill | manual smoke | `npm run dev` → visit /products/{id}/edit | — |
| PROD-08 | Duplicate creates new product with "Копия — " prefix | unit | `npx vitest run tests/products/actions.test.ts` | ❌ Wave 0 |
| PROD-09 | Soft delete sets deletedAt and DISCONTINUED availability | unit | `npx vitest run tests/products/actions.test.ts` | ❌ Wave 0 |
| PROD-10 | Purge endpoint deletes products where deletedAt > 30d ago | unit | `npx vitest run tests/products/cron.test.ts` | ❌ Wave 0 |
| PROD-11 | Upload Route Handler writes file to correct directory | manual smoke | `npm run dev` → upload photo via form | — |
| PROD-12 | Search by name (case-insensitive contains) | unit | `npx vitest run tests/products/list.test.ts` | ❌ Wave 0 |
| PROD-13 | MarketplaceArticle uniqueness constraint enforced | unit | `npx vitest run tests/products/actions.test.ts` | ❌ Wave 0 |
| PROD-14 | Barcode partial unique index created in migration | manual verification | `prisma migrate status` on VPS | — |

**Note on DB-dependent tests:** Tests for Server Actions that require Prisma queries should use `vi.mock("@/lib/prisma")` to mock the Prisma client, avoiding the need for a local PostgreSQL instance. Tests for pure business logic (volume formula, Zod schema validation) need no DB.

### Sampling Rate

- **Per task commit:** `npx vitest run tests/products/ --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/products/list.test.ts` — covers PROD-01, PROD-02, PROD-12 (Prisma mock)
- [ ] `tests/products/actions.test.ts` — covers PROD-03 through PROD-09, PROD-13 (Prisma mock)
- [ ] `tests/products/cron.test.ts` — covers PROD-10 (Prisma mock)
- [ ] `tests/products/volume.test.ts` — covers PROD-06 (pure function, no mock needed)
- [ ] `vitest.config.ts` — framework config pointing to `tests/` directory
- [ ] Framework install: `npm install --save-dev vitest @vitejs/plugin-react` (if React component tests needed) or `npm install --save-dev vitest` for pure unit tests

---

## Project Constraints (from CLAUDE.md)

| Directive | Implication for Phase 4 |
|-----------|------------------------|
| Framework: Next.js 14 (App Router, TypeScript) | Use App Router conventions: RSC pages, Server Actions, Route Handlers. (Note: actual installed version is 15.5.14 per package.json) |
| Database: PostgreSQL + Prisma ORM | All data access via Prisma client. No raw SQL except for partial index migration. |
| UI: shadcn/ui + Tailwind CSS + Framer Motion | Use existing shadcn/ui components. Do not add new UI libraries. |
| Auth: NextAuth.js (credentials provider) | Call `requireSection("PRODUCTS")` in all product Server Actions |
| Superadmin: sergey.fyodorov@gmail.com | Superadmin bypasses section checks; product actions use `requireSection` not `requireSuperadmin` |
| Photo storage: /var/www/zoiten-uploads/ | Route Handler writes to this path in prod, /tmp in dev |
| Deploy: systemd + nginx | Photo upload dir must exist on VPS before first upload |
| Marketplace articles: normalized table | MarketplaceArticle model already defined in schema.prisma |

---

## Sources

### Primary (HIGH confidence)
- `prisma/schema.prisma` (local) — Product, MarketplaceArticle, Barcode model definitions, confirmed @unique on Barcode.value needs replacement
- `package.json` (local) — Confirmed installed versions: react-hook-form 7.72.1, zod 4.3.6, next 15.5.14
- `app/actions/reference.ts` (local) — Established Server Action pattern with requireSuperadmin, Zod, revalidatePath
- `lib/rbac.ts` (local) — `requireSection(section)` function signature confirmed
- `components/combobox/CreatableCombobox.tsx` (local) — Confirmed `value: string | null`, `onValueChange`, `onCreate` API
- `.planning/phases/04-products-module/04-CONTEXT.md` (local) — 36 locked decisions
- Prisma docs (WebFetch) — `--create-only` workflow for custom SQL migrations confirmed
- Prisma preview features docs (WebFetch) — `partialIndexes` NOT in Prisma 6 preview list, confirmed raw SQL migration required

### Secondary (MEDIUM confidence)
- Next.js docs search results — `searchParams` as async Promise in Next.js 15, confirmed by multiple sources
- react-hook-form docs search results — `useFieldArray` nested pattern, `field.id` as key, sub-component pattern
- WebSearch: Route Handler `req.formData()` + `node:fs` pattern — confirmed by multiple community examples

### Tertiary (LOW confidence)
- Partial index SQL syntax for cross-table WHERE clause (JOIN-based predicate) — researched from Prisma GitHub issues and PostgreSQL docs, but the exact SQL for the Barcode→Product join index needs testing on actual PostgreSQL instance

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed, versions confirmed from package.json
- Architecture patterns: HIGH — RSC + Server Action + Route Handler patterns from official docs and prior phases
- Partial unique index SQL: MEDIUM — raw SQL syntax is standard PostgreSQL but the specific cross-table WHERE needs verification
- Pitfalls: HIGH — sourced from official Prisma GitHub issues and Next.js 15 breaking changes documentation

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (30 days — stable stack)
