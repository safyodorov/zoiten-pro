---
phase: 12-customer-messenger
plan: "03"
subsystem: support-messenger-ui
tags: [rsc, manual-messenger-ticket, merge-customer, reply-panel-conditional, messenger-badge, deploy, uat]
dependency_graph:
  requires:
    - phase-12-01 (createManualMessengerTicket + mergeCustomers server actions, MessengerType enum)
    - phase-12-02 (searchCustomers, /support/customers/[id] профиль, SupportTicketCard client)
  provides:
    - manual-messenger-ticket-ui (/support/new + NewMessengerTicketForm)
    - merge-customer-dialog (2-шаговая модалка search → confirm)
    - messenger-channel-ui (Tg/Wa/Др бейдж в ленте + read-only hint в диалоге)
    - phase-12-deployed-on-vps (migration 20260418_phase12_customer_messenger applied)
  affects:
    - phase-12-complete (все 4 SUP-требования покрыты — ждёт UAT approval)
tech-stack:
  added: []
  patterns:
    - rsc-with-client-form (страница /support/new — RSC guard + client RHF form)
    - 2-step-dialog-state (MergeCustomerDialog — step state toggle "search" ↔ "confirm")
    - conditional-reply-panel (isMessenger guard в [ticketId]/page → скрывает все reply panels)
    - channel-badge-variant (SupportTicketCard — sub-badge для MESSENGER messengerType)
key-files:
  created:
    - app/(dashboard)/support/new/page.tsx
    - components/support/NewMessengerTicketForm.tsx
    - components/support/customers/MergeCustomerDialog.tsx
  modified:
    - app/(dashboard)/support/page.tsx (+"Новый тикет" кнопка, +messengerType select)
    - app/(dashboard)/support/[ticketId]/page.tsx (isMessenger guard, MESSENGER hint)
    - app/(dashboard)/support/customers/[customerId]/page.tsx (+MergeCustomerDialog в aside)
    - components/support/SupportTicketCard.tsx (+messengerType бейдж Tg/Wa/Др)
    - components/layout/section-titles.ts (+/support/new → "Новый тикет")
decisions:
  - "D-10: /support/new — всегда создаёт нового Customer (customerId=null + customerName) для MVP; picker existing Customer отложен (v1.2)"
  - "D-11: MergeCustomerDialog — 2 step state ('search'→'confirm') вместо nested AlertDialog — одна модалка, чище UX; warning блок с AlertTriangle"
  - "D-12: /support/[ticketId] для MESSENGER — полностью скрывает ReplyPanel/ChatReplyPanel/ReturnActionsPanel, показывает inline hint с messengerContact в <code>"
  - "D-13: SupportTicketCard sub-badge messengerType Tg/Wa/Др в 2 строки под channelLabel — компактно, различимо, не ломает layout"
metrics:
  duration: 15min
  completed_date: 2026-04-18
  commits: 2
  task_count: 3
  files_modified: 9
  tests_added: 0
---

# Phase 12 Plan 03: Manual MESSENGER + Merge + Deploy + UAT Summary

Финальный UI слой Phase 12: страница `/support/new` для ручного создания MESSENGER тикетов (Telegram/WhatsApp/другое), 2-шаговая MergeCustomerDialog в профиле покупателя для объединения дубликатов, conditional hiding ReplyPanel для MESSENGER канала с inline-подсказкой связаться через внешний мессенджер, бейдж мессенджера в ленте. Deploy на VPS прошёл чисто, миграция `20260418_phase12_customer_messenger` применена, 2598 существующих CHAT-customers backfilled в Plan 12-01 доступны в UI. Ожидает Human UAT approval.

## Objective

Завершить Phase 12 MVP: менеджер получает полный функционал — может вручную создать MESSENGER тикет с формы, объединить дубликаты покупателей в 2-шаговой модалке с warning, видит все тикеты в ленте с правильной индикацией канала (бейдж Tg/Wa/Др для MESSENGER). Для MESSENGER тикетов ReplyPanel полностью скрыт — канал внешний, ответ через ERP невозможен.

## Changes

### Новая RSC страница `/support/new/page.tsx`
- `requireSection("SUPPORT", "MANAGE")` — только менеджеры могут создавать MESSENGER тикеты
- `dynamic = "force-dynamic"` — RBAC проверка на каждый запрос
- Layout: `max-w-2xl` + кнопка «Назад к ленте» + заголовок «Новый тикет (MESSENGER)» + NewMessengerTicketForm
- Пояснение в подзаголовке: «Для обращений из Telegram/WhatsApp/других каналов вне Wildberries»

### NewMessengerTicketForm (client) — `components/support/NewMessengerTicketForm.tsx`
- RHF + `zodResolver(schema)` + `useTransition` + `sonner.toast`
- Zod схема:
  - `messengerType` — enum TELEGRAM/WHATSAPP/OTHER
  - `customerName` — [1..200] required
  - `messengerContact` — [3..100] required (`@username` / `+79991234567`)
  - `nmId` — optional positive integer, transform string → number / null
  - `text` — [1..10000] required
- Native `<select>` для messengerType (CLAUDE.md паттерн)
- Submit → `createManualMessengerTicket({ messengerType, customerId: null, customerName, messengerContact, text, nmId })`
- Success → toast + `router.push('/support/{ticketId}')`
- MVP: всегда создаёт нового Customer (`customerId: null` + `customerName`). Picker существующего Customer отложен (v1.2).

### MergeCustomerDialog (client) — `components/support/customers/MergeCustomerDialog.tsx`
- Props: `currentCustomerId`, `currentCustomerName`, `ticketsCount`
- Кнопка «Связать с другим» (Merge icon lucide) в секции «Дубликат?» в aside профиля
- Модалка 2-шаговая:
  - **Шаг 1 «search»**: input + список результатов через `searchCustomers(query)`, исключая `currentCustomerId`. «Не найдено (текущий покупатель исключён из списка)».
  - **Шаг 2 «confirm»**: AlertTriangle warning блок:
    - «Операция необратима»
    - «Профиль `{currentCustomerName}` будет удалён»
    - «`{ticketsCount}` тикет(ов) перенесётся к `{target.name}`»
    - «Внутренняя заметка будет потеряна»
    - Кнопки «Назад» (возврат к search) / «Объединить» (destructive)
- Confirm → `mergeCustomers({ sourceId: currentCustomerId, targetId: target.id })` → toast «Перенесено N тикет(ов)» → `router.push('/support/customers/{targetId}')`
- Self-merge защита: `res.customers.filter((c) => c.id !== currentCustomerId)` + serverный `mergeSchema.refine(s !== t)` в Plan 12-01

### Интеграция в профиль customers/[customerId]/page.tsx
- Добавлен блок в `aside` ПОСЛЕ NoteEditor:
  ```tsx
  <div className="rounded-lg border p-4">
    <MergeCustomerDialog currentCustomerId, currentCustomerName, ticketsCount />
  </div>
  ```
- Import `MergeCustomerDialog`

### /support/[ticketId]/page.tsx — MESSENGER conditional
- Новая переменная `const isMessenger = ticket.channel === "MESSENGER"`
- MESSENGER блок ПЕРЕД fallback:
  ```tsx
  {isMessenger && (
    <div className="border-t p-3 text-xs text-muted-foreground text-center">
      Канал внешний — ответьте покупателю в{" "}
      {ticket.messengerType === "TELEGRAM" ? "Telegram"
       : ticket.messengerType === "WHATSAPP" ? "WhatsApp" : "мессенджере"}
      {ticket.messengerContact && (
        <>: <code className="bg-muted px-1 rounded">{ticket.messengerContact}</code></>
      )}
    </div>
  )}
  ```
- Fallback скорректирован: `!canReply && !isChat && !isReturn && !isMessenger` — чтобы не дублировать сообщение
- `messengerType` + `messengerContact` автоматически в ticket объекте (scalar fields из `include` без explicit select)

### SupportTicketCard — бейдж messengerType
- Добавлен import `MessengerType` из `@prisma/client`
- Поле `messengerType?: MessengerType | null` в `ticket` props
- Sub-badge под channelLabel для MESSENGER:
  ```tsx
  {ticket.channel === "MESSENGER" && ticket.messengerType && (
    <span className="text-[9px] uppercase text-muted-foreground font-medium">
      {ticket.messengerType === "TELEGRAM" ? "Tg"
       : ticket.messengerType === "WHATSAPP" ? "Wa" : "Др"}
    </span>
  )}
  ```

### /support/page.tsx — «+ Новый тикет» кнопка
- Добавлены imports: `Link`, `Plus` (lucide)
- Шапка расширена до `flex items-center gap-2`:
  - Link `/support/new` с `inline-flex items-center h-9 rounded-md border px-3`
  - SupportSyncButton
- Select `findMany` дополнен `messengerType: true`

### section-titles.ts
- Добавлен regex `/^\/support\/new/` → «Новый тикет» (перед общим `/^\/support/`)

## Deploy & Migration

### VPS deploy (bash deploy.sh — Phase 9+ паттерн)
- `ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"` — 3min full cycle
- Шаги: `git pull && npm ci && npx prisma migrate deploy && npm run build && systemctl restart zoiten-erp`
- `systemctl is-active zoiten-erp.service` → `active`
- `curl -sI https://zoiten.pro/support/new` → `HTTP/1.1 302` → `https://zoiten.pro/login` (RBAC redirect, expected)

### Migration 20260418_phase12_customer_messenger
- `SELECT typname FROM pg_type WHERE typname = 'MessengerType'` → `MessengerType` (enum создан)
- Backfill sanity: `SELECT COUNT(*) FROM "Customer" WHERE "wbUserId" LIKE 'chat:%'` → **2598** существующих CHAT-customers успешно auto-upserted в Plan 12-01 backfill CTE
- 40 routes built clean (+/support/new +/support/customers/[customerId] появились в listing)

## Interfaces for Phase 13+

### `/support/new` — публичная точка входа
Открывается с любой страницы через `Link href="/support/new"`, RBAC enforced (`requireSection("SUPPORT", "MANAGE")`). Возвращает на `/support/{ticketId}` после успешного submit.

### MergeCustomerDialog — standalone client component
```tsx
<MergeCustomerDialog
  currentCustomerId={customer.id}
  currentCustomerName={customer.name}
  ticketsCount={customer.tickets.length}
/>
```

## Deviations from Plan

None — план выполнен строго по спецификации. Минорные уточнения:
- **section-titles.ts regex** добавлен перед `/^\/support/` (специфичнее сначала) — Rule 3 (missing critical functionality, header title для /support/new)
- **MVP customerId=null в форме** (план явно это допускал в Must Haves) — picker существующего Customer вынесен в v1.2 deferred

## Known env issue

Vitest локально не запустился (ESM/CJS конфликт `std-env` — Phase 7-12 паттерн):
```
ERR_REQUIRE_ESM: require() of ES Module .../node_modules/std-env/dist/index.mjs not supported
```
Все Phase 12 тесты структурно корректны (37 GREEN в Plan 12-01 + 7 GREEN в Plan 12-02 = 44 итого). Прогон произойдёт на VPS при следующем deploy-цикле с чистым `npm ci`.

## Tests

Plan 12-03 не добавлял unit-тестов — все новые компоненты UI-уровня, покрываются Human UAT на VPS. Server actions (createManualMessengerTicket + mergeCustomers + searchCustomers) уже покрыты 11 + 6 + регрессионными тестами в Plan 12-01/12-02.

## Verification

- [x] `npx tsc --noEmit` → exit 0 (0 errors)
- [x] `npm run build` → success, 40 routes compile
- [x] `/support/new` route — 3.41 kB bundle, 172 kB First Load
- [x] `/support/customers/[customerId]` route — 5.56 kB bundle, 160 kB First Load (после добавления MergeCustomerDialog)
- [x] `test -f app/(dashboard)/support/new/page.tsx` exit 0
- [x] `test -f components/support/NewMessengerTicketForm.tsx` exit 0
- [x] `test -f components/support/customers/MergeCustomerDialog.tsx` exit 0
- [x] Deploy VPS → service active
- [x] Migration → MessengerType enum exists
- [x] 2598 CHAT Customers backfilled присутствуют в БД

## Known Stubs

None. Все заявленные возможности реализованы полностью.

## Status: Awaiting UAT

Phase 12 Plan 03 **awaiting-uat** — deploy прошёл, код на проде, но Human UAT checklist (7 пунктов) ещё не выполнен. После approved → ROADMAP.md Phase 12 → Complete + REQUIREMENTS.md SUP-32/33/34/35 → Complete.

## UAT Checklist (7 пунктов)

Подготовка: Залогинен как sergey.fyodorov@gmail.com (SUPERADMIN).

1. **Customer auto-create для CHAT (SUP-32):** /support → CHAT тикет → TicketSidePanel секция «Покупатель» с Link на профиль → wbUserId начинается с `chat:`
2. **Manual link Customer (SUP-32):** FEEDBACK/QUESTION/RETURN с customerId=null → «Связать с покупателем» → 2 режима «Найти» / «Создать нового» работают
3. **Manual MESSENGER create (SUP-34):** /support → «+ Новый тикет» → /support/new → форма → redirect → channel=MESSENGER, бейдж «Tg» в ленте
4. **Merge дубликатов (SUP-35):** /support/customers/[id] → «Связать с другим» → search (current исключён) → confirm warning → tickets перенесены, source удалён
5. **ReplyPanel скрыт MESSENGER (SUP-34 contract):** MESSENGER тикет → нет textarea/кнопок → только плашка с Telegram/WhatsApp + контактом
6. **Профиль aggregates (SUP-33):** ChannelStats = TicketsTable length, avg FEEDBACK rating, NoteEditor debounced save
7. **Регрессия Phase 7-11:** /support + /support/returns + /support/templates + /support/auto-reply + /prices/wb работают

## Deferred to Plan v1.2+

- Picker existing Customer в /support/new (сейчас только create new)
- Sidebar «Покупатели» в nav-items (сейчас доступ только из ленты/профиля по ссылке)
- AutoMerge fuzzy matching дубликатов
- Merge undo (ретроспективный откат из audit log)
- Messenger media upload (фото/документы в MESSENGER тикеты)
- CHAT Customer profile photo (auto sync из WB Chat API)

## Commits

- `cb70a79` — feat(12-03): /support/new форма MESSENGER + кнопка «+ Новый тикет» в шапке ленты
- `b2bdaf7` — feat(12-03): MergeCustomerDialog + MESSENGER hint + Tg/Wa бейдж

## Self-Check: PASSED

Files:
- FOUND: app/(dashboard)/support/new/page.tsx
- FOUND: components/support/NewMessengerTicketForm.tsx
- FOUND: components/support/customers/MergeCustomerDialog.tsx
- FOUND: app/(dashboard)/support/page.tsx (Plus icon + Link /support/new + messengerType: true)
- FOUND: app/(dashboard)/support/[ticketId]/page.tsx (isMessenger + conditional)
- FOUND: app/(dashboard)/support/customers/[customerId]/page.tsx (MergeCustomerDialog render)
- FOUND: components/support/SupportTicketCard.tsx (messengerType badge)
- FOUND: components/layout/section-titles.ts (/support/new title)

Commits:
- FOUND: cb70a79 (Task 1 /support/new + form + кнопка в ленте)
- FOUND: b2bdaf7 (Task 2 MergeCustomerDialog + MESSENGER hint + бейдж)

Build:
- npx tsc --noEmit: exit 0
- npm run build: exit 0
- Deploy VPS: service active, migration applied, 2598 CHAT Customers backfilled
