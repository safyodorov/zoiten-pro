---
phase: 21-credits
verified: 2026-06-09T14:45:00Z
status: human_needed
score: 16/16 must-haves verified (automated)
human_verification:
  - test: "Открыть /credits, убедиться что показывает 23 кредита (Сбербанк + JetLend), статусы активен/погашён, термин «Кредитор» в заголовках и фильтрах"
    expected: "Список из 23 кредитов, все колонки присутствуют, статусы корректны"
    why_human: "Требует браузер + live БД. Автотест не может проверить что seed данные физически находятся в prod БД"
  - test: "Открыть /credits/[id] для любого JetLend кредита с PDF. Проверить: summary cards показывают currentBalance = amount − Σtело, line-chart убывающей кривой отрисован, таблица строк с дневными датами (не только первые числа месяца)"
    expected: "LoanSummaryCards с реальными числами, LoanBalanceChart с убывающей линией, LoanScheduleTable с ~20+ строками"
    why_human: "Визуальная проверка correctness chart rendering + данные из реального PDF"
  - test: "Открыть /credits/schedule. Переключить день/неделя/месяц. Проверить horizontal sticky scroll: левый блок (7 колонок) не скроллится, периодные колонки скроллятся. Убедиться что видны per-org подытоги и строка «Итого»"
    expected: "Sticky левый блок работает. 2 строки per кредит (Тело + %). Подытоги per org. Grand total внизу"
    why_human: "CSS sticky поведение, горизонтальный scroll и layout нельзя проверить без браузера"
  - test: "Сверка контрольных сумм UAT п. l: месячная разбивка апр 2024 — дек 2026. Проверить per-org: Зойтен тело 74 280 379,24 / проценты 18 596 079,98; Дрим Лайн тело 56 261 014,34 / проценты 11 337 869,94; Пеликан тело 10 783 800,00 / проценты 264 325,34; Сикрет Вэй тело 7 193 280,00 / проценты 435 156,51. ИТОГО тело 148 518 473,58 / проценты 30 633 431,77 (допуск ≤ 200 ₽)"
    expected: "Числа сходятся с Лист2 контрольными суммами в пределах допуска"
    why_human: "Требует отображения сводной таблицы с реальными данными из prod БД и ручной сверки чисел"
  - test: "Открыть /admin/settings → таб «Кредиторы» (не «Банки»). Добавить тестового кредитора, переименовать, удалить. Попытаться удалить Сбербанк или JetLend — ожидается ошибка «Нельзя удалить кредитора с кредитами»"
    expected: "Lender CRUD работает. Restrict onDelete на Lender → корректное сообщение об ошибке"
    why_human: "Требует браузер + live форму + проверку error handling"
---

# Phase 21: Кредиты — Verification Report

**Phase Goal:** Раздел /credits для учёта и визуализации кредитов компании: список кредитов → детальная карточка (сводные числа + график платежей + line-chart остатка основного долга) → сводный горизонтальный график выплат с разбивкой день/неделя/месяц, группировкой по организации с подытогами и Итого. Новая БД Loan + LoanPayment + справочник Lender («Кредитор», переименован из Bank). Новый ERP_SECTION.CREDITS + RBAC. Разовый seed из детальных файлов папки Кредиты/.

**Verified:** 2026-06-09T14:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

All automated checks pass. 5 items require human verification with live browser + prod DB.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Prisma schema has Loan, LoanPayment, Lender models + CREDITS in ERP_SECTION | VERIFIED | schema.prisma lines 1219-1269 + enum line 33 |
| 2 | Migration exists and is correct SQL | VERIFIED | prisma/migrations/20260609_phase21_credits/migration.sql |
| 3 | lib/loan-math.ts pure layer with all exported functions | VERIFIED | 217-line file; computeSchedule, computeLoanAggregates, computeStatus, bucketKey, bucketLabel all exported |
| 4 | tests/loan-math.test.ts 24 tests all green | VERIFIED | npx vitest run → 24/24 passed |
| 5 | app/actions/credits.ts under requireSection("CREDITS","MANAGE") | VERIFIED | lines 60, 103, 161, 193 all guard with MANAGE |
| 6 | app/actions/lender.ts under requireSuperadmin | VERIFIED | line 6 import + usage in every action |
| 7 | /credits list page wired (CreditsTable + filters + LoanModal) | VERIFIED | page.tsx imports and renders CreditsTable, CreditsFilters, LoanModal |
| 8 | /credits/[id] detail wired (LoanSummaryCards + LoanScheduleTable + LoanBalanceChart) | VERIFIED | page.tsx imports and renders all three at lines 110, 123, 126 |
| 9 | /credits/schedule horizontal summary table (день/неделя/месяц, per-org subtotals + grand total) | VERIFIED | SummaryScheduleTable.tsx 544 lines, subtotal/grandTotal logic confirmed in credits-schedule-data.ts |
| 10 | Navigation/RBAC wiring: lib/sections.ts CREDITS, section-titles, nav-items | VERIFIED | sections.ts line 18, section-titles lines 25-27, nav-items line 44 |
| 11 | Lender naming used throughout (NOT "Bank") | VERIFIED | grep for `\bBank\b` in app/components/lib returns nothing |
| 12 | components/settings/LendersTab.tsx exists and wired into settings | VERIFIED | LendersTab.tsx 179 lines, SettingsTabs.tsx imports it, settings page passes lenders prop |
| 13 | scripts/seed-credits.ts with JetLend PDF + Sberbank XLSX parsing | VERIFIED | 781-line script, parseJetLendPdf + parseSberXlsx functions present, pdftotext + xlsx libraries used |
| 14 | Data flows from DB through loan-math to rendered components | VERIFIED | credits-data.ts uses prisma.loan.findMany → computeLoanAggregates → CreditRow; no hardcoded empty returns |
| 15 | TypeScript compiles clean | VERIFIED | npx tsc --noEmit exits with no output (no errors) |
| 16 | Decimal(14,2) for money, Decimal(6,3) for rate in schema | VERIFIED | schema.prisma lines 1242-1243 + migration.sql matches |

**Score:** 16/16 automated truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | Loan, LoanPayment, Lender models + CREDITS enum | VERIFIED | All three models at lines 1219-1269; CREDITS in ERP_SECTION at line 33 |
| `prisma/migrations/20260609_phase21_credits/migration.sql` | ALTER TYPE + CREATE TABLE statements | VERIFIED | Correct SQL for all three tables + enum extension |
| `lib/loan-math.ts` | Pure calc layer, 5 exported functions | VERIFIED | 217 lines, substantive implementation |
| `tests/loan-math.test.ts` | 24 tests | VERIFIED | 174 lines, all 24 pass |
| `app/actions/credits.ts` | CRUD with MANAGE guard | VERIFIED | 223 lines, 4 actions all behind requireSection("CREDITS","MANAGE") |
| `app/actions/lender.ts` | Lender CRUD with superadmin guard | VERIFIED | 144 lines, requireSuperadmin() in every action |
| `lib/credits-data.ts` | loadCredits() querying DB | VERIFIED | prisma.loan.findMany with include + computeLoanAggregates |
| `lib/credits-schedule-data.ts` | loadSummarySchedule() + generateBucketSequence | VERIFIED | prisma.loan.findMany + generateBucketSequence (private helper using bucketKey from loan-math) |
| `app/(dashboard)/credits/page.tsx` | RSC list page with RBAC | VERIFIED | requireSection("CREDITS") + renders CreditsTable/Filters/LoanModal |
| `app/(dashboard)/credits/[id]/page.tsx` | RSC detail page | VERIFIED | requireSection("CREDITS") + renders LoanSummaryCards/LoanBalanceChart/LoanScheduleTable |
| `app/(dashboard)/credits/schedule/page.tsx` | RSC schedule page | VERIFIED | requireSection("CREDITS") + renders SummaryScheduleTable with subtotals/grand total |
| `components/credits/CreditsTable.tsx` | Sticky table with status badges | VERIFIED | 276 lines, StatusBadge, deleteLoan wired |
| `components/credits/LoanModal.tsx` | CRUD modal with nested payment rows | VERIFIED | 488 lines, createLoan/updateLoan wired |
| `components/credits/LoanBalanceChart.tsx` | recharts LineChart | VERIFIED | 144 lines, recharts LineChart with ScheduleRow[] data |
| `components/credits/LoanScheduleTable.tsx` | Schedule table with computed balance | VERIFIED | 114 lines |
| `components/credits/LoanSummaryCards.tsx` | Summary cards rendering real aggregates | VERIFIED | 143 lines, renders totalPrincipalPaid, totalInterestPaid, currentBalance, overpayment |
| `components/credits/SummaryScheduleTable.tsx` | Horizontal sticky table with 2 rows/credit | VERIFIED | 544 lines, subtotal + grandTotal rows, border hierarchy per CLAUDE.md |
| `components/credits/ScheduleControls.tsx` | Day/week/month switcher + date range | VERIFIED | 137 lines |
| `components/settings/LendersTab.tsx` | Lender CRUD tab | VERIFIED | 179 lines, wired into SettingsTabs and settings page |
| `scripts/seed-credits.ts` | Full seed with JetLend PDF + Sber XLSX | VERIFIED | 781 lines, parseJetLendPdf + parseSberXlsx + Лист2 metadata |
| `lib/sections.ts` | CREDITS mapping | VERIFIED | Line 18: `"/credits": "CREDITS"` |
| `components/layout/section-titles.ts` | 3 credits title entries | VERIFIED | Lines 25-27: /credits/schedule, /credits/[id], /credits |
| `components/layout/nav-items.ts` | Landmark icon + Кредиты label | VERIFIED | Line 44: section CREDITS, href /credits, label Кредиты, icon Landmark |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| credits/page.tsx | lib/credits-data.ts | loadCredits() | WIRED | import + usage confirmed |
| credits/page.tsx | CreditsTable | props: rows, lenders, companies, canManage | WIRED | line 84 renders CreditsTable |
| credits/[id]/page.tsx | LoanSummaryCards | agg, amount, annualRatePct, etc. | WIRED | lines 110-120 |
| credits/[id]/page.tsx | LoanBalanceChart | schedule, amount | WIRED | line 123 |
| credits/[id]/page.tsx | LoanScheduleTable | schedule | WIRED | line 126 |
| credits/schedule/page.tsx | credits-schedule-data | loadSummarySchedule() | WIRED | import + line 52 |
| credits/schedule/page.tsx | SummaryScheduleTable | schedule, canManage | WIRED | line 71 |
| credits-data.ts | loan-math | computeLoanAggregates, computeStatus | WIRED | line 6 import + lines 60-61 |
| credits-schedule-data.ts | loan-math | bucketKey, bucketLabel | WIRED | line 9 import + line 86, 181 |
| LoanModal.tsx | actions/credits | createLoan, updateLoan | WIRED | import confirmed in component |
| CreditsTable.tsx | actions/credits | deleteLoan | WIRED | line 8 import confirmed |
| LendersTab.tsx | actions/lender | createLender, updateLender, deleteLender, reorderLenders | WIRED | lines 14-16 import |
| settings/page.tsx | LendersTab (via SettingsTabs) | lenders prop | WIRED | settings page passes lenders, SettingsTabs renders LendersTab |
| middleware.ts | lib/sections.ts | /credits → CREDITS | WIRED | sections.ts line 18 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| CreditsTable.tsx | rows: CreditRow[] | loadCredits() → prisma.loan.findMany | Yes — real DB query with include payments | FLOWING |
| LoanSummaryCards.tsx | agg: LoanAggregates | computeLoanAggregates(amount, payments) from prisma.loan | Yes — computed from real payment rows | FLOWING |
| LoanBalanceChart.tsx | schedule: ScheduleRow[] | computeSchedule(amount, payments) from DB | Yes — computed from real payment rows | FLOWING |
| LoanScheduleTable.tsx | schedule: ScheduleRow[] | same as chart | Yes | FLOWING |
| SummaryScheduleTable.tsx | schedule: SummarySchedule | loadSummarySchedule() → prisma.loan.findMany | Yes — real DB query, bucketing on-the-fly | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| loan-math tests pass | `npx vitest run tests/loan-math.test.ts` | 24/24 passed | PASS |
| TypeScript compiles clean | `npx tsc --noEmit` | No errors | PASS |
| CREDITS in ERP_SECTION enum | grep schema.prisma | Line 33: CREDITS | PASS |
| No "Bank" naming in codebase | grep -rn `\bBank\b` app/ components/ lib/ | 0 matches | PASS |
| Navigation entry exists | grep nav-items.ts | Landmark / Кредиты / CREDITS at line 44 | PASS |
| Seed script non-trivial | wc -l scripts/seed-credits.ts | 781 lines | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| CRED-01 (D-01,U-01,U-04,U-05) | Plan 21-04 | Loan+LoanPayment+Lender models + CREDITS enum + seed | SATISFIED | schema.prisma + migration + seed-credits.ts |
| CRED-02 (D-02,D-03) | Plan 21-03 | Explicit LoanPayment rows, balance computed from amount | SATISFIED | loan-math.ts computeSchedule |
| CRED-03 (D-05,D-19) | Plan 21-01 | Loan model with Decimal(14,2) money, Decimal(6,3) rate | SATISFIED | schema.prisma lines 1235-1255 |
| CRED-04 (D-08,U-03) | Plan 21-01/08 | Lender model (not Bank), UI tab «Кредиторы» | SATISFIED | LendersTab.tsx + lender.ts + no Bank in codebase |
| CRED-05 (D-09) | Plan 21-03 | Status computed from payments, not stored | SATISFIED | computeStatus in loan-math.ts, no status field in Loan model |
| CRED-06 (D-10,D-11) | Plan 21-02 | CREDITS ERP_SECTION + requireSection guards | SATISFIED | sections.ts + all routes + all actions |
| CRED-07 | Plan 21-02 | Sidebar entry Кредиты / Landmark, section-titles, middleware | SATISFIED | nav-items line 44, section-titles lines 25-27, sections.ts line 18 |
| CRED-08 (D-12) | Plan 21-05 | Sticky credits table with filters | SATISFIED | credits/page.tsx + CreditsTable.tsx (276 lines) |
| CRED-09 | Plan 21-05 | LoanModal CRUD with nested payment rows | SATISFIED | LoanModal.tsx (488 lines) + actions/credits.ts |
| CRED-10 (D-18) | Plan 21-06 | Summary cards: amount/paid/interest/balance/overpayment | SATISFIED | LoanSummaryCards.tsx (143 lines), all fields rendered |
| CRED-11 (D-18) | Plan 21-06 | Schedule table + line-chart with recharts | SATISFIED | LoanScheduleTable.tsx + LoanBalanceChart.tsx (recharts LineChart) |
| CRED-12 (D-13,D-13a) | Plan 21-07 | Horizontal sticky table, customizable date range | SATISFIED | SummaryScheduleTable.tsx (544 lines) + ScheduleControls.tsx (137 lines) |
| CRED-13 (D-14,D-15) | Plan 21-07 | Day/week/month switcher, 2 rows per credit | SATISFIED | ScheduleControls wired, 2-row pattern in SummaryScheduleTable |
| CRED-14 (D-16) | Plan 21-07 | Per-org subtotals + grand total, border hierarchy | SATISFIED | subtotalPrincipalByPeriod/grandTotal in credits-schedule-data.ts + CLAUDE.md borders in SummaryScheduleTable |
| CRED-15 (U-01..U-05) | Plan 21-04 | Seed: 23 loans, JetLend PDF + Sber XLSX, per-credit sверка | SATISFIED | seed-credits.ts (781 lines) + 21-08-SUMMARY.md confirms 23 loans / 508 payments deployed |
| CRED-16 (D-07) | Plan 21-04/06 | issueDate=null in seed, fallback to first payment in UI | SATISFIED | seed line 669: `issueDate: null` + detail page lines 48-51 effectiveIssueDate logic |
| D-01 | Plan 21-04 | Seed script (разовый) | SATISFIED | scripts/seed-credits.ts |
| D-02 | Plan 21-01 | Explicit LoanPayment rows (not formulas) | SATISFIED | LoanPayment model in schema |
| D-03 | Plan 21-07 | Bucketing on-the-fly from LoanPayment.date | SATISFIED | generateBucketSequence in credits-schedule-data.ts using bucketKey from loan-math |
| D-04 | Plan 21-03 | Balance computed as amount − Σprincipal | SATISFIED | computeLoanAggregates in loan-math.ts |
| D-05 | Plan 21-01 | Loan model | SATISFIED | schema.prisma |
| D-06 | Plan 21-01 | LoanPayment model | SATISFIED | schema.prisma |
| D-07 | Plan 21-04 | issueDate nullable, null at seed | SATISFIED | schema + seed + detail page fallback |
| D-08 | Plan 21-01/08 | Lender справочник (not Bank) | SATISFIED | LendersTab + lender.ts |
| D-09 | Plan 21-03 | Status computed (no DB field) | SATISFIED | computeStatus + no status field in Loan model |
| D-10 | Plan 21-01/02 | CREDITS in ERP_SECTION | SATISFIED | schema.prisma line 33 + migration |
| D-11 | Plan 21-02/03 | requireSection("CREDITS") / MANAGE guards | SATISFIED | All 4 pages + all actions |
| D-12 | Plan 21-05 | List page sticky table + filters | SATISFIED | credits/page.tsx + CreditsTable.tsx |
| D-13 | Plan 21-07 | Horizontal sticky table | SATISFIED | SummaryScheduleTable.tsx |
| D-13a | Plan 21-07 | Configurable date range | SATISFIED | ScheduleControls.tsx |
| D-14 | Plan 21-07 | Day/week/month bucketing | SATISFIED | generateBucketSequence using bucketKey from loan-math |
| D-15 | Plan 21-07 | 2 rows per credit (body + interest) | SATISFIED | LoanCreditRow/LoanInterestRow in SummaryScheduleTable |
| D-16 | Plan 21-07 | Per-org subtotals + grand total | SATISFIED | subtotalPrincipalByPeriod + grandTotalPrincipalByPeriod |
| D-17 | Plan 21-07 | Left sticky block: org + lender + contract + amount + rate + balance | SATISFIED | COL_WIDTHS/LEFT_OFFSETS in SummaryScheduleTable lines 42-64 |
| D-18 | Plan 21-06 | Detail page: summary cards + schedule table + line-chart | SATISFIED | /credits/[id]/page.tsx |
| D-19 | Plan 21-01 | Decimal(14,2) money, Decimal(6,3) rate | SATISFIED | schema.prisma lines 1242-1243 |
| U-01 | Plan 21-04 | Source: папка Кредиты/ (PDF + XLSX) | SATISFIED | parseJetLendPdf + parseSberXlsx in seed-credits.ts |
| U-02 | Plan 21-04 | Min 2 lenders: Сбербанк + JetLend | SATISFIED | seed upserts both, confirmed in 21-08-SUMMARY |
| U-03 | Phase-wide | Bank→Lender rename, «Кредитор» in UI | SATISFIED | No Bank in codebase; Lender used everywhere |
| U-04 | Plan 21-04 | JetLend PDF auto-parse via pdftotext | SATISFIED | parseJetLendPdf uses execSync('pdftotext -layout ...') |
| U-05 | Plan 21-04 | Sber: Лист2 history + XLSX tail merge | SATISFIED | parseSberXlsx + Лист2 merge logic in seed-credits.ts |

**All 38 requirement IDs (CRED-01..16 + D-01..19 + U-01..05) — SATISFIED**

Note: REQUIREMENTS.md traceability table maps D-14 to `lib/loan-math.ts (generateBucketSequence)` — minor imprecision. `generateBucketSequence` is a private function in `lib/credits-schedule-data.ts`; it uses the exported `bucketKey`/`bucketLabel` from `lib/loan-math.ts`. The bucketing logic is fully implemented and wired, just housed as a local helper in the schedule data module.

---

### Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|------|---------|----------|-----------|
| LoanModal.tsx | `placeholder` HTML attrs on inputs | Info | HTML input placeholder attributes — not stub implementations |
| SummaryScheduleTable.tsx | Code comments mentioning "placeholder" in `{/* Организация — placeholder */}` | Info | Comments document the mixed-rowSpan CLAUDE.md pattern (show "—" in % row) — not stub implementations |
| LoanBalanceChart.tsx | `if (schedule.length === 0) return null` | Info | Legitimate empty-guard, not a stub |

No blockers or warnings found. All pattern matches are false positives on legitimate code.

---

### Human Verification Required

The following items require a live browser with the deployed application at https://zoiten.pro/credits. All automated checks passed.

#### 1. List page functional check

**Test:** Log in as superadmin, open /credits
**Expected:** 23 loans displayed (4 Сбербанк + 19 JetLend), all columns present (Орг / Кредитор / № КД / Сумма / Ставка / Срок / Дата выдачи / Остаток / Статус), filters work, term «Кредитор» (not «Банк») in headers and filters
**Why human:** Requires live browser + prod DB with seeded data to verify counts and filter behavior

#### 2. Detail page — summary cards, chart, schedule table

**Test:** Click a JetLend credit with PDF (e.g. one with contractNumber from JetLend set), open /credits/[id]
**Expected:** Summary cards show real aggregates (currentBalance = amount − Σprincipal). Line-chart renders as a descending curve. Schedule table shows granular daily dates (not just first-of-month), confirming PDF parsing was successful
**Why human:** Visual rendering of recharts component, correctness of displayed numbers vs source data

#### 3. Schedule page — sticky scroll + structure

**Test:** Open /credits/schedule. Test horizontal scroll: left block (7 columns) stays sticky, period columns scroll. Switch day/week/month. Verify 2-row-per-credit structure, per-org subtotal rows, grand total row at bottom
**Expected:** Left block does not scroll horizontally. Structure matches CRED-12..14 requirements
**Why human:** CSS sticky + overflow layout cannot be verified programmatically

#### 4. Control sum verification (UAT item l)

**Test:** In /credits/schedule, set granularity=Месяц, range апр 2024 — дек 2026. Read per-org sums and compare to expected:
- Зойтен: тело 74 280 379,24 / % 18 596 079,98
- Дрим Лайн: тело 56 261 014,34 / % 11 337 869,94
- Пеликан: тело 10 783 800,00 / % 264 325,34
- Сикрет Вэй: тело 7 193 280,00 / % 435 156,51
- ИТОГО: тело 148 518 473,58 / % 30 633 431,77 (допуск ≤ 200 ₽)

**Why human:** Requires reading specific numbers from live UI and comparing with Лист2 control sums

#### 5. Lender CRUD in /admin/settings

**Test:** Open /admin/settings → tab «Кредиторы». Verify Сбербанк and JetLend present. Add test lender, rename, delete. Attempt to delete Сбербанк/JetLend — should show error (onDelete: Restrict)
**Expected:** Tab labeled «Кредиторы» (not «Банки»). CRUD works. Restrict error shown for lenders with loans
**Why human:** Requires form interaction and error message verification

---

### Gaps Summary

No gaps found. All 38 requirement IDs verified in codebase. All artifacts exist, are substantive (non-stub), wired, and have real data flowing through them. TypeScript compiles clean. The phase's own test suite (loan-math: 24/24) passes. Pre-existing test failures in other files are documented as pre-existing (verified at commit c52991b before phase 21 started).

The 5 human verification items are standard UAT checks requiring a live browser — they cannot be resolved programmatically. The phase is code-complete; remaining verification is functional/visual UAT.

---

_Verified: 2026-06-09T14:45:00Z_
_Verifier: Claude (gsd-verifier)_
