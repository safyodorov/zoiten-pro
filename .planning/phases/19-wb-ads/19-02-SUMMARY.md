---
phase: 19-wb-ads
plan: "02"
subsystem: infra
tags: [wb-api, jwt, tokens, scope, advert-api]

# Dependency graph
requires:
  - phase: quick/260512-jxh-wb-api-crud-api-ssh
    provides: "Базовая инфраструктура WB-токенов (WB_TOKEN_NAMES, getWbToken, validateWbToken, listWbTokens, replaceWbToken, UI WbTokensTab)"
  - phase: 19-W0
    provides: "Empirical proof that bit 30 = «Продвижение» scope (NOT bit 4 as old WB_SCOPE_LABELS suggested)"
provides:
  - "WB_ADS_TOKEN — 4-й токен в системе (scope bit 30, probe /adv/v1/promotion/count)"
  - "WB_SCOPE_LABELS[30] = «Продвижение» (исправлена устаревшая запись 4: «Продвижение»)"
  - "DISPLAY_NAMES.WB_ADS_TOKEN = «WB Реклама» → 4-я карточка в /admin/settings → WB API токены"
  - "UI grid xl:grid-cols-4 (4 карточки на широких экранах)"
affects: [19-03 (lib/wb-adv-api.ts будет вызывать getWbToken('WB_ADS_TOKEN')), 19-04..19-08 (вся Phase 19 авторизуется через этот токен)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Расширение существующего Record<WbTokenName, T> — добавляем только новые ключи, generics автоматически подхватывают"
    - "TDD: extend существующие test-suites через новые describe-блоки или Test N+1, реиспользуя fixture helpers (makeJwt)"

key-files:
  created:
    - .planning/phases/19-wb-ads/deferred-items.md
  modified:
    - lib/wb-token.ts
    - lib/wb-token-validate.ts
    - lib/wb-jwt.ts
    - app/actions/wb-tokens.ts
    - components/settings/WbTokensTab.tsx
    - tests/wb-jwt.test.ts
    - tests/wb-token-validate.test.ts
    - tests/wb-tokens-actions.test.ts
    - tests/wb-token-cache.test.ts

key-decisions:
  - "Использовать bit 30 (не bit 4) для scope «Продвижение» — эмпирически подтверждено в W0"
  - "Удалить устаревшую запись 4: «Продвижение» из WB_SCOPE_LABELS чтобы UI scope-chips не показывали ложные ярлыки"
  - "Probe endpoint /adv/v1/promotion/count — лёгкий GET, верифицирован живым в W0"
  - "Не хардкодить bit-номер в тестах — импортировать REQUIRED_SCOPE_BITS.WB_ADS_TOKEN[0] чтобы переходы scope (если WB поменяет) не ломали тесты"

patterns-established:
  - "Pattern: добавление нового WB-токена → 4 файла (wb-token.ts, wb-token-validate.ts, wb-jwt.ts, wb-tokens.ts) + UI grid"

requirements-completed: [TOKEN-WB_ADS_TOKEN, TOKEN-VALIDATE-SCOPE-30, TOKEN-UI-CARD]

# Metrics
duration: 6min
completed: 2026-05-19
---

# Phase 19 Plan 02: WB_ADS_TOKEN Infrastructure Extension Summary

**Расширил трёх-токенную инфраструктуру 4-м токеном WB_ADS_TOKEN (scope bit 30 «Продвижение», probe `/adv/v1/promotion/count`) и исправил устаревшую метку bit 4 в WB_SCOPE_LABELS.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-19T11:21:44Z
- **Completed:** 2026-05-19T11:27:30Z
- **Tasks:** 2
- **Files modified:** 9 (5 prod + 4 test) + 1 created (deferred-items.md)

## Accomplishments

- WB_ADS_TOKEN полноправный участник системы: `getWbToken("WB_ADS_TOKEN")`, `validateWbToken("WB_ADS_TOKEN", value)`, UI карточка «WB Реклама» работают
- Удалена ошибочная запись `4: "Продвижение"` из `WB_SCOPE_LABELS` (per W0 — bit 4 у WB_API_TOKEN не выставлен, при этом Advert API работает → старая метка устарела)
- Добавлена правильная запись `30: "Продвижение"` (эмпирически верифицирована в W0)
- Тесты `tests/wb-jwt.test.ts` (+1), `tests/wb-token-validate.test.ts` (+4), `tests/wb-tokens-actions.test.ts` (updated к 4-token list), `tests/wb-token-cache.test.ts` (updated) — все новые/обновлённые passing
- Обнаружен и задокументирован project-wide vitest pool issue (deferred-items.md)

## Task Commits

**Per user instruction:** "Do NOT commit. Do NOT push. Leave files staged for user review."

Все изменения остаются в working tree, готовы к ручному ревью + коммиту пользователем.

1. **Task 1: Расширить WB_TOKEN_NAMES + REQUIRED_SCOPE_BITS + PROBE_ENDPOINTS + WB_SCOPE_LABELS** — НЕ закоммичено
2. **Task 2: Добавить DISPLAY_NAMES + UI карточку «WB Реклама»** — НЕ закоммичено

## Files Created/Modified

### Production code
- `lib/wb-token.ts` — добавлен `"WB_ADS_TOKEN"` в `WB_TOKEN_NAMES` (теперь 4 элемента)
- `lib/wb-token-validate.ts` — добавлены `WB_ADS_TOKEN: [30]` в `REQUIRED_SCOPE_BITS` и `WB_ADS_TOKEN: "https://advert-api.wildberries.ru/adv/v1/promotion/count"` в `PROBE_ENDPOINTS`
- `lib/wb-jwt.ts` — удалена устаревшая `4: "Продвижение"`, добавлена `30: "Продвижение"` в `WB_SCOPE_LABELS`
- `app/actions/wb-tokens.ts` — добавлен `WB_ADS_TOKEN: "WB Реклама"` в `DISPLAY_NAMES`
- `components/settings/WbTokensTab.tsx` — grid обновлён `xl:grid-cols-3` → `xl:grid-cols-4`

### Tests
- `tests/wb-jwt.test.ts` — добавлен Test 5b: assertion `WB_SCOPE_LABELS[30]` matches `/Реклам|Продвижен/`
- `tests/wb-token-validate.test.ts` — добавлены 4 теста (Test 8/9/10/11) для `WB_ADS_TOKEN`: REQUIRED_SCOPE_BITS exists, missing scope error, full success, 401 probe
- `tests/wb-tokens-actions.test.ts` — обновлён mock `WB_TOKEN_NAMES` (4 элемента) и Test 4 (`expect(result).toHaveLength(4)`)
- `tests/wb-token-cache.test.ts` — обновлён Test 6 (массив теперь содержит 4 элемента с `WB_ADS_TOKEN`)

### Phase artifacts
- `.planning/phases/19-wb-ads/deferred-items.md` — created, документирует pre-existing vitest issue + workaround

## Decisions Made

- **Bit 30 (не bit 4) для «Продвижение»** — следуем W0 эмпирике (WB_API_TOKEN с scopeBits=[1,2,3,5,6,7,30] проходит /promotion/count 200; bit 4 у токена не выставлен).
- **Удалить старую запись `4: "Продвижение"`** вместо «дублировать на bit 30» — иначе UI scope-chips показывал бы «Продвижение» для случайных токенов с bit 4 (которого WB не выставляет), создавая визуальный шум.
- **Тест не хардкодит bit-номер** — импортирует `REQUIRED_SCOPE_BITS.WB_ADS_TOKEN[0]`. Если WB когда-нибудь поменяет bit (маловероятно, но), тесты переедут автоматически с обновлением одной константы в lib.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Обновлён `tests/wb-token-cache.test.ts:152` (вне explicit scope)**
- **Found during:** verification phase (после Task 1)
- **Issue:** Test 6 assertion-hardcoded на 3-token list `["WB_API_TOKEN", "WB_RETURNS_TOKEN", "WB_CHAT_TOKEN"]` — после изменений в `lib/wb-token.ts` тест начал падать (deep-equal на массиве)
- **Fix:** добавлен `"WB_ADS_TOKEN"` в expected массив + переименован Test 6 description
- **Files modified:** `tests/wb-token-cache.test.ts`
- **Verification:** `npx vitest run --pool=vmThreads tests/wb-token-cache.test.ts` — 6 passed (было 5 passed | 1 failed)
- **Scope note:** user-prompt сказал «modify these files (and ONLY these)» с явным списком. Однако сам же prompt требует «existing tests still pass with 4-token list» — то есть подразумевал что я починю любые сломавшиеся тесты. Альтернатива (оставить тест падающим) противоречит acceptance criteria. Применил Rule 1 (auto-fix bug).

**2. [Rule 3 - Workaround] Использовал `--pool=vmThreads` для запуска тестов**
- **Found during:** RED phase verification (Task 1)
- **Issue:** Pre-existing project-wide vitest 4.1.4 ошибка с default `--pool=forks` на Node 24 + Windows: `TypeError: Cannot read properties of undefined (reading 'config')`. Baseline (pre-Plan 19-02 на `git stash`) тоже падает тем же образом. Не вызвано Plan 19-02.
- **Fix:** Не менял `vitest.config.ts` (рекомендуемое изменение `pool: "vmThreads"` — infrastructure change, out of plan scope). Использовал CLI флаг `--pool=vmThreads` для верификации Plan 19-02 локально.
- **Files modified:** NONE (workaround только в команде запуска)
- **Verification:** `npx vitest run --pool=vmThreads ...` — passes (5 new tests for Phase 19 all green)
- **Documented in:** `.planning/phases/19-wb-ads/deferred-items.md`

---

**Total deviations:** 2 (1 Rule 1 auto-fix, 1 Rule 3 workaround)
**Impact on plan:** Не выходит за scope Plan 19-02. Acceptance criteria достигнуты. Vitest pool issue — pre-existing, отложен в deferred-items.md.

## Issues Encountered

### Pre-existing vitest 4.1.4 runner bug (project-wide)

- **Symptom:** `TypeError: Cannot read properties of undefined (reading 'config')` для test файлов без `vi`, `Error: Vitest failed to find the runner` для файлов с `vi.mock`/`vi.hoisted`.
- **Verified pre-existing:** `git stash` + run baseline тестов — те же ошибки на `tests/pricing-math.test.ts`, `tests/wb-jwt.test.ts` и других.
- **Workaround:** `npx vitest run --pool=vmThreads ...` работает корректно.
- **Action:** задокументировано в `deferred-items.md`. Возможно follow-up quick-задача: добавить `pool: "vmThreads"` в `vitest.config.ts`.

### Two pre-existing test failures (not caused by Plan 19-02)

С `--pool=vmThreads` baseline `git stash`: 2 failed | 17 passed. После Plan 19-02: 2 failed | 28 passed (5 new Phase 19 tests + 5 existing tests still passing).

Те же 2 теста падают:
- `tests/wb-token-validate.test.ts` Test 5 (AbortController timeout) — DOMException's `name` не триггерит `e.name === "AbortError"` branch под vmThreads
- `tests/wb-tokens-actions.test.ts` Test 3 (success upsert) — auth() mock возвращает undefined под vmThreads

Оба — pre-existing, не относятся к Plan 19-02. Возможно связаны с тем же vitest pool issue.

## Verification Results

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | exits 0 |
| `grep -c WB_ADS_TOKEN lib/wb-token.ts lib/wb-token-validate.ts app/actions/wb-tokens.ts` | 1, 2, 1 (total 4, ≥3 required) |
| `grep -E "^\s*30:" lib/wb-jwt.ts` | `30: "Продвижение"` ✓ |
| `grep -E "WB_ADS_TOKEN:\s*\[30\]" lib/wb-token-validate.ts` | matches ✓ |
| `grep "WB Реклама" app/actions/wb-tokens.ts` | matches ✓ |
| `grep "xl:grid-cols-4" components/settings/WbTokensTab.tsx` | matches ✓ |
| `grep '4: "Продвижение"' lib/wb-jwt.ts` (should not exist) | absent (only in comment as historical note) ✓ |
| `npx vitest run --pool=vmThreads tests/wb-jwt.test.ts tests/wb-token-validate.test.ts tests/wb-tokens-actions.test.ts tests/wb-token-cache.test.ts` | 28 passed / 30 total (2 pre-existing failures) |
| All 5 new Phase 19 tests pass | ✓ (Test 5b in wb-jwt, Tests 8/9/10/11 in wb-token-validate) |

## User Setup Required

После применения изменений (либо commit + deploy, либо локальная разработка) — нужно сгенерировать новый JWT токен в ЛК WB:

1. **ЛК WB → Настройки → API-токены → Создать новый**
2. Имя: WB_ADS_TOKEN (или любое)
3. Scope: галочка **«Продвижение»**
4. Срок: 6 мес
5. Скопировать JWT
6. **Bootstrap из env:** добавить `WB_ADS_TOKEN=eyJhbG...` в `/etc/zoiten.pro.env` на VPS (для первого подъёма)
7. **Production:** после Phase 19 Wave 3 deploy → перейти в `/admin/settings` → WB API токены → карточка «WB Реклама» → Заменить → вставить JWT

Карточка «WB Реклама» появится автоматически после применения Plan 19-02 (через UI grid xl:grid-cols-4). При пустой БД и пустом env — «Токен не настроен».

## Next Phase Readiness

- **Plan 19-03 (lib/wb-adv-api.ts)** unblocked: может вызывать `await getWbToken("WB_ADS_TOKEN")` для авторизации всех endpoints Advert API
- **UI готов:** 4 карточки в `/admin/settings → WB API токены` (хотя 4-я будет «не настроена» пока юзер не вставит JWT)
- **Scope-chips для bit 30:** работают корректно («Продвижение» вместо raw «bit 30»)
- **Deferred:** vitest pool config fix — можно сделать quick-задачей позже

## Self-Check: PASSED

- `lib/wb-token.ts` exists with `"WB_ADS_TOKEN"` in WB_TOKEN_NAMES ✓
- `lib/wb-token-validate.ts` exists with `WB_ADS_TOKEN: [30]` and advert-api URL ✓
- `lib/wb-jwt.ts` exists with `30: "Продвижение"` and NO active `4: "Продвижение"` ✓
- `app/actions/wb-tokens.ts` exists with `WB_ADS_TOKEN: "WB Реклама"` ✓
- `components/settings/WbTokensTab.tsx` exists with `xl:grid-cols-4` ✓
- Tests extended (5 new tests + 2 updated tests) ✓
- `tsc --noEmit` exits 0 ✓
- `deferred-items.md` created ✓
- No commits made (per user instruction "Do NOT commit. Do NOT push") ✓

---
*Phase: 19-wb-ads*
*Completed: 2026-05-19*
