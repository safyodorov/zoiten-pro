---
phase: quick/260410-mya-wrap-prices-wb-sticky
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - app/actions/user-preferences.ts
  - app/(dashboard)/prices/wb/page.tsx
  - components/prices/PriceCalculatorTableWrapper.tsx
  - components/prices/PriceCalculatorTable.tsx
autonomous: false
requirements:
  - RESIZE-COLUMNS
  - WRAP-HEADERS
  - PERSIST-PER-USER-DB
  - FIX-STICKY-TRANSPARENCY
must_haves:
  truths:
    - "Пользователь может потянуть мышкой за правую границу любого из 30 столбцов таблицы /prices/wb и изменить его ширину"
    - "После изменения ширины и перезагрузки страницы (или открытия на другом устройстве под тем же логином) ширины столбцов восстанавливаются"
    - "Заголовки длинных столбцов (например 'Цена со скидкой WB клуба', 'Доставка на маркеплейс, руб.') переносятся по словам на 2-3 строки, а не создают гигантски широкую колонку"
    - "При горизонтальном скролле и наведении на строку 4 sticky-колонки (Фото/Сводка/Ярлык/Артикул) остаются ПОЛНОСТЬЮ непрозрачными — контент справа не просвечивает"
    - "Правая граница sticky-зоны (после колонки Артикул) имеет тонкую тень, визуально отделяющую её от скроллируемой области"
    - "Двойной клик по drag-handle сбрасывает ширину одной колонки к дефолту"
    - "Новые пользователи без сохранённых preferences видят дефолтные ширины; старые записи с неизвестными ключами merge'атся с DEFAULT_WIDTHS без потери дефолтов"
    - "Prisma миграция add_user_preference применена на prod БД через `prisma migrate deploy` (не `migrate dev`)"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "Модель UserPreference (userId, key, value Json) + обратная связь User.preferences"
      contains: "model UserPreference"
    - path: "app/actions/user-preferences.ts"
      provides: "getUserPreference<T>(key) / setUserPreference<T>(key, value) — auth-only, без requireSection"
      contains: "export async function setUserPreference"
    - path: "app/(dashboard)/prices/wb/page.tsx"
      provides: "Серверная загрузка columnWidthsPref через getUserPreference и проброс в PriceCalculatorTableWrapper"
      contains: "getUserPreference"
    - path: "components/prices/PriceCalculatorTableWrapper.tsx"
      provides: "Проп initialColumnWidths, проброс в PriceCalculatorTable"
      contains: "initialColumnWidths"
    - path: "components/prices/PriceCalculatorTable.tsx"
      provides: "Resize handles, table-layout fixed, cumulative sticky offsets, debounced save, wrap headers, непрозрачный hover, shadow-разделитель"
      contains: "table-fixed"
  key_links:
    - from: "app/(dashboard)/prices/wb/page.tsx"
      to: "app/actions/user-preferences.ts"
      via: "await getUserPreference<Record<string, number>>('prices.wb.columnWidths')"
      pattern: "getUserPreference"
    - from: "components/prices/PriceCalculatorTable.tsx startResize()"
      to: "app/actions/user-preferences.ts setUserPreference"
      via: "debounced 500ms save в useRef<timer> после mouseup"
      pattern: "setUserPreference.*prices\\.wb\\.columnWidths"
    - from: "th inline style width"
      to: "td inline style width"
      via: "columnWidths[key] ключ как на th, так и на td — одинаковые значения"
      pattern: "style=\\{\\{\\s*width:"
    - from: "th sticky inline style left"
      to: "cumulative stickyLefts из columnWidths"
      via: "stickyLefts.svodka = columnWidths.photo и т.д."
      pattern: "stickyLefts"
---

<objective>
Добавить 4 фичи на страницу https://zoiten.pro/prices/wb (`PriceCalculatorTable`):

1. **Резайз любого из 30 столбцов** — drag-handle на правой границе th, min width 60px, double-click → reset.
2. **Перенос длинных заголовков по словам** — убрать `whitespace-nowrap`, добавить `break-words leading-tight text-[11px]`, стабильная min-height thead.
3. **Персистентность per-user в БД** — новая таблица `UserPreference` (key/value Json), server actions `getUserPreference` / `setUserPreference`, debounced save 500ms.
4. **Фикс прозрачности sticky-колонок** — заменить `group-hover:bg-muted/50` на `group-hover:bg-muted` (полная непрозрачность), добавить `shadow-[4px_0_6px_-1px_rgba(0,0,0,0.08)]` на правую границу колонки Артикул как визуальный разделитель зон.

Purpose: Пользователь сможет подгонять таблицу под свои нужды (ширины столбцов) и эти настройки переживут перезагрузку + работают кросс-девайс. Фикс непрозрачности убирает визуальный баг, который отвлекает при работе со скроллом.
Output: 5 изменённых файлов (1 новый, 4 модификация), миграция БД, задеплоено на VPS, проверено через Chrome MCP + подтверждение пользователя.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@prisma/schema.prisma
@app/actions/pricing.ts
@lib/rbac.ts
@lib/pricing-math.ts
@components/prices/PriceCalculatorTable.tsx
@components/prices/PriceCalculatorTableWrapper.tsx
@app/(dashboard)/prices/wb/page.tsx
@.planning/quick/260410-leh-wb-globalratesbar/260410-leh-PLAN.md

# Контекст задачи
- Production URL: https://zoiten.pro/prices/wb
- Деплой: `ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"` (но сначала `prisma migrate deploy` отдельно или в рамках deploy.sh)
- Фаза 7 (prices-wb) полностью завершена, это post-release улучшение UX
- Предыдущий quick 260410-leh починил ширины sticky + GlobalRatesBar layout — ширины там захардкожены через `min-w-[Npx] w-[Npx]`. Этот quick должен ПЕРЕПИСАТЬ этот механизм на inline style + state.
- Язык коммитов/комментариев/UI: русский
- Технологии: Next.js 15 App Router, React 19, Prisma 6 + PostgreSQL 16, Tailwind v4, Auth.js v5

# Паттерны в проекте (чтобы следовать)
- **AppSetting** (key/value TEXT) — как эталон KeyValue хранилища, но он один на всё приложение. Для per-user нужна отдельная таблица UserPreference.
- **GlobalRatesBar** — эталон debounced save (500ms useRef<Record<key, timer>> на отдельный таймер per-field).
- **updateAppSetting** в `app/actions/pricing.ts` — эталон server action (но требует `requireSection("PRICES", "MANAGE")`; для UserPreference достаточно auth без role).
- **auth()** из `@/lib/auth` — источник userId (session.user.id).

# Ключевые типы и интерфейсы (embedded чтобы executor не искал)

Из `components/prices/PriceCalculatorTable.tsx`:
```ts
interface PriceCalculatorTableProps {
  groups: ProductGroup[]
  onRowClick?: (card, row, productId) => void
  // ← ДОБАВИТЬ:
  // initialColumnWidths?: Record<string, number>
}
```

Из `components/prices/PriceCalculatorTableWrapper.tsx`:
```ts
interface PriceCalculatorTableWrapperProps {
  groups: ProductGroup[]
  // ← ДОБАВИТЬ:
  // initialColumnWidths?: Record<string, number>
}
```

Из `lib/pricing-math.ts` — `COLUMN_ORDER` — 30 элементов (индексы 0..29). Для 30 ключей можно оставить заголовки как есть, но маппинг `header → columnKey` проще делать через явный массив COLUMN_KEYS (см. ниже в плане).

Из `prisma/schema.prisma` — модель User:
```prisma
model User {
  id    String @id @default(cuid())
  ...
  sectionRoles UserSectionRole[]
  // ← ДОБАВИТЬ:
  // preferences  UserPreference[]
}
```

# Ключевые pitfalls (обязательно учесть)

1. **`table-layout: fixed` требует явных ширин на ВСЕХ колонках**, иначе они делят остаток поровну. Поэтому все 30 `<th>` и `<td>` должны получить `style={{ width: columnWidths[key], minWidth: columnWidths[key] }}`.
2. **Сумма widths должна позволять overflow-x**: если сумма меньше container width, справа будет пусто. Дефолты подобраны так, чтобы в сумме ~2400px (заметно шире большинства экранов).
3. **Sticky offsets cumulative**: `left` для Сводка = columnWidths.photo, для Ярлык = columnWidths.photo + columnWidths.svodka, и т.д. После resize Фото сдвигаются все остальные sticky колонки — это работает автоматически через recompute stickyLefts при каждом render.
4. **Resize throttle**: не вызывать setState на каждый pixel move — использовать `requestAnimationFrame` для батчинга mousemove обновлений.
5. **initialColumnWidths merge**: `{...DEFAULT_WIDTHS, ...(initialColumnWidths ?? {})}` — старые сохранённые значения с неизвестными ключами просто игнорируются (не записываются при следующем save).
6. **Prisma миграция**: на локальной машине нет PostgreSQL (см. STATE.md — [Phase 01-foundation-auth]: Migration marked pending), поэтому делаем `prisma migrate dev --create-only --name add_user_preference` (создаёт SQL файл, но не применяет), затем `npx prisma generate`. На VPS применяем через `prisma migrate deploy`.
7. **deploy.sh уже включает `prisma migrate deploy`** (из STATE.md: [Phase 06]: deploy.sh uses prisma migrate deploy) — значит после `git push` деплой применит миграцию автоматически.

# Out of scope (НЕ делать)
- НЕ переходить на TanStack Table
- НЕ добавлять column visibility toggle
- НЕ добавлять reorder колонок
- НЕ добавлять resize для строк (высота)
- НЕ делать preferences для других страниц — только `prices.wb.columnWidths`
</context>

<tasks>

<task type="auto">
  <name>Задача 1: Prisma миграция — модель UserPreference + server actions</name>
  <files>prisma/schema.prisma, app/actions/user-preferences.ts</files>
  <action>
**Шаг 1 — Добавить модель UserPreference в `prisma/schema.prisma`:**

Вставить новую модель в конец секции Phase 7 (после `WbPromotionNomenclature`, перед возможным концом файла). Точное место: после строки 425 (после `@@unique([promotionId, nmId])` и закрывающей `}`), либо в логически удобном месте — рядом с моделью User. Лучше разместить сразу ПОСЛЕ модели `UserSectionRole` (строка ~82), чтобы user-related модели были вместе.

```prisma
// ──────────────────────────────────────────────────────────────────
// User Preferences — персистентные настройки UI per-user (key/value JSON)
// ──────────────────────────────────────────────────────────────────
// Используется для хранения кастомизаций UI: ширины столбцов таблиц,
// выбранные фильтры, предпочтения сортировок и т.п.
// key формат: "<section>.<page>.<setting>" (например "prices.wb.columnWidths")
model UserPreference {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  key       String
  value     Json
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@unique([userId, key])
  @@index([userId])
}
```

**Шаг 2 — Добавить обратную связь в модель User** (строки 51-67):

После строки `sectionRoles    UserSectionRole[]` добавить:
```prisma
  preferences     UserPreference[]
```

**Шаг 3 — Создать миграцию (create-only — локального Postgres нет):**

```bash
npx prisma migrate dev --create-only --name add_user_preference
```

Это создаст папку `prisma/migrations/YYYYMMDDHHMMSS_add_user_preference/` с `migration.sql`. Проверь содержимое migration.sql — должно содержать `CREATE TABLE "UserPreference"` и `CREATE UNIQUE INDEX "UserPreference_userId_key_key"`.

Если миграция не создаётся из-за отсутствия DATABASE_URL — использовать fallback:
```bash
DATABASE_URL="postgresql://fake:fake@localhost:5432/fake" npx prisma migrate dev --create-only --name add_user_preference
```

**Шаг 4 — Сгенерировать Prisma Client:**
```bash
npx prisma generate
```

**Шаг 5 — Создать файл `app/actions/user-preferences.ts`:**

```ts
// app/actions/user-preferences.ts
// Server actions для персистентных per-user настроек UI.
// Паттерн: key/value JSON хранилище, auth-only (без requireSection —
// это пользовательские настройки UI, не данные домена).
//
// Использование:
//   const widths = await getUserPreference<Record<string, number>>("prices.wb.columnWidths")
//   await setUserPreference("prices.wb.columnWidths", { photo: 128, svodka: 200 })

"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

/** Прочитать per-user настройку по ключу. null если не задана. */
export async function getUserPreference<T = unknown>(
  key: string,
): Promise<T | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  try {
    const row = await prisma.userPreference.findUnique({
      where: { userId_key: { userId: session.user.id, key } },
    })
    if (!row) return null
    return row.value as T
  } catch (e) {
    console.error("[getUserPreference]", e)
    return null
  }
}

/** Записать per-user настройку (upsert). */
export async function setUserPreference<T = unknown>(
  key: string,
  value: T,
): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false, error: "Не авторизован" }
  }

  if (!key || key.length === 0 || key.length > 200) {
    return { ok: false, error: "Некорректный ключ настройки" }
  }

  try {
    await prisma.userPreference.upsert({
      where: { userId_key: { userId: session.user.id, key } },
      // Prisma Json поле: передаём как unknown чтобы обойти InputJsonValue strict
      create: { userId: session.user.id, key, value: value as never },
      update: { value: value as never },
    })
    // revalidatePath НЕ вызываем — клиент сам применит state, серверный рендер
    // UserPreference читается только при загрузке страницы.
    return { ok: true }
  } catch (e) {
    console.error("[setUserPreference]", e)
    return { ok: false, error: (e as Error).message }
  }
}
```

**Важные примечания:**
- `requireSection` НЕ используется — это пользовательские настройки UI, любой залогиненный пользователь может читать/писать СВОИ preferences.
- `auth()` возвращает session с `user.id` (cuid из модели User) — используется как ключ компаунд-индекса `userId_key`.
- `revalidatePath` НЕ вызываем потому что state управляется на клиенте. Серверная страница читает preferences только при первичной загрузке.
  </action>
  <verify>
    <automated>npx prisma validate && npx tsc --noEmit 2>&1 | grep -E "user-preferences|schema\\.prisma|error TS" | head -20</automated>
  </verify>
  <done>
- `prisma/schema.prisma` содержит модель `UserPreference` с `@@unique([userId, key])` и обратной связью `User.preferences`
- Миграция `prisma/migrations/*_add_user_preference/migration.sql` создана
- `app/actions/user-preferences.ts` существует, экспортирует `getUserPreference` и `setUserPreference`
- `npx prisma validate` проходит без ошибок
- `npx tsc --noEmit` не выдаёт новых ошибок
  </done>
</task>

<task type="auto">
  <name>Задача 2: RSC page.tsx + Wrapper — проброс initialColumnWidths</name>
  <files>app/(dashboard)/prices/wb/page.tsx, components/prices/PriceCalculatorTableWrapper.tsx</files>
  <action>
**Шаг 1 — Изменить `app/(dashboard)/prices/wb/page.tsx`:**

Найти блок импортов (строки 11-32) и добавить импорт:
```ts
import { getUserPreference } from "@/app/actions/user-preferences"
```

Найти блок `Promise.all` (строка ~84) и добавить четвёртый параллельный запрос — загрузку column widths preference:

Текущий код:
```ts
const [appSettings, promotions, linkedArticles] = await Promise.all([
  prisma.appSetting.findMany({...}),
  prisma.wbPromotion.findMany({...}),
  prisma.marketplaceArticle.findMany({...}),
])
```

Изменить на:
```ts
const [appSettings, promotions, linkedArticles, columnWidthsPref] =
  await Promise.all([
    prisma.appSetting.findMany({...}),
    prisma.wbPromotion.findMany({...}),
    prisma.marketplaceArticle.findMany({...}),
    getUserPreference<Record<string, number>>("prices.wb.columnWidths"),
  ])
```

Найти рендер `<PriceCalculatorTableWrapper groups={groups} />` (строка ~428) и заменить на:
```tsx
<PriceCalculatorTableWrapper
  groups={groups}
  initialColumnWidths={columnWidthsPref ?? {}}
/>
```

**Шаг 2 — Изменить `components/prices/PriceCalculatorTableWrapper.tsx`:**

Обновить интерфейс `PriceCalculatorTableWrapperProps` (строка 23):
```ts
interface PriceCalculatorTableWrapperProps {
  groups: ProductGroup[]
  initialColumnWidths?: Record<string, number>
}
```

Обновить сигнатуру функции (строка 32):
```tsx
export function PriceCalculatorTableWrapper({
  groups,
  initialColumnWidths,
}: PriceCalculatorTableWrapperProps) {
```

Обновить вызов `<PriceCalculatorTable>` (строка 50):
```tsx
<PriceCalculatorTable
  groups={groups}
  onRowClick={handleRowClick}
  initialColumnWidths={initialColumnWidths}
/>
```

**Важные примечания:**
- Проп необязательный (`?`) для обратной совместимости + для кейсов когда пользователь ещё ничего не сохранял (getUserPreference вернёт null → `?? {}` даст пустой объект).
- Порядок destructuring параметров не важен — важно что `initialColumnWidths` появляется в обоих местах.
- НЕ менять другие параметры/логику обёртки (dialog state, handleRowClick).
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -E "prices/wb/page|PriceCalculatorTableWrapper|error TS" | head -20</automated>
  </verify>
  <done>
- `page.tsx`: getUserPreference вызывается в Promise.all, результат пробрасывается в Wrapper через `initialColumnWidths`
- `PriceCalculatorTableWrapper.tsx`: принимает `initialColumnWidths?: Record<string, number>` и пробрасывает в `PriceCalculatorTable`
- `npx tsc --noEmit` не выдаёт новых ошибок в этих файлах
  </done>
</task>

<task type="auto">
  <name>Задача 3: PriceCalculatorTable — resize + state + wrap + transparency fix + persist</name>
  <files>components/prices/PriceCalculatorTable.tsx</files>
  <action>
Это главный и самый большой файл. Изменения делаются через Edit tool, точечно по секциям. Рекомендую работать сверху вниз.

**Шаг 1 — Импорты (строки 21-32):**

Добавить новые импорты:
```ts
import { useState, useRef, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { setUserPreference } from "@/app/actions/user-preferences"
```

Убедись что `React` уже импортирован через `import * as React from "react"` (оставить как есть).

**Шаг 2 — Добавить константы COLUMN_KEYS и DEFAULT_WIDTHS (после секции "Types", перед секцией "Helpers"):**

```ts
// ──────────────────────────────────────────────────────────────────
// Column resize constants (план 260410-mya)
// ──────────────────────────────────────────────────────────────────

/** Ключи всех 30 колонок в порядке рендера.
 *  Используется как ключ в columnWidths state + как id для drag-handle.
 *  Первые 4 — sticky колонки, остальные 26 — скроллируемые. */
const COLUMN_KEYS = [
  // Sticky (4)
  "photo",
  "svodka",
  "yarlyk",
  "artikul",
  // Scroll: Статус цены + 25 расчётных (соответствуют COLUMN_ORDER[4..29])
  "status",
  "buyoutPct",
  "sellerPriceBeforeDiscount",
  "sellerDiscountPct",
  "sellerPrice",
  "wbDiscountPct",
  "priceAfterWbDiscount",
  "clubDiscountPct",
  "priceAfterClubDiscount",
  "walletPct",
  "priceAfterWallet",
  "acquiringAmount",
  "commFbwPct",
  "commissionAmount",
  "drrPct",
  "drrAmount",
  "jemAmount",
  "transferAmount",
  "costPrice",
  "defectAmount",
  "deliveryAmount",
  "creditAmount",
  "overheadAmount",
  "taxAmount",
  "profit",
  "returnOnSalesPct",
  "roiPct",
] as const

type ColumnKey = (typeof COLUMN_KEYS)[number]

/** Дефолтные ширины колонок в px.
 *  Sum ≈ 2480px → гарантированно шире любого экрана → скролл всегда работает. */
const DEFAULT_WIDTHS: Record<ColumnKey, number> = {
  photo: 128,
  svodka: 200,
  yarlyk: 72,
  artikul: 112,
  status: 180,
  buyoutPct: 80,
  sellerPriceBeforeDiscount: 110,
  sellerDiscountPct: 90,
  sellerPrice: 100,
  wbDiscountPct: 80,
  priceAfterWbDiscount: 110,
  clubDiscountPct: 80,
  priceAfterClubDiscount: 110,
  walletPct: 80,
  priceAfterWallet: 110,
  acquiringAmount: 95,
  commFbwPct: 90,
  commissionAmount: 100,
  drrPct: 70,
  drrAmount: 95,
  jemAmount: 100,
  transferAmount: 110,
  costPrice: 100,
  defectAmount: 90,
  deliveryAmount: 100,
  creditAmount: 95,
  overheadAmount: 110,
  taxAmount: 90,
  profit: 100,
  returnOnSalesPct: 90,
  roiPct: 80,
}

const MIN_COLUMN_WIDTH = 60
const RESIZE_SAVE_DEBOUNCE_MS = 500
const PREFERENCE_KEY = "prices.wb.columnWidths"
```

**Шаг 3 — Обновить интерфейс Props (строка ~132):**

```ts
interface PriceCalculatorTableProps {
  groups: ProductGroup[]
  onRowClick?: (
    card: WbCardRowGroup["card"],
    row: PriceRow,
    productId: string,
  ) => void
  /** Сохранённые ширины столбцов из UserPreference (план 260410-mya). */
  initialColumnWidths?: Record<string, number>
}
```

**Шаг 4 — Обновить сигнатуру компонента (строка ~184):**

```tsx
export function PriceCalculatorTable({
  groups,
  onRowClick,
  initialColumnWidths,
}: PriceCalculatorTableProps) {
```

**Шаг 5 — Добавить state + resize логику в начале компонента (сразу после проверки `if (groups.length === 0)`):**

```tsx
  // ── Column widths state ─────────────────────────────────────────
  // Merge: DEFAULT_WIDTHS + сохранённые значения (незнакомые ключи игнорируются)
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(
    () => ({
      ...DEFAULT_WIDTHS,
      ...(initialColumnWidths ?? {}),
    }),
  )

  // Debounced save таймер
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleSave = useCallback((widths: Record<ColumnKey, number>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const result = await setUserPreference(PREFERENCE_KEY, widths)
      if (!result.ok) {
        toast.error(`Не удалось сохранить ширины: ${result.error}`)
      }
    }, RESIZE_SAVE_DEBOUNCE_MS)
  }, [])

  // Resize drag state — храним в ref чтобы не ре-рендерить на каждое движение
  const resizeStateRef = useRef<{
    key: ColumnKey
    startX: number
    startWidth: number
  } | null>(null)
  const rafIdRef = useRef<number | null>(null)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const state = resizeStateRef.current
    if (!state) return
    if (rafIdRef.current != null) return // throttle via rAF

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null
      const s = resizeStateRef.current
      if (!s) return
      const delta = e.clientX - s.startX
      const newWidth = Math.max(MIN_COLUMN_WIDTH, s.startWidth + delta)
      setColumnWidths((prev) => ({ ...prev, [s.key]: newWidth }))
    })
  }, [])

  const handleMouseUp = useCallback(() => {
    resizeStateRef.current = null
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    document.removeEventListener("mousemove", handleMouseMove)
    document.removeEventListener("mouseup", handleMouseUp)
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
    // Сохранить актуальные widths (читаем из функционального setState для гарантии свежего значения)
    setColumnWidths((current) => {
      scheduleSave(current)
      return current
    })
  }, [handleMouseMove, scheduleSave])

  const startResize = useCallback(
    (e: React.MouseEvent, key: ColumnKey) => {
      e.preventDefault()
      e.stopPropagation()
      resizeStateRef.current = {
        key,
        startX: e.clientX,
        startWidth: columnWidths[key],
      }
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
    },
    [columnWidths, handleMouseMove, handleMouseUp],
  )

  const resetColumnWidth = useCallback(
    (key: ColumnKey) => {
      setColumnWidths((prev) => {
        const next = { ...prev, [key]: DEFAULT_WIDTHS[key] }
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  // Cleanup на unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current)
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  // Cumulative sticky left offsets (пересчитываются на каждый render)
  const stickyLefts = {
    photo: 0,
    svodka: columnWidths.photo,
    yarlyk: columnWidths.photo + columnWidths.svodka,
    artikul:
      columnWidths.photo + columnWidths.svodka + columnWidths.yarlyk,
  }
```

**Шаг 6 — Helper-компонент для drag handle (добавить выше `export function PriceCalculatorTable`, рядом с другими helper):**

```tsx
/** Drag handle на правой границе <th>. Захватывает mouse events и
 *  двойным кликом сбрасывает колонку к дефолту. */
function ColumnResizeHandle({
  onMouseDown,
  onDoubleClick,
}: {
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 z-50"
      title="Потяните чтобы изменить ширину. Двойной клик — сброс к дефолту."
    />
  )
}
```

**Шаг 7 — Изменить `<table>` (строка ~214) — добавить `table-fixed`:**

Было:
```tsx
<table className="w-full caption-bottom text-sm border-collapse">
```
Стало:
```tsx
<table className="caption-bottom text-sm border-collapse table-fixed" style={{ width: "max-content", minWidth: "100%" }}>
```

Почему `width: max-content` + `minWidth: 100%`: table-fixed с явными widths должна иметь общую ширину = сумме колонок. `max-content` позволяет таблице быть равной сумме widths; `minWidth: 100%` страхует случай когда сумма меньше контейнера.

**Шаг 8 — Переписать thead (строки ~215-247):**

Полностью заменить блок `<thead>` на:

```tsx
<thead className="sticky top-0 z-30 bg-background border-b">
  <tr className="min-h-[56px]">
    {/* Sticky 1: Фото */}
    <th
      style={{
        width: columnWidths.photo,
        minWidth: columnWidths.photo,
        left: stickyLefts.photo,
      }}
      className="sticky z-40 bg-background border-r px-2 py-2 text-[11px] font-medium text-muted-foreground text-left align-bottom whitespace-normal break-words leading-tight relative"
    >
      Фото
      <ColumnResizeHandle
        onMouseDown={(e) => startResize(e, "photo")}
        onDoubleClick={() => resetColumnWidth("photo")}
      />
    </th>
    {/* Sticky 2: Сводка */}
    <th
      style={{
        width: columnWidths.svodka,
        minWidth: columnWidths.svodka,
        left: stickyLefts.svodka,
      }}
      className="sticky z-40 bg-background border-r px-3 py-2 text-[11px] font-medium text-muted-foreground text-left align-bottom whitespace-normal break-words leading-tight relative"
    >
      Сводка
      <ColumnResizeHandle
        onMouseDown={(e) => startResize(e, "svodka")}
        onDoubleClick={() => resetColumnWidth("svodka")}
      />
    </th>
    {/* Sticky 3: Ярлык */}
    <th
      style={{
        width: columnWidths.yarlyk,
        minWidth: columnWidths.yarlyk,
        left: stickyLefts.yarlyk,
      }}
      className="sticky z-40 bg-background border-r px-2 py-2 text-[11px] font-medium text-muted-foreground text-left align-bottom whitespace-normal break-words leading-tight relative"
    >
      Ярлык
      <ColumnResizeHandle
        onMouseDown={(e) => startResize(e, "yarlyk")}
        onDoubleClick={() => resetColumnWidth("yarlyk")}
      />
    </th>
    {/* Sticky 4: Артикул — правая граница sticky-зоны, добавляем shadow-разделитель */}
    <th
      style={{
        width: columnWidths.artikul,
        minWidth: columnWidths.artikul,
        left: stickyLefts.artikul,
      }}
      className="sticky z-40 bg-background border-r px-2 py-2 text-[11px] font-medium text-muted-foreground text-left align-bottom whitespace-normal break-words leading-tight relative shadow-[4px_0_6px_-1px_rgba(0,0,0,0.08)]"
    >
      Артикул
      <ColumnResizeHandle
        onMouseDown={(e) => startResize(e, "artikul")}
        onDoubleClick={() => resetColumnWidth("artikul")}
      />
    </th>
    {/* Остальные 26 колонок — Статус цены + SCROLL_HEADERS */}
    {SCROLL_COLUMNS.map(({ key, label }) => (
      <th
        key={key}
        style={{
          width: columnWidths[key],
          minWidth: columnWidths[key],
        }}
        className="px-2 py-2 text-[11px] font-medium text-muted-foreground text-right align-bottom whitespace-normal break-words leading-tight relative"
      >
        {label}
        <ColumnResizeHandle
          onMouseDown={(e) => startResize(e, key)}
          onDoubleClick={() => resetColumnWidth(key)}
        />
      </th>
    ))}
  </tr>
</thead>
```

Но для этого нужен массив SCROLL_COLUMNS. Добавь его в helpers секцию (рядом с COLUMN_KEYS):

```ts
/** 26 скроллируемых колонок: ключ + label для рендера thead.
 *  Порядок СТРОГО соответствует порядку td в tbody. */
const SCROLL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "status", label: "Статус цены" },
  { key: "buyoutPct", label: "Процент выкупа" },
  { key: "sellerPriceBeforeDiscount", label: "Цена для установки" },
  { key: "sellerDiscountPct", label: "Скидка продавца" },
  { key: "sellerPrice", label: "Цена продавца" },
  { key: "wbDiscountPct", label: "Скидка WB" },
  { key: "priceAfterWbDiscount", label: "Цена со скидкой WB" },
  { key: "clubDiscountPct", label: "WB Клуб" },
  { key: "priceAfterClubDiscount", label: "Цена со скидкой WB клуба" },
  { key: "walletPct", label: "Кошелёк" },
  { key: "priceAfterWallet", label: "Цена с WB кошельком" },
  { key: "acquiringAmount", label: "Эквайринг" },
  { key: "commFbwPct", label: "Комиссия, %" },
  { key: "commissionAmount", label: "Комиссия, руб." },
  { key: "drrPct", label: "ДРР, %" },
  { key: "drrAmount", label: "Реклама, руб." },
  { key: "jemAmount", label: "Тариф джем, руб." },
  { key: "transferAmount", label: "К перечислению" },
  { key: "costPrice", label: "Закупка, руб." },
  { key: "defectAmount", label: "Брак, руб." },
  { key: "deliveryAmount", label: "Доставка на маркеплейс, руб." },
  { key: "creditAmount", label: "Кредит, руб." },
  { key: "overheadAmount", label: "Общие расходы, руб." },
  { key: "taxAmount", label: "Налог, руб." },
  { key: "profit", label: "Прибыль, руб." },
  { key: "returnOnSalesPct", label: "Re продаж, %" },
  { key: "roiPct", label: "ROI, %" },
]
```

Убери старую константу `SCROLL_HEADERS = COLUMN_ORDER.slice(4)` (строка 209) — она больше не нужна.

**Шаг 9 — Переписать 4 sticky `<td>` ячейки (Фото/Сводка/Ярлык/Артикул):**

Каждая должна получить inline style с width и left, убрать захардкоженные Tailwind классы (`min-w-[128px]`, `w-[128px]`, `left-0`, `left-[128px]` и т.д.), а `group-hover:bg-muted/50` заменить на `group-hover:bg-muted`:

**Фото td (строки ~289-307):**
```tsx
{isFirstRowOfProduct && (
  <td
    rowSpan={group.totalRowsInProduct}
    style={{
      width: columnWidths.photo,
      minWidth: columnWidths.photo,
      left: stickyLefts.photo,
    }}
    className="sticky z-10 bg-background border-r align-top p-2 group-hover:bg-muted"
  >
    <div className="flex items-start justify-center">
      {group.product.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={group.product.photoUrl}
          alt={group.product.name}
          className="w-28 h-[150px] rounded border object-cover aspect-[3/4]"
        />
      ) : (
        <div className="w-28 h-[150px] rounded border bg-muted" />
      )}
    </div>
  </td>
)}
```

**Сводка td (строки ~310-335):**
```tsx
{isFirstRowOfProduct && (
  <td
    rowSpan={group.totalRowsInProduct}
    style={{
      width: columnWidths.svodka,
      minWidth: columnWidths.svodka,
      left: stickyLefts.svodka,
    }}
    className="sticky z-10 bg-background border-r align-top p-3 group-hover:bg-muted"
  >
    <div className="flex flex-col gap-1">
      <div className="text-sm font-medium leading-snug line-clamp-3">
        {group.product.name}
      </div>
      <div className="text-xs text-muted-foreground">
        Остаток:{" "}
        <span className="text-foreground tabular-nums">
          {group.product.totalStock}
        </span>{" "}
        шт
      </div>
      <div className="text-xs text-muted-foreground">
        Скорость 7д:{" "}
        <span className="text-foreground tabular-nums">
          {group.product.totalAvgSalesSpeed.toFixed(1)}
        </span>{" "}
        шт/день
      </div>
    </div>
  </td>
)}
```

**Ярлык td (строки ~338-347):**
```tsx
{isFirstRowOfCard && (
  <td
    rowSpan={cardGroup.priceRows.length}
    style={{
      width: columnWidths.yarlyk,
      minWidth: columnWidths.yarlyk,
      left: stickyLefts.yarlyk,
    }}
    className="sticky z-10 bg-background border-r align-top p-2 text-sm group-hover:bg-muted"
  >
    {cardGroup.card.label ?? (
      <span className="text-muted-foreground">—</span>
    )}
  </td>
)}
```

**Артикул td (строки ~350-357) — ВАЖНО: добавить shadow-разделитель:**
```tsx
{isFirstRowOfCard && (
  <td
    rowSpan={cardGroup.priceRows.length}
    style={{
      width: columnWidths.artikul,
      minWidth: columnWidths.artikul,
      left: stickyLefts.artikul,
    }}
    className="sticky z-10 bg-background border-r align-top p-2 font-mono text-xs group-hover:bg-muted shadow-[4px_0_6px_-1px_rgba(0,0,0,0.08)]"
  >
    {cardGroup.card.nmId}
  </td>
)}
```

**Шаг 10 — Добавить inline width на все non-sticky td (26 штук, строки ~362-510):**

Каждой td из 26 "Статус цены" + 25 расчётных нужно добавить `style={{ width: columnWidths.KEY, minWidth: columnWidths.KEY }}`. Порядок колонок должен точно совпадать с SCROLL_COLUMNS.

Это скучно но механично. Для каждой td добавить style проп. Пример для первой:

Было:
```tsx
<td className={cn("px-2 py-1 h-10 text-sm align-middle min-w-[180px]", stripClass)}>
```
Стало:
```tsx
<td
  style={{ width: columnWidths.status, minWidth: columnWidths.status }}
  className={cn("px-2 py-1 h-10 text-sm align-middle", stripClass)}
>
```

Убрать из className все `min-w-[Npx]` — они больше не нужны.

Маппинг td → columnKey (в порядке появления):
1. Статус цены → `status`
2. `{fmtPctSimple(cardGroup.card.buyoutPct ?? null)}` → `buyoutPct`
3. `{fmtMoney(row.sellerPriceBeforeDiscount)}` → `sellerPriceBeforeDiscount`
4. `{fmtPctSimple(row.sellerDiscountPct)}` → `sellerDiscountPct`
5. `{fmtMoney(row.computed.sellerPrice)}` → `sellerPrice`
6. `{fmtPctSimple(row.wbDiscountPct)}` → `wbDiscountPct`
7. `{fmtMoney(row.computed.priceAfterWbDiscount)}` → `priceAfterWbDiscount`
8. `{fmtPctSimple(row.clubDiscountPct)}` → `clubDiscountPct`
9. `{fmtMoney(row.computed.priceAfterClubDiscount)}` → `priceAfterClubDiscount`
10. `{fmtPctSimple(row.walletPct)}` → `walletPct`
11. `{fmtMoney(row.computed.priceAfterWallet)}` → `priceAfterWallet`
12. `{fmtMoney(row.computed.acquiringAmount)}` → `acquiringAmount`
13. `{fmtPctSimple(row.commFbwPct)}` → `commFbwPct`
14. `{fmtMoney(row.computed.commissionAmount)}` → `commissionAmount`
15. `{fmtPctSimple(row.drrPct)}` → `drrPct`
16. `{fmtMoney(row.computed.drrAmount)}` → `drrAmount`
17. `{fmtMoney(row.computed.jemAmount)}` → `jemAmount`
18. `{fmtMoney(row.computed.transferAmount)}` → `transferAmount`
19. `{fmtMoney(row.costPrice)}` → `costPrice`
20. `{fmtMoney(row.computed.defectAmount)}` → `defectAmount`
21. `{fmtMoney(row.computed.deliveryAmount)}` → `deliveryAmount`
22. `{fmtMoney(row.computed.creditAmount)}` → `creditAmount`
23. `{fmtMoney(row.computed.overheadAmount)}` → `overheadAmount`
24. `{fmtMoney(row.computed.taxAmount)}` → `taxAmount`
25. `{fmtMoney(row.computed.profit)}` → `profit`
26. `{fmtPct(row.computed.returnOnSalesPct, true)}` → `returnOnSalesPct`
27. `{fmtPct(row.computed.roiPct, true)}` → `roiPct`

Для расчётных 25 ячеек которые используют `CELL_CLASS` — style добавляется рядом с className, CELL_CLASS не трогать.

**Шаг 11 — Убрать `group-hover:bg-muted/50` из <tr> — ОБРАТИ ВНИМАНИЕ:**

Строка ~278:
Было: `"h-10 cursor-pointer group hover:bg-muted/50"`
Оставь как есть — это hover для всей строки в скроллируемой области, он нормальный (50% прозрачность в скроллируемой зоне норм). ТОЛЬКО у sticky td мы заменили `group-hover:bg-muted/50` → `group-hover:bg-muted`, потому что только они должны быть полностью непрозрачными при hover (чтобы скроллируемый контент не просвечивал).

**Шаг 12 — Type-check:**

```bash
npx tsc --noEmit 2>&1 | grep -E "PriceCalculatorTable|error TS" | head -30
```

Если ошибки — исправить и запустить снова.

**Финальная проверка grep'ом:**
```bash
grep -n "min-w-\[" components/prices/PriceCalculatorTable.tsx
grep -n "left-\[" components/prices/PriceCalculatorTable.tsx
grep -n "whitespace-nowrap" components/prices/PriceCalculatorTable.tsx
grep -n "bg-muted/50" components/prices/PriceCalculatorTable.tsx
```

Ожидается:
- `min-w-[` только в комментариях или classnames non-sticky (если остались) — в идеале 0 вхождений в classnames
- `left-[` — 0 вхождений (все через inline style)
- `whitespace-nowrap` — 0 вхождений
- `bg-muted/50` — только в `hover:bg-muted/50` на `<tr>` (1 вхождение), НЕ в `group-hover:bg-muted/50` на sticky td
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -E "PriceCalculatorTable|error TS" | head -30</automated>
  </verify>
  <done>
- Добавлены импорты useState/useRef/useEffect/useCallback/toast/setUserPreference
- Константы COLUMN_KEYS, SCROLL_COLUMNS, DEFAULT_WIDTHS, MIN_COLUMN_WIDTH, PREFERENCE_KEY объявлены
- State `columnWidths` инициализируется с `{...DEFAULT_WIDTHS, ...initialColumnWidths}`
- Функции startResize / handleMouseMove / handleMouseUp / resetColumnWidth работают через ref + rAF
- scheduleSave debounces save на 500ms и показывает toast на error
- useEffect cleanup снимает listeners на unmount
- stickyLefts вычисляется cumulative из columnWidths
- `<table>` имеет `table-fixed` и `style={{ width: "max-content", minWidth: "100%" }}`
- thead: все 4 sticky th + 26 scroll th имеют inline `style={{ width, minWidth }}`, wrap headers (`whitespace-normal break-words leading-tight text-[11px]`), ColumnResizeHandle на каждой
- tbody: все 4 sticky td имеют inline `style={{ width, minWidth, left }}`, `group-hover:bg-muted` (не /50)
- Артикул th + td имеют `shadow-[4px_0_6px_-1px_rgba(0,0,0,0.08)]`
- Все 26 non-sticky td имеют inline `style={{ width, minWidth }}`
- Старые `min-w-[Npx]`, `left-[Npx]`, `whitespace-nowrap` удалены из JSX
- `npx tsc --noEmit` проходит без новых ошибок
  </done>
</task>

<task type="auto">
  <name>Задача 4: Коммит + деплой на VPS (включая prisma migrate deploy)</name>
  <files>prisma/schema.prisma, prisma/migrations/*_add_user_preference/migration.sql, app/actions/user-preferences.ts, app/(dashboard)/prices/wb/page.tsx, components/prices/PriceCalculatorTableWrapper.tsx, components/prices/PriceCalculatorTable.tsx</files>
  <action>
**Шаг 1 — Полный type-check:**
```bash
npx tsc --noEmit
```
Если новые ошибки — стоп, исправить, показать пользователю.

**Шаг 2 — Prisma validate:**
```bash
npx prisma validate
```

**Шаг 3 — Коммит через gsd-tools:**

Сначала определить точное имя файла миграции:
```bash
ls prisma/migrations/ | grep add_user_preference
```

Затем создать коммит (подставь реальный путь миграции в команду):

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "feat(prices-wb): регулируемые ширины столбцов + persist в БД + wrap headers + fix sticky transparency

- Новая модель UserPreference (key/value Json, per-user) + миграция add_user_preference
- Server actions getUserPreference / setUserPreference (auth-only, без requireSection)
- RSC page /prices/wb загружает columnWidthsPref параллельно с остальными запросами
- PriceCalculatorTable: resize handles на всех 30 колонках (drag на правой границе),
  table-layout fixed с inline style width на каждом th/td, min width 60px
- Debounced save 500ms через useRef таймер + toast на ошибке
- Double-click на drag handle сбрасывает колонку к DEFAULT_WIDTHS
- Cumulative sticky left offsets пересчитываются из columnWidths на каждый render
- Wrap headers: убран whitespace-nowrap, добавлен break-words leading-tight text-[11px]
- Fix прозрачности sticky: group-hover:bg-muted/50 → group-hover:bg-muted на 4 sticky td
- Shadow-разделитель на правой границе колонки Артикул (визуальная граница sticky/scroll)
- throttle mousemove через requestAnimationFrame чтобы не перерендеривать таблицу на каждый px" --files prisma/schema.prisma prisma/migrations/*_add_user_preference/migration.sql app/actions/user-preferences.ts "app/(dashboard)/prices/wb/page.tsx" components/prices/PriceCalculatorTableWrapper.tsx components/prices/PriceCalculatorTable.tsx
```

**Шаг 4 — Пуш на remote (если не auto-push):**
```bash
git push
```

**Шаг 5 — Деплой на VPS:**

`deploy.sh` уже включает `prisma migrate deploy`, поэтому миграция применится автоматически. Но на всякий случай проверим:

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && cat deploy.sh | grep -A2 'migrate'"
```

Если `prisma migrate deploy` там есть — запускаем деплой:
```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
```

Если нет — сначала применить миграцию вручную:
```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && git pull && npx prisma migrate deploy && bash deploy.sh"
```

Деплой занимает 2-4 минуты. Дождись завершения.

**Шаг 6 — Проверить статус сервиса и что миграция применена:**
```bash
ssh root@85.198.97.89 "systemctl is-active zoiten-erp && psql -U zoiten -d zoiten_erp -c '\\dt \"UserPreference\"' 2>&1 | head -5"
```

Ожидается: `active` + вывод `\dt` показывает таблицу `UserPreference`.

Также проверить что страница отвечает:
```bash
ssh root@85.198.97.89 "curl -sI https://zoiten.pro/prices/wb | head -3"
```
  </action>
  <verify>
    <automated>ssh root@85.198.97.89 "systemctl is-active zoiten-erp && psql -U zoiten -d zoiten_erp -c '\\dt \"UserPreference\"' 2>&1 | grep -c UserPreference"</automated>
  </verify>
  <done>
- `npx tsc --noEmit` и `npx prisma validate` прошли без ошибок
- Коммит создан с подробным русским сообщением
- Push на remote выполнен
- Деплой на VPS прошёл, сервис `zoiten-erp` в статусе `active`
- Таблица `UserPreference` существует в prod БД
- https://zoiten.pro/prices/wb отвечает 200/307
  </done>
</task>

<task type="auto">
  <name>Задача 4.5: Округление денежных значений в таблице (ADDENDUM)</name>
  <files>components/prices/PriceCalculatorTable.tsx</files>
  <action>
**Добавлено в ответ на фидбек пользователя во время планирования:**

Все денежные и процентные значения в таблице отображаются без десятых долей (целые числа). В базе данных (БД) продолжают храниться полные значения — это чисто UI-трансформация.

**Реализация:**

1. Добавить новый helper `fmtMoneyInt` рядом с `fmtMoney` (около строки 147):

```tsx
/** Форматирование денег без дробной части (целые рубли, ру локаль). */
function fmtMoneyInt(n: number): string {
  if (!Number.isFinite(n)) return "—"
  return Math.round(n).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}
```

2. Добавить helper `fmtPctInt` для процентов без десятых:

```tsx
/** Форматирование процента без дробной части, для колонок где пользователь не хочет видеть десятые. */
function fmtPctInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${Math.round(n)}%`
}
```

3. **Заменить вызовы в ячейках таблицы** (после резайз-рефакторинга задачи 3, строки примерно 397-510 в текущем файле):

Список колонок, где заменить `fmtMoney` → `fmtMoneyInt`:
- COLUMN_ORDER[5]: Цена для установки (`row.sellerPriceBeforeDiscount`)
- COLUMN_ORDER[7]: Цена продавца (`row.computed.sellerPrice`)
- COLUMN_ORDER[9]: Цена со скидкой WB (`row.computed.priceAfterWbDiscount`)
- COLUMN_ORDER[11]: Цена со скидкой WB клуба (`row.computed.priceAfterClubDiscount`)
- COLUMN_ORDER[13]: Цена с WB кошельком (`row.computed.priceAfterWallet`)
- COLUMN_ORDER[14]: Эквайринг руб. (`row.computed.acquiringAmount`)
- COLUMN_ORDER[16]: Комиссия руб. (`row.computed.commissionAmount`)
- COLUMN_ORDER[18]: Реклама руб. (`row.computed.drrAmount`)
- COLUMN_ORDER[19]: Тариф джем руб. (`row.computed.jemAmount`)
- COLUMN_ORDER[20]: К перечислению (`row.computed.transferAmount`)
- COLUMN_ORDER[21]: Закупка руб. (`row.costPrice`)
- COLUMN_ORDER[22]: Брак руб. (`row.computed.defectAmount`)
- COLUMN_ORDER[23]: Доставка руб. (`row.computed.deliveryAmount`)
- COLUMN_ORDER[24]: Кредит руб. (`row.computed.creditAmount`)
- COLUMN_ORDER[25]: Общие расходы руб. (`row.computed.overheadAmount`)
- COLUMN_ORDER[26]: Налог руб. (`row.computed.taxAmount`)
- COLUMN_ORDER[27]: Прибыль руб. (`row.computed.profit`) — сохранить classNname с profitClass()

Список колонок, где заменить `fmtPctSimple` → `fmtPctInt`:
- COLUMN_ORDER[6]: Скидка продавца % (`row.sellerDiscountPct`)
- COLUMN_ORDER[8]: Скидка WB % (`row.wbDiscountPct`)
- COLUMN_ORDER[10]: WB Клуб % (`row.clubDiscountPct`)
- COLUMN_ORDER[12]: Кошелёк % (`row.walletPct`)
- COLUMN_ORDER[17]: ДРР % (`row.drrPct`)

**НЕ менять** (остаётся с десятыми):
- COLUMN_ORDER[4]: Процент выкупа (`buyoutPct`) — пользователь об этом не просил, оставить `fmtPctSimple`
- COLUMN_ORDER[15]: Комиссия % (`commFbwPct`) — пользователь не упомянул, оставить `fmtPctSimple`
- COLUMN_ORDER[28]: Re продаж % — не в списке, оставить `fmtPct(..., true)` (со знаком +/-)
- COLUMN_ORDER[29]: ROI % — не в списке, оставить `fmtPct(..., true)`

**Важно:** `calculatePricing` в `lib/pricing-math.ts` НЕ трогать — расчёт остаётся precise (Float), только отображение округляется. Также НЕ трогать БД (`AppSetting`, `CalculatedPrice`, `WbCard` и т.д.).
  </action>
  <verify>
    <automated>grep -c "fmtMoneyInt\|fmtPctInt" components/prices/PriceCalculatorTable.tsx</automated>
  </verify>
  <done>
- 2 helper функции `fmtMoneyInt` и `fmtPctInt` добавлены
- Все 16 денежных колонок из списка используют `fmtMoneyInt`
- Все 5 процентных колонок из списка используют `fmtPctInt`
- `fmtPctSimple` всё ещё используется для Процент выкупа и Комиссия %
- `fmtPct(..., true)` всё ещё используется для Re продаж и ROI (со знаком)
- `npx tsc --noEmit` проходит
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Задача 5: Визуальная проверка через Chrome MCP + фидбек пользователя</name>
  <what-built>
4 фичи на https://zoiten.pro/prices/wb в таблице PriceCalculatorTable:

1. **Резайз столбцов:** drag handle на правой границе каждого из 30 столбцов, min 60px, double-click → reset к дефолту
2. **Wrap заголовков:** длинные заголовки переносятся по словам, стабильная min-height thead, font-size 11px
3. **Persist в БД:** изменённые ширины сохраняются per-user в таблицу UserPreference через debounced server action (500ms), восстанавливаются на любом устройстве
4. **Fix sticky transparency:** 4 sticky колонки при hover полностью непрозрачные (group-hover:bg-muted), на правой границе Артикул — shadow-разделитель 4px
  </what-built>
  <how-to-verify>
**Автоматическая часть (через Chrome MCP перед передачей пользователю):**

1. Открыть https://zoiten.pro/prices/wb в Chrome MCP
2. **Проверка базовой структуры:**
```js
const ths = document.querySelectorAll('thead th');
const stickyThs = document.querySelectorAll('thead th.sticky');
const handles = document.querySelectorAll('thead th > div[title*="ширин"]');
const artikulTh = [...stickyThs].find((th) => th.textContent.trim().startsWith('Артикул'));
JSON.stringify({
  totalThs: ths.length,           // ожидается 30
  stickyThs: stickyThs.length,     // ожидается 4
  resizeHandles: handles.length,   // ожидается 30
  artikulHasShadow: artikulTh ? getComputedStyle(artikulTh).boxShadow.includes('rgba') : false,
  tableLayout: getComputedStyle(document.querySelector('table')).tableLayout, // ожидается 'fixed'
});
```

Ожидаемо: `{ totalThs: 30, stickyThs: 4, resizeHandles: 30, artikulHasShadow: true, tableLayout: "fixed" }`.

3. **Проверка wrap заголовков** — найти длинный заголовок и убедиться что он на 2+ строки:
```js
const longHeader = [...document.querySelectorAll('thead th')]
  .find((th) => th.textContent.includes('Цена со скидкой WB клуба'));
longHeader ? {
  text: longHeader.textContent.trim(),
  height: longHeader.getBoundingClientRect().height,
  whiteSpace: getComputedStyle(longHeader).whiteSpace,
} : 'not found';
```

Ожидается: `whiteSpace: 'normal'`, `height > 30px` (2+ строки).

4. **Проверка resize** — симулировать drag на handle первой колонки:
```js
const firstHandle = document.querySelector('thead th > div[title*="ширин"]');
const rect = firstHandle.getBoundingClientRect();
const startX = rect.x + rect.width / 2;
const startY = rect.y + rect.height / 2;

firstHandle.dispatchEvent(new MouseEvent('mousedown', { clientX: startX, clientY: startY, bubbles: true }));
document.dispatchEvent(new MouseEvent('mousemove', { clientX: startX + 80, clientY: startY, bubbles: true }));
document.dispatchEvent(new MouseEvent('mouseup', { clientX: startX + 80, clientY: startY, bubbles: true }));

await new Promise(r => setTimeout(r, 100));

const firstTh = document.querySelector('thead th.sticky');
firstTh.getBoundingClientRect().width; // должно увеличиться на ~80px (c 128 до ~208)
```

5. **Проверка persist** — после resize подождать 700ms (debounced save), перезагрузить страницу, проверить что новая ширина применилась:
```js
await new Promise(r => setTimeout(r, 700));
location.reload();
// После reload:
document.querySelector('thead th.sticky').getBoundingClientRect().width; // должно остаться ~208
```

6. **Проверка sticky прозрачности** — скроллить таблицу вправо, навести курсор на строку, убедиться что sticky td не просвечивают:
```js
const table = document.querySelector('.overflow-x-auto');
table.scrollLeft = 500;
const firstDataRow = document.querySelector('tbody tr');
firstDataRow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

const stickyTds = document.querySelectorAll('tbody td.sticky');
[...stickyTds].map(td => getComputedStyle(td).backgroundColor);
// Должны быть все НЕПРОЗРАЧНЫЕ (alpha = 1), без /50
```

7. Сделать скриншоты:
   - Таблица в исходном состоянии (ширины по умолчанию)
   - После resize колонки Фото на +80px
   - После скролла вправо + hover на строку (проверяем непрозрачность sticky)
   - Zoomed-in на заголовки (проверяем wrap)

**Передать пользователю для подтверждения:**

Показать пользователю:
- Скриншоты (4 штуки выше)
- Метрики из Chrome MCP evaluate
- URL https://zoiten.pro/prices/wb для ручной проверки

Задать вопросы:
- «Резайз колонок работает? Потяни за правую границу любого столбца»
- «Двойной клик по drag-handle сбрасывает ширину?»
- «Перезагрузи страницу — твои новые ширины остались?»
- «Открой страницу в другом браузере / инкогнито и залогинься — ширины переехали?»
- «Длинные заголовки теперь переносятся по словам? (например "Цена со скидкой WB клуба")»
- «При скролле вправо + hover на строку — sticky колонки (Фото/Сводка/Ярлык/Артикул) полностью непрозрачные? Контент справа больше не просвечивает?»
- «Shadow на правой границе Артикула видна?»
  </how-to-verify>
  <resume-signal>Пользователь пишет «ок» / «approved» / описывает что ещё нужно поправить</resume-signal>
</task>

</tasks>

<verification>
После выполнения всех задач:
- [ ] Модель `UserPreference` в schema.prisma + обратная связь `User.preferences`
- [ ] Prisma миграция `*_add_user_preference/migration.sql` создана и применена на prod
- [ ] `app/actions/user-preferences.ts` экспортирует `getUserPreference` и `setUserPreference`
- [ ] `page.tsx` загружает `columnWidthsPref` через `getUserPreference` в Promise.all
- [ ] `PriceCalculatorTableWrapper` пробрасывает `initialColumnWidths` в таблицу
- [ ] `PriceCalculatorTable` имеет: state, resize logic, rAF throttle, debounced save, wrap headers, inline style widths, cumulative sticky offsets, shadow на Артикуле, group-hover:bg-muted (не /50) на sticky td
- [ ] `npx tsc --noEmit` и `npx prisma validate` проходят
- [ ] Коммит с 5 файлами (+ 1 migration SQL) создан на русском
- [ ] Деплой на VPS прошёл, сервис `zoiten-erp` active, таблица `UserPreference` существует в prod БД
- [ ] Chrome MCP: resize работает, wrap работает, persist работает (после reload), sticky не прозрачные при hover, shadow-разделитель виден
- [ ] Пользователь подтвердил визуально
</verification>

<success_criteria>
- На https://zoiten.pro/prices/wb пользователь может потянуть за правую границу любого из 30 столбцов и изменить его ширину (min 60px)
- Двойной клик по drag-handle сбрасывает ширину одной колонки к DEFAULT_WIDTHS
- Изменённые ширины сохраняются в таблицу UserPreference per-user и восстанавливаются после reload и на других устройствах
- Длинные заголовки ("Цена со скидкой WB клуба", "Доставка на маркеплейс, руб.") переносятся по словам, thead row стабильно ~56px высотой
- При горизонтальном скролле + hover на строку 4 sticky колонки (Фото/Сводка/Ярлык/Артикул) остаются полностью непрозрачными — контент справа не просвечивает
- На правой границе колонки Артикул (последний sticky) видна тонкая тень 4px как визуальный разделитель sticky/scroll зон
- Resize работает плавно (без рывков) благодаря requestAnimationFrame throttle
- Debounced save через 500ms не спамит БД — один save после окончания drag
- Пользователь подтвердил визуально через Chrome MCP скриншоты или вручную
</success_criteria>

<output>
После завершения создать `.planning/quick/260410-mya-wrap-prices-wb-sticky/260410-mya-SUMMARY.md` с:
- Списком изменений по каждому файлу (5 файлов + 1 migration)
- Именем созданной миграции (точный timestamp)
- Коммит хэшем, временем деплоя, статусом миграции на prod
- Скриншотами до/после (если были сохранены)
- Метриками из Chrome MCP (widths, totalThs, tableLayout, artikulHasShadow)
- Фидбеком пользователя (если запросил доп. корректировки)
</output>
