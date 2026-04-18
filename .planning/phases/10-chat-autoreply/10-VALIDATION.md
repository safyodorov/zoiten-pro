---
phase: 10
slug: chat-autoreply
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-18
approved: 2026-04-18
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for Chat + Auto-Reply (local cron, no WB autoreply endpoint).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` (flat root, alias `@` → project root) |
| **Quick run command** | `npm run test -- tests/wb-chat-api.test.ts tests/support-sync-chats.test.ts tests/auto-reply-*.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~18 seconds (full suite: Phase 7/8/9 + новые Phase 10 тесты) |

---

## Sampling Rate

- **After every task commit:** Run quick (targeted test files для touched areas)
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite green (124+ Phase 7/8/9 baseline + Phase 10 additions MUST остаться GREEN)
- **Max feedback latency:** 18 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 10-01-* | 01 | 1 | SUP-21 | unit | `npm run test -- tests/wb-chat-api.test.ts` | ⬜ pending |
| 10-02-* | 02 | 2 | SUP-21 (sync), SUP-25 (autoReply detect) | unit | `npm run test -- tests/support-sync-chats.test.ts` | ⬜ pending |
| 10-02b-* | 02 | 2 | SUP-07 доп (cron 5 мин), local autoreply logic | unit | `npm run test -- tests/auto-reply-cron.test.ts` | ⬜ pending |
| 10-03-* | 03 | 3 | SUP-22 (multipart), SUP-25 (🤖 icon) | RSC render + unit | `npm run test -- tests/chat-reply-panel.test.ts` | ⬜ pending |
| 10-04-* | 04 | 3 | SUP-23 (AutoReplyConfig), SUP-24 (page + save) | unit (action) + human | `npm run test -- tests/auto-reply-settings.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/wb-chat-api.test.ts` — stub 5 endpoints (ping, /chats, /events cursor, /message multipart, /download) + 403→curl fallback (SUP-21)
- [ ] `tests/support-sync-chats.test.ts` — stub syncChats() идемпотентность + isAutoReply detection (SUP-21, SUP-25)
- [ ] `tests/auto-reply-cron.test.ts` — stub scheduling logic (Moscow TZ, workDays, workdayStart/End, dedup window) (SUP-07 доп)
- [ ] `tests/chat-reply-panel.test.ts` — stub multipart payload build + file validation (JPEG/PNG/PDF ≤5MB, ≤30MB total) (SUP-22)
- [ ] `tests/auto-reply-settings.test.ts` — stub saveAutoReplyConfig action + Zod validation (SUP-23, SUP-24)
- [ ] **VPS token setup (BLOCKER)** — добавить `WB_CHAT_TOKEN` в `/etc/zoiten.pro.env` (scope bit 9 Buyers chat). Архитектура 3 токена: `WB_API_TOKEN` (bit 5) + `WB_RETURNS_TOKEN` (bit 11) + `WB_CHAT_TOKEN` (bit 9). **Execute-phase откладывается до получения токена пользователем.**
- [ ] **TLS fingerprint live test** — curl vs Node.js fetch на `buyer-chat-api.wildberries.ru`. Если fetch работает — убираем curl fallback. Если 403 — используем execSync pattern из lib/wb-api.ts v4.
- [ ] **Canonical fixtures** — получить JSON-образцы `/chats` и `/events` из WB API (через Wave 0 curl), сохранить в `tests/fixtures/wb-chat-chats-sample.json` и `wb-chat-events-sample.json`

*Existing infrastructure (vitest, Phase 8/9 паттерны mock `@/lib/prisma` + `vi.stubGlobal("fetch", ...)`) переиспользуется.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Чаты appear в /support ленте | SUP-21 (sync part) | Требует реальные чаты WB с покупателями | Покупатель пишет в чат → через 5 мин cron подтягивает → тикет появляется |
| OUTBOUND message долетает до WB с media | SUP-22 | Требует реальный WB Chat API + файлы | Отправить JPEG 2MB через UI → проверить в мобильном приложении WB у тест-покупателя |
| Multipart валидация (>5MB reject, PDF ok) | SUP-22 | Требует реальные файлы | Попробовать загрузить 6MB JPEG → toast error; 2MB PDF → OK |
| Auto-reply отправляется вне рабочих часов | SUP-07 + SUP-25 | Требует time-travel на VPS или ожидание | Настроить workdayEnd=18:00, покупатель пишет в 19:00 → через ≤5 мин приходит autoreply |
| {имя_покупателя} подстановка | SUP-24 | Требует реальный чат с `clientName` | Сообщение autoreply содержит имя покупателя |
| 🤖 иконка на auto-reply сообщении | SUP-25 | Визуальная проверка | В диалоге CHAT autoreply помечен 🤖, обычный OUTBOUND — без иконки |
| Cron 5 мин работает на VPS | SUP-07 доп | Требует systemd timer | `journalctl -u zoiten-erp -f | grep chat-sync` через 5 мин тик |
| TLS fingerprint block | SUP-21 | Wave 0 live spike | curl vs fetch на staging — если fetch 403, подтверждает curl fallback |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify или Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks без automated verify
- [ ] Wave 0 covers all MISSING references (token + TLS test + 5 stubs + 2 fixtures)
- [ ] No watch-mode flags
- [ ] Feedback latency < 18s
- [ ] `nyquist_compliant: true` в frontmatter после planner approval

**Approval:** approved 2026-04-18

### Revision history
- **2026-04-18** — planner approved by checker (iter 1): 0 blockers, 2 warnings (curl fallback deferred to Wave 0 live test; wbUrl placeholder convention undocumented — both INFO-level, addressable at execute-time).
