---
phase: 24-finance-balance
plan: 09
subsystem: finance
tags: [wb-api, csv, bootstrap, snapshot, script]

requires:
  - phase: 24-finance-balance/24-06
    provides: "lib/finance-snapshot.ts: computeStockSnapshotRows (pure) + FinanceStockSnapshot idempotency pattern"
  - phase: 24-finance-balance/24-01
    provides: "FinanceStockSnapshot Prisma model"
provides:
  - "scripts/bootstrap-balance-snapshot.ts: однократный bootstrap снапшота на произвольную дату (--date), режимы --mode=csv|fallback"
affects: [24-finance-balance-deploy-checkpoint]

tech-stack:
  added: []
  patterns:
    - "STOCK_HISTORY_DAILY_CSV через тот же downloads create->poll->ZIP механизм, что lib/wb-api.ts:fetchBuyoutPercent, но с header-name-based column resolution (не фиксированные позиции) — устойчивее к неподтверждённому формату ответа"
    - "process.exit(2) как явный сигнал 'endpoint не подтверждён/пуст, переключитесь на --mode=fallback' (отличный от exit(1)=обычная ошибка)"

key-files:
  created:
    - scripts/bootstrap-balance-snapshot.ts
  modified: []

key-decisions:
  - "Daily-cap Analytics counter (AppSetting wbAnalyticsDailyCounter) продублирован локально в скрипте, а не экспортирован из lib/wb-api.ts — избегает правки общего модуля вне scope плана; ключ/лимит идентичны, счётчик физически общий"
  - "CSV column resolution по имени заголовка (case-insensitive contains), а не по фиксированной позиции — endpoint STOCK_HISTORY_DAILY_CSV официально не подтверждён (24-RESEARCH.md), фиксированные индексы были бы хрупкими"
  - "Cooldown bucket 'analytics' переиспользован для STOCK_HISTORY_DAILY_CSV create-запроса (getWbCooldownSecondsRemaining/setWbCooldownUntil) — тот же bucket, что seller-analytics-api.wildberries.ru resolveBucketFromUrl уже резолвит"

requirements-completed: [FIN-BAL-15]

duration: ~12min
completed: 2026-07-03
---

# Phase 24 Plan 09: Bootstrap-скрипт снапшота баланса на 01.07 Summary

**`scripts/bootstrap-balance-snapshot.ts` — standalone tsx-скрипт с CLI `[--date=2026-07-01] [--mode=csv|fallback]`: в режиме csv точно снимает WB-остатки на дату через отчёт STOCK_HISTORY_DAILY_CSV (тот же downloads-механизм, что fetchBuyoutPercent), в режиме fallback берёт текущие остатки как приближение; Иваново/себестоимость/«в пути» — всегда текущие значения с warning; идемпотентно (deleteMany+createMany в транзакции); FinanceReceivablesSnapshot на дату bootstrap НЕ создаётся.**

## Scope Note

⚠ Выполнена ТОЛЬКО Task 1 (code-задача) плана 24-09. Task 2 (checkpoint: деплой + Wave 0 CSV-проверка + реальный запуск bootstrap на VPS + UAT) **НЕ выполнялась** — по прямому указанию: пользователь запретил деплой Phase 24 до окончания параллельной разработки, токена WB_FINANCE_TOKEN нет, прод-БД/WB API не трогались. Живой прогон скрипта (ни csv, ни fallback режим) не выполнялся — только статическая проверка (tsc + grep) в изолированном git worktree без БД.

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-03T16:21:28+03:00
- **Tasks:** 1/1 code-задача завершена (Task 2 checkpoint отложен целиком)
- **Files modified:** 1 created (scripts/bootstrap-balance-snapshot.ts, 370 строк)

## Accomplishments

- `parseCliArgs(argv)` — pure, парсит `--date=`/`--mode=` (default `2026-07-01`/`csv`), неизвестный `--mode` игнорируется
- `parseStockHistoryCsv(csvText)` — pure, резолвит колонки nmId/qty по имени заголовка (case-insensitive contains: `nmid`/`nm_id`/`nomenclature`, `qty`/`quantity`/`stock`/`остаток`/`balance`), суммирует qty по nmId; пустой Map при нераспознанных заголовках
- `fetchStockHistoryDailyCsv(date)` — create job (`reportType: "STOCK_HISTORY_DAILY_CSV"`, `params: {startDate, endDate}` = один день) → poll (10×3с) → download ZIP → line-based поиск CSV-заголовка (`/nm[_]?id/i`) → parse; cooldown bucket `'analytics'` + daily-cap 3/день; на 400/404/429/пустом отчёте бросает Error с понятным сообщением
- `main()`: режим csv — `WB_WAREHOUSE` qty из CSV per nmId, `inWayToClient`/`inWayFromClient` — текущие `WbCard`; режим fallback — все три поля текущие (как `runFinanceSnapshot`); Иваново и `costPriceAtDate` — всегда текущие в обоих режимах (истории нет); переиспользует `computeStockSnapshotRows` из `lib/finance-snapshot.ts` без изменений
- Идемпотентность: `$transaction([deleteMany({date}), createMany(...)])`
- CSV-режим при неудаче → `console.error` + `process.exit(2)` (отличный код от обычной ошибки `exit(1)`) — явный сигнал оператору переключиться на `--mode=fallback`
- `FinanceReceivablesSnapshot` НЕ создаётся ни в одном режиме (комментарий в коде + warning в summary-выводе) — Balance API отдаёт только «сейчас» (D-14)

## Task Commits

1. **Task 1: bootstrap-balance-snapshot.ts (CSV + fallback режимы)** — `d9fa432` (feat)

**Plan metadata:** не пушится (правило worktree) — эта SUMMARY создана вручную, без `gsd-tools`, без `git push`.

## Files Created/Modified

- `scripts/bootstrap-balance-snapshot.ts` — bootstrap-скрипт (создан)

## Verification Performed

- `npx tsc --noEmit` → exit code 0, никаких ошибок во всём проекте (включая новый файл)
- `npm run test` (точечно `finance-snapshot.test.ts` + `wb-cooldown.test.ts`, зависимости нового скрипта) → 36/36 passed, регрессий нет
- Grep acceptance criteria (все прошли):
  - `STOCK_HISTORY_DAILY_CSV` — найдено (5 вхождений)
  - `--mode` — найдено (оба значения csv/fallback задокументированы и обработаны)
  - `wbAnalyticsDailyCounter` — найдено (общий ключ AppSetting с lib/wb-api.ts)
  - `financeReceivablesSnapshot` — найдено ТОЛЬКО в комментариях (не вызывается) — соответствует критерию «не находит создание, либо явный комментарий»
  - `deleteMany` — найдено (идемпотентность)
- Живой прогон против прод-БД/WB API — **НЕ выполнялся** (нет DATABASE_URL/WB-токена в изолированном worktree, прод запрещён по инструкции)
- Unit-тест для `parseStockHistoryCsv`/`parseCliArgs` **не написан** — намеренно: модуль исполняет `main()` на верхнем уровне при импорте (как и все существующие `scripts/*.ts` в проекте — нет прецедента `scripts/*.test.ts`), импорт файла в тестовом раннере запустил бы `main()` без БД. Логика этих pure-функций проверена вручную по коду + tsc; риск признан приемлемым для однократного bootstrap-скрипта, консистентно с существующими `scripts/recompute-production.ts`/`scripts/import-cash-budget.ts` (тоже без тестов).

## Decisions Made

- Daily-cap Analytics counter продублирован локально (не экспортирован из `lib/wb-api.ts`) — см. key-decisions выше
- CSV column resolution по имени заголовка, а не позиции — endpoint не подтверждён официально
- Cooldown bucket `'analytics'` переиспользован для CSV create-запроса (уже существовал в `lib/wb-cooldown.ts`, резолвится по host `seller-analytics-api.wildberries.ru`)

## Deviations from Plan

None критичных — код соответствует плану 1:1 по структуре (CLI, оба режима, daily-cap, идемпотентность, отсутствие FinanceReceivablesSnapshot на bootstrap-дату). Единственное уточнение: план предполагал возможный unit-тест — решено не писать по причине, изложенной в Verification Performed (не блокирует acceptance criteria плана, которые сформулированы через tsc+grep).

**Auto-fixed:** нет (новый файл, Rules 1-3 неприменимы).

## Issues Encountered

None. `npx tsc --noEmit` — чисто с первого прогона.

## User Setup Required (ОТЛОЖЕНО — Task 2 checkpoint плана)

Task 2 плана 24-09 (checkpoint:human-verify, gate=blocking) **полностью отложен** до явной команды пользователя «можно» (снятие запрета на коммит/деплой Phase 24). Когда разрешение получено, потребуется (в этом порядке, по 24-09-PLAN.md):

1. `git fetch origin && git status -sb` (проверка divergence) → коммит фазы → `git push origin main`
2. Деплой ТОЛЬКО через nohup (`df -h /` ≥5GB → `nohup bash deploy.sh` → лог до `==> Done` → `curl https://zoiten.pro` = 200); `deploy.sh` применит миграцию `20260702_phase24_finance`
3. Настройка `WB_FINANCE_TOKEN` (scope «Финансы», бит 13) через `/admin/settings` или `/etc/zoiten.pro.env` + restart
4. Smoke-curl `finance-api.wildberries.ru/api/v1/account/balance` с VPS
5. **Wave 0**: реальный прогон `bootstrap-balance-snapshot.ts --mode=csv` на VPS — впервые проверит, отвечает ли ENDPOINT STOCK_HISTORY_DAILY_CSV вообще (400/404 → `--mode=fallback`)
6. Прогон bootstrap на `--date=2026-07-01` + текущий cron-снапшот вручную
7. RBAC: выдать `UserSectionRole(FINANCE)` нужным пользователям
8. UAT-чеклист (9 пунктов) из `24-09-PLAN.md` — пользователь проверяет вручную

## Next Phase Readiness

Скрипт готов к прогону на VPS в обоих режимах, но НЕ верифицирован живым вызовом WB (endpoint STOCK_HISTORY_DAILY_CSV — предположение по официальной документации, не протестировано). Phase 24 фактически завершена кодом (24-01…24-09 Task 1); формальное закрытие фазы (STATE.md/ROADMAP.md чекбоксы) — после «approved» по Task 2 checkpoint, согласно `24-09-PLAN.md` `<output>`.

---
*Phase: 24-finance-balance*
*Completed: 2026-07-03*
