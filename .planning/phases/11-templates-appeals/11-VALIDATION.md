---
phase: 11
slug: templates-appeals
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-18
approved: 2026-04-18
---

# Phase 11 — Validation Strategy

> Per-phase validation contract для Local templates + hybrid appeals (WB API отключён 2025-11/12).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- tests/response-templates.test.ts tests/appeal-actions.test.ts tests/template-picker.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~20 seconds (Phase 7/8/9 + Phase 11 additions; Phase 10 tests добавятся после execute) |

---

## Sampling Rate

- **After every task commit:** quick targeted tests
- **After every plan wave:** full suite
- **Before `/gsd:verify-work`:** full suite GREEN (124+ baseline MUST pass)
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 11-01-* | 01 | 1 | SUP-26, SUP-29 (model) | unit | `npm run test -- tests/response-templates.test.ts tests/appeal-actions.test.ts` | ⬜ pending |
| 11-02-* | 02 | 2 | SUP-26 (CRUD), SUP-27 (Export/Import JSON вместо sync) | unit | `npm run test -- tests/response-templates.test.ts` | ⬜ pending |
| 11-03-* | 03 | 3 | SUP-28 (picker), SUP-26 (page) | RSC render + unit | `npm run test -- tests/template-picker.test.ts` | ⬜ pending |
| 11-04-* | 04 | 3 | SUP-29, SUP-31, SUP-14 доп | unit (actions) + human | `npm run test -- tests/appeal-actions.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/response-templates.test.ts` — stub CRUD (create/update/delete/list) + channel filtering + variable substitution (SUP-26)
- [ ] `tests/template-picker.test.ts` — stub search + nmId grouping + substitution on select (SUP-28)
- [ ] `tests/appeal-actions.test.ts` — stub createAppeal/updateAppealStatus + RBAC + state machine (SUP-29)
- [ ] **Статический справочник appeal reasons** — зафиксировать ~8 причин (Оскорбление, Реклама конкурентов, Не по теме, Не соответствует товару, Фейковый отзыв, Нецензурная лексика, Персональные данные, Другое) в `lib/appeal-reasons.ts` как экспорт. Можно уточнять позже по скриншотам WB UI.

*Existing vitest + Phase 8/9 mock паттерны переиспользуются.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Menedgеr создаёт локальный шаблон | SUP-26 | UI-flow | `/support/templates` → «Новый» → форма → сохранить → виден в списке |
| Модалка picker при ответе | SUP-28 | UI-interaction | Открыть диалог FEEDBACK → «Выбрать шаблон» → искать → выбрать → текст подставляется с {имя_покупателя} substitution |
| Export/Import JSON | SUP-27 (reformulated) | Requires file download/upload | «Экспортировать» → скачивает templates.json; «Импортировать» → загружает → 0 ошибок, N шаблонов добавлено |
| Appeal tracker hybrid workflow | SUP-29 | Требует реальный отзыв + WB кабинет | Открыть FEEDBACK → «Обжаловать» → модалка → причина+текст → «Создать запись и открыть WB» → AppealRecord=PENDING, ticket.status=APPEALED, открывается новая вкладка seller.wildberries.ru с якорем на отзыв |
| Ручной переключатель статуса обжалования | SUP-29 | Требует действие менеджера | В диалоге APPEALED → переключатель «Одобрено WB / Отклонено WB / Ещё ожидание» → AppealRecord обновляется, appealResolvedAt = now() |
| Индикатор обжалования в ленте | SUP-31 | Визуальная проверка | SupportTicketCard показывает бейдж: 🕐 (pending) / ✅ (approved) / ❌ (rejected) рядом со статусом |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks без automated verify
- [ ] Wave 0 covers all MISSING references (3 test stubs + appeal reasons file)
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` после planner approval

**Approval:** approved 2026-04-18

### Revision history
- **2026-04-18** — checker iter 1: 1 blocker (11-04 shared ReplyPanel.tsx с 11-03) + 2 warnings (verify command fix + scope size). Blocker resolved: 11-04 → wave:4, depends_on:[11-02,11-03]. Warning 2 resolved: verify command cleaned. Warning 3 info-only (9 files в Task 1 11-03 — acceptable).
