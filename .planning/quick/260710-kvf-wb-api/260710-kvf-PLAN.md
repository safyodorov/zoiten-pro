---
phase: quick-260710-kvf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/wb-realization-api.ts
  - lib/wb-realization-sync.ts
  - tests/wb-realization-classify.test.ts
  - lib/finance-weekly/realization.ts
  - lib/finance-weekly/data.ts
  - app/(dashboard)/finance/weekly/page.tsx
  - components/finance/WeeklyFinReportControls.tsx
  - tests/finance-weekly-realization.test.ts
autonomous: true
requirements: [QUICK-260710-KVF]

must_haves:
  truths:
    - "Одна строка «Продажа» с forPay + deliveryService + penalty даёт 3 вклада в 3 бакета (explode, не один бакет на строку)"
    - "deduction с bonusTypeName «Списание за отзыв…» → reviewPoints; «…Продвижение…» → promotion; без bonus → deductionOther"
    - "rebillLogisticCost попадает в deductionOther (хранится, в расчёт ИУ-факта не идёт)"
    - "Пул с бакетом 0 в реализации (storage на ИУ) НЕ затирает manual-значение — fallback per бакет, бейдж «вручную» per пул"
    - "tsc чисто, vitest зелёный, lib/finance-weekly/engine.ts не тронут, закоммичено и запушено в origin/main"
  artifacts:
    - path: "lib/wb-realization-api.ts"
      provides: "explodeRealizationRow (pure, мульти-поле), rebillLogisticCost в NormalizedRealizationRow, алиас sellerOperName; classifyRealizationRow УДАЛЁН"
      exports: ["explodeRealizationRow", "accumulateRealizationRows", "normalizeRealizationRow", "parseMoney"]
    - path: "tests/wb-realization-classify.test.ts"
      provides: "тесты explode: 7 кейсов (а)-(ж) из задания"
    - path: "lib/finance-weekly/realization.ts"
      provides: "resolvePoolTotals — per-бакет выбор реализация(>0)/manual + sources для бейджей"
      exports: ["resolvePoolTotals"]
    - path: "components/finance/WeeklyFinReportControls.tsx"
      provides: "бейдж источника per пул (poolSources вместо общего hasRealization)"
    - path: "tests/finance-weekly-realization.test.ts"
      provides: "тест «storage=0 в реализации + manual=500 → пул 500, source manual»"
  key_links:
    - from: "lib/wb-realization-sync.ts"
      to: "accumulateRealizationRows"
      via: "импорт из lib/wb-realization-api (внутри — explode)"
      pattern: "accumulateRealizationRows"
    - from: "lib/finance-weekly/data.ts"
      to: "resolvePoolTotals"
      via: "импорт из lib/finance-weekly/realization"
      pattern: "resolvePoolTotals"
    - from: "app/(dashboard)/finance/weekly/page.tsx"
      to: "components/finance/WeeklyFinReportControls.tsx"
      via: "prop poolSources"
      pattern: "poolSources=\\{data\\.poolSources\\}"
---

<objective>
Фикс классификатора отчёта реализации WB: с «одна строка → один бакет» на мульти-поле
разнос (explode). Первый реальный синк (зонд detailed 772161985, 29 014 строк) показал
delivery=0 / penalty=0 / reviewPoints=0 в БД, хотя list-агрегаты дают deliveryServiceSum
84 969.62, penaltySum 11 563.94, «Списание за отзыв» ≈71 224 — потому что классификатор
ждал `supplier_oper_name` (в реальном API поле называется `sellerOperName`) и брал
ОДНО поле на строку, тогда как WB кладёт деньги ПОЛЯМИ на каждой строке
(forPay + deliveryService + penalty + deduction + … одновременно).

Второй фикс: на ИУ paidStorage=0 и paidAcceptance=0 — пулы из реализации должны
применяться ПО-БАКЕТНО (только когда бакет > 0), иначе первый же синк затирает
ручные значения хранения/приёмки нулём.

Purpose: корректный ИУ-факт в /finance/weekly (доставка, штрафы, баллы за отзывы, пулы).
Output: explode-классификатор + per-бакет fallback пулов + переписанные тесты, push в origin/main. БЕЗ деплоя.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@lib/wb-realization-api.ts
@lib/wb-realization-sync.ts
@lib/finance-weekly/realization.ts
@lib/finance-weekly/data.ts (строки 130-145 — WeeklyFinReportPageData; 549-627 — пулы)
@app/(dashboard)/finance/weekly/page.tsx (строка ~104 — prop hasRealization)
@components/finance/WeeklyFinReportControls.tsx
@tests/wb-realization-classify.test.ts
@tests/finance-weekly-realization.test.ts

<interfaces>
<!-- Актуальные контракты из кодовой базы — исполнителю НЕ нужно исследовать код. -->

GROUND TRUTH (зонд detailed 772161985, 29 014 строк, 2026-07-10):
- ВСЕ поля camelCase; поле оператора = `sellerOperName` (НЕ supplier_oper_name!)
- Операции: «Возмещение издержек по перевозке/по складским операциям с товаром» 22891,
  «Продажа» 4541, «Возмещение за выдачу и возврат товаров на ПВЗ» 961, «Возврат» 193,
  «Логистика» 189, «Удержание» 114, «Компенсация скидки по программе лояльности» 62,
  «Штраф» 55, «Добровольная компенсация при возврате» 8
- Деньги — ПОЛЯМИ на строках (частью строки '84,5', частью числа — parseMoney справляется):
  forPay Σ=16 211 707.13; deliveryService Σ=84 969.62 (= list deliveryServiceSum);
  penalty Σ=11 563.94 (= list penaltySum = Excel Y149); paidStorage Σ=0; paidAcceptance Σ=0;
  deduction Σ=1 377 402.60; rebillLogisticCost Σ=308 614.10
- deduction по bonusTypeName: «Оказание услуг «WB Продвижение», документ №…» → 1 306 179 (promotion);
  «Списание за отзыв <id>: акция №…, товар <nmId>» → 71 223.6 (reviewPoints, = Excel M 71 222);
  прочее мелкое → deductionOther

From lib/wb-realization-api.ts (текущее состояние):
```typescript
export interface NormalizedRealizationRow {
  nmId: number // 0 = account-level строка без nm_id
  supplierOperName: string
  docTypeName: string
  bonusTypeName: string
  forPay: number
  deliveryRub: number
  storageRub: number
  penaltyRub: number
  acceptanceRub: number
  deductionRub: number
  quantity: number
}
export type RealizationBucket =
  | "forPay" | "delivery" | "storage" | "acceptance"
  | "penalty" | "reviewPoints" | "promotion" | "deductionOther"
export type RealizationBucketTotals = Record<RealizationBucket, number>
export function parseMoney(v: unknown): number // '84,5' → 84.5; мусор → 0
export function normalizeRealizationRow(raw: unknown): NormalizedRealizationRow
export function emptyRealizationBuckets(): RealizationBucketTotals
export function accumulateRealizationRows(rows: NormalizedRealizationRow[]): Map<number, RealizationBucketTotals>
// classifyRealizationRow — УДАЛИТЬ (используется только внутри accumulate + в старом тесте)
```

From lib/finance-weekly/realization.ts:
```typescript
export interface RealizationPoolTotals {
  storageAppl: number
  storageCloth: number
  acceptanceAppl: number
  acceptanceCloth: number
}
export function buildRealizationPools(
  byNmId: ReadonlyMap<number, RealizationBuckets>,
  accountLevel: RealizationBuckets,
  universeByNmId: ReadonlyMap<number, "appliances" | "clothing">,
  applBase: number,
  clothBase: number,
): RealizationPoolTotals
```

From lib/finance-weekly/data.ts (шаг 11a-12, строки 568-614):
```typescript
// сейчас: realizationPools ? realizationPools.X : manualPools.X — БЕЗ per-бакет проверки >0
let realizationPools: ReturnType<typeof buildRealizationPools> | null = null
if (hasRealization) { realizationPools = buildRealizationPools(...) }
acceptance: { total: realizationPools ? realizationPools.acceptanceAppl : manualPools.acceptanceAppl, ... }
// ManualPools keys: delivery, overheadAppl, acceptanceAppl, storageAppl, overheadCloth, acceptanceCloth, storageCloth
// WeeklyFinReportPageData содержит hasRealization: boolean (плюс два early-return с false)
```

From components/finance/WeeklyFinReportControls.tsx:
```typescript
const REALIZATION_POOL_KEYS: readonly (keyof ManualPools)[] = [
  "acceptanceAppl", "storageAppl", "acceptanceCloth", "storageCloth",
]
interface Props { weekStartISO; weekEndISO; manualPools; canManage; hasRealization: boolean }
// бейдж (строки 205-216): {hasRealization ? "из реализации" : "вручную"} — ОДИН флаг на все 4 пула
```

lib/wb-realization-sync.ts импортирует accumulateRealizationRows / emptyRealizationBuckets /
normalizeRealizationRow — classifyRealizationRow НЕ импортирует. reconcileWithListAggregates
(лог-сверка) менять НЕ нужно.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: explode-классификатор в lib/wb-realization-api.ts + переписать тесты</name>
  <files>lib/wb-realization-api.ts, lib/wb-realization-sync.ts, tests/wb-realization-classify.test.ts</files>
  <behavior>
    Переписать tests/wb-realization-classify.test.ts под explode (7 кейсов из задания):
    - (а) строка «Продажа» с forPay=1234.56 + deliveryRub=84.5 + penaltyRub=11.5 →
      explodeRealizationRow даёт РОВНО 3 вклада: forPay / delivery / penalty
    - (б) «Удержание» с deductionRub=71.2 + bonusTypeName «Списание за отзыв 123: акция №7, товар 999»
      → 1 вклад {bucket: "reviewPoints", amountRub: 71.2}
    - (в) deductionRub=1306.1 + bonusTypeName «Оказание услуг «WB Продвижение», документ №42»
      → {bucket: "promotion", amountRub: 1306.1}
    - (г) deductionRub=99.9 + пустой bonusTypeName → {bucket: "deductionOther", amountRub: 99.9}
    - (д) rebillLogisticCost=308.6 (остальные поля 0) → {bucket: "deductionOther", amountRub: 308.6}
    - (е) normalizeRealizationRow: camelCase-строка с sellerOperName + деньги-строками
      ('84,5' → 84.5), rebillLogisticCost читается; сохранить существующие кейсы
      snake_case / camelCase / parseMoney / nmId=0
    - (ж) golden-агрегат: фикстура ~5 СЫРЫХ строк (как из API: sellerOperName, camelCase,
      деньги частично строками) → normalizeRealizationRow → accumulateRealizationRows →
      проверка сумм по бакетам per nmId. Пример: nmId=1 «Продажа» (forPay 1000,
      deliveryService '84,5') + nmId=1 «Возмещение издержек по перевозке»
      (rebillLogisticCost 308.6) + nmId=1 «Штраф» (penalty '11,5') + nmId=0 «Удержание»
      (deduction 1306.1, bonus «Оказание услуг «WB Продвижение»…») + nmId=0 «Удержание»
      (deduction 71.2, bonus «Списание за отзыв…») →
      acc.get(1) = {forPay:1000, delivery:84.5, penalty:11.5, deductionOther:308.6, остальное 0};
      acc.get(0) = {promotion:1306.1, reviewPoints:71.2, остальное 0}
    - «Возврат» с forPay=-820.4 → вклад {forPay, -820.4} (знак WB не инвертируем)
  </behavior>
  <action>
    В lib/wb-realization-api.ts:

    1. `NormalizedRealizationRow` — добавить поле `rebillLogisticCost: number`.

    2. `normalizeRealizationRow`:
       - supplierOperName: `asString(r.supplier_oper_name ?? r.supplierOperName ?? r.sellerOperName)`
         — реальный API отдаёт `sellerOperName` (ground truth зонда), алиас ОБЯЗАТЕЛЕН;
       - новое: `rebillLogisticCost: parseMoney(r.rebill_logistic_cost ?? r.rebillLogisticCost)`.

    3. УДАЛИТЬ `classifyRealizationRow` (export больше не нужен — потребителей вне модуля
       нет, проверено grep'ом). Вместо него — pure:
       ```typescript
       export function explodeRealizationRow(
         row: NormalizedRealizationRow,
       ): Array<{ bucket: RealizationBucket; amountRub: number }>
       ```
       Возвращает ТОЛЬКО ненулевые вклады (проверка `!== 0`, НЕ `> 0` — «Возврат» несёт
       отрицательный forPay):
       - `row.forPay` → bucket "forPay"
       - `row.deliveryRub` → "delivery"
       - `row.penaltyRub` → "penalty"
       - `row.storageRub` → "storage"
       - `row.acceptanceRub` → "acceptance"
       - `row.deductionRub` → суб-классификация по `row.bonusTypeName.toLowerCase()`:
         `includes("списание за отзыв")` → "reviewPoints";
         иначе `includes("продвижение")` → "promotion" (ловит и «WB Продвижение»,
         и «ВБ.Продвижение»); иначе → "deductionOther".
         (Старый маркер «баллы за отзывы» был доисследовательской гипотезой —
         реальная строка по зонду = «Списание за отзыв …», маркер заменяется.)
       - `row.rebillLogisticCost` → "deductionOther" с комментарием: возмещение издержек
         по перевозке/складским операциям — в расчёт ИУ-факта НЕ идёт, только хранится
         (диагностический бакет).

    4. `accumulateRealizationRows` переписать через explode: для каждой строки — цикл по
       вкладам explodeRealizationRow, суммирование в totals[bucket]. Map per nmId
       (nmId=0 = account-level) — как раньше. ВАЖНО: запись в Map создавать для КАЖДОЙ
       строки (даже если explode вернул 0 вкладов — поведение идентично старому:
       пустая строка nmId всё равно даёт запись с нулями; допустимо и не создавать —
       но тогда убедиться, что тесты этого не требуют).

    5. Обновить шапку-комментарий файла (classifyRealizationRow → explodeRealizationRow,
       мульти-поле разнос).

    В lib/wb-realization-sync.ts: classifyRealizationRow НЕ импортируется — правки
    импортов не нужны; `reconcileWithListAggregates` НЕ трогать (лог-сверка не меняется
    по заданию). Обновить только комментарий потока в шапке («classify» → «explode»),
    если упоминается. Известное следствие: пара «reviewPoints+promotion+deductionOther
    vs deductionSum» теперь может давать warning (rebillLogisticCost ~308K не входит
    в deductionSum) — это ДИАГНОСТИЧЕСКИЙ console.warn, НЕ чинить.

    tests/wb-realization-classify.test.ts — переписать по <behavior> (mkRow-хелпер
    дополнить полем rebillLogisticCost: 0).
  </action>
  <verify>
    <automated>npx vitest run tests/wb-realization-classify.test.ts</automated>
  </verify>
  <done>
    explodeRealizationRow экспортируется, classifyRealizationRow отсутствует в кодовой
    базе (grep пустой вне .planning), все кейсы (а)-(ж) зелёные, включая golden-агрегат
    сырых строк с sellerOperName и деньгами-строками.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: per-бакет fallback пулов + per-пул бейдж источника + гейты</name>
  <files>lib/finance-weekly/realization.ts, lib/finance-weekly/data.ts, app/(dashboard)/finance/weekly/page.tsx, components/finance/WeeklyFinReportControls.tsx, tests/finance-weekly-realization.test.ts</files>
  <behavior>
    Добавить в tests/finance-weekly-realization.test.ts describe("resolvePoolTotals"):
    - Кейс задания: реализация {storageAppl: 0, acceptanceAppl: 135.5, storageCloth: 0,
      acceptanceCloth: 20} + manual {storageAppl: 500, acceptanceAppl: 300, storageCloth: 400,
      acceptanceCloth: 200} → totals.storageAppl=500 (manual, НЕ затёрт нулём),
      sources.storageAppl="manual"; totals.acceptanceAppl=135.5, sources.acceptanceAppl="realization"
      — независимость per бакет в ОДНОМ вызове
    - realization=null (нет синка недели) → все totals из manual, все sources="manual"
    - отрицательный бакет реализации (например acceptanceAppl=-5) → manual (условие
      строго > 0)
  </behavior>
  <action>
    1. lib/finance-weekly/realization.ts — новый pure-хелпер (ноль импортов Prisma/Next,
       паттерн файла):
       ```typescript
       export type PoolSource = "realization" | "manual"

       export interface ResolvedRealizationPools {
         totals: RealizationPoolTotals
         sources: Record<keyof RealizationPoolTotals, PoolSource>
       }

       export function resolvePoolTotals(
         realization: RealizationPoolTotals | null,
         manual: RealizationPoolTotals,
       ): ResolvedRealizationPools
       ```
       Per ключ (storageAppl/storageCloth/acceptanceAppl/acceptanceCloth):
       `realization !== null && realization[key] > 0` → {total: realization[key],
       source: "realization"}; иначе → {total: manual[key], source: "manual"}.
       Комментарий: кейс ИУ — paidStorage=0 в отчёте реализации не должен затирать
       ручное значение хранения (ground truth первого синка 2026-07-10).

    2. lib/finance-weekly/data.ts (шаги 11a-12, строки ~568-614):
       - после существующего блока `if (hasRealization) { realizationPools = buildRealizationPools(...) }`:
         ```typescript
         const resolvedPools = resolvePoolTotals(realizationPools, {
           storageAppl: manualPools.storageAppl,
           storageCloth: manualPools.storageCloth,
           acceptanceAppl: manualPools.acceptanceAppl,
           acceptanceCloth: manualPools.acceptanceCloth,
         })
         ```
       - в appliancesPools/clothingPools заменить тернарники
         `realizationPools ? realizationPools.X : manualPools.X` на
         `resolvedPools.totals.X` (4 места: acceptance/storage × appl/cloth);
       - `WeeklyFinReportPageData` += `poolSources: ResolvedRealizationPools["sources"]`
         (импорт типа из realization.ts); в обоих early-return'ах (строки ~220, ~266) —
         все 4 ключа "manual"; в финальном return — `poolSources: resolvedPools.sources`;
       - `hasRealization` в data.ts НЕ удалять (используется для reviewWriteoffTotal /
         logisticsIuPerUnit / reviewAccountShare — эта логика вне scope).

    3. app/(dashboard)/finance/weekly/page.tsx (~строка 104): заменить
       `hasRealization={data.hasRealization}` на `poolSources={data.poolSources}`.

    4. components/finance/WeeklyFinReportControls.tsx:
       - prop `hasRealization: boolean` ЗАМЕНИТЬ на
         `poolSources: Record<"storageAppl" | "storageCloth" | "acceptanceAppl" | "acceptanceCloth", "realization" | "manual">`;
       - бейдж (строки ~205-216): для f.key ∈ REALIZATION_POOL_KEYS показывать
         `poolSources[f.key] === "realization" ? "из реализации" : "вручную"`;
         title-подсказку тоже per-условие («Значение пула взято из отчёта реализации WB;
         ручное поле — fallback» только при "realization");
       - TS-нюанс: REALIZATION_POOL_KEYS типизирован как `readonly (keyof ManualPools)[]`
         — для индексации poolSources сузить: объявить
         `const REALIZATION_POOL_KEYS = ["acceptanceAppl", "storageAppl", "acceptanceCloth", "storageCloth"] as const`
         и `type RealizationPoolKey = (typeof REALIZATION_POOL_KEYS)[number]`,
         проверку в render через `(REALIZATION_POOL_KEYS as readonly string[]).includes(f.key)`
         + локальный type guard, либо helper `isRealizationPoolKey(k): k is RealizationPoolKey`.

    5. tests/finance-weekly-realization.test.ts — добавить describe("resolvePoolTotals")
       по <behavior> (существующие describe НЕ трогать).

    6. ГЕЙТЫ (после зелёных тестов):
       - `npx tsc --noEmit` — чисто;
       - `npm run test` — ВЕСЬ suite зелёный (finance-weekly-*, pricing-*, переписанный
         классификатор);
       - `git diff --name-only` НЕ содержит lib/finance-weekly/engine.ts;
       - `git add -A && git commit` (сообщение: `fix(quick-260710-kvf): мульти-поле explode классификатора реализации WB + per-бакет fallback пулов`)
         `&& git push origin main`;
       - НЕ ДЕПЛОИТЬ: живых вызовов WB API в изменениях нет, синк перезапустит
         пользователь/оркестратор после деплоя отдельно.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run test</automated>
  </verify>
  <done>
    resolvePoolTotals экспортируется и покрыт тестом «storage=0 + manual=500 → 500/manual»;
    data.ts выбирает пулы per бакет через resolvePoolTotals; бейдж в Controls per пул;
    tsc чисто; полный vitest зелёный; engine.ts не изменён; коммит запушен в origin/main;
    деплой НЕ выполнялся.
  </done>
</task>

</tasks>

<verification>
- `npx vitest run tests/wb-realization-classify.test.ts tests/finance-weekly-realization.test.ts` — оба файла зелёные
- `npx tsc --noEmit` — без ошибок
- `npm run test` — весь suite зелёный (vitest pool=vmForks, из памятки sales-plan)
- grep `classifyRealizationRow` по lib/ tests/ components/ app/ — пусто (только .planning-история)
- `git log origin/main -1` содержит коммит фикса; `git status` чист
- lib/finance-weekly/engine.ts не в diff
</verification>

<success_criteria>
- explodeRealizationRow разносит одну строку отчёта по НЕСКОЛЬКИМ бакетам (все ненулевые
  денежные поля), sellerOperName читается, rebillLogisticCost нормализуется → deductionOther
- Суб-классификация deduction по bonusTypeName: «списание за отзыв» → reviewPoints,
  «продвижение» → promotion, прочее → deductionOther (соответствует ground truth зонда:
  71 223.6 / 1 306 179 / остаток)
- Пулы /finance/weekly: бакет > 0 → из реализации, иначе manual (per бакет); бейдж
  источника per пул; storage=0 на ИУ больше не затирает ручное значение
- Все гейты пройдены, запушено, НЕ задеплоено
</success_criteria>

<output>
После завершения создать `.planning/quick/260710-kvf-wb-api/260710-kvf-SUMMARY.md`
</output>
