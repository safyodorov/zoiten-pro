---
phase: 28
slug: cashflow
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-05
---

> `wave_0_complete: false` — тестовая инфраструктура (vitest) уже существует; сами тесты движка создаются задачей 28-01 Task 2 (Wave 1). Флаг переключается исполнителем после зелёного прогона `npm run test -- finance-cashflow-engine`.

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
| 28-01-01 | 01 | 1 | D-1, D-5 (types + сид) | T-28-03 | fallback-дефолты 55/1/0/0 при отсутствии ключа | typecheck+grep | `npx tsc --noEmit` + grep ON CONFLICT/4 ключа | ❌ W1 | ⬜ pending |
| 28-01-02 | 01 | 1 | D-1, D-2, D-5 (engine + 5 тестов) | T-28-01 | движок не переоценивает virtualPayments (Test 4) | unit (golden) | `npm run test -- finance-cashflow-engine` | ❌ W1 | ⬜ pending |
| 28-01-03 | 01 | 1 | D-3, D-4, D-6 (data.ts DI) | T-28-01/02 | amountRub-приоритет; консолидация RUR намеренна | typecheck+grep | `npx tsc --noEmit` (data.ts чист) | ❌ W1 | ⬜ pending |
| 28-02-01 | 02 | 2 | D-4 (график с факт-линией) | — | N/A | typecheck | `npx tsc --noEmit` | ❌ W2 | ⬜ pending |
| 28-02-02 | 02 | 2 | D-9 (sticky-матрица read-only) | — | sticky bg без /NN (grep-гейт) | typecheck+grep | `npx tsc --noEmit` + grep `/NN` = 0 | ❌ W2 | ⬜ pending |
| 28-02-03 | 02 | 2 | D-7, D-8 (RSC page, RBAC read, пустое состояние) | T-28-02 | requireSection("FINANCE") | build | `npm run build` (~2-3 мин, нужен для RSC/`use server` валидации) | ❌ W2 | ⬜ pending |
| 28-03-01 | 03 | 3 | D-9 (server action + zod) | T-28-03 | requireSection("FINANCE","MANAGE") + zod-границы | typecheck+grep | `npx tsc --noEmit` + grep requireSection | ❌ W3 | ⬜ pending |
| 28-03-02 | 03 | 3 | D-5, D-9 (AssumptionsBar MANAGE-only) | T-28-03 | рендер только при canManage | typecheck | `npx tsc --noEmit` | ❌ W3 | ⬜ pending |
| 28-03-03 | 03 | 3 | методология + интеграция | — | N/A | build | `npm run build` (~2-3 мин) | ❌ W3 | ⬜ pending |

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (9/9 задач с `<automated>`)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (тесты движка создаются в 28-01 Task 2, Wave 1)
- [x] No watch-mode flags
- [x] Feedback latency < 90s (исключение: `npm run build` в 28-02/28-03 Task 3 ~2-3 мин — обоснованно, ловит RSC/`use server`-ошибки, которые tsc не видит)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-05 (plan-checker: VERIFICATION PASSED, 0 blockers; W-1..W-6 закрыты правками планов/этого файла)
