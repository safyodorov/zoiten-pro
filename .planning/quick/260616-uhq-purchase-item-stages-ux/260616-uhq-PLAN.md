---
phase: quick-260616-uhq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/purchase-stages.ts
  - components/procurement/PurchaseItemStagesCard.tsx
  - components/procurement/PurchasesTable.tsx
  - app/(dashboard)/procurement/purchases/page.tsx
autonomous: true
requirements: [UX-STAGES-01, UX-STAGES-02, UX-STAGES-03]
must_haves:
  truths:
    - "Один общий модуль экспортирует порядок этапов, метки и цветовые классы (light+dark)"
    - "PurchaseItemStagesCard рендерит горизонтальный stepper per позицию (не grid инпутов)"
    - "Клик по этапу делает его текущим достигнутым → кол-во автозаполняется по цепочке; есть поле кол-ва для текущего этапа + комментарий"
    - "Главная таблица закупок имеет раскрываемую строку (caret) с под-строками по позициям: фото/название/SKU + цветной бейдж текущего этапа + кол-во"
    - "Клик по caret раскрытия НЕ навигирует на детальную страницу (stopPropagation)"
    - "Сохранение этапов идёт через существующий savePurchaseItemStages, семантика effectiveAt сохранена"
  artifacts:
    - path: "lib/purchase-stages.ts"
      provides: "STAGE_ORDER, STAGE_LABELS, stage color classes, currentStageOf() helper"
      contains: "export const STAGE_ORDER"
    - path: "components/procurement/PurchaseItemStagesCard.tsx"
      provides: "Stepper-based редактор этапов"
    - path: "components/procurement/PurchasesTable.tsx"
      provides: "Раскрываемые строки с под-строками позиций"
    - path: "app/(dashboard)/procurement/purchases/page.tsx"
      provides: "items query включает stages, передаёт current-stage + qty в PurchaseRow.items"
  key_links:
    - from: "components/procurement/PurchaseItemStagesCard.tsx"
      to: "lib/purchase-stages.ts"
      via: "import STAGE_ORDER / STAGE_LABELS / color classes"
      pattern: "from \"@/lib/purchase-stages\""
    - from: "components/procurement/PurchasesTable.tsx"
      to: "lib/purchase-stages.ts"
      via: "import stage badge color/label helper"
      pattern: "from \"@/lib/purchase-stages\""
    - from: "app/(dashboard)/procurement/purchases/page.tsx"
      to: "lib/purchase-stages.ts"
      via: "currentStageOf() для вычисления текущего этапа per позиция"
      pattern: "currentStageOf"
---

<objective>
Три связанные UX-доработки раздела Закупки (/procurement/purchases) для этапов движения товара. Модель данных УЖЕ существует — никаких изменений схемы/миграций.

1. Редактор этапов = горизонтальный stepper/progress-line per позиция (вместо grid'а qty-инпутов в каждой ячейке). Достигнутые этапы залиты цветом (цветовая градация в теме проекта — оранжево-красный accent). Клик по этапу делает его текущим достигнутым → кол-во автозаполняется по цепочке (= кол-во предыдущего этапа / baseline «Заказано»), с редактируемым полем кол-ва для текущего этапа (частичная партия) + опциональным комментарием.
2. Главная таблица = раскрываемая строка. Закупка остаётся одной строкой (с миниатюрами); добавляется caret раскрытия → под-строки по позициям: товар (фото/название/SKU) + цветной бейдж текущего этапа + кол-во на текущем этапе. Caret НЕ должен триггерить навигацию (stopPropagation).
3. Единый общий helper цвета/метки этапа (бейджи), переиспользуемый stepper'ом И таблицей. Создать lib/purchase-stages.ts — единственный source of truth.

Purpose: Убрать перепечатывание одного и того же числа в каждый этап; сделать прогресс визуально очевидным; устранить дублирование констант STAGES.
Output: 1 новый модуль + 3 модифицированных файла.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- Существующая server action (НЕ менять signature) — app/actions/purchases.ts -->
```ts
const StageEntrySchema = z.object({
  itemId: z.string().min(1),
  stage: z.enum(STAGE_VALUES),       // "PRODUCTION" | "INSPECTION" | "SHIPMENT" | "TRANSIT" | "WAREHOUSE"
  quantity: z.number().int().min(0),
  comment: z.string().nullable().optional(),
})
export async function savePurchaseItemStages(
  purchaseId: string,
  entriesRaw: unknown
): Promise<{ ok: boolean; error?: string }>
// Полная перезапись: клиент присылает только «достигнутые» этапы (с кол-вом), остальные удаляются.
// Уже защищено requireSection("PROCUREMENT","MANAGE"). НЕ ослаблять.
```

<!-- prisma/schema.prisma — модель этапов (УЖЕ существует) -->
```prisma
enum PurchaseItemStage { PRODUCTION INSPECTION SHIPMENT TRANSIT WAREHOUSE }
model PurchaseItemStageProgress {
  id String @id @default(cuid())
  itemId String
  stage PurchaseItemStage
  quantity Int
  comment String?
  @@unique([itemId, stage])
}
```

<!-- Текущий тип строки таблицы — components/procurement/PurchasesTable.tsx -->
```ts
export interface PurchaseItemMini {
  name: string
  sku: string
  photoUrl: string | null
  quantity: number      // = заказанное кол-во
}
export interface PurchaseRow {
  id: string
  // ... + items: PurchaseItemMini[]
}
```

<!-- Текущий тип данных stepper'а — components/procurement/PurchaseItemStagesCard.tsx -->
```ts
export interface ItemStageData {
  itemId: string
  productName: string
  productSku: string
  productPhotoUrl: string | null
  ordered: number
  stages: Partial<Record<StageKey, { quantity: number; comment: string }>>
}
// effectiveAt(ordered, cells, upTo): идём по STAGES; берём последнее заданное qty
// до и включая upTo; иначе ordered. ЭТУ СЕМАНТИКУ СОХРАНИТЬ при переходе на stepper.
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Создать общий модуль lib/purchase-stages.ts (single source of truth)</name>
  <files>lib/purchase-stages.ts</files>
  <action>
Создать новый модуль — единственный источник истины для этапов. Без "use client" / "use server" (чистый shared модуль, импортируется и в RSC page.tsx, и в client-компонентах).

Экспортировать:

1. `STAGE_ORDER` — массив ключей в порядке движения:
   ```ts
   export const STAGE_ORDER = ["PRODUCTION", "INSPECTION", "SHIPMENT", "TRANSIT", "WAREHOUSE"] as const
   export type StageKey = (typeof STAGE_ORDER)[number]
   ```

2. `STAGE_LABELS: Record<StageKey, string>`:
   PRODUCTION="Производство", INSPECTION="Готов к инспекции", SHIPMENT="Готов к отгрузке", TRANSIT="В пути", WAREHOUSE="Принят на складе".

3. `STAGES` — для обратной совместимости (PurchaseItemStagesCard сейчас экспортирует `STAGES` как массив `{ key, label }`):
   ```ts
   export const STAGES = STAGE_ORDER.map((key) => ({ key, label: STAGE_LABELS[key] })) as
     readonly { key: StageKey; label: string }[]
   ```

4. `BASELINE_LABEL = "Заказано"` — baseline-этап (не из enum, = PurchaseItem.quantity).

5. Цветовая градация по этапам (light+dark aware, в теме проекта — тёплая прогрессия от нейтрального к оранжево-красному accent). Использовать tailwind-токены/палитру. Прогрессия (достижение этапа = «теплее»):
   - BASELINE (Заказано): `bg-muted text-muted-foreground`
   - PRODUCTION: `bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400`
   - INSPECTION: `bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400`
   - SHIPMENT: `bg-orange-200 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300`
   - TRANSIT: `bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400`
   - WAREHOUSE: `bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400` (финал = «принято» = успех)
   Экспортировать:
   ```ts
   export const STAGE_BADGE_CLASS: Record<StageKey | "BASELINE", string> = { ... }
   // Заливка для «достигнутого» сегмента stepper'а (только bg, без text):
   export const STAGE_FILL_CLASS: Record<StageKey, string> = {
     PRODUCTION: "bg-amber-400 dark:bg-amber-500",
     INSPECTION: "bg-orange-400 dark:bg-orange-500",
     SHIPMENT:   "bg-orange-500 dark:bg-orange-600",
     TRANSIT:    "bg-red-400 dark:bg-red-500",
     WAREHOUSE:  "bg-emerald-500 dark:bg-emerald-600",
   }
   ```

6. Хелперы:
   ```ts
   // Текущий (самый дальний достигнутый) этап среди записей прогресса.
   // stages — массив stage-ключей, для которых есть PurchaseItemStageProgress.
   // Возвращает StageKey самого дальнего по STAGE_ORDER, либо null если пусто (=Заказано).
   export function currentStageOf(reachedStages: readonly string[]): StageKey | null

   // Метка текущего этапа (для бейджа): currentStageOf → STAGE_LABELS, либо BASELINE_LABEL.
   export function currentStageLabel(reachedStages: readonly string[]): string

   // Класс бейджа для текущего этапа (BASELINE если пусто).
   export function currentStageBadgeClass(reachedStages: readonly string[]): string

   // Индекс этапа в STAGE_ORDER (для сравнения «достигнут ли»). -1 для unknown.
   export function stageIndex(stage: string): number
   ```
   `currentStageOf` реализовать как: из reachedStages выбрать тот, у которого максимальный `stageIndex`; если массив пуст → null.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v '^#' | grep -c "purchase-stages" | grep -q '^0$' && echo OK</automated>
  </verify>
  <done>lib/purchase-stages.ts существует, экспортирует STAGE_ORDER, STAGE_LABELS, STAGES, STAGE_BADGE_CLASS, STAGE_FILL_CLASS, currentStageOf, currentStageLabel, currentStageBadgeClass, stageIndex; tsc без ошибок в этом файле.</done>
</task>

<task type="auto">
  <name>Task 2: Переписать PurchaseItemStagesCard на горизонтальный stepper</name>
  <files>components/procurement/PurchaseItemStagesCard.tsx</files>
  <action>
Заменить grid qty-инпутов на горизонтальный stepper per позицию. Сохранить "use client", useRouter().refresh(), sonner toast, signature props (`{ purchaseId, items, canManage }`), тип `ItemStageData` и реэкспорт `StageKey`.

ВАЖНО: убрать локальное определение `STAGES`/`StageKey`/цветов — импортировать из `@/lib/purchase-stages`:
```ts
import { STAGE_ORDER, STAGE_LABELS, STAGE_FILL_CLASS, type StageKey } from "@/lib/purchase-stages"
```
Реэкспортировать тип для обратной совместимости с [id]/page.tsx (который импортирует `StageKey` и `ItemStageData` отсюда):
```ts
export type { StageKey } from "@/lib/purchase-stages"
export interface ItemStageData { /* без изменений */ }
```

Сохранить функцию `effectiveAt(ordered, cells, upTo)` БЕЗ изменения семантики (используется при сохранении для наследованного кол-ва), но итерировать по STAGE_ORDER вместо локального STAGES.

Локальное состояние draft (как сейчас): `Record<itemId, Record<StageKey, { qty: string; comment: string }>>`. buildDraft — без изменений (итерировать STAGE_ORDER).

UI per позиция (вместо строки таблицы):
- Карточка/блок: слева фото+название+SKU+«Заказано: {ordered}» (как сейчас в первой ячейке).
- Справа горизонтальный stepper: для каждого этапа STAGE_ORDER — кликабельный сегмент (кнопка) с меткой STAGE_LABELS[key]. Соединять сегменты линией прогресса.
- «Достигнутый» этап = есть непустой qty в draft для этого этапа ИЛИ для любого более позднего этапа (используй индекс: этап достигнут, если индекс ≤ индекса самого дальнего этапа с заданным qty). Достигнутые сегменты заливать STAGE_FILL_CLASS[key]; недостигнутые — `bg-muted`.
- Текущий этап = самый дальний с заданным qty (или с введённым в этой сессии). Выделить рамкой `ring-2 ring-primary`.
- Клик по сегменту (только если canManage): делает его текущим достигнутым → автозаполняет qty по цепочке. Реализация: для всех этапов с индексом ≤ кликнутого, если qty пуст → проставить унаследованное значение через effectiveAt (т.е. baseline ordered или кол-во предыдущего заданного этапа); для этапов с индексом > кликнутого → очистить qty (отступ назад снимает достижение). Минимально: проставить qty кликнутого этапа = effectiveAt(...) предыдущего достигнутого (или ordered), остальные более ранние пустые этапы тоже заполнить унаследованным.
- Под stepper'ом для ТЕКУЩЕГО (выбранного/самого дальнего достигнутого) этапа показать: редактируемое числовое поле «Кол-во» (частичная партия, type=number min=0, value = draft qty, placeholder = effectiveAt) + текстовое поле «Комментарий». Оба disabled при !canManage. Старые классы cellInput/commentInput можно переиспользовать/адаптировать.
- Если ни один этап не достигнут → визуально только baseline «Заказано» подсвечен, stepper пустой.

Кнопка «Сохранить этапы» (canManage) — без изменений: функция `save()` собирает entries точно как сейчас (только этапы с hasQty||hasComment; quantity = заданное или effectiveAt; comment trim||null) и вызывает `savePurchaseItemStages(purchaseId, entries)` → toast + router.refresh(). НЕ менять формат entries и signature server action.

Сохранить нижнюю поясняющую подпись (адаптировать текст под stepper: клик по этапу = отметить достигнутым, кол-во наследуется с предыдущего, можно скорректировать для частичной партии + комментарий).

Соблюдать оранжево-красный accent / shadcn токены (primary, muted, ring). RU интерфейс.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v '^#' | grep -cE "PurchaseItemStagesCard|purchase-stages" | grep -q '^0$' && echo OK</automated>
  </verify>
  <done>Stepper рендерится per позиция; клик по этапу автозаполняет qty по цепочке; текущий этап имеет редактируемое поле кол-ва + комментарий; STAGES/цвета импортированы из lib/purchase-stages.ts; save() по-прежнему вызывает savePurchaseItemStages с тем же форматом entries; effectiveAt-семантика сохранена; tsc чист.</done>
</task>

<task type="auto">
  <name>Task 3: Раскрываемые строки в PurchasesTable + stages в query</name>
  <files>components/procurement/PurchasesTable.tsx, app/(dashboard)/procurement/purchases/page.tsx</files>
  <action>
**A. page.tsx** — добавить stages в items query и прокинуть текущий этап + кол-во в PurchaseRow.items.

В `prisma.purchase.findMany` → `include.items.select` добавить:
```ts
id: true,
stages: { select: { stage: true, quantity: true } },
```
(оставить существующие quantity, unitPrice, product{...}).

При маппинге `items: p.items.map(...)` обогатить каждую позицию текущим этапом. Импортировать `import { currentStageOf } from "@/lib/purchase-stages"`. Для каждой позиции:
```ts
const reached = i.stages.map((s) => s.stage)
const cur = currentStageOf(reached)            // StageKey | null
// кол-во на текущем этапе: quantity записи прогресса для cur, иначе baseline i.quantity
const curQty = cur
  ? (i.stages.find((s) => s.stage === cur)?.quantity ?? i.quantity)
  : i.quantity
```
Расширить объект позиции полями `id`, `currentStage: cur` (string | null), `currentStageQty: curQty`.

**B. PurchasesTable.tsx** — расширить тип + раскрываемая строка.

1. Расширить `PurchaseItemMini`:
```ts
export interface PurchaseItemMini {
  id?: string
  name: string
  sku: string
  photoUrl: string | null
  quantity: number              // заказано
  currentStage?: string | null  // StageKey | null (null = Заказано)
  currentStageQty?: number      // кол-во на текущем этапе
}
```
(опциональные поля — чтобы не сломать ItemsThumbs и существующие вызовы.)

2. Импорт: `import { ChevronRight, ChevronDown } from "lucide-react"` и `import { currentStageLabel, currentStageBadgeClass } from "@/lib/purchase-stages"`.

3. Состояние раскрытия: `const [expanded, setExpanded] = useState<Set<string>>(new Set())` + toggle.

4. В `renderDataRow`: добавить caret-кнопку раскрытия как первый элемент в ячейке «Товары» (или отдельной мини-колонкой слева от миниатюр внутри той же TableCell). Кнопка:
```tsx
<button
  type="button"
  onClick={(e) => { e.stopPropagation(); toggleExpand(row.id) }}
  className="text-muted-foreground hover:text-foreground"
  title={isOpen ? "Свернуть" : "Развернуть позиции"}
>
  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
</button>
```
КРИТИЧНО: `e.stopPropagation()` чтобы клик по caret НЕ срабатывал `router.push` строки. (Существующий onClick строки — навигация — остаётся.)

5. Рендер под-строк: в цикле построения `bodyRows` после `bodyRows.push(renderDataRow(...))` — если `expanded.has(row.id)`, пушить под-строки по позициям. Каждая под-строка:
```tsx
<TableRow key={`${row.id}-item-${idx}`} className="bg-muted/20">
  <TableCell colSpan={colCount} className="px-3 py-1.5 border-l-2 border-l-primary/40">
    {/* flex: фото 30x40 → название + SKU(mono) → бейдж текущего этапа → кол-во */}
  </TableCell>
</TableRow>
```
Внутри ячейки на каждую позицию (или одна под-строка на позицию — предпочтительно по строке на позицию, чтобы было читаемо):
- миниатюра (или Package-плейсхолдер как в PurchaseItemStagesCard),
- название + `<span className="font-mono text-[11px] text-muted-foreground">{sku}</span>`,
- бейдж текущего этапа: `<span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${currentStageBadgeClass(it.currentStage ? [it.currentStage] : [])}`}>{currentStageLabel(it.currentStage ? [it.currentStage] : [])}</span>` (currentStage уже вычислен на сервере; передаём как одноэлементный массив, либо добавь в lib перегрузку, принимающую готовый StageKey|null — на твоё усмотрение, проще обернуть в массив),
- кол-во: `{it.currentStageQty ?? it.quantity} шт`.

Соблюдать CLAUDE.md sticky data-table pattern: под-строки идут в `<TableBody>` (shadcn TableRow там OK — hover допустим). Границы по иерархии: под-строки внутри одной закупки — `border-l-2 border-l-primary/40` (intra-group тонкая), не ломать sticky thead/tfoot.

НЕ менять prefetch-поведение, чекбоксы, группировку. colCount остаётся как есть.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v '^#' | grep -cE "PurchasesTable|procurement/purchases/page|purchase-stages" | grep -q '^0$' && echo OK</automated>
  </verify>
  <done>page.tsx items query включает stages, вычисляет currentStage+currentStageQty per позиция; PurchasesTable показывает caret раскрытия (stopPropagation, не навигирует); раскрытые под-строки показывают фото/название/SKU + цветной бейдж текущего этапа + кол-во; sticky thead/tfoot и группировка не сломаны; tsc чист.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` без ошибок в затронутых файлах.
- Manual: открыть /procurement/purchases → caret раскрывает под-строки с бейджами этапов; клик по caret не переходит на деталь; клик по остальной строке переходит.
- Manual: открыть деталь закупки → stepper per позиция; клик по этапу заливает цепочку и автозаполняет кол-во; «Сохранить этапы» сохраняет (toast «Этапы сохранены»), после refresh достигнутые этапы залиты.
- lib/purchase-stages.ts — единственное место определения порядка/меток/цветов; PurchaseItemStagesCard и PurchasesTable импортируют оттуда.
</verification>

<success_criteria>
- Один shared модуль lib/purchase-stages.ts (source of truth: порядок, метки, цвета, currentStageOf).
- Редактор этапов = горизонтальный stepper с цветовой градацией темы; клик автозаполняет цепочку; редактируемое кол-во текущего этапа + комментарий; save через существующий savePurchaseItemStages с неизменным форматом entries и сохранённой effectiveAt-семантикой.
- Главная таблица: раскрываемые строки (caret, stopPropagation) с под-строками позиций — фото/название/SKU + цветной бейдж текущего этапа + кол-во.
- RBAC не ослаблен; CLAUDE.md sticky/rowSpan/border паттерны соблюдены; RU интерфейс; нет новых npm-зависимостей.
</success_criteria>

<output>
After completion, create `.planning/quick/260616-uhq-purchase-item-stages-ux/260616-uhq-SUMMARY.md`
</output>
