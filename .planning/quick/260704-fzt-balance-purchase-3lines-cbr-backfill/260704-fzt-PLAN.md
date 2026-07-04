---
phase: quick-260704-fzt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/balance-data.ts
  - lib/cbr-rates.ts
  - scripts/backfill-cbr-rates.ts
  - components/finance/BalanceMethodologyDialog.tsx
  - docs/finance-balance-methodology.md
  - tests/balance-sheet.test.ts
autonomous: true
requirements: [260704-fzt-A, 260704-fzt-B, 260704-fzt-C, 260704-fzt-D]

must_haves:
  truths:
    - "Баланс показывает закупки тремя строками: Авансы поставщикам, Товар готовый к отгрузке, Товар в пути — вместо двух"
    - "Закупка на этапе SHIPMENT попадает в «Товар готовый к отгрузке» (не в «в пути»), TRANSIT — в «Товар в пути», PRODUCTION/INSPECTION/null — в «Авансы»"
    - "Каждая из трёх строк раскрывается в дерево Направление→Категория→Подкатегория→Товар (Σ листьев === amountRub)"
    - "Существует standalone-скрипт бэкфилла исторических курсов ЦБ за март–июнь 2026 через архивный эндпоинт, идемпотентный по (date,code)"
    - "fetchCbrRatesForDate возвращает null на 404 (нет курса за дату), не бросает"
    - "Методология (модалка + docs) описывает три строки классификации закупок и оговорку про курс на дату платежа"
  artifacts:
    - path: "lib/balance-data.ts"
      provides: "3-строчная классификация закупок в loadBalanceSheet (readyToShip + inTransit + advances)"
      contains: "stock-ready-to-ship"
    - path: "lib/cbr-rates.ts"
      provides: "fetchCbrRatesForDate(date) — архивный эндпоинт ЦБ"
      exports: ["fetchCbrRatesForDate"]
    - path: "scripts/backfill-cbr-rates.ts"
      provides: "Standalone-скрипт бэкфилла курсов ЦБ по диапазону дат"
      min_lines: 60
    - path: "components/finance/BalanceMethodologyDialog.tsx"
      provides: "Три пункта методологии закупок вместо одного"
    - path: "docs/finance-balance-methodology.md"
      provides: "Три строки закупок в таблице Активы"
    - path: "tests/balance-sheet.test.ts"
      provides: "Ассерты новой строки stock-ready-to-ship + инвариант Σлистьев"
  key_links:
    - from: "lib/balance-data.ts targetContribs"
      to: "stockLines (inventoryGroup)"
      via: "readyToShipTotal → строка stock-ready-to-ship; inTransitTotal → строка stock-in-transit"
      pattern: "stock-ready-to-ship"
    - from: "scripts/backfill-cbr-rates.ts"
      to: "prisma.currencyRate upsert"
      via: "fetchCbrRatesForDate → ratePerUnit → upsert where date_code"
      pattern: "fetchCbrRatesForDate"
    - from: "getRateForDate (balance-data)"
      to: "CurrencyRate историческими записями"
      via: "date <= paidDate exact-match после бэкфилла (approximate=false)"
      pattern: "date: \\{ lte: asOf \\}"
---

<objective>
Баланс закупок — Заход 1 из 2. Разбить классификацию оплаченных закупок в /finance/balance
на ТРИ строки (Авансы поставщикам / Товар готовый к отгрузке / Товар в пути) вместо двух,
исправив баг «SHIPMENT (готов к отгрузке) считался как в пути». Плюс бэкфилл исторических
курсов ЦБ РФ (март–июнь 2026) через архивный эндпоинт — сейчас платежи ранних закупок
конвертируются по самому раннему известному курсу (10.5831), что занижает баланс. Обновить
методологию (модалка + docs) и тесты.

Purpose: точнее показать структуру запасов/авансов в управленческом балансе и убрать
занижение из-за отсутствующих исторических курсов.
Output: 3-строчная классификация закупок + скрипт backfill-cbr-rates + обновлённая методология + тесты.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- Извлечено из кодовой базы — исполнителю НЕ нужно разведывать заново. -->

lib/purchase-stages.ts:
```typescript
export const STAGE_ORDER = ["PRODUCTION","INSPECTION","SHIPMENT","TRANSIT","WAREHOUSE"] as const
export type StageKey = (typeof STAGE_ORDER)[number]
// STAGE_LABELS: PRODUCTION «Производство», INSPECTION «Готов к инспекции»,
//   SHIPMENT «Готов к отгрузке», TRANSIT «В пути», WAREHOUSE «Принят на складе»
```

lib/balance-data.ts (существующая логика цикла ~строки 612-799):
```typescript
export interface BalanceLine {
  key: string; label: string; amountRub: number
  currency?: "RUB" | "CNY"; approximate?: boolean; note?: string
  children?: BalanceLine[]   // Σ листьев === amountRub (инвариант)
}
export interface BalanceGroup { key: string; label: string; lines: BalanceLine[]; subtotalRub: number }
// round2(n), sumRubLines(lines) — CNY-строки исключены из суммы
function buildProductTree(parentKey: string, contribs: ProductContrib[], metaMap: Map<string, ProductMeta>): BalanceLine[]
// ProductContrib = { productId: string; productLabel: string; amountRub: number }
// stageAsOf(allStages, asOf) → string | null   (PRODUCTION/INSPECTION/SHIPMENT/TRANSIT/WAREHOUSE)
// getRateForDate(code, paidDate) → { rateToRub, date, approximate } | null

// ТЕКУЩИЙ выбор целевого массива (баг — SHIPMENT приравнен к TRANSIT):
const targetContribs = (stage === "SHIPMENT" || stage === "TRANSIT") ? inTransitContribs : advancesContribs
if (stage === "SHIPMENT" || stage === "TRANSIT") { inTransitTotal += paidRub; ... }
else { advancesTotal += paidRub; ... }

// ТЕКУЩАЯ сборка строки в пути (label «Товар в пути из Китая», key stock-in-transit-china):
const inTransitChildren = buildProductTree("stock-in-transit-china", inTransitContribs, productMetaMap)
stockLines.push({ key: "stock-in-transit-china", label: "Товар в пути из Китая",
  amountRub: round2(inTransitTotal), approximate: inTransitApproximate || undefined,
  ...(inTransitChildren.length > 0 ? { children: inTransitChildren } : {}) })
```

lib/cbr-rates.ts:
```typescript
export interface CbrValute { CharCode: string; Nominal: number; Value: number; /* ... */ }
export interface CbrResponse { Date: string; Valute: Record<string, CbrValute> }
export async function fetchCbrRates(): Promise<CbrResponse>   // GET .../daily_json.js
export function ratePerUnit(valute: CbrValute): number        // Value / Nominal
```

prisma/schema.prisma — model CurrencyRate:
```prisma
model CurrencyRate {
  id String @id @default(cuid())
  date DateTime @db.Date
  code String
  nominal Int
  rateToRub Decimal @db.Decimal(14,6)
  syncedAt DateTime @default(now())
  @@unique([date, code])   // ← upsert where: { date_code: { date, code } }
  @@index([code])
}
```

scripts/bootstrap-balance-snapshot.ts — образец standalone:
```typescript
import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
export function parseCliArgs(argv: string[]): CliArgs { /* --key=value перебор process.argv.slice(2) */ }
async function main() { /* ... */ }
main().then(() => process.exit(0)).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task A: Три строки классификации закупок в балансе</name>
  <files>lib/balance-data.ts</files>
  <action>
В `loadBalanceSheet` (цикл по purchases, ~строки 612-799) разбить текущую 2-строчную
классификацию (Авансы + «в пути») на 3 строки. Ключевой баг: SHIPMENT = «готов к отгрузке»,
НЕ в пути — сейчас он ошибочно попадает в inTransit.

Изменения:
1. Рядом с существующими `inTransitContribs/inTransitTotal/inTransitApproximate` и
   `advancesContribs/advancesTotal/advancesApproximate` добавить ТРЕТИЙ набор:
   `readyToShipContribs: ProductContrib[] = []`, `readyToShipTotal = 0`,
   `readyToShipApproximate = false`.

2. Переписать выбор целевого массива и накопление тоталов по трём веткам (по `stage`,
   вычисленному через `stageAsOf` — не трогать эту часть):
   - `stage === "TRANSIT"` → `inTransitContribs`, `inTransitTotal += paidRub`,
     `if (paidApproximate) inTransitApproximate = true`
   - `stage === "SHIPMENT"` → `readyToShipContribs`, `readyToShipTotal += paidRub`,
     `if (paidApproximate) readyToShipApproximate = true`
   - иначе (null | PRODUCTION | INSPECTION) → `advancesContribs`, `advancesTotal += paidRub`,
     `if (paidApproximate) advancesApproximate = true`
   WAREHOUSE по-прежнему `continue` (уже в Запасах по себестоимости) — НЕ менять.
   Аллокация `paidRub` по позициям (weightedItems / «Без распределения») — ОБЩАЯ, оставить
   как есть, меняется только в какой `targetContribs` пушим.

3. В цикле обновления productLabel (`for (const contribs of [inTransitContribs, advancesContribs])`
   ~строка 738) добавить `readyToShipContribs` в массив: `[inTransitContribs, readyToShipContribs, advancesContribs]`.

4. Переименовать существующую строку «в пути»:
   - key: `stock-in-transit-china` → `stock-in-transit`
   - label: «Товар в пути из Китая» → «Товар в пути»
   - `buildProductTree("stock-in-transit", inTransitContribs, productMetaMap)` (parentKey тоже
     новый key — пути детей завязаны на line.key).
   Строка по-прежнему `stockLines.push(...)` в inventoryGroup, amountRub = round2(inTransitTotal).

5. Добавить НОВУЮ строку «Товар готовый к отгрузке» в inventoryGroup (в stockLines, рядом с
   переименованной строкой в пути):
   ```typescript
   const readyToShipChildren = buildProductTree("stock-ready-to-ship", readyToShipContribs, productMetaMap)
   stockLines.push({
     key: "stock-ready-to-ship",
     label: "Товар готовый к отгрузке",
     amountRub: round2(readyToShipTotal),
     approximate: readyToShipApproximate || undefined,
     ...(readyToShipChildren.length > 0 ? { children: readyToShipChildren } : {}),
   })
   ```
   ⚠ Обе строки (ready-to-ship и in-transit) добавляются ВСЕГДА (push безусловный, как сейчас
   у in-transit) — даже при total=0 строка присутствует с amountRub 0 и без children. Это
   важно для консистентности теста (задача D).

6. advancesGroup и строка advances-suppliers — БЕЗ изменений (key advances-suppliers,
   label «Авансы поставщикам», группа advances). subtotalRub inventory/advances
   пересчитаются автоматически через sumRubLines.

Клиент `components/finance/BalanceSheetTable.tsx` и page.tsx НЕ трогать — они рендерят
group.lines рекурсивно, новый key/строка подхватятся автоматически.

Комментарии на русском (конвенция CLAUDE.md).
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('lib/balance-data.ts','utf8'); const ok=s.includes('stock-ready-to-ship')&&s.includes('readyToShipContribs')&&s.includes('readyToShipTotal')&&s.includes('\"stock-in-transit\"')&&s.includes('Товар готовый к отгрузке')&&s.includes('Товар в пути')&&!s.includes('stock-in-transit-china')&&/stage === \"TRANSIT\"/.test(s)&&/stage === \"SHIPMENT\"/.test(s); process.exit(ok?0:1)"</automated>
  </verify>
  <done>
Три набора contribs/total (advances / readyToShip / inTransit); ветвление по TRANSIT/SHIPMENT/else;
строка stock-ready-to-ship и переименованная stock-in-transit (label «Товар в пути») в
inventoryGroup; строки push-ятся всегда; advances без изменений; grep-gate проходит.
  </done>
</task>

<task type="auto">
  <name>Task B: fetchCbrRatesForDate + скрипт backfill-cbr-rates</name>
  <files>lib/cbr-rates.ts, scripts/backfill-cbr-rates.ts</files>
  <action>
Проблема: CurrencyRate forward-only с 09.06.2026; платежи закупок март–май конвертируются
по самому раннему курсу (approximate=true), занижая баланс. Бэкфилл заполняет исторические
курсы через архивный эндпоинт ЦБ.

1. lib/cbr-rates.ts — НОВАЯ функция `fetchCbrRatesForDate(date: Date): Promise<CbrResponse | null>`:
   - Собрать URL из компонентов даты (UTC): `YYYY`, `MM` (2 цифры), `DD` (2 цифры) →
     `https://www.cbr-xml-daily.ru/archive/${YYYY}/${MM}/${DD}/daily_json.js`.
   - `const res = await fetch(url, { cache: "no-store" })`.
   - Если `!res.ok` (404 = нет курса за эту дату, выходной/праздник) → `return null` (НЕ бросать).
   - Иначе `return res.json() as Promise<CbrResponse>` (формат идентичен daily_json.js).
   - Переиспользовать типы `CbrResponse`/`CbrValute`, plain fetch (без curl — у cbr-xml-daily
     нет TLS-блокировки, как отмечено в шапке файла). Комментарий на русском.

2. scripts/backfill-cbr-rates.ts — НОВЫЙ standalone-скрипт (образец —
   scripts/bootstrap-balance-snapshot.ts: `new PrismaClient()`, argv-парсинг, main + process.exit):
   - `import { PrismaClient } from "@prisma/client"` + `import { fetchCbrRatesForDate, ratePerUnit } from "../lib/cbr-rates"`.
   - `parseCliArgs(argv)`: `--from=YYYY-MM-DD` (default `2026-03-01`), `--to=YYYY-MM-DD`
     (default `2026-06-09`). Экспортировать функцию (паттерн bootstrap).
   - Цикл по датам включительно [from..to]. Для каждой даты:
     - `const resp = await fetchCbrRatesForDate(date)`.
     - `resp == null` → `console.log(skip)`, инкремент счётчика пропущенных, `continue`.
     - Иначе для КАЖДОЙ валюты в `resp.Valute` (брать все, не только CNY/USD):
       `await prisma.currencyRate.upsert({ where: { date_code: { date, code: valute.CharCode } },
        create: { date, code: valute.CharCode, nominal: valute.Nominal, rateToRub: ratePerUnit(valute) },
        update: { nominal: valute.Nominal, rateToRub: ratePerUnit(valute) } })`.
       ⚠ Составной unique = `@@unique([date, code])` → имя ключа для where = `date_code`.
       `nominal` — обязательное поле CurrencyRate (Int), взять из `valute.Nominal`.
       `date` для upsert — полночь UTC этой календарной даты (`@db.Date` хранит только дату).
     - Пауза ~150мс между датами (`await new Promise(r => setTimeout(r, 150))`).
   - Идемпотентно (upsert). По завершении — сводка через console.log:
     `{ from, to, datesProcessed, datesSkipped, ratesUpserted }`.
   - Требует DATABASE_URL. main()/process.exit/finally $disconnect — как в bootstrap.
   - Комментарий-шапка на русском: назначение, запуск
     (`npx tsx scripts/backfill-cbr-rates.ts --from=2026-03-01 --to=2026-06-09`,
     на VPS `set -a; . /etc/zoiten.pro.env; set +a; npx tsx ...`), НЕ трогает /api/cbr-rate-sync.

НЕ трогать /api/cbr-rate-sync (forward-only daily остаётся как есть).
  </action>
  <verify>
    <automated>node -e "const c=require('fs').readFileSync('lib/cbr-rates.ts','utf8'); const b=require('fs').readFileSync('scripts/backfill-cbr-rates.ts','utf8'); const ok=/export async function fetchCbrRatesForDate/.test(c)&&c.includes('/archive/')&&/return null/.test(c)&&/parseCliArgs/.test(b)&&b.includes('date_code')&&b.includes('fetchCbrRatesForDate')&&b.includes('nominal')&&/--from=/.test(b)&&/--to=/.test(b)&&b.includes('PrismaClient'); process.exit(ok?0:1)"</automated>
  </verify>
  <done>
fetchCbrRatesForDate строит /archive/YYYY/MM/DD/ URL, возвращает null на !res.ok;
backfill-cbr-rates.ts — standalone с argv --from/--to, циклом по датам, upsert по date_code
с nominal+rateToRub, паузой 150мс, сводкой; идемпотентен; grep-gate проходит.
  </done>
</task>

<task type="auto">
  <name>Task C: Методология — 3 строки закупок + оговорка про курс</name>
  <files>components/finance/BalanceMethodologyDialog.tsx, docs/finance-balance-methodology.md</files>
  <action>
Заменить единый пункт «Товар в пути из Китая» на ТРИ пункта, синхронно с задачей A.

1. components/finance/BalanceMethodologyDialog.tsx — в секции «Активы» заменить два текущих
   `<Item>` («Товар в пути из Китая» + «Авансы поставщикам») на три `<Item>` в таком порядке
   (по порядку строк в балансе: Запасы содержат ready-to-ship + in-transit, затем группа Авансы):
   - `<Item term="Авансы поставщикам">` — «Оплата закупок ДО отгрузки (этап «Производство» /
     «Инспекция» или без этапа). Приводится в рубли по курсу ЦБ на дату платежа.»
   - `<Item term="Товар готовый к отгрузке">` — «Оплаченные закупки на этапе «Готов к отгрузке»
     (SHIPMENT) — оплачен, готов, ещё не отгружен.»
   - `<Item term="Товар в пути">` — «Оплаченные закупки на этапе «В пути» (TRANSIT) — товар
     в дороге, ещё не принят на склад.»
   В каждом (или общей оговоркой) уточнить: суммы = по ОПЛАЧЕННОМУ поставщику, курс ЦБ на дату
   платежа, ⚠ приближённо если курса на дату ещё нет в базе.
   Оговорку про курсы в блоке «Оговорки и приближения» можно оставить/смягчить (после бэкфилла
   исторические курсы есть с марта 2026).

2. docs/finance-balance-methodology.md — в таблице «## Активы» заменить строки
   «Товар в пути из Китая» и «Авансы поставщикам» тремя строками с тем же содержанием
   (Авансы поставщикам / Товар готовый к отгрузке / Товар в пути). Формулировки RU,
   markdown-таблица.

Всё на русском (конвенция CLAUDE.md).
  </action>
  <verify>
    <automated>node -e "const d=require('fs').readFileSync('components/finance/BalanceMethodologyDialog.tsx','utf8'); const m=require('fs').readFileSync('docs/finance-balance-methodology.md','utf8'); const ok=d.includes('Товар готовый к отгрузке')&&d.includes('Товар в пути')&&d.includes('Авансы поставщикам')&&!d.includes('Товар в пути из Китая')&&m.includes('Товар готовый к отгрузке')&&m.includes('Товар в пути')&&!m.includes('Товар в пути из Китая'); process.exit(ok?0:1)"</automated>
  </verify>
  <done>
Модалка и docs описывают три строки закупок (Авансы / Готовый к отгрузке / В пути) вместо
единого «Товар в пути из Китая»; уточнена оговорка про курс ЦБ на дату платежа; grep-gate проходит.
  </done>
</task>

<task type="auto">
  <name>Task D: Тесты — новая строка stock-ready-to-ship</name>
  <files>tests/balance-sheet.test.ts</files>
  <action>
Текущая фикстура: `purch-transit` имеет стадию SHIPMENT → раньше попадал в in-transit.
После задачи A он попадает в НОВУЮ строку `stock-ready-to-ship` (SHIPMENT), а строка
`stock-in-transit` (TRANSIT) остаётся с amountRub 0 (в фикстуре нет TRANSIT-закупки).

Обновить ассерты (важно: строки в задаче A push-ятся ВСЕГДА, даже при total=0 — тест на это
опирается):

1. Тест «итоги активов/пассивов… по фикстуре»: inventory subtotal остаётся 2000
   (WB_WAREHOUSE 1000 + stock-ready-to-ship 1000 [purch-transit SHIPMENT] + stock-in-transit 0).
   Обновить комментарий (было «в пути из Китая 1000» → «готов к отгрузке 1000 + в пути 0»).
   Итог активов не меняется (115000+5000+2000+2000+3000). Advances subtotal = 2000 (без изменений).

2. Переименовать/заменить тест «инвариант Σ листьев = amountRub для stock-in-transit-china»:
   - Добавить тест для НОВОЙ строки `stock-ready-to-ship`: найти в inventory
     `l.key === "stock-ready-to-ship"`, `expect(amountRub).toBeCloseTo(1000, 2)` (purch-transit
     SHIPMENT: p1:600 + p3:400), `expect(sumLeaves(...)).toBeCloseTo(amountRub, 2)`,
     children defined.
   - Обновить тест `stock-in-transit`: ключ теперь `"stock-in-transit"` (не `-china`); в фикстуре
     нет TRANSIT-закупки → строка существует с `amountRub` 0 без children. Ассертить
     `expect(transit.amountRub).toBeCloseTo(0, 2)` и что строка найдена (`toBeDefined`).
     Инвариант sumLeaves для строки без children = amountRub (0) — тривиально держится, можно
     оставить проверку.

3. Тест advances-suppliers (Σлистьев=amountRub 2000) — БЕЗ изменений (purch-advance PRODUCTION).

4. Golden-ассерты капитала/налогов/unvaluedStock/CNY — НЕ ломать.

⚠ Локально vitest НЕ запускается (нет node_modules) — verify использует статический grep по
тексту теста, не блокирует. Настоящий прогон на VPS/CI.
  </action>
  <verify>
    <automated>node -e "const t=require('fs').readFileSync('tests/balance-sheet.test.ts','utf8'); const ok=t.includes('stock-ready-to-ship')&&t.includes('\"stock-in-transit\"')&&!t.includes('stock-in-transit-china'); process.exit(ok?0:1)"</automated>
  </verify>
  <done>
Тест ассертит новую строку stock-ready-to-ship (amountRub 1000, инвариант Σлистьев),
stock-in-transit (0, без -china), inventory subtotal 2000, advances 2000; golden-инварианты
не тронуты; grep-gate проходит.
  </done>
</task>

</tasks>

<verification>
- grep-gates всех 4 задач проходят (статические проверки текста файлов).
- `stock-in-transit-china` не встречается ни в одном из файлов (полное переименование).
- Три строки: advances-suppliers (группа advances), stock-ready-to-ship + stock-in-transit (группа inventory).
- Инвариант Σлистьев===amountRub сохранён для всех трёх строк (через buildProductTree с parentKey=key строки).
- scripts/backfill-cbr-rates.ts — standalone, идемпотентный upsert по date_code с nominal.
- Настоящий прогон vitest — на VPS/CI (локально нет node_modules).
</verification>

<success_criteria>
- Баланс классифицирует оплаченные закупки тремя строками (Авансы / Готовый к отгрузке / В пути),
  SHIPMENT более не путается с TRANSIT.
- fetchCbrRatesForDate + scripts/backfill-cbr-rates.ts позволяют заполнить исторические курсы ЦБ
  за март–июнь 2026 (идемпотентно), устраняя занижение баланса.
- Методология (модалка + docs) синхронизирована с новой 3-строчной классификацией.
- Тесты обновлены под новую строку stock-ready-to-ship, golden-инварианты не сломаны.
- Каждая задача — атомарный коммит (RU-сообщение, конвенция CLAUDE.md).
- Клиент BalanceSheetTable.tsx и page.tsx не тронуты.
</success_criteria>

<output>
After completion, create `.planning/quick/260704-fzt-balance-purchase-3lines-cbr-backfill/260704-fzt-SUMMARY.md`
</output>
