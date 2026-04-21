# Архитектура Phase 14 — Управление остатками

**Milestone:** v1.2 Управление остатками (subsequent milestone)
**Исследовано:** 2026-04-21
**Overall confidence:** HIGH (стек существует, все вопросы касаются интеграции в known codebase)

## Краткое резюме

Phase 14 — первый milestone, который **вводит полноценную новую секцию** поверх зрелого стека Next.js 15 + Prisma 6 + PostgreSQL, с уже работающей WB-синхронизацией (wb-sync), AppSetting KV, паттерном sticky-таблиц и готовыми `Product.sku`/`WbCard` данными. Фаза опирается на четыре существующие системы (wb-sync route, AppSetting KV из Phase 7, sticky-таблица из Phase 7, Excel-loader из Phase 7 auto-акций) и добавляет один действительно новый слой — **per-warehouse остатки** с собственным справочником складов и кластеров.

**Ключевой вывод по breaking changes:** `WbCard.stockQty` используется в четырёх местах (wb-sync writer, `/prices/wb` page filter + aggregation, WbCardsTable read) — **оставляем как denormalized sum** по `WbCardWarehouseStock.quantity` в рамках той же транзакции синхронизации. Это нулевая миграция Phase 7 + обратно-совместимый write в новую таблицу.

**Ключевой вывод по маршруту:** routing и sections.ts сейчас используют **`/inventory`**, не `/stock`. PROJECT.md говорит `/stock`. Это расхождение — первый риск. Рекомендация: **переименовать `/inventory` → `/stock`** в Plan 14-01 (schema + routes + nav-items + section-titles + sections.ts), одновременно со stubs.

**Ключевой вывод по ordering:** 7 планов в строгой последовательности. Schema → WbWarehouse seed → wb-sync расширение → Excel import Иваново → Production manual input → UI table (flat, без кластеров) → Cluster expand + turnover norm. UI (последние два шага) можно параллелить после того, как данные пишутся в БД.

## Рекомендованная архитектура

### Data flow (end-to-end для одной карточки)

```
WB Statistics API /api/v1/supplier/stocks
  → fetchStocksPerWarehouse()  [новая функция lib/wb-api.ts]
  → Map<nmId, WarehouseBreakdown[]>

/api/wb-sync route (расширение)
  ├─→ prisma.wbCardWarehouseStock.deleteMany({wbCardId, warehouseId notIn})
  ├─→ prisma.wbCardWarehouseStock.upsert per (wbCardId, warehouseId)
  └─→ prisma.wbCard.update({stockQty: sum(breakdown.quantity)})  ← backward-compat

/stock RSC page
  ├─→ prisma.product.findMany({include: articles(wb), cost, category, subcategory})
  ├─→ prisma.wbCard.findMany({where: nmId in linkedNmIds, include: warehouseStocks→warehouse})
  ├─→ prisma.wbWarehouse.findMany() — справочник + агрегация по cluster
  └─→ Server-side assembly: Product → WbCard[] → WbCardWarehouseStock[] grouped by WbWarehouse.cluster
      → StockTable (client) с cluster expand state в searchParams

Excel upload /api/stock-ivanovo-upload   [новый route, паттерн wb-promotions-upload-excel]
  → parseIvanovoStockExcel(buffer)  [новый lib/parse-ivanovo-stock-excel.ts]
  → validate sku format (УКТ-XXXXXX)
  → prisma.product.updateMany({sku in sheet}, {ivanovoStock})

Production manual input     [server action, без route]
  → updateProductionStock(productId, quantity)
  → prisma.product.update({productionStock})
```

### Component boundaries

| Component | Type | Responsibility | Communicates With |
|-----------|------|---------------|-------------------|
| `app/(dashboard)/stock/page.tsx` | RSC | Data assembly + initial render | Prisma + StockTable |
| `app/(dashboard)/stock/wb/page.tsx` | RSC | Подраздел per-warehouse detail (если понадобится отдельно — см. Q3 ниже) | Prisma + StockWbTable |
| `components/stock/StockTable.tsx` | Client | Sticky columns + cluster expand + row numbers (rowSpan Product→WbCard) | Server actions + searchParams |
| `components/stock/StockTurnoverNormInput.tsx` | Client | Input for `stock.turnoverNormDays` | updateStockSettings server action |
| `components/stock/IvanovoStockUploadButton.tsx` | Client | Excel upload | /api/stock-ivanovo-upload POST |
| `components/stock/ProductionStockInput.tsx` | Client | Ручной ввод по строке Product | updateProductionStock server action |
| `app/actions/stock.ts` | Server actions | updateProductionStock / updateStockTurnoverNormDays | Prisma + revalidatePath |
| `app/api/stock-ivanovo-upload/route.ts` | API | POST multipart + parse XLSX | Prisma (updateMany) |
| `lib/parse-ivanovo-stock-excel.ts` | Pure TS | XLSX parser (тестируется vitest) | xlsx lib |
| `lib/wb-api.ts` (extend) | Pure TS | `fetchStocksPerWarehouse()` + reuse `fetchStocks()` | WB Statistics API |
| `app/api/wb-sync/route.ts` (extend) | API | Запись per-warehouse + denormalized sum | Prisma transaction |

## Модели данных — новые сущности

### 1. `WbWarehouse` (справочник складов WB → кластеры)

```prisma
model WbWarehouse {
  id             Int      @id                     // Warehouse ID из WB (официальный)
  name           String                            // «Коледино», «Электросталь»...
  cluster        String                            // «Центральный», «Юг»...
  shortCluster   String                            // «ЦФО», «ЮГ», «Урал»... — для заголовков
  isActive       Boolean  @default(true)          // deactivate вместо delete
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  warehouseStocks WbCardWarehouseStock[]

  @@index([cluster])
  @@index([shortCluster])
}
```

**Обоснование:**
- `id: Int` без `@default` — seed даёт официальные WB warehouse IDs, которые stable между synchronisations (подтверждено в Statistics API).
- `cluster`/`shortCluster` хранятся денормализованно (не отдельной таблицей Cluster). Кластеров 7, они не управляются пользователем, и изменения крайне редки — нормализация даёт негативный ROI в этом контексте. **Если в v1.3 понадобится UI редактирования кластеров** — делаем отдельный `WbWarehouseCluster` с FK; сейчас — избыточно.
- `isActive` вместо physical delete — WB может переименовать/закрыть склад; историю `WbCardWarehouseStock` сохраняем.

### 2. `WbCardWarehouseStock` (per-warehouse остатки)

```prisma
model WbCardWarehouseStock {
  id          String      @id @default(cuid())
  wbCardId    String
  wbCard      WbCard      @relation(fields: [wbCardId], references: [id], onDelete: Cascade)
  warehouseId Int
  warehouse   WbWarehouse @relation(fields: [warehouseId], references: [id], onDelete: Restrict)
  quantity    Int         @default(0)
  updatedAt   DateTime    @updatedAt

  @@unique([wbCardId, warehouseId])
  @@index([warehouseId])         // для per-warehouse агрегаций
  @@index([wbCardId])             // быстрый join из WbCard side
}
```

И back-relation в существующий `WbCard`:

```prisma
model WbCard {
  // ... existing fields ...
  warehouseStocks WbCardWarehouseStock[]
}
```

**Обоснование:**
- `@@unique([wbCardId, warehouseId])` — ключевой invariant. Даёт `upsert` вместо `deleteMany+createMany`.
- `onDelete: Cascade` на WbCard — корректно, per-warehouse записи не имеют смысла без карточки.
- `onDelete: Restrict` на WbWarehouse — защита: нельзя удалить склад с активными остатками. WB API не даст такого ивента, но защищаемся от ручных багов seed-скрипта.

### 3. Расширения `Product`

```prisma
model Product {
  // ... existing fields ...
  ivanovoStock    Int?      // Остаток на складе Иваново (Excel upload)
  productionStock Int?      // Остаток на производстве (manual input)
}
```

**Trade-off: Поля Product.ivanovoStock + Product.productionStock vs отдельные таблицы IvanovoStock/ProductionStock**

| Критерий | Denormalized поля (РЕКОМЕНДУЕТСЯ) | Отдельные таблицы |
|----------|-----------------------------------|-------------------|
| Бизнес-гранулярность | **Один глобальный остаток per Product** (из PROJECT.md «ручной глобальный ввод») | Избыточно — нет второго измерения |
| Чтение в RSC | Поле уже в `Product` — zero joins | Дополнительный `include` + `.quantity ?? 0` |
| История изменений | Нет (но требования не просят) | Можно логировать через `updatedAt` |
| Миграция | 2 `ALTER TABLE ADD COLUMN` | 2 `CREATE TABLE` + FK |
| Будущий multi-warehouse для Иваново | Потребует миграцию → отдельная таблица | Готово |

**Решение:** два поля в `Product`. PROJECT.md явно пишет «ручной глобальный ввод остатков Производства (0-N per Product)». Склад Иваново тоже **один** (собственный warehouse компании, не маркетплейс). Если через год появится второй собственный склад — делаем миграцию на тот момент, когда появится реальное бизнес-требование (YAGNI).

**Confidence:** HIGH — однозначное бизнес-требование, паттерн совпадает с уже существующими денормализациями в проекте (`WbCard.stockQty`, `Category.defaultDefectRatePct`).

### 4. `AppSetting['stock.turnoverNormDays']` — re-use Phase 7 KV

```typescript
// Lazy init в action или в RSC:
const raw = await prisma.appSetting.findUnique({ where: { key: "stock.turnoverNormDays" } })
const turnoverNormDays = raw ? parseInt(raw.value, 10) : 37  // fallback default
```

**Никаких новых таблиц.** Паттерн 1:1 с `wbWalletPct`/`wbDefectRatePct` из Phase 7. RSC читает в `Promise.all`, редактирование через `updateStockSettings` server action с Zod-валидацией (1-100).

## Интеграционные точки с существующим кодом

Абсолютная путь / файл | Что меняется | Риск | Mitigation
----------------------|--------------|------|-----------
`prisma/schema.prisma` | +3 модели (WbWarehouse, WbCardWarehouseStock), +2 поля Product, +1 back-relation WbCard | LOW | Migrations аддитивные, нет ALTER NULLABLE → NOT NULL |
`lib/wb-api.ts` | +`fetchStocksPerWarehouse()` (новая), keep `fetchStocks()` intact | LOW | Старая функция остаётся на случай fallback; новая возвращает Map<nmId, WarehouseBreakdown[]> |
`app/api/wb-sync/route.ts` | Замена шага 5: вместо `fetchStocks()` → `fetchStocksPerWarehouse()`, плюс write в 2 таблицы в транзакции | **MEDIUM** | См. раздел «Breaking changes» ниже — нужна транзакция + расчёт stockQty = sum |
`lib/sections.ts` | `/inventory` → `/stock` | **MEDIUM** | Меняется URL — middleware RBAC check переключается, сохранённые закладки пользователей ломаются. Mitigation: nginx rewrite `/inventory` → `/stock` на 1 релиз + release note |
`components/layout/nav-items.ts` | `href: "/inventory"` → `href: "/stock"` | LOW | Sidebar link меняется |
`components/layout/section-titles.ts` | regex `/^\/inventory/` → `/^\/stock/` | LOW | Header title соответствует новому URL |
`app/(dashboard)/inventory/page.tsx` | Переносим в `app/(dashboard)/stock/page.tsx`, заменяем ComingSoon на реальный RSC | LOW | Удаление старого каталога + создание нового |
`/prices/wb/page.tsx` line 245, 583 | `card.stockQty` остаётся — денормализованная сумма | LOW | Backward compat гарантируем через sum-on-write |
`components/cards/WbCardsTable.tsx` line 361-362 | `card.stockQty` остаётся | LOW | Тот же бэккомпат |
`app/api/wb-sync-spp/route.ts` | **НЕ ТРОГАЕМ** — быстрая СПП синхронизация не касается остатков | ZERO | Подтверждено: PROJECT.md явно пишет «per-warehouse не при fast СПП» |

### Breaking changes analysis — `WbCard.stockQty`

**Вопрос из брифа:** «Используется ли где-то как source of truth, или можно безопасно оставить как denormalized sum?»

**Ответ: используется в 4 точках чтения.** Все 4 — read-only, никто не пишет в `stockQty` кроме `wb-sync`. Безопасно оставить как denormalized sum **при условии, что это пишется в той же транзакции, что и per-warehouse breakdown** (иначе consistency race между читателями на полпути синхронизации).

**Рекомендуемый pattern в расширенном wb-sync:**

```typescript
// В цикле per-card (route.ts line 71):
const warehouseBreakdown = warehouseStockMap.get(card.nmId) ?? []
const totalStockQty = warehouseBreakdown.reduce((s, w) => s + w.quantity, 0)

await prisma.$transaction(async (tx) => {
  // 1. Upsert WbCard (с stockQty = sum — денормализованно)
  const wbCard = await tx.wbCard.upsert({
    where: { nmId: card.nmId },
    update: { /* ...existing fields..., */ stockQty: totalStockQty },
    create: { /* ...existing fields..., */ stockQty: totalStockQty },
  })

  // 2. Удаляем старые warehouse breakdown записи, которых больше нет
  const currentWhIds = warehouseBreakdown.map(w => w.warehouseId)
  await tx.wbCardWarehouseStock.deleteMany({
    where: { wbCardId: wbCard.id, warehouseId: { notIn: currentWhIds } },
  })

  // 3. Upsert актуальные
  for (const w of warehouseBreakdown) {
    await tx.wbCardWarehouseStock.upsert({
      where: { wbCardId_warehouseId: { wbCardId: wbCard.id, warehouseId: w.warehouseId } },
      update: { quantity: w.quantity },
      create: { wbCardId: wbCard.id, warehouseId: w.warehouseId, quantity: w.quantity },
    })
  }
})
```

**Миграция «stockQty = SUM(WbCardWarehouseStock.quantity)» НЕ НУЖНА отдельно** — первая же полная синхронизация после деплоя Phase 14 перезапишет `stockQty` корректно (уже была sum по складам, будет та же sum с новым источником). Если хочется sanity-check — одноразовый SQL сверки в deploy hook:
```sql
-- Должно быть 0 расхождений после первой полной sync
SELECT wc.id, wc."stockQty", COALESCE(SUM(ws.quantity), 0) AS breakdown_sum
FROM "WbCard" wc
LEFT JOIN "WbCardWarehouseStock" ws ON ws."wbCardId" = wc.id
GROUP BY wc.id
HAVING wc."stockQty" IS DISTINCT FROM COALESCE(SUM(ws.quantity), 0);
```

## Per-warehouse sync pattern — выбор стратегии

| Стратегия | Плюсы | Минусы | Подходит? |
|-----------|-------|--------|-----------|
| **A: deleteMany + createMany** | Проще кода, 2 запроса | Foreign key cascade/trigger issues в будущем; теряет `updatedAt` history (все updatedAt одинаковые) | ✗ |
| **B: upsert по @@unique + deleteMany(notIn)** | Stable `updatedAt` per row, cleanly removes gone warehouses | 2-3 запроса per card × 50 cards × 50 warehouses = ~5000 queries | ✓ (РЕКОМЕНДУЕТСЯ) |
| **C: temp table + swap** | Atomic batch | Overkill для 2500 строк; сложная Prisma реализация (нужен $executeRaw) | ✗ |

**Решение:** Стратегия B. При ~50 товарах × ~50 складов = 2500 строк сумма query достижимо за 5-10 секунд в PostgreSQL 16 и рамках текущего `maxDuration = 300` для `/api/wb-sync`. Если окажется медленно — миграция на `createMany({ skipDuplicates })` + отдельный `updateMany` для изменившихся quantity; но profile-first, optimize-second.

**Оптимизация (если медленно):** Батчить upserts через `Promise.all` по 10 карточек. НО осторожно с `$transaction` scope — либо одна транзакция на всю синхронизацию (долгая транзакция = lock risk), либо per-card (race window на `stockQty`/breakdown). **Рекомендация: per-card транзакция** (как выше в code snippet) — это уже atomic guarantee для single product.

## RSC data assembly — `/stock/page.tsx`

### Какая агрегация в SQL, какая в JS?

| Уровень агрегации | Где считать | Почему |
|-------------------|-------------|--------|
| **Per-warehouse quantity** | SQL (no sum — это raw record) | Просто `findMany` |
| **Per-cluster sum (ЦФО total per nmId)** | JS | Cluster stored denormalized в `WbWarehouse.shortCluster` — group в JS после fetch |
| **WB-total per nmId** (sum всех warehouses) | JS (re-use `WbCard.stockQty` если доступно, иначе sum) | Быстрее из единого поля |
| **MP-sum per Product** (sum по всем WbCard одного Product) | JS | Нужен `Map<productId, nmId[]>` контекст |
| **RF-total per Product** (MP-sum + ivanovoStock + productionStock) | JS | Single formula |
| **Oz-stub** | JS (константа 0) | Phase 14 не делает Ozon |
| **Z (avg orders/day 7d)** | JS (re-use `WbCard.avgSalesSpeed7d`) | Уже в БД |
| **Об (turnover days)** | JS | `quantity / salesSpeed` |
| **Д (deficit shortage)** | JS | `max(0, salesSpeed × turnoverNormDays - quantity)` |

**Обоснование JS-агрегации:** Данных мало (50 товаров × 50 складов = 2500 rows), одна страница — всё помещается в память. Попытка делать агрегации в SQL потребовала бы несколько `$queryRaw` с GROUP BY cluster — сложнее тестировать, хуже DX с Prisma. JS-агрегация тривиальна и читаема. **Точно как в `/prices/wb/page.tsx`** — там 267 карточек тоже агрегируются в JS.

### Нужен ли отдельный подраздел `/stock/wb`?

**Рекомендация: Да, отдельный `/stock/wb`.**

Обоснование:
- PROJECT.md явно пишет: «Подраздел `/stock/wb` с per-nmId × per-кластер × per-склад разрезом».
- Главная `/stock` — Product-level агрегация (РФ/Иваново/Производство/МП-sum/WB-sum/Ozon) — **row per Product**.
- `/stock/wb` — nmId-level детализация с expand до конкретных складов — **row per WbCard**, колонки per cluster, expand per warehouse.

Это разные UI с разной информационной плотностью и пользовательскими сценариями. Объединять — перегружать главный экран. Из паттерна `/prices/wb` очевидно, что проект уже использует suffix-routes (`/cards/wb`, `/prices/wb`, `/cards/ozon`) — согласованно продолжить.

**Структура навигации:**
```
/stock             ← Product-level дашборд (главная)
/stock/wb          ← WB per-warehouse детализация
/stock/ozon        ← ComingSoon stub (Ozon в v1.3+)
```

## Cluster expand/collapse state management

**Вопрос из брифа:** URL searchParams vs localStorage?

**Рекомендация: URL searchParams** — `?expandedClusters=cfo,yug`.

| Критерий | searchParams (рекомендуется) | localStorage |
|----------|------------------------------|--------------|
| Shareable link | ✓ «Посмотри дефицит ЦФО+Урал» | ✗ |
| Server-side rendering | ✓ RSC знает состояние | ✗ постфлеш |
| Cross-device | ✓ | ✗ |
| Consistency с существующим кодом | ✓ `/prices/wb` использует searchParams (brands, stock, promos, calc) | ✗ |
| Persistence после logout/logout | neutral | ✓ но не критично |

**Исключение:** `UserPreference` (JSON key-value per user) используется **только для ширин столбцов и hidden columns** (см. `getUserPreference<Record<string, number>>("prices.wb.columnWidths")`) — это правильный scope для per-user UI persisted state. Для expand — searchParams.

**Количество одновременно раскрытых кластеров:** все 7 expandable независимо (как folders в file explorer). НЕ «один за раз» — при 7 кластерах пользователь может хотеть видеть 2-3 одновременно для сравнения. Дефолт — все collapsed.

## Integration points — extended API design

### `POST /api/wb-sync` — расширение

**Изменения в `route.ts`:**
- Line 15: add `fetchStocksPerWarehouse` import (keep `fetchStocks` для fallback)
- Line 45: replace `fetchStocks()` call. New return: `Map<nmId, Array<{warehouseId, warehouseName, quantity}>>`
- Line 89-153: wrap in `prisma.$transaction` per card, add breakdown write after WbCard upsert

**Новое: seed/auto-register WbWarehouse на лету.**

WB Statistics API возвращает `warehouseName` + `warehouseId` в каждой записи. Предварительный seed skрипт — отдельная задача (см. Build order ниже), но **wb-sync должен корректно обрабатывать unknown warehouseId**: либо upsert в WbWarehouse с `cluster = "UNKNOWN"` (flag для админа «разметь кластер»), либо skip с warning. **Рекомендация: upsert с `cluster = "UNKNOWN"`** — не ломает sync если администратор добавил новый склад в кабинет WB, а мы не успели обновить справочник.

### `POST /api/stock-ivanovo-upload` — новый endpoint

**Паттерн — полная копия `POST /api/wb-promotions-upload-excel`:**
1. `requireSection("STOCK", "MANAGE")`
2. `formData()` → `file` field
3. `Buffer.from(await file.arrayBuffer())`
4. Новая pure-функция `lib/parse-ivanovo-stock-excel.ts` (testable via vitest fixture)
5. Validation: формат колонок (УКТ, остаток), формат SKU `УКТ-\d{6}`
6. Transaction: `updateMany` per sku → `Product.ivanovoStock`
7. Return: `{ imported: N, unknownSkus: [...] }`

**Edge case: SKU не найден в БД** — вернуть в response, UI покажет пользователю список «эти УКТ не распознаны».

### Server actions — `app/actions/stock.ts`

```typescript
// updateProductionStock(productId, quantity)
"use server"
await requireSection("STOCK", "MANAGE")
const parsed = z.number().int().min(0).max(999999).parse(quantity)
await prisma.product.update({ where: { id: productId }, data: { productionStock: parsed } })
revalidatePath("/stock")

// updateStockTurnoverNormDays(days)
"use server"
await requireSection("STOCK", "MANAGE")
const parsed = z.number().int().min(1).max(100).parse(days)
await prisma.appSetting.upsert({
  where: { key: "stock.turnoverNormDays" },
  update: { value: String(parsed), updatedBy: session.user.id },
  create: { key: "stock.turnoverNormDays", value: String(parsed), updatedBy: session.user.id },
})
revalidatePath("/stock"); revalidatePath("/stock/wb")
```

### Revalidation strategy

- После write — `revalidatePath("/stock")` + `revalidatePath("/stock/wb")` — обе страницы разделяют источники.
- `router.refresh()` на клиенте после mutation — уже паттерн проекта (см. GlobalRatesBar debounced save).

## Suggested build order — 7 планов внутри Phase 14

```
14-01  Schema + routing rename (/inventory → /stock)
14-02  WbWarehouse seed script
14-03  wb-sync extension (per-warehouse write)
14-04  Excel upload + parser (Иваново остатки)
14-05  Production stock manual input + turnover norm
14-06  /stock RSC page + flat table (without cluster expand)
14-07  /stock/wb + cluster expand + per-warehouse detail
```

### Обоснование последовательности

**14-01 (Schema + routing) — первый.** Все следующие планы опираются на наличие моделей и /stock route. Routing rename делается одной миграцией в одной PR/commit, чтобы не оставлять кодовую базу с полуживым `/inventory`.

**14-02 (WbWarehouse seed) — независим от 14-01 по коду, но зависит по БД.** Можно параллелить 14-02 и 14-03 при многочеловечной работе; в одиночку — последовательно.

**14-03 (wb-sync extension) — зависит от 14-01 и 14-02.** WbCardWarehouseStock требует WbWarehouse records (FK Restrict). Если 14-02 не готов — добавить `upsert UNKNOWN cluster` fallback (см. выше) даёт independency.

**14-04 (Excel Иваново) + 14-05 (Production manual) — независимы друг от друга**, оба зависят только от 14-01 (новые поля Product). Можно параллелить.

**14-06 (/stock flat table) — зависит от 14-01, 14-03, 14-04, 14-05** (нужны данные из всех источников). Сознательно без cluster expand — сначала validate агрегации и UI, потом усложняем.

**14-07 (cluster expand + /stock/wb)** — финальный UX polish. Может задержаться на один релиз без блока остальной функциональности — остатки уже видны.

### Критические зависимости

```
14-01 ─────┬─→ 14-02 ─────┐
           │              ├─→ 14-03 ─────┐
           │              │              │
           ├─────→ 14-04 ─┼──────────────┼─→ 14-06 ─→ 14-07
           │              │              │
           └─────→ 14-05 ─┴──────────────┘
```

## Паттерны (заимствуем из Phase 7)

### Sticky table — `PriceCalculatorTable` как reference

- 4 sticky колонки слева: Фото / Сводка / Ярлык / Артикул
- rowSpan группировка: Product → WbCard → rows
- content-visibility для производительности при 50+ товарах (проверено в Phase 7)
- Per-user сохранение ширин столбцов через `UserPreference` с key `"stock.main.columnWidths"`

**Для `/stock` table — те же паттерны:**
- Sticky left: Фото / УКТ / Название
- Sticky right: Об / Д (дефицит) — чтобы пользователь всегда видел итоги
- rowSpan: Product row занимает N строк, где N = количество связанных WbCard (или 1 для товаров без WB карточек)

### AppSetting debounced save — `GlobalRatesBar` pattern

- `useDeferredValue` или lodash-debounce 500ms
- `router.refresh()` после save для пересчёта всех Об/Д на странице
- Zod validation server-side + client-side

### Excel upload — `WbAutoPromoUploadButton` pattern

- Hidden file input + styled button
- Client-side file type validation (.xlsx only)
- Progress toast (sonner)
- Response: `{ imported, unknownSkus }` → показываем список нераспознанных УКТ

## Anti-patterns (избегаем)

### Anti-pattern 1: Считать stockQty на read-side

**Плохо:** `/stock` RSC делает `SUM(WbCardWarehouseStock.quantity) GROUP BY wbCardId` на каждом рендере.

**Почему плохо:** дублирует work wb-sync, медленный, лишняя нагрузка на БД при N пользователях смотрящих /stock.

**Правильно:** `WbCard.stockQty` — already-aggregated, пишется раз при синхронизации.

### Anti-pattern 2: Агрегация кластеров в SQL через $queryRaw

**Плохо:** `SELECT cluster, SUM(quantity) FROM WbCardWarehouseStock JOIN WbWarehouse GROUP BY cluster, wbCardId`

**Почему плохо:** Prisma-incompatible типы (raw SQL), сложнее тестировать, не даёт значимого выигрыша на 2500 rows.

**Правильно:** fetch flat, group в JS как в `/prices/wb`.

### Anti-pattern 3: Писать stockQty из нескольких мест

**Плохо:** вручную апдейтить `stockQty` в UI action «пересчитать остатки».

**Почему плохо:** рассинхронизация WbCard.stockQty ≠ SUM(WbCardWarehouseStock.quantity) → bugs в отчётах.

**Правильно:** Single writer = wb-sync route. Всегда рассчитываем sum в той же транзакции, где пишем breakdown.

### Anti-pattern 4: Дёргать Orders API повторно для `avgSalesSpeed7d`

**Плохо:** В `/stock` page.tsx делать `fetchAvgSalesSpeed7d()` при рендере.

**Почему плохо:** WB Orders API rate-limited (~1 req/min), блокирует render.

**Правильно:** Reuse уже синхронизированного `WbCard.avgSalesSpeed7d` (pasted wb-sync в Phase 7).

## Scalability considerations

| Concern | Сейчас (50 товаров) | 200 товаров (цель MVP+) | 1000 товаров (hypothetical) |
|---------|---------------------|-------------------------|------------------------------|
| `/api/wb-sync` duration | ~2 мин | ~5-8 мин | Нужен queue (BullMQ) |
| /stock RSC render | <500ms | <2s | Нужен cursor pagination |
| Excel upload rows | <100 | <300 | >1000 — batchBacked processing |
| WbCardWarehouseStock rows | 2500 | 10000 | 50000 — `@@index([cluster])` критичен |

**MVP достаточно: 50-200 товаров.** Phase 14 не требует pagination, BullMQ или других масштабирующих механизмов.

## Open questions — для phase-specific research

- **WbWarehouse seed source** — исходный формат страницы seller.wildberries.ru/suppliers (HTML scrape из DevTools vs export). Отдельный research в Plan 14-02.
- **Excel формат Иваново** — нужен реальный sample файл от клиента. Отдельный research в Plan 14-04 с фикстурой.
- **Точность WB Statistics warehouseName** — мониторить в prod: случаются ли «unknown warehouses» в Statistics API, которых нет в seed? Fallback cluster="UNKNOWN" страхует.

## Sources

- `C:\Claude\zoiten-pro\prisma\schema.prisma` (existing schema, lines 167-212 WbCard, 428-433 AppSetting, 436-463 CalculatedPrice) — HIGH
- `C:\Claude\zoiten-pro\lib\wb-api.ts` (lines 182-208 fetchStocks, 748-814 fetchAvgSalesSpeed7d) — HIGH
- `C:\Claude\zoiten-pro\app\api\wb-sync\route.ts` (lines 45, 80, 110, 142 — writes stockQty in 5 places) — HIGH
- `C:\Claude\zoiten-pro\app\(dashboard)\prices\wb\page.tsx` (lines 245, 582-587 — card.stockQty читается) — HIGH
- `C:\Claude\zoiten-pro\components\cards\WbCardsTable.tsx:361-362` (card.stockQty в UI таблицы карточек) — HIGH
- `C:\Claude\zoiten-pro\lib\sections.ts:11` (/inventory → STOCK — **расхождение с PROJECT.md**) — HIGH
- `C:\Claude\zoiten-pro\app\(dashboard)\inventory\page.tsx` (existing stub с ComingSoon) — HIGH
- `C:\Claude\zoiten-pro\components\layout\nav-items.ts:34` (href="/inventory") — HIGH
- `C:\Claude\zoiten-pro\app\api\wb-promotions-upload-excel\route.ts` (Excel upload pattern reference) — HIGH
- `.planning\PROJECT.md` (target features, ключевой контекст milestone) — HIGH
- `CLAUDE.md` (Phase 7 architecture, WB API details) — HIGH
