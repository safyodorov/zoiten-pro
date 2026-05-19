---
phase: quick-260518-h6p
plan: 01
subsystem: prices-wb
tags: [prices-wb, feedbacks, imtId, ui]
requires:
  - WbCard.imtId (Phase 16-mci, schema)
  - SupportTicket.channel=FEEDBACK + rating + messages.INBOUND (Phase 9 support module)
  - quick-260518-gg3 (per-nmId легенда + лента ReviewChip)
provides:
  - "Per-nmId-блок в expand-панели /prices/wb теперь рендерит до двух строк лент отзывов: «По связке (N)» и «По товару (N)»"
  - "Reviews shape: { byImt: FeedbackItem[]; byNmId: FeedbackItem[] }"
affects:
  - "/prices/wb expand-панель"
tech-stack:
  added: []
  patterns:
    - "Hoist imtId siblings: nmIdsByImtId Map<imtId, nmId[]> для группировки отзывов по склейке без N+1"
    - "Per-nmId merge + sort + slice(10) для byImt — ordering preserved через createdAt desc"
key-files:
  created: []
  modified:
    - "app/(dashboard)/prices/wb/page.tsx"
    - "components/prices/PriceCalculatorTable.tsx"
decisions:
  - "byImt = union всех nmId одной imtId (включая soft-deleted и cardsInStockOnly-фильтрованные) — отзывы существуют независимо от текущей видимости карточек"
  - "Если imtId=null → byImt=[] → строка автоматически скрыта (graceful degradation для старых карточек до Phase 16-mci)"
  - "Префиксы key `imt-{id}` / `nm-{id}` в ReviewChip key — защита от React key collision при single-nmId склейке (одинаковые feedback id в обеих лентах)"
  - "Подпись слева, лента справа (flex-row items-center) — компактнее flex-col, занимает меньше высоты в expand-панели"
metrics:
  duration: "~6min"
  completed: "2026-05-18"
---

# Quick 260518-h6p: /prices/wb expand — две строки лент отзывов «По связке / По товару» Summary

## One-liner

Per-nmId-блок в expand-панели `/prices/wb` теперь рендерит две строки ReviewChip-лент: **«По связке (N)»** (top-10 desc по всем nmId одной imtId) и **«По товару (N)»** (top-10 desc по конкретному nmId). Пустые ленты скрыты вместе с подписью.

## What Changed

### Task 1 — `app/(dashboard)/prices/wb/page.tsx`

- Построены индексы `imtIdsByNmId` (visible nmId → imtId) и `nmIdsByImtId` (imtId → все nmId склейки).
- Запрос `SupportTicket.findMany` расширен: `nmId IN allRelatedNmIds` (union visibleNmIds + всех siblings).
- Группировка переделана: `allByNmId: Map<nmId, FeedbackItem[]>` (сначала собираем все), затем per-visibleNmId формируется пара `{ byImt, byNmId }`:
  - `byNmId` = `slice(0,10)` от соответствующего nmId
  - `byImt` = merge siblings → sort createdAt desc → `slice(0,10)`
- `productNmIdsWithCharts.reviews` теперь объект `{ byImt, byNmId }` вместо плоского массива.

### Task 2 — `components/prices/PriceCalculatorTable.tsx`

- `ProductGroup.ordersCharts[].reviews` тип обновлён до `{ byImt, byNmId }`.
- `NmIdLegend` рендерит **две независимые строки лент** (вместо одной):
  - Каждая строка — `flex-row items-center` с подписью слева (`whitespace-nowrap`) и ReviewChip-grid справа (`flex-wrap`).
  - Пустая лента (`.length === 0`) скрывается полностью (подпись + контейнер).
  - Префиксы `imt-` / `nm-` в React key.

## Deviations from Plan

None — план выполнен ровно как написано. Никаких bugs, missing functionality, или architectural surprises.

## Verification

| Check | Status |
|---|---|
| `npx tsc --noEmit` (full project) | PASS (0 errors) |
| `npm run build` | PASS (`/prices/wb` route 16.5 kB, ±0.1 kB от gg3 baseline) |
| `pricing-math.test.ts` | PASS (17/17) |
| `wb-orders-chart-fill.test.ts` | PASS (14/14) |

Pre-existing failures в `tests/wb-sync-route.test.ts` и другие — НЕ касаются `/prices/wb` и не связаны с этим изменением.

## Smoke (after deploy)

1. https://zoiten.pro/prices/wb — раскрыть товар с несколькими nmId одной склейки (одежда) → визуально два ряда чипов под графиком каждого nmId.
2. Товар с одиночным nmId (старая карточка, imtId=null) → только строка «По товару».
3. Товар без отзывов → ни одной строки лент, только 4 метрики выше.
4. /cards/wb — визуально без изменений (Rule scope-boundary соблюдён).

## Commits

- `f2199bb` — feat(quick-260518-h6p): load feedbacks по imtId-склейкам + shape { byImt, byNmId } в /prices/wb
- `b250b8f` — feat(quick-260518-h6p): две строки лент отзывов «По связке / По товару» в expand-панели /prices/wb

## Deploy

Standard: `ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"` — делегируется пользователю.

## Self-Check: PASSED

- [x] `app/(dashboard)/prices/wb/page.tsx` modified, committed `f2199bb`
- [x] `components/prices/PriceCalculatorTable.tsx` modified, committed `b250b8f`
- [x] `tsc --noEmit` = 0 errors
- [x] `npm run build` = success
- [x] Regression tests (pricing-math + wb-orders-chart-fill) = PASS
- [x] Изменения изолированы в /prices/wb (/cards/wb не тронут)
