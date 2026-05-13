---
phase: 260513-dlr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/support-sync.ts
  - lib/wb-cooldown.ts
  - tests/support-sync.test.ts
  - tests/wb-cooldown.test.ts
autonomous: true
requirements:
  - QUICK-260513-DLR
user_setup: []

must_haves:
  truths:
    - "Lock записывается на max(retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC секунд вперёд"
    - "При retryAfterSec=720s (WB реальный сценарий) lock живёт ≥17 мин — переживает следующий cron tick (T+15мин)"
    - "При retryAfterSec=60s (короткий 429) lock всё равно живёт ≥17 мин — interval доминирует, защищает от каскадного hammering"
    - "setWbCooldownUntil идемпотентность max() сохраняется: уже более далёкий lock не сокращается коротким новым retry"
    - "Все 21 существующих теста (support-sync 10 + wb-cooldown 7 + wb-fetch-rate-limit 4 + wb-support-api 11) остаются GREEN"
  artifacts:
    - path: "lib/support-sync.ts"
      provides: "Buffered lock_unlock_at для wbFeedbacksLockedUntil и wbQuestionsLockedUntil"
      contains: "CRON_INTERVAL_SEC = 900"
    - path: "lib/wb-cooldown.ts"
      provides: "Buffered cooldown для wbCooldownUntil (global WB_API_TOKEN bus)"
      contains: "CRON_INTERVAL_SEC = 900"
    - path: "tests/support-sync.test.ts"
      provides: "Тесты buffer-формулы для обоих lock-ключей"
    - path: "tests/wb-cooldown.test.ts"
      provides: "Тесты buffer-формулы для setWbCooldownUntil"
  key_links:
    - from: "syncSupport catch(WbRateLimitError)"
      to: "AppSetting('wbFeedbacksLockedUntil'/'wbQuestionsLockedUntil')"
      via: "new Date(Date.now() + (max(retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC) * 1000)"
      pattern: "Math\\.max\\(.*retryAfterSec.*CRON_INTERVAL_SEC.*\\).*BUFFER_SEC"
    - from: "wb-cooldown.setWbCooldownUntil(retryAfterSec)"
      to: "AppSetting('wbCooldownUntil')"
      via: "proposed = now + (max(retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC) seconds"
      pattern: "Math\\.max\\(.*retryAfterSec.*CRON_INTERVAL_SEC.*\\)"
---

<objective>
Расширить TTL персистентных WB rate-limit lock'ов (Feedbacks/Questions + global cooldown bus) так, чтобы lock всегда переживал хотя бы один cron-tick.

Production journalctl 2026-05-13 показывает 26 подряд тиков support-sync, каждый ловит /questions 429 retry=720s (12 мин). zoiten-support-sync.timer = 15 мин. Lock истекает за 3 мин ДО следующего тика → cron снова стучит → новый 429 → lock переписывается → бесконечная петля. wbCooldownUntil (global bus) подвергается тому же продлению → ВСЕ WB_API_TOKEN syncs (Statistics/Prices/Tariffs/Analytics/Content) заблокированы навсегда.

Решение: формула unlock_at = now + max(retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC, где CRON_INTERVAL_SEC = 900 (15 мин), BUFFER_SEC = 120 (2 мин). При retryAfterSec=720 → lock = now + 1020s = 17 мин (переживает следующий тик T+15м). При retryAfterSec=60 → lock = now + 1020s. При retryAfterSec=3600 → lock = now + 3720s (час с буфером).

Purpose: устранить класс «WB anti-abuse infinite escalation» — гарантировать что после первого 429 cron минимум 1 раз ПРОПУСКАЕТ WB-вызов, WB-сторона остывает.

Output: 2 файла lib изменены, 2 файла tests расширены, vitest GREEN, готово к deploy через `ssh root@85.198.97.89 'cd /opt/zoiten-pro && bash deploy.sh'`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/quick/260512-gvy-support-sync-respect-x-ratelimit-retry-o/260512-gvy-SUMMARY.md
@lib/support-sync.ts
@lib/wb-cooldown.ts
@lib/wb-support-api.ts
@tests/support-sync.test.ts
@tests/wb-cooldown.test.ts
@tests/wb-fetch-rate-limit.test.ts

<interfaces>
<!-- Контракты из существующего кода — executor использует напрямую, без exploration -->

From lib/wb-support-api.ts:
```typescript
export class WbRateLimitError extends Error {
  constructor(
    public readonly retryAfterSec: number,
    public readonly endpoint: string
  )
  // ловится: err instanceof WbRateLimitError
  // поля: err.retryAfterSec (sec), err.endpoint (path)
}
```

From lib/wb-cooldown.ts (текущий):
```typescript
const COOLDOWN_KEY = "wbCooldownUntil"
export async function setWbCooldownUntil(retryAfterSec: number): Promise<Date>
// СЕЙЧАС: proposed = new Date(Date.now() + retryAfterSec * 1000)
// max() против существующего AppSetting — оставить как есть
// CHANGE: proposed = new Date(Date.now() + (max(retryAfterSec, 900) + 120) * 1000)
```

From lib/support-sync.ts (текущий):
```typescript
const QUESTIONS_LOCK_KEY = "wbQuestionsLockedUntil"
const FEEDBACKS_LOCK_KEY = "wbFeedbacksLockedUntil"

// В catch блоке WbRateLimitError для feedbacks (строка ~88):
const unlockAt = new Date(Date.now() + err.retryAfterSec * 1000)
// CHANGE → const unlockAt = new Date(Date.now() + (Math.max(err.retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC) * 1000)

// В catch блоке WbRateLimitError для questions (строка ~154):
const unlockAt = new Date(Date.now() + err.retryAfterSec * 1000)
// CHANGE → const unlockAt = new Date(Date.now() + (Math.max(err.retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC) * 1000)
```

Test infrastructure (tests/support-sync.test.ts):
- existing `mockLocks(prisma, {feedbacks?, questions?})` helper в describe scope
- existing tests "записывает wbQuestionsLockedUntil при WbRateLimitError" + "записывает wbFeedbacksLockedUntil ..." — assertions проверяют storedDate vs (before + 720*1000) с tolerance 5s → ПОТРЕБУЕТСЯ ОБНОВИТЬ так как формула меняется на (max(720,900)+120)*1000 = 1020*1000

Test infrastructure (tests/wb-cooldown.test.ts):
- existing test "записывает новый cooldown если нет существующего" — assert `unlockAt.getTime() >= before + 720*1000 - 5` → ПОТРЕБУЕТСЯ ОБНОВИТЬ на формулу 1020*1000
- existing test "игнорирует короткий retry если существующий cooldown дольше" — должен остаться GREEN: max-логика против existing AppSetting не меняется, только формула для proposed
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Buffer formula в lib/wb-cooldown.ts + tests update</name>
  <files>lib/wb-cooldown.ts, tests/wb-cooldown.test.ts</files>
  <behavior>
    После изменения формулы setWbCooldownUntil:
    - Test 1 (existing, обновить): setWbCooldownUntil(720) при пустом существующем → unlockAt ≈ now + 1020s (было now + 720s). max(720, 900) + 120 = 1020.
    - Test 2 (existing, обновить): setWbCooldownUntil(60) при пустом → unlockAt ≈ now + 1020s. interval дoминирует.
    - Test 3 (existing, должен остаться GREEN): "игнорирует короткий retry если существующий cooldown дольше" — existing=Date.now()+3600s, setWbCooldownUntil(60). Proposed = now + max(60,900)+120 = 1020s < 3600s → max() против existing → return existing (3600s). НЕ upsert.
    - Test 4 (NEW): "расширяет cooldown если новый retry+buffer длиннее существующего" — existing=now+60s, setWbCooldownUntil(60). Proposed=now+1020s > existing 60s → upsert на 1020s. Заменяет existing test "расширяет cooldown если новый retry дольше существующего" (там был 3600s — теперь 60s достаточно потому что buffer добавляет до 1020s).
    - Test 5 (NEW): "буфер константы экспортируются" — `import { CRON_INTERVAL_SEC, BUFFER_SEC } from "@/lib/wb-cooldown"` → 900 и 120 соответственно.
  </behavior>
  <action>
    1) В `lib/wb-cooldown.ts`:
       - Добавить `export const CRON_INTERVAL_SEC = 900` (15 мин support-sync.timer).
       - Добавить `export const BUFFER_SEC = 120` (2 мин safety margin).
       - В `setWbCooldownUntil(retryAfterSec)`: заменить строку `const proposed = new Date(Date.now() + retryAfterSec * 1000)` на:
         ```typescript
         const effectiveSec = Math.max(retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC
         const proposed = new Date(Date.now() + effectiveSec * 1000)
         ```
       - max() сравнение с existing AppSetting НЕ ТРОГАТЬ — идемпотентность сохраняется.
       - Сохранить top-comment блок; добавить inline-комментарий объясняющий buffer (пример: «// Lock переживает хотя бы 1 cron tick (15 мин) + 2 мин на drift»).

    2) В `tests/wb-cooldown.test.ts`:
       - Обновить тест "записывает новый cooldown если нет существующего" (строки ~60-72): после `setWbCooldownUntil(720)` ожидать `unlockAt.getTime() >= before + (720 + 900 - 720 + 120) * 1000 - 5` = `before + 1020 * 1000 - 5`. Точнее: `expect(unlockAt.getTime()).toBeGreaterThanOrEqual(before + 1020 * 1000 - 5)`, `expect(unlockAt.getTime()).toBeLessThanOrEqual(after + 1020 * 1000 + 5)`.
       - Обновить тест "расширяет cooldown если новый retry дольше существующего": после `setWbCooldownUntil(3600)` → proposed=now+max(3600,900)+120=3720s. Assert `result.getTime() >= now + 3720*1000 - 5` (раньше было простое `> existing`). Оставить shortExisting=60s; проверить что upsert вызван.
       - ДОБАВИТЬ тест: `it("retryAfterSec ниже cron interval — buffer interval доминирует", async ...)` — `findUniqueMock.mockResolvedValueOnce(null); await setWbCooldownUntil(60); expect(upsertMock).toHaveBeenCalled();` + проверить что proposed ≈ now+1020s.
       - ДОБАВИТЬ describe("constants") с тестом `it("экспортирует CRON_INTERVAL_SEC=900 и BUFFER_SEC=120", ...)`.
       - Существующий тест "игнорирует короткий retry если существующий cooldown дольше" должен остаться GREEN без изменений (longExisting=3600s, setWbCooldownUntil(60) → proposed=1020s < 3600s → existing wins). 
       - Тест "retryAfterSec=0 или отрицательный — no-op" — оставить как есть (early return до buffer-формулы).

    Reference: lib/wb-cooldown.ts:42-61 — функция setWbCooldownUntil. tests/wb-cooldown.test.ts:59-104 — describe("setWbCooldownUntil").
  </action>
  <verify>
    <automated>npx vitest run tests/wb-cooldown.test.ts</automated>
  </verify>
  <done>
    - `lib/wb-cooldown.ts` экспортирует `CRON_INTERVAL_SEC = 900` и `BUFFER_SEC = 120`.
    - `setWbCooldownUntil(60)` при пустом AppSetting записывает unlock через ~1020s.
    - `setWbCooldownUntil(720)` при пустом AppSetting записывает unlock через ~1020s (max доминирует над retryAfterSec=720 потому что 720<900).
    - Idempotent max() vs existing AppSetting НЕ сломан (test "игнорирует короткий retry" GREEN).
    - vitest run tests/wb-cooldown.test.ts → GREEN (минимум 7 тестов, минимум 1 новый).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Buffer formula в lib/support-sync.ts + tests update</name>
  <files>lib/support-sync.ts, tests/support-sync.test.ts</files>
  <behavior>
    После изменения формулы lock_unlock_at в catch блоках:
    - Test 1 (existing, обновить): listFeedbacks throws WbRateLimitError(720) → AppSetting('wbFeedbacksLockedUntil').upsert вызван со storedDate ≈ now + 1020s (было 720s). max(720,900)+120 = 1020.
    - Test 2 (existing, обновить): listQuestions throws WbRateLimitError(720) → AppSetting('wbQuestionsLockedUntil').upsert вызван со storedDate ≈ now + 1020s.
    - Test 3 (NEW): listQuestions throws WbRateLimitError(60) → storedDate ≈ now + 1020s (interval доминирует, retry < interval).
    - Test 4 (NEW): listFeedbacks throws WbRateLimitError(3600) → storedDate ≈ now + 3720s (retry > interval, buffer добавляется к retry).
    - Test 5 (existing, GREEN без изменений): pre-existing lock сравнивается с `Date.now()` — формула меняется только в catch, pre-check не трогается.
  </behavior>
  <action>
    1) В `lib/support-sync.ts`:
       - Добавить в начало файла после imports: `const CRON_INTERVAL_SEC = 900` и `const BUFFER_SEC = 120` (рядом с QUESTIONS_LOCK_KEY / FEEDBACKS_LOCK_KEY). KISS — НЕ shared helper module, плоские const.
       - В catch блоке для feedbacks (примерно строка 88, внутри `if (err instanceof WbRateLimitError)`): заменить
         ```typescript
         const unlockAt = new Date(Date.now() + err.retryAfterSec * 1000)
         ```
         на
         ```typescript
         const effectiveSec = Math.max(err.retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC
         const unlockAt = new Date(Date.now() + effectiveSec * 1000)
         ```
       - В catch блоке для questions (примерно строка 154, симметрично) — то же самое.
       - Inline-комментарий: «// Buffer: lock должен пережить минимум 1 cron tick (15 мин) — иначе T+15м снова стучим WB.»
       - console.warn строки оставить без изменений (`retry=${err.retryAfterSec}s` — это исходный retry от WB, корректный лог).

    2) В `tests/support-sync.test.ts`:
       - Обновить тест "записывает wbQuestionsLockedUntil при WbRateLimitError" (строки ~376-407):
         - Изменить assertions:
           ```typescript
           const EXPECTED_SEC = Math.max(720, 900) + 120 // = 1020
           expect(Math.abs(storedDate - (before + EXPECTED_SEC * 1000))).toBeLessThan(5000)
           expect(Math.abs(storedDate - (after + EXPECTED_SEC * 1000))).toBeLessThan(5000 + (after - before))
           ```
       - Обновить тест "записывает wbFeedbacksLockedUntil при WbRateLimitError на Feedbacks" (строки ~409-430): сейчас он только проверяет что upsert вызван с ключом feedbacks. Добавить assertions на storedDate ≈ now + 1020s по тому же паттерну (вытащить upsertCall, проверить timing).
       - ДОБАВИТЬ тест: `it("buffer: retryAfterSec=60 (< CRON_INTERVAL_SEC) → lock ≈ now + 1020s (interval доминирует)", ...)`. listQuestions.mockRejectedValueOnce(new WbRateLimitError(60, "/api/v1/questions")). Assert storedDate ≈ now + 1020*1000.
       - ДОБАВИТЬ тест: `it("buffer: retryAfterSec=3600 (>> CRON_INTERVAL_SEC) → lock ≈ now + 3720s (retry+buffer)", ...)`. listFeedbacks.mockRejectedValueOnce(new WbRateLimitError(3600, "/api/v1/feedbacks")). Assert storedDate ≈ now + 3720*1000.
       - Существующие тесты "пропускает listQuestions если ... > now", "пропускает listFeedbacks если ... > now", "удаляет ... при успехе", "НЕ удаляет ... если lockRow=null" — должны остаться GREEN без изменений (формула меняется только в catch блоке, pre-check читает уже сохранённую дату напрямую).
       - Helper `mockLocks` использовать как есть.

    3) НЕ создавать новый shared helper-модуль. Константы дублируются между support-sync.ts и wb-cooldown.ts — приемлемо для KISS (только 2 файла, формула короткая).

    Reference: lib/support-sync.ts:87-103 (feedbacks catch), :153-169 (questions catch). tests/support-sync.test.ts:376-430.
  </action>
  <verify>
    <automated>npx vitest run tests/support-sync.test.ts</automated>
  </verify>
  <done>
    - `lib/support-sync.ts` содержит `CRON_INTERVAL_SEC = 900` и `BUFFER_SEC = 120` константы.
    - При WbRateLimitError(720) на /feedbacks → AppSetting('wbFeedbacksLockedUntil') = now+1020s ±5s.
    - При WbRateLimitError(720) на /questions → AppSetting('wbQuestionsLockedUntil') = now+1020s ±5s.
    - Buffer тесты для retry=60 (interval доминирует) и retry=3600 (retry+buffer) GREEN.
    - Все pre-check / cleanup тесты остаются GREEN (формула меняется только в catch).
    - npx vitest run tests/support-sync.test.ts → GREEN (минимум 12 тестов, 2 новых).
  </done>
</task>

<task type="auto">
  <name>Task 3: Полный regression run + tsc + integration sanity</name>
  <files></files>
  <action>
    Финальная проверка перед deploy:

    1) `npx tsc --noEmit` — должен быть 0 errors. Особое внимание: export const CRON_INTERVAL_SEC/BUFFER_SEC из wb-cooldown.ts не должен конфликтовать с локальными const в support-sync.ts (разные модули — конфликта нет, но проверить).

    2) `npx vitest run` — полный прогон всех тестов. Ожидание:
       - tests/wb-cooldown.test.ts: GREEN (после Task 1)
       - tests/support-sync.test.ts: GREEN (после Task 2)
       - tests/wb-fetch-rate-limit.test.ts: GREEN без изменений (не использует CRON_INTERVAL_SEC напрямую — тестирует wbFetch helper и instanceof WbRateLimitError)
       - tests/wb-support-api.test.ts: GREEN без изменений (тестирует WbRateLimitError class и callApi, не lock formula)
       - Все остальные suite (pricing-math, excel-auto-promo, customer-aggregations, и т.д.): не должны быть затронуты.

    3) Sanity-чтение интеграции:
       - В `lib/wb-api.ts` верифицировать что `wbFetch` при 429 вызывает `setWbCooldownUntil(retryAfterSec)` — нашу новую buffer-формулу. После этого изменения cooldownUntil будет писаться с buffer'ом автоматически (через тот же setWbCooldownUntil код), без правки wb-api.ts.
       - В `lib/wb-support-api.ts:callApi` (строка ~163) — тот же путь: setWbCooldownUntil уже использует новую формулу.

    4) Если что-то RED — раскопать и починить, НЕ маскировать через try/catch или комментирование тестов.

    5) Грепом проверить что нигде в коде не остался legacy паттерн `new Date(Date.now() + .* retryAfterSec.*1000)` без max():
       - `grep -rn "Date.now\(\) + .*retryAfterSec.*1000" lib/ --include="*.ts"` — ожидаем только формула с Math.max(...CRON_INTERVAL_SEC...).

    Не deploy. Stop здесь — пользователь сам запустит deploy.sh когда готов.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run</automated>
  </verify>
  <done>
    - `npx tsc --noEmit` → 0 errors.
    - `npx vitest run` → ALL GREEN (включая 4 затронутых suite + остальные).
    - Sanity grep подтверждает что нет legacy формулы без buffer в lib/.
    - Готов к user-инициированному deploy через `ssh root@85.198.97.89 'cd /opt/zoiten-pro && bash deploy.sh'`.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` → 0 errors
2. `npx vitest run` → ALL GREEN
3. `npx vitest run tests/wb-cooldown.test.ts tests/support-sync.test.ts` → GREEN с минимум 4 новыми/обновлёнными buffer-assertions
4. Sanity: `grep -n "CRON_INTERVAL_SEC" lib/support-sync.ts lib/wb-cooldown.ts` → найден в обоих файлах
5. Sanity: `grep -n "BUFFER_SEC" lib/support-sync.ts lib/wb-cooldown.ts` → найден в обоих файлах
6. Sanity: нет orphan legacy формулы — `grep -rn "Date.now() + .*retryAfterSec.*1000" lib/ --include="*.ts"` показывает только новый паттерн с Math.max
</verification>

<success_criteria>
**Functional (после deploy в production, верифицируется пользователем — не часть плана):**

Сценарий до фикса (production 2026-05-13):
```
T+0   :  cron tick → WB /questions 429 retry=720s → lock until T+720s (12 мин)
T+900 :  cron tick → lock истёк 3 мин назад → WB /questions 429 retry=720s → ...
                     (infinite loop, wbCooldownUntil бесконечно продлевается, ВСЕ WB syncs мёртвы)
```

Сценарий после фикса:
```
T+0   :  cron tick → WB /questions 429 retry=720s → lock until T+1020s (17 мин)
T+900 :  cron tick → lock ещё активен (осталось 120s) → skip listQuestions
T+1800:  cron tick → lock истёк → пробуем listQuestions → если WB остыл, 2xx; lock удалён
                     (если WB ещё 429 — снова +1020s, но уже один пропуск был → нагрузка ↓)
```

**Code-level (часть плана, проверяется через verify):**
- Lock_unlock_at = now + max(retryAfterSec, 900) + 120 секунд для всех 3 ключей: wbFeedbacksLockedUntil, wbQuestionsLockedUntil, wbCooldownUntil
- Идемпотентность max() vs existing AppSetting сохранена (более далёкий lock не сокращается)
- Все existing тесты GREEN + минимум 4 новых buffer-assertions
- 0 TS ошибок
</success_criteria>

<output>
После выполнения всех задач создать `.planning/quick/260513-dlr-support-sync-lock-buffer-to-outlive-cron/260513-dlr-SUMMARY.md` со стандартными секциями: Что сделано (per task), Файлы изменены, Тесты (новые / обновлённые / regression GREEN), Deploy-инструкция (manual: `ssh root@85.198.97.89 'cd /opt/zoiten-pro && bash deploy.sh'` + verify через psql query `SELECT key, value FROM "AppSetting" WHERE key IN ('wbCooldownUntil','wbQuestionsLockedUntil','wbFeedbacksLockedUntil')`).
</output>
