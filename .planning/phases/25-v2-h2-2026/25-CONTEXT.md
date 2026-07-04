# Phase 25: План продаж v2 — рабочий план H2-2026 — Context

**Gathered:** 2026-07-04
**Status:** Ready for planning
**Source:** Ресёч-воркфлоу (11 агентов, адверсариальная критика) → `25-RESEARCH.md` + 4 решения пользователя

<domain>
## Phase Boundary

Раздел `/sales-plan` (секция `SALES`) переделывается из одноразового симулятора «до 30.06» в рабочий план продаж с горизонтом **01.07–31.12.2026**. В scope:
- Три ряда данных: наш план / наш факт / план по ИУ (2 380 805 ₽/день, итог 438 068 120 ₽).
- Помесячные плановые уровни (заказы шт/день) per товар + детализация/правка в день.
- Приходы товара из Китая по партиям (из раздела Закупки, этапы с датами).
- Виртуальные закупки — генератор «пора заказывать», учитываются только в плане (opt-out), конвертируются в реальные.
- Версионирование/фиксация плана + план/факт с отклонением за неделю/месяц/квартал/полугодие/горизонт.
- Контракт `lib/sales-plan/pdds-feed.ts` для следующей фазы — план движения денежных средств (ПДДС).

**НЕ в scope (deferred):** сам раздел ПДДС (`/finance/cashflow`) — отдельная следующая фаза; мульти-кабинетный факт; авто-фиксация версий cron; ramp-up после OOS; company-level «Масштабировать день»; полный diff-UI версий; недельная сезонность.
</domain>

<decisions>
## Implementation Decisions

### Зафиксированные решения пользователя (2026-07-04) — LOCKED
- **Метрика ИУ = выкупы в ₽** (цены продавца до СПП), `salesPlan.iuMetric = "buyouts"`. ИУ = 2 380 805 ₽/день, итог за горизонт 438 068 120 ₽.
- **Кабинет ИУ = кабинет с токеном `WB_API_TOKEN`** (единственный источник funnel-факта, `lib/wb-funnel-api.ts`). Сравнение факта с ИУ — по всему этому кабинету. Мульти-кабинет не нужен.
- **«Итог» = горизонт H2 (01.07–31.12.2026)**; календарно-годовой тотал за 2026 НЕ показывать (январь–апрель нет в funnel). Механизм year-бакета оставить в движке/`date-buckets` для будущих лет (2027+).
- **Даты приходов:** по умолчанию `createdAt + 45` (leadtime-eta); при заполненном `Purchase.plannedArrivalDate` — работать по нему. Массовое ручное заполнение дат ПЕРЕД запуском НЕ требуется — постепенно, +45 приемлем как временный дефолт.
- **Виртуальная закупка НИКОГДА не прошлым числом** (уточнение пользователя): `orderDate` виртуальной закупки всегда ≥ today (текущим или будущим числом), `expectedArrivalDate` всегда ≥ `today + leadTimeDays` — раньше стандартного цикла от сегодня товар физически не придёт, ставить закупку в прошлое и ждать по ней приход бессмысленно. Инвариант обязателен на ВСЕХ путях: авто-генерация (`orderDate = max(today, breach − leadTime)`), ручное создание и `updateVirtualPurchase` (серверный clamp), UI date-picker (min-даты). Заложено в план 25-07 (Task 1/2/3, threat T-25-08).

### Принятые дефолты (из §11 доки) — LOCKED
- Виртуальные закупки **opt-out** (SUGGESTED учитывается в плане сразу, отклоняется точечно).
- Единица планирования — **заказы шт/день**.
- Параметры модели (редактируемые в UI): страховой запас 14 дн, покрытие закупки 60 дн, lead time fallback 45 дн (заказ→Иваново), транзит после этапа TRANSIT 20 дн, лаг Иваново→WB 0 дн.
- Ряд «План» = **реализуемый** (сток-ограниченный) + метрика `lostRub`.
- План/факт по умолчанию **против активной зафиксированной версии** (до первой фиксации — черновик).
- Без авто-фиксации cron в v1; без ramp-up после OOS в v1; day-разбивка Сводного ограничена окном 62 дня.
- Все write server actions — **`SALES MANAGE`** (фикс текущей дыры VIEW-write).
- Деприкейт `/purchase-plan` и `/procurement/plan` в финальном этапе (снятие из sidebar — после недели параллельной работы).

### Архитектура (из дизайн-документа) — направляющие
- Три слоя: рабочий план (draft, мутирует, дневной ряд считается на лету) / версии (immutable снапшот) / факт (`WbCardFunnelDaily`, на лету).
- Pure-движок `lib/sales-plan/` по образцу `lib/pricing-math.ts` (детерминированный, без Prisma в ядре).
- Виртуальные закупки — **отдельная сущность** `VirtualPurchase` (НЕ флаг на `Purchase` — иначе патчить 5 агрегаторов production-sync/stock/balance).
- ИУ и параметры — в `AppSetting` (JSON), не отдельные таблицы.
- Секция остаётся `SALES` — новая `ERP_SECTION` НЕ добавляется.
- Миграция **аддитивна и рукописная** (`prisma/migrations/20260705_sales_plan_v2/`), старый sales-plan не ломается до финальной зачистки. Проект использует **manual SQL миграции + `prisma migrate deploy`** (НЕ `prisma db push`).

### Поэтапность (6 деплоябельных этапов, кандидаты в waves)
1. Фундамент: схема + движок `lib/sales-plan/` + тесты + bootstrap-скрипт (невидимый деплой).
2. Таб «Товары»: помесячные уровни, модалка правки по дням с realtime-пересчётом, приходы, SALES MANAGE.
3. Таб «Сводный»: матрица план/факт/ИУ + KPI + график; бакеты день/неделя/месяц/квартал/полугодие.
4. Виртуальные закупки: генератор + таб «Пора заказывать» + конвертация.
5. Версионирование: фиксация, активная версия, read-only просмотр.
6. ПДДС-feed + зачистка (SalesForecast*, IU_REMAINING_RUB) + деприкейт /purchase-plan.
⚠ Этапы 3–5 деплоить плотной серией; первую версию фиксировать в день деплоя этапа 5 (§6.1 доки — минимизация unconstrained-зоны прошлого).

### Claude's Discretion
- Точная нарезка этапов на PLAN.md-файлы и волны, зависимости между планами.
- Имена вспомогательных функций/хелперов внутри `lib/sales-plan/` сверх названных в доке.
- Раскладка компонентов внутри `components/sales-plan/` (перечень — §7.6 доки).
- Порядок Wave 0 тест-стабов.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Дизайн и требования
- `.planning/phases/25-v2-h2-2026/25-RESEARCH.md` — полный дизайн (11 разделов + Validation Architecture): модели данных с полями (§2), pure-движок и формулы (§3), виртуальные закупки (§4), факт (§5), фиксация/план-факт (§6), UI с ASCII-мокапами и инвентарём компонентов (§7), ПДДС-контракт (§8), поэтапный план (§9), риски (§10), решения (§11).
- `.planning/phases/25-v2-h2-2026/CRITIC-VERDICT.md` — 13 закрытых дыр + проверенные против прод-кода/БД утверждения (какие модели/поля реально существуют).
- `.planning/REQUIREMENTS.md # Phase 25 Requirements` — SP-01..SP-14.

### Существующий код, который переделывается / переиспользуется
- `app/(dashboard)/sales-plan/page.tsx`, `lib/sales-forecast.ts`, `app/actions/sales-plan.ts`, `components/sales-plan/*` — текущий раздел (переделывается; формулы % выкупа / baseline / avgPrice переиспользуются).
- `lib/pricing-math.ts` + `tests/pricing-math.test.ts` — образец pure-движка + golden-теста.
- `lib/loan-math.ts` — источник bucketKey/bucketLabel (выносится в `lib/date-buckets.ts` + quarter/halfyear/year).
- `prisma/schema.prisma` — модели `Purchase`, `PurchaseItemStageProgress`, `SupplierProductLink`, `ProductIncoming`, `WbCardFunnelDaily`, `Product`, `MarketplaceArticle`, `WbCard`, `AppSetting`, снапшот-таблицы Finance.
- `lib/procurement-math.ts` — computeDepositDueDate/computeBalanceDueDate (для ПДДС-платежей VP).
- `lib/stock-data.ts` — productionBreakdown (per-закупка формула qtyRemaining без схлопывания).
- `app/actions/procurement.ts`, `app/(dashboard)/procurement/purchases/[id]/page.tsx` — карточка закупки (добавить `plannedArrivalDate`).

### Конвенции проекта (обязательно)
- `CLAUDE.md` — чеклист секции, sticky-таблицы (сплошной bg на sticky!), каскадные фильтры, `PRODUCT_HIERARCHY_ORDER_BY`, native select, `prefetch={false}`, правила деплоя (push → nohup deploy.sh → curl 200), manual migrations.
- `lib/rbac.ts` (`requireSection`), `lib/sections.ts`, `components/layout/section-titles.ts`.
- `components/stock/StockProductTable.tsx` / `components/credits/SummaryScheduleTable.tsx` — образцы sticky-таблиц с бакетами по периодам.
</canonical_refs>

<specifics>
## Specific Ideas

- Golden-якорь: `iuTotalForRange("2026-07-01","2026-12-31") === 438_068_120`.
- Эмпирика прод-БД (для проверки метрики ИУ): выкупы июня ≈ 104% константы 2 380 805 ₽/день.
- Масштаб: 104 активных Product × ~184 дня ≈ 19 тыс. строк на версию.
- `resolveArrivalBatches()` fallback-цепочка с тегом `dateSource` (manual / transit-eta / leadtime-eta / legacy-expected).
- Строка «Вне плана» — разница company-level факта и product-level (73 непривязанных nmId ≈ 3.2% по выкупам).
</specifics>

<deferred>
## Deferred Ideas

- Раздел ПДДС (`/finance/cashflow`) — следующая фаза, потребляет `lib/sales-plan/pdds-feed.ts`.
- Мульти-кабинетный сбор funnel; календарный факт января–апреля 2026 (нет в funnel).
- Авто-фиксация версий cron 1-го числа (поле `kind` заложено); ramp-up после OOS; company-level «Масштабировать день»; полный diff-UI версий; недельная сезонность профиля продаж.
</deferred>

---

*Phase: 25-v2-h2-2026*
*Context gathered: 2026-07-04 (ресёч-воркфлоу + 4 решения пользователя)*
