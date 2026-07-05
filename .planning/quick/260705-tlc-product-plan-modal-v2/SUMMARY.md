---
phase: quick-260705-tlc
plan: 01
subsystem: sales-plan
tags: [sales-plan, modal, recharts, ux]
key-files:
  created: []
  modified:
    - app/actions/sales-plan.ts
    - components/sales-plan/ProductPlanDialog.tsx
    - components/sales-plan/ProductPlanTable.tsx
decisions:
  - "dayDrafts поднят в общий стейт диалога — влияет и на таблицу дней, и на главный график"
  - "factUnits собираются из WbCardOrdersDaily с fallback на WbSalesDaily нетто"
  - "useMemo для mergedProductResult — избегаем лишних вызовов computeSalesPlan при каждом рендере"
metrics:
  duration: ~30 min
  completed: 2026-07-05
  tasks_completed: 2
  files_modified: 3
---

# Phase quick-260705-tlc Plan 01: ProductPlanDialog v2 — большая модалка горизонта H2

**One-liner:** Модалка товара в /sales-plan/products переработана в единый наглядный экран без табов: ComposedChart всего горизонта H2 (план bars + факт bars + Сток line), сетка 6 месяцев с realtime-пересчётом через computeSalesPlan, приходы со стокаутом, details «Правка по дням».

## Что сделано

### Task 1 — getProductPlanHorizon (app/actions/sales-plan.ts)

Добавлен новый read-action сразу после getProductPlanDays:
- requireSection("SALES") (VIEW)
- Читает AppSetting (deliveryDays, returnDays, wbInboundLagDays, transitDays, defaultLeadTimeDays, safetyStockDays, vpCoverDays, horizonFrom/horizonTo)
- loadSalesPlanInputs → computeSalesPlan → весь productResult.days без фильтра месяца
- factUnitsDaily из prisma.wbCardOrdersDaily по productInput.nmIds; fallback prisma.wbSalesDaily нетто выкупов
- Возвращает { ok: true, productInput, days, factUnitsDaily } или { ok: false, error }

### Task 2 — ProductPlanDialog.tsx (полная переработка) + ProductPlanTable.tsx (проброс abcStatus)

Удалено: Tab тип, activeTab state, кнопки табов, ParamsTab компонент.

Добавлено:
- DialogContent: max-w-[95vw] xl:max-w-7xl max-h-[92vh] overflow-y-auto
- loadHorizon() через getProductPlanHorizon(productId) при открытии
- Мета-строка: ABC-бейдж, сток, скорость baseline, % выкупа
- ComposedChart height=340: Bar план (chart-2), Bar факт (chart-1, только <= today), Line сток правая ось (chart-iu), ReferenceLine сегодня, ReferenceLine приходов
- useMemo mergedProductResult с пересчётом через computeSalesPlan при изменении levelDrafts + dayDrafts
- Сетка grid-cols-3 xl:grid-cols-6 — инпуты заказов/день + цена с placeholder
- Строка «План H2: X · Y шт» из monthTotals
- Кнопка «Сохранить»: только изменённые месяцы, null для пустых, toast + refresh + close
- Секция «Приходы партий»: список или «Приходов нет»; строка стокаута
- details «Правка по дням»: таблица дней, saveDayOverrides, dayDrafts в общем стейте
- readOnly: инпуты disabled, кнопки скрыты

ProductPlanTable.tsx: проброс abcStatus в вызов ProductPlanDialog.

## Deviations from Plan

None — план выполнен дословно.

## Self-Check: PASSED

- npx tsc --noEmit: 0 ошибок
- npm run build: успешно
- npx vitest run: 20/20 GREEN

Коммиты:
- d39ef7f feat(quick-260705-tlc-01): getProductPlanHorizon
- 5826423 feat(quick-260705-tlc-01): ProductPlanDialog v2 + abcStatus

## Ручной чеклист (проверить на dev/prod)

- [ ] Клик по строке товара в /sales-plan/products открывает большую модалку (95vw), без табов, одной прокруткой.
- [ ] График показывает весь H2 по дням: бары план + бары факт (только прошлое) + линия сток (правая ось).
- [ ] Линия «сегодня» и вертикали приходов (реальные сплошные / виртуальные пунктир) с qty на графике.
- [ ] Правка заказов/цены в сетке месяцев мгновенно меняет график и «План H2».
- [ ] «Сохранить» пишет уровни (проверить: пустой инпут сбрасывает уровень на авто), toast, таблица обновилась.
- [ ] «Приходы партий»: список источников; если стокаут — красная строка с потерями.
- [ ] «Правка по дням» раскрывается, правка дня меняет и таблицу, и главный график; «Сохранить» пишет дни.
- [ ] Тёмная тема: график/бейджи/линии читаются (токены + dark-пары).
