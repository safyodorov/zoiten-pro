---
phase: quick-260710-hkj
plan: 01
subsystem: finance
tags: [finance-weekly, wb-commissions, wb-advert, credit-accrual, prisma, vitest]

# Dependency graph
requires:
  - phase: quick-260710-evz (W2a)
    provides: /finance/weekly движок + data.ts загрузчик
  - phase: quick-260710-gem (W2c)
    provides: план-факт loader (plan-fact.ts) + KPI-блок таблицы
  - phase: 19-wb-advert
    provides: WbAdvertSpendRow (/adv/v1/upd) + WbAdvertStatDaily (fullstats)
  - phase: 21-credits
    provides: Loan/LoanPayment + lib/loan-math (round2)
provides:
  - WbCommissionSnapshot — история комиссий per nmId (validFrom, backfill 2026-06-01)
  - lib/wb-commission-history.ts — snapshotCommissionChanges() + loadCommissionsForDate()
  - lib/finance-weekly/attribution.ts — attributeSpendByShares (pure, upd × fullstats-доли)
  - lib/finance-weekly/credit-accrual.ts — weeklyAccruedInterest (pure, остаток×ставка×7/365, issueDate guard)
  - Базис clothing = gross выкупы (WbSalesDaily) в данных, план-факте и UI
  - Таблица /finance/weekly — полная иерархия Направление→Бренд→Категория→Подкатегория→Артикул
affects: [finance-weekly, W3-bank-classifier, wb-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "История ставок через snapshot-таблицу (validFrom <= asOf, DISTINCT ON) вместо ретроактивного пересчёта"
    - "Тотал из ground-truth источника × доли из детального (upd × fullstats-shares)"
    - "Группировка таблицы проходом по pre-sorted articles (compareProductsByHierarchy в data.ts)"

key-files:
  created:
    - prisma/migrations/20260710_wb_commission_snapshot/migration.sql
    - lib/wb-commission-history.ts
    - lib/finance-weekly/attribution.ts
    - lib/finance-weekly/credit-accrual.ts
    - tests/finance-weekly-attribution.test.ts
    - tests/finance-weekly-credit-accrual.test.ts
  modified:
    - prisma/schema.prisma
    - app/api/wb-sync/route.ts
    - app/api/wb-commission-iu/route.ts
    - lib/finance-weekly/data.ts
    - lib/finance-weekly/plan-fact.ts
    - lib/finance-weekly/types.ts
    - app/(dashboard)/finance/weekly/page.tsx
    - components/finance/WeeklyFinReportTable.tsx
    - components/finance/WeeklyFinArticleDialog.tsx

key-decisions:
  - "Базис clothing = GROSS выкупы (без вычета returns) — сверка подтвердила Excel F=37 = gross buyouts точно"
  - "Комиссии недели = последний WbCommissionSnapshot с validFrom <= weekEnd, fallback на текущие WbCard-поля"
  - "Реклама = Σ updSum (/adv/v1/upd, ground truth) × fullstats-доли; знаменатель по ВСЕМ nmId недели"
  - "Кредитный пул = accrual остаток×ставка×7/365 по ЗОЙТЕН (не платежи по дате); issueDate guard против фантомного начисления в прошлых неделях"
  - "Группировка таблицы = полная иерархия товаров проекта (замена Вселенная→Бренд по решению пользователя mid-task); подытоги per Направление + грандтотал"

patterns-established:
  - "Snapshot-история ставок: upsert по (validFrom, nmId) при отличии от последнего снапшота"
  - "weeklyAccruedInterest: строго date < weekStart для платежей; issueDate >= weekStart+7д → вклад 0"

requirements-completed: [W2D-FIX1-CLOTHING-BUYOUTS, W2D-FIX2-COMMISSION-HISTORY, W2D-FIX3-UPD-ADS, W2D-FIX4-CREDIT-ACCRUAL]

# Metrics
duration: ~95min (3 обрыва API-сессии)
completed: 2026-07-10
---

# Quick 260710-hkj: W2d — четыре фикса /finance/weekly Summary

**Базис одежды переведён на gross выкупы, комиссии недель зафиксированы историей WbCommissionSnapshot, реклама пересчитана на ground-truth /adv/v1/upd (~820 853 ₽ vs 578 950 ₽ fullstats), кредитный пул стал accrual-начислением остаток×ставка×7/365; таблица перегруппирована в полную иерархию товаров с бейджами базиса.**

## Performance

- **Duration:** ~95 мин (включая 3 восстановления после обрывов API)
- **Started:** 2026-07-10T10:00:42Z
- **Completed:** 2026-07-10T13:37:00Z
- **Tasks:** 3/3 (Task 2 — TDD RED→GREEN)
- **Files modified:** 15

## Accomplishments

1. **Фикс 2 — история комиссий** (Task 1): модель + hand-written миграция WbCommissionSnapshot с backfill текущих ставок от 2026-06-01 (ночной синк 02:30 ещё держал старые ставки — успели сохранить до перезаписи). `snapshotCommissionChanges()` хукнут в конец /api/wb-sync и /api/wb-commission-iu (try/catch, не валит синк). `loadCommissionsForDate(weekEnd)` — прошлые недели больше не пересчитываются задним числом.
2. **Фикс 1 — базис одежды = выкупы** (Task 2): clothing-строки строятся из WbSalesDaily (Σ buyoutsCount / buyoutsRub gross за неделю), appliances — по заказам funnel как раньше. План-факт: clothing = planBuyoutsRub / buyoutsRub (неделя + МТД), appliances = planOrdersRub / ordersSumRub. Universe плановых товаров — отдельным запросом по hasSizes.
3. **Фикс 3 — реклама через upd** (Task 2): `attributeSpendByShares(updTotal, fullstatsShares, totalFullstats)` — тотал недели из WbAdvertSpendRow.updSum (полуоткрытый интервал по effectiveDate), доли из WbAdvertStatDaily, знаменатель по всем nmId недели.
4. **Фикс 4 — кредит = начисление** (Task 2): `weeklyAccruedInterest` — остаток тела на weekStart (строго date < weekStart) × ставка/100 × 7/365 по кредитам ЗОЙТЕН; loadSummarySchedule из data.ts удалён. Guard: issueDate >= weekStart+7д → вклад 0 (плюс тест) — недели до выдачи кредита не получают фантомное начисление.
5. **UI** (Task 3): таблица перегруппирована в полную иерархию Направление → Бренд → Категория → Подкатегория → Артикул (articles pre-sorted через compareProductsByHierarchy в data.ts); подытоги per Направление + грандтотал; бейдж базиса на заголовке Направления («· по заказам» / «· по выкупам»); KPI-подпись «база: бытовая — заказы, одежда — выкупы»; модалка — «Кол-во, шт: N (выкупы|заказы)».
6. **Тесты**: 11 новых unit-тестов (attribution 5 + credit-accrual 6), все 83 теста гейт-набора зелёные; engine.ts и distributePlanAcrossNmIds не тронуты (git-diff гейт пуст).

## Deviations from Plan

### Auto-fixed / plan-checker fixes (применены по требованию оркестратора)

**1. [Plan-checker WARNING] issueDate guard в weeklyAccruedInterest**
- **Found during:** Task 2 (до реализации)
- **Issue:** без учёта Loan.issueDate недели ДО выдачи кредита получали бы фантомное начисление при листании в прошлое
- **Fix:** поле `issueDate?: Date | string | null` в AccrualLoanInput; `issueDate != null && issueDate >= weekStart+7д (эксклюзивный weekEnd)` → вклад 0; null → включать (задокументировано); +1 тест-кейс; `issueDate: true` в select
- **Files:** lib/finance-weekly/credit-accrual.ts, lib/finance-weekly/data.ts, tests/finance-weekly-credit-accrual.test.ts
- **Commit:** a0f2d0d

**2. [Пользователь, mid-task] Группировка таблицы — полная иерархия товаров**
- **Found during:** Task 3 (новое требование пользователя через оркестратора)
- **Change:** вместо плановой «Вселенная → Бренд → Артикул» — Направление → Бренд → Категория → Подкатегория → Артикул (канонический паттерн compareProductsByHierarchy); подытоги per Направление заменили per-universe; бейдж базиса переехал на заголовок Направления
- **Files:** lib/finance-weekly/data.ts (meta + сортировка), components/finance/WeeklyFinReportTable.tsx
- **Commit:** a6e4b20

## Known Limitations (примечания для пользователя)

1. **SQL-корректировка validFrom после роста ставок.** Будущий синк создаст снапшоты с validFrom = дата синка (> 05.07). Чтобы неделя 07.07–13.07 считалась по новым ставкам с даты реального роста:
   ```sql
   UPDATE "WbCommissionSnapshot" SET "validFrom" = DATE '2026-07-07'
   WHERE "validFrom" = DATE '<дата синка>';
   ```
2. **Разрыв кредита с Excel ~24%** (U331 = 393 624 ₽ vs accrual ≈ 299 091 ₽) — предмет сверки реестра кредитов с экономистом, НЕ баг формулы (решение пользователя 2026-07-10).
3. **Нераспределённая доля updTotal.** Доля updTotal у nmId с qty=0 в отчёте (есть fullstats-share, но нет строки) и у непривязанных nmId теряется из водопада — известное v1-ограничение (Σ рекламы по строкам < updTotal недели).
4. **Окно updSum — UTC vs MSK.** Границы окна updSum — UTC-timestamps, числители долей и продажи — MSK-дни (@db.Date) → ~3ч дрейфа на границах недели. Приемлемо, задокументировано в data.ts.
5. **WbSalesDaily settled ~2 дня** — по одежде текущая незавершённая неделя частичная (ожидаемо, как и заказы).

## Commits

| Commit | Type | Description |
| ------ | ---- | ----------- |
| 47f4e75 | feat | Task 1 — WbCommissionSnapshot + backfill + хуки sync |
| 99b0398 | test | Task 2 RED — failing tests attribution + credit-accrual |
| a0f2d0d | feat | Task 2 GREEN — 4 фикса данных + pure-модули + план-факт + иерархия meta |
| a6e4b20 | feat | Task 3 — иерархия таблицы + бейджи базиса + модалка «Кол-во, шт» |

## Verification

- `npx prisma generate` — OK (после правки схемы)
- `npx tsc --noEmit` — чисто на каждом коммите
- `npx vitest run` (engine + plan-fact + pricing-math + attribution + credit-accrual) — 83/83 GREEN
- `git diff --quiet HEAD -- lib/finance-weekly/engine.ts` — движок байт-в-байт не изменён
- Grep key links: wbSalesDaily.groupBy / loadCommissionsForDate / weeklyAccruedInterest / attributeSpendByShares в data.ts (7 вхождений); snapshotCommissionChanges в обоих routes (2+2); planBuyoutsRub в plan-fact.ts (7)
- Миграция применится на проде через deploy.sh (`prisma migrate deploy`) — деплой делает оркестратор

## Self-Check: PASSED

Все 7 созданных файлов на месте; все 4 коммита (47f4e75, 99b0398, a0f2d0d, a6e4b20) в истории.
