---
phase: 260513-khv
plan: 01
type: quick
wave: 1
depends_on: []
requirements: [QUICK-260513-KHV]
status: complete
completed_at: "2026-05-13T11:55:00Z"
duration: ~6min
key_files:
  modified:
    - lib/wb-cooldown.ts
    - lib/wb-api.ts
    - lib/wb-support-api.ts
    - tests/wb-cooldown.test.ts
    - tests/wb-fetch-rate-limit.test.ts
  created: []
decisions:
  - "Per-endpoint cooldown buckets — 9 isolated AppSetting('wbCooldownUntil:<bucket>') keys вместо single 'wbCooldownUntil'"
  - "resolveBucketFromUrl/Endpoint — детерминированный hostname→bucket mapper; null для Returns/Chat/Calendar (safe fallback, не наш bus)"
  - "Lazy legacy migration через in-process flag legacyMigrationDone — first setWbCooldownUntil после module-load. Future legacy value копируется на все 9 buckets, past просто удаляется"
  - "Buffer formula `max(retry, 900) + 120` сохранена per-bucket (260513-dlr fix не регрессирован)"
  - "Idempotent max() сохранён per-bucket — длинный lock конкретного bucket не сокращается коротким retry того же bucket"
tags: [wb-api, rate-limit, cooldown, refactor, backend, support-sync]
---

# Quick 260513-khv: Per-endpoint cooldown locks (WB API)

## One-liner

Превратил single-bucket WB cooldown bus (`AppSetting('wbCooldownUntil')`) в 9 per-endpoint cooldown locks — 3h-ban Statistics больше не запирает Prices/Tariffs/Content/Analytics.

## Problem

Прод 2026-05-13: один 429 на `/supplier/stocks` (Statistics API, 3h penalty) запирал на 3 часа все WB_API_TOKEN endpoint'ы — Prices, Tariffs, Content, Analytics, Orders, Feedbacks, Questions. Это collateral damage от глобального `AppSetting('wbCooldownUntil')` — все endpoint'ы делили один cooldown bus.

WB rate-limit'ы per-endpoint-domain, поэтому и наш cooldown должен быть per-domain.

## Solution — Per-bucket Cooldown Locks

### Bucket enum

`lib/wb-cooldown.ts` теперь экспортирует 9-tuple buckets:

```typescript
export const WB_COOLDOWN_BUCKETS = [
  "statistics-stocks",
  "statistics-orders",
  "statistics-sales",
  "prices",
  "tariffs",
  "analytics",
  "content",
  "feedbacks",
  "questions",
] as const
```

Каждый bucket пишет в свой ключ `AppSetting('wbCooldownUntil:<bucket>')`. Изоляция полная — ban одного bucket не задевает соседей.

### Buffer formula preserved

```bash
grep -n 'Math.max(retryAfterSec, CRON_INTERVAL_SEC)' lib/wb-cooldown.ts
# lib/wb-cooldown.ts:153:  const effectiveSec = Math.max(retryAfterSec, CRON_INTERVAL_SEC) + BUFFER_SEC
```

Формула из Quick 260513-dlr — `unlockAt = now + max(retry, 900) + 120` — теперь применяется per-bucket. Lock каждого bucket переживает 1 cron tick (15 мин) + 2 мин drift, как раньше.

### Lazy legacy migration

При первом `setWbCooldownUntil(...)` после module-load: проверяет старый ключ `wbCooldownUntil` (без колона) из текущего прода. Если future — копирует value на все 9 bucket-keys (пользователь сохраняет защиту от текущего ban'а). Если past — просто удаляет. In-process flag `legacyMigrationDone` short-circuits повторные вызовы.

На прод-restart Next.js модуль пересоздаётся → migration перепроверяется (no-op если legacy уже удалён).

### Resolution functions

- `resolveBucketFromUrl(url: string)` — для `lib/wb-support-api.ts:callApi`, резолвит из baseUrl+path.
- `resolveBucketFromEndpoint(endpoint: string)` — internal в `lib/wb-api.ts:wbFetch`, резолвит из английского label ('Prices API', 'Statistics API (stocks)', ...).
- Оба возвращают `null` для Returns/Chat/Calendar/неизвестных hosts → cooldown bus skipped (safe fallback, Returns/Chat имеют свои токены и бюджеты).

## Files modified

| File | Lines | Change |
|---|---|---|
| `lib/wb-cooldown.ts` | 1-182 (полный rewrite сохраняя API) | +bucket enum +resolveBucketFromUrl +migrateLegacyCooldownKey; все 3 public функции теперь принимают bucket первым аргументом |
| `lib/wb-api.ts` | 5-9 (импорт), 683-732 (wbFetch+helper) | +resolveBucketFromEndpoint internal; wbFetch резолвит bucket из endpoint string и передаёт в cooldown calls |
| `lib/wb-support-api.ts` | 8-12 (импорт), 130-141 (pre-check), 160-167 (429 write) | resolveBucketFromUrl(baseUrl+path); Returns/Chat → null → bypass bus |
| `tests/wb-cooldown.test.ts` | full rewrite | 13 → 27 tests (+14 per-bucket isolation + legacy migration + URL mapping) |
| `tests/wb-fetch-rate-limit.test.ts` | 6 (импорт коммент), 117-205 (cooldown tests) | 5 → 8 tests (+per-bucket isolation, +bucket-keyed 429 write) |

## Tests

| Suite | Before | After | Δ |
|---|---|---|---|
| `tests/wb-cooldown.test.ts` | 13 | 27 | +14 |
| `tests/wb-fetch-rate-limit.test.ts` | 5 | 8 | +3 |
| `tests/wb-support-api.test.ts` | 10 | 10 | 0 (unchanged, существующий bucket=null путь идентичен старому isWbApiToken=false) |
| `tests/support-sync.test.ts` | 14 | 14 | 0 (support-sync.ts не тронут — он использует собственные ключи wbQuestionsLockedUntil/wbFeedbacksLockedUntil) |

**Final verification:**

```
npx tsc --noEmit                  → 0 errors
npx vitest run [4 targeted]       → 59/59 GREEN
npx vitest run [full]             → 457 passed | 38 failed (baseline 441/38; +16 new tests, 0 new failures)
```

## Production safety

### support-sync.ts untouched

```bash
git diff --stat lib/support-sync.ts
# (empty — файл не изменён)
```

`lib/support-sync.ts` использует свои собственные per-feature ключи `wbQuestionsLockedUntil` и `wbFeedbacksLockedUntil` (Quick 260512-gvy + 260513-dlr). Они НЕ связаны с глобальным cooldown bus и продолжают работать как раньше.

### Legacy key migration на прод-deploy

Текущий прод имеет ОДНУ запись в AppSetting:
```sql
SELECT key, value FROM "AppSetting" WHERE key = 'wbCooldownUntil';
-- 1 row: wbCooldownUntil | 2026-05-13T13:35:00+00 (примерно 16:35 МСК)
```

После deploy и первого 429 на любой WB endpoint:
1. `setWbCooldownUntil(bucket, retry)` вызывает `migrateLegacyCooldownKey()`
2. Видит legacy=future value → копирует на все 9 bucket-keys
3. Удаляет legacy `wbCooldownUntil`
4. Записывает новый retry на свой bucket (идемпотентный max)

В результате — Statistics-stocks lock сохраняется до ~16:35 МСК, остальные buckets тоже получают тот же lock (защита от первого 429 каскада). После того как Prices/Tariffs/Content получают первый success после lock expiry — их bucket остаётся пустым, и они работают независимо.

### Rollback safety

- AppSetting keys namespace'ятся (`wbCooldownUntil:<bucket>`) — coexist с legacy `wbCooldownUntil` пока migration не сработает.
- Migration идемпотентна — no double-application на restart.
- Если нужен revert: revert commits + 9 bucket AppSetting rows можно удалить вручную (они transient — auto-expire по definition).

## Deploy

```
ssh root@85.198.97.89 'cd /opt/zoiten-pro && bash deploy.sh'
```

**Ожидаемое мониторинг после deploy:**
- Первый `/api/wb-sync` или /prices/wb синхронизация → migration runs, legacy ключ копируется на 9 buckets, удаляется.
- Prices/Cards/Tariffs/Content syncs работают ИММЕДИАТНО (несмотря что Statistics-stocks lock сохраняется до ~16:35 МСК) — каждый идёт через свой bucket.
- Statistics-stocks остаётся заблокированным до истечения текущего lock'а (~16:35 МСК сегодня); первый запрос после этого либо успешен (lock cleanup), либо опять 429 (тогда новый bucket-only lock на свой период).

## Verification SQL

После deploy + первого 429:

```sql
SELECT key, value FROM "AppSetting" WHERE key LIKE 'wbCooldownUntil%';
-- Ожидание:
-- - wbCooldownUntil:statistics-stocks → текущий future value (skopiroVan из legacy)
-- - wbCooldownUntil:prices            → текущий future value (если legacy был future)
-- - wbCooldownUntil:tariffs           → текущий future value (если legacy был future)
-- ... все 9 buckets
-- - НЕТ строки с key='wbCooldownUntil' (без колона)
```

## Self-Check: PASSED

**Created files:**
- `.planning/quick/260513-khv-per-endpoint-cooldown-locks-refactor-wbc/260513-khv-SUMMARY.md` → FOUND

**Modified files** (verified via git log):
- `lib/wb-cooldown.ts` → committed in 9143a6c
- `tests/wb-cooldown.test.ts` → committed in 9143a6c
- `lib/wb-api.ts` → committed in c935d7b
- `lib/wb-support-api.ts` → committed in c935d7b
- `tests/wb-fetch-rate-limit.test.ts` → committed in c935d7b

**Commits:**
- `9143a6c` refactor(260513-khv-01): per-bucket WB cooldown API + lazy legacy migration → FOUND
- `c935d7b` refactor(260513-khv-01): wire bucket resolution в wbFetch + callApi → FOUND

**Verification commands:**
- `npx tsc --noEmit` → 0 errors → PASSED
- `npx vitest run [4 targeted suites]` → 59/59 GREEN → PASSED
- `npx vitest run` (full) → 457 passed | 38 failed (baseline: 441/38; same failed count, +16 new tests) → PASSED
- `git diff --stat lib/support-sync.ts` → empty → PASSED (LOCKED constraint 9)
- Buffer formula preserved: `grep 'Math.max(retryAfterSec, CRON_INTERVAL_SEC)' lib/wb-cooldown.ts` → 1 match → PASSED
