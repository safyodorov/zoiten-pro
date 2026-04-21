# Pitfalls Research — Добавление управления остатками в Zoiten ERP

**Domain:** Marketplace ERP (существующая система), stock management extension
**Researched:** 2026-04-21
**Confidence:** HIGH (большинство пунктов верифицировано против lib/wb-api.ts, schema.prisma, официальной документации WB API 2026)

---

## Executive summary

При добавлении stock management к существующему Zoiten ERP опаснее всего **не** сами формулы и UI, а четыре зоны интеграции:

1. **WB Statistics API deprecation** — `/api/v1/supplier/stocks` sunset 2026-06-23. Новый endpoint `POST /api/analytics/v1/stocks-report/wb-warehouses` требует POST с массивом `nmIds` (не GET), даёт `warehouseId`, имеет rate limit 3 req/min + burst 1 req/20s, требует Personal/Service token тип (обновление с марта 2026). Проектировать миграцию **сразу**, а не после 1 июня.
2. **Manual-scraped справочник кластеров дрейфует** — WB API **не отдаёт cluster mapping**. Имена складов меняются («Тула» → «Тула 2»), появляются новые, выводятся старые. Строго table-driven по `warehouseId`, не по `warehouseName`.
3. **Missing row != 0 остаток** — WB не возвращает строки для (артикул × склад) с 0 остатком. Если просто писать ответ API в `WbCardWarehouseStock`, «исчезнувшие» записи останутся со вчерашним значением. Нужна стратегия clean-replace per `(wbCardId, snapshot)`.
4. **Рассинхрон миграций между двумя компьютерами + VPS** — `prisma migrate dev` на одном компьютере + несогласованный pull на другом = drift. Stock milestone добавляет минимум 3 новых таблицы + 2 новых поля в Product → риск повышен.

Менее критичное, но частое: null vs 0 в `ivanovoStock/productionStock` (разная семантика, UI нужно показывать по-разному); Infinity/NaN в формуле Д когда З=0 или О=0; sticky 4 колонки + 28 кластерных = горизонтальный скролл на дешёвых ноутбуках.

---

## Critical Pitfalls

### Pitfall 1: Использование deprecated endpoint `/api/v1/supplier/stocks`

**What goes wrong:**
Текущий `lib/wb-api.ts:fetchStocks()` использует `https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=2020-01-01`. Этот endpoint **будет удалён WB 23 июня 2026** (подтверждено в dev.wildberries.ru). После этой даты все остатки — 0, сайт визуально работает, менеджер принимает решения на пустых данных.

**Why it happens:**
- Разработчик копирует паттерн из существующего `fetchStocks()`, не проверяя актуальность (в коде нет комментария про deprecation).
- Релиз milestone может быть в мае, а sunset — в июне. Баг появится через 6 недель после деплоя, когда phase уже закрыт.
- Статистика API ~1 req/min — ошибки 429 маскируют факт deprecation (выглядит как «rate limit», а не «endpoint умер»).

**How to avoid:**
- **Сразу в Phase 14 писать на новый endpoint:** `POST https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses`
- Body: `{ "nmIds": [123, 456, ...], "limit": 250000, "offset": 0 }` (max 1000 nmIds per запрос → чанковать).
- Rate limit: **3 req/min + burst 1 req/20s** — не 1/min как старый. Requires Personal или Service token type (с 2026-03-30 WB переклассифицировал токены).
- Ответ даёт `warehouseId, warehouseName, regionName, quantity, inWayToClient, inWayFromClient` — уже per-warehouse, не надо агрегировать вручную как в `fetchStocks` (там сумма по nmId).
- Agregированный `stockQty` в `WbCard` продолжать писать суммой всех строк ответа для данного `nmId` (сохраняем обратную совместимость с `/prices/wb`).
- Старый `fetchStocks()` пометить `@deprecated — remove after 2026-06-23`.

**Warning signs:**
- HTTP 410 Gone или внезапный 404 от старого endpoint.
- После `prisma migrate deploy` все `WbCardWarehouseStock.quantity` = 0 при синхронизации.
- Падение `WbCard.stockQty` до null массово.

**Phase to address:** Phase 14 основной (фаза остатков) — в плане **D-1** верификации API endpoint ПЕРЕД написанием кода. Zero Wave должен включать smoke test нового endpoint с реальным токеном проекта (по аналогии с Phase 7 Wave 0 для Promotions API).

---

### Pitfall 2: Справочник WB складов → кластеров парсится вручную и дрейфует

**What goes wrong:**
Справочник `WbWarehouse(id, name, cluster, shortCluster)` планируется seed'ить однократным ручным скриптом со `seller.wildberries.ru/instructions/ru/ru/material/warehouse-map`. WB не даёт API для cluster mapping (верифицировано с dev.wildberries.ru/en/openapi/orders-fbs — `/api/v3/passes/offices` даёт только name/address/id, без кластера; нет endpoint для общего списка всех WB складов с кластерами). Через 2-3 месяца:
- Новые склады появятся в ответе `/stocks-report/wb-warehouses` — их `warehouseId` не будет в справочнике.
- WB переименует «Тула» → «Тула 2» (реальный случай — Коледино, Электросталь регулярно переименовываются).
- Старый склад выведен — в UI останутся «сиротские» записи с непонятным именем.

**Why it happens:**
- Единственный источник cluster mapping — HTML-страница WB Partners (требует логин), автоматический парсинг хрупкий (structure HTML может поменяться).
- Разработчик seed'ит справочник однократно и забывает про maintenance.
- В коде легко написать `cluster: row.warehouseName.startsWith('Тула') ? 'ЦФО' : ...` (hardcoded по имени) — ломается при любом переименовании.

**How to avoid:**
- **Ключ справочника — `warehouseId` (int), не имя.** Имя — только для отображения, cluster lookup строго через `warehouseId`.
- **Auto-insert неизвестных складов с `cluster = 'Прочие'` + флагом `needsClusterReview: Boolean @default(false)`**. В `/api/wb-sync`, когда приходит `warehouseId` не из справочника → upsert в `WbWarehouse` с `cluster = 'Прочие', needsClusterReview = true`. В админке на `/admin/settings/wb-warehouses` показывать отдельной вкладкой «Требуют привязки кластера» с count badge.
- **Никогда не падать** в sync при неизвестном складе — только логировать и помечать.
- Store **обе** версии имени: `name` (текущее из API) + `lastKnownName` (что было при seed). При `name != lastKnownName` — показать в UI warning «WB переименовал склад».
- Импорт справочника сделать **Excel-загрузкой** (как `/cards/wb/upload-iu`), не хардкод скриптом — тогда менеджер сам сможет обновить через 3 месяца без PR.
- Документировать в `CLAUDE.md` процедуру refresh справочника (раз в квартал — выгрузить список складов из seller.wildberries.ru, загрузить через UI).

**Warning signs:**
- В UI появляется «Склад ID 507» без человеческого имени.
- 7-кластерный rollup показывает «Прочие» с количеством > 10% товаров.
- В логах `/api/wb-sync` спам «warehouseId N not in directory».

**Phase to address:** Phase 14 plan — отдельный D-документ «WB warehouse directory maintenance strategy». Дизайн схемы `WbWarehouse` с `needsClusterReview` + auto-insert логика в route.

---

### Pitfall 3: Missing row ≠ 0 в ответе stocks API (stale data)

**What goes wrong:**
WB stocks endpoint возвращает строки **только для (nmId × warehouse) где есть остаток, возврат или путь-к-клиенту**. Артикул с 0 остатком на складе — строки **нет** в ответе. Если в `/api/wb-sync` просто писать `prisma.wbCardWarehouseStock.upsert(...)` для каждой строки ответа — старые записи со вчерашним `quantity = 50` останутся в БД. На следующий день товар распродан, в ответе нет строки — в БД всё ещё 50. Менеджер видит несуществующий остаток.

**Why it happens:**
- Интуиция «upsert — безопасная операция» скрывает проблему отсутствия строки.
- Тест на dev данных не воспроизведёт: не будет артикула который был на складе и стал 0.
- При агрегации по кластерам зомби-строки суммируются — ЦФО показывает 200, хотя реально 50.

**How to avoid:**
Три варианта, выбирать в плане Phase 14:

**Вариант A (рекомендуется): Clean-replace per sync**
```ts
await prisma.$transaction(async (tx) => {
  await tx.wbCardWarehouseStock.deleteMany({ where: { wbCardId: card.id } })
  await tx.wbCardWarehouseStock.createMany({
    data: rowsForCard.map(r => ({ wbCardId: card.id, warehouseId: r.warehouseId, quantity: r.quantity }))
  })
})
```
Простой, детерминированный. Минус: трейсинг «когда этот склад стал 0» теряется.

**Вариант B: Timestamp + filter по snapshot**
`WbCardWarehouseStock(wbCardId, warehouseId, quantity, syncedAt)`. В запросах агрегации фильтровать `syncedAt >= $latestSyncAt`. Зомби-записи остаются, но игнорируются. Плюс — history-aware, можно строить графики «когда товар закончился». Минус — каждая страница `/stock/wb` должна знать `latestSyncAt`.

**Вариант C: Явно писать 0 для «пропавших» складов**
Перед upsert строк из ответа — взять все `warehouseId` из справочника, для которых этой пары нет в ответе → upsert с `quantity = 0`. Минус — запись растёт O(cards × warehouses) = 200 × 50 = 10K строк обновлений каждый sync.

**Рекомендация:** Вариант A. Транзакция маленькая (1 карточка), 200 транзакций окей на 2 ГБ VPS. История остатков — отдельный милстоун v1.3 (снапшоты раз в сутки), не тащить в v1.2.

**Warning signs:**
- UI показывает остаток на складе, но товар физически отгружен.
- Сумма `per-warehouse quantity` > `WbCard.stockQty` (агрегированный из того же API).
- Менеджер жалуется что «цифра на странице `/stock/wb` врёт».

**Phase to address:** Phase 14 plan — явное decision D-02 «Stock write strategy». Включить в unit-тест `wb-sync` с fixture где на вчера был остаток, сегодня пусто.

---

### Pitfall 4: Нормализация Product.sku при Excel-импорте Иваново-остатков

**What goes wrong:**
`Product.sku` в схеме — строка формата `УКТ-000001` (UPPER, 6 digits, dash). В Excel с Иваново-склада SKU может прийти как:
- `1`, `001`, `000001` (число без префикса, ведущие нули → xlsx парсит как number)
- `УКТ-1`, `УКТ000001`, `укт-000001` (разные форматы от разных сотрудников)
- `" УКТ-000001 "` (trailing/leading whitespace)
- `УКТ-000001\n` (newline)
- `УКТ—000001` (em-dash U+2014 вместо hyphen U+002D — distinguishable копи-паст из Word)

Если делать `where: { sku: row[0] }` → не найдёт, остаток молча пропустится, менеджер закоммитит Excel «всё ок», реально половина остатков не загрузилась.

**Why it happens:**
- Excel автоматически конвертирует `000001` → `1` (number cell).
- xlsx library возвращает cell как `{ t: "n", v: 1 }` для чисел — `String(1)` = `"1"` ≠ `"УКТ-000001"`.
- Em-dash и hyphen визуально идентичны, отладка занимает часы.
- Если Product не найден — типичная ошибка «silently skip». Нет warning счётчика в UI.

**How to avoid:**
1. **Единая функция нормализации** `lib/normalize-sku.ts`:
   ```ts
   export function normalizeSku(raw: unknown): string | null {
     if (raw == null) return null
     const s = String(raw).trim().toUpperCase()
       .replace(/[—–]/g, "-")        // em/en dash → hyphen
       .replace(/\s+/g, "")           // весь whitespace inside
     // Accept: "1", "УКТ1", "УКТ-1", "УКТ-000001", "УКТ000001"
     const match = s.match(/^(?:УКТ-?)?(\d+)$/)
     if (!match) return null
     const n = parseInt(match[1], 10)
     if (!Number.isFinite(n) || n <= 0) return null
     return `УКТ-${String(n).padStart(6, "0")}`
   }
   ```
2. **Парсер возвращает отчёт**, не только `{ imported: N }`:
   ```ts
   { imported: 150, notFound: ["5", "укт-999"], duplicates: [{ sku, lines: [3,7] }], invalid: [{ line: 12, raw: "abc" }] }
   ```
3. **UI после import показывает все три категории** с возможностью скачать csv списка «не найдено» — менеджер исправит Excel и загрузит повторно.
4. **Duplicate strategy:** две строки с тем же SKU → `sum`, но с warning в отчёте. Паттерн из parse-auto-promo-excel.ts — там просто перезапись, но для stock надо `sum` (один SKU на разных палетах в Excel).
5. **Тест с real fixture:** скопировать реальный Excel Иваново, зафиксировать как `tests/fixtures/ivanovo-stock-sample.xlsx`, golden тест на известный набор SKU.

**Warning signs:**
- После импорта `imported < totalRows` — показать явно в UI.
- `notFound` > 5% от total → показать как `Error`, не `Warning` (менеджер не понял формат).
- В логах `parse-ivanovo-stock` ≠ 0 строк с `invalid: true`.

**Phase to address:** Phase 14 plan — отдельный D-документ «Ivanovo Excel import contract». Golden test с real fixture в Zero Wave.

---

### Pitfall 5: Null vs 0 в Product.ivanovoStock / productionStock

**What goes wrong:**
Field `Product.ivanovoStock: Int?` может быть:
- `null` — «ещё ни разу не импортировали / не вводили»
- `0` — «точно 0 штук сейчас на складе»

Разная семантика! Но в SQL и TS оба сравниваются `?? 0` в агрегации: `рФ = (ivanovoStock ?? 0) + sum(wb.quantity)`. Товар с `null` трактуется как 0 → `Дефицит` рассчитается как будто точно знаем «0 штук». Менеджер купит партию, но на складе реально уже 50 штук (просто не было импорта с момента последней поставки).

**Why it happens:**
- Convention `?? 0` — универсальный fallback в TypeScript, кажется «безопасным».
- Default Int @default(0) в Prisma — уходит проблема null, но ломается семантика «ни разу не импортировали».
- UI не различает: в таблице `0` и `—` выглядят похоже.

**How to avoid:**
1. **Оставить `ivanovoStock Int?` (nullable, default NULL)** — не `@default(0)`.
2. **Миграция не бэкфиллит** существующие 200 товаров — все в `null` после миграции.
3. **В UI явно показывать `—`** для `null`, число (включая 0) — только если импорт был.
4. **Агрегация РФ** должна учитывать: если `ivanovoStock = null` → не считать РФ вообще, показать `—` в строке. Иначе ДРР-расчёт на ложных данных.
5. **Метаданные импорта:** `Product.ivanovoStockUpdatedAt DateTime?` — когда последний раз импортировали. Показывать в tooltip над числом («Обновлено 2 дня назад»). Если > 7 дней — iconка warning.
6. **Production тоже nullable** — `productionStock Int?`, та же логика. Но здесь reasonable default — user вводит вручную, UI заставляет ввести число (включая 0) явно.

**Warning signs:**
- В списке товаров РФ = 50 для SKU, для которого никто никогда не вводил Иваново — баг.
- `Дефицит` рассчитан для товаров без импорта ни разу — менеджер удивится заказу.
- SQL query `COUNT(*) WHERE ivanovoStock IS NULL` после Phase 14 должно показывать те товары что реально не импортировались.

**Phase to address:** Phase 14 — schema design D-doc, обязательно обсудить семантику null vs 0 с пользователем проекта (sergey.fyodorov@gmail.com) ДО миграции. Документировать в CLAUDE.md.

---

### Pitfall 6: Формула Д (дефицит) при edge cases: З=0, О=0, Норма=0

**What goes wrong:**
Формула `Д = Норма × З − О`. При edge cases:
- **З = 0** (нет продаж за 7 дней) → `Д = −О` (отрицательный на весь остаток). Менеджер видит «Дефицит = −50» и думает это значит «избыток» — но это «нет данных».
- **О = 0** (ничего нет на складе) + З > 0 → `Д = Норма × З` (огромное число). Корректно семантически, но если и З = 0 → `Д = 0` (корректно? или надо показать `—`?).
- **Норма = 0** (пользователь ошибся вводом в AppSetting) → `Д = −О` везде.
- **Об (оборачиваемость)** = `О / З`. При З=0 → `Infinity`. React отрендерит `Infinity` как текст «Infinity» — уродливо. `toFixed()` на Infinity → `"Infinity"`.
- **JSON.stringify(NaN)** → `null` в JSON (silent data loss при API передаче).
- **О < 0** возможно, если ошибка в xlsx-импорте (отрицательные числа в ячейке) — `Об` становится отрицательным, `Д` тоже, UI бессмысленный.

**Why it happens:**
- Стандартная ошибка «не учли деление на ноль».
- Integer arithmetic на клиенте не guards против `Infinity`/`NaN`.
- Норма в AppSetting — `Int` без `min/max` constraint в Zod.

**How to avoid:**
1. **Типизированная формула в pure function** `lib/stock-math.ts`:
   ```ts
   export function calculateStockMetrics(
     stock: number | null,
     salesPerDay: number | null,
     normDays: number
   ): { turnoverDays: number | null; deficit: number | null } {
     if (stock == null || salesPerDay == null) return { turnoverDays: null, deficit: null }
     if (salesPerDay === 0) return { turnoverDays: null, deficit: null } // "—" в UI
     if (normDays <= 0) return { turnoverDays: null, deficit: null }
     const turnoverDays = stock / salesPerDay
     const deficit = normDays * salesPerDay - stock
     return { turnoverDays, deficit: Math.ceil(deficit) }
   }
   ```
2. **В UI рендерить `null` как `"—"`**, не как число. Паттерн из `/prices/wb` с `drrPct` fallback.
3. **Д ≤ 0** (нет дефицита, достаточно на складе) — показывать цвет green, absolute value в tooltip «Избыток X шт».
4. **Д > 0** — красный, «Нужно заказать X шт».
5. **AppSetting `stock.turnoverNormDays`** с Zod `int().min(1).max(100).default(37)`. На form submit валидация. На server — double-check перед использованием в формуле.
6. **Excel import стока**: cell value < 0 или > 100000 → добавить в `invalid`, не сохранять.
7. **Golden test** `stock-math.test.ts` по аналогии с `pricing-math.test.ts`. Включить кейсы: З=0, О=0, оба=0, отрицательные, огромные.

**Warning signs:**
- UI показывает `NaN`, `Infinity`, `-Infinity`, `1e+308` где-либо.
- `Д = 0` у товара без продаж — баг (должно быть `—`).
- JSON ответа от RSC page содержит `null` там где ждали число — смотреть не NaN ли источник.

**Phase to address:** Phase 14 plan — D-doc «Stock formulas edge cases». Golden test в Zero Wave, перед UI.

---

### Pitfall 7: Миграция между двумя компьютерами + VPS

**What goes wrong:**
Проект синхронизируется через GitHub между двумя компьютерами пользователя и VPS. Phase 14 добавляет минимум **3 новых таблицы** (`WbCardWarehouseStock`, `WbWarehouse`, возможно `StockImportLog`) + **2 новых поля** (`Product.ivanovoStock`, `Product.productionStock`) + **1 новый AppSetting seed** (`stock.turnoverNormDays`).

Сценарий поломки:
1. Компьютер А: `prisma migrate dev --name add_stock_tables` → генерится `20260425_add_stock_tables/migration.sql`.
2. Компьютер А: commit + push.
3. Компьютер Б: `git pull`. Но перед pull на Б уже был запущен `prisma migrate dev` с другим именем (прототип) → конфликтная миграция в `_prisma_migrations` табличке.
4. VPS: `prisma migrate deploy` → падает с `Migration X is already applied but different`.
5. **Или** — на компе А забыли запустить `migrate dev`, только `db push` (прототипирование). На VPS нет миграции в папке → схема drift между code и prod.

Риск повышен тем что `/stock` имеет **сложный multi-table schema** — больше шансов на конфликт чем с одной таблицей.

**Why it happens:**
- `prisma migrate dev` vs `db push` путаются.
- Два компьютера с разными локальными БД не согласованы.
- Миграции руками правятся (SQL) → на втором компьютере хэш не совпадает.

**How to avoid:**
1. **Convention в CLAUDE.md (добавить перед Phase 14):** ВСЕГДА `prisma migrate dev --name <semver>` — никогда `db push` на dev. Никогда не править сгенерированный `migration.sql` вручную.
2. **Семантическое имя миграции с датой:** `20260425_v12_stock_tables`. Не `add_stuff`.
3. **Компьютер Б перед началом работы:** `git fetch && git pull && npx prisma migrate dev` (применит новые миграции локально). Перед любым коммитом.
4. **VPS deploy.sh должен содержать:** `npx prisma migrate deploy` (не `migrate dev`) **перед** `npm run build`.
5. **Stock milestone = одна большая миграция в Phase 14 Zero Wave**, не 5 мелких. Меньше конфликтов.
6. **Backfill для существующих 200 товаров** вынести в **data migration** (отдельный `.ts` script в `prisma/data-migrations/`, запускается руками на VPS после `migrate deploy`). НЕ в `migration.sql`. Пример: добавить `ivanovoStock = NULL` для всех 200 (фактически no-op — default NULL) и добавить `AppSetting.upsert('stock.turnoverNormDays', 37)`.
7. **Проверка идемпотентности:** `ON CONFLICT DO NOTHING` для seed data в SQL миграции.

**Warning signs:**
- `npx prisma migrate status` на любом компе показывает pending/drifted.
- `_prisma_migrations` таблица содержит записи с `finished_at = null` (оборванные миграции).
- `deploy.sh` на VPS падает с «Migration Y is applied but schema differs» — это красная тревога, данные на проде могут уже расходиться со схемой.

**Phase to address:** Phase 14 Zero Wave — **D-00 Migration plan**: точный SQL миграции, data migration скрипт, порядок применения на обоих компах и VPS. Integration test: `prisma migrate reset && prisma migrate deploy && prisma db seed` должен завершиться success без ошибок.

---

### Pitfall 8: Rate limit при WB stocks-report (3 req/min) vs 200 nmIds

**What goes wrong:**
Старый `fetchStocks()` делал 1 GET и получал весь дамп. Новый `POST /api/analytics/v1/stocks-report/wb-warehouses` принимает `nmIds: [...]` (max 1000). У проекта 200 карточек → помещается в один запрос, окей. Но:
- Rate limit 3 req/min + burst 1 req/20s → если в одной `POST /api/wb-sync` сделать отдельный запрос per nmId (по ошибке copy-paste) → 200 запросов × 20s = 67 минут синхронизации + 429 с первой минуты.
- 1000 nmIds max — сейчас 200 ок, но **через полгода может стать 800+** и ломаться без warning.
- Statistics API (orders) отдельный лимит, не мешается с Analytics API (stocks-report). Но код должен не путать.

**Why it happens:**
- Copy-paste из `fetchBuyoutPercent` (где batch'инг по nmIds был) — можно случайно сделать лупом.
- Не документируется в коде что max 1000 — через год кто-то добавит, а уже 1001.

**How to avoid:**
1. **Chunked helper в wb-api.ts:**
   ```ts
   async function fetchPerWarehouseStocks(nmIds: number[]): Promise<WarehouseStockRow[]> {
     const all: WarehouseStockRow[] = []
     const CHUNK = 1000
     for (let i = 0; i < nmIds.length; i += CHUNK) {
       const chunk = nmIds.slice(i, i + CHUNK)
       // 3 req/min → 20s пауза между батчами
       if (i > 0) await sleep(20_000)
       const res = await fetch(..., { method: "POST", body: JSON.stringify({ nmIds: chunk, limit: 250000, offset: 0 }) })
       if (res.status === 429) { await sleep(60_000); i -= CHUNK; continue } // retry
       const data = await res.json()
       all.push(...data.items)
     }
     return all
   }
   ```
2. **Assert:** `if (nmIds.length > 1000) { /* chunked path */ } else { /* single request */ }` — явно по размеру.
3. **Комментарий в коде с датой проверки:** `// WB Analytics stocks-report: 3 req/min + 1 req/20s burst. Max 1000 nmIds per request. Verified 2026-04-21.`
4. **Retry на 429** — как в `fetchAvgSalesSpeed7d` (там 60s sleep + recursion).
5. **Degraded mode** — если 429 после retry, sync carries on: stockQty и per-warehouse поля остаются null. Не ломать всю синхронизацию из-за 1 endpoint.

**Warning signs:**
- В логах `WB stocks-report 429` более 1 раза за sync.
- Синхронизация занимает > 5 минут (nginx proxy timeout 600s уже увеличен для promotions, но всё равно).
- `WbCardWarehouseStock` полностью пуст после sync у большой части товаров.

**Phase to address:** Phase 14 plan — реализация в `lib/wb-api.ts:fetchPerWarehouseStocks()`. Unit test с моком 429 → ждёт 60 → retries.

---

### Pitfall 9: WB token scope — Аналитика vs Статистика bit

**What goes wrong:**
Текущий `WB_API_TOKEN` имеет scope Статистика (bit 6) + Аналитика (bit 2). Старый `/api/v1/supplier/stocks` — Статистика. Новый `/api/analytics/v1/stocks-report/wb-warehouses` — **Аналитика**. Если новый endpoint сделан под deprecated scope → 401 Unauthorized.

С 2026-03-30 WB также разделил токены на 4 типа: **Personal, Service, Basic, Test**. Новый stocks-report требует **Personal или Service** (не Basic/Test).

**Why it happens:**
- Разработчик предполагает «Statistics domain → Statistics bit» — а endpoint живёт на `seller-analytics-api.wildberries.ru`, не `statistics-api.wildberries.ru`.
- Token type классификация новая (март 2026) — не все разработчики в курсе.

**How to avoid:**
1. **Перед началом Phase 14** — smoke test с текущим токеном:
   ```bash
   curl -X POST -H "Authorization: $WB_API_TOKEN" -H "Content-Type: application/json" \
     -d '{"nmIds":[800750522],"limit":1}' \
     https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses
   ```
   Ожидаемый ответ: 200 + массив items.
2. **Если 401 или 403** — регенерировать WB_API_TOKEN в кабинете с правильным scope + Personal token type. Обновить в `/etc/zoiten.pro.env` + `.env.local` (оба компьютера).
3. **В коде при 401/403 — явное сообщение в UI**: «WB token scope не включает Аналитику, зарегенерируйте токен в кабинете».

**Warning signs:**
- 401/403 только на новом endpoint, не на старом `/supplier/stocks`.
- 429 с текстом про "Basic token limit" в теле.

**Phase to address:** Phase 14 Wave 0 — smoke test ДО написания кода. Документировать в CLAUDE.md текущий scope токена + дату верификации.

---

### Pitfall 10: UI горизонтальный скролл — 28+ колонок на странице `/stock/wb`

**What goes wrong:**
7 кластеров × 4 метрики (О/З/Об/Д) = 28 кластерных колонок. Плюс sticky 4 (название, фото, УКТ, действия). Плюс expand до конкретных складов внутри кластера — при expand добавляется 5-10 колонок складов × 4 метрики = 20-40 новых колонок.

Проблемы:
- Sticky colums + horizontal scroll → jitter на Safari iOS. В Chromium работает, но при 40+ колонках frame drop.
- Header row высотой 2-3 этажа (группа → кластер → метрика) → rowSpan/colSpan баги.
- Менеджер теряется: прокрутил вправо → забыл какой товар в строке.
- На мониторе 1920×1080 и обычный DPI — уже не помещается без скролла. Минимум 3200px width при expand.
- Экспорт такой таблицы в Excel — рвётся.

**Why it happens:**
- «Показать всё сразу» кажется юзер-френдли — фактически оверхед.
- Интуиция «sticky sidebar решает проблему» — не решает при 40+ колонок.

**How to avoid:**
1. **Дизайн decision ДО кодинга (D-03 UI architecture):**
   - **Expand-on-demand**: кластеры collapsed по умолчанию, показывают сумму. Click → expand в тот же rowSpan.
   - **Minimum table: 7 кластеров × 2 метрики (О, Д)** + РФ/Иваново/МП summary. = 11 колонок + 4 sticky = 15 колонок. Помещается без скролла.
   - **О/З/Об — в tooltip на hover по Д-ячейке** (Д — самое важное для действия).
   - **«Фильтр по товарам»** — показывать только те SKU у которых Д > 0 (дефицит). Это default view.
2. **Mobile strategy:** `/stock/wb` — это desktop-only раздел. На mobile показать заглушку «Доступно на десктопе». В breakpoint `md:` (768px) — сразу редирект или уведомление.
3. **Horizontal scroll container с правильным CSS:**
   ```css
   .table-container { overflow-x: auto; scrollbar-gutter: stable; }
   .table-sticky-left { position: sticky; left: 0; z-index: 10; background: var(--background); }
   ```
   Не юзать `overflow: scroll` — тянет вертикальный скроллбар тоже.
4. **Виртуализация не нужна** при 200 товарах × ~100 строк (с expand) — это 100 DOM rows, отрисуется нормально.
5. **Тест на production data** в Phase 14 — не на 5-10 mock карточках.

**Warning signs:**
- FPS < 30 при scroll в DevTools Performance.
- Пользователь в отзыве «не пойму где какой артикул».
- `/stock/wb` падает/фризится на Safari.

**Phase to address:** Phase 14 plan — **D-03 UI architecture** с wireframe'ами desktop + mobile. Перед началом кода — showcase макета пользователю.

---

## Moderate Pitfalls

### Pitfall 11: Excel формула vs cached value

**What goes wrong:**
xlsx library по умолчанию возвращает **cached value** из последнего открытия Excel в Microsoft Excel / LibreOffice. Но:
- Если Excel был создан программно (Python скрипт) **без пересчёта формул** → cache пустой → value = null.
- Если пользователь менял SUM и не сохранил → старое кешированное значение в файле.
- Если в колонке остатка `=SUM(B2:B5)` и кэш пустой → импорт пропускает строку как пустую.

**How to avoid:**
- xlsx option `cellFormula: false` (default) — возвращает cached value. Достаточно для нормально сохранённых Excel.
- Если ячейка получается `null`/`""` но соседние строки валидны → flag в отчёте «Возможно формула без cache, откройте и сохраните в Excel».
- Для численных полей остатков — менеджер должен вводить числа напрямую (без формул). Документировать в Excel template как comment.

**Phase to address:** Phase 14 — document в `/docs/ivanovo-import-guide.md`. В parser возвращать специфичный warning.

---

### Pitfall 12: Кэширование RSC page /stock при частом refetch

**What goes wrong:**
`/stock` и `/stock/wb` — RSC pages с тяжёлыми агрегациями. Каждый `router.refresh()` или revalidate пересчитывает:
- 200 товаров × 50 складов × aggregation в 7 кластеров = ~10k rows join + group by.
- На 2 GB VPS + Postgres → 300-800ms per page load.
- Если менеджер открывает `/stock/wb`, крутит фильтры → dozens of refetch.

**How to avoid:**
- **Materialized view НЕ нужен** — agregация дешёвая (200×50 = 10K rows, Prisma handle'ит за 100ms при правильных индексах).
- **Индексы:** `WbCardWarehouseStock(wbCardId, warehouseId)` (unique), + `WbCardWarehouseStock(warehouseId)` для per-cluster queries.
- **React cache() wrapper** для aggregation функций внутри одного render cycle — если дважды вызывается `getStocksByCluster()`, один запрос.
- **Next.js 15 unstable_cache** или просто revalidatePath после mutations — не нужен 60-sec TTL (данные меняются только при manual sync).
- **Client-side фильтрация** (brand/category MultiSelect) — данные уже на клиенте, не рефетчить.

**Warning signs:**
- `/stock/wb` load > 2 sec.
- 50%+ CPU на VPS при открытии страницы.
- В PM2/systemd логах OOM.

**Phase to address:** Phase 14 — индексы в migration, benchmark query в Zero Wave. Real-data load test на prod snapshot.

---

### Pitfall 13: ManualПродукция refresh (timer vs button)

**What goes wrong:**
Менеджер открыл `/stock` → увидел данные 3 дня назад → принял решение на них. Нет индикатора freshness. Или наоборот — cron auto-sync каждый час убивает WB rate limit и батарея уведомлений 429.

**How to avoid:**
- **Нет cron auto-sync в Phase 14.** Только manual refresh кнопки (как сейчас в `/cards/wb`).
- **Показать `updatedAt` каждой карточки** вверху страницы: «WB остатки обновлены X минут назад». Если > 24h — жёлтый badge.
- **Кнопка «Обновить остатки»** рядом с header — вызывает `POST /api/wb-sync` (реиспользует существующий endpoint) + toast «Обновление займёт ~2 минуты».
- **Иваново/Производство — ручной ввод**, `updatedAt` = время импорта. Badge если > 7 дней.

**Phase to address:** Phase 14 UI — кнопка refresh + freshness indicator. Cron — отдельный милстоун v1.3+.

---

### Pitfall 14: Cascade delete между Product / WbCard / WbCardWarehouseStock

**What goes wrong:**
- `Product` имеет soft-delete (`deletedAt`), НЕ cascade.
- `WbCard` **не имеет** soft-delete (паттерн проекта — physical delete при очистке карточек).
- `WbCardWarehouseStock.wbCardId → WbCard` — если cascade, physical delete WbCard уничтожит stock history. Если RESTRICT, delete WbCard упадёт «есть FK».

**How to avoid:**
- `WbCardWarehouseStock.wbCard → WbCard(onDelete: Cascade)` — консистентно с `CalculatedPrice`, `WbPromotionNomenclature` (проверено в schema.prisma:439).
- При удалении WbCard (менеджер через кнопку «Почистить отсутствующие») — stock history тоже уходит. Приемлемо: если карточка удалена из WB → остатки по ней тем более не важны.
- `Product.deletedAt` — НЕ влияет на WbCardWarehouseStock (нет связи Product → WbCard через FK, только через MarketplaceArticle.article → WbCard.nmId без FK — см. CLAUDE.md).

**Phase to address:** Phase 14 schema — явное `onDelete: Cascade` в `WbCardWarehouseStock.wbCard`. Проверить integration test «удалить WbCard → stock records тоже удалились».

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Захардкодить cluster mapping в TS объект вместо `WbWarehouse` таблицы | Быстрее на 2 часа | Каждое переименование склада — code change, deploy, рассинхрон у двух разработчиков | **Never.** Даже MVP — table-driven. |
| Писать формулу Д в TSX inline вместо `lib/stock-math.ts` | Не надо создавать файл | Невозможно unit-test, дублирование расчётов RSC/client, silent bugs в Infinity/NaN | **Never.** Паттерн `pricing-math.ts` уже есть, копировать его. |
| Использовать старый `fetchStocks()` как есть | Работает сейчас | Sunset 2026-06-23, данные станут 0 молча | **Только до написания новой функции**, не в commit. |
| Skip unit tests для Excel парсера, «протестирую вручную» | Экономия 2-3 часа | Первое изменение формата Excel → тихий breakage, менеджер жалуется через 2 недели | **Never.** Golden fixture тест — стандарт проекта (см. parse-auto-promo-excel.ts). |
| Писать `ivanovoStock Int @default(0)` вместо `Int?` | Проще агрегации | Невозможно отличить «не импортировали» от «точно 0» | **Never.** Бизнес-семантика важнее удобства типизации. |
| Полный refetch `/api/wb-sync` вместо отдельного `/api/stock-sync` | Переиспользование | Синхронизация остатков 10 минут блокирует весь endpoint; при 429 — теряем и pricing данные | **Только Phase 14 MVP.** Refactor в отдельный endpoint — задача v1.3. |
| Single-page `/stock` с всеми 40 колонками без expand | Меньше interaction complexity | UX катастрофа при 200 товарах, Safari fps drop | **Never.** Expand-on-demand обязателен. |
| Hardcode cluster список в TS union `"ЦФО" \| "ЮГ" \| ...` | Type safety | Новый кластер у WB (был «Сибирь Восток» добавлен в 2024) → все TS файлы ломаются | **Only if 100% stable.** Лучше `string` + ENUM валидация при импорте. |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| WB Stocks API (old) | Использовать `/api/v1/supplier/stocks` в новом коде | Использовать `POST /api/analytics/v1/stocks-report/wb-warehouses`, пометить старый `@deprecated` |
| WB Stocks API (rate limit) | Запрос per nmId в loop | Batch до 1000 nmIds, sleep 20s между батчами, retry 429 через 60s |
| WB Stocks API (missing row) | `upsert` только строк из ответа → stale data | `deleteMany` per wbCardId в транзакции + `createMany` из ответа |
| WB Warehouses directory | Cluster lookup по `warehouseName` | Lookup по `warehouseId` (int), имя только для UI |
| WB Warehouses directory | Fail если склада нет в справочнике | Auto-insert с `cluster = "Прочие"`, `needsClusterReview = true` |
| WB token scope | Предположить что Статистика bit 6 покрывает Аналитику | Smoke test с токеном ДО написания кода. Новый endpoint — Аналитика + Personal/Service token type |
| xlsx Excel import | `String(cell)` без trim/normalize | Единая `normalizeSku()` функция + golden test с реальным fixture |
| xlsx Excel import | Silent skip строк с not-found SKU | Явный отчёт `{ imported, notFound, duplicates, invalid }` в UI |
| Prisma migrations | `db push` вместо `migrate dev` на dev | Всегда `migrate dev --name <semver>`. VPS — `migrate deploy` only |
| Prisma migrations | Два компа с разными локальными миграциями | Перед каждым коммитом — `git pull && prisma migrate dev` |
| RSC aggregation | `prisma.findMany` в цикле per cluster | `groupBy` с aggregation по warehouse → map в memory |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 query при aggregation per cluster | `/stock/wb` > 2 sec load | Один `groupBy` query + in-memory roll-up | Уже при 50 товарах |
| Missing index на `WbCardWarehouseStock(wbCardId)` | Slow queries in pg_stat_activity | Unique index `(wbCardId, warehouseId)` + index `(warehouseId)` | 200+ товаров + expand view |
| Excel import в одной транзакции для 200 SKU | `/api/ivanovo-stock-import` timeout на 2 GB VPS | Batch по 50, commit per batch, report per batch | 100+ строк Excel |
| JSON serialization 200 товаров × 50 складов через RSC | Response > 500 KB, медленный hydrate | Pre-aggregate на сервере до нужной гранулярности | 500+ товаров |
| `revalidatePath("/stock/wb")` на каждом mutation | Cascade refetch от каждого стока | Batch mutations, revalidate раз после всех | Частые обновления remote sync |
| Sticky columns + huge row count | Jitter при scroll | CSS `contain: strict` на row, `will-change: transform` sparingly | 500+ rows без virtualization |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Excel upload без size limit | Upload 1GB файла → OOM на VPS | Multer/Next.js route limit `maxDuration: 60, maxRequestSize: '10mb'` |
| Excel upload без RBAC | MANAGER может перезаписать остатки другого склада | `requireSection("STOCK", "MANAGE")` на POST роутах |
| Пользователь с role VIEWER видит Иваново-остатки | Конкурент может получить чувствительные данные через exposed endpoint | `requireSection("STOCK", "VIEW")` на GET routes + RSC page |
| WB token в .env committed | Credential leak через GitHub | `/etc/zoiten.pro.env` на VPS, `.env.local` в gitignore (уже настроено) |
| SQL injection через Excel SKU | «; DROP TABLE» в ячейке → если raw SQL | Только Prisma parametrized queries, не `$queryRaw` с interpolation |
| Отсутствие audit log изменений ivanovoStock | Менеджер подменил остаток и покрыл недостачу | `StockImportLog(userId, fileName, importedCount, skippedCount, createdAt)` — отдельная таблица |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| `null` и `0` рендерятся одинаково | Менеджер думает «0 штук», на деле «не импортировали» → закупит лишнее | `null` → `"—"`, `0` → `"0"` (цвет серый), `> 0` → черным |
| Огромная таблица без фильтра «дефицит > 0» | Менеджер ищет дефицит среди 200 товаров | Default view — только SKU с `Д > 0`, toggle «Показать все» |
| `Д = -50` (отрицательный) без tooltip | Неясно что это «избыток» | Цвет green + label «Избыток 50 шт», Д > 0 → red + «Нужно заказать N шт» |
| Infinity в колонке Об | Пользователь видит «Infinity» → bug report | `—` для Об при З=0, tooltip «Нет продаж за 7 дней» |
| Кнопка refresh без progress indicator | Клик → ничего не меняется 2 минуты → клик ещё раз → два параллельных sync | Disable кнопку на время sync, spinner + «Синхронизация... 45 из 200 карточек» |
| Импорт Excel → `{ imported: 150 }` без деталей | Не знаю что не импортировалось | Modal с breakdown: OK/NotFound/Duplicates/Invalid + downloadable csv |
| Expand кластера перезагружает страницу | Вся таблица flicker | Client-side state, useState для expandedClusters |
| Нет «Обновлено X минут назад» | Данные может быть недельной давности | Freshness badge рядом с кнопкой refresh |
| Mobile view таблицы с 28 колонок | На телефоне нечитаемо | `/stock/wb` только desktop, redirect + message на mobile |

---

## "Looks Done But Isn't" Checklist

- [ ] **WB stocks sync:** Проверить на новом endpoint `/api/analytics/v1/stocks-report/wb-warehouses`, не старом. Verify response has `warehouseId`, не только `warehouseName`. Smoke test должен пройти ДО релиза.
- [ ] **Per-warehouse write strategy:** `deleteMany + createMany` в транзакции — verified. Тест: вчера остаток был 10 на складе Тула, сегодня товар распродан (нет строки в ответе) → в БД ДОЛЖНО быть 0 или запись отсутствовать. Если осталось 10 — баг.
- [ ] **Cluster auto-insert:** Тест — придумать fake `warehouseId = 99999` в mock ответе → после sync в `WbWarehouse` появилась запись с `cluster = "Прочие", needsClusterReview = true`. В админке видна «Требуют привязки (1)».
- [ ] **Excel import отчёт:** После импорта UI показывает breakdown: imported, notFound, duplicates, invalid. Скачивание csv «не найдено» работает.
- [ ] **normalizeSku() edge cases:** Тесты на «1», «001», «УКТ-1», «укт—000001» (em-dash), «УКТ 000001», `" УКТ-000001 \n"` → все возвращают `"УКТ-000001"`.
- [ ] **Формулы edge cases:** Unit test на З=0 → Об=null, Д=null. О=0 + З>0 → Д = Норма × З (положительный). Норма=0 → null.
- [ ] **UI null/0 разделение:** Скриншот таблицы для товара с `ivanovoStock = null` — в ячейке «—», не «0».
- [ ] **RBAC на все новые routes:** `/api/ivanovo-stock-import` POST — MANAGE. `/api/wb-sync` (обновлённый) — MANAGE. RSC `/stock/*` — VIEW.
- [ ] **Миграция применена на обоих компах и VPS:** `prisma migrate status` — all applied, no pending/drifted. VPS deploy.sh включает `migrate deploy`.
- [ ] **Индексы созданы:** `EXPLAIN ANALYZE` для агрегации per-cluster — usage `idx_wb_card_warehouse_stock_warehouse_id`.
- [ ] **Freshness indicator:** на `/stock` UI показывает «Обновлено X минут назад» — не hardcoded «сегодня».
- [ ] **Golden test stock-math:** по аналогии с `pricing-math.test.ts` — зафиксированный кейс с известными числами.
- [ ] **Rate limit retry:** Mock 429 в тесте — retry через 60s, не падает.
- [ ] **Token scope verified:** Документировать дату smoke test + scope в CLAUDE.md (как уже документировано для Statistics bit 6).
- [ ] **Deprecation notice:** Старый `fetchStocks()` помечен `@deprecated — sunset 2026-06-23, use fetchPerWarehouseStocks()`.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Использовали deprecated endpoint — после sunset все 0 | HIGH | 1. Emergency PR — переключить на новый endpoint. 2. Re-sync вручную. 3. Верифицировать что данные корректны (сравнить с кабинетом WB вручную). 4. Post-mortem про monitoring deprecation notices. |
| Зомби-записи в `WbCardWarehouseStock` (не удалились при missing row) | MEDIUM | 1. SQL cleanup: `DELETE FROM WbCardWarehouseStock WHERE updatedAt < NOW() - INTERVAL '2 days'` (или по флагу `syncedAt`). 2. Fix write-strategy на clean-replace. 3. Re-sync. |
| Справочник `WbWarehouse` не знает новый склад → sync падает | LOW | 1. Проверить что auto-insert работает (если нет — hotfix). 2. Вручную заполнить cluster для новых записей в админке. 3. Документировать cluster после подтверждения от менеджера. |
| Миграция не применилась на одном из компов | LOW-MEDIUM | 1. `prisma migrate status` — увидеть pending. 2. `prisma migrate dev` — применить локально. 3. Если drift — `prisma migrate reset` (предварительно backup). 4. Post-mortem про convention. |
| Миграция не применилась на VPS | HIGH | 1. ssh на VPS, `cd /opt/zoiten-pro && npx prisma migrate deploy`. 2. Если падает — разбираться с `_prisma_migrations` table. 3. Если данные уже повреждены — backup restore, re-deploy. |
| Excel импорт загрузил мусор в `ivanovoStock` | MEDIUM | 1. SQL rollback: `UPDATE Product SET ivanovoStock = NULL WHERE ivanovoStockUpdatedAt = '<import time>'`. 2. Fix parser. 3. Re-import корректного файла. |
| Menedzher действовал на ложных данных (купил партию по фантомному дефициту) | HIGH (business cost) | 1. Найти root cause (zombie row, null/0 confusion, formula bug). 2. Исправить. 3. Ручная проверка всех заказов за период. 4. Post-mortem + тест-кейс. |
| UI freezes на Safari/2GB VPS | MEDIUM | 1. Добавить virtualization. 2. Fallback на server-side фильтрацию. 3. Если проблема в sticky columns — рефактор на flat таблицу + tabs per кластер. |
| Cluster mapping сломался после WB rename | LOW | 1. Заходим в админку `/admin/settings/wb-warehouses`, вкладка «Требуют внимания». 2. Обновляем `lastKnownName` → current name. 3. Повторяем sync. |
| WB token 401 после упражнения scope | MEDIUM | 1. Кабинет WB → регенерировать токен с правильным scope + Personal type. 2. Update `/etc/zoiten.pro.env` + `.env.local`. 3. `systemctl restart zoiten-erp`. |

---

## Pitfall-to-Phase Mapping

Все пункты адресуются в **Phase 14 (Управление остатками)** — единственная фаза milestone'а v1.2. Внутри фазы — декомпозиция по D-документам и waves.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Deprecated stocks endpoint | Phase 14 Wave 0 — smoke test нового endpoint | `fetchPerWarehouseStocks()` тест с реальным WB_API_TOKEN возвращает > 0 строк |
| 2. Справочник кластеров drift | Phase 14 D-02 «WbWarehouse maintenance» | Unit test: unknown warehouseId → auto-insert с `needsClusterReview = true`. Админка показывает count badge |
| 3. Missing row ≠ 0 | Phase 14 D-02 «Stock write strategy» | Integration test: two syncs, в первом артикул имеет 10 на складе, во втором отсутствует → в БД отсутствует запись (или 0) |
| 4. SKU normalization | Phase 14 D-04 «Ivanovo Excel contract» | Golden test `normalizeSku()` с fixture |
| 5. null vs 0 семантика | Phase 14 D-01 «Schema design» | Screenshot review — `null` → «—», `0` → «0» |
| 6. Формула Д edge cases | Phase 14 D-03 «Stock formulas» | Golden test `stock-math.test.ts` с едж-кейсами |
| 7. Миграция между компами | Phase 14 Wave 0 — D-00 migration plan | `prisma migrate reset && deploy && seed` завершается без ошибок на обоих компах + VPS |
| 8. Rate limit 3 req/min | Phase 14 D-05 «WB integration» | Mock 429 test → retry через 60s |
| 9. WB token scope | Phase 14 Wave 0 — smoke test | curl с текущим токеном возвращает 200 от нового endpoint |
| 10. UI 28+ колонок | Phase 14 D-06 «UI architecture» — wireframes | Design review с пользователем ДО кода; expand-on-demand в mockup |
| 11. Excel formula vs value | Phase 14 D-04 | Test fixture с SUM формулой — parser возвращает computed value |
| 12. RSC performance | Phase 14 D-07 «Aggregation performance» | Benchmark `/stock/wb` < 500ms на prod snapshot |
| 13. Refresh strategy | Phase 14 D-06 UI | Manual только, freshness badge |
| 14. Cascade delete | Phase 14 D-01 schema | Integration test — delete WbCard → WbCardWarehouseStock удаляется |

---

## Sources

- [WB API Release Notes — March 30, 2026 rate limits update](https://dev.wildberries.ru/en/news/281) — HIGH (официальный источник)
- [WB API — Analytics & Data (stocks-report endpoints)](https://dev.wildberries.ru/en/docs/openapi/analytics) — HIGH (официальная документация endpoint `/api/analytics/v1/stocks-report/wb-warehouses`)
- [WB API — Main Reports (deprecation notice `/api/v1/supplier/stocks`)](https://dev.wildberries.ru/en/docs/openapi/reports) — HIGH (sunset date 2026-06-23 подтверждён)
- [WB API — FBS Assembly Orders (нет cluster endpoint)](https://dev.wildberries.ru/en/openapi/orders-fbs) — HIGH (отсутствие cluster API подтверждено)
- [WB API — Token types](https://dev.wildberries.ru/en/openapi/api-information) — HIGH (Personal/Service/Basic/Test классификация)
- [Wildberries seller warehouse map (Russian)](https://seller.wildberries.ru/instructions/ru/ru/material/warehouse-map) — MEDIUM (требует логин в seller cabinet; подтверждает отсутствие public API для cluster mapping)
- [SheetJS xlsx — Formulae feature](https://docs.sheetjs.com/docs/csf/features/formulae/) — HIGH (cached value vs formula semantics)
- [SheetJS xlsx npm](https://www.npmjs.com/package/xlsx) — HIGH (cell type `t`, value `v`, formula `f` properties)
- Внутренние источники (HIGH confidence):
  - `.planning/PROJECT.md` — milestone scope, schema ref
  - `CLAUDE.md` — существующие WB API паттерны, Prisma convention, VPS constraints
  - `lib/wb-api.ts` — текущий `fetchStocks()`, rate limit handling, 429 retry pattern
  - `lib/parse-auto-promo-excel.ts` — Excel парсер паттерн (fixture-based tests)
  - `prisma/schema.prisma` — WbCard модель, `CalculatedPrice.onDelete: Cascade` precedent
  - `app/api/wb-sync/route.ts` — текущий sync orchestration с degraded mode

---
*Pitfalls research for: Adding stock management to existing Zoiten ERP (milestone v1.2 / Phase 14)*
*Researched: 2026-04-21*
