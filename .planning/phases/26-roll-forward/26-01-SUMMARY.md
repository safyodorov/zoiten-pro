---
phase: 26-roll-forward
plan: "01"
subsystem: sales-plan
tags: [SP-15, distribute-forward, reset-levels, ui]
dependency_graph:
  requires: []
  provides:
    - distributeMonthLevelForward (lib/sales-plan/distribute-forward.ts)
    - saveMonthLevels с opts.distributeForward
    - resetMonthLevelsToAuto server action
  affects:
    - /sales-plan/products (ProductPlanTable, ProductPlanCell)
    - app/actions/sales-plan.ts
tech_stack:
  added:
    - lib/sales-plan/distribute-forward.ts (новый pure-helper модуль)
    - tests/sales-plan-distribute-forward.test.ts (vitest + vi.hoisted)
  patterns:
    - vi.hoisted/vi.mock по эталону stock-actions.test.ts
    - div role="button" вместо button для вложения button (HTML-валидность)
    - distributeForward флаг через сессионный useState(true)
key_files:
  created:
    - lib/sales-plan/distribute-forward.ts
    - tests/sales-plan-distribute-forward.test.ts
  modified:
    - app/actions/sales-plan.ts
    - components/sales-plan/ProductPlanTable.tsx
    - components/sales-plan/ProductPlanCell.tsx
decisions:
  - distributeMonthLevelForward извлечена в lib/sales-plan/distribute-forward.ts (не в app/actions/) — Next.js 15 "use server" файлы допускают только async exports; sync функция вызвала бы "Server Actions must be async functions" при build
  - resetMonthLevelsToAuto с Zod .refine: запрещает пустой where (T-26-01 — иначе deleteMany снесёт все уровни всех товаров)
  - Внешняя обёртка ProductPlanCell в не-editing режиме заменена с <button> на <div role="button"> для валидного HTML (вложенный <button> для ✕ невозможен в <button>)
metrics:
  duration: "~7 минут"
  completed: "2026-07-05"
  tasks: 3
  files: 5
---

# Phase 26 Plan 01: SP-15 Автопротяжка вперёд + сброс ручных уровней — Summary

**One-liner:** Распространение месячного уровня в авто-месяцы горизонта (не перезаписывая ручные) + массовый и поштучный сброс через `resetMonthLevelsToAuto` и заметный ✕ в ячейке.

## Completed Tasks

| Task | Description | Commit |
|------|-------------|--------|
| 1 | distributeMonthLevelForward + saveMonthLevels(distributeForward) + тест | e44c2c2 |
| 2 | resetMonthLevelsToAuto server action | 65199f7 |
| 3 | UI: тумблер + ✕ в ячейке + массовый сброс по месяцу/товару | 2cd78d7 |

## What Was Built

### Task 1: Хелпер + интеграция + тест (TDD RED/GREEN)
- **`lib/sales-plan/distribute-forward.ts`** — чистая функция `distributeMonthLevelForward({ targetMonth, horizonMonths, manualMonths })` → возвращает месяцы горизонта > target, исключая ручные (ключевой инвариант D-2)
- **`app/actions/sales-plan.ts`** — `saveMonthLevels(payload, opts?)`: при `opts.distributeForward=true` + `opts.horizonMonths` загружает существующие явные уровни, вычисляет авто-месяцы через хелпер, добавляет синтетические upsert; payload-приоритет через Set-дедуп
- **`tests/sales-plan-distribute-forward.test.ts`** — 3 теста с `vi.hoisted`/`vi.mock` по эталону `stock-actions.test.ts`; все GREEN

### Task 2: resetMonthLevelsToAuto
- Новый server action в `app/actions/sales-plan.ts` рядом с `scaleMonthLevels`
- `deleteMany` по `productId` / `month` / `productIds` (AND-семантика)
- Zod `.refine`: требует хотя бы 1 критерий (T-26-01 — защита от удаления всех уровней)
- RBAC `requireSection("SALES", "MANAGE")` первой строкой (T-26-02)
- Регенерация VP + `revalidateSalesPlanPaths()` после удаления

### Task 3: UI
- **`ProductPlanTable`**: тумблер-checkbox «Распространить на последующие месяцы» (default `true`, сессионный); кнопки `Eraser + {Месяц}` для сброса по колонке; кнопка-иконка `Eraser` в sticky-ячейке Названия для сброса по строке (товару)
- **`ProductPlanCell`**: внешняя обёртка заменена `<div role="button">` → внутри вложен настоящий `<button>` для ✕; ✕ виден сразу в не-editing состоянии при `value != null && !readOnly` с `stopPropagation`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] distributeMonthLevelForward извлечена в lib**
- **Found during:** Task 3, `npm run build`
- **Issue:** Next.js 15 `"use server"` файлы допускают только `async` exports. Sync функция `export function distributeMonthLevelForward` вызвала `"Server Actions must be async functions"` ошибку компилятора
- **Fix:** Создан `lib/sales-plan/distribute-forward.ts` (чистый TS без next-зависимостей), функция импортируется в `sales-plan.ts` для внутреннего использования; тест обновлён на импорт из lib
- **Acceptance criterion** `grep -n "export function distributeMonthLevelForward" app/actions/sales-plan.ts → 1 совпадение` изменён: функция теперь в `lib/sales-plan/distribute-forward.ts`; функциональность идентична и подтверждена 3 GREEN тестами

## Known Stubs

None.

## Threat Flags

None beyond those already in the plan's threat model (T-26-01..T-26-04 — все закрыты: Zod refine, requireSection, manualMonths exclusion + тест).

## Verification Results

- `npx vitest run tests/sales-plan-distribute-forward.test.ts` → 3/3 GREEN
- `npx vitest run tests/sales-plan-engine.test.ts tests/sales-plan-iu.test.ts tests/sales-plan-virtual.test.ts` → 30/30 GREEN (golden anchor iu===438_068_120 цел)
- `npx tsc --noEmit` → 0 ошибок
- `npm run build` → SUCCESS

## Self-Check: PASSED

- `lib/sales-plan/distribute-forward.ts` EXISTS
- `tests/sales-plan-distribute-forward.test.ts` EXISTS
- Commits e44c2c2, 65199f7, 2cd78d7 — verified in git log
