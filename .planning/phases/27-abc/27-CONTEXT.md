# Phase 27: План продаж — ABC-статус + флаг «заказываем» - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning
**Source:** Запрос пользователя (SUPERADMIN) + 2 уточняющих ответа + live-разбор модели в сессии

<domain>
## Phase Boundary

Расширение вкладки `/sales-plan «Товары»`: показать ABC-статус товара с инлайн-сменой (глобально) и флаг «заказываем/не заказываем», который гейтит движок плана. НЕ трогаем: формулу движка продаж (`orders=min(ставка,сток)`), факт/ИУ/Сводный, версионирование, golden `iu=438 068 120`, roll-forward/крон (Phase 26). Область — **только** `/sales-plan «Товары»` (не /products, не /prices/wb и т.п.).
</domain>

<decisions>
## Implementation Decisions (LOCKED — пользователь 2026-07-05)

### D-1. Область — только `/sales-plan «Товары»`
ABC-бейдж с инлайн-сменой A/B/C + тумблер «заказываем/не заказываем» в строке товара матрицы. В другие товарные таблицы НЕ выносим.

### D-2. ABC меняется глобально
Инлайн-смена пишет `Product.abcStatus` (enum `AbcStatus { A B C }` уже существует, nullable). Значение глобальное — отражается везде, где показывается статус (например бейдж в `/products`). Пустой статус (null) допустим.

### D-3. Флаг «заказываем» — новое глобальное поле
`Product.orderEnabled Boolean @default(true)` (рукописная миграция). Эффективное значение:
```
effectiveOrderEnabled = (abcStatus !== 'C') && orderEnabled
```
- **C = вывод из ассортимента** → тумблер принудительно off + заблокирован (нельзя включить «заказываем», пока статус C).
- **A/B** → тумблер по выбору пользователя (default true = «заказываем»).

### D-4. Эффект гейта — «распродаём остаток, потом 0»
Товары с `effectiveOrderEnabled === false`:
- **Виртуальные закупки НЕ считаются** — исключаются из `suggestVirtualPurchases` (skip в цикле по товарам) и, соответственно, из `regenerateVirtualPurchasesInternal`.
- **План продаж будущих периодов** = распродажа текущего остатка до нуля, дальше 0. Движок НЕ переписываем: он уже делает `orders=min(rateRequested, stock)`; без пополнений сток истощается сам → продажи сходят к 0. **Полного обнуления rateRequested НЕ делаем** (пользователь выбрал «распродаём остаток, потом 0», не «полностью 0»).
- Товар остаётся видимым в таблице «Товары» (с ABC + тумблером), просто без виртуальных закупок.

### D-5. RBAC
Инлайн-правки ABC и флага из `/sales-plan` мутируют **глобальные** поля `Product` — write требует `requireSection("SALES","MANAGE")` (пользователь явно хочет менять «прямо в таблицах, глобально»; SUPERADMIN bypass). Зафиксировано осознанно: sales-plan-действие пишет product-поле.

### Claude's Discretion
- UI инлайн-смены ABC: клик по бейджу → маленький поповер/native `<select>` A/B/C/«—», либо цикл по клику. Рекомендация: native `<select>` (CLAUDE.md convention) или клик-цикл A→B→C→— с цветным бейджем.
- Вид тумблера «заказываем»: чекбокс/свитч в отдельной колонке строки; при C — визуально off + `disabled` + tooltip «Статус C — вне ассортимента».
- Порядок колонок в матрице (куда воткнуть ABC + тумблер) — рядом с SKU/названием.
- Стоит ли при выключении «заказываем» сразу гасить существующие SUGGESTED VP по товару — да, вызвать `regenerateVirtualPurchasesInternal([productId])` после смены флага/статуса (как в saveMonthLevels).
</decisions>

<canonical_refs>
## Canonical References

### Модель
- `prisma/schema.prisma`: `enum AbcStatus { A B C }` (стр. ~39); `Product.abcStatus AbcStatus?` (стр. ~400). **Добавить** `Product.orderEnabled Boolean @default(true)`. Рукописная миграция `prisma/migrations/2026..._product_order_enabled/` (ADD COLUMN DEFAULT true) + `prisma migrate deploy` в deploy.sh.

### Движок / загрузчик (гейт виртуальных закупок)
- `lib/sales-plan/data.ts`: `loadSalesPlanInputs` — `db.product.findMany({ where: { deletedAt: null }, select: {...} })` (стр. ~91). **Добавить** в select `abcStatus: true, orderEnabled: true`; протащить в `ProductPlanInput` (сборка ~стр. 313).
- `lib/sales-plan/types.ts`: `ProductPlanInput` (~стр. 45) — добавить `abcStatus?: 'A'|'B'|'C'|null` + `orderEnabled?: boolean` (или сразу вычисленный `effectiveOrderEnabled: boolean`). `VpProductInput` (в virtual-purchases.ts) — добавить `effectiveOrderEnabled`.
- `lib/sales-plan/virtual-purchases.ts`: `suggestVirtualPurchases` — цикл `for (const product of input.products)` (~стр. 176). **Skip**, если `product.effectiveOrderEnabled === false` (не генерировать предложения). Pure — вычисленный флаг подаётся снаружи.
- `app/actions/sales-plan.ts`: `regenerateVirtualPurchasesInternal` (~стр. 702) — при сборке `vpProducts` (~стр. 805) прокинуть `effectiveOrderEnabled` из `inputs.products` (или пересчитать из abcStatus+orderEnabled).

### Server actions (новые, по образцу существующих в app/actions/sales-plan.ts / products.ts)
- `updateProductAbcStatus(productId, status: 'A'|'B'|'C'|null)` — `requireSection("SALES","MANAGE")`, `prisma.product.update`, `revalidatePath("/sales-plan/products")` (+ можно `/products`). После смены на/с C — регенерация VP по товару (C влияет на effectiveOrderEnabled).
- `updateProductOrderEnabled(productId, enabled: boolean)` — `requireSection("SALES","MANAGE")`, update, `regenerateVirtualPurchasesInternal([productId])`, revalidate.

### UI
- `app/(dashboard)/sales-plan/products/page.tsx`: сериализация `tableProducts` (~стр. 205-248) — добавить `abcStatus` + `orderEnabled` (+ вычисленный `effectiveOrderEnabled`) в строку. Product-query для tableProducts берётся из `inputs.products` (данные уже будут после правки data.ts).
- `components/sales-plan/ProductPlanTable.tsx`: колонка ABC-бейдж (инлайн-смена) + колонка/иконка тумблера «заказываем». Образец инлайн-оптимистичного апдейта — `saveMonthLevels`/`useTransition` в этом же файле; ABC-бейдж-классы — `ABC_CLASSES` из `components/products/ProductsTable.tsx`.

### Правила проекта (CLAUDE.md)
- Server Actions: `"use server"` + `requireSection("SALES","MANAGE")` + try/catch + revalidatePath.
- Native `<select>` (не base-ui) для инлайн-смены статуса.
- Миграции — рукописный SQL + `prisma migrate deploy` (НЕ `prisma db push`); `prisma generate` после правки schema.
- Sticky-таблицы: сплошной `bg-background` на sticky-ячейках.
- vitest `npm run test`; не ломать sales-plan тесты (69 зелёных) + golden iu=438 068 120.
</canonical_refs>

<specifics>
## Specific Ideas
- Тест гейта (pure): `suggestVirtualPurchases` с товаром `effectiveOrderEnabled=false` (сток есть, breach есть) → 0 предложений; тот же товар с `true` → предложения как раньше. Второй товар (заказываем) в том же прогоне не задет.
- Тест «C форсит off»: `effectiveOrderEnabled` при abc='C' && orderEnabled=true → false.
- Optimistic UI: смена ABC/тумблера через `useTransition` + server action + `router.refresh()` (паттерн проекта per-user prefs / inline edits).
- `Product.orderEnabled` — глобальное поле, дефолт true → существующие товары остаются «заказываем» после миграции (обратная совместимость).

## Golden anchors (НЕ менять)
- `iuTotalForRange("2026-07-01","2026-12-31") === 438_068_120`
- engine golden (T+3/T+6/сток-лимит), rollforward/distribute-forward тесты Phase 26
- Инвариант виртуальных закупок «не прошлым числом»
</specifics>

<deferred>
## Deferred Ideas
- Инлайн-смена ABC в других таблицах (/products, /prices/wb, /stock) — не в этой фазе (D-1: только sales-plan).
- Полное обнуление будущих продаж для C (вместо распродажи остатка) — отклонено пользователем (D-4).
- Отдельная колонка «эффективный статус заказа» / массовые операции по ABC — не сейчас.
- ABC-фильтр в каскадных фильтрах sales-plan — не сейчас.
</deferred>

---

*Phase: 27-abc*
*Context gathered: 2026-07-05 — запрос пользователя + 2 ответа (область=только sales-plan Товары; остаток при C=распродаём потом 0) + live-разбор кода (модель Product.abcStatus существует, orderEnabled — новое поле)*
