# Phase 3: Reference Data - Research

**Researched:** 2026-04-05
**Domain:** shadcn/ui v4 (base-ui), Server Actions, inline CRUD, Combobox
**Confidence:** HIGH

## Summary

Phase 3 builds a `/admin/settings` page with three tabs (Бренды, Категории, Маркетплейсы) for managing reference data entities. All UI primitives needed — Tabs, Accordion, Collapsible, Combobox, Popover — are already available via `@base-ui/react` (installed at ^1.3.0). No new npm packages are needed; only new shadcn wrapper components need to be created under `components/ui/`.

The pattern is identical to Phase 2: RSC page does server-side data fetch + RBAC guard, passes data to "use client" components, which call Server Actions and receive `{ ok: true } | { ok: false; error: string }` responses with toast feedback via Sonner. Inline editing means no Dialog for simple name fields — an `<input>` appears in-place on click.

The `CreatableCombobox` component (REF-05) is the most complex piece: it wraps `@base-ui/react/combobox` to support filtering existing items AND an inline "Добавить новую" affordance within the dropdown — no modal, no separate dialog. This component is consumed by the Phase 4 product form.

**Primary recommendation:** Wrap existing `@base-ui/react` primitives into shadcn-style wrappers (tabs.tsx, accordion.tsx), apply the same Server Action + toast pattern from Phase 2, and implement `CreatableCombobox` as a fully controlled component with `value`/`onValueChange` + optional `onCreate` callback.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Single settings page at `/admin/settings` with Tabs component (Бренды, Категории, Маркетплейсы).
- **D-02:** Each tab has its own list + add/edit inline. No modals for simple reference data — inline editing in the list.
- **D-03:** Access restricted to SUPERADMIN and MANAGER roles (requireSection("PRODUCTS") or requireSuperadmin()).
- **D-04:** Brands: inline add (input + button), inline edit (click to edit), delete with confirmation.
- **D-05:** Zoiten brand seeded by default, cannot be deleted (protect in Server Action).
- **D-06:** Categories scoped to selected brand (dropdown to switch brand context).
- **D-07:** Accordion-style list: category row expands to show subcategories.
- **D-08:** Inline add for both categories and subcategories.
- **D-09:** Zoiten brand seeded with 3 categories: Дом, Кухня, Красота и здоровье.
- **D-10:** Marketplaces: Name + short code.
- **D-11:** 4 marketplaces seeded: WB (Wildberries), Ozon, ДМ (Детский Мир), ЯМ (Яндекс Маркет).
- **D-12:** Seeded marketplaces can be renamed but not deleted.
- **D-13:** Combobox component with "Добавить новую" button at bottom of dropdown.
- **D-14:** Clicking "Добавить" shows inline input field inside the combobox dropdown (no separate modal/dialog).
- **D-15:** Combobox built in Phase 3, used in Phase 4 product form.
- **D-16:** Extend existing prisma/seed.ts to also seed brands, categories, marketplaces.
- **D-17:** Seed is idempotent (upsert pattern, same as superadmin seed).

### Claude's Discretion
- Exact tab component styling
- Whether to use optimistic updates or wait for server response
- Form validation details for names
- Sort order of items in lists

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REF-01 | Brand CRUD — create, read, update, delete brands. Zoiten seeded by default | Server Action pattern from users.ts; Prisma upsert for seed; guard delete of "Zoiten" brand by name/slug check |
| REF-02 | Category CRUD — per-brand categories. Zoiten seeded with: Дом, Кухня, Красота и здоровье | Accordion component from @base-ui/react/accordion; brand selector uses Select from @base-ui/react/select |
| REF-03 | Subcategory CRUD — nested under categories, per-brand | Accordion panel content for subcategories; same inline input pattern as categories |
| REF-04 | Marketplace CRUD — WB, Ozon, ДМ, ЯМ seeded. Can add custom marketplaces | Same list pattern as brands; guard delete of seeded marketplaces via `isSystem` flag or name check |
| REF-05 | Inline category/subcategory creation from product form (combobox with "Add new" option) | @base-ui/react/combobox with ComboboxEmpty + extra "Add" item at list bottom; fully controlled component with `onCreate` callback |
</phase_requirements>

## Standard Stack

### Core (already installed — no new packages needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @base-ui/react | ^1.3.0 | Tabs, Accordion, Combobox, Popover, Collapsible | Already used — shadcn v4 project-wide primitive |
| react-hook-form | ^7.72.1 | Inline edit forms (name validation) | Already used, zod resolver available |
| zod | ^4.3.6 | Schema validation for Server Actions | Already used |
| sonner | ^2.0.7 | Toast notifications | Already used |
| lucide-react | ^1.7.0 | Icons (Pencil, Trash2, Plus, ChevronDown, Check) | Already used |

### New shadcn Wrapper Components to Create (not install)
| Component | Source Primitive | Purpose |
|-----------|-----------------|---------|
| components/ui/tabs.tsx | @base-ui/react/tabs | Settings page tabs |
| components/ui/accordion.tsx | @base-ui/react/accordion | Category+subcategory accordion |
| components/ui/collapsible.tsx | @base-ui/react/collapsible | Optional — Accordion covers D-07 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @base-ui/react Accordion | Radix Accordion | Project uses base-ui exclusively — do not mix |
| @base-ui/react Combobox | Custom Command+Popover (Radix pattern) | base-ui Combobox is purpose-built and already available |
| Inline editing | Dialog-based editing | D-02 explicitly forbids modals for simple reference data |

**Installation:** No new packages. All primitives are in `@base-ui/react` already.

**Version verification (confirmed from node_modules):**
- @base-ui/react: present at ^1.3.0, includes: tabs, accordion, collapsible, combobox, popover
- No additional npm installs required for this phase

## Architecture Patterns

### Recommended File Structure
```
app/
└── (dashboard)/
    └── admin/
        └── settings/
            └── page.tsx              # RSC: fetch all brands, categories, marketplaces
app/
└── actions/
    └── reference.ts                  # Server Actions: CRUD for brands, categories, subcategories, marketplaces

components/
├── ui/
│   ├── tabs.tsx                      # New: base-ui Tabs wrapper (shadcn style)
│   └── accordion.tsx                 # New: base-ui Accordion wrapper (shadcn style)
├── settings/
│   ├── SettingsTabs.tsx              # "use client" — tab switcher with state
│   ├── BrandsTab.tsx                 # "use client" — brands CRUD inline
│   ├── CategoriesTab.tsx             # "use client" — brand picker + accordion CRUD
│   └── MarketplacesTab.tsx           # "use client" — marketplaces CRUD inline
└── combobox/
    └── CreatableCombobox.tsx         # "use client" — generic reusable for Phase 4

prisma/
└── seed.ts                           # Extend with brands, categories, marketplaces
```

### Pattern 1: RSC Settings Page with Server-Side Data Fetch

**What:** Page fetches all reference data in parallel, passes to client components as props.
**When to use:** All RSC pages in this project follow this pattern (see `/admin/users/page.tsx`).

```typescript
// app/(dashboard)/admin/settings/page.tsx
import { requireSuperadmin } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { SettingsTabs } from "@/components/settings/SettingsTabs"

export default async function SettingsPage() {
  await requireSuperadmin()

  const [brands, marketplaces] = await Promise.all([
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      include: {
        categories: {
          orderBy: { name: "asc" },
          include: { subcategories: { orderBy: { name: "asc" } } },
        },
      },
    }),
    prisma.marketplace.findMany({ orderBy: { name: "asc" } }),
  ])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Настройки</h1>
      <SettingsTabs brands={brands} marketplaces={marketplaces} />
    </div>
  )
}
```

### Pattern 2: Server Action for Reference CRUD (matches users.ts pattern)

**What:** "use server" file with requireSuperadmin + zod parse + prisma + revalidatePath + error handling.
**When to use:** Every mutating operation on reference data.

```typescript
// app/actions/reference.ts
"use server"

import { requireSuperadmin } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { revalidatePath } from "next/cache"

type ActionResult = { ok: true } | { ok: false; error: string }

const BrandNameSchema = z.object({
  name: z.string().min(1, "Не может быть пустым").max(100),
})

export async function createBrand(data: { name: string }): Promise<ActionResult> {
  try {
    await requireSuperadmin()
    const { name } = BrandNameSchema.parse(data)
    await prisma.brand.create({ data: { name } })
    revalidatePath("/admin/settings")
    return { ok: true }
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "UNAUTHORIZED") return { ok: false, error: "Не авторизован" }
      if (e.message === "FORBIDDEN") return { ok: false, error: "Нет доступа" }
    }
    if ((e as { code?: string })?.code === "P2002") {
      return { ok: false, error: "Бренд с таким названием уже существует" }
    }
    return { ok: false, error: "Ошибка сервера" }
  }
}

export async function deleteBrand(id: string): Promise<ActionResult> {
  try {
    await requireSuperadmin()
    // D-05: protect Zoiten brand
    const brand = await prisma.brand.findUnique({ where: { id } })
    if (brand?.name === "Zoiten") {
      return { ok: false, error: "Бренд Zoiten нельзя удалить" }
    }
    await prisma.brand.delete({ where: { id } })
    revalidatePath("/admin/settings")
    return { ok: true }
  } catch (e) {
    if ((e as { code?: string })?.code === "P2003") {
      return { ok: false, error: "Бренд используется в товарах" }
    }
    return { ok: false, error: "Ошибка сервера" }
  }
}
```

### Pattern 3: Inline Editing Component

**What:** List item renders either static text or an input + save/cancel buttons, toggled by local state.
**When to use:** D-02 — no modals for simple reference data.

```typescript
// components/settings/BrandsTab.tsx (excerpt)
"use client"
import { useState } from "react"
import { toast } from "sonner"
import { updateBrand, deleteBrand, createBrand } from "@/app/actions/reference"

interface BrandRowProps {
  brand: { id: string; name: string }
  isProtected?: boolean
}

export function BrandRow({ brand, isProtected }: BrandRowProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(brand.name)

  async function handleSave() {
    const result = await updateBrand({ id: brand.id, name })
    if (result.ok) {
      toast.success("Сохранено")
      setEditing(false)
    } else {
      toast.error(result.error)
    }
  }

  if (editing) {
    return (
      <div className="flex gap-2 items-center">
        <input
          className="border rounded px-2 py-1 text-sm flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave() }}
          autoFocus
        />
        <button onClick={handleSave}>Сохранить</button>
        <button onClick={() => setEditing(false)}>Отмена</button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between py-2">
      <span>{brand.name}</span>
      <div className="flex gap-1">
        <button onClick={() => setEditing(true)}>Изменить</button>
        {!isProtected && <button onClick={() => handleDelete(brand.id)}>Удалить</button>}
      </div>
    </div>
  )
}
```

### Pattern 4: base-ui Accordion for Categories + Subcategories

**What:** `@base-ui/react/accordion` with `multiple` prop — each category row is an Accordion.Item, panel shows subcategories.
**When to use:** D-07.

```typescript
// components/ui/accordion.tsx (new shadcn wrapper)
"use client"
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"
import { cn } from "@/lib/utils"
import { ChevronDownIcon } from "lucide-react"

const Accordion = AccordionPrimitive.Root

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b", className)}
      {...props}
    />
  )
}

function AccordionTrigger({ className, children, ...props }: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header>
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "flex w-full items-center justify-between py-3 text-sm font-medium transition-all data-open:[&>svg]:rotate-180",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="size-4 transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({ className, ...props }: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className={cn("pb-3 text-sm", className)}
      {...props}
    />
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
```

### Pattern 5: base-ui Tabs Wrapper

**What:** `@base-ui/react/tabs` with `defaultValue` (string) for tab identity.
**When to use:** D-01 — settings page tabs.

```typescript
// components/ui/tabs.tsx (new shadcn wrapper)
"use client"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center px-3 py-1 text-sm font-medium transition-all rounded-md data-selected:bg-background data-selected:text-foreground data-selected:shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("mt-4", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
```

### Pattern 6: CreatableCombobox (REF-05)

**What:** Wraps `@base-ui/react/combobox`. Filters items by typed text. Bottom of dropdown always shows "Добавить X" item that triggers inline input. `onCreate` callback fires with new name, which the parent handles (calls Server Action, refreshes).
**When to use:** Anywhere a select is needed with inline create — Phase 4 product form for brand/category/subcategory.

```typescript
// components/combobox/CreatableCombobox.tsx
"use client"
import { useState } from "react"
import { Combobox } from "@base-ui/react/combobox"
import { Check, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

interface CreatableComboboxProps {
  items: { id: string; label: string }[]
  value: string | null                   // selected item id
  onValueChange: (id: string) => void
  onCreate: (name: string) => Promise<{ ok: true; id: string } | { ok: false; error: string }>
  placeholder?: string
  disabled?: boolean
}

export function CreatableCombobox({
  items,
  value,
  onValueChange,
  onCreate,
  placeholder = "Выберите...",
  disabled,
}: CreatableComboboxProps) {
  const [inputValue, setInputValue] = useState("")
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")

  const selectedLabel = items.find((i) => i.id === value)?.label ?? ""

  async function handleCreate() {
    if (!newName.trim()) return
    const result = await onCreate(newName.trim())
    if (result.ok) {
      onValueChange(result.id)
      setCreating(false)
      setNewName("")
    }
    // Error handling delegated to parent (toast)
  }

  return (
    <Combobox.Root value={value} onValueChange={(v) => onValueChange(v as string)} disabled={disabled}>
      <Combobox.Trigger className="flex items-center justify-between border rounded px-3 py-1.5 text-sm w-full">
        <Combobox.Value placeholder={placeholder}>{selectedLabel}</Combobox.Value>
        <Combobox.Icon />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner>
          <Combobox.Popup className="z-50 min-w-[200px] overflow-hidden rounded-md border bg-popover shadow-md">
            <Combobox.Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Поиск..."
              className="border-b px-3 py-2 text-sm w-full outline-none"
            />
            <Combobox.List className="max-h-48 overflow-y-auto p-1">
              <Combobox.Empty className="py-4 text-center text-sm text-muted-foreground">
                Не найдено
              </Combobox.Empty>
              {items.map((item) => (
                <Combobox.Item
                  key={item.id}
                  value={item.id}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded px-2 py-1.5 text-sm outline-none data-highlighted:bg-accent"
                  )}
                >
                  <Combobox.ItemIndicator>
                    <Check className="size-4 mr-2" />
                  </Combobox.ItemIndicator>
                  {item.label}
                </Combobox.Item>
              ))}
            </Combobox.List>
            {/* Inline create area — D-13/D-14 */}
            <div className="border-t p-1">
              {creating ? (
                <div className="flex gap-1 px-1 py-1">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate()
                      if (e.key === "Escape") setCreating(false)
                    }}
                    className="flex-1 border rounded px-2 py-0.5 text-sm outline-none"
                    placeholder="Название..."
                  />
                  <button onClick={handleCreate} className="text-sm px-2 py-0.5 bg-primary text-primary-foreground rounded">
                    OK
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCreating(true)}
                  className="flex w-full items-center gap-1 px-2 py-1.5 text-sm hover:bg-accent rounded"
                >
                  <Plus className="size-3.5" />
                  Добавить новую
                </button>
              )}
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
```

### Pattern 7: Idempotent Seed Extension

**What:** Extend `prisma/seed.ts` using `upsert` with `where: { name }` for brands and marketplaces; `where: { name_brandId }` unique compound for categories.
**When to use:** D-16 + D-17.

```typescript
// prisma/seed.ts — new section after superadmin seed

// Brands
const zoiten = await prisma.brand.upsert({
  where: { name: "Zoiten" },
  update: {},
  create: { name: "Zoiten" },
})

// Categories for Zoiten (D-09)
const categoryNames = ["Дом", "Кухня", "Красота и здоровье"]
for (const catName of categoryNames) {
  await prisma.category.upsert({
    where: { name_brandId: { name: catName, brandId: zoiten.id } },
    update: {},
    create: { name: catName, brandId: zoiten.id },
  })
}

// Marketplaces (D-11)
const marketplaces = [
  { name: "Wildberries", slug: "wb" },
  { name: "Ozon",        slug: "ozon" },
  { name: "Детский Мир", slug: "dm" },
  { name: "Яндекс Маркет", slug: "ym" },
]
for (const mp of marketplaces) {
  await prisma.marketplace.upsert({
    where: { slug: mp.slug },
    update: { name: mp.name },  // allow rename (D-12)
    create: mp,
  })
}
```

**Critical note on upsert unique field for Category:** The Prisma `@@unique([name, brandId])` constraint generates a compound where clause named `name_brandId`. Use exactly this in the `where` clause.

### Anti-Patterns to Avoid

- **Mixing Radix and base-ui:** Project is fully base-ui (shadcn v4). Never import from `@radix-ui/*`.
- **Dialog for inline edits:** D-02 forbids modals for simple list items — use in-place inputs.
- **Button with `asChild`:** The base-ui Button has no `asChild` prop. Use a styled `<Link>` or native `<a>` for link-button patterns (already logged in PROJECT.md decisions).
- **Prisma `create` in seed (non-idempotent):** Always `upsert` in seed.ts — seed runs on every `prisma db seed` call.
- **Server Actions in `"use client"` files:** Server Actions must be in separate `"use server"` files (not inline in components) — matches existing pattern in `app/actions/users.ts`.
- **Using `confirm()` in RSC context:** `confirm()` (browser dialog) only works in Client Components. Use it inside `"use client"` components (already done in UserTable.tsx pattern).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Filterable dropdown with create | Custom input+list+popover | `@base-ui/react/combobox` | Keyboard nav, ARIA, positioning all handled |
| Animated expand/collapse | CSS height animation hack | `@base-ui/react/accordion` or `collapsible` | CSS transition on `height: 0 → auto` breaks without JS measurement; base-ui handles it |
| Tab navigation | Custom state + visible/hidden divs | `@base-ui/react/tabs` | ARIA tablist/tabpanel semantics, keyboard arrow nav |
| Form field validation state | Manual error state | `zod` + `react-hook-form` pattern | Consistent with Phase 2 established pattern |

**Key insight:** `@base-ui/react` was specifically built to replace both Radix and the old shadcn patterns. Every "hard" UI primitive in this phase has a drop-in base-ui equivalent already in the installed package.

## Common Pitfalls

### Pitfall 1: Accordion with `multiple` default
**What goes wrong:** By default, `AccordionPrimitive.Root` only allows one open item at a time. If there are many categories, the user can't keep multiple expanded simultaneously.
**Why it happens:** `multiple` prop defaults to `false`.
**How to avoid:** Pass `multiple` to `<Accordion multiple>` — this is appropriate for category lists where seeing multiple brands' categories simultaneously is useful.
**Warning signs:** Expanding one category row closes another.

### Pitfall 2: Combobox filter is opt-in
**What goes wrong:** base-ui Combobox does NOT auto-filter items by typed input — items are rendered as-is and all remain visible while typing.
**Why it happens:** base-ui Combobox is a controlled component — filtering is the caller's responsibility.
**How to avoid:** Filter the `items` prop in `CreatableCombobox` using `useMemo(() => items.filter(i => i.label.toLowerCase().includes(inputValue.toLowerCase())), [items, inputValue])` before passing to `Combobox.Item` map.
**Warning signs:** All items visible even after typing a search term.

### Pitfall 3: Prisma P2003 on brand/marketplace delete
**What goes wrong:** Deleting a brand that has products throws a foreign key constraint error (P2003), because `Product.brandId` has `onDelete: Restrict`.
**Why it happens:** Schema design correctly prevents orphaned products.
**How to avoid:** Catch `P2003` in the `deleteBrand` Server Action and return `{ ok: false, error: "Бренд используется в товарах" }`. Do the same for categories (also `Restrict`).
**Warning signs:** Unhandled 500 when trying to delete a brand with products.

### Pitfall 4: Seed fails if unique constraint already exists
**What goes wrong:** Running `prisma db seed` a second time fails if `create` is used instead of `upsert`.
**Why it happens:** `Brand.name` is `@unique`, `Marketplace.slug` is `@unique`.
**How to avoid:** D-17 — always use `upsert` in seed. Pattern is already established in superadmin seed.
**Warning signs:** Seed throws P2002 on second run.

### Pitfall 5: Tab value type mismatch
**What goes wrong:** `@base-ui/react/tabs` Tab components use `value` prop (any type, typically string or number). Providing mismatched types between `TabsRoot defaultValue` and `TabsTab value` causes no tab to be selected.
**Why it happens:** JavaScript loose equality; TypeScript may not catch this if both are typed as `any`.
**How to avoid:** Use consistent string literals: `defaultValue="brands"` on Root, `value="brands"` on Tab.
**Warning signs:** Page loads with no active tab selected.

### Pitfall 6: revalidatePath must match exact route
**What goes wrong:** If revalidatePath path doesn't match the rendered route segment, the server component does not re-render and stale data shows.
**Why it happens:** Next.js caches RSC renders per-path.
**How to avoid:** Use `revalidatePath("/admin/settings")` in every reference.ts Server Action.
**Warning signs:** Data appears stale after a successful create/update/delete.

### Pitfall 7: Sidebar missing "Настройки" link
**What goes wrong:** Users can't navigate to `/admin/settings` because `Sidebar.tsx` has no link for it.
**Why it happens:** Sidebar was built in Phase 2 with only `NAV_ITEMS` for sections — settings is not an ERP section.
**How to avoid:** Add a settings link to Sidebar for SUPERADMIN only (not gated by `allowedSections`, since D-03 restricts to SUPERADMIN/MANAGER via requireSuperadmin in the page itself).
**Warning signs:** No "Настройки" entry in sidebar.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| shadcn Command+Popover for combobox | @base-ui/react Combobox | shadcn v4 / base-ui 1.x | Use Combobox directly — Command component not present in this project |
| Radix UI Accordion | @base-ui/react Accordion | shadcn v4 | Same API shape, different import |
| Radix UI Tabs | @base-ui/react Tabs | shadcn v4 | `value` prop same, data attributes differ (`data-selected` not `data-state="active"`) |

**Deprecated/outdated in this project:**
- `data-state="active"` Tailwind variants (old Radix pattern): use `data-selected:` variants for Tabs, `data-open:` for Accordion in this base-ui project.
- `asChild` prop on Button: not available in base-ui Button — use styled Link directly.

## Open Questions

1. **Marketplace "cannot delete" guard**
   - What we know: D-12 says seeded marketplaces can't be deleted. Schema has no `isSystem` boolean field.
   - What's unclear: Should guard be by slug (e.g., `["wb","ozon","dm","ym"]`) hardcoded in Server Action, or should a `isSystem` boolean be added to `Marketplace` model?
   - Recommendation: Use a hardcoded slug list in the Server Action for MVP (no schema migration needed). Defer `isSystem` to a future phase if more nuance is needed.

2. **Brand context picker for Categories tab**
   - What we know: D-06 requires switching brand context to show its categories. If there's only one brand (Zoiten) at launch, this picker is trivial.
   - What's unclear: Should the picker be a Select dropdown or just show all brands' categories in separate sections?
   - Recommendation: Use a simple `<Select>` (already in components/ui/select.tsx) to choose brand. When only one brand exists, it auto-selects. This also works when more brands are added.

3. **CreatableCombobox `onCreate` return type**
   - What we know: On success, Phase 4 needs the new item's `id` to set the form field value.
   - What's unclear: Whether Server Actions for brand/category creation should return `{ ok: true; id: string }` (not just `{ ok: true }`).
   - Recommendation: Yes — change `ActionResult` to `{ ok: true; id: string } | { ok: false; error: string }` for reference creation actions specifically. Keep the existing pattern for update/delete which don't need to return an id.

## Environment Availability

Step 2.6: SKIPPED — Phase is purely code/config changes. No external CLI tools, services, or runtimes beyond the project's own stack are required. PostgreSQL is accessed via Prisma (already configured). No new npm packages needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — project has no test runner configured |
| Config file | None — `package.json` test script is `echo "Error: no test specified"` |
| Quick run command | N/A — Wave 0 must install |
| Full suite command | N/A — Wave 0 must install |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REF-01 | Brand create/update/delete Server Actions return correct ActionResult | unit | `npx vitest run tests/actions/reference.test.ts` | ❌ Wave 0 |
| REF-01 | Zoiten brand cannot be deleted (guard returns error) | unit | `npx vitest run tests/actions/reference.test.ts` | ❌ Wave 0 |
| REF-02 | Category create scoped to brand, upsert unique works | unit | `npx vitest run tests/actions/reference.test.ts` | ❌ Wave 0 |
| REF-03 | Subcategory create/delete cascades correctly | unit | `npx vitest run tests/actions/reference.test.ts` | ❌ Wave 0 |
| REF-04 | Marketplace CRUD; seeded slugs cannot be deleted | unit | `npx vitest run tests/actions/reference.test.ts` | ❌ Wave 0 |
| REF-05 | CreatableCombobox renders items, shows create input on trigger | unit | `npx vitest run tests/components/CreatableCombobox.test.tsx` | ❌ Wave 0 |
| REF-05 | onCreate callback fires with correct name string | unit | `npx vitest run tests/components/CreatableCombobox.test.tsx` | ❌ Wave 0 |

**Note:** Given the project has no test infrastructure at all, Wave 0 of the plan must decide whether to install vitest or accept manual-only validation for this phase. Given the scope (simple CRUD + one reusable component), **recommendation is to use manual smoke testing** for this phase and defer automated test setup to a dedicated infrastructure phase, rather than add test infrastructure as a side-effect of Phase 3.

### Sampling Rate
- **Per task commit:** Manual verification: open `/admin/settings`, exercise each tab
- **Per wave merge:** Full manual smoke: create/edit/delete one of each entity type; verify seed idempotency
- **Phase gate:** All REF-01..05 manually verified before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] No test runner configured (`package.json` test script is a no-op)
- [ ] Decision required: install vitest for this phase or defer to infrastructure phase

*(Recommendation: defer automated tests — prioritize delivering the reference data feature)*

## Project Constraints (from CLAUDE.md)

| Directive | Type | Applies to Phase 3 |
|-----------|------|-------------------|
| Framework: Next.js 14 (App Router, TypeScript) | Required | All files use App Router conventions |
| Database: PostgreSQL + Prisma ORM | Required | All data ops through `lib/prisma.ts` singleton |
| UI: shadcn/ui + Tailwind CSS + Framer Motion | Required | Use shadcn wrappers over base-ui; Tailwind for all styles |
| Auth: NextAuth.js credentials provider | Required | requireSuperadmin() in all Server Actions |
| RBAC: Superadmin creates users, assigns access | Required | D-03: settings page restricted to SUPERADMIN |
| Superadmin: sergey.fyodorov@gmail.com | Required | Seeded in seed.ts — do not change |
| Zoiten brand: default brand, cannot be deleted | Required | D-05 guard in deleteBrand Server Action |
| 4 marketplaces seeded: WB, Ozon, ДМ, ЯМ | Required | D-11 + D-12 in seed + deleteMarketplace guard |
| Categories per brand, 3 for Zoiten | Required | D-09 seeded in seed.ts |

## Sources

### Primary (HIGH confidence)
- `/Users/macmini/zoiten.pro/node_modules/@base-ui/react/` — Verified all required primitives present: tabs, accordion, collapsible, combobox, popover
- `/Users/macmini/zoiten.pro/components/ui/dialog.tsx` — Confirmed base-ui Dialog pattern (import path, Props types)
- `/Users/macmini/zoiten.pro/components/users/UserTable.tsx` — Confirmed established Client Component + Server Action + toast pattern
- `/Users/macmini/zoiten.pro/app/actions/users.ts` — Confirmed ActionResult type, error handling, requireSuperadmin usage
- `/Users/macmini/zoiten.pro/prisma/schema.prisma` — Confirmed `@@unique([name, brandId])` constraint name = `name_brandId`
- `/Users/macmini/zoiten.pro/prisma/seed.ts` — Confirmed upsert pattern, tsx runner
- `/Users/macmini/zoiten.pro/package.json` — Confirmed all dependency versions, no test runner present

### Secondary (MEDIUM confidence)
- base-ui/react Combobox internal source (`ComboboxRoot.js`) — Confirmed `value`/`onValueChange` props, items not auto-filtered
- base-ui/react Accordion source (`AccordionRoot.js`) — Confirmed `multiple` prop default = false

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from node_modules, no new packages needed
- Architecture: HIGH — identical to Phase 2 patterns, verified from existing code
- Pitfalls: HIGH — derived from schema constraints, base-ui source code, established project patterns
- Combobox pattern: MEDIUM — API confirmed from source; exact filtering behavior requires runtime validation (no tests)

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (stable libraries, 30-day estimate)
