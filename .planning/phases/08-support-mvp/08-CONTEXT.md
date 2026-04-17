# Phase 8: MVP — Отзывы + Вопросы — Context

**Gathered:** 2026-04-17
**Status:** Ready for planning
**Source:** User-provided context (inline в /gsd:plan-phase args, без discuss-phase)
**PRD:** `C:\Users\User\Downloads\PRD Служба поддержки WB — Zoiten ERP.md`

<domain>
## Phase Boundary

**Что делает Phase 8:**
- Разворачивает фундамент службы поддержки — новые модели БД (SupportTicket, SupportMessage, SupportMedia, Customer + enums)
- Интегрирует WB Feedbacks и Questions API — синхронизация и ответы
- Создаёт ленту `/support` с карточками тикетов, фильтрами и sidebar бейджем
- Создаёт страницу диалога `/support/[ticketId]` с 3-колоночным layout и ответом через WB API
- Устанавливает cron-задачи: sync отзывов/вопросов (15 мин), очистка медиа (раз в сутки)
- Настраивает хранение медиа в `/var/www/zoiten-uploads/support/` с TTL 1 год

**Что НЕ делает Phase 8** (отложено в следующие фазы):
- Возвраты (кнопки Одобрить/Отклонить) — Phase 9
- Чат + автоответы — Phase 10
- Шаблоны ответов и обжалование отзывов — Phase 11
- Профиль покупателя и мессенджеры — Phase 12
- Статистика — Phase 13
- curl-fallback для блокировки Node.js fetch — только Phase 10 (Chat API), не нужен для Feedbacks/Questions

</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Декомпозиция на 4 плана (ОБЯЗАТЕЛЬНО — пользователь одобрил)

**Plan 08-01 — БД + WB API клиент + RBAC:**
- Prisma миграция: модели `SupportTicket`, `SupportMessage`, `SupportMedia`, `Customer` + enums `TicketChannel`, `TicketStatus`, `AppealStatus`, `Direction`, `MediaType`
- Обратные relations на `User` (assignedTo, authorId) и `WbCard` через nmId (не FK)
- `lib/wb-support-api.ts` — методы для Feedbacks (list, reply, report), Questions (list, reply, report). Типизированные ответы
- vitest-тесты на `wb-support-api.ts` с mock fetch
- `requireSection("SUPPORT")` уже существует (Phase 5), но надо добавить `"MANAGE"` проверки в будущих write actions
- nginx конфиг обновление — `alias /var/www/zoiten-uploads/support/` для `/uploads/support/`
- UPLOAD_DIR переменная окружения расширена на support path

**Plan 08-02 — Синхронизация и cron:**
- `POST /api/support-sync` — полная синхронизация feedbacks + questions (upsert по `wbExternalId`), скачивание медиа локально в `/var/www/zoiten-uploads/support/{ticketId}/{messageId}/{filename}`
- Идемпотентность: `upsert` по `(channel, wbExternalId)`, дубли не создаются
- `GET /api/cron/support-sync-reviews` — cron-эндпоинт, интервал 15 мин, защищён `CRON_SECRET` (паттерн `/api/cron/purge-deleted`)
- `GET /api/cron/support-media-cleanup` — раз в сутки, удаление файлов и записей `SupportMedia` где `expiresAt < now()`
- dateFrom для incremental sync: хранить `lastSyncedAt` в `AppSetting` (key="support.lastSyncedAt")
- `SupportMedia.expiresAt = createdAt + 1 год`

**Plan 08-03 — Лента `/support` + навигация:**
- Страница `/support` как RSC, карточка тикета с: иконкой канала, статусом (цветная индикатор-полоса слева: NEW красный, IN_PROGRESS жёлтый, ANSWERED зелёный, CLOSED серый, APPEALED фиолетовый), покупателем (имя или `Покупатель #${wbUserId.slice(-6)}`), товаром (nmId + фото), датой, превью текста, рейтингом (для FEEDBACK), назначенным менеджером
- Фильтры через searchParams: канал (MultiSelect: FEEDBACK/QUESTION), статус (MultiSelect), nmId (text/combobox), менеджер (MultiSelect по User с доступом SUPPORT), диапазон дат (dateFrom/dateTo), toggle «только неотвеченные» (isAnswered=false)
- MultiSelectDropdown компонент уже существует (паттерн из `/cards/wb` и `/prices/wb`)
- Пагинация: page/pageSize в searchParams, default pageSize=20
- Пункт «Служба поддержки» в `components/layout/nav-items.ts` обновляется — иконка `HeadphonesIcon` (Lucide), badge с количеством `SupportTicket.status=NEW` (server-side расчёт в layout или header)
- Старая заглушка на `/support` (из Phase 5) ЗАМЕНЯЕТСЯ на новую ленту (удалить существующий page.tsx с GitHub ссылкой)

**Plan 08-04 — Диалог `/support/[ticketId]` + server actions + кнопка Sync:**
- Страница `/support/[ticketId]` — 3-колоночный layout:
  - Левая панель: карточка покупателя (имя, wbUserId, count других обращений, ссылка «Все обращения покупателя»), карточка товара (фото, название, nmId, ссылка на WbCard)
  - Центр: хронологический диалог (входящие слева / исходящие справа), метки типа («Отзыв», «Вопрос»), медиа-превью с раскрытием по клику
  - Правая панель: статус dropdown (native select), назначение менеджера dropdown (по User с SUPPORT), канал readonly, даты
- Sticky нижняя панель ответа: textarea + кнопка «Отправить»
- Server actions в `app/actions/support.ts`:
  - `replyToTicket(ticketId, text)` → PATCH в WB API (Feedbacks или Questions в зависимости от channel) → запись OUTBOUND `SupportMessage` → `ticket.status=ANSWERED`
  - `assignTicket(ticketId, userId|null)` → обновление `SupportTicket.assignedToId`
  - `updateTicketStatus(ticketId, status)` → обновление статуса вручную
- Все server actions защищены `requireSection("SUPPORT", "MANAGE")`
- Кнопка «Синхронизировать» в шапке `/support` и `/support/[ticketId]` — POST `/api/support-sync`, toast loading/success/error

### Модель данных (Prisma schema)

Из PRD раздел 3.1 — использовать КАК ЕСТЬ, включая:
- `SupportTicket.channel: TicketChannel` (enum FEEDBACK/QUESTION/CHAT/RETURN/MESSENGER — все 5 значений, чтобы не мигрировать в следующих фазах; но в Phase 8 используем только FEEDBACK и QUESTION)
- `SupportTicket.status: TicketStatus` (NEW/IN_PROGRESS/ANSWERED/CLOSED/APPEALED — все значения)
- `AppealStatus` enum присутствует, но в Phase 8 не используется (Phase 11)
- `SupportTicket.wbExternalId` — ID из WB API (feedbackId, questionId); composite uniqueness `@@unique([channel, wbExternalId])`
- `SupportTicket.nmId: Int?` — артикул; связь с WbCard через nmId (не FK) — паттерн проекта
- `SupportTicket.customerId: String?` — nullable в Phase 8 (линковка и полноценная модель в Phase 12), но Customer создаём при первом вхождении wbUserId
- `SupportMessage.direction: Direction` (INBOUND/OUTBOUND), `authorId: String?` (null=покупатель)
- `SupportMedia.localPath: String?` — путь в `/var/www/zoiten-uploads/support/...`
- `SupportMedia.expiresAt: DateTime` — `createdAt + 1 год`

### Технологические конвенции проекта (из CLAUDE.md)

- Next.js 15 App Router, RSC + server actions
- Prisma 6, миграция через `npx prisma migrate dev --name support_mvp`
- shadcn/ui v4 base-nova: native `<select>` (НЕ base-ui Select), MultiSelectDropdown (кастомный проектный), native Button с Tailwind
- Tailwind v4 + accent оранжево-красный
- Cron через `GET /api/cron/<name>/route.ts` с проверкой `CRON_SECRET` в headers (паттерн из `app/api/cron/purge-deleted/route.ts`)
- Auth.js v5: `requireSection("SUPPORT")` в RSC и API routes для read, `requireSection("SUPPORT", "MANAGE")` в write server actions и cron
- Server actions: `"use server"` + `requireSection()` + try/catch + `revalidatePath`
- `prisma.ts` singleton — `import { prisma } from "@/lib/prisma"`
- Русский язык: UI, комментарии, планы
- Время: Moscow timezone
- Фото/медиа на VPS filesystem, отдаются nginx через `/uploads/support/...` (dev: через `/api/uploads/[...path]` route)

### WB Feedbacks/Questions API

Base URL (уточнить при research): `https://feedbacks-api.wildberries.ru`

Endpoints (из PRD, требуется верификация в research):
- `GET /api/v1/feedbacks?isAnswered=false&dateFrom=<ts>&dateTo=<ts>&take=100&skip=0`
- `PATCH /api/v1/feedbacks/{id}` body `{ text: "..." }`
- `POST /api/v1/feedbacks/report` body `{ feedbackId, reason, description }` (Phase 11, не трогаем)
- `GET /api/v1/questions?isAnswered=false&...` (аналогично)
- `PATCH /api/v1/questions/{id}` body `{ text: "..." }`

Scope токена: bit 5 (Отзывы) — уже есть в `WB_API_TOKEN` на VPS (`/etc/zoiten.pro.env`).

Rate limits: ~10 req/сек для Feedbacks и Questions. Exponential backoff на 429 (паттерн из Phase 7 `wb-promotions`).

TLS fingerprint / curl fallback: НЕ нужен для Feedbacks/Questions API (в отличие от card.wb.ru v4 и Chat API). Использовать обычный Node.js `fetch()`.

Медиа: фото/видео доступны по URL из поля ответа; скачивать локально через `fetch().then(r => r.arrayBuffer())` → `fs.writeFile`.

### Sidebar бейдж

- Пункт «Служба поддержки» в `NAV_ITEMS` — расширить: `badgeCount` рассчитывается на сервере в `app/(dashboard)/layout.tsx` как count(`SupportTicket` where `status=NEW`), передаётся в `Sidebar` через prop. Обновляется при `router.refresh()` после sync и server actions.

### Существующая заглушка /support

В Phase 5 был создан `/support` с кастомным layout (ссылка на github.com/safyodorov/ai-cs-zoiten). Надо проверить существующие файлы в `app/(dashboard)/support/` и заменить на новую ленту. Требования SUPP-01 и SUPP-02 (валидированные в Phase 5) — инвалидация после замены, НЕ удалять из REQUIREMENTS.md, но пометить как устаревшие в PROJECT.md Key Decisions.

### Claude's Discretion

- Точный layout карточки тикета (как именно располагаются иконка/статус/превью) — визуальное решение планировщика/исполнителя в рамках паттерна `/cards/wb` таблицы
- Точные DOM-классы и структура 3-колоночного layout диалога — решение исполнителя в рамках shadcn/tailwind
- Стратегия скачивания медиа (параллельно/последовательно, с ретраями) — разумный дефолт: параллельно с `Promise.all`, лимит параллельности 5, retry=1 при network error
- Именование vitest-файлов для `wb-support-api.ts` — `tests/wb-support-api.test.ts` по паттерну Phase 7
- Использование transactions в `/api/support-sync` — да, обёртывать upsert тикета + сообщения + медиа в `prisma.$transaction` per-тикет
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Conventions
- `CLAUDE.md` — stack, conventions, RBAC pattern, sync architecture, cron pattern, nginx/uploads
- `lib/wb-api.ts` — существующий WB API клиент (паттерн для Feedbacks/Questions)
- `lib/rbac.ts` — `requireSection(section, minRole?)` сигнатура
- `lib/sections.ts` — SECTION_PATHS mapping, SUPPORT уже есть
- `lib/prisma.ts` — PrismaClient singleton

### Existing Similar Patterns
- `app/api/wb-sync/route.ts` — существующий пример синхронизации с WB (Content/Prices/Stats API), паттерн для `support-sync`
- `app/api/cron/purge-deleted/route.ts` — существующий cron-эндпоинт с CRON_SECRET, паттерн для support-sync-reviews и support-media-cleanup
- `app/(dashboard)/cards/wb/` — существующая страница с фильтрами и MultiSelectDropdown, паттерн для `/support`
- `app/actions/products.ts` — существующие server actions с requireSection() + try/catch + revalidatePath, паттерн для `app/actions/support.ts`
- `components/cards/WbFilters.tsx` — паттерн использования MultiSelectDropdown через searchParams
- `components/layout/nav-items.ts` — shared NAV_ITEMS, пункт «Служба поддержки» уже есть как заглушка

### Schema
- `prisma/schema.prisma` — текущая схема, будем добавлять новые модели (не ломать существующие)

### API Reference
- PRD раздел 2 (WB API маппинг)
- dev.wildberries.ru/docs/openapi/user-communication — актуальная документация WB API (для research-валидации)

### Deployment
- `deploy.sh` — VPS deployment скрипт
- `/etc/zoiten.pro.env` — WB_API_TOKEN, CRON_SECRET
- nginx config на VPS — `/etc/nginx/sites-enabled/zoiten-pro`

</canonical_refs>

<specifics>
## Specific Ideas

### Упорядочивание карточек в ленте
По умолчанию — `createdAt DESC` (самые новые сверху). В будущем возможна приоритизация NEW > IN_PROGRESS > прочее — но в Phase 8 не реализуем.

### Иконки каналов (из PRD)
💬 Отзыв / ❓ Вопрос / 🗨️ Чат / 🔄 Возврат / 📩 Мессенджер — через Lucide вариант (MessageSquare, HelpCircle, MessageCircle, RotateCw, Inbox).

### Имя покупателя
Если `Customer.name` есть — показывать; иначе `Покупатель #${wbUserId.slice(-6)}` (PRD 11.4).

### Превью текста в карточке
Первые 140 символов, обрезка по слову, многоточие.

### Sticky панель ответа
Фиксированная внизу экрана в диалоге — паттерн из мессенджеров (position: sticky; bottom: 0 в scroll-контейнере центра).

### Ответ отправил — что потом
После успешного PATCH в WB API:
1. `SupportMessage` с direction=OUTBOUND, `authorId=session.user.id`, `wbSentAt=now()`
2. `SupportTicket.status=ANSWERED`, `resolvedAt=now()`
3. `revalidatePath("/support")` + `revalidatePath("/support/[ticketId]")`
4. Toast «Ответ отправлен»

### Ошибка WB API при отправке
- `SupportMessage` не создаётся
- Toast с текстом ошибки (русский), рекомендация «Попробуйте синхронизировать и повторить»
- Статус тикета не меняется
</specifics>

<deferred>
## Deferred Ideas

- Real-time обновления (websocket / polling из клиента) — polling через cron достаточен для MVP
- Групповое назначение менеджера (bulk actions) — одиночное назначение для MVP
- Экспорт ленты тикетов в Excel — не нужно, Phase 13 даёт статистику
- Кастомизация цветов статусов на пользователя — единая палитра
- Напоминание ответить («тикет не отвечен >24ч») — можно добавить в Phase 13 статистику
- Авто-назначение менеджера по round-robin — ручное назначение для MVP
- Bulk reply / canned responses в ленте — только индивидуальные ответы в диалоге
- Рейтинг товара по ленте — показываем только в карточке отзыва, агрегация в Phase 13
- Redaction/модерация входящих (фильтр матов, PII) — не требуется по PRD
</deferred>

---

*Phase: 08-support-mvp*
*Context gathered: 2026-04-17 inline через /gsd:plan-phase args (без discuss-phase)*
