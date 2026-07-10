---
phase: quick-260710-jgs
verified: 2026-07-10T11:50:00Z
status: passed
score: 7/7 must-haves verified
---

# Quick 260710-jgs: W1 — импорт отчёта реализации WB → ИУ-факт в /finance/weekly — Verification Report

**Goal:** Модель WbRealizationWeekly + клиент Finance API sales-reports с pure-классификатором + MANAGE sync-route/кнопка/крон + wiring ИУ-факта (отзывы, возвратная логистика, пулы storage/acceptance) в /finance/weekly. Live-вызовы WB API и деплой — явно вне скоупа (оркестратор).
**Verified:** 2026-07-10
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Модель WbRealizationWeekly существует, миграция hand-written, prisma generate чист | ✓ VERIFIED | `prisma/schema.prisma:1220-1238` (@@unique([weekStart,nmId]), nmId=0 account-level, 8 бакетов Float, reportIds String[]); `prisma/migrations/20260710_wb_realization_weekly/migration.sql` (CREATE TABLE + UNIQUE INDEX weekStart+nmId + INDEX weekStart); `npx prisma generate` exit 0 |
| 2 | MANAGE FINANCE может кнопкой «Реализация WB» импортировать отчёт недели (clean-replace) | ✓ VERIFIED | Кнопка за `canManage` (`WeeklyFinReportControls.tsx:176-185`), fetch POST `/api/wb-realization-sync` body `{week}` (:120-124), loading toast + router.refresh; route `requireSection("FINANCE","MANAGE")` → 403, валидация week, normalizeToIsoMonday; clean-replace `$transaction(deleteMany+createMany)` (`lib/wb-realization-sync.ts:166-171`) |
| 3 | Крон вторник 05:50 МСК зарегистрирован в dispatcher, синкает ПРОШЛУЮ ISO-неделю | ✓ VERIFIED | `dispatch/route.ts:42,54` ключи, `:82-83` default "05:50", `:247-263` shouldFireCron + dynamic import + `fired.push(realization:...)`; cron route: x-cron-secret guard, Tuesday-guard `mskDay!==2 → skipped БЕЗ lastRun`, `previousIsoMondayMsk()`, `?week` backfill (обходит guard), lastRun только при успехе |
| 4 | classifyRealizationRow pure, тесты 8 бакетов + unknown→deductionOther зелёные | ✓ VERIFIED | `lib/wb-realization-api.ts:117-170` — pure, порядок: bonus-дискриминаторы (отзывы/продвижение) ПЕРЕД операционными; `tests/wb-realization-classify.test.ts` — 17 тестов: delivery/storage/acceptance/penalty/reviewPoints/promotion/forPay(продажа)/forPay(возврат, знак не инвертируется)/deductionOther + parseMoney + normalize (snake+camel) + accumulate. Все зелёные |
| 5 | При наличии реализации /finance/weekly берёт ИУ-факт; manual — fallback; бейдж источника | ✓ VERIFIED | `data.ts:337` findMany БЕЗ фильтра nmId; `:528-534` reviewWriteoffTotal (свои + account-доля по выручке) и logisticsIuPerUnit=deliveryRub/qty при hasRealization; `:568-614` пулы storage/acceptance из buildRealizationPools замещают manualPools (fallback при false; delivery/overhead* остаются manual); бейдж «из реализации»/«вручную» у 4 пулов (`Controls.tsx:205-216`), инпуты не задизейблены |
| 6 | promotionRub только хранится; std-сценарий не изменён — diff engine.ts пуст | ✓ VERIFIED | promotionRub не используется ни в realization.ts, ни в data.ts (комментарий D-scope, `data.ts:345-348`); `git diff 6741bc3~4..HEAD -- lib/finance-weekly/engine.ts` — пуст, `git diff origin/main -- lib/finance-weekly/engine.ts` — пуст |
| 7 | Ни одного реального вызова WB API из тестов | ✓ VERIFIED | grep tests/: нет `fetch(`, `listSalesReports`, `fetchSalesReportDetailed`, `syncRealizationWeek`, `finance-api.wildberries` — оба новых теста импортируют ТОЛЬКО pure-экспорты |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `prisma/migrations/20260710_wb_realization_weekly/migration.sql` | CREATE TABLE + unique(weekStart,nmId) | ✓ VERIFIED | 29 строк, DATE/DOUBLE PRECISION/TEXT[], оба индекса |
| `lib/wb-realization-api.ts` | list/detailed клиент + pure классификатор, min 120 строк | ✓ VERIFIED | 387 строк; экспортирует listSalesReports, fetchSalesReportDetailed, classifyRealizationRow, parseMoney (+ normalizeRealizationRow, accumulateRealizationRows, emptyRealizationBuckets, FINANCE_REPORTS_SLEEP_MS) |
| `lib/wb-realization-sync.ts` | syncRealizationWeek | ✓ VERIFIED | list → фильтр пересекающих отчётов (0 → понятная ошибка) → detailed (sleep 61s) → classify → accumulate → clean-replace + reconcileWithListAggregates |
| `app/api/wb-realization-sync/route.ts` | POST MANAGE(FINANCE), body {week} | ✓ VERIFIED | runtime nodejs, maxDuration 600, 403/400/429/500 ветки |
| `app/api/cron/wb-realization-weekly/route.ts` | GET cron (secret, Tuesday guard, прошлая неделя) | ✓ VERIFIED | все элементы + ?week backfill перед guard'ом |
| `lib/finance-weekly/realization.ts` | Pure helpers для data.ts | ✓ VERIFIED | 196 строк, ноль Prisma/Next импортов; split/distribute/buildPools/reviewWriteoffFor/logisticsIuPerUnit |
| `tests/wb-realization-classify.test.ts` | 8 бакетов + unknown | ✓ VERIFIED | 17 тестов, только pure-импорты |
| `tests/finance-weekly-realization.test.ts` | account-level распределение, пулы per universe | ✓ VERIFIED | 10 тестов, включая «nmId вне universeByNmId → account-level, не теряется» и «товар без продаж, но с universe → пул своей вселенной» |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| WeeklyFinReportControls.tsx | /api/wb-realization-sync | fetch POST {week: weekStartISO} | ✓ WIRED | :120-124, ответ обрабатывается (toast + refresh) |
| wb-realization-sync/route.ts | lib/wb-realization-sync.ts | syncRealizationWeek | ✓ WIRED | import :11, вызов :56, результат в JSON |
| lib/wb-realization-sync.ts | prisma.wbRealizationWeekly | $transaction deleteMany+createMany | ✓ WIRED | :166-171, count возвращается как written |
| cron/dispatch/route.ts | cron/wb-realization-weekly/route.ts | dynamic import + AppSetting wbRealizationWeeklyCronTime | ✓ WIRED | :256 import, :82 default "05:50", fired-тег |
| lib/finance-weekly/data.ts | wbRealizationWeekly + realization.ts | findMany → split → articles/pools | ✓ WIRED | :337 запрос в Promise.all, :349-351 split, :528-534 articles, :577-614 pools, hasRealization в результате :625 |
| lib/wb-realization-api.ts | lib/wb-cooldown.ts | bucket 'finance-reports' | ✓ WIRED | cooldown-check :250, setWbCooldownUntil :269/:275; bucket в WB_COOLDOWN_BUCKETS (`wb-cooldown.ts:36`) + resolveBucketFromUrl различает sales-reports от balance (:85-88) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| data.ts → page.tsx → Controls | hasRealization, пулы, reviewWriteoffTotal, logisticsIuPerUnit | `prisma.wbRealizationWeekly.findMany({where:{weekStart}})` | Реальный DB-запрос; до первого синка таблица пуста → hasRealization=false → manual fallback (проектное поведение, бейдж «вручную») | ✓ FLOWING |
| Controls → route → sync → DB | written | WB Finance API (live, после деплоя) | Код полный; live-путь вне скоупа задачи по плану | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Схема валидна, клиент сгенерирован | `npx prisma generate` | exit 0 | ✓ PASS |
| Типы чисты | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| 7 тест-файлов finance-weekly/pricing + 2 новых | `npx vitest run …` (7 файлов) | **7 passed, 110 tests passed** | ✓ PASS |
| engine.ts не тронут задачей | `git diff 6741bc3~4..HEAD -- lib/finance-weekly/engine.ts` | пусто | ✓ PASS |
| Коммиты существуют, запушены | `git show 6256b7c 70b4173 0fd0602`; `git status -sb` | все 3 в истории; main == origin/main | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| W1-REALIZATION | 260710-jgs-PLAN.md | Импорт отчёта реализации WB → ИУ-факт /finance/weekly | ✓ SATISFIED | Все 7 truths, 8 артефактов, 6 key links |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | Не найдено (TODO/FIXME/placeholder/пустые реализации отсутствуют во всех новых файлах) | — | — |

Дополнительно проверено: шапка `lib/wb-finance-api.ts:15` обновлена (sales-reports больше не deferred); retry-дисциплина — ровно 1 повтор на 429 по Retry-After с записью cooldown (`wb-realization-api.ts:266-278`); BigInt-guard reportId regex-стрингификацией до JSON.parse (:317, покрывает reportId и report_id); guard от зацикливания пагинации detailed (:382).

### Human Verification Required (post-deploy, вне скоупа задачи)

Первый реальный синк выполняет оркестратор после деплоя (deploy.sh применит миграцию):

1. **Первый импорт реализации**
   - **Test:** на /finance/weekly (MANAGE FINANCE) выбрать закрытую неделю → «Реализация WB»
   - **Expected:** toast «Реализация: N строк за неделю», бейджи пулов сменились на «из реализации», reviewWriteoffTotal/logisticsIuPerUnit ненулевые у товаров с фактом
   - **Why human:** требует живого WB Finance API (Персональный/Сервисный токен, scope Финансы) — из задач запрещено
2. **Сверка классификатора**
   - **Test:** после синка проверить journalctl на `[wb-realization-sync] сверка`
   - **Expected:** нет warn >1% (или расследовать бакет из warn'а)
   - **Why human:** зависит от реального состава операций WB

### Gaps Summary

Гэпов нет. Все must-haves подтверждены кодом: модель+миграция валидны, клиент с pure-классификатором покрыт 17 тестами, sync-путь (route/кнопка/крон/dispatcher) полностью прошит, ИУ-факт подключён в data.ts с manual-fallback и бейджем, engine.ts (std-сценарий) не изменён, promotionRub только хранится, живых вызовов WB API в тестах нет. 110/110 тестов, tsc/prisma generate чисты, 3 атомарных коммита запушены (main == origin/main).

---

_Verified: 2026-07-10T11:50:00Z_
_Verifier: Claude (gsd-verifier)_
