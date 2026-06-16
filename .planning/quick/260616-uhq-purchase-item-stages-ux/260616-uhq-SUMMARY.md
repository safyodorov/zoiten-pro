---
phase: quick-260616-uhq
plan: "01"
subsystem: procurement
tags: [stepper, ux, stages, expandable-rows, purchase]
dependency_graph:
  requires: [procurement-purchases-page, PurchaseItemStagesCard, PurchasesTable]
  provides: [lib/purchase-stages.ts, stepper-ux, expandable-rows-ux]
  affects: [/procurement/purchases, /procurement/purchases/[id]]
tech_stack:
  added: []
  patterns: [shared-module, horizontal-stepper, expandable-table-rows, stopPropagation-caret]
key_files:
  created:
    - lib/purchase-stages.ts
  modified:
    - components/procurement/PurchaseItemStagesCard.tsx
    - components/procurement/PurchasesTable.tsx
    - app/(dashboard)/procurement/purchases/page.tsx
decisions:
  - "lib/purchase-stages.ts — единственный source of truth: STAGE_ORDER, STAGE_LABELS, STAGE_FILL_CLASS, STAGE_BADGE_CLASS, currentStageOf, helpers"
  - "Реэкспорт `export type { StageKey } from '@/lib/purchase-stages'` в PurchaseItemStagesCard — обратная совместимость с [id]/page.tsx без изменения импортов"
  - "activeStage per-item state в stepper — позволяет выбирать этап независимо для каждой позиции"
  - "farthestReachedKey() инициализирует activeStage из существующих данных БД при монтировании"
  - "Caret-кнопка встроена в ячейку Товары (не отдельная колонка) — сохраняет colCount без изменений"
metrics:
  duration: "217s (~3.5 min)"
  completed_date: "2026-06-16"
  tasks_completed: 3
  files_changed: 4
---

# Quick Task 260616-uhq: UX этапов товара в закупках — горизонтальный stepper + раскрываемые строки

## One-liner

Горизонтальный stepper per позиция с click-to-fill цепочкой + раскрываемые строки таблицы закупок с цветными бейджами этапа; единый модуль lib/purchase-stages.ts как source of truth.

## What Was Built

### Task 1 — lib/purchase-stages.ts (новый файл)

Shared модуль без "use client" / "use server". Экспортирует:
- `STAGE_ORDER` (const tuple), `StageKey` (derived type)
- `STAGE_LABELS` — русские метки 5 этапов
- `STAGES` — массив `{ key, label }` для обратной совместимости
- `BASELINE_LABEL` = "Заказано"
- `STAGE_BADGE_CLASS` (BASELINE + 5 этапов) — тёплая прогрессия amber→orange→red, WAREHOUSE=emerald
- `STAGE_FILL_CLASS` — заливка для stepper сегментов
- `stageIndex()`, `currentStageOf()`, `currentStageLabel()`, `currentStageBadgeClass()`

### Task 2 — PurchaseItemStagesCard.tsx — горизонтальный stepper

Заменён grid qty-инпутов на горизонтальный stepper per позиция:
- Каждый этап = кнопка с меткой; достигнутые заливаются `STAGE_FILL_CLASS`, недостигнутые = `bg-muted`
- Текущий (самый дальний) этап выделен `ring-2 ring-primary ring-offset-1`
- Клик → `handleStageClick()`: автозаполняет qty цепочки через `effectiveAt()`, очищает более поздние
- Под stepper'ом: редактируемое поле «Кол-во» + «Комментарий» только для текущего этапа
- `effectiveAt()` семантика сохранена без изменений — `save()` отправляет тот же формат entries в `savePurchaseItemStages()`
- Импорт из `@/lib/purchase-stages`; `export type { StageKey }` для обратной совместимости

### Task 3 — PurchasesTable.tsx + page.tsx — раскрываемые строки

**page.tsx:**
- Добавлен `id: true, stages: { select: { stage: true, quantity: true } }` в items select
- `currentStageOf()` из `@/lib/purchase-stages` для вычисления `currentStage` + `currentStageQty` per позиция

**PurchasesTable.tsx:**
- `PurchaseItemMini` расширен опциональными полями `id?`, `currentStage?`, `currentStageQty?`
- `ChevronRight/ChevronDown, Package` из lucide-react; `currentStageLabel, currentStageBadgeClass` из purchase-stages
- `expanded: Set<string>` state + `toggleExpand()` функция
- Caret-кнопка (`e.stopPropagation()`) встроена в ячейку Товары — клик НЕ триггерит `router.push()`
- В цикле bodyRows после `renderDataRow` — если `expanded.has(row.id)`, пушить под-строки per item:
  - `TableRow bg-muted/20` с `colSpan={colCount}` и `border-l-2 border-l-primary/40` (intra-group тонкая граница)
  - фото/плейсхолдер → название + SKU mono → цветной бейдж этапа → кол-во шт

## Deviations from Plan

None — план выполнен точно как написан.

## Self-Check

- [x] `lib/purchase-stages.ts` существует и экспортирует все обязательные символы
- [x] `components/procurement/PurchaseItemStagesCard.tsx` переписан на stepper
- [x] `components/procurement/PurchasesTable.tsx` раскрываемые строки с caret
- [x] `app/(dashboard)/procurement/purchases/page.tsx` stages query + currentStage mapping
- [x] `npx tsc --noEmit` — 0 ошибок (подтверждено через main repo tsc)
- [x] Commits: 621eb27, c27d06e, 8432720

## Self-Check: PASSED
