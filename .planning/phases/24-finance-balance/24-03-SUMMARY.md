---
phase: 24-finance-balance
plan: 03
subsystem: wb-finance-api
tags: [wb-api, finance, tokens, cooldown]
requires: []
provides:
  - lib/wb-finance-api.ts (fetchAccountBalance, fetchWeeklyForPayTail)
  - WB_FINANCE_TOKEN token infrastructure
  - cooldown bucket 'finance'
affects:
  - Plan 24-06 (дебиторка cron) — потребитель fetchAccountBalance/fetchWeeklyForPayTail
  - /admin/settings WB токены tab (авто-подхватит WB_FINANCE_TOKEN)
tech-stack:
  added: []
  patterns:
    - "WB API client с cooldown bucket + explicit HTTP status handling (401/402/429)"
key-files:
  created:
    - lib/wb-finance-api.ts
    - tests/wb-finance-api.test.ts
  modified:
    - lib/wb-token.ts
    - lib/wb-token-validate.ts
    - lib/wb-jwt.ts
    - app/actions/wb-tokens.ts
    - lib/wb-cooldown.ts
decisions:
  - "REQUIRED_SCOPE_BITS.WB_FINANCE_TOKEN = [13] — ПРЕДВАРИТЕЛЬНО (M6), не подтверждено живым JWT (checkpoint отложен)"
  - "fetchWeeklyForPayTail использует WB_API_TOKEN (Статистика), НЕ WB_FINANCE_TOKEN (B4)"
metrics:
  duration: "~25m"
  completed: "2026-07-02"
---

# Phase 24 Plan 03: WB Finance API клиент (дебиторка) Summary

Клиент `lib/wb-finance-api.ts` для WB Balance API (`finance-api.wildberries.ru`) с явной обработкой 401/402/429, изолированным cooldown-bucket `'finance'`, и хвостом незакрытой недели через Statistics Sales API (СТАТ-токен, пост-фильтр по дате продажи) — всё покрыто mocked-HTTP тестами без реального токена.

## What was built

**Task 1 — регистрация WB_FINANCE_TOKEN (4 точки) + cooldown bucket 'finance':**
- `lib/wb-token.ts`: `WB_FINANCE_TOKEN` добавлен в `WB_TOKEN_NAMES`.
- `lib/wb-token-validate.ts`: `REQUIRED_SCOPE_BITS.WB_FINANCE_TOKEN = [13]` (⚠ предварительно, см. Deviations) + `PROBE_ENDPOINTS` → Balance API.
- `lib/wb-jwt.ts`: `WB_SCOPE_LABELS[13] = "Финансы"` (additive, существующие метки не тронуты).
- `app/actions/wb-tokens.ts`: `DISPLAY_NAMES.WB_FINANCE_TOKEN = "WB Финансы"`.
- `lib/wb-cooldown.ts`: bucket `"finance"` в `WB_COOLDOWN_BUCKETS` + ветка в `resolveBucketFromUrl` для `finance-api.wildberries.ru`.
- UI-таб `/admin/settings` подхватывает автоматически (итерирует `WB_TOKEN_NAMES`) — правок не потребовалось.

**Task 2 — `lib/wb-finance-api.ts` + тесты:**
- `fetchAccountBalance()`: `getWbToken("WB_FINANCE_TOKEN")` → cooldown-guard bucket `'finance'` → `GET .../api/v1/account/balance`. Явная обработка 429 (cooldown write + `WbRateLimitError`), 402 (`Error` с текстом "402 Payment Required"), 401 (`Error` "токен недействителен или без scope"). Успех → `{ currency, current: Number, forWithdraw: Number }` из `{currency, current, for_withdraw}`.
- `fetchWeeklyForPayTail(mondayOfWeek, snapshotDate)`: `getWbToken("WB_API_TOKEN")` (СТАТ-токен — B4, НЕ финансовый), cooldown-guard bucket `'statistics-sales'`, `GET supplier/sales?dateFrom=<monday>&flag=0`. Пост-фильтр (M1): суммирует `forPay` только по строкам с `saleDt` (fallback `date`) в `[mondayOfWeek, snapshotDate]` — отсекает строки из прошлых недель, которые WB возвращает из-за фильтрации по `lastChangeDate`, а не по дате продажи (иначе двойной счёт с `balance.current`).
- `tests/wb-finance-api.test.ts` — 4 mocked-HTTP теста (happy path, 429→cooldown 'finance', 402 explicit, forPay-хвост с фильтрацией по saleDt + проверка стат-токена и `flag=0` в URL). Паттерн — `tests/wb-adv-api.test.ts` (`vi.mock` wb-token/wb-cooldown + `vi.stubGlobal("fetch")`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Убран литерал "reportDetailByPeriod" из комментария клиента**
- **Found during:** Task 2, acceptance-criteria verify
- **Issue:** Acceptance criteria требует `grep "reportDetailByPeriod" lib/wb-finance-api.ts` НЕ находит совпадений (deprecated endpoint не должен упоминаться дословно), но исходный комментарий-предупреждение содержал эту строку буквально.
- **Fix:** Переформулирован комментарий без буквального имени эндпоинта, смысл (deprecated v5 supplier report, удаляется 15.07.2026, не использовать) сохранён.
- **Files modified:** lib/wb-finance-api.ts
- **Commit:** входит в 62004cb (Task 2, правка сделана до коммита)

None других — план выполнен как написано с учётом ревизии (B4/M1/M6).

## Checkpoint (Task 3) — ОТЛОЖЕН

Task 3 (`checkpoint:human-action`, gate=blocking) — пропущен по явной инструкции родительского агента. Не выполнялось:
- Пользователь ещё НЕ выпустил WB_FINANCE_TOKEN (Персональный/Сервисный, scope «Финансы») в ЛК WB.
- Живой smoke-curl к `finance-api.wildberries.ru/api/v1/account/balance` — НЕ делался (нет токена, прод запрещён; отложен в план 24-09).
- **M6 не закрыт:** фактический scope-бит «Финансы» из декодированного JWT НЕ сверен с `REQUIRED_SCOPE_BITS.WB_FINANCE_TOKEN = [13]`. Значение `[13]` — предположение по официальной таблице WB, НЕ верифицировано эмпирически (проект уже знает исторический прецедент расхождения номера категории и JWT-бита — см. `lib/wb-jwt.ts` комментарий про bit 4 vs 30 для «Продвижения»). Когда пользователь выпустит токен — обязательно декодировать payload и обновить `[13]` при расхождении, иначе `validateWbToken` отклонит корректный токен на шаге scope-check.

## Known Stubs

Нет UI/данных-стабов — эта плита чисто backend-клиент + инфраструктура токена, mocked-тестами покрыт полностью. Живая интеграция (реальный токен) — предмет отдельного человеческого шага (Task 3) + деплой-плана 24-09.

## Self-Check: PASSED

- `lib/wb-finance-api.ts` — FOUND
- `tests/wb-finance-api.test.ts` — FOUND
- Commit 1f80b23 (Task 1) — FOUND (`git log --oneline`)
- Commit 62004cb (Task 2) — FOUND (`git log --oneline`)
- `npx vitest run tests/wb-finance-api.test.ts` — 4/4 passed
- `npx tsc --noEmit` — 0 errors
