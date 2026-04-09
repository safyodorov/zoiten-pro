---
phase: 7
slug: prices-wb
status: draft
shadcn_initialized: true
preset: base-nova
created: 2026-04-09
---

# Phase 7 — UI Design Contract: Управление ценами WB

> Визуальный и интеракционный контракт для подраздела «Управление ценами → WB». Генерируется `gsd-ui-researcher`, верифицируется `gsd-ui-checker`, потребляется `gsd-planner` и `gsd-executor`. Источник-контекст: `07-CONTEXT.md` (D-01..D-17). Язык UI: **русский**.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui v4 (уже инициализирован в проекте) |
| Preset | `base-nova` (`components.json`, style=base-nova, rsc=true, tsx=true) |
| Component library | `@base-ui/react` (НЕ radix — базовая библиотека для shadcn/ui v4 в проекте) |
| Base color | `neutral` + accent oklch hue 28-30 (оранжево-красный) |
| Icon library | `lucide-react` (единая для всего проекта) |
| Font | `var(--font-sans)` (Geist Sans — системный стек через `font-heading` = `font-sans`) |
| Themes | light + dark через `next-themes`; переменные oklch в `app/globals.css` |
| Toaster | `sonner` (`components/ui/sonner.tsx`, уже подключён) |

**Компоненты shadcn, уже существующие в `components/ui/`:** `table`, `dialog`, `button`, `input`, `form`, `checkbox`, `switch`, `label`, `badge`, `card`, `select`, `tabs`, `separator`, `sonner`, `accordion`, `alert`, `avatar`, `ComingSoon`.

**Компоненты shadcn, которые нужно добавить в Phase 7:**

| Компонент | Цель | Команда установки |
|-----------|------|-------------------|
| `tooltip` | D-11: tooltip на названии акции с `description` + `advantages[]` | `npx shadcn add tooltip` |

**Конвенции проекта, влияющие на UI (из `CLAUDE.md`):**
- Native HTML `<select>` **ВМЕСТО** shadcn/base-ui Select — base-ui ломается с `defaultValue`. В модалке юнит-экономики используем нативный `<select>` для выбора слота (1/2/3).
- `CreatableCombobox` (`components/combobox/`) — для inline-создания опций (не применяется в этой фазе, акции и ставки не создаются через combobox).
- `MultiSelectDropdown` — для фильтров с чекбоксами (не применяется: в ТЗ фильтры отсутствуют — deferred).

---

## Spacing Scale

Строго 8-point шкала (все значения кратны 4). Совпадает с Tailwind v4 defaults проекта.

| Token | Tailwind class | Px | Применение в Phase 7 |
|-------|----------------|----|----------------------|
| 2xs | `gap-1` / `p-1` | 4 | Зазоры между иконкой и текстом в кнопках/бейджах, внутренние паддинги ячеек таблицы |
| xs | `gap-2` / `p-2` | 8 | Паддинг ячеек таблицы (`<TableCell>` базовый `p-2`), зазоры между кнопками шапки, внутри tooltip |
| sm | `gap-3` / `p-3` | 12 | **Исключение (допускается)** — вертикальный rhythm внутри секций сводки Product, зазоры между input-группами модалки |
| md | `gap-4` / `p-4` | 16 | Паддинг карточек ставок, внутренний gap колонок модалки, зазоры между группами в header |
| lg | `gap-6` / `p-6` | 24 | Вертикальный margin между блоками секции (`space-y-6` в page), паддинг `DialogContent` |
| xl | `gap-8` / `p-8` | 32 | Не используется в плотной таблице Phase 7 — применяется только если окажется layout-level gap между sticky-шапкой и таблицей |

**Исключения, разрешённые для этой фазы:**
- Ячейки таблицы 30-колоночного расчёта — разрешается сжать вертикальный padding до `py-1.5` (6px) для максимальной плотности. **Горизонтальный** padding остаётся `px-2` (8px). Обоснование: 30 колонок × 15 строк × много Product — плотность критична.
- Нативные `<select>` в модалке — высота `h-9` (36px, base-ui стандарт), а не 44px touch-target: приложение desktop-only (mobile acceptable не primary).

---

## Typography

Ровно 4 размера, 2 веса. Tailwind v4 + CSS переменные `--font-sans` / `--font-heading` из `globals.css`.

| Role | Size | Tailwind | Weight | Line Height | Применение |
|------|------|----------|--------|-------------|------------|
| Micro (плотная таблица) | 12px | `text-xs` | 400 regular | 1.4 (`leading-tight`) | Ячейки 30-колоночного расчёта: цена продавца, кошелёк, эквайринг, комиссии, ДРР, джем, к перечислению, закупка, брак, доставка, кредит, общие, налог, прибыль, Re, ROI. Обоснование: 30 столбцов не помещаются при 14px. |
| Body | 14px | `text-sm` | 400 regular | 1.5 (`leading-normal`) | Колонки Сводка (Наименование, Остаток, Скорость), Ярлык, Артикул, названия акций, tooltip body, label-ы формы, inputs модалки, кнопки шапки. **Это дефолтный размер подавляющей части UI (как в WbCardsTable, UserForm).** |
| Heading | 16px | `text-base` | 500 medium | 1.4 (`leading-snug`) | `DialogTitle` модалки («Расчёт юнит-экономики»), заголовки разделов inputs/outputs внутри модалки, названия Product в Сводке (жирный), подписи групп ставок в шапке. |
| Display | 24px | `text-2xl` | 600 semibold | 1.2 (`leading-tight`) | `<h1>` страницы «Управление ценами» (в layout.tsx как в `/cards/layout.tsx`). Один экземпляр на страницу. |

**Веса (строго два):**
- `font-normal` (400) — весь body, micro, labels, ячейки таблицы
- `font-medium` (500) — Heading, Display (через `font-semibold` 600 только для `<h1>`), значения «Прибыль/Re/ROI» в таблице, названия Product в Сводке, текущая цена в строке «Текущая цена», активные tab-ссылки

**Шрифт:** `var(--font-sans)` (Geist/системный sans) через `@theme inline { --font-heading: var(--font-sans) }`. Никаких дополнительных web-шрифтов.

---

## Color

60/30/10 split на базе переменных oklch из `app/globals.css`. Палитра **неизменна** — та же, что в `/cards/wb` и `/products`.

| Role | CSS переменная / Tailwind | Значение (light) | Значение (dark) | Применение |
|------|---------------------------|------------------|-----------------|------------|
| Dominant (60%) | `--background` / `bg-background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | Фон страницы, фон `DialogContent` (через `bg-popover`), фон чётных строк таблицы |
| Secondary (30%) | `--muted` / `bg-muted` + `--card` / `bg-card` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | Фон нечётных строк таблицы (`bg-muted/30`), фон tooltip, фон sticky-шапки таблицы (`bg-background` с `border-b`), фон карточек ставок в шапке, фон группировок в модалке, `TableFooter` |
| Secondary surface | `--sidebar` / `bg-sidebar` | `oklch(0.985 0 0)` | `oklch(0.205 0 0)` | Уже используется sidebar; **не применяется** в контенте Phase 7 |
| Accent (10%) | `--primary` / `bg-primary`, `text-primary`, `border-primary` | `oklch(0.62 0.22 28)` orange-red | `oklch(0.72 0.2 30)` | Только 4 элемента — см. список ниже |
| Destructive | `--destructive` / `text-destructive`, `bg-destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | Только деструктивные подтверждения — в Phase 7 таких операций нет (см. раздел ниже). Используется ТОЛЬКО для семантики ошибок (красный цвет отрицательной прибыли в таблице берётся из Tailwind palette `text-red-600`, не из `--destructive`, чтобы отличить «финансовый отрицательный» от «опасное действие»). |

**Accent (primary) зарезервирован СТРОГО для:**
1. **Активная tab-ссылка** «WB» в `PricesTabs` (`border-primary text-primary` — тот же паттерн, что `CardsTabs`).
2. **Главная CTA кнопка** «Сохранить как расчётную цену» внутри `PricingCalculatorDialog` (`<Button>` default variant, оранжевый фон).
3. **Ring-подсветка** фокуса на inputs и buttons (`--ring` = `--primary`).
4. **Бейдж «Текущая цена»** в первой строке каждой карточки — маленький `Badge` с `bg-primary/10 text-primary border-primary/30` (подчёркивает, что это baseline для сравнения).

Accent НЕ применяется к:
- Кнопкам шапки раздела («Синхронизировать с WB», «Синхронизировать акции», «Загрузить отчёт auto-акции») — они `variant="outline"` как в `WbSyncButton`.
- Ценовым строкам акций — у них свой визуал (см. ниже «Indicator strips»).
- Значениям прибыли — они используют семантические `text-green-600` / `text-red-600`.

**Семантические цвета (специфичные для Phase 7, вне 60/30/10):**

| Назначение | Light | Dark | Источник |
|-----------|-------|------|----------|
| Положительная прибыль / Re / ROI | `text-green-600` + `font-medium` | `text-green-500` | Tailwind palette (**D-13 из CONTEXT.md**) |
| Отрицательная прибыль / Re / ROI | `text-red-600` + `font-medium` | `text-red-500` | Tailwind palette (**D-13 из CONTEXT.md**) |
| Акция regular (полоска слева) | `border-l-4 border-l-blue-500 bg-blue-50/30` | `border-l-blue-400 bg-blue-500/10` | Синий — «официальная акция WB из API» |
| Акция auto (полоска слева) | `border-l-4 border-l-purple-500 bg-purple-50/30` | `border-l-purple-400 bg-purple-500/10` | Фиолетовый — «auto-акция, загружена из Excel» |
| Расчётная цена (полоска слева) | `border-l-4 border-l-amber-500 bg-amber-50/30` | `border-l-amber-400 bg-amber-500/10` | Янтарный — «пользовательский расчёт» |
| Текущая цена (без полоски) | дефолтный фон + бейдж primary | дефолтный фон + бейдж primary | Baseline — visual weight через `Badge` |
| Разделитель между Product (жирный) | `border-t-4 border-t-border` | `border-t-border` | Утолщение стандартной границы таблицы |
| Разделитель между WbCard внутри Product | `border-t border-t-border/60` | — | Тонкая полупрозрачная граница |

---

## Layout Patterns (Phase-specific)

Эти решения обязательны к исполнению — конкретизируют D-07, D-08, D-09, D-10, D-14, D-15 из CONTEXT.md с точки зрения визуального контракта.

### 1. Layout страницы `/prices/wb`

```
┌─────────────────────────────────────────────────────────────────────┐
│ <h1> Управление ценами          (из /prices/layout.tsx)             │
│ [WB] [Ozon]                     (PricesTabs, копия CardsTabs)        │
├─────────────────────────────────────────────────────────────────────┤
│ ┌─ GlobalRatesBar ─────────────────────────────────────────────┐    │
│ │ Кошелёк WB: [2,0]% │ Эквайринг: [2,7]% │ Тариф Джем: [1,0]%  │    │
│ │ Кредит: [7,0]%    │ Общие: [6,0]%     │ Налог: [8,0]%       │    │
│ └──────────────────────────────────────────────────────────────┘    │
│                                                                     │
│ [Синхронизировать с WB] [Скидка WB] [Синхронизировать акции]       │
│ [Загрузить отчёт auto-акции]                                        │
│                                                                     │
│ ┌─ PriceCalculatorTable (horizontal scroll) ─────────────────────┐  │
│ │ [Фото] [Сводка] [Ярлык] [Артикул] │ [30 столбцов расчёта…]    │  │
│ │ ─────  ──────── ─────── ────────  │ …                          │  │
│ │ Product A: WbCard 1: row1/row2/…                               │  │
│ │             WbCard 2: row1/row2/…                              │  │
│ │ ══════ (жирный разделитель Product) ══════                     │  │
│ │ Product B: WbCard 1: row1/row2/…                               │  │
│ └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2. `GlobalRatesBar` (D-02) — карточки ставок в шапке

**Решение:** inline-горизонтальная полоса карточек (**НЕ** tabs, **НЕ** accordion). Одна строка, адаптивная — на узких экранах wrap.

- Контейнер: `<Card>` из `components/ui/card` с `p-4 bg-muted/30 border`. Внутри `<div className="grid grid-cols-3 md:grid-cols-6 gap-4">`.
- Каждая ставка:
  ```tsx
  <div className="flex flex-col gap-1">
    <Label className="text-xs text-muted-foreground">Кошелёк WB</Label>
    <div className="flex items-center gap-1">
      <Input
        type="number"
        step="0.1"
        min="0"
        max="100"
        className="h-8 w-20 text-sm"
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  </div>
  ```
- Save policy: debounce 500ms → server action `updateAppSetting(key, value)` → toast «Сохранено» при успехе, `toast.error` при ошибке.
- Валидация: `0 ≤ value ≤ 100`, **1 знак после запятой**, шаг 0.1.
- Все 6 ставок сохраняются **глобально** (общие для всех пользователей с правом `PRICES/MANAGE`).

### 3. Кнопки шапки (D-05, D-06)

Порядок слева направо, все `variant="outline"`, один размер `default`, `gap-2` между кнопками, контейнер `flex flex-wrap`:

| Кнопка | Иконка (lucide) | Label | Особенности |
|--------|-----------------|-------|-------------|
| Синхронизировать с WB | `RefreshCw` | «Синхронизировать с WB» | Уже существует (`WbSyncButton.tsx`) — переиспользуется |
| Скидка WB | `Percent` | «Скидка WB» | Уже существует (`WbSyncSppButton.tsx`) — переиспользуется |
| Синхронизировать акции | `Calendar` | «Синхронизировать акции» | Новая. Тот же паттерн, что `WbSyncButton`: `isPending` state → `animate-spin` на иконке, кнопка `disabled`, label меняется на «Синхронизация…», toast на успех/ошибку, `router.refresh()`. **Важно:** операция ~60 сек (rate limit) — label должен явно сообщать о прогрессе: «Синхронизация… (N/M акций)». |
| Загрузить отчёт auto-акции | `Upload` | «Загрузить отчёт auto-акции» | Новая. Паттерн `WbUploadIuButton.tsx`: `<input type="file">` скрыт, кнопка триггерит клик. Но здесь **до** файла — dropdown выбора auto-акции (нативный `<select>`). Реализуется через `Dialog` с формой: [select auto-акция] + [input file] + [Загрузить]. |

**Прогресс-индикация для «Синхронизировать акции»** (специфично для Phase 7):
- Spinner `RefreshCw animate-spin` рядом с label.
- Textual update через `toast.loading("Синхронизация акций…")` → `toast.success("Синхронизировано N акций, M номенклатур")`.
- Нет progress bar — операция fire-and-forget для UI, рассинхронизация редка.

### 4. `PriceCalculatorTable` — структура (D-07, D-08, D-09, D-10)

**Ключевые решения по вёрстке:**

- Контейнер: `<div className="rounded-md border">` вокруг `<Table>` как в WbCardsTable.
- **Горизонтальный скролл**: внутренний `<div className="relative overflow-x-auto">` (НЕ полагаемся на дефолтный wrapper `Table` — нужны sticky-колонки).
- **Sticky колонки**: Фото (80px), Сводка (240px), Ярлык (80px), Артикул (120px) — `position: sticky; left: {accumulated}; z-index: 20` (шапка), `z-index: 10` (ячейки). Фон sticky ячеек **не прозрачный** — `bg-background` для обычных строк, `bg-muted/30` для чередования.
- **Sticky шапка таблицы**: `<TableHeader>` с `sticky top-0 z-30 bg-background border-b`.
- **Высота строки**: `h-10` (40px) для ценовых строк, `h-14` (56px) для единственной Сводки (увеличена из-за 3 подстрок: Наименование / Остаток / Скорость).

**Ячейка «Фото» (colspan=1, rowSpan=N всех строк всех карточек Product):**

```tsx
<TableCell
  rowSpan={totalRowsOfProduct}
  className="sticky left-0 z-10 bg-background border-r w-20 align-top p-2"
>
  <div className="sticky top-0 flex items-start justify-center">
    <Image
      src={product.photoUrl || "/placeholder.png"}
      alt={product.name}
      width={72}
      height={96}
      className="rounded border object-cover aspect-[3/4]"
    />
  </div>
</TableCell>
```

**Критично:** фото с `aspect-[3/4]` (проектный стандарт для фото товаров), `object-cover`, `align-top` для ячейки — фото всегда в верхнем левом углу группы Product при длинной группе.

**Ячейка «Сводка» (rowSpan=N, sticky left после фото):**

```tsx
<TableCell rowSpan={totalRowsOfProduct} className="sticky left-20 z-10 bg-background border-r w-60 align-top p-3">
  <div className="flex flex-col gap-1.5">
    <div className="text-sm font-medium leading-snug line-clamp-3">{product.name}</div>
    <div className="text-xs text-muted-foreground">
      Остаток: <span className="text-foreground tabular-nums">{totalStock}</span> шт
    </div>
    <div className="text-xs text-muted-foreground">
      Скорость 7д: <span className="text-foreground tabular-nums">{avgSales.toFixed(1)}</span> шт/день
    </div>
  </div>
</TableCell>
```

**Ячейка «Ярлык» + «Артикул» (rowSpan=M для ценовых строк одной WbCard, sticky):**
- Ярлык — `sticky left-80` (80+240=320 — нет, считаем: 80 Фото + 240 Сводка = 320 → `left-[320px]`)
- Артикул — `sticky left-[400px]` (320 + 80 Ярлык = 400)
- Фон обязательно непрозрачный `bg-background`

**Indicator strip для ценовой строки** (левая граница-маркер ценового типа, рендерится в ПЕРВОЙ не-sticky колонке):

Порядок рендера по D-10:
1. **Текущая цена** (1 строка) — без border-left, в первой колонке мелкий `<Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Текущая</Badge>`
2. **Regular акции** (0..N строк, отсортированы `planPrice DESC`) — `border-l-4 border-l-blue-500` на всю строку, название акции с tooltip
3. **Auto акции** (0..N строк, `planPrice DESC`, только если есть данные из Excel) — `border-l-4 border-l-purple-500`
4. **Расчётные цены** (0..3 строки по slot 1/2/3) — `border-l-4 border-l-amber-500`, название из `CalculatedPrice.name` редактируемое

**Tooltip на названии акции (D-11):**
- Использовать shadcn `tooltip` (нужно добавить: `npx shadcn add tooltip`).
- Триггер — span с названием акции (`text-sm hover:underline cursor-help`).
- Контент: `description` (первые 200 символов или полный) + список `advantages[]` маркированным списком.
- Макс ширина tooltip: `max-w-sm` (384px), `text-xs` для плотности.

**Click по ценовой строке (D-14):**
- Вся строка (включая sticky-колонки) — `cursor-pointer`, `hover:bg-muted/50` (совместимо с `TableRow` defaults).
- `onClick` открывает `PricingCalculatorDialog` с передачей `wbCard`, `initialSellerPrice`, `rowType` (current | regular | auto | calculated), `calculatedSlot?`.
- **Важно:** click на input ставок `GlobalRatesBar` не должен триггерить открытие модалки (event.stopPropagation не нужен — это другой компонент).

**Типографика 30-колонок:** все 30 расчётных ячеек используют `text-xs tabular-nums text-right` (числа выравниваются по правому краю, моноширинные цифры для сравнения столбцов). Заголовки (`<TableHead>`) — `text-xs font-medium text-muted-foreground text-right px-2` + свойство `writing-mode` НЕ применяется (не вертикальный текст — читаемо горизонтально, колонки узкие но не <60px).

### 5. `PricingCalculatorDialog` — структура (D-14, D-15)

**Тип:** shadcn `<Dialog>` (base-ui backed). **НЕ** drawer, **НЕ** full-page, **НЕ** sheet.

**Размеры:**
```tsx
<DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
```
- Ширина больше, чем стандарт (`sm:max-w-xl` как в `UserDialog`), потому что модалка 2-колоночная.
- `max-h-[92vh] overflow-y-auto` — паттерн `UserDialog` из проекта.

**Внутренний layout:**

```tsx
<DialogHeader>
  <DialogTitle>Расчёт юнит-экономики: {wbCard.name}</DialogTitle>
  <DialogDescription>
    Артикул: {wbCard.nmId} · Исходная цена: {initialSellerPrice} ₽
  </DialogDescription>
</DialogHeader>

<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
  {/* Левая колонка — INPUTS */}
  <div className="space-y-4">
    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Входные параметры</h3>
    {/* Цена продавца до скидки */}
    {/* Скидка продавца % */}
    {/* ДРР % + checkbox "только этот товар" */}
    {/* Брак % + checkbox "только этот товар" */}
    {/* Доставка ₽ */}
    {/* Себестоимость ₽ (readonly из ProductCost) */}
    {/* Скидка WB (СПП) % (readonly из WbCard.discountWb) */}
    {/* Комиссия ИУ % (readonly из WbCard.commFbwIu) */}
    {/* Глобальные ставки (collapsible) */}
  </div>

  {/* Правая колонка — OUTPUTS (realtime) */}
  <div className="space-y-3 md:border-l md:pl-6">
    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Результат расчёта</h3>
    {/* 30 строк расчёта в компактной таблице или list-выводе */}
    {/* Выделены: Прибыль, Re продаж, ROI */}
  </div>
</div>

<DialogFooter>
  <div className="flex items-center gap-3 w-full">
    <label className="text-sm">Сохранить в слот:</label>
    <select className="h-9 rounded border border-input bg-transparent px-2 text-sm">
      <option value="1">Слот 1</option>
      <option value="2">Слот 2</option>
      <option value="3">Слот 3</option>
    </select>
    <Input placeholder="Название (опционально)" className="h-9 flex-1" />
    <Button variant="outline" onClick={onClose}>Отмена</Button>
    <Button type="submit">Сохранить как расчётную цену</Button>
  </div>
</DialogFooter>
```

**Поведение inputs:**
- `react-hook-form` + `zod` resolver (паттерн `UserForm`, `ProductForm`).
- **Все изменения — `onChange` без debounce** для realtime-пересчёта правой колонки (входных не много, пересчёт на клиенте дешёвый).
- Вычисление на клиенте — чистая функция `calculatePricing(inputs): outputs` в `lib/pricing-math.ts`, детерминированная, без побочных эффектов.
- Чекбоксы «только этот товар» для ДРР/брака — изменяют Т-сохранение: если true → `Product.drrOverridePct`; если false → `Subcategory.defaultDrrPct` (с предупреждающим toast «Изменение применится ко всем товарам подкатегории»).

**Чередование цветов output-секции:**
- Первые 27 полей (цепочка расчёта) — `text-xs tabular-nums`, двухколоночная: `<dt className="text-muted-foreground">` + `<dd className="text-right">`.
- **Прибыль, Re продаж, ROI** — отдельная выделенная карточка `bg-muted/50 p-3 rounded-md`, `text-base font-medium`, семантический цвет (green ≥0 / red <0).

---

## Copywriting Contract

| Element | Copy (RU) | Контекст использования |
|---------|-----------|------------------------|
| Page title | «Управление ценами» | `<h1>` в `/prices/layout.tsx` |
| Active tab | «WB» / «Ozon» | `PricesTabs` |
| Section label — Global rates | «Глобальные ставки» | Заголовок `GlobalRatesBar` (визуально не выводится, aria-label достаточно) |
| Rate labels | «Кошелёк WB», «Эквайринг», «Тариф Джем», «Кредит», «Общие», «Налог» | По 1 на ставку |
| Sync button (существующая) | «Синхронизировать с WB» | `WbSyncButton` переиспользуется |
| Sync SPP button (существующая) | «Скидка WB» | `WbSyncSppButton` переиспользуется |
| Primary CTA — новая кнопка | «Синхронизировать акции» | Шапка раздела |
| Primary CTA — pending | «Синхронизация… ({current}/{total})» | Во время выполнения, с счётчиком прогресса |
| Upload button | «Загрузить отчёт auto-акции» | Шапка раздела |
| Upload dialog title | «Загрузка отчёта auto-акции WB» | Заголовок модалки выбора акции + файла |
| Upload dialog label (select) | «Auto-акция» | Nativе `<select>` в модалке загрузки |
| Upload dialog label (file) | «Файл Excel из кабинета WB» | `<input type="file">` |
| Upload dialog submit | «Загрузить» | Кнопка submit |
| **Primary CTA (модалка расчёта)** | **«Сохранить как расчётную цену»** | Submit `PricingCalculatorDialog` |
| Modal title | «Расчёт юнит-экономики: {wbCard.name}» | `DialogTitle` |
| Modal section — inputs | «Входные параметры» | Заголовок левой колонки |
| Modal section — outputs | «Результат расчёта» | Заголовок правой колонки |
| Modal checkbox | «только этот товар» | Рядом с полями ДРР и Брак |
| Modal slot select | «Сохранить в слот:» | Footer модалки |
| Modal slot options | «Слот 1», «Слот 2», «Слот 3» | Nативный select |
| Modal name placeholder | «Название (опционально)» | Input для имени расчётной цены |
| Calculated price default name | «Расчётная цена 1» / «2» / «3» | Fallback если поле пустое |
| Current price badge | «Текущая» | `<Badge>` в первой ценовой строке |
| Promo row tooltip | `{promotion.description}` + список `{promotion.advantages[]}` | Динамический из БД |
| Column headers (top 4) | «Фото», «Сводка», «Ярлык», «Артикул» | Sticky колонки |
| Column headers (30 расчётных) | Строго по ТЗ — см. canonical Excel `Форма управления ценами.xlsx`. Планер при реализации берёт текст заголовков из Excel 1:1. | — |
| Row value — sales speed | «{N} шт/день» | В колонке Сводка |
| Row value — stock | «{N} шт» | В колонке Сводка |
| **Empty state heading 1** | **«Нет карточек с привязкой к товарам»** | Если `WbCard` существуют, но ни одна не связана с Product через `MarketplaceArticle` (фильтр аналогичный, как в `/cards/wb` с зелёной галочкой) |
| **Empty state body 1** | «Синхронизируйте карточки WB и привяжите их к товарам на странице Карточки товаров → WB, затем вернитесь сюда.» | Ссылка `<Link href="/cards/wb">Карточки WB</Link>` — `text-primary underline` |
| **Empty state heading 2** | **«Акции не синхронизированы»** | Если `linkedCards.length > 0` но `WbPromotion.count == 0` — показывается как **info-alert** в шапке таблицы (НЕ вместо таблицы), таблица рендерится без ценовых строк акций, только Текущая + Расчётные |
| Empty state body 2 | «Нажмите «Синхронизировать акции», чтобы загрузить текущие и будущие акции WB на 60 дней вперёд.» | Inline текст в `<Alert>` |
| **Error state — sync failure** | **«Не удалось синхронизировать акции: {error.message}. Попробуйте ещё раз через минуту (WB API rate limit).»** | `toast.error` при 429 или network error |
| Error state — upload failure | «Не удалось распознать Excel: {error.message}. Проверьте формат файла — ожидается отчёт из кабинета WB по auto-акции.» | `toast.error` при парсинге |
| Error state — save calc | «Не удалось сохранить расчёт: {error.message}» | `toast.error` в модалке |
| Success state — sync | «Синхронизировано {N} акций, {M} номенклатур» | `toast.success` |
| Success state — upload | «Загружено {N} строк в акцию «{promotion.name}»» | `toast.success` |
| Success state — save calc | «Расчётная цена «{name}» сохранена» | `toast.success` |
| Success state — rates | «Ставки сохранены» | `toast.success` после debounced save |
| **Destructive actions** | **Нет в Phase 7** — см. раздел ниже | — |

### Destructive Actions

**В Phase 7 нет деструктивных действий, требующих подтверждения.**

- Расчётные цены **перезаписываются** в слоте при сохранении (upsert) — это не «удаление», это «обновление», не требует confirm.
- Удаление `CalculatedPrice` **deferred** (не в scope фазы — см. `<deferred>` в CONTEXT.md).
- Загрузка Excel auto-акции **перезаписывает** существующие номенклатуры для той же `promotionId` (upsert) — не deletion, но стоит предупредить: `toast.info` перед загрузкой: «Существующие данные для акции «{name}» будут обновлены». Это info-предупреждение, не блокирующий confirm.
- Синхронизация акций **удаляет** акции с `endDateTime < сегодня - 7 дней` (D-05) — это автоматическая cleanup-логика, не user-initiated деструкция, без confirmation-диалога.

Если планер обнаружит потребность в confirm-диалоге — использовать паттерн shadcn `AlertDialog` (не установлен, добавить через `npx shadcn add alert-dialog`), но **такая потребность не предвидится**.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official (base-nova) | `table`, `dialog`, `button`, `input`, `form`, `checkbox`, `switch`, `label`, `badge`, `card`, `separator`, `sonner`, `alert` — все уже установлены | not required |
| shadcn official (base-nova) | `tooltip` — **новый, добавляется в Phase 7** | not required (official registry) |
| Third-party registries | **нет** | not applicable |

**Никаких сторонних registry** в Phase 7. Вся визуальная инвентаризация — официальный shadcn base-nova + собственные компоненты проекта (`components/cards/`, `components/users/`, etc. — как референсы паттернов).

---

## Component Inventory (для planner)

Новые компоненты, которые планер должен создать в Phase 7:

| Путь | Тип | Назначение |
|------|-----|-----------|
| `app/(dashboard)/prices/layout.tsx` | RSC layout | `requireSection("PRICES")` + `<h1>` + `<PricesTabs>` + children |
| `app/(dashboard)/prices/page.tsx` | RSC page | Redirect на `/prices/wb` (или default view) |
| `app/(dashboard)/prices/wb/page.tsx` | RSC page | Data fetch (linked cards + promotions + rates + calculated prices + product fallback-поля), рендер `<GlobalRatesBar>`, кнопки шапки, `<PriceCalculatorTable>` |
| `app/(dashboard)/prices/ozon/page.tsx` | RSC page | `<ComingSoon sectionName="Управление ценами Ozon" />` (D-16) |
| `components/prices/PricesTabs.tsx` | Client component | WB/Ozon tabs — копия `CardsTabs.tsx` с другими путями |
| `components/prices/GlobalRatesBar.tsx` | Client component | 6 inputs ставок с debounced save через server action |
| `components/prices/PriceCalculatorTable.tsx` | Client component | Широкая таблица с rowSpan, sticky columns, clickable rows, indicator strips |
| `components/prices/PricingCalculatorDialog.tsx` | Client component | 2-колоночная модалка inputs/outputs с realtime расчётом |
| `components/prices/WbPromotionsSyncButton.tsx` | Client component | Кнопка синхронизации акций (паттерн `WbSyncButton`) |
| `components/prices/WbAutoPromoUploadButton.tsx` | Client component | Кнопка + dialog для загрузки Excel auto-акции |
| `components/prices/PromoTooltip.tsx` | Client component | Wrapper для tooltip с description + advantages (D-11) |
| `components/ui/tooltip.tsx` | shadcn component | Добавить через `npx shadcn add tooltip` |
| `lib/pricing-math.ts` | Pure function module | `calculatePricing(inputs): outputs` — чистые формулы из ТЗ и Excel, golden-test case: nmId 800750522 (из `<specifics>` CONTEXT.md) |

Переиспользуемые существующие компоненты:
- `components/cards/WbSyncButton.tsx` — остаётся как есть (кнопка «Синхронизировать с WB» в шапке)
- `components/cards/WbSyncSppButton.tsx` — остаётся (кнопка «Скидка WB»)
- `components/ui/*` — все уже есть, кроме Tooltip

---

## Interaction States

| State | Визуальное отображение |
|-------|------------------------|
| Row hover | `hover:bg-muted/50` (дефолт TableRow из shadcn) + `cursor-pointer` |
| Row clicked | Instant open `PricingCalculatorDialog` — без intermediate loading (данные уже в DOM) |
| Button loading (sync) | `<RefreshCw className="animate-spin" />` + label «Синхронизация…» + `disabled={true}` |
| Button loading (save rates) | Инлайн spinner 12×12 справа от input, `animate-spin` |
| Input focus | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0` (стандарт shadcn base-nova) |
| Tooltip hover delay | `delayDuration={200}` (shadcn default) |
| Dialog open animation | `data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95` (уже в `components/ui/dialog.tsx`) |
| Toast position | `position="top-right"` (проверить текущий `<Toaster />`, изменить если нужно; default shadcn sonner) |
| Table horizontal scroll | Нативный `overflow-x-auto` + sticky columns — пользователь видит scrollbar внизу контейнера |
| Empty state (no linked cards) | Центрированный блок `text-center py-16`: иконка `Package` (lucide) 48px в `text-muted-foreground`, `<h3>` bold sm, body xs muted, CTA `<Button variant="outline">Перейти к карточкам</Button>` |
| Empty state (no promotions) | `<Alert>` (shadcn `alert` уже установлен) над таблицей с иконкой `Info` и текстом из copywriting contract |

---

## Accessibility

| Элемент | Требование |
|---------|-----------|
| Всем кнопкам | `<Button>` из shadcn уже даёт корректный focus ring, aria-disabled во время pending |
| Icon-only buttons | Нет в Phase 7 — все кнопки имеют текстовый label |
| Tooltip | Обязательно `aria-describedby` через shadcn Tooltip wrapper — устанавливается автоматически |
| Table | `<table>` семантика (нативная), заголовки `<th>` через `<TableHead>`, связь row↔col автоматическая |
| Clickable rows | `<TableRow role="button" tabIndex={0} onKeyDown={enter → click}>` — клавиатурная навигация (Tab между строками, Enter для открытия модалки) |
| Modal | shadcn Dialog уже управляет focus trap и `aria-modal` через base-ui |
| Empty states | Семантический `<h3>` heading внутри — читается screen reader |
| Формы с зелёной/красной подсветкой | **Не полагаться только на цвет** — дублировать знаком «+» / «−» перед значениями `Re %` и `ROI %` для дальтоников. Прибыль — без знака (сама цифра со знаком). |
| Контраст текста на цветных strip-полосках | `bg-blue-50/30` / `bg-purple-50/30` / `bg-amber-50/30` + `text-foreground` → контраст проверен (все фоны <10% opacity → почти белый → контраст ≥4.5:1 с foreground) |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending

---

## Pre-populated Sources

| Источник | Что взято |
|----------|-----------|
| `07-CONTEXT.md` D-01..D-17 | Все бизнес-решения по модели данных, sticky columns, sticky sections, порядок строк, tooltip, click-handler, тип модалки, подсветка прибыли, RBAC, Ozon stub |
| `CLAUDE.md` (project root) | Stack (Next.js 15.5 + React 19 + Tailwind v4 + shadcn base-nova + base-ui), native select convention, язык UI русский, Moscow TZ, палитра oklch hue 28-30 |
| `components.json` | shadcn preset `base-nova`, iconLibrary `lucide`, baseColor `neutral`, cssVariables `true`, rsc `true`, aliases |
| `app/globals.css` | oklch переменные для light/dark, `--primary` hue 28, `--radius: 0.625rem`, chart-цвета |
| `components/cards/WbCardsTable.tsx` | Паттерн горизонтальной таблицы с pagination, URL params, sort, checkboxes |
| `components/cards/CardsTabs.tsx` | Паттерн WB/Ozon табов (копируется в `PricesTabs`) |
| `components/cards/WbSyncButton.tsx` | Паттерн кнопки синхронизации с spin-иконкой и toast |
| `components/cards/WbUploadIuButton.tsx` | Паттерн загрузки Excel через multipart |
| `components/users/UserDialog.tsx` | Паттерн shadcn Dialog с react-hook-form, `sm:max-w-xl max-h-[92vh] overflow-y-auto` |
| `components/ui/dialog.tsx` | Стандартные классы `DialogContent`, `DialogHeader`, `DialogFooter` из base-nova preset |
| `components/ui/table.tsx` | Базовые паддинги `p-2`, hover `hover:bg-muted/50`, wrapper `relative w-full overflow-x-auto` |
| Excel `Форма управления ценами.xlsx` (canonical) | Заголовки 30 столбцов расчёта, формулы, golden test case nmId 800750522 |

**Вопросов к пользователю не задавалось** — все design decisions выведены из CONTEXT.md и существующих паттернов проекта.
