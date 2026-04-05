# Phase 3: Reference Data - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

CRUD for reference data entities: Brands, Categories (per-brand), Subcategories (per-category), Marketplaces. Seed default data. Prepare inline creation component (Combobox) for use in Phase 4 product form.

</domain>

<decisions>
## Implementation Decisions

### UI Layout
- **D-01:** Single settings page at `/admin/settings` with Tabs component (Бренды, Категории, Маркетплейсы).
- **D-02:** Each tab has its own list + add/edit inline. No modals for simple reference data — inline editing in the list.
- **D-03:** Access restricted to SUPERADMIN and MANAGER roles (requireSection("PRODUCTS") or requireSuperadmin()).

### Brands
- **D-04:** Simple list with name. Inline add (input + button), inline edit (click to edit), delete with confirmation.
- **D-05:** Zoiten brand seeded by default, cannot be deleted (protect in Server Action).

### Categories & Subcategories
- **D-06:** Categories scoped to selected brand (dropdown to switch brand context).
- **D-07:** Accordion-style list: category row expands to show subcategories.
- **D-08:** Inline add for both categories and subcategories.
- **D-09:** Zoiten brand seeded with 3 categories: Дом, Кухня, Красота и здоровье.

### Marketplaces
- **D-10:** Simple list like brands. Name + short code.
- **D-11:** 4 marketplaces seeded: WB (Wildberries), Ozon, ДМ (Детский Мир), ЯМ (Яндекс Маркет).
- **D-12:** Seeded marketplaces can be renamed but not deleted.

### Inline Creation for Product Form (REF-05)
- **D-13:** Combobox component (shadcn) with "Добавить новую" button at bottom of dropdown.
- **D-14:** Clicking "Добавить" shows inline input field inside the combobox dropdown (no separate modal/dialog).
- **D-15:** This component is built in Phase 3 but used in Phase 4 product form.

### Seed Script
- **D-16:** Extend existing prisma/seed.ts to also seed brands, categories, marketplaces.
- **D-17:** Seed is idempotent (upsert pattern, same as superadmin seed).

### Claude's Discretion
- Exact tab component styling
- Whether to use optimistic updates or wait for server response
- Form validation details for names
- Sort order of items in lists

</decisions>

<canonical_refs>
## Canonical References

### Phase 1 & 2 Foundation
- `prisma/schema.prisma` — Brand, Category, Subcategory, Marketplace models
- `prisma/seed.ts` — Existing seed script to extend
- `lib/rbac.ts` — requireSection(), requireSuperadmin()
- `lib/section-labels.ts` — Section labels mapping
- `app/actions/users.ts` — Server Action pattern with error handling

### Project Specs
- `.planning/REQUIREMENTS.md` — REF-01..05 requirements
- `.planning/ROADMAP.md` — Phase 3 success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- shadcn/ui: button, input, card, badge, table, dialog, select, separator, tabs (need to install: tabs, combobox/command, collapsible, popover)
- Server Action pattern from app/actions/users.ts
- lib/prisma.ts singleton
- react-hook-form + zod pattern

### Established Patterns
- Server Actions: "use server" + requireSuperadmin() + try/catch + revalidatePath
- Toast notifications via Sonner
- RSC pages with server-side data fetching

### Integration Points
- `/admin/settings` — new page under (dashboard) layout
- Sidebar — add "Настройки" link (or reuse existing)
- prisma/seed.ts — extend with reference data
- Combobox component — will be consumed by Phase 4 product form

</code_context>

<specifics>
## Specific Ideas

- Tab names in Russian: Бренды, Категории, Маркетплейсы
- Brand context dropdown for categories tab (switch between brands)
- Combobox component should be generic/reusable (CreatableCombobox)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-reference-data*
*Context gathered: 2026-04-05*
