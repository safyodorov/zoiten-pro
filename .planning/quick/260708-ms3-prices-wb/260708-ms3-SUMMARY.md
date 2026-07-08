---
phase: quick-260708-ms3
plan: 01
subsystem: ui
tags: [pricing-math, wb, unit-economics, prices-wb, vitest]

requires:
  - phase: quick-260708-lhb
    provides: "calculatePricingStandard v3 (обратная логистика volume-based, ИРП, logisticsEffAmount)"
provides:
  - "PricingOutputs.reverseLogPerUnitAmount / logisticsToPerUnitAmount — вклад логистики на проданную единицу с учётом выкупа"
  - "Колонка «Обратная лог.-std (на ед.), руб.» в /prices/wb показывает амортизированный (не сырой) тариф"
  - "Модалка юнит-экономики: подробная разбивка std-логистики (выкуп/туда/обратка/на ед./эфф.)"
affects: [prices-wb, pricing-math]

tech-stack:
  added: []
  patterns:
    - "Опциональные output-поля добавляются в PricingOutputs без изменения существующих golden-полей — безопасное расширение pure-функции"

key-files:
  created: []
  modified:
    - lib/pricing-math.ts
    - tests/pricing-math.test.ts
    - components/prices/PriceCalculatorTable.tsx
    - components/prices/PricingCalculatorDialog.tsx

key-decisions:
  - "reverseLogPerUnitAmount/logisticsToPerUnitAmount вычислены как чистые производные существующих pv/logTo/revLog — golden (567.68) и std-golden v3 (733.57, logisticsEffAmount 403.5549) не тронуты."
  - "Тождество logisticsToPerUnitAmount + reverseLogPerUnitAmount === logisticsEffAmount залочено отдельным тестом."

patterns-established:
  - "На проданную единицу vs сырой тариф: амортизация через (1−ПВ)/ПВ применяется в UI, а не при хранении в БД — БД хранит сырые тарифы, вывод считается на лету."

requirements-completed: [QUICK-260708-ms3]

duration: ~12min
completed: 2026-07-08
---

# Quick Task 260708-ms3: Обратная логистика (на ед.) в /prices/wb Summary

**Колонка и модалка юнит-экономики /prices/wb теперь показывают вклад обратной логистики на ПРОДАННУЮ единицу `(1−ПВ)/ПВ × сырой_тариф` вместо сырого объёмного тарифа одного возврата — устраняет рассинхрон со значением «Логистика эфф.».**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-08T16:29:00Z (local)
- **Completed:** 2026-07-08T13:35:24Z (UTC, deploy done)
- **Tasks:** 3 (TDD Task 1, UI Task 2, deploy Task 3)
- **Files modified:** 4

## Accomplishments
- `lib/pricing-math.ts` — два новых опциональных output-поля (`reverseLogPerUnitAmount`, `logisticsToPerUnitAmount`), вычисленные в `calculatePricingStandard` как амортизация сырых тарифов через частоту выкупа; golden-ядро и std-golden v3 не изменились.
- `PriceCalculatorTable.tsx` — колонка `reverseLogStd` теперь рендерит `reverseLogPerUnitAmount`, лейбл переименован в «Обратная лог.-std (на ед.), руб.».
- `PricingCalculatorDialog.tsx` — std-блок модалки перестроен: Комиссия(оферта) → Выкуп% → Логистика туда → Обратная логистика (сырой тариф) → Обратная на ед. (× невыкуп, с подписью-формулой) → Логистика эфф. (с пояснением тождества) → Хранение → Прибыль/Re/ROI-std.
- Задеплоено на прод, curl https://zoiten.pro → 200.

## Task Commits

Each task was committed atomically:

1. **Task 1: pricing-math — 2 опциональных output-поля** — `cd26436` (test)
2. **Task 2: UI — таблица + модалка std-блок логистики** — `7d4b790` (feat)
3. **Task 3: Деплой (делегирован)** — no code commit (push + detached deploy.sh on VPS)

**Plan metadata:** (this SUMMARY commit)

## Files Created/Modified
- `lib/pricing-math.ts` — `PricingOutputs.reverseLogPerUnitAmount?` / `logisticsToPerUnitAmount?` + вычисление в `calculatePricingStandard`.
- `tests/pricing-math.test.ts` — 5 новых/дополненных ассертов (std-golden v3: reverseLogPerUnitAmount≈11.3333, logisticsToPerUnitAmount≈392.2216, тождество с logisticsEffAmount; zero-guard buyoutPct=0).
- `components/prices/PriceCalculatorTable.tsx` — значение и лейбл колонки `reverseLogStd`.
- `components/prices/PricingCalculatorDialog.tsx` — перестроенный std-блок логистики с подробной разбивкой.

## Decisions Made
- Новые поля — чистые производные существующих локальных переменных (`pv`, `logTo`, `revLog`) внутри `calculatePricingStandard`, без изменения существующих формул/полей — минимизирует риск регрессии golden-тестов.
- Тождество `logisticsToPerUnitAmount + reverseLogPerUnitAmount === logisticsEffAmount` зафиксировано отдельным тестом (защита от будущего рассинхрона формул).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `npx tsc --noEmit` чист. `npm run test`: pricing-math (48/48), все sales-plan-*.test.ts (170/170 суммарно по файлам), pricing-fallback/pricing-settings — все зелёные. 42 неродственных теста в других модулях (appeal-actions, customer-actions, merge-customers, messenger-ticket, support-sync-*, wb-sync-route, wb-token-validate, template-picker) падали ДО начала работы над этой задачей — вне scope, не трогались (Rule: scope boundary).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- /prices/wb колонка и модалка синхронизированы по семантике логистики на проданную единицу; готово к ручной сверке пользователем.
- Нет блокеров.

## Deploy

- `git push origin main` → `7d4b790` on origin/main.
- `ssh root@85.198.97.89 "cd /opt/zoiten-pro && nohup bash deploy.sh > /var/log/zoiten-deploy.log 2>&1 &"` (detached).
- Deploy log: build succeeded, standalone assets copied, `zoiten-erp.service` restarted, `==> Done`.
- `curl -s -o /dev/null -w "%{http_code}" https://zoiten.pro` → `200`.
- Local == origin/main == prod (no unpushed commits).

## Self-Check: PASSED

- FOUND: lib/pricing-math.ts (reverseLogPerUnitAmount present)
- FOUND: tests/pricing-math.test.ts (5 new assertions present, 48/48 passing)
- FOUND: components/prices/PriceCalculatorTable.tsx (label "Обратная лог.-std (на ед.), руб." present)
- FOUND: components/prices/PricingCalculatorDialog.tsx (std-block restructured, tsc clean)
- FOUND commit cd26436 in git log
- FOUND commit 7d4b790 in git log
- Deploy log contains `==> Done`; curl https://zoiten.pro → 200

---
*Phase: quick-260708-ms3*
*Completed: 2026-07-08*
