# Phase 12: Профиль покупателя + Мессенджеры — Research

**Researched:** 2026-04-18
**Domain:** Унификация покупателя в единый `Customer` через все каналы поддержки, ручной канал `MESSENGER` (Telegram/WhatsApp/other), merge дубликатов, страница профиля.
**Confidence:** HIGH — проверено против schema.prisma + lib/support-sync.ts + lib/wb-support-api.ts + research Phase 8/9/10/11; WB API ограничения подтверждены независимым WebSearch на dev.wildberries.ru (апрель 2026).

## Summary

Phase 12 сталкивается с **критическим противоречием между PRD и реальностью WB API**. Оригинальное требование SUP-32 — «автоматическая линковка тикетов к `Customer` через `wbUserId`» — **невыполнимо**: ни один из 4 использованных WB API (Feedbacks, Questions, Returns, Chat) не возвращает `wbUserId`, `userName` или любой стабильный идентификатор покупателя. Это подтверждено в Phase 8 (§9 Отсутствие идентификатора покупателя, HIGH confidence), Phase 9 (§Customer Risk 8), Phase 10 (§clientName — единственная доступная customer info) и ещё раз WebSearch по dev.wildberries.ru (апрель 2026, поле не появилось).

Фаза решает эту проблему **гибридной стратегией** (Вариант C):

1. **CHAT** — auto-create 1:1 с `chatID`. Каждая нить чата получает свой `Customer` с `name=clientName`. Это уже происходит в `lib/support-sync.ts:582-594` (Phase 10 пишет `customerNameSnapshot`), Phase 12 лишь добавляет второй write в `Customer` и выставляет `ticket.customerId`.
2. **FEEDBACK / QUESTION / RETURN** — `customerId` остаётся `null`, Customer НЕ создаётся автоматически. Линковка доступна только **вручную** через UI в диалоге тикета (новая кнопка «Связать с покупателем»).
3. **MESSENGER** (новый канал) — тикет создаётся вручную в форме `/support/new` с обязательным выбором существующего Customer или созданием нового (телефон + имя).
4. **Merge дубликатов** — transaction: update всех `SupportTicket.customerId = source → target`, затем hard-delete source `Customer`. Caller предупреждается toast: «Операция необратима».

**Primary recommendation:** Переформулировать SUP-32 в success criteria на **«Для CHAT канал при sync auto-create Customer 1:1 с chatID; для остальных каналов customerId остаётся null, линковка ручная»**. Это сохраняет 80% user value (видеть покупателя в чате как единого Customer с накоплением его переписки) без фантома «автолинковки», которую WB API не поддерживает.

## User Constraints (from CONTEXT.md)

CONTEXT.md для Phase 12 **ещё не создан** — будет сгенерирован в `/gsd:discuss-phase 12` после этого RESEARCH. В этом документе отражены **разумные defaults** на основе ROADMAP + REQUIREMENTS + additional_context исходного ТЗ; все они подлежат подтверждению в discuss.

### Likely Locked Decisions (to confirm in discuss-phase)

- **Scope:** SUP-32, SUP-33, SUP-34, SUP-35 (4 requirements Phase 12).
- **Канал MESSENGER:** Telegram / WhatsApp / OTHER (3 подтипа, хранятся в новом поле `SupportTicket.messengerType`).
- **Customer auto-create:** только для CHAT (Вариант C), остальные — ручная линковка.
- **Merge:** hard-delete source Customer + transaction update tickets. Undo не реализуется (deferred).
- **UI:** страница `/support/customers/[customerId]` профиль + форма `/support/new` для ручного MESSENGER тикета.
- **Язык/TZ:** русский, Europe/Moscow (CLAUDE.md).
- **RBAC:** read = `requireSection("SUPPORT")`, все write (create manual ticket, merge, edit note) = `requireSection("SUPPORT", "MANAGE")`.
- **Native select** (не base-ui Select).

### Likely Claude's Discretion

- **Формат подтипа мессенджера:** enum (`MessengerType { TELEGRAM, WHATSAPP, OTHER }`) vs `String?` — рекомендую **enum** для консистентности с TicketChannel/TicketStatus.
- **`messengerContact` формат:** одно свободное поле String (телефон ИЛИ username) vs два отдельных поля — рекомендую **одно поле String** с UI-подсказкой «@username или +79991234567», проще и достаточно для MVP.
- **Sidebar пункт «Покупатели»** (список всех Customer) — рекомендую **отложить** в v2 Phase 12.x или Phase 13. Доступ к Customer будет через тикет (клик на имя в диалоге) — этого достаточно для MVP из 4 SUP-требований.
- **ReplyPanel для MESSENGER:** — рекомендую **убрать ReplyPanel** у MESSENGER тикетов (канал внешний, ERP не отправляет). Вместо `ReplyPanel` показывать кнопку «Добавить сообщение» которая открывает модалку → создаёт локальный OUTBOUND/INBOUND `SupportMessage` без WB API. Это ведение журнала контактов вручную.
- **Как отображать «anonymous» покупателя:** badge `<Badge variant="outline">Без профиля</Badge>` vs линк на Customer `<Link>Иван П.</Link>`. Оба уместны, use обоих condition'ально.
- **Сколько тикетов показывать в профиле:** все, в chronological DESC, без пагинации на MVP (реалистично ≤ 50-100 тикетов на Customer первый год).

### Likely Deferred Ideas (OUT OF SCOPE v1.1)

- Auto-merge по fuzzy match (имя+телефон) — сложный, false-positive risk, не в требованиях.
- Merge undo / soft delete Customer — deferred.
- Отправка сообщений в Telegram/WhatsApp из ERP (интеграция с Bot API) — отдельный milestone.
- Sidebar список «Покупатели» — рассмотреть в v1.2.
- Customer.photo / avatar — deferred.
- Customer аналитика (LTV, частота покупок) — Phase 13.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SUP-32** | Автолинковка тикетов к `Customer` через `wbUserId`; если новый — create. | **Переформулирован под реальность WB API**: для CHAT канала — auto-create 1:1 с `chatID` (единственный канал с `clientName`). Для FEEDBACK/QUESTION/RETURN — customerId=null, линковка ручная. См. §WB API Customer Data Reality Check. |
| **SUP-33** | Страница профиля `/support/customers/[customerId]` — все тикеты по всем каналам + hvsетки (N отзывов/вопросов/чатов/возвратов), средний рейтинг, внутренняя заметка textarea. | Prisma запрос к Customer.include({tickets: {include: messages, wbCard через join по nmId}}). Aggregations: `groupBy({by:['channel']})` + `_avg.rating` для FEEDBACK. Inline note editing через debounced server action (паттерн GlobalRatesBar из Phase 7). |
| **SUP-34** | Ручное создание MESSENGER-тикета — форма (канал Tg/Wa/другое, телефон/имя, текст, опц. WbCard), `channel=MESSENGER`, `wbExternalId=null`. | Новая страница `/support/new` + server action `createManualMessengerTicket`. Создаёт `SupportTicket` + `SupportMessage` (INBOUND) + (optionally) `Customer` атомарно в транзакции. |
| **SUP-35** | Merge дубликатов Customer — выбор целевого → перенос тикетов + удаление исходного. | Transaction: `updateMany({where: {customerId: source}, data: {customerId: target}})` → `delete({where: {id: source}})`. Zod валидация: source ≠ target. |

## Standard Stack

### Core (already in project, no new installs)

| Библиотека | Версия | Purpose | Why Standard |
|------------|--------|---------|--------------|
| Prisma | 6.x | ORM для миграций и transactions | Проект-wide, паттерн Phase 7-11 |
| Next.js App Router | 15.5.14 | RSC + server actions + форма | Проект-wide |
| Zod | 4.3.6 | Валидация форм (телефон, имя, messengerContact) | Проект-wide, Phase 11 использует 4.x `z.enum([...], { message })` |
| React Hook Form | 7.72 | Форма `/support/new` и merge-диалог | Проект-wide |
| shadcn/ui v4 (base-nova) | — | Dialog, Button, Textarea, Input, Badge | Паттерн Phase 7-11 |
| sonner (toast) | — | success/error для create/merge actions | Паттерн проекта |

### Supporting

| Библиотека | Purpose | When to Use |
|------------|---------|-------------|
| Lucide icons | `Inbox` (MESSENGER уже есть), `MessageSquareDashed`, `Merge`, `UserPlus`, `Phone` | Иконки в UI |
| native `<select>` | Выбор MessengerType, MessengerType в фильтре | CLAUDE.md convention — НЕ base-ui Select |

### Alternatives Considered

| Вместо | Альтернатива | Tradeoff |
|--------|--------------|----------|
| Enum `MessengerType` в Prisma | `messengerType: String?` | Enum безопаснее (compile-check) + Prisma migrate создаёт PostgreSQL ENUM. String — гибче, но легко опечататься в коде. **Рекомендую enum**. |
| Hard-delete source Customer при merge | Soft-delete (`deletedAt`) | Hard проще. Customer не содержит критичных данных (только note + name+phone), тикеты уже перенесены. **Рекомендую hard-delete** (паттерн Reference Data в Phase 3). |
| Один `messengerContact: String?` | Два поля `messengerPhone`/`messengerUsername` | Одно поле проще UI, достаточно для журнала. **Рекомендую одно String**. |
| UI merge через отдельную страницу `/support/customers/[id]/merge` | Модалка в профиле | Модалка быстрее UX, переход на другую страницу избыточен. **Рекомендую модалку**. |

**Installation:** никаких новых npm-пакетов — все зависимости уже в проекте.

**Version verification (npm view):** не требуется — Phase 12 не добавляет зависимостей.

## Architecture Patterns

### Recommended Project Structure

```
prisma/
└── schema.prisma                         # ← миграция phase12_customer_messenger
                                          #   + enum MessengerType
                                          #   + SupportTicket.messengerType/messengerContact поля

app/
├── (dashboard)/support/
│   ├── customers/
│   │   └── [customerId]/
│   │       └── page.tsx                  # ← RSC профиль, 2-колонка (Customer info ←→ Tickets table)
│   └── new/
│       └── page.tsx                      # ← RSC + client form для MESSENGER ticket
└── actions/
    └── support.ts                        # ← расширить: createManualMessengerTicket, mergeCustomers,
                                          #   linkTicketToCustomer, createCustomerForTicket,
                                          #   updateCustomerNote (debounced)

lib/
└── support-sync.ts                       # ← расширить syncChats: auto-create Customer per chatID

components/
└── support/
    ├── customers/
    │   ├── CustomerProfile.tsx           # 2-колоночный layout
    │   ├── CustomerNoteEditor.tsx        # debounced textarea (паттерн GlobalRatesBar)
    │   ├── CustomerTicketsTable.tsx      # хронологический список тикетов по всем каналам
    │   ├── CustomerChannelStats.tsx      # итого по каналам + средний рейтинг
    │   └── MergeCustomerDialog.tsx       # модалка merge (selector target Customer)
    ├── LinkCustomerButton.tsx            # в TicketSidePanel — «Связать с покупателем»
    └── MessengerTicketForm.tsx           # форма /support/new
```

### Pattern 1: Auto-create Customer for CHAT при sync

**What:** Расширить `lib/support-sync.ts:syncChats()` чтобы при upsert тикета параллельно upsert-ить Customer с уникальностью по `chatID` (ab-used как unique wbUserId-сурогат) или по composite key. Поскольку `Customer.wbUserId @unique` уже есть в schema (line 527), можно переиспользовать: `wbUserId = "chat:${chatID}"` (префикс-namespacing).

**When to use:** только в `syncChats()`, только Phase B (Chat upsert). Phase A (events) — обновление customerNameSnapshot если надо, но Customer уже создан в Phase B.

**Example (pseudocode):**
```typescript
// lib/support-sync.ts в syncChats(), расширение блока for (const chat of chats)
const customerKey = `chat:${chat.chatID}`
const customer = await prisma.customer.upsert({
  where: { wbUserId: customerKey },
  create: { wbUserId: customerKey, name: chat.clientName },
  update: { name: chat.clientName }, // обновляем если WB сменил clientName
})

// ticket upsert — добавить customerId: customer.id в create и update
await prisma.supportTicket.upsert({
  where: { channel_wbExternalId: { channel: "CHAT", wbExternalId: chat.chatID } },
  create: { ..., customerId: customer.id },
  update: { ..., customerId: customer.id }, // идемпотентно
})
```

**Обоснование префикса `chat:`:** предотвращает конфликт, если WB когда-нибудь начнёт отдавать настоящий `wbUserId` (тогда добавим префикс `wb:` и Customer.wbUserId станет чистым идентификатором). `String?` поле позволяет хранить оба формата.

### Pattern 2: Manual Link Ticket to Customer

**What:** В `TicketSidePanel` добавить кнопку «Связать с покупателем» (доступна только если `ticket.customerId === null`). Открывает модалку с combobox: поиск Customer по имени/телефону. Выбор → server action `linkTicketToCustomer(ticketId, customerId)`. Альтернатива: «Создать нового покупателя» → inline форма (name, phone) → `createCustomerForTicket(ticketId, { name, phone })` → create Customer + set ticket.customerId.

**When to use:** для тикетов FEEDBACK/QUESTION/RETURN (где WB не даёт id). Для MESSENGER customerId уже есть при create.

### Pattern 3: Merge — Transaction + Hard-delete

**What:** `mergeCustomers(sourceId, targetId)` в транзакции: `updateMany SupportTicket где customerId=source → target`; `delete Customer где id=source`. Zod validates `source !== target`.

**When to use:** только из UI профиля или нового «Merge»-флоу. Нет массового merge по алгоритму — только вручную.

**Example:**
```typescript
await prisma.$transaction(async (tx) => {
  await tx.supportTicket.updateMany({
    where: { customerId: sourceId },
    data: { customerId: targetId },
  })
  await tx.customer.delete({ where: { id: sourceId } })
})
```

### Pattern 4: Inline Debounced Note Editing

Паттерн из Phase 7 `GlobalRatesBar`: textarea с `onChange` → `setTimeout(() => saveAction(value), 500ms)` с cleanup при unmount/перерисовке. Toast на success/error. Не блокирует input.

### Anti-Patterns to Avoid

- **Fuzzy auto-link по clientName между каналами** — WB предоставляет только первые буквы имени + инициал («Иван П.»). Сотни покупателей делят это написание. Auto-link → false positives → переписки Ивана Петрова утекают в профиль Ивана Поповa. **Запрещено.**
- **Customer.wbUserId = feedback.id** (или любой per-ticket id) — превращает Customer в псевдоним SupportTicket, запись на каждый тикет, никакой группировки. Уже обсуждалось и отклонено в Phase 8 §9.
- **Soft-delete Customer через `deletedAt`** — усложняет merge logic (нужен фильтр везде), а Customer не содержит значимой истории (тикеты перенесены, note переносится или теряется — UAT-решение). Hard-delete проще.
- **Cascade `onDelete: Cascade` от Customer к SupportTicket** — удаление Customer УДАЛИТ ВСЕ ЕГО ТИКЕТЫ. Текущая schema: `Customer? @relation(..., onDelete: SetNull)` — правильная. Не менять.

## Don't Hand-Roll

| Problem | Не строить | Вместо | Почему |
|---------|------------|--------|--------|
| Customer search combobox | Свой autocomplete с debounce | shadcn `Command` или существующий `CreatableCombobox` (Phase 3) | Уже в проекте, паттерн отлажен |
| Debounced textarea save | Свой useRef timer каждый раз | Переиспользовать паттерн `GlobalRatesBar` (Phase 7) | Проверенный код, те же edge cases |
| Фильтр MESSENGER в ленте | Новый фильтр-блок | `SupportFilters` уже имеет `MESSENGER` в `CHANNEL_OPTIONS` (page.tsx:17 — проверено) | Работает из коробки |
| Иконка MESSENGER | Новый SVG | `Inbox` из lucide (уже в channelIconMap SupportTicketCard:18) | Уже прописано |
| Merge confirmation dialog | Свой с модалкой-алертом | shadcn `Dialog` + double-confirmation (кнопка «Я понимаю») | Проверенный паттерн |
| Native phone parser / validator | libphonenumber или regex | Zod `.regex(/^[+\d\s()\-]{5,20}$/)` достаточно | MVP, phone — справочное поле, не автоматизация |

**Key insight:** Phase 12 почти полностью строится из существующих паттернов и компонентов — это преимущественно **UI-слой + одна миграция + одна расширенная функция sync**. Риск новых зависимостей минимален.

## Runtime State Inventory

> Рекомендация-тип: Не rename/refactor фаза — это greenfield + расширение. Секция сокращена до того что релевантно Phase 12.

| Категория | Items Found | Action Required |
|-----------|-------------|-----------------|
| Stored data | Нет существующих `Customer` записей в проде (проверено Phase 8 §9 — «записи не создаются»). Все `SupportTicket.customerId` сейчас NULL. | При выкате Phase 12 миграции: НЕ нужен backfill — все тикеты останутся с customerId=null, CHAT тикеты начнут линковаться при следующем cron sync через 5 минут автоматически. |
| Live service config | Нет — Phase 12 не взаимодействует с WB API напрямую (MESSENGER вручную). | Ничего. |
| OS-registered state | Нет — никаких новых cron timers, новых systemd services. | Ничего. |
| Secrets/env vars | Нет — никаких новых токенов. | Ничего. |
| Build artifacts | Нет — Prisma client перегенерируется по `schema.prisma` при build (`prisma generate` в deploy.sh). Новый enum `MessengerType` появится в `@prisma/client` автоматически. | Убедиться что `npm run build` запускает `prisma generate` (проверено — да, уже в scripts). |

**Backfill консидерация:** при выкате миграции возможно стоит для существующих CHAT тикетов (`channel=CHAT AND customerId=NULL`) один раз массово создать Customer + выставить customerId. Это можно сделать либо SQL-скриптом в миграции, либо одноразовой CLI-командой `npm run support:backfill-chat-customers`. **Рекомендую SQL в миграции** (атомарно, гарантирует consistency).

## Common Pitfalls

### Pitfall 1: Composite unique (channel, wbExternalId) конфликт для MESSENGER

**Что идёт не так:** MESSENGER тикеты всегда имеют `wbExternalId=NULL`. Создание 100 MESSENGER тикетов попадает в `@@unique([channel, wbExternalId])`.
**Почему:** PostgreSQL: `NULL ≠ NULL` в unique constraint — каждая NULL-пара уникальна, Prisma upsert по этому ключу для MESSENGER не работает (нельзя указать NULL в upsert.where).
**Как избежать:** для MESSENGER **не использовать upsert по composite key** — вместо этого `create` напрямую (ручное создание всегда генерирует новый тикет). Подтверждено в Phase 8 §Pitfall 6.
**Warning signs:** нет — проявится только если кто-то попытается заимствовать upsert-паттерн из syncChats в createManualMessengerTicket.

### Pitfall 2: Merge в самого себя (sourceId === targetId)

**Что идёт не так:** UI даёт выбрать того же Customer как target → `updateMany` становится no-op, но `delete` удаляет активный Customer со всеми перекинутыми на него же тикетами → все тикеты становятся orphan (`customerId` после transaction не обновляется в кэше, onDelete:SetNull срабатывает после `delete` → `customerId=null`).
**Почему:** Prisma транзакция коммитит `updateMany` до `delete` — Customer становится целью всех тикетов → `delete` делает их orphan через SetNull.
**Как избежать:** Zod валидация: `z.object({ sourceId, targetId }).refine(d => d.sourceId !== d.targetId, { message: "Нельзя объединить покупателя с самим собой" })`. UI также отфильтровывает current Customer из селектора target.
**Warning signs:** user report «после merge потерял всех тикетов у Иван П.»

### Pitfall 3: Merge loop / transitive merges

**Что идёт не так:** A → B → C: сначала merge A в B (A удалён, тикеты у B). Затем merge B в C. Никакой проблемы НЕТ на самом деле — все тикеты успешно переносятся на C. Это НЕ pitfall, но важно документировать.
**Как избежать:** Ничего — работает корректно. Документировать в CLAUDE.md «цепочки merge корректны».

### Pitfall 4: Note editor — lost update при одновременной работе

**Что идёт не так:** Два менеджера одновременно редактируют `Customer.note`. Debounced save обоих отправляет → последний wins → первый теряет свои правки.
**Почему:** ERP не имеет optimistic concurrency.
**Как избежать:** CLAUDE.md уже декларирует «last-write-wins acceptable» (см. Out of Scope «Real-time collaboration»). Не решаем, но документируем в UI tooltip «Заметка сохраняется автоматически. При конфликте побеждает последнее изменение.»
**Warning signs:** Жалобы на «мои правки пропали». Первые 3 месяца UAT покажет реальную частоту.

### Pitfall 5: `Customer.wbUserId` unique конфликт между Phase 12 автосозданием и будущими внешними sync

**Что идёт не так:** Phase 12 начнёт писать `wbUserId = "chat:${chatID}"`. Если в будущем WB добавит настоящий `wbUserId` (unlikely, но возможно), и мы попробуем создать Customer с настоящим `wbUserId = "123456"` на того же человека — unique key OK (namespacing префиксом работает). Но если два разных чата `chatID` с одним реальным `wbUserId` — у нас будет N Customer записей на одного человека.
**Как избежать:** Задокументировать: namespacing `chat:` — временная мера до появления реального wbUserId. При появлении — migration: создать вторичный unique index, при sync искать Customer сначала по `wbUserId: "${realWbUserId}"`, fallback на `chat:${chatID}`.
**Warning signs:** WB API добавил `wbUserId` в Chat response → запустить миграцию.

### Pitfall 6: FormData multipart в createManualMessengerTicket

**Что идёт не так:** Если форма Messenger включает прикрепление файла (фото скриншота чата) — нужно FormData, как ChatReplyPanel в Phase 10 (§Plan 10-03).
**Как избежать:** MVP — без прикреплений (только текст). Attach media deferred. Если потребуется позже — переиспользовать CHAT_UPLOAD_DIR/CHAT_MAX_FILE_BYTES паттерн из `app/actions/support.ts:28-35`.

## Code Examples

### Prisma schema (дополнения для phase12_customer_messenger migration)

```prisma
// prisma/schema.prisma — добавить после enum MediaType (~line 522)

enum MessengerType {
  TELEGRAM
  WHATSAPP
  OTHER
}

// SupportTicket model — добавить два поля (после customerNameSnapshot line ~575):

model SupportTicket {
  // ... existing fields ...

  // ── Phase 12: MESSENGER канал ──
  messengerType    MessengerType?  // только для channel=MESSENGER
  messengerContact String?         // "@username" или "+79991234567" — свободная строка

  // ... indexes ...
}
```

### syncChats — auto-create Customer (lib/support-sync.ts)

```typescript
// lib/support-sync.ts внутри syncChats, Phase B loop (line ~560)
for (const chat of chats) {
  try {
    // ── Phase 12: auto-upsert Customer по chatID ──
    const customerKey = `chat:${chat.chatID}`
    const customer = await prisma.customer.upsert({
      where: { wbUserId: customerKey },
      create: { wbUserId: customerKey, name: chat.clientName },
      update: chat.clientName ? { name: chat.clientName } : {},
    })

    // Existing ticket upsert — добавить customerId
    await prisma.supportTicket.upsert({
      where: { channel_wbExternalId: { channel: "CHAT", wbExternalId: chat.chatID } },
      create: { /* ... existing ... */, customerId: customer.id },
      update: { /* ... existing ... */, customerId: customer.id },
    })
  } catch (err) { /* ... */ }
}
```

### createManualMessengerTicket (app/actions/support.ts)

```typescript
// Pseudocode — полная реализация в Plan 12-03
const messengerTicketSchema = z.object({
  messengerType: z.enum(["TELEGRAM", "WHATSAPP", "OTHER"]),
  customerName: z.string().min(1).max(200),
  messengerContact: z.string().min(3).max(100), // phone or @username
  text: z.string().min(1).max(10000),
  nmId: z.number().int().positive().nullable(),
  customerId: z.string().nullable(), // link to existing OR null to create new
})

export async function createManualMessengerTicket(
  input: z.infer<typeof messengerTicketSchema>
): Promise<ActionResult & { ticketId?: string }> {
  await requireSection("SUPPORT", "MANAGE")
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: "Сессия без user.id" }

  const parsed = messengerTicketSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  const data = parsed.data
  const ticketId = await prisma.$transaction(async (tx) => {
    let customerId = data.customerId
    if (!customerId) {
      const c = await tx.customer.create({
        data: { name: data.customerName, phone: data.messengerContact },
      })
      customerId = c.id
    }
    const ticket = await tx.supportTicket.create({
      data: {
        channel: "MESSENGER",
        messengerType: data.messengerType,
        messengerContact: data.messengerContact,
        customerId,
        nmId: data.nmId,
        status: "NEW",
        previewText: data.text.slice(0, 140),
        lastMessageAt: new Date(),
      },
    })
    await tx.supportMessage.create({
      data: {
        ticketId: ticket.id,
        direction: "INBOUND",
        text: data.text,
        authorId: null, // покупатель
        wbSentAt: new Date(),
      },
    })
    return ticket.id
  })

  revalidatePath("/support")
  revalidatePath(`/support/${ticketId}`)
  return { ok: true, ticketId }
}
```

### mergeCustomers (app/actions/support.ts)

```typescript
const mergeSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
}).refine(d => d.sourceId !== d.targetId, {
  message: "Нельзя объединить покупателя с самим собой",
})

export async function mergeCustomers(
  input: z.infer<typeof mergeSchema>
): Promise<ActionResult & { ticketsMoved?: number }> {
  await requireSection("SUPPORT", "MANAGE")
  const parsed = mergeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  const { sourceId, targetId } = parsed.data

  try {
    const movedCount = await prisma.$transaction(async (tx) => {
      const source = await tx.customer.findUnique({ where: { id: sourceId } })
      const target = await tx.customer.findUnique({ where: { id: targetId } })
      if (!source || !target) throw new Error("Покупатель не найден")

      const upd = await tx.supportTicket.updateMany({
        where: { customerId: sourceId },
        data: { customerId: targetId },
      })
      await tx.customer.delete({ where: { id: sourceId } })
      return upd.count
    })
    revalidatePath(`/support/customers/${targetId}`)
    revalidatePath("/support")
    return { ok: true, ticketsMoved: movedCount }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" }
  }
}
```

### Customer profile page layout (app/(dashboard)/support/customers/[customerId]/page.tsx)

```typescript
export default async function CustomerProfilePage({ params }) {
  await requireSection("SUPPORT")
  const { customerId } = await params

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      tickets: {
        orderBy: { createdAt: "desc" },
        include: {
          assignedTo: { select: { name: true, firstName: true, lastName: true } },
          messages: { take: 1, orderBy: { sentAt: "asc" }, select: { text: true } },
        },
      },
    },
  })
  if (!customer) notFound()

  // Aggregations — в памяти, т.к. tickets уже загружены
  const byChannel = customer.tickets.reduce((acc, t) => {
    acc[t.channel] = (acc[t.channel] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const feedbackRatings = customer.tickets
    .filter(t => t.channel === "FEEDBACK" && t.rating != null)
    .map(t => t.rating!)
  const avgRating = feedbackRatings.length
    ? (feedbackRatings.reduce((a, b) => a + b, 0) / feedbackRatings.length).toFixed(2)
    : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
      <aside>
        <CustomerInfoCard customer={customer} />
        <CustomerChannelStats byChannel={byChannel} avgRating={avgRating} />
        <CustomerNoteEditor customerId={customerId} note={customer.note} />
        <MergeCustomerButton currentId={customerId} />
      </aside>
      <section>
        <CustomerTicketsTable tickets={customer.tickets} />
      </section>
    </div>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When | Impact |
|--------------|------------------|------|--------|
| PRD SUP-32 «auto-link по wbUserId при sync» | Hybrid (Вариант C): CHAT auto-create, остальные — manual link | 2026-04 research | SUP-32 переформулирован, success criteria пересмотрен в PLAN.md |
| Customer создаётся на каждый FEEDBACK/QUESTION (original ROADMAP draft) | Customer НЕ создаётся для FEEDBACK/QUESTION/RETURN в MVP | Phase 8 research | Phase 12 это решение сохраняет |
| Одно поле `messengerContact` для любого контакта | Enum `messengerType` + string `messengerContact` | Phase 12 | Позволяет сегментировать в фильтре и показывать иконку Tg/Wa |

**Deprecated/outdated:**
- Текст ROADMAP Success Criterion 1: «тикеты автоматически линкуются к Customer через wbUserId; если покупатель новый — создаётся запись» — применимо ТОЛЬКО к CHAT (Variant C). Нужна формулировка в Plan 12-01 VERIFICATION.md с уточнением.

## Open Questions

1. **Backfill стратегия для существующих CHAT тикетов**
   - Что мы знаем: на VPS уже есть N CHAT тикетов из Phase 10 (customerNameSnapshot заполнен, customerId=null).
   - Что непонятно: включать ли SQL в миграцию для массового создания Customer? Или полагаться на первый cron sync после деплоя (5 мин) который переупсертит все тикеты?
   - Рекомендация: **SQL в миграции** — атомарно, даёт корректную БД сразу после `prisma migrate deploy`. Отдельная заметка в deploy checklist.

2. **Как показывать MESSENGER-тикет в диалоге /support/[ticketId]**
   - Что мы знаем: SupportDialog уже обрабатывает все каналы, отображает messages.
   - Что непонятно: скрывать ReplyPanel полностью или показывать read-only с пояснением «Канал внешний — отвечайте в Telegram/WhatsApp»?
   - Рекомендация: **скрывать ReplyPanel**, показывать кнопку «+ Добавить сообщение в журнал» которая открывает модалку для ручной записи INBOUND/OUTBOUND (без WB API). MVP: можно пропустить кнопку вообще, только viewing. Финальное решение в discuss-phase.

3. **Customer selector в «Связать» flow — источник списка**
   - Что мы знаем: Customer может быть любого канала. Список может вырасти до сотен за год.
   - Что непонятно: показывать ВСЕХ Customer в combobox (с поиском) или только тех у которых уже есть тикеты? 
   - Рекомендация: **все + debounced поиск по имени/phone**, limit 20 в dropdown, больше — скролл/пагинация combobox.

4. **Сортировка тикетов в профиле**
   - Что мы знаем: «в хронологии» — но DESC (новые сверху) или ASC?
   - Рекомендация: **DESC** (новые сверху) — паттерн /support ленты.

5. **SupportTicket.customerNameSnapshot vs Customer.name** 
   - Что мы знаем: customerNameSnapshot (Phase 10) денормализован на ticket.
   - Что непонятно: при создании Customer для CHAT нужно ли синхронизировать оба поля? Что показывать в ленте — snapshot или joined Customer.name?
   - Рекомендация: **показывать `ticket.customer?.name ?? ticket.customerNameSnapshot ?? "покупатель"`** в UI. Snapshot — fallback, Customer.name — приоритет. Для FEEDBACK/QUESTION/RETURN без Customer будет fallback на «Покупатель #{id.slice(-6)}» (паттерн Phase 8/9).

## Environment Availability

> Phase 12 не использует внешних сервисов/API — секция минимальна.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | Prisma migration + transaction | ✓ (VPS + dev) | 16 | — |
| Node 20+ (crypto for Zod) | Form validation | ✓ | 20.x | — |
| vitest | Unit tests (merge, create) | ✓ | 4.1.4 | — |
| WB API | **НЕ используется** | n/a | — | — |

**Missing dependencies:** нет.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | `vitest.config.ts` (existing from Phase 7) |
| Quick run command | `npm run test -- --reporter=verbose --run <test-file>` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| SUP-32 | `syncChats()` auto-upsert Customer по chatID и выставляет ticket.customerId | unit | `npm run test -- --run support-sync-chats` | ✅ (extend existing file) |
| SUP-32 | Для FEEDBACK/QUESTION/RETURN sync **не создаёт** Customer (customerId=null) | unit | `npm run test -- --run support-sync-returns support-sync` | ✅ (existing — проверяют null) |
| SUP-33 | Aggregations (byChannel count, avg rating) корректны для Customer с тикетами всех каналов | unit | `npm run test -- --run customer-profile-aggregations` | ❌ Wave 0 |
| SUP-34 | `createManualMessengerTicket` — transaction create Customer + Ticket + INBOUND Message атомарно | unit | `npm run test -- --run manual-messenger-ticket` | ❌ Wave 0 |
| SUP-34 | Zod валидация messengerType/contact/text (min/max lengths, enum values) | unit | `npm run test -- --run manual-messenger-ticket` | ❌ Wave 0 |
| SUP-35 | `mergeCustomers` transaction: updateMany → delete, возвращает ticketsMoved count | unit | `npm run test -- --run merge-customers` | ❌ Wave 0 |
| SUP-35 | Zod отклоняет sourceId === targetId | unit | `npm run test -- --run merge-customers` | ❌ Wave 0 |
| SUP-35 | При ошибке в transaction (например, source не существует) — rollback полный | unit | `npm run test -- --run merge-customers` | ❌ Wave 0 |
| (crosscut) | `linkTicketToCustomer` для FEEDBACK/QUESTION/RETURN — успешно линкует существующего Customer | unit | `npm run test -- --run link-ticket-customer` | ❌ Wave 0 |
| (crosscut) | Cascade: delete Customer → tickets.customerId становится NULL (onDelete:SetNull) | unit | `npm run test -- --run merge-customers` | ❌ Wave 0 (часть merge test) |

### Sampling Rate
- **Per task commit:** `npm run test -- --run <тест файл задачи>` (< 5 сек)
- **Per wave merge:** `npm run test` (все ~25 test files, ~15-20 сек)
- **Phase gate:** полный `npm run test` GREEN + manual UAT (создать MESSENGER тикет, merge, profile page)

### Wave 0 Gaps

Перед Plan 12-01 implementation нужно создать (stubs, RED state):

- [ ] `tests/customer-profile-aggregations.test.ts` — pure aggregation logic тесты (count по каналам, avg rating)
- [ ] `tests/manual-messenger-ticket.test.ts` — `createManualMessengerTicket` happy path + Zod валидация (mock prisma $transaction как в support-actions.test.ts)
- [ ] `tests/merge-customers.test.ts` — `mergeCustomers` happy path + sourceId===targetId refusal + source not found error + cascade SetNull behavior
- [ ] `tests/link-ticket-customer.test.ts` — `linkTicketToCustomer` + `createCustomerForTicket` happy paths
- [ ] Расширение `tests/support-sync-chats.test.ts` — добавить 2-3 теста на Customer auto-upsert (mock prisma.customer.upsert, assert called with `wbUserId: "chat:${chatID}"`)

**Fixtures:** не требуются новые — MESSENGER и merge полностью локальны (нет WB API вовлечения). Reuse existing support fixtures для ticket structure.

## Risks & Unknowns

### Risk 1 — WB API может измениться и дать wbUserId

**Что:** В будущем WB добавит `wbUserId` в Feedbacks/Returns response. Наш дизайн (префикс `chat:` в wbUserId) не помешает добавить реальный wbUserId, но может потребовать миграцию для консолидации Customer-записей одного покупателя.
**Mitigation:** Документировать в CLAUDE.md namespacing. При изменении WB API — запустить backfill SQL который консолидирует duplicate Customer по новому `wbUserId`.
**Likelihood:** LOW — WB анонимизировал покупателей в 2024, вернуть userID — breaking change в protection-стратегии.

### Risk 2 — False positive manual link

**Что:** Менеджер в спешке линкует FEEDBACK к неверному Customer. Тикет теперь ошибочно в профиле.
**Mitigation:** В профиле Customer у каждого тикета добавить кнопку «Отвязать от этого покупателя» → ticket.customerId=null. Undo возможно.
**Likelihood:** MEDIUM — но recovery есть.

### Risk 3 — Merge undo

**Что:** Менеджер объединил покупателя ошибочно. Source Customer удалён, его note потерян.
**Mitigation:** Перед merge — confirmation dialog с явным текстом «После объединения профиль Иван Сидоров будет удалён. Заметка будет потеряна.» Опционально: запрашивать ввод слова «УДАЛИТЬ» как double-confirm. Undo через revert deferred.
**Likelihood:** MEDIUM. Deferred в v2 недостаточен — добавить в UAT явный чек-лист.

### Risk 4 — Performance Customer profile с 500+ тикетов

**Что:** Если один покупатель накопит 500+ CHAT сообщений → профиль грузится медленно.
**Mitigation:** Пагинация тикетов (limit 50, DESC), загрузка только preview (не messages fully). Проверить только при реальной жалобе — на MVP реалистично 10-30 тикетов на Customer.
**Likelihood:** LOW в MVP.

### Risk 5 — Двойной write при concurrent cron + manual

**Что:** Cron sync CHAT выполняется в тот же момент когда менеджер вручную линкует другого Customer к этому тикету. Cron пере-upsert-ит customerId обратно на auto-созданного.
**Mitigation:** Для CHAT тикетов manual override **запрещён** в UI (они уже auto-linked). Кнопка «Связать с покупателем» скрывается если `ticket.channel === "CHAT"`. Merge доступен — для переноса CHAT тикета под другой Customer через полноценный merge.
**Likelihood:** LOW с таким constraint.

## Plan Slicing Recommendation

Разбить Phase 12 на **Wave 0 + 3 плана** (по паттерну Phase 8/9/10/11).

### Wave 0: Infrastructure Spike (optional, если test stubs создавать заранее)

Короткий план на 10-15 минут:
- Создать RED test stubs: `tests/manual-messenger-ticket.test.ts`, `tests/merge-customers.test.ts`, `tests/link-ticket-customer.test.ts`, `tests/customer-profile-aggregations.test.ts`.
- Fixtures не нужны.
- Может быть объединён с Plan 12-01 как «Task 0» в Plan 12-01.
- **Рекомендация:** слить с Plan 12-01 (как в Phase 11-01, где Wave 0 stubs входили в Task 1).

### Plan 12-01: Foundation — Schema + Sync + Actions core

**Scope:**
- Prisma миграция `phase12_customer_messenger`:
  - `enum MessengerType { TELEGRAM, WHATSAPP, OTHER }`
  - `SupportTicket.messengerType MessengerType?`
  - `SupportTicket.messengerContact String?`
  - SQL backfill (опционально): для всех `channel=CHAT AND customerId=NULL` — create Customer с `wbUserId = 'chat:' || wbExternalId`, set customerId.
- `lib/support-sync.ts:syncChats()` — добавить Customer.upsert + привязка customerId в Phase B и Phase A.
- `app/actions/support.ts` — новые server actions:
  - `linkTicketToCustomer(ticketId, customerId)` 
  - `createCustomerForTicket(ticketId, { name, phone })` 
  - `updateCustomerNote(customerId, note)` (debounced)
  - `mergeCustomers(sourceId, targetId)`
  - `createManualMessengerTicket(input)`
- Wave 0 RED stubs для 5 новых тестов.
- Unit tests: расширить `support-sync-chats.test.ts` + 4 новых test files GREEN.

**Deliverables:** migration applied, 5 new actions, sync расширение, все unit tests GREEN. Без UI.

**Estimated tasks:** 3 (Task 1: schema+migration+types, Task 2: sync+actions, Task 3: tests).

### Plan 12-02: UI Profile + Link — страница /support/customers/[id] + LinkCustomerButton

**Scope:**
- RSC `app/(dashboard)/support/customers/[customerId]/page.tsx` — layout 2-колоночный.
- Клиентские компоненты:
  - `CustomerProfile.tsx` (wrapper)
  - `CustomerInfoCard.tsx` (name, phone, wbUserId badge, createdAt)
  - `CustomerChannelStats.tsx` (count по каналам + avg rating FEEDBACK)
  - `CustomerNoteEditor.tsx` (debounced textarea → updateCustomerNote)
  - `CustomerTicketsTable.tsx` (таблица тикетов с иконкой канала, датой, превью, статусом, ссылкой на /support/[ticketId])
- `LinkCustomerButton.tsx` — в `TicketSidePanel` (condition: customerId==null && channel !== "CHAT"):
  - Модалка с combobox Customer + «Создать нового» inline.
  - Уважает RBAC (только MANAGE).
- Добавить Link из ленты `/support` на profile: кликабельное имя покупателя в `SupportTicketCard` если customerId есть.

**Deliverables:** profile страница работает, note сохраняется с debounce, linking работает из диалога тикета.

**Estimated tasks:** 3 (Task 1: RSC page + aggregations, Task 2: components, Task 3: LinkCustomerButton + интеграция).

### Plan 12-03: Manual MESSENGER + Merge + UAT

**Scope:**
- Страница `app/(dashboard)/support/new/page.tsx` — RSC + client form:
  - MessengerTicketForm (React Hook Form, Zod):
    - native `<select>` для messengerType
    - Input customerName, messengerContact
    - Textarea text
    - Combobox WbCard (reuse из /support/auto-reply или /support/templates)
    - Combobox existing Customer (optional link vs create new)
  - Кнопка «Создать тикет» → server action → redirect на `/support/[ticketId]`.
- Кнопка «+ Новый тикет» в шапке `/support/page.tsx` → `/support/new`.
- `MergeCustomerDialog.tsx` — модалка в профиле:
  - Combobox target Customer (исключая current)
  - Preview: «Будет перенесено N тикетов. Профиль {current.name} удалён.»
  - Double-confirmation
  - Toast success → redirect на `/support/customers/{targetId}`.
- SupportDialog — для MESSENGER тикетов скрыть ReplyPanel (или показать disabled hint).
- SupportTicketCard — MESSENGER бэйдж + messengerType icon overlay (Telegram → `Send`, WhatsApp → `MessageCircle`, OTHER → `Inbox`).
- Deploy + UAT чек-лист:
  - [ ] Создать MESSENGER-тикет с Telegram
  - [ ] Увидеть его в /support ленте
  - [ ] Открыть профиль → все тикеты по каналам
  - [ ] Merge двух существующих Customer → проверить что tickets перенесены
  - [ ] Link FEEDBACK тикета к Customer → увидеть в профиле
  - [ ] Отредактировать note → перезагрузить страницу → сохранилось
  - [ ] CHAT тикет не показывает «Связать» кнопку (already linked)

**Deliverables:** MVP Phase 12 fully shipped на VPS, UAT пройден.

**Estimated tasks:** 3-4 (Task 1: /support/new + form, Task 2: Merge dialog + integration, Task 3: MESSENGER UI polish, Task 4: deploy + UAT).

---

## Sources

### Primary (HIGH confidence — существующая кодовая база)
- `prisma/schema.prisma` lines 489-534, 539-584 — Customer model, TicketChannel.MESSENGER, composite unique
- `lib/support-sync.ts` lines 542-645 — syncChats Phase A/B structure, customerNameSnapshot write
- `lib/wb-support-api.ts` lines 335-391 — Chat response types (clientName присутствует, wbUserId нет)
- `app/actions/support.ts` lines 1-80 — паттерн server actions
- `app/(dashboard)/support/page.tsx` lines 10-26 — MESSENGER уже в CHANNEL_OPTIONS
- `components/support/SupportTicketCard.tsx` lines 13-26 — channelIconMap содержит MESSENGER: Inbox
- `components/support/TicketSidePanel.tsx` — структура sidepanel для расширения
- `components/layout/nav-items.ts` lines 1-67 — NAV_ITEMS, без пункта «Покупатели» (подтверждает deferred)
- `.planning/phases/08-support-mvp/08-RESEARCH.md` §9 Отсутствие wbUserId — HIGH confidence базис стратегии
- `.planning/phases/10-chat-autoreply/10-RESEARCH.md` §Critical findings (clientName присутствует) + customerNameSnapshot usage
- `.planning/phases/09-returns/09-RESEARCH.md` §7 WB Returns API fields (wbUserId/buyerName отсутствуют) + Risk 8 Customer анонимность
- `.planning/phases/11-templates-appeals/11-RESEARCH.md` §applyTemplateVariables (customerNameSnapshot fallback "покупатель")

### Secondary (MEDIUM — документация WB API)
- [dev.wildberries.ru/en/docs/openapi/user-communication](https://dev.wildberries.ru/en/docs/openapi/user-communication) — Customer Communication docs (WB official, апрель 2026)
- [dev.wildberries.ru/en/release-notes](https://dev.wildberries.ru/en/release-notes) — release notes (орчудно подтверждает что wbUserId не появился в 2025-2026)

### Tertiary (LOW — WebSearch без прямой верификации)
- WebSearch "Wildberries Feedbacks API wbUserId userID customer anonymous 2026" — поиск не нашёл upcoming wbUserId поля. Косвенно подтверждает отсутствие.

## Metadata

**Confidence breakdown:**
- WB API Customer Data Reality: HIGH — тройная верификация (Phase 8/9/10 research + WebSearch 2026 + dev.wildberries.ru docs)
- Schema changes (enum MessengerType + 2 поля): HIGH — прямое чтение schema.prisma
- Auto-create Customer для CHAT: HIGH — логика очевидна из существующего кода + одно поле добавить
- Merge transaction pattern: HIGH — Prisma $transaction is first-class
- UI architecture: MEDIUM — общая структура ясна, детали combobox/форм будут уточнены в PLAN.md
- Wave 0 gap estimates: MEDIUM — 5 test files оценены, точное содержание при планировании
- Plan slicing: MEDIUM — 3 плана разумны, точное распределение задач — в PLAN.md

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (30 дней — стабильный домен, WB API не меняется быстро)

## RESEARCH COMPLETE

**Phase:** 12 - Профиль покупателя + Мессенджеры
**Confidence:** HIGH

### Key Findings
- **WB API не даёт wbUserId ни в одном канале** — подтверждено Phase 8/9/10 research + WebSearch 2026. SUP-32 в оригинальной форме невыполним.
- **Recommended strategy: Вариант C (Hybrid)** — для CHAT auto-create Customer 1:1 с chatID через prefix `chat:` в Customer.wbUserId; для FEEDBACK/QUESTION/RETURN — customerId=null, линковка ручная.
- **Schema минимум**: enum `MessengerType` + 2 поля на SupportTicket (`messengerType`, `messengerContact`). Customer/TicketChannel.MESSENGER уже есть в schema Phase 8.
- **Merge = simple transaction**: `updateMany tickets` + `delete source Customer`. Zod отсекает self-merge. Undo deferred.
- **Manual MESSENGER ticket** — новая форма `/support/new` + `createManualMessengerTicket` action (transaction create Customer optional + Ticket + INBOUND Message).
- **UI структура**: профиль `/support/customers/[id]` двухколоночный (info left / tickets table right) с debounced note editor (паттерн GlobalRatesBar).

### File Created
`.planning/phases/12-customer-messenger/12-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| WB API reality check | HIGH | Тройная верификация из 3 prior research + WebSearch 2026 |
| Schema changes | HIGH | Прямое чтение schema.prisma, расширение минимальное |
| Sync strategy | HIGH | 20 строк добавляется в существующую syncChats |
| Merge logic | HIGH | Prisma transaction — проверенный паттерн Phase 9 |
| UI architecture | MEDIUM | Общий дизайн ясен, детали combobox на PLAN.md |
| Plan slicing | MEDIUM | 3 плана, балансировка задач — в PLAN.md |

### Open Questions (handed to planner)
1. Backfill SQL для существующих CHAT тикетов — включать в миграцию? (рекомендую да)
2. ReplyPanel для MESSENGER тикетов — скрыть или disabled с hint?
3. Customer selector: все или только с тикетами? (рекомендую все + поиск)
4. Double-confirmation для merge: «введите УДАЛИТЬ» или простой confirm?
5. Sidebar «Покупатели» — отложить? (рекомендую да, v1.2)

### Ready for Planning
Research complete. Discuss-phase может уточнить открытые вопросы через прямую дискуссию с user. Planner создаст PLAN.md для Plan 12-01 (Foundation), 12-02 (UI Profile + Link), 12-03 (Manual MESSENGER + Merge + UAT).
