# Feature Landscape — Управление остатками (v1.2)

**Domain:** Inventory management for marketplace sellers (Wildberries primary, Ozon/ДМ/ЯМ secondary), 50-200 SKU, team 10+
**Researched:** 2026-04-21
**Scope:** FEATURES only — что делать в v1.2, что отложить на v1.3+, что не делать никогда

---

## Краткая сводка

Исследование профессиональных ERP для маркетплейсов (МойСклад, MPStats, Seller Fox, Анабар, 1С) + общих inventory management patterns показывает чёткую иерархию фич:

1. **Must-have (table stakes) для v1.2** — агрегация 4 уровней (РФ/товар → артикул → МП → склад WB в разрезе кластеров), 4 метрики О/З/Об/Д, Excel-импорт склада Иваново, ручной ввод Производства, глобальная норма оборачиваемости, цветовая кодировка дефицита
2. **Differentiators** — изоляция per-артикул (а не per-nmId) для FBS-менеджмента, детализация до конкретных складов WB внутри кластера, UX с expand-in-place без потери контекста
3. **Anti-patterns** — НЕ встраивать в v1.2 движения остатков, резервирование, алерты, safety stock (это v1.3+ «Планирование закупок»)
4. **Deferrable** — мобильная версия, CSV-экспорт, sparkline-графики динамики, fuzzy-matching при импорте

Для 50-200 SKU и команды 10+ критично: простота + скорость загрузки данных + наглядность дефицита. Сложные supply-chain фичи (EOQ, safety stock с σ-расчётом) — избыточны в этом масштабе.

---

## Table Stakes — что обязательно в v1.2

Фичи, без которых раздел «/stock» не выполняет свою цель. Отсутствие = менеджер возвращается в кабинет WB / Excel / МойСклад.

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Агрегация РФ = Иваново + Производство + МП по товару (Product-level)** | Главный вопрос менеджера: «сколько всего штук этого товара у нас?» Без этого раздел бесполезен | Low | Product.ivanovoStock, Product.productionStock, агрегация WbCardWarehouseStock |
| **Детализация по артикулам маркетплейсов (per-МА разрез)** | Один товар = 1 УКТ, но несколько артикулов WB (разные цвета/размеры); складывать их в один остаток нельзя — менеджер заказывает конкретные артикулы | Low | MarketplaceArticle → WbCard mapping уже есть |
| **Разрез по маркетплейсам (WB + Ozon + ДМ + ЯМ колонки)** | Менеджер смотрит «где товар кончается быстрее» — на WB или Ozon | Medium (WB сразу, Ozon/ДМ/ЯМ заглушки) | WB сразу, остальные — заглушка «—» |
| **Per-кластер разрез WB (7 кластеров)** | WB логистика тарифицируется по кластеру; менеджер принимает решение «куда везти на ФБО» по кластеру, не по складу | Medium | WbWarehouse справочник + WbCardWarehouseStock + агрегация SUM по cluster |
| **Expand кластер → конкретные склады WB** | Конкретный склад нужен когда готовишь поставку (адрес доставки); без этого менеджер идёт в кабинет WB за адресом | Medium | UI expand-in-place, сортировка по quantity desc |
| **Метрика О (Остаток, шт)** | Базовая метрика, всем понятная | Low | SUM всех источников |
| **Метрика З (Заказы в день за 7 дн)** | Базовая метрика скорости продаж; для WB уже есть `WbCard.avgSalesSpeed7d` | Low (WB) / N/A (другие МП) | Переиспользовать существующее |
| **Метрика Об (Оборачиваемость = О / З)** | Ключевая метрика WB 2026 — «каждый день на складе = реальные деньги» (см. источник sellerden.ru). Влияет на рейтинг продавца | Low | Простая формула |
| **Метрика Д (Дефицит = (Норма - Об) × З)** | Показывает сколько штук нужно довезти до нормы; в отличие от «просто дефицит = нормы нет» | Low | Простая формула, guard от деления на 0 |
| **Глобальная «Норма оборачиваемости» (default 37 дней)** | Разные компании работают с разной нормой; hardcoded 37 не подходит всем | Low | AppSetting ключ `stock.turnoverNormDays`, редактирование в шапке |
| **Excel-импорт остатков Иваново (по УКТ)** | Склад Иваново не имеет API; единственный реалистичный сценарий — выгрузка из 1С/WMS в Excel и загрузка | Medium | xlsx lib, server action, валидация УКТ |
| **Ручной ввод остатков Производства** | Производство тоже без API, но обычно это 1 поле на товар (не таблица) | Low | Input в форме товара или inline в /stock |
| **Цветовая кодировка дефицита** | Глазами искать красное в таблице в 10× быстрее чем читать числа; индустриальный стандарт (green/yellow/red inventory). См. inflowinventory.com | Low | Tailwind classes, conditional render |
| **RBAC на раздел STOCK** | Раздел есть в ERP_SECTION enum; без requireSection стажёр увидит закупочные данные | Low | Одна строка в server action / page.tsx |

### Нюансы Excel-импорта (подраздел table stakes)

Исследование 1С/МойСклад/KeyCRM показывает обязательный UX-контракт импорта:

- **Формат файла фиксирован**: колонки «УКТ» (или «SKU» / «Код»), «Остаток» (шт). Наименование — опциональная reference-колонка, НЕ используется для matching (ошибки в пробелах/регистре/описаниях, см. is1c.ru)
- **Preview + Confirm UI обязателен** для 50-200 строк — пользователь видит что загрузится до коммита. Для 5-10 строк допустим toast-only, но для МП-масштаба preview критичен
- **Unmatched rows** (УКТ в Excel, которого нет в БД) — показать секцией «Не найдены: N строк» с кнопкой «Игнорировать и продолжить». НЕ блокировать импорт целиком
- **Идемпотентность**: повторная загрузка того же файла = перезапись, не прибавление. Это ожидается пользователями (см. МойСклад support)
- **Rollback**: если валидация упала посередине — транзакция откатывается целиком, частично залитых остатков быть не должно

---

## Differentiators — что сделает Zoiten ERP лучше стандартных решений

Фичи, которые не обязательны, но дают ощутимый value перед МойСкладом/MPStats.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Per-артикул (MarketplaceArticle) агрегация, не per-nmId** | МойСклад и MPStats показывают остатки только per-nmId; Zoiten агрегирует на уровень товара + всех его артикулов WB одновременно (один товар = 1-10 артикулов WB, см. модель Product.articles). Менеджер видит картину товара целиком | Low (структура БД уже есть) | Использует существующий MarketplaceArticle.article → WbCard.nmId mapping |
| **Единый экран Иваново + Производство + ВСЕ МП одновременно** | У конкурентов: МойСклад → только МП, 1С → только свой склад, MPStats → только аналитика WB. Zoiten объединяет источники в одной строке таблицы | Medium | Требует колоночную вёрстку с sticky заголовками |
| **Dedicated /stock/wb с кластерным разрезом для FBO-планирования** | WB тарифы логистики различаются в 2-3 раза между кластерами; решение «куда везти» = экономия десятков тысяч в месяц. Стандартные ERP это не визуализируют | Medium | Справочник WbWarehouse + SUM по cluster |
| **↻ «Применить глобальную норму»** per строка (как в /prices/wb) | Пользователь может временно переопределить норму для конкретного товара не меняя глобальной | Low | Переиспользовать паттерн из PriceCalculatorTable |
| **Кнопка «Обновить из WB»** на странице (полный /api/wb-sync trigger) | Менеджер не хочет идти в /cards/wb чтобы обновить, потом в /stock смотреть | Low | Переиспользование существующей кнопки |
| **Sticky колонки «Товар + УКТ»** при горизонтальном скролле | Таблица будет широкая (РФ + 4 МП + 7 кластеров = 12+ колонок) | Low (Tailwind sticky) | Паттерн уже есть в /prices/wb |
| **Persistence состояния expand/collapse кластеров в localStorage** | Менеджер всегда смотрит один-два кластера (например ЦФО+ПФО); не хочет каждый раз раскрывать | Low | `zoiten.stock.wb.expandedClusters` |
| **Фильтр «Показать только дефицитные» (Д > 0) toggle** | При 200 SKU пролистывать «всё ок» — трата времени | Low | Query param |

---

## Future / Deferrable — v1.3+ «Планирование закупок», НЕ делать в v1.2

Все эти фичи — часть domain, но относятся к следующему milestone. Их упоминание здесь помогает roadmapper'у не смешать скоуп.

| Feature | Why Deferred | Complexity if added | Triggers next milestone |
|---------|--------------|---------------------|-------------------------|
| **Движение остатков (in/out log)** | Требует модель StockMovement (fromWarehouse, toWarehouse, quantity, date, type=IN/OUT/TRANSFER/ADJUSTMENT); v1.2 — только snapshot остатков. Исторические данные WB API не отдаёт за прошлое | High | v1.3 «Планирование закупок» |
| **Резервирование под заказы** | Нужна модель StockReservation + интеграция с заказами Ozon/WB (orderId → quantity reserved) | High | v1.3 или v1.4 |
| **Alerts (email/telegram/in-app) при Об < N дней** | Требует подписки пользователей на товары + job-scheduler + notification delivery. 50-200 SKU обычно просматриваются визуально каждый день | Medium | v1.3 «Планирование закупок» или v1.5 «Уведомления» |
| **Safety stock (σ-расчёт по вариативности спроса)** | Формула SS = Z × √(σd²×LT + ad²×σLT²) избыточна для 50-200 SKU; менеджер обычно использует простое «норма × средний спрос». См. abcsupplychain.com | High | v1.4+ (когда масштаб 500+ SKU) |
| **Reorder point (автоматический триггер заказа)** | Требует lead time поставщика в БД + UI планирования поставок | High | v1.3 «Планирование закупок» |
| **EOQ (Economic Order Quantity) расчёт** | Требует cost-of-holding + cost-of-ordering; для 50-200 SKU проще решать эмпирически | High | v1.4+ |
| **Stock-out rate (% времени когда товар был 0 на складе)** | Требует исторические snapshot остатков (ежедневные); v1.2 только current snapshot | Medium | v1.3 после накопления истории |
| **Прогноз исчерпания (дата когда товар кончится)** | Производная от Об: today + Об. Можно добавить в v1.2 как derived column, но требует UI решения (tooltip / новая колонка) | Low | Может быть добавлено в v1.2 как LOW-priority requirement |
| **Sparkline-график «Остаток за 30 дней»** | Требует ежедневные snapshot в БД — не накоплено | Medium | v1.3+ |
| **ABC-анализ по оборачиваемости** | В модели Product уже есть abcStatus (manual). Автоматический ABC требует истории продаж | Medium | v1.4+ |
| **Сравнение двух товаров (side-by-side)** | Есть у MPStats. Полезно, но не критично для 50-200 SKU | Low | Future |
| **Экспорт таблицы /stock в Excel** | Полезно для offline-отчётов; не критично т.к. исходник (БД) в той же системе | Low | Может быть добавлено позднее как мелкий improvement |
| **Мобильная/tablet-версия для складских сотрудников** | Склад Иваново заливает Excel с компьютера; per-warehouse inventory apps — другой класс решений (WMS). 10+ человек команды, вероятно, все с компьютерами | Medium | Если появится use case. Landing уже адаптивный, dashboard — нет |
| **Импорт остатков Ozon/ДМ/ЯМ через API** | Ozon API интеграция — отдельный milestone per Project.md Out of Scope | High | v1.3 или v1.4 |

---

## Anti-Features — что явно НЕ делать

Фичи, которые кажутся нужными, но на самом деле вредны или избыточны для данного масштаба/домена.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Автоматическое списание остатков Иваново по заказам WB** | WB заказы уходят с FBO-склада WB, не с Иваново. Смешивание — причина багов. Иваново — отдельная физическая сущность | Только ручной импорт / ввод |
| **Real-time остатки WB (polling API каждые N минут)** | WB Statistics API rate-limited, аккаунт получит бан. И менеджеру не нужна real-time точность — достаточно 1-2 раза в день | Кнопка «Обновить» + суточный cron |
| **Остатки per-размер товара (WB techSize)** | У Zoiten 50-200 SKU, товары обычно без размеров (Дом/Кухня/Красота). Добавление размерного измерения усложняет UI в 3-4 раза на 2-3% use cases | Если появится размерный товар → v1.4+ |
| **Inline-редактирование остатков в таблице /stock** | Остатки Иваново — из Excel (authoritative source — WMS склада), ручное редактирование ломает audit trail. Остатки WB — из API, ручное редактирование бессмысленно | Редактирование только Производства (отдельное поле в карточке товара), остальное только import |
| **Попытка показать остатки Ozon сейчас (v1.2)** | Ozon API интеграция — отдельный milestone; реализация сейчас удвоит скоуп v1.2 и задержит основную ценность | Заглушка ComingSoon на /stock/ozon |
| **Фильтр «Показать товары которых нет на складе WB» отдельным разделом** | Эта информация уже видна в колонке WB = 0; отдельный экран — избыточный роутинг | Toggle-фильтр в шапке /stock |
| **График «прогноз продаж ML-модель»** | Для 50-200 SKU и З=среднее за 7 дней простая линейная экстраполяция достаточна; ML требует обучения, инфры, объяснимости | Простая формула Об = О/З |
| **Множественные склады Иваново (Иваново-1, Иваново-2...)** | Компания Zoiten имеет один склад в Иваново (из project context). Универсализация «multiple warehouses» добавляет таблицу Warehouse и FK, не давая ценности | Одно поле `Product.ivanovoStock Int?` |
| **Fuzzy-matching УКТ при импорте («УКТ 000001» vs «УКТ-000001» vs «укт000001»)** | Формат УКТ строгий (UK-000000, PostgreSQL SEQUENCE); все выгрузки из 1С дают правильный формат. Fuzzy откроет дорогу silent-ошибкам | Strict regex /^УКТ-\d{6}$/ + явная ошибка «формат не распознан» |
| **Отдельный роут /stock/ivanovo с таблицей артикулов** | Данных мало (один столбец «Остаток»); специальный экран избыточен | Только кнопка «Импортировать Excel» в /stock + отображение колонки «Иваново» в общей таблице |

---

## Feature Dependencies (что от чего зависит)

```
Справочник WbWarehouse (seed из seller.wildberries.ru)
  └─→ WbCardWarehouseStock (per-warehouse quantity)
        └─→ Агрегация per-кластер в /stock/wb
              └─→ Expand-in-place UX для складов кластера

Product.ivanovoStock Int?  ◄─── Excel-импорт /stock (по УКТ)
Product.productionStock Int? ◄─── Ручной ввод в /stock или в карточке товара

Product-level агрегация (РФ)
  = Product.ivanovoStock + Product.productionStock
  + SUM(WbCardWarehouseStock where MarketplaceArticle.productId = Product.id)
  + [Ozon stock — v1.3+]
  + [ДМ stock — future]
  + [ЯМ stock — future]

Метрики О/З/Об/Д
  ├── О = агрегация выше
  ├── З = WbCard.avgSalesSpeed7d (переиспользование Phase 7)
  ├── Об = О / З (guard от деления на 0)
  └── Д = (stock.turnoverNormDays - Об) × З (только если Об < норма)

AppSetting.stock.turnoverNormDays (default 37)
  └─→ Используется в расчёте Д на всех уровнях агрегации
```

**Критический путь для v1.2:**
1. Справочник WbWarehouse (seed) → per-warehouse API sync
2. Модели БД (Product.ivanovoStock, Product.productionStock, WbCardWarehouseStock, AppSetting ключ)
3. Excel-импорт + ручной ввод
4. Таблица /stock с агрегацией
5. Подраздел /stock/wb с expand
6. Цветовая кодировка дефицита

---

## MVP Recommendation (что запустить к концу Phase 14)

Приоритет 1 (абсолютно необходимо):
1. Расширение WB sync до per-warehouse granularity (WbCardWarehouseStock)
2. Справочник WbWarehouse с кластерами (seed)
3. Excel-импорт Иваново + ручной ввод Производства
4. Таблица /stock с агрегацией по товарам + разрезом по МП
5. Метрики О/З/Об/Д + глобальная норма

Приоритет 2 (сделать в Phase 14 если позволяет время):
6. Подраздел /stock/wb с кластерным разрезом + expand
7. Цветовая кодировка дефицита
8. Toggle «Только дефицитные»
9. Persistence expand-состояния

Приоритет 3 (defer в v1.3 если время на исходе):
10. ↻ per-строка для нормы оборачиваемости
11. Мелкие UX-полировки (sticky columns, hover states)
12. Заглушка /stock/ozon ComingSoon

**НЕ делать в Phase 14:**
- Движения / reservations / alerts / safety stock / reorder point (всё v1.3+)
- Mobile responsive (deferred)
- Sparkline графики (требует исторических snapshot)
- Ozon API интеграция (отдельный milestone)

---

## UX-рекомендации (отдельные решения из research)

### Excel-импорт — UI flow

На основе МойСклад / 1С / KeyCRM patterns:

1. **Кнопка «Импортировать Excel Иваново»** в шапке /stock
2. **Dialog (shadcn Dialog)** с 3 состояниями:
   - Upload: drag-and-drop + file input
   - Preview: таблица `[УКТ | Наименование из Excel | Остаток | Статус: ✓ matched / ⚠ не найден]` + подсчёт итогов
   - Done: toast «Обновлено N, пропущено M»
3. **Кнопки в Preview**: «Применить» (matched-only) / «Отмена»
4. **Unmatched rows** показываются отдельной секцией ниже preview с note «Эти УКТ не найдены в БД и будут пропущены. Создайте их через раздел Товары или проверьте формат»

### Expand кластер → склады — UI pattern

На основе Pencil & Paper / LogRocket enterprise data table patterns:

- **Expand-in-place** (не drawer, не modal) — кластер раскрывается дополнительными строками под собой (как details row в table)
- Иконка `ChevronRight` → `ChevronDown` при expand (lucide-react)
- Строки-склады имеют `bg-muted/30` + отступ `pl-8` для визуальной иерархии
- Сортировка складов внутри кластера — по `quantity desc` (самые полные первыми)
- Щелчок на пустой строке (quantity = 0) тоже разрешён — показать factual «0», а не скрывать
- **Persistence**: localStorage ключ `zoiten.stock.wb.expandedClusters` с `string[]` имён кластеров

### Цветовая кодировка дефицита — правила

На основе inflowinventory.com + gainsystems.com best practices:

| Условие | Цвет | Tailwind class |
|---------|------|----------------|
| Об ≥ норма × 1.5 (избыток) | Синий / нейтральный | `text-blue-600 dark:text-blue-400` |
| норма ≤ Об < норма × 1.5 (норма) | Зелёный | `text-green-700 dark:text-green-400` |
| норма × 0.5 ≤ Об < норма (предупреждение) | Жёлтый | `text-yellow-700 dark:text-yellow-400` |
| Об < норма × 0.5 (критично) | Красный + иконка ⚠ | `text-red-700 dark:text-red-400 font-semibold` |
| Об = 0 или З = 0 (out of stock / нет продаж) | Серый | `text-muted-foreground` |

Дефицит в штуках: показывать положительное целое число (напр. `+45 шт`) красным, если > 0. Если Д ≤ 0 — показывать прочерк `—`, не «0» (визуальный шум).

### Метрики в таблице — формат ячеек

- **О** (Остаток): `1 234 шт` (separator пробел, as в RF locale)
- **З** (Заказы/день): `3.2 шт/д` (1 знак после запятой; если 0 — `—`)
- **Об** (Оборачиваемость): `28 дн` или `— ` если З=0
- **Д** (Дефицит): `+45 шт` красным, или `—` если ≤ 0

---

## Зависимости от существующего кода Zoiten ERP

Что УЖЕ есть и переиспользуется (не строить заново):

| Существующее | Как используется в v1.2 |
|--------------|-------------------------|
| `Product.sku` (УКТ-000001) | Ключ для Excel-импорта Иваново |
| `MarketplaceArticle.article` → `WbCard.nmId` | Для связки товар → карточки WB |
| `WbCard.avgSalesSpeed7d` | Метрика «З» для WB-уровня (не дёргаем заново) |
| `AppSetting` KV таблица | Новый ключ `stock.turnoverNormDays` |
| `requireSection("STOCK")` через RBAC | Контроль доступа к /stock |
| `/api/wb-sync` route | Расширяется до per-warehouse (не переписывается) |
| Паттерн ↻ «Применить глобальные» из PriceCalculatorTable | Переиспользуем для нормы оборачиваемости |
| Pattern sticky columns из /prices/wb | Переиспользуем |
| xlsx lib (уже есть для ИУ комиссий и экспорта сотрудников) | Для импорта Иваново |
| shadcn Dialog | Для Excel preview+confirm |

Что НЕ существует и должно быть создано:
- `Product.ivanovoStock Int?` (миграция)
- `Product.productionStock Int?` (миграция)
- `WbWarehouse(id, name, cluster, shortCluster)` (новая таблица + seed)
- `WbCardWarehouseStock(wbCardId, warehouseId, quantity)` (новая таблица + unique constraint)
- Seed script для WbWarehouse (одноразовый браузер-парсинг seller.wildberries.ru)
- `/stock` реальная страница (заглушка Phase 5 заменяется)
- `/stock/wb` реальная страница
- `/stock/ozon` заглушка ComingSoon
- Server action `importIvanovoStockFromExcel`
- Server action `updateProductionStock`
- Server action `updateTurnoverNorm`

---

## Confidence Assessment

| Claim | Source(s) | Confidence |
|-------|-----------|------------|
| Формулы О/З/Об/Д корректны и индустриальны | postavleno.ru, sellerden.ru, inflowinventory.com (совпадение) | HIGH |
| 7 кластеров WB (ЦФО/ЮГ/Урал/ПФО/СЗО/СФО/Прочие) — это реальная группировка | Project context от пользователя + seller.wildberries.ru (JS-rendered, подтверждено косвенно через wbarcode.ru, fulfilmentmoscow.ru) | MEDIUM — точный список названий кластеров нужно брать с seller.wildberries.ru браузером (как и запланировано через seed-скрипт) |
| Excel preview+confirm — индустриальный паттерн | is1c.ru, МойСклад support, KeyCRM | HIGH |
| Expand-in-place лучше drawer для drill-down в table | Pencil & Paper, LogRocket, amCharts | MEDIUM |
| WB Statistics API возвращает per-warehouse quantity + warehouseName | dev.wildberries.ru, openapi.wildberries.ru | HIGH |
| Safety stock / reorder point избыточны для 50-200 SKU | abcsupplychain.com + инженерное суждение по scope | MEDIUM |
| Норма оборачиваемости 37 дней — разумный default | Project context + sellerden.ru (нет universal standard) | MEDIUM — задан пользователем, принимаем как given |
| Цветовая кодировка green/yellow/red — стандарт | inflowinventory.com, gainsystems.com | HIGH |

---

## Sources

- [МойСклад × Wildberries support](https://support.moysklad.ru/hc/ru/articles/14790931949201-Wildberries) — интеграция FBS/FBO, синхронизация остатков real-time
- [Импорт остатков товаров МойСклад](https://support.moysklad.ru/hc/ru/articles/360010136334) — UX паттерны импорта Excel
- [Универсальная загрузка цепочек НСИ и остатков 1С ERP](https://is1c.ru/career/blog/universalnaya-zagruzka-tsepochek-nsi-i-ostatkov-iz-excel-dlya-erp/) — SKU как primary identifier, mapping столбцов, preview перед коммитом
- [KeyCRM — импорт товаров из Excel](https://help.keycrm.app/en/products-and-warehouse/creating-products-by-importing-uploading-from-an-excel-file) — preview-UI и обработка unmatched
- [Инструмент MPSTATS — аналитика остатков Wildberries](https://mpstats.io/) — per-warehouse stock, cluster analysis, sales speed
- [MPSTATS — как выбрать склад WB](https://mpstats.io/media/wildberries/logistics/kak-vybrat-sklad) — принципы кластеризации WB
- [Оборачиваемость товара на WB и Ozon — postavleno.ru](https://postavleno.ru/blog/oborachivaemost-tovara-na-wb-i-ozon/) — формула О=N/T, деление остатков на продажи за вычетом возвратов
- [SellerDen — Аналитика Wildberries 2026](https://sellerden.ru/sellerfox/analitika-wildberries/) — значимость оборачиваемости в 2026 («каждый день на складе = реальные деньги»)
- [LikeStats — дефицит товара на WB](https://likestats.io/blog/deficit-tovarov-na-wb) — определение дефицита от WB
- [Wildberries Seller Analytics](https://seller.wildberries.ru/instructions/ru/ru/material/sellers-analytics) — отчёт «Динамика оборачиваемости»
- [Карта складов WB](https://seller.wildberries.ru/instructions/ru/ru/material/warehouse-map) — официальный справочник (JS-rendered)
- [WBhelp — адреса складов WB](https://wbhelp.ru/warehouses-wb) — альтернативный справочник для сверки
- [Основные склады WB и зоны покрытия — FulfilmentMoscow](https://fulfilmentmoscow.ru/news/osnovnye-sklady-wildberries-i-ih-zony-pokrytiya) — региональные зоны
- [dev.wildberries.ru — Analytics API](https://dev.wildberries.ru/en/docs/openapi/analytics) — официальная документация Statistics API для остатков
- [inflow Inventory — Reorder Point Formula](https://www.inflowinventory.com/blog/reorder-point-formula-safety-stock/) — формулы + green/orange/red color coding
- [abcsupplychain — Safety Stock Formula](https://abcsupplychain.com/safety-stock-formula-calculation/) — σ-formulas как избыточные для малых каталогов
- [Gain Systems — Reorder Point vs Safety Stock](https://gainsystems.com/blog/reorder-point-vs-safety-stock-balancing-inventory-in-retail/) — применимость к retail
- [Pencil & Paper — Enterprise Data Tables UX](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables) — drill-down / expand-in-place patterns
- [LogRocket — Data Table Design Best Practices](https://blog.logrocket.com/ux-design/data-table-design-best-practices/) — когда expand vs drawer vs modal
- [Medium — Modal vs Drawer](https://medium.com/@ninad.kotasthane/modal-vs-drawer-when-to-use-the-right-component-af0a76b952da) — критерий выбора компонента
- [Smashing Magazine — Modal vs Separate Page](https://www.smashingmagazine.com/2026/03/modal-separate-page-ux-decision-tree/) — decision tree

---

*Researched: 2026-04-21 for milestone v1.2 «Управление остатками», Phase 14*
