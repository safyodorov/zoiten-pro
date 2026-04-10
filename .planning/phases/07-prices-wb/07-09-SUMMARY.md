---
phase: 07-prices-wb
plan: 09
status: complete
completed: 2026-04-10
duration: ~18min
commits:
  - d736026
requirements:
  - PRICES-04
  - PRICES-07
  - PRICES-08
  - PRICES-09
  - PRICES-16
---

# 07-09 — PricingCalculatorDialog (модалка юнит-экономики)

## Что сделано

Реализована модалка расчёта юнит-экономики с realtime пересчётом и сохранением расчётных цен в слоты 1/2/3. Это последний крупный UI компонент раздела — после него `/prices/wb` функционально готов.

### Артефакты

| Файл | Строк | Назначение |
|------|-------|-----------|
| `components/prices/PricingCalculatorDialog.tsx` | 589 (new) | 2-колоночная модалка с realtime calc + scope checkboxes + save |
| `components/prices/PriceCalculatorTableWrapper.tsx` | 67 (new) | Клиентский wrapper, держит state открытой модалки |
| `components/prices/PriceCalculatorTable.tsx` | +19/-1 | `PriceRow` расширен полями `inputs: PricingInputs` и `context` |
| `app/(dashboard)/prices/wb/page.tsx` | +45/-25 | Заменён прямой рендер таблицы на wrapper; каждый priceRow заполняется `inputs`+`context` при сборке |

### Архитектура realtime пересчёта

```
useForm (react-hook-form + zodResolver)
  ↓
useWatch({name: [priceBeforeDiscount, sellerDiscountPct, drrPct, defectRatePct, deliveryCostRub]})
  ↓
useMemo → calculatePricing({...row.inputs, ...override}) → PricingOutputs
  ↓
Правая колонка (30 outputs) — rerender при каждом изменении watched values
```

`useWatch` подписывается только на 5 изменяемых полей (не на весь form state) — rerender правой колонки срабатывает локально, без пересборки левой. Latency моментальная (< 16ms), требование плана «< 100ms» выполнено с запасом.

### PriceRow extension (ключевая архитектурная находка)

Вместо того чтобы wrapper делал дополнительный запрос к БД при открытии модалки, в `PriceRow` добавлены два новых поля:

```typescript
export interface PriceRow {
  // ... existing fields
  inputs: PricingInputs      // полный набор входов, уже собранный на сервере
  context: {
    productId: string
    subcategoryId: string | null
    categoryId: string | null
  }
}
```

Серверная страница `page.tsx` заполняет их при сборке каждого из 4 типов priceRow (current/regular/auto/calculated). Модалка получает всё необходимое для initial form values + scope updates через props, без дополнительных round-trip к серверу.

### Scope checkboxes (ДРР / Брак)

Согласно D-14 в UI-SPEC, ДРР и Брак поддерживают выбор scope'а «только этот товар»:

| Чекбокс | Checked (true) | Unchecked (false) |
|---------|----------------|-------------------|
| ДРР «только этот товар» | `updateProductOverride(productId, "drrOverridePct", v)` | `updateSubcategoryDefault(subcategoryId, v)` + `toast.info` |
| Брак «только этот товар» | `updateProductOverride(productId, "defectRateOverridePct", v)` | `updateCategoryDefault(categoryId, v)` + `toast.info` |

Fallback: если `subcategoryId`/`categoryId` = `null`, показывается `toast.warning` и значение всё равно пишется на уровень продукта (чтобы не терять пользовательский ввод).

Доставка (`deliveryCostRub`) всегда пишется per-product через `updateProductDelivery` — D-14 явно запрещает раздавать её на subcategory/category.

### Submit flow (useTransition)

```
startTransition:
  1. if drrPct changed → updateProductOverride OR updateSubcategoryDefault
  2. if defectRatePct changed → updateProductOverride OR updateCategoryDefault
  3. if deliveryCostRub changed → updateProductDelivery (всегда per-product)
  4. sellerPrice = priceBeforeDiscount * (1 - sellerDiscountPct/100)
  5. snapshot = { inputs, outputs: liveOutputs, savedAt: ISO }
  6. saveCalculatedPrice({wbCardId, slot, name, sellerPrice, drrPct, defectRatePct, deliveryCostRub, snapshot})
  7. toast.success + onOpenChange(false)
```

`useTransition` даёт `isPending` для блокировки кнопок «Отмена» и «Сохранить как расчётную цену», а также переключения текста на «Сохранение…» во время серверного вызова.

### PriceCalculatorTableWrapper

Единственный state — `dialog: {card, row} | null`. При клике на строку:
1. Находит `Product.name` по `productId` через `groups.find()` (уже в памяти, нет запросов).
2. Сохраняет `card` с прибавленным `name` и `row`.
3. Условно рендерит `<PricingCalculatorDialog>` пока `dialog !== null`.

`onOpenChange(false)` → `setDialog(null)` → модалка анмонтируется (не просто скрывается), чтобы при следующем открытии внутренний `useForm` стартовал с свежими `defaultValues` для новой строки.

## Key decisions

1. **`z.number()` + `valueAsNumber` вместо `z.coerce.number()`** — zod 4.x + RHF 7.72 + zodResolver создают type mismatch на coerce (input `unknown` → output `number`). `register(name, {valueAsNumber: true})` приводит значение input перед валидацией Zod, что совместимо с обычным `z.number()`. Паттерн согласуется с Phase 4 решением об избегании `.default()` в zodResolver.
2. **Native `<select>` для выбора слота** — CLAUDE.md запрещает base-ui Select в проекте, поэтому используется обычный HTML `<select>` со стилизацией под shadcn Input.
3. **PriceRow extension vs дополнительный fetch** — выбрано расширение типа полями `inputs`/`context`, т.к. серверная страница уже собирает `PricingInputs` для `calculatePricing()`. Повторное использование того же объекта — zero overhead.
4. **Wrapper vs inline state в page.tsx** — page.tsx это RSC, нельзя использовать useState. Wrapper — минимальный клиентский компонент (67 строк), который полностью изолирует dialog state от серверной части.
5. **Условный render vs всегда mounted + `open` prop** — условный render гарантирует что при закрытии модалка полностью размонтируется. Следующее открытие = новый `useForm` с новыми `defaultValues`. Это проще чем синхронизировать форму с изменившимся props.row через `form.reset()`.
6. **`useWatch` вместо `form.watch()`** — `useWatch` триггерит rerender только компонента, который его использует (правая колонка outputs), тогда как `form.watch()` перерисовывает весь родительский компонент (включая левую колонку inputs).

## Key-links verified

- `PricingCalculatorDialog` → `@/app/actions/pricing` (saveCalculatedPrice, updateProductOverride, updateSubcategoryDefault, updateCategoryDefault, updateProductDelivery) ✓
- `PricingCalculatorDialog` → `@/lib/pricing-math` (calculatePricing, PricingInputs) ✓
- `PricingCalculatorDialog` → `@/components/ui/dialog` (Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter) ✓
- `PriceCalculatorTableWrapper` → `PriceCalculatorTable` (с onRowClick prop) ✓
- `PriceCalculatorTableWrapper` → `PricingCalculatorDialog` (conditional render) ✓
- `page.tsx` → `PriceCalculatorTableWrapper` (заменил прямой PriceCalculatorTable) ✓

## Verification

- `npx tsc --noEmit` — **clean** (0 ошибок)
- Коммит `d736026` содержит все 4 файла (589+67+19+45 вставок)
- UI human-verification checkpoint: user approved, полная визуальная/функциональная проверка отложена до phase-level `gsd-verifier` (финальный audit фазы 07)
- PriceRow extension позволяет модалке работать без дополнительных DB-запросов — проверено по коду wrapper (нет async, только `groups.find()`)

## Deviations

### Rule 1 — Bug fix (auto-fixed)

**1. `z.coerce.number()` → `z.number()` + `valueAsNumber`**
- **Found during:** Task 1, при первой компиляции `tsc --noEmit` выдавал type mismatch на `FormValues` в `useForm<FormValues>` и `resolver: zodResolver(formSchema)`.
- **Issue:** zod 4.x использует отдельные `input` и `output` типы; `z.coerce.number()` создаёт `z.ZodCoercedNumber<unknown>` с `input = unknown` и `output = number`. RHF 7.72 + @hookform/resolvers не могут сопоставить форму с таким двойным типом — `defaultValues` типизирован как `unknown`, что ломает `form.register`.
- **Fix:** замена на обычный `z.number()` + `register(name, {valueAsNumber: true})`. HTML `<input type="number">` даёт строку, `valueAsNumber` конвертирует в number перед валидацией Zod, что устраняет необходимость в coerce.
- **Files modified:** `components/prices/PricingCalculatorDialog.tsx`
- **Commit:** `d736026` (fix применён inline до финального коммита)
- **Prior art:** Phase 4 (`[Phase 04-products-module]: zodResolver с .default() causes type mismatch in RHF 7.72 — use defaultValues instead`) — та же категория проблемы.

### Rule 3 — Blocking issue (auto-fixed)

**2. PriceRow extension — добавлены поля `inputs` + `context`**
- **Found during:** Task 1, план явно указывал «EXECUTOR REFINEMENT» что самый простой подход — расширить `PriceRow` в плане 07-07/07-08 вместо того чтобы wrapper повторно искал данные.
- **Issue:** Без этих полей wrapper должен был бы принять `groups` + делать async вызов на сервер для получения полных `PricingInputs` при клике — это лишний round-trip и усложнение архитектуры.
- **Fix:** добавлены `inputs: PricingInputs` и `context: {productId, subcategoryId, categoryId}` в `PriceRow`. Обновлён `page.tsx` — при сборке каждого из 4 типов priceRow (current/regular/auto/calculated) заполняются эти поля из уже собранного `baseInputs`.
- **Files modified:** `components/prices/PriceCalculatorTable.tsx`, `app/(dashboard)/prices/wb/page.tsx`
- **Commit:** `d736026`

## Next

- **07-10** — добавление `WbPromotionsSyncButton` и `WbAutoPromoUploadButton` в шапку `/prices/wb/page.tsx` (TODO-маркеры из 07-08 готовы). Также Alert пустого состояния для активных акций.
- **07-11, 07-12** — финальные планы фазы (E2E тесты + phase verifier).

## Self-Check: PASSED

- SUMMARY.md: FOUND
- components/prices/PricingCalculatorDialog.tsx: FOUND
- components/prices/PriceCalculatorTableWrapper.tsx: FOUND
- Commit d736026: FOUND
