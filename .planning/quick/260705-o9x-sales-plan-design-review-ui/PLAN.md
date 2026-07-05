---
task: 260705-o9x-sales-plan-design-review-ui
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - components/sales-plan/ProductPlanTable.tsx
  - components/sales-plan/PlanFactChart.tsx
  - components/sales-plan/ProductPlanDialog.tsx
  - components/sales-plan/ProductPlanCell.tsx
  - components/sales-plan/PlanFactMatrix.tsx
  - components/sales-plan/PlanFactSummaryCards.tsx
  - components/sales-plan/PlanFactControls.tsx
  - components/sales-plan/VirtualPurchasesTable.tsx
  - components/sales-plan/IncomingBadges.tsx
  - app/globals.css
  - app/(dashboard)/sales-plan/page.tsx
  - app/(dashboard)/sales-plan/products/page.tsx

must_haves:
  truths:
    - "ABC-бейджи, ±%-семантика и график читаемы в тёмной теме (токены/dark:-пары, нет hardcoded oklch в чарте)"
    - "Sticky-футер и sticky-заголовки таблицы товаров не просвечивают при скролле (сплошной bg на каждой ячейке, корректный z-index)"
    - "ИУ-линия графика использует новый токен --chart-iu с dark-парой"
    - "Терминология матрицы обновлена (SLA/ИУ формулировки, «Откл. от ИУ, %», «Вне плана (арт. без привязки)»)"
    - "Кнопка режима на /sales-plan/products — styled <a> с buttonVariants + иконка (без Button asChild)"
  artifacts:
    - path: "app/globals.css"
      provides: "--chart-iu токен в :root и .dark"
      contains: "--chart-iu"
    - path: "components/sales-plan/PlanFactChart.tsx"
      provides: "График на токенах темы (var(--chart-1/2/iu/muted-foreground))"
    - path: "components/sales-plan/ProductPlanTable.tsx"
      provides: "Sticky футер/заголовок с per-cell bg + ABC dark-классы"
  key_links:
    - from: "components/sales-plan/PlanFactChart.tsx"
      to: "app/globals.css --chart-iu"
      via: "stroke=\"var(--chart-iu)\""
      pattern: "var\\(--chart-iu\\)"
---

<objective>
UI/UX-правки раздела `/sales-plan` по итогам внешнего дизайн-ревью (2026-07-05).

Три группы правок по приоритету: P0 (критичные проблемы читаемости в dark-теме и sticky-просвечивание), P1 (семантика цветов + доводка компонентов), P2 (терминология, empty states, hit-area, глифы).

Purpose: сделать раздел консистентным с темой проекта (токены вместо hardcoded oklch/tailwind-без-dark-пар), устранить sticky-просвечивание, привести терминологию к однозначной.

Output: 12 изменённых файлов, зелёный `tsc --noEmit` + `next build` + vitest sales-plan.

ОГРАНИЧЕНИЯ (строго): только визуальные/UX-правки. НЕ трогать `lib/sales-plan/*`, `app/actions/sales-plan.ts`, схему БД, роутинг, RBAC. Цвета — токены темы или tailwind с обязательной `dark:`-парой. На sticky-ячейках сплошной `bg-background`/`bg-muted` БЕЗ модификатора прозрачности (`/NN`). Пункты переносить ДОСЛОВНО из спеки — ничего не выдумывать.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260705-o9x-sales-plan-design-review-ui/PLAN.md

Проектные конвенции (CLAUDE.md):
- Sticky data-таблицы: сплошной фон на КАЖДОЙ sticky-ячейке — только `bg-background`/`bg-muted`/`bg-card` БЕЗ `/NN`. `bg-muted/40` на sticky → просвечивание.
- Select: native HTML select (НЕ base-ui).
- Button: base-ui `<Button>` НЕ имеет `asChild`. Для styled-ссылки — `<a>` с `buttonVariants`.

<interfaces>
<!-- Извлечено из кодовой базы. Использовать напрямую, без доп. исследования. -->

components/ui/button.tsx экспортирует:
```typescript
export { Button, buttonVariants }
// buttonVariants = cva(...) с variant: default|outline|secondary|ghost|destructive|link
//                              size:    default|xs|sm|lg|icon|icon-xs|icon-sm|icon-lg
```

lib/utils.ts экспортирует `cn(...)`.

PlanFactChartPoint (components/sales-plan/PlanFactChart.tsx):
```typescript
export interface PlanFactChartPoint {
  key: string
  label: string
  planRub: number
  factRub: number
  iuRub: number
  unsettled?: boolean        // ← поле для приглушения bar
  isCurrentBucket?: boolean
}
// В cumulative-режиме ряд пересобирается через { ...d, planRub, factRub, iuRub } — поле `unsettled` сохраняется.
```

app/globals.css: `--chart-5` — последний chart-токен и в `:root` (строка 100), и в `.dark` (строка 138). Новый `--chart-iu` вставлять сразу после `--chart-5` в обоих блоках.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: P0 — критичные правки dark-читаемости и sticky (P0-1…P0-5)</name>
  <read_first>
    - components/sales-plan/ProductPlanTable.tsx (строки 89-93 ABC_CLASSES; thead 428-448; tfoot 711-745)
    - components/sales-plan/PlanFactChart.tsx (XAxis/YAxis 133-141; Bar/Line 148-178; ReferenceLine 180-193)
    - components/sales-plan/ProductPlanDialog.tsx (XAxis/YAxis 401-402; ReferenceLine 409)
    - app/globals.css (строки 96-100 :root chart-токены; 134-138 .dark chart-токены)
  </read_first>
  <files>components/sales-plan/ProductPlanTable.tsx, components/sales-plan/PlanFactChart.tsx, components/sales-plan/ProductPlanDialog.tsx, app/globals.css</files>
  <action>
Выполнить ДОСЛОВНО пять пунктов P0:

**P0-1.** `ProductPlanTable.tsx` `ABC_CLASSES` (строки 89-93) заменить значения на:
- A: `"bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400"`
- B: `"bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-400"`
- C: `"bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-400"`

**P0-2.** Токенизировать оси и нулевую линию:
- `PlanFactChart.tsx`: оба `tick={{ fontSize: 11 }}` (XAxis строка 135, YAxis строка 139) → `tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}`.
- `ProductPlanDialog.tsx` (вкладка «График»): оба `tick={{ fontSize: 10 }}` (XAxis строка 401, YAxis строка 402) → `tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}`.
- `ProductPlanDialog.tsx`: `<ReferenceLine y={0} stroke="red" ...>` (строка 409) → `stroke="var(--destructive)"`.

**P0-3.** `PlanFactChart.tsx` — цвета серий на токены нашей палитры (D-06):
- Bar «Факт» `fill="oklch(0.55 0.15 145)"` (строка 152) → `fill="var(--chart-1)"`.
- Line «План» `stroke="oklch(0.55 0.18 28)"` (строка 162) → `stroke="var(--chart-2)"`.
- Line «ИУ» `stroke="oklch(0.50 0.15 270)"` (строка 173) → `stroke="var(--chart-iu)"`.
- ReferenceLine «сегодня» (строки 182-192): `stroke="oklch(0.60 0.10 60)"` → `stroke="var(--muted-foreground)"`; в `label` объекте `fill: "oklch(0.50 0.10 60)"` → `fill: "var(--muted-foreground)"`.
- В `app/globals.css` добавить новый токен `--chart-iu`:
  - в `:root` сразу после `--chart-5: oklch(0.269 0 0);` (строка 100): `--chart-iu: oklch(0.55 0.13 270);`
  - в `.dark` сразу после `--chart-5: oklch(0.269 0 0);` (строка 138): `--chart-iu: oklch(0.72 0.12 270);`

**P0-4.** `ProductPlanTable.tsx` tfoot (строки 711-745) — убрать sticky с `<tr>`, раздать каждой `<td>`:
- `<tr className="sticky bottom-0 bg-muted border-t">` → `<tr>` (убрать классы sticky/bg/border у самого `<tr>`).
- Первой ячейке футера (`<td colSpan={4}>`, сейчас `className="sticky left-0 bg-muted px-2 h-8 text-xs font-semibold"`) добавить `sticky bottom-0 ... left-0 z-20 bg-muted border-t` — итог: `"sticky bottom-0 left-0 z-20 bg-muted border-t px-2 h-8 text-xs font-semibold"`.
- КАЖДОЙ остальной `<td>` футера (Сток-ячейка строки 720-722, два пустых `<td className="border-r" />` строки 723-724, месячные `<td>` строки 725-741, итоговая `<td>` строки 742-744) добавить `sticky bottom-0 z-10 bg-muted border-t` к существующим классам. Сохранить существующие `text-right`, `tabular-nums`, `border-r`, `px-2`, `font-medium/font-semibold` и т.п.
- Все bg на sticky-ячейках — сплошной `bg-muted` (без `/NN`).

**P0-5.** `ProductPlanTable.tsx` thead: у трёх sticky-left `<th>` — SKU (строка 430), Название (строка 437), Приходы (строка 444) — заменить `` `${STICKY_TH} sticky border-r` `` → `` `${STICKY_TH} sticky z-30 border-r` `` (добавить `z-30`, как у Фото). `STICKY_TH` уже содержит `z-20`; новый `z-30` идёт последним и переопределяет.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -E "sales-plan|PlanFactChart|ProductPlanTable|ProductPlanDialog" || echo "no ts errors in touched files"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "dark:" components/sales-plan/ProductPlanTable.tsx` показывает ≥3 внутри ABC_CLASSES (A/B/C содержат `dark:bg-` и `dark:text-`).
    - `grep -c "oklch(" components/sales-plan/PlanFactChart.tsx` == 0 (все oklch удалены из чарта).
    - `grep "var(--chart-1)" components/sales-plan/PlanFactChart.tsx` находит Bar «Факт»; `var(--chart-2)` — Line «План»; `var(--chart-iu)` — Line «ИУ».
    - `grep "var(--muted-foreground)" components/sales-plan/PlanFactChart.tsx` находит ReferenceLine stroke И label fill.
    - `grep -c "\-\-chart-iu" app/globals.css` == 2 (в :root и .dark).
    - `grep "stroke=\"red\"" components/sales-plan/ProductPlanDialog.tsx` == 0; `grep "var(--destructive)" components/sales-plan/ProductPlanDialog.tsx` находит ReferenceLine.
    - `grep 'fill: "var(--muted-foreground)"' components/sales-plan/ProductPlanDialog.tsx` находит оба tick.
    - В tfoot ProductPlanTable.tsx нет `bg-muted/` (сплошной bg-muted): `grep -c "bg-muted/" components/sales-plan/ProductPlanTable.tsx` не вырос относительно исходного (0 в tfoot-блоке 711-745).
    - `grep "sticky border-r" components/sales-plan/ProductPlanTable.tsx | grep -v "z-30"` НЕ находит SKU/Название/Приходы th (все три теперь `sticky z-30 border-r`).
  </acceptance_criteria>
  <done>P0-1…P0-5 применены дословно; чарт без oklch; --chart-iu в обоих CSS-блоках; sticky футер/заголовки на сплошном bg с корректным z-index; tsc чист по затронутым файлам.</done>
</task>

<task type="auto">
  <name>Task 2: P1 — семантика цветов + доводка компонентов (P1-1…P1-8)</name>
  <read_first>
    - components/sales-plan/ProductPlanTable.tsx (±%-классы 670-678; «⚠ нет товара» 688-692; бейджи 688-697)
    - components/sales-plan/ProductPlanCell.tsx (hover:text-red-500 строка 139; не-editing обёртка 129-131)
    - components/sales-plan/ProductPlanDialog.tsx (text-red-500 строки 276 и 324)
    - components/sales-plan/VirtualPurchasesTable.tsx (green-* классы: 113, 286)
    - components/sales-plan/IncomingBadges.tsx (green-* классы: 247)
    - components/sales-plan/PlanFactMatrix.tsx (строка 406 label CollapsibleRow)
    - components/sales-plan/PlanFactSummaryCards.tsx (ring строка 155; vsIuGapRub строка 158; fmtM строка 11)
    - components/sales-plan/PlanFactControls.tsx (Метрика 227-240; Нарастающим 243-251)
    - app/(dashboard)/sales-plan/products/page.tsx (ссылка режима 277-284; импорты 1-18)
    - components/ui/button.tsx (buttonVariants)
    - components/sales-plan/PlanFactChart.tsx (Bar factRub 148-155; импорты recharts 8-19)
  </read_first>
  <files>components/sales-plan/ProductPlanTable.tsx, components/sales-plan/ProductPlanCell.tsx, components/sales-plan/ProductPlanDialog.tsx, components/sales-plan/VirtualPurchasesTable.tsx, components/sales-plan/IncomingBadges.tsx, components/sales-plan/PlanFactMatrix.tsx, components/sales-plan/PlanFactSummaryCards.tsx, components/sales-plan/PlanFactControls.tsx, app/(dashboard)/sales-plan/products/page.tsx, components/sales-plan/PlanFactChart.tsx</files>
  <action>
Выполнить ДОСЛОВНО восемь пунктов P1:

**P1-1. Семантика цветов.**
- `ProductPlanTable.tsx` блок ±% (строки 670-678):
  - `text-emerald-600` → `text-emerald-600 dark:text-emerald-500`
  - `text-amber-500` → `text-amber-600 dark:text-amber-500`
  - `text-red-500` → `text-destructive`
- `ProductPlanTable.tsx` «⚠ нет товара» (строка 689): `text-red-500` → `text-destructive`.
- `ProductPlanCell.tsx`: `hover:text-red-500` (строка 139) → `hover:text-destructive`.
- `ProductPlanDialog.tsx`: оба `text-red-500` (строка 276 — loadError; строка 324 — `d.stockEnd <= 0`) → `text-destructive`.
- `VirtualPurchasesTable.tsx` + `IncomingBadges.tsx`: все `green-*` классы → `emerald-*` (те же числовые оттенки, dark-варианты сохранить). Конкретно:
  - VirtualPurchasesTable.tsx строка 113: `border-green-500 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20` → соответствующие `emerald-*`.
  - VirtualPurchasesTable.tsx строка 286: тот же набор `green-*` → `emerald-*`.
  - IncomingBadges.tsx строка 247: `text-green-700 dark:text-green-400` → `text-emerald-700 dark:text-emerald-400`.

**P1-2.** `PlanFactMatrix.tsx` строка 406: убрать `▾ ` из строки label при вызове `CollapsibleRow` (компонент сам рендерит `▾/▸` по состоянию `open`). ВНИМАНИЕ: сам текст label в этом же пункте меняется в P2-7 — здесь достаточно убрать префикс `▾ `; финальный текст задаст P2-7. Не дублировать `▾/▸`.

**P1-3.** `PlanFactSummaryCards.tsx` 5-я карточка («Отставание от ИУ нарастающим»):
- строка 155: `ring-1 ring-border` → `ring-2 ring-primary/60`.
- строка 158: `{fmtRub(Math.abs(vsIuGapRub))}` → `{fmtM(vsIuGapRub)}` (локальная `fmtM` уже даёт знак `+/−`; стрелку ▲/▼ на строке 159 ОСТАВИТЬ как есть).

**P1-4.** `PlanFactControls.tsx`: блоки «Метрика» (`<div className="flex items-center gap-1.5 text-sm">` строки 227-240) и «Нарастающим итогом» (`<label ...>` строки 243-251) обернуть в общий `<div className="flex items-center gap-3 ml-auto">` (сдвиг вправо). Оба блока становятся детьми новой обёртки.

**P1-5.** `app/(dashboard)/sales-plan/products/page.tsx`: ссылку режима (строки 277-284) переоформить в styled `<a>` с `buttonVariants` + иконка:
- Импортировать `buttonVariants` из `@/components/ui/button`, `cn` из `@/lib/utils`, `Pencil` и `Eye` из `lucide-react`.
- Заменить `<a href={modeToggleUrl} className="text-xs text-primary underline-offset-2 hover:underline">{mode === "edit" ? "← Просмотр" : "Редактировать →"}</a>` на:
  ```tsx
  <a
    href={modeToggleUrl}
    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
  >
    {mode === "edit"
      ? <><Eye className="h-3.5 w-3.5" /> Просмотр</>
      : <><Pencil className="h-3.5 w-3.5" /> Редактировать</>}
  </a>
  ```
- НЕ использовать `<Button asChild>` (base-ui Button не имеет asChild). Это styled `<a>`. RSC-страница — ok, `buttonVariants`/`cn` серверно-безопасны.

**P1-6.** `ProductPlanCell.tsx` не-editing ветка (строки 129-131, условие `!readOnly`): класс `hover:bg-muted/50 rounded px-1 py-0.5 cursor-text` → `rounded border border-dashed border-border/60 hover:border-primary/50 hover:bg-muted/50 px-1 py-0.5 cursor-text` (добавить пунктирную рамку-affordance; readOnly-ветка `cursor-default` не трогать).

**P1-7.** `PlanFactChart.tsx` — приглушать bar «Факт» только для unsettled-бакетов:
- В импорт из `recharts` (строки 8-19) добавить `Cell`.
- В `<Bar dataKey="factRub" ...>` (строки 149-155) убрать общий `opacity={0.8}` и добавить children — по одному `<Cell>` на точку:
  ```tsx
  <Bar dataKey="factRub" name="Факт" fill="var(--chart-1)" radius={[2, 2, 0, 0]}>
    {chartData.map((d) => (
      <Cell key={d.key} opacity={d.unsettled ? 0.45 : 0.8} />
    ))}
  </Bar>
  ```
  Поле `unsettled` есть в `PlanFactChartPoint` и сохраняется в cumulative-режиме (ряд пересобирается через `...d`). `key` — строковое поле точки. Сверить фактические имена полей перед правкой и адаптировать при расхождении.

**P1-8.** `ProductPlanTable.tsx` бейджи «⚠ нет товара…» (строка 689) и «срезано −X%…» (строка 694): `text-[10px]` → `text-[11px] font-medium` (у обоих `<span>`).
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -E "sales-plan|PlanFactControls|ProductPlanCell|PlanFactChart|products/page" || echo "no ts errors in touched files"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "text-red-500" components/sales-plan/ProductPlanTable.tsx components/sales-plan/ProductPlanCell.tsx components/sales-plan/ProductPlanDialog.tsx` == 0 (все → text-destructive/hover:text-destructive).
    - `grep -c "green-" components/sales-plan/VirtualPurchasesTable.tsx components/sales-plan/IncomingBadges.tsx` == 0 (все → emerald-).
    - `grep "ring-2 ring-primary/60" components/sales-plan/PlanFactSummaryCards.tsx` находит 5-ю карточку; `grep "fmtM(vsIuGapRub)" components/sales-plan/PlanFactSummaryCards.tsx` находит замену.
    - `grep "ml-auto" components/sales-plan/PlanFactControls.tsx` находит новую обёртку Метрика+Нарастающим.
    - `grep -E "buttonVariants|Pencil|Eye" "app/(dashboard)/sales-plan/products/page.tsx"` находит импорты и использование; `grep "asChild" "app/(dashboard)/sales-plan/products/page.tsx"` == 0.
    - `grep "border-dashed" components/sales-plan/ProductPlanCell.tsx` находит affordance в не-editing ветке.
    - `grep -E "^import|Cell" components/sales-plan/PlanFactChart.tsx | grep "Cell"` находит импорт Cell; `grep "d.unsettled ? 0.45 : 0.8" components/sales-plan/PlanFactChart.tsx` находит per-Cell opacity.
    - `grep -c "text-\[11px\] font-medium" components/sales-plan/ProductPlanTable.tsx` ≥2 (оба бейджа).
    - В строке 406 PlanFactMatrix.tsx нет `▾ ` в аргументе label.
  </acceptance_criteria>
  <done>P1-1…P1-8 применены дословно; red-500/green-* устранены в затронутых местах; Cell-приглушение unsettled bars; styled `<a>` режима без asChild; tsc чист по затронутым файлам.</done>
</task>

<task type="auto">
  <name>Task 3: P2 — терминология, empty states, hit-area, глифы (P2-1…P2-7) + финальный gate</name>
  <read_first>
    - app/(dashboard)/sales-plan/page.tsx (корневой div строка 441)
    - components/sales-plan/VirtualPurchasesTable.tsx (th УКТ строка 311; empty state 265-274; ряд УКТ строка 482)
    - components/sales-plan/ProductPlanTable.tsx (Eraser p-0.5 строка 529 и 408; products.length===0 — сейчас отсутствует; colSpan)
    - components/sales-plan/ProductPlanCell.tsx (✕ не-editing строки 133-143)
    - components/sales-plan/IncomingBadges.tsx (SuggestedVirtualBadge глиф 215/229/238; легенда 336-342)
    - components/sales-plan/PlanFactMatrix.tsx (строки 158 footnote, 307 «ИУ (438,1…)», 360 «Выполнение ИУ, %», 406 label)
  </read_first>
  <files>app/(dashboard)/sales-plan/page.tsx, components/sales-plan/VirtualPurchasesTable.tsx, components/sales-plan/ProductPlanTable.tsx, components/sales-plan/ProductPlanCell.tsx, components/sales-plan/IncomingBadges.tsx, components/sales-plan/PlanFactMatrix.tsx</files>
  <action>
Выполнить ДОСЛОВНО семь пунктов P2, затем финальный gate:

**P2-1.** `app/(dashboard)/sales-plan/page.tsx` корневой `<div>` (строка 441): текущий `className="h-full flex flex-col gap-4 min-h-0"` → `"flex flex-col h-full gap-3 p-4 min-h-0"` (добавить `p-4`, `gap-4`→`gap-3` — выравнивание с `/sales-plan/products`).

**P2-2.** `VirtualPurchasesTable.tsx`: заголовок `<th>УКТ</th>` (строка 311) → `<th>SKU</th>` (сохранить все классы `sticky top-0 ...`).

**P2-3.** Empty states:
- `VirtualPurchasesTable.tsx` ветка `rows.length === 0` (строки 265-274): текст «Предложений нет» заменить на условный по `statusFilter`:
  - `suggested` → «Предложений нет»
  - `accepted` → «Нет подтверждённых закупок»
  - `dismissed` → «Нет отклонённых»
  - `all` (или иначе) → «Виртуальных закупок нет»
  Реализовать через локальную const/тернар над `statusFilter`, подставить в существующий `<div className="flex-1 flex items-center justify-center ...">`.
- `ProductPlanTable.tsx`: добавить empty state при `products.length === 0`. Внутри `<TableBody>` (перед/вместо `products.map`) отрендерить, если массив пуст:
  ```tsx
  <tr>
    <td colSpan={8 + months.length} className="py-12 text-center text-sm text-muted-foreground">
      Нет товаров по выбранным фильтрам
    </td>
  </tr>
  ```
  (8 sticky-колонок: Фото, SKU, Название, Приходы, Сток, ABC, Заказ, Итог + `months.length` месячных.)

**P2-4.** `IncomingBadges.tsx`: в `SuggestedVirtualBadge` глиф `⚠` → `◇` (amber-цвет оставить: amber ◇ = предложение, violet ◇ = подтверждена):
- строка 215 (`<span aria-hidden="true">⚠</span>`) → `◇`.
- строка 229 заголовок поповера `«Авто-предложение (⚠ учтена в плане)»` → `«Авто-предложение (◇ учтена в плане)»`.
- В `IncomingBadgesLegend` (строки 336-342) строка легенды `⚠ DD.MM ×N` → `◇ DD.MM ×N`, текст «авто-предложение (учтено в плане)» оставить/уточнить консистентно.

**P2-5.** Hit-area:
- `ProductPlanTable.tsx` кнопка Eraser в колонке Название (строки 516-532): обёртке `<button>` класс `p-0.5` (строка 529) → `p-1`; иконке `<Eraser className="h-3 w-3" />` (строка 531) → `h-3.5 w-3.5`.
- `ProductPlanCell.tsx` кнопка ✕ в не-editing ветке (строки 135-142): текущий `<button className="text-[10px] text-muted-foreground hover:text-destructive leading-none">` обернуть в бокс `h-5 w-5 flex items-center justify-center` (добавить эти классы к кнопке или обёртке, сохранив `hover:text-destructive` из P1-1).

**P2-6.** `PlanFactMatrix.tsx` строка 360: `Выполнение ИУ, %` → `Откл. от ИУ, %`.

**P2-7.** `PlanFactMatrix.tsx` терминология:
- строка 307: `ИУ (438,1 М ₽ на H2)` → `ИУ-план`.
- строка 158 (footerNote else-ветка): убрать `(~13,2 М ₽/мес по заказам, ~6%)` — оставить `«Факт включает 73 артикула WB без привязки к товарам»` без скобочной части; ЗАТЕМ `73 артикула` → `артикулы WB без привязки к товарам` (итог: «Факт включает артикулы WB без привязки к товарам»).
- строка 406 label CollapsibleRow: `Вне плана (73 арт. без привязки)` → `Вне плана (арт. без привязки)` (префикс `▾ ` уже убран в P1-2).

**Финальный gate (после всех правок P0-P2):**
1. `npx tsc --noEmit` — чисто (0 ошибок).
2. `npm run build` — успешно.
3. `npx vitest run tests/sales-plan-engine.test.ts tests/sales-plan-iu.test.ts tests/sales-plan-order-gate.test.ts` — все зелёные.
4. Grep-инварианты (см. acceptance_criteria).
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run tests/sales-plan-engine.test.ts tests/sales-plan-iu.test.ts tests/sales-plan-order-gate.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep "flex flex-col h-full gap-3 p-4 min-h-0" "app/(dashboard)/sales-plan/page.tsx"` находит корневой div.
    - `grep -c "УКТ" components/sales-plan/VirtualPurchasesTable.tsx` — не содержит `<th>УКТ</th>` (заголовок теперь SKU); допустимы комментарии/ряд `row.sku`.
    - `grep -E "Нет подтверждённых закупок|Нет отклонённых|Виртуальных закупок нет" components/sales-plan/VirtualPurchasesTable.tsx` находит условные тексты empty state.
    - `grep "Нет товаров по выбранным фильтрам" components/sales-plan/ProductPlanTable.tsx` находит empty state; `grep "8 + months.length" components/sales-plan/ProductPlanTable.tsx` находит colSpan.
    - `grep -c "⚠" components/sales-plan/IncomingBadges.tsx` == 0 в SuggestedVirtualBadge и легенде (глиф заменён на ◇); `grep -c "◇" components/sales-plan/IncomingBadges.tsx` вырос.
    - `grep "Откл. от ИУ, %" components/sales-plan/PlanFactMatrix.tsx` находит; `grep -c "Выполнение ИУ" components/sales-plan/PlanFactMatrix.tsx` == 0.
    - `grep -c "438,1 М ₽" components/sales-plan/PlanFactMatrix.tsx` == 0; `grep "ИУ-план" components/sales-plan/PlanFactMatrix.tsx` находит; `grep -c "13,2 М ₽" components/sales-plan/PlanFactMatrix.tsx` == 0; `grep -c "73 арт" components/sales-plan/PlanFactMatrix.tsx` == 0.
    - `grep "p-1" components/sales-plan/ProductPlanTable.tsx | grep -i eraser` ИЛИ ручная сверка: Eraser-кнопка `p-1`, иконка `h-3.5 w-3.5`.
    - `npx tsc --noEmit` возвращает 0; `npm run build` завершается успешно; три vitest-файла зелёные.
    - Итоговая grep-проверка dark/oklch/chart-iu (из Task 1/2) остаётся истинной: `grep -c "oklch(" components/sales-plan/PlanFactChart.tsx` == 0, `grep -c "\-\-chart-iu" app/globals.css` == 2, нет `bg-*/NN` на новых sticky-ячейках tfoot.
  </acceptance_criteria>
  <done>P2-1…P2-7 применены дословно; empty states, SKU-переименование, ◇-глиф, обновлённая терминология матрицы, увеличенные hit-area; финальный gate зелёный (tsc + build + 3 vitest + grep-инварианты).</done>
</task>

</tasks>

<verification>
Раздел `/sales-plan` (все три таба: Сводный, Товары, Пора заказывать) визуально консистентен с темой в light и dark:
- ABC-бейджи, ±%, график читаемы в dark (токены/dark:-пары).
- Sticky футер и заголовки таблицы товаров не просвечивают при горизонтальном/вертикальном скролле.
- График использует var(--chart-1/2/iu) + var(--muted-foreground); нулевая линия диалога — var(--destructive).
- Терминология матрицы обновлена; empty states информативны; hit-area кнопок увеличены; глиф предложения — ◇.

Технический gate: `npx tsc --noEmit` чисто, `npm run build` успешен, `npx vitest run tests/sales-plan-engine.test.ts tests/sales-plan-iu.test.ts tests/sales-plan-order-gate.test.ts` зелёные.
</verification>

<success_criteria>
- 20 пунктов ревью (P0-1…P0-5, P1-1…P1-8, P2-1…P2-7) применены дословно.
- Все grep-инварианты из acceptance_criteria истинны.
- `tsc --noEmit` = 0 ошибок; `npm run build` успешен; 3 целевых vitest-файла зелёные.
- Нет `oklch(` в PlanFactChart.tsx; `--chart-iu` в :root и .dark; нет `bg-*/NN` на затронутых sticky-ячейках.
- lib/sales-plan/*, app/actions/sales-plan.ts, схема, роутинг, RBAC — не тронуты.
</success_criteria>

<output>
После завершения создать `.planning/quick/260705-o9x-sales-plan-design-review-ui/SUMMARY.md`
</output>
