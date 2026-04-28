# Phase 16: Размерная разбивка остатков WB + фикс sync bug — Context

**Gathered:** 2026-04-22
**Status:** Ready for planning
**Source:** User decisions (inline conversation, not /gsd:discuss-phase)

<domain>
## Phase Boundary

Расширение функциональности `/stock/wb`, добавляющее **размерную разбивку**
остатков WB и одновременно устраняющее обнаруженный баг расхождения данных
между WB API и БД.

**В scope:**
1. Расследование и фикс root-cause расхождения сумм по WB API vs `WbCardWarehouseStock`
   (пример: nmId 859398279 «Брюки» — Котовск API ~70 шт, БД 8 шт; total stockQty
   412 vs sum-per-warehouse ~210).
2. Schema: расширить `WbCardWarehouseStock` с `techSize` (и опционально barcode).
3. Sync (lib/wb-api.ts + scripts/wb-sync-stocks.js + app/api/wb-sync/route.ts) —
   писать per-size rows; чистый clean-replace; без accumulation.
4. Data helper `lib/stock-wb-data.ts` — добавить sizeBreakdown в WbStockRow / ClusterAggregate.
5. UI `components/stock/StockWbTable.tsx`:
   - Кнопка «По размерам» в верхней панели (toggle)
   - Под каждой nmId-строкой раскрываются строки per techSize
   - Каждая размерная строка имеет ту же структуру колонок (О/З/Об/Д per cluster
     + per-warehouse при expanded)
6. Re-sync на VPS + UAT.

**Out of scope (defer to future):**
- Per-size агрегация для Ozon (нет данных в текущей БД)
- Размерная разбивка в `/stock` (Product-level)
- Размерная разбивка in-way (`inWayToClient`/`inWayFromClient` остаются на nmId-уровне)
</domain>

<decisions>
## Implementation Decisions

### UI: форма размерной разбивки (B4 — full breakdown)
**Locked:** B4 — под каждым nmId раскрываются строки per размер с **полной**
структурой колонок (О/З/Об/Д per cluster + per-warehouse при expanded кластере).
НЕ tooltip (B1), НЕ модалка (B2), НЕ короткая колонка inline (B3).

**Обоснование (от пользователя):** «хочется чтобы под каждым артикулом, где есть
размеры была разбивка этой же всей информации по размерам».

### UI: toggle кнопка «По размерам»
- Кнопка в верхней панели `/stock/wb` (рядом с «Развернуть все», «Без СЦ», «Склады»)
- При нажатии — все размерные строки раскрываются глобально (по всем nmId)
- При повторном клике — сворачиваются
- Когда у nmId один размер — размерная строка может скрываться (TBD: либо всегда
  показывать для единообразия, либо скрывать чтобы не дублировать)
- Persist состояния: **per-user в БД** (по аналогии с `User.stockWbHiddenWarehouses`,
  quick 260422-oy5). Поле `User.stockWbShowSizes Boolean @default(false)` (или Int?
  для tri-state, но v1 — Bool).

### Schema: techSize в WbCardWarehouseStock
**Locked:** добавить `techSize String` (не nullable; для товаров без размеров
ставить пустую строку `""` или маркер `"-"`). Сменить unique на
`(wbCardId, warehouseId, techSize)`.

**Опционально:** добавить `barcode String?` для будущих join'ов с
`MarketplaceArticle.barcodes` (но v1 — лучше без, чтобы не плодить поля до
востребованности).

### Sync: правильный upsert per-size
**Locked:** заменить текущий `existing.quantity + qty` (накопление) на upsert с
**replace**: `quantity: qty` (строго равно входящему). Clean-replace per
`wbCardId` теперь должен учитывать (wbCardId, warehouseId, techSize) — удалять
строки которых нет в incoming snapshot.

### Sync: расследование корневой причины
**Locked:** в плане 16-01 (или research-фаза) — диагностический скрипт сравнения
WB API snapshot ↔ БД для конкретных nmId, лог детализации. Возможные причины:
1. `existing.quantity + qty` суммирует размеры в один агрегат при первом sync,
   но при последующих sync `existing` уже содержит сумму — `+ qty` от первого
   размера → накапливается некорректно.
2. clean-replace удаляет «свежие» записи если порядок обработки складов меняется.
3. Race condition между скриптом `wb-sync-stocks.js` и API route `/api/wb-sync`.

Гипотеза: после фикса (replace вместо accumulation) расхождение должно исчезнуть
автоматически. Плюс верификация суммой sum(quantity per techSize per warehouse)
== stockQty для контрольных nmId.

### Per-size З (заказы/день)
**TBD на этапе исследования:** Orders API возвращает `techSize` или `barcode`?
- Если **да** — Z per размер показываем как обычно (число + per-cluster агрегат).
- Если **нет** — два варианта:
  - Показывать `—` в Z колонке размерной строки (честно: данных нет)
  - Распределять общий nmId-овый Z пропорционально остатку размера
    (приближение)

**Default (если не подтвердится `techSize`):** показывать `—` (честнее).
**Решение принимается в research или Plan 16-04.**

### Фильтры совместимы с размерными строками
**Locked:** «Без СЦ» + per-user скрытие складов (quick 260422-oy5) применяются
**к колонкам кластеров/складов**, а не к nmId/размерным строкам. То есть когда
пользователь скрывает СЦ — это убирает столбцы СЦ-складов из expanded view, а
размерные строки продолжают существовать; их per-cluster агрегат будет считаться
по тем же видимым складам (или по всем — TBD).

**Гипотеза-default:** агрегаты per-cluster ВСЕГДА считаются по всем складам
(включая скрытые). Скрытие/показ — чисто визуальный.

### Сортировка размеров
**Locked:** числовая по возрастанию (46 → 48 → 50 → … → 60). Если techSize не
число (S/M/L/XL/2XL) — алфавитная с известным маппингом
(`XS<S<M<L<XL<2XL<3XL<4XL`). Если ни число, ни известный размер — алфавитная как
fallback. Хелпер `sortSizes(sizes: string[])` в `lib/wb-clusters.ts` или
`lib/stock-math.ts`.

### Миграция и backfill
**Locked:** новая миграция Prisma (manual SQL, как в Phase 14/15) добавляет
`techSize` в `WbCardWarehouseStock` с default `""`, меняет unique. После применения
**обязательный re-sync** на VPS — старые записи затрутся снапшотом WB API. Дата
re-sync фиксируется в SUMMARY/UAT.

### Claude's Discretion
- Имя поля: `techSize` или `size` — `techSize` (соответствует API WB).
- Sort order для размеров одного nmId в UI — числовой/символьный (см. выше).
- Persist кнопки «По размерам» — БД (per-user) предпочтительнее URL.
- Когда у nmId 1 размер — показывать ли отдельную размерную строку: **скрывать**
  (избегаем дублирования). Если только 1 размер — кнопка/маркер не активирует
  размерную строку для этого товара.
- Цвет/стиль размерной строки — приглушённый фон (`bg-muted/30`?), отступ слева
  для иерархии, либо мелкий префикс `↳ Размер 50` в первой колонке. Решит UI-spec
  или planner.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema & Sync
- `prisma/schema.prisma` — текущая схема `WbCardWarehouseStock`, `WbCard`, `WbCardWarehouseOrders`
- `lib/wb-api.ts` — `fetchStocksPerWarehouse`, `fetchOrdersPerWarehouse`, обработка ответа Statistics API
- `scripts/wb-sync-stocks.js` — one-shot скрипт sync (используется регулярно,
  не путать с `/api/wb-sync` route)
- `app/api/wb-sync/route.ts` — HTTP route sync (вызывается из UI кнопкой)
- `prisma/migrations/` — паттерн manual SQL миграций для VPS (см. 20260417_phase9_returns,
  20260422_add_user_stock_wb_hidden_warehouses)

### Data helper и UI
- `lib/stock-wb-data.ts` — `getStockWbData()`, типы `WbStockRow`, `ClusterAggregate`,
  `WarehouseSlot`, агрегация per-cluster и per-warehouse
- `lib/wb-clusters.ts` — `CLUSTER_ORDER`, `ClusterShortName`, маппинг
- `lib/stock-math.ts` — `calculateStockMetrics`, `deficitThreshold`, formatters
- `components/stock/StockWbTable.tsx` — главная таблица /stock/wb
- `app/(dashboard)/stock/wb/page.tsx` — RSC page, читает session, передаёт props в Table

### Patterns
- `CLAUDE.md` секция «Sticky data-таблицы (pattern)» — правила для table layout
- `CLAUDE.md` секция «Per-user UI настройки» — паттерн для toggle кнопки
- `~/.claude/projects/C--Claude/memory/project_zoiten_table_pattern.md` — детально
  про границы (inter/intra group), Product-level cells, форматирование
- `~/.claude/projects/C--Claude/memory/project_zoiten_per_user_prefs.md` — паттерн
  per-user preferences (точно какой нужен для кнопки «По размерам»)

### Quick task reference (analogous feature)
- `.planning/quick/260422-oy5-per-user-stock-wb/` — реализация per-user скрытия
  складов: schema (Int[] @default([])), server action, RSC → client, optimistic +
  revalidatePath. Тот же паттерн для `stockWbShowSizes`.

### Существующие фазы
- `.planning/phases/14-stock/` — Phase 14 (управление остатками)
- `.planning/phases/15-per-cluster-orders/` — Phase 15 (per-cluster З/Об/Д)
</canonical_refs>

<specifics>
## Specific Ideas

### Контрольная пара для UAT
- **nmId 859398279** «Брюки классические мужские прямые», УКТ-000029 — 8 размеров (46/48/50/52/54/56/58/60)
- **nmId 901585883** «Костюм классический двойка», УКТ-000030 — 8 размеров

После re-sync проверить:
- В UI Сводная nmId сумма по размерам = stockQty карточки
- При раскрытии «По размерам» видны 8 строк с разными остатками
- На развёрнутом кластере (например ЦФО) per-warehouse колонки показывают
  ровно те числа что в WB API на момент sync

### Известные данные API для проверки
По состоянию на 2026-04-22, WB Statistics API для nmId 859398279 показывал
для Котовск:
- techSize 46: 11 шт
- techSize 48: 10 шт
- techSize 50: 10 шт
- techSize 54: 10 шт
- techSize 58: 10 шт
- techSize 60: 10 шт
- → итого 61 шт

В БД на тот момент: Котовск qty=8. Расхождение −53 шт.

После фикса в новой схеме: должно быть 6 строк с qty {11,10,10,10,10,10} и в
агрегате Котовск-кластер ЦФО — 61 шт.

</specifics>

<deferred>
## Deferred Ideas

- **Per-size З с пропорциональным распределением** (если Orders API не даёт
  techSize) — отложено до v2 если research подтвердит отсутствие данных. v1 = `—`.
- **Размерная разбивка для in-way** — текущая схема WbCard.inWayToClient/From
  агрегатная per nmId. Расширение до per-size требует изменения sync для inWay
  массива, отложено.
- **Размерная разбивка в /stock (Product-level)** — этот раздел сводит несколько
  nmId в один Product, размерная разбивка станет ещё сложнее. Отложено.
- **Сохранение фильтра «По размерам» в URL дополнительно к БД** — для shareable
  ссылок. Не делаем v1 (БД-persist достаточно).
- **Цветовая шкала для размеров с критическим остатком** — отложено в UI-полировку.
</deferred>

---

*Phase: 16-wb-stock-sizes*
*Context gathered: 2026-04-22 inline (no /gsd:discuss-phase needed — locked decisions came from inline conversation)*
