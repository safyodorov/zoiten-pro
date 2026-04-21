# Stack Research — Milestone v1.2 «Управление остатками»

**Domain:** Stock management section в существующем Next.js ERP (агрегированные таблицы с expandable rows + Excel import + per-warehouse WB stocks)
**Researched:** 2026-04-21
**Confidence:** HIGH (по существующему стеку) / MEDIUM (по WB warehouses dictionary — требует ручной верификации через seller.wildberries.ru)

## TL;DR — Для нетерпеливых

**НЕ НУЖНЫ новые зависимости.** Всё строится на существующем стеке. Ключевые архитектурные решения:

1. **Expandable rows** — `useState<Set<string>>` на уровне таблицы (не TanStack Table). Объём данных мизерный (~50-200 товаров × 7 кластеров × 5-10 складов), виртуализация не нужна.
2. **Sticky colgroup headers** — двухуровневый `<thead>` с `position: sticky; top: 0` на внешнем ряду + `top: h-of-outer-row` на внутреннем. `colSpan` для группировки. Без `<colgroup>` (он почти ничего не стилизует).
3. **Excel import** — переиспользуем `xlsx@0.18.5` + pattern из `lib/parse-auto-promo-excel.ts`. Валидация через Zod (уже в стеке) + preview через RSC-рендер.
4. **WB warehouses dictionary** — **НЕ Playwright, НЕ cheerio**. Одноразовый seed-скрипт (`prisma/seed-wb-warehouses.ts`) с hardcoded массивом, собранным вручную через DevTools Network tab на seller.wildberries.ru. Данные стабильны, обновление < 1 раз в год.
5. **Tooltip** — существующий shadcn `<Tooltip>` (был добавлен в Phase 7 для `PromoTooltip`). Ничего нового.

## Что переиспользуется (полный список)

| Технология | Версия | Как используется в v1.2 |
|------------|--------|-------------------------|
| Next.js App Router | 15.5.14 | `/stock`, `/stock/wb`, `/stock/ozon`, API routes `/api/stock-ivanovo-upload`, `/api/wb-warehouses-sync` |
| Prisma + PostgreSQL | 6.19.3 / 16 | Новые таблицы `WbWarehouse`, `WbCardWarehouseStock` + поля `Product.ivanovoStock`, `Product.productionStock`, `Product.ivanovoStockUpdatedAt` |
| shadcn/ui v4 (base-nova) + Tailwind v4 | 4.1.2 / 4.2.2 | Table, Tooltip, Dialog (preview Excel), Button, Input — всё уже есть |
| Auth.js v5 + `requireSection()` | 5.0.0-beta.30 | RBAC: `STOCK` секция, VIEW для read, MANAGE для Excel upload + ручной ввод производства |
| **xlsx** (SheetJS Community) | 0.18.5 | Парсинг Excel склада Иваново, **тот же pattern что `parse-auto-promo-excel.ts`** |
| **Zod** | 4.3.6 | Валидация распарсенных строк Excel + body ручного ввода производства + AppSetting `stock.turnoverNormDays` (1..100) |
| **react-hook-form** + **@hookform/resolvers** | 7.72.1 / 5.2.2 | Форма ручного ввода производства (inline в `/stock`), форма редактирования «Норма оборачиваемости» в шапке |
| **sonner** | 2.0.7 | Toast при успешном импорте Excel, при ошибках парсинга, при update нормы |
| **AppSetting** KV таблица (Phase 7) | — | Новый ключ `stock.turnoverNormDays` (int, default 37). Pattern уже отлажен. |
| **lucide-react** | 1.7.0 | ChevronRight/ChevronDown для expand-toggle, Warehouse/Package/Factory иконки |
| **motion** 12.x | 12.38.0 | Опционально: AnimatePresence для expand/collapse anim (`height: auto`). Можно обойтись CSS `transition-all`. |
| **vitest** | 4.1.4 | Юнит-тесты формул О/З/Об/Д (pure functions), тест парсера Excel Иваново (аналогично `excel-auto-promo.test.ts`) |
| next-themes | 0.4.6 | Уже есть, не трогаем |

## Supporting Libraries — что НЕ добавляем (и почему)

### ❌ TanStack Table v8 (`@tanstack/react-table`)

**Последняя стабильная:** 8.21.3 (React 19 compatible per [npm `@tanstack/react-table`](https://www.npmjs.com/package/@tanstack/react-table)).

**Почему не нужна:**
- Данные: ~50-200 товаров × ~2-5 артикулов = max ~1000 non-expanded rows. Expanded до ~3500 rows. `useMemo` + нативный render справляются.
- Expansion через `getExpandedRowModel` — overkill для одной таблицы с фиксированной иерархией (товар → артикул; WB: nmId → кластер → склад).
- Нет фильтрации/сортировки/pagination требований в milestone (см. `.planning/PROJECT.md` строки 7-14).
- Phase 7 таблица `PriceCalculatorTable` построена на чистом HTML + `rowSpan` и работает отлично ([`PriceCalculatorTable`](https://tanstack.com/table/v8/docs/guide/expanding) paradigm не применяется).
- **Риск:** React Compiler + React 19 + TanStack Table имеют reported issues ([GitHub issue #5567](https://github.com/TanStack/table/issues/5567)) — добавление сейчас = потенциальный долг.

**Когда добавлять (backlog trigger):** если в v1.3+ появятся серверные фильтры, колонки-by-user, sort-by-multiple-columns одновременно. Тогда миграция оправдана.

### ❌ TanStack Virtual (`@tanstack/react-virtual`)

**Почему не нужна:** ассортимент 50-200 товаров (констрейнт из PROJECT.md). Даже полностью развёрнутый `/stock/wb` = ~3500 rows, что нативный DOM держит.

### ❌ Playwright / Puppeteer / cheerio для скрапинга seller.wildberries.ru

**Вердикт:** **НЕ используем.** Одноразовая задача → хардкодим результат.

**Обоснование:**
1. Seller.wildberries.ru требует авторизации → cookie-скрапинг хрупкий.
2. Справочник WB warehouses → кластеров **стабилен** (7 региональных кластеров: ЦФО, ЮГ, Урал, ПФО, СЗО, СФО, Прочие; изменения ≤ 1 раз в год по истории WB).
3. WB **НЕ предоставляет** официального endpoint для directory of warehouses с cluster mapping. Verified через [WB Analytics API docs](https://dev.wildberries.ru/en/docs/openapi/analytics): warehouseName и regionName доступны только nested в stock-report, требуют nmIds filter → не годится для reference.
4. **Workflow:** sergey.fyodorov открывает seller.wildberries.ru → страница «Склады WB» (или DevTools Network tab ловит JSON ответ внутреннего endpoint) → копирует JSON → вставляет в `prisma/seed-wb-warehouses.ts` как hardcoded array → `npm run db:seed` или точечный `npx tsx prisma/seed-wb-warehouses.ts`.
5. Плюс: у нас **уже появляются** новые warehouseId в `/api/wb-sync` через Statistics API `/api/v1/supplier/stocks` (`WbCardWarehouseStock.warehouseId`) — в API route добавляем auto-detection «unknown warehouseId» → лог в консоль «обновите справочник».

**Если WB однажды введёт API** `GET /api/v1/warehouses` с cluster mapping → мигрируем на API sync в отдельном milestone. Пока — manual seed.

### ❌ react-spreadsheet-import / react-xls / read-excel-file

**Почему не нужны:**
- Наш use-case = **один файл**, **известный формат** (УКТ в колонке A, остаток в колонке B, возможно ещё 1-2 метаколонки).
- `parse-auto-promo-excel.ts` уже pattern-established: `XLSX.read(buf) → sheet_to_json({header:1}) → для каждой строки validate + map`. Копируем 1-в-1.
- Auto-mapping колонок (фича RSI) не нужна — формат фиксирован.
- Chakra UI dependency у react-spreadsheet-import = конфликт со shadcn.

### ❌ Отдельный TreeView компонент (`react-arborist`, `react-complex-tree`, MUI TreeView)

**Почему не нужен:** иерархия у нас строго 2-уровневая (кластер → склад внутри `/stock/wb`) и 1-уровневая expand (товар → артикулы в `/stock`). Это **row-level toggle**, не tree. Полноценный TreeView предполагает N-уровней, drag, keyboard-nav, aria-tree — у нас ничего этого не надо.

## Детальные ответы на вопросы downstream

### 1. Expandable/collapsible table rows — pattern

**Решение:** простой `useState<Set<string>>` на уровне клиентского компонента таблицы.

```tsx
"use client"
export function StockWbTable({ data }: { data: WbStockRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  // key = `${nmId}:${clusterShort}` для кластер-строки
  // Render cluster row + if expanded → render warehouse rows
}
```

**Плюсы:**
- Ноль зависимостей.
- Persist опционально через `localStorage` (pattern уже в `Sidebar` — `zoiten.sidebar.collapsed`), если нужно.
- SSR-friendly (default state = empty Set, expand только после hydration).

**Минусы:**
- Ручной toggle-UI (ChevronRight ↔ ChevronDown), но это 1 иконка из lucide-react.

### 2. Sticky colgroup headers — группы колонок РФ/Иваново/Производство/МП/WB/Ozon

**Решение:** двухуровневый `<thead>` + sticky на обоих уровнях. `<colgroup>` **не используем** (MDN: только background стилизуется → не наш случай).

```tsx
<div className="relative overflow-auto max-h-[calc(100vh-200px)]">
  <table className="w-full border-collapse">
    <thead>
      <tr className="sticky top-0 z-20 bg-background">
        <th rowSpan={2} className="sticky left-0 z-30">Товар</th>
        <th colSpan={4} className="border-b">РФ</th>
        <th colSpan={4} className="border-b">Иваново</th>
        <th colSpan={4}>Производство</th>
        {/* ... */}
      </tr>
      <tr className="sticky top-[40px] z-20 bg-background">
        <th>О</th><th>З</th><th>Об</th><th>Д</th>
        <th>О</th><th>З</th><th>Об</th><th>Д</th>
        {/* ... */}
      </tr>
    </thead>
    <tbody>{/* ... */}</tbody>
  </table>
</div>
```

**Критические детали:**
- **Обязательно** `overflow-auto` или `overflow-scroll` на родителе (иначе sticky не работает).
- `top-[40px]` для второй строки = фактическая высота первой (делаем через `h-10` = 40px).
- `z-20`/`z-30` — вторая строка шапки должна быть выше body, фиксированная колонка (товар) выше всех.
- `bg-background` (из shadcn theme tokens) — **без фона прозрачные sticky клетки не работают** (body просвечивает).
- Для Safari: `-webkit-sticky` уже не нужен (Safari 15+).
- Для «клей» между ячейками при sticky (тонкие просветы): `border-collapse: separate; border-spacing: 0;` + `box-shadow: inset 0 -1px 0 border` ([Noah Bieler Next.js+Tailwind approach](https://www.noahbieler.com/blog/sticky-table-headers-and-popovers-with-nextjs-and-tailwind-css)).

**Existing pattern в проекте:** `PriceCalculatorTable` (Phase 7) уже делает sticky columns + rowSpan — смотрим туда как reference.

### 3. Excel import — validation + preview pattern

**Решение:** трёхэтапный flow.

**Этап 1 — парсинг (серверный action):**
```ts
// lib/parse-ivanovo-stock-excel.ts (копируем pattern parse-auto-promo-excel.ts)
import * as XLSX from "xlsx"
import { z } from "zod"

const RowSchema = z.object({
  sku: z.string().regex(/^УКТ-\d{6}$/),
  qty: z.number().int().min(0).max(99999),
})

export function parseIvanovoStockExcel(buf: Buffer) {
  const wb = XLSX.read(buf, { type: "buffer" })
  const sheet = wb.Sheets[wb.SheetNames[0]!]!
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: null })

  const parsed: { sku: string; qty: number }[] = []
  const errors: { rowIndex: number; error: string }[] = []

  for (let i = 1; i < rows.length; i++) { // skip header
    const row = rows[i]!
    const result = RowSchema.safeParse({ sku: String(row[0]).trim(), qty: Number(row[1]) })
    if (result.success) parsed.push(result.data)
    else errors.push({ rowIndex: i + 1, error: result.error.issues[0]?.message ?? "unknown" })
  }
  return { parsed, errors }
}
```

**Этап 2 — preview (RSC + Dialog):**
- User загружает файл → API route сохраняет в temp (или in-memory) → возвращает `{ parsed, errors, toBeUpdated: [{sku, oldQty, newQty, productId}] }`.
- Dialog показывает таблицу diff: какие товары обновятся, какие УКТ не найдены в Product table (warnings), какие строки с ошибками (errors).
- **Кнопка «Импортировать»** → второй POST с тем же файлом (или hash из первого) → реально обновляет `Product.ivanovoStock`.

**Этап 3 — persist:** transaction update в Prisma по sku → `Product.ivanovoStock` + `Product.ivanovoStockUpdatedAt = new Date()`. Revalidate `/stock`.

**Почему не используем react-spreadsheet-import:** наш формат фиксирован, нет auto-mapping задачи, Chakra UI dep-конфликт.

### 4. Tooltip для сокращений (ЦФО → Центральный)

**Решение:** существующий shadcn `<Tooltip>` + pattern из [`PromoTooltip`](C:\Claude\zoiten-pro\components\prices\promo-tooltip.tsx) (Phase 7).

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <span className="cursor-help underline decoration-dotted underline-offset-2">ЦФО</span>
  </TooltipTrigger>
  <TooltipContent>Центральный федеральный округ</TooltipContent>
</Tooltip>
```

**Расширение:** создать `components/stock/cluster-tooltip.tsx` wrapper со статической map:
```ts
const CLUSTER_FULL_NAMES = {
  ЦФО: "Центральный федеральный округ",
  ЮГ: "Южный федеральный округ",
  Урал: "Уральский федеральный округ",
  ПФО: "Приволжский федеральный округ",
  СЗО: "Северо-Западный федеральный округ",
  СФО: "Сибирский федеральный округ",
  Прочие: "Остальные регионы (ДФО, СКФО и другие)",
}
```

Ничего нового устанавливать не нужно.

### 5. Скрапинг справочника WB складов — **вердикт: НЕ скрапим**

**Выбрано:** manual seed с однократным сбором через DevTools.

**Procedure (документировать в `prisma/seed-wb-warehouses.ts` как комментарий):**
1. Открыть seller.wildberries.ru → раздел «Склады» (или «Аналитика → Оборачиваемость по складам», где WB показывает matrix).
2. DevTools → Network → Filter: Fetch/XHR → перезагрузить страницу → найти JSON ответ со списком складов.
3. Скопировать response JSON → распарсить локально → сгенерировать hardcoded array для seed.
4. Если JSON недоступен — скопировать из UI таблицу (Ctrl+A на таблице → parse глазами / через Excel).

**Почему не Playwright:**
- Установка Playwright ~300MB (браузеры) — раздувает CI и VPS.
- Требует non-headless сессии с auth cookies → хрупко, cookie ротируется.
- Задача одноразовая.

**Почему не cheerio + fetch:**
- Seller.wildberries.ru — SPA (React-based), основной HTML пустой, данные через XHR.
- cheerio не умеет выполнять JS → не поможет.

**Fallback в коде:** `/api/wb-sync` (Statistics API) **уже** получает warehouseId для каждого stock. При записи `WbCardWarehouseStock` делаем:
```ts
const known = await prisma.wbWarehouse.findUnique({ where: { id: warehouseId } })
if (!known) console.warn(`Unknown warehouseId ${warehouseId} (${warehouseName}) — update seed`)
```
Это гарантирует, что новые склады не теряются даже при устаревшем seed.

### 6. Новые зависимости — НЕТ

**Полный ответ:** **не добавляем ни одной новой dependency.** Весь милстоун закрывается существующим стеком + pattern-reuse из Phase 7 и quick tasks.

## Installation

```bash
# Ничего устанавливать не нужно. Milestone v1.2 = pure code на существующих деп-ях.
```

Единственное изменение `package.json` — **нет**.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `useState<Set<string>>` для expansion | TanStack Table `getExpandedRowModel` | Когда появится сортировка по множественным колонкам + server-side pagination (v1.3+) |
| Native HTML `<table>` + `colSpan`+`rowSpan` | TanStack Table headless | Если понадобятся per-column resize, column order persist, CSV export — в отдельном milestone |
| Manual seed для WB warehouses | Playwright-скрапер | Никогда — WB может дать официальный endpoint, тогда API sync |
| Manual seed для WB warehouses | Cheerio + fetch | Никогда — SPA не парсится без JS runtime |
| `xlsx` + Zod + custom preview | react-spreadsheet-import | Если у нас будет многоформатный импорт с user-defined column mapping (не планируется) |
| CSS `position: sticky` headers | JS-virtualized table | При 10К+ rows (у нас max 3500) |
| shadcn Tooltip | radix-ui напрямую | Никогда — shadcn wrapper уже оптимизирован под наш theme |
| motion `AnimatePresence` для expand | Чистый CSS `transition-all` + `grid-template-rows: 0fr → 1fr` трюк | Когда animation overhead критичен (у нас не критичен) |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@tanstack/react-table` | Overkill для 1000 rows без сортировки/фильтров + React Compiler issues ([#5567](https://github.com/TanStack/table/issues/5567)) | `useState<Set>` + native HTML table |
| `@tanstack/react-virtual` | Объём данных не требует виртуализации | Native DOM render |
| `react-spreadsheet-import` | Chakra UI dep-конфликт со shadcn, auto-mapping не нужен | Существующий `xlsx` pattern + Zod |
| Playwright для WB скрапинга | Requires auth cookies + 300MB deps + хрупко | Manual seed через DevTools → hardcoded array |
| `<colgroup>` для sticky стилизации | MDN: почти ничего не стилизуется (только background-*) | Обычный `<thead>` с двумя `<tr>` + `colSpan` |
| `react-complex-tree` / `react-arborist` | 2-уровневая иерархия не нужно полноценного дерева | Row-local `useState<Set>` |
| Node.js `fetch()` для card.wb.ru / WB warehouses внутренних endpoints | TLS fingerprint блокировка (уже выученный урок из `wb-api.ts`) | `execSync('curl ...')` если всё-таки будем что-то дёргать (но мы не будем) |

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| xlsx@0.18.5 | Node.js 18+ / Next.js 15 | Community Edition, SheetJS. **Важно:** `https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz` — если когда-то понадобится Pro edition, но для наших нужд 0.18.5 достаточно. |
| zod@4.3.6 | react-hook-form@7.72.1 + @hookform/resolvers@5.2.2 | ✅ уже работает в Phase 7 |
| motion@12.38.0 | React 19 | ✅ (motion = rebrand framer-motion, v12 React-19-ready) |
| shadcn@4.1.2 Tooltip | @base-ui/react@1.3.0 | ✅ используется в `PromoTooltip` |
| Prisma 6.19.3 | PostgreSQL 16 | ✅ |

## Новые модели Prisma (для Roadmap-consumer)

Перечислены здесь, чтобы gsd-roadmapper знал объём миграций:

```prisma
// prisma/schema.prisma — дополнения

model WbWarehouse {
  id              Int      @id                    // warehouseId из WB API
  name            String                          // "Коледино", "Тула", "Краснодар"
  cluster         String                          // "Центральный федеральный округ"
  shortCluster    String                          // "ЦФО" | "ЮГ" | "Урал" | "ПФО" | "СЗО" | "СФО" | "Прочие"
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  stocks          WbCardWarehouseStock[]

  @@index([shortCluster])
}

model WbCardWarehouseStock {
  id          Int      @id @default(autoincrement())
  wbCardId    Int
  warehouseId Int
  quantity    Int
  updatedAt   DateTime @updatedAt
  wbCard      WbCard      @relation(fields: [wbCardId], references: [nmId], onDelete: Cascade)
  warehouse   WbWarehouse @relation(fields: [warehouseId], references: [id])

  @@unique([wbCardId, warehouseId])
  @@index([warehouseId])
}

// Дополнения в Product:
model Product {
  // ... existing fields
  ivanovoStock           Int?      // остаток склада Иваново (из Excel)
  ivanovoStockUpdatedAt  DateTime? // когда последний раз загружали Excel
  productionStock        Int?      // остаток производства (ручной ввод)
  productionStockUpdatedAt DateTime?
  productionStockUpdatedBy String? // User.id или email для audit trail (опц.)
}
```

И новый AppSetting ключ: `stock.turnoverNormDays` (int, 1..100, default 37) — **pattern уже есть**, добавляем через ту же таблицу `AppSetting`.

## Stack Patterns by Variant

**Если Phase 14 разрастётся на 2 фазы** (реалистично, учитывая объём):
- Phase 14A: модели БД + Excel import склада Иваново + ручной ввод производства + базовая таблица `/stock`
- Phase 14B: `/stock/wb` с кластерами/складами + расширение `/api/wb-sync` до per-warehouse + WbWarehouse seed

**Если понадобится performance**: добавить `SELECT ... FOR UPDATE` в transaction Excel-импорта (500 товаров → риск гонки редкий, но cheap safeguard).

**Если появятся CSV импорты** (не в scope, но возможно в v1.3):
- xlsx тоже парсит CSV (`XLSX.read(buf, { type: "string" })`) — не нужна отдельная библиотека
- Либо добавить `papaparse` как более streaming-friendly, если файлы > 10 MB

## Integration Points (для gsd-roadmapper)

1. **Phase 14 depends on:**
   - `WbCard` table (Phase 3) — `WbCardWarehouseStock.wbCardId → WbCard.nmId`
   - `Product` table (Phase 2) — расширяем полями
   - `AppSetting` (Phase 7) — добавляем ключ
   - `requireSection("STOCK")` (Phase 4) — уже работает, `STOCK` в enum

2. **Phase 14 extends:**
   - `/api/wb-sync` route — после existing Statistics API call добавить upsert в `WbCardWarehouseStock` для каждой пары `(nmId, warehouseId)`. **НЕ трогать** fast-path `/api/wb-sync-spp` — он не ходит в stocks API.
   - `lib/wb-api.ts` — добавить helper `upsertWarehouseStocks(nmId, stocksArray)`.

3. **Phase 14 creates:**
   - `app/(dashboard)/stock/page.tsx` — основной (RSC)
   - `app/(dashboard)/stock/wb/page.tsx` — WB-разрез (RSC)
   - `app/(dashboard)/stock/ozon/page.tsx` — заглушка ComingSoon (копия из Phase 5)
   - `app/actions/stock.ts` — server actions (updateProductionStock, updateTurnoverNorm, …)
   - `app/api/stock-ivanovo-upload/route.ts` — POST multipart для Excel
   - `lib/parse-ivanovo-stock-excel.ts` — парсер (copy from `parse-auto-promo-excel.ts`)
   - `lib/stock-math.ts` — pure functions для О/З/Об/Д (vitest-testable, mirror `pricing-math.ts`)
   - `prisma/seed-wb-warehouses.ts` — hardcoded array, запускается однократно
   - `components/stock/` — StockTable, StockWbTable, ClusterTooltip, IvanovoImportDialog, ProductionStockCell, TurnoverNormInput

## Sources

- [Next.js 15 официальные доки](https://nextjs.org/docs) — App Router + Server Actions patterns, проверено
- [TanStack Table v8 Expanding Guide](https://tanstack.com/table/v8/docs/guide/expanding) — причина НЕ добавлять
- [TanStack Table React 19 compatibility](https://www.npmjs.com/package/@tanstack/react-table) — v8.21.3 совместимо, но issue [#5567](https://github.com/TanStack/table/issues/5567) с React Compiler
- [SheetJS xlsx npm](https://www.npmjs.com/package/xlsx) — подтверждает 0.18.5 как последнюю CE, Node.js 18+ ok
- [SheetJS React integration](https://docs.sheetjs.com/docs/demos/frontend/react/) — read + sheet_to_json pattern внутри useEffect/useCallback (мы делаем на сервере в action, что ещё чище)
- [SheetJS 2026 best practices](https://thelinuxcode.com/npm-sheetjs-xlsx-in-2026-safe-installation-secure-parsing-and-real-world-nodejs-patterns/) — header:1 + validate header + hard row limit
- [WB Analytics API docs](https://dev.wildberries.ru/en/docs/openapi/analytics) — verified: НЕТ отдельного endpoint для warehouses directory с cluster mapping
- [MDN `<colgroup>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/colgroup) — причина НЕ использовать для sticky
- [Noah Bieler: Sticky Table Headers Next.js+Tailwind](https://www.noahbieler.com/blog/sticky-table-headers-and-popovers-with-nextjs-and-tailwind-css) — эталонный pattern для sticky
- [TanStack/table Discussion #4471](https://github.com/TanStack/table/discussions/4471) — sticky column + header с Tailwind reference
- Существующий код `lib/parse-auto-promo-excel.ts` + `tests/excel-auto-promo.test.ts` — HIGH confidence, pattern-reuse

---
*Stack research for: Stock management section милстоуна v1.2*
*Researched: 2026-04-21*
*Confidence: HIGH (existing stack + patterns) / MEDIUM (WB warehouses dictionary — no official API, manual seed неизбежен)*
