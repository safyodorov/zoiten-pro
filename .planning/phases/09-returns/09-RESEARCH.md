# Phase 9: Возвраты — Research

**Researched:** 2026-04-17
**Domain:** WB Buyers Returns API (Claims), расширение модели SupportTicket+новая ReturnDecision, state machine PENDING→APPROVED|REJECTED→APPROVED, UI таблицы + actions-панель в диалоге тикета канала RETURN
**Confidence:** HIGH (endpoint, query-params, body схемы и пример ответа получены из официальной документации WB, зеркалированной в DragonSigh/wildberries-api-docs); MEDIUM (точное семантическое значение `status` / `status_ex` integer codes — в публичной документации WB только пример `status=2, status_ex=8`, полного enum-маппинга нет); HIGH (все проектные паттерны перенесены из Phase 8 as-is).

## Executive Summary

Phase 9 надстраивается над Phase 8: модели `SupportTicket / SupportMessage / SupportMedia` уже умеют канал `RETURN`, нужно (1) добавить WB Claims API клиент в существующий `lib/wb-support-api.ts`, (2) расширить `lib/support-sync.ts` чтобы синхронизировать возвраты, (3) создать новую модель `ReturnDecision` для истории решений и логики «пересмотрено», (4) создать страницу `/support/returns` с таблицей заявок, (5) добавить action-панель (Одобрить/Отклонить/Пересмотреть) в существующий диалог `/support/[ticketId]` когда канал RETURN.

**Критические находки research:**

1. **Base URL другой** — не `feedbacks-api.wildberries.ru`, а `https://returns-api.wildberries.ru`. Существующий хелпер `callWb()` в `lib/wb-support-api.ts` хардкодит base URL — его нужно рефакторить под две базы либо создать второй хелпер.
2. **Token scope другой** — bit **11** (Buyers Returns), а не bit 5 (Feedbacks). На VPS нужно проверить/регенерировать `WB_API_TOKEN` со включённым bit 11 — это блокер, который необходимо валидировать ДО разработки.
3. **ID заявки — UUID v4** (`fe3e9337-e9f9-423c-8930-946a8ebef80`), а НЕ 20-символьный cuid-like string как у feedbacks/questions. Для `SupportTicket.wbExternalId: String?` тип совместим (уже String), но composite unique `@@unique([channel, wbExternalId])` покрывает оба формата.
4. **«Пересмотреть» — не отдельное API-действие**, а повторный вызов `PATCH /api/v1/claim` с `action` из обновлённого `actions[]` массива (после первого rejectcustom WB, видимо, снова возвращает approve1 в `actions[]`). Подтвердить на проде при первом реальном `rejectcustom`. Резервный план: хранить `reconsidered=true` локально и отправлять `approve1` ещё раз.
5. **`is_archive` query-параметр обязательный** и определяет «под рассмотрением» (`false`) vs «в архиве» (`true`). Для синхронизации в Phase 9 забираем обе страницы.
6. **Окно выдачи — последние 14 дней**. API не возвращает заявки старше 14 дней — это жёсткий бизнес-лимит WB. Cron каждые 15 минут покроет все актуальные заявки; архив тикетов старше 14 дней останется в БД как исторический след.
7. **Rate-limit отличается от Feedbacks/Questions:** 20 запросов/мин, burst 10, интервал 3 сек. В 20 req/min запас приличный — медленная cron-частота не нужна.
8. **Фото и видео в отзывах — массивы URL** (`photos[]`, `video_paths[]`), НО URL без схемы (`//photos.wbstatic.net/...`). Перед `fetch` необходимо добавить `https:` префикс (в Phase 8 такой проблемы не было — feedbacks-api возвращает абсолютные URL).
9. **422 для Feedbacks/Questions sync всё ещё работает** — reply endpoint для канала RETURN **не существует**: возврат закрывается только через Claims API; кнопка «Отправить ответ» в диалоге RETURN должна быть скрыта (уже корректно по `canReply = channel === FEEDBACK | QUESTION` в `page.tsx:88`).

**Primary recommendation:**

Разбить фазу на **4 плана + Wave 0**:
- **Wave 0 (pre-plan):** проверить scope токена (bit 11) на VPS + получить 1 живой claim для фиксации `status`/`status_ex`/`actions[]`.
- **Plan 09-01 (Wave 1):** Prisma миграция (новая модель `ReturnDecision` + расширение `SupportTicket` двумя полями для return flow) + расширение `lib/wb-support-api.ts` методами Claims + unit-тесты с mock fetch.
- **Plan 09-02 (Wave 2):** Расширение `lib/support-sync.ts` новой функцией `syncReturns()` + расширение `POST /api/support-sync` + новый cron `GET /api/cron/support-sync-returns` (15 мин) + интеграция скачивания медиа через существующий `downloadMediaBatch`.
- **Plan 09-03 (Wave 3):** Страница `/support/returns` — RSC таблица + фильтры + пагинация (паттерн `/support/page.tsx` и `/cards/wb`).
- **Plan 09-04 (Wave 4):** `ReturnActionsPanel` в диалоге `/support/[ticketId]` (conditional render вместо `ReplyPanel` при `channel === "RETURN"`) + 3 server action (approveReturn/rejectReturn/reconsiderReturn) + state machine + human UAT.

## User Constraints (from CONTEXT.md)

> CONTEXT.md для Phase 9 ещё не создан (`/gsd:discuss-phase 9` не запускался). Ограничения выводятся из ROADMAP.md + REQUIREMENTS.md + паттернов Phase 8.

### Locked Decisions (выводимые из ROADMAP.md + REQUIREMENTS.md — проверить при `/gsd:discuss-phase 9`)

- **Scope:** только WB Returns (Claims API). Ozon/Mессенджер возвраты — OUT OF SCOPE (milestone v1.1).
- **State machine (SUP-20):** `PENDING → APPROVED | REJECTED`, `REJECTED → APPROVED` через «Пересмотреть» (`reconsidered=true`), `APPROVED` финал (actions disabled).
- **UI-локации (SUP-14, SUP-18):**
  - `/support/returns` — отдельная таблица заявок (колонки: Товар, Покупатель, Причина, Фото брака, Дата, Решение, Кто принял, Пересмотрено, Действия).
  - В диалоге `/support/[ticketId]` канала RETURN — sticky-панель Одобрить/Отклонить/Пересмотреть вместо/рядом с textarea (ReplyPanel скрывается).
- **Модель ReturnDecision (SUP-19):** поля `decidedById`, `decidedAt`, `reason`, `reconsidered`.
- **RBAC (из CLAUDE.md + Phase 8):** чтение — `requireSection("SUPPORT")`, write (approve/reject/reconsider/sync) — `requireSection("SUPPORT", "MANAGE")`.
- **Язык интерфейса:** русский (CLAUDE.md).
- **Технологии:** Prisma 6.19, Next.js 15.5.14, vitest 4.1.4, native HTML `<select>`, sonner toast, existing `MultiSelectDropdown` (CLAUDE.md).

### Claude's Discretion (research-based recommendations, требуют подтверждения в discuss-phase)

- **Маппинг WB `status` integer → enum `RETURN_STATE_*`** в БД — предлагается хранить **оригинальный `status` как Int** и **`status_ex` как Int** в `SupportTicket.wbClaimStatus` / `wbClaimStatusEx`, а собственный ERP-state (PENDING/APPROVED/REJECTED) хранить в новой колонке `SupportTicket.returnState: ReturnState?` или в `ReturnDecision.decision: ReturnDecisionType`. Причина — WB публично не документирует полный enum `status`, придётся реверс-инжинирить на проде, а ERP-state нам под контролем.
- **Где хранить `returnState`** — `SupportTicket` vs `ReturnDecision`:
  - Рекомендую: **актуальное** состояние в `SupportTicket.returnState` (для быстрой фильтрации в ленте/таблице), **история** решений — в `ReturnDecision` (один тикет → до N decisions из-за «пересмотреть»).
  - `ReturnDecision` поэтому — **не N:1 one-to-many с одним актуальным решением**, а **history/audit log** со всеми действиями.
- **Reuse SupportMedia vs новое поле:** переиспользовать `SupportMedia` (прикреплённое к первому INBOUND сообщению тикета возврата, `type=IMAGE` / `type=VIDEO`). Причина: `downloadMediaBatch` уже работает + nginx alias уже настроен. Отдельное поле `ReturnDecision.photos` не нужно — фото относятся к заявке покупателя, а не к решению продавца.
- **Sync flow:** **добавить в существующий cron** `/api/cron/support-sync-reviews` (15 мин) дополнительный вызов `syncReturns()`, а НЕ создавать отдельный `/api/cron/support-sync-returns`. Причина: всё под одним CRON_SECRET, одна точка ошибки, одни логи. Альтернативно — создать отдельный cron если хочется разных интервалов (reviews 15 мин, returns 5 мин), но для MVP 15 мин достаточно. ⚠ **REQUIREMENTS.md/SUP-07 уже перечисляет только `support-sync-reviews`, `support-sync-chat`, `support-sync-appeals` — возвраты можно прикрепить к reviews либо добавить новый endpoint; решение за планировщиком.**
- **Стратегия «Пересмотреть»:** после первого `rejectcustom` — повторно загрузить заявку через `GET /api/v1/claims?id={uuid}&is_archive=true`, прочитать новый `actions[]`, проверить наличие `approve1`. Если WB не вернёт `approve1` после rejection — действие невозможно, UI показать ошибку «WB не позволяет пересмотреть эту заявку». Валидация только на проде.

### Deferred Ideas (OUT OF SCOPE Phase 9)

- Отзыв (revoke) уже одобренного возврата — WB API не поддерживает, `APPROVED` финал.
- Массовые действия (bulk approve/reject) — отдельная таблица UX из Phase 13 статистики.
- Статистика по возвратам (процент одобрения, средний срок) — Phase 13.
- Редактирование `ReturnDecision.reason` после отправки — audit log, не редактируется.
- Интеграция с 1С / автоматическое списание суммы возврата — не в scope ERP.
- Уведомления (email / sidebar badge «новый возврат») — sidebar badge `status=NEW` уже есть из Phase 8 SUP-12; отдельный return-специфичный не нужен.
- Customer-линковка по buyer UUID — WB Claims API НЕ возвращает `wbUserId` или имя покупателя (только `srid` — идентификатор заказа). В Phase 9 покупатель остаётся анонимным, как в Phase 8.

## Project Constraints (from CLAUDE.md)

Критические директивы CLAUDE.md, обязательные к соблюдению в Phase 9:

- **Язык:** русский в UI, комментариях, планах.
- **Select:** native HTML `<select>` для статусов/менеджеров, **НЕ base-ui Select**.
- **Server Actions:** `"use server"` + `requireSection("SUPPORT", "MANAGE")` + `try/catch` + `revalidatePath("/support/returns")` и `revalidatePath("/support/[ticketId]")`.
- **RBAC write:** все 3 новых server action (approveReturn/rejectReturn/reconsiderReturn) + sync endpoints + cron — `requireSection("SUPPORT", "MANAGE")`. Read-операции (таблица, чтение тикета) — `requireSection("SUPPORT")`.
- **Время:** Moscow timezone при форматировании дат (`Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow" })` — паттерн из `TicketSidePanel.tsx:60`).
- **Токен:** `/etc/zoiten.pro.env` → `WB_API_TOKEN`, scope bit 11 (Buyers Returns) — **валидировать на VPS ДО реализации**.
- **Фото:** `/var/www/zoiten-uploads/support/{ticketId}/{messageId}/{filename}` — через существующий `downloadMediaBatch` (`lib/support-media.ts`).
- **Cron secret:** заголовок `x-cron-secret` vs `process.env.CRON_SECRET` (паттерн `app/api/cron/purge-deleted/route.ts`).
- **Prisma singleton:** `import { prisma } from "@/lib/prisma"`.
- **GSD Workflow Enforcement:** любой Edit/Write проходит через `/gsd:execute-phase` → каждый план в своей ветке работы.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SUP-14 (доп.)** | Кнопки «Одобрить/Отклонить/Пересмотреть» в диалоге тикета канала RETURN (sticky-панель справа/рядом с textarea). | Новый `ReturnActionsPanel` компонент + conditional render в `app/(dashboard)/support/[ticketId]/page.tsx:140` (заменяет `ReplyPanel`). State machine в [## State Machine](#state-machine) ниже. |
| **SUP-17** | WB Returns API методы `listReturns`, `approveReturn`, `rejectReturn`, `reconsiderReturn` в `lib/wb-support-api.ts` + unit-тесты. | Endpoint `returns-api.wildberries.ru/api/v1/claims` (GET) и `/api/v1/claim` (PATCH), документированы в [## WB Buyers Returns API](#wb-buyers-returns-api). Test pattern: `tests/wb-support-api.test.ts` (mock fetch, 10 GREEN тестов). |
| **SUP-18** | Страница `/support/returns` — таблица заявок (Товар, Покупатель, Причина, Фото брака, Дата, Решение, Кто принял, Пересмотрено, Действия). | RSC-паттерн из `app/(dashboard)/support/page.tsx` + `cards/wb`. Колонки описаны в [## UI Architecture](#ui-architecture). Customer всегда анонимный (в Phase 9 — как в Phase 8). |
| **SUP-19** | Действия approve/reject/reconsider → PATCH `/api/v1/claim` → фиксация в `ReturnDecision` (`decidedById`, `decidedAt`, `reason`, `reconsidered`). | 3 новых server action + новая Prisma модель `ReturnDecision` (history log). Body запроса: `{id, action, comment}`. |
| **SUP-20** | Логика состояний: `PENDING → APPROVED | REJECTED`; `REJECTED → APPROVED` через «Пересмотреть» (`reconsidered=true`); `APPROVED` финальный (disabled). | State machine + guards в server actions + UI disabled logic ([## State Machine](#state-machine)). |

## WB Buyers Returns API

### 1. Base URL и авторизация (VERIFIED 2026-04-17)

```
Base URL:      https://returns-api.wildberries.ru
Auth header:   Authorization: <WB_API_TOKEN>
Content-Type:  application/json
Token scope:   bit 11 (Buyers Returns) — ⚠ ОТЛИЧАЕТСЯ от bit 5 (Feedbacks)
```

**⚠ БЛОКЕР:** Текущий `WB_API_TOKEN` в `/etc/zoiten.pro.env` был выпущен с scope bit 5 (Отзывы) для Phase 8. Необходимо:

1. Проверить через `seller.wildberries.ru/supplier-settings/access-to-api` — включён ли bit 11.
2. Если нет — перегенерировать токен с включёнными bits 1, 2, 3, 5, 6, 7, **11**.
3. Обновить `/etc/zoiten.pro.env` → `WB_API_TOKEN=<new>` → `systemctl restart zoiten-erp.service`.

**Альтернатива:** завести отдельный токен только для returns (`WB_RETURNS_API_TOKEN`) — но это усложняет управление; рекомендую один unified token.

Валидация scope — Wave 0:

```bash
# На VPS:
curl -sI "https://returns-api.wildberries.ru/api/v1/claims?is_archive=false&limit=1" \
  -H "Authorization: $WB_API_TOKEN"
# 200 OK → scope есть; 401/403 → bit 11 не включён.
```

Источник: [DragonSigh/wildberries-api-docs user-communication.md:1997-2001](https://github.com/DragonSigh/wildberries-api-docs/blob/main/user-communication.md), [WB API token scopes](https://dev.wildberries.ru/en/openapi/api-information).

### 2. Endpoints

| Метод | Endpoint | Назначение |
|-------|----------|------------|
| GET | `/api/v1/claims` | Список заявок на возврат (под рассмотрением или архив) |
| PATCH | `/api/v1/claim` | Отправить решение (action) по заявке |

### 3. GET /api/v1/claims — query parameters

| Параметр | Тип | Обязательно | Описание |
|----------|-----|-------------|----------|
| `is_archive` | boolean | **да** | `false` = под рассмотрением, `true` = архив (уже решённые) |
| `id` | UUID | нет | Фильтр по ID заявки |
| `limit` | int 1-200 | нет | Default 50, max 200 |
| `offset` | int ≥0 | нет | Default 0 |
| `nm_id` | int | нет | Фильтр по артикулу WB |

**Pagination strategy:** offset-based (как Feedbacks, НЕ cursor). Для Phase 9: `limit=200` × N страниц, пауза 600 мс между запросами (паттерн проекта).

**14-day window:** API возвращает только заявки за последние 14 дней. Более старые — недоступны. Означает:
- cron каждые 15 минут + окно 14 дней = все заявки будут подхвачены;
- исторический archive мы ведём в нашей БД (не полагаемся на WB archive после 14 дней).

### 4. PATCH /api/v1/claim — request body

```json
{
  "id": "fe3e9337-e9f9-423c-8930-946a8ebef80",
  "action": "rejectcustom",
  "comment": "Фото не относится к товару из заявки"
}
```

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `id` | UUID | **да** | ID заявки |
| `action` | string | **да** | Значение из массива `actions[]` из GET-ответа |
| `comment` | string 10-1000 | только при `action="rejectcustom"` (required) или `action="approvecc1"` (optional) | Комментарий продавца |

**⚠ CRITICAL — `actions[]` динамический:** Массив доступных действий WB возвращает per-заявке (например `["autorefund1", "approve1"]` в примере). Клиент НЕ должен хардкодить строки действий — **всегда** брать из свежего GET-ответа. Для UI: сохранять `SupportTicket.wbActions: String[]` в БД при sync.

### 5. Action strings — поведенческие семантические (по документации WB примера)

| Action | Что делает | Требует comment | Примечание |
|--------|-----------|-----------------|------------|
| `autorefund1` | Автовозврат — одобрить и вернуть деньги без возврата товара | нет | «Одобрить без возврата» |
| `approve1` | Одобрить возврат товара (покупатель возвращает в ПВЗ/курьеру) | нет | Стандартное одобрение |
| `approvecc1` | Одобрить с кастомным комментарием для покупателя | optional | «Одобрить с пояснением» |
| `rejectcustom` | Отклонить с причиной | **required** (10-1000 символов) | Стандартное отклонение |

**Как соотносится с SUP-19 («Одобрить/Отклонить/Пересмотреть»):**

| UI-кнопка | WB action | Когда показывать |
|-----------|-----------|------------------|
| «Одобрить» | `approve1` (или `autorefund1` если в actions[]) | PENDING, если в `actions[]` есть `approve1`/`autorefund1` |
| «Отклонить» | `rejectcustom` | PENDING, если в `actions[]` есть `rejectcustom` |
| «Пересмотреть» | `approve1` (попытка) | REJECTED, если в `actions[]` снова есть `approve1` после rejection |

**⚠ НЕИЗВЕСТНО (LOW confidence, требует проверки на проде):** возвращает ли WB `approve1` в `actions[]` после `rejectcustom`. Если нет — «Пересмотреть» невозможно через API; нужно обрабатывать ошибку UI-сообщением.

### 6. GET /api/v1/claims — response schema (CANONICAL — из официального примера)

```json
{
  "claims": [
    {
      "id": "fe3e9337-e9f9-423c-8930-946a8ebef80",
      "claim_type": 1,
      "status": 2,
      "status_ex": 8,
      "nm_id": 196320101,
      "user_comment": "Длина провода не соответствует описанию",
      "wb_comment": "Продавец одобрил вашу заявку...",
      "dt": "2024-03-26T17:06:12.245611",
      "imt_name": "Кабель 0.5 м, 3797",
      "order_dt": "2020-10-27T05:18:56",
      "dt_update": "2024-05-10T18:01:06.999613",
      "photos": [
        "//photos.wbstatic.net/claim/fe3e9337-e9f9-423c-8930-946a8ebef80/1.webp",
        "//photos.wbstatic.net/claim/fe3e9337-e9f9-423c-8930-946a8ebef80/2.webp"
      ],
      "video_paths": [
        "//video.wbstatic.net/claim/fe3e9337-e9f9-423c-8930-946a8ebef80/1.mp4"
      ],
      "actions": ["autorefund1", "approve1"],
      "price": 157,
      "currency_code": "643",
      "srid": "v5o_7143225816503318733.0.0"
    }
  ],
  "total": 31
}
```

**Критические замечания:**

| Поле | Тип | Примечание |
|------|-----|------------|
| `id` | UUID v4 | Строковый UUID (совместим с `SupportTicket.wbExternalId: String?` из Phase 8) |
| `claim_type` | int | Enum значение — **документация не раскрывает**. Хранить as-is. |
| `status` | int | Enum — **не документирован публично**. Пример 2. Хранить as-is в `wbClaimStatus`. |
| `status_ex` | int | Extended status — **не документирован**. Пример 8. Хранить as-is в `wbClaimStatusEx`. |
| `user_comment` | string | Причина покупателя — это наш «Причина» для таблицы |
| `wb_comment` | string | Комментарий самого WB (не продавца) — длинная инструкция покупателю |
| `photos` | string[] | URL **БЕЗ схемы** (`//photos.wbstatic.net/...`) — в fetch добавить `https:` префикс |
| `video_paths` | string[] | URL **БЕЗ схемы** |
| `actions` | string[] | Доступные действия для данной заявки. **Динамический — не хардкодить**. |
| `price` | number | Сумма в рублях (без копеек? — уточнить по реальному ответу) |
| `currency_code` | string | ISO 4217 numeric — `"643"` = RUB |
| `srid` | string | ID заказа (Shipment ID) — для связки с заказами WB |
| `dt` | ISO 8601 | Когда покупатель подал заявку — для колонки «Дата» |
| `dt_update` | ISO 8601 | Последнее обновление — используем для детекции изменений при sync |
| `nm_id` | int | Артикул WB — для JOIN с `WbCard.nmId` (через `SupportTicket.nmId`) |
| `imt_name` | string | Название товара (денормализованное) — fallback если `WbCard` не найден |
| **`wbUserId`** | **ОТСУТСТВУЕТ** | Покупатель полностью анонимизирован |
| **`buyerName`** | **ОТСУТСТВУЕТ** | Имени нет — в колонке «Покупатель» выводим «Покупатель #{id.slice(-6)}» |

### 7. Rate limits (VERIFIED)

| Тип | Период | Лимит | Интервал | Burst |
|-----|--------|-------|----------|-------|
| Personal | 1 мин | 20 запросов | 3 сек | 10 запросов |
| Service | 1 мин | 20 запросов | 3 сек | 10 запросов |

**Рекомендация:** пауза 600 мс между пагинацией (паттерн проекта `lib/wb-api.ts:PROMO_RATE_DELAY_MS`). При 429 — читать заголовок `X-Ratelimit-Retry` (секунды), fallback sleep 6000 мс + 1 retry (паттерн `callWb` в `lib/wb-support-api.ts:77-93`).

### 8. Error response (400)

```json
{
  "title": "Validation error",
  "detail": "Input model is not valid; Details: The Action field is required.",
  "requestId": "0HN3PI6JUGFSL:00000004"
}
```

В server action: парсить `detail` для русского toast.error: `WB: ${detail}`.

### 9. Incremental sync strategy

- **Phase 9 подход:** каждый cron-вызов грузит обе страницы (`is_archive=false` для новых/в работе + `is_archive=true` для последних 14 дней архива). Идемпотентный upsert по `(channel, wbExternalId) = ("RETURN", uuid)`.
- **Фильтр по `dt_update`:** НЕ использовать (WB не поддерживает). Полная выборка дешёвая — total обычно <50.
- **Cron частота:** 15 мин (как reviews). Если архив большой (>500 items) — можно раз в сутки архив, 15 мин — только `is_archive=false`.

## Data Model

### Новая модель: `ReturnDecision` (history/audit log)

```prisma
enum ReturnDecisionAction {
  APPROVE       // любой approve* action (approve1, autorefund1, approvecc1)
  REJECT        // rejectcustom
  RECONSIDER    // повторный approve* после предыдущего REJECT
}

model ReturnDecision {
  id            String               @id @default(cuid())
  ticketId      String
  ticket        SupportTicket        @relation("ReturnDecisions", fields: [ticketId], references: [id], onDelete: Cascade)
  action        ReturnDecisionAction
  wbAction      String               // оригинальный action string (autorefund1/approve1/rejectcustom/approvecc1)
  reason        String?              @db.Text // comment для rejectcustom или approvecc1
  decidedById   String
  decidedBy     User                 @relation("ReturnDecider", fields: [decidedById], references: [id], onDelete: Restrict)
  decidedAt     DateTime             @default(now())
  reconsidered  Boolean              @default(false) // true если это RECONSIDER действие
  wbResponseOk  Boolean              @default(true)  // false если WB API вернул ошибку (но мы записали попытку)
  wbError       String?              @db.Text

  @@index([ticketId, decidedAt])
}
```

**Почему Cascade на ticket удаление** — решения не имеют смысла без тикета; соответствует паттерну `SupportMessage` (phase 8 schema.prisma:565).

**Почему Restrict на User удаление** — аудиторский след решений менеджера не должен теряться при деактивации/удалении пользователя. Если User не может быть deleted (как в проекте — `isActive: false` вместо delete), это безопасно.

### Расширение модели: `SupportTicket`

Добавить 4 nullable-поля (без ломания Phase 8):

```prisma
model SupportTicket {
  // ... existing Phase 8 fields ...

  // ── Phase 9: Возвраты ──
  wbClaimStatus   Int?                  // status integer из WB (denormalized, для диагностики)
  wbClaimStatusEx Int?                  // status_ex integer из WB
  wbClaimType     Int?                  // claim_type integer
  wbActions       String[]              @default([]) // актуальные action strings из WB (для UI кнопок)
  wbComment       String?               @db.Text     // wb_comment — длинная инструкция покупателю
  srid            String?               // Shipment ID из WB
  price           Float?                // price из заявки (рубли)

  // Collapsed state machine (для быстрой фильтрации в таблице /support/returns)
  returnState     ReturnState?

  returnDecisions ReturnDecision[]      @relation("ReturnDecisions")

  // ... existing @@unique + @@index ...
  @@index([returnState])  // для быстрой фильтрации в /support/returns
}

enum ReturnState {
  PENDING      // заявка открыта, решения ещё нет
  APPROVED     // одобрен (финал)
  REJECTED     // отклонён (можно пересмотреть)
}
```

**Почему `returnState` дублирует `ReturnDecision.action`** — быстрый filter/index в таблице без JOIN на ReturnDecision (последняя запись). При каждом успешном `PATCH /api/v1/claim` обновляем `returnState` атомарно в transaction с `ReturnDecision.create()`.

**Связь с `SupportTicket.status`:**

| Действие | `SupportTicket.status` | `SupportTicket.returnState` |
|----------|------------------------|------------------------------|
| Заявка пришла через sync | `NEW` | `PENDING` |
| Менеджер назначен | `IN_PROGRESS` | `PENDING` |
| Approved | `ANSWERED` (финал для канала RETURN) | `APPROVED` |
| Rejected | `IN_PROGRESS` (менеджер может пересмотреть) | `REJECTED` |
| Reconsidered → approved | `ANSWERED` | `APPROVED` (reconsidered=true в decision) |

⚠ Разделение: `TicketStatus` = «закрыта ли в ERP», `ReturnState` = «каково решение по заявке». Для RETURN канала две оси независимы и обе нужны.

### Медиа (photos / video_paths)

**Решение:** Переиспользовать `SupportMedia` модель из Phase 8 (no migration needed):
- При sync каждая photo → `SupportMedia{type: IMAGE, wbUrl: "https:"+url, messageId: <первого INBOUND>}`
- video_paths → `SupportMedia{type: VIDEO, wbUrl: "https:"+url, ...}`
- `downloadMediaBatch(items, 5)` — existing `lib/support-media.ts` без изменений
- URL-префикс `https:` добавлять в sync-логике ДО записи `wbUrl`

### SupportMessage для RETURN канала

Модель RETURN-тикета:
- **1 INBOUND message** — содержит `user_comment` от покупателя + медиа
- **N OUTBOUND messages?** — **нет**, возврат не переписка, WB Claims API не даёт поля "messages". `SupportMessage` создаём только 1 (INBOUND) для совместимости с диалогом.
- **`wb_comment`** (длинная инструкция покупателю) — хранить в `SupportTicket.wbComment`, НЕ создавать OUTBOUND message (это не продавец написал).

### Миграция (одна Prisma migration)

```bash
npx prisma migrate dev --name phase9_returns
```

Содержит:
1. Новая модель `ReturnDecision` + enum `ReturnDecisionAction`
2. Новый enum `ReturnState`
3. Добавление 8 полей в `SupportTicket`
4. Новые 2 relation'а на `User` (именованные: `"ReturnDecider"`) — `User` модель обновить:
   ```prisma
   model User {
     // ...
     returnDecisions  ReturnDecision[]  @relation("ReturnDecider")
   }
   ```
5. Новая relation на `SupportTicket` (`"ReturnDecisions"`) — уже в схеме выше
6. Индекс `SupportTicket.returnState`

## Sync Strategy

### Вариант A (рекомендуемый): расширить существующий flow

**Изменения в `lib/support-sync.ts`:**

```typescript
// Новая функция, экспортируется рядом с syncSupport:
export async function syncReturns(): Promise<SyncReturnsResult> {
  const claims: Claim[] = []
  for (const is_archive of [false, true]) {
    for (let offset = 0; ; offset += 200) {
      const batch = await listReturns({ is_archive, limit: 200, offset })
      claims.push(...batch)
      if (batch.length < 200) break
      await sleep(600) // rate limit: 20 req/min
    }
  }
  // upsert каждой claim → SupportTicket + SupportMessage + SupportMedia
  // ...
}
```

**Изменения в `POST /api/support-sync`:**

Добавить после `await syncSupport(...)`:
```typescript
const returnsResult = await syncReturns()
```

**Изменения в `GET /api/cron/support-sync-reviews`:**

```typescript
const result = await syncSupport({ isAnswered: false })
const returns = await syncReturns()
return NextResponse.json({ ok: true, ...result, ...returns })
```

### Вариант B (альтернативный): отдельный cron

Создать `app/api/cron/support-sync-returns/route.ts` (копия `support-sync-reviews` + `await syncReturns()` вместо `syncSupport`). Добавить в VPS crontab отдельную строку.

**Рекомендация для Phase 9:** **Вариант A**. Причины:
1. Единый CRON_SECRET, единая точка логов, единая точка ошибки.
2. 15 мин — достаточно для возвратов (окно sync = 14 дней, запас огромный).
3. Возвраты в 1 сек — не удлинят `support-sync-reviews` существенно (20 req/min limit = максимум 3 страницы × 600мс = 1.8 сек).
4. В требовании SUP-07 уже перечислены cron, но `support-sync-returns` там НЕ указан — значит планировщик свободен решать.

### Upsert логика в sync

```typescript
// per-claim transaction (паттерн Phase 8 support-sync.ts:76-168)
await prisma.$transaction(async (tx) => {
  const ticket = await tx.supportTicket.upsert({
    where: { channel_wbExternalId: { channel: "RETURN", wbExternalId: claim.id } },
    create: {
      channel: "RETURN",
      wbExternalId: claim.id,
      nmId: claim.nm_id,
      status: "NEW",
      returnState: "PENDING",
      wbClaimStatus: claim.status,
      wbClaimStatusEx: claim.status_ex,
      wbClaimType: claim.claim_type,
      wbActions: claim.actions,
      wbComment: claim.wb_comment,
      srid: claim.srid,
      price: claim.price,
      previewText: claim.user_comment?.slice(0, 140),
      lastMessageAt: new Date(claim.dt),
    },
    update: {
      // обновляем ТОЛЬКО WB-side поля (не трогаем status/returnState — они под нашим контролем)
      wbClaimStatus: claim.status,
      wbClaimStatusEx: claim.status_ex,
      wbActions: claim.actions,
      wbComment: claim.wb_comment,
      previewText: claim.user_comment?.slice(0, 140),
    },
  })

  // создать INBOUND message (только если ещё нет)
  const existing = await tx.supportMessage.findFirst({
    where: { ticketId: ticket.id, direction: "INBOUND" },
  })
  if (!existing) {
    const msg = await tx.supportMessage.create({
      data: {
        ticketId: ticket.id,
        direction: "INBOUND",
        text: claim.user_comment,
        wbSentAt: new Date(claim.dt),
      },
    })
    // добавить медиа
    for (const photo of claim.photos ?? []) {
      const url = photo.startsWith("//") ? `https:${photo}` : photo
      await tx.supportMedia.create({
        data: { messageId: msg.id, type: "IMAGE", wbUrl: url, expiresAt: new Date(Date.now() + YEAR_MS) },
      })
      mediaQueue.push({ wbUrl: url, ticketId: ticket.id, messageId: msg.id })
    }
    for (const videoUrl of claim.video_paths ?? []) {
      const url = videoUrl.startsWith("//") ? `https:${videoUrl}` : videoUrl
      await tx.supportMedia.create({
        data: { messageId: msg.id, type: "VIDEO", wbUrl: url, expiresAt: new Date(Date.now() + YEAR_MS) },
      })
      mediaQueue.push({ wbUrl: url, ticketId: ticket.id, messageId: msg.id })
    }
  }
})
```

⚠ **Не записываем `returnState` при update** — если менеджер уже одобрил локально, а WB прислал старый статус, не затираем решение.

## UI Architecture

### `/support/returns` — таблица заявок

**Файл:** `app/(dashboard)/support/returns/page.tsx` (RSC)

**Паттерн:** скопировать структуру `app/(dashboard)/support/page.tsx` (уже есть), заменить карточный layout на табличный как в `/cards/wb`.

**Колонки таблицы (SUP-18 требование):**

| # | Колонка | Источник данных | Rendering |
|---|---------|-----------------|-----------|
| 1 | Товар | `WbCard.photoUrl` + `WbCard.name` + `ticket.nmId` | `<img>` 60px + 2 строки текста, ссылка на `/cards/wb?nmId=...` |
| 2 | Покупатель | нет в WB API | «Покупатель #{id.slice(-6)}» (fallback, как Phase 8) |
| 3 | Причина | `ticket.previewText` (из `claim.user_comment`) | `line-clamp-2` max 140 символов |
| 4 | Фото брака | `ticket.messages[0].media[]` (IMAGE) | 3 thumbnail 40px → клик → `/support/{ticketId}` |
| 5 | Дата | `ticket.createdAt` (= `claim.dt`) | Moscow TZ, dd.MM.yyyy HH:mm |
| 6 | Решение | `ticket.returnState` | Badge: PENDING=серый, APPROVED=зелёный, REJECTED=красный |
| 7 | Кто принял | `ReturnDecision` latest → `decidedBy.name` + `decidedAt` | 2 строки |
| 8 | Пересмотрено | `ReturnDecision.reconsidered` (any true) | «Да» зелёная галочка / «—» |
| 9 | Действия | — | Кнопка «Открыть» → `/support/{ticketId}` |

**Фильтры (через searchParams, паттерн `SupportFilters.tsx`):**

- `returnStates: ReturnState[]` (PENDING/APPROVED/REJECTED) — MultiSelectDropdown
- `nmId: Int?` — text input
- `assignees: String[]` — MultiSelectDropdown User с SUPPORT section
- `dateFrom, dateTo` — date picker range
- `reconsideredOnly: boolean` — toggle

**Пагинация:** `pageSize=20`, скопировать `SupportPagination.tsx`.

**Preload latest decision:**

```typescript
// Для N тикетов загружаем последнее решение одним запросом:
const decisions = await prisma.returnDecision.findMany({
  where: { ticketId: { in: ticketIds } },
  orderBy: { decidedAt: "desc" },
  distinct: ["ticketId"],  // PostgreSQL DISTINCT ON
  include: { decidedBy: { select: { id: true, firstName: true, lastName: true, name: true } } },
})
```

### Навигация — sidebar подпункт «Возвраты»

Из SUP-40 (Phase 8) sidebar уже содержит «Служба поддержки». Нужно добавить подпункт «Возвраты» в `components/layout/nav-items.ts` — либо отдельный top-level пункт, либо expanded подменю. ⚠ Проверить текущую структуру `nav-items.ts` в Wave 0 — возможно подменю ещё не реализовано; тогда простой top-level пункт «Возвраты» с URL `/support/returns`.

### Интеграция в `/support/[ticketId]` — ReturnActionsPanel

**Файл:** новый `components/support/ReturnActionsPanel.tsx` (client component, sticky внизу центральной колонки).

**Изменения в `app/(dashboard)/support/[ticketId]/page.tsx:140`:**

```typescript
const canReply = ticket.channel === "FEEDBACK" || ticket.channel === "QUESTION"
const isReturn = ticket.channel === "RETURN"

// ...
{canReply && <ReplyPanel ticketId={ticket.id} disabled={...} />}
{isReturn && (
  <ReturnActionsPanel
    ticketId={ticket.id}
    returnState={ticket.returnState}
    wbActions={ticket.wbActions}
    latestDecision={latestDecision /* { action, reason, reconsidered, decidedAt, decidedBy } */}
  />
)}
{!canReply && !isReturn && <div>Канал не поддерживает ответ...</div>}
```

**ReturnActionsPanel компонент:**

```tsx
// Client component, sticky bottom:
// 3 кнопки + модалка для rejectcustom comment + confirm dialog
<div className="sticky bottom-0 border-t p-3 flex items-center gap-2">
  {returnState === "PENDING" && (
    <>
      <Button onClick={openApproveConfirm} disabled={!wbActions.includes("approve1") && !wbActions.includes("autorefund1")}>
        Одобрить
      </Button>
      <Button variant="destructive" onClick={openRejectModal} disabled={!wbActions.includes("rejectcustom")}>
        Отклонить
      </Button>
    </>
  )}
  {returnState === "REJECTED" && (
    <Button onClick={openReconsiderConfirm} disabled={!wbActions.includes("approve1")}>
      Пересмотреть
    </Button>
  )}
  {returnState === "APPROVED" && (
    <span className="text-sm text-muted-foreground">Возврат одобрен — действия завершены</span>
  )}
  {/* Левая колонка диалога также показывает wb_comment для контекста */}
</div>
```

**Модалка «Отклонить» с полем reason:**

- native `<textarea>` (НЕ base-ui) + счётчик «10/1000» символов
- zod-валидация на клиенте + на сервере (`z.string().min(10).max(1000)`)
- Confirm button disabled пока < 10 символов

**Левая панель диалога для RETURN тикета** (расширение `page.tsx:104-115`):

Добавить блок «Информация о возврате» под «Покупатель»:
- Цена: `₽{ticket.price}`
- Срок заявки: `{ticket.createdAt}`
- Инструкция WB: `{ticket.wbComment}` (collapsible textarea readonly)
- Ссылка на заказ (если `srid`): «Заказ WB: {srid}»

## State Machine

### Граф переходов

```
                approveReturn (approve1/autorefund1/approvecc1)
   ┌───────────────────────────────────────────────┐
   ▼                                                │
PENDING ─── rejectReturn (rejectcustom) ─→ REJECTED │
                                              │     │
                                              └─────┘
                                              reconsiderReturn (approve1)
                                              ↓
                                           APPROVED (finаl)
```

**Инварианты:**

1. `PENDING` — начальное состояние при sync.
2. **Только `PENDING → APPROVED`** возможен напрямую (кнопка «Одобрить»).
3. **Только `PENDING → REJECTED`** возможен напрямую (кнопка «Отклонить»).
4. **Только `REJECTED → APPROVED`** возможен через reconsider (кнопка «Пересмотреть»).
5. **`APPROVED` — финал**, никаких переходов.
6. `REJECTED → PENDING` — **невозможен** (нельзя отозвать отклонение, только пересмотреть).
7. `APPROVED → REJECTED` — **невозможен** (WB API не даёт такой action).

### Guards в server actions

```typescript
export async function approveReturn(ticketId: string): Promise<ActionResult> {
  await requireSection("SUPPORT", "MANAGE")
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } })
  if (!ticket) return { ok: false, error: "Тикет не найден" }
  if (ticket.channel !== "RETURN") return { ok: false, error: "Не RETURN-тикет" }
  if (ticket.returnState === "APPROVED") return { ok: false, error: "Возврат уже одобрен (финал)" }
  if (ticket.returnState === "REJECTED") {
    return { ok: false, error: "Используйте reconsiderReturn" }
  }
  // ticket.returnState === "PENDING" → ok
  // ... выбрать action из wbActions: prefer "approve1" > "autorefund1" > "approvecc1"
}

export async function rejectReturn(ticketId: string, reason: string): Promise<ActionResult> {
  await requireSection("SUPPORT", "MANAGE")
  // ... guard: только из PENDING
  if (ticket.returnState !== "PENDING") {
    return { ok: false, error: "Отклонить можно только из PENDING" }
  }
  if (reason.trim().length < 10) return { ok: false, error: "Причина минимум 10 символов" }
  if (reason.length > 1000) return { ok: false, error: "Максимум 1000 символов" }
  // ...
}

export async function reconsiderReturn(ticketId: string): Promise<ActionResult> {
  await requireSection("SUPPORT", "MANAGE")
  // ... guard: только из REJECTED
  if (ticket.returnState !== "REJECTED") {
    return { ok: false, error: "Пересмотреть можно только отклонённые" }
  }
  // ... PATCH WB с action="approve1"
  // ... записать ReturnDecision{action: RECONSIDER, reconsidered: true}
  // ... ticket.returnState = "APPROVED"
}
```

### UI disable logic

| State | «Одобрить» | «Отклонить» | «Пересмотреть» |
|-------|-----------|-------------|------------------|
| `PENDING` | enabled (если action доступен) | enabled | **hidden** |
| `REJECTED` | **hidden** | **hidden** | enabled (если `approve1` в `wbActions`) |
| `APPROVED` | **hidden** | **hidden** | **hidden** |

Также все кнопки `disabled={!wbActions.includes(requiredAction)}` как защита от race condition между sync и UI.

### Transaction паттерн для server action

```typescript
// 1. PATCH WB API (может вернуть ошибку)
try {
  await patchClaim({ id: ticket.wbExternalId, action: "approve1" })
} catch (err) {
  // Не записываем Decision — действие не свершилось
  return { ok: false, error: `WB: ${err.message}` }
}

// 2. Transaction: Decision + ticket.returnState
await prisma.$transaction([
  prisma.returnDecision.create({
    data: {
      ticketId: ticket.id,
      action: "APPROVE",
      wbAction: "approve1",
      reason: null,
      decidedById: userId,
      reconsidered: false,
    },
  }),
  prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { returnState: "APPROVED", status: "ANSWERED", resolvedAt: new Date() },
  }),
])

revalidatePath("/support/returns")
revalidatePath(`/support/${ticket.id}`)
return { ok: true }
```

## Testing Strategy

### Unit tests — `tests/wb-returns-api.test.ts` (new)

Паттерн 1-в-1 копирует `tests/wb-support-api.test.ts` (10 GREEN тестов). Покрытие:

1. `listReturns({is_archive: false})` — строит URL, шлёт Authorization header.
2. `listReturns` — парсит `{claims: [...], total: N}` response.
3. `listReturns` — pagination offset параметр.
4. `listReturns` — ретрай на 429 с `X-Ratelimit-Retry` header.
5. `listReturns` — throws на 401 «Неверный токен».
6. `listReturns` — throws на 403 «Нет scope bit 11».
7. `approveReturn(id, action)` — PATCH body `{id, action}`.
8. `rejectReturn(id, reason)` — PATCH body `{id, action: "rejectcustom", comment: reason}`.
9. `rejectReturn` — throws если reason < 10 символов (Zod client-side validation).
10. `reconsiderReturn(id, action)` — PATCH body с action из `wbActions[]`.

### Integration tests — `tests/support-returns-sync.test.ts` (new)

Паттерн из `tests/support-sync.test.ts`. Mock `fetch` на возврат canonical примера (из документации):

1. `syncReturns()` — создаёт SupportTicket с channel=RETURN, returnState=PENDING.
2. `syncReturns()` — upsert второго запуска не дублирует ticket (идемпотентность).
3. `syncReturns()` — создаёт SupportMedia для всех photos и video_paths с `https:` префиксом.
4. `syncReturns()` — вызывает обе страницы `is_archive=false` и `is_archive=true`.
5. `syncReturns()` — НЕ перезаписывает `returnState` на update (защита локальных решений).

### Server action tests — `tests/support-returns-actions.test.ts` (new)

Паттерн `tests/support-actions.test.ts`. Покрытие:

1. `approveReturn` — happy path PENDING → APPROVED + Decision создан.
2. `approveReturn` — reject если ticket.channel !== RETURN.
3. `approveReturn` — reject если returnState === APPROVED.
4. `rejectReturn` — happy path PENDING → REJECTED + Decision с reason.
5. `rejectReturn` — validation reason < 10 или > 1000.
6. `reconsiderReturn` — happy path REJECTED → APPROVED + Decision{reconsidered: true}.
7. `reconsiderReturn` — reject если returnState === PENDING.
8. Все 3 action — требуют `requireSection("SUPPORT", "MANAGE")`; VIEWER получает reject.
9. Все 3 — НЕ создают Decision если WB API вернул ошибку.
10. Все 3 — revalidatePath вызван.

### Fixture

Поместить canonical пример claim в `tests/fixtures/wb-claim-sample.json` для reuse в тестах.

## Validation Architecture

> nyquist_validation enabled (config.json)

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run tests/wb-returns-api.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| SUP-17 | listReturns shape + auth | unit | `npx vitest run tests/wb-returns-api.test.ts -t "listReturns"` | ❌ Wave 0 |
| SUP-17 | approveReturn/rejectReturn/reconsiderReturn body shape | unit | `npx vitest run tests/wb-returns-api.test.ts -t "Return$"` | ❌ Wave 0 |
| SUP-17 | 429 retry + X-Ratelimit-Retry header | unit | `npx vitest run tests/wb-returns-api.test.ts -t "429"` | ❌ Wave 0 |
| SUP-18 | `/support/returns` RSC renders without error | smoke | `npx tsc --noEmit && npm run build` | ✅ (existing) |
| SUP-19 | syncReturns upsert idempotent | integration | `npx vitest run tests/support-returns-sync.test.ts` | ❌ Wave 0 |
| SUP-19 | server actions create ReturnDecision + update returnState | integration | `npx vitest run tests/support-returns-actions.test.ts` | ❌ Wave 0 |
| SUP-19 | guards: MANAGE required | integration | `npx vitest run tests/support-returns-actions.test.ts -t "RBAC"` | ❌ Wave 0 |
| SUP-20 | state machine: PENDING→APPROVED, PENDING→REJECTED, REJECTED→APPROVED | integration | `npx vitest run tests/support-returns-actions.test.ts -t "state"` | ❌ Wave 0 |
| SUP-20 | state machine rejects APPROVED→any и REJECTED→PENDING | integration | same command | ❌ Wave 0 |
| SUP-14 | ReturnActionsPanel conditional render для RETURN | manual-only | Human UAT: открыть `/support/{ticketId}` с channel=RETURN, убедиться что ReturnActionsPanel виден вместо ReplyPanel | — |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/wb-returns-api.test.ts tests/support-returns-sync.test.ts tests/support-returns-actions.test.ts -x` (< 10 сек)
- **Per wave merge:** `npm run test` (full suite, ~60 сек с учётом Phase 7+8+9)
- **Phase gate:** Full suite GREEN + `npx tsc --noEmit` clean + `npx prisma validate` OK перед `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/wb-returns-api.test.ts` — покрывает SUP-17 (10 тестов, паттерн `wb-support-api.test.ts`)
- [ ] `tests/support-returns-sync.test.ts` — покрывает SUP-19 (5 тестов, паттерн `support-sync.test.ts`)
- [ ] `tests/support-returns-actions.test.ts` — покрывает SUP-19/20 (10 тестов, паттерн `support-actions.test.ts`)
- [ ] `tests/fixtures/wb-claim-sample.json` — canonical WB claim JSON
- [ ] Vitest config уже работает — framework install не нужен (phase 7 это сделал)
- [ ] Smoke test для RSC `/support/returns` — покрыт `npm run build` (существующая TS-проверка)

## Risks & Unknowns

### Risk 1 — `status` / `status_ex` / `claim_type` semantics

**Что:** Публичная документация WB приводит ТОЛЬКО пример (`status: 2, status_ex: 8, claim_type: 1`) без полного enum-маппинга.
**Риск:** Наш UI/фильтры не знают, что значит «status=2» для UX — но мы и не используем эти поля в бизнес-логике: наш `returnState` (PENDING/APPROVED/REJECTED) управляется локально через user actions + записи в `ReturnDecision`. WB-поля хранятся denormalized для диагностики.
**Mitigation:** Хранить `wbClaimStatus`/`wbClaimStatusEx`/`wbClaimType` as Int (as-is) + опциональная колонка в таблице «WB status» для дебага; выводить UX через наш `returnState`.

### Risk 2 — «Пересмотреть» механика не подтверждена

**Что:** Документация не указывает, вернёт ли WB `approve1` в `actions[]` после `rejectcustom`. Возможные варианты:
- (a) WB разрешает пересмотр и возвращает `approve1` в актуальном `actions[]`;
- (b) WB блокирует пересмотр — `actions[]` пустой после reject;
- (c) Пересмотр зависит от `status_ex` таймера (условная окна).
**Mitigation:**
1. Wave 0 — реальный тест на VPS: отклонить 1 тестовый claim → `GET /api/v1/claims?id={uuid}` → проверить `actions[]`.
2. UI: кнопка «Пересмотреть» disabled если `!wbActions.includes("approve1")` — защита от неизвестной механики.
3. Server action возвращает `{ok: false, error: "WB не позволяет пересмотреть..."}` при 400.
4. Если (b) или (c) — уточнить с пользователем в `/gsd:discuss-phase`: возможно, «пересмотреть» должно быть deferred до другой фазы или реализовано без WB-round-trip (только локальная отметка «решение изменено»).

### Risk 3 — Scope bit 11 не включён в текущем токене

**Что:** Phase 8 выпустила токен с scope bit 5 (Feedbacks). Bit 11 (Buyers Returns) может быть не включён.
**Mitigation:** Wave 0 — проверочный `curl` с существующим токеном на `/api/v1/claims`. Если 401/403 — перегенерировать токен в кабинете WB с полным scope (bits 1,2,3,5,6,7,11) и обновить `/etc/zoiten.pro.env`.

### Risk 4 — `price` в заявке — копейки или рубли?

**Что:** `"price": 157` — рубли или копейки? Пример WB не уточняет.
**Mitigation:** Wave 0 — сравнить с реальной ценой товара WB (открыть `WbCard.price` для того же nmId). Если разница в 100 раз → копейки → поделить. Хранить в БД как `Float` в рублях (денормализованное).

### Risk 5 — Видео m3u8 или mp4?

**Что:** Пример показывает `.mp4` для claims (`//video.wbstatic.net/claim/.../1.mp4`), НЕ HLS m3u8 (как у feedbacks). Возможно различие: feedbacks — потоковое, claims — статичные файлы.
**Mitigation:** Phase 8 `downloadMediaBatch` скачает любой URL как arrayBuffer → write to file. mp4 скачается без проблем. HTML `<video>` в UI воспроизведёт mp4 нативно (через `/uploads/support/...`). Проверить на реальной заявке.

### Risk 6 — Nginx alias для `/uploads/support/` уже существует

**Что:** Phase 8 настроил alias. Видео mp4 может требовать `Content-Type: video/mp4` header — проверить nginx mime.types.
**Mitigation:** nginx по умолчанию содержит `/etc/nginx/mime.types` с `video/mp4  mp4`. OK.

### Risk 7 — Concurrent sync + user action

**Что:** Менеджер кликает «Одобрить» пока cron sync работает → sync может перезаписать `wbActions` и смутить UI.
**Mitigation:** Sync `update` НЕ трогает `returnState` (уже спроектировано). `wbActions` может обновиться — но это OK, всегда актуально. Race на Decision создании маловероятен благодаря transaction.

### Risk 8 — Customer записи для RETURN тикетов

**Что:** CLAIM не отдаёт `wbUserId` (как и Feedbacks). Customer остаётся null.
**Mitigation:** (Не risk, а ограничение.) Phase 12 займётся customer-линковкой. В таблице `/support/returns` показывать «Покупатель #{ticket.id.slice(-6)}». Ссылка на srid — возможно добавить ссылку на заказ в WB-кабинете если есть deep-link формат.

## Plan Slicing Recommendation

Рекомендуемая декомпозиция на **1 Wave 0 (infrastructure spike) + 4 плана**, по модели Phase 7 и Phase 8:

### Wave 0 — Infrastructure & Live API Verification (pre-plan)

**Цель:** Ответить на 3 critical-unknown до начала разработки.

**Actions:**
1. На VPS: `curl -sI "https://returns-api.wildberries.ru/api/v1/claims?is_archive=false&limit=1" -H "Authorization: $WB_API_TOKEN"` → если 401/403, перегенерировать токен с bit 11, обновить `/etc/zoiten.pro.env`.
2. Запросить 1 реальный claim: `curl ... | jq` → зафиксировать (в `09-WAVE0-NOTES.md`):
   - Точные значения `status`, `status_ex`, `claim_type`, `actions[]` для типичной PENDING заявки.
   - Формат photos/video_paths (есть ли `//` префикс на проде).
   - `price` — рубли или копейки (сверить с `WbCard.price`).
3. (Если есть тестовая возможность) — отклонить 1 claim через `/api/v1/claim` с `rejectcustom`, потом GET → проверить `actions[]` после rejection (определяет поведение «Пересмотреть»).
4. Создать тестовые файлы `tests/wb-returns-api.test.ts`, `tests/support-returns-sync.test.ts`, `tests/support-returns-actions.test.ts` как RED stubs (вернут FAIL до реализации).
5. Скопировать fixture: canonical claim JSON в `tests/fixtures/wb-claim-sample.json`.

**Deliverable:** `09-WAVE0-NOTES.md` с зафиксированными значениями.

### Plan 09-01 — Wave 1: Prisma миграция + WB Claims API клиент

**Scope:**
- Расширение `prisma/schema.prisma`: новая модель `ReturnDecision` + enum `ReturnDecisionAction` + enum `ReturnState` + 8 новых полей в `SupportTicket` + 1 relation в `User`.
- Миграция: `npx prisma migrate dev --name phase9_returns`.
- Расширение `lib/wb-support-api.ts`:
  - Новая константа `RETURNS_API = "https://returns-api.wildberries.ru"` + рефакторинг `callWb` в helper с parameterized base URL (или второй helper `callReturnsApi`).
  - Типы: `Claim`, `ListReturnsParams`, `ClaimAction`.
  - Функции: `listReturns(p)`, `approveReturn(id, wbAction)`, `rejectReturn(id, reason)`, `reconsiderReturn(id, wbAction)`.
- Реализация `tests/wb-returns-api.test.ts` (10 GREEN).
- `npx tsc --noEmit` + `npx prisma validate` — clean.

**Dependencies:** Wave 0.
**Exit criteria:** Migration dev applied локально, все tests GREEN.

### Plan 09-02 — Wave 2: Sync + Cron интеграция

**Scope:**
- Расширить `lib/support-sync.ts` функцией `syncReturns(): Promise<SyncReturnsResult>`.
- Расширить `POST /api/support-sync` вызовом `syncReturns()` после `syncSupport()`.
- Расширить `GET /api/cron/support-sync-reviews` (Option A) ИЛИ создать `/api/cron/support-sync-returns` (Option B) — согласовать в `/gsd:discuss-phase` или выбрать Option A как default.
- Скачивание медиа через `downloadMediaBatch` (reuse Phase 8 `lib/support-media.ts`).
- Реализация `tests/support-returns-sync.test.ts` (5 GREEN).
- VPS: обновить crontab или оставить как есть (если Option A).

**Dependencies:** 09-01.
**Exit criteria:** Ручной `POST /api/support-sync` импортирует тестовый claim в БД, медиа в `/var/www/zoiten-uploads/support/`.

### Plan 09-03 — Wave 3: Страница /support/returns

**Scope:**
- Новый route `app/(dashboard)/support/returns/page.tsx` (RSC, паттерн `support/page.tsx`).
- Компоненты: `components/support/ReturnsTable.tsx`, `components/support/ReturnsFilters.tsx`, `components/support/ReturnsPagination.tsx` (или reuse `SupportPagination.tsx`).
- Sidebar подпункт «Возвраты» в `components/layout/nav-items.ts`.
- Фильтры через searchParams: `returnStates`, `nmId`, `assignees`, `dateFrom`, `dateTo`, `reconsideredOnly`.
- Preload `ReturnDecision` latest per ticket (DISTINCT ON).
- RBAC: `requireSection("SUPPORT")` на RSC.
- TS-check + build — clean.
- Smoke test: страница рендерится с пустой БД («Нет возвратов»).

**Dependencies:** 09-02 (нужны тикеты в БД).
**Exit criteria:** `/support/returns` показывает импортированные тикеты; фильтры работают; клик → `/support/{id}`.

### Plan 09-04 — Wave 4: ReturnActionsPanel + server actions + UAT

**Scope:**
- Новый `components/support/ReturnActionsPanel.tsx` (client).
- Модалка «Отклонить» с textarea + counter + zod (клиент+сервер).
- Модификация `app/(dashboard)/support/[ticketId]/page.tsx` — conditional render ReturnActionsPanel вместо ReplyPanel для channel=RETURN.
- Расширение `app/actions/support.ts` — 3 новых server action (`approveReturn`, `rejectReturn`, `reconsiderReturn`) с state machine guards.
- `requireSection("SUPPORT", "MANAGE")` на всех трёх.
- Transaction: PATCH WB → ReturnDecision create + SupportTicket update → revalidatePath.
- Реализация `tests/support-returns-actions.test.ts` (10 GREEN).
- Левая панель диалога для RETURN — блок «Информация о возврате» (price, wbComment, srid).
- Human UAT checklist (паттерн `08-VERIFICATION.md`):
  - [ ] Открыть `/support/returns` → видна таблица (или «Нет возвратов»).
  - [ ] Клик «Синхронизировать» → toast «Готово», claims импортированы.
  - [ ] Клик по строке → диалог с ReturnActionsPanel вместо ReplyPanel.
  - [ ] «Одобрить» → WB кабинет показывает одобрение, БД Decision создана, returnState=APPROVED, кнопки disabled.
  - [ ] «Отклонить» с reason < 10 → ошибка валидации.
  - [ ] «Отклонить» с валидным reason → WB show rejection, returnState=REJECTED, видна кнопка «Пересмотреть».
  - [ ] «Пересмотреть» → зависит от WB поведения — если `actions[]` содержит `approve1`, одобряется + reconsidered=true в Decision.
  - [ ] VIEWER открывает страницу → видит таблицу, но кнопки actions disabled.
  - [ ] Фото брака в диалоге (claim.photos) открываются через `/uploads/support/.../`.

**Dependencies:** 09-03.
**Exit criteria:** Все tests GREEN, tsc clean, build green, UAT checklist пройден (human_needed).

### Общий timing estimate

- Wave 0: 1-2 часа (VPS-проверки + fixtures)
- 09-01: 2-3 часа (миграция + API клиент + тесты)
- 09-02: 2-3 часа (sync + cron + тесты)
- 09-03: 2-3 часа (таблица + фильтры)
- 09-04: 3-4 часа (панель + server actions + UAT)

**Итого:** ~10-15 часов работы + ~1 час VPS-деплой.

## Sources

### Primary (HIGH confidence)

- [WB Buyers Returns API — официальная документация (зеркало)](https://github.com/DragonSigh/wildberries-api-docs) — `user-communication.md:1997-2153` содержит полный раздел Buyers Returns с request/response примерами, query-параметрами, actions (`autorefund1`, `approve1`, `rejectcustom`, `approvecc1`), и rate limits.
- [WB API Token Scopes](https://dev.wildberries.ru/en/openapi/api-information) — bit 11 = Buyers Returns (verified).
- [Wildberries SDK — eslazarev/wildberries-sdk](https://github.com/eslazarev/wildberries-sdk) — подтверждает endpoint structure (`api_v1_claims_get`, `api_v1_claim_patch`) для Python/Node/Go/PHP клиентов.
- `prisma/schema.prisma:476-593` — существующая Phase 8 схема (SupportTicket/SupportMessage/SupportMedia/Customer + enums TicketChannel.RETURN уже есть).
- `lib/wb-support-api.ts` — паттерн `callWb` helper с 429 retry + X-Ratelimit-Retry header support.
- `lib/support-sync.ts` — паттерн per-ticket transaction + media queue.
- `lib/support-media.ts` — existing `downloadMediaBatch(items, 5)` с retry=1.
- `app/api/cron/support-sync-reviews/route.ts` — паттерн cron endpoint с x-cron-secret.
- `app/actions/support.ts` — паттерн server actions: requireSection + try/catch + transaction + revalidatePath.
- `app/(dashboard)/support/[ticketId]/page.tsx:140-151` — точка расширения (canReply conditional).
- `.planning/phases/08-support-mvp/08-RESEARCH.md` — 40k detailed analysis WB Feedbacks API + проектных паттернов.
- `.planning/phases/08-support-mvp/08-VERIFICATION.md` — 89 GREEN tests + 13 UAT шагов, паттерн для Phase 9 verification.

### Secondary (MEDIUM confidence)

- [Customer Communication overview — dev.wildberries.ru](https://dev.wildberries.ru/en/docs/openapi/user-communication) — high-level overview Buyers Returns section.
- [Wildberries API 2024 Review](https://dev.wildberries.ru/en/news/82) — confirms API активная разработка + released notes о returns updates.
- Подтверждение action `rejectcustom` + comment через веб-поиск (2 независимых источника).

### Tertiary (LOW confidence — требует валидации на проде)

- **`status` / `status_ex` / `claim_type` integer enum values** — публично не документированы. Решение: хранить as-is, не использовать в бизнес-логике. Валидация через Wave 0 observation.
- **Поведение `actions[]` после `rejectcustom`** — WB может или не может вернуть `approve1` для reconsider. Валидация через Wave 0 тестирование.
- **`price` unit (рубли vs копейки)** — пример WB не уточняет. Валидация сравнением с `WbCard.price`.

## Metadata

**Confidence breakdown:**
- WB Claims API endpoints, query params, request bodies, response shape: **HIGH** — canonical пример из WB docs mirror.
- Action strings (autorefund1/approve1/rejectcustom/approvecc1): **HIGH** — явно в документации.
- State machine PENDING→APPROVED|REJECTED→APPROVED: **HIGH** — требование SUP-20 + согласуется с WB action semantics.
- Data model (`ReturnDecision` + расширение `SupportTicket`): **HIGH** — соответствует требованиям SUP-19 и project conventions.
- Sync integration (расширение Phase 8 cron/sync): **HIGH** — переиспользует существующий код.
- UI architecture (таблица + panel): **HIGH** — повторяет паттерн Phase 8 + `/cards/wb`.
- Testing strategy: **HIGH** — повторяет проверенный паттерн Phase 8 (89 GREEN tests).
- `status`/`status_ex` enum semantic: **LOW** — не документировано, mitigated через non-use в бизнес-логике.
- Reconsider механика: **MEDIUM** — интуитивно из документации, но требует live validation (Wave 0).
- Token scope availability (bit 11): **UNKNOWN** — требует проверки на VPS (Wave 0 blocker).

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 дней — WB API стабильное; если WB публично выпустит обновлённую Swagger с enum-ями `status`/`status_ex` — обновить раздел 6).

## RESEARCH COMPLETE
