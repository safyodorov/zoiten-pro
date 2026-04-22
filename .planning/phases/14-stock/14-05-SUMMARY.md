---
phase: 14-stock
plan: "05"
subsystem: stock
tags: [server-actions, client-components, debounce, rbac, zod, toast]
dependency_graph:
  requires: [14-01]
  provides: [updateProductionStock, updateTurnoverNorm, TurnoverNormInput, WbRefreshButton]
  affects: [14-06]
tech_stack:
  added: []
  patterns:
    - GlobalRatesBar debounced save (useRef timer 500ms) → TurnoverNormInput
    - WbSyncButton toast.loading/dismiss → WbRefreshButton
    - vi.hoisted для vitest mock hoisting без ReferenceError
key_files:
  created:
    - app/actions/stock.ts
    - components/stock/TurnoverNormInput.tsx
    - components/stock/WbRefreshButton.tsx
    - tests/stock-actions.test.ts
  modified: []
decisions:
  - vi.hoisted используется для prismaMock + requireSectionMock — устраняет ReferenceError при hoisting vi.mock factory
  - stock.ts создан с заглушкой upsertIvanovoStock (Plan 14-04 дополнит реализацию через merge)
  - TurnoverNormInput использует controlled input (value + onChange) для точного debounce управления
metrics:
  duration: "~10 минут"
  completed_date: "2026-04-22"
  tasks: 2
  files: 4
---

# Phase 14 Plan 05: Production manual input + TurnoverNormInput + WbRefreshButton Summary

## Одна фраза

Два server actions (updateProductionStock + updateTurnoverNorm) с Zod + RBAC + два debounced client компонента (TurnoverNormInput, WbRefreshButton с toast.loading).

## Что сделано

### Task 1: app/actions/stock.ts — два server actions

- **updateProductionStock(productId, value)** — inline обновление Производство в ячейке таблицы
  - Zod: `int().min(0).max(99999).nullable()` — null для очистки поля
  - RBAC: `requireSection("STOCK", "MANAGE")`
  - Prisma: `product.update({ productionStock, productionStockUpdatedAt: new Date() })`
  - `revalidatePath("/stock")`

- **updateTurnoverNorm(days)** — сохранение нормы оборачиваемости в AppSetting KV
  - Zod: `int().min(1).max(100)`
  - RBAC: `requireSection("STOCK", "MANAGE")`
  - Prisma: `appSetting.upsert({ key: "stock.turnoverNormDays" })`
  - `revalidatePath("/stock")` + `revalidatePath("/stock/wb")`

- **upsertIvanovoStock** — заглушка (реализация в 14-04, который выполняется параллельно)

- **tests/stock-actions.test.ts** — 12 GREEN тестов:
  - updateProductionStock: valid 500 / valid null / boundary 0 / boundary 99999 / invalid -5 / invalid 100000
  - updateTurnoverNorm: valid 37 с проверкой key / invalid 0 / invalid 101 / boundary 1 / boundary 100 / invalid -1

### Task 2: TurnoverNormInput + WbRefreshButton

**TurnoverNormInput.tsx** (STOCK-14):
- "use client", принимает `initialDays: number`
- Debounce 500ms через `useRef<ReturnType<typeof setTimeout>>` (паттерн GlobalRatesBar)
- Layout: `Card bg-muted/30 border` + `Label "Норма оборачиваемости"` + `Input h-8 w-16` + `span "дней"`
- Loader2 spinner при isPending (правее input)
- Toast success: "Норма сохранена" / error: "Не удалось сохранить норму: {error}. Допустимо от 1 до 100 дней."

**WbRefreshButton.tsx** (STOCK-15):
- "use client", primary CTA (`<Button>` default variant)
- RefreshCw иконка с animate-spin во время загрузки
- `toast.loading("Загружаем остатки из WB…")` → dismiss → success/error
- Router.refresh() после успеха
- Toast success: "WB остатки обновлены"
- Toast error: "Не удалось обновить остатки из WB: {error}. Повторите через минуту."

## Коммиты

| Задача | Хеш | Описание |
|--------|-----|----------|
| Task 1 | ff1bf69 | feat(14-05): updateProductionStock + updateTurnoverNorm server actions |
| Task 2 | 1990f23 | feat(14-05): TurnoverNormInput + WbRefreshButton client компоненты |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vi.hoisted для vitest mock hoisting**
- **Found during:** Task 1 — запуск тестов
- **Issue:** `prismaMock` определён как `const` на уровне модуля, но `vi.mock` factory хоистится выше — ReferenceError: Cannot access 'prismaMock' before initialization
- **Fix:** Перенёс инициализацию в `vi.hoisted(() => { ... })` — все переменные доступны в factory
- **Files modified:** tests/stock-actions.test.ts
- **Commit:** ff1bf69

**2. [Rule 2 - Missing] Заглушка upsertIvanovoStock в stock.ts**
- **Found during:** Task 1 — файл stock.ts не существовал (Plan 14-04 параллельный)
- **Issue:** Plan ожидал существующий stock.ts из 14-04, но параллельный агент ещё не создал его
- **Fix:** Создал stock.ts с заглушкой upsertIvanovoStock (корректная сигнатура) — 14-04 заменит реализацию при merge
- **Files modified:** app/actions/stock.ts
- **Commit:** ff1bf69

## Known Stubs

- `upsertIvanovoStock` в `app/actions/stock.ts` — заглушка-итерация. Реальная реализация с Excel парсером реализуется в Plan 14-04 (параллельный Wave 3). Интеграция не мешает плану: 14-05 тестирует только updateProductionStock + updateTurnoverNorm.

## Проверка готовности к Plan 14-06

- `TurnoverNormInput` — принимает `initialDays: number` из RSC
- `WbRefreshButton` — standalone, без пропсов
- `updateProductionStock(productId, value)` — готова для inline input в StockProductTable
- `updateTurnoverNorm(days)` — вызывается из TurnoverNormInput

## Self-Check

**PASSED**

- FOUND: app/actions/stock.ts
- FOUND: components/stock/TurnoverNormInput.tsx
- FOUND: components/stock/WbRefreshButton.tsx
- FOUND: tests/stock-actions.test.ts
- FOUND commit: ff1bf69 (Task 1)
- FOUND commit: 1990f23 (Task 2)
- npx tsc --noEmit → 0 ошибок
- 12 тестов GREEN
