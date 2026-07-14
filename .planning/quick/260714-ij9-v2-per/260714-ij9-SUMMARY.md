---
phase: quick-260714-ij9
plan: 01
subsystem: finance
tags: [prisma, finance-weekly, credits, vitest, react-hook-form, zod]

# Dependency graph
requires:
  - phase: quick-260710-hkj
    provides: weeklyAccruedInterest (W2d Фикс 4 — недельный accrual процентов по остатку)
  - phase: Phase 21 (credits)
    provides: Loan/LoanPayment модель, LoanModal, CreditsTable, app/actions/credits.ts, lib/credits-data.ts
provides:
  - "Loan.monthlyCommissionRub / Loan.monthlyNdflRub (Decimal(12,2) nullable) + миграция 20260714_loan_monthly_commission_ndfl"
  - "weeklyLoanExtras(loans, weekStart) — pure-функция амортизации комиссии JetLend + НДФЛ (×7/30, с гейтами issueDate и последнего планового платежа)"
  - "Кредитный пул /finance/weekly (appliances) = weeklyAccruedInterest + weeklyLoanExtras по ВСЕЙ группе кредитов (фильтр ЗОЙТЕН снят)"
  - "Модалка кредита: поля «Комиссия, ₽/мес» и «НДФЛ, ₽/мес» (create+edit round-trip)"
affects: [finance-weekly, credits]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LoanExtrasInput/weeklyLoanExtras следует паттерну AccrualLoanInput/weeklyAccruedInterest в том же pure-модуле (ноль импортов Prisma)"
    - "Nullable-числовое поле в LoanModal — register(name, { valueAsNumber, setValueAs: v => (v===''||isNaN)?null:Number(v) }), паттерн termMonths"

key-files:
  created:
    - prisma/migrations/20260714_loan_monthly_commission_ndfl/migration.sql
  modified:
    - prisma/schema.prisma
    - lib/finance-weekly/credit-accrual.ts
    - lib/finance-weekly/data.ts
    - tests/finance-weekly-credit-accrual.test.ts
    - components/credits/LoanModal.tsx
    - app/actions/credits.ts
    - lib/credits-data.ts
    - components/credits/CreditsTable.tsx

key-decisions:
  - "Обновлён устаревший doc-комментарий в шапке data.ts (упоминал 'кредит ЗОЙТЕН'), т.к. напрямую описывал изменённую логику — Rule 1 (auto-fix, документация)"
  - "Прод-данные (значения per транш) НЕ заполнялись — вне scope (заполнит оркестратор SQL-ом после деплоя, per constraints)"
  - "Миграция НЕ применена локально (нет локальной PostgreSQL, устоявшийся паттерн проекта) — применится через deploy.sh на VPS"

patterns-established:
  - "weeklyLoanExtras — второй pure-хелпер в credit-accrual.ts, суммируется с weeklyAccruedInterest в data.ts (creditWeekTotal), не трогая существующий контракт"

requirements-completed:
  - quick-260714-ij9-credit-pool-v2

# Metrics
duration: ~11min
completed: 2026-07-14
---

# Phase quick-260714-ij9 Plan 01: Кредитный пул /finance/weekly v2 Summary

**Кредитный пул недельного фин-отчёта расширен с «проценты только по ЗОЙТЕН» до «проценты по всей группе + амортизация комиссий JetLend/НДФЛ», через два новых nullable-поля на Loan и новую pure-функцию `weeklyLoanExtras`.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-07-14T13:29:00+03:00 (approx, plan file copy time)
- **Completed:** 2026-07-14T13:40:05+03:00
- **Tasks:** 3/3 completed
- **Files modified:** 8 (1 created — миграция)

## Accomplishments

- `Loan` получил два новых nullable-поля (`monthlyCommissionRub`, `monthlyNdflRub`, `Decimal(12,2)`) + зарегистрирована миграция `20260714_loan_monthly_commission_ndfl`
- Новая pure-функция `weeklyLoanExtras` в `lib/finance-weekly/credit-accrual.ts` — недельная доля (×7/30) амортизации единовременных комиссий JetLend + НДФЛ инвесторам, с двумя гейтами «жив ли транш на неделе» (issueDate + дата последнего планового платежа)
- Кредитный пул `/finance/weekly` (appliances) переведён с «только кредиты компании ЗОЙТЕН» на «вся группа компаний»: `creditWeekTotal = weeklyAccruedInterest(groupLoans) + weeklyLoanExtras(groupLoans)`
- Модалка кредита (`LoanModal.tsx`) получила новую секцию «Кредитный пул (фин-отчёт за неделю)» с полями «Комиссия, ₽/мес» и «НДФЛ, ₽/мес»; create/edit round-trip работает через `app/actions/credits.ts` + `lib/credits-data.ts` + `CreditsTable.tsx`
- `weeklyAccruedInterest` не изменена ни на строку (подтверждено `git diff` — только аддитивные вставки в конец файла); `clothing.creditInterest` остаётся `0`

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma — два nullable-поля на Loan + миграция** - `e760c54` (feat)
2. **Task 2: weeklyLoanExtras (TDD)**
   - RED (failing tests) - `b7b0c7b` (test)
   - GREEN (implementation + data.ts wiring) - `2dfb7a2` (feat)
3. **Task 3: UI кредитов — поля Комиссия/НДФЛ + server action + edit round-trip** - `af5ff35` (feat)

**Plan metadata:** (this commit, following SUMMARY)

## Files Created/Modified

- `prisma/schema.prisma` - два новых поля на `model Loan`: `monthlyCommissionRub`, `monthlyNdflRub` (`Decimal(12,2)?`)
- `prisma/migrations/20260714_loan_monthly_commission_ndfl/migration.sql` - `ALTER TABLE "Loan" ADD COLUMN` ×2 (не применена локально — нет локальной PG, применится через `deploy.sh` на VPS)
- `lib/finance-weekly/credit-accrual.ts` - новый экспорт `LoanExtrasInput` + `weeklyLoanExtras(loans, weekStart): number`; `weeklyAccruedInterest` не тронута
- `lib/finance-weekly/data.ts` - импорт `weeklyLoanExtras`; запрос кредитов теперь без `company` (фильтр снят), с двумя новыми полями в `select`; блок §8 переименован (`zoitenLoans`/`zoitenWeekInterest` → `groupLoans`/`creditWeekTotal`), считает по всей группе; `appliancesPools.creditInterest.total = creditWeekTotal`; обновлён doc-комментарий в шапке файла (Rule 1, см. Decisions)
- `tests/finance-weekly-credit-accrual.test.ts` - добавлен `describe("weeklyLoanExtras", ...)` (7 кейсов: базовый ×7/30, сумма комиссия+НДФЛ, null→0, гейт issueDate, гейт последнего платежа, кредит без графика, смесь кредитов); существующие 6 тестов `weeklyAccruedInterest` не тронуты
- `components/credits/LoanModal.tsx` - `LoanForModal` + `LoanFormSchema` + `defaultValues`/`reset` (оба режима)/`onSubmit` (create+update) несут два новых поля; новая UI-секция «Кредитный пул (фин-отчёт за неделю)» перед «Заметки»
- `app/actions/credits.ts` - `LoanSchema` + `createLoan`/`updateLoan` принимают и пишут `monthlyCommissionRub`/`monthlyNdflRub` (RBAC `CREDITS`/`MANAGE` не менялся)
- `lib/credits-data.ts` - `CreditRow` + `loadCredits()` несут оба поля (Number-конверсия из Prisma Decimal)
- `components/credits/CreditsTable.tsx` - локальный `LoanForModal` + реконструкция `loanForModal` из `row` прокидывают оба поля в модалку (edit-режим восстанавливает значения, не затирает)

## Decisions Made

- Обновлён устаревший doc-комментарий в шапке `data.ts` (описывал «проценты кредита ЗОЙТЕН») — напрямую относился к изменённой в этой задаче логике, оставлять неточным было бы источником путаницы (Rule 1)
- Прод-заполнение значений `monthlyCommissionRub`/`monthlyNdflRub` per транш сознательно не выполнялось — по constraints это делает оркестратор SQL-ом после деплоя
- Миграция создана как файл (`migration.sql`), но НЕ применена к БД локально — локальной PostgreSQL нет (устоявшийся паттерн проекта, см. CLAUDE.md); применится через `prisma migrate deploy` внутри `deploy.sh` на VPS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/Documentation] Устаревший doc-комментарий в шапке data.ts**
- **Found during:** Task 2 (после вайринга weeklyLoanExtras в data.ts)
- **Issue:** Комментарий-легенда источников данных в шапке файла (строка ~16-17) описывал старую семантику: «проценты кредита — начисление... по кредитам ЗОЙТЕН». После снятия фильтра ЗОЙТЕН и добавления extras комментарий стал неточным и вводящим в заблуждение
- **Fix:** Переписан на актуальное описание (вся группа + amortization комиссии/НДФЛ, ссылка на quick 260714-ij9 v2)
- **Files modified:** `lib/finance-weekly/data.ts`
- **Verification:** Визуальная сверка; не влияет на выполнение кода (только комментарий)
- **Committed in:** `2dfb7a2` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 — документация)
**Impact on plan:** Косметическая правка комментария для точности документации; логика/поведение не затронуты. Ноль scope creep.

## Issues Encountered

Полный прогон `npx vitest run` (весь проект, не только гейт задачи) показал 44 упавших теста в 12 файлах, НЕ связанных с этой задачей (appeal-actions, customer-actions, customer-sync-chat, merge-customers, messenger-ticket, response-templates, support-sync-chats, support-sync-returns, template-picker, wb-cooldown, wb-sync-route, wb-token-validate). Подтверждено grep'ом: ни один из этих файлов не импортирует ничего из `credits`/`finance-weekly`/`Loan`, и ни один из них не входит в diff этой задачи. Один явно сетевой (`wb-token-validate` — "probe timeout", недоступность сети в sandboxed-окружении исполнителя), остальные похожи на pre-existing проблему тестового окружения (Prisma-mock/vi.mock), не привязанную к этой задаче. Задокументировано в `.planning/quick/260714-ij9-v2-per/deferred-items.md`, НЕ исправлялось (out of scope, SCOPE BOUNDARY). Целевой гейт задачи (`finance-weekly-credit-accrual.test.ts` + весь `finance-weekly-*`/`pricing-math` — 141/141, `tsc --noEmit` — 0 ошибок) — полностью зелёный.

## User Setup Required

None - no external service configuration required. Однако после деплоя на VPS **обязательно** применится миграция `20260714_loan_monthly_commission_ndfl` (через `prisma migrate deploy` внутри `deploy.sh`), а заполнение реальных значений `monthlyCommissionRub`/`monthlyNdflRub` per существующий транш — отдельный SQL-шаг оркестратора (out of scope этого плана, см. `<objective>` плана).

## Next Phase Readiness

- Кредитный пул `/finance/weekly` полностью реализован (v2) — методика согласована и сверена с экономистом 2026-07-14 (константа 1 686 960 ₽/мес = проценты группы + амортизация комиссий 275 130/мес + НДФЛ ~128 431/мес)
- Требуется: деплой (миграция применится автоматически) + заполнение прод-значений `monthlyCommissionRub`/`monthlyNdflRub` per существующий кредит (SQL, оркестратор) — без этого шага пул останется без extras-вклада (только accrual-проценты, т.к. новые поля будут `null` до заполнения)
- W3b недельного фин-отчёта закрыт этим планом (см. CLAUDE.md секцию «Понедельный фин-отчёт»)

---
*Phase: quick-260714-ij9*
*Completed: 2026-07-14*

## Self-Check: PASSED

All 11 claimed files verified present on disk (9 code/schema files + SUMMARY.md + deferred-items.md).
All 4 claimed commit hashes verified present in `git log --oneline --all` (e760c54, b7b0c7b, 2dfb7a2, af5ff35).
