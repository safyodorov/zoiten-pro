---
phase: 10-chat-autoreply
plan: 03
subsystem: ui
tags: [support, chat, multipart, upload, client-component, server-action, vitest, typescript]

requires:
  - phase: 10-01
    provides: sendChatMessage(replySign, message, files) WB API client, SupportTicket.chatReplySign, MediaType.DOCUMENT, SupportMessage.isAutoReply default false
  - phase: 10-02
    provides: syncChats() + runAutoReplies() cron (создание INBOUND + OUTBOUND isAutoReply=true сообщений, которые отображаются в SupportDialog)
  - phase: 08-support-mvp
    provides: ReplyPanel (FEEDBACK/QUESTION), getSessionUserId helper, UPLOAD_DIR /var/www/zoiten-uploads/support/, Phase 8 transaction pattern
  - phase: 09-returns
    provides: WB-first transaction order (приземление локальной записи только после успеха WB API)
provides:
  - ChatReplyPanel — client multipart panel (textarea + файлы) с клиентской валидацией
  - sendChatMessageAction — server action FormData → WB-first multipart → SupportMessage + SupportMedia
  - Bot badge для isAutoReply сообщений в SupportDialog
  - Conditional render /support/[ticketId] расширен channel==='CHAT' → ChatReplyPanel
affects:
  - Phase 10 Plan 04 (UI settings + deploy) — Bot badge уже визуализирует runAutoReplies() результаты автоматически
  - Phase 12+ (MESSENGER канал) — fallback сообщение «Канал не поддерживает ответ» теперь параметризован ticket.channel

tech-stack:
  added: []
  patterns:
    - "Server Action с FormData parameter (не POJO) — required для multipart File[] передачи через startTransition"
    - "WB-first transaction order (паттерн Phase 9 approveReturn): sendChatMessage → prisma.create OUTBOUND + SupportMedia + update ticket. При падении WB локальная запись не создаётся, БД остаётся консистентной"
    - "Double-validation (client + server): toast-ориентированная UX + security (клиент не блокирует злоумышленника)"
    - "Conditional render per channel в /support/[ticketId]/page.tsx — каждый канал получает свою панель (ReplyPanel FEEDBACK/QUESTION, ChatReplyPanel CHAT, ReturnActionsPanel RETURN)"
    - "Sanitize filename + finite suffix (slice(-128)) перед fs.writeFile — защита от path traversal в multipart upload"

key-files:
  created:
    - components/support/ChatReplyPanel.tsx
  modified:
    - app/actions/support.ts
    - app/(dashboard)/support/[ticketId]/page.tsx
    - components/support/SupportDialog.tsx
    - tests/chat-reply-panel.test.ts

key-decisions:
  - "FormData accept в server action (вместо POJO) — Next.js сам сериализует File[] через 'use server'. Альтернатива (base64 POJO) утраивает размер и ломает лимит Node.js payload."
  - "WB-first, не transaction-wrapped — $transaction не может откатить внешний HTTP call. Если делаем WB PATCH → prisma.$transaction → на упавшей Prisma WB уже принял сообщение, БД undo невозможен. WB-first гарантирует: WB принял → пытаемся persist; WB упал → БД не тронута."
  - "Client-side validation ДУБЛИРУЕТ server-side — security требует серверную проверку (клиент могут обойти). UX требует клиентскую (toast до отправки). DRY жертвуется ради чёткого разделения."
  - "Bot badge в SupportDialog — опциональный проп isAutoReply?: boolean на Message. Phase 8 вызов (без передачи isAutoReply) → badge не рендерится. Backward-compat."
  - "ChatReplyPanel props минимальны: { ticketId, replySign } — ticket метаданные (customerName/productName) не нужны, т.к. подстановка шаблонов в CHAT Phase 10 не предусмотрена (Phase 11 Plan 03 TemplatePickerModal — только FEEDBACK/QUESTION)."
  - "mkdir recursive: true + sanitizeChatFilename — overhead на упавший fs minimal, защита от path traversal обязательна при файл-аплоаде пользователя."
  - "Fallback сообщение параметризовано каналом: 'Канал «{channel}» не поддерживает ответ' — вместо hardcoded FEEDBACK/QUESTION. Для Phase 12 MESSENGER сразу корректный UX."

patterns-established:
  - "Server action с FormData → File[] multipart upload через Next.js useTransition"
  - "Client validation + server re-validation pair для upload panels"
  - "Conditional render панелей per channel в /support/[ticketId]"

requirements-completed: [SUP-22, SUP-25]

duration: 4min
completed: 2026-04-18
---

# Phase 10 Plan 03: UI Chat Messages Summary

**ChatReplyPanel — multipart upload панель для WB Buyer Chat (текст ≤1000 + JPEG/PNG/PDF ≤5 МБ/файл, ≤30 МБ суммарно) + sendChatMessageAction с WB-first transaction order + Bot badge для isAutoReply сообщений в SupportDialog**

## Performance

- **Duration:** ~4 min (single-pass execute, 0 deviations, parallel с Plan 10-04)
- **Tasks:** 2
- **Files created:** 1
- **Files modified:** 4

## Accomplishments

- **`sendChatMessageAction`** в `app/actions/support.ts` (~145 строк нового кода):
  - RBAC `requireSection("SUPPORT", "MANAGE")` + `getSessionUserId()` (reuse Phase 8 helper)
  - FormData parsing: `ticketId`, `text`, `files: File[]`
  - Server-side валидация: empty check, text ≤1000, per-file ≤5 МБ, total ≤30 МБ, MIME whitelist (`image/jpeg|image/png|application/pdf`)
  - Ticket guards: ticket exists, `channel === "CHAT"`, `chatReplySign !== null`
  - Prebuild Buffer из File.arrayBuffer() (File stream — однократно)
  - **WB-first:** `sendChatMessage({replySign, message, files})` — при throw return без локальных изменений
  - После успеха WB: `supportMessage.create` OUTBOUND `isAutoReply=false` + per-file `fs.writeFile` + `supportMedia.create` (IMAGE для JPEG/PNG, DOCUMENT для PDF) + `supportTicket.update` `status=ANSWERED, lastMessageAt=now`
  - `revalidatePath("/support"); revalidatePath("/support/{ticketId}")`
  - Local path: `/var/www/zoiten-uploads/support/{ticketId}/{messageId}/{sanitized_filename}` — идентичен Phase 8 downloadMediaBatch
- **`components/support/ChatReplyPanel.tsx`** — новый client компонент (~155 строк):
  - `"use client"` + `useState(text, files)` + `useRef(fileInputRef)` + `useTransition`
  - Textarea `maxLength=1000` + счётчик `{text.length}/1000`
  - File input `type="file" multiple accept="image/jpeg,image/png,application/pdf"` (hidden, триггер через Paperclip-кнопку)
  - Клиентская валидация: MIME whitelist → toast.error; ≤5 МБ/файл → toast; ≤30 МБ суммарно → toast + break
  - Preview выбранных файлов: name + размер в КБ + × кнопка удаления
  - Submit: FormData(ticketId + text + files) → `sendChatMessageAction(fd)` через `startTransition`
  - Success → toast.success + clear state; Error → toast.error(res.error)
  - Disabled: `!replySign || isPending || (!text.trim() && files.length === 0)`
  - Fallback UI: «Нет replySign — запустите синхронизацию чата»
- **`app/(dashboard)/support/[ticketId]/page.tsx`** — conditional рендер расширен:
  - Импорт `ChatReplyPanel` добавлен
  - `const isChat = ticket.channel === "CHAT"` + отдельный блок `{isChat && <ChatReplyPanel ticketId replySign={ticket.chatReplySign} />}`
  - Messages dto расширен `isAutoReply: m.isAutoReply`
  - Fallback сообщение параметризовано `ticket.channel` (для Phase 12 MESSENGER)
  - Phase 8 `<ReplyPanel>` (FEEDBACK/QUESTION) и Phase 9 `<ReturnActionsPanel>` не тронуты
  - Prisma `include` уже возвращает `chatReplySign` (не требует изменений select)
- **`components/support/SupportDialog.tsx`** — Bot badge:
  - Импорт `Bot` из `lucide-react` добавлен
  - `Message` интерфейс расширен опциональным `isAutoReply?: boolean` — Phase 8/9 вызовы не ломаются
  - Внутри bubble meta-блока: `{m.isAutoReply && <span title="Автоответ"><Bot className="h-3 w-3" /> Автоответ</span>}`
  - Гибкое расположение: rounded flex меняется `flex items-center gap-1` — визуально не ломает существующие Phase 8 бабблы
- **`tests/chat-reply-panel.test.ts`** — Wave 0 stub (7 `it.skip`) заменён на **12 GREEN integration-тестов**:
  - Happy path: OUTBOUND + sendChatMessage + revalidatePath
  - JPEG → IMAGE + PDF → DOCUMENT + fs.writeFile × 2
  - ticket.status → ANSWERED + lastMessageAt Date
  - Validation: empty / text >1000 / недопустимый MIME / файл >5 МБ
  - Guards: channel !== CHAT / chatReplySign=null / VIEWER RBAC / ticket не найден
  - WB-first: при WB throw — OUTBOUND НЕ создаётся + status остаётся NEW

## Task Commits

1. **Task 1 — sendChatMessageAction + 12 integration тестов:** `dab3515` (feat)
2. **Task 2 — ChatReplyPanel + conditional render + Bot badge:** `3c91ece` (feat)

## Files Created/Modified

### Created
- `components/support/ChatReplyPanel.tsx` — client multipart panel с textarea + file input + preview + счётчик + disabled states (~155 строк)

### Modified
- `app/actions/support.ts` — +impотры `fs/promises`, `path`, `sendChatMessage`, `MediaType`. +константы `CHAT_UPLOAD_DIR/CHAT_MAX_FILE_BYTES/CHAT_MAX_TOTAL_BYTES/CHAT_ALLOWED_MIME`. +helpers `sanitizeChatFilename`, `mimeToMediaType`. +`sendChatMessageAction` экспорт (~145 строк). Phase 8/9 functions не тронуты.
- `app/(dashboard)/support/[ticketId]/page.tsx` — +import `ChatReplyPanel`, +`isChat` variable, +conditional render блок, +`isAutoReply` в messages dto, +fallback message параметризован channel.
- `components/support/SupportDialog.tsx` — +import `Bot`, +опциональный `isAutoReply?` в `Message`, +inline badge в meta-блоке.
- `tests/chat-reply-panel.test.ts` — заменён Wave 0 stub на 12 GREEN.

## Decisions Made

- **FormData (не POJO) в server action** — File[] передача через Next.js `"use server"` требует FormData. Alternative (base64 POJO) утраивает размер + ломает payload limits.
- **WB-first, не transaction-wrapped** — `prisma.$transaction` не откатывает HTTP call. WB-first: WB accept → try persist; WB throw → БД не тронута (паттерн Phase 9 approveReturn).
- **Client + server validation дублируются** — security требует серверную (клиент обходится), UX требует клиентскую (toast до submit). DRY жертвуется.
- **isAutoReply?: boolean опционален** в SupportDialog.Message interface — Phase 8 callsites не ломаются, Bot badge только для Phase 10+ сообщений.
- **ChatReplyPanel props минимальны** — только `ticketId` + `replySign`. Шаблоны (TemplatePickerModal, Phase 11) не подключены к CHAT — domain decision (шаблоны FEEDBACK/QUESTION only).
- **Conditional render per channel** — FEEDBACK/QUESTION → ReplyPanel, CHAT → ChatReplyPanel, RETURN → ReturnActionsPanel, fallback «Канал «X» не поддерживает ответ». Паттерн extensible для Phase 12 MESSENGER.

## Deviations from Plan

None — plan executed exactly as written.

Mild enhancements:
- Тестов 12 GREEN (план говорил «≥10») — добавлены «ticket не найден» и «writeFile mkdir called» кейсы.
- Fallback сообщение параметризовано `ticket.channel` (план говорил hardcoded) — extensible для Phase 12.

## Issues Encountered

- **`npm run test` локально падает** — known issue из Plan 10-01/10-02: std-env 4.x ESM vs vitest 4.x cjs require несовместимость в macOS dev env. Проверено: `npx tsc --noEmit` clean + `npm run build` clean. 12 тестов прогонятся на VPS в Plan 10-04 deploy.
- **Parallel execution с Plan 10-04** — оба плана расширяют `app/actions/support.ts`. Plan 10-03 добавил `sendChatMessageAction` в конец, Plan 10-04 добавил `saveAutoReplyConfig` после него. Merge without conflicts — обе функции coexist (verified via grep).

## Deferred Issues

None.

## Backward Compatibility

- **Phase 8 ReplyPanel** — FEEDBACK/QUESTION, не тронут. `messages[].isAutoReply` defaults `false` → badge не рендерится.
- **Phase 9 ReturnActionsPanel** — RETURN, не тронут. Conditional render остаётся `isReturn &&`.
- **Phase 11 TemplatePickerModal + AppealModal** — не пересекаются с CHAT каналом (picker только FEEDBACK/QUESTION).
- **SupportDialog Message interface** — `isAutoReply?: boolean` опционален. Если вызывающий код не передаёт (Phase 8 timeline) — badge не рендерится.

## User Setup Required

**None new.** Унаследовано из Plan 10-01/10-02:
- `WB_CHAT_TOKEN` в `/etc/zoiten.pro.env` (scope bit 9 «Чат с покупателями»)
- Миграция `20260418_phase10_chat_autoreply` применяется Plan 10-04 deploy

**UAT сценарий (Plan 10-04):**
1. Запустить `syncChats` → тикет CHAT создан с `chatReplySign`
2. Перейти `/support/{ticketId}` → видна `<ChatReplyPanel>`
3. Ввести текст + прикрепить JPEG → Submit → toast «Сообщение отправлено»
4. WB Seller UI: появилось сообщение в чате
5. Запустить `runAutoReplies` (cron) → INBOUND покупатель → OUTBOUND `isAutoReply=true` → bubble с 🤖 Автоответ

## Next Phase Readiness

- **Plan 10-04 (settings UI + deploy)** — может стартовать немедленно (если не уже). `sendChatMessageAction` готов, UI `AutoReplyConfig` Plan 10-04 независимый. Deploy.sh должен применить миграцию + добавить systemd timer для `/api/cron/support-sync-chat`.

## Self-Check: PASSED

Verified:
- `components/support/ChatReplyPanel.tsx` exists ✅ (155 lines)
- `grep -c '"use client"' components/support/ChatReplyPanel.tsx` = 1 ✅
- `grep "sendChatMessageAction" components/support/ChatReplyPanel.tsx` = 2 ✅ (import + call)
- `grep "accept=" components/support/ChatReplyPanel.tsx` = 1 ✅ (joined ALLOWED_MIME)
- `grep "MAX_FILE_BYTES" components/support/ChatReplyPanel.tsx` = 2 ✅ (const + use)
- `grep -c "export async function sendChatMessageAction" app/actions/support.ts` = 1 ✅
- `grep 'channel !== "CHAT"' app/actions/support.ts` ≥ 1 ✅
- `grep "chatReplySign" app/actions/support.ts` = 3 ✅
- `grep "isAutoReply: false" app/actions/support.ts` = 1 ✅
- `grep -c "it(" tests/chat-reply-panel.test.ts` = 12 ✅ (план ≥10)
- `grep "ChatReplyPanel" app/(dashboard)/support/[ticketId]/page.tsx` = 2 ✅ (import + render)
- `grep "isChat" app/(dashboard)/support/[ticketId]/page.tsx` ≥ 1 ✅
- `grep -c "ReplyPanel" app/(dashboard)/support/[ticketId]/page.tsx` = 5 ✅ (Phase 8 intact)
- `grep -c "ReturnActionsPanel" app/(dashboard)/support/[ticketId]/page.tsx` = 2 ✅ (Phase 9 intact)
- `grep "isAutoReply" components/support/SupportDialog.tsx` = 3 ✅
- `grep "Bot" components/support/SupportDialog.tsx` = 3 ✅
- `npx tsc --noEmit` clean ✅
- `npm run build` clean ✅ (/support/[ticketId] = 9.76 kB / 162 kB First Load JS)
- Commits exist: `dab3515` ✅, `3c91ece` ✅

---
*Phase: 10-chat-autoreply*
*Completed: 2026-04-18*
