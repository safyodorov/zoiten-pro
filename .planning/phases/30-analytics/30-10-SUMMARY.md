# Phase 30 — Plan 10 Summary (Wave 2: сложные вкладки)

**Status:** ✅ executed (tsc чист; `next build` зелёный).

## Файлы / экспорт (импортирует контейнер 30-11)
- `components/analytics/tabs/CardStatsTab.tsx` → `CardStatsTab({ skus: SkuPayload[] })`.
- `components/analytics/tabs/QueryStatsTab.tsx` → `QueryStatsTab({ skus: SkuPayload[] })`.

## Решения
- **CardStatsTab (ANL-09):** столбец средних в фикс. порядке (показы, CTR, клик→корзина, клик→заказ, заказы, сумма); панель метрик (URL `metrics=`, БЕЗ позиций); «одна метрика = один график» recharts LineChart per SKU (funnelDays/priceDays), ось X = даты, Tooltip. Sticky — сплошной bg-background.
- **QueryStatsTab (ANL-10):** тепловая карта запрос×день на CSS-таблице (БЕЗ новой либы). Цвет = глубина organic (hsl 130→0); organic===null → прочерк (не входит в среднюю). Бейдж avgPosition слева. 5 запросов видно + `max-h + overflow-y-auto`.
- Новых npm-пакетов нет.
