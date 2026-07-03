# Phase 24: Финансовая отчётность — Баланс (управленческий учёт) - Research

**Researched:** 2026-07-02
**Domain:** Next.js/Prisma management-accounting report (balance sheet) over existing ERP data + new WB Finance API client
**Confidence:** HIGH (все ключевые точки интеграции найдены в текущем коде с точными сигнатурами; MEDIUM только там, где отмечено — WB Finance API живой ответ не протестирован против прод-БД по требованию пользователя)

> ⚠ Пользователь запретил коммитить артефакты этой фазы до завершения параллельной разработки (2026-07-02). Это исследование НЕ было закоммичено — только записан файл.
> ⚠ Прод-БД не трогалась, SSH на VPS не использовался (по ограничению задания). Все факты о состоянии данных (например «WbCardFunnelDaily с 01.04.2026») взяты из CONTEXT.md canonical_refs как заданные — не переверифицированы.

## Summary

Phase 24 не требует нового технологического стека — это композиция существующих Prisma-моделей и helper'ов проекта в один RSC-отчёт с дельта-сравнением дат. Всё критичное для планирования уже присутствует в кодовой базе как готовые паттерны: `computeLoanAggregates(amount, payments, asOf)` для кредитов на дату, `currentStageOf(reachedStages)` для границы аванс/в-пути закупок, `startOfQuarterMsk()` для налоговых периодов, cron-диспетчер `app/api/cron/dispatch/route.ts` для регистрации нового 06:00-снапшота без нового systemd-таймера, и полностью data-driven WB-токен CRUD (`lib/wb-token.ts` + `lib/wb-token-validate.ts` + `app/actions/wb-tokens.ts`), требующий добавления ровно 4 записей для нового `WB_FINANCE_TOKEN`.

Два новых Prisma-модели нужны для снапшотов (D-01): дневной снимок товарных остатков per Product × локация (qty + costPriceAtDate) и дневной снимок дебиторки WB (Balance API ответ + хвост недели). Три вспомогательные модели — ручные корректировочные статьи (D-08), фактические налоговые корректировки per квартал (D-17) — полностью новый дизайн, паттернов-аналогов в проекте нет. Остальные статьи баланса (банк, касса, кредиты, авансы поставщикам, налоги расчётные) вычисляются "на лету" на дату X, используя `date <= X` фильтры и существующие helper'ы; ключевой рабочий момент — ни один из существующих helper'ов **не считает "остаток на прошлую дату"** для банка (только anchor = MAX(balanceDate)), и точечный по дате курс валюты ЦБ РФ тоже отсутствует (есть только `getLatestRate` = последний известный курс). Оба требуют новой, но тривиальной логики (не library-uses-needed, просто новый query pattern).

Единственная реальная неопределённость — точность налоговой базы: `CashCategory` "Налоги/банк/сборы" смешивает налоги с банковскими комиссиями и госпошлинами (не чистая категория), а `BankTransaction.category=TAX` заполняется вручную пользователем через inline-дропдаун (нет авто-категоризации при импорте) — если прошлые налоговые платежи не размечены, D-16 вычитание "уплаченного" занизится и обязательство завысится. Это стоит явно показать в UI как допущение, а не пытаться решить кодом.

**Primary recommendation:** Строить Баланс как RSC-агрегатор поверх существующих таблиц + 2 новых cron-заполняемых снапшот-таблицы (остатки, дебиторка WB) + 2 новых ручных reference-таблицы (корректировки, налоговые факты); переиспользовать `computeLoanAggregates`/`currentStageOf`/`startOfQuarterMsk` as-is; писать `lib/balance-math.ts` как pure function (паттерн `pricing-math.ts`/`loan-math.ts`) для тестируемости расчёта Капитала и налогового обязательства.

## User Constraints

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: Гибридная архитектура.** Ежедневные снапшоты ТОЛЬКО для статей без истории: (а) товарные остатки — новая snapshot-таблица с количеством И себестоимостью на дату; (б) дебиторка WB — снапшот ответа Balance API + хвост. Все остальные статьи (банк, касса, кредиты, авансы поставщикам, налоги) вычисляются НА ЛЕТУ на любую дату из транзакционных данных (`date <= X`).
- **D-02: Момент среза — «утром за вчера».** Cron ~06:00 МСК (после ночных WB-sync) фиксирует состояние на конец вчерашнего дня. «Баланс на 01.07» = состояние на конец дня 30.06 / начало 01.07 (как в бухгалтерии).
- **D-03: История с 01.07.2026, без ретроспективы.** Первый снапшот — баланс на 01.07. Прошлые даты не восстанавливаются.
- **D-04: Кнопка «Пересчитать дату».** Для выбранной даты: переоценивает зафиксированные количества остатков по обновлённой себестоимости + пересобирает ретро-вычислимые статьи (касса/кредиты/банк/авансы/налоги — они и так live, но если появится кэш — сброс). Количества в снапшоте неизменяемы (их не восстановить задним числом).
- **D-05: Консолидированный баланс** по всей группе компаний. Разрез по компаниям — deferred (касса, товары, закупки, дебиторка WB не привязаны к Company).
- **D-06: Вертикальная таблица:** Активы (разделы с подытогами) → Пассивы → строка «Капитал» = Активы − Пассивы (балансирующая статья).
- **D-07: Состав статей:**
  - АКТИВЫ: Денежные средства (банк — по счетам/валютам, касса) · Дебиторка WB · Запасы (склады WB / WB в пути к клиенту / WB в пути от клиента / склад Иваново / товар в пути из Китая) · Авансы поставщикам
  - ПАССИВЫ: Кредиты и займы · Налоговые обязательства
  - КАПИТАЛ: вычисляемая балансирующая строка
- **D-08: Ручные корректировочные статьи.** Пользователь может добавлять произвольные статьи (актив или пассив) с ручным вводом суммы, действующей с даты (например «Займы выданные», «Прочая дебиторка»). CRUD в UI раздела.
- **D-09: Две даты + дельта.** Выбранная дата + дата сравнения (default — начало месяца) + колонка изменения ₽/%.
- **D-10: Складские остатки (WB + Иваново): кол-во × текущая `ProductCost.costPrice` (₽).** Снапшот хранит и qty, и costPrice на момент среза; кнопка D-04 переоценивает qty по свежей себестоимости.
- **D-11: Товары без себестоимости** — отдельная строка «Без оценки: N товаров, M шт» с предупреждением и расшифровкой (списком товаров). Баланс явно показывает неполноту.
- **D-12: Закупки из Китая — по фактически уплаченному (кассовая оценка).** Все PAID-платежи по незавершённым закупкам (₽ по курсу на дату платежа): этапы до Отгрузки → статья «Авансы поставщикам»; Отгрузка / В пути (SHIPMENT, TRANSIT) → статья «Товар в пути из Китая». Граница по `currentStageOf()` из `lib/purchase-stages.ts`. Без кредиторки поставщикам и без валютной переоценки в v1.
- **D-13: WB «в пути к клиенту / от клиента»** (`WbCard.inWayToClient/inWayFromClient`) — включаются в Запасы отдельными подстроками, оцениваются по себестоимости (D-10).
- **D-14: Дебиторка WB — двухслойная схема:**
  1. Ежедневный снапшот `GET finance-api.wildberries.ru/api/v1/account/balance` → `current` + `for_withdraw` (официальный баланс по закрытым отчётам). Rate limit 1 req/мин.
  2. Хвост текущей недели: Σ `forPay` из `GET statistics-api.wildberries.ru/api/v1/supplier/sales` за незакрытую отчётную неделю (с понедельника).
  - Дебиторка на дату = balance.current + хвост. Требуется НОВЫЙ токен со scope «Финансы» (бит 13 официальной таблицы) — выпускает пользователь в ЛК WB; инфраструктура `WbApiToken` уже поддерживает. НЕ строить на `reportDetailByPeriod` — deprecated, удаляется 15.07.2026.
- **D-15: Налоговая база = выкупы WB по дням:** Σ `WbCardFunnelDaily.buyoutsSumRub` (данные с 01.04.2026, обновляются ежедневно). Ставки 7% НДС + 1% налог на доходы (УСН 15% Д−Р, бухгалтерия выводит на 1%) — хранить как редактируемые настройки (AppSetting), не хардкод.
- **D-16: Накопление обязательства — квартал минус уплаченное.** Обязательство на дату X = (7%+1%) × база с начала квартала до X − уплаченные налоги за этот период (BankTransaction `category=TAX` + аналогичная категория кассы) + незакрытые обязательства прошлых кварталов.
- **D-17: Корректировка бухгалтерии — факт per период перекрывает расчёт.** Форма ввода фактических сумм НДС и налога для закрытого периода (квартала); введённый факт заменяет расчётную цифру в балансе. Текущий (незакрытый) период всегда расчётный.

### Claude's Discretion

- **Гранулярность снапшота остатков:** рекомендуется per Product × локация (WB склады агрегированно / WB в пути к клиенту / WB в пути от клиента / Иваново) с полями qty + costPriceAtDate — даёт расшифровку статей и переоценку; точный дизайн таблиц — на планирование.
- **UI-размещение:** новый раздел «Финансы» `/finance/balance`, новый `ERP_SECTION.FINANCE`, полный чеклист из 6 пунктов CLAUDE.md (включая `SECTION_OPTIONS`!). Таб-навигация Баланс | ОДДС | ОПиУ (два последних — ComingSoon-заглушки под будущие фазы), паттерн `CardsTabs/PricesTabs`.
- **RBAC:** чтение = `requireSection("FINANCE")`, write-операции (пересчёт, корректировки, ручные статьи, настройки ставок) = `requireSection("FINANCE", "MANAGE")`.
- **Rate-limit защита Finance API:** cooldown-bucket по паттерну `lib/wb-cooldown.ts` (bucket 'finance'), retryFetch backoff.
- **Формат ₽:** ru-RU, пробел-тысячи, ₽; `Decimal(14,2)` для новых денежных полей (паттерн проекта); `Number(decimal)` на RSC→client границе.

### Deferred Ideas (OUT OF SCOPE)

- **ОДДС (отчёт о движении денежных средств)** — следующая фаза; `TxCategory` в банке уже создан под него (Phase 22)
- **ОПиУ (прибыли и убытки)** за период + прогноз на основе плана продаж — фаза после ОДДС
- **Разрез баланса по компаниям группы** — требует привязки кассы/закупок/товаров к Company
- **Точная дебиторка WB (слой 3):** еженедельная загрузка отчётов реализации `finance/v1/sales-reports` + сверка выплат с банковской выпиской (`bankPaymentSum` ↔ поступления от WB)
- **Кредиторка поставщикам + оценка «в пути» по контрактной стоимости** (кол-во × unitPrice × курс ЦБ) — v1 считает по уплаченному (D-12)
- **Валютная переоценка** (CNY остатки банка в ₽ по курсу ЦБ на дату баланса) — v1 показывает CNY отдельно, как в /bank
- **Начисленные-но-неуплаченные проценты по кредитам на дату** — v1 только по графику платежей
- **Исправление scope-мэппинга `lib/wb-jwt.ts`** под официальную таблицу битов (5/6/7/30 расходятся) — аккуратно, не сломать существующие проверки; можно отдельным quick task
</user_constraints>

## Phase Requirements

<phase_requirements>
Фаза добавлена ad-hoc (2026-07-02), формальных REQ-ID в REQUIREMENTS.md нет — трассировка идёт по Decision ID (D-01..D-17) из CONTEXT.md, аналогично Phase 21/22/23. Планировщику следует продолжить этот паттерн (traceability table Decision ID → Plan/File) вместо создания REQ-ID постфактум.
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Чеклист нового ERP_SECTION (обязательно все 6 пунктов, п.5 чаще всего забывают):**
  1. `prisma/schema.prisma` — новое значение в `enum ERP_SECTION` + миграция `ALTER TYPE "ERP_SECTION" ADD VALUE IF NOT EXISTS 'FINANCE';` (см. подтверждённый рабочий шаблон в `prisma/migrations/20260610_phase23_cash/migration.sql:5`)
  2. `lib/sections.ts` — `SECTION_PATHS["/finance"] = "FINANCE"` (middleware RBAC route guard, Edge-safe, без импортов Prisma)
  3. `components/layout/section-titles.ts` — regex-записи для `/finance/balance`, `/finance/cashflow`, `/finance/pnl` (порядок важен: специфичные паттерны выше общих)
  4. `components/layout/nav-items.ts` — пункт Sidebar (`{ section: "FINANCE", href: "/finance/balance", label: "Финансы", icon: "..." }`) + добавить иконку в `ICON_MAP`
  5. **`lib/section-labels.ts` → `SECTION_OPTIONS`** — без этой строки раздел не появится тумблером VIEW/MANAGE в `/admin/users`
  6. (опц.) `app/(dashboard)/dashboard/page.tsx` — карточка раздела на дашборде
- **`app/actions/users.ts` правок НЕ требует** — `sectionRoles = z.record(z.string(), …)` принимает любой новый section после миграции.
- **Sticky-таблица баланса** должна следовать pattern `CLAUDE.md § Sticky data-таблицы`: НЕ shadcn `<Table>` в шапке, `overflow-auto h-full` единственный scroll-контейнер, `bg-background`/`bg-muted` БЕЗ `/NN` прозрачности на любой sticky-ячейке (включая подытоги разделов Активы/Пассивы).
- **Числа:** ru-RU формат, пробел-разделитель тысяч, ₽; `Decimal(14,2)` для новых денежных полей (проектная норма с Phase 21+), `Number(decimal)` на границе RSC→client.
- **Деплой:** после реализации — коммит → push → деплой ТОЛЬКО через `nohup` + `df -h` перед стартом (но: пользователь запретил коммит для ЭТОЙ фазы до завершения параллельной разработки — деплой блокирован тем же запретом).
- **`git add -A`** обязателен при коммитах с новыми файлами (`commit -am` не подхватывает untracked).

## Standard Stack

Библиотек не требуется — весь стек уже в проекте (Next.js 15.5.14 RSC, Prisma 6, Decimal.js через Prisma `Decimal`, vitest 4.1.4). Единственное новое "внешнее" API — `finance-api.wildberries.ru` (уже задокументировано в CONTEXT.md canonical_refs, HIGH confidence — исследовано пользователем в discuss-фазе 2026-07-02, не переисследовано по ограничению задания).

### Core (переиспользуемые as-is)

| Модуль/функция | Сигнатура | Назначение | Готовность |
|---|---|---|---|
| `lib/loan-math.ts:computeLoanAggregates` | `(amount: number, payments: PaymentInput[], asOf?: Date): LoanAggregates` | Остаток кредита на дату (D-16 незакрытые обязательства аналогично, но для Loan) | ГОТОВ, вызывать с `asOf` = дата баланса |
| `lib/purchase-stages.ts:currentStageOf` | `(reachedStages: readonly string[]): StageKey \| null` | Текущий этап закупки. НЕ принимает дату — caller должен ПРЕДВАРИТЕЛЬНО отфильтровать `PurchaseItemStageProgress` по `date <= X` перед вызовом | ГОТОВ, но требует pre-filter по дате в новом коде |
| `lib/date-periods.ts:startOfQuarterMsk` | `(date?: Date): Date` | Начало квартала МСК (Q1=янв,Q2=апр,Q3=июл,Q4=окт) — прямое переиспользование для D-16 границы квартала | ГОТОВ |
| `lib/production-sync.ts:computeProductionTotals` | `(items): Map<productId, number>` | Паттерн-образец pure aggregator (Σ max(0, quantity − warehouseQty)) — модель для нового `computeProcurementValuation` (D-12) | Образец паттерна, не для прямого вызова |
| `lib/wb-token.ts:getWbToken` / `lib/wb-token-validate.ts:validateWbToken` | см. ниже | Токен-инфраструктура — данные-управляемая, добавление `WB_FINANCE_TOKEN` = 4 точки правки | ГОТОВ |
| `lib/wb-cooldown.ts` | `resolveBucketFromUrl`, `getWbCooldownSecondsRemaining`, `setWbCooldownUntil` | Cooldown bus — добавить `"finance"` в `WB_COOLDOWN_BUCKETS` + ветку в `resolveBucketFromUrl` для `finance-api.wildberries.ru` | Требует 1 доп. bucket, паттерн ГОТОВ |
| `app/api/cron/dispatch/route.ts` | — | Диспетчер уже опрашивает каждые 5 мин — НОВЫЙ systemd timer НЕ нужен, только новая ветка `if (shouldFireCron(...))` + `AppSetting` ключи `financeBalanceSnapshotCronTime`/`LastRun` | ГОТОВ как паттерн |

### Новые модули (писать с нуля)

| Модуль | Назначение | Паттерн-образец |
|---|---|---|
| `lib/wb-finance-api.ts` | Клиент `finance-api.wildberries.ru` (Balance API) — 1 req/мин | `lib/wb-adv-api.ts` (отдельный токен + rate limit) |
| `lib/balance-math.ts` | Pure function: расчёт налогового обязательства (D-16), Капитал = Активы−Пассивы, дельта между 2 датами | `lib/pricing-math.ts` / `lib/loan-math.ts` |
| `lib/balance-data.ts` | RSC data-агрегатор — собирает все статьи на дату X | `lib/credits-data.ts` (образец структуры loadXDashboard) |
| Point-in-time FX rate lookup | `getRateForDate(code, date, prisma)` — НЕТ готового аналога, `lib/cbr-rates.ts:getLatestRate` берёт только последний известный курс | Новый query: `findFirst({ where: { code, date: { lte: X } }, orderBy: { date: "desc" } })` |
| Point-in-time bank balance | `getBankBalanceAsOf(accountId, date)` — НЕТ готового аналога, `/bank` считает только anchor = MAX(balanceDate) | Новый query, формула ниже (Code Examples) |

**Installation:** не требуется — все зависимости уже в `package.json` (см. `C:\Claude\zoiten-pro\package.json`, prisma 6.19.3, vitest 4.1.4, zod 4.3.6).

**Version verification:** N/A — новых npm-пакетов не добавляется.

## Architecture Patterns

### Recommended Project Structure (новые файлы)

```
prisma/migrations/
└── 20260702_phase24_finance/         # ALTER TYPE + 4 новые таблицы
    └── migration.sql

lib/
├── wb-finance-api.ts                 # Balance API клиент (новый токен, cooldown bucket 'finance')
├── balance-math.ts                   # pure: taxLiability, capital, delta — golden test
└── balance-data.ts                   # RSC агрегатор: loadBalanceSheet(date, compareDate)

app/
├── (dashboard)/finance/
│   ├── balance/page.tsx              # основной отчёт (RSC)
│   ├── cashflow/page.tsx             # ComingSoon (заглушка под ОДДС)
│   └── pnl/page.tsx                  # ComingSoon (заглушка под ОПиУ)
├── actions/
│   └── finance-balance.ts            # server actions: recalculate, adjustments CRUD, tax rates, tax-period-actuals
└── api/cron/
    └── finance-snapshot/route.ts     # 06:00 МСК: пишет FinanceStockSnapshot + FinanceReceivablesSnapshot

components/finance/
├── FinanceTabs.tsx                   # паттерн CardsTabs/PricesTabs
├── BalanceSheetTable.tsx             # sticky-таблица (CLAUDE.md pattern)
├── BalanceDatePicker.tsx             # 2 даты + дельта (D-09)
├── ManualAdjustmentsModal.tsx        # CRUD ручных статей (D-08)
├── TaxRatesBar.tsx                   # редактируемые ставки 7%/1% (паттерн GlobalRatesBar)
└── TaxPeriodActualForm.tsx           # факт НДС/налога за закрытый квартал (D-17)

tests/
├── balance-math.test.ts              # golden test: taxLiability/capital/delta
└── wb-finance-api.test.ts            # mocked rate-limit / cooldown bucket 'finance'
```

### Pattern 1: Снапшот-таблицы без FK на изменчивые сущности (nmId/productId без relation)

**Что:** Исторические daily-снапшоты в проекте (`WbCardOrdersDaily`, `WbCardFunnelDaily`) хранят `nmId Int` БЕЗ `@relation` на `WbCard`, явно с комментарием «выживают soft/hard delete карточки». `Product` тоже физически удаляется через 30 дней после soft-delete (PROD-10 cron `purge-deleted`). Значит `FinanceStockSnapshot` должен ТАК ЖЕ хранить `productId String` без relation (или с `onDelete: SetNull` если делать FK) + денормализованный `sku`/`name` для отображения даже после удаления товара.

**When to use:** Любая daily-snapshot таблица, которая должна пережить жизненный цикл soft-delete → hard-purge своего "родителя".

**Example:**
```prisma
// Source: prisma/schema.prisma:1071-1092 (WbCardOrdersDaily, паттерн-образец)
model WbCardOrdersDaily {
  id          Int      @id @default(autoincrement())
  nmId        Int                    // без FK — переживает hard-delete WbCard
  date        DateTime @db.Date
  qty         Int
  // ...
  @@unique([nmId, date])
  @@index([nmId])
  @@index([date])
}
```

Рекомендуемый дизайн для Phase 24 (по этому же паттерну):

```prisma
enum FinanceStockLocation {
  WB_WAREHOUSE
  WB_IN_WAY_TO_CLIENT
  WB_IN_WAY_FROM_CLIENT
  IVANOVO
}

model FinanceStockSnapshot {
  id               String                @id @default(cuid())
  date             DateTime              @db.Date
  productId        String                // БЕЗ @relation — Product hard-purge через 30д после soft-delete (PROD-10)
  sku              String                // денормализовано — читаемо даже после удаления товара
  location         FinanceStockLocation
  qty              Int
  costPriceAtDate  Decimal?              @db.Decimal(14, 2)  // null = «без оценки» (D-11)
  valueRub         Decimal?              @db.Decimal(14, 2)  // qty × costPriceAtDate, precomputed
  createdAt        DateTime              @default(now())

  @@unique([date, productId, location])
  @@index([date])
  @@index([productId])
}
```

### Pattern 2: Балансирующий снапшот дебиторки WB (singleton per date)

```prisma
model FinanceReceivablesSnapshot {
  id                  String   @id @default(cuid())
  date                DateTime @db.Date @unique   // один снимок в сутки, консолидированный (D-05: нет разреза по компаниям)
  balanceCurrentRub   Decimal  @db.Decimal(14, 2)  // Balance API `current`
  balanceForWithdrawRub Decimal @db.Decimal(14, 2) // Balance API `for_withdraw`
  weeklyTailRub       Decimal  @db.Decimal(14, 2)  // Σ forPay текущей незакрытой недели (Statistics Sales API)
  totalRub            Decimal  @db.Decimal(14, 2)  // current + weeklyTail (формула D-14)
  rawJson             Json?                        // полный ответ Balance API — provenance/debug
  createdAt           DateTime @default(now())
}
```

### Pattern 3: Ручные корректировочные статьи (D-08) — "живая" таблица, не снапшот

**Что:** В отличие от Pattern 1/2, эта таблица НЕ снапшотится ежедневно — она "живая" (как `Loan`/`BankAccount`), вычисляется на лету через `effectiveFrom <= X` фильтр, консистентно с D-01 "остальные статьи — на лету".

```prisma
enum FinanceAdjustmentType {
  ASSET
  LIABILITY
}

model FinanceManualAdjustment {
  id             String                  @id @default(cuid())
  label          String                  // "Займы выданные", "Прочая дебиторка"
  type           FinanceAdjustmentType
  amountRub      Decimal                 @db.Decimal(14, 2)
  effectiveFrom  DateTime                @db.Date
  comment        String?
  createdById    String?
  createdAt      DateTime                @default(now())
  updatedAt      DateTime                @updatedAt
  deletedAt      DateTime?               // soft delete — «действует до» = момент удаления
}
```

Запрос на дату X: `where: { effectiveFrom: { lte: X }, OR: [{ deletedAt: null }, { deletedAt: { gt: X } }] }` — паттерн идентичен soft-delete фильтрации, уже используемой в `Product`/`Loan` (`deletedAt: null`), расширенный для "снятия статьи с даты".

### Pattern 4: Факт-корректировка налога per квартал (D-17)

```prisma
model FinanceTaxPeriodActual {
  id                  String   @id @default(cuid())
  year                Int
  quarter             Int      // 1..4
  vatActualRub        Decimal? @db.Decimal(14, 2)   // факт НДС от бухгалтерии, null = использовать расчёт
  incomeTaxActualRub  Decimal? @db.Decimal(14, 2)   // факт налог на доходы, null = использовать расчёт
  updatedById         String?
  updatedAt           DateTime @updatedAt

  @@unique([year, quarter])
}
```

Балансирующая логика в `lib/balance-math.ts`: для закрытых кварталов (quarter полностью в прошлом относительно даты баланса) — если `FinanceTaxPeriodActual` запись существует и поле не null, использовать факт; иначе — расчёт по D-16 формуле. Текущий квартал — ВСЕГДА расчёт (per D-17 явно).

### Pattern 5: Регистрация нового WB-токена (data-driven, 4 точки правки)

**What:** Вся токен-инфраструктура управляется массивами/records, а не hardcoded UI — добавление `WB_FINANCE_TOKEN` НЕ требует новых компонентов.

**Example:**
```typescript
// Source: lib/wb-token.ts:8-14
export const WB_TOKEN_NAMES = [
  "WB_API_TOKEN", "WB_RETURNS_TOKEN", "WB_CHAT_TOKEN",
  "WB_ADS_TOKEN", "WB_ADS_TOKEN_2",
  "WB_FINANCE_TOKEN",              // ← добавить (1/4)
] as const

// Source: lib/wb-token-validate.ts:10-19, 21-32
export const REQUIRED_SCOPE_BITS: Record<WbTokenName, number[]> = {
  // ...
  WB_FINANCE_TOKEN: [13],          // ← добавить (2/4) — bit 13 «Финансы» per официальную таблицу
}
const PROBE_ENDPOINTS: Record<WbTokenName, string> = {
  // ...
  WB_FINANCE_TOKEN: "https://finance-api.wildberries.ru/api/v1/account/balance", // ← (3/4)
  // ⚠ единственный документированный endpoint = сам rate-limited (1/мин) balance
  // call — probe при КАЖДОЙ смене токена это ок (редкая операция), но НЕ дёргать
  // этот же probe в фоновых процессах.
}

// Source: lib/wb-jwt.ts:5-18 — WB_SCOPE_LABELS ДОБАВИТЬ (не менять существующие,
// они уже расходятся с офиц. таблицей — см. Deferred, отдельная задача):
export const WB_SCOPE_LABELS: Record<number, string> = {
  // ... существующие 1,2,3,5,6,7,9,11,30 — НЕ трогать
  13: "Финансы",                   // ← добавить (4/4, additive-safe)
}

// Source: app/actions/wb-tokens.ts:30-36
const DISPLAY_NAMES: Record<WbTokenName, string> = {
  // ...
  WB_FINANCE_TOKEN: "WB Финансы",  // ← добавить (это и есть 4-я точка правки, но это app/actions, считаем отдельно от lib)
}
```

Итого: 4 файла, ~4 строки. UI-таб `/admin/settings` (`WbTokensTab.tsx`) ничего не требует — он полностью читает `listWbTokens()` который итерирует `WB_TOKEN_NAMES`.

### Pattern 6: Регистрация нового cron-джоба в существующем диспетчере (без нового systemd timer)

**What:** `app/api/cron/dispatch/route.ts` уже опрашивается системным таймером каждые 5 минут (подтверждено docstring `// GET — fires каждые 5 минут`). D-02 требует ~06:00 МСК — это ПОПАДАЕТ в существующую 5-минутную сетку без изменений в systemd.

**Example:**
```typescript
// Source: app/api/cron/dispatch/route.ts:27-63 (текущий паттерн — расширить по аналогии)
const rows = await prisma.appSetting.findMany({
  where: { key: { in: [
    // ... существующие ключи
    "financeBalanceSnapshotCronTime", "financeBalanceSnapshotLastRun", // ← добавить
  ] } },
})
const financeSnapshotTime = settings.financeBalanceSnapshotCronTime ?? "06:00"
const financeSnapshotLastRun = settings.financeBalanceSnapshotLastRun ?? null

if (shouldFireCron({ currentHHMM, storedTime: financeSnapshotTime, lastRunDate: financeSnapshotLastRun, today })) {
  try {
    const { GET: financeHandler } = await import("../finance-snapshot/route")
    const res = await financeHandler(req)
    fired.push(`finance-snapshot:${res.status}`)
  } catch (e) {
    console.error("[dispatch] finance-snapshot error:", e)
    fired.push("finance-snapshot:error")
  }
}
```

Новый route `app/api/cron/finance-snapshot/route.ts` должен следовать паттерну `app/api/cron/wb-funnel-daily/route.ts`: `x-cron-secret` guard, try/catch, `AppSetting` upsert lastRun ПОСЛЕ успеха.

⚠ **UI Settings-таб «Расписание» (`CronScheduleTab.tsx`) охватывает ТОЛЬКО 3 крона** (`wbOrdersDailyCronTime`/`wbPricesDailyCronTime`/`wbCardsRefreshCronTime`) из ~7 зарегистрированных в диспетчере — остальные (funnel/advSync/advUpdSync/cbr) управляются только через дефолтный константу в коде + прямую правку `AppSetting` (нет UI). Планировщику НЕ обязательно добавлять UI-карточку для `financeBalanceSnapshotCronTime` — можно ограничиться константой по умолчанию `"06:00"`, консистентно с большинством существующих кронов.

### Anti-Patterns to Avoid

- **НЕ переиспользовать `Product.productionStock`** — поле DEPRECATED с 2026-06-04 (обнулено миграцией, заменено на `ProductIncoming.orderedQty`). "Товар в пути из Китая" для баланса берётся из `PurchaseItemStageProgress` (этапы SHIPMENT/TRANSIT) + `PurchasePayment` (D-12), НЕ из этого поля.
- **НЕ строить дебиторку на `statistics-api…/api/v5/supplier/reportDetailByPeriod`** — deprecated, удаляется 15.07.2026 (явный запрет в D-14).
- **НЕ использовать `getLatestRate()` для валюты платежа закупки** — эта функция возвращает ПОСЛЕДНИЙ известный курс, не курс на дату платежа. Для D-12 "по курсу на дату платежа" нужен новый point-in-time query.
- **НЕ добавлять новый systemd timer** — диспетчер уже polls каждые 5 минут; достаточно новой ветки `if (shouldFireCron(...))`.
- **НЕ переиспользовать `wbTaxPct`/`wbDefectRatePct` из Phase 7 `AppSetting`** — это ставки юнит-экономики ценообразования (другой домен, другое значение "налог"). Для D-15/D-16 использовать НОВЫЕ ключи с namespace-префиксом (`finance.vatPct`, `finance.incomeTaxPct`) — консистентно с существующими `stock.turnoverNormDays`, `support.lastSyncedAt`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Остаток кредита на произвольную дату | Новый расчёт "Σ платежи where date<=X" | `computeLoanAggregates(amount, payments, asOf)` из `lib/loan-math.ts:130` | Уже обрабатывает guard на пустой payments[], округление до копеек, UTC-normalized сравнение дат |
| Текущий этап позиции закупки | Ручной `Math.max(...)` по массиву | `currentStageOf(reachedStages)` из `lib/purchase-stages.ts:65` — но ОБЯЗАТЕЛЬНО pre-filter `PurchaseItemStageProgress` по `stage.date <= X` перед передачей массива | Единственный источник истины порядка этапов (PRODUCTION→INSPECTION→SHIPMENT→TRANSIT→WAREHOUSE), используется везде в проекте (stock, purchases table) |
| Границы квартала МСК | Ручная арифметика месяцев | `startOfQuarterMsk(date)` из `lib/date-periods.ts:41` | TZ-safe через `Intl.DateTimeFormat`, уже покрыт `tests/date-periods.test.ts` |
| WB-токен CRUD/валидация/UI | Новая форма токена | Расширить `WB_TOKEN_NAMES`/`REQUIRED_SCOPE_BITS`/`PROBE_ENDPOINTS`/`DISPLAY_NAMES` (Pattern 5) | Вся UI (`WbTokensTab.tsx`) и server actions (`app/actions/wb-tokens.ts`) уже data-driven по этим 4 records/массивам |
| Rate-limit защита WB запроса | Собственный sleep/retry | `resolveBucketFromUrl` + `getWbCooldownSecondsRemaining`/`setWbCooldownUntil` из `lib/wb-cooldown.ts` | Централизованный per-endpoint cooldown bus, переживает cron-интервалы (buffer formula), защищает от каскадного бана IP |
| Product-level агрегация WB остатков (Σ stockQty по всем nmId товара) | Новый JOIN/GROUP BY | Паттерн `lib/stock-data.ts:177-197` — батч `wbCard.findMany({nmId: {in}})` + `Map<nmId, card>` + JS-агрегация по `p.articles` | Единственный проверенный способ достать nmId из `MarketplaceArticle` (текстовое поле `article`, парсится `parseInt`) без Ozon-путаницы |

**Key insight:** Проект уже прошёл через 3 очень похожих фазы (Кредиты/Банк/Касса) — "остаток на дату" для кредитов решён идеально (`computeLoanAggregates`), а для банка — НЕ решён (только anchor-остаток). Это единственная реальная дыра, которую придётся закрывать с нуля (см. Pattern ниже в Code Examples), а не искать несуществующий helper.

## Common Pitfalls

### Pitfall 1: Остаток банка на дату X < balanceDate не имеет готового helper'а

**What goes wrong:** `/bank` дашборд считает только `anchorDate = MAX(BankAccount.balanceDate)` (или fallback `MAX(tx.date)`) — "баланс сейчас", не "баланс на дату X".
**Why it happens:** `BankAccount.closingBalance` — это снимок ПОСЛЕДНЕГО известного остатка на момент импорта выписки, а не daily-снапшот.
**How to avoid:** Для даты X ≤ balanceDate: `balance(X) = closingBalance − Σ(tx.date ∈ (X, balanceDate], amount × sign(CREDIT=+1,DEBIT=-1))`. Для X > balanceDate (редкий случай, если пользователь выбрал будущую/сегодняшнюю дату при устаревшей выписке): симметричная формула со знаком `+`. Направление подтверждено в схеме: `direction TxDirection // DEBIT (расход) | CREDIT (приход)` (`prisma/schema.prisma:1712`).
**Warning signs:** Если дельта D-09 (текущая vs сравнения) для банка на старых датах не сходится с ручным пересчётом по выписке — проверить знак direction и границы интервала `(X, balanceDate]` (строго больше X, не ≥).

### Pitfall 2: Мультивалютность банка — CNY-счета не должны попадать в общий рублёвый агрегат

**What goes wrong:** `/bank` dashboard явно фильтрует потоки `currency: "RUR"` и хранит `balancesByCurrency: {}` per-валюта отдельно (не суммирует CNY+RUR в одну цифру), а комментарий в коде "22-06: CNY flows ignored for v1" подтверждает известное упрощение.
**Why it happens:** Нет валютной переоценки CNY→RUB на дату баланса (Deferred явно).
**How to avoid:** Баланс Phase 24 должен ЯВНО повторить это упрощение — либо показывать CNY счета отдельной строкой (как в `/bank`), либо исключать из "Денежные средства (₽)" итога с пометкой. НЕ пытаться конвертировать CNY по курсу ЦБ — прямо задеферрено (Deferred: «Валютная переоценка»).

### Pitfall 3: Внутренние переводы между своими счетами/компаниями искажают "приход/расход", но НЕ остаток

**What goes wrong:** `/bank` реализует `isInternal()` детектор (по номеру счёта получателя ИЛИ ИНН) для очистки Flow-метрик (7д/30д) — но closingBalance сам по себе НЕ требует этой очистки (остаток корректен независимо от природы транзакции). Не переносить internal-transfer фильтрацию в формулу balance(X) — она нужна только для income/expense витрины, не для остатка.
**How to avoid:** Формула balance(X) из Pitfall 1 суммирует ВСЕ транзакции (включая внутренние переводы) — это правильно, т.к. closing balance уже включает их эффект.

### Pitfall 4: Point-in-time курс ЦБ РФ не существует как helper — искать нечего, писать новый query

**What goes wrong:** Планировщик может потратить время на поиск `getRateForDate` — такой функции НЕТ. `lib/cbr-rates.ts:getLatestRate` — только последний известный курс (используется в `/procurement/purchases` для live-отображения, что здесь неприменимо).
**How to avoid:** Новый запрос `prisma.currencyRate.findFirst({ where: { code, date: { lte: paymentDate } }, orderBy: { date: "desc" } })`. `CurrencyRate` синкается forward-only с 2026-06-09 (Phase 20, D-09 cron) — платежи РАНЬШЕ этой даты не будут иметь точного курса на дату, нужен явный fallback (например самый ранний доступный курс) + предупреждение в UI, аналогично D-11 "без оценки".

### Pitfall 5: Налоговая база из `CashCategory` и `TxCategory.TAX` — не автоматическая, requires user diligence

**What goes wrong:** `TxCategory.TAX` на банке — ручной inline-дропдаун (`CategoryCell` в `BankTransactionsTable`), default при импорте — `UNCATEGORIZED`. Нет авто-категоризации налоговых платежей при импорте выписки (в отличие от кассы, где есть keyword-based `categorize()`). Касса ещё хуже: `CashCategory` "Налоги/банк/сборы" (`lib/bank-labels.ts` не относится к кассе, но `lib/cash-import/categorize.ts:36`) смешивает налоги с банковскими комиссиями, госпошлинами и штрафами — НЕ чистая категория для D-16.
**Why it happens:** Категоризация проектировалась для управленческой аналитики расходов, не для точного налогового учёта.
**How to avoid:** Явно документировать в UI баланса допущение "уплаченные налоги = Σ BankTransaction(category=TAX) + Σ CashEntry(category='Налоги/банк/сборы')" как приближение, которое может ПЕРЕОЦЕНИВАТЬ уплаченное (кассовая категория шире факта) и НЕДООЦЕНИВАТЬ (банк — если пользователь не разметил прошлые платежи). Это прямая причина существования D-17 (факт-корректировка бухгалтерии перекрывает расчёт для закрытых периодов) — использовать D-17 как основной канал точности, а D-16 формулу — только как оценку текущего (незакрытого) квартала.
**Warning signs:** Если расчётное налоговое обязательство сильно расходится с фактом бухгалтерии на закрытых периодах — это ожидаемо, не баг; решается вводом факта через `FinanceTaxPeriodActual`.

### Pitfall 6: `finance-api.wildberries.ru` rate limit 1 req/мин — daily cron это ОК, "Пересчитать дату" кнопка — риск

**What goes wrong:** D-04 "Пересчитать дату" пересобирает ретро-вычислимые статьи, но явно НЕ трогает зафиксированные снапшоты (количества остатков неизменяемы). Дебиторка WB — это снапшот (D-01), значит D-04 НЕ должен дёргать Balance API повторно для прошлой даты (снапшота на эту дату уже нет способа перезаписать физически верно — WB отдаёт только "сейчас"). Если разработчик по ошибке добавит вызов Balance API в recalculate-action — при частых кликах пользователя легко словить 429 на весь день (1 req/мин лимит, cooldown bus заблокирует остальные finance-запросы).
**How to avoid:** "Пересчитать дату" трогает ТОЛЬКО live-вычисляемые статьи (банк/касса/кредиты/авансы/налоги) + переоценку qty×costPrice снапшота остатков (согласно D-04 тексту буквально). Дебиторка WB на дату X = что записано в `FinanceReceivablesSnapshot` за эту дату, без API-вызова.

### Pitfall 7: `/finance-models` — существующий несвязанный раздел, риск путаницы в навигации/наименовании

**What goes wrong:** В проекте уже есть `app/(dashboard)/finance-models/page.tsx` — "Финансовые модели" (сценарное моделирование запуска 9 товаров, `public: true`, БЕЗ RBAC-гейта, section-псевдоним `"FINANCE_MODELS"` в `nav-items.ts`, НЕ входит в `ERP_SECTION` enum). Это ПОЛНОСТЬЮ другая фича (what-if моделирование, не факт-баланс) от другого разработчика/контекста.
**Why it happens:** Совпадение домена "финансы" в названии.
**How to avoid:** Новый раздел — `/finance/balance` (путь `/finance` без дефиса, с под-путями), `ERP_SECTION.FINANCE` (не путать с существующим label `"FINANCE_MODELS"`). Sidebar-порядок: рассмотреть размещение рядом (не обязательно смежно) — оба будут в меню одновременно, названия должны явно различаться ("Финансовые модели" vs "Финансы" / "Финансовая отчётность") чтобы пользователь не путал сценарное моделирование с фактическим балансом.

## Code Examples

### Point-in-time остаток банковского счёта (новый helper, нет готового аналога)

```typescript
// Рекомендуемая сигнатура для lib/balance-data.ts
// Source pattern: app/(dashboard)/bank/page.tsx:140-153 (anchor logic), направление
// знаков подтверждено комментарием prisma/schema.prisma:1712
async function getBankBalanceAsOf(
  accountId: string,
  asOf: Date,
): Promise<number | null> {
  const account = await prisma.bankAccount.findUnique({
    where: { id: accountId },
    select: { closingBalance: true, balanceDate: true },
  })
  if (!account?.closingBalance || !account.balanceDate) return null

  const closing = Number(account.closingBalance)
  const anchor = account.balanceDate

  if (asOf.getTime() >= anchor.getTime()) {
    // asOf в будущем относительно anchor — прибавляем поток (anchor, asOf]
    const txs = await prisma.bankTransaction.findMany({
      where: { accountId, date: { gt: anchor, lte: asOf } },
      select: { direction: true, amount: true },
    })
    const delta = txs.reduce(
      (s, t) => s + (t.direction === "CREDIT" ? 1 : -1) * Number(t.amount),
      0,
    )
    return closing + delta
  }

  // asOf в прошлом — вычитаем поток (asOf, anchor]
  const txs = await prisma.bankTransaction.findMany({
    where: { accountId, date: { gt: asOf, lte: anchor } },
    select: { direction: true, amount: true },
  })
  const delta = txs.reduce(
    (s, t) => s + (t.direction === "CREDIT" ? 1 : -1) * Number(t.amount),
    0,
  )
  return closing - delta
}
```

### Границы этапа закупки на дату (комбинация currentStageOf + pre-filter)

```typescript
// currentStageOf НЕ принимает дату — фильтр по PurchaseItemStageProgress.date
// делается ДО вызова. Source: lib/purchase-stages.ts:65
import { currentStageOf } from "@/lib/purchase-stages"

function stageAsOf(
  stages: Array<{ stage: string; date: Date | null }>,
  asOf: Date,
): string | null {
  const reached = stages
    .filter((s) => s.date != null && s.date.getTime() <= asOf.getTime())
    .map((s) => s.stage)
  return currentStageOf(reached)
}
```

### Налоговое обязательство на дату (D-16 — кандидат для lib/balance-math.ts pure function)

```typescript
// Signature рекомендация — golden test аналогично lib/loan-math.ts паттерну
export interface TaxLiabilityInputs {
  quarterStart: Date          // startOfQuarterMsk(asOf)
  buyoutsSumRubInQuarter: number  // Σ WbCardFunnelDaily.buyoutsSumRub WHERE date IN [quarterStart, asOf]
  vatPct: number               // AppSetting finance.vatPct (default 7)
  incomeTaxPct: number         // AppSetting finance.incomeTaxPct (default 1)
  taxesPaidInQuarter: number   // Σ BankTransaction(TAX) + CashEntry(Налоги/банк/сборы) WHERE date IN [quarterStart, asOf]
  unclosedPriorQuartersLiability: number  // Σ обязательств прошлых кварталов, не закрытых фактом (D-17)
}

export function computeTaxLiability(inputs: TaxLiabilityInputs): number {
  const rateSum = (inputs.vatPct + inputs.incomeTaxPct) / 100
  const accrued = inputs.buyoutsSumRubInQuarter * rateSum
  return accrued - inputs.taxesPaidInQuarter + inputs.unclosedPriorQuartersLiability
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `statistics-api…/api/v5/supplier/reportDetailByPeriod` для дебиторки | `finance-api.wildberries.ru/api/v1/account/balance` + Statistics Sales `forPay` хвост | Deprecated, удаляется 15.07.2026 | D-14 — единственный жизнеспособный источник дебиторки; строить сразу на новом |
| `Product.productionStock` (ручной ввод) | `ProductIncoming.orderedQty` (machine-managed из открытых закупок) | 2026-06-04, доработано quick 260702-j52 (2026-07-02, тот же день что и создание фазы) | "Товар в пути из Китая" для баланса НЕ читает это поле напрямую — использует `PurchaseItemStageProgress`+`PurchasePayment` (D-12), но нужно знать что старое поле мертво |
| Единый `wbCooldownUntil` ключ | 9 (скоро 10 с 'finance') per-endpoint bucket'ов | 2026-05-13 (quick 260513-khv) | Новый Finance API bucket изолирован от остальных WB endpoints — 429 на balance не блокирует sync карточек |

**Deprecated/outdated:**
- `Product.productionStock` — не читать, не писать (обнулено миграцией 20260604)
- `statistics-api…/api/v5/supplier/reportDetailByPeriod` — не использовать, deprecated 15.07.2026 (за 13 дней до вероятного деплоя фазы — окно почти закрыто)

## Open Questions

1. **Официальный scope-бит "Финансы" (13) отсутствует в живом токене пользователя до его выпуска.**
   - What we know: CONTEXT.md фиксирует официальную таблицу scope-битов (13=Финансы) из документации WB, но пользователь ещё не выпустил `WB_FINANCE_TOKEN` (явно отмечено как user-checkpoint в CONTEXT `## Specifics`).
   - What's unclear: пройдёт ли `validateWbToken` probe-call (`GET /api/v1/account/balance`) без 403 сразу после выпуска токена — WB иногда требует время активации нового scope.
   - Recommendation: включить явный Wave 0 / human-checkpoint шаг в план — "пользователь выпускает токен → превентивный smoke-curl с прода перед написанием кода снапшота", по аналогии с Phase 14 `STOCK-06` Wave-0 curl-проверкой.

2. **Точность `CashCategory`/`TxCategory` для налоговой базы (см. Pitfall 5) — насколько сильно исказит текущий квартал.**
   - What we know: обе категории смешивают налоги с другими типами платежей (касса) или требуют ручной разметки (банк).
   - What's unclear: фактический процент разметки исторических транзакций (прод-БД не проверялась по ограничению задания).
   - Recommendation: не блокировать реализацию — явно показать в UI пометку-дисклеймер у строки "Налоговые обязательства (расчётно)" + полагаться на D-17 факт-механизм для точности на закрытых периодах.

3. **CurrencyRate история начинается 2026-06-09** (Phase 20 D-09 forward-only cron) — платежи по закупкам ДО этой даты не имеют точного курса на дату платежа.
   - What we know: `getLatestRate` — fallback на последний известный курс, но "последний" на момент ЗАПРОСА, не "последний до даты X" (это разные вещи для point-in-time).
   - What's unclear: сколько исторических PAID-платежей закупок приходится на период до 09.06.2026 — влияет на точность "Авансов поставщикам"/"Товар в пути" на ранних датах баланса (не критично, т.к. D-03 история и так начинается 01.07.2026, ПОСЛЕ 09.06).
   - Recommendation: для дат ≥ 01.07.2026 (весь scope фазы) риск минимален — курсы на даты платежей до 01.07 могут отсутствовать только если закупка была оплачена очень давно и её этап всё ещё PLANNED/ACTIVE на 01.07; добавить fallback на самый ранний доступный курс с warning-меткой (симметрично D-11 "без оценки").

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| `finance-api.wildberries.ru` (WB Finance API) | D-14 дебиторка (слой 1) | Не проверено (запрещено трогать прод/WB API в рамках этого research) | — | Нет — блокирует UAT дебиторки до выпуска `WB_FINANCE_TOKEN` пользователем; расчётные статьи (банк/касса/кредиты/авансы/налоги) и снапшот остатков НЕ зависят от этого API и могут разрабатываться/тестироваться независимо |
| PostgreSQL 16 + Prisma 6 | Все новые модели | ✓ (уже в проде, миграции применяются через `prisma migrate deploy`) | 16 / 6.19.3 | — |
| vitest 4.1.4 | Golden test `balance-math.ts` | ✓ | 4.1.4 | — |
| systemd cron dispatcher | 06:00 МСК снапшот | ✓ (уже работает, опрос каждые 5 мин) | — | — |

**Missing dependencies with no fallback:**
- `WB_FINANCE_TOKEN` (scope bit 13) — должен быть выпущен пользователем в ЛК WB до UAT-проверки дебиторки. Остальная разработка фазы не блокируется этим.

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | vitest 4.1.4 |
| Config file | `C:\Claude\zoiten-pro\vitest.config.ts` |
| Quick run command | `npm run test -- balance-math` (или `npx vitest run tests/balance-math.test.ts`) |
| Full suite command | `npm run test` (vitest run, ~75 существующих тестовых файлов в `tests/`) |

### Phase Requirements → Test Map

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| D-16 | `computeTaxLiability` — накопление обязательства квартал минус уплаченное | unit (golden, паттерн `pricing-math.test.ts`) | `npx vitest run tests/balance-math.test.ts` | ❌ Wave 0 |
| D-06 | Капитал = Активы − Пассивы (балансирующая строка, идентичность по построению) | unit | тот же файл | ❌ Wave 0 |
| D-09 | Дельта между 2 датами (₽ и %, включая деление на ноль guard) | unit | тот же файл | ❌ Wave 0 |
| Pitfall 1 | `getBankBalanceAsOf` — знак DEBIT/CREDIT, границы интервала (X, anchor] | unit | `npx vitest run tests/balance-data.test.ts` | ❌ Wave 0 |
| D-12 | Граница аванс/в-пути через `currentStageOf` + pre-filter по дате | unit | `npx vitest run tests/balance-data.test.ts` | ❌ Wave 0 (переиспользует существующий `currentStageOf`, тестируется только обвязка pre-filter) |
| D-14 (слой 1) | WB Finance API клиент — rate limit 1/мин, cooldown bucket 'finance' | unit (mocked HTTP) | `npx vitest run tests/wb-finance-api.test.ts` | ❌ Wave 0, паттерн `tests/wb-adv-api.test.ts` |
| D-14 (WB API живой) | Balance API реальный ответ (`current`/`for_withdraw`) | manual smoke (curl с прода) | — (ручной curl после выпуска токена) | UAT-чеклист пункт |
| Раздел FINANCE RBAC | `requireSection("FINANCE")` / MANAGE gate | unit | паттерн `tests/*-actions.test.ts` (напр. `tests/customer-actions.test.ts`) | ❌ Wave 0 |
| ERP_SECTION чеклист | 6 файлов правки (sections.ts, nav-items.ts, section-titles.ts, section-labels.ts) | manual (code review) | — | UAT |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/balance-math.test.ts tests/balance-data.test.ts` (< 5 сек)
- **Per wave merge:** `npm run test` (полный набор — защита от регрессии в переиспользуемых `loan-math`/`purchase-stages`/`wb-cooldown`)
- **Phase gate:** Полный suite зелёный + human UAT дебиторки (требует живого `WB_FINANCE_TOKEN`) перед `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/balance-math.test.ts` — golden test `computeTaxLiability` (использовать реальные цифры от бухгалтерии, если пользователь их предоставит на этапе Zero Wave, аналогично Phase 7 Excel golden test и Phase 21 Credits контрольным суммам)
- [ ] `tests/balance-data.test.ts` — `getBankBalanceAsOf` знак/границы + point-in-time FX rate lookup
- [ ] `tests/wb-finance-api.test.ts` — mock HTTP, паттерн `tests/wb-adv-api.test.ts` (rate-limit 429 → cooldown bucket 'finance')
- [ ] Миграция `prisma/migrations/20260702_phase24_finance/migration.sql` — вручную (нет локальной PostgreSQL, паттерн всех предыдущих фаз, применяется через `deploy.sh` → `prisma migrate deploy` на VPS)
- [ ] Human checkpoint: пользователь выпускает `WB_FINANCE_TOKEN` (scope Финансы) в ЛК WB — без него D-14 не может пройти UAT (не блокирует разработку остальных статей баланса)

## Sources

### Primary (HIGH confidence — прямое чтение исходного кода проекта)

- `C:\Claude\zoiten-pro\prisma\schema.prisma` — модели BankAccount/BankTransaction/CashEntry/Loan/LoanPayment/Purchase/PurchaseItem/PurchasePayment/PurchaseItemStageProgress/CurrencyRate/ProductCost/Product/WbCard/WbCardWarehouseStock/WbCardFunnelDaily/WbApiToken/AppSetting/Company/ERP_SECTION/TxDirection/TxCategory/CashDirection — все актуальные строки процитированы
- `lib/loan-math.ts`, `lib/credits-data.ts`, `lib/purchase-stages.ts`, `lib/production-sync.ts`, `lib/date-periods.ts`, `lib/cbr-rates.ts`, `lib/stock-data.ts` — полное чтение
- `lib/wb-token.ts`, `lib/wb-token-validate.ts`, `lib/wb-jwt.ts`, `lib/wb-cooldown.ts`, `lib/wb-support-api.ts`, `lib/wb-adv-api.ts`, `lib/wb-api.ts` (частично) — токен/rate-limit инфраструктура
- `app/actions/wb-tokens.ts`, `app/(dashboard)/bank/page.tsx`, `app/(dashboard)/cash/page.tsx`, `app/(dashboard)/finance-models/page.tsx` — полное чтение
- `app/api/cron/dispatch/route.ts`, `app/api/cron/wb-funnel-daily/route.ts`, `lib/wb-cron-schedule.ts`, `components/settings/CronScheduleTab.tsx`, `app/actions/cron-schedule.ts` — cron-диспетчер, полное чтение
- `lib/sections.ts`, `lib/section-labels.ts`, `components/layout/nav-items.ts`, `components/layout/section-titles.ts`, `components/cards/CardsTabs.tsx` — ERP_SECTION чеклист референсы
- `lib/bank-labels.ts`, `lib/cash-import/categorize.ts` — категории TAX (банк) vs "Налоги/банк/сборы" (касса), Pitfall 5
- `prisma/migrations/20260610_phase23_cash/migration.sql` — рабочий шаблон `ALTER TYPE ... ADD VALUE`
- `tests/pricing-math.test.ts`, `package.json` — Validation Architecture паттерн + framework версии
- `.planning/phases/24-finance-balance/24-CONTEXT.md` — все decisions D-01..D-17, canonical_refs (WB Finance API endpoints — не переисследовано по прямому ограничению задания, взято как заданное HIGH confidence из discuss-фазы пользователя)
- `.planning/STATE.md` — история фаз 20-23, decision log

### Secondary (MEDIUM confidence)

- WB официальная таблица scope-битов (13=Финансы) — из CONTEXT.md canonical_refs, ссылка на `https://dev.wildberries.ru/ru/openapi/financial-reports-and-accounting`, не перепроверена в этом research по явному запрету задания ("WB Finance API endpoints уже исследованы... НЕ переисследуй")

### Tertiary (LOW confidence)

- Нет — все находки либо прямое чтение кода (HIGH), либо явно перенесены из CONTEXT.md как заданные (помечено выше)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — переиспользуемые модули найдены с точными сигнатурами и номерами строк, ни одна библиотека не добавляется
- Architecture (снапшот-таблицы, cron-регистрация, токен-регистрация): HIGH — все паттерны имеют минимум 2 живых прецедента в кодовой базе (WbCardOrdersDaily/WbCardFunnelDaily для снапшотов; WB_ADS_TOKEN/WB_ADS_TOKEN_2 для токенов; funnel/cbr/advSync для cron)
- Pitfalls: HIGH для банка/валюты/токенов (прямое чтение кода с точными номерами строк), MEDIUM для налоговой категоризации (структурный факт подтверждён кодом, но фактическая полнота разметки исторических данных не проверена — прод-БД не трогалась по ограничению)
- WB Finance API специфика (D-14): не переисследовано — взято как заданное из CONTEXT.md по прямой инструкции задания

**Research date:** 2026-07-02
**Valid until:** ~30 дней для внутренней архитектуры (стабильный код); ~7 дней для WB Finance API специфики (новый API, endpoint активно меняется — `reportDetailByPeriod` сам был deprecated с коротким уведомлением)

---

## Официальная документация WB API — верификация (2026-07-02, вставлена пользователем из dev.wildberries.ru)

Пользователь скопировал официальные страницы «Документы и бухгалтерия» и «История остатков». Всё нижеследующее — HIGH confidence (первоисточник).

### Balance API — ПОДТВЕРЖДЕНО
- `GET https://finance-api.wildberries.ru/api/v1/account/balance`, категория токена «Финансы»
- Ответ: `{"currency":"RUB","current":10196.21,"for_withdraw":6395.8}` — числа (не строки)
- Rate limit: Персональный/Сервисный/Базовый-с-секретом = **1 req/мин**; Базовый = **1 req/24ч** (для ежедневного снапшота хватает даже базового, но нет запаса на ретраи — рекомендовать Персональный)
- Ошибки: 401/402/429 (402 «Требуется платёж» — существует, обрабатывать)

### Отчёты реализации finance/v1 — ПОДТВЕРЖДЕНО + уточнения
- `POST https://finance-api.wildberries.ru/api/finance/v1/sales-reports/list` — **доступен ТОЛЬКО по Персональному/Сервисному токену** (базовый НЕ поддерживается!). Данные с 01.01.2025. 1 req/мин. `period: daily|weekly` (default weekly). `dateFrom/dateTo` RFC3339 МСК.
- Поля list-ответа (деньги — СТРОКИ): `reportId, sellerFinanceName, dateFrom, dateTo, createDate, currency, reportType, retailAmountSum, forPaySum, avgSalePercent, deliveryServiceSum, paidStorageSum, paidAcceptanceSum, deductionSum, penaltySum, additionalPaymentSum, cashbackAmountSum, cashbackDiscountSum, cashbackCommissionChangeSum, paymentSchedule (строка!), bankPaymentSum`
- `POST .../sales-reports/detailed/{reportId}` — 1 req/мин, пагинация rrdId→204, `fields[]` селектор. ⚠ Для **ежедневных** отчётов reportId требует **BigInt**-десериализации (официальное предупреждение).
- `POST .../sales-reports/detailed` (за период) — данные с 29.01.2024. Ключевые поля строки: `forPay, retailAmount, retailPriceWithDisc, docTypeName, saleDt, rrDate, quantity, penalty, paidStorage, deduction, paidAcceptance, acquiringFee, srid, paymentSchedule`.
- `reportDetailByPeriod` — официально: «Данный метод устарел. Он будет удалён 15 июля.» ✅ решение не строить на нём — верно.
- Acquiring: `POST /api/finance/v1/acquiring/list|detailed[/{reportId}]` — издержки на приём платежей (не нужен для v1 баланса; пригодится для ОПиУ).

### 🆕 История остатков WB — НОВАЯ ВОЗМОЖНОСТЬ (меняет bootstrap-план)
- Официально: «Чтобы получать остатки по дням за период до 3 месяцев от текущей даты, используйте методы Аналитика продавца CSV — тип отчёта **STOCK_HISTORY_DAILY_CSV**» (категория токена «Аналитика»).
- Значит: снапшот остатков WB на 01.07.2026 можно построить ТОЧНО (а не приближённо из ближайших данных), если деплой в пределах 3 месяцев от 01.07.
- Механизм CSV-отчётов (создать задание → скачать ZIP) в проекте уже реализован для nm-report в `lib/wb-api.ts:fetchBuyoutPercent` — но точный endpoint/параметры для STOCK_HISTORY_DAILY_CSV НЕ ПОДТВЕРЖДЕНЫ (страница «Аналитика продавца CSV» не предоставлена). **Wave 0: запросить у пользователя страницу доков или проверить curl'ом**; учесть возможный общий daily-cap Analytics (3/день, AppSetting wbAnalyticsDailyCounter).
- `POST seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses` — подтверждён (уже используется в Phase 14): текущие остатки per размер/склад, лимит 3 req/мин, burst 1, обновление раз в 30 мин, пагинация limit≤250000/offset.
- `POST /api/v2/stocks-report/products/{groups|products|sizes}` и `/api/v2/stocks-report/offices` — отчёты остатков с `currentPeriod {start,end}`, обновление раз в час, 3 req/мин (персональный/сервисный/базовый-с-секретом). Для баланса не обязательны (v1 использует собственные снапшоты + wb-warehouses), но полезны как сверка.

### Следствия для планов
1. **Bootstrap 01.07:** задача «первый снапшот» должна использовать STOCK_HISTORY_DAILY_CSV для точных WB-остатков на 30.06/01.07 (fallback: ближайшие данные, как в CONTEXT.md). Иваново/в-пути-из-Китая — без истории (как было).
2. **Инструкция пользователю при выпуске токена «Финансы»:** токен должен быть **Персональным или Сервисным** (не базовым) — иначе sales-reports недоступны и balance = 1 req/сутки.
3. **Финансовый клиент:** парсить денежные поля sales-reports как строки → Decimal; balance — числа; BigInt для daily reportId (v1 балансу detailed не нужен, но клиент проектировать с учётом).
4. **402 Payment Required** — новый код ошибки для обработки в finance/analytics клиентах.
