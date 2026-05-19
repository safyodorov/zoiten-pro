---
quick: 260518-gg3
plan: 01
subsystem: prices-wb / cards-wb / orders-chart
tags: [prices-wb, cards-wb, ux, chart, reviews, single-expand]
files_modified:
  - components/cards/WbCardOrdersChart.tsx
  - components/prices/PriceCalculatorTable.tsx
  - app/(dashboard)/prices/wb/page.tsx
files_created: []
decisions:
  - "Direction enum в проекте = INBOUND/OUTBOUND (НЕ INCOMING/OUTGOING как в плане-шаблоне) — подтверждено grep'ом prisma/schema.prisma:671"
  - "Tooltip formatter в WbCardOrdersChart — полный JSX render с indicator div, потому что shadcn-chart обёртка вызывает formatter как React.Node, не как [value,name] tuple (см. components/ui/chart.tsx:215-216)"
  - "wbStoreRating / wbStoreFeedbacks ↦ ratingImt / reviewsTotalImt ↦ rating / reviewsTotal — три уровня fallback для рейтинга связки, приоритет витрине WB"
  - "Reviews сериализуются как Record<number, FeedbackItem[]> (НЕ Map) — Map не сериализуется через RSC→client boundary; Date.toISOString() для createdAt"
  - "RATING_BG: 5★ emerald-500/80 → 1★ red-500/85 — линейная шкала, контрастная для быстрого скана ленты"
metrics:
  duration: "~25 минут"
  completed: "2026-05-18T12:08:00Z"
  tasks: 3
  files: 3
  commits: 3
  bundle_delta_prices_wb_kb: "+0.6 kB (15.8 → 16.4 kB)"
---

# Quick 260518-gg3 Summary

## One-liner

Доработка графиков /cards/wb и /prices/wb: single-expand в /prices/wb (UX consistency), визуальные правки графика (точка, ru-RU тысячи, «арт.»), per-nmId легенда + лента отзывов с цветовой шкалой звёзд в expand-панели /prices/wb.

## What got built

### Task 1: Single-expand + chart polish

**components/prices/PriceCalculatorTable.tsx:**
- `expandedProductIds: Set<string>` → `expandedProductId: string | null` (single-expand)
- `toggleProductExpand` теперь возвращает `prev === id ? null : id` — клик по другой Сводке закрывает предыдущую
- 3 обращения `expandedProductIds.has(...)` заменены на `expandedProductId === ...`

**components/cards/WbCardOrdersChart.tsx:**
- Header: «nm {nmId}» → «арт. {nmId}»
- Line `dot.r`: 3 → 1.5 (точка цены в 2 раза меньше, меньше «зашумлена»)
- «Цена сейчас»: `{lastBuyerPrice}` → `{lastBuyerPrice.toLocaleString("ru-RU")}` («4 207 ₽» вместо «4207 ₽»)
- `ChartTooltip` formatter: полный JSX render (indicator + label + value) с `toLocaleString("ru-RU")` — пробел между label и числом + тысячи с пробелом

Применяется на ОБЕИХ страницах автоматически (компонент шарится).

### Task 2: Load SupportTicket feedbacks + расширить ProductGroup

**app/(dashboard)/prices/wb/page.tsx:**
- Новый блок загрузки `prisma.supportTicket.findMany({where: {channel: "FEEDBACK", nmId: {in: visibleNmIds}, rating: {not: null}}, orderBy: createdAt desc, include: messages where direction=INBOUND take 1})`
- Группировка в `reviewsByNmId: Record<number, FeedbackItem[]>` (top-10 desc per nmId)
- Text = `messages[0]?.text ?? previewText ?? ""`, createdAt = `Date.toISOString()`
- `productNmIdsWithCharts.push(...)` расширен 5 полями: `stockQty`, `avgSalesSpeed7d`, `rating` (wbStoreRating ↦ ratingImt ↦ rating), `reviewsTotal` (wbStoreFeedbacks ↦ reviewsTotalImt ↦ reviewsTotal), `reviews`

**components/prices/PriceCalculatorTable.tsx:**
- `ProductGroup.ordersCharts` тип расширен — 6 новых полей видны компилятору (готовим к Task 3 UI)

### Task 3: Per-nmId легенда + лента отзывов

**components/prices/PriceCalculatorTable.tsx:**
- 3 локальных компонента: `LegendItem`, `ReviewChip`, `NmIdLegend`
- `RATING_BG` map: 5★ emerald-500/80 → 4★ emerald-400/70 → 3★ yellow-400/80 → 2★ orange-500/80 → 1★ red-500/85
- `NmIdLegend` рендерит 4 метрики (Остаток, Остаток в днях, Рейтинг связки, Кол-во оценок) + ленту чипов (если reviews.length > 0)
- `daysLeft = Math.floor(stockQty / avgSalesSpeed7d)` (null если speed=0 или null)
- `ReviewChip` использует Tooltip (base-ui render-prop pattern) → text + dateStr (ru-RU `toLocaleDateString`)
- Per-nmId layout: `flex flex-col gap-2` → Chart сверху, NmIdLegend снизу (max-w-[640px] выровнено)
- Charts.map destructure заменён на `(c) => ...` для доступа к новым полям

## Files Modified

| Path | Lines Δ |
|------|--------|
| components/cards/WbCardOrdersChart.tsx | +40 / −5 |
| components/prices/PriceCalculatorTable.tsx | +135 / −10 |
| app/(dashboard)/prices/wb/page.tsx | +73 / −2 |

## Commits

| # | Task | Commit | Message |
|---|------|--------|---------|
| 1 | Single-expand + chart polish | f64f6e6 | feat(quick-260518-gg3): single-expand /prices/wb + chart polish (арт./tooltip ru-RU/смaller dot) |
| 2 | Load reviews + extend ProductGroup | 65af55c | feat(quick-260518-gg3): load SupportTicket feedbacks per nmId для expand-панели /prices/wb |
| 3 | Per-nmId legend + ribbon | 760085a | feat(quick-260518-gg3): per-nmId легенда + лента отзывов в expand-панели /prices/wb |

## Smoke Results

| Check | Status | Notes |
|-------|--------|-------|
| `npx tsc --noEmit` (after Task 1) | PASS | 0 errors |
| `npx tsc --noEmit` (after Task 2) | PASS | 0 errors |
| `npx tsc --noEmit` (after Task 3) | PASS | 0 errors |
| `npm run build` (after Task 1) | PASS | /prices/wb 15.8 → проверено |
| `npm run build` (after Task 2) | PASS | nothing broken |
| `npm run build` (after Task 3) | PASS | /prices/wb 16.4 kB (+0.6 kB) |
| `npm run test tests/pricing-math.test.ts` | PASS | 17/17 passed, golden test profit 567.68 OK |
| `npm run test tests/wb-orders-chart-fill.test.ts` | PASS | 14/14 passed |

### Pre-existing test failures (NOT related to this task)

Полный `npm run test` показал 10 failing test files (41 failed tests из 547). НИ ОДИН из них не касается изменённых в этом quick task файлов:

- `tests/appeal-actions.test.ts` — Phase 11
- `tests/customer-actions.test.ts` — Phase 12
- `tests/customer-sync-chat.test.ts` — Phase 12
- `tests/merge-customers.test.ts` — Phase 12
- `tests/messenger-ticket.test.ts` — Phase 12
- `tests/response-templates.test.ts` — Phase 11
- `tests/support-sync-chats.test.ts` — Phase 10
- `tests/support-sync-returns.test.ts` — Phase 9
- `tests/template-picker.test.ts` — Phase 11
- `tests/wb-sync-route.test.ts` — WB sync (не Chart)

Эти failure'ы существовали до данного quick task и оставлены as-is (out of scope, Rule «Scope Boundary» из execute-plan workflow).

## Deploy инструкции

Стандартный VPS deploy:

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
```

После deploy:

1. Открыть https://zoiten.pro/cards/wb → проверить визуальные правки графика (заголовок «арт.», точка r:1.5, tooltip с ru-RU «4 207», «Цена сейчас»: «4 207 ₽»).
2. Открыть https://zoiten.pro/prices/wb → клик по Сводке товара A (с активным ordersCharts) → раскрылся; клик по Сводке товара B → A автоматически закрылся, B открылся (single-expand работает).
3. Проверить под каждым графиком: ряд из 4 метрик (Остаток / Остаток в днях / Рейтинг связки / Кол-во оценок) + ленту чипов отзывов (звёзды), если отзывы существуют для nmId.
4. Hover на чип отзыва → Tooltip с рейтингом, датой и текстом отзыва.

## UAT Checklist

- [ ] /cards/wb: заголовок графика начинается с «арт. {nmId}»
- [ ] /cards/wb: точка цены покупателя на line — мелкая (r:1.5)
- [ ] /cards/wb: «Цена сейчас» отображается с разделителем тысяч пробелом (например «4 207 ₽»)
- [ ] /cards/wb: hover на bar/line → tooltip показывает число цены с пробелом тысяч («4 207»)
- [ ] /prices/wb: клик по Сводке товара A → раскрылся; клик по Сводке товара B → A закрылся, B раскрылся (single-expand работает)
- [ ] /prices/wb: под каждым графиком в expand-панели ряд из 4 label/value элементов
- [ ] /prices/wb: при наличии отзывов отображается лента маленьких чипов со звёздами (цвет по рейтингу)
- [ ] /prices/wb: hover на чип → Tooltip с рейтингом, датой и текстом отзыва
- [ ] /prices/wb: товары без отзывов имеют легенду, но не имеют ленты (4 метрики, ленты пустой нет)
- [ ] /prices/wb: клик по ценовой строке (Текущая / Regular / Auto / Расчётная) внутри открытого товара → открывает PricingCalculatorDialog (regression check, expand НЕ закрывается)

## Known Stubs

None. Все данные wired through, legend и лента отзывов рендерят реальные данные из БД (WbCard + SupportTicket).

## Deferred Issues

Pre-existing test failures из Phases 9-12 не входят в scope этого quick task. Их разбор отложен.

## Self-Check: PASSED

**Verified:**

- [x] Все 3 файла модифицированы и закоммичены индивидуальными commit'ами
- [x] components/cards/WbCardOrdersChart.tsx — header «арт.», dot.r=1.5, lastBuyerPrice.toLocaleString, tooltip formatter с ru-RU
- [x] components/prices/PriceCalculatorTable.tsx — single-expand (string | null), ProductGroup type расширен, NmIdLegend + ReviewChip компоненты
- [x] app/(dashboard)/prices/wb/page.tsx — reviewsRaw findMany, reviewsByNmId aggregation, productNmIdsWithCharts расширен 5 полями
- [x] git log --oneline -5 показывает 3 commit'а: f64f6e6, 65af55c, 760085a
- [x] tsc --noEmit: 0 errors (после каждого task'а и финальный)
- [x] npm run build: success (delta /prices/wb: +0.6 kB, в пределах планового бюджета +2 kB)
- [x] Relevant tests (pricing-math.test.ts, wb-orders-chart-fill.test.ts): 31/31 PASS
- [x] Direction enum проверен grep'ом — INBOUND/OUTBOUND, не INCOMING/OUTGOING; используется INBOUND
- [x] SupportTicket fields проверены — channel, nmId, rating, previewText, createdAt, messages — все существуют
