---
phase: quick-260708-mdd
plan: 01
subsystem: ui
tags: [pricing, wb, prices-wb, table, dialog, commission]

requires:
  - phase: 07-prices-wb
    provides: "PriceRow.stdContext.commStdPct + PriceRow.computedStd (std-юнитка v3), уже прокинуты page.tsx"
provides:
  - "Отображение офертной комиссии (commStdPct/commissionAmount) рядом с ИУ-комиссией в PriceCalculatorTable и PricingCalculatorDialog"
affects: [prices-wb]

tech-stack:
  added: []
  patterns:
    - "Нейтральные (без profitClass) ячейки с nullable-safe ?? 0 для std-полей в render-row массиве"

key-files:
  created: []
  modified:
    - components/prices/PriceCalculatorTable.tsx
    - components/prices/PricingCalculatorDialog.tsx

key-decisions:
  - "Только отображение — данные (row.stdContext.commStdPct, row.computedStd.commissionAmount) уже были прокинуты предыдущей фазой (std-юнитка v3), новая логика расчёта не добавлялась"
  - "Ключи commFbwPct/commissionAmount/commissionPct не переименованы — только labels, чтобы не трогать persisted UserPreference (columnWidths/hiddenColumns) существующих пользователей"

patterns-established: []

requirements-completed: [QUICK-260708-mdd]

duration: ~20min
completed: 2026-07-08
---

# Phase quick-260708-mdd: Обе комиссии (ИУ + оферта) на /prices/wb Summary

**Таблица и модалка юнит-экономики /prices/wb теперь показывают ИУ-комиссию и офертную комиссию рядом, без переключения контекста.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 1
- **Files modified:** 2 (+ 1 plan file)

## Accomplishments
- В таблице `/prices/wb` после «Комиссия ИУ, руб.» добавлены 2 новые колонки: «Комиссия оферта, %» и «Комиссия оферта, руб.» (из `row.stdContext.commStdPct` / `row.computedStd.commissionAmount`)
- Прежние колонки переименованы в «Комиссия ИУ, %» / «Комиссия ИУ, руб.» (ключи `commFbwPct`/`commissionAmount` не изменены — сохранена совместимость с persisted UserPreference)
- В модалке юнит-экономики input и строка комиссии помечены «(ИУ)»; в std-блоке первой строкой добавлена «Комиссия (оферта)»
- Задеплоено на прод, `curl https://zoiten.pro` → 200

## Task Commits

1. **Task 1: Обе комиссии (ИУ + оферта) в таблице и модалке /prices/wb + деплой** - `8ccd111` (feat)

_Плановый метаданный коммит SUMMARY+STATE будет создан отдельным commit после этого файла._

## Files Created/Modified
- `components/prices/PriceCalculatorTable.tsx` — 2 новых ключа `commStdPct`/`commStdAmount` добавлены в COLUMN_KEYS, DEFAULT_WIDTHS, HIDEABLE_COLUMN_KEYS, SCROLL_COLUMNS и render-row массив (все — между `commissionAmount` и `drrPct`); переименованы labels ИУ-колонок
- `components/prices/PricingCalculatorDialog.tsx` — `EDITABLE_PARAMS.commissionPct.label` → «Комиссия ИУ»; `OutputRow label="Комиссия"` → «Комиссия (ИУ)»; добавлена `OutputRow label="Комиссия (оферта)"` первой строкой std-`<dl>` (fmtPct(commStdPct) · fmtMoney(liveOutputsStd.commissionAmount))

## Decisions Made
- Данные для офертной комиссии уже существовали (`row.stdContext.commStdPct`, `row.computedStd.commissionAmount` — прокинуты предыдущей std-юнитка v3 фазой), задача решалась чисто на уровне отображения без касания `lib/pricing-math.ts` / `page.tsx`-резолвинга
- Ключи (`commFbwPct`, `commissionAmount`, `commissionPct`) сохранены неизменными — переименованы только человекочитаемые labels, чтобы не сломать сохранённые в БД (`UserPreference`) ширины колонок и списки скрытых колонок у существующих пользователей

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

`npm run test` (полный прогон) даёт 42 pre-existing failures в 11 файлах (`tests/support-sync-*`, `tests/wb-sync-route.test.ts`, `tests/wb-token-validate.test.ts`) — не связаны с изменениями (проверено `git stash` + повторный прогон именно этих файлов на HEAD `647bb7d`, до правок: то же самое количество failures). Целевые gate-тесты плана — `tests/pricing-math.test.ts`, `tests/pricing-fallback.test.ts`, `tests/pricing-settings.test.ts` (63/63 passed) и весь `tests/sales-plan/**` (104/104 passed) — зелёные.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `/prices/wb` таблица и модалка показывают обе комиссии; изменение чисто визуальное, регресс не ожидается
- Pre-existing flaky test failures (`support-sync`/`wb-sync-route`/`wb-token-validate`) остаются вне scope — задокументированы, не устранялись (Rule scope boundary)

---
*Phase: quick-260708-mdd*
*Completed: 2026-07-08*

## Self-Check: PASSED

- FOUND: components/prices/PriceCalculatorTable.tsx
- FOUND: components/prices/PricingCalculatorDialog.tsx
- FOUND: .planning/quick/260708-mdd-prices-wb/260708-mdd-SUMMARY.md
- FOUND: 8ccd111 (git log --oneline --all)
