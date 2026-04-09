# Phase 7: Управление ценами WB — Research

**Researched:** 2026-04-09
**Domain:** Next.js 15 + Prisma 6 + WB API (Promotions Calendar) + Excel parsing + realtime pricing calculator
**Confidence:** HIGH (весь stack, паттерны проекта и WB API верифицированы по исходникам и официальной документации)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 .. D-17)

**Модель данных:**
- **D-01** — переопределения в существующих таблицах, НЕ отдельная `PricingOverride`:
  - `Category.defaultDefectRatePct: Float?` (fallback 2%)
  - `Subcategory.defaultDrrPct: Float?` (fallback 10%)
  - `Product.drrOverridePct: Float?`, `Product.defectRateOverridePct: Float?`, `Product.deliveryCostRub: Float?` (fallback 30₽)
  - Fallback chain: `Product override → Subcategory/Category default → hardcoded`
- **D-02** — глобальные ставки через KeyValue таблицу `AppSetting(key, value, updatedAt, updatedBy?)`. Ключи: `wbWalletPct` (2.0), `wbAcquiringPct` (2.7), `wbJemPct` (1.0), `wbCreditPct` (7.0), `wbOverheadPct` (6.0), `wbTaxPct` (8.0). Валидация через Zod.
- **D-03** — расчётные цены → отдельная `CalculatedPrice(wbCardId, slot 1|2|3, name, sellerPrice, drrPct?, defectRatePct?, deliveryCostRub?, snapshot: Json)`, `@@unique([wbCardId, slot])`, cascade delete.
- **D-04** — акции → `WbPromotion` (id Int PK = promotionID, name, description, advantages[], startDateTime, endDateTime, type "auto"|"regular", rangingJson Json?, source "API"|"EXCEL" default "API", lastSyncedAt) + `WbPromotionNomenclature` (promotionId FK cascade, nmId Int, inAction Bool, planPrice?, planDiscount?, currentPrice?, status?, `@@unique([promotionId, nmId])`).

**Синхронизация акций:**
- **D-05** — ручная синхронизация через кнопку «Синхронизировать акции», окно `[today, today + 60 days]`, rate limit 10/6сек (batching details по 10, паузы 600мс для nomenclatures). Endpoint `POST /api/wb-promotions-sync`. Cleanup акций с `endDateTime < today - 7 дней`.
- **D-06** — загрузка Excel для auto-акций (API не даёт nomenclatures для auto, 422). UI: dropdown выбора auto-акции + input file + submit. Parser читает колонки A/F/L/M/T/U. Endpoint `POST /api/wb-promotions-upload-excel`.

**Таблица:**
- **D-07** — sticky секции per Product через rowSpan, жирный разделитель между Product, тонкий между WbCard. Без expand/collapse.
- **D-08** — sticky колонки Фото+Сводка+Ярлык+Артикул, `position: sticky; left: N`.
- **D-09** — Сводка содержит 3 подстроки: Наименование, Остаток (сумма `WbCard.stockQty` по картам), Скорость продаж 7д (сумма `WbCard.avgSalesSpeed7d`). **Новое поле `WbCard.avgSalesSpeed7d: Float?`** — подтягивается из Statistics Sales API.
- **D-10** — порядок ценовых строк внутри карточки: Текущая → regular акции DESC by planPrice → auto акции DESC by planPrice (только с Excel-данными) → Расчётные 1/2/3.
- **D-11** — tooltip на названии акции с `description` + `advantages[]` (shadcn tooltip).

**Расчёт:**
- **D-12** — формулы по ТЗ и Excel-образцу `C:/Users/User/Desktop/Форма управления ценами.xlsx`, расчёт серверный (RSC page / server action), в БД хранятся только inputs. Приоритет override → default → hardcoded.
- **D-13** — подсветка Прибыль/Re/ROI: `text-green-600 font-medium` если ≥0, `text-red-600 font-medium` если <0.

**Модалка:**
- **D-14** — клик по строке → `PricingCalculatorDialog`, realtime пересчёт, кнопка «Сохранить как расчётную цену» с выбором слота 1/2/3 и именем. Чекбокс «только этот товар» управляет scope сохранения ДРР/брака (Product override vs Subcategory/Category default). Доставка всегда в Product.
- **D-15** — shadcn Dialog, `sm:max-w-3xl` (в UI-SPEC повышено до `sm:max-w-4xl`), 2-колоночный layout inputs/outputs, react-hook-form + zod.

**Ozon:**
- **D-16** — `/prices/ozon` — заглушка `<ComingSoon sectionName="Управление ценами Ozon" />`.

**RBAC:**
- **D-17** — раздел = `ERP_SECTION.PRICES` (уже в enum). Read = `requireSection("PRICES")`, write = `requireSection("PRICES", "MANAGE")`.

### Claude's Discretion

- Точные CSS-классы и z-index слои для sticky колонок.
- Именование файлов компонентов.
- Вёрстка модалки (2 колонки / табы / аккордеон) — UI-SPEC уже зафиксировал 2 колонки.
- Rate-limit backoff стратегия (exponential vs фиксированная пауза) для синхронизации акций.
- Структура server actions: один файл `app/actions/pricing.ts` vs несколько.

### Deferred Ideas (OUT OF SCOPE)

- Интеграция с Prices API для **отправки** цен в WB.
- История изменений цен (audit log).
- График юнит-экономики (sparkline).
- Подстановка цены в акцию через `/calendar/promotions/upload`.
- Полноценный Ozon Pricing (в этой фазе только заглушка).
- Экспорт таблицы в Excel.
- Фильтры по бренду/категории в `/prices/wb`.
- Массовые расчёты («применить ставку X ко всем товарам категории Y»).
- Удаление `CalculatedPrice` из UI.

</user_constraints>

<phase_requirements>
## Phase Requirements

> REQUIREMENTS.md на момент исследования не содержит `PRICES-*` IDs. Планер должен добавить их при создании плана. Ниже — черновой маппинг ожидаемых ID на research support.

| ID | Описание | Research Support |
|----|----------|------------------|
| PRICES-01 | Страница `/prices/wb` отображает таблицу только тех WB-карточек, которые привязаны к товарам (зелёная галочка в `/cards/wb`) | Query: `prisma.wbCard.findMany({ where: { nmId: { in: linkedNmIdInts } } })`. Логика привязки через `MarketplaceArticle.article` (slug='wb') уже существует в `app/(dashboard)/cards/wb/page.tsx`. |
| PRICES-02 | Таблица группирует строки по Product с визуальным разделителем, rowSpan для Фото/Сводка, rowSpan для Ярлык/Артикул на карточку | shadcn `<Table>` → нативный `<td>`, поддерживает `rowSpan={N}`. Пример группировки по rowSpan — `EmployeesTable` (упоминается в CONTEXT). Sticky через `position: sticky; left: {px}` + z-index слои. |
| PRICES-03 | 4 sticky-колонки слева при горизонтальном скролле | Tailwind v4: `sticky left-0 z-10 bg-background`, offset накопительный. |
| PRICES-04 | Ценовые строки per WbCard: Текущая + Regular акции + Auto акции + Расчётные, с индикаторной полосой и tooltip | `border-l-4 border-l-{blue|purple|amber}-500`, shadcn tooltip `npx shadcn add tooltip`. |
| PRICES-05 | 30 расчётных колонок с формулами на сервере по ТЗ и Excel-образцу | Pure function `lib/pricing-math.ts` — детерминированная, golden test nmId 800750522 (Прибыль 567.68₽). |
| PRICES-06 | Глобальные ставки редактируются в шапке `/prices/wb` и сохраняются в `AppSetting` | Новая модель `AppSetting`, seed дефолтов, server action `updateAppSetting(key, value)` с Zod валидацией, debounce 500ms. |
| PRICES-07 | Клик по ценовой строке открывает `PricingCalculatorDialog` с realtime пересчётом | react-hook-form `watch()` → useMemo → outputs. Pure function `calculatePricing(inputs): outputs` разделена между клиентом (модалка) и сервером (таблица). |
| PRICES-08 | Сохранение расчётной цены в слот 1/2/3 с опциональным именем | `CalculatedPrice` upsert `@@unique([wbCardId, slot])`. Action `saveCalculatedPrice({wbCardId, slot, name, sellerPrice, drrPct?, defectRatePct?, deliveryCostRub?, snapshot})`. |
| PRICES-09 | Чекбокс «только этот товар» в модалке управляет scope (Product.override vs Subcategory/Category.default) для ДРР и Брака | Server actions `updateProductOverride(productId, field, value)` vs `updateSubcategoryDefault(subcategoryId, value)` / `updateCategoryDefault(categoryId, value)`. |
| PRICES-10 | Синхронизация акций через кнопку — окно 60 дней, rate limit compliant | `POST /api/wb-promotions-sync` → `lib/wb-api.ts` функции `fetchAllPromotions(start, end)`, `fetchPromotionDetails(ids[])`, `fetchPromotionNomenclatures(id)`. Rate limit 10/6сек (600мс пауза). |
| PRICES-11 | Загрузка Excel для auto-акций с парсингом колонок A/F/L/M/T/U | `POST /api/wb-promotions-upload-excel` multipart (file + promotionId), `xlsx` package (уже установлен). Upsert по `[promotionId, nmId]`. |
| PRICES-12 | Новое поле `WbCard.avgSalesSpeed7d`, заполняется при `/api/wb-sync` из Statistics Sales API | Миграция + обновление `/api/wb-sync/route.ts` + новая функция `fetchAvgSalesSpeed7d(nmIds[])` в `lib/wb-api.ts`. |
| PRICES-13 | Ozon подраздел — заглушка `ComingSoon` | `app/(dashboard)/prices/ozon/page.tsx` → `<ComingSoon sectionName="Управление ценами Ozon" />` (компонент уже существует). |
| PRICES-14 | RBAC: все страницы и actions защищены `requireSection("PRICES")` / `requireSection("PRICES", "MANAGE")` | `lib/rbac.ts` — уже реализовано. `/prices` уже в `lib/sections.ts` → `PRICES`. |

</phase_requirements>

## Summary

Phase 7 строит новый раздел `/prices/wb` на проверенном стеке Next.js 15 + Prisma 6 + Tailwind v4 + shadcn/ui v4 (base-nova) + `@base-ui/react` + react-hook-form + zod + sonner. Все UI-паттерны уже существуют в проекте: горизонтальные таблицы с sticky-колонками (`WbCardsTable`), кнопки синхронизации (`WbSyncButton`), загрузка Excel multipart (`WbUploadIuButton` + `/api/wb-commission-iu`), модальные формы с react-hook-form (`UserDialog`). Вся новая работа сводится к **специализации уже освоенных паттернов** под Pricing-домен.

Главные технические челленджи фазы — три: (1) **rowSpan-группировка широкой таблицы** с sticky-колонками 4 уровней (Фото → Сводка → Ярлык → Артикул) при горизонтальном скролле 30+ колонок расчёта; (2) **синхронизация 83+ акций** с WB Promotions Calendar API при жёстком rate limit 10 запросов/6 сек — это новый endpoint для проекта, требует batching и пауз; (3) **Excel-парсинг отчёта из кабинета WB** для auto-акций с кириллическими заголовками колонок — шаблон для этого уже есть (`xlsx` пакет установлен, паттерн multipart проверен).

**Primary recommendation:** построить все формулы расчёта как **единую pure function** `calculatePricing(inputs): outputs` в `lib/pricing-math.ts` — используется и на сервере (RSC рендер таблицы) и на клиенте (модалка с realtime пересчётом). Одна функция, одна правда, один golden test (nmId 800750522 из Excel → Прибыль 567.68₽). Всё остальное (таблица, модалка, синхронизация) — применение существующих паттернов проекта.

## Standard Stack

### Core (всё уже установлено в проекте)

| Библиотека | Версия | Назначение | Почему standard |
|------------|--------|------------|-----------------|
| `next` | 15.5.14 | App Router, RSC, Server Actions | Проектный стандарт (CLAUDE.md) |
| `@prisma/client` + `prisma` | 6.19.3 | ORM, миграции, типизация БД | Проектный стандарт |
| `react` | 19.2.4 | UI, `useState`/`useMemo`/`useTransition` для клиентских компонентов | Проектный стандарт |
| `@base-ui/react` | 1.3.0 | Backend для shadcn/ui v4 Dialog, Tooltip, Popover | Проектный стандарт — НЕ radix-ui |
| `shadcn` | 4.1.2 CLI | Генератор компонентов через `npx shadcn add {name}` | Проектный стандарт (base-nova preset) |
| `tailwindcss` + `@tailwindcss/postcss` | 4.2.2 | Стили, sticky-классы, 8-point spacing | Проектный стандарт |
| `react-hook-form` | 7.72.1 | Формы модалки, watch() для realtime пересчёта | Проектный стандарт (`UserForm`, `ProductForm`) |
| `zod` | 4.3.6 | Валидация входных параметров server actions и форм | Проектный стандарт |
| `@hookform/resolvers` | 5.2.2 | `zodResolver` для react-hook-form | Проектный стандарт |
| `sonner` | 2.0.7 | Toast-уведомления о sync/upload/save | Проектный стандарт |
| `lucide-react` | 1.7.0 | Иконки `RefreshCw`, `Calendar`, `Upload`, `Info`, `Package` | Проектный стандарт |
| `next-themes` | 0.4.6 | Light/dark темы (влияет на `text-green-*` / `text-red-*`) | Проектный стандарт |
| **`xlsx`** | **0.18.5** | **Парсинг Excel для auto-акций — УЖЕ УСТАНОВЛЕН** (используется в `/api/wb-commission-iu`) | Доказанный проектный паттерн |

### Supporting (добавить в Phase 7)

| Компонент | Как добавить | Назначение |
|-----------|--------------|------------|
| `components/ui/tooltip.tsx` | `npx shadcn add tooltip` | D-11: tooltip на названии акции (description + advantages[]) |

**Никаких новых npm-пакетов добавлять не требуется.** Всё что нужно, уже в `package.json`.

### Alternatives Considered

| Вместо | Альтернатива | Tradeoff | Вердикт |
|--------|--------------|----------|---------|
| `xlsx` (SheetJS) | `exceljs`, `read-excel-file` | `exceljs` медленнее на чтении но с type safety, `read-excel-file` проще но слабее на кириллице | **`xlsx`** — уже в проекте, уже доказано работает с кириллицей в `/api/wb-commission-iu` |
| Native `<select>` слотов | shadcn/base-ui Select | base-ui Select ломается с `defaultValue` в проекте (CLAUDE.md) | **Native `<select>`** — проектная конвенция |
| Серверный расчёт на странице | Клиентский расчёт | Серверный: SEO, one source of truth; Клиентский: realtime без server roundtrip | **Гибрид** — pure function shared через `lib/pricing-math.ts`, сервер для первой отрисовки таблицы, клиент для модалки |
| `Decimal.js` для точности | `Number` + `Math.round(value * 100) / 100` | Decimal.js 44KB, `Number` достаточно при округлении до копеек | **`Number`** — цены в рублях, точность до копеек, golden test валидирует |
| TanStack Table | Native `<Table>` с rowSpan | TanStack overhead для 1000 строк, но сложный rowSpan вручную | **Native** — паттерн уже в проекте (WbCardsTable), rowSpan-логика проще через подготовленный массив на сервере |
| Redis/KV для AppSetting | Prisma `AppSetting` table | Redis: быстрее reads; Prisma: без нового инфра-слоя, 6 ключей, cache не критичен | **Prisma** — низкая нагрузка, не нужен cache |

**Installation (единственная команда):**

```bash
npx shadcn@4.1.2 add tooltip
```

**Version verification (выполнить перед планированием, цифры могут измениться):**

```bash
npm view next version           # ожидается 15.5.14+ — уже в проекте
npm view @prisma/client version  # ожидается 6.19.3+
npm view react version           # ожидается 19.2.4+
npm view xlsx version            # ожидается 0.18.5+ — уже в проекте
npm view zod version             # ожидается 4.3.6+
```

Версии из `package.json` свежие на 2026-04-09. Ничего не upgrade-ить в рамках Phase 7.

## Architecture Patterns

### Data Flow Diagram

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│ WB Promotions   │ ───→ │ lib/wb-api.ts    │ ───→ │ /api/wb-        │
│ Calendar API    │      │ fetchAllPromoti- │      │ promotions-sync │
│ (rate limit     │      │ ons/Details/     │      │ (Node.js route) │
│  10/6 sec)      │      │ Nomenclatures    │      │                 │
└─────────────────┘      └──────────────────┘      └────────┬────────┘
                                                            │
┌─────────────────┐      ┌──────────────────┐               │
│ Excel файл WB   │ ───→ │ xlsx parser      │ ───→ │ /api/wb-        │
│ (cyrillic col.) │      │ colA/F/L/M/T/U   │      │ promotions-     │
└─────────────────┘      └──────────────────┘      │ upload-excel    │
                                                   │ (multipart)     │
                                                   └────────┬────────┘
                                                            ▼
                                            ┌───────────────────────┐
                                            │  Prisma (PostgreSQL)  │
                                            │  WbPromotion          │
                                            │  WbPromotionNomencl.  │
                                            │  CalculatedPrice      │
                                            │  AppSetting           │
                                            │  Category/Subcat/Prod │
                                            │  (defectRate/drr/     │
                                            │   deliveryCost)       │
                                            │  WbCard.avgSalesSpd7d │
                                            └───────┬───────────────┘
                                                    │
                                                    ▼
                                  ┌────────────────────────────────┐
                                  │ RSC: app/(dashboard)/prices/   │
                                  │ wb/page.tsx                    │
                                  │  1. Load linked WbCards        │
                                  │  2. Load promotions + nomencl. │
                                  │  3. Load calculated prices     │
                                  │  4. Load AppSetting rates      │
                                  │  5. Load Product overrides     │
                                  │     + Subcat/Cat defaults      │
                                  │  6. Build rows w/ pricing-math │
                                  └───────┬────────────────────────┘
                                          │
                                          ▼
                          ┌────────────────────────────────────┐
                          │ Client: PriceCalculatorTable       │
                          │   + GlobalRatesBar (debounced save)│
                          │   + PricingCalculatorDialog        │
                          │     ↓ realtime client recompute    │
                          │     ↓ via shared lib/pricing-math  │
                          │     ↓ save → server action         │
                          └────────────────────────────────────┘
```

### Recommended Project Structure

```
app/(dashboard)/prices/
├── layout.tsx                       # requireSection("PRICES") + <h1> + <PricesTabs>
├── page.tsx                         # redirect → /prices/wb
├── wb/page.tsx                      # RSC: вся data-загрузка + рендер
└── ozon/page.tsx                    # <ComingSoon sectionName="Управление ценами Ozon" />

app/api/
├── wb-promotions-sync/route.ts      # POST — синхронизация акций (60 дней)
└── wb-promotions-upload-excel/route.ts  # POST multipart — Excel для auto-акций

app/actions/
└── pricing.ts                       # все server actions фазы:
                                     #   updateAppSetting(key, value)
                                     #   getPricingSettings()
                                     #   saveCalculatedPrice(wbCardId, slot, ...)
                                     #   updateProductOverride(productId, field, value)
                                     #   updateSubcategoryDefault(subcategoryId, value)
                                     #   updateCategoryDefault(categoryId, value)
                                     #   updateProductDelivery(productId, value)

components/prices/
├── PricesTabs.tsx                   # WB/Ozon (копия CardsTabs)
├── GlobalRatesBar.tsx               # 6 inputs ставок + debounced save
├── PriceCalculatorTable.tsx         # rowSpan/sticky-таблица с clickable rows
├── PricingCalculatorDialog.tsx      # 2-колоночная модалка realtime
├── WbPromotionsSyncButton.tsx       # (паттерн WbSyncButton)
├── WbAutoPromoUploadButton.tsx      # (паттерн WbUploadIuButton + dialog выбора)
└── PromoTooltip.tsx                 # wrapper shadcn tooltip с desc+advantages

components/ui/
└── tooltip.tsx                      # npx shadcn add tooltip (новый)

lib/
├── pricing-math.ts                  # ⭐ pure function calculatePricing(inputs) → outputs
│                                    #   + types: PricingInputs, PricingOutputs
│                                    #   + golden test data (nmId 800750522)
└── wb-api.ts                        # добавить функции:
                                     #   fetchAllPromotions(start, end)
                                     #   fetchPromotionDetails(ids[])
                                     #   fetchPromotionNomenclatures(id)
                                     #   fetchAvgSalesSpeed7d(nmIds[])

prisma/
├── schema.prisma                    # добавить модели + поля
├── migrations/20260409_prices_wb/migration.sql  # одна миграция на всю фазу
└── seed.ts                          # добавить seed AppSetting дефолтов
```

### Pattern 1: RSC-страница загружает всё, Client-таблица рендерит

**What:** `app/(dashboard)/prices/wb/page.tsx` — async RSC, делает все Prisma-запросы параллельно через `Promise.all`, затем передаёт подготовленные строки в `<PriceCalculatorTable>` (client component).

**When to use:** Next.js 15 App Router паттерн для страниц с большим объёмом данных.

**Example (из `app/(dashboard)/cards/wb/page.tsx`, адаптация):**

```tsx
// app/(dashboard)/prices/wb/page.tsx
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { calculatePricing, type PricingInputs } from "@/lib/pricing-math"
import { PriceCalculatorTable } from "@/components/prices/PriceCalculatorTable"
import { GlobalRatesBar } from "@/components/prices/GlobalRatesBar"
import { WbPromotionsSyncButton } from "@/components/prices/WbPromotionsSyncButton"
import { WbAutoPromoUploadButton } from "@/components/prices/WbAutoPromoUploadButton"
import { WbSyncButton } from "@/components/cards/WbSyncButton"
import { WbSyncSppButton } from "@/components/cards/WbSyncSppButton"

export default async function PricesWbPage() {
  await requireSection("PRICES")

  // 1) Найти WB marketplace
  const wb = await prisma.marketplace.findFirst({ where: { slug: "wb" } })
  if (!wb) return <div>WB marketplace не найден в справочнике</div>

  // 2) Параллельно: ставки, акции, связанные WbCards через MarketplaceArticle → Product
  const [rates, promotions, linkedArticles, calcPrices] = await Promise.all([
    prisma.appSetting.findMany({
      where: { key: { in: [
        "wbWalletPct","wbAcquiringPct","wbJemPct",
        "wbCreditPct","wbOverheadPct","wbTaxPct"
      ]}},
    }),
    prisma.wbPromotion.findMany({
      include: { nomenclatures: true },
      where: { endDateTime: { gte: new Date() } },
    }),
    prisma.marketplaceArticle.findMany({
      where: { marketplaceId: wb.id, product: { deletedAt: null } },
      include: {
        product: {
          include: {
            cost: true,
            subcategory: { include: { category: true } },
            category: true,
          },
        },
      },
    }),
    prisma.calculatedPrice.findMany(),
  ])

  // 3) Подтянуть WbCards по nmId
  const linkedNmIds = linkedArticles
    .map((a) => parseInt(a.article, 10))
    .filter((n) => !Number.isNaN(n))

  const wbCards = await prisma.wbCard.findMany({
    where: { nmId: { in: linkedNmIds } },
  })

  // 4) Группировка WbCard → Product через nmId
  const articleByNmId = new Map(
    linkedArticles.map((a) => [parseInt(a.article, 10), a]),
  )

  // 5) Построить ratesMap
  const ratesMap = Object.fromEntries(
    rates.map((r) => [r.key, parseFloat(r.value)]),
  ) as Record<string, number>

  // 6) Для каждой строки — вычислить outputs через calculatePricing
  // ... (упаковать в PriceRow[] со всеми 30 колонками готовыми к рендеру)

  return (
    <div className="space-y-4">
      <GlobalRatesBar initialRates={ratesMap} />
      <div className="flex flex-wrap gap-2">
        <WbSyncButton />
        <WbSyncSppButton />
        <WbPromotionsSyncButton />
        <WbAutoPromoUploadButton autoPromotions={promotions.filter((p) => p.type === "auto")} />
      </div>
      <PriceCalculatorTable
        rows={/* prepared rows */}
        rates={ratesMap}
      />
    </div>
  )
}
```

### Pattern 2: Pure calculation function, shared между RSC и client

**What:** `lib/pricing-math.ts` — экспортирует чистую функцию. Никакого `"use server"` / `"use client"` — функция детерминированная, side-effect-free.

**When to use:** Когда одна и та же формула должна работать в двух контекстах (server render таблицы + client realtime модалки).

**Skeleton:**

```ts
// lib/pricing-math.ts
export interface PricingInputs {
  // Вход от пользователя / строки
  sellerPriceBeforeDiscount: number  // Цена продавца до скидки, ₽
  sellerDiscountPct: number          // Скидка продавца, %
  wbSppDiscountPct: number           // Скидка WB (СПП), %
  wbClubDiscountPct: number          // Скидка WB клуба, %  (может быть 0)
  commissionFbwIuPct: number         // Комиссия ИУ FBW, % (из WbCard.commFbwIu)
  costPriceRub: number               // Себестоимость, ₽ (из ProductCost.costPrice)
  buyoutPct: number                  // Процент выкупа, % (из WbCard.buyoutPercent)
  // Глобальные ставки (из AppSetting)
  walletPct: number
  acquiringPct: number
  jemPct: number
  creditPct: number
  overheadPct: number
  taxPct: number
  // Per-product
  drrPct: number                     // Product.drrOverridePct ?? Subcategory.defaultDrrPct ?? 10
  defectRatePct: number              // Product.defectRateOverridePct ?? Category.defaultDefectRatePct ?? 2
  deliveryCostRub: number            // Product.deliveryCostRub ?? 30
}

export interface PricingOutputs {
  sellerPrice: number              // Цена продавца (после скидки продавца)
  wbDiscountedPrice: number        // Цена со скидкой WB
  walletAmount: number             // Кошелёк (абсолют, ₽)
  priceAfterWallet: number         // Цена с кошельком
  acquiringAmount: number          // Эквайринг (₽)
  commissionAmount: number         // Комиссия ИУ (₽)
  drrAmount: number                // ДРР (₽)
  jemAmount: number                // Тариф Джем (₽)
  transferAmount: number           // К перечислению
  defectAmount: number             // Брак (₽)
  creditAmount: number             // Кредит (₽)
  overheadAmount: number           // Общие (₽)
  taxAmount: number                // Налог (₽)
  profit: number                   // Прибыль (₽)
  returnOnSales: number            // Re продаж, %
  roi: number                      // ROI, %
  // ... все 30 выходных значений
}

export function calculatePricing(inputs: PricingInputs): PricingOutputs {
  // 1. Формулы СТРОГО по ТЗ и Excel-образцу
  // 2. Все промежуточные переменные named, одна операция на строку
  // 3. Округления: Math.round(v * 100) / 100 для денег, Math.round(v * 10) / 10 для процентов
  // 4. Никаких мутаций входа
  // Детали формул смотри в canonical Excel `Форма управления ценами.xlsx` (строка nmId 800750522)
  // ...
}

// Golden test case (из specifics в CONTEXT):
// nmId 800750522, sellerPriceBeforeDiscount=25833, sellerDiscountPct=70,
//   → sellerPrice=7749.9, wbDiscountedPrice=5812.425, ..., profit=567.68,
//   returnOnSales=7, roi=26
```

**Test:** `tests/pricing-math.test.ts` — unit-тест на golden case. При любом изменении формул тест мгновенно показывает расхождение.

### Pattern 3: Rate-limited batching для WB Promotions Calendar

**What:** Последовательные запросы с паузой 600мс между батчами, чтобы не пробить лимит 10/6 сек.

**Example skeleton:**

```ts
// lib/wb-api.ts (добавка)

const PROMO_API = "https://dp-calendar-api.wildberries.ru"  // verify exact base
const PROMO_RATE_DELAY_MS = 600  // 10 req / 6s = 600ms interval

export interface WbPromotionRaw {
  id: number
  name: string
  description?: string
  advantages?: string[]
  startDateTime: string  // RFC3339
  endDateTime: string
  type: string           // "auto" | "regular"
  ranging?: unknown[]
}

export async function fetchAllPromotions(
  startDate: Date,
  endDate: Date,
): Promise<WbPromotionRaw[]> {
  const token = getToken()
  const all: WbPromotionRaw[] = []
  let offset = 0
  const limit = 100

  while (true) {
    const url = `${PROMO_API}/api/v1/calendar/promotions` +
      `?startDateTime=${startDate.toISOString()}` +
      `&endDateTime=${endDate.toISOString()}` +
      `&allPromo=true&limit=${limit}&offset=${offset}`

    const res = await fetch(url, {
      headers: { Authorization: token },
    })

    if (res.status === 429) {
      await sleep(6000)  // back off full rate window
      continue
    }
    if (!res.ok) {
      throw new Error(`WB Promotions API ${res.status}: ${await res.text()}`)
    }

    const data = await res.json()
    const items = (data.data?.promotions ?? data.promotions ?? []) as WbPromotionRaw[]
    if (items.length === 0) break
    all.push(...items)
    if (items.length < limit) break
    offset += items.length

    await sleep(PROMO_RATE_DELAY_MS)
  }
  return all
}

export async function fetchPromotionDetails(ids: number[]) {
  // Batches of 10 ids, 600ms pause between batches
  const details: unknown[] = []
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10)
    const url = `${PROMO_API}/api/v1/calendar/promotions/details` +
      `?promotionIDs=${batch.join(",")}`
    const res = await fetch(url, { headers: { Authorization: getToken() } })
    if (res.status === 429) { await sleep(6000); i -= 10; continue }
    if (!res.ok) throw new Error(`Promotion details ${res.status}`)
    const data = await res.json()
    details.push(...(data.data?.promotions ?? data.promotions ?? []))
    if (i + 10 < ids.length) await sleep(PROMO_RATE_DELAY_MS)
  }
  return details
}

export async function fetchPromotionNomenclatures(promotionId: number) {
  // ТОЛЬКО для regular. Auto даст 422.
  const url = `${PROMO_API}/api/v1/calendar/promotions/nomenclatures` +
    `?promotionID=${promotionId}&inAction=false&limit=1000`
  const res = await fetch(url, { headers: { Authorization: getToken() } })

  if (res.status === 422) {
    // Это auto-акция — skip silently
    return []
  }
  if (res.status === 429) {
    await sleep(6000)
    return fetchPromotionNomenclatures(promotionId)  // retry once
  }
  if (!res.ok) throw new Error(`Nomenclatures ${res.status}`)

  const data = await res.json()
  return (data.data?.nomenclatures ?? data.nomenclatures ?? []) as Array<{
    nmID: number
    price: number
    planPrice: number
    discount: number
    planDiscount: number
    inAction?: boolean
  }>
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
```

**Critical note:** Точный базовый URL для Promotions Calendar нужно проверить на `dev.wildberries.ru/en/swagger/promotion`. В training data встречается как `https://dp-calendar-api.wildberries.ru` и `https://discounts-prices-api.wildberries.ru/api/v1/calendar/...`. Планер MUST валидировать URL через `curl` или `fetch` до запуска реальной синхронизации (не жечь rate limit на неверном host).

### Pattern 4: rowSpan-группировка в таблице

**What:** Native HTML `<td rowSpan={N}>` работает через shadcn `<TableCell>` (forward через `{...props}`).

**Подготовка данных на сервере:**

```ts
// На RSC page.tsx строим структуру:
type ProductGroup = {
  product: ProductWithRelations
  totalRowsInProduct: number  // = sum of all priceRows across all linked cards
  cards: Array<{
    card: WbCardWithPricing
    priceRows: PriceRow[]      // [current, ...regular, ...auto, ...calculated]
  }>
}

type PriceRow = {
  type: "current" | "regular" | "auto" | "calculated"
  sellerPrice: number
  promotionName?: string
  promotionDescription?: string
  promotionAdvantages?: string[]
  calculatedSlot?: 1 | 2 | 3
  calculatedName?: string
  computed: PricingOutputs  // готовые 30 значений
}
```

**Рендер (упрощённо):**

```tsx
{groups.map((group) =>
  group.cards.map((cardGroup, cardIdx) =>
    cardGroup.priceRows.map((row, rowIdx) => {
      const isFirstRowOfProduct = cardIdx === 0 && rowIdx === 0
      const isFirstRowOfCard = rowIdx === 0
      return (
        <TableRow
          key={`${cardGroup.card.id}-${rowIdx}`}
          onClick={() => openDialog(cardGroup.card, row)}
          className={cn(
            "cursor-pointer",
            isFirstRowOfProduct && cardIdx === 0 && "border-t-4 border-t-border",
            isFirstRowOfCard && !isFirstRowOfProduct && "border-t border-t-border/60",
            row.type === "regular" && "border-l-4 border-l-blue-500 bg-blue-50/30 dark:bg-blue-500/10",
            row.type === "auto" && "border-l-4 border-l-purple-500 bg-purple-50/30 dark:bg-purple-500/10",
            row.type === "calculated" && "border-l-4 border-l-amber-500 bg-amber-50/30 dark:bg-amber-500/10",
          )}
        >
          {isFirstRowOfProduct && (
            <>
              <TableCell
                rowSpan={group.totalRowsInProduct}
                className="sticky left-0 z-10 bg-background border-r w-20 align-top p-2"
              >
                {/* Фото */}
              </TableCell>
              <TableCell
                rowSpan={group.totalRowsInProduct}
                className="sticky left-20 z-10 bg-background border-r w-60 align-top p-3"
              >
                {/* Сводка */}
              </TableCell>
            </>
          )}
          {isFirstRowOfCard && (
            <>
              <TableCell
                rowSpan={cardGroup.priceRows.length}
                className="sticky left-[320px] z-10 bg-background border-r w-20 align-top"
              >
                {cardGroup.card.label}
              </TableCell>
              <TableCell
                rowSpan={cardGroup.priceRows.length}
                className="sticky left-[400px] z-10 bg-background border-r w-28 align-top font-mono text-xs"
              >
                {cardGroup.card.nmId}
              </TableCell>
            </>
          )}
          {/* 30 расчётных ячеек */}
          <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right">
            {row.computed.sellerPrice.toFixed(2)}
          </TableCell>
          {/* ... остальные ... */}
          <TableCell className={cn(
            "px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right font-medium",
            row.computed.profit >= 0 ? "text-green-600" : "text-red-600"
          )}>
            {row.computed.profit.toFixed(2)}
          </TableCell>
        </TableRow>
      )
    })
  )
)}
```

### Pattern 5: Debounced save для AppSetting

**What:** `GlobalRatesBar` — client component, `onChange` inputs → `setTimeout(500ms)` → вызов server action. При смене input до истечения таймера — `clearTimeout`.

**Useful hook:**

```tsx
function useDebouncedCallback<T extends (...args: never[]) => void>(fn: T, ms: number) {
  const ref = useRef<ReturnType<typeof setTimeout>>()
  return useCallback((...args: Parameters<T>) => {
    if (ref.current) clearTimeout(ref.current)
    ref.current = setTimeout(() => fn(...args), ms)
  }, [fn, ms]) as T
}
```

### Anti-Patterns to Avoid

- **Anti-pattern:** Расчёт формул отдельно на клиенте (модалка) и сервере (таблица) → расхождения. **Instead:** pure function `calculatePricing` в `lib/pricing-math.ts`, импортируется обоими.
- **Anti-pattern:** Округление денег до рублей (`Math.round(v)`) → накапливается ошибка через цепочку 30 операций. **Instead:** округлять до копеек `Math.round(v * 100) / 100`, итоговую прибыль — округлить для отображения.
- **Anti-pattern:** Хранить готовые outputs в БД → стейл при изменении ставок. **Instead:** хранить только inputs (`CalculatedPrice.sellerPrice` + `snapshot: Json`), считать on-the-fly.
- **Anti-pattern:** `fetch` к WB Promotions API без задержек → 429 мгновенно. **Instead:** фикс пауза 600мс + обработка 429 через `sleep(6000)` + retry.
- **Anti-pattern:** Использовать shadcn/base-ui `<Select>` для выбора слота → ломается с `defaultValue` (CLAUDE.md). **Instead:** native `<select>` с `value` controlled.
- **Anti-pattern:** Вся таблица в одном огромном файле `page.tsx` → 1000+ строк. **Instead:** RSC отдаёт готовые `rows: PriceRow[]`, клиентский компонент только рендерит.
- **Anti-pattern:** `revalidatePath("/")` после saveCalculatedPrice → revalidates всё. **Instead:** `revalidatePath("/prices/wb")`.
- **Anti-pattern:** `execSync('curl')` для Promotions API. **Instead:** обычный `fetch` — WB seller API с токеном через header Authorization работает из Node.js. Curl нужен ТОЛЬКО для публичного `card.wb.ru` v4.

## Don't Hand-Roll

| Проблема | Не строить самим | Использовать | Почему |
|----------|------------------|--------------|--------|
| Excel парсинг с кириллическими заголовками | Custom parser | **`xlsx` (SheetJS)** — уже установлен | Поддержка UTF-8 из коробки, уже доказано работает в `/api/wb-commission-iu` |
| Tooltip с контентом | Свой CSS + позиционирование | **shadcn Tooltip** (`npx shadcn add tooltip`) | `@base-ui/react` даёт focus trap, aria-describedby, smart positioning |
| Rate-limited retry loop | try/catch без структуры | **Простой паттерн**: `for` loop + 429 → sleep(6000) + continue | Достаточно для rate limit 10/6 сек, не нужен axios-retry |
| RBAC check | Ручное чтение session | **`requireSection("PRICES", "MANAGE")`** из `lib/rbac.ts` | Уже реализовано, включая fallback на legacy `allowedSections` |
| Формы валидации | `new FormData().get(...)` + manual | **`react-hook-form` + `zodResolver`** | Паттерн проекта (`UserForm`, `ProductForm`) |
| Сохранение BLOB/multipart | Ручная разборка | **`req.formData()` + `file.arrayBuffer()`** | Next.js 15 App Router даёт нативно, пример в `/api/wb-commission-iu/route.ts` |
| Toast уведомления | Свой overlay | **`sonner`** | Уже установлен, есть `<Toaster />` в layout |
| Горизонтальный скролл таблицы | `<ScrollArea>` radix | **`overflow-x-auto` div + sticky** | Нативно быстрее на больших таблицах, уже паттерн в `table.tsx` |
| Fixed-point math для денег | `Decimal.js` / `big.js` | **`Number` + Math.round(v*100)/100** | Округление до копеек достаточно, golden test валидирует |

**Key insight:** Phase 7 — на 80% переиспользование доказанных паттернов проекта. Единственное по-настоящему новое — WB Promotions Calendar API (endpoints, rate limiting), всё остальное — вариации `WbCardsTable` / `WbSyncButton` / `WbUploadIuButton` / `UserDialog`.

## Runtime State Inventory

> **SKIPPED** — Phase 7 не rename/refactor/migration. Это greenfield добавление нового раздела. Нет существующих runtime state, которые нужно мигрировать. Новые Prisma-миграции (AppSetting, CalculatedPrice, WbPromotion, WbPromotionNomenclature, поля в Product/Category/Subcategory/WbCard) — это additive changes, не переименования. Однако:

- **Stored data:** `AppSetting` seed — при первом запуске в seed.ts или lazy-seed внутри server action `getPricingSettings()`. Решение: **eager seed в `prisma/seed.ts`** — плагинить к существующему seed (паттерн: `upsert by key`).
- **Live service config:** Нет.
- **OS-registered state:** Нет.
- **Secrets/env vars:** `WB_API_TOKEN` уже существует в `/etc/zoiten.pro.env`. Scope: bit 1 (Контент) + bit 2 (Аналитика) + bit 3 (Цены) + bit 6 (Статистика) + bit 7 (Тарифы). **Проверить: включён ли scope для Promotions Calendar?** По документации WB scope называется «Цены и скидки» — тот же bit 3, который уже есть. Если 401 на реальном вызове — пересоздать токен с правильным scope. Планер должен предусмотреть Manual verification step в Wave 0.
- **Build artifacts:** Нет.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL (Prisma) | Все БД-операции | ✓ | 16 (prod VPS) | — |
| Node.js runtime API routes | `/api/wb-promotions-*` | ✓ | 20+ (next.js 15.5) | — |
| `xlsx` package | Excel parser для auto-акций | ✓ | 0.18.5 | — |
| `@base-ui/react` | Dialog, Tooltip | ✓ | 1.3.0 | — |
| shadcn CLI | Добавить Tooltip | ✓ | 4.1.2 | Скопировать tooltip.tsx вручную |
| WB_API_TOKEN env var | Все sync endpoints | ✓ | — | Fallback 401 → toast error + disable кнопку |
| WB Promotions Calendar API доступность | `/api/wb-promotions-sync` | **⚠ НУЖНО ПРОВЕРИТЬ** | — | Без API — раздел работает только с CalculatedPrice и ручными Excel auto-акциями (degraded mode, но функционален) |
| WB Statistics Sales API (для avgSalesSpeed7d) | `WbCard.avgSalesSpeed7d` заполнение | ✓ | — | Если fetch 429/ошибка — поле остаётся null, таблица показывает «—» |
| Canonical Excel `Форма управления ценами.xlsx` | Golden test case и названия 30 колонок | ✓ (верифицировано) | — | Если недоступен — спросить пользователя |
| Образец Excel auto-акции | Формат парсера D-06 | ✓ (верифицировано в Downloads) | — | — |

**Missing dependencies with no fallback:** нет блокирующих.

**Dependencies to verify during Wave 0:**
1. WB API token scope для Promotions Calendar — make a test GET `/api/v1/calendar/promotions?limit=1&allPromo=true&startDateTime=now&endDateTime=now+1d`. Response 200 = ok, 401 = нужен новый токен с правильным scope, 403 = scope недостаточен.
2. Точный базовый URL для Promotions Calendar API — возможны варианты `dp-calendar-api.wildberries.ru` или `discounts-prices-api.wildberries.ru`. Проверить через `curl` по swagger.

## Common Pitfalls

### Pitfall 1: Rate limit 429 на Promotions Calendar API
**Что идёт не так:** WB Promotions Calendar жёстко режет > 10 запросов / 6 сек. При синхронизации 83+ акций (details по 10 = 9 батчей, nomenclatures = 50+ запросов) без пауз лимит пробивается мгновенно.
**Почему:** 10/6сек = максимум 600мс между запросами.
**Как избежать:** `sleep(600)` между запросами; на 429 — `sleep(6000)` + retry один раз.
**Признаки:** Response status 429, `X-RateLimit-Reset` header, body `{"errors":["too many requests"]}`.

### Pitfall 2: 422 на nomenclatures для auto-акций
**Что идёт не так:** Запрос `GET /api/v1/calendar/promotions/nomenclatures?promotionID=X` для акции с `type: "auto"` возвращает 422 «Error processing request parameters».
**Почему:** Auto-акции не дают список eligible nmIds через API — только через Excel-экспорт из кабинета.
**Как избежать:** Фильтровать `promotions.filter(p => p.type !== "auto")` перед запросом nomenclatures. На 422 — silently return `[]` и пометить в логе «auto promotion skipped».
**Признаки:** 422 в логах, `status: "Error processing request parameters"`.

### Pitfall 3: WB TLS fingerprint блокировка Node.js fetch (но только для public v4!)
**Что идёт не так:** Разработчик «оптимизирует» `execSync('curl ...')` в `fetchWbDiscounts` на обычный fetch → 403 Forbidden.
**Почему:** `card.wb.ru/cards/v4/detail` — публичный endpoint покупателя с anti-bot защитой. Seller API (включая Promotions Calendar) работает с обычным `fetch` и Bearer token.
**Как избежать:** НЕ трогать `fetchWbDiscounts`. Для Promotions Calendar использовать обычный `fetch` с `Authorization: token` header.
**Признаки:** 403 Forbidden с HTML в body вместо JSON.

### Pitfall 4: rowSpan ломается при неправильном подсчёте totalRows
**Что идёт не так:** `rowSpan={totalRowsInProduct}` задан на Фото, но реальный рендер имеет другое число `<TableRow>` → таблица распадается, колонки смещены.
**Почему:** Если промежуточно фильтруется row (например `auto без Excel-данных → пропускается`), totalRows вычисляется до фильтрации.
**Как избежать:** Сначала построить полный массив `priceRows[]` post-filter, ПОТОМ считать `group.totalRowsInProduct = sum(cards.map(c => c.priceRows.length))`.
**Признаки:** Визуальный slip колонок, Фото оказывается рядом с неправильным товаром.

### Pitfall 5: Sticky колонки теряют фон при hover
**Что идёт не так:** `:hover` меняет фон строки, но sticky `<td>` имеют свой `bg-background`, и прозрачность `bg-muted/50` не применяется → визуальный разрыв.
**Почему:** `position: sticky` создаёт новый stacking context, `group-hover:` или cascade не работает как ожидается.
**Как избежать:** Использовать `group-hover:bg-muted/50` + `<TableRow className="group">`, или на sticky-ячейках `hover:bg-muted/50` вручную. Альтернативно: использовать backdrop через `bg-inherit` (не работает в Tailwind) — проще оставить видимый tile.
**Признаки:** При hover над строкой sticky-колонки остаются белыми, остальные подсвечиваются.

### Pitfall 6: react-hook-form `watch()` перезапускает рендер с каждым нажатием
**Что идёт не так:** В модалке `const values = watch()` → realtime пересчёт → но rerender всей модалки на каждое нажатие клавиши → ощущение лагов.
**Почему:** `watch()` без аргументов возвращает все значения, триггерит rerender на любом изменении.
**Как избежать:** Использовать `useWatch({ control, name: [...] })` с конкретными именами, обернуть `calculatePricing` в `useMemo(() => calculatePricing(values), [values])`.
**Признаки:** На input типа number пересчёт лагает на 100-200мс.

### Pitfall 7: Excel с кириллическими колонками парсится как undefined
**Что идёт не так:** `XLSX.utils.sheet_to_json(sheet)` (без `header: 1`) использует первую строку как keys, если в строке кириллица с непечатными символами — keys не совпадают.
**Почему:** В отчётах WB бывают BOM, `\u00A0` (non-breaking space), trailing whitespace.
**Как избежать:** Использовать `XLSX.utils.sheet_to_json(sheet, { header: 1 })` — массив массивов по индексу колонок, НЕ по keys. Потом обращаться `row[0]` (A), `row[5]` (F), `row[11]` (L), `row[12]` (M), `row[19]` (T), `row[20]` (U). Это **тот же паттерн**, что `/api/wb-commission-iu/route.ts` (row[0], row[1], ... по индексам).
**Признаки:** `row["Артикул WB"] === undefined` при том что в файле колонка видна.

### Pitfall 8: Округление в формулах через разные операции даёт расхождение с Excel
**Что идёт не так:** Excel округляет промежуточно / в конце — наш код округляет каждый шаг → ошибка 0.05₽ в итоговой прибыли.
**Почему:** Порядок операций Excel (IEEE 754 double + автоматические формат-округления в ячейках) отличается от JS.
**Как избежать:** Не округлять промежуточные результаты вообще. Работать с полной точностью `Number`. Округлять ТОЛЬКО при выводе в UI (`.toFixed(2)` для денег). Golden test проверяет совпадение с Excel-эталоном — tolerance `< 0.01₽`.
**Признаки:** Golden test fails с diff 0.02-0.05₽ на профите.

### Pitfall 9: Деление на ноль в Re продаж / ROI
**Что идёт не так:** Если `sellerPrice == 0` → `returnOnSales = profit / sellerPrice = Infinity` → `toFixed(1)` показывает `"Infinity%"`.
**Почему:** Не все WbCard имеют непустые цены (новые карточки без прайса).
**Как избежать:** Guard `sellerPrice > 0 ? profit / sellerPrice : 0`; если `costPrice == 0` → ROI = 0 и отдельный toast warning «Нет себестоимости для товара X».
**Признаки:** «Infinity%» или «NaN%» в ячейках.

### Pitfall 10: `AppSetting` не засеедено и server action падает при первом чтении
**Что идёт не так:** Пользователь открывает `/prices/wb`, `prisma.appSetting.findMany` возвращает `[]`, `ratesMap = {}`, формулы получают `undefined` ставки.
**Почему:** Seed не запущен, или пропустил новый тип записей.
**Как избежать:** (a) Добавить seed в `prisma/seed.ts` с `upsert by key`, (b) lazy-seed при первом чтении: `getPricingSettings()` проверяет наличие всех ключей и `createMany` при необходимости, (c) в `calculatePricing` дефолты на случай недостачи.
**Признаки:** `NaN` по цепочке расчёта в первой загрузке.

### Pitfall 11: Промежуточное состояние `CalculatedPrice.snapshot` устаревает
**Что идёт не так:** Пользователь сохранил расчёт месяц назад при ставке кошелька 2%. Сегодня ставка 2.5%. Таблица показывает расчёт по новым ставкам, но `snapshot.walletPct === 2` — disconnect между UI и stored state.
**Почему:** По D-12 расчёт on-the-fly, `snapshot` только для history.
**Как избежать:** В UI использовать текущие AppSetting ставки, `snapshot` — только для debug/history (deferred). Пользователю явно показать в модалке какие ставки применились.
**Признаки:** Жалоба «расчёт отличается от того, что я сохранял».

## Code Examples

### WB Promotions API — минимальный sync flow (ссылка на official docs)

```ts
// app/api/wb-promotions-sync/route.ts (скелет)
// Source: dev.wildberries.ru/en/swagger/promotion
// Rate limit: 10 req / 6 sec (verified: DragonSigh wildberries-api-docs)

export const runtime = "nodejs"
export const maxDuration = 300  // 5 minutes max

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import {
  fetchAllPromotions,
  fetchPromotionDetails,
  fetchPromotionNomenclatures,
} from "@/lib/wb-api"
import { requireSection } from "@/lib/rbac"

export async function POST() {
  try {
    await requireSection("PRICES", "MANAGE")
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  try {
    const start = new Date()
    const end = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)

    // 1. List
    const raw = await fetchAllPromotions(start, end)

    // 2. Upsert promotions
    for (const p of raw) {
      await prisma.wbPromotion.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          name: p.name,
          description: p.description ?? null,
          advantages: p.advantages ?? [],
          startDateTime: new Date(p.startDateTime),
          endDateTime: new Date(p.endDateTime),
          type: p.type,
          source: "API",
          lastSyncedAt: new Date(),
        },
        update: {
          name: p.name,
          description: p.description ?? null,
          advantages: p.advantages ?? [],
          startDateTime: new Date(p.startDateTime),
          endDateTime: new Date(p.endDateTime),
          type: p.type,
          lastSyncedAt: new Date(),
        },
      })
    }

    // 3. Details (batched 10)
    const ids = raw.map((p) => p.id)
    const details = await fetchPromotionDetails(ids)
    for (const d of details as Array<{ id: number; description?: string; ranging?: unknown }>) {
      await prisma.wbPromotion.update({
        where: { id: d.id },
        data: {
          description: d.description ?? null,
          rangingJson: (d.ranging ?? null) as unknown as object | null,
        },
      })
    }

    // 4. Nomenclatures ONLY for regular
    let nomTotal = 0
    for (const p of raw.filter((pp) => pp.type !== "auto")) {
      const noms = await fetchPromotionNomenclatures(p.id)
      await prisma.wbPromotionNomenclature.deleteMany({ where: { promotionId: p.id } })
      if (noms.length > 0) {
        await prisma.wbPromotionNomenclature.createMany({
          data: noms.map((n) => ({
            promotionId: p.id,
            nmId: n.nmID,
            inAction: n.inAction ?? false,
            planPrice: n.planPrice ?? null,
            planDiscount: n.planDiscount ?? null,
          })),
          skipDuplicates: true,
        })
      }
      nomTotal += noms.length
    }

    // 5. Cleanup expired
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const deleted = await prisma.wbPromotion.deleteMany({
      where: { endDateTime: { lt: cutoff } },
    })

    return NextResponse.json({
      synced: raw.length,
      nomenclatures: nomTotal,
      deleted: deleted.count,
    })
  } catch (e) {
    console.error("WB promotions sync error:", e)
    return NextResponse.json(
      { error: (e as Error).message || "Ошибка синхронизации" },
      { status: 500 },
    )
  }
}
```

### Excel парсер для auto-акций (паттерн из `/api/wb-commission-iu/route.ts`)

```ts
// app/api/wb-promotions-upload-excel/route.ts (скелет)
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"

export async function POST(req: NextRequest) {
  try {
    await requireSection("PRICES", "MANAGE")
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const promotionIdRaw = formData.get("promotionId") as string | null
  if (!file || !promotionIdRaw) {
    return NextResponse.json({ error: "Файл или promotionId не указаны" }, { status: 400 })
  }
  const promotionId = parseInt(promotionIdRaw, 10)
  if (Number.isNaN(promotionId)) {
    return NextResponse.json({ error: "Неверный promotionId" }, { status: 400 })
  }

  // Проверка: акция существует и type === "auto"
  const promo = await prisma.wbPromotion.findUnique({ where: { id: promotionId } })
  if (!promo) return NextResponse.json({ error: "Акция не найдена" }, { status: 404 })
  if (promo.type !== "auto") {
    return NextResponse.json(
      { error: "Excel загрузка только для auto-акций" },
      { status: 400 },
    )
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: "buffer" })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1 })

    if (rows.length < 2) {
      return NextResponse.json({ error: "Пустой файл" }, { status: 400 })
    }

    // Колонки (0-indexed): A=0, F=5, L=11, M=12, T=19, U=20
    const records: Array<{
      promotionId: number
      nmId: number
      inAction: boolean
      planPrice: number | null
      currentPrice: number | null
      planDiscount: number | null
      status: string | null
    }> = []

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      if (!r || r.length === 0) continue
      const nmId = parseInt(String(r[5] ?? ""), 10)
      if (Number.isNaN(nmId)) continue
      const inActionRaw = String(r[0] ?? "").toLowerCase().trim()
      records.push({
        promotionId,
        nmId,
        inAction: inActionRaw === "да" || inActionRaw === "yes",
        planPrice: parseFloat(String(r[11] ?? "")) || null,
        currentPrice: parseFloat(String(r[12] ?? "")) || null,
        planDiscount: parseFloat(String(r[19] ?? "")) || null,
        status: r[20] ? String(r[20]).trim() : null,
      })
    }

    if (records.length === 0) {
      return NextResponse.json({ error: "Не удалось распарсить строки" }, { status: 400 })
    }

    // Upsert: удаляем старые номенклатуры этой акции, вставляем новые
    await prisma.$transaction([
      prisma.wbPromotionNomenclature.deleteMany({ where: { promotionId } }),
      prisma.wbPromotionNomenclature.createMany({ data: records, skipDuplicates: true }),
      prisma.wbPromotion.update({
        where: { id: promotionId },
        data: { lastSyncedAt: new Date(), source: "EXCEL" },
      }),
    ])

    return NextResponse.json({ imported: records.length })
  } catch (e) {
    console.error("Auto promo Excel upload error:", e)
    return NextResponse.json(
      { error: (e as Error).message || "Ошибка обработки файла" },
      { status: 500 },
    )
  }
}
```

### Prisma-schema addition (готовый блок для миграции)

```prisma
// --- ДОБАВИТЬ в prisma/schema.prisma ---

// ── Глобальные настройки KeyValue ─────────────────────────────────
model AppSetting {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt
  updatedBy String?
}

// ── Расчётные цены ────────────────────────────────────────────────
model CalculatedPrice {
  id              String   @id @default(cuid())
  wbCardId        String
  wbCard          WbCard   @relation(fields: [wbCardId], references: [id], onDelete: Cascade)
  slot            Int      // 1 | 2 | 3
  name            String
  sellerPrice     Float
  drrPct          Float?
  defectRatePct   Float?
  deliveryCostRub Float?
  snapshot        Json
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([wbCardId, slot])
}

// ── WB акции ──────────────────────────────────────────────────────
model WbPromotion {
  id             Int                         @id    // promotionID из WB API
  name           String
  description    String?
  advantages     String[]
  startDateTime  DateTime
  endDateTime    DateTime
  type           String                       // "auto" | "regular"
  rangingJson    Json?
  source         String                       @default("API")  // "API" | "EXCEL"
  lastSyncedAt   DateTime                     @default(now())
  nomenclatures  WbPromotionNomenclature[]
  createdAt      DateTime                     @default(now())
}

model WbPromotionNomenclature {
  id           String      @id @default(cuid())
  promotionId  Int
  promotion    WbPromotion @relation(fields: [promotionId], references: [id], onDelete: Cascade)
  nmId         Int
  inAction     Boolean     @default(false)
  planPrice    Float?
  planDiscount Float?
  currentPrice Float?
  status       String?

  @@unique([promotionId, nmId])
}

// --- ИЗМЕНЕНИЯ в существующих моделях ---

model Category {
  // ... существующие поля ...
  defaultDefectRatePct Float?
}

model Subcategory {
  // ... существующие поля ...
  defaultDrrPct Float?
}

model Product {
  // ... существующие поля ...
  drrOverridePct        Float?
  defectRateOverridePct Float?
  deliveryCostRub       Float?
}

model WbCard {
  // ... существующие поля ...
  avgSalesSpeed7d Float?
  calculatedPrices CalculatedPrice[]
}
```

### SQL миграция (прямой формат проекта — CREATE + ALTER, НЕ prisma migrate dev на проде)

```sql
-- prisma/migrations/20260409_prices_wb/migration.sql

-- 1. AppSetting
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- 2. CalculatedPrice
CREATE TABLE "CalculatedPrice" (
    "id" TEXT NOT NULL,
    "wbCardId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sellerPrice" DOUBLE PRECISION NOT NULL,
    "drrPct" DOUBLE PRECISION,
    "defectRatePct" DOUBLE PRECISION,
    "deliveryCostRub" DOUBLE PRECISION,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalculatedPrice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalculatedPrice_wbCardId_slot_key" ON "CalculatedPrice"("wbCardId", "slot");
ALTER TABLE "CalculatedPrice" ADD CONSTRAINT "CalculatedPrice_wbCardId_fkey"
    FOREIGN KEY ("wbCardId") REFERENCES "WbCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. WbPromotion
CREATE TABLE "WbPromotion" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "advantages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "rangingJson" JSONB,
    "source" TEXT NOT NULL DEFAULT 'API',
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WbPromotion_pkey" PRIMARY KEY ("id")
);

-- 4. WbPromotionNomenclature
CREATE TABLE "WbPromotionNomenclature" (
    "id" TEXT NOT NULL,
    "promotionId" INTEGER NOT NULL,
    "nmId" INTEGER NOT NULL,
    "inAction" BOOLEAN NOT NULL DEFAULT false,
    "planPrice" DOUBLE PRECISION,
    "planDiscount" DOUBLE PRECISION,
    "currentPrice" DOUBLE PRECISION,
    "status" TEXT,
    CONSTRAINT "WbPromotionNomenclature_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WbPromotionNomenclature_promotionId_nmId_key"
    ON "WbPromotionNomenclature"("promotionId", "nmId");
ALTER TABLE "WbPromotionNomenclature" ADD CONSTRAINT "WbPromotionNomenclature_promotionId_fkey"
    FOREIGN KEY ("promotionId") REFERENCES "WbPromotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Поля в существующих таблицах
ALTER TABLE "Category"    ADD COLUMN "defaultDefectRatePct"  DOUBLE PRECISION;
ALTER TABLE "Subcategory" ADD COLUMN "defaultDrrPct"         DOUBLE PRECISION;
ALTER TABLE "Product"     ADD COLUMN "drrOverridePct"        DOUBLE PRECISION;
ALTER TABLE "Product"     ADD COLUMN "defectRateOverridePct" DOUBLE PRECISION;
ALTER TABLE "Product"     ADD COLUMN "deliveryCostRub"       DOUBLE PRECISION;
ALTER TABLE "WbCard"      ADD COLUMN "avgSalesSpeed7d"       DOUBLE PRECISION;

-- 6. Seed AppSetting дефолтов (6 ключей)
INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES
    ('wbWalletPct',    '2.0', NOW()),
    ('wbAcquiringPct', '2.7', NOW()),
    ('wbJemPct',       '1.0', NOW()),
    ('wbCreditPct',    '7.0', NOW()),
    ('wbOverheadPct',  '6.0', NOW()),
    ('wbTaxPct',       '8.0', NOW())
ON CONFLICT ("key") DO NOTHING;
```

## State of the Art

| Old | Current | Date | Impact |
|-----|---------|------|--------|
| Radix UI для dialog/tooltip | `@base-ui/react` 1.3.0 (base-nova preset) | shadcn v4 (2025) | Используется в проекте. Discovery: `Dialog as DialogPrimitive from "@base-ui/react/dialog"`, НЕ `@radix-ui/react-dialog`. |
| prisma migrate dev | prisma migrate deploy на проде + manual SQL в `migrations/` | GSD convention (Phase 1) | Все миграции в репо писать вручную SQL в `prisma/migrations/{timestamp}_name/migration.sql` |
| Раздельные формулы клиент/сервер | Pure function в `lib/` shared | JS модули | `calculatePricing` импортируется и в RSC и в client |
| `fetch` в Promotions API без retry | `fetch` + `sleep(600)` между запросами + retry на 429 | WB Rate Limits (2024-2025) | Обязательный паттерн для всех WB sync endpoint'ов кроме v4 public |

**Deprecated/outdated (не использовать в Phase 7):**
- shadcn/ui v3 с radix — проект на v4 с base-ui
- `framer-motion` — в проекте `motion` (12.38.0)
- `useFormState` (react) — использовать react-hook-form
- `.env.local` на VPS — `/etc/zoiten.pro.env` через systemd EnvironmentFile

## Open Questions

1. **Точный базовый URL WB Promotions Calendar API**
   - Что знаем: Endpoint `/api/v1/calendar/promotions`, авторизация через Bearer token header.
   - Что неясно: Basепath — `dp-calendar-api.wildberries.ru` (появляется в неофициальных источниках) vs `discounts-prices-api.wildberries.ru` (с которым проект уже работает).
   - Рекомендация: Перед первым реальным sync сделать тестовый `curl` с токеном; плановый `Wave 0` должен включать task «verify WB Promotions Calendar base URL». Закрепить URL константой в `lib/wb-api.ts` как `PROMO_API`.

2. **Содержит ли WB_API_TOKEN проекта scope «Цены и скидки»?**
   - Что знаем: CLAUDE.md упоминает bit 3 (Цены). DragonSigh docs: Promotions Calendar под scope «Prices and Discounts».
   - Что неясно: По факту — работает ли текущий токен с этими endpoints.
   - Рекомендация: Wave 0 — smoke test `fetchAllPromotions(now, now+1d)`. Если 401 → пользователь перегенерирует токен с правильным scope перед Wave 1.

3. **Точные заголовки 30 колонок таблицы расчёта**
   - Что знаем: Excel-образец существует по пути `C:/Users/User/Desktop/Форма управления ценами.xlsx`.
   - Что неясно: Точные заголовки в исходном файле (я не читал xlsx в рамках research).
   - Рекомендация: Planner должен прочитать Excel первым шагом (через `node -e "require('xlsx').utils..."` или через test скрипт) и выписать 30 заголовков + порядок + golden test row для nmId 800750522. Это Wave 0 task.

4. **Как определить связь WbCard → Product через MarketplaceArticle**
   - Что знаем: Паттерн существует в `/cards/wb/page.tsx` (строки 65-77): `MarketplaceArticle` с `marketplaceId = wbMarketplace.id`, `article = String(card.nmId)`, `product.deletedAt: null`.
   - Что неясно: Оптимальный query — с `wbCard.findMany()` с JOIN или отдельный `marketplaceArticle.findMany` + Map.
   - Рекомендация: Использовать ТОТ ЖЕ паттерн что `/cards/wb/page.tsx` строки 56-77 — `findMany` отдельно, потом Set/Map лукап. Для `/prices/wb` инвертировать: start с `MarketplaceArticle` → в рамках JOIN подтянуть Product + Cost + Subcategory + Category, а WbCards через `nmId IN (...)`.

5. **Что делать если фильтр даёт 0 связанных карточек**
   - Что знаем: UI-SPEC D-specifies «empty state 1».
   - Что неясно: Показывать ли `GlobalRatesBar` в этом случае.
   - Рекомендация: Да, показывать — ставки глобальные и не зависят от наличия карточек. Empty state только для таблицы.

6. **Нужен ли limit/pagination в `/prices/wb` таблице**
   - Что знаем: ~1000 товаров, каждый может иметь 1-3 WbCard, 1-6 ценовых строк → ~3000-6000 rows в DOM.
   - Что неясно: Будет ли тормозить rendering без pagination.
   - Рекомендация: В Wave 1 реализовать БЕЗ pagination (проще), в verification проверить FPS при horizontal scroll. Если тормозит — добавить пагинацию per Product (20 Product на страницу) через URL params (как `/cards/wb`). Не начинать с virtualization (react-virtual) — overkill для первого релиза.

## Project Constraints (from CLAUDE.md)

**Обязательные директивы проекта, которые планер MUST соблюсти:**

1. **Язык:** русский для UI, комментариев, планов, коммитов. Английский ТОЛЬКО для code identifiers.
2. **Server Actions:** `"use server"` + `requireSection()` в начале + `try/catch` + `revalidatePath("/prices/wb")`.
3. **Native `<select>`** вместо shadcn/base-ui Select (base-ui Select ломается с `defaultValue`).
4. **`execSync('curl ...')` — ТОЛЬКО для `card.wb.ru/v4/detail`** (public TLS fingerprint блокировка). Promotions Calendar, Content, Prices, Statistics, Analytics, Tariffs — обычный Node.js `fetch` с `Authorization: token` header.
5. **SKU generation:** `$queryRaw SELECT nextval('product_sku_seq')` внутри транзакции. НЕ относится к Phase 7 (CalculatedPrice использует `cuid()`).
6. **Темы:** все цвета через CSS переменные oklch (`bg-background`, `text-foreground`, `border-border`). Исключение: `text-green-600` / `text-red-600` для семантической подсветки прибыли (одобрено UI-SPEC).
7. **Prisma singleton:** всегда `import { prisma } from "@/lib/prisma"`, НЕ `new PrismaClient()`.
8. **Soft delete:** игнорировать `Product.deletedAt: { not: null }` во всех запросах.
9. **Moscow timezone:** все даты через `new Date()` с учётом prisma TIMESTAMP(3); `toLocaleString("ru-RU", {timeZone: "Europe/Moscow"})` для UI отображения.
10. **Генератор паролей:** не применимо к Phase 7.
11. **GSD Workflow:** Phase 7 запускается через `/gsd:execute-phase`.
12. **Всегда использовать GSD** (memory): планы, комментарии, коммиты на русском.
13. **Deploy process:** изменения Prisma схемы тестировать локально (если есть PostgreSQL), на проде — `prisma migrate deploy` из `deploy.sh`.
14. **RBAC уже разрешает `/prices`:** `lib/sections.ts` содержит `"/prices": "PRICES"`, enum `ERP_SECTION.PRICES` уже существует. Sidebar уже имеет nav-item `/prices`. **Ничего в navigation/RBAC infrastructure менять не нужно.**

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | **Нет unit test framework в проекте** (package.json test = "echo ... exit 1") |
| Config file | Отсутствует |
| Quick run command | — |
| Full suite command | — |
| Phase gate | Ручная верификация через `/gsd:verify-work` + golden-test case вручную в `tests/pricing-math.manual.ts` |

**Критично:** `workflow.nyquist_validation = true` в config, но проект не имеет vitest/jest. Wave 0 должен либо:
- **Option A (рекомендуется):** Добавить `vitest` как dev-dependency только для `lib/pricing-math.ts` — минимальная конфигурация, 1 файл теста. `npm i -D vitest`, `vitest.config.ts` c `test.include=["tests/**/*.test.ts"]`, `package.json scripts.test = "vitest run"`, `scripts["test:watch"] = "vitest"`.
- **Option B (минимум):** Написать standalone script `scripts/test-pricing-math.ts` + `npm run test:pricing` = `tsx scripts/test-pricing-math.ts`, который вызывает `calculatePricing(goldenInputs)` и `assert` на ожидаемые outputs. Без framework.

Рекомендация: **Option A с vitest** — 1 MB deps, стандарт экосистемы, будущие фазы смогут добавлять тесты в тот же каркас.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRICES-05 | `calculatePricing` на golden inputs nmId 800750522 возвращает `profit ≈ 567.68`, `returnOnSales ≈ 7`, `roi ≈ 26` | unit | `vitest run tests/pricing-math.test.ts` | ❌ Wave 0 |
| PRICES-05 | `calculatePricing` корректен при `sellerPrice = 0` (никаких Infinity/NaN) | unit | `vitest run tests/pricing-math.test.ts::zero-guard` | ❌ Wave 0 |
| PRICES-05 | Фаллбэк ДРР: Product.drrOverridePct → Subcategory.defaultDrrPct → 10 | unit | `vitest run tests/pricing-fallback.test.ts` | ❌ Wave 0 |
| PRICES-06 | Zod-валидация `updateAppSetting("wbWalletPct", "2.5")` → ok; `"200"` → error | unit | `vitest run tests/pricing-settings.test.ts` | ❌ Wave 0 |
| PRICES-10 | `fetchAllPromotions` batches + rate limit correctness — mock fetch, verify 600ms delays | integration (mocked) | `vitest run tests/wb-promotions-api.test.ts` | ❌ Wave 0 |
| PRICES-11 | Excel парсер корректно читает row[5] (nmId), row[11] (planPrice) из sample файла | integration (real file) | `vitest run tests/excel-auto-promo.test.ts` (fixture из Downloads) | ❌ Wave 0 |
| PRICES-01 | `/prices/wb` рендерит таблицу только с linked cards | e2e (manual) | Ручная верификация в `/gsd:verify-work` | — |
| PRICES-02 | rowSpan работает при 1-3 WbCard per Product | manual | Визуальная проверка (чек-лист) | — |
| PRICES-03 | Sticky колонки не теряют фон при hover | manual | Визуальная проверка | — |
| PRICES-04 | Клик по строке открывает модалку | manual | Визуальная проверка | — |
| PRICES-07 | Realtime пересчёт в модалке < 100ms | manual | Визуальная проверка (input → output) | — |
| PRICES-08 | Сохранение в слот 1 работает, затем в слот 1 повторно — upsert (не дубль) | manual + вспомогательный script | Проверка БД после 2х save | — |
| PRICES-09 | Checkbox «только этот товар» ➜ меняет Product, не Subcategory | manual | Verify БД после toggle | — |
| PRICES-10 | Реальный sync: 429 handling и cleanup | manual | Ручной вызов `/api/wb-promotions-sync` | — |
| PRICES-11 | Реальная загрузка Excel файла из Downloads | manual | Ручная загрузка через UI | — |
| PRICES-12 | `WbCard.avgSalesSpeed7d` заполняется после `/api/wb-sync` | manual | DB query | — |
| PRICES-13 | `/prices/ozon` показывает ComingSoon | manual | Визуальная проверка | — |
| PRICES-14 | Non-manager user получает FORBIDDEN на `updateAppSetting` | manual | test account + UI | — |

### Sampling Rate

- **Per task commit:** `vitest run tests/pricing-math.test.ts` (< 2 сек, Wave 1+)
- **Per wave merge:** `vitest run` (full suite, все вышеприведённые unit/integration, < 30 сек)
- **Phase gate:** Full suite green + manual visual checklist из `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `package.json` — добавить `vitest` dev-dep, scripts `test`/`test:watch`/`test:pricing`
- [ ] `vitest.config.ts` — минимальная конфигурация
- [ ] `tests/pricing-math.test.ts` — golden test nmId 800750522 (формулы выводятся из ТЗ + Excel)
- [ ] `tests/pricing-fallback.test.ts` — fallback chain для ДРР/брака/доставки
- [ ] `tests/pricing-settings.test.ts` — Zod валидация ставок
- [ ] `tests/wb-promotions-api.test.ts` — mocked fetch test rate limiting
- [ ] `tests/excel-auto-promo.test.ts` — реальный Excel fixture (скопировать из Downloads в `tests/fixtures/`)
- [ ] `tests/fixtures/auto-promo-sample.xlsx` — copy canonical Excel файла
- [ ] Планер прочитать `Форма управления ценами.xlsx` → зафиксировать 30 заголовков + golden test values в `tests/pricing-math.test.ts` как константу

## File Inventory (что будет создано/изменено)

### Новые файлы (создать)

```
# Database
prisma/migrations/20260409_prices_wb/migration.sql

# Page & layout
app/(dashboard)/prices/layout.tsx
app/(dashboard)/prices/page.tsx            # redirect → /prices/wb
app/(dashboard)/prices/wb/page.tsx
app/(dashboard)/prices/ozon/page.tsx

# API routes
app/api/wb-promotions-sync/route.ts
app/api/wb-promotions-upload-excel/route.ts

# Server actions
app/actions/pricing.ts

# Client components
components/prices/PricesTabs.tsx
components/prices/GlobalRatesBar.tsx
components/prices/PriceCalculatorTable.tsx
components/prices/PricingCalculatorDialog.tsx
components/prices/WbPromotionsSyncButton.tsx
components/prices/WbAutoPromoUploadButton.tsx
components/prices/PromoTooltip.tsx

# shadcn component
components/ui/tooltip.tsx  # via `npx shadcn add tooltip`

# Shared logic
lib/pricing-math.ts

# Tests (Wave 0)
vitest.config.ts
tests/pricing-math.test.ts
tests/pricing-fallback.test.ts
tests/pricing-settings.test.ts
tests/wb-promotions-api.test.ts
tests/excel-auto-promo.test.ts
tests/fixtures/auto-promo-sample.xlsx
```

### Существующие файлы (изменить)

```
prisma/schema.prisma              # добавить 4 модели + 6 полей в существующих
prisma/seed.ts                     # добавить seed для AppSetting (опционально, уже через SQL insert)
lib/wb-api.ts                     # добавить fetchAllPromotions, fetchPromotionDetails, fetchPromotionNomenclatures, fetchAvgSalesSpeed7d
app/api/wb-sync/route.ts          # вызвать fetchAvgSalesSpeed7d → запись в WbCard.avgSalesSpeed7d
package.json                       # добавить vitest dev dep + test scripts
app/(dashboard)/prices/page.tsx    # заменить ComingSoon на redirect к /prices/wb
```

### НЕ трогать

```
# Проверенная WB API логика
lib/wb-api.ts (существующие функции) — ТОЛЬКО добавка, НЕ рефакторинг
app/api/wb-sync/route.ts — только ДОБАВКА 1-2 строки, не переписывание
app/api/wb-sync-spp/route.ts — не трогать вообще

# Proven patterns
components/cards/WbCardsTable.tsx — read-only reference
components/cards/WbSyncButton.tsx — read-only reference + reuse как есть
components/cards/WbUploadIuButton.tsx — read-only reference

# RBAC / navigation
lib/rbac.ts — уже работает
lib/sections.ts — `/prices` уже включён
middleware.ts — не трогать
components/layout/Sidebar.tsx — `/prices` уже в NAV_ITEMS
```

## Development Order (рекомендуемый порядок)

**Wave 0 — Infrastructure & verification (before real code)**
1. Verify WB API token scope for Promotions Calendar (тест GET `/api/v1/calendar/promotions`)
2. Verify Promotions Calendar base URL (curl тест)
3. Read canonical Excel `Форма управления ценами.xlsx` → зафиксировать 30 заголовков + golden test row
4. Add vitest + test infrastructure
5. Write `lib/pricing-math.ts` skeleton + golden test (RED)
6. Implement formulas → test GREEN

**Wave 1 — Data layer**
7. Write `prisma/migrations/20260409_prices_wb/migration.sql` (manual SQL)
8. Update `prisma/schema.prisma` (mirror SQL changes)
9. Run `prisma generate` locally
10. Update `prisma/seed.ts` (optional, SQL insert уже seed-ит)

**Wave 2 — WB API extensions**
11. Add `fetchAllPromotions`, `fetchPromotionDetails`, `fetchPromotionNomenclatures`, `fetchAvgSalesSpeed7d` в `lib/wb-api.ts`
12. Write mocked tests for rate limiting behavior
13. Add `/api/wb-promotions-sync/route.ts`
14. Add `/api/wb-promotions-upload-excel/route.ts`
15. Extend `/api/wb-sync/route.ts` для avgSalesSpeed7d

**Wave 3 — Server actions**
16. Write `app/actions/pricing.ts` (все 7 actions)
17. Zod schemas для валидации
18. Tests для Zod (`pricing-settings.test.ts`)

**Wave 4 — UI infrastructure**
19. `npx shadcn add tooltip`
20. `app/(dashboard)/prices/layout.tsx`
21. `app/(dashboard)/prices/page.tsx` (redirect)
22. `app/(dashboard)/prices/ozon/page.tsx` (ComingSoon)
23. `components/prices/PricesTabs.tsx` (копия CardsTabs)

**Wave 5 — UI core — таблица**
24. `components/prices/GlobalRatesBar.tsx`
25. `components/prices/PromoTooltip.tsx`
26. `components/prices/PriceCalculatorTable.tsx` (самый сложный файл — rowSpan + sticky + clickable rows)
27. `app/(dashboard)/prices/wb/page.tsx` (RSC с data-загрузкой)

**Wave 6 — UI core — модалка**
28. `components/prices/PricingCalculatorDialog.tsx` (2 колонки, realtime через useMemo)
29. Sync с `PriceCalculatorTable` (onClick → open dialog)

**Wave 7 — Sync buttons**
30. `components/prices/WbPromotionsSyncButton.tsx`
31. `components/prices/WbAutoPromoUploadButton.tsx` (с nested dialog выбора акции)

**Wave 8 — Integration & Polish**
32. Empty states (Package icon empty + Alert no promotions)
33. Dark theme verification
34. Responsive check
35. Manual verification через `/gsd:verify-work`

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| WB Promotions API URL отличается от предположенного | Sync endpoint не работает на старте | Medium | Wave 0 smoke test + константа `PROMO_API` в одном месте |
| Token scope не покрывает Promotions | 401/403 при первой синхронизации | Low-Medium | Wave 0 тест токена; fallback — работать без Promotions, пользователь синкает вручную |
| 83+ акции × nomenclatures × rate limit = sync > 5 min → Next.js route timeout | Синк упадёт по таймауту | Medium | `export const maxDuration = 300` (5 min). Если не хватит — разбить sync на фазы («сначала акции», «потом nomenclatures батчами»), возвращать progress через polling |
| rowSpan + sticky ломается при hover | Визуальный баг | Medium | `group-hover` паттерн; обязательная визуальная проверка в light+dark темах |
| Формулы в Excel отличаются от ТЗ | Расчёты неправильные | Medium-High | Golden test как source of truth — любое расхождение формулы с Excel = ошибка в коде |
| Excel auto-акции имеет другое количество колонок / другие имена | Парсер возвращает undefined | High (форматы меняются) | Парсинг через **индексы** колонок (row[5], row[11]), НЕ по именам. Если реальный файл отличается — попросить пользователя прислать актуальный образец |
| Realtime пересчёт в модалке лагает на дешёвых машинах | UX ухудшается | Low | `useWatch` с конкретными полями + `useMemo` для `calculatePricing`; если всё равно медленно — debounce 50ms |
| Seller скидка + СПП + клуб = отрицательный sellerPrice | NaN в outputs | Low | Guard `Math.max(0, price)` в `calculatePricing` |
| Пользователь меняет ставку → revalidate всей страницы → долгий rerender | UX лаг | Medium | `revalidatePath` ТОЛЬКО после успешного сохранения ставки через debounced action; локальный state в `GlobalRatesBar` обновляется немедленно, `router.refresh()` async |
| Cascade delete WbCard → CalculatedPrice удаляется → пользователь теряет расчёты | Data loss | Low (пользователь сам удаляет) | Документировать в UI-копирайте; deferred — soft delete на CalculatedPrice |
| Excel-файл загружен до того как акция синкнута через API | `promo.type !== "auto"` check падает | Medium | UI: dropdown auto-акций берётся из уже sync-нутых, пустой dropdown → disabled submit + подсказка «сначала синхронизируйте акции» |

## Sources

### Primary (HIGH confidence)

- **Internal source files (verified by direct read):**
  - `CLAUDE.md` — стек, конвенции, WB API логика, RBAC
  - `README.md` — архитектура проекта
  - `prisma/schema.prisma` — текущая схема БД
  - `package.json` — доступные зависимости и версии
  - `lib/wb-api.ts` — существующие WB API функции и паттерны
  - `lib/rbac.ts`, `lib/sections.ts` — RBAC готов, `/prices` уже в routing
  - `app/api/wb-sync/route.ts` — sync pattern
  - `app/api/wb-commission-iu/route.ts` — Excel multipart pattern
  - `app/(dashboard)/cards/wb/page.tsx` — linkedNmIds паттерн
  - `components/cards/WbCardsTable.tsx` — широкая таблица, sticky, pagination
  - `components/cards/WbSyncButton.tsx`, `WbUploadIuButton.tsx` — кнопки-триггеры
  - `components/cards/CardsTabs.tsx` — WB/Ozon tabs
  - `components/users/UserDialog.tsx` — dialog + form pattern
  - `components/ui/dialog.tsx`, `table.tsx` — базовые shadcn компоненты
  - `components/layout/Sidebar.tsx` — `/prices` уже в nav
  - `prisma/migrations/20260406_add_wb_cards/migration.sql`, `20260407_add_commissions/migration.sql` — SQL паттерн миграций
  - `.planning/phases/07-prices-wb/07-CONTEXT.md` — source of truth по Decisions D-01..D-17
  - `.planning/phases/07-prices-wb/07-UI-SPEC.md` — визуальный контракт 6/6 PASS
  - `.planning/config.json` — `nyquist_validation: true`
  - `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`

### Secondary (MEDIUM confidence)

- **WB API documentation (mirror):**
  - https://github.com/DragonSigh/wildberries-api-docs/blob/master/promotion.md — подтверждает endpoints `/api/v1/calendar/promotions`, `/details`, `/nomenclatures`, `/upload`; rate limit 10/6сек; 422 специфичен для auto-акций (verified 2026-04-09)
- **WB API official:**
  - https://dev.wildberries.ru/en/swagger/promotion — Swagger API интерфейс (содержит актуальные схемы; web fetch не смог извлечь из-за SPA, но ссылка canonical)
  - https://dev.wildberries.ru/en/docs/openapi/promotion — документация раздела Campaigns

### Tertiary (LOW confidence — требуют валидации в Wave 0)

- Точный базовый URL для Promotions Calendar (`dp-calendar-api.wildberries.ru` vs другие subdomains) — training data + mirror docs дают разные варианты, требуется live проверка.
- Точные имена 30 колонок таблицы расчёта — canonical Excel файл существует, но заголовки я не читал программно. Wave 0 — прочитать и зафиксировать.
- Золотой test case точных промежуточных значений (2204₽ закупка, 44.08₽ брак, и т.д.) — взят из CONTEXT.md `<specifics>`, пользователь ввёл их из Excel, но формулы для получения должны быть выведены из ТЗ + Excel.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — всё проверено по `package.json` и существующим файлам проекта
- Architecture patterns: **HIGH** — все паттерны взяты напрямую из существующих файлов (`WbCardsTable`, `UserDialog`, `/api/wb-sync`, `/api/wb-commission-iu`)
- Pitfalls: **HIGH** — основаны на реальной боли проекта (CLAUDE.md): TLS fingerprint v4, base-ui Select ломается, native select convention
- WB Promotions API specifics: **MEDIUM** — endpoints и rate limit подтверждены по mirror docs, но точный base URL и точная форма request body требуют Wave 0 smoke test
- Formula correctness: **MEDIUM-LOW** — все формулы ДОЛЖНЫ выводиться из canonical Excel. Research не читал Excel программно. Planner MUST прочитать первым делом.
- Validation architecture: **HIGH** — рекомендация vitest + pure function тестирование. Единственный риск — проект не имеет test framework, нужна Wave 0 установка.

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (30 days — стабильный стек, WB API может поменяться — мониторить dev.wildberries.ru)

---

*Phase: 07-prices-wb*
*Research completed: 2026-04-09*
