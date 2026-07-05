---
phase: quick-260705-seb
plan: 01
subsystem: sales-plan
tags: [arrivals, eta, floor, fact-redemption, pro-rata, cell-format]
dependency_graph:
  requires: [lib/sales-plan/arrivals.ts, lib/sales-plan/data.ts, lib/purchase-stages.ts]
  provides: [floor ETA по этапу, факт по реализации, pro-rata pct, тыс ₽ формат]
  affects: [/sales-plan/products]
tech_stack:
  added: []
  patterns: [floor+max ETA, redemptionByProduct, SalesPlanVersionDay pro-rata, fmtThousands]
key_files:
  created: []
  modified:
    - lib/sales-plan/arrivals.ts
    - lib/sales-plan/data.ts
    - tests/sales-plan-arrivals.test.ts
    - app/(dashboard)/sales-plan/products/page.tsx
    - components/sales-plan/ProductPlanTable.tsx
decisions:
  - ETA floor: SHIPMENT→today+transit; иначе→today+defaultLeadTime; max(createdAt+lt, floor)
  - plannedArrivalDate обходит floor (manual приоритет)
  - Факт per-товар из redemptionByProduct (НЕТТО по дате реализации), не когортный funnel
  - pct база = SalesPlanVersionDay за дни ≤ today−1 (pro-rata); скрыт без активной версии
  - fmtThousands: тыс ₽ с разделителями без буквы; футер и заголовок «Итог, тыс ₽»
metrics:
  duration: "~25 min"
  completed: "2026-07-05"
  tasks: 3
  files: 5
---

# Phase quick-260705-seb Plan 01: ETA приходов по этапу + факт реализации + про-ратное отклонение + формат тыс ₽

**One-liner:** ETA закупок floor-ится по достигнутому этапу (SHIPMENT→transit, иначе→leadTime); факт ячеек переключён на WbSalesDaily redemption НЕТТО; про-ратное отклонение vs активной версии; ячейки «407 · 61 шт» / «762 · 113 шт» / «+87%» без букв П/Ф/К/М.

## Задачи и коммиты

| Задача | Описание | Коммит |
|--------|----------|--------|
| 1 (D-1) | ETA floor по этапу + тесты | 0ffd1a0 |
| 2 (D-3+D-4) | факт из redemptionByProduct + versionPastPlanRub в page.tsx | e434e50 |
| 3 (D-4+D-5) | формат ячеек тыс ₽ + pro-rata pct + легенда + футер | 7685373 |

## Детали реализации

### D-1: ETA с floor по этапу (lib/sales-plan/arrivals.ts + data.ts)

- `PurchaseInput.reachedStages: string[]` — ключи достигнутых этапов item'а
- `ArrivalBatchesInput.today: string` — для вычисления floor
- `resolveLeadtimeDate`: `floor = stage === "SHIPMENT" ? today+transitDays : today+defaultLeadTimeDays`; `ETA = max(createdAt+lt, floor)`
- `plannedArrivalDate` (уровень 1) — floor не применяется
- `data.ts`: `reachedStages: item.stages.map(s => s.stage)` + `today` в `arrivalInput`
- 4 новых теста (A/B/C/D), все 13 зелёных

### D-3: Факт по дате реализации (page.tsx)

- `factByProduct` итерируется из `factData.redemptionByProduct` (WbSalesDaily, НЕТТО = выкупы + returnsRub)
- `factData.byProduct` (funnel когорта) не удалён — используется Сводным

### D-4: Pro-rata план версии (page.tsx + ProductPlanTable.tsx)

- `versionPastPlanByProduct`: Prisma-запрос `salesPlanVersionDay.findMany` за [HORIZON_FROM, yesterday], группируется по (productId, month)
- `versionPastPlanRub: Record<string, number>` добавлено в `ProductRow`
- В ячейке: `versionBase = p.versionPastPlanRub[month] ?? 0`; `pct = versionBase > 0 && factRow ? factRow.buyoutsRub / versionBase - 1 : null`
- Без активной версии → pct скрыт

### D-5: Формат ячеек (ProductPlanTable.tsx)

- Хелпер `fmtThousands(n)`: `fmtNum(Math.round(n / 1000), 0)` — 407123 → «407»
- Строка 1: `{fmtThousands(planRub)} · {fmtAdaptive(planUnits)} шт` (всегда, во всех месяцах)
- Строка 2: `{fmtThousands(factRow.buyoutsRub)} · {fmtAdaptive(factRow.buyoutsUnits)} шт` (при hasFactData && factRow)
- Строка 3: `{pct >= 0 ? "+" : ""}{Math.round(pct * 100)}%` (целые %, про-ратная база)
- Заголовок: «Итог, тыс ₽»; итог строки и футер → `fmtThousands`; футер факт без буквы «Ф»
- Легенда «план / факт · тыс ₽ · шт» в тулбаре (`ml-auto self-center`)
- `fmtRub` не удалён (используется в других местах)

## Gate

- `npx tsc --noEmit` — 0 ошибок
- `npm run build` — успешно
- `npx vitest run tests/sales-plan-arrivals.test.ts tests/sales-plan-engine.test.ts tests/sales-plan-iu.test.ts tests/sales-plan-virtual.test.ts` — **44 passed (4 файла)**
- Golden iu=438068120 не тронут
- engine.ts, virtual-purchases.ts, схема БД, модалка «Дни» — не тронуты

## Deviations from Plan

None — план выполнен точно.

## Known Stubs

Нет стабов, блокирующих цель плана.

## Post-Deploy (D-2) — НЕ ВЫПОЛНЕН ДО ДЕПЛОЯ

После деплоя выставить на проде `AppSetting.salesPlan.transitDays` = **40** (было 20).

Команда SQL:
```sql
UPDATE "AppSetting" SET value = '40' WHERE key = 'salesPlan.transitDays';
```

Или через UI ModelParamsBar на `/sales-plan/products` (поле «Транзит, дн»).

**Важно:** без этого шага ETA SHIPMENT-закупок будет floor-иться на today+20, а не на today+40 как планировалось. Выполнить после подтверждения успешного деплоя.

## Self-Check: PASSED

- FOUND: lib/sales-plan/arrivals.ts
- FOUND: lib/sales-plan/data.ts
- FOUND: tests/sales-plan-arrivals.test.ts
- FOUND: app/(dashboard)/sales-plan/products/page.tsx
- FOUND: components/sales-plan/ProductPlanTable.tsx
- FOUND commit 0ffd1a0 (Task 1)
- FOUND commit e434e50 (Task 2)
- FOUND commit 7685373 (Task 3)
