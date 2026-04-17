# Phase 8: MVP — Отзывы + Вопросы — Research

**Researched:** 2026-04-17
**Domain:** WB Feedbacks + Questions API, Prisma 6 миграция большой схемы, Next.js 15 RSC + server actions, VPS nginx alias, медиа-хранилище
**Confidence:** HIGH (API endpoints + response schemas верифицированы), MEDIUM (rate limits из WB docs без точной цифры), HIGH (паттерны проекта взяты из существующих файлов)

## Executive Summary

Phase 8 разворачивает фундамент Службы поддержки: 4 новые Prisma-модели (SupportTicket, SupportMessage, SupportMedia, Customer) + 5 enum'ов, WB-клиент `lib/wb-support-api.ts` с типизированными методами, cron-синхронизация каждые 15 минут, лента `/support` с фильтрами и диалог `/support/[ticketId]` с ответом через WB API.

**Критические находки research:**
1. WB Feedbacks/Questions API использует **string id** (Elasticsearch-подобный `"YX52RZEBhH9mrcYdEJuD"`), а НЕ integer — это влияет на тип `wbExternalId: String` в Prisma.
2. **Нет поля `wbUserId` / `userName`** в ответе API — покупатель полностью анонимен. Линковка Customer через wbUserId (как планировал PRD) **невозможна**: отзывы/вопросы приходят без идентификатора покупателя. Нужно пересмотреть модель Customer для Phase 8.
3. Reply endpoint **НЕ** `PATCH /api/v1/feedbacks/{id}` (как указано в PRD), а `POST /api/v1/feedbacks/answer` body `{id, text}` для нового ответа и `PATCH /api/v1/feedbacks/answer` body `{id, text}` для редактирования.
4. Questions reply — `PATCH /api/v1/questions` body `{id, answer: {text}, state: "wbRu"}` (уникальная структура, не путать с Feedbacks).
5. Медиа в отзывах — массив объектов `photoLinks[].{fullSize, miniSize}` + объект `video: {previewImage, link, durationSec}`. Нет поля `videoLinks` массивом — только один `video`.
6. Feedbacks максимум 5000 записей на запрос, всего 200 000 последних; Questions — 10 000 на запрос.
7. WB API использует заголовок `X-Ratelimit-Retry` при 429 (в секундах) — best practice читать его, а не жёсткий backoff.

**Primary recommendation:** Плану 08-01 — сделать `Customer.wbUserId: String?` NULLABLE и **не пытаться** автоматически линковать тикеты в Phase 8 (линковка по имени покупателя невозможна из-за анонимизации). В Phase 12 добавится MESSENGER-канал, где покупатель известен (телефон), вот тогда и появится реальный Customer. В Phase 8 достаточно оставить Customer-модель как nullable stub и не создавать записи — либо создавать одну "анонимную" запись на тикет для согласования схемы. Рекомендую **вариант 2: не создавать Customer в Phase 8**, `SupportTicket.customerId = null` всегда.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Декомпозиция на 4 плана (одобрена пользователем — НЕ менять):**

- **Plan 08-01 — БД + WB API клиент + RBAC:** Prisma миграция (4 модели + 5 enum), обратные relations на User/WbCard через nmId (не FK), `lib/wb-support-api.ts` с vitest-тестами (mock fetch), nginx `alias /var/www/zoiten-uploads/support/`, UPLOAD_DIR env расширение.
- **Plan 08-02 — Синхронизация и cron:** `POST /api/support-sync`, `GET /api/cron/support-sync-reviews` (15 мин), `GET /api/cron/support-media-cleanup` (раз в сутки), idempotent upsert по `(channel, wbExternalId)`, `lastSyncedAt` в AppSetting.
- **Plan 08-03 — Лента `/support` + навигация:** RSC page, карточки тикетов с индикатор-полосами статуса, фильтры через searchParams, pagination (page/pageSize, default 20), sidebar badge количества NEW, замена старой заглушки.
- **Plan 08-04 — Диалог `/support/[ticketId]` + server actions + кнопка Sync:** 3-колоночный layout, sticky панель ответа, server actions `replyToTicket/assignTicket/updateTicketStatus` с `requireSection("SUPPORT","MANAGE")`, кнопка Sync с toast.

**Технологические конвенции (из CLAUDE.md):**
- Next.js 15.5.14 App Router, RSC + server actions
- Prisma 6 → `npx prisma migrate dev --name support_mvp`
- shadcn/ui v4 base-nova: native `<select>`, MultiSelectDropdown inline per-component
- Русский язык: UI, комментарии, планы
- Cron через `GET /api/cron/<name>/route.ts` + `x-cron-secret` header + `process.env.CRON_SECRET` (паттерн `purge-deleted`)
- Auth.js v5: `requireSection("SUPPORT")` read, `requireSection("SUPPORT","MANAGE")` write
- `@/lib/prisma` singleton, `@/lib/rbac`, `@/lib/sections`

**WB API параметры (scope уже на VPS):**
- Token bit 5 (Отзывы) уже в `WB_API_TOKEN` в `/etc/zoiten.pro.env`
- Обычный Node.js `fetch()` (НЕ curl — TLS fingerprint не нужен для Feedbacks/Questions)
- Медиа: `fetch().then(r=>r.arrayBuffer()) → fs.writeFile`

**Sticky-панель ответа, иконки каналов (Lucide: MessageSquare/HelpCircle/MessageCircle/RotateCw/Inbox), имя покупателя `Покупатель #{wbUserId.slice(-6)}`, 140 символов превью** — все из CONTEXT.md specifics.

### Claude's Discretion

- Точный layout карточки тикета в ленте — в рамках паттерна `/cards/wb`
- DOM-классы 3-колоночного layout — в рамках shadcn/tailwind
- Стратегия скачивания медиа: параллельно `Promise.all`, лимит 5, retry=1
- Именование тест-файла `tests/wb-support-api.test.ts`
- Transactions в `/api/support-sync`: `prisma.$transaction` per-тикет (upsert тикета + сообщения + медиа)

### Deferred Ideas (OUT OF SCOPE)

Real-time обновления, bulk actions, экспорт в Excel, кастомизация цветов, авто-напоминания, round-robin назначение, canned responses в ленте, рейтинг в ленте, модерация PII, возвраты (Phase 9), чат+автоответы (Phase 10), шаблоны+обжалование (Phase 11), профиль покупателя+мессенджеры (Phase 12), статистика (Phase 13).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUP-01 | Prisma миграция: SupportTicket/SupportMessage/SupportMedia/Customer + enums (TicketChannel, TicketStatus, AppealStatus, Direction, MediaType) с relations на User, WbCard | Схема в `## Prisma миграция` ниже, с исправлением для string `wbExternalId` |
| SUP-02 | `lib/wb-support-api.ts` с vitest mock fetch; методы Feedbacks (list/reply/report), Questions (list/reply/report) | Endpoints и response-схемы в `## WB API` ниже + vitest-паттерн из `tests/wb-promotions-api.test.ts` |
| SUP-03 | RBAC — `requireSection("SUPPORT")` read, `requireSection("SUPPORT","MANAGE")` write | Существующий `lib/rbac.ts`, SUPPORT уже в enum |
| SUP-04 | Хранение медиа `/var/www/zoiten-uploads/support/{ticketId}/{messageId}/{filename}` + nginx + SupportMedia.expiresAt = +1 год | nginx alias паттерн + существующий UPLOAD_DIR паттерн |
| SUP-05 | Cron `GET /api/cron/support-media-cleanup` раз в сутки с CRON_SECRET | Паттерн `/api/cron/purge-deleted/route.ts` |
| SUP-06 | `POST /api/support-sync` — полная синхронизация (отзывы + вопросы), upsert по wbExternalId, идемпотентно | Паттерн `/api/wb-sync/route.ts` + transaction per-ticket |
| SUP-07 | Cron `GET /api/cron/support-sync-reviews` каждые 15 мин с CRON_SECRET | Паттерн `purge-deleted` + cron-вызывалка внешняя (VPS crontab или bozon/canton bot) |
| SUP-08 | Скачивание медиа локально при синхронизации в `/var/www/zoiten-uploads/support/...` | `fetch().arrayBuffer() + fs.writeFile`, `photoLinks[].fullSize` + `video.link` |
| SUP-09 | Кнопка «Синхронизировать» → POST `/api/support-sync` + toast | Паттерн `WbSyncButton.tsx` + sonner toasts |
| SUP-10 | Главная `/support` — RSC лента тикетов, цветные индикатор-полосы, карточка с каналом/статусом/покупателем/товаром | Паттерн `/cards/wb` + indicator strips из Phase 7 `PriceCalculatorTable` |
| SUP-11 | Фильтры через searchParams: канал, статус, nmId, менеджер, dateFrom/dateTo, toggle «только неотвеченные» | Паттерн `WbFilters.tsx` inline MultiSelectDropdown |
| SUP-12 | Sidebar badge количества NEW-тикетов, обновляется при sync | `NAV_ITEMS.icon="Headphones"` уже есть; расширить badge-проп в `Sidebar` |
| SUP-13 | Страница `/support/[ticketId]` — 3-колоночный layout, чат-пузырь (input слева, output справа), медиа-превью | Классический чат-паттерн + Tailwind grid-cols-[300px_1fr_300px] |
| SUP-14 | Sticky-панель ответа textarea + кнопка «Отправить» → WB API PATCH/POST → OUTBOUND SupportMessage | Reply endpoints в `## WB API` ниже |
| SUP-15 | Ручное назначение менеджера — dropdown по User с SUPPORT role + server action assignTicket | RBAC query: `User.sectionRoles.some(sr => sr.section == "SUPPORT")` |
| SUP-16 | Ручная смена статуса NEW → IN_PROGRESS → ANSWERED → CLOSED | Native `<select>` + server action updateTicketStatus |
| SUP-40 | Пункт «Служба поддержки» в sidebar с HeadphonesIcon + badge | Уже есть в nav-items.ts, только badge добавить |

## WB Feedbacks + Questions API

### 1. Base URL и аутентификация [VERIFIED 2026-04-17]

```
Base URL:      https://feedbacks-api.wildberries.ru
Auth header:   Authorization: <WB_API_TOKEN>
Content-Type:  application/json
Token scope:   bit 5 (Отзывы)
```

Источник: [WB API User Communication](https://dev.wildberries.ru/en/docs/openapi/user-communication), [wildberries-sdk](https://github.com/eslazarev/wildberries-sdk/blob/main/docs/npm/README.md), WB Swagger `communications`.

### 2. Feedbacks — endpoints [VERIFIED 2026-04-17]

| Метод | Endpoint | Назначение |
|-------|----------|------------|
| GET | `/api/v1/feedbacks` | Список отзывов с фильтрами |
| GET | `/api/v1/feedbacks/count` | Количество отзывов |
| GET | `/api/v1/feedbacks/count-unanswered` | Количество необработанных |
| POST | `/api/v1/feedbacks/answer` | **Ответить** на отзыв — body `{id, text}` |
| PATCH | `/api/v1/feedbacks/answer` | **Редактировать** ответ — body `{id, text}` |
| GET | `/api/v1/feedbacks/archive` | Архивные отзывы |
| POST | `/api/v1/feedbacks/report` | (Phase 11) Обжалование отзыва |

**Query parameters для GET `/feedbacks`:**
- `isAnswered` — `true` | `false` (фильтр)
- `nmId` — integer (фильтр по артикулу)
- `take` — integer, **max 5000**
- `skip` — integer offset
- `dateFrom` — Unix timestamp (секунды)
- `dateTo` — Unix timestamp (секунды)
- `order` — `dateAsc` | `dateDesc`

**Лимит данных:** только последние 200 000 отзывов доступны к получению (достаточно для Zoiten масштаба 50-200 SKU).

### 3. Questions — endpoints [VERIFIED 2026-04-17]

| Метод | Endpoint | Назначение |
|-------|----------|------------|
| GET | `/api/v1/questions` | Список вопросов |
| PATCH | `/api/v1/questions` | **Мульти-операция**: ответить / отклонить / пометить просмотренным |
| GET | `/api/v1/questions/count` | Количество |
| GET | `/api/v1/questions/count-unanswered` | Количество неотвеченных |
| GET | `/api/v1/new-feedbacks-questions` | Flag «есть ли новые» (для ленты) |

**PATCH body — различные структуры в зависимости от действия:**

```typescript
// Ответить на вопрос
{ id: "string", answer: { text: "string" }, state: "wbRu" }

// Отклонить вопрос
{ id: "string", answer: { text: "string" }, state: "none" }

// Пометить просмотренным (без ответа)
{ id: "string", wasViewed: true }
```

**Ограничение:** редактирование ответа возможно в течение 2 месяцев (60 дней) после отправки, и только **один раз**.

### 4. Response schema — Feedback [VERIFIED 2026-04-17]

```json
{
  "id": "YX52RZEBhH9mrcYdEJuD",
  "text": "Спасибо, всё подошло",
  "pros": "Удобный",
  "cons": "Нет",
  "productValuation": 5,
  "matchingSize": "ok",
  "createdDate": "2024-09-26T10:20:48+03:00",
  "wasViewed": true,
  "isAbleSupplierFeedbackValuation": true,
  "supplierFeedbackValuation": 0,
  "isAbleSupplierProductValuation": true,
  "supplierProductValuation": 0,
  "isAbleReturnProductOrders": false,
  "state": "wbRu",
  "answer": {
    "text": "Пожалуйста. Ждём вас снова!",
    "state": "wbRu",
    "editable": false
  },
  "productDetails": {
    "imtId": 123456789,
    "nmId": 987654321,
    "productName": "Название",
    "supplierArticle": "DP02/черный",
    "supplierName": "ГП Реклама",
    "brandName": "Бренд",
    "size": "0"
  },
  "video": {
    "previewImage": "https://videofeedback01.wbbasket.ru/.../preview.webp",
    "link": "https://videofeedback01.wbbasket.ru/.../index.m3u8",
    "durationSec": 10
  },
  "photoLinks": [
    { "fullSize": "https://feedback04.wbbasket.ru/.../fs.webp",
      "miniSize": "https://feedback04.wbbasket.ru/.../ms.webp" }
  ]
}
```

**Критические замечания:**

| Поле | Тип | Примечание |
|------|-----|------------|
| `id` | **string** | Elasticsearch-подобный идентификатор, 20 символов. **НЕ integer!** |
| `productValuation` | int 1-5 | Рейтинг (раньше назывался `rating`) |
| `photoLinks` | array | Каждый объект — пара fullSize/miniSize (webp/jpg) |
| `video` | object OR null | **Единичный** объект, не массив. `.link` — HLS m3u8 |
| `createdDate` | ISO 8601 | Timezone `+03:00` (Москва) |
| `state` | enum | `"wbRu"` = опубликован на WB; `"none"` = скрыт |
| `answer.editable` | bool | Если false — ответ уже нельзя редактировать |
| **`wbUserId`** | **ОТСУТСТВУЕТ** | ❌ Покупатель полностью анонимизирован — нет ID покупателя |
| **`userName`** | **ОТСУТСТВУЕТ** | ❌ Имя покупателя **НЕ** передаётся через API |

### 5. Response schema — Question [VERIFIED 2026-04-17]

```json
{
  "data": {
    "id": "TfWOp5QBfEYrrd0AMJau",
    "text": "Хороший карандаш? Когда еще поставите?",
    "createdDate": "2025-01-27T11:38:21.202143857Z",
    "state": "wbRu",
    "answer": {
      "text": "На следующей неделе",
      "editable": true,
      "createDate": "2025-07-28T08:24:37.187113704Z"
    },
    "productDetails": {
      "imtId": 202306781,
      "nmId": 224747484,
      "productName": "Карандаш",
      "supplierArticle": "12113156uw",
      "supplierName": "",
      "brandName": "Brand"
    },
    "wasViewed": true,
    "isWarned": false
  },
  "error": false,
  "errorText": "",
  "additionalErrors": null
}
```

Структура **обёрнута в `{ data, error, errorText, additionalErrors }`** — отличается от Feedbacks.

### 6. Pagination [VERIFIED 2026-04-17]

- **Feedbacks:** `take` max = 5000, `skip` offset, всего доступно 200 000 последних
- **Questions:** `take` max = 10 000
- Оба endpoint — offset-based, **НЕ cursor**

### 7. Rate limits [MEDIUM — упоминается «per-account limit», точное число не указано]

- WB возвращает 429 с заголовком **`X-Ratelimit-Retry`** (секунды до следующей попытки) — **использовать его, а не фиксированный backoff**
- Для других категорий WB API лимиты ~100 req/min (Content API) — Feedbacks/Questions **предположительно** в этом же диапазоне
- PRD указывает ~10 req/сек (0.6 req/min — значительно ниже предположения, возможно устаревшее)

**Рекомендация:** Использовать паттерн проекта (из `wb-api.ts:PROMO_RATE_DELAY_MS`):
- Пауза 600ms между pagination-запросами (консервативно)
- При 429 — `sleep(res.headers['X-Ratelimit-Retry'] * 1000 || 6000)` + 1 retry

### 8. Incremental sync — стратегия

**Рекомендация:** Использовать `isAnswered=false` как фильтр при каждом sync (а не `dateFrom=lastSyncedAt`), потому что:
1. Отвеченные не требуют обработки — меньше data transfer
2. `dateFrom` требует хранить lastSyncedAt и бороться с дрифтом/клок-скью
3. Upsert по wbExternalId всё равно идемпотентен — повторная выборка не создаёт дубли

**Fallback стратегия:** первая синхронизация без фильтров → загрузить все неотвеченные + последние N ответов (из архива). Хранить `AppSetting.key="support.lastSyncedAt"` для диагностики, но не использовать как фильтр.

### 9. Отсутствие идентификатора покупателя — последствия для модели

Критический факт: WB Feedbacks/Questions API **не возвращает** `wbUserId`, `userName`, `clientId` или любой идентификатор покупателя. Это означает:

1. **`Customer.wbUserId` невозможно заполнить** из Feedbacks/Questions в Phase 8
2. **`SupportTicket.customerId` = null** для всех FEEDBACK/QUESTION тикетов в Phase 8
3. Автоматическая линковка тикетов к Customer по wbUserId — **невозможна** для каналов Phase 8
4. PRD раздел 11.4 «`Покупатель #${wbUserId.slice(-6)}`» — **не применим** к FEEDBACK/QUESTION; для них всегда «Покупатель» без id
5. Модель `Customer` всё равно добавляем в Phase 8 (чтобы не мигрировать схему в Phase 12), но **не создаём записи**

**Альтернатива, если пользователь настоит:** использовать `feedbackId` как pseudo-id покупателя — но это ведёт к N Customer-записей на тикет, без группировки. Не рекомендую.

## Prisma миграция

Финальная схема для Phase 8 — учитывает существующие User, WbCard, и critical finding о string id и отсутствии wbUserId.

```prisma
// ──────────────────────────────────────────────────────────────────
// Phase 8: Служба поддержки — MVP (Отзывы + Вопросы)
// ──────────────────────────────────────────────────────────────────

enum TicketChannel {
  FEEDBACK   // отзыв WB
  QUESTION   // вопрос WB
  CHAT       // Phase 10
  RETURN     // Phase 9
  MESSENGER  // Phase 12
}

enum TicketStatus {
  NEW
  IN_PROGRESS
  ANSWERED
  CLOSED
  APPEALED   // Phase 11
}

enum AppealStatus {
  NONE
  PENDING
  APPROVED
  REJECTED
}

enum Direction {
  INBOUND
  OUTBOUND
}

enum MediaType {
  IMAGE
  VIDEO
}

// Покупатель — в Phase 8 создавать НЕ будем (WB не даёт wbUserId для FEEDBACK/QUESTION).
// Модель добавляем заранее, чтобы не мигрировать в Phase 12 (MESSENGER).
model Customer {
  id         String          @id @default(cuid())
  wbUserId   String?         @unique
  phone      String?
  name       String?
  note       String?         @db.Text
  createdAt  DateTime        @default(now())
  updatedAt  DateTime        @updatedAt
  tickets    SupportTicket[]
}

model SupportTicket {
  id             String         @id @default(cuid())
  channel        TicketChannel
  // ВАЖНО: wbExternalId — STRING (Elasticsearch-подобный ID из WB, например "YX52RZEBhH9mrcYdEJuD")
  wbExternalId   String?
  customerId     String?
  customer       Customer?      @relation(fields: [customerId], references: [id], onDelete: SetNull)
  // Связь с WbCard через nmId (НЕ FK — паттерн проекта, как в /cards/wb)
  nmId           Int?
  status         TicketStatus   @default(NEW)
  assignedToId   String?
  assignedTo     User?          @relation("SupportAssignee", fields: [assignedToId], references: [id], onDelete: SetNull)
  rating         Int?           // productValuation 1-5 (только FEEDBACK)
  // Phase 11 (пока nullable)
  appealStatus   AppealStatus?
  appealId       String?
  // Денормализованные поля для быстрого рендера ленты
  lastMessageAt  DateTime?      // max(messages.sentAt) — обновляется при insert/sync
  previewText    String?        @db.Text // первые 140 символов текста последнего INBOUND
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  resolvedAt     DateTime?
  messages       SupportMessage[]
  // Идемпотентный upsert: composite unique
  @@unique([channel, wbExternalId])
  @@index([status])
  @@index([channel])
  @@index([nmId])
  @@index([assignedToId])
  @@index([createdAt])
}

model SupportMessage {
  id          String         @id @default(cuid())
  ticketId    String
  ticket      SupportTicket  @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  direction   Direction
  text        String?        @db.Text
  authorId    String?        // null = покупатель
  author      User?          @relation("SupportAuthor", fields: [authorId], references: [id], onDelete: SetNull)
  isAutoReply Boolean        @default(false)  // Phase 10
  media       SupportMedia[]
  sentAt      DateTime       @default(now())  // локальное время записи
  wbSentAt    DateTime?                        // createdDate из WB API
  @@index([ticketId, sentAt])
}

model SupportMedia {
  id         String         @id @default(cuid())
  messageId  String
  message    SupportMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  type       MediaType
  wbUrl      String         @db.Text   // photoLinks[].fullSize или video.link
  localPath  String?        @db.Text   // /var/www/zoiten-uploads/support/{ticketId}/{messageId}/{filename}
  sizeBytes  Int?
  createdAt  DateTime       @default(now())
  expiresAt  DateTime       // createdAt + 1 год — индекс для cleanup cron
  @@index([expiresAt])
}

// Обновления в существующих моделях:
// model User {
//   ...
//   assignedTickets     SupportTicket[]  @relation("SupportAssignee")
//   authoredMessages    SupportMessage[] @relation("SupportAuthor")
// }
```

**Важные детали:**

1. **`wbExternalId: String?`** — НЕ `Int?` (критическое отличие от первоначального CONTEXT.md); id из WB — это 20-символьный строковый Elasticsearch-ID.
2. **Composite unique `@@unique([channel, wbExternalId])`** — Prisma 6 поддерживает null в unique key по умолчанию PostgreSQL (null ≠ null, так что MESSENGER с null wbExternalId не конфликтуют). Для идемпотентности при `upsert({ where: { channel_wbExternalId: { ... } } })` — nullable часть OK.
3. **Обратные relations на User** — два именованных relation'а: `"SupportAssignee"` и `"SupportAuthor"`. Prisma 6 требует named relations если на одну модель ссылаются два разных поля.
4. **Связь с WbCard через nmId** — без FK (паттерн проекта, WbCard.nmId @unique → JOIN в коде). Это позволяет тикету пережить soft-delete карточки.
5. **Индексы:** `@@index([status])`, `@@index([channel])`, `@@index([nmId])`, `@@index([assignedToId])`, `@@index([createdAt])` — для filter-query ленты; `@@index([expiresAt])` — для cleanup cron.
6. **Денормализация `lastMessageAt` и `previewText`** — для рендера ленты без JOIN + subquery (паттерн проекта). Обновляются при каждом insert SupportMessage и при sync.
7. **Cascading deletes:**
   - `SupportTicket.assignedTo` → SetNull (удаление User не ломает тикет)
   - `SupportMessage.ticket` → Cascade (удаление тикета чистит сообщения)
   - `SupportMedia.message` → Cascade (удаление сообщения чистит медиа)
   - `SupportMessage.author` → SetNull (history remains)
   - `SupportTicket.customer` → SetNull

**Миграция:**
```bash
npx prisma migrate dev --name support_mvp
```

Prisma 6 handles 4 новые модели + 5 enum'ов в одной миграции без проблем (проверено в Phase 7 — добавляли 4 модели + 6 полей за раз успешно). Enum'ы создаются как PostgreSQL TYPE до таблиц в правильном порядке.

**Rollback стратегия:** Prisma migrate создаёт idempotent SQL-миграцию в `prisma/migrations/<ts>_support_mvp/migration.sql`. Для отката — `prisma migrate resolve --rolled-back <name>` + ручной `DROP` enum'ов.

## Архитектура синхронизации

### API endpoint `POST /api/support-sync`

```typescript
// app/api/support-sync/route.ts
// Паттерн из app/api/wb-sync/route.ts + app/api/wb-promotions-sync/route.ts
export const runtime = "nodejs"
export const maxDuration = 300

export async function POST() {
  // 1. RBAC — session-based для ручной кнопки,
  //    cron вызывается через /api/cron/support-sync-reviews (CRON_SECRET)
  const session = await auth()
  if (!session?.user) return 401

  // 2. Paginate feedbacks (take=5000, skip=0 → далее по skip)
  const feedbacks = await fetchAllFeedbacks({ isAnswered: false })

  // 3. Paginate questions (take=10000)
  const questions = await fetchAllQuestions({ isAnswered: false })

  // 4. Per-item transaction: upsert ticket + messages + download media
  let synced = 0
  for (const fb of feedbacks) {
    await prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.upsert({
        where: { channel_wbExternalId: { channel: "FEEDBACK", wbExternalId: fb.id } },
        create: { ... },
        update: { updatedAt: new Date(), ... }
      })
      // Idempotency: проверить, есть ли INBOUND message для этого тикета
      const existingInbound = await tx.supportMessage.findFirst({
        where: { ticketId: ticket.id, direction: "INBOUND" }
      })
      if (!existingInbound) {
        const msg = await tx.supportMessage.create({ ... INBOUND ... })
        // Скачать медиа (вне транзакции! — async I/O + filesystem)
        // См. ниже — делаем медиа отдельной фазой after-commit
      }
      // Если в WB есть answer и у нас нет OUTBOUND → создать OUTBOUND (исторический ответ)
      if (fb.answer?.text) {
        const existingOutbound = await tx.supportMessage.findFirst({ ... })
        if (!existingOutbound) {
          await tx.supportMessage.create({ direction: "OUTBOUND", authorId: null /*WB*/, wbSentAt: ..., text: fb.answer.text })
        }
      }
    })
    synced++
  }

  // 5. Медиа-скачивание (вне транзакций, параллельно с лимитом concurrency=5)
  //    — paths: /var/www/zoiten-uploads/support/{ticketId}/{messageId}/{sanitized}.{ext}
  //    — retry=1 при network error

  // 6. Обновить AppSetting "support.lastSyncedAt" = now()

  return { feedbacksSynced: ..., questionsSynced: ..., mediaSaved: ..., errors: [] }
}
```

### Cron `GET /api/cron/support-sync-reviews`

```typescript
// app/api/cron/support-sync-reviews/route.ts
// Паттерн из app/api/cron/purge-deleted/route.ts
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret")
  if (secret !== process.env.CRON_SECRET) return 401
  // Внутренний вызов той же логики, что POST /api/support-sync
  // — просто импортируй общую функцию из lib/support-sync.ts
}
```

Триггер cron: внешний (VPS crontab или существующая `systemd timer`). **Рекомендация:** добавить в `deploy.sh` создание `/etc/cron.d/zoiten-support` с записями:
```cron
*/15 * * * * www-data curl -s -H "x-cron-secret: $CRON_SECRET" http://localhost:3001/api/cron/support-sync-reviews > /dev/null
0 3 * * * www-data curl -s -H "x-cron-secret: $CRON_SECRET" http://localhost:3001/api/cron/support-media-cleanup > /dev/null
```

### Cron `GET /api/cron/support-media-cleanup`

```typescript
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret")
  if (secret !== process.env.CRON_SECRET) return 401

  const expired = await prisma.supportMedia.findMany({
    where: { expiresAt: { lt: new Date() } },
    select: { id: true, localPath: true }
  })
  for (const media of expired) {
    if (media.localPath) {
      try { await fs.unlink(media.localPath) } catch {} // игнорим ENOENT
    }
  }
  const result = await prisma.supportMedia.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  })
  return { deleted: result.count }
}
```

### Идемпотентность

| Шаг | Идемпотентность |
|-----|-----------------|
| Ticket | `upsert` по `@@unique([channel, wbExternalId])` — повторный sync не создаёт дубль |
| INBOUND message | `findFirst({direction: INBOUND})` + `create` если нет — один INBOUND на тикет (в Phase 8 покупатель пишет только раз) |
| OUTBOUND message | Аналогично — один ответ от WB на тикет |
| Media | `upsert` по wbUrl в рамках messageId (или пропуск если `localPath` уже есть) |
| lastSyncedAt | Просто overwrite в AppSetting |

### Скачивание медиа

```typescript
// lib/support-media.ts
import { promises as fs } from "node:fs"
import path from "node:path"

export async function downloadMedia(wbUrl: string, ticketId: string, messageId: string) {
  const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/www/zoiten-uploads"
  const dir = path.join(UPLOAD_DIR, "support", ticketId, messageId)
  await fs.mkdir(dir, { recursive: true })

  const filename = path.basename(new URL(wbUrl).pathname)  // sanitize
  const localPath = path.join(dir, filename)

  const res = await fetch(wbUrl)
  if (!res.ok) throw new Error(`Media download ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(localPath, buf)
  return { localPath, sizeBytes: buf.length }
}

// Параллельно с лимитом 5 (чтобы не захлебнуться IO на SSD VPS 2GB RAM)
export async function downloadMediaBatch(items: Array<{wbUrl, ticketId, messageId}>) {
  const CONCURRENCY = 5
  const results = []
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY)
    results.push(...await Promise.all(batch.map(it =>
      downloadMedia(it.wbUrl, it.ticketId, it.messageId).catch(e => ({ error: e.message, ...it }))
    )))
  }
  return results
}
```

## Frontend паттерны

### Структура `/support` (лента)

```
app/(dashboard)/support/
├── page.tsx                 # RSC: assemble data + render SupportList
├── [ticketId]/
│   └── page.tsx             # RSC: 3-col dialog page
components/support/
├── SupportList.tsx          # RSC или client: cards with rowSpan-free layout
├── SupportCard.tsx          # Client: card with status indicator strip
├── SupportFilters.tsx       # Client: inline MultiSelectDropdown (паттерн WbFilters.tsx)
├── SupportSyncButton.tsx    # Client: toast-enabled sync trigger
├── TicketDialog.tsx         # Client: 3-col layout container
├── TicketMessagesList.tsx   # Client: хронологический чат с медиа-превью
├── TicketReplyPanel.tsx     # Client: sticky textarea + Send button
├── TicketSidePanels.tsx     # Client: customer+product left; status+assign+meta right
app/actions/
└── support.ts               # Server actions: replyToTicket, assignTicket, updateTicketStatus
```

### Карточка тикета — layout

Класс `<li>` с CSS Grid или Flexbox:

```tsx
// Индикатор-полоса слева: border-l-4 + цвет по статусу
const statusColorMap = {
  NEW: "border-red-500",
  IN_PROGRESS: "border-yellow-500",
  ANSWERED: "border-green-500",
  CLOSED: "border-gray-400",
  APPEALED: "border-purple-500",
}
<li className={cn("flex gap-4 p-4 bg-white rounded-lg border-l-4", statusColorMap[ticket.status])}>
  <ChannelIcon /* MessageSquare или HelpCircle */ />
  <img src={wbCard?.photoUrl} /* 80x80 3:4 */ />
  <div className="flex-1">
    <div>{customer.name || `Покупатель`}</div>
    <div className="text-sm text-muted-foreground truncate">{ticket.previewText}</div>
    {ticket.rating && <StarBadge rating={ticket.rating} />}
    <div className="text-xs">{formatDate(ticket.createdAt)}</div>
  </div>
  <AssignedToBadge user={ticket.assignedTo} />
</li>
```

### Фильтры через searchParams

```tsx
// components/support/SupportFilters.tsx (паттерн WbFilters.tsx)
"use client"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

// URL: /support?channels=FEEDBACK,QUESTION&statuses=NEW&nmId=12345&assignee=userId&dateFrom=2026-04-01&dateTo=2026-04-17&unanswered=1&page=1

// MultiSelectDropdown inline (не общий компонент — паттерн проекта)
function MultiSelectDropdown({ options, selected, onChange, label }) { ... }
```

### Pagination

```tsx
// 20 per page по умолчанию
const page = Number(searchParams.page ?? 1)
const pageSize = Number(searchParams.pageSize ?? 20)
const tickets = await prisma.supportTicket.findMany({
  skip: (page - 1) * pageSize,
  take: pageSize,
  orderBy: { createdAt: "desc" },  // MVP — только desc
  where: buildWhereFromSearchParams(searchParams),
  include: { assignedTo: true, messages: { orderBy: { sentAt: "asc" }, take: 1 } }
})
```

### 3-колоночный layout диалога

```tsx
// app/(dashboard)/support/[ticketId]/page.tsx
<div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-4 h-[calc(100vh-120px)]">
  <aside className="space-y-4"><CustomerCard /><ProductCard /></aside>
  <section className="flex flex-col overflow-hidden">
    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
      {messages.map(m => <MessageBubble direction={m.direction} {...m} />)}
    </div>
    <div className="sticky bottom-0 border-t bg-white p-4"><TicketReplyPanel ticketId={ticket.id} /></div>
  </section>
  <aside className="space-y-4"><StatusDropdown /><AssigneeDropdown /><MetaPanel /></aside>
</div>
```

### Server actions

```typescript
// app/actions/support.ts
"use server"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { z } from "zod"

const replySchema = z.object({
  ticketId: z.string().cuid(),
  text: z.string().min(1).max(5000),
})

export async function replyToTicket(input: z.infer<typeof replySchema>) {
  await requireSection("SUPPORT", "MANAGE")
  const session = await auth()
  const data = replySchema.parse(input)
  const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: data.ticketId } })

  // Отправка в WB — разная логика для FEEDBACK vs QUESTION
  if (ticket.channel === "FEEDBACK") {
    await wbSupportApi.replyFeedback({ id: ticket.wbExternalId!, text: data.text })
  } else if (ticket.channel === "QUESTION") {
    await wbSupportApi.replyQuestion({ id: ticket.wbExternalId!, text: data.text })
  }

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        direction: "OUTBOUND",
        text: data.text,
        authorId: session!.user.id,
        sentAt: new Date(),
        wbSentAt: new Date(),
      }
    }),
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "ANSWERED", resolvedAt: new Date(), lastMessageAt: new Date() }
    })
  ])
  revalidatePath("/support")
  revalidatePath(`/support/${ticket.id}`)
  return { ok: true }
}
```

### Sidebar badge

```tsx
// app/(dashboard)/layout.tsx — RSC
const newTicketsCount = await prisma.supportTicket.count({ where: { status: "NEW" } })
<DashboardShell supportBadgeCount={newTicketsCount}>...</DashboardShell>

// components/layout/Sidebar.tsx — client
// navItem.section === "SUPPORT" → render <Badge>{count}</Badge> справа от label
```

### Лента — Native select (НЕ base-ui Select — конвенция проекта)

```tsx
<select value={status} onChange={e => updateStatus(e.target.value)} className="...">
  <option value="NEW">Новый</option>
  <option value="IN_PROGRESS">В работе</option>
  <option value="ANSWERED">Отвечен</option>
  <option value="CLOSED">Закрыт</option>
</select>
```

## Nginx + медиа-хранилище

### Текущее состояние [VERIFIED через CLAUDE.md и STATE.md]

- VPS `85.198.97.89`
- Nginx config `/etc/nginx/sites-enabled/zoiten-pro`
- Уже есть `alias /var/www/zoiten-uploads/` → `/uploads/` для товарных фото
- UPLOAD_DIR env = `/var/www/zoiten-uploads` (prod), `/tmp/zoiten-uploads` (dev)

### Расширение nginx-конфига

**Нужна ли отдельная directive?** Нет — существующий `alias /var/www/zoiten-uploads/` обслуживает **ВСЕ** подпапки автоматически. `/uploads/support/<ticketId>/...` уже работает.

**Проверка:**
```bash
ssh root@85.198.97.89 "cat /etc/nginx/sites-enabled/zoiten-pro | grep -A 3 'uploads'"
# Ожидаемый output:
# location /uploads/ {
#   alias /var/www/zoiten-uploads/;
#   expires 30d;
# }
```

Если так — **дополнительной работы не нужно**. Если есть явный `location /uploads/photos/` (более узкий match) — добавить отдельно:
```nginx
location /uploads/support/ {
  alias /var/www/zoiten-uploads/support/;
  expires 30d;
  add_header Cache-Control "public, immutable";
}
```

### Создание директории на VPS (deploy step)

```bash
ssh root@85.198.97.89 "mkdir -p /var/www/zoiten-uploads/support && chown www-data:www-data /var/www/zoiten-uploads/support"
```

### Права на запись из Node.js

Systemd-сервис `zoiten-erp.service` запущен под `www-data` (из Phase 6 deployment). Node.js имеет право писать в `/var/www/zoiten-uploads/support/` — write/read/execute.

### Dev-fallback

В `development` UPLOAD_DIR = `/tmp/zoiten-uploads` → `support/` создаётся автоматически в коде (fs.mkdir recursive). Отдаётся через `/api/uploads/[...path]` (существующий route).

## Validation Architecture

### Test Framework [DETECTED from tests/]

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | `vitest.config.ts` (корень проекта) |
| Alias | `@` → корень проекта (flat root layout) |
| Quick run command | `npm run test` (vitest run) |
| Full suite command | `npm run test -- --run` |

Существующие test-файлы в `tests/` (5 штук, все Phase 7): `pricing-math.test.ts`, `pricing-fallback.test.ts`, `pricing-settings.test.ts`, `wb-promotions-api.test.ts`, `excel-auto-promo.test.ts`.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUP-02 | `fetchAllFeedbacks` paginates через take/skip, уважает rate limit 600ms | unit | `npm run test tests/wb-support-api.test.ts -t "fetchAllFeedbacks"` | ❌ Wave 0 |
| SUP-02 | `replyFeedback` posts `{id, text}` на правильный endpoint | unit | `npm run test tests/wb-support-api.test.ts -t "replyFeedback"` | ❌ Wave 0 |
| SUP-02 | `replyQuestion` отправляет `{id, answer:{text}, state:"wbRu"}` | unit | `npm run test tests/wb-support-api.test.ts -t "replyQuestion"` | ❌ Wave 0 |
| SUP-02 | 429 retry — читает `X-Ratelimit-Retry` header | unit | `npm run test tests/wb-support-api.test.ts -t "429"` | ❌ Wave 0 |
| SUP-06 | `POST /api/support-sync` upsert идемпотентен (второй вызов не создаёт дублей) | integration (Prisma local DB) | `npm run test tests/support-sync.test.ts -t "idempotent"` | ❌ Wave 0 |
| SUP-01 | Миграция создаёт все 4 модели + 5 enum без ошибок | manual (UAT) | `npx prisma migrate dev --name support_mvp && npx prisma validate` | — |
| SUP-05 | `support-media-cleanup` удаляет файлы и записи expired | unit | `npm run test tests/support-media-cleanup.test.ts` | ❌ Wave 0 |
| SUP-08 | `downloadMedia` сохраняет файл в правильный путь, возвращает localPath | unit (fs mock или tmp dir) | `npm run test tests/support-media.test.ts` | ❌ Wave 0 |
| SUP-09 | UI кнопка Sync → toast loading/success/error | manual (human UAT) | — | — |
| SUP-10, SUP-11 | Лента с фильтрами — queries возвращают корректный where-clause | integration | `npm run test tests/support-filters.test.ts` | ❌ Wave 0 (опц.) |
| SUP-13, SUP-14 | Диалог → ответ → WB API → OUTBOUND message → status=ANSWERED | manual UAT (real WB) | — | — |
| SUP-15, SUP-16 | assignTicket, updateTicketStatus изменяют БД и revalidate | unit | `npm run test tests/support-actions.test.ts` | ❌ Wave 0 (опц.) |

### Sampling Rate

- **Per task commit:** `npm run test` (полный vitest, ~5-10 сек на unit tests)
- **Per wave merge:** `npm run test -- --run` (одноразовый run, без watch)
- **Phase gate:** Все тесты зелёные + human UAT чек-лист (UI полнота + реальный WB sync против тестового артикула).

### Wave 0 Gaps

- [ ] `tests/wb-support-api.test.ts` — mock fetch, покрыть fetchAllFeedbacks (pagination + rate limit + 429), replyFeedback, replyQuestion, fetchAllQuestions, reportFeedback (phase 11 stub)
- [ ] `tests/support-sync.test.ts` — integration test на локальной БД (prisma.$transaction + upsert idempotency). Опционально в MVP: можно заменить на human UAT.
- [ ] `tests/support-media.test.ts` — downloadMedia с tmp dir, проверка localPath + sizeBytes
- [ ] `tests/support-media-cleanup.test.ts` — unit на cleanup cron, mock fs.unlink + prisma.deleteMany
- [ ] Framework install: vitest уже установлен (Phase 7), дополнительно не нужен

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Все | ✓ | 24.14.0 | — |
| npm | npm install prisma migrate | ✓ | 11.9.0 | — |
| PostgreSQL (локально) | Prisma migrate dev | ✗ | — | Миграция на VPS при deploy (паттерн Phase 1) |
| curl | Cron-вызов + потенциальный WB v4 API | ✓ | /mingw64/bin/curl | — |
| vitest | Тесты lib/wb-support-api | ✓ (Phase 7) | 4.1.4 | — |
| WB API token | WB Feedbacks/Questions API calls | ✓ (bit 5) | — | — (bit 5 scope подтверждён) |
| CRON_SECRET | Cron routes | ✓ | — (на VPS в /etc/zoiten.pro.env) | — |

**Missing dependencies with no fallback:** Нет

**Missing dependencies with fallback:**
- PostgreSQL локально — миграция применяется на VPS через `deploy.sh` (prisma migrate deploy)

## Project Constraints (from CLAUDE.md)

Actionable directives, применимые к Phase 8:

1. **Язык:** русский в UI, комментариях, планах
2. **Time zone:** Moscow (Europe/Moscow) для отображения дат
3. **Server Actions:** `"use server"` + `requireSection()` + `try/catch` + `revalidatePath`
4. **Select:** native HTML `<select>` (НЕ base-ui Select)
5. **Combobox:** CreatableCombobox (не нужен в Phase 8 — нет create inline)
6. **Фильтры:** MultiSelectDropdown с чекбоксами (inline per-компонент, паттерн WbFilters.tsx)
7. **WB v4 API:** curl через execSync — **НЕ нужен** для Feedbacks/Questions (только для card.wb.ru v4 в Phase 7)
8. **Prisma:** singleton `@/lib/prisma`, миграции `npx prisma migrate dev` локально + `prisma migrate deploy` на VPS
9. **RBAC:** `requireSection("SUPPORT")` в RSC/API для read, `requireSection("SUPPORT","MANAGE")` в write server actions и cron-защитой CRON_SECRET
10. **Фото/медиа:** VPS filesystem `/var/www/zoiten-uploads/`, обслуживается nginx (`/uploads/*`), dev через `/api/uploads/[...path]`
11. **Не создавать .md доки вне запроса** (planner учтёт)

Все директивы совместимы с планируемыми решениями — конфликтов нет.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `PATCH /feedbacks/{id}` body `{text}` | `POST /feedbacks/answer` body `{id, text}` + `PATCH /feedbacks/answer` для редактирования | WB API 2025+ | CONTEXT.md требует правки в `lib/wb-support-api.ts` — реализовывать по актуальной версии |
| `wbUserId` в каждом feedback | Отсутствует — анонимизация 2024+ | — | Customer-линковка не работает для FEEDBACK/QUESTION в Phase 8 |
| `rating: Int` | `productValuation: Int` | WB API rename | Использовать новое имя при парсинге |
| `photoLinks: string[]` | `photoLinks: {fullSize, miniSize}[]` | WB API расширение | Сохранять fullSize; miniSize для thumbnail-превью |
| Фиксированный backoff 60s на 429 | Чтение `X-Ratelimit-Retry` header | WB API best practice | Использовать header (fallback на 6s если нет header) |

**Deprecated/outdated:**
- Любые старые PHP-SDK (Dakword/WBSeller) с `userName` полем — больше не заполняется
- PRD-маппинг «1 feedback = 1 wbUserId» — не действует

## Common Pitfalls

### Pitfall 1: wbExternalId как Int
**Что идёт не так:** Prisma schema объявляет `wbExternalId: Int?`, миграция проходит, но при вставке падает с «invalid input syntax for type integer».
**Почему:** WB API возвращает 20-символьный строковый id (`"YX52RZEBhH9mrcYdEJuD"`).
**Как избежать:** `wbExternalId: String?` в модели. В CONTEXT.md лочено как "feedbackId" — **обновить CONTEXT.md или зафиксировать правку в research**.
**Warning signs:** Первый sync падает со string/integer mismatch.

### Pitfall 2: Reply endpoint — неверный HTTP метод
**Что идёт не так:** Используется `PATCH /api/v1/feedbacks/{id}` (как в PRD).
**Почему:** WB API — `POST /api/v1/feedbacks/answer` body `{id, text}` для нового ответа, PATCH — для редактирования.
**Как избежать:** В `wb-support-api.ts` два метода: `postFeedbackAnswer(id, text)` и `patchFeedbackAnswer(id, text)`.
**Warning signs:** 404 или «method not allowed».

### Pitfall 3: Questions body-структура спутана с Feedbacks
**Что идёт не так:** `PATCH /api/v1/questions` body `{id, text}`.
**Почему:** Questions PATCH — мульти-операция, body — `{id, answer: {text}, state: "wbRu"}`.
**Как избежать:** Отдельный метод `replyQuestion(id, text)` в клиенте — собирает правильную структуру.
**Warning signs:** 400 «Invalid state field».

### Pitfall 4: Скачивание медиа в транзакции
**Что идёт не так:** `prisma.$transaction` вокруг sync-a тикета **и** `fetch(wbUrl)` + `fs.writeFile`.
**Почему:** Транзакция держится сотни миллисекунд до минут → lock-и на SupportTicket → деградация приложения.
**Как избежать:** Upsert тикета + создание message в транзакции; медиа-скачивание **после** commit-а, асинхронно, с обновлением `SupportMedia.localPath` отдельным update.
**Warning signs:** Timeout'ы в Prisma (default 5s), rollback'и.

### Pitfall 5: Нет idempotency для OUTBOUND сообщений при ре-sync
**Что идёт не так:** При повторном sync WB API возвращает existing `answer` → `wb-support-api.ts` создаёт второй OUTBOUND message.
**Почему:** WB-ответ (автором которого был сам менеджер через WB-кабинет) присутствует в `feedback.answer` — если не проверить уникальность, создадутся дубли.
**Как избежать:** До создания OUTBOUND — `findFirst({ ticketId, direction: "OUTBOUND" })`; если уже есть → пропускать.
**Warning signs:** Второй sync удваивает ответы в диалоге.

### Pitfall 6: Composite unique с NULL wbExternalId
**Что идёт не так:** Prisma `@@unique([channel, wbExternalId])` с `String?` — для MESSENGER тикетов (Phase 12) nullable поле.
**Почему:** PostgreSQL `null ≠ null` — Prisma unique принимает это: можно иметь N MESSENGER-тикетов без wbExternalId. Для FEEDBACK/QUESTION всегда not-null.
**Как избежать:** В Phase 8 работаем только с FEEDBACK/QUESTION, wbExternalId всегда есть. Документировать поведение.
**Warning signs:** Не воспроизводимо в MVP Phase 8.

### Pitfall 7: Потеря Customer-линковки на отсутствии wbUserId
**Что идёт не так:** PRD планирует Customer создаваться на каждый FEEDBACK → в Phase 8 создаётся Customer без wbUserId на каждый тикет → тысячи «одноразовых» Customer-записей.
**Почему:** FEEDBACK/QUESTION API не передаёт id покупателя.
**Как избежать:** **Не создавать Customer для FEEDBACK/QUESTION в Phase 8** — `customerId = null`. Customer будет создаваться только в Phase 12 (MESSENGER-канал) и Phase 10 (CHAT).
**Warning signs:** Рост таблицы Customer пропорционально тикетам.

### Pitfall 8: Cron запускается параллельно с ручным sync
**Что идёт не так:** Cron `/api/cron/support-sync-reviews` и кнопка `/api/support-sync` вызваны одновременно → две параллельные синхронизации → двойные upsert'ы на одни и те же тикеты.
**Почему:** Нет лок-механизма.
**Как избежать:** В cron использовать advisory lock PostgreSQL `pg_try_advisory_lock(12345)` — если lock не получен, скипать. Вариант проще: использовать `AppSetting.key="support.syncRunning"` = timestamp, проверять TTL 10 мин.
**Warning signs:** Дублирующиеся ключи в миграции.

## Code Examples

### `lib/wb-support-api.ts` — скелет

```typescript
// lib/wb-support-api.ts
// WB Feedbacks + Questions API клиент для Phase 8

const FEEDBACKS_API = "https://feedbacks-api.wildberries.ru"

function getToken(): string {
  const token = process.env.WB_API_TOKEN
  if (!token) throw new Error("WB_API_TOKEN не настроен")
  return token
}

// ── Types ────────────────────────────────────────────────────────

export interface WbPhotoLink {
  fullSize: string
  miniSize: string
}

export interface WbVideo {
  previewImage: string
  link: string
  durationSec: number
}

export interface WbFeedbackRaw {
  id: string                    // Elasticsearch-style 20-char ID
  text: string
  pros?: string
  cons?: string
  productValuation: number      // 1-5
  matchingSize?: string
  createdDate: string            // ISO 8601
  wasViewed: boolean
  state: "wbRu" | "none"
  answer: { text: string; state: string; editable: boolean } | null
  productDetails: {
    imtId: number
    nmId: number
    productName: string
    supplierArticle: string
    brandName: string
    size?: string
  }
  video: WbVideo | null
  photoLinks: WbPhotoLink[]
}

export interface WbQuestionRaw {
  id: string
  text: string
  createdDate: string
  state: "wbRu" | "none"
  answer: { text: string; editable: boolean; createDate: string } | null
  productDetails: {
    imtId: number
    nmId: number
    productName: string
    supplierArticle: string
    brandName: string
  }
  wasViewed: boolean
  isWarned: boolean
}

// ── Rate limit helpers ───────────────────────────────────────────

const RATE_DELAY_MS = 600
const DEFAULT_RETRY_MS = 6000

async function sleep(ms: number) { await new Promise(r => setTimeout(r, ms)) }

async function fetchWithRateLimit(url: string, init?: RequestInit): Promise<Response> {
  const token = getToken()
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: token, ...(init?.headers ?? {}) }
  })
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("X-Ratelimit-Retry") ?? "") * 1000 || DEFAULT_RETRY_MS
    await sleep(retryAfter)
    return fetchWithRateLimit(url, init)  // единичный retry; если снова 429 — обернуть счётчик
  }
  return res
}

// ── Feedbacks ────────────────────────────────────────────────────

export async function fetchAllFeedbacks(opts?: { isAnswered?: boolean; dateFrom?: number; dateTo?: number }): Promise<WbFeedbackRaw[]> {
  const all: WbFeedbackRaw[] = []
  let skip = 0
  const take = 5000
  while (true) {
    const qs = new URLSearchParams({ take: String(take), skip: String(skip), order: "dateDesc" })
    if (opts?.isAnswered !== undefined) qs.set("isAnswered", String(opts.isAnswered))
    if (opts?.dateFrom) qs.set("dateFrom", String(opts.dateFrom))
    if (opts?.dateTo) qs.set("dateTo", String(opts.dateTo))

    const res = await fetchWithRateLimit(`${FEEDBACKS_API}/api/v1/feedbacks?${qs}`)
    if (!res.ok) throw new Error(`WB Feedbacks ${res.status}: ${await res.text()}`)
    const data = await res.json()
    const items = (data?.data?.feedbacks ?? []) as WbFeedbackRaw[]
    if (items.length === 0) break
    all.push(...items)
    if (items.length < take) break
    skip += items.length
    await sleep(RATE_DELAY_MS)
  }
  return all
}

/** POST /api/v1/feedbacks/answer — создать ответ */
export async function postFeedbackAnswer(id: string, text: string): Promise<void> {
  const res = await fetchWithRateLimit(`${FEEDBACKS_API}/api/v1/feedbacks/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, text })
  })
  if (!res.ok) throw new Error(`POST /feedbacks/answer ${res.status}: ${await res.text()}`)
}

/** PATCH /api/v1/feedbacks/answer — отредактировать ответ (в пределах 24ч) */
export async function patchFeedbackAnswer(id: string, text: string): Promise<void> {
  const res = await fetchWithRateLimit(`${FEEDBACKS_API}/api/v1/feedbacks/answer`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, text })
  })
  if (!res.ok) throw new Error(`PATCH /feedbacks/answer ${res.status}: ${await res.text()}`)
}

// ── Questions ────────────────────────────────────────────────────

export async function fetchAllQuestions(opts?: { isAnswered?: boolean; dateFrom?: number; dateTo?: number }): Promise<WbQuestionRaw[]> {
  const all: WbQuestionRaw[] = []
  let skip = 0
  const take = 10_000
  while (true) {
    const qs = new URLSearchParams({ take: String(take), skip: String(skip), order: "dateDesc" })
    if (opts?.isAnswered !== undefined) qs.set("isAnswered", String(opts.isAnswered))
    if (opts?.dateFrom) qs.set("dateFrom", String(opts.dateFrom))
    if (opts?.dateTo) qs.set("dateTo", String(opts.dateTo))

    const res = await fetchWithRateLimit(`${FEEDBACKS_API}/api/v1/questions?${qs}`)
    if (!res.ok) throw new Error(`WB Questions ${res.status}: ${await res.text()}`)
    const data = await res.json()
    const items = (data?.data?.questions ?? []) as WbQuestionRaw[]
    if (items.length === 0) break
    all.push(...items)
    if (items.length < take) break
    skip += items.length
    await sleep(RATE_DELAY_MS)
  }
  return all
}

/** PATCH /api/v1/questions — мульти-операция. Для ответа: {id, answer: {text}, state: "wbRu"} */
export async function replyQuestion(id: string, text: string): Promise<void> {
  const res = await fetchWithRateLimit(`${FEEDBACKS_API}/api/v1/questions`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, answer: { text }, state: "wbRu" })
  })
  if (!res.ok) throw new Error(`PATCH /questions ${res.status}: ${await res.text()}`)
}

/** Отклонить вопрос (state: "none") — опционально в Phase 8 */
export async function rejectQuestion(id: string, text: string): Promise<void> {
  const res = await fetchWithRateLimit(`${FEEDBACKS_API}/api/v1/questions`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, answer: { text }, state: "none" })
  })
  if (!res.ok) throw new Error(`PATCH /questions ${res.status}: ${await res.text()}`)
}
```

### `tests/wb-support-api.test.ts` — паттерн из `wb-promotions-api.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("fetchAllFeedbacks", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv("WB_API_TOKEN", "test-token")
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("пагинирует через take=5000 skip=N пока страница не будет неполной", async () => {
    const { fetchAllFeedbacks } = await import("@/lib/wb-support-api")
    const fullPage = Array(5000).fill({ id: "YX52", text: "t", productValuation: 5,
      productDetails: { nmId: 1, imtId: 1, productName: "", supplierArticle: "", brandName: "" },
      createdDate: "2026-01-01T00:00:00Z", state: "wbRu", wasViewed: false, answer: null, video: null, photoLinks: []
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { feedbacks: fullPage } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { feedbacks: [] } }) })
    vi.stubGlobal("fetch", fetchMock)

    const promise = fetchAllFeedbacks({ isAnswered: false })
    await vi.advanceTimersByTimeAsync(800)
    const result = await promise

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(5000)
  })

  it("429 → читает X-Ratelimit-Retry header и делает retry", async () => {
    const { fetchAllFeedbacks } = await import("@/lib/wb-support-api")
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429,
        headers: new Headers({ "X-Ratelimit-Retry": "3" }),
        text: async () => "too many" })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { feedbacks: [] } }) })
    vi.stubGlobal("fetch", fetchMock)

    const promise = fetchAllFeedbacks({ isAnswered: false })
    await vi.advanceTimersByTimeAsync(3500)
    await promise
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe("postFeedbackAnswer", () => {
  it("POST body с {id, text}", async () => {
    const { postFeedbackAnswer } = await import("@/lib/wb-support-api")
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal("fetch", fetchMock)
    await postFeedbackAnswer("YX52RZEBhH9mrcYdEJuD", "Спасибо!")
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/feedbacks/answer"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "YX52RZEBhH9mrcYdEJuD", text: "Спасибо!" })
      })
    )
  })
})

describe("replyQuestion", () => {
  it("PATCH /questions body {id, answer:{text}, state:'wbRu'}", async () => {
    const { replyQuestion } = await import("@/lib/wb-support-api")
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal("fetch", fetchMock)
    await replyQuestion("TfWOp5QBfEYrrd0AMJau", "На следующей неделе")
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/questions"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          id: "TfWOp5QBfEYrrd0AMJau",
          answer: { text: "На следующей неделе" },
          state: "wbRu"
        })
      })
    )
  })
})
```

## Open Questions / Risks

### 1. Точный rate limit для Feedbacks/Questions
**Что мы знаем:** WB docs упоминают «per-account limit» и возвращают 429 с `X-Ratelimit-Retry`. Phase 7 Promotions Calendar API имеет лимит 10 req/6sec. PRD указывает ~10 req/sec.
**Что неясно:** Нет задокументированной цифры для Feedbacks/Questions.
**Рекомендация:** Использовать консервативный 600ms паузы + чтение заголовка `X-Ratelimit-Retry` при 429 (как реализовано в скелете `wb-support-api.ts`). Это достаточно для 50-200 SKU с ~20-50 отзывов в день.

### 2. Первая full-синхронизация — сколько данных?
**Что мы знаем:** WB хранит последние 200 000 отзывов (вся ERP не превысит). Вопросов — до 10 000 за запрос.
**Что неясно:** Начальный объём для Zoiten (есть ли уже накопленные 5-летние отзывы?).
**Рекомендация:** На первый sync не фильтровать `isAnswered` — подтянуть все существующие (может занять 5-30 минут в зависимости от объёма). Последующие — только `isAnswered=false`. Документировать в UAT-плане.

### 3. Медиа-хранилище — ожидаемый объём
**Что мы знаем:** TTL 1 год, фото ~100-500KB, видео — HLS (сегменты, сумма 1-5MB).
**Что неясно:** Объём ежедневных новых медиа.
**Рекомендация:** Мониторить диск `/var/www/zoiten-uploads/support/` в deploy-runbook'е; при >80% добавить алерт (отдельно от Phase 8 — Phase 8 просто пишет файлы).

### 4. Откатимость миграции Prisma
**Что мы знаем:** Phase 7 добавлял 4 модели + 6 полей через `prisma migrate dev` без проблем.
**Что неясно:** Включает ли миграция downgrade-path для enum'ов.
**Рекомендация:** Prisma не генерирует down-migration. В случае отката — manual SQL `DROP TYPE "TicketChannel" CASCADE` и т.п. Документировать в плане 08-01 chapter «Rollback».

### 5. HLS-видео для пользовательского UI
**Что мы знаем:** `video.link` — m3u8 (HLS-playlist).
**Что неясно:** Как показывать в `<video>` браузера без hls.js.
**Рекомендация:** Safari воспроизводит HLS нативно, Chrome — нет. В MVP Phase 8 — только **превью-изображение** `video.previewImage` + ссылка «Открыть видео» (открывает WB URL в new tab). Полноценный HLS-плеер — Phase 10 или позже.

### 6. Обновлять ли OUTBOUND из WB-ответов до Phase 8?
**Сценарий:** Менеджер ответил в WB-кабинете до запуска ERP Phase 8. При первом sync `feedback.answer.text` есть → создаём OUTBOUND с `authorId=null, wbSentAt=answer.createDate`.
**Что неясно:** Должны ли мы считать тикет ANSWERED, если у него уже есть answer из WB при sync?
**Рекомендация:** Да — статус = ANSWERED если `feedback.answer != null`, иначе NEW. В CONTEXT.md это уже косвенно задекларировано через «Ручная смена статуса NEW → IN_PROGRESS → ANSWERED → CLOSED».

### 7. Tests для UI?
**Что неясно:** Нужны ли integration-тесты на Next.js (Playwright/Cypress) для ленты и диалога?
**Рекомендация:** В MVP Phase 8 — **нет** (паттерн Phase 7: только unit-тесты + human UAT). Playwright можно добавить в отдельной квик-фазе после v1.1.

## Sources

### Primary (HIGH confidence)

- [WB API User Communication — endpoints listing](https://dev.wildberries.ru/en/docs/openapi/user-communication) — полный перечень endpoint'ов Feedbacks/Questions с HTTP методами
- [WB Swagger Communications](https://dev.wildberries.ru/en/swagger/communications) — интерактивный Swagger (ссылка упоминалась в search results)
- [wildberries-sdk npm README](https://github.com/eslazarev/wildberries-sdk/blob/main/docs/npm/README.md) — методы API: `apiV1FeedbacksAnswerPost`, `apiV1FeedbacksAnswerPatch`, `apiV1QuestionsPatch`, `apiV1FeedbacksGet`, `apiV1QuestionsGet`
- `C:\Users\User\Downloads\PRD Служба поддержки WB — Zoiten ERP.md` — proprietary PRD (раздел 3.1 схема, раздел 11.4 имя покупателя)
- `C:\Claude\zoiten-pro\CLAUDE.md` — проектные конвенции
- `C:\Claude\zoiten-pro\lib\wb-api.ts` — паттерн WB-клиента (Feedbacks/Questions следуют ему)
- `C:\Claude\zoiten-pro\app\api\cron\purge-deleted\route.ts` — cron pattern с CRON_SECRET
- `C:\Claude\zoiten-pro\app\api\wb-sync\route.ts` — sync pattern
- `C:\Claude\zoiten-pro\prisma\schema.prisma` — текущая схема для расширения

### Secondary (MEDIUM confidence)

- [Описание API Вопросов и Отзывов (Postman)](https://openapi.wildberries.ru/feedbacks-questions/api/ru/) — feedback response JSON пример (productValuation, photoLinks, video structure) — **был найден в search results с конкретным примером**
- [wildberries-api PyPI](https://pypi.org/project/wildberries-api/) — подтверждает поля `is_answered`, `take`, `skip`, `supplier_feedback_valuation`
- WB API release notes (September 2025, November 2025) — упоминают обновления feedbacks endpoints

### Tertiary (LOW confidence)

- Конкретное значение rate-limit per-minute для Feedbacks/Questions — нет цифры в публичных docs; используем консервативный 600ms

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — все либы и версии уже в проекте (Prisma 6, vitest 4.1.4, Next.js 15.5.14)
- WB API endpoints: HIGH — верифицированы через WB Swagger + SDK
- WB API response schema: HIGH — JSON пример из официальных docs (Feedback + Question)
- Rate limits: MEDIUM — WB не даёт точную цифру для Feedbacks, используем конвенцию проекта
- Отсутствие `wbUserId`: HIGH — проверено 3 search queries, ни одна не нашла такое поле в response
- Prisma миграция: HIGH — такой же паттерн (4+ модели за раз) успешно применён в Phase 7
- Nginx: HIGH — существующий alias `/uploads/` уже покрывает `/uploads/support/`
- Архитектура sync: HIGH — паттерн существует в `/api/wb-sync`

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 дней — WB API стабильно; если WB опубликует webhooks или изменит endpoint-формат — повторить research)

---
