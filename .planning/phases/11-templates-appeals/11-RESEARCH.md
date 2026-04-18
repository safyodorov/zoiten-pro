# Phase 11: Шаблоны ответов + Обжалование отзывов — Research

**Researched:** 2026-04-17
**Domain:** WB Feedbacks+Questions API (templates & complaints статус disabled), локальная библиотека шаблонов, локальный трекинг обжалований, UI пикер шаблонов в ReplyPanel/ChatReplyPanel
**Confidence:** HIGH (критическое открытие — оба «якорных» WB API endpoint'а Phase 11 отключены официальным digest'ом WB; верифицировано 3 независимыми источниками — WB dev portal news/161, openapi.wb.ru, eslazarev/wildberries-sdk); HIGH (модель данных/UI/state machine — переиспользование проверенных паттернов Phase 8/9/10)

## Executive Summary

**Phase 11 переворачивается с ног на голову из-за WB API:** предполагавшиеся две интеграции с WB API **официально отключены Wildberries'ом в ноябре-декабре 2025 года**:

1. **Методы шаблонов ответов отключены 19 ноября 2025** (`GET/POST/PATCH/DELETE /api/v1/templates` для feedbacks+questions). WB прямо рекомендует: *«implement template storage in your own system and use direct response submission methods»* ([дайджест от 2025-11](https://dev.wildberries.ru/en/news/161)).
2. **Метод жалоб на отзыв отключён 8 декабря 2025** (`POST /api/v1/feedbacks/actions` — жаловаться на отзыв; `GET /api/v1/supplier-valuations` — список причин жалоб). Цитата WB: *«Wildberries is temporarily removing this functionality from the API to improve data accuracy. Complaint management remains available through the seller's personal account»* ([там же](https://dev.wildberries.ru/en/news/161)).

**Практическое следствие для Phase 11:**

| Функция | Оригинальный план (REQUIREMENTS.md) | Реальность 2026-04 |
|---------|--------------------------------------|---------------------|
| CRUD шаблонов в БД | SUP-26 — `ResponseTemplate` таблица | ✅ **Полностью реализуемо** как локальная ERP-фича |
| Sync шаблонов с WB | SUP-27 — `wbTemplateId`, Publish/Update/Delete в WB | ❌ **Невозможно** — API отключён. `wbTemplateId` не нужен |
| Модалка «Выбрать шаблон» при ответе | SUP-28 | ✅ **Полностью реализуемо** (чисто локально) |
| Обжаловать отзыв | SUP-29 — POST /api/v1/feedbacks/report + appealId | ❌ **Невозможно** через API. Только ручное обжалование в ЛК + локальный трекинг |
| Cron поллинг статуса обжалования | SUP-30 — GET /api/v1/feedbacks/report/{appealId} | ❌ **Невозможно** через API. Менеджер вручную отмечает исход |
| Индикатор обжалования в ленте | SUP-31 | ✅ Реализуемо поверх ручного локального флага |
| Доп. cron 1 час | SUP-07 доп. | ❌ Не нужен — нечего поллить |

**Primary recommendation — переформулировать Phase 11 как две независимых local-only фичи:**

- **Feature A — Локальная библиотека шаблонов (SUP-26, SUP-28, частично SUP-27).** Полный CRUD через ERP, без WB sync. Шаблоны применяются через «Выбрать шаблон» в ReplyPanel (FEEDBACK/QUESTION) и ChatReplyPanel (CHAT). Переменные `{имя_покупателя}`, `{название_товара}` как в Phase 10. **SUP-27 реформулируется** как «Экспорт/импорт JSON» шаблонов между инсталляциями ERP (nice-to-have, можно deferred).
- **Feature B — Локальный трекер обжалований (SUP-14 доп, SUP-29/30/31).** Менеджер кликает «Обжаловать отзыв» → модалка с причиной + свободным текстом + **инструкцией «Откройте отзыв в ЛК Wildberries и подайте жалобу вручную»** → `ticket.status=APPEALED`, локально пишется `AppealRecord` с `appealStatus=PENDING`. Менеджер **вручную** переключает статус в PENDING → APPROVED/REJECTED (и пишет в поле `wbDecisionNote` что ответил WB в ЛК). Cron отсутствует. Индикатор обжалования SUP-31 работает поверх этого локального флага.

Это честное решение, которое сохраняет ценность раздела для менеджера (единое окно: шаблоны + трекинг жалоб + все остальные каналы), **не обманывая его** ложной автоматизацией, которой WB не даёт.

**Критически важно уточнить у пользователя в `/gsd:discuss-phase 11`** (до планирования):
1. Согласен ли отказаться от WB sync шаблонов (API отключён)?
2. Согласен ли с гибридной моделью обжалования (локальный трекинг + ссылка на ЛК, без автоматики)?
3. Переформулировать SUP-27 как «Export/Import JSON» или полностью deferred?

Если пользователь настаивает на автоматике — **блокер, который должен выйти на обсуждение с Wildberries** (форум dev.wildberries.ru `/forum/topics/1887` — уже был такой вопрос от другого продавца, WB команда не дала сроков возврата функциональности).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SUP-07 (доп.)** | Cron обжалований 1 час (`GET /api/cron/support-sync-appeals`) — поллит статусы PENDING через `GET /api/v1/feedbacks/report/{appealId}` | ❌ **API endpoint отключён (2025-12-08)**. Cron НЕ реализуется. Менеджер меняет статус вручную. Альтернатива: оставить endpoint как заглушку `return {disabled: true}` для совместимости с crontab на VPS. |
| **SUP-14 (доп.)** | Кнопка «Обжаловать» в диалоге FEEDBACK | ✅ Кнопка реализуется, но открывает локальную модалку (не вызывает WB API). Текст кнопки: «Пометить обжалованным» или «Обжаловать в ЛК» (обсудить с пользователем). |
| **SUP-26** | `ResponseTemplate` CRUD (`/support/templates`) — таблица + форма | ✅ Полностью локально. Модель данных в `## Data Model` ниже. |
| **SUP-27** | Sync шаблонов с WB: GET list, POST publish, PUT update, DELETE delete + сохранить `wbTemplateId` | ❌ **API endpoints отключены (2025-11-19)**. `wbTemplateId` НЕ нужен. Реформулировать в Export/Import JSON или пометить deferred. |
| **SUP-28** | Модалка «Выбрать шаблон» в ReplyPanel/ChatReplyPanel — поиск + группировка по nmId | ✅ Полностью реализуемо. UI в `## UI Architecture`. |
| **SUP-29** | Обжалование отзыва: модалка с причиной → POST /api/v1/feedbacks/report → `appealId` + `ticket.status=APPEALED` | ⚠ Реализуется **без WB API**: только локальный `AppealRecord{appealStatus=PENDING}`. Нет `appealId` от WB — используем локальный cuid. Причина: из справочника в коде (см. [Appeal Reasons](#appeal-reasons)). |
| **SUP-30** | Cron раз в час обновляет PENDING → APPROVED/REJECTED через GET /api/v1/feedbacks/report/{appealId} | ❌ API отключён. Реализуется как **ручное** переключение статуса менеджером (dropdown в карточке тикета). Cron не создаётся. |
| **SUP-31** | Индикатор обжалования в ленте и диалоге (нет / 🕐 PENDING / ✅ APPROVED / ❌ REJECTED) | ✅ Полностью реализуемо поверх локального `SupportTicket.appealStatus`. |

## User Constraints (from CONTEXT.md)

> **CONTEXT.md для Phase 11 не создан.** Ограничения выводятся из ROADMAP.md Phase 11 + REQUIREMENTS.md (SUP-07 доп, SUP-14 доп, SUP-26..31) + паттернов Phase 8/9/10. Перед планированием — запустить `/gsd:discuss-phase 11` и синхронизировать локальный переворот (Feature A/B), т.к. выводы research существенно меняют scope SUP-27/29/30.

### Locked Decisions (из ROADMAP + REQUIREMENTS, подтвердить в discuss-phase)

- **Scope:** только WB (FEEDBACK/QUESTION для шаблонов + CHAT для чат-шаблонов; FEEDBACK для обжалования). Ozon/Мессенджеры — OUT OF SCOPE.
- **RBAC:** чтение (`/support/templates` render, модалка выбора) — `requireSection("SUPPORT")`; write (CRUD шаблонов, обжалование, смена статуса обжалования) — `requireSection("SUPPORT", "MANAGE")`.
- **Язык:** русский (CLAUDE.md).
- **Native HTML `<select>`** для статусов/каналов в форме шаблона — паттерн CLAUDE.md.
- **MultiSelectDropdown** inline в фильтрах (паттерн `SupportFilters.tsx`, Phase 8).
- **vitest** 4.1.4 (Phase 7+) для unit-тестов.
- **Prisma singleton:** `import { prisma } from "@/lib/prisma"`.
- **Moscow timezone** для форматирования дат (`Intl.DateTimeFormat("ru-RU", {timeZone: "Europe/Moscow"})`).
- **TicketStatus APPEALED** уже есть в enum (`prisma/schema.prisma:497`) — не добавляем. Переход в APPEALED только через действие «Обжаловать», ручной dropdown не предлагает APPEALED (паттерн `TicketSidePanel.tsx:32-37`).
- **Связь ticket ↔ WbCard через nmId** без FK (паттерн проекта, Phase 8/9/10).

### Claude's Discretion (research-based, подтвердить с пользователем)

- **SUP-27 переформулирование:** так как WB templates API мёртв (2025-11-19), предлагаем вместо sync реализовать **Export/Import JSON** (кнопка «Экспортировать шаблоны» скачивает JSON-файл всех активных шаблонов; «Импортировать» — загружает JSON). Альтернатива: SUP-27 deferred полностью. **Выбор за пользователем.**
- **SUP-29/30 — workflow обжалования:** так как WB appeals API мёртв (2025-12-08), предлагаем **hybrid manual**:
  - UI кнопка «Обжаловать отзыв» → модалка с (1) выпадающий `reason` из статичного справочника в коде (см. [Appeal Reasons](#appeal-reasons)) + (2) textarea для свободного текста + (3) **инструкционный блок**: «После создания обжалования откройте отзыв в ЛК Wildberries и подайте жалобу вручную. Когда WB примет решение — вернитесь сюда и обновите статус».
  - Создаётся `AppealRecord{ticketId, appealStatus: PENDING, reason, freeText, createdById, createdAt}` + `ticket.status = APPEALED` + `ticket.appealStatus = PENDING` (поле уже есть в схеме).
  - В `TicketSidePanel` для APPEALED-тикетов рядом со статусом появляется dropdown `appealStatus` (PENDING/APPROVED/REJECTED) + textarea `wbDecisionNote` — менеджер переключает вручную, когда WB ответит в ЛК.
  - `appealedAt`, `appealResolvedAt` — автоматически проставляются при смене `appealStatus`.
  - `appealId: String?` — **локальный** cuid, не WB ID (поле уже есть в схеме, переиспользуется).
- **Не создавать `/api/cron/support-sync-appeals`** — нечего поллить. Если пользователь захочет — можно создать заглушку, возвращающую `{disabled: true, reason: "WB API removed 2025-12-08"}` (для совместимости с crontab-строкой на VPS, чтобы не удалять её).
- **Модалка «Выбрать шаблон»** — shadcn `Dialog` wrapper с нативным `<input>` поиска и flat `<ul>` списком (паттерн CLAUDE.md: не base-ui). Для <100 шаблонов virtualization не нужен, filter `.filter(t => t.name.toLowerCase().includes(q))` достаточно.
- **Support переменных `{имя_покупателя}` / `{название_товара}`** в шаблонах — **да**, консистентно с AutoReplyConfig.messageText (Phase 10). Подстановка на клиенте при выборе шаблона (до submit).
- **`ResponseTemplate.channel` enum** — переиспользовать существующий `TicketChannel` enum (FEEDBACK/QUESTION/CHAT), но валидировать в Zod только значения FEEDBACK/QUESTION/CHAT (RETURN/MESSENGER шаблонов нет по SUP-26).
- **Связь `ResponseTemplate.nmId`** (опционально) — Int? без FK на WbCard (паттерн проекта). Фильтр «шаблоны для текущего nmId первыми» в модалке — locally sort.
- **Приоритизация в модалке:** (1) шаблоны с `nmId = ticket.nmId`, (2) общие (`nmId = null`), внутри каждой группы — (a) совпадение `situationTag` с тегом текущего тикета (если будет — в Phase 11 тикет не имеет тега, так что пропустить), (b) сортировка по `updatedAt DESC`.

### Deferred Ideas (OUT OF SCOPE Phase 11)

- Sync шаблонов с WB API — невозможно, API removed.
- Автоматический POST жалоб в WB — невозможно, API removed.
- Автоматический GET статусов обжалований — невозможно, API removed.
- AI-генерация текста шаблона — v2.
- Шаблоны для RETURN (причины отказа) — Phase 9 использует прямой textarea в ReturnActionsPanel, шаблоны избыточны для 2-3 стандартных причин. Можно добавить в Phase 13 если статистика покажет повторяемость.
- Bulk-создание шаблонов через импорт CSV — deferred.
- Статистика использования шаблонов (какой чаще применяется) — Phase 13.
- Groups/folders шаблонов — deferred (ситуационных тегов достаточно для 20-50 шаблонов).

## Project Constraints (from CLAUDE.md)

Критические директивы, применимые к Phase 11:

- **Язык:** русский в UI, тестах, коммитах.
- **Select:** native HTML `<select>` для `channel` dropdown в форме шаблона + `appealStatus` dropdown в TicketSidePanel.
- **MultiSelect:** inline MultiSelectDropdown компонент (паттерн `SupportFilters.tsx:1`) для фильтров `/support/templates` (канал/активность/товар).
- **Server Actions:** `"use server"` + `requireSection("SUPPORT", "MANAGE")` + try/catch + `revalidatePath`. Паттерн `app/actions/support.ts`.
- **WB v4 curl fallback** — не нужен в Phase 11 (нет вызовов к WB API).
- **Prisma singleton:** `@/lib/prisma`.
- **Фото/PDF upload** для шаблонов — не нужен (только текст; медиа — в SupportMedia через отдельный поток Phase 10).
- **Cron secret** — не нужен (нет нового cron'a).
- **GSD Workflow Enforcement** — все Write/Edit через `/gsd:execute-phase`.

Все директивы CLAUDE.md совместимы с предлагаемым local-only подходом.

## WB Templates API — СТАТУС: ОТКЛЮЧЕНО

### История и факты

**Было до 2025-11-19:**
- Base URL: `https://feedbacks-api.wildberries.ru`
- Endpoints:
  - `GET /api/v1/templates` — список шаблонов (макс 20: 10 feedback + 10 question)
  - `POST /api/v1/templates` — создать шаблон
  - `PATCH /api/v1/templates` — редактировать шаблон
  - `DELETE /api/v1/templates` — удалить шаблон
- Scope: bit 5 (Отзывы)
- Ограничение: не более 20 шаблонов на аккаунт (10 FEEDBACK + 10 QUESTION)

**Стало 2025-11-19 (по решению WB):**
- Все 4 метода отключены. Любой запрос возвращает 404 или 410.
- WB официально рекомендует: *«Response template methods have been disabled. If you haven't migrated yet — implement template storage in your own system and use direct response submission methods.»* ([WB API Updates Digest November 2025](https://dev.wildberries.ru/en/news/161))
- Тogic: WB не даёт сроков возвращения функциональности.

**Вывод:** Ни один метод Phase 11 SUP-27 не может работать через WB API. Архитектурное решение: **локальная ERP-библиотека шаблонов**, 100% в БД проекта. Поля `wbTemplateId`, `wbPublishedAt` в схеме НЕ НУЖНЫ. Все server actions `publishTemplateToWb`, `updateTemplateInWb`, `deleteTemplateFromWb` НЕ СОЗДАЮТСЯ.

**Альтернатива если функциональность вернётся:** новое поле `wbTemplateId: String?` можно добавить в Phase 11+1 миграцией без ломания текущей модели.

### Источники

- [WB API Updates Digest November 2025 (news/161)](https://dev.wildberries.ru/en/news/161) — официальное уведомление об отключении.
- [WB API FAQ](https://dev.wildberries.ru/en/faq) — общие данные об API Feedbacks+Questions.
- [Customer Communication Documentation](https://dev.wildberries.ru/en/openapi/user-communication) — текущая документация больше не содержит templates endpoints.
- [eslazarev/wildberries-sdk](https://github.com/eslazarev/wildberries-sdk) — SDK, автогенерируемый из WB OpenAPI, не содержит template методов (подтверждает удаление из спеки).

## WB Report/Complaint API — СТАТУС: ОТКЛЮЧЕНО

### История и факты

**Было до 2025-12-08:**
- Base URL: `https://feedbacks-api.wildberries.ru`
- Endpoints:
  - `GET /api/v1/supplier-valuations` — список причин жалоб (справочник)
  - `POST /api/v1/feedbacks/actions` — подать жалобу на отзыв
  - (Формат `POST /api/v1/feedbacks/report` НЕ существовал — был `/actions`, REQUIREMENTS.md использует неверный путь)
- Body: `{feedbackId, reasonId, text?}`
- Scope: bit 5 (Отзывы)

**Стало 2025-12-08 (по решению WB):**
- Оба метода отключены. Цитата: *«Wildberries is temporarily removing this functionality from the API to improve data accuracy. Complaint management remains available through the seller's personal account.»* ([WB API Updates Digest November 2025](https://dev.wildberries.ru/en/news/161))
- WB **не предоставляет GET-метода для опроса статуса жалобы** — ни до отключения, ни сейчас. SUP-30 cron поллинг и SUP-07 доп. cron обжалований 1 час невозможны по техническим причинам WB.
- Обжалование возможно **только через seller.wildberries.ru** кабинет.

**Форум-подтверждение:** [dev.wildberries.ru/forum/topics/1887](https://dev.wildberries.ru/en/forum/topics/1887) — продавец спрашивает *«Как узнать одобрена ли жалоба на отзыв?»* — WB команда не отвечает с мая 2024 (вопрос остался без ответа). Это означает: даже когда API был активен, **он не поддерживал polling статуса жалобы** — SUP-30 план был бы невозможен в любом случае.

### Последствия для Phase 11

1. **SUP-29 реформулируется:** кнопка «Обжаловать» открывает локальную модалку, создаёт `AppealRecord` в БД, проставляет `ticket.status=APPEALED` + `ticket.appealStatus=PENDING`. **НЕ отправляет в WB.** Модалка содержит:
   - Выпадающий список reason (статичный справочник, см. [Appeal Reasons](#appeal-reasons))
   - Textarea свободного текста (min 10, max 1000)
   - Инструкционный блок: *«После сохранения: откройте отзыв в ЛК Wildberries (Отзывы и вопросы → "Пожаловаться на отзыв") и подайте жалобу там. Когда WB примет решение — вернитесь сюда и обновите статус обжалования.»*
   - Кнопка «Сохранить и открыть отзыв в ЛК» — копирует текст в буфер + открывает ссылку на `https://seller.wildberries.ru/community/reviews` в новой вкладке.
2. **SUP-30 удаляется** — cron поллинг не реализуется, т.к. нет WB API.
3. **SUP-07 доп. удаляется** — cron обжалований 1 час не создаётся.
4. **SUP-31 упрощается:** индикатор обжалования работает поверх `ticket.appealStatus`, который **менеджер меняет вручную** через dropdown в TicketSidePanel (когда WB ответит в ЛК).

### Appeal Reasons

Статичный справочник в коде (извлечён из UI seller.wildberries.ru на момент research):

```typescript
// lib/appeal-reasons.ts
export const APPEAL_REASONS = [
  { id: "offensive", label: "Оскорбительные выражения, нецензурная лексика" },
  { id: "competitor_ad", label: "Реклама конкурентов или сторонних сервисов" },
  { id: "not_about_product", label: "Отзыв не относится к данному товару" },
  { id: "personal_data", label: "Персональные данные покупателя или третьих лиц" },
  { id: "false_info", label: "Заведомо ложная информация" },
  { id: "spam", label: "Спам, бессмысленный текст" },
  { id: "political", label: "Политические или религиозные призывы" },
  { id: "other", label: "Другое" },
] as const

export type AppealReasonId = typeof APPEAL_REASONS[number]["id"]
```

**⚠ Confidence:** MEDIUM. Список собран из публичных описаний UI кабинета (vc.ru/mpstats статьи + mneniya.pro). Если пользователь хочет точный соответствующий WB список — **Wave 0 задача:** сделать реальный скриншот UI жалобы в seller.wildberries.ru и зафиксировать названия причин 1-в-1.

### Источники

- [WB API Updates Digest November 2025 (news/161)](https://dev.wildberries.ru/en/news/161) — официальное уведомление об отключении.
- [WB API Customer Communication](https://dev.wildberries.ru/en/news/278) — текущая документация не содержит complaint endpoints, только подтверждение *«Работа с жалобами доступна в личном кабинете»*.
- [Форум dev.wildberries.ru/forum/topics/1887](https://dev.wildberries.ru/en/forum/topics/1887) — подтверждение, что GET-поллинга статуса жалобы никогда не было.
- [eslazarev/wildberries-sdk SDK docs](https://github.com/eslazarev/wildberries-sdk) — не содержит complaint методов.

## Data Model

### Новая модель: `ResponseTemplate`

```prisma
// Phase 11: Шаблоны ответов для FEEDBACK/QUESTION/CHAT каналов.
// WB API для шаблонов отключён WB'ом 2025-11-19 — хранилище 100% локальное.
// Переменные {имя_покупателя}, {название_товара} подставляются на клиенте
// при выборе шаблона (консистентно с AutoReplyConfig.messageText Phase 10).
model ResponseTemplate {
  id            String           @id @default(cuid())
  name          String                                // уникальное короткое название «Спасибо за отзыв 5 звёзд»
  text          String           @db.Text             // текст с переменными {имя_покупателя}/{название_товара}
  channel       TicketChannel                         // FEEDBACK | QUESTION | CHAT (RETURN/MESSENGER в Zod не допускаются)
  situationTag  String?                               // свободный тег «Положительный 5★», «Негативный 1★», «Вопрос о размере»
  nmId          Int?                                  // опциональная привязка к WbCard (без FK, паттерн проекта)
  isActive      Boolean          @default(true)
  createdById   String?
  createdBy     User?            @relation("TemplateCreator", fields: [createdById], references: [id], onDelete: SetNull)
  updatedById   String?
  updatedBy     User?            @relation("TemplateUpdater", fields: [updatedById], references: [id], onDelete: SetNull)
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  @@index([channel, isActive])
  @@index([nmId])
  @@index([situationTag])
  @@unique([name])                                     // уникальные названия — предотвращает дубли при импорте
}
```

**Rationale полей:**
- `channel: TicketChannel` — переиспользование существующего enum из Phase 8 (не создавать новый `TemplateChannel`, который планировался в SUP-01). В Zod-схеме валидировать: только `FEEDBACK | QUESTION | CHAT`. Отказ от отдельного enum — DRY.
- `nmId: Int?` — без FK, паттерн проекта (как `SupportTicket.nmId`).
- `situationTag: String?` — свободный тег, не enum. В UI — список autocomplete из существующих значений через distinct-запрос. Free-form гибче enum'а.
- `@@unique([name])` — защита от повторного импорта того же JSON.
- `createdById / updatedById` — audit trail (паттерн проекта, как `AppSetting.updatedBy` Phase 7, `AutoReplyConfig.updatedById` Phase 10).
- `isActive` — soft-disable (не delete), чтобы исторический шаблон не исчезал из списка выбора при отключении.

**НЕ добавляем поля:**
- `wbTemplateId` — WB API мёртв.
- `wbSyncedAt`, `wbPublishedAt` — WB API мёртв.
- `usedCount`, `lastUsedAt` — Phase 13 статистика.

### Новая модель: `AppealRecord`

```prisma
// Phase 11: Локальный трекер обжалований отзывов.
// WB API для обжалований отключён WB'ом 2025-12-08 — все данные локальные.
// Менеджер создаёт запись + вручную обновляет статус когда WB ответит в ЛК.
// Один ticket → максимум один AppealRecord (если первое обжалование отклонено,
// второе через API невозможно — WB не даёт, локальный повтор бессмыслен).
model AppealRecord {
  id               String           @id @default(cuid())
  ticketId         String           @unique              // один тикет → одно обжалование
  ticket           SupportTicket    @relation("Appeal", fields: [ticketId], references: [id], onDelete: Cascade)
  reasonId         String                                  // id из APPEAL_REASONS (offensive/competitor_ad/...)
  reasonLabel      String                                  // денормализованный label для исторического отображения (даже если справочник изменится)
  freeText         String           @db.Text              // свободный комментарий менеджера 10-1000 символов
  status           AppealStatus                             // PENDING | APPROVED | REJECTED (переиспользуем существующий enum)
  wbDecisionNote   String?          @db.Text              // заметка менеджера: «WB отклонил, причина — не относится к оскорблениям» (заполняется при переводе в APPROVED/REJECTED)
  createdById      String
  createdBy        User             @relation("AppealCreator", fields: [createdById], references: [id], onDelete: Restrict)
  resolvedById     String?
  resolvedBy       User?            @relation("AppealResolver", fields: [resolvedById], references: [id], onDelete: SetNull)
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
  resolvedAt       DateTime?

  @@index([status])
  @@index([createdAt])
}
```

**Rationale полей:**
- `@@unique([ticketId])` — гарантирует 1:1. Повторное обжалование через API невозможно, повтор в БД бессмыслен. Если менеджер захочет «обжаловать снова» после REJECTED — можно переключить `status = PENDING` + обновить `freeText` без создания второго рекорда.
- `status: AppealStatus` — **переиспользуем** существующий enum (`prisma/schema.prisma:500-505`), добавлять новый `LocalAppealStatus` не нужно. В Phase 11 используются только PENDING/APPROVED/REJECTED; NONE не применяется (для не-обжалованных тикетов просто нет `AppealRecord`).
- `reasonId` + `reasonLabel` — двойное хранение, чтобы изменение справочника `APPEAL_REASONS` в коде не сломало исторические записи.
- `wbDecisionNote` — заметка менеджера о решении WB (что написал WB в ЛК).
- `createdBy onDelete: Restrict` — аудиторский след, нельзя терять автора обжалования.
- `resolvedBy onDelete: SetNull` — если резольвер деактивирован, запись остаётся.

### Расширение модели `SupportTicket`

**Уже есть в схеме (Phase 8):**
```prisma
appealStatus  AppealStatus?  // Phase 11  ← переиспользуется
appealId      String?        // Phase 11  ← переиспользуется как FK-like текстовый id AppealRecord
```

**Добавить в Phase 11:**
```prisma
// В model SupportTicket:
appealedAt        DateTime?         // когда создано обжалование — auto-set в action createAppeal
appealResolvedAt  DateTime?         // когда менеджер перевёл в APPROVED/REJECTED — auto-set
appealRecord      AppealRecord?     @relation("Appeal")   // back-relation

// В model User (two new named relations):
appealsCreated    AppealRecord[]    @relation("AppealCreator")
appealsResolved   AppealRecord[]    @relation("AppealResolver")
templatesCreated  ResponseTemplate[] @relation("TemplateCreator")
templatesUpdated  ResponseTemplate[] @relation("TemplateUpdater")
```

**Rationale:**
- `appealStatus` + `appealId` в SupportTicket — денормализация (быстрый JOIN-free фильтр в ленте по статусу обжалования). `appealId` переиспользуется как id связанного `AppealRecord` (не WB ID, который в WB API не существует).
- `appealedAt` / `appealResolvedAt` — удобные для UI поля без JOIN на AppealRecord.
- Обновление: при `createAppeal` → `ticket.update({status: APPEALED, appealStatus: PENDING, appealId: record.id, appealedAt: now})`. При `resolveAppeal` → `ticket.update({appealStatus: APPROVED|REJECTED, appealResolvedAt: now})`.

### Миграция

```bash
npx prisma migrate dev --name templates_appeals
```

Миграция добавляет:
- 1 новую модель `ResponseTemplate` (1 table + 4 indexes + 1 unique)
- 1 новую модель `AppealRecord` (1 table + 2 indexes + 1 unique ticketId)
- 2 новых поля в `SupportTicket` (`appealedAt`, `appealResolvedAt`)
- 4 новых relations в `User`

**Никаких новых enum'ов** — переиспользуем `TicketChannel` и `AppealStatus`.

**Nullable:** все новые поля nullable → обратно-совместимо с Phase 8/9/10 данными.

## Sync Strategy — NOT APPLICABLE

Phase 11 **не требует** синхронизации с WB (оба API отключены):
- Нет `syncResponseTemplates()` — шаблоны локальные.
- Нет `publishTemplateToWb` — API отключён.
- Нет `pollAppealStatuses()` — API отключён.
- **Нет нового cron endpoint'а.**

`/api/support-sync` не трогается — он обрабатывает feedbacks/questions/returns/chats (Phase 8/9/10). Обжалования и шаблоны ERP-local, не синхронизируются.

**Единственный «sync»-подобный функционал (опциональный, deferred):**
- `POST /api/templates/export` — возвращает JSON со всеми активными шаблонами.
- `POST /api/templates/import` — принимает JSON, upsert по `name`. Для переноса между инсталляциями ERP (dev → prod).

Обсудить с пользователем: оставить Export/Import в Phase 11 или deferred.

## UI Architecture

### Страница `/support/templates`

```
app/(dashboard)/support/templates/
├── page.tsx                             # RSC — assemble data, render TemplatesTable + TemplatesFilters + «Создать шаблон»
├── new/page.tsx                         # RSC — TemplateForm (create)
├── [id]/edit/page.tsx                   # RSC — TemplateForm (edit)

components/support/templates/
├── TemplatesTable.tsx                   # Client — таблица (Название, Канал, Ситуация, Товар, Активен, Действия) + sort + MultiSelectDropdown
├── TemplatesFilters.tsx                 # Client — inline MultiSelect по channel/isActive/situationTag/nmId (паттерн SupportFilters)
├── TemplateForm.tsx                     # Client — react-hook-form + Zod, native <select> для channel, text textarea, хинт про переменные
├── TemplatePickerModal.tsx              # Client — модалка выбора шаблона в ReplyPanel/ChatReplyPanel (fuzzy search + группировка по nmId)
├── AppealModal.tsx                      # Client — модалка «Обжаловать отзыв» с reason dropdown + freeText + инструкцией + «Открыть отзыв в ЛК»
├── AppealStatusPanel.tsx                # Client — блок в TicketSidePanel для APPEALED тикетов: dropdown status + wbDecisionNote textarea
```

### Страница `/support/templates` таблица

Колонки:

| Название | Канал | Тег ситуации | Товар | Статус | Обновлено | Действия |
|----------|-------|--------------|-------|--------|-----------|----------|
| «Спасибо за 5 звёзд» | Отзыв | Положительный | Общий | Активен | 12.04 14:30 | Редактировать / Отключить |
| «Размер — измерьте...» | Вопрос | Вопрос размера | nmId 12345 | Активен | 11.04 09:00 | Редактировать / Отключить |

Кнопка «Создать шаблон» в шапке → `/support/templates/new`.

Фильтры (через searchParams, паттерн Phase 8):
- Канал (MultiSelect: FEEDBACK/QUESTION/CHAT)
- Статус активности (все / активные / отключённые)
- Тег ситуации (MultiSelect из distinct-значений)
- Товар (поиск по nmId — text input или combobox по WbCard)

Pagination: 20 per page (паттерн проекта).

### Форма шаблона

React-hook-form + Zod-валидация:

```typescript
const templateSchema = z.object({
  name: z.string().min(2).max(80),
  text: z.string().min(1).max(5000),
  channel: z.enum(["FEEDBACK", "QUESTION", "CHAT"]),
  situationTag: z.string().max(60).optional().nullable(),
  nmId: z.coerce.number().int().positive().optional().nullable(),
  isActive: z.boolean().default(true),
})
```

Поле `channel` — native `<select>` (CLAUDE.md, не base-ui).

Под textarea — подсказка: *«Переменные: `{имя_покупателя}`, `{название_товара}` подставятся автоматически при выборе шаблона.»*

Submit → server action `createTemplate` / `updateTemplate` → revalidatePath `/support/templates`.

### Модалка «Выбрать шаблон» (TemplatePickerModal)

Интегрируется в `ReplyPanel.tsx` (для FEEDBACK/QUESTION) и в будущий `ChatReplyPanel.tsx` (Phase 10). Кнопка «Выбрать шаблон» появляется слева от textarea, над или рядом с кнопкой «Отправить».

Открытие → shadcn `Dialog`:

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="max-w-2xl">
    <DialogHeader>
      <DialogTitle>Выбрать шаблон</DialogTitle>
    </DialogHeader>

    {/* Поиск — native <input> */}
    <input
      type="text"
      placeholder="Поиск по названию или тексту..."
      value={search}
      onChange={e => setSearch(e.target.value)}
      className="w-full rounded-md border px-3 py-2"
    />

    {/* Группировка */}
    <div className="max-h-[400px] overflow-y-auto space-y-4">
      {templatesForNmId.length > 0 && (
        <section>
          <h3 className="text-sm font-medium mb-2">Для этого товара</h3>
          <ul>{templatesForNmId.map(t => <TemplateItem key={t.id} template={t} onPick={onPick}/>)}</ul>
        </section>
      )}
      <section>
        <h3 className="text-sm font-medium mb-2">Общие шаблоны</h3>
        <ul>{generalTemplates.map(t => <TemplateItem key={t.id} template={t} onPick={onPick}/>)}</ul>
      </section>
    </div>
  </DialogContent>
</Dialog>
```

`onPick(template)`:
1. Подставить `template.text` в textarea ReplyPanel.
2. Применить подстановку переменных: `{имя_покупателя}` → `customerName || "покупатель"`, `{название_товара}` → `wbCard.name || imtName || ""`.
3. Закрыть модалку.

Фильтрация на клиенте (простой `.filter`, не virtualization — <100 шаблонов):
```typescript
const visible = templates.filter(t =>
  t.name.toLowerCase().includes(q) ||
  t.text.toLowerCase().includes(q) ||
  (t.situationTag?.toLowerCase().includes(q))
)
const templatesForNmId = visible.filter(t => t.nmId === ticket.nmId)
const generalTemplates = visible.filter(t => !t.nmId || t.nmId !== ticket.nmId)
```

### Модалка «Обжаловать отзыв» (AppealModal)

Появляется в диалоге тикета канала FEEDBACK по клику кнопки «Обжаловать отзыв» (новая кнопка в ReplyPanel для FEEDBACK — рядом с «Выбрать шаблон»).

**Layout:**
```tsx
<Dialog>
  <DialogContent>
    <DialogTitle>Обжаловать отзыв</DialogTitle>

    {/* 1. Reason dropdown */}
    <select required value={reasonId} onChange={...}>
      <option value="">— Выберите причину —</option>
      {APPEAL_REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
    </select>

    {/* 2. Free text */}
    <textarea
      placeholder="Дополнительный комментарий (10-1000 символов)..."
      minLength={10}
      maxLength={1000}
      rows={4}
    />

    {/* 3. Инструкция */}
    <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm">
      <p className="font-medium">⚠ Важно</p>
      <p>API Wildberries для обжалования отключён с 08.12.2025. После сохранения:</p>
      <ol className="list-decimal pl-5 mt-1">
        <li>Откройте отзыв в ЛК Wildberries (Отзывы и вопросы → «Пожаловаться»).</li>
        <li>Укажите там ту же причину и текст (мы сохранили их в буфер обмена).</li>
        <li>Когда WB ответит — вернитесь сюда и обновите статус обжалования.</li>
      </ol>
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={() => copyToClipboard(freeText)}>
        Скопировать текст
      </Button>
      <Button onClick={onSubmit}>
        Сохранить и открыть отзыв в ЛК
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

`onSubmit`:
1. Call `createAppeal(ticketId, reasonId, freeText)` server action.
2. На success: `window.open("https://seller.wildberries.ru/community/reviews", "_blank")` + `toast.success("Обжалование создано. Обновите статус когда WB ответит в ЛК.")` + закрыть модалку + revalidatePath.

### Панель статуса обжалования (AppealStatusPanel)

Встраивается в `TicketSidePanel.tsx` условно: если `ticket.status === "APPEALED"` → показывается выше текущих status/assignee-блоков.

```tsx
{ticket.status === "APPEALED" && (
  <div className="rounded-md border bg-purple-50 dark:bg-purple-950 p-3 space-y-2">
    <h3 className="text-sm font-medium">Статус обжалования</h3>

    <select value={appealStatus} onChange={...}>
      <option value="PENDING">🕐 Ожидает решения WB</option>
      <option value="APPROVED">✅ Одобрено WB</option>
      <option value="REJECTED">❌ Отклонено WB</option>
    </select>

    <textarea
      placeholder="Заметка о решении WB..."
      value={wbDecisionNote}
      onChange={...}
      rows={2}
    />

    <div className="text-xs text-muted-foreground">
      Создано: {formatDate(appealedAt)}
      {appealResolvedAt && <> · Решено: {formatDate(appealResolvedAt)}</>}
    </div>
  </div>
)}
```

При смене `appealStatus`:
- Немедленный `updateAppealStatus(ticketId, nextStatus, wbDecisionNote)` server action.
- Server action: upsert `AppealRecord.status` + `ticket.update({appealStatus, appealResolvedAt: (status !== PENDING ? now : null)})`.

### Индикатор обжалования в ленте и карточке (SUP-31)

В `SupportTicketCard.tsx` (Phase 8) — рядом с иконкой канала добавляем небольшой бейдж:

```tsx
{ticket.appealStatus && (
  <Badge variant={appealBadgeVariant(ticket.appealStatus)}>
    {appealBadgeIcon(ticket.appealStatus)} {appealBadgeLabel(ticket.appealStatus)}
  </Badge>
)}
```

Варианты:
- `PENDING` → 🕐 "Обжалование" — `variant="outline"` (нейтральный)
- `APPROVED` → ✅ "Обжалование одобрено" — `variant="default"` с зелёным цветом
- `REJECTED` → ❌ "Отклонено WB" — `variant="destructive"`

В фильтрах `/support` (SupportFilters.tsx) добавить MultiSelectDropdown "Обжалование" со значениями: Все / Нет / PENDING / APPROVED / REJECTED.

### RBAC

- `/support/templates` read: `requireSection("SUPPORT")`
- `/support/templates/new`, `/[id]/edit`: `requireSection("SUPPORT", "MANAGE")`
- CRUD server actions (`createTemplate`, `updateTemplate`, `deleteTemplate`, `toggleTemplateActive`): `requireSection("SUPPORT", "MANAGE")`
- TemplatePickerModal render (в ReplyPanel): `requireSection("SUPPORT")` (уже проверено в RSC родителе)
- `createAppeal`, `updateAppealStatus`: `requireSection("SUPPORT", "MANAGE")`

## Template Variables

Подстановка выполняется **на клиенте при выборе шаблона** (в `TemplatePickerModal.onPick`), до submit. Server actions работают с финальным текстом (уже подставленным).

```typescript
// lib/template-variables.ts
export function applyTemplateVariables(
  text: string,
  vars: { customerName?: string | null; productName?: string | null }
): string {
  return text
    .replace(/\{имя_покупателя\}/g, vars.customerName?.trim() || "покупатель")
    .replace(/\{название_товара\}/g, vars.productName?.trim() || "")
}
```

**Источники переменных в текущем тикете:**
- `customerName`:
  - для FEEDBACK/QUESTION — нет в WB API ответе (анонимный покупатель, подтверждено Phase 8 research). Fallback → `"покупатель"`.
  - для CHAT (Phase 10) — `ticket.customerNameSnapshot` (будет добавлено в Phase 10, ещё не реализовано — обсудить координацию с Phase 10 плана).
- `productName`:
  - `ticket.nmId` → JOIN с `WbCard` → `WbCard.name`.
  - Fallback → `productDetails.productName` (денормализованное, если тикет имеет snapshot — нужно добавить поле в Phase 11? Обсудить). На данный момент — пусто если нет WbCard.

**⚠ Синхронизация с Phase 10:** AutoReplyConfig.messageText (Phase 10) использует те же переменные. Utility `applyTemplateVariables` должна быть shared (переиспользуемая из `lib/auto-reply.ts` если Phase 10 её экспортирует, или новая shared `lib/template-variables.ts` — решит планировщик).

## State Machine

### AppealStatus (локальный, без WB)

```
┌───────────────┐
│  (no appeal)  │  — тикет в любом status, appealRecord = null
└───────┬───────┘
        │ createAppeal() — кнопка «Обжаловать» в модалке
        ▼
┌───────────────┐
│   PENDING     │  — AppealRecord создан, ticket.status=APPEALED, appealedAt=now
└───┬───────┬───┘
    │       │
    │       │ updateAppealStatus("REJECTED")
    │       ▼
    │   ┌───────────────┐
    │   │   REJECTED    │  — ticket.status остаётся APPEALED, appealResolvedAt=now
    │   └───────────────┘
    │
    │ updateAppealStatus("APPROVED")
    ▼
┌───────────────┐
│   APPROVED    │  — ticket.status остаётся APPEALED, appealResolvedAt=now
└───────────────┘
```

**Переходы:**
- `(none) → PENDING` через `createAppeal` — требует `ticket.status !== "APPEALED"` (guard).
- `PENDING → APPROVED | REJECTED` через `updateAppealStatus` — требует `ticket.status === "APPEALED"`.
- `APPROVED | REJECTED → PENDING` — **разрешаем** (менеджер ошибся и хочет вернуть PENDING). Сбрасывает `appealResolvedAt = null`, `wbDecisionNote` сохраняется как история (или очищается — обсудить).
- `APPROVED ↔ REJECTED` — **разрешаем** напрямую (менеджер исправил ошибку без возврата в PENDING).
- Финал? Нет финального состояния — менеджер может в любой момент переключить. Но после закрытия тикета (`ticket.status=CLOSED`) dropdown заблокирован.

**Взаимодействие с TicketStatus:**
- `createAppeal` ставит `ticket.status = "APPEALED"` (перезаписывает предыдущее значение — IN_PROGRESS/ANSWERED/whatever).
- `updateAppealStatus` **не меняет** `ticket.status` — тикет остаётся APPEALED до ручного CLOSE менеджером.
- Ручная смена `ticket.status` через `updateTicketStatus` в TicketSidePanel запрещена для APPEALED (существующая логика `MANUAL_STATUSES` уже исключает APPEALED). Чтобы закрыть APPEALED тикет — нужно кнопка «Закрыть» (paттерн: добавить `closeAppealedTicket(ticketId)` action).

**Guard логика в `createAppeal`:**
```typescript
if (ticket.status === "APPEALED") return { ok: false, error: "Уже обжалован" }
if (ticket.channel !== "FEEDBACK") return { ok: false, error: "Обжаловать можно только отзывы" }
if (existing AppealRecord for ticketId) return { ok: false, error: "Обжалование уже создано" }
```

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | `vitest.config.ts` (корень проекта) |
| Alias | `@` → корень проекта |
| Quick run command | `npm run test` |
| Full suite command | `npm run test -- --run` |

**Существующие тесты (20 файлов после Phase 10):** unit тесты в `tests/*.test.ts`. Новые Phase 11 тесты продолжают паттерн.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUP-26 | `createTemplate` валидирует name/text/channel, upsert в БД | unit (Prisma mock) | `npm run test tests/templates-actions.test.ts -t "createTemplate"` | ❌ Wave 0 |
| SUP-26 | `updateTemplate` сохраняет updatedById/updatedAt | unit | `npm run test tests/templates-actions.test.ts -t "updateTemplate"` | ❌ Wave 0 |
| SUP-26 | `deleteTemplate` soft-delete через isActive=false | unit | `npm run test tests/templates-actions.test.ts -t "delete"` | ❌ Wave 0 |
| SUP-26 | Zod схема отклоняет channel=RETURN/MESSENGER | unit | `npm run test tests/templates-schema.test.ts` | ❌ Wave 0 |
| SUP-28 | `applyTemplateVariables` подставляет {имя_покупателя} с fallback на "покупатель" | unit (pure) | `npm run test tests/template-variables.test.ts` | ❌ Wave 0 |
| SUP-28 | `applyTemplateVariables` подставляет {название_товара} с fallback на "" | unit (pure) | `npm run test tests/template-variables.test.ts` | ❌ Wave 0 |
| SUP-28 | Фильтрация/группировка шаблонов в picker: first by nmId, then general | unit | `npm run test tests/template-picker.test.ts` | ❌ Wave 0 |
| SUP-29 | `createAppeal` отклоняет duplicate (ticket уже APPEALED) | unit | `npm run test tests/appeals-actions.test.ts -t "duplicate"` | ❌ Wave 0 |
| SUP-29 | `createAppeal` отклоняет не-FEEDBACK каналы | unit | `npm run test tests/appeals-actions.test.ts -t "channel"` | ❌ Wave 0 |
| SUP-29 | `createAppeal` валидирует freeText 10-1000 символов | unit | `npm run test tests/appeals-actions.test.ts -t "freeText"` | ❌ Wave 0 |
| SUP-29 | `createAppeal` в транзакции обновляет ticket.status + создаёт AppealRecord | unit (transaction mock) | `npm run test tests/appeals-actions.test.ts -t "transaction"` | ❌ Wave 0 |
| SUP-31 | State machine `updateAppealStatus` все переходы разрешены (включая откаты) | unit | `npm run test tests/appeals-state-machine.test.ts` | ❌ Wave 0 |
| SUP-31 | `updateAppealStatus` проставляет appealResolvedAt при non-PENDING | unit | `npm run test tests/appeals-actions.test.ts -t "resolvedAt"` | ❌ Wave 0 |
| SUP-26 | Миграция `templates_appeals` создаёт обе модели и обновляет SupportTicket | manual UAT | `npx prisma migrate dev && npx prisma validate` | — |
| SUP-28 | Модалка выбора шаблона в реальном ReplyPanel — подстановка и отправка | manual UAT (human) | — | — |
| SUP-29 | Модалка обжалования — открытие, сохранение, переход в APPEALED | manual UAT (human) | — | — |

### Sampling Rate

- **Per task commit:** `npm run test` (полный vitest, ~10-15 сек)
- **Per wave merge:** `npm run test -- --run`
- **Phase gate:** все unit-тесты GREEN + human UAT checklist (CRUD шаблонов + picker в реальном ReplyPanel + модалка обжалования + смена статуса обжалования через TicketSidePanel)

### Wave 0 Gaps

- [ ] `tests/templates-actions.test.ts` — unit на createTemplate/updateTemplate/deleteTemplate/toggleActive (Prisma mock, $transaction mock)
- [ ] `tests/templates-schema.test.ts` — Zod валидация channel/name/text/nmId
- [ ] `tests/template-variables.test.ts` — pure function applyTemplateVariables с edge cases (null/пустая строка/unicode)
- [ ] `tests/template-picker.test.ts` — логика группировки/фильтрации/сортировки
- [ ] `tests/appeals-actions.test.ts` — createAppeal/updateAppealStatus с transaction mock
- [ ] `tests/appeals-state-machine.test.ts` — все переходы state machine
- [ ] Framework install: vitest уже установлен (Phase 7+), дополнительно ничего не нужно
- [ ] Fixture: нет — нет external API в Phase 11

## Environment Availability

Phase 11 не требует новых внешних зависимостей — все операции локальные.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Все | ✓ | 24.14.0 | — |
| PostgreSQL (локально) | Prisma migrate dev | ✗ | — | Миграция на VPS при deploy (паттерн Phase 1/7/8/9) |
| vitest | Тесты | ✓ | 4.1.4 | — |
| Prisma | ORM | ✓ | 6.19.x | — |
| WB API token | **НЕ ТРЕБУЕТСЯ** (templates/appeals API отключены) | — | — | — |
| CRON_SECRET | **НЕ ТРЕБУЕТСЯ** (нет нового cron'a) | — | — | — |

**Missing dependencies with no fallback:** Нет.

**Missing dependencies with fallback:**
- PostgreSQL локально — миграция применится через deploy.sh на VPS (`npx prisma migrate deploy`).

## Runtime State Inventory

Phase 11 — greenfield (новые модели, новые поля), не rename/refactor. Раздел не применим.

- **Stored data:** None — новые таблицы создаются пустыми; новые поля в SupportTicket nullable.
- **Live service config:** None — WB API не вызывается, нет новых VPS cron задач.
- **OS-registered state:** None.
- **Secrets/env vars:** None — никаких новых токенов или CRON_SECRET.
- **Build artifacts:** None — стандартные Prisma client regenerate + Next.js build.

## Common Pitfalls

### Pitfall 1: Попытка реализовать WB API интеграцию вопреки research
**Что идёт не так:** Планировщик/исполнитель не прочитал research и реализует `publishTemplateToWb` с POST к `/api/v1/templates`.
**Почему:** API отключён WB'ом 2025-11-19 (templates) и 2025-12-08 (complaints). Любой запрос вернёт 404/410.
**Как избежать:** Зафиксировать в CONTEXT.md (после discuss-phase) явный отказ от WB sync и WB complaint API. В планах 11-XX писать: *«WB Templates/Appeals API отключены WB'ом — локальная реализация»*.
**Warning signs:** Server action пытается вызвать WB, получает 404, менеджер не понимает почему.

### Pitfall 2: Переименование существующих полей SupportTicket
**Что идёт не так:** Новый `appealId` отличается от существующего (в схеме Phase 8 уже есть `appealId: String?`).
**Почему:** Phase 8 проактивно заложил `appealStatus` и `appealId` в схему (строки 544-545 `schema.prisma`). Phase 11 их переиспользует.
**Как избежать:** НЕ добавлять новые поля `appealId` / `appealStatus` в миграцию Phase 11. Только новые поля `appealedAt`, `appealResolvedAt` + relation `appealRecord`.
**Warning signs:** Prisma ругается «field already exists».

### Pitfall 3: Использование несуществующего AppealRecord.appealId
**Что идёт не так:** Ticket.appealId должен указывать на `AppealRecord.id`, но в коде указывают на cuid из WB (которого нет).
**Почему:** WB не возвращает appealId. Всё локально.
**Как избежать:** `ticket.appealId = appealRecord.id` после `prisma.appealRecord.create(...)`. Это чисто локальный FK-like текстовый id.
**Warning signs:** Confusion между «наш id» и «WB id». В Phase 11 — только наш.

### Pitfall 4: Забытая подстановка переменных при копировании шаблона
**Что идёт не так:** Модалка выбора подставляет текст в textarea, но забывает применить `applyTemplateVariables` → менеджер отправляет «Привет, {имя_покупателя}!» буквально.
**Почему:** Shared utility не вызывается.
**Как избежать:** Вызывать `applyTemplateVariables(template.text, {customerName, productName})` до `setText(...)` в `onPick`. Unit-тест покрывает.
**Warning signs:** В WB появляется сообщение с плейсхолдерами — catastrophic UX.

### Pitfall 5: TypeScript narrowing на channel enum в Zod
**Что идёт не так:** `z.nativeEnum(TicketChannel)` пропускает RETURN/MESSENGER, а SUP-26 требует только FEEDBACK/QUESTION/CHAT.
**Почему:** nativeEnum = все значения enum; нужно ограничение через `z.enum([...])`.
**Как избежать:** `z.enum(["FEEDBACK", "QUESTION", "CHAT"] as const)` — ограничивает литералы. Prisma затем принимает это (совместимо, т.к. это подмножество).
**Warning signs:** Менеджер создаёт шаблон для канала RETURN, а в picker в диалоге RETURN нет textarea (только ReturnActionsPanel) — шаблон никогда не используется.

### Pitfall 6: Модалка обжалования блокирует форму при ошибке clipboard
**Что идёт не так:** `navigator.clipboard.writeText` throws в не-HTTPS контекстах (в dev `http://localhost:3001`).
**Почему:** Clipboard API требует secure context.
**Как избежать:** Обернуть copyToClipboard в try/catch с fallback на `document.execCommand("copy")` или просто `toast.warning("Скопируйте текст вручную")`. Не ломать основной поток сохранения обжалования.
**Warning signs:** Клик «Скопировать» — ошибка в консоли, модалка зависает.

### Pitfall 7: Race condition при одновременной смене appealStatus и ticket.status
**Что идёт не так:** Менеджер открыл тикет в двух вкладках — в одной меняет `appealStatus → APPROVED`, в другой — `ticket.status → CLOSED`. Конфликт при `updateAppealStatus` guard'e.
**Почему:** `updateAppealStatus` проверяет `ticket.status === "APPEALED"`, а вторая вкладка уже закрыла тикет.
**Как избежать:** В server action использовать `prisma.$transaction` + `ticket.findUniqueOrThrow({where: {id, status: "APPEALED"}})`. Если тикет закрыт — throw. UI показывает: «Тикет был закрыт — обновите страницу».
**Warning signs:** Inconsistent state в БД: `ticket.status = CLOSED` но `appealStatus = APPROVED` без resolvedAt.

### Pitfall 8: Имя шаблона с emoji ломает @@unique
**Что идёт не так:** Менеджер создаёт шаблон «Спасибо 🙏» и «Спасибо 🙌» — оба записываются, но при экспорте JSON + импорт на другой ERP возникает collation collision.
**Почему:** PostgreSQL @unique по default без CITEXT учитывает emoji byte-by-byte, но некоторые emoji нормализуются разными unicode-sequences.
**Как избежать:** Ограничить Zod на ASCII+Cyrillic + цифры + базовые пунктуации (regex `^[\w\sа-яА-ЯёЁ,.!?—-]+$` или аналог). Либо принять: emoji в names — OK, unique работает, unit-тест покрывает.
**Warning signs:** Import JSON падает с unique violation на вроде бы разных именах.

### Pitfall 9: Неэкспортированные relations в User крашат Prisma generate
**Что идёт не так:** Добавили `appealsCreated: AppealRecord[] @relation("AppealCreator")` в AppealRecord, но забыли обратный relation в User.
**Почему:** Prisma требует bi-directional named relations.
**Как избежать:** В той же миграции — 4 новых relation в User (TemplateCreator, TemplateUpdater, AppealCreator, AppealResolver). Prisma schema выведет validation error — читать его внимательно.
**Warning signs:** `prisma migrate dev` падает с «relation X missing on User».

## Code Examples

### `app/actions/templates.ts` (новый файл)

```typescript
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { auth } from "@/lib/auth"
import { z } from "zod"

const templateSchema = z.object({
  name: z.string().min(2).max(80),
  text: z.string().min(1).max(5000),
  channel: z.enum(["FEEDBACK", "QUESTION", "CHAT"] as const),
  situationTag: z.string().max(60).nullable().optional(),
  nmId: z.coerce.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
})

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

export async function createTemplate(
  input: z.input<typeof templateSchema>
): Promise<ActionResult> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const session = await auth()
    const userId = session?.user?.id ?? null
    const data = templateSchema.parse(input)
    const created = await prisma.responseTemplate.create({
      data: {
        ...data,
        createdById: userId,
        updatedById: userId,
      },
    })
    revalidatePath("/support/templates")
    return { ok: true, id: created.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ошибка" }
  }
}

// ... updateTemplate, deleteTemplate (soft via isActive=false), toggleTemplateActive
```

### `app/actions/appeals.ts` (новый файл)

```typescript
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { auth } from "@/lib/auth"
import { APPEAL_REASONS } from "@/lib/appeal-reasons"
import { z } from "zod"

const createAppealSchema = z.object({
  ticketId: z.string().cuid(),
  reasonId: z.enum(APPEAL_REASONS.map(r => r.id) as [string, ...string[]]),
  freeText: z.string().min(10).max(1000),
})

export async function createAppeal(
  input: z.input<typeof createAppealSchema>
): Promise<ActionResult> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return { ok: false, error: "Сессия без user.id" }

    const data = createAppealSchema.parse(input)

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: data.ticketId },
      select: { id: true, channel: true, status: true, appealRecord: { select: { id: true } } },
    })
    if (!ticket) return { ok: false, error: "Тикет не найден" }
    if (ticket.channel !== "FEEDBACK") return { ok: false, error: "Обжаловать можно только отзывы" }
    if (ticket.appealRecord) return { ok: false, error: "Обжалование уже создано" }
    if (ticket.status === "APPEALED") return { ok: false, error: "Тикет уже обжалован" }

    const reasonMeta = APPEAL_REASONS.find(r => r.id === data.reasonId)!
    const now = new Date()

    const [record] = await prisma.$transaction([
      prisma.appealRecord.create({
        data: {
          ticketId: ticket.id,
          reasonId: data.reasonId,
          reasonLabel: reasonMeta.label,
          freeText: data.freeText,
          status: "PENDING",
          createdById: userId,
        },
      }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: "APPEALED",
          appealStatus: "PENDING",
          appealedAt: now,
          // appealId обновим вторым update'ом после транзакции (не знаем record.id в create)
        },
      }),
    ])

    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { appealId: record.id },
    })

    revalidatePath("/support")
    revalidatePath(`/support/${ticket.id}`)
    return { ok: true, id: record.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ошибка" }
  }
}

// ... updateAppealStatus (PENDING → APPROVED/REJECTED с wbDecisionNote)
```

### `lib/template-variables.ts`

```typescript
/**
 * Подставляет переменные {имя_покупателя} и {название_товара} в текст шаблона.
 * Вызывается на клиенте перед записью в textarea (паттерн консистентен с
 * AutoReplyConfig.messageText в Phase 10).
 */
export function applyTemplateVariables(
  text: string,
  vars: { customerName?: string | null; productName?: string | null }
): string {
  const customer = vars.customerName?.trim() || "покупатель"
  const product = vars.productName?.trim() || ""
  return text
    .replace(/\{имя_покупателя\}/g, customer)
    .replace(/\{название_товара\}/g, product)
}
```

### Verified pattern: TemplatePickerModal integration в ReplyPanel

```tsx
// components/support/ReplyPanel.tsx (расширение)
"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Send, FileText, Flag } from "lucide-react"
import { toast } from "sonner"
import { replyToTicket } from "@/app/actions/support"
import { TemplatePickerModal } from "./templates/TemplatePickerModal"
import { AppealModal } from "./templates/AppealModal"
import { applyTemplateVariables } from "@/lib/template-variables"

export function ReplyPanel({
  ticketId,
  ticketNmId,
  ticketChannel,
  customerName,
  productName,
  disabled,
}: {
  ticketId: string
  ticketNmId: number | null
  ticketChannel: "FEEDBACK" | "QUESTION"
  customerName: string | null
  productName: string | null
  disabled?: boolean
}) {
  const [text, setText] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [appealOpen, setAppealOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onTemplatePick(template: { text: string }) {
    const applied = applyTemplateVariables(template.text, { customerName, productName })
    setText(applied)
    setPickerOpen(false)
  }

  function onSubmit() {
    const trimmed = text.trim()
    if (!trimmed) { toast.error("Пустой ответ"); return }
    startTransition(async () => {
      const res = await replyToTicket(ticketId, trimmed)
      if (res.ok) { toast.success("Ответ отправлен"); setText("") }
      else toast.error(res.error)
    })
  }

  return (
    <div className="sticky bottom-0 bg-white dark:bg-neutral-900 border-t p-3 flex items-end gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Введите ответ..."
        disabled={disabled || isPending}
        rows={3}
        className="flex-1 rounded-md border bg-transparent p-2 text-sm resize-none"
      />
      <div className="flex flex-col gap-1">
        <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} disabled={disabled}>
          <FileText className="h-4 w-4 mr-1" /> Шаблон
        </Button>
        {ticketChannel === "FEEDBACK" && (
          <Button size="sm" variant="outline" onClick={() => setAppealOpen(true)} disabled={disabled}>
            <Flag className="h-4 w-4 mr-1" /> Обжаловать
          </Button>
        )}
        <Button onClick={onSubmit} disabled={disabled || isPending || !text.trim()} size="sm">
          <Send className="h-4 w-4 mr-1" />
          {isPending ? "..." : "Отправить"}
        </Button>
      </div>

      <TemplatePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        ticketNmId={ticketNmId}
        channel={ticketChannel}
        onPick={onTemplatePick}
      />
      <AppealModal
        open={appealOpen}
        onOpenChange={setAppealOpen}
        ticketId={ticketId}
      />
    </div>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact on Phase 11 |
|--------------|------------------|--------------|---------------------|
| `GET/POST/PATCH/DELETE /api/v1/templates` | Отключено WB'ом | **2025-11-19** | SUP-27 WB sync невозможен — реализуем локально |
| `POST /api/v1/feedbacks/actions` + `GET /api/v1/supplier-valuations` | Отключено WB'ом | **2025-12-08** | SUP-29/30 WB обжалование невозможно — hybrid manual |
| PRD путь `POST /api/v1/feedbacks/report` | Никогда не существовал | — | PRD / REQUIREMENTS.md содержит неправильный URL (правильный был `/feedbacks/actions`, теперь отключён) |
| WB `valuation` field в feedbacks response (средний рейтинг) | Удалён из ответа | **2025-12-11** | Не влияет на Phase 11, но планировщик должен знать (для Phase 13 статистики) |
| Rate limit Feedbacks/Questions ~10 req/sec | Уточнено: **3 запроса / 30 секунд** | 2025 actual | Не влияет на Phase 11 (нет вызовов WB), но обновить в Phase 8 research при ре-синхе |

**Deprecated/outdated:**
- REQUIREMENTS.md SUP-27 упоминание «GET list / POST publish / PUT update / DELETE delete» в WB — полностью неактуально.
- REQUIREMENTS.md SUP-29 упоминание `POST /api/v1/feedbacks/report` — неверный URL + отключённый метод.
- REQUIREMENTS.md SUP-30 cron поллинг через `GET /api/v1/feedbacks/report/{appealId}` — endpoint никогда не существовал (confirmed форум 1887).

## Open Questions / Risks

### 1. Точный список WB причин жалоб на отзыв
**Что мы знаем:** Причины подаются через UI `seller.wildberries.ru/community/reviews` → «Пожаловаться на отзыв» → выпадающий список. Research собрал 8 вероятных причин (см. [Appeal Reasons](#appeal-reasons)) из статей mpstats.io, vc.ru, mneniya.pro.
**Что неясно:** Точные лейблы WB UI, порядок, возможные изменения после 2025-12 (когда API удалили).
**Рекомендация:** Wave 0 задача — **попросить пользователя сделать скриншот UI жалобы WB** и зафиксировать 1-в-1 список в `lib/appeal-reasons.ts`. Если user не хочет тратить время — оставить research-версию и позже поправить reactively.

### 2. Координация `customerName` между Phase 10 и Phase 11
**Что мы знаем:** Phase 10 research предлагает `SupportTicket.customerNameSnapshot: String?` для CHAT канала. Phase 11 TemplatePicker использует `customerName` в подстановке переменных.
**Что неясно:** Phase 10 ещё не реализован (в `Planned` по ROADMAP). Phase 11 пойдёт параллельно или после?
**Рекомендация:** Зависимость Phase 11 на Phase 10 уже зафиксирована в ROADMAP (*«Depends on: Phase 8, Phase 10»*). Планировщик Phase 11 должен убедиться что Plan 10-01 (миграция с `customerNameSnapshot`) выполнен до Plan 11-03 (TemplatePicker в ChatReplyPanel).
**Fallback:** Если Phase 10 задержится — Phase 11-03 реализует picker только для FEEDBACK/QUESTION (ReplyPanel), CHAT picker добавится после Phase 10.

### 3. Возвращение WB API templates/appeals
**Что мы знаем:** WB пишет «temporarily removing» — значит может вернуть. Сроков нет.
**Что неясно:** Когда и в каком формате.
**Рекомендация:** Дизайн локальной схемы совместим с ad-hoc добавлением `wbTemplateId: String?` (nullable) и `wbAppealId: String?` в будущем. Не блокировать Phase 11 — реализовывать локально.

### 4. Alternative AppealStatus enum
**Что мы знаем:** Существующий `AppealStatus { NONE, PENDING, APPROVED, REJECTED }` (prisma/schema.prisma:500-505) — включает NONE, которое Phase 11 не использует (отсутствие AppealRecord = нет обжалования).
**Что неясно:** Стоит ли удалять NONE или оставить.
**Рекомендация:** Оставить NONE в enum как legacy (можно пометить `// NONE: не используется с Phase 11, оставлено для совместимости` в комментарии). Удаление enum-значения = миграция с риском data loss, не стоит.

### 5. Export/Import JSON шаблонов
**Что мы знаем:** SUP-27 планировал WB sync, невозможно. Export/Import может заменить.
**Что неясно:** Нужно ли пользователю.
**Рекомендация:** Спросить в discuss-phase: (a) реализовать в Phase 11, (b) deferred в будущий milestone, (c) не нужно (одна инсталляция ERP, шаблоны создаются в UI).

### 6. Ссылка на отзыв в ЛК WB из AppealModal
**Что мы знаем:** Модалка обжалования показывает ссылку `https://seller.wildberries.ru/community/reviews`. Это список всех отзывов — менеджеру придётся найти нужный.
**Что неясно:** Существует ли deep-link `https://seller.wildberries.ru/community/reviews/{feedbackId}` или аналогичный? Могут ли параметры query помочь.
**Рекомендация:** Wave 0 задача — проверить, открывается ли `https://seller.wildberries.ru/community/reviews?search=${feedbackId}` или `...feedbackId=X`. Если да — использовать deep-link, улучшение UX. Если нет — общая ссылка + копирование текста в буфер.

### 7. Permissions для удаления шаблонов
**Что мы знаем:** SUP-26 говорит CRUD, включая delete.
**Что неясно:** Hard delete или soft (через isActive=false)? В схеме предлагается soft + история createdBy.
**Рекомендация:** Soft delete (toggleTemplateActive) — безопаснее для исторических данных. Hard delete через отдельную кнопку «Удалить навсегда» для суперадмина (аналогично Product в Phase 4). Обсудить в discuss-phase.

## Plan Slicing Recommendation

**4 плана + Wave 0, по аналогии Phase 9/10:**

### Wave 0 (pre-plan, включается в 11-01)

- Проверить, есть ли deep-link на отзыв в ЛК WB (или использовать общую ссылку).
- Получить от пользователя точный список WB appeal reasons (скриншот или подтверждение research-версии).
- Создать 6 RED test stubs (см. [Wave 0 Gaps](#wave-0-gaps)).
- **Blocker check:** подтвердить с пользователем отказ от WB sync/appeals API (решение на основе research findings).

### Plan 11-01 — Foundation: Prisma + Reasons + Test Stubs

**Task 1:** Prisma миграция `templates_appeals`:
- Новая model `ResponseTemplate` (с @@unique(name), 4 indexes)
- Новая model `AppealRecord` (с @@unique(ticketId), 2 indexes)
- 2 новых поля в `SupportTicket`: `appealedAt`, `appealResolvedAt`
- 4 новых named relations в `User`: TemplateCreator, TemplateUpdater, AppealCreator, AppealResolver
- Back-relation `SupportTicket.appealRecord`

**Task 2:** `lib/appeal-reasons.ts` — статичный справочник 8 причин + типы.

**Task 3:** `lib/template-variables.ts` — pure function `applyTemplateVariables` + unit-тесты GREEN (TDD).

**Task 4:** Wave 0 RED stubs в `tests/*.test.ts` (6 файлов, failing tests).

**Deliverable:** миграция создана (в `prisma/migrations/`), `prisma validate` зелёный, 1 unit-тест (template-variables) GREEN, 6 RED stubs для последующих планов.

### Plan 11-02 — Templates CRUD Server Actions + Export/Import (опционально)

**Task 1:** `app/actions/templates.ts` — 4 server actions:
- `createTemplate(input)` с Zod валидацией
- `updateTemplate(id, input)`
- `toggleTemplateActive(id, isActive)` — soft-disable
- `deleteTemplate(id)` — hard delete (только superadmin?)

**Task 2:** Тесты `tests/templates-actions.test.ts` + `tests/templates-schema.test.ts` → GREEN.

**Task 3 (опционально):** Export/Import JSON:
- `GET /api/templates/export` — downloads JSON с active templates
- `POST /api/templates/import` — принимает JSON (multipart или body), upsert по name

**Deliverable:** 4 server actions покрыты unit-тестами, RED stubs → GREEN, compilation OK.

### Plan 11-03 — UI Templates + Picker

**Task 1:** Страница `/support/templates`:
- RSC `page.tsx` с `requireSection("SUPPORT")` + data fetch
- `TemplatesTable.tsx` client — таблица с колонками + inline действия
- `TemplatesFilters.tsx` client — MultiSelectDropdown (channel/isActive/situationTag/nmId)

**Task 2:** Create/Edit pages:
- `app/(dashboard)/support/templates/new/page.tsx` + `[id]/edit/page.tsx`
- `TemplateForm.tsx` client — react-hook-form + zodResolver + hint про переменные

**Task 3:** `TemplatePickerModal.tsx` client:
- shadcn `Dialog` wrapper
- Нативный input поиска
- Группировка: for-nmId + general
- `onPick` → `applyTemplateVariables` → callback
- Unit-тест `tests/template-picker.test.ts` → GREEN

**Task 4:** Интеграция picker в `ReplyPanel.tsx`:
- Новая кнопка «Шаблон» (Lucide FileText icon)
- State `pickerOpen`, `onTemplatePick(template)` → setText
- Prop drilling: `ticketNmId`, `customerName`, `productName` из родителя

**Task 5:** Sidebar пункт «Шаблоны» под «Служба поддержки» (обновление `components/layout/nav-items.ts`).

**Deliverable:** `/support/templates` функциональный CRUD + picker в ReplyPanel работает (human UAT checkpoint).

### Plan 11-04 — Appeals + Indicator + UAT

**Task 1:** `app/actions/appeals.ts` — 2 server actions:
- `createAppeal(ticketId, reasonId, freeText)` — с транзакцией
- `updateAppealStatus(ticketId, status, wbDecisionNote?)` — state machine переходы

**Task 2:** Unit-тесты `tests/appeals-actions.test.ts` + `tests/appeals-state-machine.test.ts` → GREEN.

**Task 3:** `AppealModal.tsx` client — форма с reason dropdown + freeText + инструкцией + «Скопировать + открыть ЛК».

**Task 4:** Интеграция в `ReplyPanel.tsx` (для FEEDBACK):
- Кнопка «Обжаловать» (Lucide Flag icon) справа от «Шаблон»
- Условный render: только для `channel === "FEEDBACK"`

**Task 5:** `AppealStatusPanel.tsx` — встраивается в `TicketSidePanel` для APPEALED тикетов:
- Dropdown статус с emoji
- Textarea wbDecisionNote
- onChange → `updateAppealStatus` action

**Task 6:** Индикатор обжалования в `SupportTicketCard` (Phase 8 lib) и фильтр «Обжалование» в `SupportFilters.tsx`.

**Task 7:** Human UAT checkpoint:
- Создать 5 шаблонов через `/support/templates` (3 FEEDBACK + 2 QUESTION)
- Подобрать шаблон в picker, применить с переменными
- Обжаловать отзыв → открыть ссылку на ЛК → переключить статус через 10 мин (симуляция ответа WB)
- Проверить индикатор в ленте (PENDING → APPROVED → REJECTED)
- Проверить фильтр «Обжалование» в /support

**Deliverable:** полный CRUD шаблонов + workflow обжалования + индикаторы + UAT signed off.

**НЕТ отдельного плана для cron / WB sync** — оба исключены по research findings.

## Sources

### Primary (HIGH confidence) — WB API status
- [WB API Updates Digest November 2025 (news/161)](https://dev.wildberries.ru/en/news/161) — официальное уведомление об отключении templates (2025-11-19) и complaints (2025-12-08)
- [WB API Customer Communication (news/278)](https://dev.wildberries.ru/en/news/278) — текущий список доступных методов user-communication
- [WB API Documentation - User Communication](https://dev.wildberries.ru/en/openapi/user-communication) — текущие endpoints без templates/complaints
- [WB API October 2025 Digest (news/154)](https://dev.wildberries.ru/en/news/154) — подтверждение отключения templates с 2025-11-19
- [eslazarev/wildberries-sdk](https://github.com/eslazarev/wildberries-sdk) — auto-generated SDK, подтверждает отсутствие template/complaint методов в текущей спеке
- [Форум dev.wildberries.ru/forum/topics/1887](https://dev.wildberries.ru/en/forum/topics/1887) — подтверждение, что GET-поллинг статуса жалобы никогда не поддерживался

### Primary (HIGH confidence) — существующие паттерны проекта
- `prisma/schema.prisma:400-643` — существующие модели SupportTicket/Message/Media/ReturnDecision и enums (AppealStatus, TicketStatus, TicketChannel)
- `lib/wb-support-api.ts` — паттерн callApi + callWb + callReturnsApi (не нужен в Phase 11, но показывает, как добавлять новые API)
- `app/actions/support.ts` — паттерн server action с requireSection + try/catch + revalidatePath (11 существующих экшенов)
- `components/support/ReplyPanel.tsx` — точка интеграции для кнопок «Шаблон» и «Обжаловать»
- `components/support/TicketSidePanel.tsx` — точка интеграции для AppealStatusPanel
- `.planning/phases/08-support-mvp/08-RESEARCH.md` — Phase 8 research (схема + паттерны)
- `.planning/phases/09-returns/09-RESEARCH.md` — Phase 9 research (SupportTicket extensions pattern)
- `.planning/phases/10-chat-autoreply/10-RESEARCH.md` — Phase 10 research (customerNameSnapshot + template variables в AutoReplyConfig)

### Secondary (MEDIUM confidence) — Appeal reasons
- [mpstats.io/media/wildberries](https://mpstats.io/media/wildberries/cards/otvety-na-otzyvy-i-voprosy) — обзор UI жалоб в ЛК
- [vc.ru автоответы на отзывы](https://vc.ru/id93158/932919-10-servisov-dlya-avtomatizacii-otvetov-na-otzyvy-dlya-wildberries-i-ozon) — описание UI кабинета
- [mneniya.pro wildberries-reviews](https://mneniya.pro/wildberries-reviews/) — список типичных причин обжалования
- [seller.wildberries.ru instructions customer-reviews](https://seller.wildberries.ru/instructions/ru/ru/material/customer-reviews) — официальная WB инструкция для продавцов

### Tertiary (LOW confidence) — deep research for open questions
- [WB API FAQ](https://dev.wildberries.ru/en/faq) — общая информация, не специфика
- [GitHub Dakword/WBSeller](https://github.com/Dakword/WBSeller) — старая PHP SDK, уже устарела для templates/complaints

## Metadata

**Confidence breakdown:**
- WB API status (templates/appeals отключены) — HIGH (3 независимых источника: dev.wildberries.ru digest, SDK, документация)
- Data model proposal — HIGH (переиспользование проверенных паттернов Phase 8/9/10)
- Appeal reasons list — MEDIUM (собрано из public sources, точный WB UI не проверен)
- Plan slicing — HIGH (прямая аналогия Phase 9/10)
- Template picker UX — MEDIUM (pattern установлен, но первая его реализация в проекте)

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 дней для API status; если WB возобновит templates/appeals, обновить)

**Key breakthrough finding:** WB официально отключил оба API endpoint'а Phase 11 (templates 2025-11-19, complaints 2025-12-08). Это переворачивает scope фазы от «интеграция с WB» к «локальная ERP-фича с ручным workflow». CRITICAL для planner — не планировать WB sync / WB complaint workflow.

---

## RESEARCH COMPLETE
