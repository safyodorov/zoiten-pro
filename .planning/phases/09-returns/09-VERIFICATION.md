---
status: human_needed
phase: 09-returns
verifier: orchestrator-inline
plan_count: 4
plans_complete: 4
completed: 2026-04-17
---

# Phase 09: Возвраты — Verification Report

**Status:** `human_needed` — автоматическая часть пройдена, требуется ручная UAT на VPS (20 пунктов из 09-04-SUMMARY.md).

## Goal Recall (из ROADMAP.md)

> Менеджер обрабатывает заявки на возврат/брак из WB в отдельной таблице — одобряет, отклоняет с причиной и пересматривает отклонённые заявки.

## Success Criteria Check (5 из 5 на уровне кода)

| # | Success Criterion | Статус | Evidence |
|---|---|---|---|
| 1 | `/support/returns` — таблица 9 колонок (Товар/Покупатель/Причина/Фото брака/Дата/Решение/Кто принял/Пересмотрено) | ✅ | `app/(dashboard)/support/returns/page.tsx:44` `where: { channel: "RETURN" }` + preload ReturnDecision/WbCard/media → `components/support/ReturnsTable.tsx` рендерит все 9 колонок |
| 2 | «Одобрить»/«Отклонить» → WB Returns API + ReturnDecision c decidedById/decidedAt | ✅ | `app/actions/support.ts:176` approveReturn, `:259` rejectReturn; обе вызывают `callReturnsApi` → PATCH `/api/v1/claim` и создают ReturnDecision в `$transaction` (WB-first order). `decidedById` из `getSessionUserId()`, `decidedAt` Prisma default now() |
| 3 | «Пересмотреть» → REJECTED → APPROVED, reconsidered=true | ✅ | `app/actions/support.ts:342` reconsiderReturn — guard `returnState !== "REJECTED"` reject + требует `approve1` в свежих wbActions; Decision с action=RECONSIDER и `reconsidered: true`, ticket.returnState → APPROVED |
| 4 | В диалоге RETURN — sticky-панель с 3 кнопками | ✅ | `app/(dashboard)/support/[ticketId]/page.tsx:91` `isReturn = channel === "RETURN"`; `:156` conditional render `<ReturnActionsPanel />`; `:140` `<ReturnInfoPanel />` в левой колонке |
| 5 | Состояния PENDING → APPROVED \| REJECTED; REJECTED → APPROVED; APPROVED финал | ✅ | State machine guards в server actions: approveReturn требует PENDING (`:200` check), reconsiderReturn требует REJECTED (`:361` check), APPROVED финал (все три возвращают error при состоянии APPROVED). Покрыто 17 тестами в `tests/return-actions.test.ts` |

## Requirement Coverage

| Req | Описание (REQUIREMENTS.md) | Source Plan | Статус | Evidence |
|---|---|---|---|---|
| SUP-14 (addition) | Для канала RETURN — кнопки «Одобрить/Отклонить/Пересмотреть» вместо textarea | 09-04 | ✅ | `app/(dashboard)/support/[ticketId]/page.tsx:156` `{isReturn && <ReturnActionsPanel />}`; `:163` RETURN убран из fallback |
| SUP-17 | WB Returns API в lib/wb-support-api.ts — listReturns/approveReturn/rejectReturn/reconsiderReturn с тестами | 09-01, 09-02 | ✅ | `lib/wb-support-api.ts:245/261/279/293` 4 метода + `callReturnsApi:134` + `getReturnsToken:20`; 13 GREEN тестов в `tests/wb-returns-api.test.ts` + 5 GREEN в `tests/support-sync-returns.test.ts` |
| SUP-18 | Страница /support/returns — таблица заявок с 9 колонками | 09-03 | ✅ | `app/(dashboard)/support/returns/page.tsx` + `components/support/ReturnsTable.tsx` 9 колонок + `ReturnsFilters.tsx` 6 фильтров |
| SUP-19 | Действия approve/reject/reconsider + ReturnDecision с decidedById/decidedAt/reason/reconsidered | 09-04 | ✅ | `app/actions/support.ts:176/259/342` 3 server actions; 17 GREEN тестов `tests/return-actions.test.ts`; `ReturnDecision` модель в `prisma/schema.prisma:627` |
| SUP-20 | Логика состояний PENDING → APPROVED \| REJECTED; REJECTED → APPROVED через Пересмотреть; APPROVED финал | 09-04 | ✅ | Guards в 3 server actions + UI disabled states в `ReturnActionsPanel.tsx` (APPROVED → readonly, REJECTED → только «Пересмотреть», PENDING → «Одобрить»+«Отклонить») |

**Orphaned requirements:** ни одного. Все 5 SUP-IDs присвоенных Phase 9 в REQUIREMENTS.md traceability table имеют evidence на уровне кода.

## Automated Checks

| Проверка | Результат |
|---|---|
| `npm run test` | ✅ 124/124 tests passed (15 test files; 107 Phase 7/8 baseline + 17 new return-actions; 0 failed, 0 skipped) |
| `npx tsc --noEmit` | ✅ clean |
| `npm run build` | ✅ success (35 routes, `/support/returns` 4.97 kB, `/support/[ticketId]` 5.12 kB) |
| Prisma миграция `20260417_phase9_returns/migration.sql` | ✅ присутствует (49 строк, 2 enum + 8 ALTER COLUMN + CREATE TABLE ReturnDecision + FK) |
| Миграция применена на VPS (prisma migrate deploy) | ✅ через deploy.sh в Plan 09-04 |
| `systemctl is-active zoiten-erp.service` | ✅ active (PID 630733, 19:31:49 UTC) |
| `curl https://zoiten.pro/support/returns` | ✅ HTTP 302 (redirect на /login — ожидаемо для неавторизованного) |
| `WB_RETURNS_TOKEN` в `/etc/zoiten.pro.env` | ✅ через `EnvironmentFile` |
| `requireSection("SUPPORT", "MANAGE")` в server actions | ✅ 7 вызовов в `app/actions/support.ts` (включая 3 новых Phase 9) |
| Composite unique `@@unique([channel, wbExternalId])` (Phase 8) | ✅ не сломан новыми полями |
| Обратные relations `User.returnDecisions` (ReturnDecider) | ✅ `schema.prisma` |
| Backward-compat Phase 8 response shape `/api/support-sync` | ✅ spread supportResult первым — SupportSyncButton Phase 8 продолжает читать feedbacksSynced/questionsSynced/mediaSaved |

## Test Coverage per file

| Файл | Тесты | Статус |
|---|---|---|
| `tests/wb-returns-api.test.ts` | 13 | ✅ GREEN (URL/headers/pagination/429/401/403/PATCH bodies/reason validation) |
| `tests/support-sync-returns.test.ts` | 5 | ✅ GREEN (ticket создание, идемпотентность, https: prefix, оба is_archive, fail-soft) |
| `tests/return-actions.test.ts` | 17 | ✅ GREEN (6 approve + 5 reject + 3 reconsider + RBAC + revalidatePath) |
| Phase 7/8 regression tests | 89 | ✅ GREEN (0 regressions) |
| **Итого Phase 9 новых** | **35** | ✅ |
| **Итого baseline + Phase 9** | **124/124** | ✅ |

## Data-Flow Trace (Level 4)

| Артефакт | Data Variable | Источник | Produces Real Data | Status |
|---|---|---|---|---|
| `/support/returns` page | tickets, decisionByTicket, cardByNm, photosByTicket | Prisma findMany с channel=RETURN + distinct on ticketId для ReturnDecision + WbCard preload | Да (после cron tick на VPS) | ✅ FLOWING |
| `ReturnsTable` | props from RSC (Record<K,V>) | Server prop serialization | Да | ✅ FLOWING |
| `ReturnActionsPanel` | ticket.returnState + ticket.wbActions | Server action результат + revalidatePath | Да (wbActions из sync) | ✅ FLOWING |
| `/api/cron/support-sync-reviews` | WB Claims API | `listReturns` через `callReturnsApi` + `WB_RETURNS_TOKEN` | Да (auth OK confirmed 429 в pre-flight) | ✅ FLOWING |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| `/support/returns` отвечает на VPS | `curl -o /dev/null -w "%{http_code}" https://zoiten.pro/support/returns` | 302 redirect на /login | ✅ PASS (auth redirect — ожидаемо) |
| Сервис запущен | `systemctl is-active zoiten-erp.service` | `active` | ✅ PASS |
| Build success | `npm run build` | exit 0, 35 routes rendered | ✅ PASS |
| TS clean | `npx tsc --noEmit` | exit 0 | ✅ PASS |
| Tests GREEN | `npm run test` | 124/124 passed | ✅ PASS |
| UI клик Approve/Reject/Reconsider → real WB PATCH | (требует авторизованный browser session) | — | ? SKIP → UAT |
| Cron tick `/api/cron/support-sync-reviews` на VPS за 15 мин | (требует наблюдение journalctl) | — | ? SKIP → UAT |

## Human Verification Required (20 пунктов из 09-04-SUMMARY.md)

**Без побочек (rendering, фильтры, sidebar, диалог branch):**

1. [ ] Открыть `https://zoiten.pro/support/returns` — рендерится без ошибок
2. [ ] Клик «Синхронизировать» в шапке /support → тикеты RETURN появляются в таблице после revalidate
3. [ ] Таблица содержит 9 колонок (Товар/Покупатель/Причина/Фото брака/Дата/Решение/Кто принял/Пересмотрено/Действия)
4. [ ] Фильтры работают (returnStates / nmId / assignees / dateFrom / dateTo / reconsideredOnly)
5. [ ] Sidebar под «Служба поддержки» содержит пункт «Возвраты» с иконкой PackageX
6. [ ] Клик «Открыть» в строке → переход на `/support/{ticketId}`
7. [ ] Диалог канала RETURN: вместо ReplyPanel внизу — ReturnActionsPanel
8. [ ] В левой колонке диалога — ReturnInfoPanel (price ₽, srid в `<code>`, collapsible wbComment)

**С побочками (реальные WB actions — на тест-заявке):**

9. [ ] PENDING → «Одобрить» → confirm → toast loading/success → state APPROVED, readonly сообщение
10. [ ] Проверить в https://seller.wildberries.ru/ — заявка действительно одобрена
11. [ ] В /support/returns колонка «Решение» = Одобрен (зелёный), «Кто принял» = текущий пользователь + дата
12. [ ] Другой PENDING → «Отклонить» → модалка → reason < 10 символов → submit disabled, видно «Нужно ещё N символов»
13. [ ] Ввести reason ≥10 символов → submit enabled → отправить → state REJECTED, появляется кнопка «Пересмотреть»
14. [ ] Проверить в https://seller.wildberries.ru/ — rejection с введённым comment
15. [ ] «Пересмотреть» на только что отклонённом → confirm → toast → state APPROVED, в DB `reconsidered=true`
16. [ ] В /support/returns колонка «Пересмотрено» показывает «Да»

**RBAC:**

17. [ ] VIEWER (SUPPORT=VIEW): `/support/returns` доступен (read-only), action-кнопки в диалоге вызывают toast error «Нет доступа / FORBIDDEN»

**Регрессия Phase 7/8:**

18. [ ] `/support` (лента) без ошибок, счётчик синхронизации показывает `feedbacksSynced/questionsSynced/mediaSaved` (backward-compat)
19. [ ] `/support/[ticketId]` для FEEDBACK — ReplyPanel работает, ответ уходит в WB
20. [ ] `/prices/wb` открывается, калькулятор юнит-экономики работает

**Cron (опциональный):**

- [ ] `journalctl -u zoiten-erp.service -f | grep -i "return"` показывает активность `syncReturns` через 15-мин tick (подтверждение Option A cron)

## Deploy Status

- **Commits Phase 9:** `e31ff6c` → `1731948` → `6f2aa7b` → `a579550` (09-01) → `ffb6155` → `9a5c899` → `5555c83` (09-02) → `7016c19` → `56e1f34` → `c133512` → `69afa38` (09-03) → `0226e8c` → `1c7925f` → `e44ec8b` (09-04)
- **Related fast task (отдельно, не часть Phase 9):** `13826b1` fix(support-sync): NEW→ANSWERED на повторной синхронизации + `28f18f0` docs log — закрывает gap Phase 8 при ответе в WB кабинете напрямую. Deploy один раз вместе с 09-04.
- **VPS:** `/opt/zoiten-pro` @ production, systemd `zoiten-erp.service` active, migration `20260417_phase9_returns` applied через `prisma migrate deploy` в `deploy.sh`
- **URL:** https://zoiten.pro/support/returns → 302 (auth redirect OK)
- **Token architecture:** `WB_API_TOKEN` (scope bit 5 Feedbacks) + `WB_RETURNS_TOKEN` (scope bit 11 Buyers Returns) — оба в `/etc/zoiten.pro.env`, systemd `EnvironmentFile` загружает оба

## Known Limitations / Post-UAT Follow-ups

- **Шаблоны ответов (templates)** — Phase 11 planned (RBAC MANAGE будет для write actions)
- **Excel upload для Returns** — неприменимо (Returns API нативно работает через seller API, не требует Excel-fallback как auto-акции в Phase 7)
- **Reconsider flow зависит от WB** — возврат `approve1` в свежих `wbActions[]` после `rejectcustom` проверяется в UAT (тест 15 в checklist). Guards в server action защищают — при отсутствии `approve1` action возвращает error, UI кнопка «Пересмотреть» disabled.
- **`WB_RETURNS_TOKEN`** — отдельный токен со scope bit 11, управляется вручную через `/etc/zoiten.pro.env`. Перегенерировать — пересобрать через https://seller.wildberries.ru/ → Настройки → Доступ к API.
- **Cron Option A (единый 15-мин endpoint)** — `/api/cron/support-sync-reviews` теперь синхронизирует отзывы + вопросы + возвраты. Отдельный `/api/cron/returns-sync` НЕ создан (SUP-07 перечисляет только 3 отдельных cron — reviews/chat/appeals, возвраты встраиваются в reviews).
- **UI для создания возвратов вручную** — out of scope (WB API not supported; все заявки приходят из WB)
- **Декомпозиция ReplyPanel + ReturnActionsPanel sticky overlap** — оба sticky bottom, но conditional render (mutually exclusive по каналу) — нет визуального конфликта

## Sign-off

- [x] **Automated:** все проверки пройдены (124/124 tests, tsc clean, build success, deploy active, migration applied)
- [ ] **Human UAT:** pending (user will run 20 checklist items на https://zoiten.pro/support/returns после логина)
- [ ] **After UAT success signal:** status → complete, ROADMAP.md Phase 9 = Complete

---
*Phase: 09-returns*
*Status: human_needed (автоматическая часть пройдена; требуется ручная UAT на реальных тест-заявках WB)*

## VERIFICATION COMPLETE (human_needed)
