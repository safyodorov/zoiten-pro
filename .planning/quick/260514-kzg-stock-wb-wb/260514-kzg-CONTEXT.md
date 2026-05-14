---
name: 260514-kzg-CONTEXT
description: Locked decisions for /stock/wb size visibility — show all WB techSizes + highlight out-of-stock red
gathered: 2026-05-14
status: Ready for planning
---

# Quick Task 260514-kzg: /stock/wb — показать все размеры WB + подсветить выпавшие красным — Context

**Gathered:** 2026-05-14
**Status:** Ready for planning (locked decisions через AskUserQuestion)

<domain>
## Task Boundary

В /stock/wb (вкладка «WB склады») при включённом toggle «По размерам» (Phase 16 STOCK-36) показывать **все размеры** из карточки WB — даже если по ним нет остатков и заказов. Размеры с нулевыми остатками подсвечивать красным.

Сейчас бэкенд (lib/stock-wb-data.ts → WbStockSizeRow) собирает size-level данные только по тем размерам, по которым есть stock-rows или order-rows в БД. Размеры без движения тихо отбрасываются. Это маскирует «выпавшие» размеры — продавец их не видит.

Применяется ТОЛЬКО в режиме «По размерам». Default режим (агрегат по карточке) не меняется.
</domain>

<decisions>
## Implementation Decisions (locked)

### Источник полного списка размеров (Claude's discretion)
**WbCard.techSizes** (String[]) — single source of truth для этой задачи.
- Заполняется в `lib/wb-api.ts:parseCard` из `card.sizes[].techSize` (Phase 17).
- Уже фильтрован от `"0"` для one-size товаров (см. CLAUDE.md «Phase 17»).
- Не используем ProductSize таблицу пока — она про ручное управление размерами Product (одежда с `Brand.direction.hasSizes=true`), но не все товары /stock/wb имеют linked Product → WbCard.techSizes покрывает 100% случаев без conditional fallback'а.
- При будущей миграции на ProductSize/Barcode↔ProductSize связь — рефактор отдельно.

### Что считать «выпавшим» размером
**Остаток (агрегированный stockQty по всем складам) = 0 или null** → красный.
- Простой критерий: пользователь видит «нет товара на складах» как red flag.
- Заказов в день (avgSalesSpeed7d) НЕ учитываем — даже если по размеру нет продаж, физическое отсутствие на складе — это уже сигнал к закупке.

### Сортировка размеров
**Как в WB** — по порядку элементов `WbCard.techSizes` (массив).
- WB возвращает разумный порядок (для одежды: S/M/L/XL, для обуви: 38/40/42 и т.п.).
- Никаких alphanumeric helper'ов не добавляем — экономим код, доверяем WB.
- Если WB вернул bad order — это редкий edge case, можно зафиксить в `parseCard` или с opt-in sort'ом отдельной задачей.

### Visual подсветка
**`text-red-600 dark:text-red-500`** на цифрах в строке выпавшего размера.
- Применяется к: stockQty (О), avgSalesSpeed7d (З), turnoverDays (Об), deficit (Д) — все 4 ячейки по каждому кластеру/складу.
- НЕ применяется к label размера и НЕ красим row background — subtle подсветка достаточна.
- Существующие условные цвета для Deficit (red при дефиците, yellow при предупреждении, green при норме) — **сохраняются**. Для выпавшего размера все цифры всё равно красные → конфликт с deficit-coloring разрешается приоритетом «выпавший → текст всегда красный».

</decisions>

<specifics>
## Specific Ideas / Constraints

**Где менять данные** (`lib/stock-wb-data.ts`):
- Функция собирает `WbStockSizeRow[]` для каждой `ProductWbGroup.nmId`. Сейчас она LEFT JOIN'ит stocks/orders на size, но если для tech_size нет ни одной row — он не попадает в результат.
- Нужно: после сбора всех известных sizes из stocks/orders, добавить недостающие из `WbCard.techSizes` с пустыми (null или 0) метриками.

**Где менять UI** (`components/stock/StockWbTable.tsx`):
- В per-size rows (когда `showSizes === true`) — детектить `isFallenOut = (row.stockQty ?? 0) === 0`.
- Применять `text-red-600` к 4 числовым ячейкам на каждом кластере + sticky cols `Иваново`, `Всего на WB`, `Товар в пути`, `Итого WB`.
- НЕ через StockCell/IntCell/DeficitCell без рефактора — pass `isFallenOut` как prop, internal cn-логика делает override.

**Critical decision (carry forward):**
- WbCard `id` ↔ `Product.id` — связь не строгая (через nmId → MarketplaceArticle.article). При сборе techSizes идти от `WbCard` через nmId, не через Product. Это упростит query.

**Тестирование:**
- Unit-тестов под stock-wb-data сейчас нет — не добавлять (avoid premature test infra).
- tsc + manual UAT после deploy — достаточно.

</specifics>

<canonical_refs>
## Canonical References

- **CLAUDE.md «Phase 17»** — WbCard.techSizes String[], парсинг в `lib/wb-api.ts:parseCard`
- **CLAUDE.md «Phase 16»** — toggle «По размерам» (STOCK-36), `User.stockWbShowSizes` boolean
- **`lib/stock-wb-data.ts`** — WbStockSizeRow type, сбор size-level data (текущая логика отсева)
- **`components/stock/StockWbTable.tsx`** — рендеринг per-size rows под `showSizes && groups[i].sizes`
- **`prisma/schema.prisma`** — WbCard model (`techSizes String[]`)

</canonical_refs>
