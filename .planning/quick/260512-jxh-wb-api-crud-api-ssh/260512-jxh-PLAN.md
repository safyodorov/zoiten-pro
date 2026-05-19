---
phase: 260512-jxh-wb-api-crud-api-ssh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - prisma/migrations/20260512_wb_api_token/migration.sql
  - lib/wb-jwt.ts
  - lib/wb-token-validate.ts
  - lib/wb-token.ts
  - lib/wb-api.ts
  - lib/wb-support-api.ts
  - app/api/wb-sync-spp/route.ts
  - scripts/wb-stocks-diagnose.js
  - scripts/wb-sync-characteristics.js
  - scripts/wb-sync-stocks.js
  - app/actions/wb-tokens.ts
  - components/settings/WbTokensTab.tsx
  - components/settings/SettingsTabs.tsx
  - app/(dashboard)/admin/settings/page.tsx
  - tests/wb-jwt.test.ts
  - tests/wb-token-validate.test.ts
  - tests/wb-token-cache.test.ts
  - tests/wb-tokens-actions.test.ts
autonomous: true
requirements:
  - QT-260512-jxh-01
  - QT-260512-jxh-02
  - QT-260512-jxh-03
  - QT-260512-jxh-04

must_haves:
  truths:
    - "SUPERADMIN видит в /admin/settings tab «WB API токены» с тремя карточками (WB Основной / WB Возвраты / WB Чат)"
    - "Каждая карточка показывает scope-чипы, issued at, expires at + цветовой индикатор «осталось N дней», last 4 chars значения и updatedBy"
    - "Кнопка «Заменить» открывает модалку с textarea + кнопкой «Проверить и сохранить»"
    - "При сохранении JWT валидируется: decode payload + проверка scope-битов + probe call к соответствующему WB endpoint — fail → ошибка в модалке, не пишется в БД"
    - "После успешного replace следующий вызов getWbToken видит новое значение в течение ≤5 секунд (TTL кеша)"
    - "Все вызовы process.env.WB_*_TOKEN в lib/wb-api.ts и lib/wb-support-api.ts заменены на await getWbToken(...)"
    - "Bootstrap: при первом getWbToken пустой БД создаётся запись из process.env.WB_API_TOKEN (idempotent, updatedById=null)"
    - "Non-superadmin не видит tab «WB API токены»"
    - "RBAC: все server actions wb-tokens.ts защищены requireSuperadmin()"
    - "Токен VALUE никогда не сериализуется в client props — только masked last 4 chars"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "Модель WbApiToken (name @id, value, issuedAt, expiresAt, scopeBitmask, sellerId, organizationId, updatedById, updatedAt)"
      contains: "model WbApiToken"
    - path: "prisma/migrations/20260512_wb_api_token/migration.sql"
      provides: "DDL для WbApiToken + FK на User(updatedById)"
      contains: "CREATE TABLE \"WbApiToken\""
    - path: "lib/wb-jwt.ts"
      provides: "decodeWbJwt(token): {scopeBits, issuedAt, expiresAt, sellerId, organizationId} + scope bit→label map"
      exports: ["decodeWbJwt", "WB_SCOPE_LABELS", "decodeScopeBits"]
    - path: "lib/wb-token-validate.ts"
      provides: "validateWbToken(name, value): probe call + scope check, returns {ok, error?, decoded?}"
      exports: ["validateWbToken", "REQUIRED_SCOPE_BITS"]
    - path: "lib/wb-token.ts"
      provides: "getWbToken(name) с in-memory cache TTL=5000ms + bootstrap из env при пустой БД"
      exports: ["getWbToken", "invalidateWbTokenCache", "WB_TOKEN_NAMES"]
    - path: "app/actions/wb-tokens.ts"
      provides: "listWbTokens + replaceWbToken server actions, requireSuperadmin"
      exports: ["listWbTokens", "replaceWbToken"]
    - path: "components/settings/WbTokensTab.tsx"
      provides: "UI tab с 3 карточками + модалка замены"
      min_lines: 150
    - path: "tests/wb-jwt.test.ts"
      provides: "Unit-тесты decode + scope bitmask"
      contains: "decodeWbJwt"
    - path: "tests/wb-token-cache.test.ts"
      provides: "Unit-тесты TTL 5 сек + invalidate после replace"
      contains: "TTL"
    - path: "tests/wb-tokens-actions.test.ts"
      provides: "Unit-тесты replaceWbToken: scope mismatch → block, probe 401 → block, success → upsert"
      contains: "replaceWbToken"
  key_links:
    - from: "lib/wb-api.ts"
      to: "lib/wb-token.ts"
      via: "await getWbToken('WB_API_TOKEN') внутри getToken()"
      pattern: "getWbToken\\(.WB_API_TOKEN.\\)"
    - from: "lib/wb-support-api.ts"
      to: "lib/wb-token.ts"
      via: "await getWbToken для всех трёх getToken/getReturnsToken/getChatToken"
      pattern: "getWbToken\\("
    - from: "components/settings/WbTokensTab.tsx"
      to: "app/actions/wb-tokens.ts"
      via: "replaceWbToken({name, value}) при сабмите формы"
      pattern: "replaceWbToken\\("
    - from: "app/actions/wb-tokens.ts"
      to: "lib/wb-token-validate.ts + lib/wb-token.ts"
      via: "validateWbToken → prisma.wbApiToken.upsert → invalidateWbTokenCache"
      pattern: "validateWbToken\\(.*\\).*upsert.*invalidateWbTokenCache"
    - from: "components/settings/SettingsTabs.tsx"
      to: "components/settings/WbTokensTab.tsx"
      via: "TabsContent value='wb-tokens' (рендерится только для SUPERADMIN)"
      pattern: "WbTokensTab"
---

<objective>
Дать SUPERADMIN'у через UI `/admin/settings` → tab «WB API токены» заменять любой из 3 WB-токенов (WB_API_TOKEN, WB_RETURNS_TOKEN, WB_CHAT_TOKEN) без SSH на VPS. Replace проходит JWT decode + scope-bits check + probe call → upsert в БД. Hot-reload через in-memory cache TTL 5 сек в `lib/wb-token.ts`. Bootstrap из env при первом запросе.

Purpose: Убрать operational dependency на root@VPS для ротации WB-токенов. Сейчас при истечении токена нужен SSH + правка `/etc/zoiten.pro.env` + restart systemd unit. Цель — replace через UI за 30 секунд.

Output: Prisma модель `WbApiToken`, lib/wb-token.ts с кешем, lib/wb-jwt.ts с JWT decoder, lib/wb-token-validate.ts с probe-логикой, server actions, UI tab в SettingsTabs, замена всех `process.env.WB_*_TOKEN` на `await getWbToken(...)`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260512-jxh-wb-api-crud-api-ssh/260512-jxh-CONTEXT.md
@CLAUDE.md
@prisma/schema.prisma
@lib/wb-api.ts
@lib/wb-support-api.ts
@lib/rbac.ts
@components/settings/SettingsTabs.tsx
@components/settings/BrandsTab.tsx
@app/(dashboard)/admin/settings/page.tsx
@app/api/wb-sync-spp/route.ts

<interfaces>
<!-- Существующие интерфейсы, которые executor должен использовать as-is. -->

From lib/rbac.ts:
```typescript
export async function requireSuperadmin(): Promise<void>  // throws "UNAUTHORIZED" | "FORBIDDEN"
export async function getCurrentUser(): Promise<SessionUser | null>
```

From lib/wb-api.ts (line 51-55) — заменить на await getWbToken:
```typescript
function getToken(): string {
  const token = process.env.WB_API_TOKEN
  if (!token) throw new Error("WB_API_TOKEN не настроен")
  return token
}
```

From lib/wb-support-api.ts (line 19-39) — заменить на await getWbToken:
```typescript
function getToken(): string { /* WB_API_TOKEN */ }
function getReturnsToken(): string { /* WB_RETURNS_TOKEN ?? WB_API_TOKEN */ }
function getChatToken(): string { /* WB_CHAT_TOKEN ?? WB_API_TOKEN */ }
```

KEY: эти функции вызываются inline в callWb/callReturnsApi/callChatApi на КАЖДЫЙ запрос. Замена на `await getWbToken(...)` требует чтобы getToken стал async ИЛИ чтобы вызывающие функции (callApi) делали await перед вызовом.

**Принятое решение для этого плана**: getToken/getReturnsToken/getChatToken становятся `async` и возвращают `Promise<string>`. В callApi/callWb/callReturnsApi/callChatApi заменить `getToken()` на `await getToken()`. Public API (listFeedbacks, listQuestions, etc.) уже async — изменений в сигнатурах нет.

From prisma/schema.prisma (модель User для FK):
```prisma
model User {
  id String @id @default(cuid())
  // ... (existing fields)
  wbTokensUpdated WbApiToken[] @relation("WbTokenUpdater")  // NEW relation
}
```

From CLAUDE.md — Server Actions pattern:
```typescript
"use server"
import { requireSuperadmin } from "@/lib/rbac"
export async function replaceWbToken(...) {
  await requireSuperadmin()
  try { /* ... */ } catch (e) { return { ok: false, error: ... } }
  revalidatePath("/admin/settings")
  return { ok: true }
}
```

From CLAUDE.md — Settings tabs pattern (BrandsTab):
- "use client" components
- useState + useTransition для optimistic UI
- toast.success/error из sonner
- Server action возвращает { ok: true } | { ok: false, error: string }
</interfaces>

<wb_token_decisions>
**Сводка locked decisions из CONTEXT.md (НЕ revisit):**

1. Tokens в БД (Prisma model `WbApiToken`). Env только для bootstrap при первом запросе.
2. Hot-reload через in-memory Map cache TTL 5 секунд. После replace — следующий запрос в течение 5 сек видит новое значение.
3. Управление всеми 3 токенами: WB_API_TOKEN (bits 1,2,3,5,6,7), WB_RETURNS_TOKEN (bit 11), WB_CHAT_TOKEN (bit 9).
4. Validation = decode JWT → scope check → probe call. Только при passed всех трёх — upsert в БД.
5. RBAC: только SUPERADMIN (`requireSuperadmin()`). Non-superadmin не видит tab.
6. Token VALUE никогда не показывается полностью — только last 4 chars.
7. UI: карточки (не таблица). Replace через modal с textarea.
8. WB JWT format: 3 dot-segments, middle = base64url-encoded JSON с {s, iat, exp, sid, oid}.

**Scope bit mapping (из CONTEXT.md + CLAUDE.md):**
```
bit 1=Content/Контент, bit 2=Analytics/Аналитика, bit 3=Prices/Цены,
bit 4=Marketing/Продвижение, bit 5=Feedbacks/Отзывы, bit 6=Statistics/Статистика,
bit 7=Tariffs/Тарифы, bit 9=Chat/Чат, bit 11=Returns/Возвраты
```

**Required scope per token:**
- WB_API_TOKEN: {1, 2, 3, 5, 6, 7}
- WB_RETURNS_TOKEN: {11}
- WB_CHAT_TOKEN: {9}

**Probe endpoints:**
- WB_API_TOKEN → `GET https://content-api.wildberries.ru/ping` (или `/api/v2/cards/limits` fallback)
- WB_RETURNS_TOKEN → `GET https://returns-api.wildberries.ru/api/v1/claims?is_archive=false&limit=1` (минимальная нагрузка)
- WB_CHAT_TOKEN → `GET https://buyer-chat-api.wildberries.ru/api/v1/seller/events?next=0` (cursor=0 = первый запрос)

Probe timeout = 5 секунд. 200 → pass. 401 → block "Неверный токен". 403 → block "Недостаточно прав scope". Прочее → block с показом status.
</wb_token_decisions>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Prisma модель WbApiToken + миграция + lib/wb-jwt.ts (JWT decoder)</name>
  <files>
    prisma/schema.prisma
    prisma/migrations/20260512_wb_api_token/migration.sql
    lib/wb-jwt.ts
    tests/wb-jwt.test.ts
  </files>
  <behavior>
    - Test 1 (wb-jwt): decodeWbJwt валидный токен → {scopeBits: number[], issuedAt: Date, expiresAt: Date, sellerId: string, organizationId: string}
    - Test 2: scope `s=170` (0b10101010 = 2+8+32+128) → scopeBits=[1, 3, 5, 7]
    - Test 3: invalid JWT (не 3 сегмента) → throws "Invalid JWT format"
    - Test 4: malformed base64 middle → throws "Invalid JWT payload"
    - Test 5: WB_SCOPE_LABELS[1] === "Контент", [11] === "Возвраты", [9] === "Чат"
    - Test 6: decodeScopeBits(170) === [1,3,5,7] (helper для bitmask → array of set bit indices)
  </behavior>
  <action>
    **1.1 Добавить модель WbApiToken в prisma/schema.prisma** (после модели AppSetting ~line 547):
    ```prisma
    // Quick 260512-jxh: WB API токены — CRUD через UI вместо SSH.
    // Source of truth для трёх токенов: WB_API_TOKEN, WB_RETURNS_TOKEN, WB_CHAT_TOKEN.
    // Bootstrap из process.env при пустой БД (см. lib/wb-token.ts).
    model WbApiToken {
      name             String   @id // "WB_API_TOKEN" | "WB_RETURNS_TOKEN" | "WB_CHAT_TOKEN"
      value            String   // Полное значение JWT (нужно для авторизации в WB API)
      scopeBitmask     Int      // `s` из JWT payload (sum 2^bit)
      issuedAt         DateTime // `iat` из JWT
      expiresAt        DateTime // `exp` из JWT
      sellerId         String?  // `sid` из JWT (для аудита)
      organizationId   String?  // `oid` из JWT (для аудита)
      updatedById      String?  // null для bootstrap из env
      updatedBy        User?    @relation("WbTokenUpdater", fields: [updatedById], references: [id], onDelete: SetNull)
      createdAt        DateTime @default(now())
      updatedAt        DateTime @updatedAt
    }
    ```

    **1.2 Добавить relation в model User** (после `managerStats` ~line 78):
    ```prisma
    wbTokensUpdated  WbApiToken[]          @relation("WbTokenUpdater") // Quick 260512-jxh
    ```

    **1.3 Создать миграцию `prisma/migrations/20260512_wb_api_token/migration.sql`** (вручную — нет локальной PG, deploy через VPS как Phase 9 паттерн):
    ```sql
    -- Quick 260512-jxh: WB API токены — CRUD через UI.
    CREATE TABLE "WbApiToken" (
        "name"            TEXT NOT NULL,
        "value"           TEXT NOT NULL,
        "scopeBitmask"    INTEGER NOT NULL,
        "issuedAt"        TIMESTAMP(3) NOT NULL,
        "expiresAt"       TIMESTAMP(3) NOT NULL,
        "sellerId"        TEXT,
        "organizationId"  TEXT,
        "updatedById"     TEXT,
        "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"       TIMESTAMP(3) NOT NULL,
        CONSTRAINT "WbApiToken_pkey" PRIMARY KEY ("name")
    );

    ALTER TABLE "WbApiToken"
        ADD CONSTRAINT "WbApiToken_updatedById_fkey"
        FOREIGN KEY ("updatedById") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    ```

    **1.4 Создать `lib/wb-jwt.ts`** — pure module, без зависимостей:
    ```typescript
    // Quick 260512-jxh: декодер WB JWT-токенов.
    // Формат: 3 dot-segments, middle = base64url JSON {s, iat, exp, sid, oid}.

    export const WB_SCOPE_LABELS: Record<number, string> = {
      1: "Контент",
      2: "Аналитика",
      3: "Цены",
      4: "Продвижение",
      5: "Отзывы",
      6: "Статистика",
      7: "Тарифы",
      9: "Чат",
      11: "Возвраты",
    }

    export interface WbJwtPayload {
      scopeBits: number[]      // массив set-битов из `s`
      scopeBitmask: number     // raw `s`
      issuedAt: Date
      expiresAt: Date
      sellerId: string | null
      organizationId: string | null
    }

    // Bitmask → array of set bit indices (LSB=1).
    // Пример: 170 = 0b10101010 → [1, 3, 5, 7]
    // (bit 1 = 2, bit 3 = 8, bit 5 = 32, bit 7 = 128)
    export function decodeScopeBits(s: number): number[] {
      const bits: number[] = []
      for (let i = 0; i < 32; i++) {
        if (s & (1 << i)) bits.push(i)
      }
      return bits
    }

    function base64UrlDecode(input: string): string {
      // base64url → base64 (replace -_, pad =)
      const b64 = input.replace(/-/g, "+").replace(/_/g, "/")
      const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4))
      // Node Buffer + browser atob fallback (RSC runs in Node)
      if (typeof Buffer !== "undefined") {
        return Buffer.from(b64 + pad, "base64").toString("utf-8")
      }
      return atob(b64 + pad)
    }

    export function decodeWbJwt(token: string): WbJwtPayload {
      const trimmed = token.trim()
      const segments = trimmed.split(".")
      if (segments.length !== 3) {
        throw new Error("Invalid JWT format — ожидалось 3 сегмента через точку")
      }
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(base64UrlDecode(segments[1]))
      } catch {
        throw new Error("Invalid JWT payload — не удалось декодировать base64url JSON")
      }
      const s = typeof payload.s === "number" ? payload.s : NaN
      const iat = typeof payload.iat === "number" ? payload.iat : NaN
      const exp = typeof payload.exp === "number" ? payload.exp : NaN
      if (Number.isNaN(s) || Number.isNaN(iat) || Number.isNaN(exp)) {
        throw new Error("Invalid JWT payload — отсутствуют обязательные поля s/iat/exp")
      }
      return {
        scopeBits: decodeScopeBits(s),
        scopeBitmask: s,
        issuedAt: new Date(iat * 1000),
        expiresAt: new Date(exp * 1000),
        sellerId: typeof payload.sid === "string" ? payload.sid : null,
        organizationId: typeof payload.oid === "string" ? payload.oid : null,
      }
    }
    ```

    **1.5 Создать `tests/wb-jwt.test.ts`** — vitest tests для всех 6 поведений выше. Использовать synthetic JWT (header+payload+sig можно хардкодить — никаких сетевых вызовов).

    Helper для синтеза тестового JWT:
    ```typescript
    function makeJwt(payload: object): string {
      const b64 = (s: string) =>
        Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
      return `${b64('{"alg":"HS256","typ":"JWT"}')}.${b64(JSON.stringify(payload))}.sig`
    }
    ```

    Per D-CONTEXT: decoder без сетевых вызовов, прямая работа с base64url JSON.
  </action>
  <verify>
    <automated>npm run test -- wb-jwt --run</automated>
  </verify>
  <done>
    - prisma/schema.prisma содержит model WbApiToken + relation User.wbTokensUpdated
    - prisma/migrations/20260512_wb_api_token/migration.sql существует, syntactically valid SQL
    - lib/wb-jwt.ts экспортирует decodeWbJwt, decodeScopeBits, WB_SCOPE_LABELS
    - tests/wb-jwt.test.ts — 6 тестов, все green
    - npm run test -- wb-jwt --run → all passed
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: lib/wb-token-validate.ts (scope+probe) + lib/wb-token.ts (cache + bootstrap)</name>
  <files>
    lib/wb-token-validate.ts
    lib/wb-token.ts
    tests/wb-token-validate.test.ts
    tests/wb-token-cache.test.ts
  </files>
  <behavior>
    **wb-token-validate.ts:**
    - Test 1: validateWbToken("WB_API_TOKEN", validTokenWithFullScope) + fetch mock 200 → {ok: true, decoded: {...}}
    - Test 2: validateWbToken с scope-битами {1,2,3} (нет 5,6,7) → {ok: false, error: содержит "Отзывы", "Статистика", "Тарифы"}
    - Test 3: validateWbToken probe возвращает 401 → {ok: false, error: содержит "Неверный токен"}
    - Test 4: validateWbToken probe возвращает 403 → {ok: false, error: содержит "scope" или "доступ"}
    - Test 5: validateWbToken probe timeout (AbortController fires) → {ok: false, error: содержит "timeout" или "недоступен"}
    - Test 6: REQUIRED_SCOPE_BITS.WB_API_TOKEN deep-equal [1,2,3,5,6,7]
    - Test 7: REQUIRED_SCOPE_BITS.WB_RETURNS_TOKEN === [11], WB_CHAT_TOKEN === [9]

    **wb-token.ts (cache):**
    - Test 1: первый getWbToken("WB_API_TOKEN") при пустой БД + process.env.WB_API_TOKEN="bootstrap123" → возвращает "bootstrap123" + prisma.wbApiToken.create вызван (idempotent — мокируем upsert)
    - Test 2: повторный getWbToken в течение 5 сек НЕ вызывает БД (cache hit)
    - Test 3: getWbToken после 5+ сек → cache miss → новый prisma.findUnique
    - Test 4: invalidateWbTokenCache("WB_API_TOKEN") → следующий getWbToken идёт в БД
    - Test 5: getWbToken("WB_API_TOKEN") пустая БД + пустой process.env → throws "WB_API_TOKEN не настроен (нет ни в БД, ни в env)"
    - Test 6: WB_TOKEN_NAMES = ["WB_API_TOKEN", "WB_RETURNS_TOKEN", "WB_CHAT_TOKEN"] (const tuple)
  </behavior>
  <action>
    **2.1 Создать `lib/wb-token-validate.ts`:**
    ```typescript
    // Quick 260512-jxh: валидация WB JWT-токена при replace.
    // 3 шага: decode → scope check → probe call. Все три должны пройти.

    import { decodeWbJwt, WB_SCOPE_LABELS, type WbJwtPayload } from "@/lib/wb-jwt"

    export type WbTokenName = "WB_API_TOKEN" | "WB_RETURNS_TOKEN" | "WB_CHAT_TOKEN"

    export const REQUIRED_SCOPE_BITS: Record<WbTokenName, number[]> = {
      WB_API_TOKEN: [1, 2, 3, 5, 6, 7],
      WB_RETURNS_TOKEN: [11],
      WB_CHAT_TOKEN: [9],
    }

    const PROBE_ENDPOINTS: Record<WbTokenName, string> = {
      WB_API_TOKEN: "https://content-api.wildberries.ru/ping",
      WB_RETURNS_TOKEN: "https://returns-api.wildberries.ru/api/v1/claims?is_archive=false&limit=1",
      WB_CHAT_TOKEN: "https://buyer-chat-api.wildberries.ru/api/v1/seller/events?next=0",
    }

    const PROBE_TIMEOUT_MS = 5000

    export type ValidateResult =
      | { ok: true; decoded: WbJwtPayload }
      | { ok: false; error: string }

    export async function validateWbToken(
      name: WbTokenName,
      value: string
    ): Promise<ValidateResult> {
      // Step 1: decode
      let decoded: WbJwtPayload
      try {
        decoded = decodeWbJwt(value)
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Invalid JWT" }
      }

      // Step 2: scope check
      const required = REQUIRED_SCOPE_BITS[name]
      const missing = required.filter((bit) => !decoded.scopeBits.includes(bit))
      if (missing.length > 0) {
        const labels = missing.map((b) => WB_SCOPE_LABELS[b] ?? `bit ${b}`).join(", ")
        return {
          ok: false,
          error: `Не хватает scope-битов: ${labels}. Требуется: ${required.map((b) => WB_SCOPE_LABELS[b]).join(", ")}.`,
        }
      }

      // Step 3: probe call с timeout
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
      try {
        const res = await fetch(PROBE_ENDPOINTS[name], {
          method: "GET",
          headers: { Authorization: value },
          signal: controller.signal,
        })
        clearTimeout(timer)
        if (res.status === 401) {
          return { ok: false, error: "Неверный токен (WB API ответил 401)" }
        }
        if (res.status === 403) {
          return { ok: false, error: "Недостаточно прав scope (WB API ответил 403)" }
        }
        if (!res.ok) {
          return { ok: false, error: `Probe call вернул статус ${res.status}` }
        }
        return { ok: true, decoded }
      } catch (e) {
        clearTimeout(timer)
        if (e instanceof Error && e.name === "AbortError") {
          return { ok: false, error: `Probe call WB API недоступен (timeout ${PROBE_TIMEOUT_MS}ms)` }
        }
        return { ok: false, error: e instanceof Error ? e.message : "Probe call failed" }
      }
    }
    ```

    **2.2 Создать `lib/wb-token.ts`** — cache + bootstrap (per CONTEXT D-Hot-reload):
    ```typescript
    // Quick 260512-jxh: hot-reload WB-токенов с TTL 5 сек.
    // Source of truth: prisma.wbApiToken. Bootstrap из process.env при пустой БД.

    import { prisma } from "@/lib/prisma"
    import { decodeWbJwt } from "@/lib/wb-jwt"

    export const WB_TOKEN_NAMES = [
      "WB_API_TOKEN",
      "WB_RETURNS_TOKEN",
      "WB_CHAT_TOKEN",
    ] as const
    export type WbTokenName = (typeof WB_TOKEN_NAMES)[number]

    const CACHE_TTL_MS = 5000
    const cache = new Map<WbTokenName, { value: string; fetchedAt: number }>()

    export function invalidateWbTokenCache(name?: WbTokenName) {
      if (name) cache.delete(name)
      else cache.clear()
    }

    async function bootstrapFromEnv(name: WbTokenName): Promise<string | null> {
      const envValue = process.env[name]
      if (!envValue) return null
      // Decode чтобы заполнить scopeBitmask/iat/exp/sid/oid.
      // Если env-токен сломан — fail fast, не создаём запись с null-полями.
      try {
        const decoded = decodeWbJwt(envValue)
        await prisma.wbApiToken.upsert({
          where: { name },
          create: {
            name,
            value: envValue,
            scopeBitmask: decoded.scopeBitmask,
            issuedAt: decoded.issuedAt,
            expiresAt: decoded.expiresAt,
            sellerId: decoded.sellerId,
            organizationId: decoded.organizationId,
            updatedById: null, // bootstrap marker
          },
          update: {}, // idempotent — не перезаписываем существующую запись
        })
        return envValue
      } catch (e) {
        // Невалидный env-токен — возвращаем null чтобы getWbToken бросил понятную ошибку.
        return null
      }
    }

    export async function getWbToken(name: WbTokenName): Promise<string> {
      const now = Date.now()
      const cached = cache.get(name)
      if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.value
      }
      const record = await prisma.wbApiToken.findUnique({ where: { name } })
      if (record) {
        cache.set(name, { value: record.value, fetchedAt: now })
        return record.value
      }
      // Bootstrap: пусто в БД → читаем env и пишем в БД.
      const fromEnv = await bootstrapFromEnv(name)
      if (fromEnv) {
        cache.set(name, { value: fromEnv, fetchedAt: now })
        return fromEnv
      }
      throw new Error(`${name} не настроен (нет ни в БД, ни в env)`)
    }
    ```

    **2.3 Создать тесты:**
    - `tests/wb-token-validate.test.ts` — mock global.fetch через vi.stubGlobal, проверить все 7 поведений
    - `tests/wb-token-cache.test.ts` — mock prisma через `vi.mock("@/lib/prisma", ...)` с vi.hoisted (паттерн tests/stock-actions.test.ts), `vi.useFakeTimers()` для TTL теста (vi.advanceTimersByTime(5001))

    Per CLAUDE.md vitest pattern: `vi.hoisted` для prismaMock, `vi.resetAllMocks()` в beforeEach.
  </action>
  <verify>
    <automated>npm run test -- wb-token --run</automated>
  </verify>
  <done>
    - lib/wb-token-validate.ts экспортирует validateWbToken, REQUIRED_SCOPE_BITS, WbTokenName
    - lib/wb-token.ts экспортирует getWbToken, invalidateWbTokenCache, WB_TOKEN_NAMES, WbTokenName
    - tests/wb-token-validate.test.ts — 7 тестов, все green
    - tests/wb-token-cache.test.ts — 6 тестов, все green (включая TTL с fake timers)
    - npm run test -- wb-token --run → all passed
  </done>
</task>

<task type="auto">
  <name>Task 3: Замена process.env.WB_*_TOKEN на await getWbToken в lib/wb-api.ts и lib/wb-support-api.ts</name>
  <files>
    lib/wb-api.ts
    lib/wb-support-api.ts
    app/api/wb-sync-spp/route.ts
    scripts/wb-stocks-diagnose.js
    scripts/wb-sync-characteristics.js
    scripts/wb-sync-stocks.js
  </files>
  <action>
    **Цель**: каждый runtime-вызов WB API в server-side коде должен идти через `await getWbToken(...)` чтобы видеть hot-reload изменения через ≤5 секунд. Standalone scripts (`scripts/wb-*.js`) остаются на process.env — они одноразовые, не часть hot-loop.

    **3.1 `lib/wb-api.ts`** (line 51-55):

    BEFORE:
    ```typescript
    function getToken(): string {
      const token = process.env.WB_API_TOKEN
      if (!token) throw new Error("WB_API_TOKEN не настроен")
      return token
    }
    ```

    AFTER:
    ```typescript
    import { getWbToken } from "@/lib/wb-token"

    async function getToken(): Promise<string> {
      return await getWbToken("WB_API_TOKEN")
    }
    ```

    Затем найти все вызовы `getToken()` в lib/wb-api.ts (через Grep) и заменить на `await getToken()`. Вызывающие функции уже все async (это RSC/route handlers).

    **3.2 `lib/wb-support-api.ts`** (line 19-39):

    BEFORE:
    ```typescript
    function getToken(): string { /* WB_API_TOKEN */ }
    function getReturnsToken(): string { /* WB_RETURNS_TOKEN ?? WB_API_TOKEN */ }
    function getChatToken(): string { /* WB_CHAT_TOKEN ?? WB_API_TOKEN */ }
    ```

    AFTER:
    ```typescript
    import { getWbToken } from "@/lib/wb-token"

    async function getToken(): Promise<string> {
      return await getWbToken("WB_API_TOKEN")
    }
    async function getReturnsToken(): Promise<string> {
      try {
        return await getWbToken("WB_RETURNS_TOKEN")
      } catch {
        // Fallback на WB_API_TOKEN для dev/test (паттерн оригинала)
        return await getWbToken("WB_API_TOKEN")
      }
    }
    async function getChatToken(): Promise<string> {
      try {
        return await getWbToken("WB_CHAT_TOKEN")
      } catch {
        return await getWbToken("WB_API_TOKEN")
      }
    }
    ```

    Затем в callWb/callReturnsApi/callChatApi (line 189-209) изменить `getToken()` → `await getToken()`. Эти функции уже async — signature не меняется.

    **3.3 `app/api/wb-sync-spp/route.ts`** (line 98):

    BEFORE: `const token = process.env.WB_API_TOKEN!`
    AFTER:
    ```typescript
    import { getWbToken } from "@/lib/wb-token"
    // ...
    const token = await getWbToken("WB_API_TOKEN")
    ```

    **3.4 `scripts/wb-*.js`** — оставить `process.env.WB_API_TOKEN` БЕЗ изменений. Это standalone CLI-скрипты, запускаются вручную из консоли, не часть hot-reload loop. Добавить комментарий ABOVE объявления:
    ```javascript
    // NB: standalone скрипт — читает env напрямую (не через lib/wb-token).
    // Для UI replace-flow см. lib/wb-token.ts. Quick 260512-jxh.
    const TOKEN = process.env.WB_API_TOKEN
    ```

    **3.5 Проверка**: после изменений запустить полный test suite — все существующие WB-тесты должны проходить с моками. `tests/wb-support-api.test.ts`, `tests/wb-returns-api.test.ts`, `tests/wb-chat-api.test.ts`, `tests/wb-promotions-api.test.ts` — там везде стоит `process.env.WB_API_TOKEN = "test-token"` в beforeAll. После рефакторинга эти тесты сломаются (getToken теперь идёт в `lib/wb-token.ts` → `prisma.wbApiToken.findUnique`).

    **Решение**: в каждом из этих тест-файлов добавить mock на lib/wb-token:
    ```typescript
    vi.mock("@/lib/wb-token", () => ({
      getWbToken: vi.fn(async (name: string) => {
        if (name === "WB_API_TOKEN") return "test-token"
        if (name === "WB_RETURNS_TOKEN") return "test-returns-token"
        if (name === "WB_CHAT_TOKEN") return "test-chat-token"
        throw new Error(`${name} не настроен`)
      }),
      invalidateWbTokenCache: vi.fn(),
      WB_TOKEN_NAMES: ["WB_API_TOKEN", "WB_RETURNS_TOKEN", "WB_CHAT_TOKEN"],
    }))
    ```

    Применить к: wb-support-api.test.ts, wb-returns-api.test.ts, wb-chat-api.test.ts, wb-promotions-api.test.ts, wb-sync-route.test.ts, wb-stocks-per-warehouse.test.ts, wb-orders-per-warehouse.test.ts, support-sync-returns.test.ts, support-sync.test.ts, support-sync-chats.test.ts.

    Process.env.WB_*_TOKEN присвоения внутри beforeAll можно оставить — они не помешают (просто не используются).
  </action>
  <verify>
    <automated>npm run test --run</automated>
  </verify>
  <done>
    - Grep `process\.env\.WB_(API|RETURNS|CHAT)_TOKEN` в lib/, app/api/ возвращает 0 hits (кроме комментариев)
    - scripts/wb-*.js — process.env остался + добавлен поясняющий комментарий
    - tests/wb-support-api.test.ts и пр. имеют vi.mock на @/lib/wb-token
    - npm run test --run → все существующие тесты green (никаких регрессий)
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Server actions + UI tab «WB API токены» + integration в SettingsTabs</name>
  <files>
    app/actions/wb-tokens.ts
    components/settings/WbTokensTab.tsx
    components/settings/SettingsTabs.tsx
    app/(dashboard)/admin/settings/page.tsx
    tests/wb-tokens-actions.test.ts
  </files>
  <behavior>
    **app/actions/wb-tokens.ts:**
    - Test 1: replaceWbToken не-superadmin → throws "FORBIDDEN" (requireSuperadmin gate)
    - Test 2: replaceWbToken({name: "WB_API_TOKEN", value: "bad"}) → validateWbToken returns ok:false → возвращает {ok: false, error: ...} БЕЗ записи в БД (prisma.wbApiToken.upsert НЕ вызван)
    - Test 3: replaceWbToken success → prisma.wbApiToken.upsert вызван с правильными полями + invalidateWbTokenCache вызван + revalidatePath("/admin/settings")
    - Test 4: listWbTokens возвращает массив длины 3 (для каждого имени из WB_TOKEN_NAMES) — для отсутствующих в БД токенов возвращает entry с record:null
    - Test 5: listWbTokens НЕ возвращает поле value полностью — только last 4 chars ("...a4b2") + флаг hasValue
  </behavior>
  <action>
    **4.1 Создать `app/actions/wb-tokens.ts`:**
    ```typescript
    "use server"
    import { revalidatePath } from "next/cache"
    import { prisma } from "@/lib/prisma"
    import { auth } from "@/lib/auth"
    import { requireSuperadmin } from "@/lib/rbac"
    import { validateWbToken } from "@/lib/wb-token-validate"
    import {
      invalidateWbTokenCache,
      WB_TOKEN_NAMES,
      type WbTokenName,
    } from "@/lib/wb-token"

    export interface WbTokenListItem {
      name: WbTokenName
      displayName: string // "WB Основной" | "WB Возвраты" | "WB Чат"
      hasValue: boolean
      maskedTail: string | null // "...a4b2" или null
      scopeBits: number[]
      issuedAt: string | null   // ISO
      expiresAt: string | null  // ISO
      sellerId: string | null
      organizationId: string | null
      updatedAt: string | null
      updatedBy: { id: string; name: string } | null
    }

    const DISPLAY_NAMES: Record<WbTokenName, string> = {
      WB_API_TOKEN: "WB Основной",
      WB_RETURNS_TOKEN: "WB Возвраты",
      WB_CHAT_TOKEN: "WB Чат",
    }

    function mask(value: string): string {
      return `...${value.slice(-4)}`
    }

    export async function listWbTokens(): Promise<WbTokenListItem[]> {
      await requireSuperadmin()
      const records = await prisma.wbApiToken.findMany({
        include: { updatedBy: { select: { id: true, name: true } } },
      })
      const byName = new Map(records.map((r) => [r.name as WbTokenName, r]))
      // Decode scopeBitmask → scopeBits для каждого record (lazy — на UI)
      const { decodeScopeBits } = await import("@/lib/wb-jwt")
      return WB_TOKEN_NAMES.map((name) => {
        const r = byName.get(name)
        if (!r) {
          return {
            name,
            displayName: DISPLAY_NAMES[name],
            hasValue: false,
            maskedTail: null,
            scopeBits: [],
            issuedAt: null,
            expiresAt: null,
            sellerId: null,
            organizationId: null,
            updatedAt: null,
            updatedBy: null,
          }
        }
        return {
          name,
          displayName: DISPLAY_NAMES[name],
          hasValue: true,
          maskedTail: mask(r.value),
          scopeBits: decodeScopeBits(r.scopeBitmask),
          issuedAt: r.issuedAt.toISOString(),
          expiresAt: r.expiresAt.toISOString(),
          sellerId: r.sellerId,
          organizationId: r.organizationId,
          updatedAt: r.updatedAt.toISOString(),
          updatedBy: r.updatedBy,
        }
      })
    }

    export async function replaceWbToken(input: {
      name: WbTokenName
      value: string
    }): Promise<{ ok: true } | { ok: false; error: string }> {
      await requireSuperadmin()
      const session = await auth()
      const userId = session?.user?.id ?? null

      const trimmed = input.value.trim()
      if (!trimmed) return { ok: false, error: "Пустое значение токена" }
      if (!WB_TOKEN_NAMES.includes(input.name)) {
        return { ok: false, error: "Неизвестное имя токена" }
      }

      const validation = await validateWbToken(input.name, trimmed)
      if (!validation.ok) return validation

      try {
        await prisma.wbApiToken.upsert({
          where: { name: input.name },
          create: {
            name: input.name,
            value: trimmed,
            scopeBitmask: validation.decoded.scopeBitmask,
            issuedAt: validation.decoded.issuedAt,
            expiresAt: validation.decoded.expiresAt,
            sellerId: validation.decoded.sellerId,
            organizationId: validation.decoded.organizationId,
            updatedById: userId,
          },
          update: {
            value: trimmed,
            scopeBitmask: validation.decoded.scopeBitmask,
            issuedAt: validation.decoded.issuedAt,
            expiresAt: validation.decoded.expiresAt,
            sellerId: validation.decoded.sellerId,
            organizationId: validation.decoded.organizationId,
            updatedById: userId,
          },
        })
        invalidateWbTokenCache(input.name)
        revalidatePath("/admin/settings")
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Ошибка записи в БД" }
      }
    }
    ```

    **4.2 Создать `components/settings/WbTokensTab.tsx`** — client component с 3 карточками + Dialog для replace:

    Структура:
    - props: `tokens: WbTokenListItem[]` (передаётся из RSC page)
    - useState: `editing: WbTokenName | null` (какая карточка открыта в модалке)
    - useState: `value: string`, `isPending`, `error: string | null`
    - useTransition для async submit

    Per CLAUDE.md UI conventions:
    - shadcn Dialog (`components/ui/dialog.tsx` — base-ui wrapper, render-prop)
    - `<textarea>` с min-height (JWT длинный)
    - toast.success / toast.error из "sonner"
    - Color thresholds (CONTEXT D-UI): green > 30d, yellow ≤30d, red ≤7d, dark-red expired
    - Chip-список scope: `bg-secondary text-xs px-2 py-0.5 rounded-full`
    - Дата формат: `DD.MM.YYYY` (Moscow TZ через `toLocaleDateString("ru-RU", {timeZone: "Europe/Moscow"})`)
    - Кнопки: Button variant="default" для «Заменить», variant="outline" для «Отмена»

    Skeleton:
    ```tsx
    "use client"
    import { useState, useTransition } from "react"
    import { toast } from "sonner"
    import { Button } from "@/components/ui/button"
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
    import { replaceWbToken, type WbTokenListItem } from "@/app/actions/wb-tokens"
    import { WB_SCOPE_LABELS } from "@/lib/wb-jwt"

    function daysRemaining(expiresAt: string | null): number | null { /* ... */ }
    function colorForDaysLeft(days: number | null): string {
      if (days === null) return "text-muted-foreground"
      if (days < 0) return "text-red-700 dark:text-red-400 font-semibold"
      if (days <= 7) return "text-red-600"
      if (days <= 30) return "text-yellow-600"
      return "text-green-600"
    }
    function formatDate(iso: string | null): string {
      if (!iso) return "—"
      return new Date(iso).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })
    }

    export function WbTokensTab({ tokens }: { tokens: WbTokenListItem[] }) {
      return (
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {tokens.map((t) => <WbTokenCard key={t.name} token={t} />)}
        </div>
      )
    }

    function WbTokenCard({ token }: { token: WbTokenListItem }) {
      const [open, setOpen] = useState(false)
      const [value, setValue] = useState("")
      const [error, setError] = useState<string | null>(null)
      const [isPending, startTransition] = useTransition()
      const days = daysRemaining(token.expiresAt)

      function handleSubmit() {
        setError(null)
        startTransition(async () => {
          const result = await replaceWbToken({ name: token.name, value })
          if (result.ok) {
            toast.success("Токен обновлён")
            setOpen(false)
            setValue("")
          } else {
            setError(result.error)
          }
        })
      }

      return (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <div>
              <h3 className="font-semibold">{token.displayName}</h3>
              <p className="text-xs text-muted-foreground font-mono">{token.name}</p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button size="sm" variant="outline">Заменить</Button>} />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Заменить {token.displayName}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <textarea
                    className="w-full min-h-32 rounded border p-2 font-mono text-xs"
                    placeholder="Вставьте JWT токен из ЛК WB"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    disabled={isPending}
                  />
                  {error && (
                    <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded p-2">
                      {error}
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                      Отмена
                    </Button>
                    <Button onClick={handleSubmit} disabled={isPending || !value.trim()}>
                      {isPending ? "Проверяем..." : "Проверить и сохранить"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {!token.hasValue ? (
            <p className="text-sm text-muted-foreground italic">Токен не настроен</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                {token.scopeBits.map((bit) => (
                  <span key={bit} className="bg-secondary text-xs px-2 py-0.5 rounded-full">
                    {WB_SCOPE_LABELS[bit] ?? `bit ${bit}`}
                  </span>
                ))}
              </div>
              <div className="text-sm space-y-1">
                <div>Выпущен: <span className="font-mono">{formatDate(token.issuedAt)}</span></div>
                <div>
                  Истекает: <span className="font-mono">{formatDate(token.expiresAt)}</span>{" "}
                  <span className={colorForDaysLeft(days)}>
                    {days === null ? "" : days < 0 ? `(истёк ${Math.abs(days)} дн. назад)` : `(осталось ${days} дн.)`}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Значение: <span className="font-mono">{token.maskedTail}</span>
                </div>
                {token.updatedBy && (
                  <div className="text-xs text-muted-foreground">
                    Обновил: {token.updatedBy.name} ({formatDate(token.updatedAt)})
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )
    }
    ```

    **4.3 Интеграция в `components/settings/SettingsTabs.tsx`**:

    Добавить prop `wbTokens: WbTokenListItem[]`. Добавить TabsTrigger value="wb-tokens" и TabsContent — но **только если есть token-данные** (RSC уже отфильтровал — non-superadmin не получит).

    ```tsx
    interface SettingsTabsProps {
      brands: BrandWithCategories[]
      marketplaces: MarketplaceRow[]
      directions: DirectionWithBrands[]
      brandsLite: BrandLite[]
      wbTokens: WbTokenListItem[] | null // null = не показывать tab (non-superadmin)
    }

    export function SettingsTabs({ brands, marketplaces, directions, brandsLite, wbTokens }: SettingsTabsProps) {
      return (
        <Tabs defaultValue="directions">
          <TabsList>
            <TabsTrigger value="directions">Направления</TabsTrigger>
            <TabsTrigger value="brands">Бренды</TabsTrigger>
            <TabsTrigger value="categories">Категории</TabsTrigger>
            <TabsTrigger value="marketplaces">Маркетплейсы</TabsTrigger>
            {wbTokens && <TabsTrigger value="wb-tokens">WB API токены</TabsTrigger>}
          </TabsList>
          {/* ... existing TabsContent ... */}
          {wbTokens && (
            <TabsContent value="wb-tokens">
              <WbTokensTab tokens={wbTokens} />
            </TabsContent>
          )}
        </Tabs>
      )
    }
    ```

    Импорт WbTokensTab + WbTokenListItem type. Импорт type из `app/actions/wb-tokens.ts` (type-only import).

    **4.4 Обновить `app/(dashboard)/admin/settings/page.tsx`**:

    Page уже защищён `await requireSuperadmin()` (line 7). Значит здесь всегда SUPERADMIN — wbTokens всегда подгружаем:

    ```typescript
    import { listWbTokens } from "@/app/actions/wb-tokens"
    // ...
    const [brands, marketplaces, directions, wbTokens] = await Promise.all([
      prisma.brand.findMany({ /* ... */ }),
      prisma.marketplace.findMany({ /* ... */ }),
      prisma.productDirection.findMany({ /* ... */ }),
      listWbTokens(),
    ])
    // ...
    <SettingsTabs
      brands={brands}
      marketplaces={marketplaces}
      directions={directions}
      brandsLite={brandsLite}
      wbTokens={wbTokens}
    />
    ```

    NB: `listWbTokens` сам вызывает `requireSuperadmin()` — double-check OK (idempotent).

    **4.5 Тесты `tests/wb-tokens-actions.test.ts`:**

    Использовать тот же паттерн моков что в Phase 9 tests/return-actions.test.ts:
    - `vi.mock("@/lib/auth", ...)` — auth() возвращает session с role SUPERADMIN | MANAGER
    - `vi.mock("@/lib/rbac", ...)` — requireSuperadmin throws "FORBIDDEN" если session.user.role !== "SUPERADMIN"
    - `vi.mock("@/lib/prisma", ...)` — prismaMock с findMany/upsert spies (vi.hoisted)
    - `vi.mock("@/lib/wb-token-validate", ...)` — validateWbToken mocked, returns ok:true для valid, ok:false для bad
    - `vi.mock("@/lib/wb-token", ...)` — invalidateWbTokenCache spy
    - `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))`

    Все 5 поведений выше.
  </action>
  <verify>
    <automated>npm run test -- wb-tokens-actions --run && npx tsc --noEmit</automated>
  </verify>
  <done>
    - app/actions/wb-tokens.ts экспортирует listWbTokens, replaceWbToken, WbTokenListItem
    - components/settings/WbTokensTab.tsx — client component с 3 карточками + Dialog для replace
    - SettingsTabs.tsx содержит conditional TabsTrigger/TabsContent для wb-tokens
    - app/(dashboard)/admin/settings/page.tsx передаёт wbTokens в SettingsTabs
    - tests/wb-tokens-actions.test.ts — 5 тестов green
    - npx tsc --noEmit → 0 errors
    - npm run test --run → all passed
  </done>
</task>

</tasks>

<verification>
**Целевой smoke flow (manual after deploy):**

1. Login as sergey.fyodorov@gmail.com → /admin/settings → видна tab «WB API токены»
2. Login as non-superadmin (если есть test-юзер с MANAGER role) → tab НЕ виден
3. Bootstrap: первый visit /admin/settings после деплоя → tab показывает 1 токен (WB_API_TOKEN из env), остальные 2 «не настроены» (так как WB_RETURNS_TOKEN/WB_CHAT_TOKEN могут быть пустыми в env — fallback на WB_API_TOKEN при getReturnsToken не пишет в БД WB_RETURNS_TOKEN, только читает)
4. Кнопка «Заменить» на карточке WB Основной → Dialog открывается
5. Paste невалидный токен (например "abc") → submit → error в Dialog: «Invalid JWT format»
6. Paste валидный токен но с урезанным scope → submit → error: «Не хватает scope-битов: Отзывы, ...»
7. Paste валидный полный токен → submit → loading "Проверяем..." → success → Dialog закрывается, toast «Токен обновлён», карточка перерисовывается с новыми датами
8. В течение 5 секунд после save сделать sync (например клик «Скидка WB») — getWbToken вернёт новое значение (cache invalidated в server action)
9. Token VALUE никогда не видно — DevTools Network tab → React Server Component payload не содержит полного value (только `maskedTail: "...XXXX"`)

**Automated:**
- `npm run test --run` — все unit-тесты green (новые + существующие без регрессий)
- `npx tsc --noEmit` — 0 type errors
- `npm run build` — production build passes
- Grep `process\.env\.WB_(API|RETURNS|CHAT)_TOKEN` в lib/ и app/api/ → 0 hits (кроме комментариев)

**DB migration verification (на VPS после deploy):**
- `psql -d zoiten_erp -c "SELECT * FROM \"WbApiToken\";"` после первого запроса → 1 row для WB_API_TOKEN (bootstrap)
- updatedById IS NULL (bootstrap marker)
</verification>

<success_criteria>
- [ ] SUPERADMIN может через UI заменить любой из 3 WB-токенов без SSH
- [ ] Replace требует прохождения 3 шагов: decode JWT → scope check → probe call (200/401/403/timeout corectly handled)
- [ ] Hot-reload работает: следующий запрос в течение ≤5 сек видит новое значение (cache invalidated + revalidatePath)
- [ ] Все `process.env.WB_*_TOKEN` в lib/wb-api.ts, lib/wb-support-api.ts, app/api/wb-sync-spp/route.ts заменены на `await getWbToken(...)` (scripts/wb-*.js остались — это standalone CLI)
- [ ] Bootstrap: первый getWbToken("WB_API_TOKEN") при пустой БД читает env и пишет в БД (idempotent, updatedById=null)
- [ ] Non-superadmin не видит tab «WB API токены»
- [ ] Token VALUE никогда не сериализуется в client props (только last 4 chars)
- [ ] Все server actions защищены `requireSuperadmin()`
- [ ] 4 новых test файла: wb-jwt.test.ts, wb-token-validate.test.ts, wb-token-cache.test.ts, wb-tokens-actions.test.ts — все green
- [ ] Существующие WB-тесты обновлены с моком на `@/lib/wb-token` и проходят без регрессий
- [ ] Атомарные коммиты per task (4 коммита: feat, feat, refactor, feat)
- [ ] Conventional commit messages: feat(wb-tokens): ..., refactor(wb-api): ...
</success_criteria>

<output>
After completion, create `.planning/quick/260512-jxh-wb-api-crud-api-ssh/260512-jxh-SUMMARY.md` с:
- Краткое описание реализации (4 task'а)
- Список созданных файлов с purpose
- Migration deployment note (DB migration pending VPS deploy через `deploy.sh`)
- UAT checklist (smoke flow из <verification> выше)
- Known limits: probe endpoints не возвращают 200 на все WB API единообразно — если /ping вернёт 404 (изменили URL в WB), нужно зафиксировать рабочий endpoint в lib/wb-token-validate.ts:PROBE_ENDPOINTS
</output>
