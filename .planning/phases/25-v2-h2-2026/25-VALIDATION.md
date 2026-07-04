---
phase: 25
slug: v2-h2-2026
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-04
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Details in `25-RESEARCH.md § Validation Architecture`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (установлен в Phase 7) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test` (полный)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 25-01-* | 01 | 1 | SP-02, SP-03 | — | pure engine детерминизм | unit | `npm run test sales-plan-engine` | ❌ W0 | ⬜ pending |
| 25-01-* | 01 | 1 | SP-05 | — | resolver дат приходов | unit | `npm run test sales-plan-arrivals` | ❌ W0 | ⬜ pending |
| 25-01-* | 01 | 1 | SP-06 | — | ИУ = 438 068 120 ₽ | unit | `npm run test sales-plan-iu` | ❌ W0 | ⬜ pending |
| 25-01-* | 01 | 1 | SP-02 | — | бакеты quarter/halfyear/year | unit | `npm run test date-buckets` | ❌ W0 | ⬜ pending |
| 25-03-* | 03 | 3 | SP-07, SP-10 | — | pro-rata + deviation + «Вне плана» | unit | `npm run test sales-plan-plan-fact` | ❌ W0 | ⬜ pending |
| 25-04-* | 04 | 4 | SP-08 | — | триггер перезаказа + qty | unit | `npm run test sales-plan-virtual` | ❌ W0 | ⬜ pending |
| 25-06-* | 06 | 6 | SP-09, SP-12 | — | VP платежи + анти-двойной счёт | unit | `npm run test sales-plan-pdds-feed` | ❌ W0 | ⬜ pending |
| 25-02-* | 02 | 2 | SP-04, SP-13 | RBAC | write под SALES MANAGE, правка дня | manual | UAT | — | ⬜ pending |
| 25-05-* | 05 | 5 | SP-11 | — | фиксация версии + read-only | manual | UAT | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sales-plan-engine.test.ts` — stubs for SP-02, SP-03, SP-04
- [ ] `tests/sales-plan-arrivals.test.ts` — stubs for SP-05
- [ ] `tests/sales-plan-iu.test.ts` — stubs for SP-06 (golden 438 068 120 ₽)
- [ ] `tests/date-buckets.test.ts` — stubs for SP-02 (quarter/halfyear/year)
- [ ] `tests/sales-plan-plan-fact.test.ts` — stubs for SP-07, SP-10
- [ ] `tests/sales-plan-virtual.test.ts` — stubs for SP-08
- [ ] `tests/sales-plan-pdds-feed.test.ts` — stubs for SP-09, SP-12

*vitest infrastructure already exists (Phase 7) — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Редактирование уровней + правка дня с realtime-пересчётом | SP-04 | UI-интеракция, realtime | Открыть /sales-plan/products edit, изменить уровень месяца + день, «Пересчитать план», проверить пересчёт стока |
| Три ряда план/факт/ИУ из funnel | SP-06, SP-10 | Зависит от прод-данных WbCardFunnelDaily | Открыть /sales-plan, сверить факт с ИУ, строку «Вне плана» |
| Генерация/отклонение/конвертация виртуальных закупок | SP-08, SP-09 | UI + переход в /procurement | Таб «Пора заказывать»: отклонить одну, конвертировать одну → проверить префилл PurchaseModal |
| Фиксация версии + read-only просмотр | SP-11 | UI + state | «Зафиксировать план», переключиться на версию, проверить read-only баннер |
| RBAC — write под SALES MANAGE | SP-13 | Требует юзера с VIEW/MANAGE | Проверить, что VIEW не может писать |
| Деплой миграции + bootstrap на проде | SP-01, SP-14 | Прод-окружение | migrate deploy + bootstrap-скрипт, сверить перенос старых overrides |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
