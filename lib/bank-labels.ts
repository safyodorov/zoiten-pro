// lib/bank-labels.ts
// Phase 22 (22-05): Русские метки enum-значений для банковского раздела.
// Pure module — без серверных импортов, безопасен для client-компонентов.

export const CATEGORY_LABELS: Record<string, string> = {
  UNCATEGORIZED: "Без категории",
  INTERNAL_TRANSFER: "Внутренний перевод",
  BANK_FEE: "Комиссия банка",
  SUPPLIER_PAYMENT: "Оплата поставщику",
  INCOME: "Поступление выручки",
  TAX: "Налоги/сборы",
  LOAN: "Кредит/проценты",
  OTHER: "Прочее",
}

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}))

export const DIRECTION_LABELS: Record<string, string> = {
  DEBIT: "Расход",
  CREDIT: "Приход",
}

// Quick 260710-lmb (W3a): тег недельного фин-отчёта (BankTransaction.weeklyCostTag).
// Ортогонален TxCategory — независимая разметка для авто-пулов /finance/weekly.
export const WEEKLY_COST_TAG_LABELS: Record<string, string> = {
  OPEX: "ОПЕКС (общие)",
  CAPEX: "КАПЕКС",
  DELIVERY_MP: "Доставка до МП",
}

export const WEEKLY_COST_TAG_OPTIONS = [
  { value: "", label: "—" },
  ...Object.entries(WEEKLY_COST_TAG_LABELS).map(([value, label]) => ({ value, label })),
]
