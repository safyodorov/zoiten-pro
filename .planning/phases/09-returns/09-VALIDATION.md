---
phase: 9
slug: returns
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-17
approved: 2026-04-17
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` (flat root, alias `@` → project root) |
| **Quick run command** | `npm run test -- tests/wb-returns-api.test.ts tests/support-sync-returns.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds (full suite with Phase 7/8 regression) |

---

## Sampling Rate

- **After every task commit:** Run quick (targeted test files for touched areas)
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green (89+ Phase 8 tests MUST remain GREEN)
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

*Filled by gsd-planner during plan creation. Each task maps to a test command or Wave 0 stub.*

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 09-01-* | 01 | 1 | SUP-17 | unit | `npm run test -- tests/wb-returns-api.test.ts` | ⬜ pending |
| 09-02-* | 02 | 2 | SUP-17 (sync part) | unit | `npm run test -- tests/support-sync-returns.test.ts` | ⬜ pending |
| 09-03-* | 03 | 3 | SUP-18 | RSC render + e2e human | manual on VPS | ⬜ pending |
| 09-04-* | 04 | 3 | SUP-14, SUP-19, SUP-20 | unit (actions) + human | `npm run test -- tests/return-actions.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/wb-returns-api.test.ts` — stub GET /api/v1/claims + PATCH /api/v1/claim (SUP-17)
- [ ] `tests/support-sync-returns.test.ts` — stub idempotent upsert on @@unique([channel, wbExternalId]) для RETURN (SUP-17)
- [ ] `tests/return-actions.test.ts` — stub approve/reject/reconsider server actions с RBAC + ReturnDecision create (SUP-19, SUP-20)
- [ ] **VPS token setup** — добавить отдельный `WB_RETURNS_TOKEN` в `/etc/zoiten.pro.env` (scope bit 11 Buyers Returns). Существующий `WB_API_TOKEN` не имеет bit 11, расширять его не удобно — архитектура использует два токена. Проверить: `curl "https://returns-api.wildberries.ru/api/v1/claims?is_archive=false&limit=1" -H "Authorization: $WB_RETURNS_TOKEN"` возвращает 200/429 (не 401).
- [ ] **Live claim fixture** — получить 1 реальный возврат из WB API и сохранить raw JSON в `.planning/phases/09-returns/fixtures/claim-sample.json` для unit-тестов

*Existing infrastructure (vitest, Phase 8 support-*.test.ts паттерны) полностью переиспользуется.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Решение уходит в WB (PATCH /api/v1/claim успешно) | SUP-19 | Требует реальный WB API + возврат в PENDING | На VPS: открыть `/support/returns`, нажать «Одобрить» на тест-заявке, проверить в seller.wildberries.ru что статус изменился |
| Фото брака скачаны локально | SUP-18 | Требует WB CDN доступ + медиа в заявке | Проверить `/var/www/zoiten-uploads/support-media/<ticketId>/` содержит JPEG/video |
| Таблица /support/returns показывает реальные данные | SUP-18 | Требует прод WB заявки | Открыть https://zoiten.pro/support/returns после cron sync |
| State machine: REJECTED → APPROVED через «Пересмотреть» | SUP-20 | Mechanics неподтверждены (LOW confidence в research) | Wave 0 live spike: отклонить тест-заявку, проверить что в WB actions[] появляется approve1 — если нет, вернуться к планированию |
| Cron раз в 15 мин подтягивает RETURN | SUP-17 (part) | Требует cron systemd timer на VPS | `journalctl -u zoiten-cron -f` после деплоя, проверить запись через 15 мин |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (token scope + live claim fixture + 3 test stubs)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter after planner approval

**Approval:** approved 2026-04-17

### Revision history

- **2026-04-17** — revision from checker feedback: applied fixes to plans 09-02 (Warnings 5, 8), 09-03 (Blockers 2, 3 + Warning 4), 09-04 (Blocker 1 + Warning 7). All blockers addressed. `nyquist_compliant: true`.
