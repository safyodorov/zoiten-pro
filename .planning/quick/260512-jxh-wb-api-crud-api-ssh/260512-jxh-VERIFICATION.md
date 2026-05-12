---
phase: 260512-jxh-wb-api-crud-api-ssh
verified: 2026-05-12T00:00:00Z
status: passed
score: 10/10 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Login as SUPERADMIN sergey.fyodorov@gmail.com → /admin/settings → verify «WB API токены» tab is visible with 3 cards (WB Основной, WB Возвраты, WB Чат)"
    expected: "Tab is visible; cards show scope chips, dates, masked tail, color indicator. Non-configured tokens show «Токен не настроен»."
    why_human: "Requires browser session with live DB after migration deployment on VPS"
  - test: "Click «Заменить» on WB Основной → paste 'abc' → submit → verify error «Invalid JWT format» appears in modal"
    expected: "Dialog stays open, red error zone shows 'Invalid JWT format', DB is not written"
    why_human: "UI interaction + modal state"
  - test: "Login as non-superadmin (MANAGER role) → /admin/settings → verify «WB API токены» tab is NOT visible"
    expected: "Tab is absent from TabsList"
    why_human: "Requires non-superadmin test session"
  - test: "After replacing a token, verify Network tab shows no full JWT value in RSC payload — only maskedTail: '...XXXX'"
    expected: "React Server Component payload contains maskedTail but not the full token string"
    why_human: "Browser DevTools inspection of RSC wire format"
  - test: "DB migration applied on VPS: psql -d zoiten_erp -c 'SELECT * FROM \"WbApiToken\";' after first visit returns 1 row for WB_API_TOKEN with updatedById IS NULL"
    expected: "Bootstrap from env creates row with updatedById=null"
    why_human: "Requires SSH to VPS + migration deployment"
---

# Quick 260512-jxh: WB API токены — CRUD через UI вместо SSH — Verification Report

**Task Goal:** WB API токены — настройки CRUD для управления API-ключами без SSH
**Verified:** 2026-05-12
**Status:** PASSED (automated) | HUMAN VERIFICATION REQUIRED (UI smoke flow + VPS deploy)
**Re-verification:** No — initial verification

## Goal Achievement

The task goal "дать SUPERADMIN через /admin/settings заменять WB-токены без SSH" is implemented end-to-end. All 10 locked CONTEXT decisions are honoured. The 4 commits (b269a01, a046a72, a18ad02, 65763a5) match SUMMARY claims and files exist with substantive content.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SUPERADMIN видит tab «WB API токены» с 3 карточками | ✓ VERIFIED | `SettingsTabs.tsx:89` conditional `{wbTokens && <TabsTrigger value="wb-tokens">}` + `WbTokensTab.tsx` renders 3 cards |
| 2 | Карточки показывают scope-чипы, issued at, expires at, цветовой индикатор, last 4 chars, updatedBy | ✓ VERIFIED | `WbTokensTab.tsx:155-198` full card rendering with `colorForDaysLeft`, `formatDate`, `maskedTail`, scope chips |
| 3 | Кнопка «Заменить» открывает модалку с textarea + «Проверить и сохранить» | ✓ VERIFIED | `WbTokensTab.tsx:100-145` Dialog with textarea, error zone, Отмена/Проверить buttons |
| 4 | Validation: decode → scope check → probe call; fail → error in modal, no DB write | ✓ VERIFIED | `wb-token-validate.ts:30-88` 3-step validation; `wb-tokens.ts:93-94` early return on `!validation.ok` before upsert |
| 5 | После replace следующий getWbToken видит новое значение ≤5 сек (cache TTL) | ✓ VERIFIED | `wb-token.ts:15` `CACHE_TTL_MS=5000`; `wb-tokens.ts:119` `invalidateWbTokenCache(input.name)` immediately after upsert |
| 6 | process.env.WB_*_TOKEN заменены на await getWbToken в lib/wb-api.ts и lib/wb-support-api.ts | ✓ VERIFIED | Grep lib/ and app/api/ → 0 hits; `wb-api.ts:52-54` async `getToken()`; `wb-support-api.ts:20-42` all 3 async |
| 7 | Bootstrap: первый getWbToken пустой БД → создаётся запись из process.env (updatedById=null) | ✓ VERIFIED | `wb-token.ts:23-49` `bootstrapFromEnv` with idempotent upsert, `updatedById: null` |
| 8 | Non-superadmin не видит tab «WB API токены» | ✓ VERIFIED | `SettingsTabs.tsx:89,103-107` conditional on `wbTokens !== null`; page always passes wbTokens (only SUPERADMIN reaches page via `requireSuperadmin()`) |
| 9 | RBAC: все server actions защищены requireSuperadmin() | ✓ VERIFIED | `wb-tokens.ts:41,83` both `listWbTokens` and `replaceWbToken` call `await requireSuperadmin()` first |
| 10 | Token VALUE никогда не сериализуется в client props — только last 4 chars | ✓ VERIFIED | `wb-tokens.ts:36-38` `mask()` returns `...${value.slice(-4)}`; `WbTokenListItem` has no `value` field; test 5 asserts `JSON.stringify(apiToken)` does not contain full value |

**Score:** 10/10 truths verified

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `prisma/schema.prisma` | ✓ VERIFIED | `model WbApiToken` at line 983; all fields present (name, value, scopeBitmask, issuedAt, expiresAt, sellerId, organizationId, updatedById FK, createdAt, updatedAt); `User.wbTokensUpdated WbApiToken[] @relation("WbTokenUpdater")` at line 79 |
| `prisma/migrations/20260512_wb_api_token/migration.sql` | ✓ VERIFIED | `CREATE TABLE "WbApiToken"` with all columns; FK constraint `WbApiToken_updatedById_fkey → "User"("id") ON DELETE SET NULL` |
| `lib/wb-jwt.ts` | ✓ VERIFIED | Exports `decodeWbJwt`, `decodeScopeBits`, `WB_SCOPE_LABELS`; pure TS, no deps; 78 lines |
| `lib/wb-token-validate.ts` | ✓ VERIFIED | Exports `validateWbToken`, `REQUIRED_SCOPE_BITS`, `WbTokenName` (re-export); 89 lines; 3-step validation |
| `lib/wb-token.ts` | ✓ VERIFIED | Exports `getWbToken`, `invalidateWbTokenCache`, `WB_TOKEN_NAMES`, `WbTokenName`; CACHE_TTL_MS=5000; bootstrapFromEnv |
| `app/actions/wb-tokens.ts` | ✓ VERIFIED | `"use server"`, exports `listWbTokens`, `replaceWbToken`, `WbTokenListItem`; requireSuperadmin on both actions |
| `components/settings/WbTokensTab.tsx` | ✓ VERIFIED | 204 lines (> min 150); `"use client"`, 3-card grid, Dialog with textarea, error handling, toast |
| `tests/wb-jwt.test.ts` | ✓ VERIFIED | 6 tests: valid decode, s=170→[1,3,5,7], invalid format throws, malformed base64 throws, label checks, decodeScopeBits helper |
| `tests/wb-token-cache.test.ts` | ✓ VERIFIED | 6 tests: bootstrap+upsert, cache hit (no 2nd DB call), TTL miss with vi.useFakeTimers(), invalidate, empty→throws, WB_TOKEN_NAMES const |
| `tests/wb-token-validate.test.ts` | ✓ VERIFIED | 7 tests: full-scope+200→ok, partial-scope→error with labels, 401→"Неверный токен", 403→"scope/доступ", AbortError→"timeout/недоступен", REQUIRED_SCOPE_BITS values |
| `tests/wb-tokens-actions.test.ts` | ✓ VERIFIED | 5 tests: FORBIDDEN gate, scope-mismatch block (no upsert), success upsert+invalidate+revalidate, listWbTokens length=3, maskedTail no full-value leak |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/wb-api.ts` | `lib/wb-token.ts` | `await getWbToken("WB_API_TOKEN")` in `getToken()` | ✓ WIRED | Line 9: `import { getWbToken } from "@/lib/wb-token"`; line 52-54: async `getToken()` returns `await getWbToken("WB_API_TOKEN")` |
| `lib/wb-support-api.ts` | `lib/wb-token.ts` | all 3 getToken/getReturnsToken/getChatToken async | ✓ WIRED | Lines 12, 20-42: `import { getWbToken }`, three async functions calling `getWbToken(...)` with fallback pattern |
| `components/settings/WbTokensTab.tsx` | `app/actions/wb-tokens.ts` | `replaceWbToken({name, value})` on form submit | ✓ WIRED | Line 16-17: imports `replaceWbToken` and types; line 78-89: `handleSubmit` calls `replaceWbToken` in `startTransition` |
| `app/actions/wb-tokens.ts` | `lib/wb-token-validate.ts` + `lib/wb-token.ts` | validateWbToken → prisma.upsert → invalidateWbTokenCache | ✓ WIRED | Lines 93-94: validates, returns on fail; lines 97-118: upsert with decoded fields; line 119: `invalidateWbTokenCache(input.name)` |
| `components/settings/SettingsTabs.tsx` | `components/settings/WbTokensTab.tsx` | `TabsContent value='wb-tokens'` SUPERADMIN only | ✓ WIRED | Line 8: `import { WbTokensTab }`; lines 89, 103-107: conditional on `wbTokens !== null` |
| `app/(dashboard)/admin/settings/page.tsx` | `app/actions/wb-tokens.ts` | `listWbTokens()` in Promise.all | ✓ WIRED | Line 5: `import { listWbTokens }`; line 30: `listWbTokens()` in Promise.all, result passed as `wbTokens` prop |
| `app/api/wb-sync-spp/route.ts` | `lib/wb-token.ts` | `await getWbToken("WB_API_TOKEN")` | ✓ WIRED | Lines 12, 99: import and usage of getWbToken |

---

## Locked CONTEXT Decisions Verification

| # | Decision | Status | Evidence |
|---|----------|--------|----------|
| 1 | Tokens в БД (WbApiToken model) | ✓ HONOURED | `prisma/schema.prisma:983`, migration SQL exists |
| 2 | Bootstrap из env когда БД пуста (lib/wb-token.ts) | ✓ HONOURED | `wb-token.ts:23-49` `bootstrapFromEnv` with `prisma.wbApiToken.upsert({update: {}})` (idempotent) |
| 3 | JWT decoder без сетевых вызовов (lib/wb-jwt.ts) | ✓ HONOURED | Pure TS, base64url via `Buffer.from().toString("base64")`, no `fetch` or network calls |
| 4 | 3-step validation: decode → scope check → probe call | ✓ HONOURED | `wb-token-validate.ts:35-88` — Step 1: `decodeWbJwt`, Step 2: scope bitmask check, Step 3: `fetch(PROBE_ENDPOINTS[name])` with AbortController |
| 5 | Cache TTL 5 секунд (lib/wb-token.ts) | ✓ HONOURED | `wb-token.ts:15` `const CACHE_TTL_MS = 5000` |
| 6 | process.env.WB_*_TOKEN заменены на await getWbToken | ✓ HONOURED | Grep lib/ + app/api/ → 0 matches; all three files updated |
| 7 | RBAC: requireSuperadmin() в каждой server action | ✓ HONOURED | `wb-tokens.ts:41,83` — `listWbTokens` line 41, `replaceWbToken` line 83 |
| 8 | UI tab «WB API токены» в /admin/settings | ✓ HONOURED | `SettingsTabs.tsx:89,103-107`, `WbTokensTab.tsx` exists and is imported |
| 9 | Token value никогда не возвращается полностью | ✓ HONOURED | `WbTokenListItem` interface has `maskedTail: string | null`, no `value` field; `mask()` returns only last 4 chars; test asserts no full value in JSON |
| 10 | Audit: WbApiToken.updatedById FK на User | ✓ HONOURED | `schema.prisma:991-992` `updatedById String?` + `updatedBy User? @relation("WbTokenUpdater", ...)` |

---

## Scope Bit Mapping Verification

`lib/wb-jwt.ts` WB_SCOPE_LABELS matches CONTEXT:

| Bit | Label | Status |
|-----|-------|--------|
| 1 | Контент | ✓ |
| 2 | Аналитика | ✓ |
| 3 | Цены | ✓ |
| 4 | Продвижение | ✓ |
| 5 | Отзывы | ✓ |
| 6 | Статистика | ✓ |
| 7 | Тарифы | ✓ |
| 9 | Чат | ✓ |
| 11 | Возвраты | ✓ |

`REQUIRED_SCOPE_BITS`:
- `WB_API_TOKEN: [1,2,3,5,6,7]` — matches CONTEXT decision (bits 1=Контент, 2=Аналитика, 3=Цены, 5=Отзывы, 6=Статистика, 7=Тарифы)
- `WB_RETURNS_TOKEN: [11]` — matches CONTEXT (Возвраты)
- `WB_CHAT_TOKEN: [9]` — matches CONTEXT (Чат)

Arithmetic verified: `decodeScopeBits(170) = [1,3,5,7]`, `decodeScopeBits(238) = [1,2,3,5,6,7]`, `decodeScopeBits(512) = [9]`, `decodeScopeBits(2048) = [11]`. All correct.

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `WbTokensTab.tsx` | `tokens: WbTokenListItem[]` | `listWbTokens()` in `settings/page.tsx:30` | Yes — `prisma.wbApiToken.findMany({ include: { updatedBy } })` | ✓ FLOWING |
| `listWbTokens` | `records` from DB | `prisma.wbApiToken.findMany(...)` in `wb-tokens.ts:42` | Yes — real Prisma query with `include: { updatedBy: { select: {id, name} } }` | ✓ FLOWING |
| `replaceWbToken` | validation result | `validateWbToken(name, trimmed)` | Yes — real fetch probe call to WB API | ✓ FLOWING |

---

## Behavioral Spot-Checks

Step 7b: SKIPPED for network-dependent checks (probe calls require live WB API). Module-level checks:

| Behavior | Check | Status |
|----------|-------|--------|
| `decodeWbJwt` throws on bad format | Node-level verify (via test assertions) | ✓ PASS |
| `decodeScopeBits(170)` returns `[1,3,5,7]` | Computed: 170=0b10101010, bits at positions 1,3,5,7 | ✓ PASS |
| `decodeScopeBits(238)` returns `[1,2,3,5,6,7]` | Computed: 238=2+4+8+32+64+128 | ✓ PASS |
| Token masking `mask("...abc1234")` = `"...1234"` | Code: `value.slice(-4)` | ✓ PASS |
| process.env.WB_*_TOKEN grep lib/ app/api/ | 0 hits (confirmed) | ✓ PASS |
| Commits b269a01, a046a72, a18ad02, 65763a5 exist | Confirmed in git log | ✓ PASS |

---

## Test Coverage for JWT Edge Cases

`tests/wb-jwt.test.ts` covers:
- Invalid JWT (not 3 segments): Test 3 — `"not.a.valid.jwt.segments"` (5 parts), `"twoparts"` (1 part), `"two.parts"` (2 parts) → all throw "Invalid JWT format"
- Malformed base64 middle: Test 4 — `"validhdr.!!!notbase64!!!.sig"` → throws "Invalid JWT payload"
- Missing claims (s/iat/exp): Covered by `decodeWbJwt` — `NaN` check throws "Invalid JWT payload — отсутствуют обязательные поля s/iat/exp"
- Expired token: NOT blocked by decoder (decoder decodes regardless — expiry enforcement is a probe-call concern, consistent with CONTEXT decision which does not require expire-check on decode)

---

## Anti-Patterns Found

No blockers found.

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `tests/wb-orders-per-warehouse.test.ts:34` | `process.env.WB_API_TOKEN = "test-token"` | Info | Harmless — `vi.mock("@/lib/wb-token", ...)` is in place at line 15; the env assignment is redundant but does not affect correctness |
| `tests/wb-returns-api.test.ts:31-32` | Residual env assignments | Info | Same — mock in place at line 5 |
| `tests/wb-chat-api.test.ts:32-33` | Residual env assignments | Info | Same — mock in place at line 6 |
| `tests/support-sync-returns.test.ts:58-59` | Residual env assignments | Info | Same — mock in place at line 43 |

No STUB patterns (return null, empty returns, TODO/FIXME, placeholder strings) found in any production file.

---

## Human Verification Required

### 1. Settings page tab visibility (SUPERADMIN)

**Test:** Login as sergey.fyodorov@gmail.com → navigate to /admin/settings
**Expected:** «WB API токены» tab is visible with 3 cards (WB Основной / WB Возвраты / WB Чат). WB Основной shows scope chips and dates if bootstrap completed; others show «Токен не настроен» if not in env.
**Why human:** Requires live browser session + deployed VPS

### 2. Non-superadmin tab invisibility

**Test:** Login as any MANAGER/VIEWER user → navigate to /admin/settings
**Expected:** «WB API токены» tab is absent from the tab bar
**Why human:** Requires non-superadmin test account

### 3. Modal validation error flow

**Test:** Open «Заменить» modal for WB Основной → paste "abc" → click «Проверить и сохранить»
**Expected:** Red error box in modal shows "Invalid JWT format — ожидалось 3 сегмента через точку"; dialog stays open; DB not written
**Why human:** UI interaction + modal state

### 4. Token value privacy in DevTools

**Test:** While logged in as SUPERADMIN, open Network tab in DevTools → navigate to /admin/settings → inspect RSC payload
**Expected:** No full JWT token string in RSC payload; only `maskedTail: "...XXXX"` and boolean `hasValue`
**Why human:** Browser DevTools inspection

### 5. VPS migration + bootstrap

**Test:** After `deploy.sh` on VPS: `psql -d zoiten_erp -c 'SELECT name, masked_value, "updatedById" FROM "WbApiToken";'`
**Expected:** 1 row with `name="WB_API_TOKEN"` and `updatedById IS NULL` after first visit to /admin/settings
**Why human:** SSH to VPS required

---

## Gaps Summary

No gaps found. All 10 observable truths are verified, all artifacts exist and are substantive, all key links are wired, CONTEXT decisions are honoured, and no stub anti-patterns were detected.

The only remaining items are 5 human-verification tests that require a live deployment (VPS migration + browser session). These are expected for a task of this scope and do not represent deficiencies in the implementation.

---

_Verified: 2026-05-12_
_Verifier: Claude (gsd-verifier)_
