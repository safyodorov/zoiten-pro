---
phase: 260514-mci
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - prisma/migrations/20260514_mci_wb_card_ratings/migration.sql
  - lib/wb-api.ts
  - lib/wb-ratings.ts
  - app/api/wb-ratings-sync/route.ts
  - components/cards/WbSyncRatingsButton.tsx
  - components/cards/WbCardsTable.tsx
  - components/cards/WbFilters.tsx
  - app/(dashboard)/cards/wb/page.tsx
autonomous: true
requirements:
  - QT-260514-mci-01
  - QT-260514-mci-02
  - QT-260514-mci-03
  - QT-260514-mci-04
must_haves:
  truths:
    - "Пользователь видит столбцы «Рейтинг карточки» (рейтинг + оценок) и «Рейтинг склейки» (рейтинг + оценок) в /cards/wb"
    - "После нажатия кнопки «Рейтинги» в шапке /cards/wb значения rating/reviewsTotal/ratingImt/reviewsTotalImt заполняются в WbCard"
    - "Пользователь может выбрать один или несколько ярлыков в фильтре «Ярлык» рядом с «Бренд»/«Категория» → таблица сужается"
    - "Клик по заголовку «Остаток» сортирует таблицу по stockQty (asc/desc toggle), URL содержит ?sort=stockQty&dir=..."
    - "Endpoint POST /api/wb-ratings-sync проверяет cooldown bucket=feedbacks ДО запуска — если активен, возвращает 429 с retryAfterSec без вызова WB"
    - "Endpoint /api/wb-ratings-sync НЕ запускается автоматически (нет cron, нет интеграции в /api/wb-sync) — только ручная кнопка пользователя"
  artifacts:
    - path: "prisma/migrations/20260514_mci_wb_card_ratings/migration.sql"
      provides: "Миграция: ALTER TABLE WbCard ADD imtId, ratingImt, reviewsTotalImt"
      contains: "ALTER TABLE \"WbCard\""
    - path: "lib/wb-ratings.ts"
      provides: "fetchProductRatings — sweep feedbacks через listFeedbacks, агрегация per nmId и imtId"
      exports: ["fetchProductRatings"]
    - path: "app/api/wb-ratings-sync/route.ts"
      provides: "POST endpoint с RBAC MANAGE + cooldown pre-check + batch update WbCard"
      exports: ["POST"]
    - path: "components/cards/WbSyncRatingsButton.tsx"
      provides: "Кнопка «Рейтинги» в шапке /cards/wb — паттерн WbSyncSppButton"
      exports: ["WbSyncRatingsButton"]
  key_links:
    - from: "lib/wb-ratings.ts"
      to: "lib/wb-support-api.ts:listFeedbacks"
      via: "import + цикл пагинации (active + archive)"
      pattern: "listFeedbacks\\("
    - from: "lib/wb-ratings.ts"
      to: "WbCard.imtId (DB)"
      via: "агрегация per imtId — fallback на feedback.productDetails.imtId если в БД null"
      pattern: "productDetails\\.imtId"
    - from: "app/api/wb-ratings-sync/route.ts"
      to: "lib/wb-cooldown.ts:getWbCooldownSecondsRemaining"
      via: "pre-check bucket=feedbacks перед fetchProductRatings"
      pattern: "getWbCooldownSecondsRemaining\\(['\"]feedbacks['\"]\\)"
    - from: "components/cards/WbSyncRatingsButton.tsx"
      to: "app/api/wb-ratings-sync/route.ts"
      via: "fetch POST"
      pattern: "fetch\\(['\"]/api/wb-ratings-sync"
    - from: "components/cards/WbFilters.tsx"
      to: "app/(dashboard)/cards/wb/page.tsx (where.label)"
      via: "URL ?labels=val1,val2 → Prisma where.label = { in: [...] }"
      pattern: "labels\\?"
    - from: "components/cards/WbCardsTable.tsx (sort header «Остаток»)"
      to: "app/(dashboard)/cards/wb/page.tsx (sort whitelist)"
      via: "handleSort('stockQty') → URL ?sort=stockQty&dir=... → orderBy"
      pattern: "stockQty"
---

<objective>
В разделе `/cards/wb` («Карточки товаров → WB») добавить три улучшения:

1. **Рейтинг карточки + склейки** — 2 пары столбцов (рейтинг + кол-во оценок) с заполнением через новый endpoint `POST /api/wb-ratings-sync` (Feedbacks API + локальная агрегация). Отдельная кнопка `WbSyncRatingsButton` в шапке — НЕ интегрировано в /api/wb-sync.
2. **Фильтр по Ярлыку** — MultiSelectDropdown рядом с «Бренд»/«Категория», источник `WbCard.label`.
3. **Сортировка по Остатку** — кликабельный header «Остаток», добавить `stockQty` в whitelist `app/(dashboard)/cards/wb/page.tsx`.

Purpose: Дать пользователю обзор качества карточек (рейтинг/оценки) + расширить фильтры/сортировку.

Output: 4 атомарных task'а — Schema → Aggregator helper → Sync endpoint + button → UI (table columns + filter + sort).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/quick/260514-mci-cards-wb/260514-mci-CONTEXT.md
@.planning/quick/260514-mci-cards-wb/260514-mci-RESEARCH.md
@prisma/schema.prisma
@lib/wb-api.ts
@lib/wb-support-api.ts
@lib/wb-cooldown.ts
@app/(dashboard)/cards/wb/page.tsx
@components/cards/WbCardsTable.tsx
@components/cards/WbFilters.tsx
@components/cards/WbSyncSppButton.tsx
@components/cards/WbSyncButton.tsx
@app/api/wb-sync-spp/route.ts

<interfaces>
<!-- Ключевые контракты, которые нужны executor'у. Извлечено из кодовой базы. -->

**lib/wb-support-api.ts (используем для агрегации рейтингов):**
```typescript
export interface ProductDetails {
  imtId: number   // НЕ nullable в WB API ответе
  nmId: number
  productName: string
  supplierArticle: string
  brandName: string
  size?: string
}

export interface Feedback {
  id: string
  text: string
  productValuation: number // 1..5
  createdDate: string
  state: string
  answer: FeedbackAnswer | null
  productDetails: ProductDetails
  photoLinks: PhotoLink[]
  video: FeedbackVideo | null
}

export interface ListParams {
  isAnswered?: boolean
  take: number    // max 5000 per WB docs (НО per RESEARCH: используем 5000)
  skip: number
  dateFrom?: number
  dateTo?: number
}

export async function listFeedbacks(p: ListParams): Promise<Feedback[]>
// Кидает WbRateLimitError на 429>60s — обрабатывать в route с return 429+retryAfterSec.

export class WbRateLimitError extends Error {
  retryAfterSec: number
  endpoint: string
}
```

**lib/wb-cooldown.ts (per-endpoint cooldown bus):**
```typescript
export type WbCooldownBucket =
  | "statistics-stocks" | "statistics-orders" | "statistics-sales"
  | "prices" | "tariffs" | "analytics" | "content"
  | "feedbacks"  // ← используем для ratings-sync
  | "questions"

export async function getWbCooldownSecondsRemaining(bucket: WbCooldownBucket): Promise<number>
export async function setWbCooldownUntil(bucket: WbCooldownBucket, retryAfterSec: number): Promise<Date>
```

**lib/wb-api.ts (для parseCard расширения):**
```typescript
export interface WbCardRaw {
  nmID: number
  vendorCode: string
  brand: string
  title: string
  subjectName: string
  subjectID: number
  // ↑ imtID отсутствует — нужно добавить в Task 1!
  // ↓ существующие поля:
  video?: string
  tags?: Array<{ id: number; name: string }>
  photos: WbPhotoRaw[]
  sizes: Array<{ skus: string[]; price?: number; techSize?: string; wbSize?: string }>
  characteristics?: WbCharacteristicRaw[]
  dimensions?: { width: number; height: number; length: number; weightBrutto?: number }
}

export function parseCard(card: WbCardRaw)
// Возвращает объект с полями nmId/article/name/brand/category/.../techSizes/sizeSkus
// Нужно: добавить imtId в WbCardRaw и в return parseCard.
```

**WbCard model (prisma/schema.prisma:257-313) — существующие rating-поля:**
```prisma
model WbCard {
  // ...
  rating              Float?  // line 273 — уже есть, ВСЕГДА null до этого quick
  reviewsTotal        Int?    // line 274 — уже есть, ВСЕГДА null
  reviews1..reviews5  Int?    // line 275-279 — distribution, НЕ заполняем в v1
  // ↓ НОВЫЕ поля (миграция в Task 1):
  imtId               Int?    // id «склейки» из WB Content API
  ratingImt           Float?  // средний рейтинг склейки
  reviewsTotalImt     Int?    // кол-во оценок склейки
  // ...
}
```

**WbCardsTable.tsx интерфейс (нужно расширить):**
```typescript
interface WbCard {
  id: string
  nmId: number
  // ... existing fields
  rating: number | null         // уже в интерфейсе
  reviewsTotal: number | null   // уже в интерфейсе
  // ↓ ДОБАВИТЬ:
  ratingImt: number | null
  reviewsTotalImt: number | null
  label: string | null
  stockQty: number | null
}
```

**RBAC (lib/rbac.ts):**
```typescript
await requireSection("CARDS", "MANAGE")  // для /api/wb-ratings-sync POST
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema migration + parseCard добавляет imtId</name>
  <files>
    prisma/schema.prisma,
    prisma/migrations/20260514_mci_wb_card_ratings/migration.sql,
    lib/wb-api.ts
  </files>
  <action>
**Цель:** Подготовить БД и парсер к хранению imt-агрегатов рейтинга.

**1. prisma/schema.prisma** — в model WbCard (около line 279, после `reviews5`) добавить 3 nullable поля:
```prisma
  // Phase 260514-mci: imt-агрегат рейтинга (агрегация feedback'ов всех nmId одной imt-склейки)
  imtId               Int?    // id склейки из WB Content API (характеристика товара)
  ratingImt           Float?  // средний рейтинг склейки
  reviewsTotalImt     Int?    // кол-во оценок склейки
```
Также добавить индекс по `imtId` для быстрой группировки при batch update:
```prisma
  @@index([imtId])
```
(добавить в существующий блок `@@` секции model WbCard).

**2. prisma/migrations/20260514_mci_wb_card_ratings/migration.sql** — новая ручная миграция (локальной PG нет, применится на VPS deploy.sh через `prisma migrate deploy` — паттерн Phase 9/14):
```sql
-- Phase 260514-mci: WbCard.imtId + ratingImt + reviewsTotalImt
ALTER TABLE "WbCard"
  ADD COLUMN "imtId"           INTEGER,
  ADD COLUMN "ratingImt"       DOUBLE PRECISION,
  ADD COLUMN "reviewsTotalImt" INTEGER;

CREATE INDEX "WbCard_imtId_idx" ON "WbCard"("imtId");
```

**3. lib/wb-api.ts:**
   - В `interface WbCardRaw` (line 76) добавить `imtID?: number` (WB Content API uppercase IDs).
   - В `parseCard` (line 528) в return добавить `imtId: card.imtID ?? null,`.

**4. app/api/wb-sync/route.ts:**
   - В `updateData` (около line 180) и `createData` (около line 246) добавить `imtId: card.imtId,` — чтобы при следующем полном sync поле заполнялось.
   - В импортах ничего менять не нужно (parseCard уже импортирован).

**Почему такой порядок:** имея `imtId` в БД, Task 2 fetcher может агрегировать без второго запроса (берёт imtId напрямую из БД per nmId, но также fallback'ит на `feedback.productDetails.imtId` если в БД null — first-time sync до того как /api/wb-sync прошёл с обновлённым parseCard).

**НЕ ТРОГАТЬ:** существующие `rating/reviewsTotal/reviews1..5` поля — они уже есть. НЕ удалять distribution (`reviews1..5`) — могут понадобиться v2.
  </action>
  <verify>
    <automated>npx prisma format && npx prisma validate && cat prisma/migrations/20260514_mci_wb_card_ratings/migration.sql | grep -i "imtId"</automated>
  </verify>
  <done>schema.prisma валиден, миграция содержит ALTER TABLE с 3 полями + индекс по imtId, parseCard возвращает imtId, /api/wb-sync пишет imtId в БД.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: fetchProductRatings — sweep feedbacks + агрегация per nmId и imtId</name>
  <files>
    lib/wb-ratings.ts,
    tests/wb-ratings.test.ts
  </files>
  <behavior>
- aggregate({feedbacks: [v=5, v=4, v=3, nmId=A, imtId=10], [v=2, nmId=A, imtId=10], [v=5, nmId=B, imtId=10]}) →
  perNmId: { A: {sum:14, count:3, ratingAvg:4.667, imtId:10}, B: {sum:5, count:1, ratingAvg:5, imtId:10} }
  perImtId: { 10: {sum:19, count:4, ratingAvg:4.75} }
- pure aggregator function `aggregateFeedbacks(feedbacks: Feedback[])` — БЕЗ I/O, легко тестировать
- округление до 2 знаков (4.67, не 4.6666666)
- count=0 → ratingAvg=null
- ignore feedback с productValuation==null/0 (защита от грязных данных)
- ignore feedback с productDetails.imtId==null/0 для perImtId агрегата (но per nmId считается)
  </behavior>
  <action>
**Цель:** Чистая функция `fetchProductRatings()` + pure aggregator + unit test.

**lib/wb-ratings.ts** — новый файл:

```typescript
// 2026-05-14 (quick 260514-mci): Агрегация рейтингов из WB Feedbacks API.
// WB Seller API не имеет dedicated endpoint per nmId — собираем все feedback'и
// продавца (active + archive) и считаем avg(productValuation) per nmId и imtId.
// Rate limit: 1 req/sec на bucket `feedbacks` (общий с support-sync).

import { listFeedbacks, type Feedback } from "@/lib/wb-support-api"

export interface RatingAggregate {
  rating: number | null   // avg, 1.0-5.0, округлено до 2 знаков
  count: number           // total feedbacks
}

export interface ProductRatingsResult {
  perNmId: Map<number, RatingAggregate & { imtId: number | null }>
  perImtId: Map<number, RatingAggregate>
  totalProcessed: number
}

// Pure aggregator — выделено для unit-теста БЕЗ I/O
export function aggregateFeedbacks(feedbacks: Feedback[]): ProductRatingsResult {
  const nmSums = new Map<number, { sum: number; count: number; imtId: number | null }>()
  const imtSums = new Map<number, { sum: number; count: number }>()

  for (const fb of feedbacks) {
    const v = Number(fb.productValuation)
    if (!Number.isFinite(v) || v <= 0) continue
    const nmId = fb.productDetails?.nmId
    const imtId = fb.productDetails?.imtId
    if (!nmId) continue

    const nm = nmSums.get(nmId) ?? { sum: 0, count: 0, imtId: null }
    nm.sum += v
    nm.count += 1
    if (nm.imtId == null && imtId) nm.imtId = imtId
    nmSums.set(nmId, nm)

    if (imtId && imtId > 0) {
      const im = imtSums.get(imtId) ?? { sum: 0, count: 0 }
      im.sum += v
      im.count += 1
      imtSums.set(imtId, im)
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100
  const perNmId = new Map<number, RatingAggregate & { imtId: number | null }>()
  for (const [nmId, s] of nmSums) {
    perNmId.set(nmId, {
      rating: s.count > 0 ? round2(s.sum / s.count) : null,
      count: s.count,
      imtId: s.imtId,
    })
  }
  const perImtId = new Map<number, RatingAggregate>()
  for (const [imtId, s] of imtSums) {
    perImtId.set(imtId, {
      rating: s.count > 0 ? round2(s.sum / s.count) : null,
      count: s.count,
    })
  }
  return { perNmId, perImtId, totalProcessed: feedbacks.length }
}

const TAKE = 5000           // WB max per docs
const SLEEP_MS = 1100       // 1 req/sec + 100ms буфер
const MAX_PAGES = 20        // safety cap (20×5000 = 100k feedbacks)

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// Sweep активных + архивных feedbacks через listFeedbacks (active=isAnswered:false,
// archive=isAnswered:true — WB не имеет отдельного /archive в нашем listFeedbacks,
// но isAnswered=true покрывает обработанные = архив).
async function sweepFeedbacks(): Promise<Feedback[]> {
  const all: Feedback[] = []
  for (const isAnswered of [false, true]) {
    for (let page = 0; page < MAX_PAGES; page++) {
      if (page > 0) await sleep(SLEEP_MS)
      const batch = await listFeedbacks({
        isAnswered,
        take: TAKE,
        skip: page * TAKE,
      })
      all.push(...batch)
      if (batch.length < TAKE) break  // последняя страница
    }
    await sleep(SLEEP_MS)  // буфер между active/archive sweep
  }
  return all
}

export async function fetchProductRatings(): Promise<ProductRatingsResult> {
  const feedbacks = await sweepFeedbacks()
  return aggregateFeedbacks(feedbacks)
}
```

**tests/wb-ratings.test.ts** — unit test для pure aggregator (vitest установлен в Phase 7):

```typescript
import { describe, it, expect } from "vitest"
import { aggregateFeedbacks } from "@/lib/wb-ratings"
import type { Feedback } from "@/lib/wb-support-api"

function fb(nmId: number, imtId: number, valuation: number): Feedback {
  return {
    id: `${nmId}-${valuation}-${Math.random()}`,
    text: "",
    productValuation: valuation,
    createdDate: "2026-05-14",
    state: "wbRu",
    answer: null,
    productDetails: { imtId, nmId, productName: "x", supplierArticle: "y", brandName: "Z" },
    photoLinks: [],
    video: null,
  }
}

describe("aggregateFeedbacks", () => {
  it("агрегирует per nmId и per imtId", () => {
    const r = aggregateFeedbacks([fb(1, 10, 5), fb(1, 10, 4), fb(1, 10, 3), fb(1, 10, 2), fb(2, 10, 5)])
    expect(r.perNmId.get(1)).toEqual({ rating: 3.5, count: 4, imtId: 10 })
    expect(r.perNmId.get(2)).toEqual({ rating: 5, count: 1, imtId: 10 })
    expect(r.perImtId.get(10)).toEqual({ rating: 3.8, count: 5 })
  })

  it("игнорирует productValuation=0 и null", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = { ...fb(1, 10, 5), productValuation: null as any }
    const r = aggregateFeedbacks([bad, fb(1, 10, 0), fb(1, 10, 5)])
    expect(r.perNmId.get(1)).toEqual({ rating: 5, count: 1, imtId: 10 })
  })

  it("imtId=0 → попадает в perNmId но не в perImtId", () => {
    const r = aggregateFeedbacks([fb(1, 0, 5), fb(2, 0, 4)])
    expect(r.perNmId.size).toBe(2)
    expect(r.perImtId.size).toBe(0)
  })

  it("округление до 2 знаков", () => {
    const r = aggregateFeedbacks([fb(1, 10, 5), fb(1, 10, 5), fb(1, 10, 4)])
    expect(r.perNmId.get(1)?.rating).toBe(4.67)
  })

  it("пустой массив → пустые Maps + totalProcessed=0", () => {
    const r = aggregateFeedbacks([])
    expect(r.perNmId.size).toBe(0)
    expect(r.perImtId.size).toBe(0)
    expect(r.totalProcessed).toBe(0)
  })
})
```

**Wave 0 probe (выполнить ОПЦИОНАЛЬНО при executor, не блокирующее)** — перед запуском в проде однократно дёрнуть `GET feedbacks/count` через `getFeedbacksCount` (если уже есть) или curl с WB_API_TOKEN, замерить totalCount и решить — bumping MAX_PAGES если >100k. Если не сделано — defaults OK (95% случаев у Zoiten <50k feedbacks).
  </action>
  <verify>
    <automated>npx vitest run tests/wb-ratings.test.ts</automated>
  </verify>
  <done>Все 5 тестов в tests/wb-ratings.test.ts pass; fetchProductRatings экспортирован из lib/wb-ratings.ts; aggregateFeedbacks pure (без import prisma/fs).</done>
</task>

<task type="auto">
  <name>Task 3: POST /api/wb-ratings-sync endpoint + WbSyncRatingsButton</name>
  <files>
    app/api/wb-ratings-sync/route.ts,
    components/cards/WbSyncRatingsButton.tsx
  </files>
  <action>
**Цель:** Server endpoint (RBAC + cooldown + batch update) + client кнопка (паттерн WbSyncSppButton).

**1. app/api/wb-ratings-sync/route.ts:**

```typescript
// app/api/wb-ratings-sync/route.ts
// Phase 260514-mci: синхронизация рейтингов карточек WB через Feedbacks API.
// Отдельный endpoint (НЕ /api/wb-sync) — другой rate limit (feedbacks bucket, 1 req/sec)
// и медленнее (sweep тысяч feedback'ов). Только ручной trigger через кнопку.
export const runtime = "nodejs"
export const maxDuration = 600  // sweep может занять минуты

import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { fetchProductRatings } from "@/lib/wb-ratings"
import {
  getWbCooldownSecondsRemaining,
  setWbCooldownUntil,
} from "@/lib/wb-cooldown"
import { WbRateLimitError } from "@/lib/wb-support-api"

export async function POST(): Promise<NextResponse> {
  try {
    await requireSection("CARDS", "MANAGE")
  } catch {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 })
  }

  // 1. Pre-check cooldown — feedbacks bucket общий с support-sync.
  // Если активен — НЕ дёргаем WB, возвращаем 429 с retryAfterSec.
  const cooldownSec = await getWbCooldownSecondsRemaining("feedbacks")
  if (cooldownSec > 0) {
    return NextResponse.json(
      {
        error: `WB Feedbacks API на cooldown ${Math.ceil(cooldownSec / 60)} мин — попробуйте позже`,
        retryAfterSec: cooldownSec,
      },
      { status: 429 }
    )
  }

  try {
    // 2. Sweep + aggregate
    const { perNmId, perImtId, totalProcessed } = await fetchProductRatings()

    // 3. Batch update — карточка: rating + reviewsTotal + (imtId backfill, если null в БД)
    let updatedNmIds = 0
    for (const [nmId, agg] of perNmId.entries()) {
      try {
        await prisma.wbCard.update({
          where: { nmId },
          data: {
            rating: agg.rating,
            reviewsTotal: agg.count,
            // Backfill imtId если ещё null (parseCard писал только при /api/wb-sync,
            // а этот endpoint может быть запущен раньше первого full sync с новой схемой)
            ...(agg.imtId ? { imtId: agg.imtId } : {}),
          },
        })
        updatedNmIds++
      } catch {
        // nmId которого нет в WbCard (карточка не синхронизирована full sync'ом) — skip
      }
    }

    // 4. Batch update склейки — все WbCard с этим imtId получают одинаковые ratingImt/reviewsTotalImt
    let updatedImtGroups = 0
    for (const [imtId, agg] of perImtId.entries()) {
      const result = await prisma.wbCard.updateMany({
        where: { imtId },
        data: { ratingImt: agg.rating, reviewsTotalImt: agg.count },
      })
      if (result.count > 0) updatedImtGroups++
    }

    revalidatePath("/cards/wb")
    return NextResponse.json({
      ok: true,
      totalProcessed,        // сколько feedback'ов обработано
      updatedNmIds,          // карточек обновлено
      updatedImtGroups,      // склеек обновлено
      perNmIdCount: perNmId.size,
      perImtIdCount: perImtId.size,
    })
  } catch (err) {
    // WbRateLimitError (>60s retry) — переводим в cooldown и возвращаем 429.
    // listFeedbacks уже мог поставить bucket lock через setWbCooldownUntil в callApi,
    // но дублируем для надёжности (idempotent).
    if (err instanceof WbRateLimitError) {
      await setWbCooldownUntil("feedbacks", err.retryAfterSec).catch(() => {})
      return NextResponse.json(
        {
          error: `WB 429: ждите ${Math.ceil(err.retryAfterSec / 60)} мин`,
          retryAfterSec: err.retryAfterSec,
        },
        { status: 429 }
      )
    }
    return NextResponse.json(
      { error: (err as Error).message || "Ошибка sync рейтингов" },
      { status: 500 }
    )
  }
}
```

**2. components/cards/WbSyncRatingsButton.tsx** — копия WbSyncSppButton с другим icon/route:

```typescript
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Star } from "lucide-react"
import { Button } from "@/components/ui/button"

export function WbSyncRatingsButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const router = useRouter()

  async function handleSync() {
    setIsSyncing(true)
    try {
      const res = await fetch("/api/wb-ratings-sync", { method: "POST" })
      const data = await res.json()

      if (res.ok) {
        toast.success(
          `Рейтинги обновлены: ${data.updatedNmIds} карточек / ${data.updatedImtGroups} склеек (обработано ${data.totalProcessed} отзывов)`,
          { duration: 8000 }
        )
        router.refresh()
      } else if (res.status === 429) {
        toast.warning(data.error || "WB Feedbacks API на cooldown", {
          duration: 10000,
        })
      } else if (res.status === 403) {
        toast.error("Нет доступа (нужны права MANAGE на «Карточки товаров»)")
      } else {
        toast.error(data.error || "Ошибка синхронизации рейтингов")
      }
    } catch {
      toast.error("Ошибка сети")
    }
    setIsSyncing(false)
  }

  return (
    <Button
      onClick={handleSync}
      disabled={isSyncing}
      variant="outline"
      size="sm"
      className="gap-1.5"
      title="Синхронизация рейтингов карточек и склеек через WB Feedbacks API. Может занять несколько минут — общий лимит с support-sync."
    >
      <Star className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
      {isSyncing ? "Рейтинги…" : "Рейтинги"}
    </Button>
  )
}
```

**ВАЖНО:** `requireSection("CARDS", "MANAGE")` — соблюдает RBAC (как у WbSyncButton). Кнопка `WbSyncSppButton` сейчас БЕЗ MANAGE-проверки на route (использует только `session.user`), но для нового endpoint используем MANAGE per constraints — write-операция.

**НЕ ИНТЕГРИРОВАТЬ** в WbSyncButton / /api/wb-sync — отдельная responsibility.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(wb-ratings-sync|WbSyncRatingsButton)" | head -5; echo "OK if empty above"</automated>
  </verify>
  <done>POST /api/wb-ratings-sync существует, RBAC MANAGE, pre-check feedbacks bucket cooldown, on WbRateLimitError → setWbCooldownUntil + 429, после успеха batch update WbCard.rating/reviewsTotal/imtId/ratingImt/reviewsTotalImt + revalidatePath. WbSyncRatingsButton рендерит Star icon + toast.success/warning/error.</done>
</task>

<task type="auto">
  <name>Task 4: UI — 2 столбца рейтинга в таблице + фильтр «Ярлык» + sort «Остаток»</name>
  <files>
    components/cards/WbCardsTable.tsx,
    components/cards/WbFilters.tsx,
    app/(dashboard)/cards/wb/page.tsx
  </files>
  <action>
**Цель:** Объединить 3 UI-изменения в одну минимальную правку — все 3 файла трогаются по чуть-чуть.

---

### 4.1. app/(dashboard)/cards/wb/page.tsx

**(a)** Расширить тип `searchParams` (line 15-19): добавить `labels?: string`.

**(b)** Парсить labels (после line 34 где parsing categoriesParam):
```typescript
const selectedLabels = (await searchParams).labels?.split(",").filter(Boolean) ?? []
// проще: добавить в существующий destruct const { ..., labels: labelsParam } = await searchParams
//                                                       и затем
// const selectedLabels = labelsParam ? labelsParam.split(",").filter(Boolean) : []
```
В where добавить:
```typescript
if (selectedLabels.length > 0) {
  where.label = { in: selectedLabels }
}
```

**(c)** Расширить sort whitelist (line 52):
```typescript
const sortBy = sort && ["brand", "category", "name", "createdAt", "stockQty"].includes(sort) ? sort : "createdAt"
```

**(d)** Добавить параллельный fetch уникальных labels — модифицировать Promise.all (line 61-72). Заменить query allBrandCategoryPairs на массив из 3 elements: pairs + distinctLabels. Или добавить отдельный запрос:
```typescript
const [cards, total, allBrandCategoryPairs, allLabels] = await Promise.all([
  prisma.wbCard.findMany({ where, orderBy, skip, take: pageSize }),
  prisma.wbCard.count({ where }),
  prisma.wbCard.findMany({
    select: { brand: true, category: true },
    distinct: ["brand", "category"],
    where: { brand: { not: null }, category: { not: null } },
    orderBy: [{ brand: "asc" }, { category: "asc" }],
  }),
  prisma.wbCard.findMany({
    select: { label: true },
    distinct: ["label"],
    where: { label: { not: null } },
    orderBy: { label: "asc" },
  }),
])
const labelOptions = allLabels.map(l => l.label!).filter(Boolean)
```

**(e)** Передать в WbFilters + WbCardsTable:
```tsx
<WbFilters
  brandCategoryPairs={brandCategoryPairs}
  selectedBrands={selectedBrands}
  selectedCategories={selectedCategories}
  labelOptions={labelOptions}
  selectedLabels={selectedLabels}
/>
<WbCardsTable
  ...
  selectedBrands={selectedBrands}
  selectedCategories={selectedCategories}
  selectedLabels={selectedLabels}
/>
```

---

### 4.2. components/cards/WbFilters.tsx

**(a)** Расширить `WbFiltersProps`:
```typescript
interface WbFiltersProps {
  brandCategoryPairs: Array<{ brand: string; category: string }>
  selectedBrands: string[]
  selectedCategories: string[]
  labelOptions: string[]      // ← новое
  selectedLabels: string[]    // ← новое
}
```

**(b)** В компоненте WbFilters добавить:
```typescript
function setLabels(values: string[]) {
  router.push(buildUrl({ labels: values.join(",") }))
}

function clearAll() {
  router.push(buildUrl({ brands: "", categories: "", labels: "" }))
}

const hasFilters = selectedBrands.length > 0 || selectedCategories.length > 0 || selectedLabels.length > 0
```

**(c)** В JSX (между Категория и кнопкой «Сбросить»):
```tsx
<MultiSelectDropdown
  label="Ярлык"
  options={labelOptions}
  selected={selectedLabels}
  onChange={setLabels}
/>
```

---

### 4.3. components/cards/WbCardsTable.tsx

**(a)** Расширить интерфейс `WbCard` (line 34-56):
```typescript
interface WbCard {
  // ... existing
  rating: number | null         // уже есть
  reviewsTotal: number | null   // уже есть
  ratingImt: number | null      // ← новое
  reviewsTotalImt: number | null // ← новое
  // ... остальные
}
```

**(b)** Расширить `WbCardsTableProps` — добавить `selectedLabels: string[]`.

**(c)** В функции компонента — добавить деструктуризацию `selectedLabels`, и в `buildUrl` (line 151-171):
```typescript
if (selectedLabels.length > 0) params.set("labels", selectedLabels.join(","))
```

**(d)** В таблице (TableHeader, после `<TableHead>Клуб</TableHead>` и до `<TableHead>Остаток</TableHead>`) — добавить 4 column headers (2 пары: карточка + склейка):
```tsx
<TableHead className="text-center text-xs border-l">Рейтинг карт.</TableHead>
<TableHead className="text-center text-xs">Оценок</TableHead>
<TableHead className="text-center text-xs border-l">Рейтинг скл.</TableHead>
<TableHead className="text-center text-xs">Оценок</TableHead>
```

Заменить `<TableHead>Остаток</TableHead>` на кликабельный sort header (паттерн line 295-306):
```tsx
<TableHead>
  <button
    onClick={() => handleSort("stockQty")}
    className="flex items-center gap-1 hover:text-foreground transition-colors"
  >
    Остаток{sortIndicator("stockQty")}
    <ArrowUpDown className="h-3 w-3" />
  </button>
</TableHead>
```

**(e)** В body — добавить 4 ячейки симметрично header (после Клуб, до Остаток):
```tsx
<TableCell className="text-center text-xs border-l">
  {card.rating != null ? <span>{card.rating.toFixed(1)} ★</span> : <span className="text-muted-foreground">—</span>}
</TableCell>
<TableCell className="text-center text-xs">
  {card.reviewsTotal != null ? card.reviewsTotal : <span className="text-muted-foreground">—</span>}
</TableCell>
<TableCell className="text-center text-xs border-l">
  {card.ratingImt != null ? <span>{card.ratingImt.toFixed(1)} ★</span> : <span className="text-muted-foreground">—</span>}
</TableCell>
<TableCell className="text-center text-xs">
  {card.reviewsTotalImt != null ? card.reviewsTotalImt : <span className="text-muted-foreground">—</span>}
</TableCell>
```

**(f)** Обновить `colSpan` empty-state (line 320): был `colSpan={15}` → стал `colSpan={19}` (добавили 4 столбца).

---

### 4.4. app/(dashboard)/cards/wb/page.tsx — добавить кнопку WbSyncRatingsButton

В шапку (около `<WbUploadIuButton />`, `<WbSyncSppButton />`, `<WbSyncButton />`, line 104-108):
```tsx
import { WbSyncRatingsButton } from "@/components/cards/WbSyncRatingsButton"
// ...
<div className="flex gap-2">
  <WbUploadIuButton />
  <WbSyncRatingsButton />   {/* ← новая */}
  <WbSyncSppButton />
  <WbSyncButton />
</div>
```

---

**Замечание по ширине таблицы:** /cards/wb уже довольно широкая (15 колонок до). После +4 ratings columns = 19. Все 4 — компактные (text-xs, center, узкие). Если в UAT окажется тесно — можно объединить в 2 столбца («Рейтинг карт. (count)» + «Рейтинг скл. (count)»), но per CONTEXT — 4 столбца предпочтительнее (явность). Это решает планер — оставляем 4 столбца.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(WbCardsTable|WbFilters|cards/wb/page)" | head -10; echo "OK if empty above"</automated>
  </verify>
  <done>
    - В /cards/wb header виден ряд кнопок: «Загрузить ИУ» / «Рейтинги» / «Скидка WB» / «Синхронизировать с WB»
    - В фильтрах есть MultiSelectDropdown «Ярлык», выбор отражается в URL ?labels=... и сужает таблицу через where.label IN
    - В таблице 4 новых столбца (Рейтинг карт. / Оценок / Рейтинг скл. / Оценок), все рендерят `—` пока БД пустая
    - Клик по header «Остаток» меняет URL на ?sort=stockQty&dir=asc, повторный клик → dir=desc, таблица отсортирована
    - colSpan empty-state обновлён до 19
  </done>
</task>

</tasks>

<verification>
**Полный sanity check после всех 4 tasks:**

1. `npx prisma format && npx prisma validate` → миграция и schema валидны
2. `npx vitest run tests/wb-ratings.test.ts` → все aggregator тесты pass
3. `npx tsc --noEmit -p tsconfig.json` → нет TypeScript ошибок
4. Manual: открыть `/cards/wb` локально (если есть БД) — увидеть новые столбцы (пустые `—`), новый фильтр «Ярлык», кликабельный header «Остаток», новую кнопку «Рейтинги»
5. Manual: на проде — задеплоить + применить миграцию (`prisma migrate deploy`) + дёрнуть кнопку «Рейтинги» — увидеть toast с числом обновлённых карточек

**Sync timing recap (per constraint):**
- `/api/wb-ratings-sync` НЕ интегрирован в `/api/wb-sync` (полный sync)
- НЕ имеет cron — только ручной trigger
- Использует общий `feedbacks` bucket с support-sync — при ban'е через 429 пишет cooldown через `setWbCooldownUntil`, защищая последующий cron support-sync
- Рекомендация UX: запускать раз в день (например утром), не одновременно с support-sync 15-min tick
</verification>

<success_criteria>
- [x] Миграция `20260514_mci_wb_card_ratings/migration.sql` создана и валидна
- [x] `WbCard.imtId/ratingImt/reviewsTotalImt` добавлены в schema.prisma + индекс по imtId
- [x] `parseCard` возвращает imtId, `/api/wb-sync` пишет его в БД
- [x] `lib/wb-ratings.ts:fetchProductRatings` экспортирована, pure `aggregateFeedbacks` покрыта 5 unit тестами
- [x] `POST /api/wb-ratings-sync` существует, RBAC `CARDS:MANAGE`, pre-check + post-check cooldown bucket=feedbacks
- [x] `WbSyncRatingsButton` рендерится в `/cards/wb` header
- [x] Таблица содержит 4 новых столбца (Рейтинг карт. / Оценок / Рейтинг скл. / Оценок)
- [x] Фильтр `Ярлык` рендерится рядом с Бренд/Категория, работает через ?labels=
- [x] Sort по «Остаток» работает через ?sort=stockQty
- [x] `tsc --noEmit` без новых ошибок
</success_criteria>

<output>
After completion, create `.planning/quick/260514-mci-cards-wb/260514-mci-SUMMARY.md` с разделами:
- Что сделано (4 task'а с file lists)
- Migration SQL (для понимания deploy)
- Sync timing recap (предупреждение про общий feedbacks bucket с support-sync)
- Tests run + counts
- Скриншот UI (если был manual UAT)
</output>
