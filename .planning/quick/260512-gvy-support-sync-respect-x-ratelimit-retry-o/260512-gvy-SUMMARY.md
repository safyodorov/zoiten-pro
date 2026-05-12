---
phase: 260512-gvy
plan: 01
subsystem: support-sync
tags: [rate-limit, app-setting, lock, questions, wb-api, tdd]
dependency_graph:
  requires: [AppSetting model (Phase 7), WbRateLimitError (this plan Task 1)]
  provides: [wbQuestionsLockedUntil lock mechanism, WbRateLimitError typed error]
  affects: [lib/wb-support-api.ts, lib/support-sync.ts, tests/]
tech_stack:
  added: []
  patterns: [AppSetting KV persistent lock, instanceof typed error catch]
key_files:
  created: []
  modified:
    - lib/wb-support-api.ts
    - lib/support-sync.ts
    - tests/wb-support-api.test.ts
    - tests/support-sync.test.ts
decisions:
  - WbRateLimitError как отдельный класс (не generic Error) — ловим только вокруг listQuestions, feedbacks/returns не затронуты
  - Lock через AppSetting (не in-memory) — персистентен между cron tick-ами
  - questionsCallSucceeded флаг — cleanup ТОЛЬКО при подтверждённом 2xx, network glitch не сбрасывает lock
  - resetAllMocks() вместо clearAllMocks() в afterEach — Once-очереди не протекают между тестами
metrics:
  duration: "~15 min"
  completed_date: "2026-05-12"
  tasks: 2
  files: 4
---

# Quick Task 260512-gvy: support-sync respect X-Ratelimit-Retry

**One-liner:** Персистентный lock через AppSetting('wbQuestionsLockedUntil') при 429>60s на /questions — останавливает 2000+ лишних WB-вызовов за 3 недели.

## Что сделано

### Task 1: WbRateLimitError в callApi (lib/wb-support-api.ts)

- Добавлен `export class WbRateLimitError extends Error` с полями `retryAfterSec: number` и `endpoint: string`
- В `callApi`: `throw new WbRateLimitError(Math.round(requestedMs / 1000), path)` вместо `throw new Error(...)` при 429 с retry > cap 60s
- Текст сообщения сохранён идентичным прежнему — обратная совместимость логов
- Поведение для retry ≤ 60s (sleep+retry) не изменено
- Поведение 401/403/5xx не изменено

### Task 2: Lock-aware syncSupport (lib/support-sync.ts)

**Pre-check перед listQuestions:**
```typescript
const lockRow = await prisma.appSetting.findUnique({ where: { key: QUESTIONS_LOCK_KEY } })
if (lockRow?.value) {
  const unlockAt = new Date(lockRow.value)
  if (!isNaN(unlockAt.getTime()) && unlockAt.getTime() > Date.now()) {
    // skip + errors.push("Questions locked until {МСК} МСК (skipped, WB rate-limit)")
    // console.info("[support-sync] ...")
    questionsLocked = true
  }
}
```

**Persist при WbRateLimitError:**
```typescript
if (err instanceof WbRateLimitError) {
  // upsert AppSetting('wbQuestionsLockedUntil') = now + retryAfterSec * 1000
  // console.warn("[support-sync] WB /questions 429 retry=720s — locking until ...")
}
```

**Cleanup при 2xx:**
```typescript
if (questionsCallSucceeded && lockRow) {
  await prisma.appSetting.delete({ where: { key: QUESTIONS_LOCK_KEY } }).catch(() => {})
}
```

## Решённая проблема

production cron `zoiten-support-sync` каждые 15 мин бьёт WB `/api/v1/questions`. WB отвечает 429 с `X-Ratelimit-Retry=720s` (12 мин). callApi cap=60s → throw, но cron tick=15 мин → следующий запуск снова ловит 429. ~2000 лишних вызовов за 3 недели → WB anti-abuse начал резать Statistics/Prices/Analytics endpoints.

После исправления:
1. Первый 429 → lock записывается в БД (AppSetting), WB вызов не повторяется 12 минут
2. Следующие tick-и: проверяют lock → пропускают listQuestions, feedbacks синкаются нормально
3. После разблокировки: первый успешный 2xx → lock удаляется

## Файлы изменены

| Файл | Изменения |
|------|-----------|
| `lib/wb-support-api.ts` | +18 строк: class WbRateLimitError + заменён throw generic |
| `lib/support-sync.ts` | +44 строки: import WbRateLimitError, QUESTIONS_LOCK_KEY константа, lock pre-check/persist/cleanup блок |
| `tests/wb-support-api.test.ts` | +32 строки: новый тест WbRateLimitError(720) в describe("listQuestions") |
| `tests/support-sync.test.ts` | +178 строк: mock расширен (findUnique/delete), 4 новых it(), resetAllMocks fix |

## Тесты

**Новые тесты (tests/wb-support-api.test.ts):**
- "бросает WbRateLimitError при 429 с X-Ratelimit-Retry=720" — instanceof + retryAfterSec=720 + endpoint содержит /questions

**Новые тесты (tests/support-sync.test.ts):**
- "пропускает listQuestions если wbQuestionsLockedUntil > now" — listQuestions НЕ вызван, errors содержит "locked until", feedbacks работают
- "записывает wbQuestionsLockedUntil при WbRateLimitError" — upsert с корректной датой (±5s)
- "удаляет wbQuestionsLockedUntil при успехе listQuestions (lockRow есть)" — delete вызван
- "НЕ удаляет wbQuestionsLockedUntil если lockRow = null" — delete НЕ вызван

**Регрессия:**
- `tests/wb-support-api.test.ts`: 11/11 GREEN (был 11/11)
- `tests/support-sync.test.ts`: 10/10 GREEN (был 6/6 — 3 из которых были скрыто сломаны clearAllMocks багом)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing test isolation bug в support-sync.test.ts**
- **Found during:** Task 2 GREEN phase
- **Issue:** `vi.clearAllMocks()` очищает ТОЛЬКО call history, но НЕ `mockResolvedValueOnce` очереди. Если тест ставил `.mockResolvedValueOnce([batch]).mockResolvedValueOnce([])` и pagination прерывалась после первого вызова (1 < 5000), второй Once ([]) оставался в очереди и ломал следующий тест.
- **Fix:** `afterEach(clearAllMocks → resetAllMocks)` + `beforeEach` восстанавливает дефолтные значения vi.fn(). Убраны лишние `.mockResolvedValueOnce([])` в тестах где batch < chunk_size.
- **Files modified:** `tests/support-sync.test.ts`
- **Commit:** 0fb279e

**2. [Rule 1 - Bug] WbRateLimitError instanceof check через mock границу**
- **Found during:** Task 2 — "записывает wbQuestionsLockedUntil" падал в полной suite но проходил в isolation
- **Issue:** Та же корень — Once-очередь от "пропускает" теста (mockResolvedValueOnce([]) для listQuestions) потреблялась следующим тестом вместо WbRateLimitError rejection
- **Fix:** см. п.1 (resetAllMocks)
- **Files modified:** `tests/support-sync.test.ts`
- **Commit:** 0fb279e

## Deploy-инструкция

```bash
# 1. Деплой (пользователь решает когда)
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"

# 2. Проверить что нет старого lock (до первого tick-а)
ssh root@85.198.97.89 "psql -U zoiten zoiten_erp -c \"SELECT * FROM \\\"AppSetting\\\" WHERE key='wbQuestionsLockedUntil';\""
# Ожидаем: 0 rows

# 3. Дождаться следующего tick (journalctl покажет)
# journalctl -u zoiten-support-sync.timer -f

# Если WB продолжает 429:
# WARN: [support-sync] WB /questions 429 retry=720s — locking until {МСК} МСК
# psql покажет: key='wbQuestionsLockedUntil', value='2026-05-12T...' (~12 минут вперёд)

# Следующий tick (через 15 мин):
# INFO: [support-sync] Questions locked until {МСК} МСК (skipped, WB rate-limit)
# НЕ должно быть нового вызова к WB /questions (нет 429 строк)

# После прохождения lock-времени:
# Если 2xx → AppSetting удалена, sync восстановлен
# Если снова 429 → lock переписан на новое значение
```

## Addendum (2026-05-12, commit 4a50d97): Feedbacks lock тоже добавлен

После первого деплоя обнаружилось, что **Feedbacks теперь тоже ловит 429** (242с retry) — попал в ту же ловушку из-за rate-limit cascade этого дня. Application того же паттерна:

- `FEEDBACKS_LOCK_KEY = "wbFeedbacksLockedUntil"` константа.
- Pre-check перед feedbacks loop → skip если locked.
- Persist при `WbRateLimitError` (callApi уже бросает корректно — общий код).
- Cleanup на 2xx.
- +2 теста: skip-Feedbacks-locked и persist-Feedbacks-lock-on-429.

**Production verification:** через несколько триггеров cron'а оба ключа записались (`wbQuestionsLockedUntil`, `wbFeedbacksLockedUntil`), и оба endpoint'а корректно пропускаются:
```
"errors":[
  "Feedbacks locked until 12.05.2026, 12:50:31 МСК (skipped, WB rate-limit)",
  "Questions locked until 12.05.2026, 12:50:31 МСК (skipped, WB rate-limit)"
]
```

## Follow-ups

1. **Мониторинг**: можно добавить счётчик в AppSetting (`wbQuestionsLockCount` / `wbFeedbacksLockCount`) для алертинга если lock активируется слишком часто — знак что WB rate-limit policy изменилась.

2. **Ручной сброс lock**: если нужно сбросить lock досрочно — `DELETE FROM "AppSetting" WHERE key IN ('wbQuestionsLockedUntil', 'wbFeedbacksLockedUntil');` в psql.

3. **Generalize pattern**: если ещё один endpoint попадёт под тот же 429>cap (chat-sync, returns-sync) — вытащить lock-логику в helper `withRateLimitLock(key, fetchFn)` чтобы избежать копипасты. Пока 2 endpoint'а — приемлемо.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| lib/wb-support-api.ts | FOUND |
| lib/support-sync.ts | FOUND |
| tests/wb-support-api.test.ts | FOUND |
| tests/support-sync.test.ts | FOUND |
| SUMMARY.md | FOUND |
| commit 13376ad (WbRateLimitError) | FOUND |
| commit 0fb279e (lock-aware syncSupport) | FOUND |
| npx tsc --noEmit | PASSED (0 errors) |
| npm test (support files) | PASSED (21/21) |
