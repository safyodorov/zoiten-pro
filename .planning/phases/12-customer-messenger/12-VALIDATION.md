---
phase: 12
slug: customer-messenger
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-18
approved: 2026-04-18
---

# Phase 12 — Validation Strategy

> Customer profile + Manual MESSENGER + Merge. WB не даёт wbUserId — hybrid стратегия (auto Chat / manual остальные).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- tests/customer-actions.test.ts tests/customer-sync-chat.test.ts tests/messenger-ticket.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~22 seconds (Phase 7..11 + Phase 12 additions) |

---

## Sampling Rate

- **After every task commit:** quick targeted
- **After every plan wave:** full suite
- **Before `/gsd:verify-work`:** full suite green
- **Max feedback latency:** 22s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 12-01-* | 01 | 1 | SUP-32 (auto Chat), SUP-34 (model), SUP-35 (model) | unit | `npm run test -- tests/customer-actions.test.ts tests/customer-sync-chat.test.ts` | ⬜ pending |
| 12-02-* | 02 | 2 | SUP-33 (profile page) | RSC + unit | `npm run test -- tests/customer-profile-page.test.ts` | ⬜ pending |
| 12-03-* | 03 | 3 | SUP-34, SUP-35, UAT | unit (actions) + human | `npm run test -- tests/messenger-ticket.test.ts tests/merge-customers.test.ts` | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `tests/customer-actions.test.ts` — stub linkTicketToCustomer / createCustomerForTicket / updateCustomerNote (SUP-32 manual, SUP-33)
- [ ] `tests/customer-sync-chat.test.ts` — stub auto-create Customer для каждого CHAT (wbUserId="chat:<chatID>", name=clientName)
- [ ] `tests/messenger-ticket.test.ts` — stub createManualMessengerTicket (SUP-34)
- [ ] `tests/merge-customers.test.ts` — stub mergeCustomers + edge cases (self-merge, loops) (SUP-35)
- [ ] `tests/customer-profile-page.test.ts` — stub RSC render + aggregates (COUNT GROUP BY channel, AVG rating)

*Existing vitest + Phase 8-11 паттерны переиспользуются.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Auto Customer создаётся при Chat sync | SUP-32 | Требует cron + реальный WB Chat | Подождать cron tick 5 мин → в /support/customers появился Customer с clientName |
| Link Customer для FEEDBACK/QUESTION/RETURN | SUP-32 (manual) | UI interaction | В диалоге → «Связать с покупателем» → выбор из списка → tickets.customerId обновлён |
| Profile aggregates корректны | SUP-33 | Требует реальные данные | /support/customers/[id] — счётчики по каналам совпадают с БД |
| Manual MESSENGER ticket появляется в ленте | SUP-34 | UI flow + регрессия ленты | /support/new → форма → submit → /support показывает новый тикет с channel=MESSENGER |
| Merge переносит тикеты + удаляет исходный | SUP-35 | Transaction risk | Profile → «Связать с другим» → подтверждение → все тикеты source перешли к target, source Customer удалён |
| ReplyPanel для MESSENGER скрыт (or read-only) | SUP-34 | UX решение | В MESSENGER тикете — нет кнопки «Отправить» или заблокирована |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity
- [x] Wave 0 covers MISSING references (5 test stubs)
- [x] No watch-mode flags
- [x] Feedback latency < 22s
- [x] `nyquist_compliant: true`

**Approval:** approved 2026-04-18
