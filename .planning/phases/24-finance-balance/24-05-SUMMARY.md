---
phase: 24-finance-balance
plan: 05
subsystem: database
tags: [prisma, finance, balance-sheet, vitest, decimal, tax-liability]

requires:
  - phase: 24-finance-balance (24-01)
    provides: FinanceStockSnapshot/FinanceReceivablesSnapshot/FinanceManualAdjustment/FinanceTaxPeriodActual tables + AppSetting seeds (finance.vatPct/incomeTaxPct/taxCalcStartQuarter)
  - phase: 24-finance-balance (24-02)
    provides: lib/balance-math.ts (computeQuarterAccrual/computeTaxLiability/computeCapital/computeDelta)
  - phase: 24-finance-balance (24-04)
    provides: lib/balance-data.ts point-in-time хелперы (getBankBalanceAsOf/getRateForDate/stageAsOf)
provides:
  - loadBalanceSheet(asOf) — единственная функция сборки полного управленческого баланса на дату
  - BalanceLine/BalanceGroup/BalanceSection/UnvaluedStock/BalanceSheet типы (контракт для UI и recalc)
affects: [24-06 (cron снапшот), 24-07 (UI отчёта), 24-08 (recalc/ручные статьи/ставки), 24-09]

tech-stack:
  added: []
  patterns:
    - "loadBalanceSheet агрегатор: Promise.all для независимых prisma-запросов, последовательный await только там где следующий запрос зависит от предыдущего (курс на дату платежа внутри цикла закупок)"
    - "BalanceLine.currency==='CNY' — справочная строка, sumRubLines() исключает её из subtotalRub/totalRub (m4)"
    - "Point-in-time фильтр по дате (issueDate??createdAt / deletedAt / effectiveFrom / paidDate) вместо фильтра по текущему статусу — паттерн для всех ретро-вычислимых сущностей (M3/B1)"

key-files:
  created:
    - tests/balance-sheet.test.ts
  modified:
    - lib/balance-data.ts

key-decisions:
  - "Квартальная арифметика (quarterStartDate/parseQuarterKey) реализована локальными хелперами внутри lib/balance-data.ts вместо startOfQuarterMsk(asOf) — startOfQuarterMsk даёт квартал ТЕКУЩЕЙ переданной даты, а для итерации по произвольной паре (year, quarter) от taxCalcStartQuarter до квартала asOf нужна была генерация даты старта ПО НОМЕРУ квартала, которую startOfQuarterMsk не предоставляет. Формат строки идентичен (+03:00 offset), численно эквивалентно."
  - "Группы 'Авансы поставщикам' и 'Ручные статьи' — всегда с ключом 'manual'/'advances'; группа 'manual' добавляется в секцию ТОЛЬКО если есть хотя бы одна строка (избегаем пустых 'Итого: 0 ₽' в UI 24-07), группы cash/receivables/inventory/advances/loans/taxes — всегда присутствуют (стабильные ключи для дельта-сопоставления в 24-07 между двумя датами)."
  - "Факт FinanceTaxPeriodActual для ПОСЛЕДНЕГО (текущего, содержащего asOf) квартала НЕ проверяется — он ВСЕГДА начисление, как явно указано в плане ('Текущий незакрытый квартал — ВСЕГДА начисление'), даже если запись факта уже существует в БД."

requirements-completed: [FIN-BAL-08]

duration: ~35min
completed: 2026-07-03
---

# Phase 24 Plan 05: loadBalanceSheet — агрегатор управленческого баланса Summary

**`loadBalanceSheet(asOf)` в lib/balance-data.ts собирает полный баланс (Активы/Пассивы/Капитал) на любую дату из банка, кассы, кредитов, запасов, дебиторки WB, авансов поставщикам и налоговых обязательств — единственная точка сборки, готовая к потреблению UI (24-07) и recalc (24-08).**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 (выполнены одним связным изменением lib/balance-data.ts из-за сильной внутренней зависимости — Assembly в конце функции требует всех промежуточных групп; коммит атомарен по файлу, тест — отдельным коммитом)
- **Files modified:** 2 (1 изменён, 1 создан)

## Accomplishments

- Типы `BalanceLine/BalanceGroup/BalanceSection/UnvaluedStock/BalanceSheet` экспортированы verbatim из контракта плана.
- Денежные средства: банк (RUR суммируется в рублёвую строку через `getBankBalanceAsOf`, CNY — отдельная справочная строка) + касса (Σ INCOME−EXPENSE, date<=asOf).
- Кредиты — point-in-time (M3): пропуск не выданных на asOf (`issueDate ?? createdAt > asOf`) и мягко удалённых к asOf (`deletedAt <= asOf`); НЕ убираются ретроактивно если `deletedAt > asOf`.
- Ручные статьи (D-08): `effectiveFrom <= asOf AND (deletedAt=null OR deletedAt > asOf)`, разнесены по type в активы/пассивы.
- Запасы: `FinanceStockSnapshot` по 4 локациям + строка «Товар в пути из Китая»; строки с `costPriceAtDate=null` собраны в `unvaluedStock` (D-11), НЕ включены в сумму запасов.
- Дебиторка WB (D-14): читается ТОЛЬКО из `FinanceReceivablesSnapshot.findUnique({date:asOf})`, без вызова API (Pitfall 6); отсутствие снапшота → строка 0 ₽ с `approximate:true`.
- Авансы/в пути из Китая (D-12, B1/B2): только `PAID`-платежи с `paidDate != null && paidDate <= asOf`, курс на дату платежа (`getRateForDate`); классификация по `stageAsOf` на asOf (НЕ по текущему `Purchase.status`); `WAREHOUSE` на asOf исключён полностью (двойной счёт с запасами).
- Налоги (D-15/16/17, B3/M4): начисление по кварталам от `AppSetting.finance.taxCalcStartQuarter` (default `2026-Q2`) — факт `FinanceTaxPeriodActual` перекрывает расчёт для ЗАКРЫТЫХ кварталов (кроме текущего, содержащего asOf — он всегда расчётный); факты ДО границы добавляются отдельно (fact-only); вычитание уплаченных налогов (`BankTransaction category=TAX` + `CashEntry category='Налоги/банк/сборы'`) — ЕДИНОЖДЫ, глобально по всему окну `[taxWindowStart, asOf]`, через `computeTaxLiability`.
- Капитал = `computeCapital(assets.totalRub, liabilities.totalRub)`.
- Assembly: `subtotalRub`/`totalRub` считаются ТОЛЬКО по строкам `currency !== "CNY"` (m4).

## Task Commits

Все задачи реализованы одним связным изменением `lib/balance-data.ts` (Task 1/2/3 плана сильно взаимозависимы — Assembly требует готовых групп из всех трёх этапов), затем отдельный коммит теста:

1. **Task 1+2+3: loadBalanceSheet агрегатор** - `b823eb4` (feat)
2. **Task 3 (тестовая часть): assembly-тест** - `85df2a5` (test)

**Plan metadata:** не коммитился (плановое `⚠ НЕ КОММИТИТЬ` — исполнитель работает в изолированном worktree, финальный коммит SUMMARY выполняется вручную пользователем/оркестратором при мёрже фазы).

## Files Created/Modified

- `lib/balance-data.ts` - добавлены типы BalanceSheet + `loadBalanceSheet(asOf)` (580 строк всего, было 87)
- `tests/balance-sheet.test.ts` - assembly-тест (5 тестов, мокирует `@/lib/prisma`)

## Decisions Made

- Локальные хелперы `quarterStartDate(year, quarter)` / `parseQuarterKey(key)` вместо `startOfQuarterMsk(asOf)` — см. key-decisions выше (численно идентичный формат `+03:00`, но нужна была генерация ПО номеру квартала, а не по дате).
- Группы `cash/receivables/inventory/advances/loans/taxes` всегда присутствуют в секциях (даже с нулевыми суммами) для стабильных ключей дельта-сопоставления между двумя датами в 24-07; группа `manual` — опциональна (добавляется только при наличии хотя бы одной ручной статьи).
- Строка "Товар в пути из Китая" физически находится в группе `inventory` (Запасы), а не в группе `advances` — соответствует явному указанию плана "· stage ∈ {SHIPMENT, TRANSIT} → строка «Товар в пути из Китая» (группа «Запасы»)".

## Deviations from Plan

None - план выполнен как написан, включая все ревизионные фиксы (B1/B2/B3/M3/M4/m4/m6) — см. чеклист ниже.

## Issues Encountered

None.

## Verification Results

- `npx tsc --noEmit` — **PASS** (0 ошибок, включая `lib/balance-data.ts` и `tests/balance-sheet.test.ts`)
- `npx vitest run tests/balance-sheet.test.ts` — **PASS** (5/5 тестов)
- `npx vitest run tests/balance-math.test.ts tests/balance-data.test.ts tests/balance-sheet.test.ts` (регрессия) — **PASS** (26/26 тестов)

## Fix Checklist (ревизия плана)

- **B1** (авансы/в пути — только PAID с `paidDate!=null && paidDate<=asOf`, курс по paidDate; классификация по `stageAsOf`, НЕ по текущему `status`) — реализовано, `lib/balance-data.ts` цикл по `purchase.payments`.
- **B2** (этап `WAREHOUSE` на asOf исключён полностью из авансов и «в пути»; «в пути» = `SHIPMENT`/`TRANSIT`) — реализовано.
- **B3** (налог через `computeTaxLiability({accruedTotal, taxesPaidTotal})`, платежи вычитаются ЕДИНОЖДЫ) — реализовано, вычитание вне цикла по кварталам.
- **M3** (кредиты point-in-time: пропуск при `(issueDate??createdAt)>asOf`; soft-delete не убирается если `deletedAt>asOf`) — реализовано.
- **M4** (нижняя граница `AppSetting finance.taxCalcStartQuarter`, default `2026-Q2`; кварталы до границы — только факт, иначе 0) — реализовано, плюс факты до границы прибавлены отдельно.
- **m4** (CNY-остатки банка — справочная строка `BalanceLine.currency`, НЕ в рублёвых subtotal/total) — реализовано, `sumRubLines()` фильтрует `currency !== "CNY"`.
- **m6** (единая конвенция даты: `asOf` = конец дня; снапшот `date=asOf` + live `date<=asOf` согласованы) — реализовано, соответствует существующим хелперам 24-04.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `loadBalanceSheet` готов к потреблению 24-07 (UI отчёта, две даты + дельты через `computeDelta`) и 24-08 (recalc-кнопка, ручные статьи CRUD, ставки налогов, ввод факта D-17).
- 24-06 (cron-снапшот `FinanceStockSnapshot`/`FinanceReceivablesSnapshot`) остаётся отдельной зависимостью — без данных в этих таблицах на дату `loadBalanceSheet` вернёт нулевые запасы/дебиторку (ожидаемое поведение, не блокер для этого плана).
- Блокеров нет.

---
*Phase: 24-finance-balance*
*Completed: 2026-07-03*
