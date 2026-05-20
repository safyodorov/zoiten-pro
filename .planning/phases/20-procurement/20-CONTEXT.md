# Phase 20: Управление закупками — Context

**Gathered:** 2026-05-20
**Status:** Ready for planning (auto-decided defaults — review by user 2026-05-21)
**Mode:** `--auto` (пользователь в отъезде, decisions могут быть скорректированы утром)

<domain>
## Phase Boundary

Phase 20 закрывает цикл procurement-операций ERP: учёт поставщиков с контактами и переговорами, оформление и tracking закупок с мульти-валютной схемой и автоматическим расчётом депозитов/балансовых платежей. План закупок остаётся в scope как third sub-section, но конкретный функционал — лёгкий MVP (forecast view planned purchases) с возможностью расширения в v2.

**В scope:**
- БД `Supplier` + связанные таблицы (контакты, переговоры, per-product параметры)
- Раздел `/procurement/suppliers` — CRUD поставщиков с UI
- Раздел `/procurement/purchases` — CRUD закупок со статусами, multi-payment схемой
- Раздел `/procurement/plan` — MVP forecast view (улучшение существующей заглушки)
- БД курсов валют ЦБ РФ + daily cron
- RBAC через существующий `ERP_SECTION.PROCUREMENT`

**Не в scope (deferred to v2 or separate phases):**
- Уведомления о датах платежей (cron email/Telegram)
- Audit log изменений
- Интеграция с продажами/forecast для plan
- Маршруты карты для inspection coordinates (lat/lng + map embed)
- Связка закупка → новая партия в `ProductCost` (автогенерация)
- Многоязычность UI (русский UI остаётся)

</domain>

<decisions>
## Implementation Decisions

### Database Schema (Поставщики)

- **D-01:** Новая модель `Supplier` с полями:
  - `id String @id @default(cuid())`
  - `nameForeign String` (китайский/любой иностранный исходный)
  - `nameEnglish String` (английский)
  - `buyerEmployeeId String?` FK → `Employee` (наш Закупщик, nullable если сотрудник уволен)
  - `cooperationSummary String?` (резюме сотрудничества, freeform)
  - `createdAt / updatedAt / deletedAt` (soft delete как у Product)

- **D-02:** Контакты поставщика (менеджеры + боссы) в одной таблице через type discriminator:
  - `SupplierContact { id, supplierId, type: SUPPLIER_MANAGER | SUPPLIER_BOSS, name, phone, preferredContact: ContactMethod, preferredContactCustom String?, description String?, isPrimary Boolean @default(false) }`
  - Constraint: только один `isPrimary=true` per (supplierId, type) — enforce in server action (Prisma не поддерживает partial unique через @@unique).
  - `ContactMethod` enum: `WECHAT | PHONE | ALIBABA | OTHER`. Для OTHER — `preferredContactCustom` обязателен.

- **D-03:** Связка Supplier↔Product через explicit link table:
  - `SupplierProductLink { id, supplierId, productId String? (nullable если товар удалён или ещё не заведён), productNameFallback String? (текстовое имя если productId=null) }`
  - Per-product параметры на link:
    - `leadTimeDays Int?` + `leadTimeComment String?`
    - `unitPrice Decimal? @db.Decimal(14, 4)` (precision для микроцен) + `currency String?` (CNY/USD/RUB/...)
    - `deliveryType DeliveryType?` — enum `CARGO | WHITE`
    - `deliveryComment String?`
    - `exclusivityStatus Boolean @default(false)` + `exclusivityTerms String?`
    - `depositPct Decimal? @db.Decimal(5, 2)` (e.g. 30.00 = 30%)
    - `balancePct Decimal? @db.Decimal(5, 2)`
    - `deferralPct Decimal? @db.Decimal(5, 2)`
    - `deferralTerms String?`
    - `inspectionCity String?`
    - `inspectionAddress String?`
    - `inspectionMapUrl String?` (ссылка на Google Maps / Yandex Maps)
  - Constraint: `@@unique([supplierId, productId])` где productId NOT NULL — Postgres partial unique через `CREATE UNIQUE INDEX ... WHERE productId IS NOT NULL` в manual migration SQL.

- **D-04:** Переговоры — отдельная сущность:
  - `Negotiation { id, supplierId, date DateTime, goals String, summary String? (nullable если ещё не прошли), createdAt, updatedAt }`
  - Связь с product через `NegotiationProduct { negotiationId, productId }` (M:N, может обсуждать несколько товаров).
  - Участники через polymorphic link:
    - `NegotiationParticipant { id, negotiationId, employeeId String?, supplierContactId String?, customName String?, customRole String? }`
    - Constraint в server action: ровно одно из (`employeeId`, `supplierContactId`, `customName+customRole`) заполнено.

### Database Schema (Закупки)

- **D-05:** `Purchase`:
  - `id String @id @default(cuid())`
  - `status PurchaseStatus` — enum `PLANNED | ACTIVE | COMPLETED` (default PLANNED при создании)
  - `currency String @default("CNY")` (валюта контракта; ISO 4217 string)
  - `supplierId String` FK → Supplier (один основной поставщик; multi-supplier через D-07)
  - `optionsDescription String?`, `optionsExtraCost Decimal?`, `logisticsCost Decimal?`, `logisticsComment String?`
  - `createdAt / updatedAt`

- **D-06:** Multi-product закупка:
  - `PurchaseItem { id, purchaseId, productId, quantity Int, unitPrice Decimal @db.Decimal(14, 4) }`
  - При создании unitPrice prefills из `SupplierProductLink.unitPrice`, можно изменить вручную.
  - Несколько товаров поставщика в одной закупке.

- **D-07:** Multi-supplier поддержка в Purchase:
  - V1: один Purchase = один Supplier. Если разные поставщики — две отдельные Purchase записи.
  - Аргумент: проще схема, payment schedules per-supplier ясные.
  - **Открытый вопрос для пользователя:** действительно ли нужны mixed-supplier purchases? (Default: нет.)

- **D-08:** Multi-payment схема:
  - `PurchasePayment { id, purchaseId, type: DEPOSIT | BALANCE, ordinal Int (1, 2, ...), percent Decimal? @db.Decimal(5, 2), amount Decimal @db.Decimal(14, 2), currency String, dueDate DateTime, paidDate DateTime?, status PaymentStatus, comment String? }`
  - `PaymentStatus` enum: `PLANNED | PAID | OVERDUE` (computed live via `dueDate < now() AND paidDate IS NULL`, status хранится как cached field на сервере).
  - При создании Purchase: автоматически создаётся 1 Депозит + 1 Баланс через server action `createPurchase`:
    - Депозит: ordinal=1, percent=Supplier.depositPct (или per-link override), amount = items_total * percent / 100, dueDate = createdAt + 3 days.
    - Баланс: ordinal=1, percent=Supplier.balancePct, amount = items_total * percent / 100, dueDate = deposit.dueDate + supplierProductLink.leadTimeDays.
  - User may добавлять Депозит 2, Депозит 3, Баланс 2 и т.д. — UI кнопка «Добавить платёж» с выбором type.
  - User может изменить percent → amount пересчитывается; ИЛИ напрямую ввести amount → percent рассчитывается ровно. Обновление в БД Supplier НЕ влияет на existing Purchase.

### Currency rates (ЦБ РФ)

- **D-09:** `CurrencyRate { id, date Date, code String (CNY/USD/EUR/RUB/...), nominal Int, rateToRub Decimal @db.Decimal(14, 6), syncedAt DateTime }`
  - `@@unique([date, code])`.
  - Source: `https://www.cbr-xml-daily.ru/daily_json.js` — упрощённый JSON, обновляется автоматически каждый рабочий день ~11:30 МСК.
  - Schedule: добавить в dispatcher `wbCbrRateSyncCronTime` (default `"12:00"` МСК — даём CBR 30 мин на публикацию).
  - Fallback: если cron пропустил день — UI fallback на latest available rate с warning badge.
  - Helper `lib/cbr-rates.ts` с `fetchCbrRates()` + `getLatestRate(code)`.

### Routes & RBAC

- **D-10:** `ERP_SECTION.PROCUREMENT` (уже существует в enum). Один section ID, sub-разделы через UI tabs:
  - `/procurement` → redirect на `/procurement/suppliers`
  - `/procurement/suppliers` — список + CRUD поставщиков
  - `/procurement/suppliers/[id]` — детальная страница поставщика с табами Контакты / Товары / Переговоры
  - `/procurement/purchases` — список + CRUD закупок
  - `/procurement/purchases/[id]` — детальная закупка с payments
  - `/procurement/plan` — MVP forecast view
- **D-11:** RBAC:
  - Read (list views, detail): `requireSection("PROCUREMENT")`
  - Write (all server actions): `requireSection("PROCUREMENT", "MANAGE")`

### UI Patterns

- **D-12:** Sticky data-tables как в `/stock/wb`, `/prices/wb` (см. CLAUDE.md). НЕ shadcn `<Table>` — raw HTML table с sticky thead.
- **D-13:** Каскадные фильтры на `/procurement/suppliers`: Закупщик / Бренд / Категория / Подкатегория (через связку с Product). На `/procurement/purchases`: Статус / Период / Поставщик / Закупщик.
- **D-14:** CRUD через modal dialogs (Employee/Product pattern), не отдельные create-страницы (отличие от /products где есть `/products/new`).
- **D-15:** Контакты + переговоры на supplier detail page — табы / accordion sections. Многострочные textarea для summary с auto-resize.
- **D-16:** Multi-payment UI в Purchase form: вертикальный список карточек с inline-editing percent+amount+date, кнопка «Добавить депозит» / «Добавить баланс» снизу каждой группы.

### Numeric & locale

- **D-17:** Все денежные значения — `Decimal @db.Decimal(14, 2)` (precision до сотых), unit prices `(14, 4)`, percents `(5, 2)` (e.g. 30.00).
- **D-18:** Формат отображения: ru-RU locale, тысячи с пробелом (как в `/ads/wb` Spend Summary). Currency code справа от значения.
- **D-19:** Даты — `DateTime` в БД, отображение МСК через `getMskTodayString()` helper (используется в Phase 19).

### Deletion strategy

- **D-20:** Soft delete для Supplier (`deletedAt DateTime?`), как у Product. При soft delete: вычисление `cascadeArchive`:
  - `SupplierProductLink`, `SupplierContact`, `Negotiation` — остаются (history preservation), но `Supplier.deletedAt` фильтрует их из активных queries.
  - `Purchase` с этим supplierId — НЕ архивируются (закупка может быть active, история нужна).
- **D-21:** Hard delete `Purchase` — запрещён если status != PLANNED. PLANNED можно удалить полностью (cascade на PurchaseItem + PurchasePayment).

### Claude's Discretion

- Точное расположение Sidebar item (порядок в навигации): между «Себестоимость партий» и «План продаж» (по бизнес-логике).
- Дефолтная сортировка таблиц (suppliers → buyer ASC; purchases → createdAt DESC).
- Color coding статусов: PLANNED — серый, ACTIVE — синий, COMPLETED — emerald (зелёный). PaymentStatus: PLANNED — серый, PAID — emerald, OVERDUE — красный.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project conventions (MANDATORY READ)
- [CLAUDE.md](../../CLAUDE.md) — все паттерны проекта: Sticky data-таблицы, Каскадные фильтры, иерархическая сортировка, Conventions блок
- [CLAUDE.md «Связи между таблицами БД»](../../CLAUDE.md) — Product, Employee, User модели + relations

### Existing schema patterns
- [prisma/schema.prisma:497-560](../../prisma/schema.prisma) — Employee + EmployeeCompany + EmployeePhone + EmployeeEmail + EmployeePass (паттерн для SupplierContact / Negotiation)
- [prisma/schema.prisma:355-490](../../prisma/schema.prisma) — Product, MarketplaceArticle, Barcode (паттерн soft delete + relation parent)
- [prisma/schema.prisma:568+](../../prisma/schema.prisma) — AppSetting KV (паттерн хранения cron schedules)

### Server actions patterns
- [app/actions/employees.ts](../../app/actions/employees.ts) — CRUD with nested phones/emails (Reference для SupplierContact pattern)
- [app/actions/products.ts](../../app/actions/products.ts) — Product CRUD + soft delete + duplicate

### UI patterns
- [components/employees/EmployeesTable.tsx](../../components/employees/EmployeesTable.tsx) — sticky table + filters + modal pattern
- [components/employees/EmployeeModal.tsx](../../components/employees/EmployeeModal.tsx) — multi-section form pattern (для SupplierForm)
- [components/products/ProductForm.tsx](../../components/products/ProductForm.tsx) — useFieldArray для nested arrays (контакты)

### Cron + dispatcher
- [app/api/cron/dispatch/route.ts](../../app/api/cron/dispatch/route.ts) — единый dispatcher (добавить `cbr-rate-sync` branch)
- [lib/wb-cron-schedule.ts](../../lib/wb-cron-schedule.ts) — `shouldFireCron` helper + `getMskTodayString`

### Spend visualization patterns (reuse для UI metrics в /procurement)
- [components/ads/SpendSummary.tsx](../../components/ads/SpendSummary.tsx) — summary cards pattern
- [components/ads/TopSpendingCampaigns.tsx](../../components/ads/TopSpendingCampaigns.tsx) — status badges pattern

### External API
- [CBR XML/JSON feed](https://www.cbr-xml-daily.ru/daily_json.js) — daily currency rates (упрощённый JSON), нет auth, low rate limit. Альтернатива: `https://www.cbr.ru/scripts/XML_daily.asp?date_req=DD/MM/YYYY` (raw XML).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Employee model + relations** (`prisma/schema.prisma:497-560`) — direct pattern for `Supplier` + `SupplierContact` + `Negotiation`. Same nested arrays via `phones[]`, `emails[]`, `passes[]` → `contacts[]`, `negotiations[]`.
- **CreatableCombobox** (`components/ui/creatable-combobox.tsx`) — inline-create для Закупщик dropdown (если ещё нет сотрудника, можно создать). Стандарт проекта.
- **MultiSelectDropdown** (`components/ui/multi-select-dropdown.tsx`) — для filters (Закупщик, Бренд, Категория).
- **getMskTodayString** (`lib/wb-cron-schedule.ts`) — MSK даты для default due dates (deposit = createdAt + 3 days).
- **AppSetting KV** — `cbrRateSyncCronTime` (default "12:00"), `cbrRateSyncLastRun` (date string).
- **Dispatcher pattern** (`app/api/cron/dispatch/route.ts`) — добавить branch для `cbr-rate-sync` после `adv-upd`.
- **SpendSummary / TopSpendingCampaigns** (`components/ads/`) — паттерны для UI metrics в /procurement/plan.

### Established Patterns

- **Soft delete на Product** — `deletedAt DateTime?` + где-нибудь `deletedAt: null` в filter clauses. Применяем к Supplier.
- **Иерархическая сортировка товаров** — `PRODUCT_HIERARCHY_ORDER_BY` из `lib/product-order.ts`. Применить к Product references в Supplier/Purchase listings.
- **Per-user UI настройки** — поле на User (Int[]/String с @default([])) для скрытых колонок / фильтров. НЕ localStorage.
- **Server actions** — `"use server"` + `await requireSection("X", "MANAGE")` + try/catch + `revalidatePath`. Шаблон во всех `app/actions/*.ts`.
- **Native HTML select для simple dropdowns** — НЕ base-ui Select (CLAUDE.md convention).
- **Decimal precision pattern** — `Decimal @db.Decimal(14, 2)` для денег (Phase 19 WbAdvertSpendRow), `Decimal @db.Decimal(5, 2)` для percent (новое для Phase 20).
- **Status enums** — `PurchaseStatus`, `PaymentStatus`, `DeliveryType`, `ContactMethod`, `SupplierContact.type` — все новые enums в Phase 20 migration.

### Integration Points

- **Sidebar nav** — `components/layout/nav-items.ts` — добавить `Procurement` entry с иконкой `Truck` или `Package` (Lucide).
- **`PROCUREMENT` ERP_SECTION уже в enum** — `requireSection("PROCUREMENT")` сразу работает.
- **План закупок** — уже есть заглушка в `app/(dashboard)/procurement/page.tsx` или подобной (требуется проверить в Phase 20 research).
- **Product references** — все таблицы с productId? используют тот же FK pattern + nullable для гибкости (товар может быть удалён).
- **Employee.user FK** — закупщик это Employee с возможным User account; UI должен показать имя сотрудника, не email пользователя.

</code_context>

<specifics>
## Specific Ideas

### From user prompt (verbatim references)

- **Способ связи поставщика** — "вичат, телефон, алибаба, свой вариант" — отображается в этом порядке в селекте.
- **Имена менеджеров/боссов** — "на английском или китайском" — UTF-8 поле, без транслитерации.
- **Контактный номер** — "в международном формате" — стандарт E.164 (+86 ..., +7 ...). Валидация в форме.
- **Карго или белая доставка** — два варианта. Опционально: comment в случае гибридов.
- **Эксклюзивность** — статус boolean + freeform terms текст.
- **Платёжные условия** — % депозита + % баланса + % отсрочки. Часто сумма этих = 100%, но не constraint (отсрочка может перекрывать с балансом в схемах поставщика).
- **Дата депозита по умолчанию** — "+3 календарных дня от создания закупки".
- **Дата баланса по умолчанию** — "дата депозита + Срок готовности товара из БД Поставщики". → используем SupplierProductLink.leadTimeDays.
- **Опции / стоимость с опциями / логистика** — три отдельных freeform поля, добавляются в Purchase.

</specifics>

<deferred>
## Deferred Ideas

### v2 / Future phases

1. **Audit log** для изменений Supplier / Purchase / Payment — требует AuditLog table + middleware. Не в Phase 20.
2. **Уведомления** о приближающихся датах платежей — cron + email/Telegram. Отдельная фаза «Notifications».
3. **Интеграция с продажами** для Plan: forecast spend на 3-6 месяцев на основе sales velocity × current stock + lead times. Sophisticated feature, отдельная фаза «Procurement Forecast».
4. **Карта Google Maps** embed inside `/procurement/suppliers/[id]` — lat/lng + iframe. v2.
5. **Связка Purchase → новая партия в ProductCost** — автоматическое создание batch при completion. Поляризированная архитектурная decision: либо trigger в server action, либо отдельный action user'a "Создать партию из закупки".
6. **Multi-supplier purchases** — если бизнес реально мiks разных suppliers в одной закупке, нужна junction table `PurchaseSupplier`. По умолчанию: один Purchase = один Supplier.
7. **История курсов валют ЦБ** — backfill за 1-2 года для retrospective unit-economics. Можно сделать через `for-each-date` loop. v2.
8. **Print/export** — PDF договора закупки, Excel экспорт payment schedule. v2.
9. **Multi-currency Purchase** — если разные товары в одной закупке в разных валютах. v1: одна валюта на Purchase.

### Questions for User (review next morning)

**КРИТИЧЕСКИЕ — могут изменить schema:**

1. **План закупок** — что это конкретно? Default v1 = aggregated forecast view (SUM суммы PLANNED purchases по месяцам). Реализовать сейчас или отдельная фаза?
2. **Multi-supplier purchases** — нужно ли в одной закупке иметь несколько поставщиков? Default: нет (один Supplier per Purchase).
3. **Multi-currency** — может ли одна закупка содержать товары в разных валютах? Default: нет (одна currency на Purchase).
4. **Связка с ProductCost** — при completion закупки автоматически создавать новую партию `ProductCost`? Default: нет, ручной trigger.
5. **Координаты для inspection address** — нужны lat/lng отдельные поля + map embed? Default: только text URL.

**ВАЖНЫЕ — могут изменить UI:**

6. **Sidebar порядок** — какое место в навигации? Default: после «Себестоимость партий», до «План продаж».
7. **MVP plan закупок** — список PLANNED purchases с total spend по месяцам? Или что-то другое?
8. **PaymentStatus transitions** — кто меняет статус PAID? Manual click button в UI или auto при загрузке банк-чека?
9. **Notifications** для overdue payments — UI badge (default) или email/Telegram?

**НИЗКИЙ ПРИОРИТЕТ:**

10. **Hard delete vs cascade soft delete для Negotiation/SupplierContact** — что делать при удалении Supplier?
11. **Уникальность Supplier.nameForeign** — может ли быть два поставщика с одинаковым именем? Default: нет ограничений (free text).

</deferred>

---

*Phase: 20-procurement*
*Context gathered: 2026-05-20 (--auto mode)*
*All decisions are defaults — review by user 2026-05-21*
