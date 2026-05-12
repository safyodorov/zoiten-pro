---
phase: 260512-jxh-wb-api-crud-api-ssh
plan: "01"
subsystem: wb-tokens
tags: [wb-api, settings, rbac, jwt, prisma, cache]
dependency_graph:
  requires: [prisma/WbApiToken, lib/wb-jwt, lib/wb-token, lib/wb-token-validate, lib/rbac, lib/auth, next/cache]
  provides: [UI tab «WB API токены», hot-reload token cache, JWT decode+validate, listWbTokens, replaceWbToken]
  affects: [lib/wb-api.ts, lib/wb-support-api.ts, app/api/wb-sync-spp/route.ts, app/(dashboard)/admin/settings/page.tsx, components/settings/SettingsTabs.tsx]
tech_stack:
  added: [lib/wb-jwt.ts, lib/wb-token-validate.ts, lib/wb-token.ts, app/actions/wb-tokens.ts, components/settings/WbTokensTab.tsx]
  patterns: [in-memory Map cache TTL=5s, JWT base64url decode pure TS, probe call with AbortController timeout, vi.hoisted mock pattern, server action "use server" + requireSuperadmin]
key_files:
  created:
    - prisma/migrations/20260512_wb_api_token/migration.sql
    - lib/wb-jwt.ts
    - lib/wb-token-validate.ts
    - lib/wb-token.ts
    - app/actions/wb-tokens.ts
    - components/settings/WbTokensTab.tsx
    - tests/wb-jwt.test.ts
    - tests/wb-token-validate.test.ts
    - tests/wb-token-cache.test.ts
    - tests/wb-tokens-actions.test.ts
  modified:
    - prisma/schema.prisma
    - lib/wb-api.ts
    - lib/wb-support-api.ts
    - app/api/wb-sync-spp/route.ts
    - app/(dashboard)/admin/settings/page.tsx
    - components/settings/SettingsTabs.tsx
    - scripts/wb-stocks-diagnose.js
    - scripts/wb-sync-characteristics.js
    - scripts/wb-sync-stocks.js
    - tests/wb-support-api.test.ts
    - tests/wb-returns-api.test.ts
    - tests/wb-chat-api.test.ts
    - tests/wb-promotions-api.test.ts
    - tests/wb-stocks-per-warehouse.test.ts
    - tests/wb-orders-per-warehouse.test.ts
    - tests/wb-fetch-rate-limit.test.ts
    - tests/support-sync-returns.test.ts
    - tests/support-sync-chats.test.ts
decisions:
  - "WbTokenName type defined in lib/wb-token.ts (single source of truth), re-exported from lib/wb-token-validate.ts and app/actions/wb-tokens.ts"
  - "decodeScopeBits used as static top-level import in actions (not dynamic await import per plan-checker warning)"
  - "Removed invalid getToken guard test from wb-support-api.test.ts (guard now lives in lib/wb-token.ts, tested in wb-token-cache.test.ts Test 5)"
  - "Bootstrap probe call bypasses cooldown bus — fresh token knows nothing about IP state"
metrics:
  duration: "~14 minutes"
  completed_date: "2026-05-12"
  tasks: 4
  files: 28
---

# Quick 260512-jxh: WB API токены — CRUD через UI вместо SSH — Summary

**One-liner:** JWT-based WB API token management via /admin/settings UI with decode+scope+probe validation, in-memory 5s cache hot-reload, and full SUPERADMIN RBAC.

## Что реализовано

### Task 1: Prisma модель + миграция + JWT decoder

- `prisma/schema.prisma`: добавлена модель `WbApiToken` (name @id, value, scopeBitmask, issuedAt, expiresAt, sellerId, organizationId, updatedById, updatedAt) и relation `User.wbTokensUpdated`
- `prisma/migrations/20260512_wb_api_token/migration.sql`: ручная DDL миграция (нет локальной PG — применится через `deploy.sh` на VPS)
- `lib/wb-jwt.ts`: pure TypeScript декодер WB JWT без внешних зависимостей — `decodeWbJwt`, `decodeScopeBits`, `WB_SCOPE_LABELS`
- Тесты: 6 unit-тестов, все GREEN

### Task 2: Валидация + кеш

- `lib/wb-token-validate.ts`: `validateWbToken(name, value)` — 3 шага: decode JWT → scope check → probe call с AbortController timeout 5s
- `lib/wb-token.ts`: `getWbToken(name)` с in-memory Map cache TTL=5000ms + bootstrap из env при пустой БД (idempotent upsert, updatedById=null)
- Тесты: 7 + 6 = 13 unit-тестов, все GREEN (включая TTL с `vi.useFakeTimers()`)

### Task 3: Замена process.env на await getWbToken(...)

- `lib/wb-api.ts`: `getToken()` → `async getToken() { return await getWbToken("WB_API_TOKEN") }` + 12 вызовов `getToken()` → `await getToken()`
- `lib/wb-support-api.ts`: все три `get*Token()` стали async, вызовы в callWb/callReturnsApi/callChatApi обновлены
- `app/api/wb-sync-spp/route.ts`: Sales API fallback token через `getWbToken("WB_API_TOKEN")`
- `scripts/wb-*.js`: оставлены на `process.env` (standalone CLI), добавлен NB-комментарий
- 9 тест-файлов обновлены: добавлен `vi.mock("@/lib/wb-token", ...)` mock
- Итог: 0 hits на `process.env.WB_(API|RETURNS|CHAT)_TOKEN` в lib/ и app/

### Task 4: Server actions + UI tab

- `app/actions/wb-tokens.ts`: `listWbTokens()` (maskedTail, scopeBits, no raw value) + `replaceWbToken()` (validate→upsert→invalidate→revalidatePath)
- `components/settings/WbTokensTab.tsx`: 3 карточки с scope-chips, цветовой индикатор срока (green/yellow/red/dark-red), Dialog с textarea + «Проверить и сохранить»
- `components/settings/SettingsTabs.tsx`: conditional TabsTrigger/TabsContent wb-tokens + WbTokensTab
- `app/(dashboard)/admin/settings/page.tsx`: `listWbTokens()` добавлен в Promise.all
- Тесты: 5 unit-тестов, все GREEN
- `npx tsc --noEmit` → 0 errors

## Commits

| Hash | Message |
|------|---------|
| `b269a01` | feat(wb-tokens): Prisma WbApiToken model + migration + JWT decoder |
| `a046a72` | feat(wb-tokens): wb-token-validate.ts + wb-token.ts (cache+bootstrap) + tests |
| `a18ad02` | refactor(wb-api): replace process.env.WB_*_TOKEN with await getWbToken(...) |
| `65763a5` | feat(wb-tokens): server actions + UI tab «WB API tokens» + SettingsTabs integration |

## Migration Deployment Note

**Статус:** PENDING — миграция применится на VPS при деплое.

```bash
# На VPS после deploy.sh (которое запускает prisma migrate deploy):
psql -d zoiten_erp -c "SELECT * FROM \"WbApiToken\";"
# После первого визита /admin/settings (bootstrap) ожидается:
# 1 row для WB_API_TOKEN (updatedById IS NULL — bootstrap marker)
```

Файл: `prisma/migrations/20260512_wb_api_token/migration.sql`

## UAT Checklist (Smoke Flow)

После деплоя на VPS:

- [ ] Login как sergey.fyodorov@gmail.com → /admin/settings → видна tab «WB API токены»
- [ ] 3 карточки: «WB Основной», «WB Возвраты», «WB Чат» (последние 2 могут показывать «Токен не настроен» если WB_RETURNS_TOKEN/WB_CHAT_TOKEN не в env)
- [ ] Карточка WB Основной показывает scope chips (Контент, Аналитика, Цены, Отзывы, Статистика, Тарифы), даты и maskedTail
- [ ] Кнопка «Заменить» открывает Dialog с textarea
- [ ] Paste "abc" → «Проверить и сохранить» → error «Invalid JWT format»
- [ ] Paste валидный токен с неполным scope → error «Не хватает scope-битов: ...»
- [ ] Paste валидный полный токен → loading «Проверяем...» → success → toast «Токен обновлён», Dialog закрывается
- [ ] DevTools Network → React Server Component payload не содержит полного value (только `maskedTail: "...XXXX"`)
- [ ] Login как non-superadmin → tab «WB API токены» НЕ видна
- [ ] После замены токена следующий WB-sync использует новое значение (cache TTL ≤5 сек)

## Known Limits / Known Stubs

**Probe endpoints:**

Probe-endpointy зашиты в `lib/wb-token-validate.ts:PROBE_ENDPOINTS`. Если WB изменит URL `/ping` или другой endpoint — validation будет давать false negative. При обнаружении — обновить константу.

| Токен | Probe endpoint |
|-------|---------------|
| WB_API_TOKEN | `https://content-api.wildberries.ru/ping` |
| WB_RETURNS_TOKEN | `https://returns-api.wildberries.ru/api/v1/claims?is_archive=false&limit=1` |
| WB_CHAT_TOKEN | `https://buyer-chat-api.wildberries.ru/api/v1/seller/events?next=0` |

**Нет стабов** — все функции реализованы и подключены.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing export] WbTokenName не экспортировался из actions**
- **Found during:** Task 4 TypeScript check
- **Issue:** `components/settings/WbTokensTab.tsx` импортировал `WbTokenName` из `@/app/actions/wb-tokens`, но тот не экспортировал
- **Fix:** Добавлен `export type { WbTokenName }` в `app/actions/wb-tokens.ts`
- **Commit:** 65763a5

**2. [Plan-checker warning] Static import вместо dynamic await import**
- **Found during:** Plan pre-check
- **Issue:** План предлагал `const { decodeScopeBits } = await import("@/lib/wb-jwt")` в server action
- **Fix:** Заменено на top-level static import `import { decodeScopeBits } from "@/lib/wb-jwt"`
- **Commit:** 65763a5

**3. [Plan-checker warning] WbTokenName — единый источник истины**
- **Found during:** Task 2 implementation
- **Issue:** Plan had WbTokenName type potentially duplicated
- **Fix:** `WbTokenName` определён ТОЛЬКО в `lib/wb-token.ts`, re-exported из `lib/wb-token-validate.ts` и `app/actions/wb-tokens.ts`
- **Commit:** a046a72

**4. [Rule 1 - Bug] Removed obsolete getToken guard test**
- **Found during:** Task 3 test fixing
- **Issue:** Test `"кидает ошибку если WB_API_TOKEN не настроен"` в `wb-support-api.test.ts` тестировал старое поведение. После рефакторинга guard живёт в `lib/wb-token.ts` (протестирован в wb-token-cache.test.ts Test 5)
- **Fix:** Тест заменён на комментарий с пояснением
- **Commit:** a18ad02
