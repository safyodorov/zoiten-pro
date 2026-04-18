---
phase: 13
slug: statistics
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-18
approved: 2026-04-18
---

# Phase 13 — Validation Strategy

> Support analytics dashboard. Zero WB integration — чистая локальная агрегация.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- tests/support-stats-*.test.ts tests/date-periods.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~25s (Phase 7-12 + Phase 13) |

---

## Sampling Rate

- After every task commit: quick targeted tests
- After every plan wave: full suite
- Before `/gsd:verify-work`: full suite green
- Max feedback latency: 25s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 13-01-* | 01 | 1 | SUP-39 (model) + aggregation helpers | unit | `npm run test -- tests/support-stats-helpers.test.ts tests/date-periods.test.ts` | ⬜ pending |
| 13-02-* | 02 | 2 | SUP-36, SUP-37, SUP-38 | RSC + unit | `npm run test -- tests/support-stats-page.test.ts` | ⬜ pending |
| 13-03-* | 03 | 3 | SUP-39 (cron) + UAT | unit + human | `npm run test -- tests/support-stats-cron.test.ts` | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `tests/support-stats-helpers.test.ts` — stub aggregation fns (product + manager + autoReplies + topReasons + avgResponse)
- [ ] `tests/date-periods.test.ts` — stub getPeriod(preset|custom) с Moscow TZ, start/end of day
- [ ] `tests/support-stats-page.test.ts` — stub RSC render + tabs + фильтры URL params
- [ ] `tests/support-stats-cron.test.ts` — stub upsert ManagerSupportStats для всех users с SUPPORT role

*Existing vitest + Phase 8-12 паттерны переиспользуются.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Instructions |
|----------|-------------|------------|--------------|
| Tab «По товарам» с реальными данными | SUP-37 | Требует прод тикетов | /support/stats → По товарам → период 30д → цифры совпадают с /support ленте GROUP BY nmId |
| Tab «По менеджерам» live + cached | SUP-38 | Требует реального менеджера с несколькими actions | UAT: менеджер Иван отвечает на 3 отзыва → /support/stats tab По менеджерам: feedbacksAnswered += 3 |
| Cron 03:00 МСК upsert | SUP-39 | Требует systemd timer tick | `journalctl -u zoiten-stats-refresh.service --since '1 day ago'` показывает запись после 03:00 МСК |
| Live current month поверх cache | SUP-38 + S.C. #5 | Смесь Prisma + SQL | Добавить action сейчас → увидеть ∆ в tab без ожидания cron |
| Период «квартал» — календарный | research Open Q #5 | UX | Выбор «Квартал» → dateFrom = начало текущего квартала (Jan/Apr/Jul/Oct 1st 00:00 МСК) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity
- [x] Wave 0 covers MISSING references (4 stubs)
- [x] No watch-mode flags
- [x] Feedback latency < 25s
- [x] `nyquist_compliant: true`

**Approval:** approved 2026-04-18
