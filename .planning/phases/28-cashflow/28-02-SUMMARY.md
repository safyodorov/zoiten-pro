---
phase: 28-cashflow
plan: "02"
subsystem: finance
tags: [cashflow, rsc-page, recharts, sticky-table, pddс]

requires:
  - phase: 28-cashflow
    plan: "01"
    provides: lib/finance-cashflow/types.ts, engine.ts, data.ts

provides:
  - components/finance/CashflowKpiCards.tsx — 4 KPI-карточки результата ПДДС
  - components/finance/CashflowChart.tsx — recharts прогноз+факт линии + ReferenceLine
  - components/finance/CashflowMatrix.tsx — sticky-матрица 10 строк потоков × бакеты
  - app/(dashboard)/finance/cashflow/page.tsx — RSC-страница (заменяет ComingSoon)

affects: [/finance/cashflow]

tech-stack:
  added: []
  patterns:
    - "CashflowChart: recharts ComposedChart тики fill var(--muted-foreground), токены var(--chart-*)"
    - "CashflowMatrix: sticky HTML-таблица border-separate, сплошной bg-background БЕЗ /NN"
    - "page.tsx: force-dynamic RSC, granularity allow-list T-28-05, пустое состояние D-7"

key-files:
  created:
    - components/finance/CashflowKpiCards.tsx
    - components/finance/CashflowChart.tsx
    - components/finance/CashflowMatrix.tsx
  modified:
    - app/(dashboard)/finance/cashflow/page.tsx

decisions:
  - "granularity allow-list в page.tsx: ['day','week','month'].includes — T-28-05 антинъекция"
  - "Пустое состояние только при !activeVersionId (нет fallback на драфт) — D-7"
  - "gapThresholdRub передаётся в Chart и Matrix из inputs (не из result) — прямой доступ к настройке"
  - "CommentARY fix: удалены упоминания buttonVariants/ComingSoon из комментариев (мешали grep-гейтам)"

metrics:
  duration: "364s (~6 мин)"
  completed: "2026-07-05"
---

# Phase 28 Plan 02: RSC-страница ПДДС — KPI + Chart + Matrix

**RSC /finance/cashflow с loadCashflowInputs → computeCashflow → KpiCards + Chart + sticky-Matrix; пустое состояние при !activeVersionId; granularity day/week/month через URL.**

## Performance

- **Duration:** ~6 мин (364 сек)
- **Started:** 2026-07-05T19:44:52Z
- **Completed:** 2026-07-05T19:50:56Z
- **Tasks:** 3
- **Files modified:** 4 (создано 3, изменено 1)

## Accomplishments

- `components/finance/CashflowKpiCards.tsx` — 4 KPI: стартовый остаток, мин. остаток, первый разрыв, net за горизонт. Статические цветовые классы red/emerald.
- `components/finance/CashflowChart.tsx` — ComposedChart: прогноз (chart-2) + факт (chart-1, connectNulls=false) + ReferenceLine порог (destructive) + ReferenceLine сегодня (muted-foreground). Тики var(--muted-foreground).
- `components/finance/CashflowMatrix.tsx` — sticky HTML-таблица (10 строк): Выплаты WB, Итого притоки, Закупки (реал/вирт), Кредиты, Налоги, Опекс, Итого оттоки, Net, Остаток. СПЛОШНОЙ bg-background/bg-muted (нет /NN). Gap-подсветка строки «Остаток на конец».
- `app/(dashboard)/finance/cashflow/page.tsx` — RSC: requireSection("FINANCE"), granularity allow-list, пустое состояние при !activeVersionId, loadCashflowInputs → computeCashflow, versionStale-предупреждение, Link prefetch=false.
- `npm run build` зелёный: /finance/cashflow — динамический роут (ƒ), 4.83 kB.
- 5 golden-тестов движка — зелёные (sales-plan golden 20 тестов — не затронуты).

## Task Commits

1. **Task 1: CashflowKpiCards + CashflowChart** — `2ce2452` (feat)
2. **Task 2: CashflowMatrix** — `d41f0fa` (feat)
3. **Task 3: page.tsx** — `4623513` (feat)

## Files Created/Modified

- `components/finance/CashflowKpiCards.tsx` — 4 KPI-карточки результата ПДДС
- `components/finance/CashflowChart.tsx` — recharts прогноз+факт+порог+сегодня
- `components/finance/CashflowMatrix.tsx` — sticky-матрица 10 строк потоков × бакеты
- `app/(dashboard)/finance/cashflow/page.tsx` — RSC, замена ComingSoon, RBAC, granularity

## Decisions Made

- **granularity allow-list**: `["day","week","month"].includes(...)` с fallback "month" — произвольное значение отбрасывается, не доходит до bucketKey (T-28-05)
- **gapThresholdRub из inputs**: Chart и Matrix получают `inputs.gapThresholdRub` (не `result.*`) — прямой доступ к AppSetting-настройке
- **Пустое состояние без fallback на драфт**: только при `!activeVersionId` — D-7 из плана

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] grep-гейты для acceptance-criteria: комментарии содержали паттерны которые grep считал нарушениями**
- **Found during:** Task 3 (проверка acceptance criteria)
- **Issue:** Комментарии вида `// Заменяет ComingSoon-заглушку` и `// НЕ buttonVariants — RSC trap` содержали точные строки grep-гейтов (`ComingSoon`, `buttonVariants`), что давало ложные срабатывания при `grep -c "..." file` = 0.
- **Fix:** Перефразированы комментарии без использования проверяемых строк.
- **Files modified:** `app/(dashboard)/finance/cashflow/page.tsx`, `components/finance/CashflowMatrix.tsx`
- **Verification:** Все grep-гейты = 0 после исправления.
- **Committed in:** `4623513` (Task 3 commit, `d41f0fa` Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — ложные срабатывания grep-гейтов)
**Impact on plan:** Минимальный — только рефраз комментариев, функциональность не менялась.

## Known Stubs

- `components/finance/CashflowMatrix.tsx` — строка «Прочие притоки»: отсутствует (в плане указано «v1 нет; строка-плейсхолдер или пропустить» — выбрано «пропустить», `totalInflow` уже включает все притоки).

## Threat Surface Scan

Угрозы T-28-04, T-28-05, T-28-06 покрыты:
- T-28-04: `requireSection("FINANCE")` в начале page.tsx — до любой загрузки данных.
- T-28-05: allow-list валидация granularity с fallback.
- T-28-06: пустое состояние за FINANCE-гейтом — раскрывает только «нет активной версии».

Новых угроз, не в threat_model, не обнаружено.

## Self-Check

- [x] `components/finance/CashflowKpiCards.tsx` — существует
- [x] `components/finance/CashflowChart.tsx` — существует
- [x] `components/finance/CashflowMatrix.tsx` — существует
- [x] `app/(dashboard)/finance/cashflow/page.tsx` — изменён (ComingSoon удалён)
- [x] Коммиты 2ce2452, d41f0fa, 4623513 — в git log
- [x] `npx tsc --noEmit` — 0 ошибок
- [x] `npm run build` — зелёный, /finance/cashflow = ƒ (dynamic)
- [x] `npx vitest run tests/finance-cashflow-engine.test.ts` — 5/5 green

## Self-Check: PASSED

---
*Phase: 28-cashflow*
*Completed: 2026-07-05*
