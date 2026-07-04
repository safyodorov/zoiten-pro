---
phase: 25-v2-h2-2026
plan: 09
subsystem: sales-plan
tags: [pdds-feed, cleanup, tdd, pure-core, virtual-purchases, nav-deprecation]
dependency_graph:
  requires: [25-08]
  provides: [lib/sales-plan/pdds-feed.ts, зачищенная кодовая база]
  affects: [/finance/cashflow (будущая фаза ПДДС), /sales-plan, /procurement, nav-items]
tech_stack:
  added: []
  patterns:
    - pure-ядро / loader-обёртка разделение (buildVirtualPurchasePayments pure, getPlannedVirtualPayments Prisma-coupled)
    - live-сверка статусов VP: CONVERTED/DISMISSED исключаются из плановых оттоков (анти-двойной счёт)
    - forward-fill курса CNY/USD→₽ через getRateForDate (balance-data.ts)
    - wb-funnel-backfill без MAX_DAYS лимита: chunked произвольный from/to диапазон
key_files:
  created:
    - lib/sales-plan/pdds-feed.ts
  modified:
    - app/actions/sales-plan.ts
    - app/api/wb-funnel-backfill/route.ts
    - components/layout/nav-items.ts
    - components/sales-plan/ProductPlanTable.tsx
    - CLAUDE.md
  deleted:
    - components/sales-plan/SalesForecastTable.tsx
    - components/sales-plan/SalesForecastSummary.tsx
    - components/sales-plan/SalesForecastDailyChart.tsx
    - components/sales-plan/SalesForecastEndDate.tsx
    - components/sales-plan/ProductForecastDialog.tsx
decisions:
  - pdds-feed.ts разделён pure-ядро (buildVirtualPurchasePayments, без Prisma) + loader-обёртки (getPlannedRevenueSeries, getPlannedVirtualPayments) — паттерн pricing-math.ts
  - live-сверка статусов VP: id не найден live (авто-SUGGESTED регенерирован) → считать по snapshot-данным; SUGGESTED/ACCEPTED → считать; CONVERTED/DISMISSED → исключить
  - Старые AppSetting-ключи (baselineOverrides/priceOverrides/leadTimes) НЕ удаляются автоматически — SQL-очистка вручную на проде ПОСЛЕ UAT (возможность отката)
  - /procurement/plan и /purchase-plan убраны из sidebar (nav-items), но роуты остаются доступными по прямым ссылкам
  - backfill route: from/to явные даты (первичный режим) + legacy days= параметр; чанки <=31д (каждый чанк = 1 Analytics cap из 3/день)
metrics:
  duration: ~20 минут
  completed: "2026-07-04"
  tasks: 2 (из 3 — Task 3 отложен пользователю)
  files: 12 (1 создан, 5 изменено, 5 удалено, 1 обновлён CLAUDE.md)
---

# Phase 25 Plan 09: Этап 6 — pdds-feed.ts + зачистка легаси Summary

Реализован контракт `lib/sales-plan/pdds-feed.ts` для будущей фазы ПДДС (притоки+оттоки плана продаж), вычищен весь легаси-код эпохи Phase 7 forecasting (SalesForecast*/ProductForecastDialog), деприкейтнуты временные nav-пункты, патч backfill без лимита MAX_DAYS.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | pdds-feed.ts (стаб → GREEN) | bef9a0a | lib/sales-plan/pdds-feed.ts (создан) |
| 2 | Зачистка + деприкейт nav + backfill-патч | d1d5781 | 8 файлов (5 удалено, 3 изменено + ProductPlanTable.tsx) |

## Task 3: Checkpoint (ОТЛОЖЕН ПОЛЬЗОВАТЕЛЮ)

Task 3 (деплой + UAT) является `type="checkpoint:human-verify"` — кодовый агент не имеет прод-доступа и не может выполнить SSH-деплой или прод-UAT.

**Пользователю выполнить:**
1. `git push origin main`
2. `ssh root@85.198.97.89 "cd /opt/zoiten-pro && nohup bash deploy.sh > /var/log/zoiten-deploy.log 2>&1 &"` → следить до `==> Done`
3. `curl https://zoiten.pro` → 200
4. Обновить CLAUDE.md (секция про план продаж добавлена в этом коммите — уже готова)
5. Прод-задачи: миграция `20260705_sales_plan_v2` (если ещё не применена), `npx tsx scripts/bootstrap-sales-plan-monthly.ts` на VPS
6. End-to-end UAT (Сводный → три ряда, Товары → модалка, Пора заказывать → конвертация, Версии → фиксация)
7. SQL-очистка старых ключей (после UAT, если новый UI работает):
   ```sql
   DELETE FROM "AppSetting" WHERE key IN ('salesPlan.baselineOverrides','salesPlan.priceOverrides','salesPlan.leadTimes');
   ```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Cleanup] Комментарий-ссылка на удалённый компонент в ProductPlanTable.tsx**
- **Found during:** Task 2 (верификация orphan-references)
- **Issue:** `grep -rc "SalesForecastTable"` нашёл строку в комментарии `// ── Форматирование чисел (паттерн SalesForecastTable)` — ложная ссылка на удалённый компонент
- **Fix:** Комментарий заменён на нейтральный `// ── Форматирование чисел ──`
- **Files modified:** components/sales-plan/ProductPlanTable.tsx
- **Commit:** d1d5781

**2. [Rule 2 - Cleanup] LEAD_TIMES_KEY константа удалена — fallback в getLeadTimeDays инлайнен**
- **Found during:** Task 2 (удаление констант BASELINE_KEY/PRICE_KEY/LEAD_TIMES_KEY)
- **Issue:** LEAD_TIMES_KEY используется в `getLeadTimeDays` как legacy-fallback — нельзя удалить все три константы бездумно
- **Fix:** LEAD_TIMES_KEY инлайнен строкой `"salesPlan.leadTimes"` прямо в getLeadTimeDays с комментарием `(legacy, оставлен для совместимости)`
- **Files modified:** app/actions/sales-plan.ts

## Known Stubs

Нет — все компоненты плана продаж используют реальные данные из БД.

## Threat Flags

Нет новых угроз в этом плане. T-25-08 (анти-двойной счёт CONVERTED) закрыт: `getPlannedVirtualPayments` исключает CONVERTED/DISMISSED VP из оттоков. T-25-09 (старые AppSetting ключи) принят: очистка вручную после UAT. T-25-10 (backfill без лимита) закрыт: чанки <=31д.

## SQL для прод-очистки (вручную после UAT)

```sql
-- Удалить устаревшие AppSetting-ключи ТОЛЬКО ПОСЛЕ подтверждения, что новый UI план продаж работает
DELETE FROM "AppSetting" WHERE key IN (
  'salesPlan.baselineOverrides',
  'salesPlan.priceOverrides',
  'salesPlan.leadTimes'
);
```

## Self-Check: PASSED

- lib/sales-plan/pdds-feed.ts: FOUND (346 строк)
- tests/sales-plan-pdds-feed.test.ts: 13/13 PASSED (GREEN)
- npx tsc --noEmit: 0 ошибок
- SalesForecastTable.tsx: DELETED
- ProductForecastDialog.tsx: DELETED
- saveBaselineOverrides: REMOVED (0 совпадений)
- MAX_DAYS: REMOVED (0 совпадений)
- CLAUDE.md: обновлён (добавлена секция «План продаж v2 — Phase 25»)
- Коммиты: bef9a0a (feat), d1d5781 (chore)
