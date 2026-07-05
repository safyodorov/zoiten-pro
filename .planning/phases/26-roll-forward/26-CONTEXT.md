# Phase 26: План продаж — рабочая правка уровней - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning
**Source:** UAT-обсуждение Phase 25 с пользователем (SUPERADMIN) + live-разбор кода `/sales-plan` в той же сессии

<domain>
## Phase Boundary

Расширение уже развёрнутого раздела `/sales-plan` (Phase 25) под **ручную рабочую модель** пользователя. НЕ переписываем движок и не трогаем факт/ИУ/версионирование — только три поведенческие правки на вкладке «Товары» и в генераторе виртуальных закупок:

1. **Автопротяжка** месячного уровня вперёд (галка «распространить дальше») + механизм сброса ручных уровней → авто.
2. **Явное предупреждение** в матрице, когда план срезан/обнулён из-за стока/поздних приходов.
3. **Динамический roll-forward** виртуальных отгрузок (ACCEPTED + SUGGESTED past-due) + ежедневный крон.

**Вне scope:** факт по дате реализации (сделано — WbSalesDaily), нетто (сделано), Сводный таб, версионирование, ПДДС-feed. Не менять golden-тесты (engine golden, iu=438 068 120 ₽), `iuMetric`, формулу движка `orders=min(ставка,сток)`.
</domain>

<decisions>
## Implementation Decisions (LOCKED — подтверждено пользователем 2026-07-05)

### D-1. Автопротяжка вперёд (SP-15)
- При сохранении уровня в месяц — опция **«распространить на последующие месяцы»**, по умолчанию **ВКЛ**.
- Протяжка пишет уровень во все месяцы горизонта **≥ выбранного**, у которых **нет собственного явного** `SalesPlanMonthLevel` (авто-месяцы).
- Месяцы с **ручным** уровнем протяжка **НЕ перезаписывает** (явное требование пользователя: «ручные не трогать»).
- Опция отжата → пишется только выбранный месяц (текущее поведение).

### D-2. Механизм избавления от ручных (SP-15)
- Поштучный сброс ручного уровня → авто **уже существует**: крестик ✕ в инпуте ячейки (`ProductPlanCell`, `onClear` → `saveMonthLevels` с `targetOrdersPerDay=null` → `deleteMany` уровня). Требование: **сделать заметнее** (сейчас виден только при клике-в-режиме-редактирования).
- **Добавить массовый сброс** «Сбросить ручные → авто»: по товару (строке), по месяцу (колонке), и/или по выбранным ячейкам. Пользователь: «натыкал ручных, но могу сбросить их по отдельности на авто» → нужен и поштучный (есть), и массовый.

### D-3. Предупреждение о срезе плана (SP-16)
- Движок **уже** режет план по стоку (`orders[d] = min(rateRequested, stockEnd)`), поэтому месяц в примере пользователя (сен: уровень 30/день, партия придёт 28.09) уже показывает ~90 шт, не 900 — **расчёт менять не нужно**.
- Не хватает **объяснения**: в матрице «Товары» ячейка месяца показывает срезанное «П» без причины. Добавить бейдж/плашку: «срезано −X% · ближайший приход dd.mm»; полностью нулевой месяц из-за отсутствия товара → «нет товара, ближайший приход dd.mm» (или «товар придёт в <месяц>»).
- Источники (уже считаются в движке per товар): `firstStockoutDate`, `lostUnitsToStockout`, `lostRubToStockout`; у виртуальной закупки — флаг `isLate`. «Ближайший приход» — из `arrivals` (первый `date > today` или `> первого стокаута`).

### D-4. Динамический roll-forward отгрузок (SP-17)
- Семантика «отгрузку не сделали реальной» = виртуальную закупку **не сконвертировали** в реальную `Purchase` (status ≠ CONVERTED).
- Виртуальная закупка с `orderDate < today` **сдвигается вперёд**: `orderDate → today`, `expectedArrivalDate → today + leadTime`. Инвариант «не прошлым числом» (Phase 25, threat T-25-08).
- Сейчас инвариант держится **только для авто-SUGGESTED** при регенерации (`suggestVirtualPurchases`: `orderDate = max(today, breach − leadTime)`). Проблемы:
  - **ACCEPTED не двигается**: в `regenerateVirtualPurchasesInternal` ACCEPTED-закупки подаются в `workArrivals` на исходную `expectedArrivalDate` и не сдвигаются, даже если `orderDate` прошёл. → распространить сдвиг на ACCEPTED (source≠manual? — обсудить: manual ACCEPTED пользователь ставил руками; авто-ACCEPTED = подтверждённое предложение). **Решение по умолчанию:** сдвигать ACCEPTED с `source="auto"`; `source="manual"` — не трогать (пользователь сам управляет датой).
  - **Нет ежедневного триггера**: регенерация только при `saveMonthLevels`/`saveDayOverrides`/ручной кнопке → SUGGESTED «застывают» с датами вчерашнего дня, пока никто не правит план. → добавить крон.
- **Ежедневный крон** (dispatcher, ~04:40 МСК, после wb-sales-daily 04:30): вызывает `regenerateVirtualPurchasesInternal()` (пересоздаёт авто-SUGGESTED с `orderDate≥today`) + сдвигает просроченные авто-ACCEPTED. AppSetting-ключи `salesPlan.vpRollforwardCronTime` / `salesPlan.vpRollforwardLastRun` по образцу `wbSalesDailyCronTime`.
- Замечание: сам **план (движок)** уже отражает «нет товара — нет продаж» на каждом рендере (today двигается → seed-заказы сдвигаются → сток истощается → план проседает). Крон нужен именно для актуальности **дат виртуальных отгрузок**, не для пересчёта плана.

### Claude's Discretion
- Точный UI галки автопротяжки (per-ячейка в режиме редактирования vs общий тумблер тулбара). Рекомендация: тумблер в тулбаре «Товары» рядом с «Пересчитать план», состояние в компоненте (не persist) — влияет на следующий bulk-save.
- Вид бейджа среза (иконка ⚠ + tooltip vs текст под «П»). Держать компактно — ячейка узкая (~110px).
- Массовый сброс: контекстное действие в тулбаре («Сбросить ручные в этом месяце») + per-строка. Не усложнять — MVP: кнопка по месяцу + по товару.
- Порог «срезано»: показывать бейдж если `lostRubToStockout / planTargetRub > ~2%` (не мельтешить на копеечных срезах).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Движок и типы (не менять контракты, только читать значения)
- `lib/sales-plan/engine.ts` — `simulateProductPlan`: `orders=min(rateRequested,stockEnd)`, считает `firstStockoutDate`/`lostUnitsToStockout`/`lostRubToStockout` (строки ~272-283). `getRateRequested` = dayOverrides → monthLevel.targetOrdersPerDay → baseline.
- `lib/sales-plan/virtual-purchases.ts` — `suggestVirtualPurchases`: инвариант `orderDate = max(today, breach−leadTime)` (строка ~232), `isLate` (~236); ACCEPTED/manual подаются в `workArrivals` на исходную дату (строки ~181-191) — **точка правки для roll-forward ACCEPTED**.
- `lib/sales-plan/types.ts` — `ProductPlanResult` (`firstStockoutDate`, `lostUnitsToStockout`, `lostRubToStockout`), `ArrivalBatch` (`date`, `qty`, `source`).

### Server actions
- `app/actions/sales-plan.ts`:
  - `saveMonthLevels(payload)` (~строка 122): upsert/delete `SalesPlanMonthLevel`, в конце `regenerateVirtualPurchasesInternal()` (~167). **Точка правки для автопротяжки** (SP-15) — добавить проброс месяцев без явного уровня.
  - `scaleMonthLevels` (~192): образец «материализовать baseline» — аналог для массовых операций.
  - `regenerateVirtualPurchasesInternal(productIds?)` (~702): загрузка ACCEPTED/DISMISSED/CONVERTED/manual, `suggestVirtualPurchases`, транзакция deleteMany(SUGGESTED+auto)+createMany. **Точка правки для сдвига ACCEPTED** (SP-17).
  - `regenerateVirtualPurchases` (public, ~882) — вызывается из крона.

### UI (вкладка «Товары»)
- `components/sales-plan/ProductPlanTable.tsx` — матрица product×месяц; тулбар «Пересчитать план (N)» + «Масштабировать месяц»; `drafts` state + `applyRecalc` → `saveMonthLevels`. **Точка правки: галка автопротяжки, массовый сброс, бейдж среза в ячейке месяца.**
- `components/sales-plan/ProductPlanCell.tsx` — редактируемая ячейка; крестик ✕ `onClear` (сброс→авто, строки ~92-103). **Сделать заметнее.**
- `components/sales-plan/ProductPlanDialog.tsx` — модалка «Дни»; колонка «Сток(расч)» с красным ⚠ при `stockEnd≤0` (строки ~323-328) — образец подсветки нехватки.
- `app/(dashboard)/sales-plan/products/page.tsx` — RSC: собирает `tableProducts` с `planResult` (уже содержит `firstStockoutDate` и т.д. в `pr`, но в строку таблицы сейчас НЕ пробрасывается — добавить), `arrivals`, `currentLevels`.

### Крон
- `app/api/cron/dispatch/route.ts` — диспетчер; образец wiring — `wbSalesDailyCronTime` (04:30) из quick 260705-f1p, `app/api/cron/wb-sales-daily/route.ts`. Новый роут `app/api/cron/sales-plan-rollforward/route.ts` + `x-cron-secret`.

### Правила проекта
- `CLAUDE.md` — server actions: `"use server"` + `requireSection("SALES","MANAGE")` + try/catch + `revalidatePath`; native `<select>`; sticky-таблицы (сплошной `bg-background`); per-user prefs паттерн; деплой через nohup + миграции через `prisma migrate deploy` в deploy.sh.
- Тесты: vitest, `npm run test`. Не ломать существующие sales-plan тесты (engine golden, iu, virtual, arrivals, plan-fact, pdds-feed).
</canonical_refs>

<specifics>
## Specific Ideas

- SP-17 без новой миграции возможен: сдвиг ACCEPTED = UPDATE полей `orderDate`/`expectedArrivalDate` существующей `VirtualPurchase`; крон = новый route + AppSetting-ключи (KV, без схемы). Проверить, что модель `VirtualPurchase` уже позволяет UPDATE (да — Phase 25).
- SP-16 — чисто presentational: движок уже даёт данные; нужно (а) пробросить `firstStockoutDate`/`lostRubToStockout` в `tableProducts[].planResult` (уже есть в `pr`, просто не мапится в сериализацию строки — см. page.tsx ~239-248) и (б) вычислить «ближайший приход» из `arrivals`. Никаких Prisma-изменений.
- SP-15 — автопротяжка целиком в `saveMonthLevels`: принять `distributeForward: boolean` + для целевого месяца определить последующие месяцы горизонта (`MONTHS` ≥ target), выбрать те, у кого нет `SalesPlanMonthLevel`, и upsert-нуть тем же значением. Клиент: галка + при bulk-save передавать флаг. Массовый сброс: новый action `resetMonthLevelsToAuto({productId?, month?, cells?})` → `deleteMany`.
- Тест «протяжка не перезаписывает ручные»: 3 месяца, средний — ручной; протянуть из первого → первый+третий обновились, средний остался.
- Тест SP-17: ACCEPTED с `orderDate<today` → после regenerate `orderDate=today`, `arrival=today+lead`; SUGGESTED уже покрыт Phase 25.

## Golden anchors (НЕ менять)
- `iuTotalForRange("2026-07-01","2026-12-31") === 438_068_120`
- engine golden test (T+3/T+6/сток-лимит)
- Инвариант виртуальных закупок: `orderDate ≥ today`, `expectedArrivalDate ≥ today + leadTime`
</specifics>

<deferred>
## Deferred Ideas

- Ramp-up скорости после прихода (плавный выход на уровень) — v2, не в этой фазе.
- Персист галки «распространить дальше» за пользователем — не нужно (сессионное состояние достаточно).
- Автосдвиг manual-ACCEPTED — не трогаем (пользователь управляет вручную).
- Уведомления/бейдж на sidebar о просроченных отгрузках — отдельно.
</deferred>

---

*Phase: 26-roll-forward*
*Context gathered: 2026-07-05 — из UAT-обсуждения + live-разбора кода (без отдельного research-агента: инвестигация выполнена в диалоге, точки правки зафиксированы выше)*
