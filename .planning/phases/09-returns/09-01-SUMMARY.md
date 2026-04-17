---
phase: 09-returns
plan: 01
subsystem: api
tags: [wb-api, returns, claims, prisma, vitest, tdd]

# Dependency graph
requires:
  - phase: 08-support-mvp
    provides: SupportTicket/SupportMessage/SupportMedia модели + channel=RETURN enum + callWb паттерн в lib/wb-support-api.ts
provides:
  - ReturnDecision модель (audit log решений) + 2 enum (ReturnDecisionAction, ReturnState)
  - 8 nullable полей в SupportTicket (wbClaimStatus, wbClaimStatusEx, wbClaimType, wbActions, wbComment, srid, price, returnState)
  - User.returnDecisions relation "ReturnDecider"
  - lib/wb-support-api.ts — listReturns/approveReturn/rejectReturn/reconsiderReturn + callReturnsApi helper
  - Типы Claim, ListReturnsParams, ListReturnsResult
  - tests/fixtures/wb-claim-sample.json — canonical WB claim для reuse в юнит-тестах
  - Wave 0 test stubs для 09-02 sync и 09-04 actions
affects: [09-02-sync, 09-03-ui-list, 09-04-actions]

# Tech tracking
tech-stack:
  added: []  # все библиотеки уже есть (vitest, prisma)
  patterns:
    - "Параметризованный callApi(baseUrl, token, path, init) — одна 429-retry логика для Feedbacks и Returns API"
    - "Отдельный WB_RETURNS_TOKEN (scope bit 11) с fallback на WB_API_TOKEN для dev"
    - "Wave 0 stubs с it.skip — покрытие контракта downstream планов, не падают в npm run test"
    - "Ручное создание Prisma миграции (migration.sql) при отсутствии локальной PG — применение на VPS через deploy.sh"

key-files:
  created:
    - "prisma/migrations/20260417_phase9_returns/migration.sql"
    - "tests/wb-returns-api.test.ts"
    - "tests/fixtures/wb-claim-sample.json"
    - "tests/support-sync-returns.test.ts"
    - "tests/return-actions.test.ts"
  modified:
    - "prisma/schema.prisma"
    - "lib/wb-support-api.ts"

key-decisions:
  - "Два WB токена: WB_API_TOKEN (bit 5 Feedbacks) + WB_RETURNS_TOKEN (bit 11 Buyers Returns). Токен 11 отдельный — scope существующего токена расширить быстро невозможно"
  - "ReturnDecision audit log с N decisions per ticket (из-за reconsider) + актуальное состояние денормализовано в SupportTicket.returnState для быстрой фильтрации"
  - "callWb переименован в callApi(baseUrl, token, ...) + два wrapper'a (callWb для Feedbacks, callReturnsApi для Returns) — backward compat Phase 8"
  - "Scope-hint в 403 ошибке различается: 'bit 5' для feedbacks-api, 'bit 11 Buyers Returns (WB_RETURNS_TOKEN)' для returns-api"
  - "TypeScript tsconfig уже исключает tests/** (Phase 07 P11 fix) — vitest @/ alias работает через vitest.config.ts"

patterns-established:
  - "WB Returns API client: отдельный token-helper + параметризованный callApi, НЕ дублирование retry-логики"
  - "actions[] динамический — не хардкодить 'approve1'/'rejectcustom', всегда брать из свежего GET ответа"
  - "photos[]/video_paths[] без схемы (//photos.wbstatic.net/...) — prefix 'https:' добавляется в sync-логике Plan 09-02"

requirements-completed:
  - SUP-17

# Metrics
duration: ~8min
completed: 2026-04-17
---

# Phase 09 Plan 01: Foundation Summary

**WB Returns API клиент (4 метода) + Prisma миграция ReturnDecision/ReturnState + 15 Wave 0 stubs — foundation для sync и actions в 09-02/04**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-04-17T19:14Z
- **Tasks:** 3
- **Files created:** 5
- **Files modified:** 2

## Accomplishments

- Prisma schema: новая модель ReturnDecision (audit log) + 2 enum + 8 nullable полей SupportTicket + relation User.returnDecisions
- migration.sql подготовлена (20260417_phase9_returns) — применится на VPS через 09-04 deploy.sh
- lib/wb-support-api.ts: 4 новых метода Returns API (listReturns/approveReturn/rejectReturn/reconsiderReturn) + типы Claim/ListReturnsParams/ListReturnsResult
- Рефакторинг callWb → callApi(baseUrl, token, path, init) без breaking changes для Phase 8 (10/10 тестов Phase 8 regression зелёные)
- 13 GREEN unit-тестов WB Returns API (URL, headers, pagination, 429 retry, 401/403, PATCH bodies для 3 action'ов, reason 10-1000 валидация)
- Canonical fixture tests/fixtures/wb-claim-sample.json для reuse в 09-02 sync тестах
- 15 Wave 0 stub-тестов (5 sync + 10 actions) с явными ссылками на Plan 09-02/09-04

## Task Commits

1. **Task 1: Prisma миграция — ReturnDecision + 2 enum + 8 полей SupportTicket** — `e31ff6c` (feat)
2. **Task 2: WB Returns API клиент — listReturns/approve/reject/reconsider** — `1731948` (feat)
3. **Task 3: Wave 0 stubs — support-sync-returns + return-actions** — `6f2aa7b` (test)

_TDD workflow для Task 2: тесты написаны первыми (13 FAIL → RED подтверждён), затем реализация (13 PASS → GREEN). RED коммит поглощён GREEN коммитом за единство файлов (tests/lib/fixture принадлежат одной задаче плана)._

## Files Created/Modified

- `prisma/schema.prisma` — ReturnDecision модель, 2 enum (ReturnDecisionAction, ReturnState), 8 полей + index в SupportTicket, relation User.returnDecisions
- `prisma/migrations/20260417_phase9_returns/migration.sql` — SQL миграция вручную (нет локальной PG), применяется на VPS
- `lib/wb-support-api.ts` — callApi параметризованный + callReturnsApi + 4 метода Returns API + типы
- `tests/wb-returns-api.test.ts` — 13 GREEN тестов (URL/headers/pagination/429/401/403/PATCH bodies/validation)
- `tests/fixtures/wb-claim-sample.json` — canonical Claim пример из 09-RESEARCH.md §6
- `tests/support-sync-returns.test.ts` — 5 it.skip стабов для Plan 09-02
- `tests/return-actions.test.ts` — 10 it.skip стабов для Plan 09-04

## Decisions Made

- **Два WB токена вместо одного unified:** `WB_API_TOKEN` (bit 5) + `WB_RETURNS_TOKEN` (bit 11) — существующий токен не имеет scope bit 11 и перегенерировать его небезопасно (ломает Phase 8). На VPS добавлен отдельный `WB_RETURNS_TOKEN` pre-flight'ом. `getReturnsToken()` имеет fallback на `WB_API_TOKEN` для dev/test окружений.
- **callWb → callApi(baseUrl, token, ...) рефакторинг вместо дублирования:** одна 429 retry логика обслуживает два API. Scope-hint в 403-ошибке различается через `baseUrl.includes("returns-api")`.
- **ReturnDecision as audit log (N decisions per ticket) + денормализованный SupportTicket.returnState:** быстрая фильтрация в `/support/returns` без JOIN на ReturnDecision, история для аудита + RECONSIDER флаг.
- **Ручная migration.sql:** локальная PG отсутствует (паттерн проекта с Phase 01) — SQL написан вручную по схеме, применится через `prisma migrate deploy` на VPS в 09-04. `npx prisma validate` чист, `npx prisma format` clean.

## Deviations from Plan

None - plan executed exactly as written.

План был выполнен точно, все acceptance criteria пройдены:
- ✅ `npx prisma validate` exit 0
- ✅ `npx tsc --noEmit` exit 0
- ✅ `npm run test -- tests/wb-returns-api.test.ts` — 13 GREEN
- ✅ `npm run test -- tests/wb-support-api.test.ts` — 10 GREEN (Phase 8 regression)
- ✅ `npm run test` — 102 passed / 15 skipped / 0 failed (13 test files)
- ✅ Все grep-проверки acceptance criteria в Task 1/2/3 прошли
- ✅ Commit префиксы `feat(09-01)` и `test(09-01)` соблюдены, atomic per task

## Issues Encountered

- **vitest 4.1.4 на Node 20** — require(esm) для std-env@4 в Node 20 требует `NODE_OPTIONS=--experimental-require-module`. Это окружённая проблема, не часть плана. Тесты запускаются с флагом. На Node 22+ работает без флага. Пре-commit хуки не требуют npm run test, так что не влияет на commit flow.
- **pristine node_modules reset:** `rm -rf node_modules package-lock.json && npm install` понадобился для корректной установки `@rolldown/binding-darwin-arm64` после первоначальной установки без native binding. Package-lock.json восстановлен к HEAD, чтобы не смешивать dep shakeups с коммитом Phase 9.

## User Setup Required

**Wave 0 pre-flight уже выполнен (подтверждено в execution context):**
- `WB_RETURNS_TOKEN` добавлен в `/etc/zoiten.pro.env` на VPS (scope bit 11 Buyers Returns)
- `systemctl restart zoiten-erp.service` выполнен
- curl `https://returns-api.wildberries.ru/api/v1/claims?is_archive=false&limit=1` с `Authorization: $WB_RETURNS_TOKEN` возвращает 429 → auth работает, scope OK

**Deploy задача (для Plan 09-04):**
```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
# deploy.sh выполнит npx prisma migrate deploy → применит 20260417_phase9_returns
```

## Next Phase Readiness

- ✅ Database schema готова: ReturnDecision + ReturnState + 8 полей SupportTicket
- ✅ WB Returns API клиент экспортирует 4 метода — можно вызывать из `lib/support-sync.ts` (09-02) и server actions (09-04)
- ✅ Test infrastructure: fixture + 15 stub тестов готовы к GREEN реализации в 09-02/09-04
- ✅ Нет блокеров для 09-02 Sync — foundation полностью готов

**Plan 09-02 следующим:** расширение `lib/support-sync.ts` функцией `syncReturns()` + интеграция в `POST /api/support-sync` + cron endpoint. Wave 0 stubs из `tests/support-sync-returns.test.ts` раскрывают контракт (5 it.skip → it).

## Self-Check: PASSED

**Files verified:**
- FOUND: prisma/schema.prisma (модифицирован)
- FOUND: prisma/migrations/20260417_phase9_returns/migration.sql
- FOUND: lib/wb-support-api.ts (модифицирован)
- FOUND: tests/wb-returns-api.test.ts
- FOUND: tests/fixtures/wb-claim-sample.json
- FOUND: tests/support-sync-returns.test.ts
- FOUND: tests/return-actions.test.ts

**Commits verified:**
- FOUND: e31ff6c (Task 1 — Prisma)
- FOUND: 1731948 (Task 2 — API клиент + тесты + fixture)
- FOUND: 6f2aa7b (Task 3 — Wave 0 stubs)

**Tests verified:**
- 13 GREEN in tests/wb-returns-api.test.ts
- 10 GREEN in tests/wb-support-api.test.ts (Phase 8 regression)
- 15 skipped in Wave 0 stubs (5 + 10)
- 102 total passed / 0 failed across 13 test files

---
*Phase: 09-returns*
*Completed: 2026-04-17*
