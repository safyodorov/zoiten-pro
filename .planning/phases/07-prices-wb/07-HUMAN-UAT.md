---
status: partial
phase: 07-prices-wb
source: [07-VERIFICATION.md]
started: 2026-04-10T07:55:00Z
updated: 2026-04-10T07:55:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Полный UI /prices/wb (rowSpan + sticky + indicator strips)
expected: Таблица с группировкой Product → WbCard → PriceRows. rowSpan объединяет Фото/Сводку. Первые 4 колонки sticky при горизонтальном скролле. Indicator strips: синяя (regular акции), фиолетовая (auto), янтарная (расчётные). Подсветка Прибыль/Re/ROI зелёным/красным.
result: [pending]

### 2. GlobalRatesBar — debounced 500ms save (PRICES-06)
expected: Изменить любую из 6 ставок (Кошелёк/Эквайринг/ДЖЕМ/Кредит/Накладные/Налог) → toast «Ставки сохранены» через ~500ms → F5 → значение сохранилось, все расчёты в таблице пересчитаны.
result: [pending]

### 3. PricingCalculatorDialog — realtime пересчёт < 100ms (PRICES-07)
expected: Клик по любой ценовой строке → модалка открывается с заполненными inputs. Изменить «Цена продавца до скидки» или «ДРР» → Прибыль/Re продаж/ROI обновляются в правой колонке мгновенно (< 100ms, без network request).
result: [pending]

### 4. Сохранение расчётной цены в слот 1/2/3 (PRICES-08)
expected: В модалке: ввести название «Тест», выбрать слот 1, нажать «Сохранить как расчётную цену» → toast успеха → модалка закрывается → страница revalidate → новая строка с янтарной полосой и названием «Тест» появляется в таблице.
result: [pending]

### 5. Scope checkboxes ДРР/Брак (PRICES-09)
expected: Открыть модалку любой строки. Изменить ДРР на 15%, СНЯТЬ чекбокс «только этот товар». Сохранить. Проверить: Subcategory.defaultDrrPct обновлён (или Category.defaultDefectRatePct для брака). Все товары в этой подкатегории пересчитываются с новым ДРР.
result: [pending]

### 6. Реальная синхронизация акций с WB API (PRICES-10)
expected: На /prices/wb нажать «Синхронизировать акции» → спиннер → реальный вызов WB Promotions Calendar API → запись в WbPromotion + WbPromotionNomenclature → toast «N акций синхронизировано» → строки regular/auto появляются в таблице (DESC по sellerPriceBeforeDiscount).
result: [pending]

### 7. Загрузка Excel auto-акций (PRICES-11)
expected: Нажать «Загрузить Excel (авто-акции)» → выбрать `tests/fixtures/auto-promo-sample.xlsx` или любой реальный файл из кабинета WB → parseAutoPromoExcel корректно извлекает колонки A/F/L/M/S/T → upsert WbPromotion type='auto' + nomenclatures → toast → auto-строки появляются в таблице с фиолетовой полосой.
result: [pending]

### 8. PromoTooltip hover (PRICES-15)
expected: Навести курсор на название акции (в столбце «Сводка» строки regular/auto) → tooltip показывает description + advantages из WbPromotion. Закрытие при уведении курсора.
result: [pending]

### 9. /prices/ozon ComingSoon (PRICES-13)
expected: Переход на /prices/ozon → видна ComingSoon страница (как /cards/ozon). Табы WB/Ozon в /prices layout работают — активный таб подсвечен border-primary.
result: [pending]

### 10. RBAC VIEW vs MANAGE (PRICES-14)
expected: Под VIEWER (только PRICES.VIEW) → таблица видна, GlobalRatesBar readonly (или инпуты disabled), клик по строке → модалка открывается, но «Сохранить» возвращает 403. Под MANAGER (PRICES.MANAGE) → полный доступ.
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0
blocked: 0

## Gaps

(будут заполнены по результатам тестирования)
