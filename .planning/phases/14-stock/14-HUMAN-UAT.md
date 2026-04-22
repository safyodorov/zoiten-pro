---
status: partial
phase: 14-stock
source: [14-VERIFICATION.md]
started: 2026-04-22T07:27:42Z
updated: 2026-04-22T07:27:42Z
---

## Current Test

[awaiting human testing on https://zoiten.pro]

## Tests

### 1. Sticky колонки на `/stock` при горизонтальном скролле
expected: Первые 4 колонки (Фото, Сводка, Ярлык, Артикул) остаются зафиксированными слева при горизонтальном скролле таблицы. Фоновый цвет `bg-background`, z-index обеспечивает перекрытие прокручиваемых колонок.
result: [pending]

### 2. Excel Иваново upload → preview → apply (E2E flow)
expected: Кнопка «Загрузить Excel Иваново» → file picker → после выбора открывается диалог с 4 секциями (Изменения old→new, Не найдено, Дубликаты, Невалидные). Кнопка «Применить (N строк)» disabled если N=0. После нажатия: toast.success + обновление таблицы + `Product.ivanovoStockUpdatedAt` проставлен в БД.
result: [pending]

### 3. Production inline input — debounce 500ms
expected: Ввод числа в поле Производство у любой строки Сводная → через 500ms toast.success «Производство обновлено». После F5 значение сохранилось. Пересчёт О/З/Об/Д в таблице происходит мгновенно.
result: [pending]

### 4. TurnoverNormInput в шапке — debounce + визуальный пересчёт
expected: Изменить значение нормы оборачиваемости (1..100, default 37) → через 500ms toast.success «Норма сохранена». Цветовая кодировка Д (зелёный/жёлтый/красный) пересчитывается во ВСЕЙ таблице глобально.
result: [pending]

### 5. Кнопка «Обновить из WB» → real Statistics API call (~1-2 мин)
expected: Нажать «Обновить из WB» → кнопка disabled + spinner + toast.loading «Обновление…». Через ~1-2 мин: toast.success «WB остатки обновлены». Колонки МП/WB в таблице показывают реальные данные из Statistics API. WbCardWarehouseStock заполнена per-warehouse.
result: [pending]

### 6. `/stock/wb` — 7 кластерных колонок populated
expected: После выполнения п.5, перейти на вкладку «WB склады». Видно 7 кластерных колонок (ЦФО/ЮГ/Урал/ПФО/СЗО/СФО/Прочие), каждая с 4 sub-cells (О/З/Об/Д). rowSpan Product объединяет Фото/Сводка. Значения соответствуют суммам per-warehouse из БД.
result: [pending]

### 7. Expand кластера → URL state → shareable link
expected: Нажать chevron `>` у кластера (например ЦФО) → раскрываются per-warehouse колонки (Коледино, Электросталь, Белая дача, и т.д.). URL меняется на `?expandedClusters=ЦФО`. Скопировать URL, открыть в новой вкладке → ЦФО раскрыт по дефолту. «Развернуть все» → все 7 раскрыты. «Свернуть все» → URL очищен.
result: [pending]

### 8. ClusterTooltip при hover на короткое название кластера
expected: Навести на «ЦФО» в шапке колонки → tooltip «Центральный федеральный округ» + «Складов: N». Проверить для 2-3 других кластеров (ЮГ→Южный, СЗО→Северо-Западный, и т.д.).
result: [pending]

### 9. /inventory redirect chain в браузере
expected: Открыть https://zoiten.pro/inventory → в адресной строке конечный URL /stock (308 Permanent Redirect от Next.js next.config.ts через rewrite). `curl -I https://zoiten.pro/inventory` показывает `location: /stock`.
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps
