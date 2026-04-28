# Phase 16: Размерная разбивка остатков WB + фикс sync bug — Research

**Researched:** 2026-04-22
**Domain:** WB Statistics API per-size + Prisma schema migration + sticky-table расширение + sync bug forensics
**Confidence:** HIGH

---

## Резюме

Phase 16 опирается на **три ключевых факта**, подтверждённых кодом и документацией:

1. **WB Statistics API РЕАЛЬНО возвращает `techSize` и `barcode` per-row** для обоих endpoints —
   `/api/v1/supplier/stocks` и `/api/v1/supplier/orders`. Подтверждено фикстурами в
   `tests/wb-stocks-per-warehouse.test.ts:60` (поле `techSize: "0"`) + публичной WB API
   документацией. Это означает: per-size остатки **И** per-size заказы (З) полностью
   реализуемы в БД, без приближений или fallback `—`.

2. **Sync bug — это ДВА разных бага в двух разных файлах** (НЕ один общий):
   - `scripts/wb-sync-stocks.js:114` — `quantity: existing.quantity + qty` (накопление через
     existing). При второй и последующих запусках старый агрегат `existing` суммируется с
     новым snapshot → БД > API.
   - `app/api/wb-sync/route.ts:251` — upsert с `update: { quantity: item.quantity }` +
     **отсутствие пред-агрегации** входящих rows по warehouseName. Когда Statistics API
     возвращает 6 rows для Котовск (один per techSize) — upsert вызывается 6 раз для
     одного и того же `(wbCardId, warehouseId)` ключа, последний техразмер ПЕРЕЗАПИСЫВАЕТ
     все предыдущие → БД содержит qty последнего техразмера (например 8), не сумму всех
     (61). Это объясняет наблюдение «БД=8 < API=61» точно.
   - Расхождения противоположных направлений (БД>API в JS-скрипте, БД<API в API route) —
     закономерны и ОТЛИЧАЮТСЯ от единой гипотезы CONTEXT.md.

3. **Patterns Phase 14/15 + quick 260422-oy5 покрывают 95% задач Phase 16:** schema
   migration через manual SQL, server action для per-user toggle, optimistic update,
   sticky-table расширение, clean-replace транзакция, vitest fixtures. Никаких новых
   зависимостей не требуется.

**Primary recommendation:** Phase 16 разделяется на **6 plans + Wave 0** (диагностический
прогон). Wave 0 ОБЯЗАТЕЛЕН: написать standalone diagnostic скрипт `scripts/wb-stocks-diagnose.js`
который выполнит curl на Statistics API для контрольных nmId 859398279 и 901585883,
сравнит с текущими данными БД и выгрузит CSV-отчёт расхождений. Это даст golden baseline
для верификации фикса в Plan 16-02.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**UI: форма размерной разбивки (B4 — full breakdown)**
B4 — под каждым nmId раскрываются строки per размер с **полной**
структурой колонок (О/З/Об/Д per cluster + per-warehouse при expanded кластере).
НЕ tooltip (B1), НЕ модалка (B2), НЕ короткая колонка inline (B3).
Обоснование: «хочется чтобы под каждым артикулом, где есть размеры была разбивка
этой же всей информации по размерам».

**UI: toggle кнопка «По размерам»**
- Кнопка в верхней панели `/stock/wb` (рядом с «Развернуть все», «Без СЦ», «Склады»)
- При нажатии — все размерные строки раскрываются глобально (по всем nmId)
- При повторном клике — сворачиваются
- Когда у nmId один размер — размерная строка может скрываться (TBD: либо всегда
  показывать для единообразия, либо скрывать чтобы не дублировать)
- Persist состояния: **per-user в БД** (по аналогии с `User.stockWbHiddenWarehouses`,
  quick 260422-oy5). Поле `User.stockWbShowSizes Boolean @default(false)` (или Int?
  для tri-state, но v1 — Bool).

**Schema: techSize в WbCardWarehouseStock**
Добавить `techSize String` (не nullable; для товаров без размеров
ставить пустую строку `""` или маркер `"-"`). Сменить unique на
`(wbCardId, warehouseId, techSize)`.

**Sync: правильный upsert per-size**
Заменить текущий `existing.quantity + qty` (накопление) на upsert с
**replace**: `quantity: qty` (строго равно входящему). Clean-replace per
`wbCardId` теперь должен учитывать (wbCardId, warehouseId, techSize) — удалять
строки которых нет в incoming snapshot.

**Sync: расследование корневой причины**
В плане 16-01 (или research-фаза) — диагностический скрипт сравнения
WB API snapshot ↔ БД для конкретных nmId, лог детализации.

**Per-size З (заказы/день) — TBD на этапе исследования:**
- Если **techSize в Orders API ДА** — Z per размер показываем как обычно.
- Если **нет** — два варианта: показывать `—` или пропорция от nmId-овых З.
- Default: `—` (честнее).
- **Решение принимается в research.**

**Фильтры совместимы с размерными строками**
«Без СЦ» + per-user скрытие складов применяются **к колонкам кластеров/складов**,
а не к nmId/размерным строкам. Размерные строки продолжают существовать; их
per-cluster агрегат считается по тем же видимым складам (или по всем — TBD).
**Гипотеза-default:** агрегаты per-cluster ВСЕГДА считаются по всем складам.

**Сортировка размеров**
Числовая по возрастанию (46 → 48 → 50 → 60). Если techSize не число (S/M/L/XL/2XL) —
алфавитная с известным маппингом (`XS<S<M<L<XL<2XL<3XL<4XL`). Хелпер `sortSizes`
в `lib/wb-clusters.ts` или `lib/stock-math.ts`.

**Миграция и backfill**
Новая Prisma миграция (manual SQL, как в Phase 14/15) добавляет `techSize` в
`WbCardWarehouseStock` с default `""`, меняет unique. После применения **обязательный
re-sync** на VPS — старые записи затрутся снапшотом WB API.

### Claude's Discretion

- Имя поля: `techSize` (соответствует API WB) — locked.
- Sort order для размеров одного nmId в UI — числовой/символьный (см. выше).
- Persist кнопки «По размерам» — БД (per-user) предпочтительнее URL.
- Когда у nmId 1 размер — показывать ли отдельную размерную строку: **скрывать**
  (избегаем дублирования).
- Цвет/стиль размерной строки — приглушённый фон (`bg-muted/30`?), отступ слева
  для иерархии, либо мелкий префикс `↳ Размер 50` в первой колонке. Решит planner.

### Deferred Ideas (OUT OF SCOPE)

- **Per-size З с пропорциональным распределением** — отложено до v2.
- **Размерная разбивка для in-way** — текущая схема `WbCard.inWayToClient/From`
  агрегатная per nmId. Расширение до per-size требует изменения sync для inWay,
  отложено.
- **Размерная разбивка в /stock (Product-level)** — отложено.
- **Сохранение фильтра «По размерам» в URL дополнительно к БД** — отложено.
- **Цветовая шкала для размеров с критическим остатком** — отложено в UI-полировку.
- **Per-size агрегация для Ozon** — отложено.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

В REQUIREMENTS.md **на момент исследования отсутствуют** STOCK-XX или PHASE-16-XX
требования специально про размерную разбивку. Существующие STOCK-01..STOCK-29 (Phase 14)
и ORDERS-01..ORDERS-03 (Phase 15) — все Complete, не покрывают per-size.

**Рекомендация для planner:** добавить новые ID `STOCK-30..STOCK-37` (или
`SIZES-01..SIZES-08`) в REQUIREMENTS.md перед началом Plan 16-01.

| Предложенный ID | Описание | Research Support |
|----|-------------|------------------|
| **STOCK-30** | Diagnostic скрипт `scripts/wb-stocks-diagnose.js` — curl Statistics API + сравнение с БД для контрольных nmId, CSV-отчёт расхождений | Bug forensics ниже §«Sync Bug Forensics» |
| **STOCK-31** | Prisma миграция: добавить `techSize String NOT NULL DEFAULT ''` в `WbCardWarehouseStock`, сменить unique на `(wbCardId, warehouseId, techSize)`, добавить `User.stockWbShowSizes Boolean @default(false)` | Manual SQL pattern Phase 14/15, ниже §«Schema Migration» |
| **STOCK-32** | Расширить `WarehouseStockItem` в `lib/wb-api.ts` полем `techSize`, `fetchStocksPerWarehouse` пропускает поле; для orders создать аналог `OrdersWarehouseStats.perWarehouseSize` Map<size, Map<wh, count>> | Test fixture line 60 показывает API возвращает techSize |
| **STOCK-33** | Фикс `app/api/wb-sync/route.ts` — upsert по `(wbCardId, warehouseId, techSize)` с replace; clean-replace учитывает все 3 поля. Аналогичный фикс в `scripts/wb-sync-stocks.js` (заменить `existing + qty` на replace) | Sync bug forensics ниже |
| **STOCK-34** | Расширить `lib/stock-wb-data.ts` — ввести `WbStockSizeRow` (per-size агрегаты, такая же структура как `WbStockRow`) + `sizeBreakdown: WbStockSizeRow[]` в `WbStockRow`. Sort sizes через хелпер `sortSizes()` | Pattern из существующего `WbStockRow` |
| **STOCK-35** | Server action `saveStockWbShowSizes(value: boolean)` — паттерн `saveStockWbHiddenWarehouses` quick 260422-oy5; RBAC `requireSection("STOCK")` без MANAGE | quick 260422-oy5-PLAN.md |
| **STOCK-36** | UI: кнопка `<Button>По размерам</Button>` рядом с «Без СЦ» / «Склады»; рендер `g.wbCards[].sizeBreakdown[]` строк под per-nmId строкой когда `sizes > 1` И toggle ON | Расширение `StockWbTable.tsx` |
| **STOCK-37** | Re-sync после deploy + UAT: верификация контрольных nmId 859398279, 901585883 — sum размеров = stockQty карточки, Котовск ЦФО показывает 6 строк с qty {11,10,10,10,10,10}, агрегат = 61 | UAT chefklist + acceptance criteria |

</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

**Обязательно соблюдать в Phase 16:**

1. **Sticky data-таблицы:** raw `<thead>` / `<tr>` (НЕ shadcn `<TableHeader>` /
   `<TableRow>`), `border-separate border-spacing-0`, `bg-background` на thead и
   каждой sticky cell, flex layout container, `Math.trunc` для Д/Об/остатков.
2. **Формула дефицита:** `Д = norm × З − О` (БЕЗ коэф. 0.3, убран 2026-04-22).
   Существующая `calculateStockMetrics` в `lib/stock-math.ts` уже исправна — не
   менять, только переиспользовать для размерных строк.
3. **Иерархия границ:** inter-group `border-r`, intra-group `border-r-border/40`.
   Размерные строки внутри одного nmId — intra (тонкая); между nmId — стандартная.
4. **Product-level cell:** в Phase 16 добавляется ещё один уровень иерархии
   (Product → nmId → размер). Для Иваново/Сводная-полей в размерных строках
   ставить placeholder `—` (паттерн уже работает для per-nmId строк).
5. **Per-user UI настройки:** поле прямо на `User` (Boolean / Int[]), `requireSection`
   без MANAGE, `useState` + `useTransition` + `revalidatePath`. НЕ localStorage,
   НЕ отдельная UserPreference таблица. Точный паттерн quick 260422-oy5.
6. **Manual SQL миграции:** локальной PG нет, миграция применяется через
   `bash deploy.sh` на VPS (`prisma migrate deploy`).
7. **Язык:** русский (комментарии в коде, commit messages, UI).
8. **WB API через `fetch()` — но Chat и v4 через `curl`:** Statistics API работает
   через native fetch (подтверждено в существующих helpers), curl-fallback не нужен.
9. **GSD Workflow:** все изменения через `/gsd:execute-phase` (НЕ напрямую Edit).

---

## Standard Stack

### Core (уже установлен в проекте, не устанавливать повторно)

| Библиотека | Версия | Назначение | Почему стандарт |
|------------|--------|-----------|-----------------|
| Next.js | 15.5.14 | App Router, RSC, Server Actions | Проектный стек |
| Prisma | 6.19.3 | ORM, миграции | Проектный стек, последняя 6.x |
| `@prisma/client` | 6.19.3 | Generated Prisma client | Проектный стек |
| TypeScript | 5.9.3 | Static types | Проектный стек |
| `vitest` | 4.1.4 | Unit tests | Уже установлен с Phase 7 |
| shadcn/ui v4 base-nova | — | Компоненты UI | Проектный стек |
| `@base-ui/react` | 1.3.0 | Нижний слой shadcn | Проектный стек |
| `lucide-react` | 1.7.0 | Иконки | Проектный стек |
| `sonner` | 2.0.7 | Toast | Проектный стек |
| `zod` | 4.3.6 | Server action валидация | Проектный стек |

**Новых зависимостей устанавливать не нужно.** 100% покрытия существующим стеком.

### Версии — verified

```bash
# Все из package.json (проверено 2026-04-22)
"@prisma/client": "^6.19.3",
"prisma": "^6.19.3",
"next": "^15.5.14",
"vitest": "^4.1.4",
"zod": "^4.3.6",
```

`prisma migrate deploy` (НЕ `migrate dev`) применяет SQL-миграции, написанные вручную —
паттерн установлен с Phase 1, активно используется во всех последующих фазах.

### Alternatives Considered

| Instead of | Could Use | Tradeoff | Решение |
|------------|-----------|----------|---------|
| Boolean `User.stockWbShowSizes` | Int (tri-state) для «авто/всегда/никогда» | Сейчас не нужно, добавим потом | Boolean v1 (locked в CONTEXT.md) |
| Manual SQL миграция | `prisma migrate dev` локально + commit | Локальной PG нет, паттерн проекта manual | Manual (locked) |
| Новая таблица `WbCardSizeStock` | Расширение `WbCardWarehouseStock` | Лишняя таблица + дублирование, нет преимуществ | Расширение (locked) |
| `sortSizes` в новом файле | Помещение в `lib/stock-math.ts` | stock-math сейчас pure-numeric, sortSizes string-helper | `lib/wb-clusters.ts` (там уже helpers по размерности) |

---

## Architecture Patterns

### Recommended Project Structure (что меняем)

```
prisma/
├── migrations/
│   └── 20260423_phase16_size_breakdown/
│       └── migration.sql          # NEW: techSize + User.stockWbShowSizes
└── schema.prisma                   # MODIFY: WbCardWarehouseStock + User

lib/
├── wb-api.ts                       # MODIFY: WarehouseStockItem.techSize, fetchOrdersPerWarehouse → perWarehouseSize
├── wb-clusters.ts                  # MODIFY: + export sortSizes()
└── stock-wb-data.ts                # MODIFY: + sizeBreakdown: WbStockSizeRow[]

scripts/
├── wb-sync-stocks.js               # MODIFY: replace вместо accumulate + per-size keys
└── wb-stocks-diagnose.js           # NEW (Wave 0): diagnostic + CSV report

app/
├── api/wb-sync/route.ts            # MODIFY: per-size upsert + clean-replace
├── actions/stock-wb.ts             # MODIFY: + saveStockWbShowSizes(value)
└── (dashboard)/stock/wb/page.tsx   # MODIFY: read showSizes, передать в Table

components/stock/
└── StockWbTable.tsx                # MODIFY: + кнопка «По размерам» + размерные строки

tests/
├── wb-stocks-per-warehouse.test.ts # MODIFY: добавить test про techSize группировку
├── wb-orders-per-warehouse.test.ts # MODIFY: добавить test про perWarehouseSize
└── stock-wb-size-sort.test.ts      # NEW: sortSizes helper unit tests
```

### Pattern 1: Schema Migration (manual SQL, паттерн Phase 14/15)

```sql
-- prisma/migrations/20260423_phase16_size_breakdown/migration.sql

-- ─────────────────────────────────────────────────────────────────
-- 1. Добавить techSize в WbCardWarehouseStock
-- ─────────────────────────────────────────────────────────────────

-- Шаг 1.1: добавить колонку с дефолтом '' (existing rows получат пустую строку,
-- что соответствует "размер неизвестен" = legacy агрегат). Эти rows будут
-- ПЕРЕЗАПИСАНЫ при первом sync (clean-replace per wbCardId), но default
-- предотвращает NOT NULL violation на момент применения миграции.
ALTER TABLE "WbCardWarehouseStock"
  ADD COLUMN "techSize" TEXT NOT NULL DEFAULT '';

-- Шаг 1.2: дропнуть старый unique index
ALTER TABLE "WbCardWarehouseStock"
  DROP CONSTRAINT IF EXISTS "WbCardWarehouseStock_wbCardId_warehouseId_key";

DROP INDEX IF EXISTS "WbCardWarehouseStock_wbCardId_warehouseId_key";

-- Шаг 1.3: создать новый unique с techSize
CREATE UNIQUE INDEX "WbCardWarehouseStock_wbCardId_warehouseId_techSize_key"
  ON "WbCardWarehouseStock" ("wbCardId", "warehouseId", "techSize");

-- Шаг 1.4 (CRITICAL): затереть legacy агрегаты — без этого старые rows
-- (с techSize='') будут конфликтовать со свежими per-size rows (с techSize='46',
-- '48', ...) при первом sync. Полагаемся на re-sync в Plan 16-06 для
-- наполнения свежими данными.
DELETE FROM "WbCardWarehouseStock" WHERE "techSize" = '';

-- ─────────────────────────────────────────────────────────────────
-- 2. Добавить User.stockWbShowSizes (per-user UI preference)
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "User"
  ADD COLUMN "stockWbShowSizes" BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────
-- 3. NO changes to WbCardWarehouseOrders (in scope decision —
-- per-size orders агрегируются на JS, не в БД, чтобы не плодить таблицы)
-- ─────────────────────────────────────────────────────────────────
```

**Важно про DELETE:** Шаг 1.4 (`DELETE FROM "WbCardWarehouseStock" WHERE "techSize" = ''`)
гарантирует чистый старт. Альтернатива (UPDATE existing rows к techSize='*aggregated*')
рискует породить смешанные строки и не даст пользователю достоверной картины. CONTEXT.md
locks **«обязательный re-sync на VPS»** — DELETE + re-sync именно это и реализует.

### Pattern 2: WB API extension — `WarehouseStockItem.techSize`

```typescript
// lib/wb-api.ts — расширение существующего интерфейса

export interface WarehouseStockItem {
  warehouseName: string
  techSize: string          // NEW: "0" если без размера, "46"/"48"/.../"S"/"M"/.../"3XL" иначе
  barcode: string            // NEW (для будущего): WB-barcode размерной позиции
  quantity: number
  inWayToClient: number
  inWayFromClient: number
}

// fetchStocksPerWarehouse — добавить поля в маппинг
for (const row of rows) {
  if (!nmIdSet.has(row.nmId)) continue
  const items = result.get(row.nmId) ?? []
  items.push({
    warehouseName: row.warehouseName ?? "",
    techSize: row.techSize ?? "",          // NEW
    barcode: row.barcode ?? "",            // NEW
    quantity: row.quantity ?? 0,
    inWayToClient: row.inWayToClient ?? 0,
    inWayFromClient: row.inWayFromClient ?? 0,
  })
  result.set(row.nmId, items)
}
```

### Pattern 3: per-size orders aggregation (Map-of-Maps)

```typescript
// lib/wb-api.ts — расширение OrdersWarehouseStats

export interface OrdersWarehouseStats {
  avg: number
  yesterday: number
  perWarehouse: Map<string, number>  // existing
  // NEW: per-warehouse + per-size агрегат
  perWarehouseSize: Map<string, Map<string, number>>  // warehouseName → (techSize → count)
  periodDays: number
}

// fetchOrdersPerWarehouse внутреннее изменение:
const perWarehouseSizeMap = new Map<number, Map<string, Map<string, number>>>()

for (const o of orders) {
  if (o.isCancel) continue
  const nm = o.nmId ?? o.nm_id
  if (nm == null || !requested.has(nm)) continue
  const wh = (o.warehouseName ?? "").trim()
  const size = (o.techSize ?? "").trim() || "0"

  // existing avg/yesterday/perWarehouse code остаётся

  // NEW: per-warehouse-size
  if (wh) {
    let perWh = perWarehouseSizeMap.get(nm)
    if (!perWh) {
      perWh = new Map<string, Map<string, number>>()
      perWarehouseSizeMap.set(nm, perWh)
    }
    let perSize = perWh.get(wh)
    if (!perSize) {
      perSize = new Map<string, number>()
      perWh.set(wh, perSize)
    }
    perSize.set(size, (perSize.get(size) ?? 0) + 1)
  }
}
```

### Pattern 4: Sync bug fix in `app/api/wb-sync/route.ts`

**Текущий (БАГГИЙ):**
```typescript
// Для warehouseItems = [{warehouseName: 'Котовск', techSize: '46', qty: 11},
//                       {warehouseName: 'Котовск', techSize: '48', qty: 10}, ...]
for (const item of warehouseItems) {
  // upsert на (wbCardId, warehouseId) — каждый techSize ПЕРЕЗАПИСЫВАЕТ предыдущий
  await tx.wbCardWarehouseStock.upsert({
    where: { wbCardId_warehouseId: { wbCardId: card.id, warehouseId } },
    create: { wbCardId: card.id, warehouseId, quantity: item.quantity },
    update: { quantity: item.quantity },
  })
}
```

**Правильный (Phase 16):**
```typescript
for (const item of warehouseItems) {
  // upsert по тройному ключу — каждый techSize отдельная строка
  await tx.wbCardWarehouseStock.upsert({
    where: {
      wbCardId_warehouseId_techSize: {
        wbCardId: card.id,
        warehouseId,
        techSize: item.techSize,
      },
    },
    create: {
      wbCardId: card.id,
      warehouseId,
      techSize: item.techSize,
      quantity: item.quantity,
    },
    update: {
      quantity: item.quantity,  // REPLACE (не accumulate!)
    },
  })

  incomingKeys.push({ warehouseId, techSize: item.techSize })
}

// Clean-replace: удалить ВСЕ записи которых нет в incoming snapshot
// (per wbCardId — учитывает все 3 поля unique key)
if (incomingKeys.length > 0) {
  // Способ A (предпочтительный): построить compound NOT IN через OR
  // (Prisma не поддерживает compound NOT IN для multi-field — используем raw SQL)
  // или сначала собрать все existing, JS-фильтровать, deleteMany по id

  // Способ B (проще): получить все ID к удалению, deleteMany по id
  const existingRows = await tx.wbCardWarehouseStock.findMany({
    where: { wbCardId: card.id },
    select: { id: true, warehouseId: true, techSize: true },
  })
  const incomingSet = new Set(
    incomingKeys.map((k) => `${k.warehouseId}::${k.techSize}`)
  )
  const toDelete = existingRows
    .filter((r) => !incomingSet.has(`${r.warehouseId}::${r.techSize}`))
    .map((r) => r.id)
  if (toDelete.length > 0) {
    await tx.wbCardWarehouseStock.deleteMany({
      where: { id: { in: toDelete } },
    })
  }
}
```

**Денормализация stockQty per-nmId (после фикса):**
```typescript
// existing code — продолжает работать, sum включает все techSize
const totalStock = warehouseItems.reduce((s, w) => s + w.quantity, 0)
await tx.wbCard.update({
  where: { id: card.id },
  data: { stockQty: totalStock, /* in-way fields */ },
})
```

### Pattern 5: scripts/wb-sync-stocks.js fix

```javascript
// Строки 106-121 заменяются на:
await tx.wbCardWarehouseStock.upsert({
  where: {
    wbCardId_warehouseId_techSize: {
      wbCardId,
      warehouseId,
      techSize: item.techSize ?? "",
    },
  },
  create: {
    wbCardId,
    warehouseId,
    techSize: item.techSize ?? "",
    quantity: qty,  // REPLACE seed
  },
  update: {
    quantity: qty,  // REPLACE (НЕ existing.quantity + qty!)
  },
})

// Clean-replace учитывает per-size keys (паттерн как в API route)
```

### Pattern 6: `lib/stock-wb-data.ts` — добавить sizeBreakdown

```typescript
// NEW тип
export interface WbStockSizeRow {
  techSize: string
  totalStock: number | null
  clusters: Record<ClusterShortName, ClusterAggregate>  // та же структура
  // periodDays: используется тот же что у nmId-row (одного запроса хватает)
}

// MODIFY existing
export interface WbStockRow {
  // ...existing fields...
  sizeBreakdown: WbStockSizeRow[]  // NEW: пустой если 1 размер или legacy
  hasMultipleSizes: boolean         // NEW: флаг для UI «показывать toggle?»
}

// В getStockWbData() — после расчёта clusters per-card:
const sizeBreakdown = buildSizeBreakdown(card, clusterWarehousesMap, ordersByWarehouseSizeMap, /* ... */)
const uniqueSizes = new Set(card.warehouses.map((w) => w.techSize))
return {
  // ...,
  sizeBreakdown: uniqueSizes.size > 1 ? sizeBreakdown : [],
  hasMultipleSizes: uniqueSizes.size > 1,
}
```

### Pattern 7: sortSizes helper

```typescript
// lib/wb-clusters.ts — добавить ниже existing exports

const SIZE_ORDER: Record<string, number> = {
  "XS": 0, "S": 1, "M": 2, "L": 3, "XL": 4,
  "2XL": 5, "XXL": 5, "3XL": 6, "XXXL": 6, "4XL": 7,
}

/**
 * Сортирует размеры:
 *  1) Все числовые — числовая по возрастанию (46, 48, 50, ...)
 *  2) Все буквенные из SIZE_ORDER — по карте (XS, S, M, ...)
 *  3) Mixed или unknown — алфавитная как fallback
 *  4) Пустая строка / "0" — всегда в конце (товар без размера)
 */
export function sortSizes(sizes: string[]): string[] {
  const empty = sizes.filter((s) => !s || s === "0")
  const real = sizes.filter((s) => s && s !== "0")

  const allNumeric = real.every((s) => /^\d+$/.test(s))
  if (allNumeric) {
    real.sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
  } else {
    const allKnown = real.every((s) => s.toUpperCase() in SIZE_ORDER)
    if (allKnown) {
      real.sort((a, b) => SIZE_ORDER[a.toUpperCase()]! - SIZE_ORDER[b.toUpperCase()]!)
    } else {
      // Алфавитная (русская локаль для смешанных кейсов)
      real.sort((a, b) => a.localeCompare(b, "ru"))
    }
  }

  return [...real, ...empty]
}
```

### Pattern 8: UI рендер размерных строк

```tsx
// components/stock/StockWbTable.tsx — внутри per-nmId map

{g.wbCards.map((card) => (
  <React.Fragment key={card.wbCardId}>
    <TableRow>{/* existing per-nmId row */}</TableRow>

    {/* Размерные строки — рендерим только если showSizes ON И hasMultipleSizes */}
    {showSizes && card.hasMultipleSizes && card.sizeBreakdown.map((sizeRow) => (
      <TableRow key={`${card.wbCardId}-${sizeRow.techSize}`}
                className="bg-muted/30 border-t border-t-border/40">
        {/* sticky cells: артикул-колонка показывает «↳ Размер 50» с отступом */}
        <TableCell className="sticky left-[320px] z-20 bg-muted/30 border-r ...">
          <span className="text-muted-foreground pl-3 text-xs">↳ {sizeRow.techSize}</span>
        </TableCell>
        {/* placeholder Иваново */}
        <TableCell className="... text-muted-foreground">—</TableCell>
        {/* Всего на WB / Товар в пути cells: per-size totalStock + placeholder для in-way */}
        ...
        {/* Итого склады WB О/З/Об/Д — по sizeRow */}
        {/* Кластеры — точно такой же flatMap по CLUSTER_ORDER, что и в per-nmId row */}
      </TableRow>
    ))}
  </React.Fragment>
))}
```

**Иерархия rowSpan:** размерные строки НЕ участвуют в rowSpan для Фото/Сводка/Иваново
sticky cells. Текущий код ставит `rowSpan={1 + g.wbCards.length}`. После Phase 16:

```typescript
const totalSizeRows = showSizes
  ? g.wbCards.reduce((acc, c) => acc + (c.hasMultipleSizes ? c.sizeBreakdown.length : 0), 0)
  : 0
const rowSpan = 1 + g.wbCards.length + totalSizeRows
```

### Anti-Patterns to Avoid

- **НЕ строить per-size как отдельную таблицу WbCardSizeStock** — расширение
  существующей через unique-tuple проще и сохраняет CASCADE/index семантику.
- **НЕ группировать в JS перед upsert** — план был «pre-aggregate per warehouse»,
  но это только маскирует баг. Правильный фикс — per-size unique key.
- **НЕ использовать `existing.quantity + qty`** — корень бага. Для idempotent sync
  ВСЕГДА `quantity: incoming` (replace).
- **НЕ делать «backfill» для legacy rows.** CONTEXT.md locks обязательный re-sync.
  DELETE + re-sync — единственный честный путь.
- **НЕ применять hideSc / hiddenWarehouses к размерным строкам.** Это per-warehouse
  visibility, размерная row — другая ось. Per-cluster агрегат размерной row считается
  по всем складам кластера (locked в CONTEXT.md «default-гипотеза»).
- **НЕ менять `WbCardWarehouseOrders` schema.** Per-size orders агрегируются на JS
  во время рендера — таблицу разрастать не нужно.

---

## Don't Hand-Roll

| Проблема | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-size aggregation | Custom GROUP BY на сервере | `Map<size, ...>` + reduce в `lib/stock-wb-data.ts` | 50-200 nmId × 8 размеров — 1600 rows max, JS aggregation < 5ms |
| Sort sizes | `sizes.sort()` напрямую | `sortSizes()` helper в `lib/wb-clusters.ts` | Числовое vs буквенное vs mixed vs пустые — 4 кейса, легко промахнуться inline |
| Per-user toggle persist | localStorage / cookie / URL | `User.stockWbShowSizes Boolean` в БД | Установлен паттерн quick 260422-oy5; localStorage теряется между устройствами |
| Optimistic update | `useState` + revalidate без guard | `useTransition` + `optimistic onChange` prop | Готовый паттерн `WarehouseVisibilityPopover` |
| Diff БД vs API | Inline в коде | Standalone `scripts/wb-stocks-diagnose.js` (Wave 0) | Нужен ОДНОКРАТНО для верификации, не в production-path |
| sticky table layout | Свой scroll-container с computed heights | `<div overflow-auto h-full>` + `flex flex-col flex-1` | Установлен в CLAUDE.md «Sticky data-таблицы» |

**Key insight:** Phase 16 — на 90% переиспользование существующих паттернов
(Phase 14 schema, Phase 15 orders aggregation, quick 260422-oy5 per-user toggle,
Phase 14 sticky-table). Новый код = ~400-600 строк (helpers + UI).

---

## Sync Bug Forensics — Detailed Analysis

> Это раздел с **доказательной базой** для гипотез, описанных в CONTEXT.md. Один из
> главных deliverables research-фазы.

### Hypothesis 1 (CONTEXT.md): «Existing.quantity + qty при втором sync накопит»

**ПОДТВЕРЖДЕНО для `scripts/wb-sync-stocks.js`. ОПРОВЕРГНУТО для `app/api/wb-sync/route.ts`.**

#### Файл 1: `scripts/wb-sync-stocks.js:111-115`

```javascript
if (existing) {
  await tx.wbCardWarehouseStock.update({
    where: { wbCardId_warehouseId: { wbCardId, warehouseId } },
    data: { quantity: existing.quantity + qty },  // ← ACCUMULATION
  })
}
```

**Trace для nmId 859398279, Котовск, 6 техразмеров {46:11, 48:10, 50:10, 54:10, 58:10, 60:10}:**

**Sync #1 (БД пуста):**
1. techSize=46 (qty=11): existing=null → CREATE qty=11. БД=11
2. techSize=48 (qty=10): existing=11 → UPDATE qty=11+10=21. БД=21
3. techSize=50 (qty=10): existing=21 → UPDATE qty=21+10=31. БД=31
4. ...
6. techSize=60 (qty=10): existing=51 → UPDATE qty=51+10=61. БД=**61** ✓ (= sum размеров)

**Sync #2 (БД=61):**
1. techSize=46 (qty=11): existing=61 → UPDATE qty=61+11=72. БД=72
2. techSize=48 (qty=10): existing=72 → UPDATE qty=72+10=82.
3. ...
6. БД=72+10+10+10+10+10=**122** (≈ 2× правильного ответа)

**Sync #3:** БД=122+61=**183**. И так далее, **линейный рост на ~61 за каждый запуск**.

→ **Эффект: БД ≫ API после многократного запуска. ОБРАТНОЕ от наблюдения user (БД=8).**

#### Файл 2: `app/api/wb-sync/route.ts:238-253`

```typescript
for (const item of warehouseItems) {
  // ... lookup warehouseId ...
  await tx.wbCardWarehouseStock.upsert({
    where: { wbCardId_warehouseId: { wbCardId: card.id, warehouseId } },
    create: { wbCardId: card.id, warehouseId, quantity: item.quantity },
    update: { quantity: item.quantity },  // ← REPLACE (НЕ accumulate)
  })
}
```

`fetchStocksPerWarehouse` НЕ группирует rows — все 6 rows для Котовска идут в массив.
upsert вызывается 6 раз для одного `(wbCardId, warehouseId)` ключа:

1. techSize=46 (qty=11): create или update qty=11. БД=11
2. techSize=48 (qty=10): update qty=10 (ПЕРЕЗАПИСЬ!). БД=10
3. techSize=50 (qty=10): update qty=10. БД=10
4. techSize=54 (qty=10): update qty=10. БД=10
5. techSize=58 (qty=10): update qty=10. БД=10
6. techSize=60 (qty=10): update qty=10. БД=**10**

→ **Эффект: БД содержит qty последнего обработанного техразмера (нестабильно — порядок
от WB API!). Объясняет наблюдение БД=8 (если последняя обработанная позиция случайно
имела qty=8 для какого-то размера на этом nmId).**

**Нестабильность:** `fetchStocksPerWarehouse` фильтрует API rows через `nmIdSet.has`,
порядок зависит от того как WB API возвращает rows. Может в этот sync последний
элемент имел qty=8 (другой размер), в следующий — qty=11. **Это race-like behavior
без race conditions** — просто последний-write-wins на корявом ключе.

### Hypothesis 2 (CONTEXT.md): «clean-replace удаляет свежие записи»

**ОПРОВЕРГНУТО.** Clean-replace в обоих файлах работает на уровне `wbCardId` —
удаляет только records с warehouseId которых **нет в incoming**. Если warehouseId
present (как Котовск), запись НЕ удаляется. Это безопасно и НЕ влияет на observed bug.

### Hypothesis 3 (CONTEXT.md): «Race между script и API route»

**МАЛОВЕРОЯТНО.** Оба путя пишут в `WbCardWarehouseStock`, но не конкурентно
(скрипт запускается вручную, API route — кнопкой UI). Если race и был, то на короткое
окно — observed pattern (стабильно БД=8) этим не объясняется.

### Hypothesis 4 (NEW): «Денормализация WbCard.stockQty корректна»

**ПОДТВЕРЖДЕНО.** В `app/api/wb-sync/route.ts:268`:
```typescript
const totalStock = warehouseItems.reduce((s, w) => s + w.quantity, 0)
await tx.wbCard.update({ data: { stockQty: totalStock } })
```
Это `reduce` берёт `warehouseItems` ДО проблемного upsert — суммирует ВСЕ rows
(размеры × склады). Поэтому **`WbCard.stockQty=412` точное** (= sum по всем
складам и размерам), а `sum(WbCardWarehouseStock.quantity)=210` *НЕ совпадает* —
из-за overwrite-bug на upsert этапе.

→ Подтверждение наблюдения: `stockQty=412` (всего) > sum-БД=210 (per склад со срезом
по последнему техразмеру) — **математически согласуется** с overwrite-bug гипотезой.

### Predicted Outcome After Phase 16 Fix

После применения миграции (Pattern 1) + per-size upsert (Pattern 4):

- Котовск 6 строк: `(wbCardId=X, warehouseId=Y, techSize=46, qty=11)`,
  `(..., 48, 10)`, ..., `(..., 60, 10)`. Sum = 61. ✓
- При каждом sync: `quantity: incoming.quantity` без accumulation. ✓
- Clean-replace удаляет per-size rows которых нет в свежем snapshot. ✓
- Sum WbCardWarehouseStock per nmId = stockQty = SUM(API rows). ✓ (внутренняя
  консистентность)

### Diagnostic Wave 0 (recommended)

**Создать `scripts/wb-stocks-diagnose.js`** перед фиксом:
1. curl Statistics API за полный snapshot (как `wb-sync-stocks.js`).
2. Прочитать `WbCardWarehouseStock` для контрольных nmId.
3. Для каждого nmId × warehouseName:
   - Sum API rows (по всем techSize) → `apiTotal`
   - БД row qty → `dbTotal`
   - Diff → `apiTotal - dbTotal`
4. Вывести CSV: `nmId, warehouseName, apiTotal, dbTotal, diff, ratio` для всех
   несовпадений.
5. Цель: golden baseline ДО фикса. После Plan 16-06 (re-sync) повторить и убедиться
   что diff = 0.

---

## Runtime State Inventory

> Phase 16 НЕ rename/refactor, а **schema migration + sync-rewrite**, поэтому секция
> применима только частично.

| Категория | Items Found | Action Required |
|-----------|-------------|-----------------|
| **Stored data** | `WbCardWarehouseStock` rows (~50 nmId × N warehouses) — все обнулятся через DELETE WHERE techSize='' в миграции | Re-sync на VPS (Plan 16-06) — обязательно |
| **Live service config** | None — ничего вне репозитория не зависит от schema | None |
| **OS-registered state** | None | None |
| **Secrets/env vars** | `WB_API_TOKEN` (в /etc/zoiten.pro.env) — без изменений; scope Статистика (bit 6) уже есть | None — токен переиспользуется |
| **Build artifacts** | `node_modules/.prisma/client/index.d.ts` — будет обновлён `npx prisma generate` после schema change. На VPS — автоматически в `deploy.sh` | None (auto) |

---

## Common Pitfalls

### Pitfall 1: Compound NOT IN в Prisma deleteMany

**What goes wrong:** Prisma `deleteMany` НЕ поддерживает `NOT IN` по compound ключу.
Нельзя написать:
```typescript
deleteMany({ where: { wbCardId, NOT: { (warehouseId, techSize): { in: [...] }}}})
```

**Why it happens:** Prisma compiles to PG `WHERE NOT IN (...)` который тоже не работает
с tuple syntax в большинстве кейсов (требует `ROW(a,b) NOT IN ((a1,b1),(a2,b2),...)`).

**How to avoid:** Использовать **2-step pattern**:
1. `findMany` все existing rows для wbCardId, выбрать `id` тех которых нет в incoming.
2. `deleteMany({ where: { id: { in: [...] } } })`.

Или raw `tx.$executeRaw\`DELETE FROM ... WHERE (warehouseId, "techSize") NOT IN (...)\``,
но 2-step проще для тестов.

**Warning signs:** Тесты с compound NOT IN падают, или Prisma TypeScript error
«Property `(warehouseId, techSize)` does not exist».

### Pitfall 2: Migration DELETE на live проде

**What goes wrong:** Шаг `DELETE FROM "WbCardWarehouseStock" WHERE "techSize"=''` в
миграции стирает все existing данные. Если `deploy.sh` падает между миграцией и
автоматическим re-sync — проде данных нет, дашборд показывает «Нет данных».

**Why it happens:** Re-sync = manual step, не часть deploy.sh.

**How to avoid:**
- В `16-HUMAN-UAT.md` — явное предупреждение: «после deploy запустить
  `node scripts/wb-sync-stocks.js` ИЛИ нажать кнопку «Обновить из WB» в UI».
- Альтернатива: добавить в `deploy.sh` post-step `node scripts/wb-sync-stocks.js` —
  но это race с Statistics API rate limit (1 req/min) и может не успеть.
- **Решение:** UAT documentation + ручной trigger.

**Warning signs:** Кнопка «Обновить из WB» нажата, но `WbCardWarehouseStock` table пустая.

### Pitfall 3: techSize="0" (товар без размера)

**What goes wrong:** WB API возвращает `techSize: "0"` для одно-размерных товаров
(не `""`, не `null`). Hardcoded `techSize: ""` в DEFAULT клаузе миграции — корректно
только для legacy rows; свежие rows будут `"0"`.

**Why it happens:** Несовпадение defaults: миграция → `""`, API → `"0"`. Если в
sortSizes() считать `"0"` числом, это влияет на сортировку.

**How to avoid:**
- В `sortSizes()` явный handling для `"0"` и `""` — оба считаются «нет размера»,
  попадают в конец списка.
- В UI: если `card.hasMultipleSizes === false` (только 1 size, обычно `"0"`), скрывать
  размерную строку (locked в CONTEXT.md Claude's Discretion).

**Warning signs:** Ровно 1 размерная строка под каждым nmId в UI, всегда показывает
«↳ 0».

### Pitfall 4: Conflict between accumulation in JS-script and replace в API route

**What goes wrong:** До Phase 16 — два разных contract'a write-pat ка одной таблице.
После фикса — оба становятся `replace`. Если один файл не обновлён, проде имеем
смешанное состояние.

**Why it happens:** 2 entry points (JS скрипт vs HTTP route) и разные authors кода в
прошлом.

**How to avoid:**
- ВСЕ изменения в Plan 16-02 должны затрагивать оба файла. Один не обновлять без
  другого.
- Plan 16-02 verification: написать tests с тем же fixture для обоих файлов (или
  unit-test extracted helper).
- Лучше: extract write-логику в shared helper `lib/wb-stock-sync.ts:upsertStockSnapshot()`
  и оба места его вызывают.

**Warning signs:** Tests pass, но при ручном запуске `wb-sync-stocks.js` после
кнопки «Обновить из WB» данные получаются разные.

### Pitfall 5: Sticky cells overlap при размерных строках

**What goes wrong:** `StockWbTable` рендерит sticky `<TableCell rowSpan={rowSpan}>`
для Фото/Сводка/Иваново. Если `rowSpan` посчитан без учёта новых размерных строк
(и `showSizes=true`), HTML пересекается, render ломается.

**Why it happens:** Existing code: `const rowSpan = 1 + g.wbCards.length`.

**How to avoid:** Пересчитывать rowSpan в зависимости от `showSizes`:
```typescript
const totalSizeRows = showSizes
  ? g.wbCards.reduce((acc, c) =>
      acc + (c.hasMultipleSizes ? c.sizeBreakdown.length : 0), 0)
  : 0
const rowSpan = 1 + g.wbCards.length + totalSizeRows
```

**Warning signs:** При нажатии «По размерам» Фото/Сводка съёзживаются, или появляются
дубликаты sticky cells.

### Pitfall 6: Per-warehouse expanded view × размерная разбивка = column explosion

**What goes wrong:** Если кластер ЦФО развёрнут (5 складов × 4 cells = 20 columns)
И активна «По размерам» (8 размеров × 5 nmId = 40 размерных строк), таблица
становится 40+ строк × 130+ колонок. Layout shift, скролл лагает на mid-range
laptops.

**Why it happens:** Combinatorial scale.

**How to avoid:**
- Для v1 — без рестрикции (locked в CONTEXT.md B4 = full breakdown).
- В UAT-чеклисте Plan 16-06 — отдельный пункт «test perf на 50 nmId × 8 размеров ×
  все кластеры expanded».
- Future optimization (deferred): React.memo на размерную строку, virtualization
  через `@tanstack/virtual`.

**Warning signs:** При expand «Развернуть все» + «По размерам» страница freeze 2-3s,
скролл прыгает.

---

## Code Examples

Verified patterns from existing codebase (paths and line numbers checked 2026-04-22):

### Per-user Boolean toggle (паттерн quick 260422-oy5)

```typescript
// app/actions/stock-wb.ts — НОВЫЙ server action

const ShowSizesSchema = z.object({
  value: z.boolean(),
})

export async function saveStockWbShowSizes(value: boolean): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  await requireSection("STOCK")  // VIEW — это user preference

  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { ok: false, error: "Не авторизован" }

  const parsed = ShowSizesSchema.safeParse({ value })
  if (!parsed.success) return { ok: false, error: "Некорректные данные" }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { stockWbShowSizes: parsed.data.value },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "DB error" }
  }

  revalidatePath("/stock/wb")
  return { ok: true }
}
```

### Optimistic toggle button (паттерн `WarehouseVisibilityPopover`)

```tsx
// components/stock/StockWbTable.tsx — добавить после кнопки «Без СЦ»

const [showSizes, setShowSizes] = useState<boolean>(initialShowSizes)
const [isPending, startTransition] = useTransition()

function toggleShowSizes() {
  const next = !showSizes
  setShowSizes(next)  // optimistic
  startTransition(async () => {
    const res = await saveStockWbShowSizes(next)
    if (!res.ok) {
      console.error("Не удалось сохранить:", res.error)
      // Не откатываем — следующий revalidate синхронизирует
    }
  })
}

<Button
  variant={showSizes ? "default" : "outline"}
  size="sm"
  onClick={toggleShowSizes}
  disabled={isPending}
  title={showSizes ? "Свернуть размерные строки" : "Развернуть размерные строки"}
>
  По размерам
</Button>
```

### Sort sizes test (паттерн `tests/stock-math.test.ts`)

```typescript
// tests/stock-wb-size-sort.test.ts — НОВЫЙ
import { describe, it, expect } from "vitest"
import { sortSizes } from "@/lib/wb-clusters"

describe("sortSizes", () => {
  it("числовые: 60, 46, 48 → 46, 48, 60", () => {
    expect(sortSizes(["60", "46", "48"])).toEqual(["46", "48", "60"])
  })

  it("буквенные: XL, S, M, L → S, M, L, XL", () => {
    expect(sortSizes(["XL", "S", "M", "L"])).toEqual(["S", "M", "L", "XL"])
  })

  it("2XL, XL, 3XL → XL, 2XL, 3XL", () => {
    expect(sortSizes(["3XL", "XL", "2XL"])).toEqual(["XL", "2XL", "3XL"])
  })

  it("mixed (числа + буквы) → алфавитная", () => {
    expect(sortSizes(["46", "M", "S"])).toEqual(["46", "M", "S"])
  })

  it("пустые ('0' и '') в конце", () => {
    expect(sortSizes(["46", "0", "48"])).toEqual(["46", "48", "0"])
    expect(sortSizes(["S", "", "M"])).toEqual(["M", "S", ""])
  })
})
```

### Diagnostic скрипт (Wave 0)

```javascript
// scripts/wb-stocks-diagnose.js — НОВЫЙ standalone

const { execSync } = require("node:child_process")
const { PrismaClient } = require("@prisma/client")
const fs = require("node:fs")

const TOKEN = process.env.WB_API_TOKEN
const TARGET_NMIDS = [859398279, 901585883]  // контрольные nmId из CONTEXT.md

async function main() {
  // 1. Snapshot из API
  const cmd = `curl -sS -H "Authorization: ${TOKEN}" "https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=2019-06-20T00:00:00"`
  const raw = execSync(cmd, { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 })
  const apiRows = JSON.parse(raw).filter((r) => TARGET_NMIDS.includes(r.nmId))

  // 2. Aggregate per (nmId, warehouseName) — sum across techSizes
  const apiAgg = new Map()  // "nmId:warehouseName" → total
  for (const r of apiRows) {
    const key = `${r.nmId}:${r.warehouseName}`
    apiAgg.set(key, (apiAgg.get(key) ?? 0) + r.quantity)
  }

  // 3. Read DB
  const prisma = new PrismaClient()
  const dbRows = await prisma.wbCardWarehouseStock.findMany({
    where: { wbCard: { nmId: { in: TARGET_NMIDS } } },
    include: { wbCard: { select: { nmId: true } }, warehouse: { select: { name: true } } },
  })

  const dbAgg = new Map()
  for (const r of dbRows) {
    const key = `${r.wbCard.nmId}:${r.warehouse.name}`
    dbAgg.set(key, (dbAgg.get(key) ?? 0) + r.quantity)
  }

  // 4. Diff CSV
  const allKeys = new Set([...apiAgg.keys(), ...dbAgg.keys()])
  const csv = [["nmId", "warehouseName", "apiTotal", "dbTotal", "diff", "ratio"]]
  for (const key of allKeys) {
    const [nmId, warehouseName] = key.split(":")
    const apiTotal = apiAgg.get(key) ?? 0
    const dbTotal = dbAgg.get(key) ?? 0
    const diff = apiTotal - dbTotal
    const ratio = dbTotal > 0 ? (apiTotal / dbTotal).toFixed(2) : "—"
    if (diff !== 0) {
      csv.push([nmId, warehouseName, apiTotal, dbTotal, diff, ratio])
    }
  }

  fs.writeFileSync(
    `wb-stocks-diff-${new Date().toISOString().slice(0,10)}.csv`,
    csv.map((row) => row.join(",")).join("\n")
  )
  console.log(`Diff written: ${csv.length - 1} rows`)
  await prisma.$disconnect()
}

main().catch(console.error)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `WbCardWarehouseStock(wbCardId, warehouseId)` агрегат | `(wbCardId, warehouseId, techSize)` per-size rows | Phase 16 | Точность данных + новый функционал «По размерам» |
| `existing.quantity + qty` в JS-скрипте | Replace через upsert | Phase 16 | Bug fix accumulation |
| Upsert по 2-tuple в API route (overwrite на разных techSize) | Upsert по 3-tuple | Phase 16 | Bug fix overwrite |
| Sort sizes inline | `sortSizes()` helper | Phase 16 | Reusable + tested |
| `WbCard.stockQty` denorm (Phase 14) | Без изменений — продолжает корректно работать | — | None |

**Deprecated/outdated:**
- `fetchStocks()` в `lib/wb-api.ts` — `@deprecated` ещё с Phase 14, sunset 2026-06-23
  по плану `STOCK-FUT-09`. Phase 16 НЕ удаляет.

---

## Open Questions

1. **Что делать с существующими WbCardWarehouseStock rows (techSize='')?**
   - **What we know:** В CONTEXT.md решение — обязательный re-sync на VPS,
     старые записи затрутся.
   - **What's unclear:** Переход (deploy moment) — между миграцией и first sync —
     данных в таблице нет.
   - **Recommendation:** В Plan 16-01 миграция включает `DELETE FROM ... WHERE techSize=''`,
     в UAT-чеклисте Plan 16-06 — пункт «после deploy запустить `node scripts/wb-sync-stocks.js`
     OR кнопку «Обновить из WB»». Окно отсутствия данных ~30 секунд (1 sync).

2. **Sticky cells overlap при per-cluster expanded × per-size showSizes — corner case**
   - **What we know:** Layout pattern Phase 14 работает; per-size это новый layer.
   - **What's unclear:** При expand всех кластеров + showSizes ON, sticky левые 4 columns
     (Фото/Сводка/Артикул/Иваново) визуально остаются sticky? `top-0` с rowSpan?
   - **Recommendation:** Plan 16-04 (UI) — manual UAT на dev VPS с реальными
     данными, fix layout в случае проблем.

3. **One-size товары: показывать ли размерную строку?**
   - **What we know:** Locked в CONTEXT.md Claude's Discretion: «скрывать»
     (избегаем дублирования).
   - **What's unclear:** Critērium — `sizes.size > 1` в data layer (после dedupe
     techSize) или count размерных rows по quantity > 0?
   - **Recommendation:** В `lib/stock-wb-data.ts` — `hasMultipleSizes = uniqueTechSizes.size > 1`.
     Если 1 size, `sizeBreakdown = []`.

4. **Per-cluster агрегат для размерной row при `hideSc` ON: include / exclude СЦ?**
   - **What we know:** Locked default-гипотеза: «по всем складам».
   - **What's unclear:** Семантика расходится с per-nmId row, где collapsed cluster
     показывает sum по ВСЕМ складам (inc. СЦ), а expanded — только видимым?
   - **Recommendation:** Документировать в `16-UI-SPEC.md`: размерные cluster
     агрегаты считаются ИДЕНТИЧНО per-nmId агрегатам (= по всем складам). При expanded
     view размерные ячейки складов следуют per-warehouse фильтру (как и per-nmId row).

5. **Plan чейник? — рекомендуемая структура**
   - 16-01: Schema migration + Prisma client regen (+ заглушки в типах)
   - 16-02: Sync fix — `lib/wb-api.ts` typed extension + `app/api/wb-sync/route.ts` +
     `scripts/wb-sync-stocks.js`. Тесты `wb-stocks-per-warehouse.test.ts` обновляются.
   - 16-03: data layer — `lib/stock-wb-data.ts` + `WbStockSizeRow` + `sortSizes()` +
     `tests/stock-wb-size-sort.test.ts`.
   - 16-04: server action `saveStockWbShowSizes` + RSC page integration +
     prop drilling.
   - 16-05: UI — кнопка «По размерам» + размерные строки в `StockWbTable.tsx`.
   - 16-06: deploy + re-sync + UAT (контрольные nmId, sticky-table перф, persist).

6. **Wave 0 (diagnostic)?** — рекомендую да:
   - Запустить `scripts/wb-stocks-diagnose.js` ДО фикса → CSV до-fix
   - После Plan 16-06 — повторить → CSV после-fix
   - Diff = 0 для всех рядов = success criterion. Это объективное доказательство
     для UAT.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL 16 | БД (на VPS) | ✓ (на VPS) | 16 | — |
| `@prisma/client` | Prisma generate после schema change | ✓ | 6.19.3 | — |
| `prisma` CLI | migrate deploy | ✓ | 6.19.3 | — |
| Node.js | scripts | ✓ | runtime | — |
| `vitest` | Тесты | ✓ | 4.1.4 | — |
| `WB_API_TOKEN` (scope Статистика bit 6) | curl Statistics API | ✓ | live | — (без него ничего не работает) |
| `curl` | scripts/wb-sync-stocks.js + diagnose | ✓ (VPS Linux) | system | Node.js fetch (не блокируется WB Statistics API) |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — все present.

---

## Validation Architecture

> Phase 16 включает Validation Architecture (config.json: `nyquist_validation: true`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | `vitest.config.ts` (alias `@` → корень) |
| Quick run command | `npm run test -- tests/wb-stocks-per-warehouse.test.ts` (per file) |
| Full suite command | `npm run test` (= `vitest run`, ~10s suite) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| STOCK-30 | Diagnostic script — runs end-to-end и пишет CSV | manual-only | `node scripts/wb-stocks-diagnose.js` | ❌ Wave 0 (создать) |
| STOCK-31 | Migration applies cleanly | manual+CI | `npx prisma migrate deploy && npx prisma validate` | manual UAT Plan 16-06 |
| STOCK-32 | `WarehouseStockItem` includes techSize/barcode | unit | `npm run test -- tests/wb-stocks-per-warehouse.test.ts` | ✅ existing (extend) |
| STOCK-32 | `OrdersWarehouseStats.perWarehouseSize` populated | unit | `npm run test -- tests/wb-orders-per-warehouse.test.ts` | ✅ existing (extend) |
| STOCK-33 | upsert per-size в API route — replace, не accumulate | unit (new) | `npm run test -- tests/wb-sync-route.test.ts` | ❌ Wave 0 (создать) |
| STOCK-33 | scripts/wb-sync-stocks.js — replace, не accumulate | smoke (manual run) | `node scripts/wb-sync-stocks.js && node scripts/wb-stocks-diagnose.js` | manual UAT Plan 16-06 |
| STOCK-34 | `lib/stock-wb-data.ts` — sizeBreakdown populated correctly | unit | `npm run test -- tests/stock-wb-data.test.ts` | ❌ Wave 0 (создать) |
| STOCK-34 | `sortSizes` numeric/letter/mixed/empty | unit | `npm run test -- tests/stock-wb-size-sort.test.ts` | ❌ Wave 0 (создать) |
| STOCK-35 | `saveStockWbShowSizes` action — RBAC + persist | unit | `npm run test -- tests/stock-wb-actions.test.ts` | ❌ Wave 0 (создать) |
| STOCK-36 | UI: кнопка переключает все размерные строки, persist в БД | manual UAT | (browser) | manual Plan 16-06 |
| STOCK-36 | Sticky cells не ломаются при showSizes ON | manual UAT | (browser, page scroll) | manual Plan 16-06 |
| STOCK-37 | Контрольные nmId 859398279, 901585883 — sum размеров = stockQty | manual UAT + diagnostic | `node scripts/wb-stocks-diagnose.js` после re-sync, diff = 0 | manual Plan 16-06 |

### Sampling Rate

- **Per task commit:** `npm run test -- <changed-file>.test.ts` (~1-3s)
- **Per wave merge:** `npm run test` (~10s, ~30 test files)
- **Phase gate:** Full suite green + manual UAT chefklist passed before
  `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] **`scripts/wb-stocks-diagnose.js`** — diagnostic, golden baseline
      (применимо к STOCK-30, STOCK-37)
- [ ] **`tests/stock-wb-size-sort.test.ts`** — covers `sortSizes` (STOCK-34)
- [ ] **`tests/stock-wb-data.test.ts`** — covers data layer expansion (STOCK-34)
- [ ] **`tests/wb-sync-route.test.ts`** — covers per-size upsert / clean-replace
      (STOCK-33). Может быть challenging из-за Prisma mock — рассмотреть
      pure-extracted helper `lib/wb-stock-sync.ts:upsertStockSnapshot()` вместо
      mocking всего Route handler.
- [ ] **`tests/stock-wb-actions.test.ts`** — covers `saveStockWbShowSizes`
      (STOCK-35). Pattern `tests/stock-actions.test.ts` (existing) reused.
- [ ] **Extend `tests/wb-stocks-per-warehouse.test.ts`** — assert `techSize` and
      `barcode` propagated в `WarehouseStockItem` (STOCK-32).
- [ ] **Extend `tests/wb-orders-per-warehouse.test.ts`** — fixture с techSize,
      assert `perWarehouseSize` Map populated (STOCK-32).

---

## 6 Plans Draft (input для planner)

### Plan 16-01: Schema migration + Prisma client regen
- **Цель:** Расширить `WbCardWarehouseStock` с `techSize`, добавить
  `User.stockWbShowSizes`, выполнить DELETE legacy rows. Обновить Prisma schema +
  manual SQL миграция. Тип-чекинг новой формы compound key.
- **Files modified:**
  - `prisma/schema.prisma` (NEW: `techSize String @default("")` в WbCardWarehouseStock,
    new unique tuple, NEW: `User.stockWbShowSizes Boolean @default(false)`)
  - `prisma/migrations/20260423_phase16_size_breakdown/migration.sql` (NEW)
- **Тесты:** None (миграционный шаг). Verify через `npx prisma validate` + локально
  (если local PG поднята) или через test deploy на VPS staging.
- **Wave 0 task:** Создать `scripts/wb-stocks-diagnose.js`, прогнать ДО миграции,
  сохранить CSV как baseline.

### Plan 16-02: Sync — typed API extension + per-size upsert
- **Цель:** Расширить `WarehouseStockItem` полем `techSize` + `barcode`. В обоих
  путях sync (API route + JS-скрипт) перейти на per-size upsert с replace.
  Clean-replace учитывает 3-tuple.
- **Files modified:**
  - `lib/wb-api.ts` (extend `WarehouseStockItem`, `OrdersWarehouseStats.perWarehouseSize`)
  - `app/api/wb-sync/route.ts` (per-size upsert + 2-step clean-replace)
  - `scripts/wb-sync-stocks.js` (replace вместо accumulate + per-size keys)
  - `tests/wb-stocks-per-warehouse.test.ts` (extend)
  - `tests/wb-orders-per-warehouse.test.ts` (extend)
- **Тесты:** Unit для расширенного API parsing. Helper `upsertStockSnapshot()`
  extracted в `lib/wb-stock-sync.ts` чтобы тестировать без mock Prisma.

### Plan 16-03: Data layer + sortSizes helper
- **Цель:** Расширить `lib/stock-wb-data.ts` для агрегации per-size с теми же
  cluster aggregates. Создать `sortSizes()` в `lib/wb-clusters.ts`.
- **Files modified:**
  - `lib/stock-wb-data.ts` (add `WbStockSizeRow`, `sizeBreakdown` field, agg logic
    с `Map<size, ...>`)
  - `lib/wb-clusters.ts` (export `sortSizes`)
  - `tests/stock-wb-size-sort.test.ts` (NEW)
  - `tests/stock-wb-data.test.ts` (NEW — verify shape)
- **Тесты:** Pure unit, no DB. Mock Prisma return shape, verify `sizeBreakdown`
  populated correctly с numeric/letter/mixed sizes.

### Plan 16-04: Server action + RSC page integration
- **Цель:** Server action `saveStockWbShowSizes`, RSC чтение `User.stockWbShowSizes`,
  prop drilling в `StockWbTable`.
- **Files modified:**
  - `app/actions/stock-wb.ts` (add `saveStockWbShowSizes` action)
  - `app/(dashboard)/stock/wb/page.tsx` (read `stockWbShowSizes`, передать prop)
  - `components/stock/StockWbTable.tsx` (accept new prop `initialShowSizes`)
  - `tests/stock-wb-actions.test.ts` (NEW)
- **Тесты:** Unit с mocked auth + Prisma — паттерн existing `stock-actions.test.ts`.

### Plan 16-05: UI — кнопка «По размерам» + размерные строки
- **Цель:** В `StockWbTable.tsx` добавить кнопку toggle, рендер размерных строк
  под per-nmId row (когда showSizes && hasMultipleSizes), пересчёт rowSpan для
  sticky cells.
- **Files modified:**
  - `components/stock/StockWbTable.tsx` (toggle button + размерные строки + rowSpan)
  - (Опционально) `components/stock/StockWbTable.tsx` — split на меньшие
    компоненты если файл становится слишком большим
- **Тесты:** Manual UAT — automated UI tests не реализованы в проекте на этом
  слое, только E2E manual.

### Plan 16-06: Deploy + re-sync + UAT
- **Цель:** Deploy на VPS, применить миграцию, запустить re-sync (script или
  кнопка), HUMAN UAT по 16-HUMAN-UAT.md, повторный diagnostic CSV для verification.
- **Files modified:**
  - `.planning/phases/16-wb-stock-sizes/16-HUMAN-UAT.md` (NEW)
- **UAT chefklist:** 9 пунктов:
  1. `/stock/wb` открывается без ошибок
  2. Кнопка «По размерам» видна, переключается, persist между сессиями
  3. nmId 859398279 (Брюки) — sum размеров = stockQty (412)
  4. nmId 859398279 Котовск — 6 размерных строк {46:11, 48:10, 50:10, 54:10, 58:10, 60:10}
  5. Развёрнутый кластер ЦФО — per-warehouse columns показывают per-size split
  6. Per-cluster агрегаты не зависят от hideSc / hidden warehouses (visual filter only)
  7. Размерные строки скрываются для nmId с одним размером
  8. Sticky cells (Фото/Сводка/Артикул/Иваново) не пересекаются при
     showSizes + expand-all
  9. `node scripts/wb-stocks-diagnose.js` после re-sync — `diff = 0` для всех rows
     контрольных nmId

---

## Sources

### Primary (HIGH confidence)

- **Existing codebase verified 2026-04-22:**
  - `prisma/schema.prisma` lines 805-818 — current `WbCardWarehouseStock` schema
  - `lib/wb-api.ts` lines 768-846 — `fetchStocksPerWarehouse` + `WarehouseStockItem`
  - `lib/wb-api.ts` lines 876-960 — `fetchOrdersPerWarehouse` + `OrdersWarehouseStats`
  - `scripts/wb-sync-stocks.js` lines 106-122 — accumulation bug confirmed
  - `app/api/wb-sync/route.ts` lines 238-253 — overwrite bug confirmed
  - `tests/wb-stocks-per-warehouse.test.ts` line 60 — fixture с `techSize: "0"` →
    подтверждение что API возвращает поле
  - `prisma/migrations/20260422_add_user_stock_wb_hidden_warehouses/migration.sql` —
    pattern для `User.stockWbShowSizes`
  - `app/actions/stock-wb.ts` — pattern для `saveStockWbShowSizes`
  - `components/stock/WarehouseVisibilityPopover.tsx` — pattern для optimistic toggle
  - `lib/stock-math.ts` — `calculateStockMetrics` (used as-is для размерных)
  - `lib/wb-clusters.ts` — место для `sortSizes` helper
  - `tests/stock-math.test.ts`, `tests/wb-stocks-per-warehouse.test.ts` —
    test patterns

### Secondary (MEDIUM confidence)

- WB API documentation references through web search:
  - [WB API — Statistics endpoints (suppliers, orders, stocks)](https://openapi.wildberries.ru/statistics/api/en/)
  - [WB API — Main Reports / OpenAPI](https://dev.wildberries.ru/en/docs/openapi/reports)
  - Web search confirmed: `/api/v1/supplier/orders` returns `techSize`, `barcode`,
    `nmId`, `warehouseName`, `isCancel`, `date`, `Price`, etc.
  - `/api/v1/supplier/stocks` returns same plus `inWayToClient`, `inWayFromClient`,
    `quantityFull`.

### Tertiary (LOW confidence)

- None — все ключевые claims подтверждены либо кодом проекта (HIGH), либо public
  WB API docs (MEDIUM).

---

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — все из package.json verified.
- **Architecture:** HIGH — все patterns из existing codebase Phase 14/15/quick.
- **Sync bug forensics:** HIGH — оба бага reproduced trace-step by trace-step
  через анализ кода, sources цитированы с line numbers.
- **WB API techSize/barcode availability:** HIGH — fixture в codebase + WB public
  API docs.
- **UI scaling concerns:** MEDIUM — нет measurement perf при 50 nmId × 8 sizes,
  manual UAT в Plan 16-06.
- **Data migration safety (DELETE WHERE techSize=''):** MEDIUM — паттерн
  устоявшийся (re-sync после schema change), но окно ~30s без данных требует UAT
  внимания.

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (30 days — Phase 16 stable, не fast-moving)

Sources:
- [WB API — Statistics (English)](https://openapi.wildberries.ru/statistics/api/en/)
- [WB API — Main Reports OpenAPI](https://dev.wildberries.ru/en/docs/openapi/reports)
- [WB API — Sales Funnel / Analytics](https://dev.wildberries.ru/en/docs/openapi/analytics)
- [Wildberries Swagger UI (suppliers-api)](https://suppliers-api.wildberries.ru/swagger/index.html)
