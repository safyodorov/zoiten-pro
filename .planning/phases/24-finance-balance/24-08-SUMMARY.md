---
phase: 24-finance-balance
plan: 08
subsystem: finance
tags: [zod, server-actions, rbac, prisma, next.js, vitest, react]

requires:
  - phase: 24-finance-balance (24-01)
    provides: FinanceStockSnapshot/FinanceManualAdjustment/FinanceTaxPeriodActual prisma models
  - phase: 24-finance-balance (24-07)
    provides: app/(dashboard)/finance/balance/page.tsx (header-зона placeholder), BalanceSheetTable, BalanceDatePicker
provides:
  - "5 server actions управляющего слоя баланса: recalcBalanceDate, saveFinanceAdjustment, deleteFinanceAdjustment, saveTaxRates, saveTaxPeriodActual"
  - "Zod-схемы вне 'use server' (lib/finance-balance-schemas.ts) — vitest-safe"
  - "3 клиентских компонента: RecalcButton, ManualAdjustmentsModal, TaxSettingsModal"
  - "Wiring в page.tsx — управляющий слой виден только MANAGE"
affects: [24-09, ОДДС, ОПиУ]

tech-stack:
  added: []
  patterns:
    - "Версионирование ручных статей вместо мутации прошлого (m8): edit финансовых полей → close old (deletedAt=new effectiveFrom) + create new, в одном $transaction"
    - "recalcBalanceDate: батч-переоценка через $transaction(array) — qty неизменяемо, Balance API не вызывается"

key-files:
  created:
    - lib/finance-balance-schemas.ts
    - app/actions/finance-balance.ts
    - tests/finance-balance-actions.test.ts
    - components/finance/RecalcButton.tsx
    - components/finance/ManualAdjustmentsModal.tsx
    - components/finance/TaxSettingsModal.tsx
  modified:
    - app/(dashboard)/finance/balance/page.tsx

key-decisions:
  - "canManage-гейт применён в page.tsx (getSectionRole===\"MANAGE\"), а не внутри каждого компонента — паттерн /cash/page.tsx"
  - "saveFinanceAdjustment: только label/comment меняются → in-place update без версии (m8 уточнение — версионируются только amountRub/type/effectiveFrom)"
  - "Новый effectiveFrom < старого effectiveFrom при версионировании → ok:false (нельзя версионировать раньше начала текущей версии)"

patterns-established:
  - "Pattern: recalc-actions переоценивают только денормализованные/производные поля снапшота, никогда не трогают immutable qty"

requirements-completed: [FIN-BAL-12, FIN-BAL-13, FIN-BAL-14]

duration: ~35min
completed: 2026-07-03
---

# Phase 24 Plan 08: Управляющий слой баланса Summary

**5 server actions (recalc/adjustments/tax) + 3 клиентских компонента + Zod-схемы для раздела «Финансы → Баланс», с версионированием ручных статей вместо мутации прошлого (m8).**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-03T13:13:53Z
- **Tasks:** 2/2
- **Files modified:** 7 (4 created lib/actions/tests, 3 created components, 1 modified page.tsx)

## Accomplishments

- `recalcBalanceDate` (D-04): переоценивает `FinanceStockSnapshot.costPriceAtDate/valueRub` по текущей `ProductCost` на выбранную дату; `qty` не меняется; WB Balance API не вызывается (Pitfall 6 — дебиторка прошлой даты невосстановима)
- CRUD ручных статей (D-08): `saveFinanceAdjustment`/`deleteFinanceAdjustment`. Правка `amountRub`/`type`/`effectiveFrom` существующей статьи ВЕРСИОНИРУЕТ — старая версия закрывается `deletedAt=новый effectiveFrom`, создаётся новая (m8, прошлые балансы не переписываются). Правка только `label`/`comment` — in-place update
- `saveTaxRates` (D-15) и `saveTaxPeriodActual` (D-17) — ставки НДС/налога и факт per закрытый квартал
- 3 клиентских компонента (RecalcButton, ManualAdjustmentsModal, TaxSettingsModal) встроены в header-зону `/finance/balance`, видны только пользователям с `MANAGE`

## Task Commits

1. **Task 1: Схемы + server actions + тест** - `17eca1a` (feat)
2. **Task 2: RecalcButton + ManualAdjustmentsModal + TaxSettingsModal + wiring в page** - `1ad9c4e` (feat)

_Плановые метаданные (SUMMARY.md) коммитятся отдельно, см. ниже._

## Files Created/Modified

- `lib/finance-balance-schemas.ts` - Zod-схемы adjustmentSchema/taxRatesSchema/taxPeriodActualSchema (вне 'use server')
- `app/actions/finance-balance.ts` - 5 server actions, все под `requireSection("FINANCE","MANAGE")`
- `tests/finance-balance-actions.test.ts` - 18 unit-тестов (recalc, CRUD, m8-версионирование, RBAC, upsert)
- `components/finance/RecalcButton.tsx` - кнопка «Пересчитать дату»
- `components/finance/ManualAdjustmentsModal.tsx` - список + форма CRUD ручных статей
- `components/finance/TaxSettingsModal.tsx` - ставки + факт per квартал
- `app/(dashboard)/finance/balance/page.tsx` - подгрузка данных (Decimal→Number, Date→YYYY-MM-DD) + рендер 3 компонентов при MANAGE

## Decisions Made

- `canManage` вычисляется один раз в RSC (`getSectionRole("FINANCE")`) и управляет видимостью всех трёх управляющих компонентов — паттерн, уже применённый в `/cash/page.tsx`; сами server actions всё равно проверяют MANAGE независимо (defense in depth)
- Версионирование (m8) срабатывает ТОЛЬКО при изменении `amountRub`/`type`/`effectiveFrom`; правка `label`/`comment` — обычный in-place update (эти поля не влияют на исторические суммы баланса)
- Валидация версионирования: новый `effectiveFrom` не может быть раньше `effectiveFrom` действующей версии (иначе некорректно определить, какая версия действовала в промежутке)

## Deviations from Plan

None — план выполнен как написан. Код совпадает с описанным в `<action>` каждой задачи; все acceptance criteria (grep-проверки, vitest, tsc) прошли без дополнительных правок.

## Issues Encountered

None.

## Known Stubs

None. Обе задачи используют реальные server actions и реальные Prisma-модели из 24-01; UI полностью подключён к данным через RSC page.tsx (без hardcoded placeholder-значений).

## Verification

- `npx vitest run tests/finance-balance-actions.test.ts` — **18/18 passed**
- `npx tsc --noEmit` — **0 ошибок** (весь проект, включая новые файлы)
- Acceptance-criteria greps (Task 1 и Task 2) — все совпали:
  - `requireSection("FINANCE", "MANAGE")` × 5 в `app/actions/finance-balance.ts`
  - `wb-finance-api` НЕ импортирован (Pitfall 6)
  - `revalidatePath("/finance/balance")` найден
  - `deletedAt` найден (soft delete + версионирование)
  - `<select>` (native) найден в `ManualAdjustmentsModal.tsx`
  - `render=` (base-ui Dialog, не asChild) найден
  - 3 компонента отрендерены в `page.tsx`
- Полный `npx vitest run` показывает 41 failing теста в 10 несвязанных файлах (`appeal-actions`, `customer-actions`, `customer-sync-chat`, `merge-customers`, `messenger-ticket`, `response-templates`, `support-sync-chats`, `support-sync-returns`, `template-picker`, `wb-sync-route`) — **pre-existing**, уже задокументированы в `.planning/phases/24-finance-balance/deferred-items.md` (запись 24-06, подтверждено через `git stash` до Phase 24). Не относятся к изменениям 24-08 (finance-balance файлы не пересекаются)

## m8 Confirmation (версионирование ручных статей)

Подтверждено тестом `saveFinanceAdjustment > m8: правка amountRub версионирует`:
1. `financeManualAdjustment.findUnique` загружает старую версию
2. Если изменились `amountRub`/`type`/`effectiveFrom` → `$transaction([update(old, {deletedAt: newEffectiveFrom}), create(new version)])`
3. Прошлые балансы (`asOf < newEffectiveFrom`) продолжают видеть старую сумму через фильтр `effectiveFrom<=asOf AND (deletedAt=null OR deletedAt>asOf)` (уже реализован в `lib/balance-data.ts` из 24-05) — НЕ переписаны ретроактивно
4. Правка только `label`/`comment` → in-place `update`, без версии и без `$transaction`

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Раздел «Финансы → Баланс» полностью функционален: чтение (24-05/24-07) + управление (24-08)
- Готово для 24-09 (вероятно — финальная доводка/полировка баланса) и для будущих фаз ОДДС/ОПиУ, которые могут переиспользовать паттерн версионирования ручных статей и RBAC-гейт `canManage`

---
*Phase: 24-finance-balance*
*Completed: 2026-07-03*

## Self-Check: PASSED

All created files verified present on disk; both task commits (`17eca1a`, `1ad9c4e`) verified in `git log`.
