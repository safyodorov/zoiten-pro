---
phase: 260513-dlr
plan: 01
type: quick
subsystem: support-sync / wb-rate-limit
tags: [bugfix, production-hotfix, rate-limit, wb-api, cooldown]
requirements: [QUICK-260513-DLR]
dependency_graph:
  requires:
    - lib/wb-cooldown.ts (setWbCooldownUntil — Backlog 999.1)
    - lib/support-sync.ts (Quick 260512-gvy lock-aware feedbacks/questions)
    - lib/wb-support-api.ts (WbRateLimitError class)
  provides:
    - Buffered TTL formula для всех 3 WB rate-limit lock keys
    - export const CRON_INTERVAL_SEC = 900, BUFFER_SEC = 120
  affects:
    - lib/wb-api.ts (transitively через setWbCooldownUntil — без правок кода)
    - lib/wb-support-api.ts callApi (transitively через setWbCooldownUntil)
    - cron support-sync.timer (zoiten-support-sync.timer = 15 мин)
tech_stack:
  added: []
  patterns: [buffer-formula-ttl, idempotent-max-lock]
key_files:
  created: []
  modified:
    - lib/wb-cooldown.ts
    - lib/support-sync.ts
    - tests/wb-cooldown.test.ts
    - tests/support-sync.test.ts
decisions:
  - "KISS: дублируем CRON_INTERVAL_SEC/BUFFER_SEC между support-sync.ts и wb-cooldown.ts (2 файла) — без shared helper module"
  - "Buffer формула: unlockAt = now + max(retryAfterSec, 900) + 120 — гарантирует minimum 1 пропуск cron tick (15 мин support-sync.timer + 2 мин drift)"
  - "Idempotent max() vs existing AppSetting сохранена: более далёкий lock не сокращается коротким новым retry"
  - "console.warn оставлен с исходным err.retryAfterSec (логируем что WB ответил, не наш effective)"
metrics:
  duration: 4min
  completed_date: "2026-05-13"
---

# Quick 260513-dlr: Support-sync lock buffer to outlive cron Summary

Расширили TTL персистентных WB rate-limit lock'ов (wbFeedbacksLockedUntil, wbQuestionsLockedUntil, wbCooldownUntil) buffer-формулой `now + max(retryAfterSec, 900) + 120` — гарантирует что lock переживает минимум 1 cron tick (15 мин) + 2 мин drift, устраняя infinite escalation petлю когда WB отдаёт `retryAfterSec=720s` (12 мин) < cron interval=15 мин.

## Что сделано

### Task 1 — Buffer formula в lib/wb-cooldown.ts

- Добавлены `export const CRON_INTERVAL_SEC = 900` и `export const BUFFER_SEC = 120` константы с inline-комментарием объясняющим причину.
- В `setWbCooldownUntil(retryAfterSec)`: заменено `const proposed = new Date(Date.now() + retryAfterSec * 1000)` на:
  ```typescript
  const effectiveSec = Math.max(retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC
  const proposed = new Date(Date.now() + effectiveSec * 1000)
  ```
- Idempotent max() vs existing AppSetting НЕ тронут — короткое значение по-прежнему не сокращает существующий более далёкий lock.
- **Commit:** `2edda6d`

### Task 2 — Buffer formula в lib/support-sync.ts

- Добавлены `const CRON_INTERVAL_SEC = 900` и `const BUFFER_SEC = 120` плоские константы (KISS — НЕ shared helper module).
- В catch блоках для `feedbacks` (~88) и `questions` (~154): заменено `const unlockAt = new Date(Date.now() + err.retryAfterSec * 1000)` на:
  ```typescript
  const effectiveSec = Math.max(err.retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC
  const unlockAt = new Date(Date.now() + effectiveSec * 1000)
  ```
- `console.warn(...retry=${err.retryAfterSec}s...)` оставлен без изменений — логируем оригинальный WB-ответ, не effective lock TTL.
- **Commit:** `b1b0c0e`

### Task 3 — Полный regression + tsc + integration sanity

- `npx tsc --noEmit` → **0 errors**.
- `npx vitest run` → 441 passed | 38 failed (pre-existing, не связаны с нашими правками — verified через checkout 5acda43).
- Затронутые suite (4): tests/wb-cooldown.test.ts + tests/support-sync.test.ts + tests/wb-fetch-rate-limit.test.ts + tests/wb-support-api.test.ts → **43 passed / 0 failed**.
- Integration sanity: `wb-api.ts:708` и `wb-support-api.ts:164` вызывают `setWbCooldownUntil(retryAfterSec)` — новая buffer-формула применяется автоматически без правок callers.
- Sanity grep подтверждает что нет legacy формулы `Date.now() + ...retryAfterSec...1000` без `Math.max` в `lib/`.

## Файлы изменены

| Файл                       | Изменения                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `lib/wb-cooldown.ts`       | +2 export const + buffer формула в setWbCooldownUntil + inline-комментарии                 |
| `lib/support-sync.ts`      | +2 local const (CRON_INTERVAL_SEC/BUFFER_SEC) + buffer формула в 2 catch блоках             |
| `tests/wb-cooldown.test.ts`| 10 → 13 тестов (+3 buffer формула: short-retry domination, retry+buffer, constants export) |
| `tests/support-sync.test.ts`| 12 → 14 тестов (+2 buffer формула: retry=60s interval-доминирует, retry=3600s retry-доминирует), 2 existing updated на новые expectations |

## Тесты

### Новые / обновлённые (Quick 260513-dlr)

**`tests/wb-cooldown.test.ts`** (4 buffer-related):
1. `"записывает новый cooldown если нет существующего (buffer formula)"` — updated: retry=720s → 1020s lock
2. `"retryAfterSec ниже cron interval — buffer interval доминирует"` — NEW: retry=60s → 1020s lock
3. `"расширяет cooldown если новый retry+buffer длиннее существующего"` — updated: existing=60s + retry=60s → upsert на 1020s
4. `"retry=3600s (>> CRON_INTERVAL_SEC) — retry+buffer (3720s) доминирует над interval"` — NEW: retry=3600s → 3720s lock
5. `"экспортирует CRON_INTERVAL_SEC=900 и BUFFER_SEC=120"` — NEW: constants describe block

**`tests/support-sync.test.ts`** (4 buffer-related):
1. `"записывает wbQuestionsLockedUntil при WbRateLimitError (buffer formula)"` — updated: retry=720s → 1020s lock
2. `"записывает wbFeedbacksLockedUntil при WbRateLimitError на Feedbacks (buffer formula)"` — updated: добавлены timing assertions retry=720s → 1020s
3. `"buffer: retryAfterSec=60 (< CRON_INTERVAL_SEC) → lock ≈ now + 1020s (interval доминирует)"` — NEW
4. `"buffer: retryAfterSec=3600 (>> CRON_INTERVAL_SEC) → lock ≈ now + 3720s (retry+buffer)"` — NEW

### Regression GREEN

- `tests/wb-cooldown.test.ts`: 13/13 GREEN
- `tests/support-sync.test.ts`: 14/14 GREEN
- `tests/wb-fetch-rate-limit.test.ts`: 4/4 GREEN (без изменений)
- `tests/wb-support-api.test.ts`: 12/12 GREEN (без изменений)
- Все pre-check / cleanup тесты (lock skip, lock delete on success, null lockRow) → GREEN без изменений (формула меняется только в catch блоке).

### Pre-existing failures (out of scope)

Полный прогон `npx vitest run` показал 38 failures в 9 файлах: `tests/template-picker.test.ts`, `tests/appeal-actions.test.ts`, `tests/customer-actions.test.ts`, `tests/customer-sync-chat.test.ts`, `tests/merge-customers.test.ts`, `tests/support-sync-chats.test.ts`, `tests/support-sync-returns.test.ts`, etc. Verified через `git checkout 5acda43 -- . && npx vitest run` — те же 38 failures существуют в parent commit ДО наших правок. SCOPE BOUNDARY соблюдён.

## Deviations from Plan

None — план выполнен exactly как написано:
- Все 5 done criteria для Task 1 пройдены.
- Все 6 done criteria для Task 2 пройдены.
- Все 4 done criteria для Task 3 пройдены.

Сценарий до фикса (production journalctl 2026-05-13):
```
T+0   : cron tick → WB /questions 429 retry=720s → lock until T+720s (12 мин)
T+900 : cron tick → lock истёк 3 мин назад → WB /questions 429 retry=720s → infinite loop
        wbCooldownUntil бесконечно продлевается → ВСЕ WB syncs мёртвы
```

Сценарий после фикса:
```
T+0   : cron tick → WB /questions 429 retry=720s → lock until T+1020s (17 мин)
T+900 : cron tick → lock ещё активен (осталось 120s) → skip listQuestions
T+1800: cron tick → lock истёк → пробуем listQuestions → если WB остыл, 2xx; lock удалён
        (если WB ещё 429 — снова +1020s, но один пропуск был → нагрузка ↓)
```

## Self-Check

- [x] `lib/wb-cooldown.ts` — FOUND, содержит `export const CRON_INTERVAL_SEC = 900` и `export const BUFFER_SEC = 120`
- [x] `lib/support-sync.ts` — FOUND, содержит local `const CRON_INTERVAL_SEC = 900` и `const BUFFER_SEC = 120`
- [x] `tests/wb-cooldown.test.ts` — FOUND, 13 тестов GREEN
- [x] `tests/support-sync.test.ts` — FOUND, 14 тестов GREEN
- [x] Commit `2edda6d` (Task 1) — FOUND in git log
- [x] Commit `b1b0c0e` (Task 2) — FOUND in git log

## Self-Check: PASSED

## Deploy Instruction

```bash
ssh root@85.198.97.89 'cd /opt/zoiten-pro && bash deploy.sh'

# Затем verify что cooldown переживает следующий cron tick:
journalctl -u zoiten-erp.service -f | grep -E 'cooldown|locked|429'

# Можно также подсмотреть состояние lock-ключей в БД:
ssh root@85.198.97.89 'sudo -u postgres psql zoiten_erp -c "SELECT key, value FROM \"AppSetting\" WHERE key IN ('"'"'wbCooldownUntil'"'"','"'"'wbQuestionsLockedUntil'"'"','"'"'wbFeedbacksLockedUntil'"'"');"'
```

**Verification:** после первого 429 на проде, значение `value` в БД должно быть `now + ~1020s` (17 мин), а не `now + 720s` (12 мин). Cron tick через 15 мин должен залогировать `Questions locked until ... МСК (skipped, WB rate-limit)` вместо повторного 429 от WB.
