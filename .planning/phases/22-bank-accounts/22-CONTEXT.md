# Phase 22 — Банковские счета: CONTEXT

**Дата discuss:** 2026-06-10
**Раздел:** `/bank` — новый `ERP_SECTION.BANK`
**Цель этапа 1:** Сформировать БД банковских операций по всем компаниям группы + импорт выписок из Excel с защитой от дублирования + read-only просмотр + базовая категоризация. БЕЗ связей с закупками/кредитами/ДДС (следующие этапы).

---

## Решения (AskUserQuestion 2026-06-10)

| # | Вопрос | Решение |
|---|--------|---------|
| 1 | «Наши компании» | **Расширить существующую `Company`** (не новая модель). Добавить ИНН/реквизиты, `BankAccount → Company`. Компании автоматически пересекаются с Кредитами (`Loan.companyId`). |
| 2 | Банки/кредиторы | **Новый `Bank` (по БИК)** + nullable FK `Lender → Bank`. `Lender` (кредиты) не трогаем по структуре, только добавляем опц. связь на будущее. |
| 3 | Контрагенты | **Отдельная таблица `Counterparty`**, дедуп по ИНН, операции ссылаются FK. |
| 4 | Scope | Минимальный **+ базовая ручная разметка/категоризация** операций под будущий ДДС. |

---

## Источник данных

Папка `C:\Users\User\zoiten-pro\Выписки\` (**untracked**, не коммитить — содержит реальные банковские данные). 9 файлов XLSX за период **01.01.2026–10.06.2026**:

- **2× ВТБ:** `VTB_BankStatement_some_accounts_*.xlsx` — multi-sheet (1 лист = 1 счёт), есть **мультивалютные** счета (CNY).
- **2× ПСБ:** `Выписка по счету ...NNNNNN за 01.01.2026 - 10.06.2026..xlsx` — Банк ПСБ (Промсвязьбанк), 1 лист.
- **5× СберБизнес:** `СберБизнес. Выписка за 2026.01.01-2026.06.10 счёт NNNN.xlsx` — 1 лист, merged cells.

⚠ `xlsx` (^0.18.5) уже в зависимостях. При чтении ВТБ-файлов библиотека печатает `Bad uncompressed size` warnings в stderr — **данные читаются корректно**, warnings игнорировать (это особенность их zip-контейнера).

---

## Форматы выписок (3 адаптера)

### Адаптер 1 — ВТБ (`VTB_BankStatement_*`)
- **Multi-sheet:** каждый лист = отдельный счёт, **имя листа = номер счёта** (напр. `40702810800810087464`).
- Шапка листа (строки 0–5): `Номер счета`, `Валюта` (напр. «Валюта 156, Китайский юань» → CNY; рублёвые — RUR), `Владелец счёта` (наша компания), `Начальная/Конечная дата`, `Входящий/Исходящий остаток`.
- **Строка заголовков — индекс 6.** Колонки (полный вариант, CNY-счёт): `Дата | Номер | Вид операции | Контрагент | ИНН контрагента | БИК банка контрагента | Счет контрагента | Дебет CNY | Кредит CNY | Дебет RUR | Кредит RUR | Назначение`.
- ⚠ **КРИТИЧНО — колонки header-driven, не позиционные:** на **рублёвых** счетах CNY-пара колонок ОТСУТСТВУЕТ → всего 10 колонок (`... | Счет контрагента | Дебет RUR | Кредит RUR | Назначение`). На CNY-счетах — 12 колонок. **Маппить по тексту заголовка строки 6, а не по фикс-индексу.**
- Последняя строка — `ИТОГО:` (пропускать).
- Листы без операций (только депозитные/нулевые) → 0 строк данных, пропускать.
- Дата: `DD.MM.YYYY`. Суммы: строка с разделителем тысяч запятой (`6,057,806.46`) и точкой-десятичной → нормализовать.
- Дебет = расход (списание), Кредит = приход. Знак направления хранить отдельным полем.

### Адаптер 2 — ПСБ (`Выписка по счету ...`)
- 1 лист (`Отчет 1`). Шапка: строка 0 = филиал банка («ЯРОСЛАВСКИЙ Ф-Л ПАО "Банк ПСБ"…»), строка 2 = «Выписка из лицевого счета 40…», строка 4 = наша компания (`ООО "ГЕЙМ БЛОКС"`).
- **Заголовки — индекс 6:** `Дата | РО | Док. | КБ(БИК) | Внеш.счет | Счет | Дебет | Кредит | Назначение | Контрагент | Контр. ИНН`.
- Строка 7 = «Входящее сальдо» (пропустить). Данные с индекса 8.
- `КБ` = БИК банка контрагента; `Внеш.счет` = счёт контрагента; `Счет` = корсчёт (30101…) — НЕ наш расчётный (наш счёт берём из шапки строки 2).
- Комиссии банка: контрагент = сам банк (ИНН банка), счета 70601…/47422… — это служебные, помечать категорией «Комиссия банка».

### Адаптер 3 — СберБизнес (`СберБизнес. Выписка …`)
- 1 лист, имя листа = номер счёта. **Merged cells** — много пустых колонок, читать `raw:false`, схлопывать.
- Шапка строки 1–7: дата формирования, «ПАО СБЕРБАНК», номер счёта (строка 4, ~колонка 11), наша компания (строка 5), период, валюта.
- **Заголовки — индекс 9–10 (двухуровневые):** `Дата проводки | Счет(Дебет/Кредит) | Сумма по дебету | Сумма по кредиту | № документа | ВО(вид операции) | Банк (БИК и наименование) | Назначение платежа`.
- Данные с индекса 11. Первая колонка данных — служебный составной id (`46024.18197` = дата проводки в формате Сбера + порядковый); **дата операции парсится из колонки «Дата проводки»**, не из этого id.
- В колонке «Счет» две строки в одной ячейке (через `\n`): счёт контрагента + его ИНН (напр. `70601810817002780299\n7707083`). Парсить обе.
- «Банк (БИК и наименование)»: `БИК 047003608 Ивановское отд…` → извлечь БИК regex `БИК\s+(\d{9})`.
- Суммы с запятой-разделителем тысяч (`5,571,064.72`).

**Общий принцип адаптера:** `detectFormat(workbook) → 'vtb' | 'psb' | 'sber'` (по имени файла + сигнатуре шапки), затем формат-специфичный парсер → нормализованный `ParsedTransaction[]`. Каждая нормализованная операция: `{ companyName, accountNumber, currency, date, docNumber, operationType, debit, credit, direction, counterpartyName, counterpartyInn, counterpartyBic, counterpartyAccount, purpose, rawRow }`.

---

## Предлагаемая схема (на уточнение в plan-phase)

```prisma
// Расширение существующей Company
model Company {
  // ...существующие name, employees, loans...
  inn        String?  @unique   // ИНН
  kpp        String?
  ogrn       String?
  shortName  String?            // короткое имя для UI
  accounts   BankAccount[]
}

model Bank {
  id        String   @id @default(cuid())
  bic       String   @unique     // БИК (9 цифр) — ключ дедупа
  name      String                // наименование (из выписок, редактируемое)
  accounts  BankAccount[]
  lenders   Lender[]              // обратная связь (опц.)
  createdAt DateTime @default(now())
}

// Добавить в существующий Lender:
//   bankId String?  + bank Bank? @relation(...)  (nullable, на будущее)

model BankAccount {
  id            String   @id @default(cuid())
  number        String   @unique   // номер расчётного счёта (40702…)
  companyId     String
  company       Company  @relation(...)
  bankId        String
  bank          Bank     @relation(...)
  currency      String   @default("RUR")  // RUR | CNY | …
  transactions  BankTransaction[]
  createdAt     DateTime @default(now())
}

model Counterparty {
  id           String   @id @default(cuid())
  inn          String?  @unique   // дедуп по ИНН (nullable — у банка/физлиц может не быть)
  name         String
  transactions BankTransaction[]
  createdAt    DateTime @default(now())
}

model BankTransaction {
  id              String        @id @default(cuid())
  accountId       String
  account         BankAccount   @relation(...)
  date            DateTime      @db.Date
  direction       TxDirection   // DEBIT | CREDIT
  amount          Decimal       @db.Decimal(18, 2)
  currency        String
  docNumber       String?
  operationType   String?       // вид операции / ВО
  purpose         String        @db.Text   // назначение платежа
  counterpartyId  String?
  counterparty    Counterparty? @relation(...)
  // денорм. поля контрагента из выписки (на случай отсутствия в справочнике)
  counterpartyName    String?
  counterpartyInn     String?
  counterpartyBic     String?
  counterpartyAccount String?
  category        TxCategory?   @default(UNCATEGORIZED)  // базовая разметка под ДДС
  // дедуп + provenance
  fingerprint     String        @unique
  importBatchId   String?
  importBatch     ImportBatch?  @relation(...)
  sourceBank      String        // 'vtb'|'psb'|'sber'
  createdAt       DateTime      @default(now())

  @@index([accountId, date])
  @@index([category])
}

model ImportBatch {
  id           String   @id @default(cuid())
  fileName     String
  sourceBank   String
  rowsTotal    Int
  rowsImported Int
  rowsSkipped  Int        // дубликаты
  importedById String?
  createdAt    DateTime @default(now())
  transactions BankTransaction[]
}

enum TxDirection { DEBIT CREDIT }
enum TxCategory {
  UNCATEGORIZED
  INTERNAL_TRANSFER   // перевод между своими счетами / депозит
  BANK_FEE            // комиссия банка
  SUPPLIER_PAYMENT    // оплата поставщику
  INCOME              // поступление выручки
  TAX                 // налоги/сборы
  LOAN                // кредит/проценты
  OTHER
}
```

---

## Дедупликация (защита от пересечения выписок)

**Проблема:** выписки могут пересекаться по дням (повторная загрузка периода). Нельзя плодить дубли.

**Решение — `fingerprint` (SHA-256 hex) от нормализованного кортежа:**
`accountNumber | date(YYYY-MM-DD) | direction | amount(2dp) | docNumber | counterpartyInn | normalize(purpose)`

- `@unique` на `fingerprint` → повторный импорт той же операции = no-op (skipDuplicates / upsert-by-fingerprint).
- `normalize(purpose)` = trim + схлопывание пробелов + lowercase (защита от незначимых различий пробелов между выгрузками).
- Импорт идемпотентен: повторная загрузка пересекающегося файла → `rowsSkipped` растёт, новых строк 0.
- ⚠ Риск ложного слияния: две **реально разные** операции в один день, одинаковая сумма/контрагент/назначение, без docNumber. Митигация: docNumber входит в ключ (у Сбера/ПСБ/ВТБ он есть почти всегда). Открытый вопрос — обсудить в plan: добавлять ли порядковый индекс строки внутри (account, date) как tie-breaker. Решение: **НЕ добавлять** позиционный индекс (ломает идемпотентность при изменении порядка строк между выгрузками); полагаться на docNumber.

---

## Scope

**В этапе 1 (входит):**
- Схема: расширение Company + Bank + BankAccount + Counterparty + BankTransaction + ImportBatch + TxCategory.
- `ERP_SECTION.BANK` + полная проводка раздела (6-точечный чеклист CLAUDE.md).
- Импортёр Excel (3 адаптера + detectFormat + дедуп + ImportBatch отчёт) — server action + UI кнопка загрузки.
- Авто-создание/линковка Company (по ИНН/имени из шапки), Bank (по БИК), BankAccount (по номеру), Counterparty (по ИНН) при импорте.
- Read-only таблица `/bank`: список операций с фильтрами (компания / счёт / банк / дата / направление / категория / поиск по назначению+контрагенту), sticky-таблица по паттерну проекта.
- Ручная категоризация операции (select `TxCategory`) — inline.
- Разовый импорт 9 файлов из `Выписки/` (seed-скрипт / через UI).

**НЕ входит (следующие этапы):**
- Связь операций с закупками (`PurchasePayment`), кредитами (`LoanPayment`).
- Отчёт ДДС / cash-flow.
- Авто-категоризация (правила/ML).
- Сверка остатков (входящий/исходящий баланс vs сумма операций).
- Редактирование операций (только просмотр + категория).

---

## Проводка нового раздела (чеклист CLAUDE.md — обязательно все 6)

1. `prisma/schema.prisma` — `ERP_SECTION.BANK` в enum + миграция `ALTER TYPE "ERP_SECTION" ADD VALUE 'BANK'`.
2. `lib/sections.ts` — `SECTION_PATHS["/bank"]`.
3. `components/layout/section-titles.ts` — заголовок «Банковские счета».
4. `components/layout/nav-items.ts` — пункт Sidebar (иконка Landmark/Wallet).
5. `lib/section-labels.ts` → `SECTION_OPTIONS` — ⚠ ЧАСТО ЗАБЫВАЮТ (иначе нет тумблера VIEW/MANAGE в /admin/users).
6. (опц.) карточка на дашборде.
+ Провизионить `UserSectionRole` существующим пользователям (memory: feedback_zoiten_new_section_rbac) — спросить кому нужен доступ.

---

## Открытые вопросы для plan-phase / researcher

1. Маппинг наша-компания: в выписках имя «ООО "ГЕЙМ БЛОКС"», в Company `name` = «ГЕЙМ БЛОКС» (без ООО). Нужен нормализатор имени ИЛИ матч по ИНН из выписки. **Предпочтительно — по ИНН** (надёжнее), имя как fallback. Уточнить: у всех 6 компаний группы заполнить ИНН вручную (seed) до импорта?
2. Валюта CNY: хранить операцию в её валюте (CNY amount) — конвертацию в RUR не делаем на этапе 1. Подтвердить.
3. Депозитные счета ВТБ (42102…) — это наши счета? Включать как BankAccount или помечать категорией INTERNAL_TRANSFER? (склоняюсь: включать счёт, операции категория INTERNAL_TRANSFER/депозит).
4. Импорт UI: одна кнопка с авто-детектом формата по файлу, или выбор банка вручную? (склоняюсь: авто-детект + показать определённый формат перед импортом).
5. Сидинг: положить 9 файлов в repo нельзя (реальные данные, untracked). Разовый импорт через UI пользователем ИЛИ скрипт читающий из `Выписки/` локально (не в git). (склоняюсь: оба — UI основной путь, плюс `scripts/import-bank-statements.cjs` для разового локального прогона).

---

## Предлагаемая разбивка на планы (на финализацию в plan-phase)

- **22-01** — Schema + миграция (Company extension + Bank + BankAccount + Counterparty + BankTransaction + ImportBatch + enums + Lender.bankId) + `ERP_SECTION.BANK`.
- **22-02** — Проводка раздела: sections / section-titles / nav-items / section-labels + RBAC + страница-заглушка `/bank`.
- **22-03** — `lib/bank-import/` — detectFormat + 3 адаптера + нормализация + fingerprint + vitest на реальных fixture-строках (golden).
- **22-04** — Server action импорта (upsert Company/Bank/Account/Counterparty + dedup + ImportBatch отчёт) + UI кнопка загрузки + результат импорта.
- **22-05** — Read-only таблица `/bank` (sticky, каскадные фильтры, поиск) + inline категоризация + разовый импорт 9 файлов + UAT.
