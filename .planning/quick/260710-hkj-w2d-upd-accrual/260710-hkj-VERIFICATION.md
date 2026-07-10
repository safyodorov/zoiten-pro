---
phase: quick-260710-hkj
verified: 2026-07-10T13:50:00Z
status: passed
score: 7/7 must-haves verified
---

# Quick 260710-hkj: W2d — четыре фикса /finance/weekly Verification Report

**Goal:** (Ф1) базис одежды = gross выкупы WbSalesDaily + план/факт clothing по выкупам + UI-бейджи; (Ф2) история комиссий WbCommissionSnapshot + backfill 2026-06-01 + хуки sync; (Ф3) реклама = Σ updSum × fullstats-доли; (Ф4) кредитный пул = accrual остаток×ставка×7/365; (Ф5 mid-task) полная иерархия таблицы Направление→Бренд→Категория→Подкатегория→Артикул.
**Verified:** 2026-07-10T13:50:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Clothing-строки считаются по выкупам (qty=ΣbuyoutsCount, revenue=ΣbuyoutsRub gross), appliances — по заказам | ✓ VERIFIED | `data.ts:289-293` wbSalesDaily.groupBy `_sum: {buyoutsCount, buyoutsRub}`; `data.ts:393-412` union nmIds + per-universe выбор базиса + guard `qty <= 0` |
| 2 | План-факт clothing: план = planBuyoutsRub, факт МТД = WbSalesDaily.buyoutsRub; appliances без изменений | ✓ VERIFIED | `plan-fact.ts:166-174` `_sum: {planOrdersRub, planBuyoutsRub}`; `:196-216` clothing week+MTD из wbSalesDaily; `:237-243` planForProduct по hasSizes; `:176-195` appliances ordersSumRub как раньше |
| 3 | Комиссии недели из WbCommissionSnapshot по validFrom <= weekEnd, fallback WbCard | ✓ VERIFIED | `wb-commission-history.ts:120-139` DISTINCT ON + `WHERE validFrom <= ${date}`; `data.ts:301` loadCommissionsForDate(weekEnd); `data.ts:425-435` snap → fallback card → 0 |
| 4 | Backfill-миграция сохраняет текущие ставки WbCard как снапшот от 2026-06-01 | ✓ VERIFIED | `migration.sql:20-22` INSERT...SELECT gen_random_uuid()::text, DATE '2026-06-01' FROM "WbCard"; CREATE TABLE + 2 индекса; модель в schema.prisma:419-431 |
| 5 | Реклама = Σ WbAdvertSpendRow.updSum недели × fullstats-доли (знаменатель по ВСЕМ nmId) | ✓ VERIFIED | `data.ts:303-306` aggregate updSum полуоткрытый интервал; `:308-311` знаменатель без фильтра nmId; `:358-362` attributeSpendByShares; pure-модуль с zero-guard + 5 тестов |
| 6 | Кредитный пул = accrual остаток×ставка×7/365 по ЗОЙТЕН (платежи date < weekStart, issueDate guard) | ✓ VERIFIED | `credit-accrual.ts:55-79` strict `< weekStartMs`, `issueDate >= weekStart+7д → 0`, null → включать, round2; `data.ts:366-374` фильтр ЗОЙТЕН + Decimal→Number; loadSummarySchedule из data.ts удалён (импортов нет) |
| 7 | UI: бейджи базиса (заголовок Направления + подпись KPI), модалка «Кол-во, шт» с базисом | ✓ VERIFIED | `WeeklyFinReportTable.tsx:36-39` UNIVERSE_BASIS, `:179` `${dirLabel} · ${UNIVERSE_BASIS[a.universe]}`, `:302-304` подпись «база: бытовая — заказы, одежда — выкупы»; `WeeklyFinArticleDialog.tsx:62-65,110-111,146` basisLabel + «Кол-во, шт: N (выкупы\|заказы)» |

**Score:** 7/7 truths verified

**Ф5 (mid-task, вне must_haves плана):** полная иерархия таблицы — ✓ VERIFIED. `data.ts:415-417` pre-sort `compareProductsByHierarchy` + tiebreak nmId; meta с directionName/categoryName/subcategoryName/productId (`data.ts:498-505`); `WeeklyFinReportTable.tsx:136-239` buildRows с 4 уровнями group-заголовков, пропуском null-уровней (category/subcategory), подытогами per Направление (flushDirection) + грандтотал из rollup движка; `rowIndent` pl-5/7/9/11; кликабельные article-строки → модалка (`:429-445`); хуки useState объявлены выше early-return (`:340-343`); sticky-ячейки — сплошной bg-muted/bg-background без /NN alpha (`:419-420`, hover:bg-muted/20 только на non-sticky tr, sticky td перекрыт solidBg — соответствует CLAUDE.md паттерну).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `prisma/migrations/20260710_wb_commission_snapshot/migration.sql` | CREATE TABLE + backfill INSERT от 2026-06-01, contains gen_random_uuid | ✓ VERIFIED | 22 строки: CREATE TABLE + unique(validFrom,nmId) + index(nmId,validFrom) + INSERT...SELECT gen_random_uuid()::text, DATE '2026-06-01'. Имя папки соответствует паттерну проекта (20260707_wb_box_tariff и соседи) |
| `lib/wb-commission-history.ts` | exports snapshotCommissionChanges, loadCommissionsForDate | ✓ VERIFIED | 139 строк; DISTINCT ON запросы, null-safe сравнение 4 полей, upsert по (validFrom, nmId), validFrom = МСК-сегодня UTC-полночь; JSDoc с SQL-корректировкой validFrom |
| `lib/finance-weekly/attribution.ts` | attributeSpendByShares — pure, zero-guard | ✓ VERIFIED | 47 строк, ноль импортов, guard totalShares<=0 \|\| updTotal===0 → все 0; float без округления |
| `lib/finance-weekly/credit-accrual.ts` | weeklyAccruedInterest — pure, остаток×ставка×7/365 | ✓ VERIFIED | 79 строк; strict date < weekStart; balance<=0 → skip; issueDate guard; round2 из loan-math (pure) |
| `tests/finance-weekly-attribution.test.ts` | пропорция + zero-guard + инвариант суммы | ✓ VERIFIED | 5 тестов: пропорция 750/250, инвариант Σ (полный и частичный знаменатель), zero-guard, updTotal=0, unlinked-доля |
| `tests/finance-weekly-credit-accrual.test.ts` | баланс weekStart, погашенные, формула 7/365 | ✓ VERIFIED | 6 тестов: 5369.86 golden, строго date < weekStart (в день/будущее — нет), погашен/переплата → 0, Σ кредитов, interest игнорируется, issueDate guard (4 подкейса) |
| Модель `WbCommissionSnapshot` в schema.prisma | validFrom @db.Date, 4 Float?, @@unique, @@index | ✓ VERIFIED | schema.prisma:419-431, полное соответствие плану; tsc exit 0 подтверждает prisma generate выполнен (compound key validFrom_nmId компилируется) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| data.ts | prisma.wbSalesDaily | groupBy _sum buyoutsCount/buyoutsRub | ✓ WIRED | data.ts:289-293, результат используется в основном цикле (salesByNmId → clothing basis) |
| data.ts | wb-commission-history | loadCommissionsForDate(weekEnd) + fallback WbCard | ✓ WIRED | import :43, вызов :301, потребление :425-435 |
| data.ts | prisma.wbAdvertSpendRow | aggregate _sum updSum → attributeSpendByShares | ✓ WIRED | :303-306 (полуоткрытый интервал effectiveDate), :358-362 (Number(Decimal)), adByNmId → adSpendTotal :437 |
| data.ts | credit-accrual | weeklyAccruedInterest по ЗОЙТЕН | ✓ WIRED | import :45, loans query :313-322, фильтр+маппинг :366-374, → creditInterest pool :524 |
| app/api/wb-sync/route.ts | wb-commission-history | snapshotCommissionChanges в try/catch | ✓ WIRED | import :24, вызов :654-660 перед финальным return, ошибка → errors[], не роняет синк |
| app/api/wb-commission-iu/route.ts | wb-commission-history | snapshotCommissionChanges в try/catch | ✓ WIRED | import :7, вызов :86-91 после $transaction, перед return |
| plan-fact.ts | prisma.salesPlanVersionDay | _sum planBuyoutsRub + planOrdersRub | ✓ WIRED | :166-174 оба groupBy, planForProduct :237-243 выбирает базис per товар |
| page.tsx | plan-fact.ts | universeByNmId 5-м аргументом | ✓ WIRED | page.tsx:74-84 Map из data.articles → loadWeeklyPlanFact |
| WeeklyFinReportTable | WeeklyFinArticleDialog | клик article-строки → модалка | ✓ WIRED | :429-445 setSelectedNmId+setOpen, :570-575 рендер с article/meta |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| WeeklyFinReportTable | articles/rollup/waterfall/meta/planFact | page.tsx RSC → loadWeeklyFinReportInputs + computeWeeklyFinReport + loadWeeklyPlanFact | Prisma-запросы к WbSalesDaily/WbCardFunnelDaily/WbAdvertSpendRow/Loan/SalesPlanVersionDay | ✓ FLOWING |
| WeeklyFinArticleDialog | article/meta | props из таблицы (selectedNmId → find) | реальный ArticleResult движка | ✓ FLOWING |
| creditInterest pool | zoitenWeekInterest | prisma.loan.findMany → weeklyAccruedInterest | реальный Loan/LoanPayment (Decimal→Number) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Типы компилируются (включая новый Prisma client) | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Гейт-набор тестов (5 файлов) | `npx vitest run tests/finance-weekly-engine... (5 файлов)` | 5 passed, **83/83 tests** | ✓ PASS |
| engine.ts неприкосновенен | `git diff origin/main -- lib/finance-weekly/engine.ts` | 0 строк diff | ✓ PASS |
| distributePlanAcrossNmIds не изменена | код :42-69 идентичен locked-контракту, её тесты в plan-fact.test.ts зелёные | passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| W2D-FIX1-CLOTHING-BUYOUTS | 260710-hkj-PLAN | Базис одежды = gross выкупы (данные + план-факт + UI) | ✓ SATISFIED | Truths 1, 2, 7 |
| W2D-FIX2-COMMISSION-HISTORY | 260710-hkj-PLAN | История комиссий + backfill + хуки | ✓ SATISFIED | Truths 3, 4 |
| W2D-FIX3-UPD-ADS | 260710-hkj-PLAN | Реклама = updSum × fullstats-доли | ✓ SATISFIED | Truth 5 |
| W2D-FIX4-CREDIT-ACCRUAL | 260710-hkj-PLAN | Кредитный пул = accrual | ✓ SATISFIED | Truth 6 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| lib/finance-weekly/data.ts | 440 | `TODO(W1): заменить modeled N_std на фактический delivery_rub` | ℹ️ Info | Задокументированный будущий scope W1 (существовал до этой задачи), не stub |

Сканирование новых/изменённых файлов: заглушек, placeholder-возвратов, пустых обработчиков не обнаружено. Комментарии-«красные флаги» отсутствуют.

### Human Verification Required

Нет блокирующих пунктов. Опционально при UAT (визуальное качество, не корректность):

1. **Иерархия таблицы /finance/weekly**
   **Test:** открыть /finance/weekly, проверить заголовки Направление (с бейджем «· по заказам»/«· по выкупам») → Бренд → Категория → Подкатегория → Артикул, подытоги «Итого — {Направление}», грандтотал.
   **Expected:** уровни с отступами pl-5/7/9/11, пустые уровни без заголовка, sticky-колонка не просвечивает при scroll.
   **Why human:** визуальная вёрстка sticky/отступов не проверяется grep-ом.
2. **Числа после деплоя** — реклама недели ≈ 820 853 ₽ (vs 578 950 fullstats), кредитный пул ≈ 299 091 ₽ (разрыв ~24% с Excel U331 — сверка реестра, задокументировано), одежда = gross выкупы как Excel F=37. Требует прод-данных (миграция применяется deploy.sh).

### Gaps Summary

Гэпов нет. Все 7 must-have truths, 7 артефактов и 9 ключевых связей верифицированы против кода. Автогейты: tsc exit 0, 83/83 тестов зелёные, engine.ts diff против origin/main пуст, все коммиты (47f4e75, 99b0398, a0f2d0d, a6e4b20, fbcafa1) запушены в origin/main. Mid-task дополнение Ф5 (полная иерархия) реализовано и следует каноническим паттернам проекта (compareProductsByHierarchy, sticky solid bg, hooks-above-early-return).

---

_Verified: 2026-07-10T13:50:00Z_
_Verifier: Claude (gsd-verifier)_
