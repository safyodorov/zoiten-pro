---
phase: quick-260710-mja
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/wb-commission-iu-parser.ts
  - tests/wb-commission-iu-parser.test.ts
  - app/api/wb-commission-iu/route.ts
autonomous: true
requirements: [QUICK-260710-mja]

must_haves:
  truths:
    - "Загрузка нового формата ИУ пишет fbw из колонки «Склад WB (FBW)», а не из «Самовывоз (C&C)»"
    - "Каждая из 6 комиссий нового формата (fbw/fbs/dbs/express/pickup/booking) попадает в правильное поле по заголовку, невзирая на ZWSP в шапке"
    - "Старый формат парсится с теми же значениями, что и раньше (fbw=col2, fbs=dbs=col4, express=col5, pickup=col6, booking=col7)"
    - "Дубликат subjectName не роняет транзакцию @unique — первая запись выигрывает"
    - "Нераспознанный/неполный новый заголовок бросает понятную русскую ошибку (route → 400), а не тихо пишет мусор"
    - "npm run test зелёный на новом тест-файле; route.ts остаётся тонким (auth/formData/XLSX/транзакция/snapshot не тронуты)"
  artifacts:
    - path: "lib/wb-commission-iu-parser.ts"
      provides: "Pure-функция parseWbCommissionIuRows(rows) с header-детектом обоих форматов"
      min_lines: 60
      exports: ["parseWbCommissionIuRows", "WbCommissionIuRecord"]
    - path: "tests/wb-commission-iu-parser.test.ts"
      provides: "Синтетические тесты обоих форматов (ZWSP, пустой предмет, дубликат, ошибка)"
      min_lines: 70
    - path: "app/api/wb-commission-iu/route.ts"
      provides: "Тонкий route, делегирующий парсинг в pure-функцию"
      contains: "parseWbCommissionIuRows"
  key_links:
    - from: "app/api/wb-commission-iu/route.ts"
      to: "lib/wb-commission-iu-parser.ts"
      via: "import + вызов после XLSX sheet_to_json(header:1)"
      pattern: "parseWbCommissionIuRows"
    - from: "lib/wb-commission-iu-parser.ts (header regex)"
      to: "правильный индекс колонки"
      via: "case-insensitive regex по нормализованной шапке (маппинг верифицирован против Tariffs API)"
      pattern: "маркетплейс|склад\\s*wb|витрина\\s*\\(dbs\\)"
---

<objective>
Починить парсер Excel в `POST /api/wb-commission-iu`. WB сменил формат выгрузки комиссий ИУ с ~07.07.2026 — колонки теперь в другом порядке. Текущий код читает по ФИКСИРОВАННЫМ позициям старого формата и с новым файлом молча записал бы мусор (в `fbw` ушёл бы «Самовывоз C&C» 44.5, в `fbs`/`dbs` — «Витрина экспресс» 3%).

Решение: вынести парсинг в pure-функцию с определением колонок ПО ЗАГОЛОВКАМ (regex, case-insensitive), поддержать оба формата (детект по наличию «Маркетплейс» / «(FBW)» в шапке → новый; иначе легаси-позиции как сейчас), покрыть vitest-тестами на синтетических массивах.

Purpose: не допустить тихой записи мусора при смене формата WB; сделать парсинг тестируемым и устойчивым к перестановке колонок.
Output: `lib/wb-commission-iu-parser.ts` (pure) + `tests/wb-commission-iu-parser.test.ts` + тонкий `route.ts`.
</objective>

<note_invisible_chars>
⚠ ВАЖНО про невидимые символы. WB вставляет в шапку нового формата ZERO-WIDTH SPACE (U+200B).
В ЭТОМ ПЛАНЕ и в КОДЕ используйте ТОЛЬКО экранированную запись `\u200B` (а не литеральный невидимый символ) —
чтобы код/тесты были читаемы, копируемы и ревьюились. Так же для BOM `\uFEFF` и NBSP `\u00A0`.
Не вставляйте литеральные невидимые символы в исходники.
</note_invisible_chars>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Текущий route (парсер, который правим — вынести логику наружу, транзакцию/snapshot НЕ трогать)
@app/api/wb-commission-iu/route.ts

# Референс паттерна pure-парсера Excel (вынесен из route ради vitest)
@lib/parse-auto-promo-excel.ts

# Референс vitest-теста без React/next импортов
@tests/excel-auto-promo.test.ts

<interfaces>
<!-- Схема таблицы-приёмника (записывается через createMany). Все комиссии — Float. -->
<!-- parentName=col0 (Категория), subjectName=col1 (Предмет) — ОДИНАКОВЫ в обоих форматах. -->
Prisma model WbCommissionIu (prisma/schema.prisma:414):
  id          String @id @default(cuid())
  parentName  String        // родительская категория WB (col0 в обоих форматах)
  subjectName String @unique // предмет — ключ связки с WbCard.category (col1 в обоих форматах)
  fbw         Float          // Склад WB, %
  fbs         Float          // Маркетплейс (новый) / Склад продавца→DBS (легаси), %
  dbs         Float          // Витрина (DBS)/Курьер WB, %
  express     Float          // Экспресс, %
  pickup      Float          // Самовывоз, %
  booking     Float          // Бронирование, %

vitest.config.ts: alias "@" → корень проекта; pool "vmForks"; include tests/**/*.test.ts.
xlsx: `XLSX.utils.sheet_to_json(sheet, { header: 1 })` → массив строк (row[0] — шапка).
</interfaces>

<format_reference>
<!-- НОВЫЙ формат (реальный образец commission.xlsx, 7421 предмет). Индексы 0-based: -->
<!-- ⚠ Позиции ПОЛНОСТЬЮ отличаются от легаси: col2 в новом = Самовывоз, НЕ Склад WB. -->
  0: "Категория"                                       → parentName (по позиции)
  1: "Предмет"                                         → subjectName (по позиции)
  2: "Самовывоз из магазина продавца (C&C), %"         → pickup
  3: "Витрина (DBS)/<U+200B>Курьер WB (DBW), %"        → dbs   ⚠ ZWSP (\u200B) стоит между «/» и «Курьер»
  4: "Витрина экспресс (EDBS), %"                      → express
  5: "Маркетплейс (FBS), %"                            → fbs
  6: "Склад WB (FBW), %"                               → fbw
  7: "Бронирование, %"                                 → booking

<!-- В коде/тесте строку dbs собирать как: "Витрина (DBS)/" + "\u200B" + "Курьер WB (DBW), %" -->

<!-- СТАРЫЙ (легаси) формат — сохранить текущее поведение route.ts 1:1: -->
  0: Категория → parentName
  1: Предмет   → subjectName
  2: Склад WB %       → fbw
  3: Склад продавца % → (не используется — col3 пропущен в текущем коде)
  4: DBS %            → fbs И dbs (обе из col4, как сейчас)
  5: Экспресс %       → express
  6: Самовывоз        → pickup
  7: Бронирование     → booking

Маппинг нового формата верифицирован против Tariffs API 1:1:
  fbw=Склад WB (FBW)=paidStorageKgvp · fbs=Маркетплейс (FBS)=kgvpMarketplace ·
  dbs=Витрина (DBS)/Курьер WB (DBW)=kgvpSupplier · express=Витрина экспресс (EDBS)=kgvpSupplierExpress ·
  pickup=Самовывоз (C&C)=kgvpPickup · booking=Бронирование=kgvpBooking
</format_reference>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure-парсер lib/wb-commission-iu-parser.ts + vitest-тесты (оба формата)</name>
  <files>lib/wb-commission-iu-parser.ts, tests/wb-commission-iu-parser.test.ts</files>
  <behavior>
    Экспорт `parseWbCommissionIuRows(rows: unknown[][]): WbCommissionIuRecord[]`
    и интерфейс `WbCommissionIuRecord { parentName; subjectName; fbw; fbs; dbs; express; pickup; booking }` (числа = number).

    Тесты (синтетические массивы, БЕЗ бинарных фикстур; ZWSP только через `\u200B`):
    - НОВЫЙ формат happy path: шапка ровно как в format_reference; dbs-ячейку (col3) собрать как
      `"Витрина (DBS)/" + "\u200B" + "Курьер WB (DBW), %"`; + 2 data-row.
      Проверить, что значение из col2 «Самовывоз (C&C)» уходит в `pickup` (НЕ в fbw), из col6 «Склад WB (FBW)» — в `fbw`,
      col5 «Маркетплейс» → fbs, col3 «Витрина (DBS)…» → dbs, col4 «Витрина экспресс» → express, col7 → booking.
      (Это прямая проверка фикса: легаси-код записал бы pickup-значение в fbw.)
    - НОВЫЙ формат, строка с пустым предметом (col1 = "" или пробелы) → пропущена.
    - НОВЫЙ формат, дубликат subjectName (две строки с одинаковым предметом, разные числа) → в результате одна запись, первая выигрывает.
    - ЛЕГАСИ формат happy path: шапка «Категория|Предмет|Склад WB %|Склад продавца %|DBS %|Экспресс %|Самовывоз|Бронирование» + data.
      Проверить fbw=col2, fbs===dbs===col4, express=col5, pickup=col6, booking=col7 (совпадает с текущим route.ts).
    - Нераспознанный новый заголовок: шапка содержит «Маркетплейс» (сигнал нового формата), но НЕТ колонки «Склад WB (FBW)» →
      `expect(() => parseWbCommissionIuRows(rows)).toThrow(/не.*распозна|не.*найдена колонк/i)` (понятное русское сообщение).
  </behavior>
  <action>
    Создать `lib/wb-commission-iu-parser.ts` — pure-TS, БЕЗ импортов next/next-auth (импортировать xlsx НЕ нужно — вход уже rows).
    Русские комментарии, паттерн как `lib/parse-auto-promo-excel.ts`.

    1) Экспортировать интерфейс `WbCommissionIuRecord` (parentName, subjectName, fbw, fbs, dbs, express, pickup, booking — все числа).

    2) Хелпер `norm(c: unknown): string` — нормализация ячейки шапки для матчинга. Использовать ЭКРАНИРОВАННЫЕ escape-коды (не литералы):
       `String(c ?? "").replace(/\u200B/g, "").replace(/\uFEFF/g, "").replace(/\u00A0/g, " ").trim()`
       (убирает ZERO-WIDTH SPACE \u200B и BOM \uFEFF, NBSP \u00A0 → пробел — иначе ZWSP в шапке dbs ломает матчинг; `\s` в regex ZWSP НЕ ловит).

    3) `parseWbCommissionIuRows(rows)`:
       - Если `rows.length < 2` → вернуть `[]` (route уже проверяет пустоту отдельным сообщением).
       - `header = (rows[0] ?? []).map(norm)`.
       - Детект формата: `isNew = header.some(h => /маркетплейс/i.test(h) || /\(fbw\)/i.test(h))`.
         (Легаси-шапка не содержит ни «Маркетплейс», ни «(FBW)» — только «Склад WB %», «DBS %».)
       - Определить индексы 6 комиссий:
         * НОВЫЙ (isNew): найти по regex (case-insensitive) по нормализованной шапке:
             fbw: /склад\s*wb/i · fbs: /маркетплейс/i · dbs: /витрина\s*\(dbs\)/i ·
             express: /экспресс/i · pickup: /самовывоз/i · booking: /бронирование/i
           Если хоть один индекс не найден (=== -1) → `throw new Error("Не распознан формат файла ИУ: не найдена колонка «<поле>». Проверьте выгрузку WB.")`
           с указанием, какого столбца не хватает.
           ⚠ dbs матчить именно /витрина\s*\(dbs\)/i (префикс до слэша/ZWSP), чтобы НЕ поймать «Витрина экспресс (EDBS)».
         * ЛЕГАСИ (иначе): фиксированные индексы как сейчас — fbw=2, fbs=4, dbs=4, express=5, pickup=6, booking=7.
       - parentName/subjectName всегда по позициям col0/col1 (одинаковы в обоих форматах).
       - Цикл с i=1: `if (!row || !row[0] || !row[1]) continue`; `parentName=String(row[0]).trim()`,
         `subjectName=String(row[1]).trim()`; `if (!subjectName) continue`.
         Числа: `parseFloat(String(row[idx])) || 0` (как в текущем коде).
       - Дедуп по subjectName: `Set<string>` seen — если subjectName уже был, `continue` (первая запись выигрывает).
       - Вернуть массив records.

    Создать `tests/wb-commission-iu-parser.test.ts` (импорт из "@/lib/wb-commission-iu-parser", vitest describe/it/expect) с кейсами из блока behavior. ZWSP в шапке — только через `"\u200B"`. НЕ читать бинарные фикстуры.
  </action>
  <verify>
    <automated>npx vitest run tests/wb-commission-iu-parser.test.ts</automated>
  </verify>
  <done>Все кейсы зелёные: новый формат маппит fbw←«Склад WB (FBW)» (не Самовывоз), ZWSP-шапка распознана, дубликат схлопнут (первый выигрывает), пустой предмет пропущен, легаси даёт fbw=col2/fbs=dbs=col4, неполный новый заголовок бросает русскую ошибку.</done>
</task>

<task type="auto">
  <name>Task 2: Подключить парсер в route.ts (route остаётся тонким)</name>
  <files>app/api/wb-commission-iu/route.ts</files>
  <action>
    Заменить инлайн-цикл парсинга (строки ~39–74 текущего файла: комментарий про старый формат, объявление `records`, `for`-цикл по позициям, проверка `records.length===0`) на вызов pure-функции. НЕ трогать: auth, чтение formData, `XLSX.read` + `sheet_to_json`, `prisma.$transaction([deleteMany, createMany])`, блок `snapshotCommissionChanges` (W2d), внешний try/catch и его 500-ответ.

    1) Импорт: `import { parseWbCommissionIuRows } from "@/lib/wb-commission-iu-parser"`.
    2) Тип rows смягчить до `unknown[]`: `const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })`. Оставить проверку `if (rows.length < 2)` → 400 «Файл пустой или без данных».
    3) Вызвать парсер в отдельном try/catch, чтобы ошибка нераспознанного заголовка возвращала 400 (клиентская проблема файла), а не 500:
       ```
       let records
       try {
         records = parseWbCommissionIuRows(rows)
       } catch (e) {
         return NextResponse.json({ error: (e as Error).message }, { status: 400 })
       }
       ```
    4) Сохранить `if (records.length === 0)` → 400 «Не удалось распарсить строки».
    5) `createMany({ data: records })` работает как есть — форма записей совпадает со схемой (парсер уже дедуплицирует subjectName, снимая риск @unique-конфликта на новом 7421-строчном файле).

    Итог: route.ts не содержит `parseFloat(String(row[2]))`/позиционного маппинга; вся логика — в парсере.
  </action>
  <verify>
    <automated>rg -q "parseWbCommissionIuRows" app/api/wb-commission-iu/route.ts && ! rg -q "row\[2\]" app/api/wb-commission-iu/route.ts && echo WIRED</automated>
  </verify>
  <done>route.ts импортирует и вызывает parseWbCommissionIuRows, инлайн-позиционный парсинг удалён; транзакция и snapshotCommissionChanges нетронуты; нераспознанный заголовок → 400 с русским сообщением. (Полный `npx tsc --noEmit` опционален и может показать НЕсвязанные ошибки из файлов параллельной сессии — не блокер этой задачи.)</done>
</task>

</tasks>

<verification>
- `npx vitest run tests/wb-commission-iu-parser.test.ts` — зелёный (оба формата + ZWSP + дубликат + пустой предмет + ошибка).
- route.ts: `rg parseWbCommissionIuRows app/api/wb-commission-iu/route.ts` находит вызов; позиционного `row[2]/row[4]` парсинга не осталось.
- Транзакция `deleteMany + createMany` и блок `snapshotCommissionChanges` в route.ts не изменены (diff затрагивает только импорт + участок парсинга).
</verification>

<success_criteria>
- Новый Excel WB (формат с ~07.07.2026) корректно раскладывается по полям WbCommissionIu (fbw из «Склад WB (FBW)», а не из «Самовывоз C&C»).
- Старый формат по-прежнему даёт идентичные прежним значения (обратная совместимость).
- Дубликаты subjectName не роняют @unique-транзакцию (первая запись выигрывает).
- Неузнаваемый заголовок → понятная русская ошибка (400), а не тихая запись мусора.
- Парсинг покрыт vitest на синтетических массивах; route остался тонким.
</success_criteria>

<constraints>
- ⚠ В репо параллельно работает другая сессия. Коммитить ТОЛЬКО свои файлы явным перечислением:
  `git add lib/wb-commission-iu-parser.ts tests/wb-commission-iu-parser.test.ts app/api/wb-commission-iu/route.ts`
  затем `git commit -m "..."`. НЕ использовать `git add -A` / `git commit -am`.
- НЕ трогать: app/actions/finance-weekly.ts, components/finance/WeeklyFinReportControls.tsx, .planning/quick/260710-lmb-w3a/.
- Русские комментарии. Next.js 15 App Router, vitest pool=vmForks.
</constraints>

<output>
После завершения создать `.planning/quick/260710-mja-fix-excel-parser-api-wb-commission-iu-he/260710-mja-SUMMARY.md` с кратким итогом (что изменено, результат тестов, список закоммиченных файлов).
</output>
