---
phase: quick-260708-h9l
plan: 01
subsystem: ui
tags: [nextjs, react, pricing, table, wildberries]

# Dependency graph
requires:
  - phase: quick-260708-f23
    provides: "calculatePricingStandard() v2 (lib/pricing-math.ts) — заполняет row.computedStd.logisticsEffAmount/storageAmount/returnToSellerAmount"
provides:
  - "3 новые видимые std-компонентные колонки на /prices/wb: Логистика МП-std, Хранение-std, Возврат прод.-std"
affects: [prices-wb]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Нейтральная amount-колонка (без profitClass) для расходных std-компонентов — расширяет паттерн deliveryAmount"]

key-files:
  created: []
  modified: ["components/prices/PriceCalculatorTable.tsx"]

key-decisions:
  - "3 новые колонки — нейтральные amount-ячейки (без profitClass), т.к. это расходные статьи std-расчёта, не итоговая прибыль"

patterns-established: []

requirements-completed: [QUICK-260708-h9l]

# Metrics
duration: ~10min
completed: 2026-07-08
---

# Quick Task 260708-h9l: std-компонентные колонки /prices/wb Summary

**3 новые расходные std-колонки (Логистика МП / Хранение / Возврат продавцу) добавлены в PriceCalculatorTable между ROI, % и Прибыль-std, руб. — задеплоено на прод.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-08 (see task start)
- **Completed:** 2026-07-08T09:35:00Z (deploy `==> Done`, systemd active)
- **Tasks:** 1
- **Files modified:** 1 (+ this SUMMARY, STATE.md, plan file)

## Accomplishments
- Добавлены 3 ключа `logisticsEffStd`/`storageStd`/`returnToSellerStd` в 5 точках `PriceCalculatorTable.tsx` (COLUMN_KEYS, DEFAULT_WIDTHS, HIDEABLE_COLUMN_KEYS, SCROLL_COLUMNS, render-row массив), все между `roiPct` и `profitStd`.
- Значения читаются из `row.computedStd?.logisticsEffAmount / storageAmount / returnToSellerAmount ?? 0` через `fmtMoneyInt`, нейтральный CSS-класс (это издержки, не итог) — паттерн `deliveryAmount`.
- Инвариант thead/tbody подтверждён: `SCROLL_COLUMNS` = 33 записи (1×`status`, рендерится отдельно вне массива, + 32 в render-row массиве) — совпадает до и после правки (+3/+3).
- `npx tsc --noEmit` — 0 ошибок (Record<ColumnKey,number> поймал бы пропущенную ширину).
- `npm run test -- pricing-math sales-plan` — 140/140 зелёных (golden-тест nmId 800750522 и sales-plan регресс не задеты).
- Задеплоено на прод: push → detached deploy.sh → `==> Done` → `curl https://zoiten.pro` → 200 → journalctl чист (`✓ Ready in 246ms`, без ошибок в первые логи).

## Task Commits

1. **Task 1: Добавить 3 std-компонентные колонки в PriceCalculatorTable + задеплоить** - `dbe9379` (feat)

**Plan metadata:** (этот SUMMARY коммитится финальным docs-коммитом ниже)

## Files Created/Modified
- `components/prices/PriceCalculatorTable.tsx` — +16 строк, 5 точечных правок (COLUMN_KEYS, DEFAULT_WIDTHS, HIDEABLE_COLUMN_KEYS, SCROLL_COLUMNS, render-row)

## Decisions Made
- Render-ячейки сделаны нейтральными amount-колонками (без `profitClass`), т.к. это расходные компоненты std-расчёта (логистика/хранение/возврат), а не финансовый итог — соответствует указанию плана и паттерну `deliveryAmount`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Первая попытка `ssh root@85.198.97.89 "df -h /"` дала `Connection timed out` (транзиентная сетевая проблема) — повтор с `-o ConnectTimeout=20` прошёл успешно (91GB свободно). Не потребовало отдельного фикса, чисто ретрай.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `/prices/wb` теперь показывает полный набор std-компонентов (расходы + итоги) для стандартных условий — таблица не разъезжается, колонки скрываемы через «Вид».
- Никаких блокеров для следующих задач.

---
*Phase: quick-260708-h9l*
*Completed: 2026-07-08*

## Self-Check: PASSED

- FOUND: components/prices/PriceCalculatorTable.tsx
- FOUND: .planning/quick/260708-h9l-std-prices-wb/260708-h9l-SUMMARY.md
- FOUND commit: dbe9379
