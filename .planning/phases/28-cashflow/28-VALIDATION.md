---
phase: 28
slug: cashflow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-05
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 28-RESEARCH.md §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 (alias `@` → корень) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- finance-cashflow` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~30 seconds (quick), ~90 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- finance-cashflow`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green + sales-plan golden не тронут (`iuTotalForRange("2026-07-01","2026-12-31") === 438_068_120`)
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (заполняется планировщиком) | | | | | | | | | ⬜ pending |

Ключевые behaviors из ресёча (Phase Requirements → Test Map):

| Behavior | Test Type | Command | Exists? |
|----------|-----------|---------|---------|
| Остаток = старт + Σпритоки − Σоттоки (golden) | unit | `npm run test -- finance-cashflow-engine` | ❌ Wave 0 |
| Тайминг wbPayout по понедельникам + лаг | unit | `-- finance-cashflow-engine` | ❌ Wave 0 |
| Gap-детекция (остаток < порога) | unit | `-- finance-cashflow-engine` | ❌ Wave 0 |
| Анти-двойной счёт CONVERTED (виртуальные) | unit | `-- finance-cashflow-engine` | ❌ Wave 0 |
| Сменная payout-модель (инъекция функции, D-1) | unit | `-- finance-cashflow-engine` | ❌ Wave 0 |
| Бакетирование день/неделя/месяц | reuse | `-- date-buckets` (Phase 25) | ✅ |
| pdds-feed контракт | reuse | `-- sales-plan-pdds-feed` (Phase 25) | ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/finance-cashflow-engine.test.ts` — движок (старт/притоки/оттоки/gap/анти-двойной счёт/сменная payout-модель)
- [ ] `lib/finance-cashflow/{types,engine,data}.ts` — новые модули
- [ ] AppSetting-сид `finance.cashflow.*` (wbPayoutPct=55, wbPayoutLagWeeks=1, opexMonthlyRub=0, gapThresholdRub=0)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Матрица/график/KPI рендерятся на проде | UI | Визуальный смок | Открыть /finance/cashflow, проверить матрицу, красную подсветку разрывов, dark-тему |
| Факт-ряд остатка соответствует банку | D-4 | Требует прод-данных | Сверить факт-линию за прошедшие дни с /finance/balance и /bank |
| AssumptionsBar меняет расчёт | D-9 | Interaction | Изменить payout% → таблица пересчиталась после debounce |
| journalctl-smoke после деплоя | deploy | RSC runtime traps не ловятся build'ом | `journalctl -u zoiten-erp --since '2 min ago' | grep ⨯` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
