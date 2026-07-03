---
phase: 24-finance-balance
plan: 04
subsystem: finance-balance
tags: [balance, point-in-time, bank, cbr-rate, purchase-stages]
requires: []
provides: [getBankBalanceAsOf, getRateForDate, stageAsOf]
affects: [24-05-loadBalanceSheet]
tech-stack:
  added: []
  patterns: ["point-in-time query via findFirst orderBy desc + fallback earliest"]
key-files:
  created:
    - lib/balance-data.ts
    - tests/balance-data.test.ts
  modified: []
decisions:
  - "stageAsOf: undated PurchaseItemStageProgress.date=null считается достигнутым только когда asOf соответствует текущей дате (m7, паритет с /procurement currentStageOf, который дату игнорирует); для исторических дат undated-этап не учитывается"
metrics:
  duration: "~15 min"
  completed: "2026-07-03"
---

# Phase 24 Plan 04: Point-in-time хелперы баланса Summary

Три изолированных, покрытых тестами хелпера в `lib/balance-data.ts` — фундамент для агрегатора
`loadBalanceSheet` (Plan 24-05): `getBankBalanceAsOf` (остаток банковского счёта на любую дату,
не только anchor=balanceDate), `getRateForDate` (курс ЦБ РФ point-in-time на дату платежа,
не «последний известный»), `stageAsOf` (этап закупки на дату через pre-filter + `currentStageOf`).

## What Was Built

- **`getBankBalanceAsOf(accountId, asOf)`** — если `asOf >= balanceDate` (anchor): `closing + Σ(anchor, asOf]`;
  если `asOf < anchor`: `closing − Σ(asOf, anchor]`. Знак дельты: `CREDIT` (приход) = `+1`, `DEBIT`
  (расход) = `−1`. Границы интервала строго `(X, anchor]` (`gt`/`lte`). Возвращает `null`, если у счёта
  нет `closingBalance`/`balanceDate`.
- **`getRateForDate(code, asOf)`** — `currencyRate.findFirst({ where: { code, date: { lte: asOf } },
  orderBy: { date: "desc" } })`; если ничего не найдено (дата раньше начала forward-only sync
  с 2026-06-09) — fallback на самый ранний доступный курс с флагом `approximate: true`.
- **`stageAsOf(stages, asOf, now = new Date())`** — pre-filter этапов с `date <= asOf` (датированные)
  + этапы с `date == null`, но только если `asOf` соответствует текущей дате (`asOf >= startOfDayMsk(now)`,
  ревизия m7) → передаёт достигнутые ключи в `currentStageOf()` (lib/purchase-stages.ts, без изменений).

## Deviations from Plan

None — реализация verbatim по коду из `24-RESEARCH.md` <interfaces>, включая m7-ревизию
для `stageAsOf`. Плановые acceptance_criteria (grep-паттерны) все совпадают.

## Verification

- `npx vitest run tests/balance-data.test.ts` — **9 passed (9)**, файлов 1.
  - `getBankBalanceAsOf`: asOf в прошлом → 850 (знак вычитания), asOf ≥ anchor → 1300 (знак сложения),
    нет closingBalance → null (transaction query не вызывается).
  - `getRateForDate`: exact → approximate=false, fallback (dual findFirst) → approximate=true,
    оба findFirst пустые → null.
  - `stageAsOf`: историческая дата до/после SHIPMENT.date (undated TRANSIT не поднимает прошлое в
    обоих случаях), m7 — `asOf === now` → `TRANSIT` (undated этап достигнут на текущей дате).
- `npx tsc --noEmit` — чисто (`balance-data typecheck clean`, grep по файлу пуст).

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: lib/balance-data.ts
- FOUND: tests/balance-data.test.ts
- Commit bbdb983 (feat: хелперы) — присутствует в `git log`
- Commit c276025 (test: тесты) — присутствует в `git log`
