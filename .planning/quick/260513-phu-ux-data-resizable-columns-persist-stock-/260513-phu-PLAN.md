---
phase: 260513-phu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/use-resizable-columns.ts
  - lib/copy-to-clipboard.ts
  - components/prices/PriceCalculatorTable.tsx
  - components/stock/StockProductTable.tsx
  - components/stock/StockWbTable.tsx
  - app/(dashboard)/prices/wb/page.tsx
autonomous: true
requirements:
  - UX-260513-PHU-01  # resizable columns + persist в /stock и /stock/wb
  - UX-260513-PHU-02  # title wrap (line-clamp-2) + always-on Tooltip с полным названием
  - UX-260513-PHU-03  # copy SKU/article на клик с toast.success
  - UX-260513-PHU-04  # brand name под product name в /prices/wb Сводной
must_haves:
  truths:
    - "В /stock и /stock/wb колонки таблицы можно тянуть за правую границу — ширина изменяется визуально"
    - "После перезагрузки страницы (или повторного открытия раздела) сохранённые ширины колонок применяются автоматически"
    - "Двойной клик по handle сбрасывает ширину колонки к дефолту"
    - "Product name в Сводной строке /prices/wb, /stock и /stock/wb отображается максимум в 2 строки (line-clamp-2)"
    - "При наведении на product name (в любой из 3 таблиц) появляется Tooltip с полным названием"
    - "Клик на ячейку с SKU (УКТ) в /stock и /stock/wb копирует значение в clipboard + показывает toast.success «Скопировано: УКТ-…»"
    - "Клик на ячейку с маркетплейсным артикулом (per-article строка /stock) копирует значение артикула + toast"
    - "В /prices/wb Сводная строка под product name показывает product.brand.name мелким шрифтом text-muted-foreground"
    - "В /stock и /stock/wb brand-line под name отсутствует (НЕ дублируется/НЕ удаляется существующий brandName в Сводке /stock — он уже там, не трогаем)"
    - "PriceCalculatorTable использует общий хук useResizableColumns вместо in-line логики; код переиспользуется"
    - "Sticky-структура шапки не сломана: thead остаётся sticky, фон background сплошной, нет мерцания при scroll"
  artifacts:
    - path: "lib/use-resizable-columns.ts"
      provides: "Shared React hook + DB-persist логика для resizable columns с DEFAULT_WIDTHS merge"
      exports: ["useResizableColumns", "ColumnResizeHandle"]
    - path: "lib/copy-to-clipboard.ts"
      provides: "Pure helper для copy + toast.success/error"
      exports: ["copyToClipboard"]
    - path: "components/prices/PriceCalculatorTable.tsx"
      provides: "Мигрирован на useResizableColumns + always-on Tooltip на product name + brand line + copyToClipboard helper"
      contains: "useResizableColumns"
    - path: "components/stock/StockProductTable.tsx"
      provides: "Resizable headers + DB persist (stock.columnWidths) + Tooltip на name + copy SKU/article"
      contains: "useResizableColumns"
    - path: "components/stock/StockWbTable.tsx"
      provides: "Resizable sticky headers (Фото/Сводка/Артикул) + Tooltip на name + copy SKU"
      contains: "useResizableColumns"
    - path: "app/(dashboard)/prices/wb/page.tsx"
      provides: "Передача product.brand.name в ProductGroup.product для рендера brand-line"
      contains: "brand: firstProduct.brand?.name"
  key_links:
    - from: "components/prices/PriceCalculatorTable.tsx"
      to: "lib/use-resizable-columns.ts"
      via: "import + useResizableColumns hook"
      pattern: "useResizableColumns\\(\"prices\\.wb\\.columnWidths\""
    - from: "components/stock/StockProductTable.tsx"
      to: "lib/use-resizable-columns.ts"
      via: "import + useResizableColumns hook"
      pattern: "useResizableColumns\\(\"stock\\.columnWidths\""
    - from: "components/stock/StockWbTable.tsx"
      to: "lib/use-resizable-columns.ts"
      via: "import + useResizableColumns hook"
      pattern: "useResizableColumns\\(\"stock\\.wb\\.columnWidths\""
    - from: "components/stock/StockProductTable.tsx"
      to: "lib/copy-to-clipboard.ts"
      via: "copyToClipboard helper на onClick SKU/article cell"
      pattern: "copyToClipboard\\("
    - from: "components/stock/StockWbTable.tsx"
      to: "lib/copy-to-clipboard.ts"
      via: "copyToClipboard helper на onClick SKU cell"
      pattern: "copyToClipboard\\("
---

<objective>
4 UX-улучшения в data-таблицах /prices/wb, /stock, /stock/wb:

1. **Resizable columns + persist** в /stock и /stock/wb (паттерн перенесён из PriceCalculatorTable, EXTRACT в shared hook)
2. **Title wrap (line-clamp-2) + always-on Tooltip** на product name во всех 3 таблицах
3. **Copy SKU/article на клик** + toast.success в /stock и /stock/wb (shared helper)
4. **Brand line под product name** в Сводной /prices/wb (только там, не в /stock)

Purpose: Меньше горизонтального scroll-а (resize колонок под свои данные), легче читать длинные названия (tooltip), быстрее копировать артикул в WB-кабинет (1 клик).

Output:
- Новый `lib/use-resizable-columns.ts` — переиспользуемый hook (extracted из PriceCalculatorTable)
- Новый `lib/copy-to-clipboard.ts` — pure helper для copy+toast
- PriceCalculatorTable.tsx мигрирован на shared hook (без поведенческих регрессий)
- StockProductTable.tsx + StockWbTable.tsx используют shared hook + helper
- /prices/wb page.tsx передаёт product.brand.name в ProductGroup для рендера brand-line
- tsc 0 errors
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md

# Канонический источник resizable + persist (extract from here):
@components/prices/PriceCalculatorTable.tsx

# Tooltip wrapper pattern (base-ui render-prop):
@components/prices/PromoTooltip.tsx
@components/ui/tooltip.tsx

# Server action для persist:
@app/actions/user-preferences.ts

# Целевые таблицы для применения:
@components/stock/StockProductTable.tsx
@components/stock/StockWbTable.tsx

# Pages — нужен brand.name в ProductGroup для /prices/wb:
@app/(dashboard)/prices/wb/page.tsx

<interfaces>
<!-- Ключевые типы и контракты, которые нужны исполнителю. -->
<!-- НЕ нужно лазить по кодовой базе — всё здесь. -->

### Существующий server action для persist (lib/copy-to-clipboard helper + useResizableColumns hook должны использовать это):

```typescript
// app/actions/user-preferences.ts
export async function getUserPreference<T = unknown>(key: string): Promise<T | null>
export async function setUserPreference<T = unknown>(
  key: string,
  value: T,
): Promise<{ ok: true; data?: T } | { ok: false; error: string }>
```

### Текущая in-line логика resizable в PriceCalculatorTable (что extract'ить):

Из PriceCalculatorTable.tsx (строки ~268-650 фрагменты — НЕ копируй buyoutPct/КОЛОНКИ, только generic resize-механику):

```typescript
const MIN_COLUMN_WIDTH = 60
const RESIZE_SAVE_DEBOUNCE_MS = 500

// State + drag mechanics:
//   - useState<Record<string, number>>(merge DEFAULT + initial)
//   - useRef<setTimeout> для debounced save через setUserPreference
//   - useRef<{key, startX, startWidth}> для drag (без re-render на каждое движение)
//   - useRef<rafId> для throttling via requestAnimationFrame
//   - handleMouseMove → requestAnimationFrame → setColumnWidths
//   - handleMouseUp → cleanup listeners + scheduleSave
//   - startResize(e, key) → preventDefault + stopPropagation + setup listeners + body.style.cursor = "col-resize"
//   - resetColumnWidth(key) → revert к DEFAULT_WIDTHS[key]
//   - useEffect cleanup на unmount (clearTimeout + cancelAnimationFrame + removeEventListener)

// Drag handle JSX:
<div
  onMouseDown={...}
  onDoubleClick={...}
  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 z-50"
  title="Потяните чтобы изменить ширину. Двойной клик — сброс к дефолту."
/>
```

### Текущая логика copy в PriceCalculatorTable (что заменить на helper):

```typescript
// PriceCalculatorTable.tsx line ~983
navigator.clipboard
  ?.writeText(nmId)
  .then(() => toast.success(`Артикул ${nmId} скопирован`))
  .catch(() => toast.error("Не удалось скопировать"))
```

### Текущий StockProductRow (из lib/stock-data.ts — поля доступны):

В StockProductTable per-Product Сводная строка:
- `p.name` (string) — длинное название
- `p.sku` (string) — УКТ-000xxx
- `p.brandName` (string) — уже отображается (НЕ удалять, НЕ дублировать)
- `p.categoryName?` (string | null)

Per-article строки:
- `a.marketplaceName` (string) — например "Wildberries"
- `a.article` (string) — например nmId или ozon-артикул

### Текущий ProductWbGroup (из lib/stock-wb-data.ts):

- `g.productName` (string) — длинное
- `g.productSku` (string) — УКТ
- `g.brandName` (string) — уже отображается

Per-nmId строки: `card.nmId` (number) — артикул WB.

### Текущий ProductGroup (PriceCalculatorTable.tsx → /prices/wb):

Сейчас:
```typescript
product: {
  id: string
  name: string
  photoUrl: string | null
  totalStock: number
  totalAvgSalesSpeed: number
  totalOrdersYesterday: number
}
```

Нужно ДОБАВИТЬ:
```typescript
product: {
  // ... existing fields
  brandName?: string | null   // ← для brand-line в Сводной
}
```

И в page.tsx (line 638-646):
```typescript
groups.push({
  product: {
    id: firstProduct.id,
    name: firstProduct.name,
    photoUrl: firstProduct.photoUrl ?? null,
    brandName: firstProduct.brand?.name ?? null,  // ← новое поле
    totalStock,
    totalAvgSalesSpeed,
    totalOrdersYesterday,
  },
  ...
})
```

### Tooltip wrapper pattern (base-ui render-prop):

```tsx
<Tooltip>
  <TooltipTrigger render={<span className="..." />}>
    {children}
  </TooltipTrigger>
  <TooltipContent>...</TooltipContent>
</Tooltip>
```

КРИТИЧНО: base-ui Trigger по умолчанию рендерит `<button>`, а нам нужен `<div>` или `<span>` чтобы не ломать вёрстку Сводной cell. Используем render-prop.

</interfaces>
</context>

<scope_notes>

**Локально решённые архитектурные нюансы (документация для исполнителя):**

1. **localStorage vs UserPreference (DB):** Constraints предлагают localStorage. Но CLAUDE.md «Per-user UI настройки» ЯВНО предписывает DB UserPreference (НЕ localStorage), и канонический PriceCalculatorTable использует именно `setUserPreference` server action. Следуем CLAUDE.md и канону кода: persist через `getUserPreference`/`setUserPreference`. Ключи:
   - `prices.wb.columnWidths` — UNCHANGED (backward compat)
   - `stock.columnWidths` — NEW
   - `stock.wb.columnWidths` — NEW

2. **«hiddenColumns» в /prices/wb остаётся в PriceCalculatorTable** (не extract'им в hook). Это специфичная для prices фича — для /stock её добавлять НЕ требуется. Хук обслуживает только widths+persist.

3. **Tooltip placement:** Always-on (не overflow-detect). Tooltip оборачивает product name в Сводке /prices/wb, /stock, /stock/wb. Где текст уже короткий — тултип покажет ту же строку (UX OK, проще кода).

4. **Brand-line только в /prices/wb:** в /stock и /stock/wb brandName уже отображается отдельной строкой в Сводке — НЕ трогаем. Добавляем только в /prices/wb.

5. **Copy article semantics:**
   - /stock Сводная строка: копируем `p.sku` (УКТ-000xxx)
   - /stock per-article строки: копируем `a.article` (без префикса marketplace, голое значение)
   - /stock/wb Сводная: копируем `g.productSku`
   - /stock/wb per-nmId: копируем `String(card.nmId)`
   - /prices/wb: уже копирует `card.nmId` через inline-логику — заменяем на helper `copyToClipboard`

6. **Resizable columns в /stock — какие колонки:** Минимально 4 sticky (Фото/Сводка/Ярлык/Артикул) + 16 числовых (Производство, РФ, Иваново, МП О/З/Об/Д × 3 groups). Headers с rowSpan=2 — handle прикрепляется к ним. Sub-headers О/З/Об/Д (уровень 2) НЕ имеют resize handle (наследуют ширину родительской группы).

7. **Resizable columns в /stock/wb — какие колонки:** 3 sticky (Фото/Сводка/Артикул WB) + Иваново + Всего на WB + Товар в пути (3) + Итого WB (4). Кластерные колонки — БЕЗ resize (их структура зависит от expand state, добавление resize усложнит логику; отложено).

8. **NO ROADMAP.md updates** — quick task.

9. **NO deploy** — план stops at `tsc 0 errors`.

</scope_notes>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Extract shared hooks + helpers (useResizableColumns + copyToClipboard) + миграция PriceCalculatorTable</name>
  <files>
    lib/use-resizable-columns.ts,
    lib/copy-to-clipboard.ts,
    components/prices/PriceCalculatorTable.tsx
  </files>
  <action>
**Шаг 1.1 — Создать `lib/copy-to-clipboard.ts`:**

```typescript
// lib/copy-to-clipboard.ts
// Pure helper для копирования текста в clipboard с toast.success/error.
// Используется в /stock, /stock/wb, /prices/wb на клик по ячейке с артикулом.
//
// Edge case: navigator.clipboard может throw в не-HTTPS контексте (dev на http://).
// Возвращаем Promise<void> и просто toast.error при отказе.
"use client"

import { toast } from "sonner"

/** Копирует text в clipboard. По умолчанию toast.success c «Скопировано: <text>».
 *  Передайте label для кастомного префикса: copyToClipboard("UKT-001", "Артикул") → "Артикул UKT-001 скопирован". */
export async function copyToClipboard(text: string, label?: string): Promise<void> {
  if (!text) {
    toast.error("Нечего копировать")
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    if (label) {
      toast.success(`${label} ${text} скопирован`)
    } else {
      toast.success(`Скопировано: ${text}`)
    }
  } catch (e) {
    console.error("[copyToClipboard]", e)
    toast.error("Не удалось скопировать")
  }
}
```

**Шаг 1.2 — Создать `lib/use-resizable-columns.ts`:**

Extract generic resize-механику из PriceCalculatorTable.tsx (строки ~268-650). НЕ копировать column keys, DEFAULT_WIDTHS, hidden-логику или JSX вне ColumnResizeHandle — только реюзабельный core.

Структура файла:
```typescript
// lib/use-resizable-columns.ts
// Reusable hook для resizable columns в data-таблицах.
// Persist через UserPreference (DB) — см. CLAUDE.md «Per-user UI настройки».
// Извлечён из components/prices/PriceCalculatorTable.tsx (260410-mya) → переиспользуется в /stock, /stock/wb.
"use client"

import * as React from "react"
import { useState, useRef, useCallback, useEffect } from "react"
import { toast } from "sonner"
import { setUserPreference } from "@/app/actions/user-preferences"

const MIN_COLUMN_WIDTH = 60
const RESIZE_SAVE_DEBOUNCE_MS = 500

export interface UseResizableColumnsResult<K extends string> {
  /** Текущие ширины колонок (px). Используй для style={{ width, minWidth }} на <th>/<td>. */
  widths: Record<K, number>
  /** Стартовать drag для колонки. Передавай в onMouseDown handle'а. */
  startResize: (e: React.MouseEvent, key: K) => void
  /** Reset колонку к DEFAULT_WIDTHS[key]. Двойной клик по handle. */
  resetColumnWidth: (key: K) => void
}

/**
 * Hook для resizable columns с DB-persist.
 *
 * @param storageKey - Ключ в UserPreference (например "prices.wb.columnWidths")
 * @param defaultWidths - Дефолтные ширины колонок в px
 * @param initialWidths - Загруженные с сервера сохранённые ширины (RSC передаёт в props)
 *
 * Usage:
 * ```tsx
 * const { widths, startResize, resetColumnWidth } = useResizableColumns(
 *   "stock.columnWidths",
 *   { photo: 80, svodka: 240, sku: 120 },
 *   props.initialColumnWidths
 * )
 *
 * <th style={{ width: widths.photo, minWidth: widths.photo }} className="relative">
 *   Фото
 *   <ColumnResizeHandle
 *     onMouseDown={(e) => startResize(e, "photo")}
 *     onDoubleClick={() => resetColumnWidth("photo")}
 *   />
 * </th>
 * ```
 */
export function useResizableColumns<K extends string>(
  storageKey: string,
  defaultWidths: Record<K, number>,
  initialWidths?: Partial<Record<K, number>> | null,
): UseResizableColumnsResult<K> {
  // Merge: defaults + saved (unknown keys ignored)
  const [widths, setWidths] = useState<Record<K, number>>(() => ({
    ...defaultWidths,
    ...(initialWidths ?? {}),
  }))

  // Debounced save timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleSave = useCallback(
    (next: Record<K, number>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        const result = await setUserPreference(storageKey, next)
        if (!result.ok) {
          toast.error(`Не удалось сохранить ширины: ${result.error}`)
        }
      }, RESIZE_SAVE_DEBOUNCE_MS)
    },
    [storageKey],
  )

  // Drag state — ref-based для отсутствия re-render на каждое движение
  const resizeStateRef = useRef<{
    key: K
    startX: number
    startWidth: number
  } | null>(null)
  const rafIdRef = useRef<number | null>(null)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const state = resizeStateRef.current
    if (!state) return
    if (rafIdRef.current != null) return // throttle via rAF

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null
      const s = resizeStateRef.current
      if (!s) return
      const delta = e.clientX - s.startX
      const newWidth = Math.max(MIN_COLUMN_WIDTH, s.startWidth + delta)
      setWidths((prev) => ({ ...prev, [s.key]: newWidth }))
    })
  }, [])

  const handleMouseUp = useCallback(() => {
    resizeStateRef.current = null
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    document.removeEventListener("mousemove", handleMouseMove)
    document.removeEventListener("mouseup", handleMouseUp)
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
    setWidths((current) => {
      scheduleSave(current)
      return current
    })
  }, [handleMouseMove, scheduleSave])

  const startResize = useCallback(
    (e: React.MouseEvent, key: K) => {
      e.preventDefault()
      e.stopPropagation()
      resizeStateRef.current = {
        key,
        startX: e.clientX,
        startWidth: widths[key],
      }
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
    },
    [widths, handleMouseMove, handleMouseUp],
  )

  const resetColumnWidth = useCallback(
    (key: K) => {
      setWidths((prev) => {
        const next = { ...prev, [key]: defaultWidths[key] }
        scheduleSave(next)
        return next
      })
    },
    [defaultWidths, scheduleSave],
  )

  // Cleanup на unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current)
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  return { widths, startResize, resetColumnWidth }
}

/** Drag handle на правой границе <th>. Захватывает mouse + двойной клик для reset. */
export function ColumnResizeHandle({
  onMouseDown,
  onDoubleClick,
}: {
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 z-50"
      title="Потяните чтобы изменить ширину. Двойной клик — сброс к дефолту."
    />
  )
}
```

**Шаг 1.3 — Мигрировать PriceCalculatorTable.tsx на shared hook:**

В `components/prices/PriceCalculatorTable.tsx`:

a) Удалить локальные определения `MIN_COLUMN_WIDTH`, `RESIZE_SAVE_DEBOUNCE_MS`, `PREFERENCE_KEY`, `ColumnResizeHandle` функцию, `saveTimerRef`/`scheduleSave`/`resizeStateRef`/`rafIdRef`/`handleMouseMove`/`handleMouseUp`/`startResize`/`resetColumnWidth`/cleanup `useEffect` для resize (НО `hiddenSaveTimerRef`, `hiddenColumns`, `ColumnVisibilityDropdown` СОХРАНИТЬ — не извлекаются в hook).

b) Удалить `columnWidths` state (`useState<Record<ColumnKey, number>>(...)`)  — теперь приходит из hook.

c) Импортировать hook:
```typescript
import { useResizableColumns, ColumnResizeHandle } from "@/lib/use-resizable-columns"
```

d) Заменить inline state на вызов hook:
```typescript
const { widths: columnWidths, startResize, resetColumnWidth } = useResizableColumns<ColumnKey>(
  "prices.wb.columnWidths",
  DEFAULT_WIDTHS,
  initialColumnWidths,
)
```
Обрати внимание: переменная `columnWidths` сохраняет имя через destructuring `widths: columnWidths` — все 30+ обращений к `columnWidths[key]` остаются работать без правок.

e) Удалить из cleanup useEffect строки касающиеся `saveTimerRef`, `rafIdRef`, `handleMouseMove`/`handleMouseUp` (теперь cleanup делает hook). Сохранить только `hiddenSaveTimerRef`-cleanup.

f) Также в этом же таске — Tooltip + brand-line + copy-helper для PriceCalculatorTable:
   - Заменить inline `navigator.clipboard...then(...)` на `await copyToClipboard(String(cardGroup.card.nmId), "Артикул")` (строка ~983). Импортировать `import { copyToClipboard } from "@/lib/copy-to-clipboard"`.
   - В Сводной cell (строки ~873-876) обернуть `{group.product.name}` в `<Tooltip><TooltipTrigger render={<span className="text-sm font-medium leading-snug line-clamp-2 cursor-default" />}>{group.product.name}</TooltipTrigger><TooltipContent><div className="max-w-sm text-sm">{group.product.name}</div></TooltipContent></Tooltip>`. Импортировать `Tooltip, TooltipTrigger, TooltipContent` из `@/components/ui/tooltip`.
   - КРИТИЧНО: убрать существующий `<div className="text-sm font-medium leading-snug line-clamp-3">` обёртку — заменяем `line-clamp-3` на `line-clamp-2` per scope. Tooltip триггер сам становится span с этими классами.
   - Добавить brand-line ПОД product name. Использовать `group.product.brandName` (новое поле, заполняется в Task 3). Структура (если `brandName`):
     ```tsx
     {group.product.brandName && (
       <div className="text-xs text-muted-foreground">{group.product.brandName}</div>
     )}
     ```
     Размещать ДО `<div className="text-xs text-muted-foreground">Остаток:...</div>` (т.е. brand идёт сразу после name).
   - Расширить `ProductGroup.product` interface (строки ~149-165): добавить `brandName?: string | null`.

g) Убрать неиспользуемые импорты после migration (если `toast` остался только в `ColumnVisibilityDropdown` и `copyToClipboard`-замене — оставить; если нигде не используется — удалить).

**Regression test (manual smoke + tsc):**
- Открыть /prices/wb → resize работает идентично до миграции (drag, double-click reset)
- localStorage инспекция: НЕТ ключа `prices.wb.columnWidths` (всё в UserPreference)
- Hover на product name → tooltip с полным name
- Brand visible под name (когда `firstProduct.brand` не null — будет добавлено в Task 3)
- Click на artikul (nmId) → toast «Артикул 12345 скопирован»
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -50</automated>
  </verify>
  <done>
    - `lib/use-resizable-columns.ts` создан, экспортирует `useResizableColumns` и `ColumnResizeHandle`
    - `lib/copy-to-clipboard.ts` создан, экспортирует `copyToClipboard(text, label?)`
    - `components/prices/PriceCalculatorTable.tsx` мигрирован: использует hook, использует helper, product name обёрнут в Tooltip с line-clamp-2, brand-line под name (когда есть)
    - ProductGroup.product типизирован с `brandName?: string | null`
    - tsc — 0 errors
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Применить useResizableColumns + Tooltip + copy в StockProductTable и StockWbTable</name>
  <files>
    components/stock/StockProductTable.tsx,
    components/stock/StockWbTable.tsx,
    app/(dashboard)/stock/page.tsx,
    app/(dashboard)/stock/wb/page.tsx
  </files>
  <action>
**Шаг 2.1 — `components/stock/StockProductTable.tsx`:**

a) Импортировать hook + helper + Tooltip:
```typescript
import { useResizableColumns, ColumnResizeHandle } from "@/lib/use-resizable-columns"
import { copyToClipboard } from "@/lib/copy-to-clipboard"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
```

b) Расширить props interface:
```typescript
interface StockProductTableProps {
  products: StockProductRow[]
  turnoverNormDays: number
  initialColumnWidths?: Record<string, number> | null  // ← новое
}
```

c) Определить дефолтные ширины колонок. Сейчас в коде магические числа: w-20 (80px), w-60 (240px), w-[120px]. Колонки структурно:
```typescript
type StockColumnKey =
  | "photo" | "svodka" | "yarlyk" | "artikul"
  | "production" | "rf" | "ivanovo"
  | "mpO" | "mpZ" | "mpOb" | "mpD"
  | "wbO" | "wbZ" | "wbOb" | "wbD"
  | "ozonO" | "ozonZ" | "ozonOb" | "ozonD"

const STOCK_DEFAULT_WIDTHS: Record<StockColumnKey, number> = {
  photo: 80,
  svodka: 240,
  yarlyk: 80,
  artikul: 120,
  production: 88,
  rf: 70,
  ivanovo: 70,
  mpO: 56, mpZ: 56, mpOb: 56, mpD: 56,
  wbO: 56, wbZ: 56, wbOb: 56, wbD: 56,
  ozonO: 56, ozonZ: 56, ozonOb: 56, ozonD: 56,
}
```

d) Использовать hook:
```typescript
const { widths, startResize, resetColumnWidth } = useResizableColumns<StockColumnKey>(
  "stock.columnWidths",
  STOCK_DEFAULT_WIDTHS,
  initialColumnWidths,
)
```

e) Применить `widths` в шапке таблицы. На каждый top-level `<TableHead>` (rowSpan=2 sticky + colSpan группы):
   - `style={{ width: widths.photo, minWidth: widths.photo }}` (вместо `w-20`)
   - Добавить `relative` к className (необходимо для absolute-positioned handle)
   - Добавить `<ColumnResizeHandle onMouseDown={(e) => startResize(e, "photo")} onDoubleClick={() => resetColumnWidth("photo")} />` внутрь cell

   Для **МП**/WB/Ozon top-level колонок (`colSpan=4`) handle вешать на саму группу-cell, но width-стиль вынужден применяться через sum 4-х sub-columns. Альтернатива простая (D-предлагаемая): применить style на колонки уровня 2 (sub-headers O/З/Об/Д) и НЕ менять группу-cell. Resize handle вешать только на uppermost cells (Фото/Сводка/Ярлык/Артикул/Производство/РФ/Иваново) — где rowSpan=2, ширина = ширина одной колонки. Группы МП/WB/Ozon делаем НЕ-resizable (caused by colSpan structure complexity).

   **Решение для МП/WB/Ozon:** resize индивидуальных sub-columns. Handle на каждой O/З/Об/Д cell (top-[40px] уровень 2). `style={{ width: widths.mpO, minWidth: widths.mpO }}` etc.

   Применить аналогично в `<TableBody>` `<TableCell>`-ах: для каждой data-ячейки добавить `style={{ width: widths.X, minWidth: widths.X }}`. Это требует точного маппинга 16 sub-columns на StockColumnKey. См. рендер в lines ~414-429 (Сводная строка) и ~466-484 (per-article).

f) **Critical: `table-fixed` class.** Текущая таблица использует `border-separate border-spacing-0`. Для надёжного resize добавить `table-fixed`:
```tsx
<table className="w-full caption-bottom text-sm border-separate border-spacing-0 table-fixed">
```

g) **Tooltip на product name (Сводная строка ~358-361):**
```tsx
<Tooltip>
  <TooltipTrigger render={
    <div className="text-sm font-medium leading-snug line-clamp-2 cursor-default" />
  }>
    {p.name}
  </TooltipTrigger>
  <TooltipContent>
    <div className="max-w-sm text-sm">{p.name}</div>
  </TooltipContent>
</Tooltip>
```
Оставить остальные строки (p.sku, p.brandName, p.categoryName) как есть.

h) **Copy SKU (Сводная строка) и Article (per-article строки):**

В Сводной cell с SKU (line ~362 `<div className="text-xs text-muted-foreground">{p.sku}</div>`):
```tsx
<div
  className="text-xs text-muted-foreground cursor-pointer hover:text-primary transition-colors"
  onClick={(e) => {
    e.stopPropagation()
    copyToClipboard(p.sku, "Артикул")
  }}
  title="Нажмите чтобы скопировать"
>
  {p.sku}
</div>
```

В per-article строке (line ~456 `{a.marketplaceName}: {a.article}`):
```tsx
<TableCell
  className="sticky z-20 bg-background border-r text-xs cursor-pointer hover:text-primary transition-colors"
  style={{ width: widths.artikul, minWidth: widths.artikul, left: ... }}
  onClick={(e) => {
    e.stopPropagation()
    copyToClipboard(a.article, "Артикул")
  }}
  title="Нажмите чтобы скопировать"
>
  {a.marketplaceName}: {a.article}
</TableCell>
```

Также применить `style={{ width: widths.X, minWidth: widths.X }}` к 4 sticky cells per-article строки (Ярлык, Артикул) — `left:` оффсеты пока остаются как магические числа (sticky stack pattern), но **ВАЖНО**: если ширины resize'аются, sticky `left:` offsets корректно НЕ работают (sticky offset не пересчитывается). Это ОК — pattern идентичен PriceCalculatorTable где sticky lefts вычислены через `cumulative widths` (см. PriceCalculatorTable line ~652 `stickyLefts`).

Реализуем cumulative sticky lefts (как в PriceCalculatorTable):
```typescript
const stickyLefts = {
  photo: 0,
  svodka: widths.photo,
  yarlyk: widths.photo + widths.svodka,
  artikul: widths.photo + widths.svodka + widths.yarlyk,
}
```
Применить в каждом sticky cell: `style={{ left: stickyLefts.svodka, width: widths.svodka, minWidth: widths.svodka }}` и т.д.

i) **app/(dashboard)/stock/page.tsx:** загрузить `getUserPreference<Record<string, number>>("stock.columnWidths")` параллельно с другими данными:
```typescript
import { getUserPreference } from "@/app/actions/user-preferences"
// ...
const [stockData, filterOptions, stockColumnWidths] = await Promise.all([
  getStockData(filters),
  getStockFilterOptions(),
  getUserPreference<Record<string, number>>("stock.columnWidths"),
])
// ...
<StockProductTable
  products={stockData.products}
  turnoverNormDays={stockData.turnoverNormDays}
  initialColumnWidths={stockColumnWidths}
/>
```

**Шаг 2.2 — `components/stock/StockWbTable.tsx`:**

a) Same импорты useResizableColumns, ColumnResizeHandle, Tooltip, copyToClipboard.

b) Расширить Props:
```typescript
interface Props {
  groups: ProductWbGroup[]
  turnoverNormDays: number
  clusterWarehouses: StockWbDataResult["clusterWarehouses"]
  hiddenWarehouseIds: number[]
  initialShowSizes: boolean
  initialColumnWidths?: Record<string, number> | null  // ← новое
}
```

c) Дефолтные ширины (3 sticky + Иваново + Всего на WB + Товар в пути ×3 + Итого WB ×4 = 12 ключей; кластеры НЕ resize'аются по решению):
```typescript
type StockWbColumnKey =
  | "photo" | "svodka" | "artikulWb"
  | "ivanovo" | "totalOnWb"
  | "inWayTotal" | "inWayFrom" | "inWayTo"
  | "totalO" | "totalZ" | "totalOb" | "totalD"

const STOCK_WB_DEFAULT_WIDTHS: Record<StockWbColumnKey, number> = {
  photo: 80, svodka: 240, artikulWb: 96,
  ivanovo: 80, totalOnWb: 80,
  inWayTotal: 60, inWayFrom: 60, inWayTo: 60,
  totalO: 56, totalZ: 56, totalOb: 56, totalD: 56,
}
```

d) Hook:
```typescript
const { widths, startResize, resetColumnWidth } = useResizableColumns<StockWbColumnKey>(
  "stock.wb.columnWidths",
  STOCK_WB_DEFAULT_WIDTHS,
  initialColumnWidths,
)

const stickyLefts = {
  photo: 0,
  svodka: widths.photo,
  artikulWb: widths.photo + widths.svodka,
}
```

e) Применить `style={{ width, minWidth }}` к 12 заголовкам resize-абельным + handle. Кластерные `<TableHead>` (внутри `CLUSTER_ORDER.map`) — без handle, без width-стиля (наследуют от текущей логики w-default).

f) Применить аналогично в `<TableBody>` ко всем `<TableCell>`-ям соответствующих колонок. Sticky cells (Photo/Svodka/ArtikulWb) — `style={{ left: stickyLefts.X, width: widths.X, minWidth: widths.X }}`.

g) `table-fixed` class на `<table>`.

h) Tooltip + brand на product name (Сводная line ~467-471):
```tsx
<div className="flex flex-col gap-1">
  <Tooltip>
    <TooltipTrigger render={
      <div className="text-sm font-medium leading-snug line-clamp-2 cursor-default" />
    }>
      {g.productName}
    </TooltipTrigger>
    <TooltipContent>
      <div className="max-w-sm text-sm">{g.productName}</div>
    </TooltipContent>
  </Tooltip>
  <div
    className="text-xs text-muted-foreground cursor-pointer hover:text-primary transition-colors"
    onClick={(e) => {
      e.stopPropagation()
      copyToClipboard(g.productSku, "Артикул")
    }}
    title="Нажмите чтобы скопировать"
  >
    {g.productSku}
  </div>
  <div className="text-xs text-muted-foreground">{g.brandName}</div>
</div>
```

i) Copy на per-nmId Артикул (line ~549-551):
```tsx
<TableCell
  className="sticky z-20 bg-background border-r text-xs tabular-nums cursor-pointer hover:text-primary transition-colors"
  style={{ left: stickyLefts.artikulWb, width: widths.artikulWb, minWidth: widths.artikulWb }}
  onClick={(e) => {
    e.stopPropagation()
    copyToClipboard(String(card.nmId), "Артикул")
  }}
  title="Нажмите чтобы скопировать"
>
  {card.nmId}
</TableCell>
```

**Шаг 2.3 — `app/(dashboard)/stock/wb/page.tsx`:**

Аналогично stock/page.tsx — добавить параллельный fetch `getUserPreference<Record<string, number>>("stock.wb.columnWidths")` и передать как `initialColumnWidths`.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -80</automated>
  </verify>
  <done>
    - StockProductTable.tsx использует useResizableColumns + ColumnResizeHandle
    - StockWbTable.tsx использует useResizableColumns + ColumnResizeHandle
    - Обе таблицы: `table-fixed` class, sticky lefts cumulative из widths
    - Product name обёрнут в Tooltip с line-clamp-2 в обеих
    - SKU/article cells получили cursor-pointer + onClick → copyToClipboard
    - app/(dashboard)/stock/page.tsx и app/(dashboard)/stock/wb/page.tsx загружают и пробрасывают initialColumnWidths
    - tsc — 0 errors
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Передать brand.name в /prices/wb ProductGroup + финальная валидация</name>
  <files>
    app/(dashboard)/prices/wb/page.tsx
  </files>
  <action>
**Шаг 3.1 — `app/(dashboard)/prices/wb/page.tsx`:**

В блоке `groups.push({ product: {...} })` (строки 638-649) добавить поле `brandName`:

```typescript
groups.push({
  product: {
    id: firstProduct.id,
    name: firstProduct.name,
    photoUrl: firstProduct.photoUrl ?? null,
    brandName: firstProduct.brand?.name ?? null,  // ← новое
    totalStock,
    totalAvgSalesSpeed,
    totalOrdersYesterday,
  },
  cards: cardGroups,
  totalRowsInProduct,
})
```

Note: `firstProduct.brand` уже доступен в include (line ~195-202 — `brand: { select: { id: true, name: true, sortOrder: true, direction: {...} } }`), не требует дополнительного запроса. Поле опциональное в типе ProductGroup (расширено в Task 1).

**Шаг 3.2 — Финальная валидация:**

a) `npx tsc --noEmit` — 0 errors.
b) Найти и проверить, что нет `prices.wb.columnWidths` в localStorage (если был временный кэш):
   - Достаточно проверить, что `lib/use-resizable-columns.ts` ИСПОЛЬЗУЕТ `setUserPreference` и НЕ использует `localStorage`/`window.localStorage`.
c) Grep на остаточные дубликаты resize-логики: `grep -r "MIN_COLUMN_WIDTH" components/ lib/` — должна быть найдена только в `lib/use-resizable-columns.ts`.
d) Grep на остаточные inline-clipboards: `grep -r "navigator.clipboard.writeText" components/` — допустимо только в `components/users/UserTable.tsx` (старый код, не в scope), `components/support/ReturnsTable.tsx` (не в scope). В `components/prices/PriceCalculatorTable.tsx` и `components/stock/*.tsx` — НЕ должно быть.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -50 && grep -r "MIN_COLUMN_WIDTH" components/ lib/ 2>/dev/null | grep -v "use-resizable-columns" || echo "OK: no duplicate MIN_COLUMN_WIDTH"</automated>
  </verify>
  <done>
    - `firstProduct.brand?.name` пробрасывается в ProductGroup.product.brandName
    - tsc — 0 errors
    - Нет дубликатов resize-логики вне `lib/use-resizable-columns.ts`
    - Нет inline `navigator.clipboard.writeText` в /stock и /prices/wb компонентах (только helper)
  </done>
</task>

</tasks>

<verification>

**Шаг 1 — Type check:**
```bash
npx tsc --noEmit
```
Должен пройти с 0 errors.

**Шаг 2 — Smoke runtime check (если возможно `npm run dev`):**
- /prices/wb — resize колонок работает, brand отображается под product name в Сводной, hover на name → Tooltip с полным name, click на nmId → toast «Артикул XXX скопирован»
- /stock — resize sticky + основных data-колонок работает, ширины persist между перезагрузками, hover на name → Tooltip, click на SKU/article → toast
- /stock/wb — resize 3 sticky + Иваново/Всего/Товар в пути/Итого работает, кластерные колонки имеют фиксированную ширину (НЕ resize'аются — by design), hover на name → Tooltip, click на nmId → toast

**Шаг 3 — Регрессия PriceCalculatorTable:**
- Кнопка «Вид» (column visibility) — функционирует как раньше
- «Удалить выбранные» — функционирует
- Hidden columns persist отдельно через `prices.wb.hiddenColumns` (НЕ перепутан с `prices.wb.columnWidths`)

**Шаг 4 — Negative checks (CLAUDE.md sticky pattern):**
- Все таблицы используют `border-separate border-spacing-0 table-fixed`
- Thead — `bg-background` (сплошной), без `[&_tr]:border-b`
- Sticky cells имеют `bg-background` (или `bg-muted` для размерных строк), z-index ≥ 20

</verification>

<success_criteria>

**Plan complete when:**
- [x] `lib/use-resizable-columns.ts` создан, экспортирует hook + ColumnResizeHandle
- [x] `lib/copy-to-clipboard.ts` создан, экспортирует `copyToClipboard(text, label?)`
- [x] `components/prices/PriceCalculatorTable.tsx` мигрирован на shared hook + helper (без поведенческих регрессий)
- [x] `components/stock/StockProductTable.tsx` использует hook + helper + Tooltip
- [x] `components/stock/StockWbTable.tsx` использует hook + helper + Tooltip
- [x] `app/(dashboard)/stock/page.tsx` и `/stock/wb/page.tsx` загружают и передают initialColumnWidths
- [x] `app/(dashboard)/prices/wb/page.tsx` передаёт brand.name в ProductGroup.product.brandName
- [x] Brand-line отображается ТОЛЬКО в /prices/wb Сводной (не в /stock, не в /stock/wb)
- [x] tsc — 0 errors

**NOT in scope (explicit non-goals):**
- Deploy на VPS
- ROADMAP.md updates
- Unit-тесты hook (можно добавить позже, если возникнет регрессия)
- Resize кластерных колонок в /stock/wb (отложено — сложная expand-логика)

</success_criteria>

<output>
After completion, create `.planning/quick/260513-phu-ux-data-resizable-columns-persist-stock-/260513-phu-SUMMARY.md` с:
- Краткое описание (что сделано)
- Список изменённых файлов
- Acceptance статус по 11 must_haves.truths
- Любые отклонения от плана (если потребовались compromise'ы в layout)
- Команды для smoke-теста локально

Затем — git commit:
```
git add -A
git commit -m "feat(ux): resizable columns + tooltip + copy-article в /stock и /stock/wb

- lib/use-resizable-columns.ts — shared hook (extracted из PriceCalculatorTable)
- lib/copy-to-clipboard.ts — pure helper
- PriceCalculatorTable.tsx мигрирован на hook + helper, line-clamp-2 + Tooltip + brand-line
- StockProductTable.tsx, StockWbTable.tsx используют hook + helper + Tooltip
- /prices/wb ProductGroup.product теперь содержит brandName

Quick task: 260513-phu"
```
</output>
