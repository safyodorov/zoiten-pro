---
quick_id: 260707-k9g
title: "Фаза A — Плановые цены в /prices/wb + интеграция в план продаж"
status: complete
date: 2026-07-07
commits: [e6a6a34, d3dd879, fa18423]
spec: docs/superpowers/specs/2026-07-07-wb-planned-prices-standard-finres-design.md
---

# Итог

Реализована **Фаза A** дизайна плановых цен (§7 спеки). Новая ценовая строка «Плановая» в `/prices/wb` (по умолчанию = текущей, редактируемая, персистится на `WbCard`), и план продаж теперь строит базовую цену товара от плановой (`plannedSellerPrice ?? card.price`) вместо funnel-avg. Фаза B (стандартная комиссия/хранение/логистика/тарифы box/ИЛ) сознательно НЕ реализована — отдельный цикл GSD.

## Сделано (по задачам плана)

**Task 1 — Схема + миграция + строка «Плановая» + плашка/бейдж** (`e6a6a34`):
- `WbCard.plannedSellerPrice Float?` / `plannedSellerDiscountPct Int?` (nullable, без default) + ручная миграция `prisma/migrations/20260707_wb_card_planned_price/migration.sql` (2× `ADD COLUMN`, паттерн 260706-q5a — без локального Postgres).
- `PriceRowType += "planned"`. В `app/(dashboard)/prices/wb/page.tsx` строится строка `planned` сразу после `current` (та же семантика ФИНАЛЬНОЙ цены продавца, что `card.price`/`CalculatedPrice.sellerPrice`); дефолт = текущей через `card.plannedSellerPrice ?? currentPriceBeforeDiscount`, восстановление `priceBeforeDiscount` через существующий `deriveBefore`.
- `PriceCalculatorTable`: жёлто-оранжевая плашка (`border-l-orange-500 bg-orange-100/50`, отличима от амбера calc-строк) + бейдж «Плановая» в ячейке «Статус цены».

**Task 2 — Редактирование + persist** (`d3dd879`):
- `app/actions/pricing.ts`: `savePlannedPrice(wbCardId, sellerPrice, sellerDiscountPct)` — `requireSection("PRICES","MANAGE")`, inline-валидация (цена ≥0, скидка 0-100), `null/null` → сброс к текущей, `revalidatePath("/prices/wb")`.
- `PricingCalculatorDialog`: для `row.type === "planned"` — кнопки «Сохранить плановую цену» (primary, orange) и «Сбросить плановую» (outline), не убирая существующие «Сохранить»/«Сохранить как расчётную цену» (безвредны на planned-строке).

**Task 3 — Интеграция в план продаж** (`fa18423`):
- `lib/sales-plan/data.ts`: select карточек `+= plannedSellerPrice`; агрегат `plannedProductPrice` = среднее `(plannedSellerPrice ?? price)` по картам товара; `avgPriceRub` переопределяется `plannedProductPrice`, если он есть — итоговая цепочка в движке (не тронутом) `ml.priceRub ?? plannedProductPrice ?? avgPriceRub`. `engine.ts`/`types.ts`/immutable `SalesPlanVersion(Day)` не тронуты.

## Проверка

- `npx tsc --noEmit` — 0 ошибок (после каждой таски и финально).
- `npm run test` — 933/975 зелёных; **127/127** тестов `pricing-math` + `sales-plan` (golden nmId 800750522, engine, plan-fact — все зелёные, изолированно и в общем прогоне). Оставшиеся 42 падения — предсуществующие, в несвязанных доменах (support/CRM/WB-sync: appeal-actions, customer-actions, merge-customers, messenger-ticket, response-templates, support-sync-chats/returns, wb-sync-route, wb-token-validate) — не затронуты этой задачей, не чинились (вне scope).

## Деплой

- `git push origin main` → `fa18423` (была уже включена `637760f` docs(spec), запушена ранее).
- Detached deploy (`nohup bash deploy.sh`) → дошёл до `==> Done`, `zoiten-erp.service` active (running).
- Миграция `20260707_wb_card_planned_price` — «All migrations have been successfully applied» (лог), подтверждено `\d "WbCard"` на проде: колонки `plannedSellerPrice double precision` / `plannedSellerDiscountPct integer` присутствуют.
- `curl -s -o /dev/null -w "%{http_code}" https://zoiten.pro` → **200**. `journalctl -u zoiten-erp` чист (`✓ Ready in 200ms`).

## Осталось / примечания

- UAT пользователя: в `/prices/wb` под «Текущая» проверить оранжевую строку «Плановая» → открыть модалку → изменить цену/скидку → «Сохранить плановую цену» → рефреш подтверждает persist; «Сбросить плановую» возвращает к текущей. В `/sales-plan/products` — базовая цена товара берётся из плановой (при пустой плановой = не меняется, т.к. plannedSellerPrice==null эквивалентно текущей цене).
- Осознанное смещение базы плана продаж с funnel-avg (взвешенное по продажам) на текущую/плановую цену — по требованию спеки §7; влияет на все живые draft-планы при следующем пересчёте (не на замороженные `SalesPlanVersion`).
- Фаза B (второй фин-рез «на стандартных условиях» — `WbBoxTariff`, `calculatePricingStandard`, 3 std-столбца, ИЛ, коэффициенты) — не реализована, следующий цикл GSD.
