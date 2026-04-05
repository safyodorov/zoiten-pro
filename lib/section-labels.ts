// lib/section-labels.ts
// ERP_SECTION enum → Russian display label mapping
// Used in UserForm checkbox group (D-07, D-08)
// Safe to import in client and server components (no Edge restriction)

export interface SectionOption {
  value: string // ERP_SECTION enum value
  label: string // Russian display name
}

export const SECTION_OPTIONS: SectionOption[] = [
  { value: "PRODUCTS",        label: "Товары" },
  { value: "PRICES",          label: "Управление ценами" },
  { value: "WEEKLY_CARDS",    label: "Недельные карточки" },
  { value: "STOCK",           label: "Управление остатками" },
  { value: "COST",            label: "Себестоимость партий" },
  { value: "PROCUREMENT",     label: "План закупок" },
  { value: "SALES",           label: "План продаж" },
  { value: "SUPPORT",         label: "Служба поддержки" },
  { value: "USER_MANAGEMENT", label: "Управление пользователями" },
]
