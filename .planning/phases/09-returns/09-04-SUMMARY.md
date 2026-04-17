---
phase: 09-returns
plan: 04
subsystem: ui-actions
tags: [wb-api, returns, claims, server-actions, rbac, tdd, vitest, state-machine]

# Dependency graph
requires:
  - phase: 09-returns
    plan: 01
    provides: ReturnDecision model, ReturnState enum, SupportTicket Phase 9 поля (wbActions/wbComment/srid/price/returnState), lib/wb-support-api.ts approveReturn/rejectReturn/reconsiderReturn
  - phase: 09-returns
    plan: 02
    provides: syncReturns() — поставляет свежие wbActions[] в ticket через upsert; защита возможной race с локальными решениями через update блок без returnState
  - phase: 08-support-mvp
    plan: 04
    provides: app/actions/support.ts паттерн (getSessionUserId + requireSection + try/catch + revalidatePath), ReplyPanel как образец sticky client-панели
provides:
  - approveReturn/rejectReturn/reconsiderReturn server actions в app/actions/support.ts
  - ReturnActionsPanel — sticky client-панель с 3 кнопками + модалка Отклонить
  - ReturnInfoPanel — блок «Информация о возврате» (price/srid/wbComment) в левой колонке
  - Модификация диалога /support/[ticketId]: conditional render для channel===RETURN
  - tests/return-actions.test.ts — 17 GREEN integration-тестов (Wave 0 stub → real)
affects: [UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "WB-first transaction order: PATCH WB первым в try/catch — Decision+update только после успеха. При WB 4xx/5xx Decision НЕ создаётся (state machine не меняется, тикет остаётся в исходном returnState)"
    - "State machine guards SUP-20: approve требует PENDING + approve1/autorefund1/approvecc1; reject требует PENDING + rejectcustom + reason 10..1000; reconsider требует REJECTED + approve1 в свежих wbActions"
    - "Action picker prefer approve1 > autorefund1 > approvecc1 — WB возвращает разные наборы для разных typings заявки; автоматический выбор через lookup helper pickApproveAction"
    - "vitest beforeEach: vi.resetAllMocks() вместо clearAllMocks — чистит mockResolvedValueOnce очередь (иначе queued values из предыдущих тестов съедают WB reject-моки и WB-error test получает {ok:true})"
    - "Модалка Отклонить: custom overlay (fixed inset-0 z-50) + stopPropagation на inner div — без base-ui Dialog для упрощения, textarea rows=6 + live counter {trimmed}/1000 + disabled submit < 10"
    - "conditional render в диалоге: canReply ∨ isReturn ∨ fallback (mutually exclusive) — channel===RETURN теперь полностью поддержан, RETURN из fallback убран"

key-files:
  created:
    - "components/support/ReturnActionsPanel.tsx"
    - "components/support/ReturnInfoPanel.tsx"
  modified:
    - "app/actions/support.ts"
    - "app/(dashboard)/support/[ticketId]/page.tsx"
    - "tests/return-actions.test.ts"

key-decisions:
  - "WB-first order: PATCH → Decision.create+ticket.update в $transaction. Если WB PATCH throws — Decision НЕ создаётся, returnState не меняется. Test 'НЕ создаёт Decision если WB API вернул ошибку' пинит контракт через expect(prismaMock.returnDecision.create).not.toHaveBeenCalled()."
  - "Action picker с приоритетом approve1 > autorefund1 > approvecc1: разные типы заявок (возврат товара / отмена заказа / отказ до выдачи) возвращают разные подмножества wbActions; approve1 — универсальный, autorefund1 — автоматический рефанд, approvecc1 — с пояснением. Fallback-ветка returns error если ни один не доступен."
  - "rejectReturn не трогает status=CLOSED — оставляем IN_PROGRESS (reconsider ещё возможен), APPROVED ставит status=ANSWERED+resolvedAt=now (финал). Reconsider возвращает status=ANSWERED (одобрен после пересмотра)."
  - "Модалка Отклонить через custom overlay (fixed inset-0) а НЕ shadcn Dialog — чтобы не таскать radix/base-ui import и не усложнять сборку компонента. Валидация дублируется клиент+сервер (zod trim+length 10..1000)."
  - "vi.resetAllMocks в beforeEach (не clearAllMocks): обнаружено через FAIL 5 тестов — очередь .mockResolvedValueOnce из первых approveReturn тестов переливалась в последующие и перекрывала .mockRejectedValueOnce для WB-error сценариев. Rule 1 bug fix."

patterns-established:
  - "Server action для изменения state machine: 1) RBAC guard + userId, 2) findUnique с select, 3) guards по каналу/состоянию/wbActions, 4) WB PATCH в try/catch (external-first), 5) $transaction [Decision.create, ticket.update], 6) revalidatePath. Единый паттерн для будущих phase (chat/messenger)."
  - "Sticky-панель внизу диалога с conditional render по channel: ReplyPanel (FEEDBACK/QUESTION) | ReturnActionsPanel (RETURN) | placeholder (CHAT/MESSENGER). Левая колонка параллельно: дополнительные инфо-блоки per-channel (ReturnInfoPanel)."

requirements-completed:
  - SUP-14
  - SUP-19
  - SUP-20

# Metrics
duration: ~7min
completed: 2026-04-17
---

# Phase 09 Plan 04: UI Actions + UAT Summary

**3 server actions approveReturn/rejectReturn/reconsiderReturn со state machine guards SUP-20 + ReturnActionsPanel/ReturnInfoPanel в диалоге RETURN + 17 GREEN integration-тестов + deploy на VPS готов к human UAT**

## Performance

- **Duration:** ~7 min (Task 1+2 автомат, Task 3 = checkpoint к UAT)
- **Completed:** 2026-04-17 (автоматические шаги; UAT pending)
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files created:** 2 (ReturnActionsPanel.tsx, ReturnInfoPanel.tsx)
- **Files modified:** 3 (support.ts, [ticketId]/page.tsx, return-actions.test.ts)

## Accomplishments

- **3 server actions в app/actions/support.ts:**
  - `approveReturn(ticketId)` — PENDING → APPROVED, WB picker approve1>autorefund1>approvecc1, Decision{APPROVE, reconsidered:false}, ticket{status:ANSWERED, resolvedAt:now}
  - `rejectReturn(ticketId, reason)` — PENDING → REJECTED, reason.trim() 10..1000, WB rejectcustom, Decision{REJECT, reason}, ticket{status:IN_PROGRESS}
  - `reconsiderReturn(ticketId)` — REJECTED → APPROVED, WB approve1 (требует в свежих wbActions), Decision{RECONSIDER, reconsidered:true}, ticket{status:ANSWERED}
- **State machine guards (SUP-20):** APPROVED финал (все три возвращают error), REJECTED→PENDING невозможен, PENDING→RECONSIDER невозможен. Канал должен быть RETURN, wbExternalId обязателен.
- **WB-first transaction order:** PATCH WB в try/catch ПЕРВЫМ — если throws, Decision НЕ создаётся. $transaction из 2 операций (Decision.create + ticket.update) атомарна.
- **ReturnActionsPanel** (sticky client-панель):
  - PENDING → [Одобрить, Отклонить] (disabled если wbAction отсутствует в wbActions)
  - REJECTED → [Пересмотреть] (disabled если approve1 нет в свежих wbActions)
  - APPROVED → readonly сообщение
  - Модалка Отклонить: textarea rows=6 + live counter {trimmed}/1000 + disabled submit < 10
  - sonner toast.loading/success/error на все 3 action, confirm() перед approve/reconsider
- **ReturnInfoPanel** (левая колонка диалога): price.toFixed(2) ₽, srid в `<code>`, collapsible wbComment
- **Диалог [ticketId]/page.tsx:** isReturn=channel==="RETURN" conditional; RETURN убран из fallback-сообщения
- **17 GREEN integration тестов** (Wave 0 stub переписан):
  - approveReturn: happy path, non-RETURN reject, APPROVED финал, REJECTED redirect, WB error rollback, no wbActions
  - rejectReturn: happy path, reason<10/>1000, non-PENDING, rejectcustom отсутствует, WB error rollback
  - reconsiderReturn: happy path, PENDING reject, approve1 отсутствует
  - RBAC: requireSection reject
  - revalidatePath покрытие

## Task Commits

1. **Task 1: 3 server actions + 17 GREEN тестов** — `0226e8c` (feat)
2. **Task 2: ReturnActionsPanel + ReturnInfoPanel + dialog RETURN branch** — `1c7925f` (feat)
3. **Task 3: Deploy на VPS + human UAT checkpoint** — ⏳ ожидает user approved

_TDD Task 1: RED подтверждён (17 FAIL `not a function`) → GREEN (17 PASS)_

## Files Created/Modified

- `app/actions/support.ts` — 3 новых экспорта (строки 154+) + reuse getSessionUserId helper (строки 30-33)
- `components/support/ReturnActionsPanel.tsx` — 182 строки, client sticky + модалка
- `components/support/ReturnInfoPanel.tsx` — 51 строка, client блок левой колонки
- `app/(dashboard)/support/[ticketId]/page.tsx` — импорты + isReturn conditional + 2 render-точки
- `tests/return-actions.test.ts` — 17 GREEN (заменил 10 it.skip стабов из Wave 0)

## Decisions Made

- **WB-first transaction:** PATCH WB первым (может бросить), Decision+ticket.update только после успеха. Если WB 4xx/5xx, локальный state не меняется — inconsistency protected. Test `НЕ создаёт Decision если WB API вернул ошибку` пинит через `expect(prismaMock.returnDecision.create).not.toHaveBeenCalled()`.
- **Action picker приоритет approve1 > autorefund1 > approvecc1:** WB возвращает разные подмножества actions[] для разных типов заявок; универсальный picker избегает хардкодов в UI.
- **vitest resetAllMocks (не clearAllMocks) в beforeEach:** обнаружено через 5 FAIL — `mockResolvedValueOnce` queue переливалась между тестами (6 первых approveReturn тестов наполняли queue, последующие видели старые `{ok:true}` вместо свежих `{error}`). Rule 1 bug fix.
- **Модалка через custom overlay, не shadcn Dialog:** простота сборки, меньше runtime-dependencies, достаточно для one-shot UX (Reject reason). При появлении других модалок в Phase 10+ можно унифицировать.
- **rejectReturn сохраняет status=IN_PROGRESS (не CLOSED):** reconsider ещё возможен пока WB снова отдаёт approve1 в wbActions; CLOSED будет через ANSWERED→CLOSED финальный tick или через прямой вызов updateTicketStatus.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.resetAllMocks вместо clearAllMocks в beforeEach**

- **Found during:** Task 1 запуск тестов после GREEN-реализации
- **Issue:** 5 из 17 тестов FAIL с разными симптомами (WB-error test получал {ok:true}, rejected-state test шёл через happy path). Диагноз: `vi.clearAllMocks` очищает results и call history, но НЕ очищает очередь `.mockResolvedValueOnce`. Каждый `setupMocks` вызов добавлял в queue, очередь накапливалась, и к 5-му тесту первые pulls возвращали старые значения из 1-го/2-го теста.
- **Fix:** заменил на `vi.resetAllMocks()` которое очищает ВСЁ (queue + default implementation). Восстановил дефолтный `$transaction.mockImplementation` и `returnDecision.create.mockResolvedValue` после reset в beforeEach.
- **Files modified:** tests/return-actions.test.ts (строки 48-60)
- **Commit:** 0226e8c (исправление в одном коммите с GREEN-реализацией)

**2. [Rule 3 - Blocking issue] Критерий grep в acceptance `getSessionUserId() >= 6` не выполнялся (фактически 5)**

- **Found during:** Task 1 acceptance check
- **Issue:** План предполагал 3 Phase 8 вызова + 3 Phase 9 = 6, но в Phase 8 `getSessionUserId` фактически вызывается только в `replyToTicket`. `assignTicket` и `updateTicketStatus` не используют userId. Итого 1 + 3 = 4 вызова + 1 определение = 5.
- **Fix:** не меняли код — реальность корректна, все 3 Phase 9 action переиспользуют helper через import/call. Плановый счётчик был off-by-N из-за некорректного допущения.
- **Files modified:** нет
- **Commit:** нет (это нотация о расхождении плана и реальности)

### Out of scope

Никаких pre-existing warnings или несвязанных файлов Phase 9 Plan 04 не задел. TSC clean, build clean, 124/124 tests GREEN.

## Authentication Gates

Нет — все операции идут через уже настроенные `WB_API_TOKEN` + `WB_RETURNS_TOKEN` на VPS (Wave 0 pre-flight, подтверждено в 09-01-SUMMARY.md).

## Issues Encountered

- Vitest `clearAllMocks` vs `resetAllMocks` различие — см. deviation #1.
- Плановый счётчик grep acceptance criteria off-by-N — см. deviation #2.

## Deploy Status

- **ssh root@85.198.97.89 'grep -q WB_RETURNS_TOKEN /etc/zoiten.pro.env'** → `OK`
- **bash deploy.sh на VPS** → `Active: active (running)` (PID 630733, 19:31:49 UTC)
- **https://zoiten.pro/support/returns** → `HTTP 302` (redirect на /login, ожидаемо для неавторизованного)
- **systemctl show zoiten-erp.service -p Environment** показывает только inline `HOSTNAME=0.0.0.0` — токены загружены через `EnvironmentFile=/etc/zoiten.pro.env` (содержит 1 запись `WB_RETURNS_TOKEN`)

## Human UAT Checklist (pending user approval)

**Раздел /support/returns:**
- [ ] Открыть https://zoiten.pro/support/returns — рендерится без ошибок
- [ ] Клик «Синхронизировать» (если есть) → тикеты появляются в таблице после revalidate
- [ ] Таблица содержит 9 колонок (Товар/Покупатель/Причина/Фото брака/Дата/Решение/Кто принял/Пересмотрено/Действия)
- [ ] Фильтры работают (returnStates/nmId/assignees/dateFrom/dateTo/reconsideredOnly)
- [ ] Sidebar содержит пункт «Возвраты»
- [ ] Клик «Открыть» → переход на /support/{ticketId}

**Диалог /support/[ticketId] канала RETURN:**
- [ ] 3-колоночный layout сохранён (покупатель+товар | сообщения | статус)
- [ ] Вместо ReplyPanel внизу центральной колонки — ReturnActionsPanel
- [ ] В левой колонке под карточкой товара — ReturnInfoPanel (price ₽, srid, collapsible wbComment)
- [ ] PENDING: видны кнопки [Одобрить, Отклонить] (enabled если соответствующие wbActions)
- [ ] REJECTED: видна кнопка [Пересмотреть] (enabled если approve1 в wbActions)
- [ ] APPROVED: readonly «Возврат одобрен — действия завершены»

**Actions (⚠ необратимо — на тест-заявке):**
- [ ] PENDING → «Одобрить» → confirm → toast loading/success → state APPROVED, readonly сообщение
- [ ] Проверить в seller.wildberries.ru — заявка одобрена
- [ ] В /support/returns: «Решение»=Одобрен (зелёный), «Кто принял»=текущий пользователь
- [ ] Другой PENDING → «Отклонить» → модалка → reason < 10 → submit disabled, видно «Нужно ещё N символов»
- [ ] Ввести ≥10 → submit enabled → отправить → state REJECTED, появляется «Пересмотреть»
- [ ] Проверить в seller.wildberries.ru — rejection с нашим comment
- [ ] «Пересмотреть» на только что отклонённом → confirm → state APPROVED, в DB reconsidered=true
- [ ] В /support/returns колонка «Пересмотрено» показывает «Да»

**RBAC:**
- [ ] VIEWER (SUPPORT=VIEW): /support/returns доступен, action-кнопки вызывают toast error «Нет доступа / FORBIDDEN»

**Регрессия Phase 7/8:**
- [ ] /support (лента) без ошибок
- [ ] /support/[ticketId] для FEEDBACK — ReplyPanel работает, ответ уходит в WB
- [ ] /prices/wb работает

**Cron:**
- [ ] journalctl -u zoiten-erp.service -f | grep -i "return" показывает активность syncReturns на 15-мин tick

## User Setup Required

Уже выполнено (Wave 0 + deploy 09-04):
- `WB_RETURNS_TOKEN` на VPS в `/etc/zoiten.pro.env`
- migration `20260417_phase9_returns` применена через `prisma migrate deploy` в deploy.sh (Plan 09-01)
- systemd restart после каждого deploy

## Next Phase Readiness

Phase 9 завершается после resume-signal "approved" от пользователя. Дальнейшие milestone v1.1 фазы:
- Phase 10 (Чат) — WB Chat API + возможный curl-fallback (TLS fingerprint), паттерн server actions повторяет 09-04
- Phase 11 (Шаблоны ответов + Обжалование) — AI-драфт через ai-cs-zoiten, обжалование по SUP-40
- Phase 12 (Профиль покупателя + мессенджеры) — Telegram/WhatsApp
- Phase 13 (Статистика поддержки) — SLA, отчёты, ROI

## Self-Check: PASSED

**Files verified:**
- FOUND: app/actions/support.ts (модифицирован +239 строк)
- FOUND: components/support/ReturnActionsPanel.tsx
- FOUND: components/support/ReturnInfoPanel.tsx
- FOUND: app/(dashboard)/support/[ticketId]/page.tsx (модифицирован)
- FOUND: tests/return-actions.test.ts (переписан — 17 GREEN)

**Commits verified:**
- FOUND: 0226e8c (Task 1 — server actions + tests)
- FOUND: 1c7925f (Task 2 — UI components + dialog)

**Tests verified:**
- 17 GREEN in tests/return-actions.test.ts
- 124 total passed / 0 failed across 15 test files (npm run test)
- npx tsc --noEmit exit 0
- npm run build success (35 routes, /support/returns 4.97 kB, /support/[ticketId] 5.12 kB)

**Deploy verified:**
- systemctl is-active zoiten-erp.service → active
- HTTPS https://zoiten.pro/support/returns → 302 (auth redirect OK)
- WB_RETURNS_TOKEN в /etc/zoiten.pro.env (через EnvironmentFile)

**UAT:** ⏳ pending user `approved` signal

---
*Phase: 09-returns*
*Completed: 2026-04-17 (pending UAT)*
