# Phase 22: Банковские счета — Research

**Researched:** 2026-06-10
**Domain:** Codebase patterns — existing conventions to replicate (NOT generic library research)
**Confidence:** HIGH — all findings verified directly from source files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
1. «Наши компании» — расширить существующую `Company` (не новая модель). Добавить ИНН/реквизиты, `BankAccount → Company`. Компании автоматически пересекаются с Кредитами (`Loan.companyId`).
2. Банки/кредиторы — новый `Bank` (по БИК) + nullable FK `Lender → Bank`. `Lender` по структуре не трогаем, только добавляем опц. связь.
3. Контрагенты — отдельная таблица `Counterparty`, дедуп по ИНН, операции ссылаются FK.
4. Scope — минимальный + базовая ручная разметка/категоризация операций под будущий ДДС.

### Claude's Discretion
Открытые вопросы из CONTEXT.md — решаются в plan-phase:
- Маппинг компания из выписки → Company: предпочтительно по ИНН, имя как fallback
- Валюта CNY: хранить в родной валюте, конвертацию не делать на этапе 1
- Депозитные счета ВТБ: включать как BankAccount, категория INTERNAL_TRANSFER
- UI импорта: авто-детект формата + показать определённый формат перед импортом
- Сидинг: UI основной путь + `scripts/import-bank-statements.cjs` для разового локального прогона

### Deferred Ideas (OUT OF SCOPE)
- Связь операций с закупками (`PurchasePayment`) и кредитами (`LoanPayment`)
- Отчёт ДДС / cash-flow
- Авто-категоризация (правила/ML)
- Сверка остатков
- Редактирование операций (только просмотр + категория)
</user_constraints>

---

## Summary

Исследование охватывает ТОЛЬКО существующие паттерны кодовой базы — что нужно скопировать/расширить. Форматы Excel-выписок уже задокументированы в CONTEXT.md; здесь — как их обрабатывать по аналогии с существующим кодом.

Ключевые находки: Excel-импорт следует паттерну `wb-commission-iu` (API route + кнопка-загрузчик); `ERP_SECTION.BANK` добавляется через 6-точечный чеклист; sticky-таблица — копия `CreditsTable`; фильтры — копия `CreditsFilters`; миграция — вручную SQL по образцу `20260609_phase21_credits`; тесты — vitest с `tests/fixtures/`.

**Первичная рекомендация:** Реплицировать архитектуру Phase 21 (Credits) как ближайший аналог: один раздел, фильтры без каскада, sticky-таблица, server actions с requireSection.

---

## 1. Добавление нового ERP_SECTION — 6-точечный чеклист

### 1.1 `prisma/schema.prisma` — enum ERP_SECTION

**Текущий enum** (строки 21–34):
```prisma
enum ERP_SECTION {
  PRODUCTS
  PRICES
  WEEKLY_CARDS
  STOCK
  COST
  PROCUREMENT
  SALES
  SUPPORT
  EMPLOYEES
  ADS
  USER_MANAGEMENT
  CREDITS
}
```

**Добавить:** `BANK` (в конец списка или по алфавиту). PostgreSQL enum ADD VALUE не требует пересоздания — используется `ALTER TYPE ... ADD VALUE IF NOT EXISTS`.

### 1.2 Миграция — SQL вручную

Проект НЕ использует `prisma migrate dev` (нет локальной PostgreSQL). Все миграции создаются вручную как `prisma/migrations/{date}_{name}/migration.sql` и применяются через `prisma migrate deploy` на VPS.

**Образец для `ALTER TYPE` — из `20260609_phase21_credits/migration.sql`:**
```sql
ALTER TYPE "ERP_SECTION" ADD VALUE IF NOT EXISTS 'CREDITS';
```

**Для Phase 22 — часть файла `20260610_phase22_bank/migration.sql`:**
```sql
ALTER TYPE "ERP_SECTION" ADD VALUE IF NOT EXISTS 'BANK';
```

**Ключевые детали синтаксиса миграций фазы 21 (образец для всех новых таблиц):**
- TEXT NOT NULL для id (cuid), TIMESTAMP(3) для datetime, DATE для @db.Date
- DECIMAL(14,2) для денег, DECIMAL(6,3) для ставок
- INDEX создаётся после CREATE TABLE через отдельный `CREATE INDEX`
- FK добавляется через `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`
- onDelete=CASCADE: `ON DELETE CASCADE ON UPDATE CASCADE`
- onDelete=RESTRICT: `ON DELETE RESTRICT ON UPDATE CASCADE`

### 1.3 `lib/sections.ts` — SECTION_PATHS

**Текущий файл** — полный, показывает CREDITS:
```typescript
export const SECTION_PATHS = {
  "/products": "PRODUCTS",
  "/cards": "PRODUCTS",
  "/prices": "PRICES",
  // ...
  "/credits": "CREDITS",
} as const satisfies Record<string, string>
```

**Добавить:** `"/bank": "BANK"`

### 1.4 `components/layout/section-titles.ts` — getSectionTitle

**Текущий шаблон** (показывает CREDITS entries):
```typescript
{ match: /^\/credits\/schedule/, title: "Кредиты — сводный график" },
{ match: /^\/credits\/[^/]+/, title: "Кредит" },
{ match: /^\/credits/, title: "Кредиты" },
```

**Добавить для /bank** (в конце списка, перед employees):
```typescript
{ match: /^\/bank/, title: "Банковские счета" },
```

### 1.5 `components/layout/nav-items.ts` — NAV_ITEMS

**Текущие импорты** из lucide-react уже включают `Landmark` (используется для CREDITS). Для банка — использовать `Building2` или `Landmark` (оба доступны в lucide-react). CONTEXT.md предлагает `Landmark` или `Wallet`.

**Текущая запись CREDITS** (образец для BANK):
```typescript
{ section: "CREDITS", href: "/credits", label: "Кредиты", icon: "Landmark" },
```

**Добавить** после CREDITS:
```typescript
{ section: "BANK", href: "/bank", label: "Банковские счета", icon: "Building2" },
```

И в ICON_MAP добавить `Building2` из lucide-react (если выбран). Паттерн: добавить импорт в блок импортов + добавить ключ в объект ICON_MAP.

### 1.6 `lib/section-labels.ts` — SECTION_OPTIONS (ЧАСТО ЗАБЫВАЮТ)

**Текущий файл** (CREDITS entry показывает образец):
```typescript
export const SECTION_OPTIONS: SectionOption[] = [
  { value: "PRODUCTS",        label: "Товары" },
  // ...
  { value: "CREDITS",         label: "Кредиты" },
  { value: "SUPPORT",         label: "Служба поддержки" },
  // ...
]
```

**Добавить** (после CREDITS):
```typescript
{ value: "BANK", label: "Банковские счета" },
```

Без этой строки раздел НЕ появится тумблером VIEW/MANAGE в `/admin/users` и MANAGER не сможет получить доступ.

---

## 2. Excel-импорт — паттерн

### 2.1 API route pattern (из `app/api/wb-commission-iu/route.ts`)

**Полная структура** — шаблон для `app/api/bank-import/route.ts`:

```typescript
export const runtime = "nodejs"   // ОБЯЗАТЕЛЬНО — xlsx требует Node.js

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Неверный формат запроса" }, { status: 400 })
  }

  const file = formData.get("file") as File | null
  if (!file) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 400 })
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: "buffer" })
    // ... логика парсинга + записи в БД
    return NextResponse.json({ imported: N, skipped: M, ... })
  } catch (e) {
    console.error("Import error:", e)
    return NextResponse.json(
      { error: (e as Error).message || "Ошибка обработки файла" },
      { status: 500 }
    )
  }
}
```

**Ключевые детали:**
- `export const runtime = "nodejs"` — без этого Next.js пытается Edge runtime, xlsx ломается
- `Buffer.from(await file.arrayBuffer())` — стандартный способ получить Buffer из File
- `XLSX.read(buffer, { type: "buffer" })` — чтение workbook из Buffer
- Auth: `const session = await auth()` (не `requireSection` — это API route, не server action)
- Ошибка 401 без деталей — стандарт проекта

**Для Сбер (merged cells):** `XLSX.read(buffer, { type: "buffer", raw: false })` — CONTEXT.md требует `raw: false` для merged cells Сбера.

**Чтение multi-sheet (ВТБ):**
```typescript
for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  })
  // sheetName = номер счёта для ВТБ
}
```

**Чтение одного листа (ПСБ, Сбер):**
```typescript
const sheet = workbook.Sheets[workbook.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
  header: 1,
  defval: null,
})
```

**Опции `sheet_to_json`:**
- `header: 1` — массив массивов (сырые строки), не объекты
- `defval: null` — пустые ячейки = null, не undefined
- `raw: false` — строковые значения (нужен для Сбера с merged cells)
- `raw: true` — числовые значения как есть (для ВТБ/ПСБ, числа = JS number)

### 2.2 Parsing helpers — из `scripts/parse-suppliers-xlsx.cjs` и `prisma/seed-employees.ts`

**Обработка дат из Excel:**
```typescript
// Excel serial → Date (1900 date system)
function excelSerialToDate(serial: number): Date | null {
  if (!serial || isNaN(serial)) return null
  const epoch = new Date(Date.UTC(1899, 11, 30)) // 1899-12-30
  return new Date(epoch.getTime() + serial * 86400000)
}

// Дата DD.MM.YYYY (строка из ВТБ/ПСБ) → Date
function parseDDMMYYYY(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return null
  return new Date(Date.UTC(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])))
}
```

**Нормализация суммы с разделителем тысяч** (ВТБ/Сбер: `"6,057,806.46"` → number):
```typescript
function parseAmount(v: string | number | null): number | null {
  if (v === null || v === undefined || v === "") return null
  if (typeof v === "number") return v
  // Убрать разделители тысяч (запятые) и сделать точку десятичной
  const cleaned = String(v).replace(/,(?=\d{3})/g, "").trim()
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}
```

**Header-driven mapping (ВТБ — КРИТИЧНО):** Маппить по тексту заголовка, не по позиции:
```typescript
function buildHeaderMap(headerRow: (string | number | null)[]): Record<string, number> {
  const map: Record<string, number> = {}
  headerRow.forEach((cell, idx) => {
    if (cell != null) map[String(cell).trim()] = idx
  })
  return map
}
```

### 2.3 Кнопка-загрузчик (`components/cards/WbUploadIuButton.tsx`)

**Полная структура компонента** (шаблон для `BankImportButton`):

```typescript
"use client"
import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"

export function BankImportButton() {
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleFile(file: File) {
    setIsUploading(true)
    const formData = new FormData()
    formData.append("file", file)

    try {
      const res = await fetch("/api/bank-import", { method: "POST", body: formData })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Импортировано: ${data.imported} / пропущено дублей: ${data.skipped}`)
        router.refresh()
      } else {
        toast.error(data.error || "Ошибка загрузки")
      }
    } catch {
      toast.error("Ошибка сети")
    }
    setIsUploading(false)
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={isUploading}
        onClick={() => inputRef.current?.click()} className="gap-1.5">
        <Upload className="h-3.5 w-3.5" />
        {isUploading ? "Импорт…" : "Загрузить выписку"}
      </Button>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ""   // сброс — иначе повторный выбор того же файла не сработает
        }}
      />
    </>
  )
}
```

**Детали паттерна:**
- `hidden input + ref.current?.click()` — нативный file picker без сторонних библиотек
- `e.target.value = ""` после загрузки — сброс инпута для повторного выбора того же файла
- `router.refresh()` — обновление RSC данных после успешного импорта (не redirect)
- `toast.success` / `toast.error` из `sonner` — единственный toast в проекте

### 2.4 Скрипт разового импорта (образец — `scripts/seed-credits.ts`)

Для `scripts/import-bank-statements.cjs` или `.ts`:
- Читает файлы из локальной папки через `fs.readdirSync` + `XLSX.readFile`
- Использует Prisma через `require("@prisma/client")` (cjs) или `import { PrismaClient }` (ts)
- Запуск: `npx tsx scripts/import-bank-statements.ts` или `node scripts/import-bank-statements.cjs`
- На VPS: `set -a; . /etc/zoiten.pro.env; set +a; node scripts/...`
- Идемпотентен через fingerprint `@unique` (как seed-suppliers — skip existing)

---

## 3. RSC list page pattern (зеркало /credits)

### 3.1 Структура RSC page (из `app/(dashboard)/credits/page.tsx`)

```typescript
// app/(dashboard)/bank/page.tsx
export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<{ companies?: string; accounts?: string; banks?: string; direction?: string; category?: string; search?: string; dateFrom?: string; dateTo?: string }>
}) {
  await requireSection("BANK")                        // RBAC guard
  const canManage = (await getSectionRole("BANK")) === "MANAGE"

  const { companies: cp, accounts: ac, ... } = await searchParams

  // Параллельная загрузка данных
  const [transactions, filterOptions] = await Promise.all([
    loadBankTransactions(filters),
    loadBankFilterOptions(),
  ])

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Шапка с кнопкой импорта */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">...</h2>
        {canManage && <BankImportButton />}
      </div>

      {/* Фильтры */}
      <BankFilters ... />

      {/* Таблица — flex-1 min-h-0 обязателен для sticky */}
      <div className="flex-1 min-h-0">
        <BankTransactionsTable rows={transactions} canManage={canManage} />
      </div>
    </div>
  )
}
```

**Ключевые детали:**
- `await requireSection("BANK")` — первой строкой в async function
- `getSectionRole` для canManage — НЕ try/catch requireSection с MANAGE (anti-pattern)
- `await searchParams` — Next.js 15 searchParams это Promise
- `flex-1 min-h-0` на контейнере таблицы — обязателен для sticky header (CLAUDE.md)

### 3.2 Sticky table pattern (из `components/credits/CreditsTable.tsx`)

**Структура — ТОЧНЫЙ шаблон для BankTransactionsTable:**

```typescript
// Обёртка — ЕДИНСТВЕННЫЙ scroll-контейнер
<div className="overflow-auto h-full rounded-lg border">
  <table className="w-full border-separate border-spacing-0 text-sm">
    <thead className="bg-background">
      <tr>  {/* tr прямой HTML, НЕ <TableRow> от shadcn */}
        <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
          Дата
        </th>
        {/* ... остальные th */}
      </tr>
    </thead>
    <TableBody>  {/* TableBody + TableRow от shadcn — OK в body */}
      {rows.map((row) => (
        <TableRow key={row.id} className="hover:bg-muted/40">
          <TableCell className="px-3 py-2">...</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </table>
</div>
```

**КРИТИЧНО (CLAUDE.md):**
- `bg-background` на `<thead>` — НЕ `bg-background/80` (прозрачность → контент просвечивает при прокрутке)
- `bg-background` на каждом `<th>` sticky — сплошной фон обязателен
- `border-separate border-spacing-0` на `<table>` — паттерн проекта для sticky
- НЕ использовать shadcn `<Table>`, `<TableHeader>`, `<TableRow>` в шапке (ломают sticky)
- shadcn `<TableBody>`, `<TableRow>`, `<TableCell>` в body — OK

### 3.3 Filters pattern (из `components/credits/CreditsFilters.tsx`)

**MultiSelectDropdown** — inline в файл фильтров (НЕ импортировать из ui/ — паттерн проекта: каждая страница имеет свою копию):

```typescript
"use client"
// URL-driven state через useSearchParams + router.push
function BankFilters({ companies, accounts, banks, ... }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    return `/bank${params.toString() ? `?${params.toString()}` : ""}`
  }

  // Native <select> для простых dropdown (CLAUDE.md)
  <select value={directionFilter ?? ""} onChange={e => ...}
    className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
    <option value="">Все направления</option>
    <option value="DEBIT">Дебет (расход)</option>
    <option value="CREDIT">Кредит (приход)</option>
  </select>
}
```

**Детали:**
- Фильтры хранятся в URL (не localStorage, не useState) — shareable, back/forward
- MultiSelectDropdown с чекбоксами — для компаний/счетов/банков (несколько значений)
- Native `<select>` — для однозначных фильтров (направление, категория) — CLAUDE.md правило
- Разделитель значений в URL: `companies=id1,id2,id3` (join+split по запятой)

---

## 4. Server actions pattern (из `app/actions/credits.ts`)

**Полный канонический шаблон для `app/actions/bank.ts`:**

```typescript
"use server"

import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { revalidatePath } from "next/cache"

type ActionResult = { ok: true } | { ok: false; error: string }

function handleAuthError(e: unknown): { ok: false; error: string } | null {
  if (e instanceof Error) {
    if (e.message === "UNAUTHORIZED") return { ok: false, error: "Не авторизован" }
    if (e.message === "FORBIDDEN") return { ok: false, error: "Нет доступа" }
  }
  return null
}

// Inline категоризация операции
export async function categorizeTx(
  id: string,
  category: string
): Promise<ActionResult> {
  try {
    await requireSection("BANK", "MANAGE")
    await prisma.bankTransaction.update({
      where: { id },
      data: { category: category as TxCategory },
    })
    revalidatePath("/bank")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Операция не найдена" }
    }
    console.error("categorizeTx error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}
```

**Ключевые детали:**
- `"use server"` в начале файла — всё в файле является server actions
- `await requireSection("BANK")` — VIEW для чтения, `"MANAGE"` для записи
- Zod validation: `z.parse(data)` — throws ZodError, catch отдельно
- `try/catch` оборачивает ВСЁ включая requireSection
- `revalidatePath("/bank")` — после каждой мутации
- P2025 = Prisma record not found — стандартный код

---

## 5. Данные — Company, Lender, Money, Dates

### 5.1 Company — текущее состояние

**Model в schema.prisma** (строки 499–505):
```prisma
model Company {
  id        String            @id @default(cuid())
  name      String            @unique
  employees EmployeeCompany[]
  loans     Loan[]
  createdAt DateTime          @default(now())
}
```

**6 компаний группы** созданы через `prisma/seed-employees.ts` через `company.upsert`:
```
"ГЕЙМ БЛОКС", "ДРИМ ЛАЙН", "ЗОЙТЕН", "ПЕЛИКАН ХЭППИ ТОЙС", "СИКРЕТ ВЭЙ", "ХОУМ ЭНД БЬЮТИ"
```

**Важно:** Поля `inn`, `kpp`, `ogrn`, `shortName` в Company ОТСУТСТВУЮТ — нужно добавить через миграцию `ALTER TABLE "Company" ADD COLUMN`.

**Маппинг имён:** В выписках `ООО "ГЕЙМ БЛОКС"`, в БД `ГЕЙМ БЛОКС`. Либо нормализатор имени, либо матч по ИНН (ИНН надёжнее — решается в plan). При импорте выписок: `company.upsert({ where: { inn }, update: {}, create: { ... } })` когда ИНН заполнен.

### 5.2 Lender — текущее состояние

```prisma
model Lender {
  id        String   @id @default(cuid())
  name      String   @unique
  sortOrder Int      @default(0)
  loans     Loan[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Поля `bankId` и relation `bank` ОТСУТСТВУЮТ. Добавить через `ALTER TABLE "Lender" ADD COLUMN "bankId" TEXT REFERENCES "Bank"("id")`.

### 5.3 Decimal для денег

**Паттерн проекта** (Phase 21 D-19):
```prisma
amount    Decimal  @db.Decimal(14, 2)   // суммы операций
```

**Чтение Decimal из Prisma** — конвертация в number для клиента:
```typescript
Number(loan.amount)  // Prisma Decimal → JS number
```

**Хранение суммы BankTransaction** — из CONTEXT.md:
```prisma
amount  Decimal  @db.Decimal(18, 2)
```

### 5.4 Dates — @db.Date

**Паттерн** (из LoanPayment):
```prisma
date  DateTime  @db.Date   // только дата, без времени
```

В SQL:
```sql
"date"  DATE NOT NULL
```

**Moscow timezone** — используется в date-periods.ts:
```typescript
const MSK_OFFSET = "+03:00"
// Создание даты 00:00 МСК:
new Date(`${year}-${mm}-${dd}T00:00:00${MSK_OFFSET}`)
// Проверка текущей даты по МСК:
const mskStr = date.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })
```

**Нет готового хелпера парсинга "DD.MM.YYYY" в проекте** — нужно написать по образцу `seed-employees.ts`:
```typescript
function parseDDMMYYYY(s: string): Date | null {
  const m = String(s).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return null
  return new Date(Date.UTC(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])))
}
```

**Нет готового хелпера нормализации суммы с тысячами** — нужно написать:
```typescript
// "6,057,806.46" → 6057806.46 (ВТБ/Сбер формат)
function parseAmount(v: string | number | null): number | null {
  if (v == null || v === "") return null
  if (typeof v === "number") return v
  const cleaned = String(v).replace(/,(?=\d{3}(\.|,|$))/g, "")
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}
```

---

## 6. Testing pattern

### 6.1 Vitest config (`vitest.config.ts`)

```typescript
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./") },
  },
})
```

Запуск: `npm run test`

### 6.2 Fixture-based test (образец — `tests/excel-auto-promo.test.ts` и `tests/parse-ivanovo-excel.test.ts`)

**Структура теста парсера банковских выписок:**

```typescript
// tests/bank-import.test.ts
import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import fs from "fs"
import path from "path"
import { parseVtbStatement, parsePsbStatement, parseSberStatement, detectFormat } from "@/lib/bank-import/index"

// helpers для создания in-memory XLSX без реальных fixtures
function makeXlsx(rows: (string | number | null)[][]): Buffer {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))
}

describe("parseVtbStatement", () => {
  it("парсит рублёвый счёт (10 колонок, без CNY)", () => {
    // golden test с синтетическими данными
  })
  it("парсит CNY-счёт (12 колонок)", () => { ... })
  it("пропускает строку ИТОГО:", () => { ... })
  it("header-driven mapping — маппит по тексту заголовка строки 6", () => { ... })
})

describe("detectFormat", () => {
  it("определяет 'vtb' по имени файла VTB_BankStatement_*", () => { ... })
  it("определяет 'psb' по сигнатуре шапки (ПСБ)", () => { ... })
  it("определяет 'sber' по сигнатуре шапки (СБЕРБАНК)", () => { ... })
})
```

**Fixtures:** Положить в `tests/fixtures/` (НЕ в git если содержат реальные данные). Для тестов — синтетические XLSX через `makeXlsx(aoa_to_sheet)`.

**Golden test** — критически важен для защиты от регрессий парсера:
```typescript
describe("golden test — эталонные строки", () => {
  it("ВТБ рубли: Дата 12.03.2026, Дебет 150000, ИНН 7707083893 → ParsedTransaction", () => {
    const result = parseVtbStatement(syntheticBuffer)
    expect(result[0]).toMatchObject({
      date: new Date(Date.UTC(2026, 2, 12)),
      direction: "DEBIT",
      amount: 150000,
      currency: "RUR",
      counterpartyInn: "7707083893",
    })
  })
})
```

**КРИТИЧНО** (паттерн из `parse-auto-promo-excel.test.ts`):
- Парсер (`lib/bank-import/`) НЕ импортирует next-auth / Prisma — чистые функции
- Только `xlsx` + `crypto` (для fingerprint SHA-256)
- Иначе vitest упадёт на next-auth транзитивном импорте (Phase 7 решение)

---

## 7. Архитектура lib/bank-import/ (рекомендуемая структура)

```
lib/bank-import/
├── index.ts           — detectFormat + re-export
├── types.ts           — ParsedTransaction + ParseResult интерфейсы
├── vtb-adapter.ts     — parseVtbStatement (multi-sheet, header-driven)
├── psb-adapter.ts     — parsePsbStatement
├── sber-adapter.ts    — parseSberStatement (raw:false, merged cells)
├── normalize.ts       — parseDDMMYYYY, parseAmount, normalizePurpose
└── fingerprint.ts     — computeFingerprint (SHA-256, crypto module)
```

**Почему не в route.ts напрямую:** `parseAutoPromoExcel` вынесен в `lib/parse-auto-promo-excel.ts` — route.ts тянет next/server, vitest падает на next-auth транзитивном импорте (Phase 7 паттерн, STATE.md).

**Fingerprint** — SHA-256 через Node.js crypto (уже в проекте, нет новых зависимостей):
```typescript
import { createHash } from "crypto"
export function computeFingerprint(fields: string[]): string {
  return createHash("sha256").update(fields.join("|")).digest("hex")
}
```

---

## 8. Inline категоризация операций (из CreditsTable pattern)

Inline-редактирование через native `<select>` (CLAUDE.md: native select, не base-ui):

```typescript
// В BankTransactionsTable — client component
function CategoryCell({ txId, current, canManage }: { txId: string; current: TxCategory; canManage: boolean }) {
  const [value, setValue] = useState(current)
  const [, startTransition] = useTransition()

  if (!canManage) return <span>{CATEGORY_LABELS[current]}</span>

  return (
    <select value={value} onChange={e => {
      const next = e.target.value as TxCategory
      setValue(next)
      startTransition(async () => {
        const result = await categorizeTx(txId, next)
        if (!result.ok) toast.error(result.error)
      })
    }}
      className="h-7 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
    >
      {CATEGORY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  )
}
```

---

## 9. Провизионирование UserSectionRole (из memory)

После добавления `BANK` в ERP_SECTION **обязательно** провизионировать права существующим пользователям через SQL в конце migration.sql или отдельным действием:

```sql
-- Провизионировать BANK доступ пользователям (заполнить кому нужен доступ)
-- Образец: дать MANAGE суперадмину (id из БД)
-- Остальные пользователи должны получить права явно через /admin/users
```

Из `memory/feedback_zoiten_new_section_rbac.md`: при добавлении раздела обязательно провизионить `UserSectionRole` пользователям, иначе все кроме SUPERADMIN получат 403. Спросить у пользователя кому нужен доступ.

---

## 10. Существующие зависимости

- `xlsx` (^0.18.5) — УЖЕ в зависимостях (CONTEXT.md подтвердил)
- `crypto` — Node.js built-in, без установки
- `sonner` — toast уведомления, УЖЕ в проекте (CreditsTable, WbUploadIuButton)
- `vitest` — УЖЕ в devDependencies (Phase 7)
- `zod` — УЖЕ в зависимостях (Phase 7 z.object, z.string...)
- Lucide `Building2` / `Landmark` / `Wallet` — проверить что нужный icon есть в lucide-react (Landmark уже импортирован)

---

## Project Constraints (from CLAUDE.md)

Все директивы из CLAUDE.md, релевантные для Phase 22:

1. **Язык:** Русский для UI, комментариев, документации
2. **Select:** native HTML `<select>`, НЕ base-ui Select
3. **Server Actions:** `"use server"` + `requireSection()` + `try/catch` + `revalidatePath`
4. **Sticky таблицы:** НЕ shadcn `<Table>/<TableHeader>/<TableRow>` в шапке; `border-separate border-spacing-0`; `bg-background` (без прозрачности) на sticky-ячейках; `flex-1 min-h-0` на контейнере
5. **Prefetch в списках:** `<Link prefetch={false}>` в sidebar (уже реализовано); таблицы с >100 строк — тоже
6. **Время:** Moscow timezone (Europe/Moscow, MSK_OFFSET = "+03:00")
7. **SKU генерация:** `$queryRaw SELECT nextval` — не применяется в Phase 22
8. **WB v4 API curl:** не применяется в Phase 22
9. **Новый ERP_SECTION чеклист:** все 6 точек обязательны, включая section-labels.ts (часто забывают)
10. **Каскадные фильтры:** Порядок Направление→Бренд→Категория→Подкатегория для product-таблиц; для bank-таблицы каскад не нужен (без иерархии товаров)
11. **Миграции:** только вручную SQL, `prisma migrate deploy` на VPS через deploy.sh
12. **Per-user UI настройки:** поле на User модели, НЕ localStorage; НЕ нужно в Phase 22 scope

---

## Open Questions

1. **Иконка для /bank:** `Landmark` уже используется для Credits. Рекомендация: `Building2` (здание банка) из lucide-react — нужно добавить импорт в nav-items.ts.

2. **detectFormat по имени файла vs шапке:** Имя файла надёжнее для ВТБ (`VTB_BankStatement_*`), шапка — для ПСБ/Сбер. Нужен двухуровневый детект: сначала имя, затем сигнатура строки шапки.

3. **Fingerprint для BankTransaction:** `@unique` на `fingerprint` в схеме → при `createMany` дубли вызовут ошибку уникальности. Решение: использовать `createMany({ data, skipDuplicates: true })` — Prisma поддерживает, дубли silently пропускаются и считаются в `rowsSkipped`.

4. **Провизионирование UserSectionRole:** Спросить пользователя кому нужен доступ BANK до деплоя.

5. **Компания из выписки → Company в БД:** ИНН как primary key матча (когда заполнен в Company). Для первого импорта — вероятно ИНН в Company ещё НЕ заполнен. Два варианта: (a) seed ИНН в Company до первого импорта через отдельную миграцию или скрипт; (b) нормализатор имени как fallback. Рекомендую вариант (a) — seed ИНН в migration.sql через UPDATE.

---

## Sources

### PRIMARY (HIGH confidence — прямо из исходного кода)
- `c:/Users/User/zoiten-pro/prisma/schema.prisma` — полная схема, enum ERP_SECTION (строки 21–34), Company (499–505), Lender (1231–1238), Loan/LoanPayment (1243–1276)
- `c:/Users/User/zoiten-pro/prisma/migrations/20260609_phase21_credits/migration.sql` — образец SQL миграции с ALTER TYPE, CREATE TABLE, FK constraints
- `c:/Users/User/zoiten-pro/app/api/wb-commission-iu/route.ts` — полный Excel upload API route pattern
- `c:/Users/User/zoiten-pro/components/cards/WbUploadIuButton.tsx` — кнопка-загрузчик Excel
- `c:/Users/User/zoiten-pro/app/(dashboard)/credits/page.tsx` — RSC page pattern
- `c:/Users/User/zoiten-pro/app/actions/credits.ts` — server actions pattern
- `c:/Users/User/zoiten-pro/components/credits/CreditsTable.tsx` — sticky table pattern
- `c:/Users/User/zoiten-pro/components/credits/CreditsFilters.tsx` — filters + URL state pattern
- `c:/Users/User/zoiten-pro/lib/sections.ts` — SECTION_PATHS (текущие значения)
- `c:/Users/User/zoiten-pro/components/layout/section-titles.ts` — SECTION_TITLES
- `c:/Users/User/zoiten-pro/components/layout/nav-items.ts` — NAV_ITEMS + ICON_MAP
- `c:/Users/User/zoiten-pro/lib/section-labels.ts` — SECTION_OPTIONS
- `c:/Users/User/zoiten-pro/lib/rbac.ts` — requireSection + getSectionRole
- `c:/Users/User/zoiten-pro/vitest.config.ts` — vitest config
- `c:/Users/User/zoiten-pro/tests/excel-auto-promo.test.ts` — Excel fixture test pattern
- `c:/Users/User/zoiten-pro/tests/parse-ivanovo-excel.test.ts` — парсер Excel + synthetic fixture pattern
- `c:/Users/User/zoiten-pro/tests/loan-math.test.ts` — unit test pattern без fixtures
- `c:/Users/User/zoiten-pro/scripts/parse-suppliers-xlsx.cjs` — Excel parsing helpers (clean, collapse, excelDate, parsePayment)
- `c:/Users/User/zoiten-pro/prisma/seed-employees.ts` — Company upsert + 6 компаний
- `c:/Users/User/zoiten-pro/scripts/seed-credits.ts` — разовый seed скрипт pattern
- `c:/Users/User/zoiten-pro/lib/date-periods.ts` — Moscow TZ helpers

---

## Metadata

**Confidence breakdown:**
- 6-точечный чеклист ERP_SECTION: HIGH — верифицировано из всех 5 файлов
- Excel upload pattern: HIGH — верифицировано из работающего кода wb-commission-iu
- Sticky table pattern: HIGH — верифицировано из CreditsTable
- Filters pattern: HIGH — верифицировано из CreditsFilters
- Server actions: HIGH — верифицировано из credits.ts
- Company/Lender model: HIGH — из schema.prisma напрямую
- Money/Date conventions: HIGH — Decimal(14,2), @db.Date, MSK_OFFSET

**Research date:** 2026-06-10
**Valid until:** 2026-07-10 (stable codebase)
