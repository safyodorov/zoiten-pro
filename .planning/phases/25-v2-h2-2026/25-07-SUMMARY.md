---
phase: 25-v2-h2-2026
plan: "07"
subsystem: sales-plan
tags: [virtual-purchases, procurement, opt-out, wave-6]
dependency_graph:
  requires: ["25-04", "25-05"]
  provides: ["SP-08", "SP-09"]
  affects: [sales-plan, procurement]
tech_stack:
  added: []
  patterns:
    - pure function suggestVirtualPurchases (итеративный roll-forward)
    - opt-out VP semantics (SUGGESTED учтены в плане сразу)
    - server-side date clamp (orderDate ≥ today, arrival ≥ today + leadTime)
    - from-virtual redirect + PurchaseModal prefill + CONVERTED anti-double-count
    - IncomingBadges расширение (◇ ACCEPTED violet dashed + ⚠ SUGGESTED amber dashed)
key_files:
  created:
    - lib/sales-plan/virtual-purchases.ts
    - app/(dashboard)/sales-plan/purchases/page.tsx
    - components/sales-plan/VirtualPurchasesTable.tsx
    - components/sales-plan/VirtualPurchaseDialog.tsx
  modified:
    - app/actions/sales-plan.ts
    - app/actions/purchases.ts
    - components/procurement/PurchaseModal.tsx
    - components/procurement/PurchasesTable.tsx
    - components/sales-plan/IncomingBadges.tsx
decisions:
  - "ИНВАРИАНТ «не прошлым числом» реализован на трёх уровнях: auto-gen clamp (max(today, breach-lead)), серверный clamp в updateVirtualPurchase, UI date-picker min=today/min=orderDate+lead"
  - "opt-out семантика: SUGGESTED+ACCEPTED учитываются в arrivals сразу; deleteMany только status=SUGGESTED+source=auto (ACCEPTED/DISMISSED/manual неприкосновенны)"
  - "CONVERTED anti-double-count структурный: VP помечается CONVERTED в транзакции createPurchase, resolveArrivalBatches включает только SUGGESTED+ACCEPTED"
  - "virtualStatuses prop для IncomingBadges — различение ACCEPTED vs SUGGESTED без изменения ArrivalBatch типа"
  - "convertVirtualPurchase: dual RBAC (SALES MANAGE + PROCUREMENT MANAGE) + redirect, финализация CONVERTED в createPurchase"
metrics:
  duration: "~1.5 hours"
  completed: "2026-07-04"
  tasks_completed: 3
  files_changed: 9
---

# Phase 25 Plan 07: Виртуальные закупки Summary

**One-liner:** Генератор «пора заказывать» с opt-out семантикой, итеративным roll-forward, инвариантом «не прошлым числом» и конвертацией в реальную закупку (anti-double-count).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | `suggestVirtualPurchases` pure — GREEN | 1713b8b | `lib/sales-plan/virtual-purchases.ts` |
| 2 | 5 VP-actions + regenerate в цепочках + from-virtual | 7a77111 | `app/actions/sales-plan.ts`, `app/actions/purchases.ts`, `components/procurement/PurchaseModal.tsx`, `components/procurement/PurchasesTable.tsx`, `app/(dashboard)/procurement/purchases/page.tsx` |
| 3 | Таб «Пора заказывать» + VirtualPurchasesTable + Dialog + бейджи ◇/⚠ | 4ea8757 | `app/(dashboard)/sales-plan/purchases/page.tsx`, `VirtualPurchasesTable.tsx`, `VirtualPurchaseDialog.tsx`, `IncomingBadges.tsx` |

## Deviations from Plan

**1. [Rule 2 - Missing prop] virtualStatuses prop для IncomingBadges**
- **Found during:** Task 3
- **Issue:** `resolveArrivalBatches` записывает в `ArrivalBatch.refId` только VP id (без статуса). IncomingBadges не мог различить ◇ ACCEPTED от ⚠ SUGGESTED по одному `refId`.
- **Fix:** Добавил `virtualStatuses?: Record<string, "SUGGESTED" | "ACCEPTED">` prop к `IncomingBadges`. ProductPlanTable пока передаёт undefined (бейджи рендерятся как SUGGESTED по умолчанию — Wave 7 доработает когда ProductPlanTable получит virtualStatuses из page.tsx).
- **Files modified:** `components/sales-plan/IncomingBadges.tsx`

**2. [Rule 2 - Schema gap] currency не в UpdateVpSchema**
- **Found during:** Task 3 (TypeScript error)
- **Issue:** `VirtualPurchaseDialog` пытался передать `currency` в `updateVirtualPurchase`, но `UpdateVpSchema` его не содержит.
- **Fix:** Убрал `currency` из payload диалога. Currency берётся из существующей записи — не редактируется через этот action.
- **Files modified:** `components/sales-plan/VirtualPurchaseDialog.tsx`

## Key Invariants Implemented

**ИНВАРИАНТ «виртуальная закупка НИКОГДА не прошлым числом»** — реализован на всех путях:
1. **Auto-gen:** `orderDate = max(today, breach − leadTimeDays)` в `suggestVirtualPurchases`
2. **Update:** серверный clamp в `updateVirtualPurchase` — `orderDate = max(getMskTodayIso(), orderDate)`, `arrival = max(orderDate + lead, arrival)`
3. **UI:** date-picker `min={today}` для orderDate, `min={orderDate + lead}` для expectedArrivalDate

**Anti-double-count** при конвертации в закупку:
- `convertVirtualPurchase` → redirect `/procurement/purchases?create=1&from-virtual=<id>`
- `createPurchase(fromVirtualId)` → транзакция: создаёт Purchase + `VP.status=CONVERTED, convertedPurchaseId=Purchase.id`
- `resolveArrivalBatches` включает только `status: SUGGESTED | ACCEPTED` → CONVERTED исключён структурно

**Дыра критика №5 закрыта:** `regenerateVirtualPurchasesInternal` встроен в обе цепочки:
- `saveMonthLevels` → bulk «Пересчитать план»
- `saveDayOverrides` → «Сохранить и пересчитать» в модалке дней

## Производительность цепочки пересчёта

Замер на проде (VPS 2GB) необходим: `saveMonthLevels` → `loadSalesPlanInputs` + `computeSalesPlan` + `suggestVirtualPurchases` (до 6 итераций на товар × 104 товара) + `revalidatePath` × 3. Риск №11 из плана: возможны таймауты при первом запуске на проде. Рекомендуется замерить через логи после деплоя.

## Known Stubs

- `IncomingBadges` в `ProductPlanTable` вызывается без `virtualStatuses` prop → виртуальные приходы рендерятся как SUGGESTED (⚠ amber). Полная дифференциация ◇/⚠ — когда `ProductPlanTable` получит `virtualStatuses` map из page.tsx (Wave 7).

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| threat_flag: auth | `app/actions/sales-plan.ts` | 5 новых VP-actions — все покрыты `requireSection("SALES", "MANAGE")` |
| threat_flag: auth | `convertVirtualPurchase` | Dual RBAC: SALES MANAGE + PROCUREMENT MANAGE — реализовано |

## Self-Check: PASSED

- `lib/sales-plan/virtual-purchases.ts` — EXISTS
- `app/(dashboard)/sales-plan/purchases/page.tsx` — EXISTS
- `components/sales-plan/VirtualPurchasesTable.tsx` — EXISTS
- `components/sales-plan/VirtualPurchaseDialog.tsx` — EXISTS
- Commits: 1713b8b, 7a77111, 4ea8757 — все в `git log`
- `npx tsc --noEmit` — PASSED (no output)
- `npx vitest run tests/sales-plan-virtual.test.ts` — 10/10 PASSED
