# Phase 7: Управление ценами WB — Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Раздел **«Управление ценами»** → подраздел **WB** — онлайн калькулятор юнит-экономики для карточек WB, связанных с товарами из БД (только карточки с зелёной галочкой привязки к Product). Показывает по каждому товару таблицу с колонками текущей цены, цен из акций WB (regular + auto) и до 3 пользовательских расчётных цен. Каждая ценовая строка даёт полный расчёт: цепочка от цены продавца до прибыли, Re продаж %, ROI %. Клик по строке → модалка юнит-экономики для редактирования параметров и сохранения результата как расчётной цены.

Подраздел **Ozon** в этой фазе — заглушка `/prices/ozon` (как в `/cards/ozon`).

</domain>

<decisions>
## Implementation Decisions

### Модель данных

- **D-01: Поля в существующих таблицах для переопределений** (не отдельная PricingOverride таблица)
  - `Category.defaultDefectRatePct: Float?` — дефолт процента брака per категория (2% hardcoded fallback если null)
  - `Subcategory.defaultDrrPct: Float?` — дефолт ДРР per подкатегория (10% hardcoded fallback)
  - `Product.drrOverridePct: Float?` — override ДРР на товар (приоритет над Subcategory.defaultDrrPct)
  - `Product.defectRateOverridePct: Float?` — override брака на товар
  - `Product.deliveryCostRub: Float?` — доставка на маркетплейс per товар (30 руб по умолчанию, синхронно для всех карточек одного товара)
  - **Fallback-логика (server-side):** `override → default → hardcoded (10%/2%/30₽)`
  - **Обоснование:** PostgreSQL JOIN с `COALESCE` быстрее, чем 3 LEFT JOIN на отдельную PricingOverride таблицу. На 1000 товаров ~5мс, на 10k — ~50мс. Prisma-типизация чище.

- **D-02: Глобальные ставки → KeyValue таблица `AppSetting`**
  - `AppSetting(key: String @unique, value: String, updatedAt, updatedBy: String?)` — генерическое хранилище
  - Ключи: `wbWalletPct`, `wbAcquiringPct`, `wbJemPct`, `wbCreditPct`, `wbOverheadPct`, `wbTaxPct`
  - Начальные значения: 2.0 / 2.7 / 1.0 / 7.0 / 6.0 / 8.0 (проценты, не доли)
  - Десятые знаки, глобально для всех пользователей раздела, сохраняются между сессиями
  - Seed при первом запуске если ключи отсутствуют
  - Валидация формата value через Zod-схему в server action (Number + min/max)

- **D-03: Расчётные цены → отдельная таблица `CalculatedPrice`**
  - `CalculatedPrice(id, wbCardId, slot: 1|2|3, name, sellerPrice, drrPct?, defectRatePct?, deliveryCostRub?, snapshot: Json, createdAt, updatedAt)`
  - `@@unique([wbCardId, slot])` — максимум 3 слота на карточку
  - `name` по умолчанию: `«Расчетная цена 1/2/3»` (пользователь может переименовать)
  - `sellerPrice` — цена продавца до скидки (то что пользователь сохранил)
  - `drrPct/defectRatePct/deliveryCostRub` — опциональные override для этой расчётки (nullable → берутся актуальные из Product/Subcategory/Category на момент расчёта)
  - `snapshot: Json` — полный слепок всех параметров в момент сохранения (для debug и истории: glob.ставки, commFbwIu, clubDiscount, discountWb, costPrice и т.д.)
  - При удалении WbCard → Cascade delete

- **D-04: Акции → две новые таблицы `WbPromotion` + `WbPromotionNomenclature`**
  - **WbPromotion:**
    ```
    id: Int @id                    // promotionID из WB API
    name: String
    description: String?
    advantages: String[]
    startDateTime: DateTime
    endDateTime: DateTime
    type: String                   // "auto" | "regular"
    rangingJson: Json?             // massive ranging[] из details API
    source: String @default("API") // "API" для API-синков, "EXCEL" для загруженных Excel auto-акций
    lastSyncedAt: DateTime
    ```
  - **WbPromotionNomenclature:**
    ```
    id: String @id @default(cuid())
    promotionId: Int → WbPromotion  (onDelete: Cascade)
    nmId: Int
    inAction: Boolean               // true = уже в акции, false = может участвовать
    planPrice: Float?               // плановая цена для акции, руб
    planDiscount: Float?             // планируемая скидка, %
    currentPrice: Float?             // текущая розничная цена (из Excel)
    status: String?                  // "Участвует" / "Не участвует: ..." (только из Excel)
    @@unique([promotionId, nmId])
    ```
  - **Regular акции:** заполняются через `GET /nomenclatures?promotionID=X&inAction=true` (API)
  - **Auto акции:** заполняются через загрузку Excel (колонки из кабинета WB)

### Синхронизация акций

- **D-05: Ручная синхронизация по кнопке** «Синхронизировать акции»
  - Рядом с кнопками «Синхронизировать с WB» и «Скидка WB» в шапке раздела /prices/wb
  - Окно времени: **текущие + будущие 60 дней** (`startDateTime = сегодня`, `endDateTime = +60 дней`, `allPromo = true`)
  - Rate limit: 10 запросов/6 сек → для details батчуем по 10 ID за раз, для nomenclatures идём последовательно по regular-акциям с паузой 600мс
  - Endpoint: `POST /api/wb-promotions-sync`
  - Что синхронизируется:
    1. Список акций (GET `/calendar/promotions`) → upsert в `WbPromotion` (source=API)
    2. Детали каждой акции (GET `/calendar/promotions/details?promotionIDs=...` батчами) → update `description`, `rangingJson`
    3. Для regular-акций — номенклатуры (GET `/calendar/promotions/nomenclatures?promotionID=X&inAction=false`) → upsert `WbPromotionNomenclature` с `planPrice`, `planDiscount`
  - Удаление устаревших: акции с `endDateTime < сегодня - 7 дней` удаляются при синке (Cascade удалит номенклатуры)

- **D-06: Загрузка Excel для auto-акций**
  - **Причина:** WB API официально не поддерживает nomenclatures для auto-акций (422 Unprocessable Entity + документация «Not applicable for auto promotions»). Цены и скидки доступны только через Excel-экспорт из кабинета WB.
  - **UI:** отдельная кнопка «Загрузить отчёт auto-акции» (рядом с «Синхронизировать акции»)
  - **Flow:**
    1. Пользователь выбирает auto-акцию из dropdown (список из `WbPromotion WHERE type='auto'`, должен быть синкнут API)
    2. Загружает Excel-файл (из кабинета WB — формат «Товары для исключения из акции_...»)
    3. Парсер читает колонки:
       - A: «Товар уже участвует в акции» (Да/Нет) → `inAction`
       - F: «Артикул WB» → `nmId`
       - L: «Плановая цена для акции» → `planPrice`
       - M: «Текущая розничная цена» → `currentPrice`
       - T: «Загружаемая скидка для участия в акции» → `planDiscount`
       - U: «Статус» → `status`
    4. Upsert в `WbPromotionNomenclature` с выбранным `promotionId`, source помечается (но поле source на WbPromotion, не Nomenclature — статус загрузки фиксируется через поле `lastSyncedAt` на WbPromotion + toast «Загружено N строк»)
  - **Endpoint:** `POST /api/wb-promotions-upload-excel` (multipart: file + promotionId)

### Таблица — структура и визуал

- **D-07: Sticky секции по Product + визуальные группы карточек** (не expand/collapse)
  - Один Product → строки всех связанных WbCard подряд
  - Колонки **Фото + Сводка** объединены через `rowSpan` на все строки всех карточек этого Product
  - Колонки **Ярлык + Артикул** объединены через `rowSpan` на все ценовые строки одной WbCard
  - Жирный разделитель между Product, тонкий между WbCard внутри Product
  - Всё видно сразу без кликов — максимум информации на экране

- **D-08: Sticky колонки при горизонтальном скролле: Фото + Сводка + Ярлык + Артикул**
  - CSS `position: sticky; left: 0` с `z-index` слоями
  - Чтобы при прокрутке вправо к расчётным колонкам всегда было видно какая строка

- **D-09: Сводка (колонка 2) — 3 подстроки:**
  - Наименование товара (из Product.name)
  - Остаток товара на WB = сумма WbCard.stockQty по всем карточкам Product
  - Средняя скорость продаж за 7 дней, шт./день = сумма WbCard.avgSalesSpeed7d по всем карточкам Product
  - **Новое поле в WbCard: `avgSalesSpeed7d: Float?`** — подтягивается при синхронизации WB из Statistics Sales API (sales за 7 дней / 7)

- **D-10: Порядок ценовых строк внутри карточки:**
  1. «Текущая цена» — всегда первая
  2. Акции regular — отсортированы по убыванию planPrice (сначала дорогая, потом дешевле)
  3. Акции auto — после regular, отсортированы по убыванию planPrice (из Excel)
  4. «Расчетная цена 1/2/3» — в конце, порядок по slot
  - Если auto-акция без Excel-данных — не показывается (строка пропускается)

- **D-11: Tooltip на названии акции**
  - При наведении на название акции → всплывающая подсказка с `WbPromotion.description` + `advantages[]`
  - Использовать `@/components/ui/tooltip` (если есть) или создать простой

### Колонки расчёта (30 штук)

- **D-12: Формулы и цепочка расчёта строго по ТЗ и Excel-образцу**
  - 30 колонок согласно ТЗ разделов 1-30
  - Все проценты в UI отображаются как целые или с 1-2 десятыми (7% vs 7.50% — по формату соответствующего поля)
  - Денежные суммы: целые рубли для крупных, 2 знака после запятой для мелких (как в Excel-образце)
  - Формулы работают на **серверной стороне** (RSC page или server action) — в БД ничего не хранится кроме входных параметров; выход считается on-the-fly при рендере
  - Приоритет: (a) override на товар → (b) default на категории/подкатегории → (c) hardcoded fallback

- **D-13: Подсветка Прибыль/Re продаж/ROI**
  - Значение ≥ 0 → зелёный цвет (Tailwind `text-green-600 font-medium`)
  - Значение < 0 → красный цвет (Tailwind `text-red-600 font-medium`)

### Модалка юнит-экономики

- **D-14: Clickable row → модалка**
  - Клик на строку (любую ценовую строку: текущую, акционную или расчётную) открывает `PricingCalculatorDialog`
  - Передаём в модалку: WbCard, initial seller price из кликнутой строки (или акционную цену)
  - Модалка показывает **все входные параметры редактируемыми:** цена продавца до скидки, скидка продавца, ДРР (+ чекбокс «только этот товар»), Процент брака (+ чекбокс), Доставка, себестоимость, глобальные ставки
  - **Realtime пересчёт** всех выходных полей (Прибыль/Re/ROI) при изменении любого input
  - **Сохранение** → кнопка «Сохранить как расчётную цену» → выбор слота (1/2/3) + название (по умолчанию «Расчетная цена N») → upsert в `CalculatedPrice` + snapshot текущих параметров
  - **Изменение ДРР/брака** в модалке:
    - Если чекбокс «только этот товар» → `Product.drrOverridePct/defectRateOverridePct`
    - Если нет → `Subcategory.defaultDrrPct` / `Category.defaultDefectRatePct` (обновление ВСЕХ товаров этой подкатегории/категории)
  - **Изменение доставки** всегда → `Product.deliveryCostRub` (синхронно для всех карточек товара)

- **D-15: Тип компонента** — Dialog (shadcn `@/components/ui/dialog`), максимум `max-w-3xl`, `max-h-[90vh] overflow-y-auto`
  - Не drawer, не full-page — обычная модалка с формой (react-hook-form + zod)
  - Внутри: 2 колонки — слева inputs, справа live-расчёт выходных показателей

### Ozon заглушка

- **D-16: `/prices/ozon` — заглушка ComingSoon**
  - Аналогично `/cards/ozon`: layout + table-nav + `<ComingSoon sectionName="Управление ценами Ozon" />`

### RBAC

- **D-17: Раздел «Управление ценами» = `ERP_SECTION.PRICES`**
  - Уже существует в enum (сверено)
  - Для чтения таблицы → `requireSection("PRICES")`
  - Для записи (сохранение расчётных цен, изменение ставок, загрузка Excel, синхронизация акций) → `requireSection("PRICES", "MANAGE")`

### Claude's Discretion

- Точные CSS-классы и Tailwind-слои для sticky (работа для planner/executor)
- Именование компонентов файлов (`PriceCalculatorTable`, `PricingCalculatorDialog` и т.д.)
- Как именно верстать модалку (2 колонки / табы / аккордеон внутри)
- Как проектировать rate-limit backoff для синхронизации акций (exponential или фиксированная пауза)
- Структура server actions: один файл `app/actions/pricing.ts` vs разделённые

### Folded Todos

Нет todo, вручную сформированных в backlog для этой фазы.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Excel-образцы

- `C:/Users/User/Desktop/Форма управления ценами.xlsx` — эталонная форма с 30 колонками, примерами формул и одной строкой с числами (n=800750522). Используется как **source of truth** для формул и порядка колонок.
- `C:/Users/User/Downloads/Товары для исключения из акции_Весенняя распродажа_ бустинг продаж (автоматические скидки)_09.04.2026 16.37.31.xlsx` — образец Excel-отчёта из кабинета WB по auto-акции (ID 2287). Определяет формат парсера для D-06 (колонки A/F/L/M/T/U).

### ТЗ в тексте

- ТЗ в сообщении пользователя при создании Phase 7 — полное описание 30 колонок с формулами и 6 глобальных ставок. **Формулы в ТЗ = canonical. Любое расхождение с Excel-файлом → спрашивать пользователя.**

### Существующие модули проекта

- `app/(dashboard)/cards/wb/page.tsx` — паттерн страницы с табами WB/Ozon и кнопками синхронизации (для копирования структуры)
- `app/(dashboard)/cards/layout.tsx` — layout с табами (reuse: аналогичный layout для /prices)
- `components/cards/WbCardsTable.tsx` — паттерн sticky колонок, пагинации, фильтров
- `components/cards/WbSyncButton.tsx`, `WbSyncSppButton.tsx`, `WbUploadIuButton.tsx` — паттерны кнопок синхронизации/загрузки
- `app/api/wb-sync/route.ts` — Node.js API route для WB синхронизации (паттерн для `/api/wb-promotions-sync`)
- `app/api/wb-commission-iu/route.ts` — паттерн загрузки Excel с multipart (для `/api/wb-promotions-upload-excel`)
- `lib/wb-api.ts` — клиент WB API (Content/Prices/Statistics/Analytics/Tariffs) — добавить сюда функции для `/calendar/promotions/*`

### Prisma-схема

- `prisma/schema.prisma` → модели `Product`, `WbCard`, `ProductCost`, `Category`, `Subcategory` — уже имеют большинство нужных полей (цены, комиссии, остатки, процент выкупа, себестоимость)
- Новые поля и таблицы (D-01, D-02, D-03, D-04, D-09) добавятся миграцией

### API WB документация

- https://dev.wildberries.ru/en/openapi/promotion — Promotions Calendar endpoints
  - `GET /api/v1/calendar/promotions` — список акций
  - `GET /api/v1/calendar/promotions/details` — детали с ranging[] и description
  - `GET /api/v1/calendar/promotions/nomenclatures?promotionID=X&inAction=bool` — номенклатуры ТОЛЬКО для regular, 422 на auto
- https://github.com/DragonSigh/wildberries-api-docs/blob/master/promotion.md — зеркало документации в markdown (парсится через WebFetch)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **WbCardsTable** (`components/cards/WbCardsTable.tsx`) — паттерн широкой таблицы с sticky колонками, pagination, filters. Используется как референс, но PriceCalculatorTable будет сложнее из-за rowSpan группировки.
- **WbSyncButton** (`components/cards/WbSyncButton.tsx`) — паттерн кнопки-синхронизатора с toast-уведомлениями и isPending state. Переиспользуется для кнопки синхронизации акций.
- **WbUploadIuButton** (`components/cards/WbUploadIuButton.tsx`) — паттерн загрузки Excel через multipart + парсер на server. Используется для загрузки auto-акций.
- **Dialog + Form + react-hook-form** — уже используется везде (UserForm, ProductForm, CostForm). PricingCalculatorDialog использует тот же паттерн.
- **fetchAllPrices**, **fetchStandardCommissions** (`lib/wb-api.ts`) — уже есть все нужные функции для синхронизации. Добавляется `fetchAllPromotions`, `fetchPromotionDetails`, `fetchPromotionNomenclatures`.
- **execSync('curl …')** (`lib/wb-api.ts`) — НЕ используется для promotion API, обычный `fetch` работает (scope: Цены и скидки). Curl-обход только для публичного `card.wb.ru`.

### Established Patterns
- **Server Actions:** `"use server"` + `requireSection()` + try/catch + `revalidatePath()`. Pricing action — одно централизованное место `app/actions/pricing.ts` или раздел по функциям (`pricing-settings.ts`, `pricing-calculations.ts`, `pricing-promotions.ts`).
- **Filters в URL params:** `?status=...&brands=...` в `ProductsPage` и `WbCardsPage`. Применимо для `/prices/wb` (фильтры по бренду/категории/подкатегории).
- **Native HTML `<select>`** вместо shadcn Select — по конвенции проекта (base-ui Select ломается). Использовать и в модалке расчётов.
- **Soft delete через `deletedAt`** — Product.deletedAt уже применяется. Модалка управления ценами игнорирует soft-deleted товары.
- **Таблица имеет несколько слоёв группировки** — пример `EmployeesTable.tsx` с группировкой по компаниям (rowSpan паттерн уже проверен в проекте).

### Integration Points
- **Navigation:** `components/layout/Sidebar.tsx` — добавить пункт «Управление ценами» → `/prices` (если не добавлен; проверить, т.к. в Sidebar.tsx мог быть стаб `/prices` для будущего модуля)
- **RBAC:** `middleware.ts` и `lib/sections.ts` — путь `/prices` уже должен быть в SECTION_PATHS → `PRICES`. Проверить в plan-phase.
- **Роут layout:** `app/(dashboard)/prices/layout.tsx` — создаётся новый (как `/cards/layout.tsx`)
- **Клик по строке → модалка** — state управляется в клиентском компоненте `PriceCalculatorTable`, модалка — дочерний компонент с key={wbCardId+priceRowType}
- **Seed AppSetting** — при первом запуске `/prices/wb` проверяем существование ключей, если нет — создаём с дефолтами (или делается в server action при первом чтении)
- **WbCard.avgSalesSpeed7d** — новое поле, требует обновления `/api/wb-sync/route.ts` чтобы подтягивать через `fetchStocks`/`fetchSales` функцию из Statistics API

</code_context>

<specifics>
## Specific Ideas

### От пользователя из сообщения
- **Excel-образец формы** лежит на рабочем столе (`Форма управления ценами.xlsx`) — в нём пример расчёта с числами для nmId 800750522: Цена для установки 25833, Скидка продавца 70%, Цена продавца 7749.9, Скидка WB 25%, Цена со скидкой WB 5812.425, Кошелёк 2%, Цена с кошельком 5696.18, Эквайринг 209.25, Комиссия 32.58% → 2524.92, ДРР 10% → 774.99, Джем 77.5, К перечислению 4163.25, Закупка 2204, Брак 44.08, Доставка 30, Кредит 232.50, Общие 465, Налог 620, **Прибыль 567.68 (зелёный)**, Re продаж 7%, ROI 26%.
  - **Эта строка = golden test case** для проверки формул в planner/executor.
- **Excel-образец auto-акции** в `C:/Users/User/Downloads/...` — образец структуры для D-06 парсера.

### Числовые дефолты и константы (из ТЗ)
- Кошелёк WB: 2.0%
- Эквайринг: 2.7%
- Тариф Джем: 1.0%
- Кредит: 7.0%
- Общие расходы: 6.0%
- Налог: 8.0%
- ДРР (default): 10.0%
- Процент брака (default): 2.0%
- Доставка на маркетплейс: 30 руб
- Все значения ставок — **с десятыми**, хранятся как Float, отображаются с 1 знаком после запятой
- Начальные значения **глобальные** и сохраняются между сессиями — берутся из `AppSetting` таблицы

### Типичный flow пользователя
1. Заходит в «Управление ценами» → WB
2. Нажимает «Синхронизировать акции» (первый раз или когда хочет обновить)
3. Если знает про auto-акцию в которой хочет поучаствовать — скачивает Excel из кабинета WB и грузит через «Загрузить отчёт auto-акции»
4. Смотрит в таблицу, видит по каждому товару текущую цену + акционные цены + расчётные цены
5. Настраивает глобальные ставки если нужно (кошелёк/эквайринг/джем/кредит/общие/налог) — сохраняются между сессиями
6. Кликает на интересную строку → модалка → меняет параметры → сохраняет как расчётную цену
7. Сравнивает прибыль/ROI между вариантами (текущая vs акция vs расчётная)

</specifics>

<deferred>
## Deferred Ideas

- **Интеграция с Prices API для отправки новых цен в WB** — ТЗ не требует «применить расчётную цену к товару в WB». Только калькулятор с сохранением расчётов. Если понадобится «отправить цену в WB» — это отдельная фаза 8+.
- **История изменений цен** — какие цены были раньше, когда менялись. В `CalculatedPrice.snapshot` Json фиксируется моментальный снимок, но полноценная история (audit log) — не в scope.
- **График юнит-экономики** — sparkline по датам, тренды — новая capability, deferred.
- **Подстановка цены в акцию (inAction=true)** — кнопка «Применить эту расчётную цену к акции X» с вызовом `/calendar/promotions/upload` — это write action с token scope который у нас есть, но ТЗ про калькулятор. Отдельная фаза.
- **Ozon Pricing** — в этой фазе заглушка, полноценная реализация — отдельная фаза.
- **Экспорт таблицы в Excel** — для отчётов, отдельная фаза.
- **Фильтры по бренду/категории в /prices/wb** — есть в `/cards/wb` и `/products` как паттерн; здесь не требуется ТЗ, но легко добавить. Deferred — по запросу.
- **Массовые расчёты** — «применить ставку X ко всем товарам категории Y» — batch-операция, отдельная фаза.

### Reviewed Todos (not folded)
Нет reviewed todos из backlog.

</deferred>

---

*Phase: 07-prices-wb*
*Context gathered: 2026-04-09*
