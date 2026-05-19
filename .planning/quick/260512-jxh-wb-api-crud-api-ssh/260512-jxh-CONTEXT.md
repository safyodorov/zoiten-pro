---
name: 260512-jxh-CONTEXT
description: Locked decisions for WB API token CRUD settings tab
gathered: 2026-05-12
status: Ready for planning
---

# Quick Task 260512-jxh: WB API токены — настройки CRUD для управления API-ключами без SSH — Context

**Gathered:** 2026-05-12
**Status:** Ready for planning (все решения locked через AskUserQuestion before launch)

<domain>
## Task Boundary

Дать пользователю самостоятельно (без SSH на VPS и редактирования `/etc/zoiten.pro.env`) заменять любой из 3-х WB API токенов в `/admin/settings` → новый tab «WB API токены». UI показывает: scope-биты, дата выпуска, дата истечения, индикатор «осталось N дней», маскированное значение. Replace через modal с probe-validation перед сохранением.
</domain>

<decisions>
## Implementation Decisions

### Storage strategy
- **Tokens переносятся в БД** (Prisma model `WbApiToken`).
- Env остаётся для **one-time bootstrap**: первый запуск `getWbToken()` если в БД нет записи — читает `process.env.WB_API_TOKEN` (и др.) и **создаёт строку**. Дальше БД = source of truth.
- **Hot-reload**: in-memory cache в `lib/wb-token.ts` с TTL 5 сек. После UI-смены изменение в БД, через ≤5 сек активные процессы видят новый токен. Никакого systemd restart.

### Scope управления
- Все **3 токена**:
  - `WB_API_TOKEN` (main, scope bits 1=Контент / 2=Аналитика / 3=Цены / 5=Отзывы / 6=Статистика / 7=Тарифы)
  - `WB_RETURNS_TOKEN` (bit 11=Возвраты)
  - `WB_CHAT_TOKEN` (bit 9=Чат)
- Каждый — отдельная строка в UI.

### Validation при сохранении
1. **Decode JWT payload** (base64.urlDecode middle segment) → извлечь `s` (bitmask scope), `iat` (issued at), `exp` (expiration), `sid` (seller id), `oid` (organization id).
2. **Сверить scope-биты**: для WB_API ожидаем **минимум** {1, 2, 3, 5, 6, 7}; для WB_RETURNS — {11}; для WB_CHAT — {9}. Если каких-то битов не хватает → block с понятной ошибкой, перечислением недостающих.
3. **Probe call**: дёрнуть лёгкий endpoint с этим токеном:
   - WB_API → `GET https://content-api.wildberries.ru/ping`
   - WB_RETURNS → соответствующий /ping returns-api
   - WB_CHAT → соответствующий /ping buyer-chat-api
   - Ждём `200`; `401` → block; прочее → block с показом статуса.
4. **Только при passed ВСЕХ трёх шагах** — пишем в БД через upsert + `updatedById` = currentUser.

### RBAC
- **Только SUPERADMIN** (`requireSuperadmin()` в server actions).
- Non-superadmin **не видит** tab «WB API токены» в SettingsTabs (server-side hide через session).
- Token VALUE никогда не показывается полностью — только last 4 chars («...a4b2»). В БД хранится полное значение (нужно для авторизации в WB API).

### UI компоненты
- **Tab «WB API токены»** в `/admin/settings` рядом с Бренды/Категории/Маркетплейсы.
- **3 карточки** (или 3 строки таблицы — на усмотрение, фиксирую: **карточки** для лучшей читаемости больших scope-списков):
  - Имя токена (читаемое: «WB Основной», «WB Возвраты», «WB Чат») + technical name под (WB_API_TOKEN)
  - Scope decoded — chip-список («Контент», «Аналитика», «Цены», «Отзывы», «Статистика», «Тарифы»)
  - Issued at (DD.MM.YYYY)
  - Expires at (DD.MM.YYYY + «осталось N дней» — цвет: green > 30d, yellow ≤30d, red ≤7d, dark-red expired)
  - Last 4 chars: «...a4b2»
  - Last updated by (User.name + datetime)
  - Кнопка **«Заменить»** → modal с `<textarea>` (multi-line — JWT длинный) + кнопка «Проверить и сохранить»
- При нажатии «Проверить и сохранить»:
  - Loading «Проверяем токен...» (spinner)
  - Server action `replaceWbToken(name, newValue)` → validate → save
  - Success: toast.success, modal closes, карточка перерисовывается с новыми данными
  - Error: красная зона в modal с конкретной ошибкой (не хватает scope-битов / probe failed / network)

### Audit
- `WbApiToken.updatedAt` (auto)
- `WbApiToken.updatedById String? @relation(User)` (nullable — для bootstrap из env при первой миграции)

### Hot-reload механизм
- `lib/wb-token.ts` экспортирует `getWbToken(name: "WB_API_TOKEN" | "WB_RETURNS_TOKEN" | "WB_CHAT_TOKEN"): Promise<string>`
- Cache: `Map<string, { value: string, fetchedAt: number }>` с TTL 5000ms
- На каждый запрос: если `now - fetchedAt > TTL` → refresh из БД.
- Все вызовы `process.env.WB_*_TOKEN` в коде заменить на `await getWbToken(...)`.

</decisions>

<specifics>
## Specific Ideas / Constraints

**WB JWT format (observed)**: standard JWT, 3 segments dot-separated, middle is base64-url-encoded JSON with:
- `s` — bitmask (integer): сумма 2^bit для каждого выбранного scope
- `iat` — Unix timestamp seconds
- `exp` — Unix timestamp seconds
- `sid` — string seller id (UUID-ish)
- `oid` — string organization id

**Scope bit mapping (из WB docs + проектного CLAUDE.md):**
| Bit | Scope name | Russian label |
|-----|------------|---------------|
| 1   | Content    | Контент       |
| 2   | Analytics  | Аналитика     |
| 3   | Prices     | Цены          |
| 4   | Marketing  | Продвижение   |
| 5   | Feedbacks  | Отзывы        |
| 6   | Statistics | Статистика    |
| 7   | Tariffs    | Тарифы        |
| 9   | Chat       | Чат           |
| 11  | Returns    | Возвраты      |

**Probe endpoints (verify after research if needed):**
- WB_API: `GET https://content-api.wildberries.ru/ping` (или `/api/v2/cards/limits` — самый лёгкий, возвращает текущие лимиты карточек)
- WB_RETURNS: `GET https://returns-api.wildberries.ru/api/v1/claims?date_from=...&date_to=...&take=0` (или ping если есть)
- WB_CHAT: `GET https://buyer-chat-api.wildberries.ru/api/v1/seller/info` (или аналог)

Если у конкретного API нет лёгкого ping endpoint'а — можно использовать первый GET endpoint этого API с минимальной нагрузкой (например `take=1` или `limit=1`).

**Bootstrap миграция**: при первом GET по `getWbToken("WB_API_TOKEN")` если БД пуста — fallback на `process.env.WB_API_TOKEN`, и СРАЗУ выполнить upsert в БД (idempotent — `updatedById = null`, тегается как «bootstrap from env»). После первого запроса БД содержит запись, следующие читают только её.

</specifics>

<canonical_refs>
## Canonical References

- **WB API docs (rate limits & scope bits):** https://dev.wildberries.ru/en/knowledge-base/articles/019d49a1-28ca-7735-bf2f-98210695abc7
- **JWT spec (RFC 7519):** https://datatracker.ietf.org/doc/html/rfc7519 — для decode payload
- **Project CLAUDE.md «WB API rate-limit защиты»**: контекст почему изоляция токенов важна
- **Существующий паттерн settings tabs**: `components/settings/SettingsTabs.tsx`, `components/settings/BrandsTab.tsx` — образец структуры
- **Существующий паттерн RBAC**: `lib/rbac.ts::requireSuperadmin()` — уже используется в `app/actions/users.ts`

</canonical_refs>
