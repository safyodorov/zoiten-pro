# Дизайн-документ: /sales-plan v2 — рабочий план продаж 01.07.2026–31.12.2026

Синтез трёх дизайн-линз (модель данных, UX, методология) поверх четырёх отчётов разведки, с закрытием дыр адверсариального ревью (v2.1). Все противоречия между линзами разрешены в §1.2; итоговая схема, движок, UI и план внедрения согласованы между собой.

---

## Зафиксированные решения (2026-07-04) — источник истины

Ответы пользователя на критичные открытые вопросы §11. При планировании и реализации считать этот блок приоритетным над формулировками ниже.

1. **Метрика ИУ = выкупы в ₽** (цены продавца, до СПП). `salesPlan.iuMetric = "buyouts"`. Подтверждено (вопрос №1). Эмпирика прод-БД: выкупы июня ≈ 104% константы 2 380 805 ₽/день.
2. **Кабинет ИУ = кабинет с токеном `WB_API_TOKEN`** (единственный источник funnel-факта, `lib/wb-funnel-api.ts:99`). Сравнение факта с ИУ по всему этому кабинету валидно. Мульти-кабинетный сбор не нужен (вопрос №16).
3. **«Итог» = горизонт H2 (01.07–31.12.2026); календарно-годовой тотал за 2026 НЕ показывать** (январь–апрель нет в funnel, не восстанавливаем). Механизм year-бакета в движке/`date-buckets` **оставить** ради будущих лет (2027+, где накопятся полные годовые данные). Риск №13 / вопрос №17 закрыты в эту сторону.
4. **Даты приходов: по умолчанию `createdAt + 45` (leadtime-eta); при заполненном `Purchase.plannedArrivalDate` — работать по нему.** Массовое ручное заполнение дат ПЕРЕД запуском **НЕ требуется** — заполняется постепенно, +45 приемлем как временный дефолт. Соответственно «обязательная прод-задача этапа 2» (§9, риски №7/№10) понижается до «постепенно, по мере ведения закупок»; деградация точности дат на старте — принятая норма, видима через `dateSource`-тег.

**Остальные 14 вопросов §11 — приняты по рекомендованным Default:** opt-out виртуальных закупок (SUGGESTED учитывается в плане сразу); единица планирования «заказы шт/день»; страховой запас 14 дн / покрытие закупки 60 дн / lead time fallback 45 дн (заказ→Иваново) / транзит после этапа TRANSIT 20 дн / лаг Иваново→WB 0 дн; ряд «План» = реализуемый (сток-ограниченный) + `lostRub`; сравнение план/факт против активной зафиксированной версии; без авто-фиксации cron в v1; без ramp-up после OOS в v1; day-разбивка Сводного ограничена окном 62 дня; деприкейт `/purchase-plan` и `/procurement/plan` в этапе 6 (снятие из sidebar — после недели параллельной работы); поднять все write-actions до `SALES MANAGE`; без company-level «Масштабировать день…» и без полного diff-UI версий в v1.

---

## 1. Резюме и ключевые решения

### 1.1 Что строим

Раздел `/sales-plan` (секция `SALES`) превращается из одноразового симулятора «до 30.06» в рабочий план продаж H2-2026 с тремя рядами данных (наш план / наш факт / план по ИУ), помесячным вводом с дневной детализацией, приходами из Китая по партиям, виртуальными закупками, версионированием (фиксацией) и агрегатами день/неделя/месяц/квартал/полугодие. Архитектура — три строго разделённых слоя:

1. **Рабочий план (draft, мутирует)** — нормализованные редактируемые таблицы: `SalesPlanMonthLevel` (помесячные уровни), `SalesPlanDayOverride` (точечные правки дня), `VirtualPurchase` (виртуальные закупки), AppSetting-параметры. Дневной ряд драфта **не хранится** — детерминированно вычисляется pure-движком на каждый request (как сейчас; масштаб: **104 активных Product** × ~200 дней — миллисекунды; «270» из ранней разведки — это число WB-карточек, не товаров).
2. **Версии (immutable)** — `SalesPlanVersion` + `SalesPlanVersionDay`: материализованный дневной ряд, снятый кнопкой «Зафиксировать план». План/факт по умолчанию меряется против активной версии.
3. **Факт (read-only, уже есть)** — `WbCardFunnelDaily`, читается на лету, ничего нового не собираем: funnel непрерывен с 2026-04-21, покрывает 01.07+ и наполняется cron'ом 04:00 МСК. **Допущение (зафиксировано):** funnel собирается одним токеном `getWbToken("WB_API_TOKEN")` (`lib/wb-funnel-api.ts:99`) — это ровно один кабинет WB из пяти токенов в БД; сравнение с ИУ валидно, только если договор ИУ относится к этому кабинету (открытый вопрос №16).

### 1.2 Разрешение противоречий между линзами

| Вопрос | data-линза | method-линза | UX-линза | ИТОГОВОЕ РЕШЕНИЕ |
|---|---|---|---|---|
| Имя сущности виртуальной закупки | `VirtualPurchase` | `PlannedSupply` | — | **`VirtualPurchase`** — совпадает с терминологией требования пользователя |
| Учёт предложений в плане | opt-in (только ACCEPTED, toggle) | **opt-out** (PROPOSED считается сразу) | opt-in-бейджи | **Opt-out**: `SUGGESTED` участвует в плане сразу. Аргумент method-линзы решающий: при opt-in дефолтный план весь горизонт лежит в нуле на стокаутах и бесполезен; требование №6 говорит «система должна делать предположения… учитываются в плане». UX корректируется: ⚠-бейдж предложения означает «учтено в плане, можно отклонить» |
| Строка версии | `SalesPlanVersionLine` (только выкупы) | `SalesPlanVersionDay` (заказы И выкупы) | — | **`SalesPlanVersionDay` с обеими метриками** (заказы шт/₽ + выкупы шт/₽) — хедж против нерешённого вопроса метрики ИУ, переключение без пересчёта версий |
| Активная версия | AppSetting `activeVersionId` | флаг `isBaseline` на версии | — | **AppSetting `salesPlan.activeVersionId`** — не нужно кодом поддерживать инвариант «ровно одна true» |
| Поле плановой даты прихода закупки | `Purchase.plannedArrivalDate` | `Purchase.expectedArrivalDate` | — | **`Purchase.plannedArrivalDate`** — не путается с legacy `ProductIncoming.expectedDate` и `VirtualPurchase.expectedArrivalDate` |
| Семантика `leadTimeDays` | производство (транзит сверху) | **заказ → приход в Иваново** | — | **Заказ → приход в Иваново** (как трактует `/procurement/plan`, fallback 45 дней = полный цикл). Транзит-добавка применяется только к факт-дате этапа TRANSIT: `TRANSIT.date + salesPlan.transitDays` (default 20) |
| Ramp-up 3 раб. дня | убрать | оставить | — | **Убрать в v1** — был приклеен к хаку `plannedSetDate`; месячные уровни + day-overrides дают явный контроль. Возврат ramp после OOS — enhancement (открытый вопрос) |
| coverDays виртуальной закупки | 37 | 60 | — | **60** (`salesPlan.vpCoverDays`) — цикл Китая 45–60 дней ⇒ заказ ~раз в 2 месяца; 37 — семантика оборачиваемости /stock, не цикла заказа |
| Триггер «пора заказывать» | сток = 0 | пробой страхового запаса | — | **Пробой страхового запаса**: `projectedStock(d) < safetyStockDays × rate(d)`, `salesPlan.safetyStockDays` default 14 |
| Хранение ИУ | массив периодов `iuTargets` | один объект `iuTarget` | — | **Массив периодов** `salesPlan.iuTargets` (future-proof под ИУ-2027) + `salesPlan.iuMetric` («buyouts» default) из method-линзы |
| Структура lib | каталог `lib/sales-plan/` | плоские файлы | — | **Каталог `lib/sales-plan/`** |
| Дефолт сравнения план/факт | — | всегда против baseline-версии | против черновика | **Активная зафиксированная версия** (если есть; до первой фиксации — черновик). Принцип «план/факт меряется против фиксации» — фундамент честного контроля; черновик доступен в селекторе версий |
| Уровни месяца | targetOrdersPerDay + priceRub + buyoutPct | ordersPerDay + priceRub | шт/день | **Полная модель data-линзы**: шт/день + опциональные помесячные overrides цены и % выкупа |
| Ряд «План» в отчётах | — | реализуемый (сток-ограниченный) | реализуемый + ⚠ «задано vs реализуемо» | **Реализуемый** ряд + метрика `lostRub` (потери от OOS) + ⚠-маркеры |

### 1.3 Покрытие 8 требований пользователя

| # | Требование | Чем закрыто |
|---|---|---|
| 1 | Горизонт 01.07–31.12.2026, месяцы + год | `salesPlan.horizon` в AppSetting; таб «Сводный»: разбивка day/week/month/quarter/halfyear + колонка «Итог» (весь горизонт); guard `end ≥ today` снимается. «В целом по году» интерпретируется как «итог по горизонту 01.07–31.12»; если пользователь имел в виду календарный 2026 с фактом января–июня — funnel есть только с 2026-04-21, январь–апрель невосстановим (открытый вопрос №17) |
| 2 | План/факт с отклонением | `PlanFactMatrix` + `buildPlanFactReport()`: отклонение ₽/%, pro-rata текущего бакета, FAC-прогноз |
| 3 | Три ряда: план / факт / ИУ 2 380 805 ₽/день | План — версия/драфт; факт — funnel на лету; ИУ — `salesPlan.iuTargets` → ряд на лету (438 068 120 ₽ за 184 дня); хардкод `IU_REMAINING_RUB` выпиливается |
| 4 | Плановые даты прихода из Китая (этапы закупок) | `Purchase.plannedArrivalDate` (новое поле) + resolver `resolveArrivalBatches()` с fallback-цепочкой через `PurchaseItemStageProgress(TRANSIT).date` (включая правила для date=null и частичного TRANSIT-qty, §3.4); мульти-партийные приходы вместо singleton `ProductIncoming` |
| 5 | Помесячные уровни с детализацией в день | `SalesPlanMonthLevel` (шт/день per товар per месяц) + `SalesPlanDayOverride`; резолв `день → месяц → baseline` |
| 6 | Виртуальные закупки — только в плане | `VirtualPurchase` (отдельная сущность, структурная изоляция от production-sync//stock/баланса) + генератор `suggestVirtualPurchases()`; конвертация в реальную закупку с анти-двойным-счётом |
| 7 | Рабочий инструмент: менять/пересчитывать/фиксировать/смотреть за периоды | Bulk-drafts + «Пересчитать план (N)»; правка дня в `ProductPlanDialog` (обе цепочки включают regenerateVirtualPurchases); `fixSalesPlanVersion`; бакеты неделя/месяц/квартал/полугодие в тулбаре + пресеты периодов «3 мес»/«Полугодие»; company-level правка дня — открытый вопрос №18 |
| 8 | Стыковка с ПДДС | `lib/sales-plan/pdds-feed.ts`: дневной ряд выручки от versionId + плановые платежи виртуальных закупок со сверкой live-статусов (анти-двойной счёт, §8); версия — адресуемая сущность |

---

## 2. Модель данных

Все новые модели — в `prisma/schema.prisma` с docs-комментарием «Phase NN: План продаж v2 (2026-07)». Одна рукописная миграция `prisma/migrations/20260705_sales_plan_v2/migration.sql`. Все изменения **аддитивны**: `ProductIncoming`, production-sync, старые AppSetting-ключи и старый `computeForecast` живут до вырезания старого UI (этап 6).

### 2.1 SalesPlanMonthLevel — помесячные плановые уровни

```prisma
// План продаж v2: помесячный плановый уровень per товар.
// Единица — ЗАКАЗЫ шт/день (вход симуляции; выкупы/₽ — производные).
// month = 1-е число месяца (конвенция ManagerSupportStats.period).
model SalesPlanMonthLevel {
  id                 String   @id @default(cuid())
  productId          String
  product            Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  month              DateTime @db.Date            // 2026-07-01, 2026-08-01, …
  targetOrdersPerDay Float?                       // null = «нет плана, взять baseline из funnel»
  priceRub           Float?                       // плановая цена выкупа ₽; null = live avgPrice
  buyoutPct          Float?                       // 0..100 override % выкупа; null = fallback-цепочка
  comment            String?
  updatedAt          DateTime @updatedAt
  updatedBy          String?

  @@unique([productId, month])
  @@index([month])
}
```

Обоснование единицы «заказы шт/день»: непрерывность с текущим UX (`baselineOverrides`, `plannedSalesPerDay`); сток-ограничение и виртуальные закупки физически работают в заказах-штуках; обратный пересчёт из ₽/мес в заказы неоднозначен при изменении цены/% внутри месяца. UI показывает рядом расчётные «≈ шт/мес · ₽/мес».

### 2.2 SalesPlanDayOverride — точечная правка дня (требование «менять продажи в день»)

```prisma
model SalesPlanDayOverride {
  id           String   @id @default(cuid())
  productId    String
  product      Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  date         DateTime @db.Date
  ordersPerDay Float                        // абсолютная ставка на день (не дельта)
  updatedAt    DateTime @updatedAt
  updatedBy    String?

  @@unique([productId, date])
  @@index([date])
}
```

Sparse: строки создаются только там, где пользователь руками поправил день. Приоритет: `dayOverride > monthLevel > baseline`. Правка месячного уровня НЕ трогает дневные overrides этого месяца.

### 2.3 VirtualPurchase — виртуальные закупки

```prisma
enum VirtualPurchaseStatus {
  SUGGESTED  // сгенерирована автоматически — УЧАСТВУЕТ в плане (opt-out)
  ACCEPTED   // подтверждена/отредактирована пользователем — участвует, переживает регенерацию
  DISMISSED  // отклонена — не участвует, не регенерируется на то же окно
  CONVERTED  // превращена в реальную Purchase — исключена (анти-двойной счёт)
}

// Виртуальная закупка: гипотетический заказ поставщику, влияющий ТОЛЬКО на план
// продаж (и будущий ПДДС-план). НЕ участвует в production-sync, /stock, балансе,
// списке закупок — изоляция структурная (отдельная таблица), не флаговая.
model VirtualPurchase {
  id                  String                @id @default(cuid())
  productId           String
  product             Product               @relation(fields: [productId], references: [id], onDelete: Cascade)
  supplierId          String?
  supplier            Supplier?             @relation(fields: [supplierId], references: [id], onDelete: SetNull)
  qty                 Int
  orderDate           DateTime              @db.Date  // когда надо разместить заказ
  expectedArrivalDate DateTime              @db.Date  // плановый приход в Иваново
  leadTimeDaysUsed    Int?                            // зафиксировано при генерации (аудит)
  unitPrice           Decimal?              @db.Decimal(14, 4)  // из SupplierProductLink
  currency            String                @default("CNY")
  source              String                @default("auto")    // "auto" | "manual"
  status              VirtualPurchaseStatus @default(SUGGESTED)
  convertedPurchaseId String?                         // Purchase.id после конвертации (без FK)
  comment             String?
  createdAt           DateTime              @default(now())
  updatedAt           DateTime              @updatedAt

  @@index([productId, expectedArrivalDate])
  @@index([status])
}
```

**Почему отдельная сущность, а не `Purchase.isVirtual`** (обе data-линзы и разведка закупок сходятся): `PurchaseStatus.PLANNED` уже занят семантикой реального намерения и участвует в production-sync (решение 260702-j52) — флаг требовал бы патчить ≥5 агрегаторов (`production-sync`, `stock-data`, `balance-data`, `/procurement/purchases`, таблицу закупок); массовая идемпотентная регенерация среди реальных закупок недопустима; плоская структура (строка = товар) достаточна — платежи для ПДДС считаются на лету (§8).

### 2.4 SalesPlanVersion + SalesPlanVersionDay — фиксация

```prisma
// Зафиксированная версия плана. Immutable: строки пишутся один раз в транзакции,
// server action на UPDATE строк отсутствует. Удаление — только целиком версии.
model SalesPlanVersion {
  id          String   @id @default(cuid())
  label       String                        // «План от 04.07.2026», редактируемо (rename)
  kind        String   @default("user")     // "user" | "auto" (cron-фиксация — заложено, не реализуется в v1)
  horizonFrom DateTime @db.Date             // 2026-07-01
  horizonTo   DateTime @db.Date             // 2026-12-31
  paramsJson  Json                          // снапшот входов: параметры модели, monthLevels+dayOverrides digest,
                                            // активные VirtualPurchase (id, productId, qty, даты, unitPrice,
                                            // currency, depositPct/balancePct, supplierId) — самодостаточные копии,
                                            // iuTargets — для аудита, воспроизводимости и ПДДС
  note        String?
  createdById String?
  createdBy   User?    @relation(fields: [createdById], references: [id], onDelete: SetNull)
  createdAt   DateTime @default(now())
  days        SalesPlanVersionDay[]

  @@index([createdAt])
}

// Дневная строка версии. productId БЕЗ FK + денормализация sku/name —
// паттерн FinanceStockSnapshot (переживает hard-purge товара).
model SalesPlanVersionDay {
  id                  BigInt   @id @default(autoincrement())
  versionId           String
  version             SalesPlanVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  productId           String                     // без @relation!
  sku                 String
  name                String
  date                DateTime @db.Date
  planOrdersUnits     Float
  planOrdersRub       Float
  planBuyoutsUnits    Float                      // T+3 начисление
  planBuyoutsRub      Float                      // главная план-метрика (при iuMetric=buyouts)
  priceUsed           Float
  buyoutPctUsed       Float                      // 0..1
  stockEndUnits       Float                      // остаток на конец дня (диагностика)

  @@unique([versionId, productId, date])
  @@index([versionId, date])
}
```

Объём: 184 дня × ~104 активных товара ≈ **19 тыс. строк/версия** (проверено против прод-БД: активных Product = 104); десятки версий — тривиально для PostgreSQL. Zero-строки не пишутся (отсутствие = 0, конвенция funnel). Обе метрики (заказы и выкупы) — хедж против вопроса метрики ИУ.

**Иерархия/фильтры для строк версии:** brand/direction/category/subcategory в строку не денормализуются — при чтении версия join'ится к live `Product` по `productId`. Для hard-purged товаров (нет live Product) строки рендерятся по денорм `sku/name` отдельной группой **«Архивные товары»**: без активных каскадных фильтров они входят во все суммы и «Итог»; при активных фильтрах — исключаются из выборки с notice «N архивных строк вне фильтра (M ₽)», чтобы суммы не расходились молчаливо.

### 2.5 Изменения существующих моделей

```prisma
model Purchase {
  // … существующие поля …
  plannedArrivalDate DateTime? @db.Date  // ПЛАНОВАЯ дата прихода в Иваново. Ручной ввод
                                          // в карточке закупки, prefill = createdAt + leadTimeDays.
                                          // Приоритетный источник дат для плана продаж (resolver §3.4).
}
```

- **`ProductIncoming` НЕ трогается** — production-sync, /stock, /purchase-plan работают как раньше. Новый движок читает его `expectedDate` только как legacy-fallback (§3.4), qty берёт per закупка (формула production-sync без схлопывания, образец — `productionBreakdown` в `lib/stock-data.ts:134-175`).
- `Product` получает back-relations `salesPlanMonthLevels`, `salesPlanDayOverrides`, `virtualPurchases`.
- **`Supplier` получает back-relation `virtualPurchases VirtualPurchase[]`** (Prisma требует обратную сторону для FK `VirtualPurchase.supplierId`).
- `User` получает back-relation `salesPlanVersions SalesPlanVersion[]`.
- Старые ключи `salesPlan.baselineOverrides/priceOverrides/leadTimes` — остаются до этапа 6, новый движок их игнорирует (bootstrap мигрирует значения, §9 этап 1).

### 2.6 AppSetting-ключи (JSON-строки, конвенция setGlobalJson)

| Ключ | Значение | Дефолт |
|---|---|---|
| `salesPlan.horizon` | `{"from":"2026-07-01","to":"2026-12-31"}` | сеется миграцией |
| `salesPlan.iuTargets` | `[{"from":"2026-07-01","to":"2026-12-31","dailyRub":2380805}]` — массив периодов | сеется миграцией |
| `salesPlan.iuMetric` | `"buyouts"` \| `"orders"` — метрика сравнения факта с ИУ | `"buyouts"` |
| `salesPlan.activeVersionId` | id активной версии для план/факт | — |
| `salesPlan.leadTimes2` | `{"deliveryDays":3,"returnDays":3}` (новый ключ, не конфликтует со старым; bootstrap переносит значения из старого `salesPlan.leadTimes`, §9 этап 1) | 3/3 |
| `salesPlan.wbInboundLagDays` | лаг Иваново → полка WB | 0 |
| `salesPlan.transitDays` | остаток транзита после факт-даты этапа TRANSIT | 20 |
| `salesPlan.defaultLeadTimeDays` | fallback lead time заказ→Иваново | 45 |
| `salesPlan.safetyStockDays` | страховой запас для триггера виртуальных закупок | 14 |
| `salesPlan.vpCoverDays` | покрытие виртуальной закупки, дней продаж | 60 |

ИУ — AppSetting, не таблица: одна глобальная настройка, правится раз в полгода; массив периодов покрывает ИУ-2027. Итог периода: 2 380 805 × 184 = **438 068 120 ₽** (golden-тест).

### 2.7 Миграция

```sql
-- 20260705_sales_plan_v2/migration.sql
CREATE TABLE "SalesPlanMonthLevel" (…);   -- unique (productId, month)
CREATE TABLE "SalesPlanDayOverride" (…);  -- unique (productId, date)
CREATE TYPE "VirtualPurchaseStatus" AS ENUM ('SUGGESTED','ACCEPTED','DISMISSED','CONVERTED');
CREATE TABLE "VirtualPurchase" (…);
CREATE TABLE "SalesPlanVersion" (…);
CREATE TABLE "SalesPlanVersionDay" (…);   -- BIGSERIAL PK
ALTER TABLE "Purchase" ADD COLUMN "plannedArrivalDate" DATE;
INSERT INTO "AppSetting"(key, value, "updatedAt") VALUES
  ('salesPlan.iuTargets', '[{"from":"2026-07-01","to":"2026-12-31","dailyRub":2380805}]', now()),
  ('salesPlan.horizon',   '{"from":"2026-07-01","to":"2026-12-31"}', now())
ON CONFLICT (key) DO NOTHING;
```

Плюс одноразовый `scripts/bootstrap-sales-plan-monthly.ts` (DI PrismaClient, паттерн `bootstrap-balance-snapshot.ts`):

- **Уровни с учётом семантики `plannedSalesPerDay`** («target ПОСЛЕ прихода», не текущий уровень): для месяцев **до** месяца `ProductIncoming.expectedDate` сеется `старый baselineOverride[productId] ?? null` (null = baseline из funnel); для месяцев **от** месяца expectedDate и позже — `plannedSalesPerDay ?? baselineOverride ?? null`. Товар без `ProductIncoming` — `baselineOverride ?? null` на все месяцы. Это убирает завышение плана до прихода для товаров с остатком.
- Переносит `priceOverrides` → `SalesPlanMonthLevel.priceRub` (на все месяцы горизонта).
- **Переносит старый `salesPlan.leadTimes` → `salesPlan.leadTimes2`** (пользовательские deliveryDays/returnDays не теряются, если ≠ 3/3).

---

## 3. Расчётный движок — `lib/sales-plan/`

```
lib/sales-plan/
├── types.ts             — все интерфейсы
├── engine.ts            — computeSalesPlan(), simulateProductPlan() — PURE, без prisma
├── arrivals.ts          — resolveArrivalBatches() — PURE resolver дат приходов
├── virtual-purchases.ts — suggestVirtualPurchases() — PURE
├── plan-fact.ts         — buildPlanFactReport(), compareVersions() — PURE
├── iu.ts                — iuSeriesForRange(), iuTotalForRange() — PURE
├── data.ts              — loadSalesPlanInputs(db), loadFactDaily(db) — Prisma-loader (DI, паттерн production-sync)
└── pdds-feed.ts         — контракт для ПДДС (§8): pure-ядро + loader-обёртка
lib/date-buckets.ts      — вынос bucketKey/bucketLabel из lib/loan-math.ts (сейчас только day|week|month)
                           + добавление quarter/halfyear/year; loan-math переключается на общий модуль
```

Переиспользуется из `lib/sales-forecast.ts` без изменения формул: хелперы дат (`addDays`, `getMskTodayIso` — вынести в `lib/sales-plan/dates.ts`), 4-уровневая fallback-цепочка % выкупа (own → legacy → subcategory → global, settled-окно `[today−37; today−7]` — лаг 7 дней критичен), расчёт baseline (avg заказов funnel за 7 дней) и avgPrice (`buyoutsSumRub/buyoutsCount` settled-окна → `WbCard.price`).

### 3.1 Ключевые типы

```ts
export interface SalesPlanInputs {
  today: string; horizonFrom: string; horizonTo: string
  deliveryDays: number; returnDays: number; wbInboundLagDays: number
  products: ProductPlanInput[]
}

export interface ArrivalBatch {
  date: string                     // дата доступности на стоке (уже + wbInboundLag)
  qty: number
  source: "purchase" | "virtual" | "incoming-legacy"
  refId: string
  dateSource: "manual" | "transit-eta" | "leadtime-eta" | "legacy-expected"  // аудит
}

export interface ProductPlanInput {
  productId: string; sku: string; name: string
  // + иерархия brand/direction/category/subcategory (для сортировки/группировок)
  nmIds: number[]
  stockNow: number                 // Σ WbCard.stockQty + ivanovoStock
  baselineOrdersPerDay: number
  buyoutPct: number                // 0..1
  buyoutSource: "own" | "legacy" | "subcategory" | "global"
  avgPriceRub: number
  monthLevels: Array<{ month: string; targetOrdersPerDay: number | null;
                       priceRub: number | null; buyoutPct: number | null }>
  dayOverrides: Record<string, number>
  arrivals: ArrivalBatch[]
  seedOrders: Record<string, number>  // заказы [today−3, today−1] из funnel
}

export interface PlanDayRow {
  date: string
  ordersUnits: number; buyoutsUnits: number; buyoutsRub: number; ordersRub: number
  stockEnd: number
  rateRequested: number            // ставка ДО сток-лимита — топливо suggester'а
}

export interface ProductPlanResult {
  productId: string
  days: PlanDayRow[]               // ровно [horizonFrom … horizonTo]
  monthTotals: Array<{ month: string; ordersUnits: number; buyoutsUnits: number; buyoutsRub: number }>
  firstStockoutDate: string | null // первый день пробоя страхового запаса / нуля
  lostUnitsToStockout: number      // Σ (rateRequested − ordersUnits)
  lostRubToStockout: number        // цена промедления с закупкой — управленческая метрика
}

export function computeSalesPlan(inputs: SalesPlanInputs): SalesPlanResult
// SalesPlanResult: products[] + companyDaily[] (Σ per день) + companyMonthly[]
```

`ProductPlanInput` — сериализуемый (без Decimal/Date-объектов): он же возвращается read-action'ом `getProductPlanDays` для клиентского realtime-пересчёта в модалке (§7.3).

### 3.2 Детализация «месяц → день»

```
rateRequested(d) = dayOverrides[d]                     // 1. точечная правка дня
                ?? monthLevel(d).targetOrdersPerDay    // 2. месячный уровень
                ?? baselineOrdersPerDay                // 3. baseline из funnel
priceRub(d)  = monthLevel(d).priceRub  ?? avgPriceRub
buyoutPct(d) = monthLevel(d).buyoutPct/100 ?? buyoutPct
```

Месячный уровень — **ставка в день, константная внутри месяца** (не объём, делимый на дни). Переход между месяцами — ступенькой, без ramp-up (убран, см. §1.2). Недельная сезонность (пн–вс профиль) — вне v1.

### 3.3 Дневная симуляция (эволюция simulateProduct)

Сохраняется вся проверенная механика `lib/sales-forecast.ts`:

```
для d от today до horizonTo + deliveryDays + returnDays:
  stock[d]  = stock[d−1] − orders[d−1] + Σ inflow(d) + returns(d)   // clamp ≥ 0
  orders[d] = min(rateRequested(d), stock[d])
  buyouts[d + deliveryDays]              += orders[d] × buyoutPct(d)      // T+3
  returns[d + deliveryDays + returnDays] += orders[d] × (1 − buyoutPct(d)) // T+6
  buyoutsRub начисляются по priceRub(месяца дня выкупа)
```

Отличия от старого движка: **inflow — массив `arrivals`** (несколько партий, приход в сток на `date + 1`); ставка из §3.2 (без ramp и `plannedSetDate`-хака); seed-заказы `[today−3, today−1]` дают выкупы первых дней; `rateRequested` сохраняется в выходе. Дни `[horizonFrom … today−1]` НЕ симулируются — это зона факта/версий (§6).

### 3.4 Приходы: `resolveArrivalBatches()` — главный gap закрыт

Вместо singleton `ProductIncoming.(orderedQty, expectedDate)` — массив партий per товар:

1. **Per реальная закупка** (PLANNED|ACTIVE): `qtyRemaining = max(0, item.quantity − stage(WAREHOUSE).qty)` (формула production-sync, но per закупка). Дата — fallback-цепочка, каждый уровень тегируется `dateSource`:
   1. `Purchase.plannedArrivalDate` (ручной план — приоритет; применяется ко всей qtyRemaining);
   2. `stage(TRANSIT)` — **только если `TRANSIT.qty > 0` И `TRANSIT.date != null`** (поле nullable, даты Phase 20 частично ретроспективны): TRANSIT-часть едет по `TRANSIT.date + salesPlan.transitDays`. **Частичный TRANSIT (`TRANSIT.qty < qtyRemaining`) → сплит на две партии:** `min(TRANSIT.qty, qtyRemaining)` с `dateSource="transit-eta"`, остаток `qtyRemaining − TRANSIT.qty` падает на уровень 3 (`leadtime-eta`) отдельной партией. При `TRANSIT.qty > 0` но `date = null` — уровень пропускается целиком, вся qtyRemaining идёт на уровень 3;
   3. `Purchase.createdAt + leadTimeDays(SupplierProductLink)` (lead time = полный цикл заказ→Иваново, fallback `defaultLeadTimeDays=45`);
   4. `ProductIncoming.expectedDate` (legacy — только если у товара ровно одна открытая закупка без дат);
   5. null → партия не моделируется, в UI подсвечивается «закупка без даты прихода».
2. **Per виртуальная закупка** (SUGGESTED + ACCEPTED): `date = expectedArrivalDate`, source="virtual".
3. Ко всем датам добавляется `wbInboundLagDays` (default 0 — текущее допущение зафиксировано явно и стало настраиваемым).

**Ожидание по качеству на старте:** история этапов Phase 20 тонкая (~1 месяц), поэтому в первые недели почти все партии будут `dateSource="leadtime-eta"` (createdAt+45 — эвристика, не план). Обязательная прод-задача этапа 2 — вручную заполнить `plannedArrivalDate` по всем открытым закупкам (см. §9, риск №10).

### 3.5 Тесты (vitest, канон `tests/pricing-math.test.ts`)

- `tests/sales-plan-engine.test.ts` — golden: 1 товар, 2 месяца, уровень + day override + 2 партии → `toBeCloseTo` по дням; сток-лимит, T+3/T+6, ступенька между месяцами; zero-guards.
- `tests/sales-plan-arrivals.test.ts` — все 5 уровней fallback-цепочки + dateSource + сплит частичного TRANSIT + TRANSIT с date=null.
- `tests/sales-plan-virtual.test.ts` — триггер/qty/clamp/итерации (§4).
- `tests/sales-plan-iu.test.ts` — `iuTotalForRange("2026-07-01","2026-12-31") === 438_068_120`; границы и мульти-периоды.
- `tests/sales-plan-plan-fact.test.ts` — бакетирование (включая quarter/halfyear/year в date-buckets), deviation, pro-rata, factSettled, строка «Вне плана».
- `tests/sales-plan-pdds-feed.test.ts` — платежи VP (DEPOSIT/BALANCE), исключение CONVERTED/DISMISSED по live-статусу, fallback на snapshot для отсутствующих id (§8).

---

## 4. Виртуальные закупки

### 4.1 Генератор `suggestVirtualPurchases()` — итеративный roll-forward, pure

```
для каждого товара с SupplierProductLink (иначе → список noSupplierLink для UI-предупреждения):
  arrivals := реальные партии + ACCEPTED/manual виртуальные (авто-SUGGESTED исключены — пересоздаются)
  повторять до maxIterationsPerProduct (6):
    result  := simulateProductPlan(product, arrivals)
    breach  := первый d, где projectedStock(d) < safetyStockDays × rate(d)   // страховой запас, не ноль
    если breach == null или breach > horizonTo → стоп
    orderDate := max(today, breach − leadTimeDays)          // clamp: заказ в прошлом невозможен
    arrival   := orderDate + leadTimeDays                    // если > breach → флаг «поздно», план проседает
    qty       := ceil( Σ rate(d) за [arrival; min(arrival + vpCoverDays, horizonTo)]
                       + safetyStockDays × rate(arrival) − projectedStock(arrival) )
    если qty < minQty (10) → стоп
    добавить VpSuggestion + партию в arrivals; продолжить
```

Параметры: `safetyStockDays=14`, `vpCoverDays=60`, `leadTimeDays = min(SupplierProductLink.leadTimeDays) → 45`. Источник скорости — плановая `rateRequested` (не `WbCard.avgSalesSpeed7d` — тот обновляется только ручным sync, отказ подтверждён разведкой). До 31.12 товару может понадобиться 2–3 виртуальные закупки — все генерируются каскадно за проход.

### 4.2 Жизненный цикл (opt-out)

- **Генерация** — server action `regenerateVirtualPurchases()` (SALES MANAGE), вызывается автоматически в конце **обеих** цепочек пересчёта: «Пересчитать план (N)» в таблице Товаров И «Сохранить и пересчитать» в модалке дней (§7.3) — day-overrides не рассинхронизируют предложения с планом. Транзакция: `deleteMany({status: "SUGGESTED", source: "auto"})` + `createMany(новые)`. ACCEPTED/DISMISSED/CONVERTED/manual неприкосновенны. DISMISSED с совпадающим `(productId, orderDate ± 14 дней)` подавляет повторное авто-предложение.
- **Участие в плане:** SUGGESTED + ACCEPTED учитываются в arrivals сразу (opt-out). Пользователь видит план «как если бы заказывали вовремя» и точечно отклоняет. DISMISSED → приход исключается, план товара честно проседает, `lostRub` показывает цену решения.
- **Три состояния товара в плане:** (1) сток + реальные приходы покрывают уровень → план = уровень; (2) виртуальная успевает → план = уровень, виден виртуальный приход; (3) виртуальная физически не успевает (orderDate clamp'нут к today, arrival позже пробоя) → план проседает в окне `[пробой; приход]`, строка подсвечена «поздний заказ». Уровень никогда не удерживается без материализованного прихода — иначе план/факт и ПДДС строились бы на несуществующем товаре.
- **Конвертация:** `convertVirtualPurchase(id)` (SALES MANAGE + PROCUREMENT MANAGE) → переход на `PurchaseModal` с префиллом (supplier, product, qty, unitPrice, `plannedArrivalDate = VP.expectedArrivalDate`) → после создания `status=CONVERTED, convertedPurchaseId`; приход дальше идёт от реальной Purchase (двойного счёта в драфте нет — аналог исключения WAREHOUSE-этапа в балансе). Для уже зафиксированных версий анти-двойной счёт обеспечивает live-сверка статусов в pdds-feed (§8).
- **Ручное создание:** `source="manual", status="ACCEPTED"` сразу.

---

## 5. Факт продаж

- **Источник — только `WbCardFunnelDaily`, на лету.** Без новых таблиц, без снапшотов факта: funnel идемпотентно уточняется кроном 04:00 МСК (rolling 7d) — снапшот фиксировал бы заведомо недособранные выкупы. `WbCardOrdersDaily.qty` не использовать (underreport ~40%); её ценовые снапшоты полезны для конверсий.
- **Один кабинет WB (допущение):** funnel собирается одним токеном `getWbToken("WB_API_TOKEN")` (`lib/wb-funnel-api.ts:99`) — из пяти WB-токенов в БД факт покрывает ровно один кабинет. ИУ-сравнение «по всему кабинету» валидно, только если договор ИУ относится именно к этому кабинету (открытый вопрос №16). Мульти-кабинетный факт — вне v1.
- **Метрика для ИУ — рекомендация: выкупы (`buyoutsSumRub`), цены продавца до СПП.** Эмпирика прод-БД за июнь: выкупы 74.6 M ₽ = 2.49 M/день ≈ **104%** константы 2 380 805; заказы (7.41 M/день, 311%) и заказы−отмены (4.37 M/день, 184%) как таргет неправдоподобны. Подтверждение только эмпирическое — сверка с текстом договора ИУ обязательна (вопрос №1); до сверки подписи UI «отставание от ИУ» формулируются осторожно. Хедж: обе метрики в версии + `salesPlan.iuMetric` — переключение без пересчётов. Ценовая база funnel-₽ верифицирована join'ом (`ordersSumRub/ordersCount == sellerPrice`), но в разведке было противоречие — 10-минутная повторная проверка при исполнении обязательна.
- **Два разреза факта** (`loadFactDaily`): (а) **company-level** — `SUM(...) GROUP BY date` по ВСЕМ nmId напрямую (включая 73 непривязанных) — именно он сравнивается с ИУ (обязательство WB меряется по всему кабинету); (б) **product-level** — через `MarketplaceArticle` (канонический паттерн `lib/sales-forecast.ts:219-265`). Разница показывается строкой **«Вне плана»** — суммы всегда сходятся. **Масштаб «Вне плана» зависит от метрики** (проверено против прод-БД, июнь): по выкупам (default `iuMetric=buyouts`) непривязанные дают 2 350 530 ₽/мес (**3.2%**); по заказам — 13 193 927 ₽/мес (~6%).
- **Settle-лаг:** дни `> today−7` в факте выкупов помечаются `factSettled=false` («предварительно», приглушённые бары); факт заказов надёжен уже за вчера.
- **Дособирать ничего не нужно** — funnel покрывает 01.07+ и продолжит собираться. Рекомендуемый неблокирующий патч: снять лимит «30 дней от today» (`MAX_DAYS=30`) в `app/api/wb-funnel-backfill/route.ts` (произвольные from/to; сам `fetchFunnelDaily` умеет окно ≤31 д) — страховка от даунтайма крона на длинном горизонте.

---

## 6. Фиксация и план/факт

### 6.1 Семантика версий

- **«Зафиксировать план»** = `fixSalesPlanVersion(label?, note?)` (SALES MANAGE): прогнать симуляцию драфта → транзакционно создать header + `createMany` строк чанками по 5 000. Immutable: нет action на UPDATE строк; операции — только create, `renamePlanVersion(id, label)`, `deleteSalesPlanVersion(id)` (каскад, с подтверждением), `setActiveSalesPlanVersion(id)`.
- **Прошлое не переписывается:** дни `< today` новой версии копируются из текущей активной версии (симуляция стартует от today и прошлого не знает). Версия всегда покрывает 01.07–31.12 целиком → накопительный план/факт YTD непрерывен и не подгоняется задним числом. **Первая версия:** для дней `[01.07 … дата первой фиксации − 1]` план = unconstrained `rate × buyoutPct × price` из месячных уровней (стартовые стоки на 01.07 не сохранены — ретро-симуляция невозможна). **Эта зона растёт с каждым днём до этапа 5** — поэтому: (а) этапы 3–5 деплоятся плотной серией (§9); (б) первую версию фиксировать **немедленно после деплоя этапа 5**; (в) до фиксации и в первой версии unconstrained-дни помечаются в UI бейджем «номинал (без сток-лимита)» — отклонения по ним читать с поправкой. Проговорено в открытом вопросе №7.
- **Активная версия** (`salesPlan.activeVersionId`) — baseline для план/факт по умолчанию. Селектор позволяет смотреть против любой версии и против черновика («дрейф»: насколько текущие правки уводят план от зафиксированного — считает `compareVersions`).
- **Авто-фиксация cron'ом 1-го числа** (kind="auto", через `app/api/cron/dispatch`) — заложена полем `kind`, в v1 не реализуется (открытый вопрос).

### 6.2 Формулы план/факт (`buildPlanFactReport` — pure, golden-тест)

Бакеты: `day | week (ISO) | month | quarter | halfyear | year` — общий `lib/date-buckets.ts` (в `lib/loan-math.ts` сейчас только day|week|month — quarter/halfyear/year добавляются при выносе). Все шесть бакетов доступны и в движке, и в UI: тулбар §7.2 даёт День|Неделя|Месяц|Квартал|Полугодие, «год» = колонка «Итог» (весь горизонт). Для каждого бакета и накопительно с 01.07:

- `план` = Σ `SalesPlanVersionDay` за бакет; для **незавершённого бакета — план на прошедшие дни (≤ вчера), pro-rata** — иначе текущий месяц перманентно «красный» (дневная детализация делает pro-rata точным, не линейным);
- `факт` = Σ funnel за те же дни; `отклонение ₽ = факт − план`; `отклонение % = (факт/план − 1) × 100`;
- **FAC (прогноз итога периода)**: primary `факт_накоп + план_остатка` (учитывает приходы/сезонность плана); secondary — линейный run-rate. `Отклонение на завершение = FAC − план_итога`.

ИУ-блок: `iuCum(d) = 2 380 805 × дней(start..min(d,end))`; KPI: `отставание от ИУ = факт_накоп − иу_накоп(вчера)` (₽ и в днях `/2 380 805`); `требуемый run-rate = (438 068 120 − факт_накоп) / оставшиеся_дни`; `план vs ИУ на завершение = план_итога − 438 068 120` — главный вопрос к драфту (если отрицательно — скейлить уровни/добавлять виртуальные закупки).

**Сшивка ряда «наш план»:** дни `< today` — активная версия; дни `≥ today` — версия либо live-драфт (по селектору). Если версий нет — номинал из monthLevels (подсвечивается бейджем «номинал»). Фильтрация версии по иерархии — через join к live Product; «Архивные товары» — по правилу §2.4.

---

## 7. UI

### 7.1 Информационная архитектура — три подроута-таба (паттерн CardsTabs/FinanceTabs)

| Роут | Таб | Назначение |
|---|---|---|
| `/sales-plan` | **Сводный** | План/факт/ИУ-матрица + KPI + график. Read-only витрина |
| `/sales-plan/products` | **Товары** | Помесячные уровни (редактирование), приходы, дневная детализация в модалке |
| `/sales-plan/purchases` | **Пора заказывать** `(N)` | Предложения виртуальных закупок: отклонить/править/конвертировать |

Новая ERP_SECTION не нужна (остаёмся в SALES). `components/layout/section-titles.ts`: добавить matches для `/sales-plan/products` и `/sales-plan/purchases` ВЫШЕ существующего `/^\/sales-plan/`.

**Глобальная шапка раздела** (все табы): `SalesPlanTabs` (`<Link prefetch={false}>`) + `PlanVersionBar` — native `<select>` версий («Рабочий план (черновик)» + версии по убыванию даты), `?version=` в URL; кнопка «Зафиксировать план» (Lock, MANAGE, только в черновике) → `FixPlanVersionDialog` (label, note, сводка «что фиксируется») → редирект на `?version=<newId>`. При просмотре версии — amber-баннер «Просмотр версии … Редактирование недоступно [Вернуться к рабочему плану]»; единый проп `readOnly = !canManage || Boolean(versionId)` гасит все инпуты.

### 7.2 Таб «Сводный»

Тулбар `PlanFactControls` (эволюция `components/credits/ScheduleControls.tsx`, всё в URL):

```
Разбивка: [ День | Неделя | Месяц | Квартал | Полугодие ]   Период: [01.07.2026]—[31.12.2026]
Пресеты: ( Тек. неделя )( Тек. месяц )( 3 мес )( Полугодие )   Метрика: [ Выкупы ₽ ▾ ]  [x] Нарастающим итогом
```

`?granularity=day|week|month|quarter|halfyear` (default month; day ограничен окном 62 дня с notice), `?from/to` (clamp в горизонт; guard `end ≥ today` снят), `?metric=buyouts-rub|buyouts-units|orders-rub|orders-units` (ИУ-строки только при buyouts-rub… при `iuMetric=orders` — при orders-rub), `?cumulative=1`. Колонка «Итог» = «в целом по году» (весь горизонт; year-бакет движка). Разбивка «Полугодие» при горизонте H2 даёт одну колонку = Итогу — оставлена для симметрии с требованием и под горизонты 2027+.

**KPI `PlanFactSummaryCards`** (5 карточек): Факт за период (+% от плана, цвет emerald/amber/red) · План за период (+версия) · ИУ-план за период (+«факт = X% ИУ») · Прогноз на 31.12 (FAC vs ИУ 438.1М) · **Отставание от ИУ нарастающим** (₽ + дни-эквивалент — главная «тревожная лампочка», крупнейшая типографика).

**График `PlanFactChart`** (recharts): Факт — bars; План — ступенчатая line; ИУ — dashed line (в накопительном режиме — наклонная прямая; «ножницы» факт/ИУ видны мгновенно). ReferenceLine «сегодня»; последние ~5 дней факта приглушены + легенда «выкупы дозаполняются 3–7 дней».

**Матрица `PlanFactMatrix`** (образец `components/credits/SummaryScheduleTable.tsx`; сплошные bg на sticky без `/NN`):

```
┌────────────────────────────┬───────────┬──────────┬─────┬──────────┬───────────┐
│ Показатель                 │ Июл*      │ Авг      │ ... │ Дек      │ Итог      │
├────────────────────────────┼───────────┼──────────┼─────┼──────────┼───────────┤
│ План, ₽                    │ 71,1 М    │ 76,4 М   │     │ 83,0 М   │ 452,1 М   │
│ Факт, ₽                    │ 7,1 М     │ —        │     │ —        │ 7,1 М     │
│ Отклонение, ₽              │ −0,2 М    │ —        │     │ —        │ −0,2 М    │
│ Отклонение, %              │ −2,7%     │ —        │     │ —        │ −2,7%     │
├────────────────────────────┼───────────┼──────────┼─────┼──────────┼───────────┤
│ ИУ-план, ₽                 │ 73,8 М    │ 73,8 М   │     │ 73,8 М   │ 438,1 М   │
│ Факт − ИУ, ₽               │ +0,3 М    │ —        │     │ +0,3 М   │ +0,3 М    │
│ Выполнение ИУ, %           │ 104%      │ —        │     │ —        │ 104%      │
│ ИУ нарастающим: откл., ₽   │ +0,3 М    │ —        │     │ —        │ +0,3 М    │
├────────────────────────────┼───────────┼──────────┼─────┼──────────┼───────────┤
│ ▸ Штуки (свёрнуто)  ▸ Заказы, ₽ (свёрнуто)  ▸ По направлениям (v1.1)           │
└────────────────────────────┴───────────┴──────────┴─────┴──────────┴───────────┘
* текущий бакет: факт по вчера, отклонение pro-rata (полный план месяца — в tooltip)
```

Каскадные фильтры (rename `SalesForecastFilters` → `SalesPlanFilters`) действуют на план/факт, но **ИУ-строки при активных фильтрах скрываются** с notice «ИУ сравнивается только с полным фактом компании». Футнот (текст зависит от метрики): при `buyouts` — «Факт включает 73 артикула WB без привязки (2,4 М ₽/мес по выкупам, 3,2%) — [настроить → /cards/wb]»; при `orders` — «…13,2 М ₽/мес по заказам (~6%)…».

### 7.3 Таб «Товары» — `ProductPlanTable`

Режим `?mode=compare|edit` (edit только MANAGE + черновик; **~624 инпута** (104 товара × 6 месяцев) рендерим только в edit). Sticky-left: Фото · SKU · Название · **Приходы**; скролл: Сток · Июл…Дек · Итог ₽. Итоговая строка — `sticky bottom-0 bg-muted` (сплошной). Сортировка — `PRODUCT_HIERARCHY_ORDER_BY`.

```
┌────┬─УКТ────┬─Название─────────┬─Приходы──────────────────┬Сток─┬──Июл*────┬──Авг─────┬ ... ┬──Итог───┐
│ IMG│ 000123 │ Куртка зимняя …  │ 📦 15.08 ×500  ◇ 20.09…  │ 320 │ П 1,24 М │ П 1,40 М │     │ 8,9 М   │
│    │        │                  │                          │     │ Ф 1,18 М │    —     │     │ Ф 1,18М │
│    │        │                  │                          │     │  −4,8%   │          │     │  −4,8%  │
│ IMG│ 000124 │ Пылесос …        │ ⚠ 20.09 ×1100 (авто)     │  95 │ П 0,80 М │ П 0,80 М⚠│     │ 4,8 М   │
└────┴────────┴──────────────────┴──────────────────────────┴─────┴──────────┴──────────┴─────┴─────────┘
```

- Ячейка месяца (compare): `П <₽>` + для прошедших/текущего `Ф <₽>` + % отклонения цветом. `⚠` = сток-ограничение (tooltip: «План 24,0 шт/д; реализуемо 17,3 — сток исчерпан 19.08; приход виртуальной 20.09») — визуальный мост «план ↔ закупки».
- Ячейка (edit): `Input [12,0] шт/д` + подпись `≈ 372 шт · 1,40М`; placeholder = baseline («авто 9,4»); ✕ сбрасывает на авто; маркер `•д` если в месяце есть дневные правки. **Bulk-drafts** (паттерн текущего SalesForecastTable): `drafts: Record<productId, Record<month, string>>` → «Пересчитать план (N)» → цепочка actions + `regenerateVirtualPurchases` + `router.refresh()`; «Отменить правки» чистит локально. Autosave отвергнут: правка плана — батчевая операция, требующая одного консистентного пересчёта.
- Тулбар: `ModelParamsBar` (collapsible: lead-times, страховой запас, покрытие, транзит) + кнопка **«Масштабировать месяц…»** (`scaleMonthLevels(month, factor)` — top-down подгон под ИУ без перебора 104 товаров). **Поведение для товаров с `targetOrdersPerDay = null`** (после bootstrap таких большинство): baseline **материализуется** — в `SalesPlanMonthLevel` записывается `baselineOrdersPerDay × factor` (снапшот baseline на момент масштабирования; иначе кнопка не масштабирует основную массу товаров и непригодна для подгона под ИУ). Диалог подтверждения показывает: «N товаров с ручным уровнем ×factor · M товаров с авто-уровнем будут материализованы (baseline × factor) · K дневных правок месяца не изменятся». Day-overrides месяца scale не трогает.
- Колонка «Приходы» — `IncomingBadges`: `📦 15.08 ×500` реальная (popover: поставщик, этап из `lib/purchase-stages.ts`, dateSource, ссылка на закупку) · `◇ 20.09 ×800` виртуальная ACCEPTED (dashed violet; popover: правка/убрать) · `⚠ 20.09 ×1100 (авто)` — SUGGESTED, **учтена в плане** (amber dashed; действия: подтвердить/изменить/убрать). Легенда — футер таблицы.

**Модалка `ProductPlanDialog`** (max-w-4xl, замена ProductForecastDialog), вкладки:

*«Дни»* (default) — требование «менять продажи в день»:

```
Куртка … · УКТ-000123     Месяц: [ Сентябрь ▾ ]   Уровень месяца: [ 12,0 ] шт/д   [Сбросить правки дней]
┌─Дата──┬─План шт─┬─План ₽──┬─Факт шт─┬─Факт ₽──┬─Откл──┬─Сток(расч)─┬─События───────────────────┐
│ Пн 01 │ [ 12 ]  │ 41 400  │ 14      │ 47 900  │ +16%  │ 320        │                           │
│ Сб 19 │ [ 20 ]* │ 69 000  │ —       │ —       │ —     │ 12         │                           │
│ Вс 20 │ [ 20 ]* │ 69 000  │ —       │ —       │ —     │ 0 ⚠        │ ⚠ сток исчерпан           │
│ Пн 21 │ [ 20 ]* │ 69 000  │ —       │ —       │ —     │ 780        │ ◇ приход 800 (виртуальная)│
├─Итог──┼─372─────┼─1,28 М──┼─25──────┼─85,3 К──┴───────┴────────────┴───────────────────────────┤
└──────────────────────────────────────────[ Отмена ]  [ Сохранить и пересчитать ]────────────────┘
```

`*` = дневной override. Данные дней — **лениво** через read server action `getProductPlanDays(productId, month, versionId?)` (возить 184 дня × 104 товара в RSC-payload — сотни килобайт лишнего; осознанное отступление от «всё в page»). Action возвращает не только дни, но и полный сериализуемый `ProductPlanInput` (arrivals, seedOrders, monthLevels, dayOverrides, параметры модели) — **realtime «Сток(расч)» при вводе пересчитывается на клиенте локальным запуском pure `simulateProductPlan`** (engine без prisma-зависимостей, импортируется в клиентский бандл). Кнопка **«Сохранить и пересчитать»** — цепочка `saveDayOverrides → regenerateVirtualPurchases → revalidatePath` (та же пост-обработка, что у «Пересчитать план (N)» — иначе day-overrides рассинхронизируют предложения виртуальных закупок с планом).

*«Параметры»* — плановая цена ₽ (per месяц), % выкупа (read-only + источник own/legacy/subcategory/global), сток WB/Иваново. *«График»* — bar-chart дней план vs факт + ReferenceLine приходов.

### 7.4 Таб «Пора заказывать» — `VirtualPurchasesTable`

Сегмент-фильтр `?status=suggested|accepted|dismissed|all` (default suggested) + каскадные фильтры + счётчики.

```
┌─УКТ────┬─Название──┬─Сток─┬─План шт/д─┬─Сток до──┬─Заказать до──┬─Кол-во──┬─Поставщик─┬─Срок──┬─Сумма───┬─Действия──────────────────────────┐
│ 000124 │ Пылесос … │  95  │ 8,0       │ 26.09 ⚠  │ 12.08 (45 д) │ [1 100] │ Ningbo T. │ 45 д  │ ¥52 800 │ [Подтвердить] [Изменить] [Убрать] │
│ 000131 │ Плед …    │ 210  │ 14,0      │ 03.10    │ 19.08 (45 д) │ [1 800] │ —  ⚠      │ 45 д* │ —       │ [Подтвердить] [Изменить] [Убрать] │
├─ Подтверждённые ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 000119 │ Куртка …  │ 320  │ 12,0      │ —        │ заказ 20.07  │ 800 ◇   │ Ningbo T. │ 45 д  │ ¥96 000 │ [Изменить] [Убрать] [→ Создать закупку] │
└────────┴───────────┴──────┴───────────┴──────────┴──────────────┴─────────┴───────────┴───────┴─────────┴───────────────────────────────────┘
* нет привязки поставщика — срок 45 д по умолчанию
```

«Сток до» — дата пробоя по симуляции **плана** (не текущей скорости — отличие от `/procurement/plan`); «Заказать до» — просроченная красным, дефолтная сортировка предложений. Групповые операции чекбоксами. Бейдж таба: SUGGESTED с «заказать до» в ближайшие 14 дней, красная точка при просроченных. `<details>` «Как формируются предложения» внизу. Кнопка `→ Создать закупку` → `/procurement/purchases?create=1&from-virtual=<id>` с префиллом `PurchaseModal`.

### 7.5 RBAC и конвенции

- Read: `requireSection("SALES")`. **Все write server actions — `requireSection("SALES","MANAGE")`** (фикс текущей дыры VIEW-write: `saveBaselineOverrides/savePriceOverrides/saveLeadTimes/clearBaselineOverrides` сейчас требуют только VIEW). `convertVirtualPurchase` — дополнительно `PROCUREMENT MANAGE`; `Purchase.plannedArrivalDate` редактируется в карточке закупки под `PROCUREMENT MANAGE`.
- `getSectionRole("SALES")` → `canManage` проп (паттерн /purchase-plan).
- Sticky-таблицы, каскадные фильтры, `PRODUCT_HIERARCHY_ORDER_BY`, native select, `prefetch={false}`, `tabular-nums`/`fmtRub`/`fmtAdaptive`, MSK-время, русский язык, `revalidatePath` на все три роута раздела (+ `/procurement/purchases` при конвертации) — по чек-листу CLAUDE.md.

### 7.6 Инвентарь файлов UI

Новые страницы: `app/(dashboard)/sales-plan/page.tsx` (переработка — Сводный), `app/(dashboard)/sales-plan/products/page.tsx`, `app/(dashboard)/sales-plan/purchases/page.tsx`.

Новые компоненты `components/sales-plan/`: `SalesPlanTabs`, `PlanVersionBar`, `FixPlanVersionDialog`, `PlanFactControls`, `PlanFactSummaryCards`, `PlanFactChart`, `PlanFactMatrix`, `ProductPlanTable`, `ProductPlanCell`, `ProductPlanDialog`, `IncomingBadges`, `VirtualPurchasesTable`, `VirtualPurchaseDialog`, `ModelParamsBar`, `SalesPlanFilters` (rename). Удаляются после миграции (этап 6): `SalesForecastTable`, `SalesForecastSummary` (вместе с `IU_REMAINING_RUB`), `SalesForecastDailyChart`, `SalesForecastEndDate`, `ProductForecastDialog`.

Actions `app/actions/sales-plan.ts` (переработка): `saveMonthLevels`, `scaleMonthLevels`, `saveDayOverrides`, `saveProductPlanParams`, `saveModelParams`, `regenerateVirtualPurchases`, `acceptVirtualPurchase`, `updateVirtualPurchase`, `dismissVirtualPurchase`, `convertVirtualPurchase`, `fixSalesPlanVersion`, `renamePlanVersion`, `setActiveSalesPlanVersion`, `deleteSalesPlanVersion`, `updateIuTargets`, `getProductPlanDays` (read).

---

## 8. Стыковка с будущим ПДДС

Модуль `lib/sales-plan/pdds-feed.ts` пишется в этой фазе, потребляется фазой ПДДС (`/finance/cashflow` — сейчас ComingSoon, легаси-ограничений нет). Разделение: **pure-ядро** (формулы платежей) + **loader-обёртка** (Prisma: live-статусы VP, курсы валют).

```ts
// 1. Притоки: дневной (не месячный!) ряд плановых выкупов от зафиксированной версии.
//    Дни обязательны: выплаты WB недельные (wbCashDay из lib/finance-model/engine.ts:
//    понедельник-отчёт + N недель) — ре-бакетирование по неделям выплат из месяцев невозможно.
export async function getPlannedRevenueSeries(db: PrismaClient, versionId: string): Promise<Array<{
  date: string
  buyoutsRub: number; buyoutsUnits: number
  byProduct: Array<{ productId: string; rub: number; units: number; priceUsed: number; buyoutPctUsed: number }>
}>>

// 2a. PURE-ядро: платежи одной VP в валюте закупки, БЕЗ создания PurchasePayment-строк
//     (виртуальное не попадает в реальный платёжный контур).
export function buildVirtualPurchasePayments(vpSnapshot): Array<{
  type: "DEPOSIT" | "BALANCE"; dueDate: string; amount: number; currency: string
}>
// DEPOSIT: orderDate + 3 (computeDepositDueDate); BALANCE: депозит + leadTime (computeBalanceDueDate)
// — формулы lib/procurement-math.ts; depositPct/balancePct fallback 30/70.

// 2b. LOADER: оттоки всех VP версии — из paramsJson СО СВЕРКОЙ live-статусов (анти-двойной счёт).
export async function getPlannedVirtualPayments(db: PrismaClient, versionId: string): Promise<...>
```

**Анти-двойной счёт (правило сверки, закрывает главную дыру):** `paramsJson` версии — immutable снапшот, но статусы VP живут дальше. `getPlannedVirtualPayments` обязан: (1) прочитать список VP-снапшотов из `paramsJson` (они самодостаточны: qty, даты, unitPrice, currency, depositPct/balancePct); (2) сверить их `id` с live `VirtualPurchase`: **`CONVERTED` → платежи исключаются** (их место заняли реальные `PurchasePayment(PLANNED)` созданной Purchase — иначе двойной отток); **`DISMISSED`-после-фиксации → платежи тоже исключаются** (заказа не будет; выручка версии при этом всё ещё содержит их приходы — версия устарела, UI ПДДС показывает предупреждение «N виртуальных закупок версии изменили статус — рекомендуется перефиксация плана»); (3) **id не найден live** (авто-SUGGESTED удалена регенерацией) → платежи считаются по snapshot-данным из paramsJson (отсутствие = регенерация драфта, не отмена намерения версии).

**Конвертация валюты (правило задано явно):** pure-ядро возвращает `amount` в валюте закупки (CNY/USD); конвертация в ₽ — обязанность loader-обёртки через `getRateForDate` (`lib/balance-data.ts`, Prisma-coupled — поэтому и вынесена из pure-ядра). `CurrencyRate` — forward-only исторический, курса на будущие `dueDate` не существует → правило: **последний известный курс ≤ dueDate; для будущих дат это фактически последний известный курс вообще (forward-fill)**. Опциональный плановый курс (`salesPlan.planCnyRate`) — решение фазы ПДДС, интерфейс loader'а его допускает.

Что ПДДС получает готовым: (1) притоки — `plannedBuyoutsRub` по дням; net-to-seller ПДДС пересчитывает сам через `lib/pricing-math.ts` (связка productId→nmId сохранена в строках версии; % к перечислению в версию НЕ пишем — дублирование = рассинхрон с pricing-контуром); (2) оттоки-план — реальные `PurchasePayment(status=PLANNED).dueDate` (уже есть) + `getPlannedVirtualPayments` с live-сверкой; (3) налоги — плановая база `plannedBuyoutsRub` по кварталам → готовая `computeQuarterAccrual` (`lib/balance-math.ts`); (4) кредиты (`LoanPayment` — полный график в БД), банк/касса — уже есть. Версия — адресуемая сущность: ПДДС строится «от версии N», включая её виртуальные закупки из `paramsJson`.

---

## 9. Поэтапный план внедрения (каждый этап деплоябелен самостоятельно)

Этапы 3–5 деплоить **плотной серией**: до этапа 5 план для прошедших дней = unconstrained номинал (§6.1), зона искажения растёт ежедневно — первую версию зафиксировать в день деплоя этапа 5.

### Этап 1 — Фундамент: схема + движок (невидимый деплой)
- Миграция `20260705_sales_plan_v2` (все таблицы, enum, `Purchase.plannedArrivalDate`, back-relations Product/Supplier/User, сид AppSetting).
- `lib/sales-plan/{types,dates,engine,arrivals,iu,data}.ts` + `lib/date-buckets.ts` (вынос из loan-math + quarter/halfyear/year, loan-math переключён).
- Тесты: engine golden, arrivals (включая TRANSIT null/сплит), iu (438 068 120 ₽), date-buckets.
- `scripts/bootstrap-sales-plan-monthly.ts`: baselineOverrides/priceOverrides → monthLevels; `plannedSalesPerDay` — только с месяца `ProductIncoming.expectedDate` (§2.7); **старый `salesPlan.leadTimes` → `salesPlan.leadTimes2`**. Запуск на проде после деплоя.
- 10-минутная эмпирическая проверка ценовой базы funnel (join funnel × orders-daily).
- **Деливерабл:** данные и движок в проде, старый UI работает без изменений.

### Этап 2 — Таб «Товары»: рабочий инструмент планирования
- `/sales-plan/products` + `SalesPlanTabs` + `ProductPlanTable/Cell` + `ProductPlanDialog` (Дни/Параметры/График, `getProductPlanDays` с клиентским realtime-пересчётом) + `ModelParamsBar` + `IncomingBadges` (пока только реальные закупки 📦) + `SalesPlanFilters`.
- Actions: `saveMonthLevels`, `scaleMonthLevels` (с материализацией baseline, §7.3), `saveDayOverrides`, `saveProductPlanParams`, `saveModelParams` — все SALES MANAGE. **Перед деплоем: проверить `UserSectionRole` по SALES** (у кого VIEW → отвалится запись; выдать MANAGE + напомнить о перелогине, JWT).
- Поле «Плановая дата прихода» в карточке закупки (`/procurement/purchases/[id]`, PROCUREMENT MANAGE) + resolver дат в действии.
- **Прод-задача после деплоя: вручную заполнить `plannedArrivalDate` по всем открытым закупкам** — иначе почти все партии останутся на эвристике `leadtime-eta` (риск №10).
- **Деливерабл:** помесячный план per товар редактируется, симуляция с мульти-партийными приходами, факт per месяц в ячейках. Старый `/sales-plan` ещё жив как «Сводный»-заглушка.

### Этап 3 — Таб «Сводный»: план/факт/ИУ
- Переработка `app/(dashboard)/sales-plan/page.tsx`: `PlanFactControls` (5 разбивок), `PlanFactSummaryCards`, `PlanFactChart`, `PlanFactMatrix`; `lib/sales-plan/plan-fact.ts` + `loadFactDaily` + тесты plan-fact.
- ИУ из `salesPlan.iuTargets`; строка «Вне плана»; pro-rata; FAC; снятие guard `end ≥ today`. Прошедшие дни до первой фиксации — бейдж «номинал (без сток-лимита)».
- **Деливерабл:** три ряда (план-драфт/факт/ИУ) по всем бакетам и за горизонт. Требования 1–3, 7 (просмотр) закрыты.

### Этап 4 — Виртуальные закупки
- `lib/sales-plan/virtual-purchases.ts` + тесты; таб `/sales-plan/purchases` (`VirtualPurchasesTable/Dialog`), бейджи ◇/⚠ в Товарах, включение SUGGESTED+ACCEPTED в arrivals.
- Actions: `regenerateVirtualPurchases` (встроить в обе цепочки пересчёта: bulk-таблица И «Сохранить и пересчитать» модалки), `accept/update/dismissVirtualPurchase`, `convertVirtualPurchase` + префилл `PurchaseModal` (`?create=1&from-virtual=`).
- Замер на проде (VPS 2GB): полная цепочка «Пересчитать план» = симуляция 104 товаров + до 6 итераций suggester'а per товар + revalidatePath трёх роутов (риск №11).
- **Деливерабл:** требование 6 закрыто; план учитывает «как если бы заказывали вовремя».

### Этап 5 — Версионирование
- `fixSalesPlanVersion` (чанки 5 000), `PlanVersionBar`, `FixPlanVersionDialog`, `setActive/rename/deletePlanVersion`, `compareVersions` («дрейф»), `?version=` во всех табах, read-only режим версии; план/факт переключается на активную версию; группа «Архивные товары» при фильтрации версии (§2.4).
- **Деливерабл:** требование 7 (фиксация) закрыто; **первая версия зафиксирована в день деплоя** (минимизация unconstrained-зоны прошлого, §6.1).

### Этап 6 — ПДДС-feed + зачистка
- `lib/sales-plan/pdds-feed.ts` (pure-ядро + loader с live-сверкой статусов и forward-fill курса) + тесты; патч `wb-funnel-backfill` (произвольные from/to).
- Удаление старых компонентов (`SalesForecast*`, `ProductForecastDialog`), хардкодов (`IU_REMAINING_RUB`, `DEFAULT_END_DATE`), старых AppSetting-ключей и старого `computeForecast`-пути; deprecate `/purchase-plan` и `/procurement/plan` (снятие из sidebar — отдельное решение с пользователем).
- **Деливерабл:** требование 8 (контракт ПДДС) закрыт, кодовая база без дублей.

Каждый этап: миграции аддитивны, деплой по правилам CLAUDE.md (push → nohup deploy.sh → curl 200), тесты `npm run test` зелёные.

---

## 10. Риски

1. **Метрика/база ИУ не подтверждены документально.** Эмпирика (выкупы июня = 104.5% константы) убедительна, но договор ИУ не сверен — подписи UI и вся коммуникация «отставание от ИУ» блокируются до подтверждения. Митигация: обе метрики в версии + `iuMetric`-переключатель — смена решения без пересчёта данных. Блокирует только подписи UI, не архитектуру.
2. **Качество дат приходов** — `plannedArrivalDate` ручной, fallback-и эвристичны (leadTime 45, транзит 20). Митигация: тег `dateSource` на каждой партии, UI показывает происхождение даты — деградация видима, не молчалива.
3. **Funnel «плывёт» 3–7 дней** — свежий факт занижен. Митигация: `factSettled`-флаг, приглушение в UI, дубль-KPI «закрытый факт до today−7». Даунтайм крона >30 дней — патч backfill (этап 6, можно раньше).
4. **73 непривязанных nmId** — план per товар систематически ниже факта компании: по выкупам (default-метрика) 2.35 M ₽/мес (**3.2%**), по заказам 13.2 M ₽/мес (~6%). Митигация: строка «Вне плана» (суммы сходятся) + метрико-зависимый футнот-ссылка на привязку; постепенная привязка в /cards/wb.
5. **Opt-out виртуальных закупок** может создать иллюзию исполнимости плана при систематическом неразмещении реальных заказов. Риск усиливается тем, что план/факт по умолчанию меряется против версии, включающей VP: неразмещение проявится только в будущем факте, `lostRub` виден лишь при явном DISMISSED. Митигация: таб «Пора заказывать» с сортировкой по просроченности + красная точка на бейдже + `lostRub` при отклонении + KPI «просроченные заказы» как ранний индикатор (просроченный orderDate SUGGESTED/ACCEPTED = план уже нереализуем).
6. **Двойной счёт приходов/платежей** при конвертации VP → Purchase. Митигация в драфте: CONVERTED исключён из arrivals структурно; конвертация префиллит `plannedArrivalDate` — партия бесшовно переезжает в реальный контур. Митигация для зафиксированных версий (ПДДС): live-сверка статусов в `getPlannedVirtualPayments` (§8) — CONVERTED/DISMISSED исключаются из виртуальных платежей + предупреждение «версия устарела».
7. **История lead time тонкая** (~1 месяц Phase 20, даты этапов частично ретроспективны/null) — на старте почти все партии реальных закупок будут `dateSource="leadtime-eta"` (эвристика createdAt+45, не план), точность требования 4 в первые месяцы низкая. Митигация: обязательное ручное заполнение `plannedArrivalDate` по открытым закупкам (прод-задача этапа 2), dateSource-тег в UI; историческая калибровка leadTime — enhancement.
8. **Объём версий** (~19 тыс. строк/фиксация) — при частой фиксации умеренный рост БД. Митигация: индексы заложены, ручное удаление версий; retention-политика не нужна в v1.
9. **RBAC-миграция** — поднятие write до MANAGE может отрезать пользователей с VIEW. Митигация: проверить `UserSectionRole` по SALES перед деплоем этапа 2; напомнить о перелогине (JWT не самообновляется).
10. **Unconstrained-зона прошлого до первой фиксации** — между этапами 3 и 5 план прошедших дней = номинал без сток-лимита, отклонения искусственно красные, зона растёт ежедневно; первая версия закрепляет номинал для `[01.07; дата фиксации)` навсегда. Митигация: этапы 3–5 плотной серией, фиксация первой версии в день деплоя этапа 5, бейдж «номинал (без сток-лимита)» на затронутых днях (§6.1, вопрос №7).
11. **Производительность цепочки пересчёта на VPS 2GB** — черновик пересчитывается на каждый request (104 товара × ~200 дней — ок), но `regenerateVirtualPurchases` (до 6 итераций симуляции per товар) в конце каждого «Пересчитать план»/«Сохранить и пересчитать» + revalidatePath трёх роутов — замерить на проде в этапе 4; при необходимости — регенерация только затронутых товаров (diff по productId из drafts).
12. **Один кабинет WB в факте** — funnel собирается токеном `WB_API_TOKEN`; если договор ИУ покрывает другой/несколько кабинетов, сравнение с ИУ некорректно. Митигация: допущение зафиксировано (§1.1, §5), открытый вопрос №16; мульти-кабинетный сбор funnel — отдельная фаза при необходимости.
13. **Интерпретация «в целом по году»** — принята как «итог по горизонту 01.07–31.12». Если пользователь имел в виду календарный 2026 с фактом января–июня — funnel существует только с 2026-04-21, январь–апрель невосстановимы из funnel (потребуется другой источник — WB Statistics sales или ручной ввод). Митигация: открытый вопрос №17 до этапа 3.

---

## 11. Открытые вопросы пользователю (консолидировано, с рекомендациями по умолчанию)

1. **Метрика ИУ:** план 2 380 805 ₽/день меряется по ВЫКУПАМ в ₽ (цены продавца, до СПП)? Эмпирика июня: выкупы 2.49 M/день ≈ 104% константы; заказы 7.41 M/день (311%) неправдоподобны. Сверить с текстом договора ИУ — до сверки формулировки «отставание от ИУ» условны. **Default: выкупы, до СПП** (переключатель `iuMetric` заложен).
2. **Единица планирования:** помесячный уровень задаётся как «заказы шт/день» per товар (UI показывает пересчёт в шт/₽ за месяц)? **Default: шт/день** — непрерывно с текущим UX и необходимо виртуальным закупкам.
3. **Виртуальные закупки opt-out:** авто-предложения (SUGGESTED) учитываются в плане сразу, пользователь точечно отклоняет? Альтернатива (opt-in) делает дефолтный план нулевым на стокаутах. **Default: opt-out.**
4. **Дефолты параметров:** страховой запас 14 дн, покрытие закупки 60 дн, lead time fallback 45 дн (заказ→Иваново), транзит после этапа TRANSIT 20 дн, лаг Иваново→WB 0 дн. **Default: как перечислено**, всё редактируемо в ModelParamsBar.
5. **`Purchase.plannedArrivalDate`:** добавить ручную плановую дату прихода per закупка (prefill createdAt + leadTime)? Без неё приходы реальных закупок остаются на эвристике — на старте почти все даты будут расчётными (createdAt+45); после деплоя этапа 2 нужно вручную заполнить даты по открытым закупкам. **Default: добавить + заполнить.**
6. **73 непривязанных nmId** (по выкупам 2.35 M ₽/мес = 3.2%; по заказам 13.2 M ₽/мес ≈ 6%): привязывать к товарам до запуска или оставить строкой «Вне плана»? **Default: строка «Вне плана» + постепенная привязка** (ИУ-сравнение в любом случае по всему кабинету).
7. **План на прошедшие дни в первой версии:** для дней `[01.07 … дата первой фиксации)` план = unconstrained `ставка × % × цена` без сток-лимита (ретро-симуляция стока невозможна), и эта зона растёт до деплоя этапа 5 — поэтому этапы 3–5 деплоятся плотной серией и первая версия фиксируется в день деплоя этапа 5; затронутые дни помечаются «номинал». Приемлемо? **Default: да.**
8. **Ряд «План» в отчётах = реализуемый** (сток-ограниченный), «задано vs реализуемо» показывается ⚠ + lostRub? Альтернатива — план «как задано». **Default: реализуемый** — иначе план маскирует потребность в закупках.
9. **Дефолт сравнения план/факт:** активная зафиксированная версия (черновик — по выбору в селекторе)? **Default: активная версия;** до первой фиксации — черновик.
10. **Авто-фиксация версии cron'ом 1-го числа месяца** (kind=auto): нужна в v1? **Default: нет** (поле заложено, дисциплина ручной фиксации).
11. **Ramp-up после прихода из OOS** (3 раб. дня разгона): в новом движке убран. Вернуть как автоматику? **Default: не возвращать в v1** (day-overrides покрывают).
12. **Судьба `/purchase-plan` («временный») и `/procurement/plan`:** функционально поглощаются табами Товары и Пора заказывать. Деприкейтить в этапе 6? **Default: да, снятие из sidebar — после недели параллельной работы.**
13. **RBAC:** поднять все write-actions плана до SALES MANAGE (сейчас хватает VIEW)? Проверить, что у нужных пользователей есть MANAGE (перелогин после выдачи). **Default: поднять.**
14. **Day-разбивка на Сводном ограничена окном 62 дня** (guard от 184 колонок) — приемлемо? **Default: да.**
15. **Diff-режим «черновик vs версия»** сверх суммарного «дрейфа» — нужен в v1? **Default: нет** (compareVersions заложен, полный UI-diff позже).
16. **Кабинет ИУ:** договор ИУ (2 380 805 ₽/день) относится к кабинету WB, чей токен = `WB_API_TOKEN` (единственный источник funnel-факта)? Если ИУ покрывает другой кабинет или несколько — сравнение с фактом некорректно и потребуется мульти-кабинетный сбор funnel. **Default: считаем, что относится к этому кабинету** (сверить при подтверждении метрики, вопрос №1).
17. **Интерпретация «в целом по году»:** колонка «Итог» = итог горизонта 01.07–31.12.2026. Если нужен календарный 2026 с фактом января–июня — funnel есть только с 21.04.2026, январь–апрель придётся брать из другого источника (WB Statistics sales / ручной ввод) — отдельная работа. **Default: итог = горизонт H2.**
18. **Company-level правка дня:** поднять план конкретного дня сразу по всем товарам (день распродажи) сейчас можно только через модалки per товар или масштабирование месяца. Нужен инструмент «Масштабировать день…» (`scaleDayOverrides(date, factor)` по образцу scaleMonthLevels)? **Default: не в v1** (кандидат v1.1; архитектура day-overrides его допускает без изменений схемы).
---

## Validation Architecture

Стратегия проверки — pure-функции движка тестируются golden-тестами vitest (канон `tests/pricing-math.test.ts`); UI и sync — ручной UAT. Проект уже использует vitest (`npm run test`).

**Wave 0 (тестовая инфраструктура):** vitest установлен (Phase 7). Новые тест-файлы создаются как RED-стабы в первом этапе, затем доводятся до GREEN по мере реализации движка.

**Автоматизированное покрытие (vitest, детерминированное):**
- `tests/sales-plan-engine.test.ts` — golden: уровень месяца + day override + 2 партии прихода → дневной ряд `toBeCloseTo`; сток-лимит; T+3 выкупы / T+6 возвраты; ступенька между месяцами; zero-guards. (SP-02, SP-03, SP-04)
- `tests/sales-plan-arrivals.test.ts` — `resolveArrivalBatches()`: все 5 уровней fallback-цепочки + `dateSource`-тег + сплит частичного TRANSIT + TRANSIT с `date=null` + `createdAt+45` дефолт. (SP-05)
- `tests/sales-plan-iu.test.ts` — `iuTotalForRange("2026-07-01","2026-12-31") === 438_068_120`; границы периодов; мульти-периоды `iuTargets`. (SP-06)
- `tests/sales-plan-plan-fact.test.ts` — бакетирование day/week/month/quarter/halfyear/year (`lib/date-buckets.ts`); deviation ₽/%; pro-rata незавершённого бакета; `factSettled`; строка «Вне плана». (SP-07, SP-10)
- `tests/sales-plan-virtual.test.ts` — `suggestVirtualPurchases()`: триггер пробоя страхового запаса; qty на покрытие; clamp orderDate к today; итеративный roll-forward; minQty. (SP-08)
- `tests/sales-plan-pdds-feed.test.ts` — платежи VP DEPOSIT/BALANCE; исключение CONVERTED/DISMISSED по live-статусу; forward-fill курса; fallback на snapshot для отсутствующих id. (SP-09, SP-12)
- `tests/date-buckets.test.ts` — вынос из loan-math + добавленные quarter/halfyear/year бакеты. (SP-02)

**Ручной UAT (manual-only):** редактирование уровней и правка дня в UI с realtime-пересчётом (SP-04); синхронизация факта из funnel и рендер трёх рядов (SP-06, SP-10); генерация/отклонение/конвертация виртуальных закупок (SP-08, SP-09); фиксация версии и read-only просмотр (SP-11); RBAC — write требует SALES MANAGE (SP-13); деплой миграции + bootstrap-скрипт на проде (SP-01, SP-14).

**Sampling:** `npm run test` (quick) после каждого task-коммита движка; полный прогон перед деплоем каждого этапа. Golden-значение ИУ 438 068 120 ₽ и формулы engine — регрессионные якоря.
