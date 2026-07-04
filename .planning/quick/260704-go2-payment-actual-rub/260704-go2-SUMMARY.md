---
phase: quick-260704-go2
plan: "01"
subsystem: procurement/balance
tags: [procurement, balance, payments, currency]
dependency_graph:
  requires: [PurchasePayment model, balance-data.ts, PurchasePaymentsCard]
  provides: [PurchasePayment.amountRub, amountRub priority in balance and purchases table]
  affects: [lib/balance-data.ts, app/(dashboard)/procurement/purchases/page.tsx, components/procurement/PurchasePaymentsCard.tsx]
tech_stack:
  added: []
  patterns: [nullable additive migration, amountRub priority fallback chain, RSC Decimal→number serialization]
key_files:
  created:
    - prisma/migrations/20260704_purchase_payment_amount_rub/migration.sql
  modified:
    - prisma/schema.prisma
    - app/actions/purchases.ts
    - components/procurement/PurchasePaymentsCard.tsx
    - app/(dashboard)/procurement/purchases/[id]/page.tsx
    - lib/balance-data.ts
    - app/(dashboard)/procurement/purchases/page.tsx
    - tests/balance-sheet.test.ts
decisions:
  - "amountRub размещён внутри ячейки Сумма как sub-блок с grid-cols-5 для non-RUB (не отдельная 5я колонка глобально)"
  - "paidRub в purchases/page.tsx: hasAmountRub-guard сохраняет null когда нет rate и нет amountRub (backward compatible)"
  - "Тест: добавлен CNY-платёж с amountRub=1234 к purch-advance; golden 2000→3234; amountRub:null явно на RUB-платежах"
metrics:
  duration: "15m"
  completed: "2026-07-04T09:09:50Z"
  tasks_completed: 5
  files_modified: 7
---

# Phase quick-260704-go2 Plan 01: Поле «Оплачено ₽ (факт)» на платеже Summary

**One-liner:** Nullable `PurchasePayment.amountRub` с UI-инпутом и приоритетом над `amount×курс` в балансе (Авансы/Готов/В пути) и таблице закупок.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Схема + миграция amountRub | 34d9974 | prisma/schema.prisma, migration.sql |
| 2 | Save action — PaymentSchema.amountRub + прокидывание | 347640e | app/actions/purchases.ts |
| 3 | UI инпут «Оплачено ₽ (факт)» + RSC сериализация | 55e206e | PurchasePaymentsCard.tsx, [id]/page.tsx |
| 4 | Потребители — приоритет amountRub (баланс + таблица) | b974cfd | lib/balance-data.ts, purchases/page.tsx |
| 5 | Тест — amountRub переопределяет amount×rate в advances | 2d5b1d8 | tests/balance-sheet.test.ts |

## What Was Built

Добавлено поле `PurchasePayment.amountRub Decimal?(14,2)` — фактически списанная сумма в рублях по валютным платежам (банковский факт вместо курсовой оценки ЦБ).

**Миграция:** additive nullable `ALTER TABLE "PurchasePayment" ADD COLUMN "amountRub" DECIMAL(14,2)` — обратно совместима, существующие строки получают NULL.

**UI:** На странице закупки для платежей с `currency != RUB/RUR` появляется поле «Оплачено ₽ (факт)» с инпутом number. Placeholder показывает курсовой эквивалент `≈ {amount × rate}`. Grid переключается на `sm:grid-cols-5` для валютных платежей. Поле сохраняется через `savePurchasePayments`.

**Баланс (`lib/balance-data.ts`):** В цикле PAID-платежей: если `p.amountRub != null` — берём `Number(p.amountRub)` без умножения на курс и без `paidApproximate = true`. Это факт, а не оценка.

**Таблица закупок (`purchases/page.tsx`):** Select добавляет `amountRub: true`. `paidRub` считается через Σ PAID с приоритетом: `pay.amountRub != null ? Number(pay.amountRub) : rate != null ? amount*rate : 0`. Сохранена совместимость: когда нет `amountRub` и нет `rate` → `null`.

**Тест:** `purch-advance` в фикстуре теперь содержит RUB-платёж (2000, amountRub: null) + CNY-платёж (amount: 100, amountRub: 1234). Golden: `advances-suppliers = 3234` (не `100 × rate`). Drill-down инвариант `sumLeaves === advLine.amountRub` сохранён.

## Deviations from Plan

None — план выполнен точно как написан. Единственное уточнение архитектуры: `paidRub` в `purchases/page.tsx` использует `hasAmountRub`-guard для сохранения `null`-семантики когда нет ни `amountRub`, ни `rate` (backward compatible с оригинальным `rate != null ? paid * rate : null`).

## Known Stubs

None.

## Threat Flags

None. Поле `amountRub` — клиентский override числового значения без новых auth-path или network-endpoint.

## Verification

```bash
grep amountRub prisma/schema.prisma                             # ✓ Decimal? @db.Decimal(14, 2)
grep "ADD COLUMN" prisma/migrations/20260704_purchase_payment_amount_rub/migration.sql  # ✓
grep -c amountRub app/actions/purchases.ts                      # ✓ 4 вхождения (Zod + createMany×2 + fields)
grep "Оплачено ₽" components/procurement/PurchasePaymentsCard.tsx  # ✓
grep amountRub lib/balance-data.ts                              # ✓ приоритет + not paidApproximate
grep amountRub "app/(dashboard)/procurement/purchases/page.tsx" # ✓ select + paidRub Σ
grep "amountRub: 1234" tests/balance-sheet.test.ts              # ✓
grep "3234" tests/balance-sheet.test.ts                         # ✓
```

Локальный `vitest` НЕ запускался — нет `node_modules` на рабочей машине. Проверка на CI/VPS при деплое через `npm run build` + ревью логики.

## Self-Check: PASSED

- prisma/schema.prisma — содержит `amountRub Decimal? @db.Decimal(14, 2)` в `PurchasePayment`
- prisma/migrations/20260704_purchase_payment_amount_rub/migration.sql — содержит `ADD COLUMN "amountRub"`
- app/actions/purchases.ts — Zod schema + createMany + savePurchasePayments fields
- components/procurement/PurchasePaymentsCard.tsx — PaymentDraft, addPayment, handleSaveAll, UI инпут
- app/(dashboard)/procurement/purchases/[id]/page.tsx — RSC сериализация Decimal→number
- lib/balance-data.ts — приоритет amountRub в цикле PAID-платежей
- app/(dashboard)/procurement/purchases/page.tsx — select + paidRub расчёт
- tests/balance-sheet.test.ts — amountRub: 1234 + 3234 golden
- Commits: 34d9974, 347640e, 55e206e, b974cfd, 2d5b1d8 — все существуют в git log
