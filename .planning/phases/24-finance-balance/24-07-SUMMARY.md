---
phase: 24-finance-balance
plan: 07
subsystem: ui
tags: [nextjs, rsc, react-server-components, tailwind, finance, balance-sheet]

requires:
  - phase: 24-finance-balance (24-05)
    provides: loadBalanceSheet(asOf) aggregator + BalanceLine/BalanceGroup/BalanceSection/BalanceSheet types
provides:
  - "components/finance/BalanceSheetTable.tsx — вертикальная таблица Активы→Пассивы→Капитал с подытогами и Δ₽/Δ%"
  - "components/finance/BalanceDatePicker.tsx — URL-driven выбор 2 дат (native input type=date)"
  - "app/(dashboard)/finance/balance/page.tsx — реальный отчёт (заменяет ComingSoon-стаб из 24-01)"
affects: [24-08 (пересчёт/корректировки/ставки — добавит кнопки в зарезервированную header-зону)]

tech-stack:
  added: []
  patterns:
    - "Vertical balance-sheet report table (server component, no client interactivity except native <details>)"
    - "Compare-map by composite key `${group.key}:${line.key}` for cross-date delta matching"
    - "CNY reference lines rendered with colSpan placeholder, excluded from delta computation (m4)"

key-files:
  created:
    - components/finance/BalanceSheetTable.tsx
    - components/finance/BalanceDatePicker.tsx
  modified:
    - app/(dashboard)/finance/balance/page.tsx

key-decisions:
  - "M5 fix applied: compare default computed as date.slice(0,7)+'-01' string manipulation, NOT startOfMonthMsk(...).toISOString() (which UTC-shifts to the 30th of the PREVIOUS month); compare additionally clamped to >= HISTORY_START (2026-07-01, D-03)"
  - "m4 fix applied: BalanceLine.currency==='CNY' rows render with ¥ suffix (not ₽) and a 'справочно, без дельты' colSpan cell — no delta computed, matches lib/balance-data.ts sumRubLines() exclusion already in place"
  - "Date labels formatted via Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC' }) since date/compare strings parse to UTC midnight (new Date('YYYY-MM-DD')) — explicit UTC avoids server-locale-dependent day-shift bugs"

requirements-completed: [FIN-BAL-10]

duration: 15min
completed: 2026-07-03
---

# Phase 24 Plan 07: BalanceSheetTable + BalanceDatePicker + page.tsx assembly Summary

**Заменили ComingSoon-стаб `/finance/balance` на реальный вертикальный отчёт (Активы→Пассивы→Капитал), с двумя URL-driven датами, подытогами разделов и колонками Δ₽/Δ%, включая справочные CNY-строки и предупреждение «Без оценки» с раскрываемой расшифровкой.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-03
- **Tasks:** 2/2
- **Files modified:** 3 (2 created, 1 rewritten)

## Accomplishments
- `BalanceSheetTable` — server component рендерит АКТИВЫ/ПАССИВЫ по группам с подытогами (сплошной `bg-muted`), финальную строку КАПИТАЛ (отрицательный — `text-red-600`), Δ₽/Δ% для каждой строки/группы/секции через `computeDelta`, CNY-строки как справочные без дельты, блок «Без оценки: N товаров, M шт» с `<details>` расшифровкой (D-11)
- `BalanceDatePicker` — клиентский компонент с двумя native `<input type="date">`, `router.push` на `/finance/balance?date=...&compare=...`, без локального state-каскада
- `page.tsx` переписан: `await requireSection("FINANCE")`, парсинг `searchParams` (Promise, Next 15), M5-safe compare default, clamp к `HISTORY_START`, `Promise.all([loadBalanceSheet(dateObj), loadBalanceSheet(compareObj)])`, зарезервированная flex-зона для кнопок 24-08

## Task Commits

1. **Task 1: BalanceSheetTable** - `3ea792b` (feat)
2. **Task 2: BalanceDatePicker + page.tsx** - `dbda838` (feat)

**Plan metadata:** N/A — не коммитится по инструкции оркестратора (только per-задача коммиты, без push, без gsd-tools).

## Files Created/Modified
- `components/finance/BalanceSheetTable.tsx` - вертикальная таблица баланса с подытогами и дельтами (280 строк)
- `components/finance/BalanceDatePicker.tsx` - URL-driven выбор двух дат
- `app/(dashboard)/finance/balance/page.tsx` - RSC-сборка отчёта (заменяет ComingSoon)

## Decisions Made
- Compare-map между текущей и сравнительной датой строится по составному ключу `${group.key}:${line.key}` — если статья/группа отсутствует в одной из дат (структура баланса могла отличаться на раннюю дату), сравнение трактуется как 0 (per план)
- Цветовая индикация дельты (`text-emerald-600`/`text-red-600`) применена единообразно ко всем уровням (строка/группа/секция/капитал) по знаку абсолютной дельты — план явно требовал этого только для строк-активов, но унификация проще и не противоречит требованиям
- Header-зона страницы: единый `flex` контейнер, зарезервированный пустой `div` (для будущих кнопок 24-08) слева + `BalanceDatePicker` справа через обёртку `ml-auto`

## Deviations from Plan

**1. [Rule 1 - Bug] Исправлена ложная grep-коллизия в M5-комментарии**
- **Found during:** Task 2 verification (acceptance criteria grep)
- **Issue:** Исходный поясняющий комментарий буквально содержал строку `startOfMonthMsk(dateObj).toISOString`, которую acceptance-critera grep обязан НЕ находить (чтобы гарантировать, что в коде не осталось бага off-by-one) — комментарий-пояснение вызывал ложное срабатывание
- **Fix:** Переформулирован комментарий без буквального совпадения фразы, смысл (что именно нельзя делать) сохранён
- **Files modified:** `app/(dashboard)/finance/balance/page.tsx`
- **Verification:** `grep -n "startOfMonthMsk(dateObj).toISOString"` → не находит; `npx tsc --noEmit` чист
- **Committed in:** часть коммита Task 2

---

**Total deviations:** 1 auto-fixed (1 bug — grep false-positive, no functional code change)
**Impact on plan:** Косметическая правка комментария, поведение кода не менялось. No scope creep.

## Issues Encountered
None.

## Pre-existing test failures (out of scope, verified unrelated)
`npx vitest run` показывает 41 failing tests в 10 файлах (`wb-sync-route`, `template-picker`, `support-sync-*`, `response-templates`, `messenger-ticket`, `merge-customers`, `customer-sync-chat` и др.) — уже задокументированы как pre-existing в `.planning/phases/24-finance-balance/deferred-items.md` (из Plan 24-06, verified via `git stash`). Не связаны с `components/finance/*` или `app/(dashboard)/finance/balance/page.tsx`. Balance-related suites (`tests/pricing-math.test.ts` + `tests/*balance*`) — 49/49 passed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `/finance/balance` — полностью функциональный отчёт, готов к ручной проверке (`npm run dev` → `/finance/balance`)
- Header-зона содержит зарезервированный `<div className="flex items-center gap-2">{/* 24-08: RecalcButton / Adjustments / TaxRates здесь */}</div>` — Plan 24-08 может добавить кнопки без реструктуризации layout
- `BalanceSheetTable` принимает `current`/`compare` типа `BalanceSheet` напрямую (без промежуточной сериализации в строки) — оба server components, границы RSC→client нет

---
*Phase: 24-finance-balance*
*Completed: 2026-07-03*
