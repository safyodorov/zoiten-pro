---
phase: quick-260710-gem
plan: 01
subsystem: finance-weekly
tags: [finance, weekly, plan-fact, sales-plan, ui]
requirements: [W2c]
dependency-graph:
  requires: [quick-260710-evz (W2a таблица), quick-260710-fr1 (W2b модалка), Phase 25 (SalesPlanVersionDay)]
  provides: "loadWeeklyPlanFact + distributePlanAcrossNmIds; колонки План(нед)/% вып.(нед) и KPI-блок план-факта в /finance/weekly"
  affects: [/finance/weekly]
tech-stack:
  added: []
  patterns: [Record через RSC→client boundary (Phase 09-03), pure-функция + инертный vi.mock prisma, сплошной bg на sticky (без /NN alpha)]
key-files:
  created:
    - lib/finance-weekly/plan-fact.ts
    - tests/finance-weekly-plan-fact.test.ts
  modified:
    - lib/finance-weekly/data.ts
    - components/finance/WeeklyFinReportTable.tsx
    - app/(dashboard)/finance/weekly/page.tsx
decisions:
  - "planMonthByNmId per-nmId НЕ строится (info-note 1, минимальный вариант) — UI потребляет только totals.planMonth; убран из WeeklyPlanFact"
  - "KPI-блок рендерится и на пустой неделе (info-note 2) — план виден даже без заказов"
  - "totals.planWeek/planMonth = Σ по ВСЕМ товарам версии (не только присутствующим в отчёте) → Итого таблицы может быть < KPI «План недели» — осознанно, задокументировано"
  - "distributePlanAcrossNmIds: неокруглённые float-доли (Σ = plan точно), display-округление в UI"
  - "Σфакт/Σплан подытогов считаются локально при сборке rows — движок план-факта не знает"
metrics:
  duration: ~10min
  completed: 2026-07-10
---

# Phase quick-260710-gem: W2c — План-факт в /finance/weekly Summary

Колонки «План (нед), ₽» / «% вып. (нед)» per артикул + KPI-блок недели и месяца-to-date из SalesPlanVersionDay активной версии плана продаж — §4.4 дизайн-спеки замкнут, движок и Prisma-схема не тронуты.

## Что сделано

**Task 1 — loader + pure распределение (TDD):**
- `tests/finance-weekly-plan-fact.test.ts` (новый): 4 unit-теста `distributePlanAcrossNmIds` — один nmId / пропорция 750-250 / equal split при Σfact=0 / инвариант суммы `toBeCloseTo(1000, 9)` на дробных долях + отсутствующий nmId = факт 0. Написан ПЕРВЫМ, RED подтверждён (модуль не существовал), GREEN после реализации. `@/lib/prisma` мокается инертно.
- `lib/finance-weekly/plan-fact.ts` (новый): `distributePlanAcrossNmIds` (pure: 1 nmId → весь план; несколько → пропорционально факту, float без округления; Σfact=0 → поровну) + `loadWeeklyPlanFact` (активная версия из AppSetting `salesPlan.activeVersionId`; при отсутствии → `hasActivePlan: false`, страница не падает; 4 параллельных groupBy: план нед/мес по productId из SalesPlanVersionDay, факт нед/МТД по nmId из WbCardFunnelDaily; МТД = [monthStart..weekEnd] буквально, включая перетекание weekEnd в следующий месяц — locked).
- `lib/finance-weekly/data.ts`: минимальный дифф — `meta[nmId].productId` (тип + сборка), маппинг nmId→productId без повторного запроса.

**Task 2 — таблица + KPI:**
- `components/finance/WeeklyFinReportTable.tsx`: optional prop `planFact` (Record, не Map — RSC→client boundary); 2 новые колонки после «Выручка» (7 числовых, colSpan пустых universe/brand строк 5→7); article-строки `planWeek` из распределения (`null` → «—», план 0 показывается как 0, % — «—»); подытоги/итого Σфакт/Σплан локально по article-строкам группы с guard план>0; `% ≥ 100` → emerald. KPI-блок `PlanFactKpiBlock` (2 карточки grid sm:grid-cols-2: «Неделя» и «Месяц (по dd.MM)») рендерится первым и в пустой неделе тоже (info-note 2). Sticky-паттерн: все новые ячейки на существующих NUM_CELL/solidBg (сплошной bg, без /NN alpha); клик/модалка/водопад не тронуты; хуки выше early-return.

**Task 3 — wiring:**
- `app/(dashboard)/finance/weekly/page.tsx`: `loadWeeklyPlanFact(weekStart, weekEndDate, articleNmIds, nmIdToProductId)` после `loadWeeklyFinReportInputs`; конвертация `Object.fromEntries(planWeekByNmId)` + `kpi: totals`; `hasActivePlan=false` → `planFact=null` → колонки «—», KPI скрыт.

## Deviations from Plan

### Применённые info-notes план-чекера (санкционированы оркестратором)

**1. [Info-note 1] planMonthByNmId убран из WeeklyPlanFact**
- Минимальный вариант: per-nmId месячное распределение UI не потребляет → интерфейс несёт только `totals.planMonth` (+ `factMonthByNmId` как сырьё totals). Задокументировано в JSDoc интерфейса.

**2. [Info-note 2] KPI-блок при пустой неделе**
- Тривиально реализуемо → KPI рендерится и в early-return ветке `articles.length === 0` (план месяца виден даже без заказов за неделю).

**3. [Info-note 3] toBeCloseTo(1000, 9) в тесте инварианта суммы** — применено.

Прочих отклонений нет — план выполнен как написан.

## Результаты гейтов

- `npx tsc --noEmit` — clean после каждой задачи.
- `npx vitest run tests/finance-weekly-engine.test.ts tests/finance-weekly-plan-fact.test.ts tests/pricing-math.test.ts` — **72 passed** (engine 20 + pricing 48 не сломаны + plan-fact 4 новых зелёных).
- git-diff гейт: `lib/finance-weekly/engine.ts`, `lib/finance-weekly/types.ts`, `prisma/schema.prisma` — **без диффа** (проверено после каждой задачи и против origin/main).
- Grep key-links: `salesPlan.activeVersionId` в plan-fact.ts ✓, `loadWeeklyPlanFact(` в page.tsx ✓, `productId: product.id` в data.ts ✓, `План (нед)` в таблице ✓.
- Полный `npm run test` — не гейт (≈42 известных pre-existing support/CRM/wb-sync падения, не чинились).

## Commits

- `fd1f1f7` feat(quick-260710-gem): W2c план-факт loader — lib/finance-weekly/plan-fact.ts + productId в meta
- `7a82be9` feat(quick-260710-gem): W2c таблица — колонки План(нед)/% вып.(нед) + KPI-блок план-факта
- `f92ccf2` feat(quick-260710-gem): W2c план-факт в /finance/weekly — колонки План(нед)/% вып. + KPI-блок из SalesPlanVersionDay

Запушено в origin/main (`d2de850..f92ccf2`). Deploy выполняет оркестратор после верификации.

## Known Stubs

None — данные план/факт полностью проведены из БД в UI; «—» — осознанный fallback отсутствия активной версии/плана, не заглушка.

## Self-Check: PASSED
- lib/finance-weekly/plan-fact.ts — FOUND
- tests/finance-weekly-plan-fact.test.ts — FOUND
- Commits fd1f1f7 / 7a82be9 / f92ccf2 — FOUND in git log
