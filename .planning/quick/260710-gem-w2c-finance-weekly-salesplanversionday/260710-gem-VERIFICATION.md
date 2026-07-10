---
phase: quick-260710-gem
verified: 2026-07-06T09:25:00Z
status: passed
score: 5/5 must-haves verified
---

# Quick 260710-gem: W2c — план-факт колонки в /finance/weekly — Verification Report

**Goal:** Колонки «План (нед), ₽» / «% вып. (нед)» + KPI-блок план-факт (неделя + месяц-МТД) в /finance/weekly. План — из SalesPlanVersionDay активной версии; факт — WbCardFunnelDaily. БЕЗ изменений engine.ts / types.ts / schema.prisma.
**Verified:** 2026-07-06
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | При активной версии строки артикулов показывают «План (нед), ₽» и «% вып. (нед)»; подытоги/Итого — Σфакт/Σплан | ✓ VERIFIED | `buildRows` (WeeklyFinReportTable.tsx:140-189): article `planWeek = planFact.planWeekByNmId[nmId] ?? null`, `fulfillPct = revenue/planWeek` с guard `planWeek > 0`; subtotal — локальная `uniPlanSum`/`uniRevSum` (:172-173); grand — `grandPlanSum`/`grandRevSum` (:187-188) |
| 2 | KPI-блок над таблицей: План/Факт/% недели + План/Факт(по weekEnd)/% МТД | ✓ VERIFIED | `PlanFactKpiBlock` (:235-254) — 2 карточки «Неделя» + «Месяц (по dd.MM)», рендер первым в flex-col (:318) И в early-return пустой недели (:303) |
| 3 | Без активной версии — колонки «—», KPI скрыт, страница не падает | ✓ VERIFIED | plan-fact.ts:115-121 — нет `activeVersionId` → `hasActivePlan: false` + пустые Map + totals-нули, без throw; page.tsx:82-88 — `hasActivePlan=false → planFact=null`; таблица: `planFact null → planWeek null → «—»` (:140,406-410,420-424), KPI за гейтом `planFact != null` (:303,318) |
| 4 | Сумма распределённых по nmId планов = плану товара точно (float, без округления внутри) | ✓ VERIFIED | `distributePlanAcrossNmIds` (plan-fact.ts:33-60) — никакого Math.round; test 4 `toBeCloseTo(1000, 9)` зелёный |
| 5 | Движок не тронут: engine + pricing тесты остаются green | ✓ VERIFIED | `git diff 79335ea~1..HEAD -- engine.ts types.ts schema.prisma` = пусто; vitest 72/72 (68 engine+pricing + 4 новых) |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `lib/finance-weekly/plan-fact.ts` | loadWeeklyPlanFact + distributePlanAcrossNmIds + WeeklyPlanFact | ✓ VERIFIED | 223 строки; все 3 экспорта присутствуют; substantive (реальные Prisma groupBy, обратная группировка productId→nmIds); wired (import в page.tsx:15) |
| `tests/finance-weekly-plan-fact.test.ts` | 4 unit-теста pure распределения | ✓ VERIFIED | 4 теста: 1 nmId / пропорция 750-250 / equal split 3×300 / инвариант суммы + отсутствующий nmId=0; pure (Prisma замокан инертно `vi.mock`); 4/4 passed |
| `components/finance/WeeklyFinReportTable.tsx` | Колонки + KPI-блок, optional prop planFact | ✓ VERIFIED | `planFact?: PlanFactProps \| null` (:72); 2 колонки после «Выручка» (:334-335); colSpan пустых строк 5→7 (:399); emerald при ≥100% (`fulfillColor` :196-198) |
| `app/(dashboard)/finance/weekly/page.tsx` | Вызов loadWeeklyPlanFact + проброс planFact | ✓ VERIFIED | :69-79 nmIdToProductId из `data.meta[n].productId`, await после data; :82-88 Map→Record конвертация; :106 `planFact={planFact}` |
| `lib/finance-weekly/data.ts` | meta несёт productId | ✓ VERIFIED | Тип :105 + сборка :365 `productId: product.id` — без повторного запроса |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| page.tsx | plan-fact.ts | `import { loadWeeklyPlanFact }` | ✓ WIRED | page.tsx:15 import, :74 вызов с 4 аргументами |
| plan-fact.ts | AppSetting + salesPlanVersionDay | findUnique + groupBy | ✓ WIRED | :111-114 `key: "salesPlan.activeVersionId"`; :135-144 `groupBy(by: ["productId"], _sum: { planOrdersRub })` week+month |
| data.ts | WeeklyFinReportTable | meta[nmId].productId | ✓ WIRED | data.ts:365 → page.tsx:71 → nmIdToProductId → loader |
| WeeklyFinReportTable | planFact prop | рендер колонок + KPI | ✓ WIRED | «План (нед), ₽» в заголовках (:334), значения в `<td>` (:405-425), KPI (:303, :318) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| WeeklyFinReportTable | `planFact.planWeekByNmId` | page.tsx → loadWeeklyPlanFact → prisma.salesPlanVersionDay.groupBy | Да (реальный groupBy по versionId+date, не статика) | ✓ FLOWING |
| WeeklyFinReportTable | `planFact.kpi` | `planFactRaw.totals` — Σ по всем товарам версии + Σ факт WbCardFunnelDaily | Да | ✓ FLOWING |
| KPI «Факт месяца» | `totals.factMonthMtd` | wbCardFunnelDaily.groupBy `[monthStart..weekEnd]` (МТД буквально, locked-семантика) | Да | ✓ FLOWING |

### Детальные проверки по заданию

1. **distributePlanAcrossNmIds** — pure (нет side effects, только аргументы), три ветки: `nmIds.length===1` → весь план (:41-44); `factSum===0` → `planTotal/nmIds.length` поровну (:49-53); иначе `planTotal * (fact/factSum)` без округления (:55-58). Отсутствующий nmId = факт 0 (`?? 0`). Инвариант суммы подтверждён тестом `toBeCloseTo(1000, 9)`.
2. **loadWeeklyPlanFact** — activeVersionId по паттерну sales-plan.ts (:111-114); отсутствие → early return `hasActivePlan: false` без падения, со свежими Map (не shared из EMPTY_PLAN_FACT — мутация исключена). Даты UTC-полночь: weekStart/weekEnd из page.tsx `new Date(iso + "T00:00:00Z")`, monthStart/monthEnd через `Date.UTC(...)` — как в существующих загрузчиках. Запросы факта пропускаются при `articleNmIds.length===0`.
3. **Таблица** — колонки на article/subtotal/grand; «—» через `<span className="text-muted-foreground">—</span>` при null; KPI-блок рендерится И в early-return пустой недели (:299-311), И в основном рендере (:318); `useState` хуки (:289-290) выше early-return (:299) с rules-of-hooks комментарием; sticky не регрессирован — все sticky-ячейки со сплошным `bg-background`/`bg-muted`, единственные `/NN` — `hover:bg-muted/20` на `<tr>` (безопасно per CLAUDE.md: sticky-td перекрывает сплошным фоном).
4. **git diff** — `git diff 79335ea~1..HEAD -- lib/finance-weekly/engine.ts lib/finance-weekly/types.ts prisma/schema.prisma` пуст; локальный main в синхроне с origin/main (коммиты f92ccf2 + fa0de8c запушены).
5. **Гейты** — `npx tsc --noEmit` exit 0; `npx vitest run tests/finance-weekly-engine.test.ts tests/finance-weekly-plan-fact.test.ts tests/pricing-math.test.ts` → **72 passed (72)**, 3 файла.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Type-safety всего проекта | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Pure-распределение (4 сценария) + движок + pricing golden | `npx vitest run` (3 файла) | 72/72 passed, 311ms | ✓ PASS |
| Рендер страницы с/без активной версии | — | требует running server | ? SKIP → human |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | Нет (TODO/FIXME/placeholder/пустые реализации не найдены) | — | — |

ℹ️ Info (не gap): `WeeklyPlanFact` не содержит `planMonthByNmId` из скетча PLAN — убран осознанно с комментарием в коде (UI потребляет только `totals.planMonth`, per-row месячных колонок нет). Все must_haves-экспорты (`loadWeeklyPlanFact`, `distributePlanAcrossNmIds`, `WeeklyPlanFact`) присутствуют, truths не затронуты.

### Human Verification Required

Опционально после деплоя (не блокирует passed — логика верифицирована по коду и тестам):

1. **Визуальная проверка /finance/weekly с активной версией плана**
   **Test:** Открыть /finance/weekly при заданном `salesPlan.activeVersionId`
   **Expected:** KPI-блок «Неделя» + «Месяц (по dd.MM)» над таблицей; колонки «План (нед), ₽» / «% вып. (нед)» между «Выручка» и «Прибыль ИУ»; emerald при ≥100%
   **Why human:** визуальный рендер и правдоподобность сумм не проверяются grep'ом

### Gaps Summary

Gaps не найдены. Все 5 must-have truths верифицированы по коду, все артефакты substantive и wired, данные текут от Prisma groupBy до рендера, защищённые файлы (engine.ts / types.ts / schema.prisma) не изменены, гейты зелёные (tsc 0 ошибок, 72/72 тестов). Коммиты запушены в origin/main; деплой оставлен оркестратору.

---

_Verified: 2026-07-06T09:25:00Z_
_Verifier: Claude (gsd-verifier)_
