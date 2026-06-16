// lib/purchase-stages.ts
// Единственный источник истины для этапов движения товара в закупке.
// Импортируется и в RSC (page.tsx) и в client-компонентах.
// Без "use client" / "use server".

export const STAGE_ORDER = [
  "PRODUCTION",
  "INSPECTION",
  "SHIPMENT",
  "TRANSIT",
  "WAREHOUSE",
] as const

export type StageKey = (typeof STAGE_ORDER)[number]

export const STAGE_LABELS: Record<StageKey, string> = {
  PRODUCTION: "Производство",
  INSPECTION: "Готов к инспекции",
  SHIPMENT: "Готов к отгрузке",
  TRANSIT: "В пути",
  WAREHOUSE: "Принят на складе",
}

// Обратная совместимость: PurchaseItemStagesCard ранее экспортировал STAGES как массив { key, label }.
export const STAGES = STAGE_ORDER.map((key) => ({ key, label: STAGE_LABELS[key] })) as readonly {
  key: StageKey
  label: string
}[]

// Baseline-этап (не из enum = PurchaseItem.quantity, состояние «Заказано»).
export const BASELINE_LABEL = "Заказано"

// ── Цветовая градация бейджей (light + dark) ─────────────────────────────────
// Прогрессия от нейтрального к оранжево-красному accent, WAREHOUSE = успех (зелёный).

export const STAGE_BADGE_CLASS: Record<StageKey | "BASELINE", string> = {
  BASELINE: "bg-muted text-muted-foreground",
  PRODUCTION: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  INSPECTION: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  SHIPMENT: "bg-orange-200 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  TRANSIT: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  WAREHOUSE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
}

// Заливка для «достигнутого» сегмента stepper'а (только bg, без text).
export const STAGE_FILL_CLASS: Record<StageKey, string> = {
  PRODUCTION: "bg-amber-400 dark:bg-amber-500",
  INSPECTION: "bg-orange-400 dark:bg-orange-500",
  SHIPMENT: "bg-orange-500 dark:bg-orange-600",
  TRANSIT: "bg-red-400 dark:bg-red-500",
  WAREHOUSE: "bg-emerald-500 dark:bg-emerald-600",
}

// ── Хелперы ───────────────────────────────────────────────────────────────────

/** Индекс этапа в STAGE_ORDER (для сравнения «достигнут ли»). -1 для unknown. */
export function stageIndex(stage: string): number {
  return (STAGE_ORDER as readonly string[]).indexOf(stage)
}

/**
 * Текущий (самый дальний достигнутый) этап среди массива достигнутых ключей.
 * Возвращает StageKey самого дальнего по STAGE_ORDER, либо null если массив пуст (= Заказано).
 */
export function currentStageOf(reachedStages: readonly string[]): StageKey | null {
  if (reachedStages.length === 0) return null
  let best: StageKey | null = null
  let bestIdx = -1
  for (const s of reachedStages) {
    const idx = stageIndex(s)
    if (idx > bestIdx) {
      bestIdx = idx
      best = s as StageKey
    }
  }
  return best
}

/** Метка текущего этапа (для бейджа): currentStageOf → STAGE_LABELS, либо BASELINE_LABEL. */
export function currentStageLabel(reachedStages: readonly string[]): string {
  const cur = currentStageOf(reachedStages)
  return cur ? STAGE_LABELS[cur] : BASELINE_LABEL
}

/** Класс бейджа для текущего этапа (BASELINE если пусто). */
export function currentStageBadgeClass(reachedStages: readonly string[]): string {
  const cur = currentStageOf(reachedStages)
  return STAGE_BADGE_CLASS[cur ?? "BASELINE"]
}
