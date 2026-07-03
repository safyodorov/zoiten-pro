---
phase: quick-260703-qze
plan: "01"
subsystem: finance-balance
tags: [balance-sheet, receivables, wb, split, refactor]
dependency_graph:
  requires: [lib/balance-data.ts, prisma/schema.prisma (FinanceReceivablesSnapshot)]
  provides: [receivables-wb-current line, receivables-wb-tail line]
  affects: [app/(dashboard)/finance/balance, tests/balance-sheet.test.ts]
tech_stack:
  patterns: [BalanceLine split, sumRubLines, Number(Decimal), vitest mock]
key_files:
  modified:
    - lib/balance-data.ts
    - tests/balance-sheet.test.ts
decisions:
  - "receivablesLines array pattern (not single receivablesLine) — позволяет условно менять количество строк без дублирования sumRubLines вызова"
metrics:
  completed_date: "2026-07-03"
  task_count: 2
  file_count: 2
---

# Phase quick-260703-qze Plan 01: Receivables Split Current+Tail Summary

**One-liner:** Разбивка строки «Дебиторка Wildberries» на две строки (balanceCurrentRub + weeklyTailRub) при наличии снапшота с сохранением subtotalRub.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Разбить строку дебиторки WB на current + tail | aaacfb8 | lib/balance-data.ts |
| 2 | Обновить мок снапшота дебиторки в balance-sheet тесте | 7476ce8 | tests/balance-sheet.test.ts |

## What Was Built

В `lib/balance-data.ts` заменена одна переменная `receivablesLine: BalanceLine` на массив `receivablesLines: BalanceLine[]`:

- При наличии снапшота: две строки — `receivables-wb-current` (balanceCurrentRub) и `receivables-wb-tail` (weeklyTailRub). `subtotalRub = current + tail = totalRub` через `sumRubLines(receivablesLines)`.
- При отсутствии снапшота: прежняя одна строка `receivables-wb` с `approximate: true` (обратная совместимость).

В `tests/balance-sheet.test.ts`:
- Мок `financeReceivablesSnapshot.findUnique` дополнен полями `balanceCurrentRub: 5000, weeklyTailRub: 3000` (totalRub остаётся 8000 = 5000+3000).
- Добавлена проверка `rec.lines.toHaveLength(2)` и значений обеих строк по ключам.

Компонент-рендерер `BalanceSheetTable.tsx` не трогался — он итерирует `group.lines` дженерик, ключи `${group.key}:${line.key}` работают per-line автоматически.

## Verification

```
npx vitest run tests/balance-sheet.test.ts → 5/5 passed
```

## Deviations from Plan

None — план выполнен точно как описано.

## Known Stubs

None.

## Threat Flags

None — изменение чисто внутреннее (data layer), нет новых сетевых endpoint или auth paths.

## Self-Check: PASSED

- lib/balance-data.ts — contains `receivables-wb-current` key ✓
- tests/balance-sheet.test.ts — contains `balanceCurrentRub` ✓
- Commit aaacfb8 exists ✓
- Commit 7476ce8 exists ✓
- Tests: 5/5 passed ✓
