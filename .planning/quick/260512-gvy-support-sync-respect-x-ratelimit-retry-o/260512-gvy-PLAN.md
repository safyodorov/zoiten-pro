---
phase: 260512-gvy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/wb-support-api.ts
  - lib/support-sync.ts
  - tests/support-sync.test.ts
autonomous: true
requirements:
  - GVY-01-questions-lock-persistent
must_haves:
  truths:
    - "При 429 на /api/v1/questions с X-Ratelimit-Retry > 60s в AppSetting сохраняется wbQuestionsLockedUntil = ISO-метка разблокировки"
    - "На последующих cron tick syncSupport НЕ вызывает listQuestions пока now < wbQuestionsLockedUntil — пропуск логируется как INFO с временем разблокировки в МСК"
    - "После успешного 2xx ответа /questions AppSetting wbQuestionsLockedUntil удаляется"
    - "Поведение listFeedbacks НЕ изменяется (feedbacks работает — sync продолжает их синхронизировать даже когда questions залочены)"
    - "Response shape /api/support-sync остаётся JSON-совместимым (cron systemd-unit + SupportSyncButton не ломаются)"
  artifacts:
    - path: "lib/wb-support-api.ts"
      provides: "Типизированная ошибка WbRateLimitError(retryAfterSec) при 429>cap из callApi"
      contains: "class WbRateLimitError"
    - path: "lib/support-sync.ts"
      provides: "Lock-aware syncSupport: проверка AppSetting('wbQuestionsLockedUntil') перед listQuestions, persist при поимке WbRateLimitError, очистка при успехе"
      contains: "wbQuestionsLockedUntil"
    - path: "tests/support-sync.test.ts"
      provides: "Тест: при существующем wbQuestionsLockedUntil > now listQuestions НЕ вызывается"
  key_links:
    - from: "lib/wb-support-api.ts callApi"
      to: "lib/support-sync.ts syncSupport catch block"
      via: "throw new WbRateLimitError(retrySec) вместо generic Error"
      pattern: "instanceof WbRateLimitError"
    - from: "lib/support-sync.ts syncSupport"
      to: "prisma.appSetting('wbQuestionsLockedUntil')"
      via: "findUnique перед listQuestions + upsert при WbRateLimitError + delete при 2xx"
      pattern: "wbQuestionsLockedUntil"
---

<objective>
Production bug: cron timer zoiten-support-sync каждые 15 мин дёргает WB /api/v1/questions и стабильно ловит 429 с X-Ratelimit-Retry=720s (12 мин). Cap=60s в callApi даёт throw, но cron tick = 15 мин < 720s — следующий запуск опять ловит 429. Уже ~2000 неудачных tick за 3 недели → WB anti-abuse начинает резать остальные endpoints WB_API_TOKEN.

Решение: персистентный lock через AppSetting('wbQuestionsLockedUntil'). При 429>cap записываем момент разблокировки, на каждом cron tick проверяем lock и пропускаем WB-вызов пока не пройдёт время. После 2xx — чистим lock.

Purpose: Прекратить дёрганье WB /questions при активном rate-limit, защитить токен WB_API_TOKEN от каскадной блокировки Statistics/Prices/Analytics endpoints.

Output: Исправленные lib/wb-support-api.ts (типизированная ошибка) + lib/support-sync.ts (lock-aware pre-check/persist/cleanup) + покрытие тестами.
</objective>

<execution_context>
@C:/Users/User/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/User/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/Users/User/zoiten-pro/CLAUDE.md
@C:/Users/User/zoiten-pro/lib/wb-support-api.ts
@C:/Users/User/zoiten-pro/lib/support-sync.ts
@C:/Users/User/zoiten-pro/tests/support-sync.test.ts

<interfaces>
<!-- Существующие контракты из codebase — executor использует напрямую, без exploration. -->

From lib/wb-support-api.ts:
```typescript
const FEEDBACKS_API = "https://feedbacks-api.wildberries.ru"
const RATE_LIMIT_FALLBACK_MS = 6000

// Текущая реализация callApi (lines 98-149) — throw generic Error при 429>cap:
async function callApi(baseUrl, token, path, init, attempt = 0): Promise<Response>
//   if (res.status === 429 && attempt === 0) {
//     const retry = Number(res.headers.get("X-Ratelimit-Retry")) || 0
//     const requestedMs = retry > 0 ? retry * 1000 : RATE_LIMIT_FALLBACK_MS
//     const MAX_RETRY_WAIT_MS = 60_000
//     if (requestedMs > MAX_RETRY_WAIT_MS) {
//       throw new Error(`WB API 429: rate-limit требует ожидания Ns — превышает cap 60s...`)
//     }
//     ... // 0..60s — sleep + retry(1)
//   }

export async function listQuestions(p: ListParams): Promise<Question[]>
export async function listFeedbacks(p: ListParams): Promise<Feedback[]>
```

From lib/support-sync.ts (syncSupport, lines 43-86):
```typescript
// Текущий цикл по questions (lines 69-86) — оборачивает listQuestions в try/catch,
// собирает в errors[]. WB вызов всегда происходит, lock не учитывается.
for (let skip = 0; ; skip += 10000) {
  try {
    const batch = await listQuestions({ isAnswered: opts.isAnswered, take: 10000, skip })
    questions.push(...batch)
    if (batch.length < 10000) break
  } catch (err) {
    errors.push(`Questions skip=${skip}: ${...}`)
    break
  }
}
```

From CLAUDE.md (паттерн AppSetting для daily counter, lib/wb-api.ts:14-45):
```typescript
// AppSetting key=value (String) — generic KV store, Phase 7
// Образец: wbAnalyticsDailyCounter хранит JSON {date, count}, lock-pattern в Phase 14/15
await prisma.appSetting.findUnique({ where: { key: "wbAnalyticsDailyCounter" } })
await prisma.appSetting.upsert({
  where: { key: "wbAnalyticsDailyCounter" },
  create: { key: "wbAnalyticsDailyCounter", value: JSON.stringify({...}) },
  update: { value: JSON.stringify({...}) },
})
```

From tests/support-sync.test.ts (lines 51-55, существующий appSetting mock):
```typescript
prisma: {
  // ...
  appSetting: {
    upsert: async () => ({}),
    // ← добавить findUnique + delete для нового теста
  },
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Типизированная ошибка WbRateLimitError в callApi</name>
  <files>lib/wb-support-api.ts, tests/wb-support-api.test.ts</files>
  <behavior>
    - Экспортировать `class WbRateLimitError extends Error` с public полями `retryAfterSec: number` и `endpoint: string` (URL path для логирования)
    - При 429 с `requestedMs > MAX_RETRY_WAIT_MS` в callApi (lib/wb-support-api.ts:122-127) бросать `new WbRateLimitError(Math.round(requestedMs / 1000), path)` ВМЕСТО generic Error
    - Сообщение ошибки сохранить идентичным существующему ("WB API 429: rate-limit требует ожидания Ns — превышает cap 60s, повторим на следующий cron tick") для обратной совместимости логов
    - НЕ менять поведение для 429 с retry ≤ 60s (sleep+retry осталось как было)
    - НЕ менять поведение для 401/403/5xx (другие throw остаются generic Error)
    - Существующий тест tests/wb-support-api.test.ts "ретраит при 429 с заголовком X-Ratelimit-Retry" (line 78-92) продолжает проходить (retry=1s ≤ cap, путь sleep+retry не тронут)
    - НОВЫЙ тест в tests/wb-support-api.test.ts: при 429 с X-Ratelimit-Retry=720 → ожидать `WbRateLimitError` с `retryAfterSec === 720` и `endpoint` содержит "/api/v1/questions" (использовать listQuestions из @/lib/wb-support-api)
  </behavior>
  <action>
    1. В lib/wb-support-api.ts перед `async function callApi(...)` добавить:
       ```typescript
       export class WbRateLimitError extends Error {
         constructor(public readonly retryAfterSec: number, public readonly endpoint: string) {
           super(
             `WB API 429: rate-limit требует ожидания ${retryAfterSec}s — превышает cap 60s, повторим на следующий cron tick`
           )
           this.name = "WbRateLimitError"
         }
       }
       ```
    2. В callApi заменить блок `if (requestedMs > MAX_RETRY_WAIT_MS) { throw new Error(...) }` на `throw new WbRateLimitError(Math.round(requestedMs / 1000), path)`. Текст сообщения совпадает с прежним (см. constructor выше) — никакая внешняя строковая проверка не сломается.
    3. В tests/wb-support-api.test.ts добавить новый `it(...)` в describe("listQuestions") (создать describe-блок если его нет, по паттерну existing describe("listFeedbacks")): мокать fetch 429 с `X-Ratelimit-Retry: "720"`, вызвать `listQuestions({take:1,skip:0})`, ожидать `await expect(...).rejects.toBeInstanceOf(WbRateLimitError)` и `await expect(...).rejects.toMatchObject({ retryAfterSec: 720, endpoint: expect.stringContaining("/api/v1/questions") })`.
    4. WHY типизированная ошибка а не возврат структуры: WbRateLimitError может вылететь из любого вызова через callApi (listFeedbacks тоже). В Task 2 будем ловить ТОЛЬКО WbRateLimitError именно вокруг listQuestions, остальные пути не должны быть затронуты.
  </action>
  <verify>
    <automated>npm test -- tests/wb-support-api.test.ts</automated>
  </verify>
  <done>WbRateLimitError экспортирован, новый тест проходит (instance + retryAfterSec=720 + endpoint содержит /questions), существующий retry-test продолжает зеленеть, листинг 401/403 не сломан</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Lock-aware syncSupport через AppSetting('wbQuestionsLockedUntil')</name>
  <files>lib/support-sync.ts, tests/support-sync.test.ts</files>
  <behavior>
    - **Pre-check**: перед циклом `for (let skip = 0; ; skip += 10000)` для questions (lib/support-sync.ts:71-86) syncSupport читает `AppSetting('wbQuestionsLockedUntil')`. Если value существует и парсится в Date > now — НЕ вызывать listQuestions, добавить в `errors` строку формата `"Questions locked until {МСК} (skipped)"` И `console.info` с тем же текстом + префикс `[support-sync]`. Цикл feedbacks выполняется как обычно.
    - **Persist при WbRateLimitError**: внутри catch блока вокруг listQuestions проверить `err instanceof WbRateLimitError`. Если да — upsert AppSetting('wbQuestionsLockedUntil') = `new Date(Date.now() + err.retryAfterSec * 1000).toISOString()` И `console.warn` с временем разблокировки в МСК. break (выходим из цикла, как сейчас). Для других ошибок (generic Error / network) — старое поведение: push в errors, break.
    - **Cleanup при успехе**: ПОСЛЕ успешного завершения questions-цикла (хотя бы один успешный listQuestions, даже если вернул пустой массив) — если в AppSetting есть wbQuestionsLockedUntil → `prisma.appSetting.delete({ where: { key: "wbQuestionsLockedUntil" } }).catch(() => {})` (silent, на случай race condition с конкурентным удалением).
    - **Feedbacks НЕ трогается** — никакой lock pre-check, никаких изменений в цикле feedbacks (lines 51-67). Если когда-нибудь feedbacks тоже зальются 429, это будет отдельная задача с собственным ключом lock.
    - **JSON response shape syncSupport** — поле `errors[]` остаётся, новых полей не добавляем. SupportSyncButton (Phase 8) читает `feedbacksSynced/questionsSynced/mediaSaved` — продолжают работать (questionsSynced остаётся 0 при skip).
    - **МСК format**: использовать `lockedUntilDate.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })` — паттерн совместим с logs (см. CLAUDE.md «Время: Moscow timezone»).
    - **НОВЫЕ тесты** в tests/support-sync.test.ts:
      a) "пропускает listQuestions если wbQuestionsLockedUntil > now": мок `prisma.appSetting.findUnique` возвращает `{ value: ISO(now+10мин) }`; вызов syncSupport; assert: `listQuestions` mock НЕ был вызван (`expect(listQuestions).not.toHaveBeenCalled()`), `result.errors` содержит строку с "locked until", `result.questionsSynced === 0`, feedbacks при этом синкаются (`listFeedbacks` вызван).
      b) "записывает wbQuestionsLockedUntil при WbRateLimitError": мок `listQuestions` бросает `new WbRateLimitError(720, "/api/v1/questions?...")`; spy на `prisma.appSetting.upsert`; assert: upsert вызван с `key: "wbQuestionsLockedUntil"` и `value` парсится в Date примерно `now + 720*1000ms ± 5s`.
      c) "удаляет wbQuestionsLockedUntil при успехе listQuestions": мок findUnique возвращает null (нет lock); listQuestions возвращает []; spy на `prisma.appSetting.delete`; assert: delete вызван с `key: "wbQuestionsLockedUntil"`. (Можно опционально: проверить что delete вызывается даже если findUnique вернул запись с прошедшей датой — но это покрывается логикой «если lock есть в БД но не активен → значит был активен раньше, чистим».)
  </behavior>
  <action>
    1. В lib/support-sync.ts наверху файла импорт: `import { listFeedbacks, listQuestions, listReturns, listChats, getChatEvents, downloadChatAttachment, WbRateLimitError, type Feedback, ... } from "@/lib/wb-support-api"` (добавить WbRateLimitError к существующему импорту).
    2. Объявить константу рядом с `LAST_EVENT_NEXT_KEY`: `const QUESTIONS_LOCK_KEY = "wbQuestionsLockedUntil"`.
    3. В функции syncSupport ПЕРЕД циклом `// 2. Questions` (line 70) добавить блок:
       ```typescript
       // Lock-aware pre-check: при 429 X-Ratelimit-Retry > 60s предыдущий tick
       // записал ISO unlock-time. Пропускаем WB-вызов до момента разблокировки.
       let questionsLocked = false
       const lockRow = await prisma.appSetting.findUnique({
         where: { key: QUESTIONS_LOCK_KEY },
       })
       if (lockRow?.value) {
         const unlockAt = new Date(lockRow.value)
         if (!Number.isNaN(unlockAt.getTime()) && unlockAt.getTime() > Date.now()) {
           const mskStr = unlockAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })
           const msg = `Questions locked until ${mskStr} МСК (skipped, WB rate-limit)`
           console.info(`[support-sync] ${msg}`)
           errors.push(msg)
           questionsLocked = true
         }
       }
       ```
    4. Обернуть существующий `for (let skip = 0; ; skip += 10000)` блок в `if (!questionsLocked) { ... }`. Внутри catch заменить generic push на:
       ```typescript
       } catch (err) {
         if (err instanceof WbRateLimitError) {
           const unlockAt = new Date(Date.now() + err.retryAfterSec * 1000)
           const mskStr = unlockAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })
           console.warn(
             `[support-sync] WB /questions 429 retry=${err.retryAfterSec}s — locking until ${mskStr} МСК`
           )
           try {
             await prisma.appSetting.upsert({
               where: { key: QUESTIONS_LOCK_KEY },
               create: { key: QUESTIONS_LOCK_KEY, value: unlockAt.toISOString() },
               update: { value: unlockAt.toISOString() },
             })
           } catch (lockErr) {
             errors.push(
               `wbQuestionsLockedUntil upsert: ${lockErr instanceof Error ? lockErr.message : "unknown"}`
             )
           }
           errors.push(
             `Questions skip=${skip}: ${err.message}`
           )
         } else {
           errors.push(
             `Questions skip=${skip}: ${err instanceof Error ? err.message : "unknown"}`
           )
         }
         break
       }
       ```
    5. ПОСЛЕ цикла (но внутри `if (!questionsLocked)` блока) добавить cleanup только если не было WbRateLimitError в этом проходе. Простейший способ — отдельный флаг `let questionsCallSucceeded = false`, ставим `true` в конце успешного `try` блока (после `if (batch.length < 10000) break`), и снаружи цикла:
       ```typescript
       if (questionsCallSucceeded && lockRow) {
         await prisma.appSetting
           .delete({ where: { key: QUESTIONS_LOCK_KEY } })
           .catch(() => {}) // silent: gone-already race ok
       }
       ```
       WHY: чистим lock ТОЛЬКО при подтверждённом 2xx, а не «не упало» (catch с другой ошибкой не должен чистить lock — он мог быть network glitch, lock остаётся валидным).
    6. В tests/support-sync.test.ts расширить prisma mock: добавить `findUnique` и `delete` в `appSetting`:
       ```typescript
       appSetting: {
         findUnique: vi.fn().mockResolvedValue(null),
         upsert: vi.fn().mockResolvedValue({}),
         delete: vi.fn().mockResolvedValue({}),
       },
       ```
       (НЕ забыть `import { vi }` уже есть в файле.)
    7. Добавить 3 новых `it(...)` блока в `describe("syncSupport")` (после существующих тестов):
       - тест (a): findUnique возвращает `{ value: new Date(Date.now() + 10*60*1000).toISOString() }`; mockReset listQuestions; вызвать syncSupport; assert `listQuestions` не вызван, `result.errors.some(e => e.includes("locked until"))`, `result.questionsSynced === 0`, `listFeedbacks` вызван.
       - тест (b): findUnique returns null; listQuestions mocked to throw `new (await import("@/lib/wb-support-api")).WbRateLimitError(720, "/api/v1/questions?take=10000&skip=0")`; вызвать syncSupport; assert appSetting.upsert вызван с key="wbQuestionsLockedUntil" и Date(value) приблизительно `Date.now() + 720000` (с tolerance ±5000ms через `Math.abs(...) < 5000`).
       - тест (c): findUnique returns null (нет lock); listQuestions mocked → returns `[]`; вызвать syncSupport; assert appSetting.delete НЕ вызван (lockRow null → нечего чистить). Дополнительно — отдельный it: findUnique returns `{ value: ISO(now - 1 минута) }` (прошлый lock истёк); listQuestions returns []; assert delete вызван с key="wbQuestionsLockedUntil" (cleanup устаревшего lock).
    8. WHY не идём в существующий путь `await new Promise((r) => setTimeout(r, 60_000))`: cap=60s в callApi оставляем нетронутым — он защищает от случайных мелких 429 (например, 30s или 45s, где simple sleep+retry эффективнее persist). Lock-pattern активируется именно для случая «retry > cap», который как раз и есть наша production-ситуация (720s).
    9. WHY НЕ трогаем /api/cron/support-sync-reviews/route.ts: он только делегирует в syncSupport — никакой логики lock на уровне HTTP-роута не нужно.
    10. WHY НЕ трогаем /api/support-sync/route.ts (ручной): он тоже зовёт syncSupport, lock-проверка автоматически применится и к ручному запуску. Это поведенчески правильно: если WB залочил, ручной клик тоже должен пропустить (иначе обходим anti-abuse).
  </action>
  <verify>
    <automated>npm test -- tests/support-sync.test.ts tests/wb-support-api.test.ts</automated>
  </verify>
  <done>3 новых теста (lock pre-check / lock persist / lock cleanup) проходят. Существующие тесты support-sync продолжают зеленеть. Запуск всей `npm test` не регрессирует.</done>
</task>

</tasks>

<verification>
**Type-check + lint + tests** (Rule 3):
```bash
npx tsc --noEmit
npm test
```

**Smoke test поведения (после deploy на VPS — ручной)**:
1. На VPS убедиться что в БД нет AppSetting с key='wbQuestionsLockedUntil' (`psql ... -c "SELECT * FROM \"AppSetting\" WHERE key='wbQuestionsLockedUntil';"`)
2. `journalctl -u zoiten-support-sync.timer -f` — дождаться следующего tick
3. После первого tick проверить:
   - logs: либо `WB /questions 429 retry=720s — locking until …` (если WB продолжает 429), либо ничего необычного (если WB разморозился);
   - psql: AppSetting `wbQuestionsLockedUntil` появилась с ISO-датой ~12 минут вперёд (в случае 429).
4. Дождаться следующего tick (через 15 мин):
   - logs: `Questions locked until {МСК} МСК (skipped, WB rate-limit)` (INFO-уровень, не ERROR);
   - НЕ должно быть нового вызова к WB /questions (можно подтвердить через WB seller portal monitoring или просто отсутствие 429 строк в логах).
5. После прохождения unlock-времени — следующий tick должен сделать реальный listQuestions; если 2xx → AppSetting удалена; если снова 429 → лок переписан на новое значение.
</verification>

<success_criteria>
- [ ] `npm test -- tests/wb-support-api.test.ts` — все тесты зелёные, включая новый тест на WbRateLimitError(720)
- [ ] `npm test -- tests/support-sync.test.ts` — все тесты зелёные, включая 3+ новых теста (pre-check / persist / cleanup)
- [ ] `npx tsc --noEmit` — без ошибок типизации (WbRateLimitError экспортирован/импортирован корректно)
- [ ] Существующее поведение feedbacks НЕ затронуто: при 429 на feedbacks (если когда-нибудь случится) лок не пишется, поведение остаётся прежним (cap 60s, throw)
- [ ] Существующее поведение для 429 с retry ≤ 60s НЕ затронуто: sleep+retry внутри callApi работает как раньше
- [ ] HTTP response shape /api/support-sync и /api/cron/support-sync-reviews остаётся прежней (cron systemd-unit + SupportSyncButton не ломаются)
- [ ] Console output на cron tick при активном lock — `[support-sync] Questions locked until {МСК} МСК (skipped, WB rate-limit)` (INFO-видимо в journalctl)
</success_criteria>

<output>
After completion, create `.planning/quick/260512-gvy-support-sync-respect-x-ratelimit-retry-o/260512-gvy-SUMMARY.md` со следующими разделами:
- Что сделано (по задачам)
- Решённая проблема (бизнес-контекст)
- Файлы изменены (с краткими diff-аннотациями)
- Тесты (новые + регрессия)
- Deploy-инструкция (ssh root@85.198.97.89 + bash deploy.sh + проверка psql AppSetting)
- Follow-ups (если обнаружились — например, аналогичный fix для feedbacks если когда-нибудь зальётся)

Update STATE.md: добавить в Quick Tasks Completed строку для `260512-gvy` с commit hash и статусом «Verified» после успешного npm test.
</output>
