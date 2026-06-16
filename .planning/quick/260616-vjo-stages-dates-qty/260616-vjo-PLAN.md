---
phase: quick-260616-vjo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - prisma/migrations/20260616_purchase_stage_date/migration.sql
  - app/actions/purchases.ts
  - components/procurement/PurchaseItemStagesCard.tsx
  - app/(dashboard)/procurement/purchases/[id]/page.tsx
  - app/(dashboard)/procurement/purchases/page.tsx
  - components/procurement/PurchasesTable.tsx
autonomous: true
requirements: [VJO-STAGE-DATE, VJO-STAGE-QTY-DISPLAY, VJO-EXPANDED-METRICS]

must_haves:
  truths:
    - "Каждый достигнутый этап товара хранит дату (default = сегодня МСК при клике, редактируется date-picker'ом)"
    - "Под каждым достигнутым сегментом stepper'а виден дата + кол-во мелким текстом"
    - "В блоке редактирования текущего этапа есть <input type=date> рядом с кол-вом и комментом"
    - "Клик по сегменту одним действием проставляет qty + дату=сегодня для всех незаполненных этапов ≤ кликнутого"
    - "В раскрытых строках общей таблицы по каждому товару видны Сумма + Вес + Объём + Статус(этап) + кол-во"
  artifacts:
    - path: "prisma/migrations/20260616_purchase_stage_date/migration.sql"
      provides: "ALTER TABLE добавляет nullable column date"
      contains: "ADD COLUMN \"date\""
    - path: "components/procurement/PurchaseItemStagesCard.tsx"
      provides: "date в Draft + display под сегментами + date-picker в редакторе"
    - path: "components/procurement/PurchasesTable.tsx"
      provides: "PurchaseItemMini с sum/sumRub/weightKg/volumeM3 + рендер в sub-строке"
  key_links:
    - from: "PurchaseItemStagesCard.save()"
      to: "savePurchaseItemStages"
      via: "entry.date в payload"
      pattern: "date:"
    - from: "page.tsx items.map"
      to: "PurchaseItemMini"
      via: "per-item sum/weight/volume"
      pattern: "weightKg"
---

<objective>
Развитие фичи этапов закупки v2 (база в проде, задача 260616-uhq). Две функции:
1. Дата на каждом этапе движения товара (PurchaseItemStageProgress.date) — проставляется при клике по сегменту stepper'а (default = сегодня МСК), редактируется date-picker'ом. Отображается под достигнутыми сегментами + редактируется в блоке текущего этапа.
2. В раскрытых строках общей таблицы /procurement/purchases по каждому товару: Сумма + Вес + Объём + Статус(этап) + кол-во (статус и кол-во уже есть, добавить остальное).

Purpose: бизнес хочет видеть когда товар прошёл каждый этап и финансовую/физическую разбивку по позициям прямо в списке закупок.
Output: миграция + расширенный action + stepper с датами + раскрытые строки таблицы с метриками.

CONSTRAINTS (LOCKED, от пользователя — НЕ отступать):
- Визуал stepper'а остаётся КАК ЕСТЬ. Без Δ-колонок «потеря», без переделки в таблицу. Только ДОБАВИТЬ дату+кол-во под сегментами и date-picker в редакторе текущего этапа.
- Date default = сегодня в Moscow tz. Хранить DateTime, в UI `<input type="date">` (yyyy-mm-dd). Без новых npm-зависимостей — нативный date input (соответствует конвенции «native HTML select»).
- Backward-compatible: у существующих PurchaseItemStageProgress даты нет (nullable). savePurchaseItemStages должен принимать date опционально.
- Для qty в расчётах Сумма/Вес/Объём в раскрытых строках использовать ЗАКАЗАННОЕ кол-во (PurchaseItem.quantity) — как в итогах закупки, переиспользуя логику page.tsx (weightKg, габариты, rate).
- НЕ запускать prisma/tsc/build локально (нет node_modules). Verify через grep + type-review. Build на деплое.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- Извлечено из кодовой базы. Использовать напрямую, без доп. исследования. -->

prisma/schema.prisma (~line 1521) — model PurchaseItemStageProgress:
```prisma
model PurchaseItemStageProgress {
  id        String            @id @default(cuid())
  itemId    String
  item      PurchaseItem      @relation(fields: [itemId], references: [id], onDelete: Cascade)
  stage     PurchaseItemStage
  quantity  Int
  comment   String?
  updatedAt DateTime          @updatedAt
  @@unique([itemId, stage])
  @@index([itemId])
}
```

lib/purchase-stages.ts (источник истины, без use client/server):
```typescript
export const STAGE_ORDER = ["PRODUCTION","INSPECTION","SHIPMENT","TRANSIT","WAREHOUSE"] as const
export type StageKey = (typeof STAGE_ORDER)[number]
export const STAGE_LABELS: Record<StageKey, string>
export const STAGE_FILL_CLASS: Record<StageKey, string>
export function stageIndex(stage: string): number
export function currentStageOf(reachedStages): StageKey | null
export function currentStageLabel(reachedStages): string
export function currentStageBadgeClass(reachedStages): string
```

app/actions/purchases.ts (~line 518) — текущий StageEntrySchema + savePurchaseItemStages:
```typescript
const StageEntrySchema = z.object({
  itemId: z.string().min(1),
  stage: z.enum(STAGE_VALUES),
  quantity: z.number().int().min(0),
  comment: z.string().nullable().optional(),
})
// savePurchaseItemStages(purchaseId, entriesRaw): deleteMany + createMany.
// RBAC: requireSection("PROCUREMENT", "MANAGE"). parseDate(val) helper уже есть (line 34).
```

components/procurement/PurchaseItemStagesCard.tsx — текущие типы:
```typescript
export interface ItemStageData {
  itemId; productName; productSku; productPhotoUrl; ordered: number
  stages: Partial<Record<StageKey, { quantity: number; comment: string }>>
}
type Draft = Record<string, Record<StageKey, { qty: string; comment: string }>>
// handleStageClick: заполняет qty для всех этапов ≤ кликнутого через effectiveAt; чистит позже.
// save(): собирает entries[] → savePurchaseItemStages.
```

components/procurement/PurchasesTable.tsx — PurchaseItemMini + helpers:
```typescript
export interface PurchaseItemMini {
  id?; name; sku; photoUrl: string|null; quantity: number
  currentStage?: string|null; currentStageQty?: number
}
function formatMoney(n, currency): string  // "1 234,00 CNY"
function formatRub(n): string              // "1 234 ₽"
function formatWeight(n: number|null): string  // "12,3 кг"
function formatVolume(n: number|null): string  // "1,234 м³"
// Раскрытые под-строки: line 391-432. Текущий рендер показывает badge(stageText) + qty шт.
```

app/(dashboard)/procurement/purchases/page.tsx — per-item метрики уже считаются на уровне закупки (line 165-248):
```typescript
// rate: p.currency === "RUB" ? 1 : rateMap[p.currency] ?? null
// per item: cost = i.quantity * Number(i.unitPrice)
// weight: i.quantity * pr.weightKg  (если pr.weightKg != null)
// volume: (i.quantity * pr.heightCm * pr.widthCm * pr.depthCm) / 1_000_000  (если все 3 != null)
// items.map → PurchaseItemMini (line 230-246)
// product select уже включает: weightKg, heightCm, widthCm, depthCm (line 88-104)
```

app/(dashboard)/procurement/purchases/[id]/page.tsx — itemStages построение (line 96-109):
```typescript
// for sp of i.stages: stages[sp.stage] = { quantity: sp.quantity, comment: sp.comment ?? "" }
// i.stages включён через items.include.stages: true (line 76)
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema + миграция + расширение savePurchaseItemStages (date)</name>
  <files>prisma/schema.prisma, prisma/migrations/20260616_purchase_stage_date/migration.sql, app/actions/purchases.ts</files>
  <action>
1. **schema.prisma** (~line 1527, model PurchaseItemStageProgress): добавить поле `date` между `comment` и `updatedAt`:
   ```prisma
   comment   String?
   date      DateTime?
   updatedAt DateTime          @updatedAt
   ```
   Nullable — у существующих строк даты нет.

2. **Создать миграцию** `prisma/migrations/20260616_purchase_stage_date/migration.sql` (НЕ запускать prisma — только файл). Формат как у соседних миграций (применяется через `prisma migrate deploy` на VPS):
   ```sql
   -- Quick 260616-vjo: дата на каждом этапе движения товара в закупке.
   -- Применяется через `prisma migrate deploy` на VPS (deploy.sh).

   ALTER TABLE "PurchaseItemStageProgress" ADD COLUMN "date" TIMESTAMP(3);
   ```

3. **app/actions/purchases.ts** — расширить `StageEntrySchema` (~line 520) полем date (backward-compatible, опционально/nullable):
   ```typescript
   const StageEntrySchema = z.object({
     itemId: z.string().min(1),
     stage: z.enum(STAGE_VALUES),
     quantity: z.number().int().min(0),
     comment: z.string().nullable().optional(),
     date: z.string().nullable().optional(),
   })
   ```
   В `savePurchaseItemStages` (~line 552, createMany.data) добавить запись date через существующий `parseDate` helper (line 34):
   ```typescript
   data: entries.map((e) => ({
     itemId: e.itemId,
     stage: e.stage,
     quantity: e.quantity,
     comment: e.comment?.trim() || null,
     date: parseDate(e.date),
   })),
   ```
   `parseDate` возвращает `Date | null` — корректно для nullable column. RBAC `requireSection("PROCUREMENT","MANAGE")` остаётся без изменений.
  </action>
  <verify>
<automated>cd c:/Users/serge/zoiten-pro && grep -n 'date      DateTime?' prisma/schema.prisma && grep -n 'ADD COLUMN "date"' prisma/migrations/20260616_purchase_stage_date/migration.sql && grep -c 'date: parseDate' app/actions/purchases.ts && grep -c 'date: z.string().nullable().optional()' app/actions/purchases.ts</automated>
  </verify>
  <done>schema имеет date DateTime?; миграция-файл существует с ADD COLUMN; StageEntrySchema принимает date; createMany пишет date через parseDate; RBAC не тронут.</done>
</task>

<task type="auto">
  <name>Task 2: Stepper — дата per этап (display + date-picker + авто-сегодня при клике)</name>
  <files>app/(dashboard)/procurement/purchases/[id]/page.tsx, components/procurement/PurchaseItemStagesCard.tsx</files>
  <action>
**A. [id]/page.tsx** — прокинуть date в ItemStageData (line 96-109). В цикле `for (const sp of i.stages)`:
```typescript
stages[sp.stage as StageKey] = {
  quantity: sp.quantity,
  comment: sp.comment ?? "",
  date: sp.date ? sp.date.toISOString().split("T")[0] : null,  // yyyy-mm-dd для input
}
```
(`i.stages` уже включён через `items.include.stages: true` — Prisma вернёт новое поле date после регена клиента на деплое. Локально tsc не гоняем.)

**B. PurchaseItemStagesCard.tsx**:

1. Расширить `ItemStageData.stages` value типом (line 28):
   ```typescript
   stages: Partial<Record<StageKey, { quantity: number; comment: string; date: string | null }>>
   ```

2. Расширить `Draft` (line 38) — добавить `date: string` ("" = не задано):
   ```typescript
   type Draft = Record<string, Record<StageKey, { qty: string; comment: string; date: string }>>
   ```

3. `buildDraft` (line 40-53) — заполнять date:
   ```typescript
   d[it.itemId][key] = { qty: v ? String(v.quantity) : "", comment: v?.comment ?? "", date: v?.date ?? "" }
   ```

4. Добавить хелпер «сегодня в МСК как yyyy-mm-dd» (рядом с другими функциями, вне компонента):
   ```typescript
   // Сегодня в Moscow tz как yyyy-mm-dd для <input type="date">.
   function todayMoscow(): string {
     // en-CA даёт YYYY-MM-DD; timeZone сдвигает на МСК.
     return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" })
   }
   ```

5. `setCell` (line 111) — расширить field type на `"qty" | "comment" | "date"` (сигнатура уже generic по value, добавить "date" в union типа field).

6. `handleStageClick` (line 123-151) — внутри цикла, в ветке `if (idx <= clickedIdx)`, после установки qty, проставить date=сегодня где пусто. ВАЖНО: date проставляем для ВСЕХ этапов ≤ кликнутого где date пустая (не только где qty был пуст) — «не по 10 раз щёлкать». Внутри `if (idx <= clickedIdx)`:
   ```typescript
   const rawQty = newCells[key].qty.trim()
   if (rawQty === "" || isNaN(Number(rawQty))) {
     const eff = effectiveAt(it.ordered, prevCells, key)
     newCells[key] = { ...newCells[key], qty: String(eff) }
   }
   if (!newCells[key].date) {
     newCells[key] = { ...newCells[key], date: todayMoscow() }
   }
   ```
   В ветке `else` (этапы после кликнутого) — очищать и date вместе с qty:
   ```typescript
   newCells[key] = { ...newCells[key], qty: "", date: "" }
   ```

7. `save()` (line 153-188) — добавить date в тип entries и в push:
   ```typescript
   const entries: { itemId: string; stage: StageKey; quantity: number; comment: string | null; date: string | null }[] = []
   ...
   entries.push({
     itemId: it.itemId,
     stage: key,
     quantity,
     comment: hasComment ? cell.comment.trim() : null,
     date: cell.date.trim() || null,
   })
   ```
   (date отправляется для каждого записываемого entry; пустая → null. Условие пропуска `if (!hasQty && !hasComment) continue` оставить как есть — для не-достигнутых этапов date тоже не уходит, что корректно.)

8. **Display под достигнутыми сегментами** (stepper, line 241-282): внутри кнопки-сегмента, под `<span>{STAGE_LABELS[key]}</span>`, добавить вывод даты+кол-ва для достигнутых (`isReached`). Сохранить визуал — просто мелкий текст под названием:
   ```tsx
   <span className="leading-tight text-center line-clamp-2 w-full">
     {STAGE_LABELS[key]}
   </span>
   {isReached && (
     <span className="mt-0.5 text-[9px] leading-none opacity-90 text-center">
       {cells[key].date ? cells[key].date.split("-").reverse().join(".") : "—"}
       {" · "}
       {cells[key].qty || effectiveAt(it.ordered, cells, key)} шт
     </span>
   )}
   ```
   (`yyyy-mm-dd`.split("-").reverse().join(".") → `dd.mm.yyyy`. Текст белый — наследуется от `text-white` на достигнутом сегменте.)

9. **Date-picker в блоке редактирования текущего этапа** (line 286-313): добавить третий столбец с `<input type="date">` рядом с Кол-во и Комментарий. Между блоком «Кол-во» и блоком «Комментарий» (или после комментария — компонуй компактно):
   ```tsx
   <div className="flex flex-col gap-1">
     <label className="text-[11px] text-muted-foreground font-medium">Дата</label>
     <input
       type="date"
       value={cells[curKey].date}
       onChange={(e) => setCell(it.itemId, curKey, "date", e.target.value)}
       disabled={!canManage}
       className="h-7 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
     />
   </div>
   ```
   Порядок столбцов: Кол-во → Дата → Комментарий (Комментарий с `flex-1`).

10. Обновить подсказку внизу (line 320-323) — упомянуть что дата проставляется автоматически (сегодня) и редактируется: добавить предложение «Дата этапа ставится сегодняшней при клике — измените при необходимости.»
  </action>
  <verify>
<automated>cd c:/Users/serge/zoiten-pro && grep -c 'todayMoscow' components/procurement/PurchaseItemStagesCard.tsx && grep -c 'type="date"' components/procurement/PurchaseItemStagesCard.tsx && grep -c 'date: cell.date.trim()' components/procurement/PurchaseItemStagesCard.tsx && grep -c 'sp.date' "app/(dashboard)/procurement/purchases/[id]/page.tsx" && grep -c 'isReached &&' components/procurement/PurchaseItemStagesCard.tsx</automated>
  </verify>
  <done>ItemStageData.stages и Draft содержат date; buildDraft заполняет date; handleStageClick проставляет todayMoscow() для незаполненных дат ≤ кликнутого и чистит date для позже; save() шлёт date; под достигнутыми сегментами виден dd.mm.yyyy + кол-во; в редакторе текущего этапа есть date-picker; [id]/page.tsx читает sp.date.</done>
</task>

<task type="auto">
  <name>Task 3: Раскрытые строки таблицы — Сумма + Вес + Объём per товар</name>
  <files>app/(dashboard)/procurement/purchases/page.tsx, components/procurement/PurchasesTable.tsx</files>
  <action>
**A. page.tsx** — расширить per-item данные в `items.map` (line 230-246). Внутри уже есть доступ к `i.quantity`, `i.unitPrice`, `i.product` (weightKg/heightCm/widthCm/depthCm), `rate` (line 170, в scope). Для каждого item:
```typescript
items: p.items.map((i) => {
  const reached = i.stages.map((s) => s.stage)
  const cur = currentStageOf(reached)
  const curQty = cur ? (i.stages.find((s) => s.stage === cur)?.quantity ?? i.quantity) : i.quantity
  const pr = i.product
  const sum = i.quantity * Number(i.unitPrice)              // в валюте закупки, ЗАКАЗАННОЕ кол-во
  const sumRub = rate != null ? sum * rate : null           // через тот же rate что закупка
  const itemWeightKg = pr.weightKg != null ? i.quantity * pr.weightKg : null
  const itemVolumeM3 =
    pr.heightCm != null && pr.widthCm != null && pr.depthCm != null
      ? (i.quantity * pr.heightCm * pr.widthCm * pr.depthCm) / 1_000_000
      : null
  return {
    id: i.id,
    name: i.product.name,
    sku: i.product.sku,
    photoUrl: i.product.photoUrl,
    quantity: i.quantity,
    currentStage: cur,
    currentStageQty: curQty,
    sum,
    sumRub,
    currency: p.currency,
    weightKg: itemWeightKg,
    volumeM3: itemVolumeM3,
  }
}),
```
(rate переиспользуется — уже объявлен line 170 в той же `.map((p) => ...)` итерации. currency = p.currency.)

**B. PurchasesTable.tsx**:

1. Расширить `PurchaseItemMini` (line 25-33):
   ```typescript
   export interface PurchaseItemMini {
     id?: string
     name: string
     sku: string
     photoUrl: string | null
     quantity: number
     currentStage?: string | null
     currentStageQty?: number
     sum?: number
     sumRub?: number | null
     currency?: string
     weightKg?: number | null
     volumeM3?: number | null
   }
   ```

2. В рендере раскрытых под-строк (line 398-430), внутри `<div className="flex items-center gap-2.5 min-w-0">`, ПОСЛЕ блока статус-бейджа и ПЕРЕД/вместе с `{qty} шт` добавить компактные Сумма/Вес/Объём. Переиспользовать существующие `formatMoney`/`formatRub`/`formatWeight`/`formatVolume`. Компоновать в одну строку (flex), shrink-0, мелким текстом:
   ```tsx
   <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${badgeClass}`}>
     {stageText}
   </span>
   <span className="text-xs tabular-nums text-muted-foreground shrink-0">{qty} шт</span>
   {it.sum != null && (
     <span className="text-xs tabular-nums shrink-0 whitespace-nowrap">
       {it.sumRub != null && it.currency !== "RUB" ? (
         <>
           {formatRub(it.sumRub)}
           <span className="text-muted-foreground"> · {formatMoney(it.sum, it.currency ?? "")}</span>
         </>
       ) : (
         formatMoney(it.sum, it.currency ?? "")
       )}
     </span>
   )}
   <span className="text-xs tabular-nums text-muted-foreground shrink-0 whitespace-nowrap">
     {formatWeight(it.weightKg ?? null)}
   </span>
   <span className="text-xs tabular-nums text-muted-foreground shrink-0 whitespace-nowrap">
     {formatVolume(it.volumeM3 ?? null)}
   </span>
   ```
   Замечание: qty для метрик = ЗАКАЗАННОЕ (it.sum/weightKg/volumeM3 уже посчитаны от i.quantity в page.tsx — НЕ от currentStageQty). Бейдж статуса + «{qty} шт» (текущий этап) остаются как есть.
   Колонки могут не влезать — flex с gap-2.5 + whitespace-nowrap, при необходимости обернуть метрики в `flex-wrap` группу. Не использовать rowSpan (под-строка через colSpan={colCount}, как сейчас).
  </action>
  <verify>
<automated>cd c:/Users/serge/zoiten-pro && grep -c 'sumRub' "app/(dashboard)/procurement/purchases/page.tsx" && grep -c 'itemVolumeM3' "app/(dashboard)/procurement/purchases/page.tsx" && grep -c 'sumRub?: number' components/procurement/PurchasesTable.tsx && grep -c 'formatVolume(it.volumeM3' components/procurement/PurchasesTable.tsx && grep -c 'formatWeight(it.weightKg' components/procurement/PurchasesTable.tsx</automated>
  </verify>
  <done>page.tsx считает per-item sum/sumRub/weightKg/volumeM3 (от заказанного i.quantity, rate переиспользован); PurchaseItemMini расширен; раскрытая под-строка показывает Статус + кол-во + Сумма(₽+валюта) + Вес + Объём, переиспользуя formatMoney/formatRub/formatWeight/formatVolume.</done>
</task>

</tasks>

<verification>
Сборка пройдёт на деплое (локально нет node_modules). Локальная проверка:
- `grep` invariants из каждого <verify> зелёные.
- Type-review: ItemStageData/Draft/PurchaseItemMini консистентны между page.tsx и компонентами.
- Backward-compat: savePurchaseItemStages принимает entries без date (старые вызовы не сломаны — date опционально).
- Миграция: один файл `20260616_purchase_stage_date/migration.sql` с единственным `ALTER TABLE ... ADD COLUMN "date" TIMESTAMP(3);` (idempotency не требуется — новая колонка).
</verification>

<success_criteria>
- PurchaseItemStageProgress.date добавлено (schema + миграция-файл), nullable, применяется на деплое.
- savePurchaseItemStages пишет date через parseDate, RBAC сохранён, backward-compatible.
- Stepper: под достигнутыми сегментами дата (dd.mm.yyyy) + кол-во; date-picker в редакторе текущего этапа; клик авто-проставляет сегодня (МСК) для незаполненных дат ≤ кликнутого.
- Раскрытые строки списка закупок: по каждому товару Сумма (₽+валюта) + Вес + Объём + Статус(этап) + кол-во.
- Без новых npm-зависимостей. Визуал stepper'а не переделан (только дополнен).
</success_criteria>

<output>
After completion, create `.planning/quick/260616-vjo-stages-dates-qty/260616-vjo-SUMMARY.md`.
Напомнить пользователю: применить миграцию на деплое (`prisma migrate deploy` через deploy.sh), затем проверить визуально на проде.
</output>
