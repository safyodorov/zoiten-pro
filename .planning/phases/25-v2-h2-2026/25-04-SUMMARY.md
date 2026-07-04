---
phase: 25-v2-h2-2026
plan: "04"
subsystem: sales-plan-products
tags: [sales-plan, ui, table, realtime, bulk-drafts, cascade-filters, sticky]
dependency_graph:
  requires: [25-05, 25-03]
  provides: [sales-plan/products-page, ProductPlanTable, ProductPlanDialog, SalesPlanTabs, SalesPlanFilters, ModelParamsBar, IncomingBadges]
  affects: [sales-plan, section-titles]
tech_stack:
  added: []
  patterns: [bulk-drafts, sticky-table, cascade-filters, realtime-client-engine, debounced-save]
key_files:
  created:
    - app/(dashboard)/sales-plan/products/page.tsx
    - components/sales-plan/SalesPlanTabs.tsx
    - components/sales-plan/SalesPlanFilters.tsx
    - components/sales-plan/ModelParamsBar.tsx
    - components/sales-plan/IncomingBadges.tsx
    - components/sales-plan/ProductPlanTable.tsx
    - components/sales-plan/ProductPlanCell.tsx
    - components/sales-plan/ProductPlanDialog.tsx
  modified:
    - components/layout/section-titles.ts
decisions:
  - "ProductPlanDialog lazy-загружает getProductPlanDays только при открытии (не в RSC-payload), realtime-пересчёт через чистую computeSalesPlan без Prisma"
  - "IncomingBadges в этой волне рендерит только source=purchase|incoming-legacy; виртуальные ◇/⚠ — Wave 6"
  - "factByProduct передаётся в ProductPlanTable как Record<productId,Record<date,row>> (Map не сериализуется через RSC→client границу)"
  - "ModelParamsBar использует <details>/<summary> без анимации; debounced save 500ms per поле (паттерн GlobalRatesBar)"
  - "section-titles: /sales-plan/products и /sales-plan/purchases добавлены выше общего /^\/sales-plan/ — порядок important"
metrics:
  duration: "560 сек (~9 мин)"
  completed: "2026-07-04T14:18:00Z"
  tasks: 3
  files: 9
---

# Phase 25 Plan 04: Таб «Товары» /sales-plan/products Summary

Этап 2 часть 2 Плана продаж v2: рабочий таб «Товары» с помесячными плановыми уровнями per товар, bulk-редактированием, модалкой дней с realtime-пересчётом стока, реальными приходами, панелью параметров модели и каскадными фильтрами.

## Tasks

### Task 1: SalesPlanTabs + SalesPlanFilters + ModelParamsBar + IncomingBadges + section-titles
**Commit:** 643fa33

- `SalesPlanTabs` — 3 таба с `prefetch={false}`, точное совпадение pathname для `/sales-plan`, startsWith для подроутов, опциональный urgentCount бейдж
- `SalesPlanFilters` — каскад Направление→Бренд→Категория→Подкатегория, невалидные выборы тихо вычищаются из URL при смене родителя
- `ModelParamsBar` — collapsible `<details>`, 7 полей, debounced save 500ms per поле через useRef таймеры (паттерн GlobalRatesBar), `saveModelParams` + `router.refresh()`
- `IncomingBadges` — только реальные приходы (`source=purchase|incoming-legacy`), `Package` иконка, popover с датой/кол-вом/dateSource-тегом/ссылкой; `IncomingBadgesLegend` в футере таблицы
- `section-titles.ts` — добавлены строки `/sales-plan/products` и `/sales-plan/purchases` выше существующего `/^\/sales-plan/`

### Task 2: ProductPlanCell + ProductPlanTable (bulk-drafts + sticky)
**Commit:** c1772c8

- `ProductPlanCell` — inline-редактируемая ячейка месяца, клик→показать native input, Enter/Escape→скрыть, placeholder = baseline, кнопка ✕ сброс на null, маркер `•д` при дневных правках
- `ProductPlanTable` — sticky-left (Фото·SKU·Название·Приходы) со СПЛОШНЫМ bg-background (без /NN), bulk-drafts `Record<productId,Record<month,string>>`, «Пересчитать план (N)» → `saveMonthLevels` + `router.refresh()` + `setDrafts({})`, «Отменить правки», «Масштабировать месяц» → `scaleMonthLevels` с диалогом подтверждения; итоговая строка `sticky bottom-0 bg-muted` (сплошной); режимы compare/edit; raw HTML thead (не shadcn Table)

### Task 3: ProductPlanDialog + RSC page /sales-plan/products
**Commit:** bf6d42e

- `ProductPlanDialog` — вкладки Дни/Параметры/График (native state, не URL); «Дни»: lazy load `getProductPlanDays(productId, month)` при открытии/смене месяца; realtime «Сток(расч)» при вводе — локально мержим dayDrafts в productInput.dayOverrides и вызываем `computeSalesPlan` без сервера; «Сохранить и пересчитать» → `saveDayOverrides` + `router.refresh()`; «Параметры»: `saveProductPlanParams`; «График»: bar-chart recharts
- `app/(dashboard)/sales-plan/products/page.tsx` — RSC с `requireSection("SALES")` + `getSectionRole` → canManage; `loadSalesPlanInputs` + `computeSalesPlan` (горизонт H2 Июл-Дек 2026); `loadFactDaily` за горизонт → factByProduct (Map→Record); каскадные фильтры с FK-полями (Brand.directionId, Category.brandId, Subcategory.categoryId); `readOnly = mode !== "edit" || !canManage || Boolean(versionId)`

## Deviations from Plan

None - план выполнен точно как написано.

## Known Stubs

- `IncomingBadges`: виртуальные приходы `◇/⚠` (source=virtual, SUGGESTED/ACCEPTED) скрыты — Wave 6 включит их
- `PlanVersionBar` в page.tsx опущен — заглушка до Wave 7 (версионирование)
- `ProductPlanDialog` «Дни»: колонки Факт шт / Факт ₽ / Отклонение не заполняются (нет fact-данных per день в текущем getProductPlanDays — только plan) — Wave 5/6 добавит через plan-fact.ts

## Self-Check: PASSED

Все 9 файлов существуют. Все 3 коммита (643fa33, c1772c8, bf6d42e) присутствуют в git log. `npx tsc --noEmit` — 0 ошибок. Sticky-ячейки без прозрачных bg (`grep -c "bg-muted/[0-9]" ProductPlanTable.tsx` = 0).
