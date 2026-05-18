---
quick: 260518-igw
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/wb-support-api.ts
  - lib/support-sync.ts
  - prisma/schema.prisma
  - app/(dashboard)/prices/wb/page.tsx
  - components/prices/PriceCalculatorTable.tsx
  - lib/wb-api.ts
  - lib/wb-orders-chart.ts
  - app/api/cron/wb-orders-daily/route.ts
  - app/api/wb-orders-backfill/route.ts
  - tests/wb-card-orders-daily.test.ts
  - tests/wb-orders-chart-fill.test.ts
autonomous: true
requirements:
  - QUICK-260518-IGW-T1 (pinned-отзывы — diagnostic + integration if available, else documented skip)
  - QUICK-260518-IGW-T2 (UI rework /prices/wb expand — vertical reviews lanes справа от графика)
  - QUICK-260518-IGW-T3 (orders sync bug fix последние 7 дней + targeted 7d backfill endpoint)

must_haves:
  truths:
    - "Diagnostic raw WB Feedbacks API curl выполнен с проднового VPS; результат (есть/нет поле pinned) задокументирован в SUMMARY"
    - "Если pinned-поле найдено в official API → SupportTicket.isPinned заполняется при sync и отображается иконкой Pin в ReviewChip"
    - "Если поля нет → задача документирована как deferred в SUMMARY, остальные задачи выполнены без блокировки"
    - "Per-nmId блок в /prices/wb expand-панели рендерит chart + metadata-колонку справа + до двух вертикальных лент отзывов (Связка/Товар)"
    - "Каждая ReviewChip-лента стэкается вертикально (flex-col), пустая лента не рендерится"
    - "Diagnostic SQL: для test nmId (например 800750522) DB qty последних 7 дней сравнено с raw WB Orders API; root cause расхождения задокументирован"
    - "POST /api/wb-orders-backfill-7d (или расширение существующего endpoint) выполняет idempotent upsert последних 7 дней + возвращает {scanned, dates, inserted, updated}"
    - "После backfill re-проверка SQL подтверждает что DB qty соответствует WB API ground truth"
  artifacts:
    - path: "lib/wb-support-api.ts"
      provides: "Feedback interface расширена опциональными pinned-полями (если найдены в API)"
    - path: "components/prices/PriceCalculatorTable.tsx"
      provides: "NmIdLegend переписан под vertical layout (chart + metadata + 2 lanes справа)"
    - path: "app/(dashboard)/prices/wb/page.tsx"
      provides: "isPinned проброшен в FeedbackItem если schema поддерживает"
    - path: "app/api/wb-orders-backfill/route.ts"
      provides: "Расширен query param ?days=7 или новый endpoint /api/cron/wb-orders-backfill-7d"
  key_links:
    - from: "PriceCalculatorTable.tsx (NmIdLegend)"
      to: "page.tsx productNmIdsWithCharts.reviews"
      via: "props { byImt, byNmId } — сохраняется shape от quick 260518-h6p"
      pattern: "reviews\\.(byImt|byNmId)"
    - from: "wb-orders-daily cron"
      to: "fetchOrdersForRange"
      via: "после fix передаёт корректный dateFrom (вчера MSK 00:00) без двойного счёта today"
      pattern: "getMskYesterdayDate|dateFrom"

user_setup: []
---

<objective>
Три доработки за один quick task:

1. **WB Pinned-отзывы** — diagnostic + integration (если API даёт) ИЛИ documented skip
2. **UI rework /prices/wb expand** — лента отзывов перенесена с горизонтальной (под chart) на вертикальную (справа от chart), две колонки «По связке» / «По товару»
3. **Bug fix orders sync** — диагностика расхождения DB vs WB API за последние 7 дней, fix + targeted backfill endpoint

Purpose: довести до production-quality раздел /prices/wb (chart + reviews) + восстановить целостность orders timeline.

Output:
- `lib/wb-support-api.ts` / `lib/support-sync.ts` / `prisma/schema.prisma` (опционально, если pinned доступен)
- `components/prices/PriceCalculatorTable.tsx` + `app/(dashboard)/prices/wb/page.tsx` (UI rework)
- `lib/wb-api.ts` / `lib/wb-orders-chart.ts` / cron route / backfill endpoint (bug fix)
- Документация в SUMMARY: raw curl результаты, root cause orders bug, backfill instructions
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/260518-hz7-wb-feedbacks-sync-lib-support-sync-ts-su/260518-hz7-SUMMARY.md
@.planning/quick/260515-phv-cards-wb-fix-real-historical-prices-via-/260515-phv-SUMMARY.md
@.planning/quick/260518-h6p-prices-wb-expand-per-nmid-imtid-nmid-nmi/260518-h6p-SUMMARY.md

# Source files
@lib/wb-support-api.ts
@lib/support-sync.ts
@lib/wb-api.ts
@lib/wb-orders-chart.ts
@app/api/cron/wb-orders-daily/route.ts
@app/api/wb-orders-backfill/route.ts
@app/(dashboard)/prices/wb/page.tsx
@components/prices/PriceCalculatorTable.tsx

<interfaces>
<!-- Ключевые контракты, executor использует напрямую -->

### Feedback interface (lib/wb-support-api.ts:74-86)
```typescript
export interface Feedback {
  id: string
  text: string
  pros?: string
  cons?: string
  productValuation: number // 1..5
  createdDate: string
  state: string
  answer: FeedbackAnswer | null
  productDetails: ProductDetails
  photoLinks: PhotoLink[]
  video: FeedbackVideo | null
}
```
**После Task 1:** возможно добавятся `isPinned?: boolean`, `tags?: string[]` и т.п. — зависит от raw API output.

### SupportTicket (prisma/schema.prisma:705+)
- `rating Int?` — productValuation
- `nmId Int?` — связь с WbCard
- Поле `isPinned Boolean @default(false)` будет добавлено **только если** Task 1 раскопал поле в official API.

### NmIdLegend props (PriceCalculatorTable.tsx:568-583)
```typescript
function NmIdLegend({
  stockQty: number | null
  daysLeft: number | null
  rating: number | null
  reviewsTotal: number | null
  reviews: {
    byImt: Array<{ id: string; rating: number; text: string; createdAt: string }>
    byNmId: Array<{ id: string; rating: number; text: string; createdAt: string }>
  }
})
```
Shape после Task 1 (если pinned доступен): в каждый review добавится `isPinned?: boolean`.

### Текущий layout per-nmId блок (PriceCalculatorTable.tsx:1265-1290)
```tsx
<div className="flex flex-row flex-wrap gap-3 justify-start items-start p-3">
  {charts.map((c) => (
    <div key={c.nmId} className="flex flex-col gap-2">
      <WbCardOrdersChart nmId={c.nmId} timeSeries={c.timeSeries} />
      <NmIdLegend ... />
    </div>
  ))}
</div>
```
**После Task 2:** внутренний контейнер per-nmId меняется с `flex-col` на `flex-row` (chart слева, metadata + reviews справа vertically).

### fetchOrdersForRange (lib/wb-api.ts:1284-1375)
- `dateFrom` отправляется как `toISOString().split(".")[0]` = `"2026-04-01T00:00:00"` (без Z) — MSK интерпретация.
- `flag=0` — DELTA с dateFrom (returns ALL orders since dateFrom, **включая today**)
- `o.date.slice(0, 10)` — MSK date key (WB date без TZ)
- `existing.qty++` — каждый order = 1 (нет учёта `o.quantity`)
- Aggregation per `(nmId, dateKey)` → upsert через `upsertOrdersDaily`

### Daily cron (app/api/cron/wb-orders-daily/route.ts)
- При непустой таблице: `dateFrom = getMskYesterdayDate()` → fetchOrdersForRange → upsert
- `flag=0` returns orders since yesterday → **включая сегодняшний неполный день** (это и есть подозрение Task 3 root cause variant A)

### WbCardOrdersDaily schema (prisma/schema.prisma:1024-1041)
```
nmId Int, date DateTime @db.Date, qty Int, sellerPrice Int?, buyerPrice Int?, @@unique([nmId, date])
```

### Existing backfill endpoint (app/api/wb-orders-backfill/route.ts)
- POST, dual-gate: `x-cron-secret` header OR `requireSection("PRODUCTS", "MANAGE")`
- Без query params — backfill с фиксированной даты `BACKFILL_START = 2026-04-01`
- Возвращает `{ ok, dateFrom, rowsFetched, upserted }`

**Task 3 решение:** расширить query `?days=N` (опционально) — если задан, `dateFrom = today - N` MSK. Default остаётся 2026-04-01.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Diagnostic + integration pinned-отзывов WB (RESEARCH FIRST, conditional implementation)</name>
  <files>lib/wb-support-api.ts, lib/support-sync.ts, prisma/schema.prisma (CONDITIONAL), components/prices/PriceCalculatorTable.tsx (CONDITIONAL)</files>
  <action>
**Шаг 1 — Raw diagnostic curl (НЕ пропускать! результат влияет на implementation):**

```bash
ssh root@85.198.97.89 "source /etc/zoiten.pro.env && curl -sS -H \"Authorization: \$WB_API_TOKEN\" 'https://feedbacks-api.wildberries.ru/api/v1/feedbacks?isAnswered=true&take=5&skip=0'" | head -c 8000
```

Также повтор с `isAnswered=false`:
```bash
ssh root@85.198.97.89 "source /etc/zoiten.pro.env && curl -sS -H \"Authorization: \$WB_API_TOKEN\" 'https://feedbacks-api.wildberries.ru/api/v1/feedbacks?isAnswered=false&take=5&skip=0'" | head -c 8000
```

**Цель:** получить ПОЛНЫЙ сырой JSON одного feedback'а. Изучи каждое поле: возможны `isPinned`, `pinned`, `wasViewed`, `tags`, `kind`, `isMain`, `lastViewedDate`, `type`, `bables`, `topRating`. Сохрани raw JSON в SUMMARY (truncate до 5 примеров если большой).

**Шаг 2 — Decision tree:**

**Ветка A: official API возвращает явное pinned-поле** (`isPinned`, `pinned`, `isTop`, `pinnedAt` и т.п.):
1. Добавь `Feedback` interface расширение в `lib/wb-support-api.ts` (после строки 86). Точное имя поля — как в API.
2. Создай SQL миграцию `prisma/migrations/20260518_add_supportticket_ispinned/migration.sql`:
   ```sql
   ALTER TABLE "SupportTicket" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
   CREATE INDEX "SupportTicket_isPinned_idx" ON "SupportTicket"("isPinned");
   ```
3. Добавь поле в `prisma/schema.prisma`: `isPinned Boolean @default(false) @@index([isPinned])`. После `prisma generate` поле появится в client.
4. В `lib/support-sync.ts` найди upsert SupportTicket в `syncFeedbacks` — добавь `isPinned: fb.isPinned ?? false` в `create` и `update`.
5. В `app/(dashboard)/prices/wb/page.tsx` — добавь `isPinned` в `select` SupportTicket.findMany и проброс в FeedbackItem (рядом с rating/text/createdAt).
6. В `components/prices/PriceCalculatorTable.tsx` ReviewChip (~line 540) — добавь иконку `Pin` (12×12, `lucide-react`) рядом с цифрой звезды если `review.isPinned`. Sort: pinned первыми, потом по createdAt desc.
7. **Backfill:** расширь `app/api/cron/feedbacks-backfill-pros-cons/route.ts` — в loop добавь обновление `isPinned`, или создай отдельный `app/api/cron/feedbacks-backfill-pinned/route.ts` (паттерн 260518-hz7 — x-cron-secret + days query).

**Ветка B: official API НЕ возвращает pinned**:
1. Документируй в SUMMARY: "WB Feedbacks API не возвращает поле pinned. Проверены endpoints: isAnswered=true/false, take=5. Возможно поле доступно через buyer-side feedbacks2.wb.ru, но не приоритет v1."
2. **НЕ трогай** schema, support-sync, support-api types.
3. **НЕ трогай** ReviewChip (pinned-иконка не добавляется).
4. Сделай так чтобы Tasks 2 и 3 продолжали работать без блокировки.
5. Зафиксируй TODO в SUMMARY: "Если когда-то понадобится pinned — пробовать unofficial buyer endpoint `https://feedbacks2.wb.ru/feedbacks/v2/<imtId>` через curl на VPS (TLS fingerprint block в Node fetch — паттерн SPP из CLAUDE.md). Сейчас skipped."

**Шаг 3 — Commit:**
- Ветка A: `feat(quick-260518-igw): pinned-отзывы — schema + sync + UI Pin icon` (один или два коммита если разделено: schema separately)
- Ветка B: `docs(quick-260518-igw): WB Feedbacks API не возвращает pinned — deferred` (no code changes, только SUMMARY context — commit может быть пустым, или объединить с Task 2/3)
  </action>
  <verify>
<automated>npx tsc --noEmit && npx vitest run tests/wb-support-api.test.ts tests/support-sync.test.ts</automated>
  </verify>
  <done>
- Raw curl результат задокументирован в SUMMARY (полные поля feedback'а)
- Решение Ветка A или Ветка B зафиксировано
- Если A: tsc clean, миграция создана, support-sync пишет isPinned, ReviewChip показывает иконку, существующие unit-tests расширены под новое поле
- Если B: SUMMARY содержит explicit "skipped — reason" + TODO для будущей итерации
- Tasks 2 и 3 не блокированы выбором ветки
  </done>
</task>

<task type="auto">
  <name>Task 2: UI rework /prices/wb expand — vertical reviews lanes справа от графика</name>
  <files>components/prices/PriceCalculatorTable.tsx</files>
  <action>
**Целевой layout per-nmId блок (4 колонки):**

```
[Chart 640px]   [Metadata col ~120px]   [По связке col ~32-40px]   [По товару col ~32-40px]
                Остаток   1234            ★4                          ★5
                Дни        42             ★5                          ★3
                Рейтинг   4.7             ★5 (📌)                     ★5
                Оценок   1543             ★2                          ...
                                          ★3
                                          ...
```

**Точечные изменения в `components/prices/PriceCalculatorTable.tsx`:**

1. **`NmIdLegend` переписать** (lines 568-633):
   - Сменить outer `flex flex-col gap-2` на `flex flex-row gap-3 items-start`
   - Убрать `max-w-[640px]` — теперь блок справа от chart, ширина естественная
   - Колонка 1 (metadata) — `flex flex-col gap-1 text-xs min-w-[100px]`:
     ```tsx
     <div className="flex flex-col gap-1 text-xs min-w-[100px]">
       <LegendItem label="Остаток" value={...} />
       <LegendItem label="Дни" value={...} />
       <LegendItem label="Рейтинг" value={...} />
       <LegendItem label="Оценок" value={...} />
     </div>
     ```
     LegendItem — оставить как есть; если он горизонтальный, в новой колонке должен стать вертикальным `flex-col` или просто строкой `label value`. Лучше: `<div className="flex flex-row justify-between gap-2"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>` (label слева, value справа).
   - Колонка 2 (Связка) — рендерится **только если** `reviews.byImt.length > 0`:
     ```tsx
     {reviews.byImt.length > 0 && (
       <div className="flex flex-col gap-1">
         <span className="text-[10px] text-muted-foreground whitespace-nowrap">
           По связке ({reviews.byImt.length})
         </span>
         <div className="flex flex-col gap-1">
           {reviews.byImt.map((r) => (
             <ReviewChip key={`imt-${r.id}`} review={r} />
           ))}
         </div>
       </div>
     )}
     ```
   - Колонка 3 (Товар) — аналогично с `reviews.byNmId`, key prefix `nm-`.

2. **`ReviewChip` НЕ менять структуру** — он уже квадратный (~24×24). В Task 1 Ветка A — добавляется иконка Pin в правый верхний угол; в Ветке B — никаких изменений.

3. **Outer контейнер per-nmId блок** (line 1265 + 1275):
   - Сейчас: `<div className="flex flex-row flex-wrap gap-3 justify-start items-start p-3">`
   - Оставить как есть (он уже flex-row для разных nmId, flex-wrap корректно переносит при нехватке места).
   - Внутри: `<div key={c.nmId} className="flex flex-col gap-2">` (chart + legend под ним) → **СМЕНИТЬ** на просто рендер chart + NmIdLegend на одном уровне. Поскольку NmIdLegend теперь flex-row, нужно chart + legend в **одной** flex-row группе:
     ```tsx
     <div key={c.nmId} className="flex flex-row gap-3 items-start">
       <WbCardOrdersChart nmId={c.nmId} timeSeries={c.timeSeries} />
       <NmIdLegend
         stockQty={c.stockQty}
         daysLeft={daysLeft}
         rating={c.rating}
         reviewsTotal={c.reviewsTotal}
         reviews={c.reviews}
       />
     </div>
     ```
   - Outer per-nmId блоки разделяются `flex-wrap` — два nmId на одну строку только если оба влезают в ширину панели. Иначе wrap на новую строку.

4. **Sort pinned первыми** (ТОЛЬКО если Task 1 Ветка A):
   В page.tsx где формируется `byImt` / `byNmId` (после `.slice(0, 10)`) — добавь pre-sort:
   ```typescript
   .sort((a, b) => {
     if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
     return b.createdAt.localeCompare(a.createdAt)
   })
   ```
   В Ветке B — sort остаётся прежним (createdAt desc).

5. **Type signature `reviews` НЕ менять** — shape `{ byImt, byNmId }` уже корректный от quick 260518-h6p. Только опционально расширить FeedbackItem `isPinned?: boolean` в Ветке A.

**Commit:** `feat(quick-260518-igw): /prices/wb expand — vertical reviews lanes справа от графика`
  </action>
  <verify>
<automated>npx tsc --noEmit && npm run build</automated>
  </verify>
  <done>
- NmIdLegend переписан под flex-row (metadata + 2 vertical lanes)
- chart + NmIdLegend на одном flex-row уровне внутри per-nmId блока
- Пустая `byImt` или `byNmId` колонка не рендерится (вместе с подписью)
- ReviewChip визуально не изменился (квадрат 24×24)
- tsc + build чистые
- Smoke: открыть https://zoiten.pro/prices/wb (после deploy) → раскрыть товар с reviews → визуально chart слева, metadata + reviews справа vertically
  </done>
</task>

<task type="auto">
  <name>Task 3: Diagnostic + fix orders sync для последних 7 дней + targeted 7d backfill</name>
  <files>lib/wb-api.ts (CONDITIONAL), lib/wb-orders-chart.ts (CONDITIONAL), app/api/cron/wb-orders-daily/route.ts (CONDITIONAL), app/api/wb-orders-backfill/route.ts, tests/wb-card-orders-daily.test.ts (CONDITIONAL)</files>
  <action>
**Шаг 1 — Diagnostic (СНАЧАЛА данные, потом fix):**

3a. Read DB last 7 days for test nmId (выбери два-три с активными продажами, например 800750522 + ещё один):
```bash
ssh root@85.198.97.89 'sudo -u postgres psql zoiten_erp -c "SELECT \"nmId\", date, qty, \"sellerPrice\", \"buyerPrice\" FROM \"WbCardOrdersDaily\" WHERE \"nmId\" IN (800750522) AND date >= CURRENT_DATE - 8 ORDER BY \"nmId\", date DESC;"'
```

3b. Read raw WB Orders API за тот же период:
```bash
ssh root@85.198.97.89 "source /etc/zoiten.pro.env && DATE_FROM=\$(date -u -d '-8 days' +%Y-%m-%dT00:00:00) && curl -sS -H \"Authorization: \$WB_API_TOKEN\" \"https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=\$DATE_FROM&flag=0\"" | python3 -c "
import json, sys, collections
data = json.load(sys.stdin)
counts = collections.defaultdict(lambda: collections.Counter())
for o in data:
    if o.get('isCancel'): continue
    nm = o.get('nmId')
    if nm != 800750522: continue
    counts[nm][o.get('date','')[:10]] += 1
for nm, c in counts.items():
    print(f'nm={nm}')
    for d in sorted(c.keys()):
        print(f'  {d}: {c[d]}')
"
```

3c. Cron health check:
```bash
ssh root@85.198.97.89 'journalctl -u zoiten-cron* --since "8 days ago" 2>/dev/null | grep -E "wb-orders|wb-prices" | tail -50'
ssh root@85.198.97.89 'cat /opt/zoiten-pro/logs/*.log 2>/dev/null | grep wb-orders | tail -30'
```

3d. Compare DB qty vs WB API qty per (nmId, date) для последних 7 дней. **Запиши таблицу сравнения в SUMMARY** (формат: date | DB.qty | API.qty | diff).

**Шаг 2 — Root cause analysis:**

Возможные причины (выбери на основе данных diagnostic):

- **(A) Today not finalized + cron overwrites:** cron каждый день пишет partial today + yesterday. Если cron run в 05:00 МСК, today=00:00..05:00 неполный → DB.today < API.today сильно. После cron yesterday становится полным. Если сегодня DB.today есть и < API.today → это (A).
- **(B) Timezone shift:** check что `dateFrom` отправляется как `"2026-05-17T00:00:00"` (без Z). Если случайно `.toISOString()` пишет `Z` → WB интерпретирует как UTC → дата смещается на +3h MSK. Симптом: один день DB полностью пустой, соседний — двойной qty.
- **(C) Cron не запускался N дней:** journalctl показывает пропуск. Симптом: DB заканчивается на N-дневной давности дате, дальше — пусто.
- **(D) `o.quantity` ignored:** `existing.qty++` считает 1 на order, но если WB рудиментарно отдаёт field `quantity` > 1 — потеряем. Маловероятно (Statistics Orders по доке — 1 order = 1 row).

**Шаг 3 — Fix per chosen root cause:**

- **(A):** В `app/api/cron/wb-orders-daily/route.ts` после upsert — добавить **delete today rows** ДО upsert: `await prisma.wbCardOrdersDaily.deleteMany({ where: { date: getMskTodayDate() } })`. Today пишется свежий на каждый cron tick, а не суммируется с предыдущим partial. ИЛИ: ограничить upsert только yesterday и старше (`r.date < getMskTodayDate()` filter перед upsertOrdersDaily). Второй вариант предпочтительнее — today заполнится на next-day cron tick.
- **(B):** Проверить в `fetchOrdersForRange` lines 1296-1297 что `currentDateFrom = dateFrom.toISOString().split(".")[0]` действительно без `Z`. Если есть Z — fix. Также проверить `dateFrom` тип/значение на входе из cron.
- **(C):** Добавить systemd timer recovery — отдельный quick task; здесь fix только backfill будет восстановительный.
- **(D):** В `fetchOrdersForRange` line 1341 `existing.qty++` → `existing.qty += (o.quantity ?? 1)`. Также проверить структуру raw order в diagnostic (есть ли quantity field).

**Шаг 4 — Targeted 7d backfill endpoint:**

Расширить `app/api/wb-orders-backfill/route.ts` (НЕ создавать новый, чтобы не плодить):

```typescript
// После secret check / RBAC
const url = new URL(req.url)
const daysParam = url.searchParams.get("days")
const days = daysParam ? Math.min(Math.max(1, parseInt(daysParam, 10)), 365) : null

let dateFrom: Date
if (days != null && !isNaN(days)) {
  // Backfill последних N дней — dateFrom = today MSK - N days
  const today = getMskTodayDate() // import из @/lib/wb-orders-chart
  dateFrom = new Date(today.getTime() - days * 24 * 3600_000)
} else {
  dateFrom = BACKFILL_START // 2026-04-01
}
console.log(`[wb-orders-backfill] dateFrom=${dateFrom.toISOString()} days=${days ?? "all"}`)
```

Endpoint остаётся idempotent (upsert ON CONFLICT). Возвращает существующий shape `{ ok, dateFrom, rowsFetched, upserted }` — поле `days` добавь в response для transparency.

**Шаг 5 — Test coverage (если меняли aggregation/timezone):**

- Если fix (B) — добавить unit test в `tests/wb-card-orders-daily.test.ts`: `dateFrom без Z` smoke test.
- Если fix (D) — расширить existing tests: order с `quantity: 3` → `qty += 3`.
- Если fix (A) — добавить test что today row не пишется в cron path: mock `fetchOrdersForRange` returns today + yesterday rows, после upsertOrdersDaily делать `findMany({ where: { date: getMskTodayDate() } })` — должен быть 0 (или старый).

**Шаг 6 — Deploy (делегируется пользователю):**

В SUMMARY указать:
```bash
git push origin main
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
# Targeted 7d backfill (executor выполнит после deploy через ssh)
ssh root@85.198.97.89 'set -a; source /etc/zoiten.pro.env; set +a; curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" "http://127.0.0.1:3001/api/wb-orders-backfill?days=8"'
# (days=8 — захватим вчера + сегодня для надёжности; cron потом перепишет today)
```

**Commit (один или два):**
- `fix(quick-260518-igw): orders sync — <root cause описание>` (lib changes + cron)
- `feat(quick-260518-igw): /api/wb-orders-backfill?days=N для targeted backfill` (route + tests)
  </action>
  <verify>
<automated>npx tsc --noEmit && npx vitest run tests/wb-card-orders-daily.test.ts tests/wb-orders-chart-fill.test.ts</automated>
  </verify>
  <done>
- Diagnostic SQL + raw API output задокументированы в SUMMARY (таблица DB vs API per date)
- Root cause явно идентифицирован (A / B / C / D или комбо)
- Fix внедрён в правильном файле (cron / lib / both)
- /api/wb-orders-backfill принимает ?days=N параметр и backfill'ит targeted период
- Unit tests расширены если изменена aggregation/dateFrom логика
- tsc + tests + build clean
- Deploy instructions в SUMMARY с готовым curl для targeted backfill
  </done>
</task>

</tasks>

<verification>
**Per-task verification:**
- Task 1: tsc clean, vitest support-sync tests pass, raw curl результат в SUMMARY
- Task 2: tsc + build clean
- Task 3: tsc + relevant vitest tests pass, diagnostic table в SUMMARY

**Cross-task:**
- `npx tsc --noEmit` — clean (no orphan imports)
- `npm run build` — все routes регистрируются включая `/api/wb-orders-backfill`
- Если Task 1 = Ветка B (skip pinned), Tasks 2 и 3 НЕ зависят от Task 1 — могут merge'иться независимо.

**Smoke after deploy (пользователь):**
1. https://zoiten.pro/prices/wb — раскрыть товар → chart слева, metadata + reviews vertically справа
2. Если Task 1 Ветка A — какой-нибудь pinned feedback показывает Pin-иконку
3. После 7d backfill: SQL spot check `SELECT date, qty FROM "WbCardOrdersDaily" WHERE "nmId"=800750522 AND date >= CURRENT_DATE-8 ORDER BY date` — qty per date соответствуют WB API
</verification>

<success_criteria>
- Task 1 решение зафиксировано (А или Б) + raw API output в SUMMARY
- /prices/wb expand layout vertical (Task 2 done)
- Orders sync root cause identified + fix + targeted backfill endpoint (Task 3 done)
- Все коммиты с префиксом `quick-260518-igw`
- SUMMARY содержит deploy instructions + curl commands
- Zero regression в существующих tests (support-sync, pricing-math, wb-orders-chart-fill)
</success_criteria>

<output>
After completion, create `.planning/quick/260518-igw-pinned-wb-ui-rework-prices-wb-vertical-b/260518-igw-SUMMARY.md` со структурой:

- One-liner
- **Task 1 outcome**: Ветка A или Б, raw curl JSON sample, изменённые/незатронутые файлы
- **Task 2 outcome**: layout before/after, изменённые компоненты
- **Task 3 outcome**: diagnostic table (DB vs API per date), root cause, fix, backfill query
- Verification (tsc/build/tests)
- Deploy + backfill commands (готовые ssh curl)
- Commits list
- Self-Check
</output>
