---
phase: 07-prices-wb
plan: 11
subsystem: docs, deploy
tags: [docs, vps, deploy, prisma-migrate, production]

requires:
  - phase: 07-prices-wb
    provides: 10 предыдущих планов — полная реализация /prices/wb локально

provides:
  - CLAUDE.md секция «Управление ценами WB — Phase 7» (домен, данные, API, RBAC, компоненты, тесты)
  - README.md подсекция «Управление ценами — WB» в Возможности + Promotions Calendar endpoints в таблице API
  - tsconfig.json exclude для vitest.config.ts и tests/** (Rule 3 deviation — fix blocking prod build)
  - Production deploy: миграция 20260409_prices_wb применена, сервис zoiten-erp.service рестартнут, сайт https://zoiten.pro/prices/wb отвечает 302 → /login (RBAC ok)
affects: [08-*]

tech-stack:
  added: []
  patterns:
    - "Deploy via `ssh root@85.198.97.89 'cd /opt/zoiten-pro && bash deploy.sh'` (git pull + npm ci --omit=dev + prisma migrate deploy + next build + systemctl restart)"
    - "Next.js build требует, чтобы все .ts файлы в tsconfig include были компилируемы без devDependencies — vitest.config.ts должен быть исключён"

key-files:
  created:
    - .planning/phases/07-prices-wb/07-11-SUMMARY.md
    - .planning/phases/07-prices-wb/07-SUMMARY.md
  modified:
    - CLAUDE.md (+80 строк, секция Phase 7)
    - README.md (+17 строк, новая подсекция + API endpoints)
    - tsconfig.json (exclude vitest.config.ts + tests/**)

key-decisions:
  - "vitest.config.ts и tests/** исключены из tsconfig include — Next.js build на VPS запускает tsc type-check, а `npm ci --omit=dev` не ставит vitest. Vitest использует свой конфиг напрямую и не зависит от tsc."
  - "Self-approve human-verify checkpoint — пользователь пре-авторизовал прод deploy для финального плана, UI-верификацию выполняет gsd-verifier на уровне фазы"

patterns-established:
  - "Phase 7 documentation pattern: новая секция в CLAUDE.md + подсекция в README.md Возможности + API endpoints в таблице Синхронизация с WB"
  - "Blocking prod build fix workflow: commit fix локально → push origin → повторить deploy.sh"

requirements-completed:
  - PRICES-01
  - PRICES-02
  - PRICES-03
  - PRICES-04
  - PRICES-05
  - PRICES-06
  - PRICES-07
  - PRICES-08
  - PRICES-09
  - PRICES-10
  - PRICES-11
  - PRICES-12
  - PRICES-13
  - PRICES-14
  - PRICES-15
  - PRICES-16

duration: 31min
completed: 2026-04-10
---

# Phase 07 Plan 11: Документация + Deploy на VPS Summary

**Phase 7 закрыта: документация обновлена, Prisma миграция 20260409_prices_wb применена на проде, `https://zoiten.pro/prices/wb` live (302 → /login, RBAC корректен)**

## Performance

- **Duration:** 31 min
- **Started:** 2026-04-10T11:08:42Z
- **Completed:** 2026-04-10T11:39:25Z
- **Tasks:** 2 (1 execute + 1 checkpoint self-approved)
- **Files modified:** 3 (CLAUDE.md, README.md, tsconfig.json)

## Accomplishments

- CLAUDE.md получил полноценную секцию «Управление ценами WB — Phase 7» с описанием домена, модели данных (4 новые таблицы + 6 новых полей), fallback chain, Promotions Calendar API, pure function calculatePricing, routes, RBAC, компоненты, testing
- README.md получил новую подсекцию «Управление ценами — WB» в блоке Возможности и расширил таблицу WB API тремя Calendar endpoints
- `npm run test` — 5 suites, 52 tests, все GREEN (локально)
- `npm run build` — clean, `/prices/wb` 35.2 kB / 233 kB First Load
- Изменения запушены в `origin/main` (commits eaf2a87, 46cc42a)
- VPS: `git pull` успешен, `npx prisma migrate deploy` применил `20260409_prices_wb`, `bash deploy.sh` отстроил `next build` и рестартнул `zoiten-erp.service`
- Health check: `curl https://zoiten.pro/prices/wb` → HTTP 302 → `/login` (ожидаемое поведение, RBAC защищает read)
- PostgreSQL verification: 4 новые таблицы (AppSetting, CalculatedPrice, WbPromotion, WbPromotionNomenclature) присутствуют; 6 глобальных ставок засидены с дефолтами (wbWalletPct=2.0, wbAcquiringPct=2.7, wbJemPct=1.0, wbCreditPct=7.0, wbOverheadPct=6.0, wbTaxPct=8.0)

## Task Commits

1. **Task 1: Обновить CLAUDE.md и README.md + финальная валидация** — `eaf2a87` (feat)
2. **Task 2 (deviation fix): exclude vitest.config.ts + tests/ from Next.js type-check** — `46cc42a` (fix)
3. **Task 2: Deploy на VPS** — deploy выполнен, рестарт сервиса успешен (нет отдельного коммита — работа с prod инфраструктурой)

## Files Created/Modified

- `CLAUDE.md` — +80 строк: новая секция «## Управление ценами WB — Phase 7» между «Синхронизация с Wildberries» и «VPS заметки»
- `README.md` — +17 строк: новая подсекция «### Управление ценами — WB» в блоке «## Возможности»; +3 строки в таблицу API (Calendar endpoints)
- `tsconfig.json` — exclude расширен: `"vitest.config.ts", "tests/**"`
- `.planning/phases/07-prices-wb/07-11-SUMMARY.md` — этот файл
- `.planning/phases/07-prices-wb/07-SUMMARY.md` — главный phase summary

## Decisions Made

- **tsconfig exclude vitest.config.ts + tests/**: Rule 3 (blocking) deviation — обнаружено только при реальном прод-билде, локально работало потому что vitest установлен. На VPS `npm ci --omit=dev` исключает devDependencies, и следующий `next build` запускает `tsc --noEmit` на всех файлах из `include` (`**/*.ts`). Vitest использует собственный конфиг напрямую (не через tsc), поэтому тесты продолжают работать.
- **Self-approve human-verify checkpoint**: согласно авторизации в prompt executor-а, пользователь пре-одобрил прод deploy для финального плана; end-to-end UI-верификацию проводит gsd-verifier на уровне фазы.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Исключить vitest.config.ts + tests/** из Next.js type-check**
- **Found during:** Task 2 (первый запуск `bash deploy.sh` на VPS)
- **Issue:** `npm ci --omit=dev` не устанавливает vitest (devDependency). `next build` запускает `tsc --noEmit` на файлах из `tsconfig.json#include` (`**/*.ts`), и падает на `vitest.config.ts:1:30 Cannot find module 'vitest/config'`. Блокирует prod deploy.
- **Fix:** Расширен `tsconfig.json#exclude` с `["node_modules", "vitest.config.ts", "tests/**"]`. Vitest использует собственный конфиг напрямую (не через tsc), тесты продолжают работать.
- **Files modified:** `tsconfig.json`
- **Verification:** Локально `npm run test` GREEN (52 tests), `npm run build` clean; на VPS `bash deploy.sh` завершился успешно, сервис active (running)
- **Committed in:** `46cc42a` (отдельный fix-коммит после Task 1)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Deviation необходим для прод deploy. Локальный dev workflow не затронут.

## Issues Encountered

- **VPS build fail при первом deploy**: описано выше в deviations — разрешено добавлением exclude в tsconfig.json, повторным push и вторым запуском `bash deploy.sh`.

## User Setup Required

None — WB_API_TOKEN уже настроен в `/etc/zoiten.pro.env` (проверено на предыдущих фазах). Scope «Цены и скидки» (bit 3) уже включён, так как smoke test в Wave 0 прошёл.

## Next Phase Readiness

- Phase 7 **COMPLETE**. `/prices/wb` live в продакшене.
- Готово к фазе 8 (если планируется): отправка цен в WB через Prices API, история расчётов, экспорт Excel, Ozon Pricing. См. `<deferred>` в `07-CONTEXT.md`.

## Self-Check: PASSED

- FOUND: C:/Claude/zoiten-pro/CLAUDE.md (содержит «Управление ценами WB — Phase 7»)
- FOUND: C:/Claude/zoiten-pro/README.md (содержит «Управление ценами — WB»)
- FOUND: C:/Claude/zoiten-pro/tsconfig.json (exclude vitest.config.ts)
- FOUND commit: eaf2a87 (feat 07-11 docs)
- FOUND commit: 46cc42a (fix 07-11 tsconfig)
- FOUND: https://zoiten.pro/prices/wb → HTTP 302 → /login (RBAC ok)
- FOUND: 4 таблицы в БД (AppSetting, CalculatedPrice, WbPromotion, WbPromotionNomenclature)
- FOUND: 6 ключей в AppSetting с дефолтами 2.0/2.7/1.0/7.0/6.0/8.0

---
*Phase: 07-prices-wb*
*Completed: 2026-04-10*
