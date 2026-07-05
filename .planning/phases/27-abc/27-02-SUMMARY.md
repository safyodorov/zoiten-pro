---
phase: 27-abc
plan: "02"
subsystem: sales-plan
tags: [abc-status, order-enabled, ui, inline-edit, optimistic]
dependency_graph:
  requires: ["27-01"]
  provides: ["abc-badge-inline", "order-toggle-ui"]
  affects: ["/sales-plan/products"]
tech_stack:
  added: []
  patterns: ["optimistic useTransition + router.refresh", "native select инлайн-смена", "computeEffectiveOrderEnabled helper"]
key_files:
  modified:
    - app/(dashboard)/sales-plan/products/page.tsx
    - components/sales-plan/ProductPlanTable.tsx
decisions:
  - "ABC-бейдж реализован через native <select> (CLAUDE.md convention), а не поповер"
  - "canManage передаётся отдельно от readOnly — ABC/тумблер доступны из любого режима при MANAGE"
  - "effectiveOrderEnabled считается на сервере через computeEffectiveOrderEnabled (helper 27-01), клиент только отрисовывает"
  - "tfoot выравнивается двумя пустыми <td className='border-r' /> под ABC+Заказ"
metrics:
  duration: "~20 min"
  completed: "2026-07-05"
  tasks_completed: 2
  files_changed: 2
---

# Phase 27 Plan 02: SP-18 UI — ABC-бейдж + тумблер «заказываем» в /sales-plan «Товары»

**One-liner:** Инлайн-смена ABC (native select) и тумблер «заказываем» (checkbox) в матрице /sales-plan «Товары» — для C тумблер forced off + disabled, optimistic useTransition + router.refresh.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Сериализация abcStatus/orderEnabled/effectiveOrderEnabled в tableProducts | 5d8cc95 | page.tsx |
| 2 | Колонки ABC-бейдж + тумблер «заказываем» + выравнивание tfoot | 5d8cc95 | ProductPlanTable.tsx |

## What Was Built

**page.tsx (RSC):**
- Импортирован `computeEffectiveOrderEnabled` из `lib/sales-plan/virtual-purchases` (helper из 27-01)
- В `tableProducts.map` добавлены три поля: `abcStatus: p.abcStatus ?? null`, `orderEnabled: p.orderEnabled ?? true`, `effectiveOrderEnabled: computeEffectiveOrderEnabled(p.abcStatus, p.orderEnabled)`
- `<ProductPlanTable>` получает `canManage={canManage}` (отдельно от `readOnly` — ABC/тумблер доступны из любого режима при MANAGE)

**ProductPlanTable.tsx (client):**
- Добавлена локальная константа `ABC_CLASSES` (зелёный/синий/оранжевый)
- `interface ProductRow` расширен: `abcStatus`, `orderEnabled`, `effectiveOrderEnabled`
- `interface ProductPlanTableProps` + деструктуризация: `canManage: boolean`
- Импорты `updateProductAbcStatus`, `updateProductOrderEnabled` из `@/app/actions/sales-plan`
- **thead**: две колонки «ABC» (w=56) и «Заказ» (w=90) между «Сток» и месяцами
- **tbody**: ячейка ABC — native `<select>` (canManage) или badge (readonly); ячейка «Заказ» — checkbox; обе с `onClick={(e) => e.stopPropagation()}`
- Для статуса C: `checked={p.effectiveOrderEnabled}` (false) + `disabled={!canManage || isPending || p.abcStatus === "C"}` + `title="Статус C — вне ассортимента"`
- **tfoot**: два `<td className="border-r" />` после ячейки суммы-«Сток», до месяцев

## Deviations from Plan

None — план исполнен точно.

## Verification

- `npx tsc --noEmit` — чисто (0 ошибок)
- `npx vitest run tests/sales-plan*.test.ts` — 9 файлов, 80 тестов, все зелёные
- `npx vitest run tests/pricing-math.test.ts` — 41 тест, golden iu === 438_068_120 — зелёный
- Acceptance criteria проверены grep-ами:
  - `computeEffectiveOrderEnabled` в page.tsx: 2 (импорт + вызов)
  - Инлайн-формула `(p.abcStatus !== "C")` — 0 (запрещена, только helper)
  - `updateProductAbcStatus` в ProductPlanTable: 2 (импорт + вызов)
  - `updateProductOrderEnabled` в ProductPlanTable: 2
  - `Статус C — вне ассортимента`: 1
  - `<td className="border-r" />`: 2 (выравнивание tfoot)

## Known Stubs

None.

## Threat Flags

None — новые endpoints не открывались; все server actions защищены `requireSection("SALES","MANAGE")` (реализовано в 27-01).

## Self-Check: PASSED

- Commit 5d8cc95 существует: подтверждено `git log --oneline -1`
- `app/(dashboard)/sales-plan/products/page.tsx` модифицирован: подтверждено
- `components/sales-plan/ProductPlanTable.tsx` модифицирован: подтверждено
- tsc чисто: подтверждено
- 80 sales-plan тестов зелёные: подтверждено
