---
phase: quick-260710-lmb
plan: 01
subsystem: finance
tags: [bank, finance-weekly, pools, tags, hybrid]

# Dependency graph
requires:
  - phase: quick-260710-kvf
    provides: "resolvePoolTotals per-бакет источник + poolSources-бейджи в Controls (образец гибрида)"
  - phase: 22-bank-accounts
    provides: "BankTransaction + inline CategoryCell в /bank (образец тег-ячейки)"
provides:
  - "WeeklyCostTag enum (OPEX/CAPEX/DELIVERY_MP) + BankTransaction.weeklyCostTag + индекс (weeklyCostTag, date)"
  - "setWeeklyCostTag server action (BANK MANAGE) + колонка «Тег фин-отчёта» в /bank (select только DEBIT+MANAGE)"
  - "lib/finance-weekly/bank-pools.ts — pure sumBankPoolAutos + resolveHybridPool (manual>0 → manual, иначе банк>0 → банк, иначе 0)"
  - "Гибрид-пулы delivery/overheadAppl в data.ts + clothing.overhead = AppSetting-фикс + недельная переменная"
  - "Редактор пулов: бейджи источника, подписи «банк: N ₽», поле «Общие расходы (фикс.)» одежды"
affects: [finance-weekly, bank]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Гибрид-пул: manual > 0 → manual; manual 0 = «не задано» → банк-авто > 0 → банк; иначе 0"
    - "Ортогональная разметка: weeklyCostTag независим от TxCategory (два поля, разные назначения)"

key-files:
  created:
    - prisma/migrations/20260710_weekly_cost_tag/migration.sql
    - lib/finance-weekly/bank-pools.ts
    - tests/finance-weekly-bank-pools.test.ts
  modified:
    - prisma/schema.prisma
    - lib/bank-labels.ts
    - app/actions/bank.ts
    - components/bank/BankTransactionsTable.tsx
    - app/(dashboard)/bank/page.tsx
    - lib/finance-weekly/data.ts
    - app/actions/finance-weekly.ts
    - components/finance/WeeklyFinReportControls.tsx
    - app/(dashboard)/finance/weekly/page.tsx

key-decisions:
  - "CAPEX не запрашивается в data.ts вовсе (weeklyCostTag in [OPEX, DELIVERY_MP]) — гарантия «КАПЕКС ни в один пул» на уровне запроса"
  - "sumBankPoolAutos берёт |amount| — знак задаёт direction, страховка от отрицательных сумм в выписках"
  - "clothingOverheadFixedRub — глобальный AppSetting (НЕ per неделя); валидация ≥ 0 и на чтении (data.ts), и на записи (Math.max(0, n))"
  - "Фикс-поле одежды НЕ в ManualPools/POOL_FIELDS — рендерится отдельным блоком в группе «Одежда», недельный ключ пулов не меняется"
  - "Тег редактируется только на DEBIT-строках: CREDIT и не-MANAGE — read-only текст (метка или «—»)"

patterns-established:
  - "resolveHybridPool: трёхзначный источник manual/bank/none для UI-бейджей (расширение паттерна resolvePoolTotals)"
  - "bank-pools.ts — pure-модуль без runtime-импортов (vitest без Prisma/Next, паттерн attribution/realization)"

requirements-completed: [QUICK-260710-LMB]

# Metrics
duration: 10min
completed: 2026-07-10
---

# Quick 260710-lmb: W3a — теги банковских операций + авто-пулы недельного фин-отчёта Summary

**Тег WeeklyCostTag (ОПЕКС/КАПЕКС/Доставка до МП) на DEBIT-операциях /bank + гибрид-наполнение пулов «Общие расходы (бытовая)» и «Доставка до МП» в /finance/weekly из банка (manual>0 приоритетен, 0 = не задано) + модель одежды фикс(AppSetting)+переменная**

## Performance

- **Duration:** ~10 мин
- **Started:** 2026-07-10T12:47:11Z
- **Completed:** 2026-07-10T12:57:35Z
- **Tasks:** 3/3
- **Files modified:** 12 (3 созданы + 9 изменены)

## Accomplishments

1. **Task 1 — WeeklyCostTag в банке** (`feat a42ee7a`):
   - `enum WeeklyCostTag { OPEX CAPEX DELIVERY_MP }` + `BankTransaction.weeklyCostTag` (nullable, без default) + `@@index([weeklyCostTag, date])`; hand-written миграция `20260710_weekly_cost_tag` (CREATE TYPE + ADD COLUMN + CREATE INDEX).
   - `setWeeklyCostTag(id, tag)` по образцу categorizeTx: BANK MANAGE, валидация ∈ {"", OPEX, CAPEX, DELIVERY_MP}, `"" → null`, P2025-ветка, `revalidatePath("/bank")`.
   - Колонка «Тег фин-отчёта» после «Категория»: `WeeklyTagCell` — native select (optimistic + откат) только на DEBIT при canManage; CREDIT/не-MANAGE — read-only метка или «—». Тег ортогонален TxCategory.

2. **Task 2 — pure bank-pools + гибрид в data.ts** (TDD: `test 613d0b3` → `feat 83da519`):
   - `lib/finance-weekly/bank-pools.ts` — pure (0 runtime-импортов): `sumBankPoolAutos` (Σ|amount| DEBIT по тегам OPEX/DELIVERY_MP; CREDIT/CAPEX/null — игнор), `resolveHybridPool` (manual>0 → manual, иначе банк>0 → bank, иначе 0/none).
   - 10 unit-тестов (RED подтверждён до реализации): фильтр DEBIT, CAPEX-игнор, null-игнор, |amount|, пустой массив, 4 кейса гибрида (включая Excel-величины 584 400 / 262 300).
   - `data.ts`: запрос тегированных DEBIT-операций недели [Пн..Вс] в Promise.all (CAPEX не запрашивается); `CLOTHING_OVERHEAD_FIXED_KEY` в appSettings-запрос; гибрид `deliveryToMp` (SHARED обе вселенные) и `appliances.overhead`; `clothing.overhead = фикс + manualPools.overheadCloth` (НЕ из банка, §2.2); `WeeklyFinReportPageData` += `bankAutos`/`clothingOverheadFixedRub`/`bankPoolSources`; оба early-return'а — дефолты none/0.
   - `resolvePoolTotals` (storage/acceptance) и `engine.ts` не тронуты.

3. **Task 3 — редактор пулов + push** (`feat b1b50ac`):
   - `saveWeeklyPools(week, pools, opts?)`: `opts.clothingOverheadFixedRub` → `Math.max(0, n)` → отдельный upsert AppSetting `financeWeekly.clothingOverheadFixedRub`; недельный ключ и форма ManualPools не менялись.
   - Controls: бейджи источника «вручную / из банка / —» у delivery/overheadAppl (title «0 = не задано → берётся авто-сумма…») + подпись `банк: N ₽` всегда видна; label overheadCloth → «Общие расходы (переменная)»; новое поле «Общие расходы (фикс.)» с подписью «глобальная константа (не per неделя)»; строка состава `пул одежды = фикс + переменная = N ₽`.
   - page.tsx: проброс 3 новых props.

## Gates

- `npx prisma generate` + `npx tsc --noEmit` — чисто (exit 0)
- Гейтовые тест-файлы зелёные: finance-weekly-engine/realization/attribution/credit-accrual/plan-fact/bank-pools + pricing-math/fallback/settings — 124 passed (9 файлов)
- `grep -c 'from "@' lib/finance-weekly/bank-pools.ts` = 0 (pure)
- Полный suite: 79 падений в 21 известном чужом файле (support/CRM/wb-*/stock/sales-plan) — подтверждено pre-existing прогоном baseline на origin/main (те же 79 failed; моя ветка +10 passed от новых тестов, новых падений 0)
- `git diff origin/main --stat -- lib/finance-weekly/engine.ts` — пусто (движок не тронут)
- Запушено в origin/main (`74d4d88..b1b50ac`), деплой НЕ выполнялся (по заданию — оркестратор)

## Deviations from Plan

None — plan executed exactly as written.

## Post-deploy шаг (оркестратор)

- **`prisma migrate deploy` применит `20260710_weekly_cost_tag` на VPS** — через deploy.sh (detached nohup), выполняет оркестратор. До деплоя колонка `weeklyCostTag` в прод-БД отсутствует.
- Массовая разметка истории НЕ делалась (решение пользователя — метит операции по мере надобности): до первой разметки авто-суммы = 0, пулы работают по-старому (manual).

## Known Stubs

Нет — все данные wired (авто-суммы считаются из реальных BankTransaction; фикс одежды из AppSetting; source-бейджи из реальной резолюции).

## Commits

| Hash | Message |
|------|---------|
| a42ee7a | feat(quick-260710-lmb): тег недельного фин-отчёта (OPEX/CAPEX/DELIVERY_MP) на банковских операциях |
| 613d0b3 | test(quick-260710-lmb): failing тесты pure bank-pools (sumBankPoolAutos + resolveHybridPool) |
| 83da519 | feat(quick-260710-lmb): авто-пулы из банка (гибрид) + фикс-часть общих расходов одежды |
| b1b50ac | feat(quick-260710-lmb): редактор пулов — банк-авто подписи + фикс/переменная одежды |

## Self-Check: PASSED

- 13/13 файлов существуют (3 созданных + 9 изменённых + SUMMARY)
- 4/4 коммита в истории (a42ee7a, 613d0b3, 83da519, b1b50ac)
- origin/main = b1b50ac (запушено), деплой не выполнялся
