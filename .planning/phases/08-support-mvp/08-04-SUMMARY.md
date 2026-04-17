---
phase: 08-support-mvp
plan: 04
subsystem: ui, actions, integration

tags: [next-server-actions, rsc, sonner, wildberries-api, dialog]

requires:
  - phase: 08-support-mvp
    provides: "Plans 08-01+08-02+08-03 — все данные и базовая лента"

provides:
  - "Страница /support/[ticketId] — 3-колоночный диалог тикета"
  - "Server actions replyToTicket / assignTicket / updateTicketStatus"
  - "Клиентские компоненты SupportDialog / ReplyPanel / TicketSidePanel"
  - "Интеграция SupportSyncButton на обеих страницах"

affects: [09-returns, 10-chats, 11-appeals]

tech-stack:
  added: []
  patterns:
    - "Server actions с requireSection(SUPPORT, MANAGE) + revalidatePath"
    - "Session user.id получается через отдельный auth() вызов (requireSection возвращает void)"
    - "useTransition для дизейбла inputs во время server action"
    - "Channel-aware reply: FEEDBACK → WB /feedbacks/answer, QUESTION → WB /questions PATCH, прочие → 'не поддерживается в Phase 8'"

key-files:
  created:
    - "app/(dashboard)/support/[ticketId]/page.tsx"
    - "app/actions/support.ts"
    - "components/support/SupportDialog.tsx"
    - "components/support/ReplyPanel.tsx"
    - "components/support/TicketSidePanel.tsx"
  modified:
    - "tests/support-actions.test.ts (Wave 0 stub → 11 integration тестов)"

key-decisions:
  - "requireSection возвращает void — для получения session.user.id делаем отдельный auth() вызов в getSessionUserId()"
  - "Транзакция ($transaction) для OUTBOUND message + ticket status=ANSWERED — атомарность: либо всё, либо ничего"
  - "При ошибке WB API OUTBOUND message НЕ создаётся — не вводим пользователя в заблуждение 'отправлено' когда на WB не ушло"
  - "assignTicket переводит status → IN_PROGRESS только при назначении (userId != null); снятие назначения статус не меняет"
  - "MANUAL_STATUSES исключают APPEALED (резерв Phase 11) — попытка установить выдаёт 'нельзя установить вручную'"
  - "Медиа-URL маппинг: localPath → /uploads/... (nginx alias), fallback на WB-URL если localPath=null"
  - "Native <select> для статуса/менеджера (проектное правило: CLAUDE.md Conventions)"

patterns-established:
  - "ActionResult = {ok:true}|{ok:false;error:string} — единый return type для всех server actions"
  - "useTransition + toast.loading/success/error — UX feedback loop"

requirements-completed:
  - SUP-13
  - SUP-14
  - SUP-15
  - SUP-16

duration: 15min
completed: 2026-04-17
---

# Phase 08 Plan 04: Диалог + Server Actions

**3-колоночный диалог тикета, server actions для ответа/назначения/смены статуса, WB API интеграция для FEEDBACK/QUESTION**

## Performance

- **Duration:** ~15 мин (inline execution)
- **Completed:** 2026-04-17
- **Files created:** 5
- **Tests:** 11 support-actions GREEN, full suite 89/89

## Accomplishments

- **3 server actions** с RBAC SUPPORT+MANAGE на каждом: `replyToTicket`, `assignTicket`, `updateTicketStatus`
- **WB API интеграция для ответа:** FEEDBACK → `replyFeedback(wbExternalId, text)`, QUESTION → `replyQuestion(wbExternalId, text)`. CHAT/RETURN/MESSENGER возвращают explicit error (резервированы для Phase 9-12)
- **Атомарная транзакция ответа:** OUTBOUND SupportMessage + status=ANSWERED + resolvedAt — либо оба, либо ничего
- **Error boundary для WB fail:** если WB API падает — локальный OUTBOUND НЕ создаётся, пользователь видит ошибку
- **4 клиент-компонента диалога:** SupportDialog (хронология, медиа, адаптивная стилизация OUTBOUND/INBOUND), ReplyPanel (sticky textarea + submit), TicketSidePanel (native select для status/assignee + мета), SupportSyncButton (создан в Plan 08-03, используется здесь)
- **RSC диалоговая страница:** `/support/[ticketId]` с 3-колоночным grid layout (280px+1fr+280px на lg+, 1-col на мобильном). notFound() при отсутствии тикета.
- **11 integration-тестов support-actions:** все операции покрыты (happy path, error paths, RBAC, состояние БД не меняется при WB fail)

## Task Commits

1. **feat(08-04): диалог тикета + server actions + 11 тестов** — (см. git log)

## Server Actions API

| Action | Signature | Return |
|---|---|---|
| `replyToTicket` | `(ticketId: string, text: string)` | `{ok:true} \| {ok:false;error:string}` |
| `assignTicket` | `(ticketId: string, userId: string \| null)` | `{ok:true} \| {ok:false;error:string}` |
| `updateTicketStatus` | `(ticketId: string, status: TicketStatus)` | `{ok:true} \| {ok:false;error:string}` |

Все 3 требуют `requireSection("SUPPORT", "MANAGE")`, вызывают `revalidatePath("/support")` + `revalidatePath(\`/support/\${ticketId}\`)`.

## Files Created/Modified

### Создано
- `app/actions/support.ts` — 3 server actions + ActionResult type
- `components/support/SupportDialog.tsx` — RSC хронология сообщений (медиа через /uploads/ alias)
- `components/support/ReplyPanel.tsx` — client sticky textarea + submit
- `components/support/TicketSidePanel.tsx` — client status/assignee select + мета-информация
- `app/(dashboard)/support/[ticketId]/page.tsx` — RSC 3-col диалог с full data fetching

### Изменено
- `tests/support-actions.test.ts` — Wave 0 stub заменён 11 интеграционными тестами

## Decisions Made

- **requireSection voiding:** API контракт `requireSection` возвращает `void`, не session. Для получения `user.id` используется отдельный `auth()` вызов в helper `getSessionUserId()`.
- **Transaction safety:** используем `prisma.$transaction([createMessage, updateTicket])` — массив операций (не callback), т.к. никакие WHERE не зависят от результатов внутри транзакции.
- **UX для unsupported channels:** вместо blanket 'Канал не поддерживается' — explicit текст «в Phase 8» — пользователь понимает что это временное ограничение, а не баг.
- **SupportSyncButton переиспользование:** один компонент и на ленте, и в диалоге. `router.refresh()` после успеха обновляет RSC данные.

## Deviations from Plan

- Поле WbCard `title` → `name` (адаптация под реальную схему — как в Plan 08-03).
- `authorId` в OUTBOUND передаётся не из `session.user.id` напрямую, а через helper `getSessionUserId()` (отдельный `auth()` вызов) — корректное обращение с void-возвращающим `requireSection`.

Все отклонения нейтральные.

## Issues Encountered

Нет.

## User Setup Required — VPS deployment

**Выполнить вручную на VPS после merge:**

```bash
# 1. Создать директорию медиа:
ssh root@85.198.97.89 "mkdir -p /var/www/zoiten-uploads/support/ && chown -R www-data:www-data /var/www/zoiten-uploads/support/"

# 2. Применить миграцию + перезапустить сервис:
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
# deploy.sh должен включать: npx prisma migrate deploy && systemctl restart zoiten-erp.service

# 3. Добавить CRON_SECRET в /etc/zoiten.pro.env (если отсутствует):
ssh root@85.198.97.89 "openssl rand -hex 32 | tee -a /etc/zoiten.pro.env"
# (вручную добавить префикс CRON_SECRET= к сгенерированному значению)

# 4. Создать cron (от root):
ssh root@85.198.97.89 'cat > /etc/cron.d/zoiten-support <<EOF
*/15 * * * * www-data curl -s -H "x-cron-secret: \$(grep ^CRON_SECRET /etc/zoiten.pro.env | cut -d= -f2)" http://localhost:3001/api/cron/support-sync-reviews > /dev/null
0 3 * * * www-data curl -s -H "x-cron-secret: \$(grep ^CRON_SECRET /etc/zoiten.pro.env | cut -d= -f2)" http://localhost:3001/api/cron/support-media-cleanup > /dev/null
EOF
'

# 5. nginx alias для /uploads/ (Phase 6) уже покрывает /uploads/support/* — проверить не нужно
```

## HUMAN-UAT задачи

См. `.planning/phases/08-support-mvp/08-VALIDATION.md` — 10 manual-only verification items:
1. Открыть /support — увидеть ленту с синхронизированными отзывами/вопросами
2. Нажать «Синхронизировать» — получить toast с числом загруженных тикетов
3. Проверить фильтры (канал, статус, менеджер, nmId, даты, «только неотвеченные»)
4. Открыть карточку тикета — 3 колонки, хронология, reply-панель
5. Ввести ответ → увидеть в WB кабинете → убедиться в ANSWERED статусе
6. Назначить менеджера → увидеть IN_PROGRESS
7. Сменить статус через select → увидеть изменение
8. Проверить badge в sidebar — соответствует count NEW
9. Проверить медиа (фото) — открывается через /uploads/ alias
10. Убедиться что VIEWER-пользователь видит ленту, но не может отвечать (RBAC)

## Next Phase Readiness

**Phase 9-12 задел:**
- Единая модель SupportTicket поддержит добавление channels=RETURN/CHAT/MESSENGER без миграций
- replyToTicket можно расширить case-бранчами на CHAT (Phase 10) и MESSENGER (Phase 12)
- TicketStatus enum уже содержит APPEALED (Phase 11) — UI фильтры и badge-логика готовы к обжалованиям

**Блокеров нет.**

---
*Phase: 08-support-mvp*
*Completed: 2026-04-17*
