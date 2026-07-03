---
phase: 24
slug: finance-balance
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-02
planned: 2026-07-02
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (установлен с Phase 7) |
| **Config file** | vitest.config.ts (alias @ → корень проекта) |
| **Quick run command** | `npx vitest run tests/balance-math.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/balance-math.test.ts tests/balance-data.test.ts tests/wb-finance-api.test.ts` (по мере появления файлов)
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-T1 Prisma-модели + миграция + сид | 24-01 | 1 | FIN-BAL-01 (D-01 модели) | schema validate | `npx prisma validate` | ✅ (tool) | ⬜ pending |
| 24-01-T2 6-точечный чеклист раздела | 24-01 | 1 | FIN-BAL-02/03 (раздел FINANCE) | grep + tsc | `npx tsc --noEmit` + grep `"/finance/"` lib/sections.ts | ✅ (tool) | ⬜ pending |
| 24-01-T3 Маршруты + FinanceTabs + заглушки | 24-01 | 1 | FIN-BAL-04/11 (табы, RBAC read) | tsc | `npx tsc --noEmit` | ✅ (tool) | ⬜ pending |
| 24-02-T1 RED golden-тесты math | 24-02 | 1 | FIN-BAL-05 (D-16/06/09) | unit (RED) | `npx vitest run tests/balance-math.test.ts` (ожидаемо red) | ❌ Wave 0 — создаёт | ⬜ pending |
| 24-02-T2 GREEN lib/balance-math.ts | 24-02 | 1 | FIN-BAL-05 | unit golden | `npx vitest run tests/balance-math.test.ts` | ❌ Wave 0 | ⬜ pending |
| 24-03-T1 Токен 4 точки + bucket finance | 24-03 | 1 | FIN-BAL-06 (D-14 инфраструктура) | tsc + grep | `npx tsc --noEmit` | ✅ (tool) | ⬜ pending |
| 24-03-T2 wb-finance-api + 401/402/429 | 24-03 | 1 | FIN-BAL-06 (D-14 клиент) | unit mocked HTTP | `npx vitest run tests/wb-finance-api.test.ts` | ❌ Wave 0 | ⬜ pending |
| 24-03-T3 CHECKPOINT токен Финансы | 24-03 | 1 | FIN-BAL-06 | human-action | — (Персональный/Сервисный токен, scope 13) | — | ⬜ pending |
| 24-04-T1 point-in-time хелперы | 24-04 | 1 | FIN-BAL-07 (Pitfall 1/4, D-12) | tsc | `npx tsc --noEmit` | ✅ (tool) | ⬜ pending |
| 24-04-T2 тесты знаки/границы/fallback | 24-04 | 1 | FIN-BAL-07 | unit mocked prisma | `npx vitest run tests/balance-data.test.ts` | ❌ Wave 0 | ⬜ pending |
| 24-05-T1 деньги/кредиты/ручные статьи | 24-05 | 2 | FIN-BAL-08 (D-05..08) | tsc | `npx tsc --noEmit` | ✅ (tool) | ⬜ pending |
| 24-05-T2 запасы + дебиторка из снапшотов | 24-05 | 2 | FIN-BAL-08 (D-10/11/13/14) | tsc | `npx tsc --noEmit` | ✅ (tool) | ⬜ pending |
| 24-05-T3 авансы/налоги/капитал + assembly-тест | 24-05 | 2 | FIN-BAL-08 (D-12/15/16/17) | unit assembly | `npx vitest run tests/balance-sheet.test.ts` | ❌ создаётся в task | ⬜ pending |
| 24-06-T1 computeStockSnapshotRows pure | 24-06 | 2 | FIN-BAL-09 (D-01/10/11) | unit fixtures | `npx vitest run tests/finance-snapshot.test.ts` | ❌ создаётся в task | ⬜ pending |
| 24-06-T2 runFinanceSnapshot + cron route | 24-06 | 2 | FIN-BAL-09 (D-02, degraded) | tsc + grep | `npx tsc --noEmit` | ✅ (tool) | ⬜ pending |
| 24-06-T3 регистрация в диспетчере 06:00 | 24-06 | 2 | FIN-BAL-09 (D-02) | tsc + grep | `npx tsc --noEmit` + grep financeBalanceSnapshotCronTime | ✅ (tool) | ⬜ pending |
| 24-07-T1 BalanceSheetTable | 24-07 | 3 | FIN-BAL-10 (D-06/09/11) | tsc + grep bg-muted | `npx tsc --noEmit`; grep `bg-muted/` = 0 | ✅ (tool) | ⬜ pending |
| 24-07-T2 BalanceDatePicker + page | 24-07 | 3 | FIN-BAL-10 (D-09) | tsc | `npx tsc --noEmit` | ✅ (tool) | ⬜ pending |
| 24-08-T1 schemas + 5 actions + тест | 24-08 | 4 | FIN-BAL-12/13/14 (D-04/08/15/17) | unit mocked rbac/prisma | `npx vitest run tests/finance-balance-actions.test.ts` | ❌ создаётся в task | ⬜ pending |
| 24-08-T2 Recalc/Adjustments/TaxSettings + wiring | 24-08 | 4 | FIN-BAL-12/13/14 | tsc | `npx tsc --noEmit` | ✅ (tool) | ⬜ pending |
| 24-09-T1 bootstrap-скрипт 01.07 (CSV+fallback) | 24-09 | 5 | FIN-BAL-15 (D-03) | tsc + grep | `npx tsc --noEmit`; grep STOCK_HISTORY_DAILY_CSV | ✅ (tool) | ⬜ pending |
| 24-09-T2 CHECKPOINT деплой+bootstrap+UAT | 24-09 | 5 | FIN-BAL-15 (все D) | human-verify | — (отложен до снятия запрета) | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Requirement IDs (выведены из решений CONTEXT.md):**
FIN-BAL-01 схема снапшотов/корректировок (D-01) · FIN-BAL-02 раздел FINANCE 6 точек · FIN-BAL-03 RBAC VIEW/MANAGE · FIN-BAL-04 табы Баланс|ОДДС|ОПиУ · FIN-BAL-05 balance-math (D-06/09/16) · FIN-BAL-06 WB Finance клиент+токен (D-14) · FIN-BAL-07 point-in-time хелперы (D-12, Pitfall 1/4) · FIN-BAL-08 loadBalanceSheet (D-05..17) · FIN-BAL-09 cron-снапшот 06:00 (D-01/02) · FIN-BAL-10 UI отчёта (D-06/09/11) · FIN-BAL-11 маршруты/заглушки · FIN-BAL-12 пересчёт даты (D-04) · FIN-BAL-13 ручные статьи (D-08) · FIN-BAL-14 налоги: ставки+факт (D-15/17) · FIN-BAL-15 bootstrap 01.07 + деплой (D-03)

---

## Wave 0 Requirements

- [ ] `tests/balance-math.test.ts` — golden-тесты pure function (Plan 24-02 T1, RED→GREEN)
- [ ] `tests/balance-data.test.ts` — знаки/границы/fallback point-in-time хелперов (Plan 24-04 T2)
- [ ] `tests/wb-finance-api.test.ts` — mocked HTTP: happy + 429→cooldown 'finance' + 402 (Plan 24-03 T2)
- [ ] Human checkpoint: пользователь выпускает WB_FINANCE_TOKEN — **Персональный/Сервисный**, scope «Финансы» бит 13 (Plan 24-03 T3)
- [ ] Живой smoke-curl Balance API + Wave 0 проверка endpoint STOCK_HISTORY_DAILY_CSV — ОТЛОЖЕНЫ в Plan 24-09 T2 (прод/деплой запрещены до окончания параллельной разработки)
- [ ] Миграция `prisma/migrations/20260702_phase24_finance/migration.sql` — вручную (Plan 24-01 T1), применение на VPS в 24-09

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Баланс на 01.07 совпадает с ожиданиями пользователя | D-03 | Сверка с реальными финансами группы | 24-09 UAT п.2: открыть /finance/balance на 01.07, сверить статьи с бухгалтерией/выписками |
| Cron-снапшот пишется утром за вчера | D-02 | Требует прод-окружения и времени | 24-09 UAT п.9: проверить запись снапшота на следующий день после деплоя |
| Дебиторка WB ≈ цифре в ЛК WB | D-14 | Внешняя система | 24-09 UAT п.3: сверить current+хвост с балансом в кабинете WB |
| STOCK_HISTORY_DAILY_CSV endpoint работает | bootstrap (D-03) | Endpoint официально анонсирован, но параметры не подтверждены | 24-09 checkpoint п.5: пробное задание; при 400/404 → --mode=fallback |
| ERP_SECTION чеклист (6 точек) в UI | раздел FINANCE | Визуальная проверка Sidebar/тумблера | 24-09 UAT: раздел в Sidebar, тумблер в /admin/users, /finance-models не сломан |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (живые проверки WB — явно отложены в 24-09 checkpoint по запрету пользователя)
- [x] No watch-mode flags (все команды `vitest run`)
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (planner 2026-07-02)
