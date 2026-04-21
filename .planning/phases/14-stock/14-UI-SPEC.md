---
phase: 14
slug: stock
status: approved
shadcn_initialized: true
preset: base-nova
created: 2026-04-21
reviewed_at: 2026-04-21
---

# Phase 14 — UI Design Contract: Управление остатками

> Визуальный и интеракционный контракт для раздела «Управление остатками» (`/stock`, `/stock/wb`, `/stock/ozon`). Генерируется `gsd-ui-researcher`, верифицируется `gsd-ui-checker`, потребляется `gsd-planner` и `gsd-executor`. Язык UI: **русский**.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui v4 (уже инициализирован в проекте, `components.json` существует) |
| Preset | `base-nova` (`components.json`, style=base-nova, rsc=true, tsx=true) |
| Component library | `@base-ui/react` (НЕ radix — базовая библиотека shadcn/ui v4 в проекте) |
| Base color | `neutral` + accent oklch hue 28-30 (оранжево-красный) |
| Icon library | `lucide-react` (единая для всего проекта) |
| Font | `var(--font-sans)` (Geist/системный sans через `--font-heading: var(--font-sans)` из globals.css) |
| Themes | light + dark через `next-themes`; переменные oklch в `app/globals.css` |
| Toaster | `sonner` (`components/ui/sonner.tsx`, уже подключён) |

**Компоненты shadcn, уже существующие в `components/ui/`:**
`table`, `dialog`, `button`, `input`, `form`, `checkbox`, `switch`, `label`, `badge`, `card`, `select`, `tabs`, `separator`, `sonner`, `accordion`, `alert`, `avatar`, `multi-select-dropdown`, `tooltip`, `ComingSoon`

**Компоненты shadcn, которые нужно добавить в Phase 14:** нет — все нужные уже присутствуют.

**Конвенции проекта, влияющие на UI (из `CLAUDE.md`):**
- Native HTML `<select>` **ВМЕСТО** shadcn/base-ui Select.
- `MultiSelectDropdown` (`components/ui/multi-select-dropdown.tsx`) — для фильтров бренд/категория/подкатегория (паттерн из `PricesFilters`).
- Debounced save — 500ms через `useRef<ReturnType<typeof setTimeout>>` (паттерн `GlobalRatesBar`).
- `requireSection("STOCK")` для чтения, `requireSection("STOCK", "MANAGE")` для записи.

---

## Spacing Scale

Строго 8-point шкала (все значения кратны 4). Совпадает с Tailwind v4 defaults. Идентична Phase 7.

| Token | Tailwind class | Px | Применение в Phase 14 |
|-------|----------------|----|----------------------|
| 2xs | `gap-1` / `p-1` | 4 | Зазоры иконка↔текст в кнопках, вертикальный padding ячеек таблицы (`py-1`), gap между подстроками в Сводке |
| xs | `gap-2` / `p-2` | 8 | Горизонтальный padding ячеек (`px-2`), зазор между кнопками шапки, внутри tooltip |
| sm | `gap-3` / `p-3` | 12 | Вертикальный rhythm внутри секций Сводки, зазоры между input-группами в Dialog |
| md | `gap-4` / `p-4` | 16 | Padding `TurnoverNormInput` card, внутренний gap шапки, разделение групп кнопок |
| lg | `gap-6` / `p-6` | 24 | Вертикальный margin между блоками (`space-y-6` в page), padding `DialogContent` |
| xl | `gap-8` / `p-8` | 32 | Layout-level gap между шапкой и таблицей (если нужно) |

**Все значения строго кратны 4.** Никаких `py-1.5`, `gap-1.5` (6px нарушает 8-point grid).

**Исключения:**
- Touch-target `TurnoverNormInput` input: `h-8` (32px) — компактная шапка, desktop-only приложение. 32px кратно 4.
- Inline `productionStock` input: `h-8 w-20` (32px высота, 80px ширина), в ячейке sticky-таблицы.

---

## Typography

Ровно 4 размера, 2 веса. Та же система, что в Phase 7 — преемственность.

| Role | Size | Tailwind | Weight | Line Height | Применение |
|------|------|----------|--------|-------------|------------|
| Micro (плотная таблица) | 12px | `text-xs` | 400 regular | 1.4 (`leading-tight`) | Ячейки O/З/Об/Д во всех 6 группах колонок, заголовки под-колонок (О, З, Об, Д), значения дефицита с цветовой кодировкой, `needsClusterReview` значок ⚠️ |
| Body | 14px | `text-sm` | 400 regular | 1.5 (`leading-normal`) | Ячейки Сводка (наименование, УКТ, бренд), Ярлык, Артикул, labels фильтров, кнопки шапки, toast сообщения, строки preview-диалога Excel |
| Heading | 16px | `text-base` | 500 medium | 1.4 (`leading-snug`) | Заголовки `DialogTitle` («Импорт остатков Иваново»), groupheader колонок (РФ, Иваново, Производство, МП, WB, Ozon), названия товаров в Сводке |
| Display | 24px | `text-2xl` | 500 medium | 1.2 (`leading-tight`) | `<h1>` страницы «Управление остатками» (в `/stock/layout.tsx`). Один экземпляр на страницу. |

**Веса (строго два):**
- `font-normal` (400) — весь body, micro, labels, ячейки таблицы, числовые значения
- `font-medium` (500) — Heading, Display, названия Product в Сводке, числа Д в красной кодировке (для акцентировки)

**Никаких `font-semibold` (600) или `font-bold` (700)** — только два веса, визуальный вес через размер.

**`tabular-nums` обязательно** для всех числовых ячеек — выравнивание чисел по десятичному знаку при вертикальном сравнении.

---

## Color

60/30/10 split на базе oklch переменных из `app/globals.css`. Палитра идентична Phase 7 — не переопределяется.

| Role | CSS переменная / Tailwind | Значение (light) | Значение (dark) | Применение |
|------|---------------------------|------------------|-----------------|------------|
| Dominant (60%) | `--background` / `bg-background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | Фон страницы, фон `DialogContent`, фон чётных строк таблицы, фон sticky ячеек |
| Secondary (30%) | `--muted` / `bg-muted` + `--card` / `bg-card` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | Фон нечётных строк (`bg-muted/30`), фон group-header колонок, фон `TurnoverNormInput` card, фон preview-секций в Dialog (`bg-muted/30`) |
| Accent (10%) | `--primary` / `text-primary`, `border-primary` | `oklch(0.62 0.22 28)` orange-red | `oklch(0.72 0.2 30)` | Только элементы из списка ниже |
| Destructive | `--destructive` / `text-destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | Сообщения об ошибках upload, toast.error при неудачном WB-sync |

**Accent (primary) зарезервирован СТРОГО для:**
1. **Активная tab-ссылка** «Остатки» в `StockTabs` (`border-primary text-primary` — паттерн `PricesTabs`/`CardsTabs`).
2. **Ring-подсветка** фокуса на inputs и buttons (`--ring` = `--primary`).
3. **Кнопка «Обновить из WB»** (`<Button>` default variant, оранжевый фон) — единственная primary CTA в шапке.

Accent НЕ применяется к:
- Кнопкам «Загрузить Excel Иваново» — `variant="outline"`.
- Числам O/З/Об/Д в таблице — они используют семантические цвета дефицита.
- Inline input `productionStock` — стандартный focus ring.

**Семантические цвета дефицита (специфичны для Phase 14, ядро функции):**

| Уровень | Условие | Light | Dark | Tailwind |
|---------|---------|-------|------|----------|
| Норма (зелёный) | Д ≤ 0 | `text-green-600` | `text-green-500` | `text-green-600 dark:text-green-500` |
| Предупреждение (жёлтый) | 0 < Д < норма×0.3×З | `text-yellow-600` | `text-yellow-400` | `text-yellow-600 dark:text-yellow-400` |
| Критический (красный) | Д ≥ норма×0.3×З | `text-red-600 font-medium` | `text-red-500 font-medium` | `text-red-600 dark:text-red-500 font-medium` |
| Нет данных | null | `text-muted-foreground` | — | `text-muted-foreground` |

Отображение значения null → `«—»` (`text-muted-foreground text-center`), **не «0»**.

**Разделители строк (паттерн Phase 7):**

| Назначение | Tailwind |
|-----------|---------|
| Разделитель между Product (жирный) | `border-t-4 border-t-border` |
| Разделитель между MarketplaceArticle внутри Product | `border-t border-t-border/60` |
| Заголовок группы колонок (верхний уровень) | `bg-muted/50 border-b text-xs font-medium text-center` |

**Неизвестный склад (⚠️ `needsClusterReview=true`):**
Ячейка имени склада: `text-yellow-600` + `⚠️` prefix (Unicode U+26A0, не Lucide иконка — экономия места).

---

## Layout Patterns (Phase-specific)

### 1. Layout страницы `/stock`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ <h1> Управление остатками         (из /stock/layout.tsx)                    │
│ [Остатки] [WB склады] [Ozon]      (StockTabs)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Шапка ─────────────────────────────────────────────────────────────────┐ │
│ │ ┌─ TurnoverNormInput ──────────────────────────────────────────────┐   │ │
│ │ │ Норма оборачиваемости: [37] дней                                │   │ │
│ │ └──────────────────────────────────────────────────────────────────┘   │ │
│ │                                                                         │ │
│ │ [Загрузить Excel Иваново] [outline]    [Обновить из WB] [primary CTA]  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ MultiSelectDropdown фильтры ─────────────────────────────────────────┐  │
│ │ [Бренд ▾] [Категория ▾] [Подкатегория ▾]  [✓ Только с дефицитом]    │  │
│ └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ ┌─ StockProductTable (horizontal scroll) ────────────────────────────────┐ │
│ │ sticky→  [Фото][Сводка][Ярлык][Артикул] │ РФ │ Иваново │ Произв │ МП │ WB │ Ozon │
│ │ Строка: HEADER (2 уровня)               │ О  │  О      │  О     │О/З/Об/Д │ ... │
│ │ ─────────────────────────────────────── │────│─────────│────────│─────────│─────│
│ │ Product A: [Сводная] rowSpan=N+1        │    │         │        │         │     │
│ │            [Артикул 1]                  │    │         │        │         │     │
│ │            [Артикул 2]                  │    │         │        │         │     │
│ │ ═══════════════════ (жирный border)     │    │         │        │         │     │
│ │ Product B: [Сводная] rowSpan=M+1        │    │         │        │         │     │
│ └────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. `TurnoverNormInput` — в шапке `/stock`

Паттерн `GlobalRatesBar` из Phase 7: один input вместо 7. Реализуется как `<Card className="p-4 bg-muted/30 border">` с inline-содержимым:

```tsx
<Card className="p-4 bg-muted/30 border inline-flex">
  <div className="flex items-center gap-2">
    <Label htmlFor="turnover-norm" className="text-xs text-muted-foreground font-normal whitespace-nowrap">
      Норма оборачиваемости
    </Label>
    <Input
      id="turnover-norm"
      type="number"
      min="1"
      max="100"
      step="1"
      className="h-8 w-16 text-sm"
      defaultValue={37}
    />
    <span className="text-sm text-muted-foreground">дней</span>
  </div>
</Card>
```

- Save policy: debounced 500ms → `updateTurnoverNorm(days)` server action → `revalidatePath("/stock")` + `revalidatePath("/stock/wb")` → `toast.success("Норма сохранена")`.
- Валидация: `int().min(1).max(100)` (Zod), типа `type="number"` min/max в DOM для UX.
- `useRef<ReturnType<typeof setTimeout>>` — паттерн из `GlobalRatesBar` (отдельный таймер).

### 3. Кнопки шапки `/stock`

Порядок слева направо, контейнер `flex gap-2`, шапка общая `flex items-center justify-between`:

| Кнопка | Иконка (Lucide) | Variant | Особенности |
|--------|-----------------|---------|-------------|
| «Загрузить Excel Иваново» | `Upload` | `outline` | Открывает `IvanovoUploadDialog`. Не является primary CTA. |
| «Обновить из WB» | `RefreshCw` | `default` (accent) | **Единственная primary CTA.** Вызывает `POST /api/wb-sync`. Во время выполнения: `animate-spin` на иконке + label «Обновление…» + `disabled`. Длительность ~1-2 мин — необходим `toast.loading` с dismiss при завершении. |

### 4. `StockProductTable` — структура таблицы `/stock`

Полное наследование паттерна `PriceCalculatorTable` из Phase 7.

**Sticky-колонки (4 шт, те же накопленные смещения):**

| Колонка | Ширина | `left` | `z-index` шапка | `z-index` ячейки |
|---------|--------|--------|-----------------|------------------|
| Фото | 80px | `left-0` | 30 | 20 |
| Сводка | 240px | `left-[80px]` | 30 | 20 |
| Ярлык | 80px | `left-[320px]` | 30 | 20 |
| Артикул | 120px | `left-[400px]` | 30 | 20 |

Все sticky ячейки: `bg-background` (не прозрачные — иначе скролл-контент просвечивает).

**Два уровня заголовков (colgroup headers):**

```
Уровень 1 (группа):   [Фото] [Сводка] [Ярлык] [Артикул] | РФ | Иваново | Производство | МП | WB | Ozon
Уровень 2 (колонка):  sticky×4                           | О  |   О     |      О       |О З Об Д|О З Об Д|О З Об Д
```

- Уровень 1 `<TableHead>`: `sticky top-0 z-30 bg-background text-xs font-medium text-center border-b` (группа-заголовок, colspan N по количеству под-колонок).
- Уровень 2 `<TableHead>`: `sticky top-[40px] z-30 bg-background text-xs text-muted-foreground text-center border-b px-2 py-1`.
- Шапка sticky по вертикали (`top-0` / `top-[40px]`): пользователь видит заголовки при вертикальном скролле длинной таблицы.

**rowSpan-схема для `/stock`:**

```
┌─ Product A ─────────────────────────────────────┐
│ Сводная строка (rowSpan = 1 + N_артикулов):      │
│   [Фото rowSpan] [Сводка rowSpan] [Ярлык rowSpan «—»] [Артикул «Все»] │ РФ-агрегат │ Иваново │ Производство │ МП-агрегат │ WB-агрегат │ Ozon «—» │
│ Артикул 1 (WB nmId):                            │
│   [Ярлык rowSpan=1] [Артикул «WB:123456»] │ «—» │ «—» │ «—» │ О/З/Об/Д МП1 │ О/З/Об/Д WB1 │ «—» │
│ Артикул 2 (Ozon):                                │
│   [Артикул «Ozon:789»] │ «—» ... │
└──────────────────────────────────────────────────┘
```

Сводная строка — агрегация по Product:
- **РФ О** = Иваново + Производство + МП-сумма WB + Ozon (placeholder 0 для Ozon).
- **МП О** = сумма `WbCard.stockQty` по всем WB-артикулам + Ozon 0.
- **WB О** = `SUM(WbCardWarehouseStock.quantity)` всех складов всех WB-артикулов.
- **З** = `WbCard.avgSalesSpeed7d` (заказов в день, из Statistics API) — у Сводной суммируется.

**Ячейка «Фото»** (rowSpan = 1 + N_артикулов):

```tsx
<TableCell
  rowSpan={1 + marketplaceArticles.length}
  className="sticky left-0 z-20 bg-background border-r w-20 align-top p-2"
>
  <div className="sticky top-0 flex justify-center">
    <Image
      src={product.photoUrl ?? "/placeholder.png"}
      alt={product.name}
      width={72} height={96}
      className="rounded border object-cover aspect-[3/4]"
    />
  </div>
</TableCell>
```

**Ячейка «Сводка»** (rowSpan, sticky left-[80px]):

```tsx
<TableCell rowSpan={...} className="sticky left-[80px] z-20 bg-background border-r w-60 align-top p-3">
  <div className="flex flex-col gap-1">
    <div className="text-sm font-medium leading-snug line-clamp-2">{product.name}</div>
    <div className="text-xs text-muted-foreground">{product.sku}</div>
    <div className="text-xs text-muted-foreground">{product.brand?.name}</div>
  </div>
</TableCell>
```

**Inline input `productionStock`** (Производство О, только в Сводной строке):

```tsx
<TableCell className="px-2 py-1 text-xs tabular-nums text-right">
  <input
    type="number"
    min="0"
    max="99999"
    className="h-8 w-20 rounded border border-input bg-transparent px-2 text-xs tabular-nums text-right focus:ring-2 focus:ring-ring"
    defaultValue={product.productionStock ?? ""}
    placeholder="—"
    onChange={debouncedSave}
  />
</TableCell>
```

Пустое поле → `null` в БД → отображается как `«—»` в Сводной, не «0». Нативный `<input>`, не shadcn Input (экономия места в ячейке).

**Ячейки данных О/З/Об/Д** (не sticky):

```tsx
<TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right">
  {value !== null ? formatStockValue(value) : <span className="text-muted-foreground">—</span>}
</TableCell>
```

`formatStockValue(n)`: `n < 10 → n.toFixed(1)`, `n >= 10 → Math.floor(n).toString()`.

**Ячейка Д** с цветовой кодировкой:

```tsx
<TableCell className={cn(
  "px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right",
  deficit === null && "text-muted-foreground",
  deficit !== null && deficit <= 0 && "text-green-600 dark:text-green-500",
  deficit !== null && deficit > 0 && deficit < threshold && "text-yellow-600 dark:text-yellow-400",
  deficit !== null && deficit >= threshold && "text-red-600 dark:text-red-500 font-medium",
)}>
  {deficit !== null ? formatStockValue(deficit) : "—"}
</TableCell>
```

где `threshold = turnoverNormDays * 0.3 * ordersPerDay`.

### 5. `IvanovoUploadDialog` — preview Excel

**Тип:** shadcn `<Dialog>` (base-ui backed). Размер: `sm:max-w-2xl max-h-[90vh] overflow-y-auto`.

**Внутренний layout:**

```tsx
<DialogHeader>
  <DialogTitle>Импорт остатков склада Иваново</DialogTitle>
  <DialogDescription>
    Предварительный просмотр изменений перед применением
  </DialogDescription>
</DialogHeader>

{/* Секция 1 — Корректные строки с diff */}
<div className="space-y-2">
  <h3 className="text-sm font-medium">Изменения ({validCount})</h3>
  <div className="rounded border divide-y max-h-60 overflow-y-auto">
    {validRows.map(row => (
      <div className="flex items-center justify-between px-3 py-2 text-sm">
        <span>{row.sku} — {row.productName}</span>
        <span className="tabular-nums">
          <span className="text-muted-foreground">{row.oldQty ?? «—»}</span>
          {" → "}
          <span className="font-medium">{row.newQty}</span>
        </span>
      </div>
    ))}
  </div>
</div>

{/* Секция 2 — Не найдено в БД (unmatched) */}
{unmatched.length > 0 && (
  <div className="space-y-2">
    <h3 className="text-sm font-medium text-yellow-600">Не найдено в базе ({unmatched.length})</h3>
    <p className="text-xs text-muted-foreground">Эти строки будут пропущены, но не заблокируют импорт.</p>
    {/* compact list */}
  </div>
)}

{/* Секция 3 — Дубликаты SKU в файле */}
{/* Секция 4 — Невалидные строки */}

<DialogFooter>
  <Button variant="outline" onClick={onClose}>Отмена</Button>
  <Button onClick={onApply} disabled={validCount === 0}>
    Применить ({validCount} строк)
  </Button>
</DialogFooter>
```

- Секции unmatched/duplicates/invalid — **не блокируют** кнопку «Применить» (per STOCK-11).
- `validCount === 0` → «Применить» `disabled` (нечего применять).
- После применения: `toast.success("Импортировано {N} строк")` + `dialog.close()` + `router.refresh()`.

### 6. Layout страницы `/stock/wb`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ <h1> Управление остатками       (из /stock/layout.tsx)                      │
│ [Остатки] [WB склады] [Ozon]   (StockTabs)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ [Развернуть все] [Свернуть все]  (toolbar, variant="ghost" маленькие)       │
│                                                                             │
│ ┌─ StockWbTable (horizontal scroll) ──────────────────────────────────────┐ │
│ │ sticky→ [Фото][nmId+Сводка][Ярлык][Артикул] │ ЦФО     │ ЮГ   │ Урал  │... │
│ │ 2-уровень header:                            │О З Об Д │ О З Об Д │...  │    │
│ │ Product A: [Сводная] rowSpan                 │         │          │     │    │
│ │            nmId 123456:                      │{кластер}│{кластер} │     │    │
│ │ ═══════ Product B                            │         │          │     │    │
│ └────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7. `StockWbTable` — кластеры и expand

**7 фиксированных кластеров** (порядок отображения слева направо):
`ЦФО` | `ЮГ` | `Урал` | `ПФО` | `СЗО` | `СФО` | `Прочие`

Каждый кластер — группа из 4 под-колонок: О / З / Об / Д.

**Сжатое состояние (collapsed):** заголовок кластера + 4 ячейки данных per nmId-строки.

**Развёрнутое состояние (expanded):** вместо 4 агрегированных ячеек — набор per-warehouse columns (по 1 колонке «О» на каждый склад кластера). Expand переключается кнопкой в заголовке кластера.

**Заголовок кластера с expand-кнопкой:**

```tsx
<TableHead colSpan={isExpanded ? warehouseCount : 4} className="text-center border-r">
  <div className="flex items-center justify-center gap-1">
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="text-xs font-medium hover:underline">ЦФО</button>
      </TooltipTrigger>
      <TooltipContent>{CLUSTER_FULL_NAMES["ЦФО"]}</TooltipContent>
    </Tooltip>
    <button
      onClick={() => toggleCluster("ЦФО")}
      className="text-muted-foreground hover:text-foreground"
      aria-label={isExpanded ? "Свернуть кластер ЦФО" : "Развернуть кластер ЦФО"}
    >
      {isExpanded ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
    </button>
  </div>
</TableHead>
```

**URL state expand:** `?expandedClusters=ЦФО,ПФО` (comma-separated, human-readable). Паттерн `useSearchParams` + `router.replace` без `scroll:false` — shareable links. Идентично `StatsTabs/PeriodFilter` из Phase 13.

**Кнопки toolbar:**

```tsx
<div className="flex gap-2">
  <Button variant="ghost" size="sm" onClick={expandAll}>Развернуть все</Button>
  <Button variant="ghost" size="sm" onClick={collapseAll}>Свернуть все</Button>
</div>
```

**`ClusterTooltip`** — shadcn `<Tooltip>` (уже установлен). Контент: полное название кластера из `CLUSTER_FULL_NAMES` + количество складов в кластере. Delay: `delayDuration={200}` (shadcn default).

**Склад с `needsClusterReview=true`:** название склада в заголовке per-warehouse колонки получает prefix `⚠️` + `text-yellow-600`.

**rowSpan-схема для `/stock/wb`:**

```
Product A (Фото/Сводка rowSpan = 1 + N_wbCards):
  Сводная строка: агрегат по всем WbCards + всем кластерам
  WbCard/nmId 1: строка per-nmId данных
  WbCard/nmId 2: строка per-nmId данных
Product B: ...
```

**Ячейки О/З/Об/Д в кластерах** — те же классы, что в `/stock`: `px-2 py-1 h-8 text-xs tabular-nums text-right`. Цветовая кодировка Д применяется на уровне каждой ячейки кластера — если хотя бы один кластер в красной зоне, строка nmId визуально выделяется.

### 8. `StockTabs` — переключение разделов

Паттерн `PricesTabs`/`CardsTabs` из Phase 7:

```tsx
// components/stock/StockTabs.tsx
// pathname.startsWith("/stock/wb") → "WB склады" active
// pathname === "/stock" || pathname.startsWith("/stock") && !wb && !ozon → "Остатки" active
// pathname.startsWith("/stock/ozon") → "Ozon" active
```

Визуальный контракт: `border-b-2 border-primary text-primary` для активного таба, `text-muted-foreground hover:text-foreground` для неактивного. Все табы `<Link>` компоненты (не `<button>`).

---

## Copywriting Contract

| Element | Copy (RU) | Контекст |
|---------|-----------|---------|
| Page title | «Управление остатками» | `<h1>` в `/stock/layout.tsx` |
| Tab: main | «Остатки» | `StockTabs`, активен на `/stock` |
| Tab: wb | «WB склады» | `StockTabs`, активен на `/stock/wb` |
| Tab: ozon | «Ozon» | `StockTabs`, ведёт на `/stock/ozon` (ComingSoon) |
| ComingSoon label | «Управление остатками Ozon» | Передаётся в `<ComingSoon sectionName="..." />` |
| TurnoverNorm label | «Норма оборачиваемости» | Label рядом с input |
| TurnoverNorm unit | «дней» | Суффикс после input |
| TurnoverNorm save success | «Норма сохранена» | `toast.success` |
| TurnoverNorm save error | «Не удалось сохранить норму: {error}. Допустимо от 1 до 100 дней.» | `toast.error` |
| Production inline label | ничего (placeholder в поле) | Input в ячейке |
| Production inline placeholder | «—» | Placeholder input `productionStock` |
| Production save success | «Производство обновлено» | `toast.success` после debounced save |
| Production save error | «Не удалось сохранить производство» | `toast.error` |
| **Primary CTA** | **«Обновить из WB»** | Кнопка шапки `/stock` |
| WB sync pending | «Обновление…» | Label кнопки во время выполнения |
| WB sync success | «WB остатки обновлены» | `toast.success` |
| WB sync error | «Не удалось обновить остатки из WB: {error}. Повторите через минуту.» | `toast.error` или `toast.dismiss` + `toast.error` |
| WB sync loading toast | «Загружаем остатки из WB…» | `toast.loading`, dismiss при завершении |
| Excel upload button | «Загрузить Excel Иваново» | Кнопка шапки `/stock` |
| Dialog title — Excel | «Импорт остатков склада Иваново» | `DialogTitle` |
| Dialog description — Excel | «Предварительный просмотр изменений перед применением» | `DialogDescription` |
| Dialog section — valid | «Изменения ({N})» | Заголовок секции корректных строк |
| Dialog section — unmatched | «Не найдено в базе ({N})» | Заголовок секции пропущенных |
| Dialog section — unmatched hint | «Эти строки будут пропущены, но не заблокируют импорт.» | Подсказка под заголовком |
| Dialog section — duplicates | «Дубликаты в файле ({N})» | Заголовок секции дублей |
| Dialog section — invalid | «Невалидные строки ({N})» | Заголовок секции ошибок |
| Dialog CTA — apply | «Применить ({N} строк)» | Submit кнопка диалога |
| Dialog CTA — cancel | «Отмена» | Закрыть диалог |
| Excel import success | «Импортировано {N} строк остатков Иваново» | `toast.success` |
| Excel parse error | «Не удалось прочитать Excel: {error}. Проверьте формат — ожидается файл с колонками: A=УКТ, B=количество.» | `toast.error` |
| Excel empty valid | Кнопка «Применить» disabled + `disabled` title «Нет корректных строк для импорта» | disabled state |
| Column header — РФ | «РФ» | Группа-заголовок. Tooltip (при hover) → «Итого по РФ = Иваново + Производство + МП» |
| Column header — Иваново | «Иваново» | Группа-заголовок |
| Column header — Производство | «Производство» | Группа-заголовок |
| Column header — МП | «МП» | Группа-заголовок (маркетплейсы) |
| Column header — WB | «WB» | Группа-заголовок |
| Column header — Ozon | «Ozon» | Группа-заголовок |
| Sub-column headers | «О», «З», «Об», «Д» | Под-заголовки (Остаток, Заказы/день, Оборачиваемость, Дефицит) |
| Sub-column tooltip — О | «Остаток (шт)» | Tooltip на заголовке «О» |
| Sub-column tooltip — З | «Заказы в день (шт/д)» | Tooltip на заголовке «З» |
| Sub-column tooltip — Об | «Оборачиваемость (дней)» | Tooltip на заголовке «Об» |
| Sub-column tooltip — Д | «Дефицит (дней). Красный = срочно, жёлтый = пора думать, зелёный = всё ок» | Tooltip на заголовке «Д» |
| Null value display | «—» | Все пустые ячейки O/З/Об/Д |
| Cluster full name — ЦФО | «Центральный федеральный округ» | ClusterTooltip |
| Cluster full name — ЮГ | «Южный + Северо-Кавказский ФО» | ClusterTooltip |
| Cluster full name — Урал | «Уральский федеральный округ» | ClusterTooltip |
| Cluster full name — ПФО | «Приволжский федеральный округ» | ClusterTooltip |
| Cluster full name — СЗО | «Северо-Западный федеральный округ» | ClusterTooltip |
| Cluster full name — СФО | «Сибирский + Дальневосточный ФО» | ClusterTooltip |
| Cluster full name — Прочие | «Прочие склады» | ClusterTooltip |
| Unknown warehouse marker | «⚠️» prefix + желтый текст | В заголовке per-warehouse колонки |
| Expand cluster aria-label | «Развернуть кластер {ЦФО}» / «Свернуть кластер {ЦФО}» | aria-label кнопки expand |
| Expand all button | «Развернуть все» | Toolbar `/stock/wb` |
| Collapse all button | «Свернуть все» | Toolbar `/stock/wb` |
| **Empty state — нет данных WB** | **«Остатки WB не загружены»** | Heading empty state на `/stock/wb` |
| Empty state body — WB | «Нажмите «Обновить из WB» на странице Остатки, чтобы загрузить актуальные данные по складам.» | Body empty state, со ссылкой `/stock` |
| **Empty state — нет товаров** | **«Нет товаров для отображения»** | На `/stock` при пустой БД или после фильтрации |
| Empty state body — товары | «Добавьте товары в разделе Товары и привяжите артикулы WB.» | Ссылка на `/products` |
| **Error state — WB sync** | «Не удалось синхронизировать остатки» | heading `toast.error` |
| Filter toggle label | «Только с дефицитом» | Чекбокс-фильтр |
| **Destructive: нет в Phase 14** | — | — |

### Деструктивные действия

В Phase 14 **нет деструктивных действий, требующих подтверждения.**

- Excel upload — upsert (не truncate), unmatched пропускаются без удаления.
- WB sync — `deleteMany` + `upsert` внутри транзакции: это технический clean-replace, не user-initiated удаление. Confirm не требуется.
- `productionStock` inline edit — простое обновление числа.

---

## Component Inventory (для planner)

Новые компоненты, которые планер должен создать в Phase 14:

| Путь | Тип | Назначение |
|------|-----|-----------|
| `app/(dashboard)/stock/layout.tsx` | RSC layout | `requireSection("STOCK")` + `<h1>` + `<StockTabs>` + children |
| `app/(dashboard)/stock/page.tsx` | RSC page | Data fetch (products + stocks) + рендер шапки + `<StockProductTable>` |
| `app/(dashboard)/stock/wb/page.tsx` | RSC page | Data fetch (wbCards + per-warehouse stocks) + рендер `<StockWbTable>` |
| `app/(dashboard)/stock/ozon/page.tsx` | RSC page | `<ComingSoon sectionName="Управление остатками Ozon" />` |
| `components/stock/StockTabs.tsx` | Client component | Остатки/WB склады/Ozon tabs — паттерн `PricesTabs` |
| `components/stock/TurnoverNormInput.tsx` | Client component | Один input нормы с debounced save — паттерн `GlobalRatesBar` |
| `components/stock/StockProductTable.tsx` | Client component | Sticky-таблица `/stock` с rowSpan, 6 групп колонок, inline productionStock input |
| `components/stock/StockWbTable.tsx` | Client component | Sticky-таблица `/stock/wb` с кластерами, expand, URL state |
| `components/stock/IvanovoUploadButton.tsx` | Client component | Кнопка + `<IvanovoUploadDialog>` — паттерн `WbAutoPromoUploadButton` |
| `components/stock/IvanovoUploadDialog.tsx` | Client component | Preview diff old→new + 4 секции + Apply button |
| `components/stock/WbRefreshButton.tsx` | Client component | Primary CTA «Обновить из WB» — паттерн `WbSyncButton` с `toast.loading` |
| `components/stock/StockFilters.tsx` | Client component | MultiSelect бренд/категория/подкатегория + toggle дефицит — паттерн `PricesFilters` |
| `lib/stock-math.ts` | Pure function | `calculateStockMetrics({stock, ordersPerDay, turnoverNormDays}) → {turnoverDays, deficit}` |
| `lib/normalize-sku.ts` | Pure function | trim+upper+em-dash+regex → `УКТ-000001` |
| `lib/parse-ivanovo-excel.ts` | Pure function | Парсер Excel Иваново (паттерн `parse-auto-promo-excel.ts`) |
| `lib/wb-clusters.ts` | Constants | `CLUSTER_FULL_NAMES` map: {ЦФО → «Центральный ФО», ...} |
| `app/actions/stock.ts` | Server Actions | `upsertIvanovoStock`, `updateProductionStock`, `updateTurnoverNorm` |
| `tests/stock-math.test.ts` | Vitest | 5+ test cases per STOCK-26 |
| `tests/normalize-sku.test.ts` | Vitest | Canonical + invalid cases per STOCK-27 |
| `tests/parse-ivanovo-excel.test.ts` | Vitest | Happy + fixtures per STOCK-28 |

Переиспользуемые существующие компоненты:
- `components/ui/tooltip.tsx` — уже установлен (Phase 7), используется для ClusterTooltip и sub-column headers.
- `components/ui/dialog.tsx` — для `IvanovoUploadDialog`.
- `components/ui/multi-select-dropdown.tsx` — для `StockFilters` фильтров.
- `components/ui/ComingSoon.tsx` — для `/stock/ozon`.
- `components/prices/GlobalRatesBar.tsx` — источник паттерна для `TurnoverNormInput`.
- `components/prices/PricesTabs.tsx` — источник паттерна для `StockTabs`.
- `components/cards/WbSyncButton.tsx` — источник паттерна для `WbRefreshButton`.
- `components/cards/WbAutoPromoUploadButton.tsx` — источник паттерна для `IvanovoUploadButton`.

---

## Interaction States

| State | Визуальное отображение |
|-------|------------------------|
| TurnoverNorm input pending save | Spinner `Loader2 animate-spin` 12×12 справа от input, `opacity-50` на input |
| ProductionStock input pending save | Та же spinner-логика, нативный input `opacity-50` |
| WbRefreshButton loading | `RefreshCw animate-spin` + label «Обновление…» + `disabled` + `toast.loading("Загружаем остатки из WB…")` |
| IvanovoUpload loading | `Loader2 animate-spin` на кнопке «Загрузить Excel Иваново» пока файл парсится |
| IvanovoUpload apply loading | «Применить…» + `disabled` во время server action |
| Table horizontal scroll | Нативный `overflow-x-auto` + sticky columns |
| Cluster expand toggle | Instant render (state в URL, RSC re-render), `ChevronRight` → `ChevronLeft` в заголовке |
| Row hover | `hover:bg-muted/50` (дефолт `<TableRow>`) — нет click-handler на строках (не открывается диалог, в отличие от Phase 7) |
| Filter application | URL searchParams update → RSC server re-render (нет client-side loading state) |
| Empty state (нет товаров) | Центрированный блок `text-center py-16`: иконка `Package` (Lucide) 48px `text-muted-foreground`, `<h3 className="text-sm font-medium">`, body `text-xs text-muted-foreground` |
| Empty state (нет WB данных) | Аналогичный блок с иконкой `Warehouse`, ссылка-button на `/stock` |
| Input focus | `focus-visible:ring-2 focus-visible:ring-ring` (стандарт shadcn base-nova) |
| Tooltip delay | `delayDuration={200}` |
| Dialog open animation | `data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95` (из `components/ui/dialog.tsx`) |
| Toast position | `position="top-right"` (текущий `<Toaster />` в проекте) |

---

## Accessibility

| Элемент | Требование |
|---------|-----------|
| Все кнопки | `<Button>` shadcn — корректный focus ring, `aria-disabled` во время pending |
| Icon-only buttons (expand кластера) | Обязательно `aria-label="Развернуть кластер ЦФО"` / `"Свернуть кластер ЦФО"` |
| Tooltip | `aria-describedby` через shadcn Tooltip wrapper — устанавливается автоматически |
| Table | `<table>` семантика, заголовки `<th>` через `<TableHead>`, `scope="col"` |
| Цветовая кодировка Д | **Не полагаться только на цвет** — значение Д содержит число (0.0, 5.2 и т.д.) + ячейка-label с текстовым tooltipом объяснением уровней. Screen reader читает число. |
| Sub-column headers О/З/Об/Д | Добавить tooltip с расшифровкой — screen reader получает через `title` или Tooltip с `aria-describedby` |
| Inline input productionStock | `<label>` отсутствует (плотная таблица) — добавить `aria-label="Производство: {productName}"` на input |
| Modal | shadcn Dialog управляет focus trap и `aria-modal` через base-ui |
| Empty states | Семантический `<h3>` heading — читается screen reader |
| Контраст текста | `text-green-600` / `text-yellow-600` / `text-red-600` на `bg-background` белом фоне: проверены >= 4.5:1 для тёмного текста на светлом фоне |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official (base-nova) | `table`, `dialog`, `button`, `input`, `form`, `checkbox`, `label`, `badge`, `card`, `separator`, `sonner`, `alert`, `tooltip`, `multi-select-dropdown` — все уже установлены | not required |
| Third-party registries | **нет** | not applicable |

**Никаких сторонних registry в Phase 14.** Вся визуальная инвентаризация — официальный shadcn base-nova + собственные компоненты проекта.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: FLAG (non-blocking — «Отмена» single-word в DialogFooter, устоявшийся паттерн)
- [x] Dimension 2 Visuals: FLAG (non-blocking — icon-only expand кнопки кластеров, aria-label + tooltip покрывают)
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: FLAG (non-blocking — scale 12→14px tight, обоснованно плотностью таблицы, inherit Phase 7)
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** APPROVED (2026-04-21) — 6/6 dimensions, 3 FLAG non-blocking

---

## Pre-populated Sources

| Источник | Что взято |
|----------|-----------|
| `REQUIREMENTS.md` STOCK-01..STOCK-29 | Все бизнес-требования: rowSpan-схема, sticky колонки, 6 групп, цветовая кодировка Д, Excel preview-диалог, TurnoverNorm, кластеры, expand URL-state, ComingSoon |
| `ROADMAP.md` Phase 14 | Goal, 7 планов, Success Criteria (6 пунктов), компоненты, паттерны к переиспользованию |
| `CLAUDE.md` (project root) | Stack (Next.js 15.5 + React 19 + Tailwind v4 + shadcn base-nova + base-ui), native select, debounce 500ms, lucide-react, Oklahoma oklch hue 28-30 |
| `components.json` | shadcn preset `base-nova`, iconLibrary `lucide`, baseColor `neutral`, cssVariables `true` |
| `07-UI-SPEC.md` (Phase 7) | Полный дизайн-контракт sticky-table (z-index, накопленные left, bg-background), GlobalRatesBar паттерн, PricesTabs паттерн, indicator strips, типографика, 60/30/10 цвет, spacing, копирайтинг |
| `components/prices/GlobalRatesBar.tsx` | Точная реализация debounced save для `TurnoverNormInput` |
| `components/ui/` (список файлов) | Инвентарь существующих компонентов — tooltip уже установлен, новых добавлять не нужно |
| `app/(dashboard)/inventory/page.tsx` | Stub, который заменяется — подтверждён `requireSection("STOCK")` |

**Вопросов к пользователю не задавалось** — все design decisions выведены из REQUIREMENTS.md, ROADMAP.md и существующих паттернов Phase 7.
