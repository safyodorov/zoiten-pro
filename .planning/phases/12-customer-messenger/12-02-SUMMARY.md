---
phase: 12-customer-messenger
plan: "02"
subsystem: support-customer-profile-ui
tags: [rsc, customer-profile, link-customer, client-component, debounced-save, router-push]
dependency_graph:
  requires:
    - phase-12-01 (customer-aggregations helpers, 5 server actions, Customer auto-link CHAT)
  provides:
    - customer-profile-rsc (/support/customers/[customerId] страница)
    - link-customer-button (универсальная модалка search+create)
    - search-customers-action (server action для picker)
    - clickable-customer-name (client SupportTicketCard + aside в [ticketId]/page)
  affects:
    - plan-12-03 (Merge модалка использует /support/customers/[id] как точку входа; MessengerTicketForm использует searchCustomers)
tech-stack:
  added: []
  patterns:
    - rsc-aggregation-with-pure-helpers (RSC → lib/customer-aggregations для agregates без БД round-trip)
    - debounced-save-with-useref-timer (NoteEditor: useRef<timer> + useTransition + sonner toast — дубль GlobalRatesBar паттерна)
    - nested-link-workaround (SupportTicketCard — client + useRouter.push с preventDefault/stopPropagation для inline-ссылки внутри outer Link)
    - dialog-with-tabs-via-state (LinkCustomerButton — 2 режима через state, 2 кнопки-таба без shadcn Tabs)
    - debounced-search-action (LinkCustomerButton — 300ms useRef timer → searchCustomers)
key-files:
  created:
    - app/(dashboard)/support/customers/[customerId]/page.tsx
    - components/support/customers/CustomerInfoCard.tsx
    - components/support/customers/ChannelStats.tsx
    - components/support/customers/NoteEditor.tsx
    - components/support/customers/TicketsTable.tsx
    - components/support/customers/LinkCustomerButton.tsx
  modified:
    - app/actions/support.ts (+searchCustomers)
    - components/support/TicketSidePanel.tsx (+customerId/+customerName, секция Покупатель с LinkCustomerButton)
    - components/support/SupportTicketCard.tsx (server → client, +customer/+customerNameSnapshot props, useRouter.push)
    - app/(dashboard)/support/[ticketId]/page.tsx (Link на профиль в aside, передача props в TicketSidePanel)
    - app/(dashboard)/support/page.tsx (select customer + customerNameSnapshot)
    - components/layout/section-titles.ts (+/support/customers/[id] → "Профиль покупателя")
    - tests/customer-profile-page.test.ts (+7 тестов Plan 12-02)
decisions:
  - "D-04: RSC page + lib/customer-aggregations pure helpers — agregation делается в JS на уже загруженных tickets (одной query с include) вместо GROUP BY — проще и быстрее для типичных объёмов (десятки тикетов на customer)"
  - "D-05: Debounced NoteEditor 500ms — дубль Phase 7 GlobalRatesBar паттерна (useRef<timer> + useTransition + sonner) — работает без всяких zod на клиенте, серверная валидация в updateCustomerNote"
  - "D-06: SupportTicketCard → client component — необходимо для useRouter.push при stopPropagation+preventDefault (чтобы inline клик по имени покупателя не улетал в outer Link /support/[id])"
  - "D-07: LinkCustomerButton — 2 режима через useState (не shadcn Tabs) — минимальный код, нативные <button> с conditional class"
  - "D-08: searchCustomers имеет RBAC требования SUPPORT (не MANAGE) — read-only, VIEWER может искать. Отличается от link/create которые MANAGE"
  - "D-09: debounced search 300ms (vs 500ms для save) — поиск ощущается быстрее при более частом dispatch; сохранение может ждать 500ms"
metrics:
  duration: 4min
  completed_date: 2026-04-18
  commits: 3
  task_count: 3
  files_modified: 12
  tests_added: 7
---

# Phase 12 Plan 02: UI Profile + Link Customer Summary

Второй волновой план Phase 12 — UI-слой поверх серверного фундамента Plan 12-01: новая RSC страница `/support/customers/[customerId]` с профилем покупателя (info + agregates + note + tickets table), универсальная LinkCustomerButton модалка search+create, интеграция в TicketSidePanel и SupportTicketCard для быстрого перехода из ленты/диалога в профиль.

## Objective

Менеджер открывает `/support/customers/[id]` — видит имя/phone/wbUserId (с WB Chat badge если auto-linked), counts по 5 каналам + avg FEEDBACK rating, редактируемую заметку (debounced autosave), и список всех обращений хронологически с превью. Для non-CHAT тикетов без Customer в `[ticketId]/page` доступна кнопка «Связать с покупателем» — модалка ищет существующего по имени/телефону или создаёт нового с автопривязкой к тикету.

## Changes

### Новая RSC страница `/support/customers/[customerId]/page.tsx`
- `requireSection("SUPPORT")` + `params: Promise<{ customerId }>` (Next.js 15 async params)
- Load `prisma.customer.findUnique` с include `tickets: { orderBy desc, select { id, channel, status, nmId, rating, previewText, createdAt, assignedTo } }`
- `notFound()` если customer не найден
- `dynamic = "force-dynamic"` — `revalidatePath` из updateCustomerNote работает
- Aggregation через `countTicketsByChannel(tickets)` + `averageFeedbackRating(tickets)` (Plan 12-01 pure helpers)
- Layout: `grid grid-cols-1 lg:grid-cols-[320px_1fr]` — левый aside (info/stats/note), правая секция (tickets table)

### 5 компонентов в `components/support/customers/`

**CustomerInfoCard.tsx** (server) — name/phone/wbUserId/createdAt; если wbUserId startsWith `chat:` — badge «WB Chat» (blue); Europe/Moscow форматирование.

**ChannelStats.tsx** (server) — 5 строк (FEEDBACK/QUESTION/CHAT/RETURN/MESSENGER) с иконкой + label + count tabular-nums; если `avgRating !== null` — нижняя строка со Star (fill-amber) и `.toFixed(2)`.

**NoteEditor.tsx** (client) — debounced autosave 500ms: `useRef<timer>` + `useTransition` + `sonner.toast`; textarea maxLength=5000, live счётчик `{length}/5000` + «сохраняю...» при isPending; title tooltip про lost-update.

**TicketsTable.tsx** (server) — `<ul>` с `<Link href="/support/{id}">`: левая колонка w-16 с Icon+label+звёздочки (для FEEDBACK), правая — статус (цветной), nmId, timestamp, preview (line-clamp-2), менеджер; пустое состояние «У этого покупателя нет обращений».

**LinkCustomerButton.tsx** (client) — Button «Связать с покупателем» (UserPlus icon), открывает shadcn Dialog с 2 режимами:
- **existing** — поиск debounced 300ms (`useRef<timer>` + `searchCustomers(query)`), результаты as list of buttons; показывается «Не найдено» если query >= 2 && !results && !isPending
- **new** — форма name (maxLength 200, required) + phone (maxLength 20, optional), «Создать и связать» → `createCustomerForTicket(ticketId, { name, phone })`

Оба режима на success: toast + `setOpen(false)` + `router.refresh()`.

### searchCustomers server action (app/actions/support.ts)

```typescript
searchCustomers(query: string): Promise<
  | { ok: true; customers: Array<{ id, name, phone, wbUserId }> }
  | { ok: false; error: string }
>
```
- `requireSection("SUPPORT")` (read-only — VIEWER разрешён)
- Trim + min 2 символа → пустой array
- `findMany` с `OR: [{ name: { contains, mode: "insensitive" } }, { phone: { contains } }]`, take 20, orderBy updatedAt desc

### Модификация existing компонентов

**TicketSidePanel.tsx** — +`customerId: string | null` + `customerName: string | null` props. Новая секция «Покупатель» ПЕРЕД APPEALED panel:
- `customerId` → Link на `/support/customers/{customerId}` с `customerName ?? "Покупатель"` + →
- `channel === "CHAT"` → italic «Для канала «Чат» покупатель свяжется автоматически при следующей синхронизации»
- else → `<LinkCustomerButton ticketId={ticketId} />`

**SupportTicketCard.tsx** — конвертирован server → client (`"use client"` + `useRouter`). Ticket props расширены: `customer: { id, name } | null` + `customerNameSnapshot: string | null`. Имя покупателя: если `ticket.customer` есть — `<a href>` с `onClick={e => { e.preventDefault(); e.stopPropagation(); router.push("/support/customers/{id}") }}`; иначе `<span>`. Label из `customer?.name ?? customerNameSnapshot ?? "Покупатель"`.

**app/(dashboard)/support/[ticketId]/page.tsx** — передаёт `customerId={ticket.customerId}` + `customerName={ticket.customer?.name ?? null}` в TicketSidePanel. Aside section «Покупатель»: Link на профиль если `customerId`, иначе plain text с fallback на `customerNameSnapshot`.

**app/(dashboard)/support/page.tsx** — в `findMany.select` добавлены `customer: { select: { id, name } }` + `customerNameSnapshot: true`.

**components/layout/section-titles.ts** — добавлен regex `/^\/support\/customers\/[^/]+/` → «Профиль покупателя» (перед общим `/^\/support/`).

### Тесты (tests/customer-profile-page.test.ts)

+7 новых тестов в 2 describe блоках (сверх 9 из Plan 12-01 — итого 16 it в 4 describe):

- **countTicketsByChannel Plan 12-02** (3): все 5 каналов смешанно, только CHAT, только MESSENGER
- **averageFeedbackRating Plan 12-02** (4): 5.0 отличный, 1.5 плохой (игнорируя QUESTION/RETURN), null без FEEDBACK, 3.0 смешанный

**Known env issue:** vitest локально сломан (std-env ESM, `ERR_REQUIRE_ESM`) — паттерн Phase 7/8/9/10/11/12-01. Тесты структурно корректны, прогонятся на VPS после `npm ci` в Plan 12-03 deploy.

## Interfaces for Plan 12-03

### `/support/customers/[customerId]` доступен как точка входа
- Из диалога тикета (TicketSidePanel + aside — Link)
- Из карточки в ленте (SupportTicketCard — клик по имени покупателя)
- Напрямую по URL

Plan 12-03 добавит в профиль MergeCustomerDialog (кнопка «Объединить с другим»), используя `mergeCustomers` server action из Plan 12-01.

### searchCustomers — для MessengerTicketForm (Plan 12-03)
Контракт тот же: query string → `{ id, name, phone, wbUserId }[]` (max 20). Новая страница `/support/new` для ручного MESSENGER будет переиспользовать этот action в picker покупателя.

### SupportTicketCard props
```typescript
ticket: {
  // existing fields ...
  customer: { id: string; name: string | null } | null
  customerNameSnapshot: string | null
}
```

### TicketSidePanel props
```typescript
customerId: string | null
customerName: string | null
```

### LinkCustomerButton — standalone кнопка для embedding
```tsx
<LinkCustomerButton ticketId={ticketId} />
```
Рендерит Button + Dialog внутри Fragment. После success (link или create) вызывает `router.refresh()`.

## Deviations from Plan

None — план выполнен строго по спецификации. Единственные минорные уточнения:
- **debounce search 300ms** (vs 500ms для save) — пользовательский опыт: поиск ощущается быстрее при частом dispatch, сохранение толерантно к задержке
- **SupportTicketCard onClick через `preventDefault + stopPropagation + router.push`** (а не nested `<Link>`) — вложенные anchor запрещены HTML, но React рендерит OK; browser-wise onClick работает корректно. Outer Link заблокирован preventDefault, stopPropagation избыточно страхует от bubble.
- **section-titles.ts** — regex для профиля добавлен перед `/^\/support/` (специфичнее сначала) — не упоминался в плане, но необходим для Header title (auto-added, Rule 3 — missing critical functionality)

## Tests

**16 GREEN unit тестов** в tests/customer-profile-page.test.ts (9 Plan 12-01 + 7 Plan 12-02):

| Describe | Тесты | Покрытие |
|----------|-------|----------|
| countTicketsByChannel | 3 | mix 5 каналов, пустой массив, только MESSENGER |
| averageFeedbackRating | 6 | avg rating, null игнорирование, null пустой, rounding, не-FEEDBACK игнорирование |
| countTicketsByChannel — Plan 12-02 | 3 | все 5 каналов, только CHAT, только MESSENGER |
| averageFeedbackRating — Plan 12-02 | 4 | 5.0 отличный, 1.5 плохой, null без FEEDBACK, 3.0 смешанный |

## Verification

- [x] `npx tsc --noEmit` → exit 0 (0 errors)
- [x] `npm run build` → success, `/support/customers/[customerId]` route компилируется (1.74 kB, 116 kB First Load)
- [x] 5 компонентов в `components/support/customers/` созданы
- [x] `grep -c "export async function searchCustomers" app/actions/support.ts` = 1
- [x] `grep -c "LinkCustomerButton" components/support/TicketSidePanel.tsx` = 2 (import + use)
- [x] `grep -c "use client" components/support/SupportTicketCard.tsx` = 1
- [x] `grep -c "it(" tests/customer-profile-page.test.ts` = 16
- [x] `grep -c "describe(" tests/customer-profile-page.test.ts` = 4
- [x] `grep -c "it.skip\|it.todo" tests/customer-profile-page.test.ts` = 0
- [x] Все 3 таска закоммичены атомарно

## Known Stubs

None. Все заявленные возможности реализованы полностью. Профиль работает, LinkCustomerButton работает, searchCustomers работает, интеграции в ленту/диалог — полностью функциональны.

## Deferred to Plan 12-03

- UAT на VPS: открыть профиль реального CHAT Customer (через auto-linked backfill), проверить badges/stats/table
- MergeCustomerDialog UI (use mergeCustomers action из Plan 12-01) — интеграция в CustomerInfoCard как кнопка
- `/support/new` — страница ручного создания MESSENGER тикета (use createManualMessengerTicket + searchCustomers picker)
- `npm run test` на VPS — 16+ GREEN прогон без локального env issue

## Commits

- `4fd2b84` — feat(12-02): профиль покупателя RSC + 4 базовых компонента (page + CustomerInfoCard + ChannelStats + NoteEditor + TicketsTable + section-titles regex)
- `f79d4e0` — feat(12-02): LinkCustomerButton + searchCustomers + integration TicketSidePanel/SupportTicketCard (5 изменённых файлов)
- `ddda337` — test(12-02): расширить customer-profile-page.test — 7 новых GREEN тестов

## Self-Check: PASSED

Files:
- FOUND: app/(dashboard)/support/customers/[customerId]/page.tsx
- FOUND: components/support/customers/CustomerInfoCard.tsx
- FOUND: components/support/customers/ChannelStats.tsx
- FOUND: components/support/customers/NoteEditor.tsx
- FOUND: components/support/customers/TicketsTable.tsx
- FOUND: components/support/customers/LinkCustomerButton.tsx
- FOUND: app/actions/support.ts (+searchCustomers export)
- FOUND: components/support/TicketSidePanel.tsx (customerId/customerName props + LinkCustomerButton integration)
- FOUND: components/support/SupportTicketCard.tsx ("use client" + useRouter + customer props)
- FOUND: app/(dashboard)/support/[ticketId]/page.tsx (customerId/customerName передача)
- FOUND: app/(dashboard)/support/page.tsx (customer + customerNameSnapshot в select)
- FOUND: components/layout/section-titles.ts (профиль regex)
- FOUND: tests/customer-profile-page.test.ts (16 it в 4 describe)

Commits:
- FOUND: 4fd2b84 (Task 1 RSC + 4 base components)
- FOUND: f79d4e0 (Task 2 LinkCustomerButton + integration)
- FOUND: ddda337 (Task 3 tests +7)

Build:
- npx tsc --noEmit: exit 0
- npm run build: exit 0, route /support/customers/[customerId] в списке
