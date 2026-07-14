---
phase: quick-260714-maz-rolling
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/finance-weekly/buyout-discount.ts
  - tests/finance-weekly-buyout-discount.test.ts
  - lib/finance-weekly/data.ts
  - components/finance/WeeklyFinReportTable.tsx
  - components/finance/WeeklyFinArticleDialog.tsx
autonomous: true
requirements: [MAZ-01]

must_haves:
  truths:
    - "Строка бытовой техники (appliances) в /finance/weekly считается на кол-ве H = недельные заказы × (rolling-% выкупа / 100) — дробное, БЕЗ округления"
    - "grossPricePerUnit (K) бытовой = ordersSumRub / сырые заказы НЕ меняется; выручка строки K×H = ordersSumRub × %выкупа/100"
    - "Недельные ТОТАЛЫ затрат (реклама, отзывы, логистика ИУ deliveryRub, пулы) не искажаются — per-unit статьи делятся на дисконтированный H, logisticsIuPerUnit и applBase используют дисконт-qty"
    - "Одежда (clothing) считается по-прежнему (нетто-выкупы) — ветка не тронута"
    - "Rolling-резолвер из quick 260714-kuh переиспользуется — второго вызова loadBuyoutPctRolling30dMap НЕТ"
    - "Бейдж базиса бытовой в таблице = «по заказам × % выкупа»; модалка показывает дисконтированный H отформатированным (не сырой float) + актуальный ярлык базиса"
    - "tsc чист; vitest finance-weekly-* + pricing-math зелёные; engine.ts НЕ изменён (diff-guard)"
  artifacts:
    - path: "lib/finance-weekly/buyout-discount.ts"
      provides: "pure discountAppliancesByBuyout(rawOrders, rawRub, buyoutPct) → {qty, rub}"
      contains: "export function discountAppliancesByBuyout"
    - path: "tests/finance-weekly-buyout-discount.test.ts"
      provides: "3-4 кейса хелпера (K-инвариант, 100%, дробное-без-округления)"
    - path: "lib/finance-weekly/data.ts"
      provides: "appliances-ветка дисконтирует qty+rub через хелпер; комментарии актуализированы"
      contains: "discountAppliancesByBuyout"
    - path: "components/finance/WeeklyFinReportTable.tsx"
      provides: "UNIVERSE_BASIS.appliances = «по заказам × % выкупа»"
    - path: "components/finance/WeeklyFinArticleDialog.tsx"
      provides: "basisLabel appliances + формат дробного qtyOrders"
  key_links:
    - from: "lib/finance-weekly/data.ts (ветка appliances)"
      to: "buyoutResolver.resolve(nmId, weekEndISO)"
      via: "существующий инстанс из Promise.all (kuh) → discountAppliancesByBuyout → {qty, rub}"
      pattern: "discountAppliancesByBuyout\\(funnel"
    - from: "lib/finance-weekly/data.ts"
      to: "lib/finance-weekly/engine.ts"
      via: "WeeklyArticleInput.qtyOrders уже дисконтированный — контракт движка неизменен, engine.ts НЕ трогаем"
      pattern: "qtyOrders: qty"
---

<objective>
`/finance/weekly` для БЫТОВОЙ ТЕХНИКИ (appliances) считать юнит-экономику на
«выкупленных» единицах: недельное кол-во H = сырые заказы × (rolling-% выкупа/100)
— модель экономиста (его лист: H = F × коэф; неделя 22.06 коэф 0.87). База
остаётся ЗАКАЗЫ (WbCardFunnelDaily), но пересчитывается коэффициентом выкупа.

Процент — уже посчитанный в системе rolling-30d weighted per nmId
(`loadBuyoutPctRolling30dMap` → `BuyoutResolver.resolve`), только что подключённый
к N_std в quick 260714-kuh. ТОТ ЖЕ инстанс резолвера переиспользуется.

Одежда (clothing) НЕ меняется (там факт нетто-выкупов, quick 260714-gt7).

Purpose: приблизить понедельный фин-отчёт к листу экономиста для бытовой техники
(выручка и per-unit COGS падают на выкупы, недельные тоталы затрат сохраняются).
Output: дисконтированный H бытовой в движке + отражение базиса в таблице и модалке.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@lib/finance-weekly/data.ts
@lib/finance-weekly/clothing-net.ts
@components/finance/WeeklyFinReportTable.tsx
@components/finance/WeeklyFinArticleDialog.tsx

<interfaces>
<!-- Контракты уже в кодовой базе — использовать напрямую, БЕЗ доп. exploration. -->

Резолвер выкупа (lib/wb-advert-spend-data.ts) — уже загружен в data.ts:
```typescript
export interface BuyoutResolver {
  resolve(nmId: number, dateKey: string): number   // всегда число: fallback → per-subcat/global/90%
}
// В data.ts (Promise.all, ~строка 352): buyoutResolver — ЭТОТ инстанс. Второй load НЕ делать.
// Уже используется для N_std (~строка 589):
//   buyoutResolver.resolve(nmId, weekEndISO) ?? card?.buyoutPercent ?? 100
```

Движок (lib/finance-weekly/engine.ts) — НЕ трогать (diff-guard):
```typescript
// qtyOrders (H) = множитель. adSpendTotal/reviewWriteoffTotal — ТОТАЛЫ (движок делит на H).
// logisticsIuPerUnit/logisticsStdPerUnit — PER-UNIT (передаются как есть).
// revenue = K×H; пул per-unit = (K/baseRevenue)×poolTotal.  → H дисконтируем в data.ts, контракт не меняем.
```

Текущая appliances-ветка в data.ts (кандидатный цикл, ~строки 527-531):
```typescript
} else {
  const funnel = funnelByNmId.get(nmId)
  qty = funnel?.H ?? 0        // сырые заказы
  rub = funnel?.sumRub ?? 0   // сырая выручка заказов
}
// далее: if (qty <= 0) continue   (guard: защищает K = rub/qty от деления на 0)
// далее (2-й цикл): const K = rub / qty ; logisticsIuPerUnit(deliveryRub, qty) ; applBase += K*qtyOrders
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Хелпер дисконта + wiring в data.ts (appliances H = заказы × %выкупа)</name>
  <files>lib/finance-weekly/buyout-discount.ts, tests/finance-weekly-buyout-discount.test.ts, lib/finance-weekly/data.ts</files>

  <behavior>
  Pure `discountAppliancesByBuyout(rawOrders, rawRub, buyoutPct) → { qty, rub }`:
  - Test 1 (K-инвариант): (100, 50000, 87) → { qty: 87, rub: 43500 }; rub/qty === 500 === 50000/100 (валовая цена/ед НЕ меняется)
  - Test 2 (no-op): (10, 5000, 100) → { qty: 10, rub: 5000 }
  - Test 3 (дробное без округления): (4, 2000, 87.5) → qty === 3.5, rub === 1750; rub/qty === 500
  - Test 4 (zero-guard): (0, 0, 87) → { qty: 0, rub: 0 }
  </behavior>

  <action>
  ШАГ 1 — Pure-хелпер `lib/finance-weekly/buyout-discount.ts` (ноль импортов, как
  clothing-net.ts — чтобы vitest не тянул prisma/next-auth chain):
  ```typescript
  // lib/finance-weekly/buyout-discount.ts
  //
  // Quick 260714-maz: pure-хелпер дисконта базиса БЫТОВОЙ ТЕХНИКИ (appliances) в
  // понедельном фин-отчёте /finance/weekly. Модель экономиста: недельное кол-во
  // H = заказы × (rolling-% выкупа / 100) — его лист H = F × коэф (неделя 22.06
  // коэф 0.87). База остаётся ЗАКАЗЫ (WbCardFunnelDaily), пересчитывается в
  // «выкупленные» единицы. rolling-% — тот же, что подключён к N_std
  // (quick 260714-kuh, loadBuyoutPctRolling30dMap → BuyoutResolver.resolve).
  //
  // Инвариант: сумму дисконтируем ТЕМ ЖЕ коэффициентом → grossPricePerUnit
  // K = rub/qty = ordersSumRub/сырые_заказы СОХРАНЯЕТСЯ; выручка K×H =
  // ordersSumRub × %выкупа/100. Per-unit статьи из недельных ТОТАЛОВ (реклама,
  // отзывы, логистика ИУ = deliveryRub/H) ложатся на выкупленные ед., тоталы
  // затрат не искажаются. НЕ округляем (движок линеен; экономист — дробный H).
  //
  // Одежда (clothing) сюда НЕ идёт — нетто-выкупы (lib/finance-weekly/clothing-net.ts).

  /** Дисконт бытовой техники: {qty, rub} = сырые × (buyoutPct/100). Коэффициент
   *  общий → K=rub/qty сохраняет валовую цену/ед. buyoutPct в процентах. */
  export function discountAppliancesByBuyout(
    rawOrders: number,
    rawRub: number,
    buyoutPct: number,
  ): { qty: number; rub: number } {
    const factor = buyoutPct / 100
    return { qty: rawOrders * factor, rub: rawRub * factor }
  }
  ```

  ШАГ 2 — Тест `tests/finance-weekly-buyout-discount.test.ts` (4 кейса из <behavior>,
  `toBeCloseTo` для дробных, `import { discountAppliancesByBuyout } from "@/lib/finance-weekly/buyout-discount"`).
  Запустить — должен пройти (RED невозможен: чистая арифметика, сразу GREEN — ок для quick).

  ШАГ 3 — Wiring в `lib/finance-weekly/data.ts`:
  - Добавить импорт вверху:
    `import { discountAppliancesByBuyout } from "@/lib/finance-weekly/buyout-discount"`
  - Заменить appliances-ветку кандидатного цикла (сейчас `qty = funnel?.H ?? 0; rub = funnel?.sumRub ?? 0`):
  ```typescript
  } else {
    // Quick 260714-maz — модель экономиста для БЫТОВОЙ ТЕХНИКИ: H = заказы ×
    // (rolling-% выкупа/100). Резолвер — ТОТ ЖЕ инстанс, что и ПВ модели N_std
    // ниже (buyoutResolver из Promise.all, kuh; второй load НЕ делаем).
    // Сумму дисконтируем тем же коэф → K=rub/qty сохраняет валовую цену
    // (ordersSumRub/заказы); per-unit тоталы (реклама/отзывы/логистика ИУ)
    // лягут на выкупленные ед., недельные тоталы затрат не искажаются.
    const funnel = funnelByNmId.get(nmId)
    const buyoutPct =
      buyoutResolver.resolve(nmId, weekEndISO) ?? cardByNmId.get(nmId)?.buyoutPercent ?? 100
    const discounted = discountAppliancesByBuyout(funnel?.H ?? 0, funnel?.sumRub ?? 0, buyoutPct)
    qty = discounted.qty
    rub = discounted.rub
  }
  ```
    Существующий `if (qty <= 0) continue` НЕ трогать — теперь проверяет дисконт-qty
    (по-прежнему защищает `K = rub / qty` от деления на 0). Ветку `clothing` НЕ трогать.
    НЕ менять строку N_std (`buyoutPct: buyoutResolver.resolve(...)` ~589) — оставить как есть
    (второй resolve на тот же инстанс — дешёвый lookup, минимальный аддитивный дифф).

  ШАГ 4 — Актуализировать комментарии data.ts (req 7):
  - Шапка (строка ~8): `заказы/выручка (appliances) — WbCardFunnelDaily (Σ недели по nmId)`
    → отразить дисконт на rolling-% выкупа (модель экономиста H=F×коэф, quick 260714-maz;
    K=выручка/заказы сохраняется).
  - Инлайн у кандидатного цикла (~строки 498-500) и у `qtyOrders: qty` (~строки 624-625):
    заменить «appliances → заказы» на «appliances → заказы × rolling-% выкупа (maz)».

  НЕ создавать второй `loadBuyoutPctRolling30dMap`. НЕ трогать engine.ts / types.ts / plan-fact.ts.
  </action>

  <verify>
    <automated>npx vitest run tests/finance-weekly-buyout-discount.test.ts</automated>
    <automated>npx tsc --noEmit</automated>
  </verify>

  <done>
  Хелпер + тест зелёные (4 кейса, K-инвариант проверен). data.ts: appliances-ветка
  дисконтирует qty+rub через хелпер, использует существующий buyoutResolver (без 2-го
  load), clothing нетронут, комментарии актуализированы. tsc чист. engine.ts/types.ts/
  plan-fact.ts не менялись.
  </done>
</task>

<task type="auto">
  <name>Task 2: Отражение базиса в UI (бейдж таблицы + модалка)</name>
  <files>components/finance/WeeklyFinReportTable.tsx, components/finance/WeeklyFinArticleDialog.tsx</files>

  <action>
  ШАГ 1 — `components/finance/WeeklyFinReportTable.tsx`, `UNIVERSE_BASIS` (~строки 37-40):
  сменить appliances-текст, сохранив стиль (одежда — не трогать):
  ```typescript
  const UNIVERSE_BASIS: Record<Universe, string> = {
    appliances: "по заказам × % выкупа",
    clothing: "по выкупам нетто",
  }
  ```
  Комментарий над константой (~35-40) обновить: бытовая — заказы × rolling-% выкупа
  (quick 260714-maz, модель экономиста H=F×коэф). Рендер бейджа (`${dirLabel} · ${UNIVERSE_BASIS[a.universe]}`)
  уже готов — правок не требует.

  ШАГ 2 — `components/finance/WeeklyFinArticleDialog.tsx` (модалка теперь получает
  ДРОБНЫЙ appliances qtyOrders — нельзя рендерить сырой float):
  - Добавить форматтер рядом с fmtRub0/fmtRub2:
    ```typescript
    /** Кол-во ед.: бытовая — дробное (заказы×%выкупа), до 1 знака. */
    const qtyFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 })
    ```
  - Обновить `basisLabel` (~строки 62-65) — актуальные ярлыки базиса:
    ```typescript
    /** Базис qtyOrders: одежда — нетто-выкупы; бытовая — заказы × % выкупа
     *  (quick 260714-maz, дробный H). */
    function basisLabel(universe: ArticleResult["universe"]): string {
      return universe === "clothing" ? "выкупы нетто" : "заказы × %выкупа"
    }
    ```
  - Обе подстановки `{article.qtyOrders}` (строки ~111 и ~146) обернуть в
    `{qtyFmt.format(article.qtyOrders)}` (одежда-integer → «8»; бытовая → «87,3»).

  Ничего в расчётах не менять — модалка read-only. Другие компоненты/страницы не трогать.
  </action>

  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>

  <done>
  Таблица: бейдж направления бытовой = «... · по заказам × % выкупа». Модалка: ярлык
  базиса актуализирован (бытовая «заказы × %выкупа», одежда «выкупы нетто»), дробный H
  отображается форматированным (без сырого float). tsc чист.
  </done>
</task>

</tasks>

<verification>
Гейт правок /finance/weekly (CLAUDE.md): tsc + vitest (finance-weekly-* + pricing-math)
+ diff-guard engine.ts.

```bash
npx tsc --noEmit
npx vitest run finance-weekly pricing-math   # включает новый finance-weekly-buyout-discount
git diff --stat -- lib/finance-weekly/engine.ts   # ДОЛЖНО быть пусто (engine.ts не тронут)
```

Ручная сверка (UAT, после деплоя): для бытовой недели, где у экономиста есть коэф
(напр. 22.06, коэф ≈ 0.87), проверить, что H строки бытовой ≈ сырые заказы × коэф;
«Выручка» бытовой = ordersSumRub × коэф; «Итого затрат» водопада почти не меняется
относительно до-maz (сдвигается только доля per-unit статей на дисконтированный H,
тоталы реклама/отзывы/логистика-ИУ/пулы сохраняются).
</verification>

<success_criteria>
- Бытовая техника в /finance/weekly считается на H = заказы × rolling-% выкупа (дробное).
- K (валовая цена/ед) бытовой не изменился; выручка строки = заказы-выручка × %выкупа.
- Логистика ИУ (deliveryRub) и пулы распределяются по дисконт-qty; недельные тоталы не искажены.
- Одежда без изменений; резолвер kuh переиспользован (нет 2-го load).
- Бейдж таблицы «по заказам × % выкупа»; модалка не показывает сырой float.
- tsc чист; vitest finance-weekly-* + pricing-math зелёные; engine.ts не изменён.
</success_criteria>

<out_of_scope>
- **plan-fact.ts НЕ меняется.** После дисконта колонка таблицы «Выручка» бытовой =
  выкуп-выручка, а KPI «Факт» / per-row «% вып (нед)» берут план и факт из заказов
  (planOrdersRub / WbCardFunnelDaily) → появится расхождение ~(1−%выкупа) для бытовой.
  Это ОСОЗНАННО и прецедентно: quick 260714-gt7 так же оставил план-факт одежды на
  gross-выкупах при нетто-базисе таблицы. Флаг для UAT: если пользователь захочет
  выровнять план-факт бытовой на выкупы — отдельный quick.
- **engine.ts / types.ts не трогаем.** Контракт `WeeklyArticleInput.qtyOrders` не меняется
  (движок получает уже дисконтированный H). Комментарий `qtyOrders` в types.ts остаётся
  как есть (устаревшая формулировка «appliances → заказы» — не в скоупе req 7, который
  про data.ts).
</out_of_scope>

<output>
After completion, create `.planning/quick/260714-maz-rolling/260714-maz-SUMMARY.md`
</output>
