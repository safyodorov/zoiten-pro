# Плановые цены + второй фин-рез (стандартные условия) в /prices/wb

**Дата:** 2026-07-07
**Раздел:** Управление ценами WB (`/prices/wb`)
**Статус:** Фаза A задеплоена (quick 260707-k9g); Фаза B v1 реализована (quick 260707-m5v);
**Фаза B v2 реализована** (quick 260708-f23 — срез §5 РЕАЛИЗОВАН: эфф-ставки логистики/хранения
взвешены по нашему стоку per направление, источник = `/api/tariffs/v1/acceptance/coefficients`,
+ строка «Возврат продавцу»)

---

## 1. Цель

Расширить онлайн-калькулятор юнит-экономики WB двумя вещами:

1. **Плановые цены** — отдельная ценовая строка (по умолчанию = текущей, редактируемая), помеченная жёлто-оранжевой плашкой. Плановые цены — база, на которой строятся планы продаж.
2. **Второй фин-рез «на стандартных условиях»** — параллельно текущему расчёту по ИУ показать прибыль/ROI/Re продаж на **стандартной комиссии**, дополнительно учитывающей **хранение, логистику к клиенту и возврат при невыкупе**. Три новых столбца справа.

Для (2) нужны: тарифы складов WB (`/tariffs/box`), усреднённые по нашему распределению стока коэффициенты логистики/хранения (срез бытовая техника / одежда), индекс локализации (ручной), механика обновления.

---

## 2. Согласованные решения (locked)

| # | Развилка | Решение |
|---|----------|---------|
| Q1 | Три новых столбца | **Прибыль-std ₽ / ROI-std % / Re продаж-std %** — зеркало текущего блока. Составляющие (хранение, логистика) — в модалке. |
| Q2 | База хранения | **На проданную единицу через оборачиваемость:** `0,08₽ × литраж × К_хран_эфф × дни_на_складе`, дни = средний остаток ÷ продажи в день. |
| Q3 | Индекс локализации (ИЛ) | **Ручной ввод, одно значение на кабинет** (AppSetting). API у WB нет — только ЛК. Множитель логистики для всех товаров. |
| Q4 | Гранулярность коэффициентов | **По направлению: бытовая техника / одежда** (флаг `Brand.direction.hasSizes`). Два набора К_лог/К_хран. |
| — | Источник коэффициентов | Из `/tariffs/box` per склад, **взвесить по нашему qty** → `К_эфф(направление)`. (Ровно предложение пользователя.) |
| — | Обновление тарифов/коэфф. | **Крон раз в сутки** (через cron-dispatcher) **+ кнопка** «Обновить тарифы складов». |
| — | Объём второго блока | **Полный расчёт**: стандартная комиссия + хранение + Л_эфф (с выкупом) + возврат. Первый блок (ИУ) — **без изменений**. |
| — | Хранение плановой цены | **Поля на `WbCard`** для v1 (не отдельная модель). |
| — | commission.xlsx | **Не грузим** — `WbCard.commFbwStd/commFbsStd` уже синкаются из Tariffs API и покрывают то же. Файл — резерв. |

---

## 3. Ключевые факты из рисёча

- **Стандартная комиссия уже в БД:** `WbCard.commFbwStd/commFbsStd` (синк из `/tariffs/commission`). Сейчас в `calculatePricing` используется только как fallback к ИУ (`page.tsx:512-516`). Комиссионный слот один (`commFbwPct`, `pricing-math.ts:307`).
- **Текущий расчёт неявно = выкуп 100%.** `buyoutPct` есть во входах, но в теле `calculatePricing` **не используется**. Хранение и обратная логистика не моделируются. `deliveryCostRub` — плоские 30₽.
- **Распределение по складам персистится:** `WbCardWarehouseStock (wbCardId, warehouseId, techSize, quantity)` + справочник `WbWarehouse` (кластеры ЦФО/ЮГ/Урал/ПФО/СЗО/СФО/Прочие). Джойн направление→склад вычислим: `Product → MarketplaceArticle → nmId → WbCard → WbCardWarehouseStock → WbWarehouse`.
- **`/tariffs/box`** (host `common-api`, scope **Тарифы**, `?date=YYYY-MM-DD`, лимит 60/мин) даёт per склад: `boxDeliveryBase/Liter/CoefExpr`, `boxStorageBase/Liter/CoefExpr`. ⚠ Значения — **строки с запятой** (`"11,2"` → `.replace(",",".")`); брать раздельные `*CoefExpr`, не legacy `boxDeliveryAndStorageExpr`.
- **ИЛ через API недоступен** — только в ЛК «Тарифы складов». → ручной ввод.
- Габариты (Д×Ш×В) уже есть в `Product` → литраж `V = Д×Ш×В/1000`.
- Оборачиваемость (`Об`, дни) уже считается в модуле stock → источник «дни_на_складе».

---

## 4. Формулы (второй блок «стандартные условия»)

Переменные: `V` — литраж; `ПВ` — доля выкупа (`WbCard.buyoutPercent`/100); `К_лог_эфф`/`К_хран_эфф` — усреднённые по нашему стоку коэффициенты направления (%); `ИЛ` — индекс локализации (множитель).

```
Литраж:            V = Д × Ш × В / 1000            (округл. до 0,1 л)

Логистика «туда»:  Л_туда = (delivBase + delivLiter × max(0, V−1)) × (К_лог_эфф/100) × ИЛ

Логистика эфф.:    Л_эфф = [ Л_туда + (1 − ПВ) × Л_обратно ] / ПВ
                   Л_обратно = AppSetting.wbReturnLogisticsRub (default ~50₽)

Хранение/ед.:      Хранение = storageBasePerLiterDay × V × (К_хран_эфф/100) × дни_на_складе
                   storageBasePerLiterDay = AppSetting.wbStorageBasePerLiter (default 0,08₽)
                   дни_на_складе = средний_остаток ÷ продажи_в_день (оборачиваемость)

Прибыль-std = Прибыль_как_сейчас, но:
  • комиссия = commStdPct (вместо ИУ)
  • плоская deliveryCostRub ЗАМЕНЯЕТСЯ на Л_эфф
  • ДОБАВЛЯЕТСЯ Хранение
ROI-std, Re-std — считаются из Прибыль-std по тем же формулам, что и блок ИУ.
```

`delivBase`, `delivLiter` — базовые ставки (национальные, из box-тарифа/AppSetting). `К_лог_эфф`/`К_хран_эфф` — единственное, что реально варьируется по складам и усредняется по нашему распределению.

**Статусы достоверности:** база хранения 0,08₽/л/сут, механика Л_эфф и множителя ИЛ, применение ИЛ только к логистике (не к хранению) — **подтверждены**. Точная ставка обратной логистики и национальные базовые ставки доставки — берём в AppSetting как редактируемые дефолты (уточняются из ЛК).

**v2 (2026-07-08) — уточнение формул (`calculatePricingStandard` в `lib/pricing-math.ts`):**
- `delivBaseLiter`/`delivAddLiter`/`storageBaseLiter`/`storageAddLiter` — эфф-ставки
  acceptance/coefficients, взвешенные по стоку per направление (§5). Коэффициент склада
  **уже вшит** в эти значения → `Л_туда = (delivBaseLiter + delivAddLiter × max(0,V−1)) × ИЛ`
  (БЕЗ отдельного умножения на `delivCoefPct`, в отличие от v1/`/tariffs/box`).
- Хранение теперь считается по той же схеме база+доп-литр, что и логистика:
  `Хранение = (storageBaseLiter + storageAddLiter × max(0,V−1)) × дни_на_складе`
  (v1 использовал только `storageBasePerLiter × V`, без доп-литра).
- Добавлена строка «Возврат продавцу» = `wbReturnToSellerRub × (defectRatePct/100)`, источник
  `/api/v1/tariffs/return` (`deliveryDumpSupReturnExpr` базовых тарифов).

---

## 5. Вывод эффективных коэффициентов — ✅ РЕАЛИЗОВАН (Фаза B v2, quick 260708-f23)

```
К_эфф(направление, вид_коэф) =
   Σ_склад ( qty(направление, склад) × К(склад, вид_коэф) )
   ─────────────────────────────────────────────────────────
   Σ_склад qty(направление, склад)
```

- `qty(направление, склад)` = `groupBy warehouseId _sum quantity` по `WbCardWarehouseStock` для карточек направления (бытовая/одежда), джойн к `WbWarehouse` **по имени** (не synthetic id).
- Два направления: `hasSizes=true` → одежда, иначе → бытовая техника.
- Считается 4 коэффициента × 2 направления: `К_лог_эфф`, `К_хран_эфф` для каждого. Хранятся в AppSetting (напр. `wbEffCoef.appliances`, `wbEffCoef.clothing`).
- Бакет «Прочие»/`needsClusterReview` — учитывать qty, но пометить (может искажать; логировать долю).

**Реализация (2026-07-08):** источник `К(склад, вид_коэф)` — не `/tariffs/box` (v1), а
**`/api/tariffs/v1/acceptance/coefficients`** (короб, `boxTypeID=2`) — `deliveryBaseLiter`/
`deliveryAdditionalLiter`/`storageBaseLiter`/`storageAdditionalLiter`. Эти поля **уже включают**
применённый коэффициент склада (`deliveryCoef`/`storageCoef`, %) — поэтому формула §4 v2
**не умножает повторно** на `delivCoefPct/storageCoefPct` (в отличие от `/tariffs/box`, где
коэффициент был отдельным множителем). Джойн направление→склад — по имени (`WbWarehouse.name`,
trim/lowercase). Pure-реализация: `lib/wb-eff-coef.ts:computeEffCoefForDirection` (взвешивание +
`coveragePct` + `unmatched`), вызывается из `lib/wb-box-tariffs.ts:syncBoxTariffs`.

---

## 6. Архитектура изменений

### 6.1 БД (`schema.prisma`)

- **`WbBoxTariff`** (новая): `warehouseName @unique`, `deliveryBase`, `deliveryLiter`, `deliveryCoef`, `storageBase`, `storageLiter`, `storageCoef`, `dtTillMax DateTime?`, `updatedAt`. Сырые тарифы складов из `/tariffs/box`.
- **`WbCard`** (плановая цена): `plannedSellerPrice Float?`, `plannedSellerDiscountPct Int?`. `null` → плановая = текущей (дефолт).
- **`AppSetting`** новые ключи: `wbStorageBasePerLiter` (0.08), `wbReturnLogisticsRub` (50), `wbLocalizationIndex` (1.0), `wbEffCoef.appliances` / `wbEffCoef.clothing` (JSON: {logDelivery, logCoef, storageCoef, delivBase, delivLiter, updatedAt}).

### 6.2 pricing-math.ts (ядро, pure)

- `PricingInputs` += `commStdPct?`, `volumeLiters?`, `buyoutPct` (сделать используемым), `logCoefPct?`, `storageCoefPct?`, `delivBase?`, `delivLiter?`, `returnLogisticsRub?`, `storageBasePerLiter?`, `daysInStock?`, `localizationIndex?`.
- `PricingOutputs` += `profitStd?`, `roiPctStd?`, `returnOnSalesPctStd?`, `storageAmount?`, `logisticsEffAmount?` — **все опциональные**, чтобы golden test (nmId 800750522 → profit 567.68 / ROI 26% / Re 7%) остался зелёным при пустых std-входах.
- Новый pure-хелпер `calculatePricingStandard(inputs)` (или ветка внутри `calculatePricing`) — считает второй блок по формулам §4. **Первый блок не трогаем.**
- Обновить `tests/pricing-math.test.ts`: сохранить golden как есть + добавить golden для std-блока с фиксированными входами.

### 6.3 page.tsx (`/prices/wb`)

- Резолвинг `commStdPct = commissionOverride ?? card.commFbwStd`.
- Резолвинг хранения/логистики: `К_лог/К_хран_эфф` из AppSetting по направлению товара; `delivBase/Liter`, `storageBasePerLiter`, `returnLogisticsRub`, `ИЛ` из AppSetting; `daysInStock` из оборачиваемости; `V` из габаритов Product.
- Вызов `calculatePricingStandard` → `row.computedStd` для каждой строки.
- Построение строки `planned` после `current`: `plannedSellerPrice ?? currentSellerPrice`.

### 6.4 UI

- **Плановая плашка:** новая ветка в `stripClass` (жёлто-оранжевый; амбер занят calc-строками) + бейдж «Плановая» в ячейке «Статус цены». Клик по строке → модалка, где плановую цену можно менять; сохранение в `WbCard.plannedSellerPrice`.
- **3 новых столбца** справа: `Прибыль-std ₽` / `ROI-std %` / `Re-std %`. Добавить ключи в `COLUMN_KEYS/SCROLL_COLUMNS/DEFAULT_WIDTHS/HIDEABLE`.
- **Модалка `PricingCalculatorDialog`:** второй блок фин-реза + строки Хранение / Логистика-эфф; опц. правка плановой цены.
- **`GlobalRatesBar`:** редакторы `wbStorageBasePerLiter`, `wbReturnLogisticsRub`, `wbLocalizationIndex`.
- **Кнопка шапки** «Обновить тарифы складов» → `POST /api/wb-box-tariffs-sync`.

### 6.5 Sync / cron

- `lib/wb-api.ts`: `fetchBoxTariffs(date)` → парсинг `/tariffs/box` (замена запятых, `*CoefExpr`).
- `POST /api/wb-box-tariffs-sync`: тянет box-тарифы → upsert `WbBoxTariff` → пересчитывает `К_эфф(направление)` → пишет в AppSetting. RBAC `requireSection("PRICES","MANAGE")`.
- Cron-задача (через существующий dispatcher, раз в сутки) — тот же пересчёт.

---

## 7. Фазировка

**Фаза A — Плановые цены** (self-contained, меньше):
- `WbCard.plannedSellerPrice/plannedSellerDiscountPct` + миграция.
- Строка `planned` + жёлто-оранжевая плашка + бейдж + сохранение.
- **Интеграция с планом продаж:** плановая цена становится базой цены для sales-plan. ⚠ Проверить резолвинг цены в `lib/sales-plan/data.ts` / baseline — где план берёт цену сейчас, и переключить на `plannedSellerPrice ?? current`.

**Фаза B — Второй фин-рез (стандартные условия): ✅ v1 реализована (quick 260707-m5v);
✅ v2 (реальные per-склад ставки acceptance, срез по стоку бытовая/одежда, возврат-продавцу)
(quick 260708-f23)**
- `WbBoxTariff` + `fetchBoxTariffs` + sync-эндпоинт + cron + кнопка. ✅
- v1: флэт-среднее по складам (срез по стоку/направлению из §5 отложен). ✅ (2026-07-07)
- **v2 (2026-07-08):** `WbAcceptanceCoef` (`/api/tariffs/v1/acceptance/coefficients`, короб) +
  `fetchReturnTariffs` (`/api/v1/tariffs/return`) + срез §5 РЕАЛИЗОВАН —
  `lib/wb-eff-coef.ts:computeEffCoefForDirection` взвешивает эфф-ставки логистики/хранения
  по нашему стоку ОТДЕЛЬНО для бытовой техники / одежды, fallback на v2-хардкод до первого
  синка → `AppSetting.wbEffCoef.appliances/clothing` + `wbReturnToSellerRub` +
  `GlobalRatesBar`. ✅
- `pricing-math` (`calculatePricingStandard` v2 — база+доп-литр, коэф уже в ставке, +
  возврат-продавцу; golden первого блока сохранён, std-golden v2 nmId 800750522 запинен). ✅
- 3 столбца (Прибыль-std/ROI-std/Re-std) + второй блок в модалке (Логистика туда/эфф,
  Хранение, Возврат продавцу, эфф-ставки направления, Прибыль-std/ROI-std/Re-std). ✅

Каждая фаза — отдельный цикл GSD (`/gsd:quick --full` или планируемая фаза) с гейтами `tsc` + `npm run test` (golden pricing-math зелёный) + делегированным detached-деплоем и **миграцией на проде**.

---

## 8. Открытые мелочи / отложено

- **Обратная логистика точная ставка** и **национальные базовые ставки доставки** — дефолты в AppSetting, уточняются из ЛК вручную.
- **ИЛ per-артикул** (как реально считает WB) — отложено (нет источника).
- **Pallet-тарифы** — не трогаем (FBW box-модель достаточна).
- **Дни_на_складе** для товаров без продаж/оборачиваемости — fallback (напр. 60 дней или спрятать хранение). Уточнить в Фазе B.
- **commission.xlsx загрузка** — не делаем; если Tariffs API не покрывает предмет, вернёмся.
