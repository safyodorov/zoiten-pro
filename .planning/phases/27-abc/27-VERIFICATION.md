---
phase: 27-abc
verified: 2026-07-05T16:40:30Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Открыть /sales-plan «Товары» под SALES MANAGE, найти товар без ABC-статуса: убедиться, что тумблер «заказываем» отображается в состоянии on (checked) и активен"
    expected: "Checkbox checked=true, enabled — новые товары без abcStatus имеют orderEnabled=true по умолчанию"
    why_human: "Дефолтное значение orderEnabled=true в БД нельзя проверить без реальных данных; визуальное состояние тумблера требует браузера"
  - test: "Установить ABC=C через инлайн-select для любого товара: убедиться, что тумблер «Заказ» немедленно переходит в off+disabled с tooltip «Статус C — вне ассортимента»"
    expected: "После смены C → checkbox unchecked+disabled, tooltip появляется при hover; router.refresh обновляет строку без перезагрузки страницы"
    why_human: "Optimistic UI + router.refresh behavior после реального server action вызова не проверяется статически"
  - test: "Установить ABC=C для товара с существующими SUGGESTED виртуальными закупками. Проверить в /sales-plan «Пора заказывать», что VP исчезли"
    expected: "Виртуальные закупки со статусом SUGGESTED удалены после regenerateVirtualPurchasesInternal([productId])"
    why_human: "Требует реальных данных в БД и живого сервера с PostgreSQL"
---

# Phase 27: ABC-статус + флаг «заказываем» Verification Report

**Phase Goal:** В `/sales-plan «Товары»` — ABC-статус (A/B/C) с инлайн-сменой (глобально `Product.abcStatus`) + флаг «заказываем/не заказываем» (`Product.orderEnabled`, C принудительно off). Флаг гейтит движок: «не заказываем»/C → виртуальные закупки НЕ считаются; план продаж будущих периодов = распродажа остатка потом 0 (движок продаж не переписываем).
**Verified:** 2026-07-05T16:40:30Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                  | Status     | Evidence                                                                                                                       |
|----|------------------------------------------------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------------------------------------------------------|
| 1  | Товар со статусом C НЕ получает виртуальных закупок (effectiveOrderEnabled=false)                                      | ✓ VERIFIED | `computeEffectiveOrderEnabled("C", true) = false`; тест C→false прямой; тест suggester C→0 VP: 11/11 тестов GREEN            |
| 2  | Товар с orderEnabled=false (A/B) НЕ получает виртуальных закупок                                                      | ✓ VERIFIED | helper: `("B", false) = false`; гейт в suggestVirtualPurchases строка 231: `if (product.effectiveOrderEnabled === false) continue` |
| 3  | Товар A/B с orderEnabled=true получает виртуальные закупки как раньше (регрессии нет)                                  | ✓ VERIFIED | Тест `("A", true) = true`; тест suggester `effectiveOrderEnabled=true → length > 0`; sales-plan-virtual/engine/iu — 30/30 GREEN |
| 4  | Существующие товары после миграции имеют orderEnabled=true (обратная совместимость)                                     | ✓ VERIFIED | `ALTER TABLE "Product" ADD COLUMN "orderEnabled" BOOLEAN NOT NULL DEFAULT true` — DEFAULT true гарантирует совместимость       |
| 5  | updateProductAbcStatus и updateProductOrderEnabled пишут глобальные поля Product под SALES MANAGE и регенерируют VP    | ✓ VERIFIED | Оба action: `requireSection("SALES","MANAGE")` первой строкой; zod-валидация; `prisma.product.update`; `regenerateVirtualPurchasesInternal([productId])`; `revalidateSalesPlanPaths()` |
| 6  | Формула гейта живёт в ОДНОМ helper computeEffectiveOrderEnabled — regenerate и тесты используют его, инлайна нет       | ✓ VERIFIED | `grep 'abcStatus !== "C"'` в actions/page.tsx/ProductPlanTable.tsx → 0 matches; helper объявлен 1 раз в virtual-purchases.ts:351 |
| 7  | В строке товара /sales-plan «Товары» виден ABC-бейдж (A/B/C/«—») с цветом по классу                                   | ✓ VERIFIED | ProductPlanTable.tsx: ABC_CLASSES const; native `<select>` с option A/B/C/«—»; badge-span для read-only режима               |
| 8  | Клик по ABC меняет статус глобально (updateProductAbcStatus) с optimistic-обновлением                                  | ✓ VERIFIED | `onChange → startTransition(async () => { await updateProductAbcStatus(p.productId, next); router.refresh() })`               |
| 9  | Для товара со статусом C тумблер визуально off + disabled + tooltip «Статус C — вне ассортимента»                      | ✓ VERIFIED | `checked={p.effectiveOrderEnabled}` (C→false); `disabled={!canManage \|\| isPending \|\| p.abcStatus === "C"}`; `title={p.abcStatus === "C" ? "Статус C — вне ассортимента" : undefined}` |
| 10 | Строка-итог tfoot остаётся выровненной: число ячеек tfoot = число колонок thead после добавления 2 колонок             | ✓ VERIFIED | tfoot содержит `<td colSpan={4}>Итого</td>` + `<td>сумма-Сток</td>` + `<td className="border-r" />` + `<td className="border-r" />` + months.map + `<td>Итог₽</td>` |
| 11 | engine.ts не изменён — распродажа остатка = следствие skip'а закупок, без обнуления rateRequested                       | ✓ VERIFIED | `git diff 6a12056..87bdd28 -- lib/sales-plan/engine.ts` → пустой diff                                                        |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact                                                                 | Expected                                          | Status     | Details                                                                   |
|--------------------------------------------------------------------------|---------------------------------------------------|------------|---------------------------------------------------------------------------|
| `prisma/migrations/20260705_product_order_enabled/migration.sql`         | ALTER TABLE Product ADD COLUMN orderEnabled DEFAULT true | ✓ VERIFIED | Точное содержание подтверждено чтением файла |
| `lib/sales-plan/virtual-purchases.ts`                                    | computeEffectiveOrderEnabled + гейт skip           | ✓ VERIFIED | helper строки 351-356; гейт строка 231 (первый оператор цикла); effectiveOrderEnabled в интерфейсе строка 57 |
| `lib/sales-plan/data.ts`                                                 | abcStatus + orderEnabled в ProductPlanInput        | ✓ VERIFIED | Строки 466-467: `abcStatus: p.abcStatus ?? null, orderEnabled: p.orderEnabled` |
| `app/actions/sales-plan.ts`                                              | computeEffectiveOrderEnabled + 2 server actions    | ✓ VERIFIED | Импорт строка 20; вызов в vpProducts строка 955; updateProductAbcStatus строка 1623; updateProductOrderEnabled строка 1658 |
| `tests/sales-plan-order-gate.test.ts`                                    | 11 тестов helper + гейта                           | ✓ VERIFIED | 2 describe-блока, 11 тестов, 11/11 GREEN при запуске |
| `app/(dashboard)/sales-plan/products/page.tsx`                           | computeEffectiveOrderEnabled в tableProducts       | ✓ VERIFIED | Импорт строка 11; вызов строка 242; canManage передан в ProductPlanTable строка 310 |
| `components/sales-plan/ProductPlanTable.tsx`                             | ABC select + тумблер + tfoot выравнивание          | ✓ VERIFIED | ABC_CLASSES, native select, checkbox disabled для C, 2 пустых td в tfoot |

---

### Key Link Verification

| From                                                          | To                                                            | Via                                                   | Status     | Details                                                              |
|---------------------------------------------------------------|---------------------------------------------------------------|-------------------------------------------------------|------------|----------------------------------------------------------------------|
| `app/actions/sales-plan.ts:regenerateVirtualPurchasesInternal` (vpProducts) | `lib/sales-plan/virtual-purchases.ts:computeEffectiveOrderEnabled` | `computeEffectiveOrderEnabled(p.abcStatus, p.orderEnabled)` строка 955 | ✓ WIRED    | Импорт подтверждён строка 20; вызов подтверждён строка 955; инлайна нет |
| `lib/sales-plan/data.ts:loadSalesPlanInputs`                 | `ProductPlanInput.abcStatus / orderEnabled`                  | product scalar-поля из findMany include               | ✓ WIRED    | Строки 466-467: оба поля добавлены в productInputs.push             |
| `components/sales-plan/ProductPlanTable.tsx (ABC select onChange)` | `app/actions/sales-plan.ts:updateProductAbcStatus`       | `startTransition + await action + router.refresh`     | ✓ WIRED    | Строка 558: прямой вызов `updateProductAbcStatus(p.productId, next)` |
| `components/sales-plan/ProductPlanTable.tsx (тумблер onChange)` | `app/actions/sales-plan.ts:updateProductOrderEnabled`      | `startTransition + await action + router.refresh`     | ✓ WIRED    | Строка 589: прямой вызов `updateProductOrderEnabled(p.productId, enabled)` |

---

### Data-Flow Trace (Level 4)

| Artifact                        | Data Variable    | Source                                      | Produces Real Data | Status    |
|---------------------------------|------------------|---------------------------------------------|-------------------|-----------|
| `ProductPlanTable.tsx`          | `p.abcStatus`    | `loadSalesPlanInputs → productInputs.push` → `p.abcStatus ?? null` в page.tsx → tableProducts | ✓ БД query через prisma.product findMany | ✓ FLOWING |
| `ProductPlanTable.tsx`          | `p.effectiveOrderEnabled` | `computeEffectiveOrderEnabled(p.abcStatus, p.orderEnabled)` в page.tsx | ✓ Вычислено из реальных полей БД | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior                                         | Command                                                         | Result                         | Status  |
|--------------------------------------------------|-----------------------------------------------------------------|--------------------------------|---------|
| computeEffectiveOrderEnabled: C→false            | `vitest run tests/sales-plan-order-gate.test.ts`                | 11/11 passed                   | ✓ PASS  |
| Гейт suggester: effectiveOrderEnabled=false → 0 VP | `vitest run tests/sales-plan-order-gate.test.ts`              | 11/11 passed                   | ✓ PASS  |
| Golden: iu === 438_068_120 не изменился          | `vitest run tests/sales-plan-iu.test.ts`                        | passed                         | ✓ PASS  |
| Регрессия engine/virtual Phase 25/26             | `vitest run tests/sales-plan-engine.test.ts sales-plan-virtual.test.ts` | 30/30 passed             | ✓ PASS  |
| TypeScript: типы Product.orderEnabled известны  | `npx tsc --noEmit`                                               | 0 ошибок                       | ✓ PASS  |
| engine.ts не тронут (D-4)                        | `git diff 6a12056..87bdd28 -- lib/sales-plan/engine.ts`         | пустой diff                    | ✓ PASS  |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                                         | Status      | Evidence                                                                              |
|-------------|------------|---------------------------------------------------------------------------------------------------------------------|-------------|---------------------------------------------------------------------------------------|
| SP-18       | 27-02      | ABC-статус в /sales-plan «Товары», инлайн-смена глобально, server action updateProductAbcStatus (SALES MANAGE)      | ✓ SATISFIED | ProductPlanTable.tsx: native select + updateProductAbcStatus; page.tsx: abcStatus в tableProducts; RBAC подтверждён |
| SP-19       | 27-01      | Product.orderEnabled + гейт suggestVirtualPurchases + updateProductOrderEnabled (SALES MANAGE) + тесты              | ✓ SATISFIED | Миграция SQL + schema + helper computeEffectiveOrderEnabled + skip в suggester + 11 тестов GREEN |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | Не обнаружено |

Grep-проверки пройдены:
- Inline formula `abcStatus !== "C"` в actions/page/table: **0 occurrences** (только в helper body и planning docs)
- `computeEffectiveOrderEnabled` экспортирован ровно 1 раз: подтверждено
- `effectiveOrderEnabled === false` гейт: первый оператор цикла (строка 231 из loop start 228)
- `requireSection("SALES", "MANAGE")` в обоих новых actions: подтверждено

---

### Human Verification Required

#### 1. Тумблер «заказываем» для новых товаров (default state)

**Test:** Открыть /sales-plan «Товары» под SALES MANAGE, найти товар без ABC-статуса (abcStatus=null). Убедиться, что тумблер «Заказ» отображается checked и активен.
**Expected:** Checkbox checked=true, enabled — новые товары без abcStatus имеют orderEnabled=true по умолчанию (обратная совместимость).
**Why human:** Дефолтное значение orderEnabled=true в БД нельзя проверить без реальных данных; визуальное состояние тумблера требует браузера.

#### 2. ABC=C форсирует тумблер off+disabled с tooltip

**Test:** В /sales-plan «Товары» через native `<select>` установить ABC=C для любого товара. Наблюдать реакцию тумблера «Заказ».
**Expected:** После смены на C — checkbox unchecked+disabled, tooltip «Статус C — вне ассортимента» появляется при hover; router.refresh обновляет строку без полной перезагрузки страницы.
**Why human:** Optimistic UI + router.refresh behavior после реального server action call не проверяется статически.

#### 3. Регенерация VP при смене статуса (live data)

**Test:** Для товара с существующими SUGGESTED VP установить ABC=C (или выключить тумблер «заказываем»). Проверить в /sales-plan «Пора заказывать», что VP по этому товару исчезли.
**Expected:** Виртуальные закупки со статусом SUGGESTED удаляются после `regenerateVirtualPurchasesInternal([productId])` — because `effectiveOrderEnabled=false` triggering the skip gate.
**Why human:** Требует реальных данных в БД с существующими VP и живого сервера с PostgreSQL.

---

### Gaps Summary

None — все программные проверки прошли. Human verification items (3) касаются исключительно runtime-поведения (визуальные компоненты в браузере, живая база данных с реальными VP).

---

_Verified: 2026-07-05T16:40:30Z_
_Verifier: Claude (gsd-verifier)_
