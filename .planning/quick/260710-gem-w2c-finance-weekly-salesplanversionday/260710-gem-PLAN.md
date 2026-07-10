---
phase: quick-260710-gem
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/finance-weekly/plan-fact.ts
  - lib/finance-weekly/data.ts
  - tests/finance-weekly-plan-fact.test.ts
  - components/finance/WeeklyFinReportTable.tsx
  - app/(dashboard)/finance/weekly/page.tsx
autonomous: true
requirements: [W2c]

must_haves:
  truths:
    - "При активной версии плана продаж строки артикулов /finance/weekly показывают «План (нед), ₽» и «% вып. (нед)»; подытоги вселенных и Итого — Σфакт/Σплан"
    - "Над таблицей виден KPI-блок: План/Факт/% недели + План месяца/Факт месяца (по weekEnd)/% вып. МТД"
    - "Без активной версии (AppSetting salesPlan.activeVersionId отсутствует) колонки рендерят «—», KPI-блок скрыт, страница не падает"
    - "Сумма распределённых по nmId планов товара в точности равна плану товара (доли из неокруглённых float, без дрейфа)"
    - "Движок не тронут: tests/finance-weekly-engine.test.ts + tests/pricing-math.test.ts остаются 68/68 green"
  artifacts:
    - path: "lib/finance-weekly/plan-fact.ts"
      provides: "loadWeeklyPlanFact (Prisma-загрузчик план-факта недели/месяца) + distributePlanAcrossNmIds (pure распределение план→nmId)"
      exports: ["loadWeeklyPlanFact", "distributePlanAcrossNmIds", "WeeklyPlanFact"]
    - path: "tests/finance-weekly-plan-fact.test.ts"
      provides: "Unit-тесты pure-функции распределения (1 nmId / пропорция / equal split / инвариант суммы)"
    - path: "components/finance/WeeklyFinReportTable.tsx"
      provides: "Колонки План (нед)/% вып. (нед) + KPI-блок, optional prop planFact"
    - path: "app/(dashboard)/finance/weekly/page.tsx"
      provides: "Вызов loadWeeklyPlanFact после loadWeeklyFinReportInputs, проброс planFact в таблицу"
  key_links:
    - from: "app/(dashboard)/finance/weekly/page.tsx"
      to: "lib/finance-weekly/plan-fact.ts"
      via: "import { loadWeeklyPlanFact }"
      pattern: "loadWeeklyPlanFact\\("
    - from: "lib/finance-weekly/plan-fact.ts"
      to: "AppSetting salesPlan.activeVersionId + prisma.salesPlanVersionDay"
      via: "findUnique + groupBy(by: ['productId'], _sum: { planOrdersRub })"
      pattern: "salesPlan\\.activeVersionId"
    - from: "lib/finance-weekly/data.ts"
      to: "components/finance/WeeklyFinReportTable.tsx"
      via: "meta[nmId].productId (nmId→productId mapping без повторного запроса)"
      pattern: "productId: product\\.id"
    - from: "components/finance/WeeklyFinReportTable.tsx"
      to: "planFact prop"
      via: "рендер колонок «План (нед), ₽» / «% вып. (нед)» + KPI-блок"
      pattern: "План \\(нед\\)"
---

<objective>
W2c для /finance/weekly: колонки план-факт («План (нед), ₽», «% вып. (нед)») в роллап-таблице + KPI-блок над таблицей (неделя + месяц-to-date). План — из SalesPlanVersionDay АКТИВНОЙ версии плана продаж; факт — уже имеющийся недельный оборот отчёта + WbCardFunnelDaily месяц-to-date.

Purpose: замкнуть §4.4 дизайн-спеки (план-факт) — пользователь видит выполнение плана недели per артикул и месяца в целом прямо в фин-отчёте.
Output: новый lib/finance-weekly/plan-fact.ts (loader + pure распределение), расширенные page.tsx / WeeklyFinReportTable.tsx, unit-тест распределения.

БЕЗ изменений движка (engine.ts/types.ts НЕ трогать — план-факт течёт параллельно результату движка), БЕЗ изменений Prisma-схемы, БЕЗ новых WB API вызовов, БЕЗ новых server actions (read-only).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@docs/superpowers/specs/2026-07-08-weekly-finreport-design.md (§4.4)
@lib/finance-weekly/data.ts
@lib/finance-weekly/types.ts
@app/(dashboard)/finance/weekly/page.tsx
@components/finance/WeeklyFinReportTable.tsx

<interfaces>
<!-- Ключевые контракты — исполнителю НЕ нужно исследовать кодовую базу. -->

From prisma/schema.prisma (строка 2043) — модель плана (НЕ менять):
```prisma
model SalesPlanVersionDay {
  versionId        String
  productId        String   // без @relation!
  date             DateTime @db.Date
  planOrdersRub    Float    // ← нужное поле: план заказов в ₽ (семантика = оборот по заказам отчёта)
  // ... planOrdersUnits, planBuyoutsUnits, planBuyoutsRub, priceUsed, buyoutPctUsed, stockEndUnits
  @@unique([versionId, productId, date])
  @@index([versionId, date])
}
```

From prisma/schema.prisma (строка 1148) — факт (НЕ менять):
```prisma
model WbCardFunnelDaily {
  nmId         Int
  date         DateTime @db.Date // MSK day
  ordersSumRub Float    @default(0) // оборот по заказам ₽ ← факт
  @@unique([nmId, date])
}
```

Паттерн чтения активной версии (app/actions/sales-plan.ts:1544):
```typescript
const activeVersionSetting = await prisma.appSetting.findUnique({
  where: { key: "salesPlan.activeVersionId" },
})
const activeVersionId = activeVersionSetting?.value ?? null
```
Даты в запросах плана — UTC-полночь: `new Date(iso + "T00:00:00Z")` (тот же файл, :1564).

From lib/finance-weekly/data.ts — что уже есть (менять минимально):
```typescript
export interface WeeklyFinReportPageData {
  weekStart: string  // ISO пн
  weekEnd: string    // ISO вс
  articles: WeeklyArticleInput[]  // только nmId с заказами за неделю (H>0)
  meta: Record<number, { brandName: string | null; productName: string }> // ← добавить productId
  // pools, constants, manualPools
}
// внутри цикла сборки (строка ~359): meta[nmId] = { brandName: ..., productName: product.name }
// product.id (String cuid) доступен там же — productByNmId.get(nmId)
```

From components/finance/WeeklyFinReportTable.tsx — текущие Props и колонки:
```typescript
interface Props {
  articles: ArticleResult[]
  rollup: WeeklyRollup
  waterfall: WeeklyWaterfall
  meta: Record<number, { brandName: string | null; productName: string }>
}
// Заголовки: ["Выручка", "Прибыль ИУ", "Re ИУ", "Прибыль Оферта", "Re Оферта"]
// Пустые строки universe/brand: <td className={cn(NUM_CELL, solidBg)} colSpan={5} />
// Row: { kind, label, nmId?, revenue?, profitIu?, reIu?, profitStd?, reStd? }
// rows строятся в buildRows(articles, rollup, meta); article.iu.revenue = недельный факт-оборот K·H
```

Проектное решение (Phase 09-03): через RSC→client boundary передавать Record, НЕ Map.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: lib/finance-weekly/plan-fact.ts — loader + pure распределение + unit-тест</name>
  <files>lib/finance-weekly/plan-fact.ts, lib/finance-weekly/data.ts, tests/finance-weekly-plan-fact.test.ts</files>
  <behavior>
    Тесты pure-функции distributePlanAcrossNmIds(planTotal, nmIds, factByNmId) → Map<number, number>:
    - Test 1 (один nmId): planTotal=1000, nmIds=[111] → Map{111→1000} независимо от факта.
    - Test 2 (пропорция): planTotal=1000, nmIds=[1,2], факт {1→300, 2→100} → {1→750, 2→250}.
    - Test 3 (нулевой факт → equal split): planTotal=900, nmIds=[1,2,3], факт {} (или все 0) → по 300 каждому.
    - Test 4 (инвариант суммы, дробные доли): planTotal=1000, nmIds=[1,2,3], факт {1→1, 2→1, 3→1} → сумма значений Map строго === 1000 (toBeCloseTo с высокой точностью, доли из неокруглённых float — НЕ округлять внутри).
    Тест-файл pure (импорт только distributePlanAcrossNmIds, без Prisma/React) — паттерн groupTemplatesForPicker (Phase 11-03).
  </behavior>
  <action>
    1. **tests/finance-weekly-plan-fact.test.ts** (НОВЫЙ) — написать тесты из behavior (RED допустим до создания модуля).

    2. **lib/finance-weekly/plan-fact.ts** (НОВЫЙ). Шапка-комментарий по образцу data.ts (назначение, quick-260710-gem, ссылка §4.4 спеки). Комментарии на русском.

    **Pure-функция (экспорт, тестируется):**
    ```typescript
    export function distributePlanAcrossNmIds(
      planTotal: number,
      nmIds: number[],
      factByNmId: ReadonlyMap<number, number>,
    ): Map<number, number>
    ```
    Правило (locked): 1 nmId → весь план ему; несколько → пропорционально фактам из factByNmId (доля = fact_i / Σfact, неокруглённые float — никакого Math.round, display-округление делает UI); Σfact === 0 → поровну (planTotal / nmIds.length). Отсутствующий в factByNmId nmId = факт 0.

    **Loader (экспорт):**
    ```typescript
    export interface WeeklyPlanFact {
      hasActivePlan: boolean
      planWeekByNmId: Map<number, number>   // запись есть ТОЛЬКО если у товара есть план в диапазоне; отсутствие ⇒ UI рендерит «—»
      planMonthByNmId: Map<number, number>
      factMonthByNmId: Map<number, number>  // МТД-оборот по заказам per nmId
      totals: { planWeek: number; factWeek: number; planMonth: number; factMonthMtd: number }
    }

    export async function loadWeeklyPlanFact(
      weekStart: Date,   // UTC-понедельник 00:00:00Z (как в page.tsx)
      weekEnd: Date,     // weekStart + 6 дней
      articleNmIds: number[],                 // nmId строк отчёта
      nmIdToProductId: Map<number, string>,   // из data.meta (Task 3)
    ): Promise<WeeklyPlanFact>
    ```
    Логика:
    a. activeVersionId из AppSetting `salesPlan.activeVersionId` (паттерн из interfaces). Нет → вернуть `{ hasActivePlan: false, пустые Map, totals нули }` — НЕ падать.
    b. Границы месяца (UTC), месяц = календарный месяц, содержащий weekStart:
       `monthStart = new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), 1))`;
       `monthEnd = new Date(Date.UTC(getUTCFullYear, getUTCMonth()+1, 0))`.
       ВАЖНО: МТД-диапазон факта = [monthStart..weekEnd] буквально — даже если weekEnd перетекает в следующий месяц (locked-семантика).
    c. Параллельно (Promise.all) четыре запроса:
       - план недели: `prisma.salesPlanVersionDay.groupBy({ by: ["productId"], where: { versionId, date: { gte: weekStart, lte: weekEnd } }, _sum: { planOrdersRub } })`
       - план месяца: то же для `{ gte: monthStart, lte: monthEnd }`
       - факт недели per nmId: `prisma.wbCardFunnelDaily.groupBy({ by: ["nmId"], where: { nmId: { in: articleNmIds }, date: { gte: weekStart, lte: weekEnd } }, _sum: { ordersSumRub } })` (пропустить запрос при articleNmIds.length === 0)
       - факт МТД per nmId: то же для `{ gte: monthStart, lte: weekEnd }`
    d. `totals.planWeek` / `totals.planMonth` = Σ _sum.planOrdersRub по ВСЕМ товарам версии (без фильтра по присутствию в отчёте) — план не занижается из-за товаров без заказов. `totals.factWeek` = Σ факт недели по articleNmIds; `totals.factMonthMtd` = Σ факт МТД по articleNmIds.
    e. Распределение план→nmId: построить обратную группировку productId → nmIds[] из nmIdToProductId; для каждого товара, имеющего план И хотя бы один nmId в отчёте, вызвать distributePlanAcrossNmIds. Веса: для плана недели — факт недели per nmId; для плана месяца — факт МТД per nmId. Результаты слить в planWeekByNmId / planMonthByNmId. Товары плана без nmId в отчёте в per-row Map не попадают (но входят в totals — п. d, задокументировать в комментарии: итоговая строка таблицы может быть < KPI «План недели», это осознанно).

    3. **lib/finance-weekly/data.ts** — минимальный дифф: в тип `WeeklyFinReportPageData.meta` и в сборку meta добавить `productId: string` (`meta[nmId] = { brandName: ..., productName: ..., productId: product.id }`). Существующие потребители meta (таблица, модалка) типизированы уже — расширение структурно совместимо, их НЕ трогать.
  </action>
  <verify>
    <automated>npx vitest run tests/finance-weekly-plan-fact.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>plan-fact.ts экспортирует loadWeeklyPlanFact + distributePlanAcrossNmIds + WeeklyPlanFact; 4 unit-теста распределения зелёные; data.ts meta несёт productId; tsc чистый; engine.ts/types.ts не изменены (git diff пуст по ним).</done>
</task>

<task type="auto">
  <name>Task 2: WeeklyFinReportTable — колонки «План (нед), ₽» / «% вып. (нед)» + KPI-блок</name>
  <files>components/finance/WeeklyFinReportTable.tsx</files>
  <action>
    Расширить компонент ОПЦИОНАЛЬНЫМ prop'ом (tsc-green до Task 3 — страница ещё не передаёт):
    ```typescript
    interface PlanFactProps {
      planWeekByNmId: Record<number, number>  // Record, НЕ Map (RSC→client, Phase 09-03)
      kpi: { planWeek: number; factWeek: number; planMonth: number; factMonthMtd: number }
      weekEndISO: string  // для подписи «Факт месяца (по {дата})»
    }
    interface Props { ...existing; planFact?: PlanFactProps | null }
    ```

    **Колонки** (всегда присутствуют; «—» при отсутствии данных):
    - В массив заголовков после «Выручка» вставить «План (нед), ₽» и «% вып. (нед)» (до «Прибыль ИУ») — план-факт относится к выручке, логично рядом. Итого 7 числовых колонок → colSpan пустых universe/brand строк 5 → 7.
    - В Row добавить `planWeek?: number | null; fulfillPct?: number | null` (null ⇒ «—»).
    - buildRows принимает planFact (или planWeekByNmId): для article-строки `planWeek = planFact?.planWeekByNmId[nmId] ?? null`; `fulfillPct = planWeek != null && planWeek > 0 ? revenue / planWeek : null` (план 0 или отсутствует → null → «—»; план 0 при этом показывается как 0 в колонке плана, если запись есть).
    - Подытог вселенной / grand: Σ планов article-строк группы (отсутствующие = 0; если planFact null/undefined → planWeek = null → «—»), % = Σфакт/Σплан с guard план>0. Считать при сборке rows (роллап движка план не знает — суммировать локально по article-строкам группы).
    - Рендер: план через fmtRub, % через fmtPct-подобный формат (fulfillPct — доля 0..1, существующий fmtPct подходит). null → `<span className="text-muted-foreground">—</span>`.
    - Цвет %: `>= 1` → "text-emerald-600 dark:text-emerald-500", иначе дефолтный (subtle, без amber).
    - Sticky-паттерн сохранить: новые `<td>`/`<th>` = те же NUM_CELL/th-классы со сплошным bg (bg-background/bg-muted БЕЗ /NN alpha). Кликабельность строк, модалка, водопад — НЕ трогать.

    **KPI-блок** (рендерится ПЕРВЫМ в корневом flex-col, только если `planFact != null`):
    Две карточки в `grid grid-cols-1 sm:grid-cols-2 gap-4`, стиль существующих блоков (`rounded-md border bg-card p-3`):
    - «Неделя»: План {fmtRub(kpi.planWeek)} / Факт {fmtRub(kpi.factWeek)} / % вып. {kpi.planWeek > 0 ? fmt(factWeek/planWeek) : "—"}.
    - «Месяц (по {weekEndISO в формате dd.MM})»: План {planMonth} / Факт {factMonthMtd} / % вып. МТД {planMonth > 0 ? fmt(factMonthMtd/planMonth) : "—"}.
    Подписи text-xs text-muted-foreground, значения tabular-nums; % с тем же emerald-акцентом при ≥100%.
    planFact null/undefined → блок не рендерится, колонки показывают «—» (страница работает без активной версии).
    ⚠ Хуки остаются объявленными ДО early-return пустой недели (существующий rules-of-hooks комментарий).
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>Props расширен опциональным planFact; 2 новые колонки в article/subtotal/grand строках с «—»-fallback и Σфакт/Σплан на подытогах; KPI-блок над таблицей (скрыт без planFact); colSpan пустых строк = 7; sticky/клик/модалка не тронуты; tsc чистый (страница ещё не передаёт prop — компилируется, т.к. prop опционален).</done>
</task>

<task type="auto">
  <name>Task 3: page.tsx — вызов loadWeeklyPlanFact + проброс, гейты, атомарный коммит</name>
  <files>app/(dashboard)/finance/weekly/page.tsx</files>
  <action>
    1. В page.tsx после `loadWeeklyFinReportInputs`:
    ```typescript
    const articleNmIds = data.articles.map((a) => a.nmId)
    const nmIdToProductId = new Map(
      articleNmIds.map((n) => [n, data.meta[n].productId] as const),
    )
    const weekEndDate = new Date(data.weekEnd + "T00:00:00Z")
    const planFactRaw = await loadWeeklyPlanFact(weekStart, weekEndDate, articleNmIds, nmIdToProductId)
    ```
    (Можно параллелить с computeWeeklyFinReport — но compute синхронный; loadWeeklyPlanFact вызывать просто await после data — loader'у нужны articleNmIds из data.)
    2. Конвертация для client boundary (Record, не Map):
    ```typescript
    const planFact = planFactRaw.hasActivePlan
      ? {
          planWeekByNmId: Object.fromEntries(planFactRaw.planWeekByNmId),
          kpi: planFactRaw.totals,
          weekEndISO: data.weekEnd,
        }
      : null
    ```
    3. `<WeeklyFinReportTable ... planFact={planFact} />`.
    4. Гейты (все обязательны):
       - `npx tsc --noEmit` — чисто.
       - `npx vitest run tests/finance-weekly-engine.test.ts tests/pricing-math.test.ts` — 68/68 (движок не тронут).
       - `npx vitest run tests/finance-weekly-plan-fact.test.ts` — новые тесты зелёные.
       - `git diff --stat lib/finance-weekly/engine.ts lib/finance-weekly/types.ts prisma/schema.prisma` — пусто (no engine/schema change).
    5. Атомарный коммит: `git add -A && git commit -m "feat(quick-260710-gem): W2c план-факт в /finance/weekly — колонки План(нед)/% вып. + KPI-блок из SalesPlanVersionDay"` + `git push origin main`. Деплой НЕ выполнять — деплоит оркестратор после верификации.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run tests/finance-weekly-engine.test.ts tests/pricing-math.test.ts tests/finance-weekly-plan-fact.test.ts</automated>
  </verify>
  <done>Страница передаёт planFact (null без активной версии → колонки «—», KPI скрыт); tsc чистый; engine+pricing 68/68 + новые тесты зелёные; schema/engine без диффа; коммит запушен в origin/main; деплой не запускался.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` — 0 ошибок.
- `npx vitest run tests/finance-weekly-engine.test.ts tests/pricing-math.test.ts tests/finance-weekly-plan-fact.test.ts` — все зелёные (68/68 движок+pricing нетронуты + новые).
- `git diff origin/main -- lib/finance-weekly/engine.ts lib/finance-weekly/types.ts prisma/schema.prisma` после push — пусто.
- Grep-проверки ключевых связей: `salesPlan.activeVersionId` в lib/finance-weekly/plan-fact.ts; `loadWeeklyPlanFact(` в page.tsx; `productId: product.id` в data.ts; `План (нед)` в WeeklyFinReportTable.tsx.
- Полный `npm run test` НЕ гейт (≈42 известных pre-existing падений — не чинить).
</verification>

<success_criteria>
- /finance/weekly при активной версии плана: колонки «План (нед), ₽» и «% вып. (нед)» у артикулов/подытогов/итога (Σфакт/Σплан), KPI-блок неделя+МТД над таблицей.
- Без активной версии: «—» в колонках, KPI скрыт, без крэша.
- Распределение план товара → nmId: 1 nmId = весь план; несколько = пропорционально факту (неделя — по недельному, месяц — по МТД); Σфакт=0 = поровну; сумма долей = план товара точно.
- Движок, Prisma-схема, WB API — без изменений; никаких новых server actions.
- Коммит атомарный, запушен; деплой оставлен оркестратору.
</success_criteria>

<output>
После завершения создать `.planning/quick/260710-gem-w2c-finance-weekly-salesplanversionday/260710-gem-SUMMARY.md`
</output>
