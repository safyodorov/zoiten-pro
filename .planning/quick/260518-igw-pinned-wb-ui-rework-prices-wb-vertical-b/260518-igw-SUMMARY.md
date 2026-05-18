---
quick: 260518-igw
type: execute
duration: ~4min
completed: 2026-05-18
commits:
  - ee70747 feat(quick-260518-igw): /prices/wb expand — vertical reviews lanes справа от графика
  - fc38275 fix(quick-260518-igw): orders sync — rolling 7-day window вместо yesterday-only delta
tasks-completed: 3
tasks-total: 3
requirements-fulfilled:
  - QUICK-260518-IGW-T1 (Ветка B — pinned не доступен в API, deferred)
  - QUICK-260518-IGW-T2 (vertical reviews lanes в /prices/wb expand)
  - QUICK-260518-IGW-T3 (orders sync rolling 7-day window + ?days=N backfill)
files-modified:
  - components/prices/PriceCalculatorTable.tsx (NmIdLegend + LegendItem + per-nmId outer block)
  - app/api/cron/wb-orders-daily/route.ts (rolling 7-day delta + getMskTodayDate import)
  - app/api/wb-orders-backfill/route.ts (?days=N query param + getMskTodayDate import)
files-untouched:
  - lib/wb-support-api.ts (Feedback interface — pinned не доступен)
  - lib/support-sync.ts
  - prisma/schema.prisma
  - lib/wb-api.ts (fetchOrdersForRange — изменений не потребовалось)
  - lib/wb-orders-chart.ts
---

# Quick 260518-igw Summary

**One-liner:** Три доработки за один quick: (1) WB Pinned-отзывы — diagnostic подтвердил отсутствие поля в API → deferred; (2) UI rework /prices/wb expand — vertical reviews lanes справа от графика (chart + metadata + 2 review-колонки); (3) фикс orders sync bug — daily cron теперь делает rolling 7-day re-sweep вместо yesterday-only delta, что устраняет потерю late-incoming заказов (DB nmId 800750522 за 2026-05-14: DB=2 → after backfill будет API=34).

---

## Task 1 outcome: Ветка B (deferred)

### Raw curl diagnostic

```bash
ssh root@85.198.97.89 "source /etc/zoiten.pro.env && \
  curl -sS -H \"Authorization: \$WB_API_TOKEN\" \
  'https://feedbacks-api.wildberries.ru/api/v1/feedbacks?isAnswered=true&take=3&skip=0&order=dateDesc'"
```

Response sample (first feedback, full set of fields):

```json
{
  "id": "5hC2ishtC6p4Rzlrk6S1",
  "text": "",
  "pros": "",
  "cons": "",
  "productValuation": 5,
  "createdDate": "2026-05-18T09:48:43Z",
  "answer": null,
  "state": "wbRu",
  "productDetails": {
    "imtId": 446042426,
    "nmId": 61929251,
    "productName": "Паровая швабра ...",
    "supplierArticle": "ZMop-450-D1",
    "supplierName": "ООО \"ЗОЙТЕН\"",
    "brandName": "Zoiten",
    "size": "0"
  },
  "video": null,
  "wasViewed": false,
  "photoLinks": null,
  "userName": "Анна",
  "orderStatus": "buyout",
  "matchingSize": "",
  "isAbleSupplierFeedbackValuation": true,
  "supplierFeedbackValuation": 0,
  "isAbleSupplierProductValuation": true,
  "supplierProductValuation": 0,
  "isAbleReturnProductOrders": true,
  "returnProductOrdersDate": null,
  "bables": null,
  "lastOrderShkId": 44660208916,
  "lastOrderCreatedAt": "2026-05-02T17:58:47Z",
  "color": "Белый иней · 455 мл",
  "subjectId": 2584,
  "subjectName": "Паровые швабры",
  "parentFeedbackId": null,
  "childFeedbackId": null
}
```

### Decision: Ветка B — pinned поле отсутствует

Проверены все 28 уникальных полей в feedback'е. **Нет** `isPinned`, `pinned`, `isTop`, `isMain`, `pinnedAt`, `topRating` или эквивалентов. Поля `parentFeedbackId` / `childFeedbackId` — это cross-link относя one feedback к другому (вероятно, версии после редактирования), не маркер закрепления.

Параллельный запрос `isAnswered=false` упал в 429 (rate-limit WB) сразу после первого; повторять не имело смысла — структура feedback одинакова для обоих режимов (verified ранее в quick 260518-hz7 и quick 260518-h6p).

**Outcome:** Никаких изменений в schema/sync/UI. Tasks 2 и 3 не зависят от этого решения.

### TODO future

Если когда-нибудь понадобится pinned-функционал — пробовать unofficial buyer endpoint `https://feedbacks2.wb.ru/feedbacks/v2/<imtId>` через `curl` на VPS (TLS fingerprint block в Node fetch — паттерн SPP из CLAUDE.md). Сейчас skipped.

---

## Task 2 outcome: vertical reviews lanes

### Layout change

**Before** (quick 260518-h6p):

```
[Chart 640px]
[Stock][Days][Rating][N reviews]       ← 4 metadata items в одной строке
По связке: [★5][★5][★4]...              ← горизонтальная лента
По товару: [★4][★3]...                  ← горизонтальная лента
```

**After** (quick 260518-igw):

```
[Chart 640px]   [Metadata]   [По связке]   [По товару]
                 Остаток       ★5            ★5
                 Дни           ★5            ★4
                 Рейтинг       ★4            ★3
                 Оценок        ★3            ...
                               ...
```

### Изменения

- **`NmIdLegend`**: outer `flex-col gap-2` → `flex-row gap-3 items-start text-xs`.
  Внутри 3 колонки: metadata (min-w-140px), «По связке» lane, «По товару» lane.
  Пустая lane (вместе с подписью) не рендерится — поведение сохраняется.
- **`LegendItem`**: `flex-col` (label сверху, value снизу) → `flex-row justify-between gap-2` (label слева, value справа). Это нужно для компактного отображения справа от графика.
- **Outer container** per-nmId блок: `flex-row flex-wrap` → `flex-col items-stretch`.
  Внутри per-nmId: `flex-col gap-2` → `flex-row gap-3 items-start flex-wrap`.
  Логика: каждый chart+legend теперь широкий (~640 + 250 = 890px), не помещается рядом с другим nmId → переключаемся на vertical stack между nmId-блоками.
- **`ReviewChip`**: не тронут (визуально не изменился, квадратный 24×24).
- **Type signature `reviews`**: не тронут (shape `{ byImt, byNmId }` сохранён).

### Файлы

- `components/prices/PriceCalculatorTable.tsx` (NmIdLegend + LegendItem + outer block в expandedTr)

### Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — clean, /prices/wb 16.4 kB (без увеличения).
- `npx vitest run` — все 15 orders-tests pass.
- Smoke: после deploy раскрыть товар на /prices/wb → визуально chart слева, metadata колонкой + 2 ленты звёзд справа vertically.

---

## Task 3 outcome: orders sync rolling 7-day window

### Diagnostic — DB vs WB API сравнение

#### DB snapshot last 9 days (3 test nmIds)

```sql
SELECT "nmId", date, qty, "sellerPrice", "buyerPrice"
FROM "WbCardOrdersDaily"
WHERE "nmId" IN (800750522, 61929251, 45360117) AND date >= CURRENT_DATE - 9
ORDER BY "nmId", date DESC;
```

Total DB qty per date last 14d (across all nmIds):

| date       | DB rows | DB total qty | API total qty | diff   |
| ---------- | ------- | ------------ | ------------- | ------ |
| 2026-05-04 | 42      | 178          | 7             | (+170 outdated rows) |
| 2026-05-11 | 48      | 212          | 252           | -40    |
| 2026-05-12 | 49      | 194          | 277           | -83    |
| 2026-05-13 | 57      | 142          | 394           | -252   |
| 2026-05-14 | 50      | 128          | 452           | -324   |
| 2026-05-15 | 54      | 122          | 455           | **-333** |
| 2026-05-16 | 224     | 183          | 484           | -301   |
| 2026-05-17 | 224     | 570          | 572           | -2 ✓   |
| 2026-05-18 | 224     | 17           | 211           | -194 (today partial — нормально, до 05:00 МСК след cron tick) |

#### Per-nmId comparison (nmId 800750522)

| date       | DB.qty | API.qty | diff |
| ---------- | ------ | ------- | ---- |
| 2026-05-13 | 2      | 26      | -24  |
| 2026-05-14 | 2      | 34      | -32  |
| 2026-05-15 | 2      | 39      | **-37** |
| 2026-05-16 | 1      | 19      | -18  |
| 2026-05-17 | 16     | 16      | **0 ✓** |

#### Per-nmId (nmId 61929251 — «Паровая швабра»)

| date       | DB.qty | API.qty | diff |
| ---------- | ------ | ------- | ---- |
| 2026-05-13 | 1      | 20      | -19  |
| 2026-05-14 | 1      | 31      | -30  |
| 2026-05-15 | 1      | 25      | -24  |
| 2026-05-16 | 26     | 26      | 0 ✓  |
| 2026-05-17 | 25     | 25      | 0 ✓  |

#### Cron journal (последние 7 дней)

```
May 15 14:06:10 [wb-orders-daily cron] start mode=backfill dateFrom=2026-04-01 → fetched=2165 (manual backfill)
May 15 15:47:41 [wb-orders-backfill] start dateFrom=2026-04-01 → fetched=2162 (повторный manual backfill)
May 16 02:00:00 [wb-orders-daily cron] start mode=delta dateFrom=2026-05-15 → fetched=121
May 17 02:00:00 [wb-orders-daily cron] start mode=delta dateFrom=2026-05-16 → fetched=131
May 18 02:00:00 [wb-orders-daily cron] start mode=delta dateFrom=2026-05-17 → fetched=125
```

### Root cause

**WB Statistics Orders API с `flag=0` фильтрует по `lastChangeDate`, НЕ по `date`** (поле заказа). При daily delta-cron с `dateFrom = yesterday MSK` API возвращает только заказы, у которых `lastChangeDate >= yesterday` — обычно это:
- заказы, оформленные вчера или сегодня;
- заказы с изменениями статуса (отмена, доставка) за последний день.

Заказы, оформленные 2-7 дней назад со стабильным статусом, не попадают в delta запрос. В результате:
- В день, когда заказ был оформлен, cron фиксирует его в БД (partial qty за этот день).
- На следующий день дополнительные заказы за тот же день, оформленные late (тренд roll-in), уже не попадают в delta — DB остаётся с устаревшим qty.

Анализ показал: 2026-05-15 и 2026-05-14 — даты, по которым потеряно больше всего qty (-333 и -324 соответственно). 2026-05-17 точно совпадает с API только потому, что сейчас 2026-05-18 (вчера), все ещё в окне yesterday-only.

### Fix

`app/api/cron/wb-orders-daily/route.ts` — daily delta теперь использует **rolling 7-day window**:

```typescript
// БЫЛО:
// dateFrom = getMskYesterdayDate()
// НОВЫЙ КОД:
const today = getMskTodayDate()
dateFrom = new Date(today.getTime() - 7 * 24 * 3600_000)
```

7-day окно покрывает основной хвост поздно поступающих заказов. UPSERT идемпотентен (`ON CONFLICT (nmId, date) UPDATE qty + sellerPrice + buyerPrice`) → переписывает устаревшие qty. Response также расширен полем `windowDays: 7` для прозрачности.

### Дополнение — `?days=N` query param в backfill endpoint

`app/api/wb-orders-backfill/route.ts`:

```typescript
// Новый optional query param: ?days=N (1..365)
const url = new URL(req.url)
const daysParam = url.searchParams.get("days")
const daysParsed = daysParam != null ? parseInt(daysParam, 10) : NaN
const days = Number.isFinite(daysParsed) && daysParsed >= 1 && daysParsed <= MAX_DAYS
  ? daysParsed
  : null

let dateFrom: Date
if (days != null) {
  const today = getMskTodayDate()
  dateFrom = new Date(today.getTime() - days * 24 * 3600_000)
} else {
  dateFrom = BACKFILL_START // 2026-04-01 (legacy behaviour сохранён)
}
```

Response расширен полем `days: number | null`. Backward compat сохранена (POST без query → fallback на BACKFILL_START).

### Файлы

- `app/api/cron/wb-orders-daily/route.ts` — rolling 7-day delta + import `getMskTodayDate`
- `app/api/wb-orders-backfill/route.ts` — `?days=N` parser + import `getMskTodayDate`

### Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — clean, /api/wb-orders-backfill, /api/cron/wb-orders-daily обе зарегистрированы.
- `npx vitest run tests/wb-card-orders-daily.test.ts tests/wb-orders-chart-fill.test.ts` — 15 passed (15).
- Тесты `fetchOrdersForRange` не изменялись (sig тот же — `(dateFrom: Date)`).

### Test coverage decision

Решение **не добавлять** новые unit-tests:
- `fetchOrdersForRange` не менялась (та же сигнатура, та же логика).
- Изменения в cron/backfill route — orchestration (date math + URL parsing), уже покрыты `wb-orders-chart-fill.test.ts` (`getMskTodayDate` tested).
- E2E проверка — через targeted backfill на проде (ниже).

---

## Verification (consolidated)

```bash
npx tsc --noEmit                                          # ✓ clean
npx vitest run tests/wb-card-orders-daily.test.ts tests/wb-orders-chart-fill.test.ts  # ✓ 15/15 passed
npm run build                                             # ✓ clean
```

`/prices/wb` size: 16.4 kB (no regression).
Routes зарегистрированы: `/api/wb-orders-backfill`, `/api/cron/wb-orders-daily`.

---

## Deploy + backfill commands (для пользователя)

```bash
# Deploy
git push origin main
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"

# Targeted 7-day backfill для восстановления потерянных qty за последние 8 дней.
# 8 = today + 7 предыдущих, чтобы захватить ВСЁ что rolling-7d cron теперь видит.
# Cron потом перезапишет today на след tick (02:00 UTC = 05:00 MSK).
ssh root@85.198.97.89 'set -a; source /etc/zoiten.pro.env; set +a; \
  curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" \
  "http://127.0.0.1:3001/api/wb-orders-backfill?days=8"'

# Sanity check после backfill
ssh root@85.198.97.89 'sudo -u postgres psql zoiten_erp -c \
  "SELECT date, qty FROM \"WbCardOrdersDaily\" WHERE \"nmId\"=800750522 \
   AND date >= CURRENT_DATE - 8 ORDER BY date DESC;"'

# Ожидаемый результат после backfill:
#  2026-05-17 → qty=16 (без изменений, уже было правильно)
#  2026-05-16 → qty=19 (было 1)
#  2026-05-15 → qty=39 (было 2)
#  2026-05-14 → qty=34 (было 2)
#  2026-05-13 → qty=26 (было 2)
```

---

## Commits

1. **ee70747** — `feat(quick-260518-igw): /prices/wb expand — vertical reviews lanes справа от графика`
   Files: `components/prices/PriceCalculatorTable.tsx`
2. **fc38275** — `fix(quick-260518-igw): orders sync — rolling 7-day window вместо yesterday-only delta`
   Files: `app/api/cron/wb-orders-daily/route.ts`, `app/api/wb-orders-backfill/route.ts`

Task 1 (pinned) — без коммита (Ветка B, no code changes, документировано в SUMMARY).

---

## Deviations from Plan

### Task 1 — auto-recorded
- **Decision**: Ветка B выбрана по результату raw curl diagnostic (поле pinned отсутствует во всех 28 уникальных полях feedback'а).
- Никаких изменений в schema/sync/UI. Tasks 2 и 3 не блокированы.
- Подтверждено: feedback shape стабилен между `isAnswered=true/false` (verified earlier in quick 260518-hz7).

### Task 3 — auto-recorded
- **Plan suggested** вариант (A) "delete today rows before upsert + filter < today". Это решает symptom partial today, но НЕ решает root cause (потеря заказов за дни 2-7).
- **Actually fixed**: rolling 7-day window — единственный путь, который восстанавливает late-incoming заказы за всю историю окна. Подтверждено diagnostic data.
- В плане упоминался вариант (B) "timezone shift" — verified, не подтвердился: `dateFrom.toISOString().split(".")[0]` действительно без `Z`, MSK semantic корректен.
- В плане упоминался вариант (D) "ignore o.quantity" — verified в raw API output, WB Orders endpoint возвращает 1 заказ = 1 row, поле `quantity` отсутствует. Не баг.

---

## Self-Check: PASSED

- [x] Files modified существуют:
  - `components/prices/PriceCalculatorTable.tsx` — FOUND
  - `app/api/cron/wb-orders-daily/route.ts` — FOUND
  - `app/api/wb-orders-backfill/route.ts` — FOUND
- [x] Commits существуют:
  - ee70747 — FOUND
  - fc38275 — FOUND
- [x] `npm run build` — PASS
- [x] `npx tsc --noEmit` — PASS
- [x] `npx vitest run tests/wb-card-orders-daily.test.ts tests/wb-orders-chart-fill.test.ts` — 15/15 PASS
- [x] SUMMARY содержит deploy + curl commands
- [x] Root cause Task 3 явно идентифицирован с diagnostic-данными
- [x] Task 1 raw curl JSON в SUMMARY
