---
phase: 25-v2-h2-2026
plan: 05
subsystem: sales-plan
tags: [server-actions, rbac, procurement, sales-plan]
dependency_graph:
  requires: [25-03]
  provides: [saveMonthLevels, scaleMonthLevels, saveDayOverrides, saveProductPlanParams, saveModelParams, getProductPlanDays, savePlannedArrivalDate]
  affects: [25-04, 25-06, /sales-plan/products, /procurement/purchases]
tech_stack:
  patterns: [server-actions, zod-safeParse, requireSection-MANAGE, revalidatePath, native-date-input]
key_files:
  modified:
    - app/actions/sales-plan.ts
    - app/actions/procurement.ts
    - app/(dashboard)/procurement/purchases/[id]/page.tsx
  created:
    - components/procurement/PlannedArrivalDateField.tsx
decisions:
  - revalidateSalesPlanPaths() helper вместо трёх inline revalidatePath — semtically correct; grep count ≥5 критерий не пройдёт дословно, но каждый write-action вызывает helper → все три пути ревалидируются
  - scaleMonthLevels материализует baseline через funnel last-7d (ordersCount) per nmId вместо loadSalesPlanInputs — избегает лишних БД-запросов; точность идентична
  - PlannedArrivalDateField — отдельный client-компонент (не расширение PurchaseDetailActions), чтобы detail page RSC остался RSC; canManage=false → read-only отображение
  - estimatedArrivalDateLabel вычисляется в RSC из SupplierProductLink.leadTimeDays (min среди позиций закупки) или fallback 45 — соответствует resolver §3.4
metrics:
  duration: "~20 min"
  completed: "2026-07-04"
  tasks: 2
  files: 4
---

# Phase 25 Plan 05: Server Actions плана продаж v2 + поле «Плановая дата прихода»

Server actions для редактирования рабочего плана продаж H2-2026 (все write — SALES MANAGE, закрытие дыры SP-13) + read-action дневных данных для realtime-модалки + поле plannedArrivalDate в карточке закупки с PROCUREMENT MANAGE.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | sales-plan write-actions + getProductPlanDays | de4230a | app/actions/sales-plan.ts |
| 2 | savePlannedArrivalDate + PlannedArrivalDateField | 17e6655 | app/actions/procurement.ts, components/procurement/PlannedArrivalDateField.tsx, app/(dashboard)/procurement/purchases/[id]/page.tsx |

## What Was Built

### Task 1: Новые server actions в `app/actions/sales-plan.ts`

6 новых экспортируемых функций добавлены к существующему файлу (старые `saveBaselineOverrides`, `savePriceOverrides`, `clearBaselineOverrides`, `saveLeadTimes`, `bulkUpdateArrivalDates` — НЕ тронуты, остаются до Wave 6 зачистки):

**Write-actions (требуют SALES MANAGE):**
- `saveMonthLevels(payload[])` — upsert `SalesPlanMonthLevel` per (productId, month); если все три поля null → deleteMany (возврат к baseline)
- `scaleMonthLevels({ month, factor, productIds? })` — масштабирование: для товаров с существующим targetOrdersPerDay умножает на factor; для товаров с null — материализует `baseline × factor` из funnel last-7d (снапшот). Возвращает `{ materializedCount, scaledCount }`
- `saveDayOverrides({ productId, overrides })` — upsert `SalesPlanDayOverride`; null → deleteMany
- `saveProductPlanParams({ productId, month, priceRub, buyoutPct })` — обновляет только priceRub/buyoutPct, не трогает targetOrdersPerDay
- `saveModelParams({ defaultLeadTimeDays?, safetyStockDays?, vpCoverDays?, transitDays?, wbInboundLagDays?, deliveryDays?, returnDays? })` — скалярные ключи `salesPlan.*` + JSON `salesPlan.leadTimes2`

**Read-action (требует SALES VIEW):**
- `getProductPlanDays(productId, month, versionId?)` — загружает `loadSalesPlanInputs` → `computeSalesPlan` → фильтр по месяцу; возвращает `{ days: PlanDayRow[], productInput: ProductPlanInput }` — полный сериализуемый вход для клиентского realtime-пересчёта

Все write-actions вызывают `revalidateSalesPlanPaths()` (хелпер, реквалидирует `/sales-plan`, `/sales-plan/products`, `/sales-plan/purchases`).

TODO Wave 6: вызов `regenerateVirtualPurchases` в `saveMonthLevels` и `saveDayOverrides`.
TODO Wave 7: `getProductPlanDays` с versionId — читать из `SalesPlanVersionDay` (сейчас игнорируется, всегда драфт).

### Task 2: `savePlannedArrivalDate` + поле в карточке закупки

**`app/actions/procurement.ts`:**
- Новая функция `savePlannedArrivalDate({ purchaseId, date })` под PROCUREMENT MANAGE
- Zod: `date` — null | regex `YYYY-MM-DD`
- Сохраняет `Purchase.plannedArrivalDate` (Prisma Date)
- revalidatePath: `/procurement/purchases`, `/procurement/purchases/${purchaseId}`, `/sales-plan/products`, `/sales-plan` (resolver дат приходов перечитает)

**`components/procurement/PlannedArrivalDateField.tsx`:**
- Client-компонент с native `<input type="date">` (CLAUDE.md convention)
- `onBlur` → `savePlannedArrivalDate`; optimistic (сбрасывает на старое значение если ошибка)
- Хинт `расчётно: DD.MM.YYYY` если дата пуста (createdAt + leadTimeDays)
- Подпись: «приоритетный источник дат для плана продаж; без неё — эвристика createdAt+45»
- `canManage=false` → read-only отображение (DD.MM.YYYY или расчётный хинт)

**`app/(dashboard)/procurement/purchases/[id]/page.tsx`:**
- Вычисляет `minLeadTimeDays` из SupplierProductLink (min по позициям закупки, fallback 45)
- Вычисляет `estimatedArrivalDateLabel` (createdAt + minLeadTimeDays, форматирует в ru-RU)
- Рендерит `PlannedArrivalDateField` в новом блоке (border/padding) перед таблицей позиций
- Detail page остаётся RSC

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Pattern] revalidateSalesPlanPaths() хелпер вместо inline-вызовов**
- **Нашёл при:** Task 1, реализации write-actions
- **Суть:** Принял архитектурное решение вынести три `revalidatePath` в хелпер-функцию, чтобы не дублировать строки 5×3 = 15 раз
- **Следствие:** Acceptance criterion `grep -c 'revalidatePath("/sales-plan/products")' ≥ 5` не пройдёт дословно (1 прямая строка, 5 косвенных через хелпер)
- **Функционально:** каждый из 5 write-actions вызывает `revalidateSalesPlanPaths()` → все три пути ревалидируются — соответствует требованию плана

**2. [Rule 2 - Pattern] scaleMonthLevels: минимальный запрос funnel vs полный loadSalesPlanInputs**
- **Нашёл при:** Task 1, реализации scaleMonthLevels
- **Суть:** Для материализации baseline при null-уровнях использовал прямой запрос `wbCardFunnelDaily` (last-7d ordersCount per nmId), а не полный `loadSalesPlanInputs`
- **Причина:** `loadSalesPlanInputs` тянет 8+ больших запросов к БД; scaleMonthLevels вызывается в контексте одного месяца и нуждается только в baseline (ords7 / 7)
- **Точность:** идентична — data.ts вычисляет baseline тем же способом (ords7 / 7)

## Прод-задача этапа 2 (из плана §9)

Перед деплоем или сразу после: **проверить UserSectionRole по SALES** у всех активных пользователей. Кто имеет VIEW → write-actions (`saveMonthLevels` и др.) будут отклоняться с ошибкой доступа. Выдать MANAGE + попросить перелогиниться (JWT не самообновляется).

## Known Stubs

Нет стабов, влияющих на работоспособность текущего плана.

## Threat Flags

Нет новых незафиксированных поверхностей — все endpoints защищены (T-25-01..T-25-04 из плана закрыты).

## Self-Check: PASSED

- app/actions/sales-plan.ts — FOUND
- app/actions/procurement.ts — FOUND
- components/procurement/PlannedArrivalDateField.tsx — FOUND
- commit de4230a — FOUND (Task 1)
- commit 17e6655 — FOUND (Task 2)
- `npx tsc --noEmit` — exit 0 (no errors)
