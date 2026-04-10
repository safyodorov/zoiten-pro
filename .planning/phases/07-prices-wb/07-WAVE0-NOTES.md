# Phase 7 — Wave 0 Verification Notes

**Created:** 2026-04-10
**Status:** VERIFIED (с оговоркой по токену, см. секцию 3)

Эта записка фиксирует результаты верификационных шагов Wave 0 плана `07-00-PLAN.md`: прочтён
canonical Excel `Форма управления ценами.xlsx`, извлечены 30 заголовков колонок и golden test
values для nmId 800750522, проверен базовый URL WB Promotions Calendar API, скопирован fixture
auto-акции из Downloads.

Все приведённые значения — source of truth для последующих волн (планы 07-01..07-11).

---

## 1. Excel 30 колонок (canonical)

**Source:** `C:/Users/User/Desktop/Форма управления ценами.xlsx`
**Лист:** `Лист1`, диапазон `A6:AE18`
**Заголовки:** строка 4 в терминах 1-индексации sheet_to_json (zero-based row index = 3)
**Golden row:** строка 12 (zero-based row index = 11), `nmId` = 800750522

### Полный список колонок (31 с «Фото», 30 в `COLUMN_ORDER`)

Колонка `Фото` имеет rowSpan-группировку и не входит в список расчётных колонок. Все остальные
30 столбцов попадут в `COLUMN_ORDER` из `@/lib/pricing-math` (требование D-12).

| #  | Заголовок (RU)              | Тип      | Формула / источник                                                                                         |
|----|-----------------------------|----------|------------------------------------------------------------------------------------------------------------|
| 0  | Фото                        | meta     | `[Фото товара]` (rowSpan-группировка, не в `COLUMN_ORDER`)                                                 |
| 1  | Сводка                      | meta     | `[Наименование]\n[Остаток WB], шт.\n[Ср. скорость продаж за 7 дней] шт./день`                              |
| 2  | Статус цены                 | enum     | `Текущая цена` \| `Акционная цена regular` \| `Акционная цена auto` \| `Расчетная цена 1/2/3`              |
| 3  | Ярлык                       | text     | `[Ярлык]` (из WbCard)                                                                                      |
| 4  | Артикул                     | int      | `[Артикул]` (nmId)                                                                                         |
| 5  | Процент выкупа              | %        | `[Процент выкупа за месяц]` (WbCard.buyoutPercent)                                                         |
| 6  | Цена для установки          | ₽        | `[Цена для установки]` — input (priceBeforeDiscount)                                                       |
| 7  | Скидка продавца             | %        | `[Скидка продавца]` — input (sellerDiscountPct)                                                            |
| 8  | Цена продавца               | ₽        | `priceBeforeDiscount * (1 - sellerDiscountPct / 100)`                                                      |
| 9  | Скидка WB                   | %        | `[Скидка WB]` — WbCard.discountWb (СПП)                                                                    |
| 10 | Цена со скидкой WB          | ₽        | `[Цена продавца] * (1 - [Скидка WB])`                                                                      |
| 11 | WB Клуб                     | %        | `[скидка WB клуба]` (WbCard.clubDiscount)                                                                  |
| 12 | Цена со скидкой WB клуба    | ₽        | `[Цена со скидкой WB] * (1 - [скидка WB клуба])`                                                           |
| 13 | Кошелёк                     | %        | `[размер кошелька WB]` (AppSetting.wbWalletPct)                                                            |
| 14 | Цена с WB кошельком         | ₽        | `[Цена со скидкой WB клуба] * (1 - [размер кошелька WB])`                                                  |
| 15 | Эквайринг                   | ₽        | `[Ставка эквайринга WB] * [Цена продавца]`                                                                 |
| 16 | Комиссия, %                 | %        | `[Комиссия FBW индивидуальные условия]` (WbCommissionIu.fbw, иначе WbCard.commFbwIu)                       |
| 17 | Комиссия, руб.              | ₽        | `[Цена продавца] * [Комиссия FBW индивидуальные условия]`                                                  |
| 18 | ДРР, %                      | %        | `[ДРР]` (Product.drrOverride → Subcategory.defaultDrrPct → 10)                                             |
| 19 | Реклама, руб.               | ₽        | `[Цена продавца] * [ДРР]`                                                                                  |
| 20 | Тариф джем, руб.            | ₽        | `[Цена продавца] * [Ставка Джем]`                                                                          |
| 21 | К перечислению              | ₽        | `[Цена продавца] - [скидка WB клуба] - [Эквайринг] - [Комиссия, руб.] - [Реклама] - [Тариф Джем]`          |
| 22 | Закупка, руб.               | ₽        | `[Себестоимость]` (ProductCost.avgCost)                                                                    |
| 23 | Брак, руб.                  | ₽        | `[Закупка] * [Процент Брака]`                                                                              |
| 24 | Доставка на маркетплейс, ₽  | ₽        | `[Доставка на маркетплейс]` (Product.deliveryCostRub → 30)                                                 |
| 25 | Кредит, руб.                | ₽        | `[Ставка кредита] * [Цена продавца]`                                                                       |
| 26 | Общие расходы, руб.         | ₽        | `[Ставка общих расходов] * [Цена продавца]`                                                                |
| 27 | Налог, руб.                 | ₽        | `[Ставка налога] * [Цена продавца]`                                                                        |
| 28 | Прибыль, руб.               | ₽        | `[К перечислению] - [Закупка] - [Брак] - [Доставка] - [Кредит] - [Общие расходы] - [Налог]`                |
| 29 | Re продаж, %                | %        | `[Прибыль] / [Цена продавца]`                                                                              |
| 30 | ROI, %                      | %        | `[Прибыль] / [Закупка]`                                                                                    |

**Итого для `COLUMN_ORDER` (план 07-02):** индексы 1..30 = 30 элементов (без «Фото»).

### Примечания к формулам

- **Колонка 12** (`Цена со скидкой WB клуба`): в golden row `clubDiscount = 0%`, поэтому значение
  совпадает с колонкой 10 = `5812.425`. Формула применяется всегда, чтобы поддержать ненулевой
  клубный скид.
- **Колонка 21** (`К перечислению`): в формуле упомянуто «скидка WB клуба» как вычет, но по
  значениям golden row видно, что вычитается именно абсолютная величина `[Цена со скидкой WB] -
  [Цена со скидкой WB клуба]`. В planner-плане 07-02 executor должен уточнить знак/единицу через
  обратный расчёт от golden row.
- **Колонки 29/30**: результат — безразмерный коэффициент (`0.07`), в UI отображается как `7%`
  (умножение на 100).

---

## 2. Golden Test Values (nmId 800750522)

Источник: строка 12 в `Форма управления ценами.xlsx` (zero-based index 11).

### Inputs (подаются в `calculatePricing`)

| Параметр                | Значение | Единица | Источник в реальной БД                |
|-------------------------|----------|---------|---------------------------------------|
| `priceBeforeDiscount`   | 25833    | ₽       | input (цена для установки)            |
| `sellerDiscountPct`     | 70       | %       | input (скидка продавца)               |
| `wbDiscountPct`         | 25       | %       | WbCard.discountWb                     |
| `clubDiscountPct`       | 0        | %       | WbCard.clubDiscount                   |
| `walletPct`             | 2        | %       | AppSetting.wbWalletPct                |
| `acquiringPct`          | 2.7      | %       | AppSetting.wbAcquiringPct             |
| `commFbwPct`            | 32.58    | %       | WbCommissionIu.fbw / WbCard.commFbwIu |
| `drrPct`                | 10       | %       | Product/Subcategory fallback          |
| `jemPct`                | 1        | %       | AppSetting.wbJemPct                   |
| `costPrice`             | 2204     | ₽       | ProductCost.avgCost                   |
| `defectRatePct`         | 2        | %       | Product/Category fallback             |
| `deliveryCostRub`       | 30       | ₽       | Product.deliveryCostRub fallback      |
| `creditPct`             | 7        | %       | AppSetting.wbCreditPct                |
| `overheadPct`           | 6        | %       | AppSetting.wbOverheadPct              |
| `taxPct`                | 8        | %       | AppSetting.wbTaxPct                   |
| `buyoutPct`             | 100      | %       | WbCard.buyoutPercent (для golden = N/A, не влияет) |

### Expected outputs (из Excel строки 12, округления — как у xlsx)

| Поле                      | Значение       | Колонка |
|---------------------------|----------------|---------|
| `sellerPrice`             | 7749.9         | 8       |
| `wbDiscountAmount` (ind.) | (не выводится) |         |
| `priceAfterWbDiscount`    | 5812.425       | 10      |
| `priceAfterClubDiscount`  | 5812.425       | 12      |
| `priceAfterWallet`        | 5696.1765      | 14      |
| `acquiringAmount`         | 209.2473       | 15      |
| `commissionAmount`        | 2524.91742     | 17      |
| `drrAmount`               | 774.99         | 19      |
| `jemAmount`               | 77.499         | 20      |
| `transferAmount`          | 4163.24628     | 21      |
| `purchaseAmount`          | 2204           | 22      |
| `defectAmount`            | 44.08          | 23      |
| `deliveryAmount`          | 30             | 24      |
| `creditAmount`            | 232.497        | 25      |
| `overheadAmount`          | 464.994        | 26      |
| `taxAmount`               | 619.992        | 27      |
| `profit`                  | 567.68328      | 28      |
| `returnOnSalesPct`        | 7 (≈7.32%)     | 29      |
| `roiPct`                  | 26 (≈25.76%)   | 30      |

**Tolerance для тестов (`tests/pricing-math.test.ts`):**

- `sellerPrice`, `priceAfterWbDiscount`, `profit` — `toBeCloseTo(..., 1)` (±0.1 ₽)
- `returnOnSalesPct`, `roiPct` — `toBeCloseTo(..., 0)` (±1%)
- Excel округляет до 2 знаков при отображении, но формулы хранит в полной точности → тесты
  должны использовать неокруглённые вычисления.

### Важно для планов 07-02 / 07-03

- **Проверка круглости 7%/26%:** В Excel строке 12 показаны именно `7%` и `26%` — это результат
  округления. Реальные значения: `567.68328 / 7749.9 ≈ 7.3249%` и `567.68328 / 2204 ≈ 25.757%`.
  Golden-тест сверяет с `toBeCloseTo(7, 0)` и `toBeCloseTo(26, 0)` (±1%) — допустимо.
- **Колонка 21 (К перечислению)**: проверка обратным расчётом:
  `7749.9 - 0 - 209.2473 - 2524.91742 - 774.99 - 77.499 = 4163.24628` ✓ совпадает с Excel.
  Вычет «скидка WB клуба» в golden row = 0, поэтому неоднозначность в формуле не проявляется.
  **Executor плана 07-02 должен дополнительно задать ненулевой clubDiscount в отдельном тесте,
  чтобы подтвердить знак/формулу** (например, добавить integration-тест в плане 07-02).

---

## 3. WB Promotions Calendar API

### Base URL verified

**Базовый URL:** `https://dp-calendar-api.wildberries.ru`

Smoke test был выполнен локально, BEZ WB_API_TOKEN (токен отсутствует в локальной среде разработки).
Цель smoke test — подтвердить, что хост резолвится и возвращает корректный ответ на неавторизованный
запрос (401), что доказывает существование endpoint'а.

### Smoke test команда

```bash
curl -v "https://dp-calendar-api.wildberries.ru/api/v1/calendar/promotions?startDateTime=2026-04-09T00:00:00Z&endDateTime=2026-04-10T00:00:00Z&allPromo=true&limit=1"
# (без Authorization header — проверка доступности хоста)
```

### Результат локального smoke test (без токена)

- **Status code:** `401 Unauthorized` (ожидаемо — нет Authorization header)
- **Response body:**
  ```json
  {
    "title": "unauthorized",
    "detail": "empty Authorization header",
    "code": "167251cb759b cc73ad3617b9d5c82732 4760933a-29",
    "requestId": "b81030302a3b9e5aab5c35ae9d938b66",
    "origin": "s2sauth-calendar",
    "status": 401,
    "statusText": "Unauthorized",
    "timestamp": "2026-04-10T07:07:44Z"
  }
  ```
- **Интерпретация:**
  - ✅ DNS резолвится, TLS handshake успешен
  - ✅ Endpoint `/api/v1/calendar/promotions` существует и отвечает
  - ✅ `origin: s2sauth-calendar` — это именно Calendar API auth-шлюз (подтверждает, что это
    правильный хост для Promotions Calendar API)
  - ⚠️ Фактическая проверка scope токена («Цены и скидки» + «Продвижения») — **deferred на VPS**,
    где WB_API_TOKEN уже настроен в `/etc/zoiten.pro.env`

### Альтернативный URL (для справки)

`https://discounts-prices-api.wildberries.ru` также возвращает 401 на этот endpoint
(`origin: s2s-api-auth-dp`). Это другой шлюз — используется для Prices API, не для Promotions
Calendar. **Использовать следует именно `dp-calendar-api.wildberries.ru` для Promotions Calendar.**

### Зафиксированная константа для плана 07-03

```typescript
// lib/wb-api.ts (добавляется в плане 07-03)
const PROMO_API_BASE = "https://dp-calendar-api.wildberries.ru"
const PROMO_API_ENDPOINTS = {
  list: `${PROMO_API_BASE}/api/v1/calendar/promotions`,
  details: `${PROMO_API_BASE}/api/v1/calendar/promotions/details`,
  nomenclatures: `${PROMO_API_BASE}/api/v1/calendar/promotions/nomenclatures`,
} as const
```

### VPS-side верификация (deferred)

Полная smoke-проверка scope токена будет выполнена при первом запуске плана 07-03 или
`/api/wb-promotions-sync` на VPS:

```bash
# На VPS (root@85.198.97.89):
source /etc/zoiten.pro.env
curl -H "Authorization: $WB_API_TOKEN" \
  "https://dp-calendar-api.wildberries.ru/api/v1/calendar/promotions?startDateTime=2026-04-10T00:00:00Z&endDateTime=2026-06-10T00:00:00Z&allPromo=true&limit=1"
```

**Ожидаемый ответ:** `200 OK` с JSON вида `{ "data": { "promotions": [...] } }`.

Если `401/403` → пользователь перегенерирует токен WB с scope:
- Контент (bit 1)
- Аналитика (bit 2)
- **Цены и скидки (bit 3)** ← обязательно для Promotions Calendar API
- **Продвижение (bit 4)** ← рекомендуется для доступа к акциям
- Статистика (bit 6)
- Тарифы (bit 7)

---

## 4. Fixture auto-акции

- **Source (Downloads):** `C:/Users/User/Downloads/Товары для исключения из акции_Сезон скидок для неё_ товары-герои_24.02.2026 12.20.25.xlsx`
- **Target:** `C:/Claude/zoiten-pro/tests/fixtures/auto-promo-sample.xlsx`
- **Размер:** 8022 байт
- **Статус:** ✅ скопирован

**Примечание:** В плане 07-00 изначально был указан файл с датой `09.04.2026`, но он отсутствует
в `C:/Users/User/Downloads/`. Использован последний по дате доступный образец Excel auto-акции
из того же кабинета WB (от 24.02.2026 «Сезон скидок для неё — товары-герои»). Структура колонок
идентична — парсер D-06 использует **индексы колонок** (A/F/L/M/T/U), а не названия, поэтому
парсер будет работать с любым экспортом из WB кабинета этого типа. Задокументировано как
deviation Rule 3 (blocking issue fix — отсутствие точного файла).

---

## 5. Статус артефактов Wave 0

| Артефакт                                   | Статус | Комментарий                                     |
|--------------------------------------------|--------|-------------------------------------------------|
| `vitest` в devDependencies                 | ✅     | `vitest@4.1.4`, `@vitest/ui@4.1.4`              |
| `package.json` scripts: test/test:watch/ui | ✅     | `"test": "vitest run"`                          |
| `vitest.config.ts` с alias `@`             | ✅     | В корне проекта                                 |
| `tests/fixtures/auto-promo-sample.xlsx`    | ✅     | Fallback-файл скопирован (deviation Rule 3)     |
| 30 заголовков Excel зафиксированы          | ✅     | Секция 1 выше                                   |
| Golden test values для nmId 800750522      | ✅     | Секция 2 выше                                   |
| WB Promotions API base URL verified        | ⚠️     | URL подтверждён локально (401 без токена), полная scope-проверка — на VPS |
| 5 RED test stubs                           | (→ Task 2) |                                             |

---

## 6. Известные риски и блокеры

- **Токен WB не проверен локально** — scope «Цены и скидки» / «Продвижения» подтверждается
  только на VPS при первом запуске `/api/wb-promotions-sync`. Если на VPS получен 401/403 —
  executor плана 07-03 должен запросить у пользователя перегенерацию токена.
- **Fixture auto-акции** использует более ранний экспорт — структура колонок проверяется в
  `tests/excel-auto-promo.test.ts` (план 07-00, Task 2). Если структура разошлась — тест
  упадёт с детальным сообщением.
- **Формула колонки 21** (К перечислению) в golden row имеет `clubDiscount = 0`, что не
  позволяет однозначно проверить знак вычета клубной скидки. Executor плана 07-02 должен
  задать отдельный unit-test с ненулевым `clubDiscountPct`.

---

*Wave 0 заметки, обновление после завершения Task 2 — добавить статус RED test stubs.*
