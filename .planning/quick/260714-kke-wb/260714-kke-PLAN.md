---
phase: quick-260714-kke
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/finance-weekly-engine.test.ts
  - lib/finance-weekly/engine.ts
  - lib/finance-weekly/types.ts
autonomous: true
requirements: [STG-01, STG-02, STG-03, STG-04, STG-05, STG-06]

must_haves:
  truths:
    - "В ИУ-сценарии /finance/weekly хранение НЕ вычитается: iu.breakdown.storagePerUnit = 0 и waterfall.iu.storage = 0 при любом пуле/override хранения"
    - "В Оферта-сценарии хранение вычитается из прибыли (из пула хранения либо per-article override) — как раньше"
    - "Per-article override WeeklyArticleInput.storagePerUnit действует ТОЛЬКО на Оферту (ИУ = 0)"
    - "Golden nmId 165967746 (storage=0 во входах) НЕ меняется: ИУ +523.6 / Оферта −2176.7"
    - "Публичный контракт движка (экспортируемые типы + computeWeeklyFinReport) не изменён — правка аддитивна/behavior-only"
    - "Гейтовые сьюты finance-weekly-* + pricing-math зелёные; tsc чист"
  artifacts:
    - path: "lib/finance-weekly/engine.ts"
      provides: "computeScenario принимает per-сценарий storagePerUnit; ИУ-вызов передаёт 0, Оферта — common.storagePerUnit"
      contains: "storagePerUnit"
    - path: "lib/finance-weekly/types.ts"
      provides: "Комментарии: хранение — статья только Оферты (ИУ зашито в комиссию, WB не выставляет)"
      contains: "storagePerUnit"
    - path: "tests/finance-weekly-engine.test.ts"
      provides: "Новый describe-блок «хранение — статья только Оферты» + golden clarifying comment (storage=0 → неизменен)"
      contains: "storagePerUnit"
  key_links:
    - from: "computeWeeklyFinReport (ИУ-вызов)"
      to: "computeScenario"
      via: "5-й аргумент storagePerUnit = 0"
      pattern: "computeScenario\\("
    - from: "computeWeeklyFinReport (Оферта-вызов)"
      to: "computeScenario"
      via: "5-й аргумент storagePerUnit = common.storagePerUnit"
      pattern: "common\\.storagePerUnit"
    - from: "computeScenario.profitPerUnit"
      to: "параметр storagePerUnit"
      via: "вычитается param (не common.storagePerUnit)"
      pattern: "- storagePerUnit"
---

<objective>
В движке понедельного WB фин-отчёта (`/finance/weekly`) статья «Хранение» (Z) должна вычитаться ТОЛЬКО в сценарии Оферта (std). На ИУ WB хранение не берёт — оно зашито в индивидуальную комиссию (факт: `paidStorage` по ИУ-аккаунту в отчёте реализации = 0; экономист в Excel колонку Z для ИУ-листа недели 06.07 не заполняет). Сейчас `computeScenario` вычитает пул хранения в ОБОИХ сценариях — по указанию пользователя (2026-07-14) убираем из ИУ.

Хранение становится per-сценарий (как логистика N): ИУ → 0, Оферта → значение из пула/override.

Purpose: убрать двойной учёт хранения в ИУ — приблизить ИУ-прибыль к факту экономиста.
Output: аддитивная правка `computeScenario` (доп. параметр), обновлённые комментарии, новый unit-тест, golden без изменений.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Движок и типы (правим)
@lib/finance-weekly/engine.ts
@lib/finance-weekly/types.ts
@tests/finance-weekly-engine.test.ts

<interfaces>
<!-- Ключевые факты из кодовой базы — исполнителю НЕ нужно исследовать заново. -->

Поток хранения в lib/finance-weekly/engine.ts (СЕЙЧАС):
- resolveCommon() → CommonPerUnit.storagePerUnit = article.storagePerUnit ?? poolPerUnit(K, pools.storage.baseRevenue, pools.storage.total)   // строки 134-135
- computeScenario(article, common, commPct, logisticsPerUnit): в profitPerUnit вычитается `common.storagePerUnit` (строка 182); в return `...common` кладёт storagePerUnit в ScenarioBreakdown.
- computeWeeklyFinReport: iuBreakdown и stdBreakdown ОБА зовут computeScenario(article, common, ...)  → оба получают одинаковый common.storagePerUnit. ЭТО И ЕСТЬ БАГ (хранение в ИУ).

Потребители УЖЕ per-сценарий (из ScenarioBreakdown `b`, НЕ из common) — правок НЕ требуют:
- toScenarioResult (engine.ts:213):  breakdown.storagePerUnit: b.storagePerUnit
- addToWaterfall  (engine.ts:241):   acc.storage += b.storagePerUnit * H
- components/finance/WeeklyFinArticleDialog.tsx (128-129): iuVal = article.iu.breakdown[key]; stdVal = article.std.breakdown[key]
  → строка «Хранение» модалки (key "storagePerUnit") автоматически покажет 0 для ИУ, значение для Оферты.
→ Требование #2 ПОДТВЕРЖДЕНО: как только b.storagePerUnit станет per-сценарий (ИУ=0), водопад/breakdown/модалка последуют сами.

data.ts (потребитель, правок НЕ требует):
- production-строки НЕ задают article.storagePerUnit (комментарий data.ts:621) → Оферта берёт из пула storageAppl/storageCloth; ИУ теперь 0.

diff-guard: это `git diff HEAD --quiet -- lib/finance-weekly/engine.ts` (используется задачами, которым НЕЛЬЗЯ трогать движок). Наша задача движок ТРОГАЕТ по назначению — «аддитивно» здесь = computeScenario не-экспортируемая (внутренняя) + публичные экспортируемые типы/сигнатура computeWeeklyFinReport НЕ меняются. Проверка = tsc + vitest-гейты, НЕ no-diff.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: RED — новый тест «хранение — статья только Оферты»</name>
  <files>tests/finance-weekly-engine.test.ts</files>
  <action>
Добавить НОВЫЙ describe-блок в КОНЕЦ файла (после блока «Опция Джема»). Тест кодирует спеку требований #4a и #3 и на текущем движке ПАДАЕТ (движок сейчас вычитает хранение и в ИУ). Использует уже объявленный в файле хелпер `zeroPools()`.

Вставить блок:

```ts
// ──────────────────────────────────────────────────────────────────
// Quick 260714-kke: хранение (Z) — статья ТОЛЬКО Оферты.
// WB не берёт хранение на ИУ (зашито в комиссию; в отчёте реализации
// paidStorage по ИУ-аккаунту = 0, экономист колонку Z для ИУ не заполняет).
// Указание пользователя 2026-07-14: в ИУ хранение НЕ вычитать.
// ──────────────────────────────────────────────────────────────────

describe("computeWeeklyFinReport — хранение вычитается только в Оферте (ИУ=0)", () => {
  const storageArticle: WeeklyArticleInput = {
    nmId: 700001,
    universe: "appliances",
    qtyOrders: 5, // H
    grossPricePerUnit: 1000, // K
    commIuPct: 30,
    commStdPct: 24,
    costPerUnit: 300, // O
    adSpendTotal: 0,
    reviewWriteoffTotal: 0,
    logisticsIuPerUnit: 0,
    logisticsStdPerUnit: 100,
    // storagePerUnit НЕ задаём → Оферта берёт из пула, ИУ = 0
  }

  // baseRevenue=K → poolPerUnit = total (точное разрешение per-unit).
  function buildStorageInputs(storageTotal: number): WeeklyFinReportInputs {
    return {
      articles: [storageArticle],
      pools: {
        appliances: {
          deliveryToMp: { total: 0, baseRevenue: 1000 },
          creditInterest: { total: 0, baseRevenue: 1000 },
          overhead: { total: 0, baseRevenue: 1000 },
          acceptance: { total: 0, baseRevenue: 1000 },
          storage: { total: storageTotal, baseRevenue: 1000 },
        },
        clothing: zeroPools(),
      },
    }
  }

  const withStorage = computeWeeklyFinReport(buildStorageInputs(50))
  const noStorage = computeWeeklyFinReport(buildStorageInputs(0))
  const artWith = withStorage.articles[0]
  const artNo = noStorage.articles[0]

  it("ИУ: breakdown.storagePerUnit = 0 при пуле хранения 50 (WB не берёт хранение)", () => {
    expect(artWith.iu.breakdown.storagePerUnit).toBe(0)
  })

  it("Оферта: breakdown.storagePerUnit ≈ 50 (пул применяется)", () => {
    expect(artWith.std.breakdown.storagePerUnit).toBeCloseTo(50, 6)
  })

  it("ИУ-прибыль не зависит от хранения (profit при пуле 50 = profit при пуле 0)", () => {
    expect(artWith.iu.profitPerUnit).toBeCloseTo(artNo.iu.profitPerUnit, 6)
    expect(artWith.iu.profit).toBeCloseTo(artNo.iu.profit, 6)
  })

  it("Оферта-прибыль падает ровно на storage×H = 50×5 = 250 ₽", () => {
    expect(artNo.std.profit - artWith.std.profit).toBeCloseTo(50 * 5, 6)
    expect(artNo.std.breakdown.storagePerUnit).toBe(0)
  })

  it("водопад: iu.storage = 0, std.storage = 50×H = 250", () => {
    expect(withStorage.waterfall.iu.storage).toBe(0)
    expect(withStorage.waterfall.std.storage).toBeCloseTo(50 * 5, 6)
  })

  it("per-article override storagePerUnit действует ТОЛЬКО на Оферту (ИУ=0)", () => {
    const overrideInputs: WeeklyFinReportInputs = {
      articles: [{ ...storageArticle, nmId: 700002, storagePerUnit: 33 }],
      pools: {
        appliances: {
          deliveryToMp: { total: 0, baseRevenue: 1000 },
          creditInterest: { total: 0, baseRevenue: 1000 },
          overhead: { total: 0, baseRevenue: 1000 },
          acceptance: { total: 0, baseRevenue: 1000 },
          storage: { total: 0, baseRevenue: 1000 }, // пул пуст — только override
        },
        clothing: zeroPools(),
      },
    }
    const ov = computeWeeklyFinReport(overrideInputs).articles[0]
    expect(ov.iu.breakdown.storagePerUnit).toBe(0)
    expect(ov.std.breakdown.storagePerUnit).toBeCloseTo(33, 6)
  })
})
```

НЕ трогать golden-блок и прочие существующие тесты в этой задаче.
  </action>
  <verify>
    <automated>npx vitest run tests/finance-weekly-engine.test.ts</automated>
  </verify>
  <done>Suite запускается; НОВЫЙ блок «хранение вычитается только в Оферте (ИУ=0)» ПАДАЕТ (RED) на ассертах ИУ storage=0 (текущий движок вычитает хранение в обоих сценариях). Golden / Опция Джема / clothing-guard остаются зелёными. Файл компилируется (импорты WeeklyArticleInput/WeeklyFinReportInputs и хелпер zeroPools уже есть).</done>
</task>

<task type="auto">
  <name>Task 2: GREEN — per-сценарий хранение в computeScenario + комментарии + golden-нота</name>
  <files>lib/finance-weekly/engine.ts, lib/finance-weekly/types.ts, tests/finance-weekly-engine.test.ts</files>
  <action>
Реализовать per-сценарий хранение МИНИМАЛЬНЫМ АДДИТИВНЫМ диффом: доп. параметр `storagePerUnit` в НЕ-экспортируемую `computeScenario` (как `logisticsPerUnit`). Публичные экспортируемые типы и сигнатура `computeWeeklyFinReport` НЕ меняются.

**A. lib/finance-weekly/engine.ts:**

1) Сигнатура `computeScenario` (сейчас строки 154-159) — добавить 5-й параметр:
```ts
function computeScenario(
  article: WeeklyArticleInput,
  common: CommonPerUnit,
  commPct: number,
  logisticsPerUnit: number,
  storagePerUnit: number, // per-сценарий (как N): ИУ=0, Оферта=common.storagePerUnit
): ScenarioBreakdown {
```

2) В `profitPerUnit` (сейчас последняя строка вычитания, 182) заменить `common.storagePerUnit` → `storagePerUnit`:
```ts
    common.acceptancePerUnit -
    storagePerUnit
```

3) В return `computeScenario` (сейчас 184-190) добавить `storagePerUnit,` ПОСЛЕ `...common` (override значения из common):
```ts
  return {
    cutPricePerUnit,
    commissionPct: commPct,
    logisticsPerUnit,
    ...common,
    storagePerUnit,
    profitPerUnit,
  }
```

4) Вызовы в `computeWeeklyFinReport` (сейчас 283-294) — добавить 5-й аргумент:
   - ИУ-вызов: `0` с комментарием `// ИУ: хранение WB не берёт (зашито в комиссию) — статья только Оферты`
   - Оферта-вызов: `common.storagePerUnit` с комментарием `// Оферта: хранение из пула/override`
```ts
    const iuBreakdown = computeScenario(
      article,
      common,
      article.commIuPct + jemOpt,
      article.logisticsIuPerUnit,
      0, // ИУ: хранение WB не берёт (зашито в комиссию) — статья только Оферты
    )
    const stdBreakdown = computeScenario(
      article,
      common,
      article.commStdPct + jemOpt,
      article.logisticsStdPerUnit,
      common.storagePerUnit, // Оферта: хранение из пула/override
    )
```

5) Комментарии engine.ts (требование #5):
   - Блок над `interface ScenarioBreakdown` (сейчас 70-74): фразу «Различие между ИУ и Оферта — только в комиссии (J → I) и логистике (N). Пул-статьи (delivery/credit/overhead/acceptance/storage) от сценария не зависят.» заменить на: «Различие ИУ/Оферта: комиссия (J→I), логистика (N) и ХРАНЕНИЕ (Z — только Оферта; ИУ=0, WB не выставляет хранение — зашито в ИУ-комиссию). Прочие пул-статьи (delivery/credit/overhead/acceptance) от сценария не зависят.»
   - Поле `storagePerUnit` в `ScenarioBreakdown` (сейчас 90): комментарий → `// хранение (пул/override) — ТОЛЬКО Оферта; в ИУ передаётся 0`
   - Заголовок над `interface CommonPerUnit` (сейчас 94: «Общие для обоих сценариев per-unit статьи …») → «Per-unit статьи, резолвимые вне сценария комиссии (пулы + брак/джем/налог/эквайринг). ⚠ Хранение резолвится здесь, но применяется ТОЛЬКО к Оферте — в ИУ-вызов computeScenario передаётся 0.»
   - Поле `storagePerUnit` в `CommonPerUnit` (сейчас 107): добавить комментарий `// резолв хранения Оферты (пул/override); ИУ обнуляется в computeScenario`
   - Строки resolveCommon 134-135: добавить над ними комментарий `// Хранение Оферты: per-article override → пул. ИУ получает 0 в вызове computeScenario (WB не берёт хранение на ИУ).`

**B. lib/finance-weekly/types.ts (требование #5, комментарии — типы НЕ меняем):**
   - `WeeklyArticleInput.storagePerUnit` (сейчас 41-42): заменить комментарий на «Опциональный per-article override хранения / ед. Действует ТОЛЬКО на Оферту (ИУ хранение не несёт — WB не выставляет, зашито в комиссию). Если не задан — Оферта берёт из пула хранения (poolPerUnit).»
   - `UniversePools.storage` (сейчас 62): комментарий → `// Хранение (Z) — распределяется ТОЛЬКО в Оферте (ИУ=0)`
   - Блок над `interface CostBreakdown` (сейчас 101-104): фразу «Различаются ИУ vs Оферта только commissionPct (J), netOfCommissionPerUnit (I) и logisticsPerUnit (N); остальные (пулы + брак/джем/налог/эквайринг/закупка) идентичны в обоих сценариях.» заменить на «Различаются ИУ vs Оферта: commissionPct (J), netOfCommissionPerUnit (I), logisticsPerUnit (N) и storagePerUnit (Z — ИУ=0); остальные (delivery/credit/overhead/acceptance + брак/джем/налог/эквайринг/закупка) идентичны.»
   - `CostBreakdown.storagePerUnit` (сейчас 117): комментарий → `// хранение / ед (пул Z/override) — ТОЛЬКО Оферта; ИУ=0`

**C. tests/finance-weekly-engine.test.ts (требование #4b — golden clarifying comment):**
   Golden storage=0 (goldenArticle.storagePerUnit=0 + пул storage.total=0) → новая семантика на golden НЕ влияет (ИУ хранение=0=Оферта хранение=0). Добавить в golden-описание (рядом со строкой пула `storage: { total: 0, baseRevenue: 11748.8 }`, ~62) короткий поясняющий комментарий: `// хранение=0 → семантика «Оферта-only» golden не меняет (ИУ и Оферта вычитают 0)`. Golden-числа 523.6 / −2176.7 НЕ трогать.

НЕ трогать data.ts, page.tsx, модалку, водопад — они уже читают per-сценарий из ScenarioBreakdown (см. interfaces).
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run finance-weekly pricing</automated>
  </verify>
  <done>tsc чист. Все гейтовые сьюты зелёные: новый блок «хранение вычитается только в Оферте (ИУ=0)» проходит; golden nmId 165967746 без изменений (523.6 / −2176.7); Опция Джема, clothing-guard, poolPerUnit проходят; finance-weekly-snapshot проходит (roundtrip внутренне консистентен, числовых ассертов на ИУ-хранение нет); pricing-math golden проходит. Публичные экспортируемые типы (WeeklyArticleInput/CostBreakdown/…) и сигнатура computeWeeklyFinReport не изменены (правка аддитивна: параметр внутренней computeScenario).</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` — без ошибок типов (новый параметр computeScenario согласован во всех вызовах).
- `npx vitest run finance-weekly pricing` — зелёные гейтовые сьюты (finance-weekly-engine/snapshot/realization/plan-fact/attribution/bank-pools/credit-accrual + pricing-math/fallback/settings).
- Ручная проверка семантики: в ИУ-выводе `iu.breakdown.storagePerUnit === 0` и `waterfall.iu.storage === 0` при ненулевом пуле; Оферта вычитает хранение как прежде.
- Публичный контракт: экспортируемые типы и `computeWeeklyFinReport` не тронуты (grep: сигнатура `export function computeWeeklyFinReport` без изменений; `computeScenario` — не-экспортируемая).
</verification>

<success_criteria>
- ИУ-сценарий /finance/weekly больше не вычитает хранение (0 в breakdown и водопаде) при любом пуле/override.
- Оферта-сценарий вычитает хранение из пула/override — как раньше.
- Per-article `WeeklyArticleInput.storagePerUnit` влияет только на Оферту.
- Golden (storage=0) неизменен: ИУ +523.6 / Оферта −2176.7.
- Новый unit-тест закрепляет «хранение — статья только Оферты» + override-семантику.
- Комментарии в engine.ts и types.ts отражают Оферта-only семантику хранения.
- tsc чист; finance-weekly-* + pricing-math гейты зелёные.
</success_criteria>

<output>
После завершения создать `.planning/quick/260714-kke-wb/260714-kke-SUMMARY.md`.
</output>
