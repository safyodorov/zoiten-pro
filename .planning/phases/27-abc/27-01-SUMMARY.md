---
phase: 27-abc
plan: "01"
subsystem: sales-plan
tags: [migration, virtual-purchases, server-actions, tdd, order-gate]
dependency_graph:
  requires: []
  provides: [Product.orderEnabled, computeEffectiveOrderEnabled, updateProductAbcStatus, updateProductOrderEnabled]
  affects: [lib/sales-plan/virtual-purchases.ts, lib/sales-plan/types.ts, lib/sales-plan/data.ts, app/actions/sales-plan.ts]
tech_stack:
  added: []
  patterns: [pure-helper-single-source-of-truth, tdd-red-green, handwritten-migration]
key_files:
  created:
    - prisma/migrations/20260705_product_order_enabled/migration.sql
    - tests/sales-plan-order-gate.test.ts
  modified:
    - prisma/schema.prisma
    - lib/sales-plan/virtual-purchases.ts
    - lib/sales-plan/types.ts
    - lib/sales-plan/data.ts
    - app/actions/sales-plan.ts
decisions:
  - "computeEffectiveOrderEnabled в pure-модуле virtual-purchases.ts (SOURCE OF TRUTH) — инлайн в других файлах запрещён; grep проверяет отсутствие дублей"
  - "Гейт skip — первый оператор цикла for (const product of input.products) чтобы не попасть ни в одну итерацию"
  - "engine.ts не тронут — без пополнений сток истощается сам (D-4: распродаём остаток, потом 0)"
  - "DEFAULT true в миграции — обратная совместимость: существующие товары остаются в статусе 'заказываем'"
metrics:
  duration: "~25 минут"
  completed: "2026-07-05"
  tasks_completed: 3
  files_modified: 7
---

# Phase 27 Plan 01: Фундамент гейта виртуальных закупок (SP-18/SP-19) Summary

Миграция `Product.orderEnabled`, единый helper `computeEffectiveOrderEnabled`, гейт в `suggestVirtualPurchases`, проброс через `regenerateVirtualPurchasesInternal` и два server actions для инлайн-смены ABC-статуса и флага «заказываем».

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Миграция Product.orderEnabled + prisma generate | 6a12056 | migration.sql, schema.prisma |
| 2 (TDD RED) | Тесты гейта (красные) | 898061d | tests/sales-plan-order-gate.test.ts |
| 2 (TDD GREEN) | Helper + гейт + типы/загрузчик | c5bfab1 | virtual-purchases.ts, types.ts, data.ts |
| 3 | Проброс effectiveOrderEnabled + 2 server actions | 902f2ea | app/actions/sales-plan.ts |

## What Was Built

**Рукописная миграция** (`prisma/migrations/20260705_product_order_enabled/migration.sql`):
```sql
ALTER TABLE "Product" ADD COLUMN "orderEnabled" BOOLEAN NOT NULL DEFAULT true;
```
`DEFAULT true` обеспечивает обратную совместимость — существующие товары остаются «заказываем».

**Единый helper** `computeEffectiveOrderEnabled` в `lib/sales-plan/virtual-purchases.ts` (конец файла, pure-модуль без Prisma/React/Next):
```typescript
export function computeEffectiveOrderEnabled(
  abcStatus: "A" | "B" | "C" | null | undefined,
  orderEnabled: boolean | null | undefined,
): boolean {
  return abcStatus !== "C" && (orderEnabled ?? true)
}
```

**Гейт в `suggestVirtualPurchases`** — первый оператор цикла `for (const product of input.products)`:
```typescript
if (product.effectiveOrderEnabled === false) continue
```

**Два server actions** в `app/actions/sales-plan.ts`:
- `updateProductAbcStatus(productId, status)` — SALES MANAGE + zod + prisma.product.update(abcStatus) + regenerate VP по productId + revalidate
- `updateProductOrderEnabled(productId, enabled)` — SALES MANAGE + zod + prisma.product.update(orderEnabled) + regenerate VP по productId + revalidate

## Deviations from Plan

None — план выполнен точно как написан.

## Test Results

```
sales-plan test suite: 9 файлов, 80 тестов — все GREEN
  - sales-plan-order-gate (11 тестов): helper + гейт — NEW, GREEN
  - sales-plan-iu: golden iu === 438_068_120 — не изменился
  - sales-plan-engine: golden тест — GREEN
  - sales-plan-virtual, sales-plan-rollforward, sales-plan-distribute-forward: GREEN

tsc --noEmit: чисто (типы Product.orderEnabled известны после prisma generate)
engine.ts: не изменён (git diff пустой)
```

## Self-Check

**1. Created files exist:**
- `prisma/migrations/20260705_product_order_enabled/migration.sql` — FOUND
- `tests/sales-plan-order-gate.test.ts` — FOUND

**2. Commits exist:**
- `6a12056` feat(27-01): добавить Product.orderEnabled + рукописная миграция — FOUND
- `898061d` test(27-01): красные тесты гейта — FOUND
- `c5bfab1` feat(27-01): helper + гейт + типы/загрузчик — FOUND
- `902f2ea` feat(27-01): проброс effectiveOrderEnabled + 2 server actions — FOUND

## Self-Check: PASSED

Все файлы созданы/изменены, все коммиты есть, тесты зелёные, tsc чистый.
