---
phase: quick-260708-lhb
plan: 01
subsystem: pricing
tags: [wb-api, pricing-math, unit-economics, appsetting, migration]

# Dependency graph
requires:
  - phase: quick-260708-f23
    provides: calculatePricingStandard v2 (эфф-ставки acceptance/coefficients per направление, «Возврат продавцу»)
  - phase: quick-260708-h9l
    provides: std-компонентные колонки PriceCalculatorTable (logisticsEffStd/storageStd/returnToSellerStd)
provides:
  - reverseLogisticsForVolume() pure-хелпер (официальная формула ВБ, бэнды ≤1л + база+доп-литр V>1)
  - calculatePricingStandard v3 — ИРП-надбавка на Л_туда, объёмная обратная логистика вместо плоской ставки, статья «Возврат продавцу» убрана из profitStd
  - 3 новых AppSetting-ключа (wbReverseLogBaseRub/wbReverseLogPerLiterRub/wbIrpPct) + wbLocalizationIndex обновлён на 1.11
  - UI: колонка reverseLogStd в таблице, «Обратная логистика» + ИЛ/ИРП в модалке
affects: [prices-wb, sales-plan-pdds]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "reverseLogisticsForVolume(V, baseRub, perLiterRub) — pure band-функция, официальная формула ВБ обратной логистики невыкупа"
    - "sellerPriceForIrp вычисляется ДО base (нет циркулярности) — цено-зависимая надбавка на Л_туда"

key-files:
  created:
    - prisma/migrations/20260708_wb_std_v3_reverse_logistics_irp/migration.sql
  modified:
    - lib/pricing-math.ts
    - tests/pricing-math.test.ts
    - app/(dashboard)/prices/wb/page.tsx
    - lib/pricing-schemas.ts
    - components/prices/GlobalRatesBar.tsx
    - components/prices/PriceCalculatorTable.tsx
    - components/prices/PricingCalculatorDialog.tsx
    - docs/superpowers/specs/2026-07-07-wb-planned-prices-standard-finres-design.md

key-decisions:
  - "Обратная логистика невыкупа — volume-based по официальной формуле ВБ (бэнды ≤1л фиксированы 23/26/29/30/32₽, V>1 = база+доп-литр), заменяет плоскую ставку 50₽"
  - "sellerPriceForIrp = priceBeforeDiscount×(1−sellerDiscountPct/100) — допущение «цена продавца до СПП», используется в ИРП-надбавке на Л_туда"
  - "Статья «Возврат продавцу» (returnToSellerRub×defectRatePct/100) убрана из profitStd — дублировала расход обратной логистики"
  - "wbReturnLogisticsRub/wbReturnToSellerRub оставлены в APP_SETTING_KEYS whitelist (их ещё пишет sync lib/wb-box-tariffs.ts), но убраны из UI-редакторов GlobalRatesBar и из stdParams page.tsx"
  - "ИЛ=1.11, ИРП=1.56% — ручные значения пользователя (default в pricing-schemas/page.tsx + миграция-seed)"

patterns-established:
  - "Volume-band pure function (reverseLogisticsForVolume) как отдельный экспортируемый хелпер рядом с calculatePricingStandard — для unit-тестируемости бэндов независимо от полного расчёта"

requirements-completed: [QUICK-260708-lhb]

# Metrics
duration: ~15min
completed: 2026-07-08
---

# Quick Task 260708-lhb: std-юнитка /prices/wb v3 Summary

**Обратная логистика невыкупа переведена с плоской ставки 50₽ на объёмную формулу ВБ (бэнды ≤1л + база+доп-литр), добавлена ИРП-надбавка на логистику туда, убрана дублирующая статья «Возврат продавцу» из profitStd**

## Performance

- **Duration:** ~15 min (3 коммита за 15:49–15:58 MSK)
- **Started:** 2026-07-08T15:49Z (приблизительно, git commit timestamps)
- **Completed:** 2026-07-08T15:58Z (последний код-коммит), деплой ~13:01 UTC
- **Tasks:** 3/3
- **Files modified:** 9 (8 изменённых + 1 новая миграция)

## Accomplishments
- `reverseLogisticsForVolume(V, baseRub, perLiterRub)` — pure-хелпер, официальная формула ВБ (бэнды ≤1л + база+доп-литр V>1), 9 band-тестов запинены
- `calculatePricingStandard` v3: Л_туда с ИРП-надбавкой (`sellerPriceForIrp × ИРП%`), Л_обратно через `reverseLogisticsForVolume`, `profitStd` больше НЕ вычитает «Возврат продавцу»
- std-golden пересчитан под v3 (nmId 800750522): logisticsToAmount≈352.9994, reverseLogisticsAmount=102, logisticsEffAmount≈403.5549, profitStd≈733.5708, roiPctStd≈33.28%, returnOnSalesPctStd≈9.47%
- 3 новых AppSetting-ключа (`wbReverseLogBaseRub`=46, `wbReverseLogPerLiterRub`=14, `wbIrpPct`=1.56) + `wbLocalizationIndex` обновлён на 1.11 миграцией
- UI: колонка `reverseLogStd` («Обратная лог.-std, руб.») в таблице, строка «Обратная логистика» + справочная ИЛ/ИРП в модалке
- Задеплоено на прод detached-деплоем с применённой миграцией-seed

## Task Commits

Each task was committed atomically:

1. **Task 1: pricing-math.ts — reverseLogisticsForVolume + calculatePricingStandard v3 + пересчёт std-golden** - `3aee5ee` (feat)
2. **Task 2: rates/settings/migration — page.tsx stdParams v3 + 3 новых AppSetting + GlobalRatesBar + seed-миграция** - `451f006` (feat)
3. **Task 3: UI (таблица/модалка) + спека + деплой — reverseLogStd колонка, «Обратная логистика», ИЛ/ИРП, финальные гейты, detached deploy** - `5404e7e` (feat)

_Никаких дополнительных коммитов не потребовалось (все 3 таски выполнены линейно без TDD red/green split)._

## Files Created/Modified
- `lib/pricing-math.ts` - `reverseLogisticsForVolume()` экспортирован; `calculatePricingStandard` v3 (ИРП-надбавка, объёмная обр.логистика, убрана статья возврата-продавцу); `PricingInputs`/`PricingOutputs` обновлены (убраны returnLogisticsRub/returnToSellerRub/returnToSellerAmount, добавлены irpPct/reverseLogBaseRub/reverseLogPerLiterRub/reverseLogisticsAmount)
- `tests/pricing-math.test.ts` - band-тесты `reverseLogisticsForVolume` (9 точек), std-golden v3 пересчитан, zero-guard обновлён на `reverseLogisticsAmount`
- `app/(dashboard)/prices/wb/page.tsx` - RATE_KEYS/DEFAULT_RATES/stdParams v3 (irpPct/reverseLogBaseRub/reverseLogPerLiterRub из rates вместо returnLogisticsRub/returnToSellerRub)
- `lib/pricing-schemas.ts` - 3 новых ключа в APP_SETTING_KEYS/DEFAULTS/MAX; wbLocalizationIndex default → 1.11
- `components/prices/GlobalRatesBar.tsx` - редакторы ИРП + обр.логистика база/доп-литр; убраны редакторы «Возврат-логистика»/«Возврат продавцу»; RateKey union синхронен с page.tsx
- `prisma/migrations/20260708_wb_std_v3_reverse_logistics_irp/migration.sql` - seed 3 ключей (ON CONFLICT DO NOTHING) + UPDATE wbLocalizationIndex→1.11
- `components/prices/PriceCalculatorTable.tsx` - stdContext type обновлён (irpPct/reverseLogBaseRub/reverseLogPerLiterRub); колонка reverseLogStd вместо returnToSellerStd (все 5 точек: COLUMN_KEYS/DEFAULT_WIDTHS/HIDEABLE/SCROLL_COLUMNS/render-row)
- `components/prices/PricingCalculatorDialog.tsx` - OutputRow «Обратная логистика» (reverseLogisticsAmount); справочная строка ставок дополнена ИЛ/ИРП
- `docs/superpowers/specs/2026-07-07-wb-planned-prices-standard-finres-design.md` - помечена «Фаза B v3 реализована», добавлен блок формул v3 в §4

## Decisions Made
- Обратная логистика невыкупа переведена с плоской ставки на объёмную по официальной формуле ВБ (см. key-decisions выше)
- sellerPriceForIrp = цена продавца ДО СПП (допущение, зафиксировано в докстринге и спеке)
- returnToSeller-статья убрана как дублирующая обратную логистику
- wbReturnLogisticsRub/wbReturnToSellerRub оставлены в whitelist AppSetting (используются sync-модулем `lib/wb-box-tariffs.ts`), но убраны из UI/stdParams

## Deviations from Plan

None - plan executed exactly as written. Все формулы и числа std-golden v3 совпали с ручным пересчётом plan-checker'а (Л_туда≈352.99944, Л_обратно=102, Л_эфф≈403.5549, profitStd≈733.5708, roiPctStd≈33.28%, returnOnSalesPctStd≈9.4654%).

## Issues Encountered
- Комментарий-шапка GlobalRatesBar.tsx изначально содержал литеральную строку `wbReturnToSellerRub` (для описания что было убрано), что ломало grep-гейт Task 2 (`! grep -q "wbReturnToSellerRub" components/prices/GlobalRatesBar.tsx`). Исправлено перефразированием комментария без литерала ключа — гейт прошёл.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- std-юнитка v3 задеплоена и live на проде; ИЛ=1.11 и ИРП=1.56% применены как ручные AppSetting-значения
- `docs/superpowers/specs/2026-07-07-...` помечена как Фаза B v3 реализована — фазировка §7 закрыта на текущий момент
- Готово для UAT пользователем в /prices/wb (модалка + новая колонка reverseLogStd)
- Открытый вопрос (не в scope этой таски): точная механика ИРП per-nmId у самого ВБ неизвестна — используется единый % на кабинет с допущением цены до СПП; при появлении более точного источника — отдельный quick task

## Gates & Deployment

- `npx tsc --noEmit` → 0 ошибок
- `npm run test -- pricing-math sales-plan` → 149/149 зелёных (golden calculatePricing 567.68 не тронут; std-golden v3 зелёный; band-тесты reverseLogisticsForVolume зелёные; sales-plan регресс зелёный)
- `df -h /` на VPS → 91GB свободно (порог ≥5GB пройден)
- `git push origin main` → `10449be..5404e7e main -> main`
- Detached deploy (`nohup bash deploy.sh`) → `==> Done`, миграция `20260708_wb_std_v3_reverse_logistics_irp` применена
- AppSetting на проде после деплоя: `wbIrpPct=1.56`, `wbLocalizationIndex=1.11`, `wbReverseLogBaseRub=46`, `wbReverseLogPerLiterRub=14`
- `curl https://zoiten.pro` → 200; `curl https://zoiten.pro/prices/wb` → 302 (RBAC redirect на login, ожидаемо для неавторизованного запроса, не 500)
- `journalctl -u zoiten-erp.service` за 2 минуты после рестарта — чист, без ошибок

## Self-Check

- `lib/pricing-math.ts` — FOUND
- `tests/pricing-math.test.ts` — FOUND
- `app/(dashboard)/prices/wb/page.tsx` — FOUND
- `lib/pricing-schemas.ts` — FOUND
- `components/prices/GlobalRatesBar.tsx` — FOUND
- `components/prices/PriceCalculatorTable.tsx` — FOUND
- `components/prices/PricingCalculatorDialog.tsx` — FOUND
- `prisma/migrations/20260708_wb_std_v3_reverse_logistics_irp/migration.sql` — FOUND
- `docs/superpowers/specs/2026-07-07-wb-planned-prices-standard-finres-design.md` — FOUND
- Commit `3aee5ee` — FOUND (git log)
- Commit `451f006` — FOUND (git log)
- Commit `5404e7e` — FOUND (git log)

## Self-Check: PASSED

---
*Phase: quick-260708-lhb*
*Completed: 2026-07-08*
