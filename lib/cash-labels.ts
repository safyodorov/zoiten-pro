// lib/cash-labels.ts
// Phase 23 (23-04): Русские метки enum-значений для кассового раздела.
// Pure module — без серверных импортов, безопасен для client-компонентов.

export const DIRECTION_LABELS: Record<string, string> = {
  INCOME: "Приход",
  EXPENSE: "Расход",
}

// Расход стоит первым — касса в основном расходы (default)
export const DIRECTION_OPTIONS = [
  { value: "EXPENSE", label: "Расход" },
  { value: "INCOME", label: "Приход" },
]
