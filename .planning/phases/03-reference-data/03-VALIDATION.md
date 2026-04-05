# Phase 3: Reference Data — Validation Criteria

**Phase:** 03-reference-data
**Requirements:** REF-01, REF-02, REF-03, REF-04, REF-05
**Created:** 2026-04-05

## Automated Validation

Run after each plan completes and after the full phase completes.

### TypeScript Compilation

```bash
cd /Users/macmini/zoiten.pro && PATH=/usr/local/bin:$PATH npx tsc --noEmit
```

Expected: zero errors.

### File Existence Checks

```bash
# Plan 01
ls /Users/macmini/zoiten.pro/app/actions/reference.ts
ls /Users/macmini/zoiten.pro/prisma/seed.ts

# Plan 02
ls /Users/macmini/zoiten.pro/components/ui/tabs.tsx
ls /Users/macmini/zoiten.pro/components/ui/accordion.tsx
ls /Users/macmini/zoiten.pro/components/settings/BrandsTab.tsx
ls /Users/macmini/zoiten.pro/components/settings/CategoriesTab.tsx
ls /Users/macmini/zoiten.pro/components/settings/MarketplacesTab.tsx
ls /Users/macmini/zoiten.pro/components/settings/SettingsTabs.tsx
ls /Users/macmini/zoiten.pro/app/\(dashboard\)/admin/settings/page.tsx

# Plan 03
ls /Users/macmini/zoiten.pro/components/combobox/CreatableCombobox.tsx
```

### Server Action Exports Check

```bash
grep -n "^export async function" /Users/macmini/zoiten.pro/app/actions/reference.ts
```

Expected 12 exports: createBrand, updateBrand, deleteBrand, createCategory, updateCategory, deleteCategory, createSubcategory, updateSubcategory, deleteSubcategory, createMarketplace, updateMarketplace, deleteMarketplace.

### Seed Script Contents

```bash
grep -n "upsert" /Users/macmini/zoiten.pro/prisma/seed.ts
```

Expected: at least 6 upsert calls (1 user + 1 brand + 3 categories + 4 marketplaces ≥ 6).

```bash
grep -n "Zoiten\|Дом\|Кухня\|Красота\|Wildberries\|wb\|ozon\|dm\|ym" /Users/macmini/zoiten.pro/prisma/seed.ts
```

Expected: all seed data present.

### base-ui Variant Check (Critical — data-selected: NOT data-state=)

```bash
grep -rn "data-state=" /Users/macmini/zoiten.pro/components/ui/tabs.tsx /Users/macmini/zoiten.pro/components/ui/accordion.tsx 2>/dev/null
```

Expected: EMPTY (no data-state= in these files; must use data-selected: and data-open:).

### RBAC Guard Check

```bash
grep -n "requireSuperadmin" /Users/macmini/zoiten.pro/app/\(dashboard\)/admin/settings/page.tsx
grep -n "requireSuperadmin" /Users/macmini/zoiten.pro/app/actions/reference.ts | wc -l
```

Expected: page.tsx has 1 call; reference.ts has 12 calls (one per action).

### CreatableCombobox Props Interface

```bash
grep -n "onCreate\|onValueChange\|options\|CreatableComboboxOption" /Users/macmini/zoiten.pro/components/combobox/CreatableCombobox.tsx
```

Expected: all four prop/type names present.

### Sidebar Настройки Link

```bash
grep -n "admin/settings\|Настройки" /Users/macmini/zoiten.pro/components/layout/Sidebar.tsx
```

Expected: both present.

### Protected Delete Guards

```bash
grep -n "Zoiten нельзя удалить\|Системный маркетплейс" /Users/macmini/zoiten.pro/app/actions/reference.ts
```

Expected: both error messages present.

## Requirement Traceability

| Req | Validation | Plan |
|-----|-----------|------|
| REF-01 | createBrand/updateBrand/deleteBrand exported; Zoiten guard; seed upsert | 03-01, 03-02 |
| REF-02 | createCategory/updateCategory/deleteCategory exported; seed has 3 Zoiten categories | 03-01, 03-02 |
| REF-03 | createSubcategory/updateSubcategory/deleteSubcategory exported; CategoriesTab accordion shows subcategories | 03-01, 03-02 |
| REF-04 | createMarketplace/updateMarketplace/deleteMarketplace exported; 4 seeded; system guard | 03-01, 03-02 |
| REF-05 | CreatableCombobox exported with onCreate callback; data-selected: used | 03-03 |

## Manual Verification (when DB available)

Run these after `prisma db seed`:

1. Navigate to `/admin/settings` as superadmin — page loads, three tabs visible
2. Бренды tab: Zoiten listed without delete button; add "TestBrand" → appears; rename → updates; delete → removed
3. Категории tab: Zoiten brand selected by default; Дом/Кухня/Красота и здоровье in accordion; expand Дом → subcategory list visible; add subcategory → appears
4. Маркетплейсы tab: WB/Ozon/ДМ/ЯМ listed without delete buttons; add "Wildberries (тест)" with slug "wb-test" → appears with delete button
5. Non-superadmin user navigating to `/admin/settings` → redirect (requireSuperadmin throws)
