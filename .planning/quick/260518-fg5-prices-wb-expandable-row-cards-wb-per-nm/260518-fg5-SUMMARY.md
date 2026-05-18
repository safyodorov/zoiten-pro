---
quick: 260518-fg5
plan: 01
subsystem: prices-wb / expandable-row / orders-chart
type: execute
tags:
  - prices-wb
  - cards-wb
  - expandable-row
  - orders-chart
  - rsc
  - per-nmId
files_modified:
  - app/(dashboard)/prices/wb/page.tsx
  - components/prices/PriceCalculatorTable.tsx
files_created: []
decisions:
  - "Set<string> для expandedProductIds (можно раскрыть несколько товаров одновременно) — отличается от single-open в /cards/wb. UX: пользователь сравнивает динамику между товарами"
  - "Клик на Сводка cell (не на photo) — крупнее, естественнее. handleClick на td с stopPropagation чтобы не всплыло в <tr onClick> и не открылось модалка ценовой строки"
  - "Per-product flat rendering через React.Fragment: rowTrs + expandedTr — чистая компоновка без рефакторинга основной flatMap"
  - "colSpan = 4 sticky + visibleScrollCount (status уже включён в SCROLL_COLUMNS, +1 не нужен) — корректно учитывает скрытые через «Вид» колонки"
  - "Окно 28 дней (не 30) — совпадает с тем, что отображает WbCardOrdersChart, чтобы фильтр nmId и chart смотрели на одно окно"
  - "Фильтр nmId на сервере (eager wbCardOrdersDaily.findMany + JS hasStock/hasSales) — ~6000 rows max для ~100 продуктов × 2 nmId × 28 дней дешевле lazy через server action"
  - "ordersCharts? как часть ProductGroup (опциональное поле) — Wrapper не нужно изменять, поле проходит через groups prop"
  - "Без sticky для expand-panel в v1 — chart-content уезжает при горизонтальном скролле; sticky внутри <td colSpan> сложен, отдельный quick task если будут жалобы"
metrics:
  start_time: "2026-05-18T11:10:00Z"
  end_time: "2026-05-18T11:22:00Z"
  duration: "~12min"
  completed: "2026-05-18"
  files_changed: 2
  files_created: 0
  commits: 2
  tasks: "3/3 (Task 3 = validation only — passthrough работает естественно)"
---

# Quick 260518-fg5: /prices/wb expandable row с графиками заказов per-nmId

## One-liner

Клик по Сводка cell в /prices/wb раскрывает горизонтальную панель с графиками `WbCardOrdersChart` для каждой связанной с товаром nmId (фильтр: stock>0 OR sales>0 за 28д). Переиспользует существующий компонент из /cards/wb без дублирования.

## What got built

### 1. Серверная загрузка orders history (page.tsx)

- Добавлен `prisma.wbCardOrdersDaily.findMany` для окна [today-28, today-1] MSK по всем visible nmId (после фильтра `cardsInStockOnly`)
- Группировка raw rows by nmId через `Map<number, RawOrderRow[]>`
- В цикле формирования `groups[].push` для каждого Product собирается `ordersCharts: Array<{nmId, timeSeries}>` — массив отфильтрованных nmId с готовым 28-точечным `DayPoint[]` через `fillTimeSeries`
- Фильтр nmId: `hasStock = card.stockQty > 0` OR `hasSales = rawRows.some(r => r.qty > 0)` — иначе nmId исключается из карты графиков

### 2. UI — expand state + chevron + panel (PriceCalculatorTable.tsx)

- `ProductGroup` тип расширен полем `ordersCharts?: Array<{nmId, timeSeries}>` + импорты `WbCardOrdersChart`, `DayPoint`, `ChevronUp`
- `useState<Set<string>>` для `expandedProductIds` + `toggleProductExpand(productId)` (можно одновременно раскрыть несколько товаров)
- Сводка `<td>`:
  - `onClick`: stopPropagation + toggle если `ordersCharts.length > 0`
  - Условные классы: `cursor-pointer hover:bg-muted/40` (если expandable) vs `cursor-default`, + `bg-muted/30` когда раскрыт
  - Chevron-индикатор в правом верхнем углу через `absolute top-0 right-0` (только если expandable)
- Структура `tbody`: каждая product-группа теперь возвращает `<React.Fragment>{rowTrs}{expandedTr}</React.Fragment>` — `rowTrs` — это существующий flatMap по cards/priceRows (без изменений в стилях/onRowClick — клик по ценовой строке по-прежнему открывает модалку); `expandedTr` — новый `<tr><td colSpan>...</td></tr>` рендерится только если productId ∈ expandedProductIds и `charts.length > 0`
- Панель: `flex flex-row flex-wrap gap-3 justify-start items-start p-3` — графики выровнены по левому краю, переносятся при нехватке ширины
- `colSpan = 4 + visibleScrollCount` (4 sticky колонки + status + 25 расчётных, учитывая скрытые через «Вид»)

### 3. Wrapper — passthrough validation (без изменений)

- `PriceCalculatorTableWrapper.tsx` не тронут: `ProductGroup` импортируется как тип и автоматически получает `ordersCharts?`. Поле проходит через prop `groups` без отдельного пропа
- Build пройдён без ошибок (15.8 kB на /prices/wb — minimal growth, recharts уже в shared bundle из /cards/wb)

## Files Modified

- `app/(dashboard)/prices/wb/page.tsx` — +62 строки (orders findMany + per-product ordersCharts loop)
- `components/prices/PriceCalculatorTable.tsx` — +90 строк / −6 строк (тип ProductGroup, state, click handler, chevron, expanded tr, Fragment wrapper)

## Files Created

None — переиспользован `WbCardOrdersChart` из `components/cards/`.

## Commits

| # | Hash | Description |
|---|------|-------------|
| 1 | `76a88ef` | feat(quick-260518-fg5): load WbCardOrdersDaily per-nmId for /prices/wb expand panel |
| 2 | `281fe73` | feat(quick-260518-fg5): expandable Сводка cell с графиками заказов per-nmId в /prices/wb |

Task 3 без коммита — Wrapper не требовал изменений (passthrough работает естественно через расширение типа `ProductGroup`).

## Smoke results

| Check | Status |
|-------|--------|
| `npx tsc --noEmit` | 0 errors |
| `npm run test -- tests/wb-orders-chart-fill.test.ts tests/pricing-math.test.ts --run` | 31/31 passed |
| `npm run build` | success, /prices/wb 15.8 kB (+0.X kB vs до) |

## Deploy

Никаких миграций БД, новых endpoints или server actions. Просто:

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
```

## UAT Checklist (после deploy)

1. [ ] Открыть https://zoiten.pro/prices/wb → таблица отображается как раньше
2. [ ] Клик по Сводка cell товара с допустимыми nmId → раскрывается панель снизу с графиками
3. [ ] Графики в горизонтальный ряд, выровнены по левому краю (`justify-start`); каждый — `WbCardOrdersChart` с bars (заказы) + line (цена) + avg30d / avg7d / Цена сейчас
4. [ ] Второй клик по Сводка → панель закрывается; chevron меняется ChevronUp ↔ ChevronDown
5. [ ] Можно одновременно раскрыть несколько товаров (`Set<string>`)
6. [ ] Клик по ценовой строке (Текущая / Регулярная / Расчётная) → открывается модалка `PricingCalculatorDialog` как раньше (раскрытие НЕ срабатывает на ценовых строках)
7. [ ] Сводка товара БЕЗ карточек с остатком и без заказов за 28 дней → курсор остаётся `cursor-default`, никакого chevron, клик ничего не делает
8. [ ] /cards/wb работает без regression (тот же `WbCardOrdersChart`)

## Edge Cases (verified by design)

- Товар с 1 nmId, у которого stock=0 и sales=0 → Сводка не кликабельна, panel не раскрывается (фильтр на сервере)
- Товар с 3 nmId, у одной stock=0 + 0 sales, у двух stock>0 → раскрывается panel с 2 графиками (не 3)
- Скрытые колонки через «Вид» → `colSpan = 4 + visibleScrollCount` корректно учитывает текущие visible columns
- Тёмная тема → графики dark-aware через CSS vars `--chart-1`, `--chart-2`
- При горизонтальном scroll вправо chart-content уезжает (sticky не реализован в v1, см. decision)

## Self-Check: PASSED

- [x] Files exist: `app/(dashboard)/prices/wb/page.tsx`, `components/prices/PriceCalculatorTable.tsx`
- [x] Commits in git log: `76a88ef`, `281fe73`
- [x] No new components created (reused `WbCardOrdersChart`)
- [x] No new endpoints / server actions / DB migrations
- [x] tsc --noEmit: 0 errors
- [x] tests/wb-orders-chart-fill + tests/pricing-math: 31/31 passed
- [x] npm run build: success
