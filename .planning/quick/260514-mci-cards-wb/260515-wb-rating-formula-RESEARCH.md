# Формула рейтинга карточки WB — research для replicate в нашем ERP

**Исследование:** 2026-05-15
**Домен:** WB storefront rating formula (как карточка показывает «4.9» покупателю)
**Confidence:** HIGH — формула найдена в **официальной seller-документации WB** ([instructions/product-rating](https://seller.wildberries.ru/instructions/ru/ru/material/product-rating))

---

## Summary

**Главная находка:** WB **официально публикует** формулу расчёта рейтинга карточки. Это не реверс-инжиниринг и не догадки продавцов — это документация на seller.wildberries.ru. Гипотеза пользователя про **time-decay weighting** оказалась **точна**.

**Формула WB:**

```
weight(d) = max(1, 100^(-(d - 182) / (730 × 1.5)))   // эквивалентно clamp + exp-decay
                                                       // но WB пишет проще:
                                                       //   d ≤ 182 → weight = 1
                                                       //   d  > 182 → weight = 100^(-(d-182)/1095)

И дополнительно: 15 САМЫХ СВЕЖИХ отзывов ВСЕГДА имеют weight = 1.

rating = Σ(productValuation_i × weight_i) / Σ(weight_i)
```

Где `d` — количество дней с момента публикации отзыва. Знаменатель `730×1.5 = 1095`.

**Что это значит численно** (verified locally):

| Возраст (дней) | Weight | Что это |
|----------------|--------|---------|
| 0–182          | 1.000  | свежий отзыв, полный вес |
| 200            | 0.927  | начало затухания |
| 365 (1 год)    | 0.463  | вес упал почти вдвое |
| 500            | 0.263  | четверть |
| 730 (2 года)   | 0.100  | 10% от полного |
| 1095 (3 года)  | 0.022  | практически 0 |

**Почему наш текущий аггрегат ниже витрины WB:** мы считаем простое среднее по последним 2 годам — старые отзывы (близкие к границе 2 лет) у нас идут с полным весом 1, а у WB они идут с весом ~0.10. Поскольку старые отзывы у Zoiten **в среднем ниже** новых (типовая ситуация: товар улучшился со временем), наше число тянется вниз.

**Дельта 4.82 → 4.9 в imt 1880284184:** для среднего на 0.08 поднять надо чтобы старые низкие отзывы получили вес ~0.1-0.3 (наш расчёт `extra avg ≈ 3.06` для 62 «лишних» подсказывает что это именно старые отзывы с весом ≈0, которые WB исключает или почти исключает).

**Гэп по count (1422 vs 1360):** WB на витрине показывает count как `Σ(включённых отзывов)`, не `Σ(weight)`. Гэп ~4% объясняется через **исключение «невалидных»** оценок: спам, бессодержательные («asdf»), противоречивые (низкая оценка + положительный текст), не о товаре («быстрая доставка»). 62 шт из 1422 = 4.36% — правдоподобно. **Это нельзя реплицировать на нашей стороне** — фильтр «противоречивых» требует NLP. Принять как known residual.

**Primary recommendation:** Реализовать **точную формулу WB** в `aggregateFeedbacks`. Простое линейное затухание мы тестировать не будем — у нас есть **документированная формула**. Парамеризировать константы `182, 1095, 15` как named exports чтобы менять без правок кода если WB меняет.

---

## 1. WB-direct findings

### 1.1. Источник формулы (HIGH confidence)

**Официальная страница WB Partners:** [seller.wildberries.ru/instructions/ru/ru/material/product-rating](https://seller.wildberries.ru/instructions/ru/ru/material/product-rating)

Цитата (verified через WebFetch):

> «Коэффициент затухания рассчитывается по формуле **100^-(d - 182) / (730 × 1.5)**, где d — количество дней с момента публикации отзыва. Для самых свежих **15 отзывов** коэффициент затухания всегда равен **1**. Учитываются последние **20 000 валидных оценок** товара и отзывов с оценкой за последние **два года**.»
>
> «Рейтинг = Σ(оценка × коэффициент) / Σ(коэффициенты), округление до одного знака.»

Также подтверждено в [guruseller.ru](https://guruseller.ru/reyting-tovara-na-wildberries-algoritm-raschyota-ves-otzyvov-i-vliyanie-vremeni/) с прямой таблицей коэффициентов (d=200 → 0.9271 совпадает с моим расчётом локально).

### 1.2. Что значат константы

| Const | Значение | Смысл |
|-------|----------|-------|
| `d` | дни с публикации отзыва | независимая переменная |
| `182` | дней до начала затухания | ~6 месяцев «полного веса» |
| `730` | дней в 2-летнем окне | макс возраст учитываемых отзывов |
| `1.5` | множитель скорости затухания | усиливает или замедляет decay |
| `100` | база степени | при `1.5` → достаточно агрессивный decay |
| `15` | минимум недекаирующих отзывов | гарантирует, что новый товар с малым кол-вом отзывов имеет осмысленный рейтинг |
| `20 000` | макс отзывов в расчёте | для топ-карточек обрезает хвост; для Zoiten не достижим |

### 1.3. Какие отзывы исключаются (по WB)

Из [официальной страницы](https://seller.wildberries.ru/instructions/ru/ru/material/product-rating):

1. **Противоречивые** — оценка не соответствует тексту (низкая + положительный коммент или наоборот)
2. **Спам, оскорбления, нарушения правил**
3. **Бессодержательные** («qwerty», «asdf», «ggg&g»)
4. **Не о товаре** («курьер вежливый», «быстрая доставка»)
5. **Обновлённые** — учитывается только последняя версия (если покупатель переписал)
6. **С удалённых карточек** или **удалённые пользователем**

**Что WB НЕ говорит явно:**
- Включаются ли отзывы из РБ/КЗ/КГ (state `wbBy`/`wbKz`/`wbKg`) в рейтинг на витрине ru-зоны
- Включаются ли отзывы без текста (только оценка)
- Как обрабатываются обнулённые отзывы (`state="none"` после успешной апелляции продавца)

### 1.4. Habr Q&A — другие продавцы реплицируют тот же gap

[qna.habr.com/q/1394812](https://qna.habr.com/q/1394812) — продавец пишет: «среднее арифметическое 4.84, WB показывает 4.6, гэп объяснить округлением нельзя». Та же история, что и у нас. Обсуждение склоняется к тому, что **формула WB верна, но фильтр «невалидных» — это NLP-чёрный ящик** который мы воспроизвести не можем.

### 1.5. Изменения формулы во времени (MEDIUM confidence)

[news.am/eng/news/2777](https://tech.news.am/eng/news/2777/wildberries-launches-new-method-of-calculating-product-ratings.html) (2022 г.):

> «Wildberries запустил новый метод расчёта рейтинга, при котором через 3 месяца отзыв день за днём становится менее релевантным. 15 самых свежих отзывов всегда влияют сильнее.»

Это согласуется с актуальной формулой (182 дней ≈ 6 месяцев — позже, чем 3 месяца в анонсе, но 15-recent константа та же). Скорее всего WB **корректировал параметр 182** между 2022 и 2026, но сам подход (clamp + exp-decay) не менялся.

---

## 2. Recommended formula for our ERP

### 2.1. Решение: реплицировать **точную формулу WB**

**Почему не «линейная декея с 2-year window»:**
- У нас есть **документированная формула**. Аппроксимация — это lose-lose: не идеально и не «по WB».
- Linear decay даст другой shape кривой (linear vs exp). Для recent отзывов разница ничтожна, для старых — кратная.

**Почему не Bayesian с prior из категории:**
- Bayesian обычно для маленьких N (cold start). У Zoiten 1000+ отзывов на карточку — N достаточен.
- WB не использует Bayesian — нет смысла «улучшать» формулу WB, цель — попасть в её число.

**Почему не Wilson confidence interval:**
- Это для бинарных оценок (положительный/отрицательный). У нас 1–5.

### 2.2. Что делать с тем, что мы **не можем** реплицировать

| Источник gap | Что делаем |
|--------------|------------|
| **Time decay** (большая часть gap) | Реплицируем точно. Главный фикс. |
| **15-recent с весом 1** | Реплицируем (sort by createdDate desc, top 15 → w=1, остальные по формуле) |
| **Фильтр «невалидных»** (NLP) | Не делаем. Принять как known residual ~3-5% count gap. |
| **Обнулённые отзывы** (state ≠ wbRu) | Уже сделано — `state="wbRu"` filter в текущем aggregator |
| **20 000 cap** | Игнорируем — у Zoiten ни одна карточка близко не подходит к 20k |
| **Округление до 1 знака** | WB округляет до 1 знака (`4.9`). Мы храним 2 (`4.86`). Для display — округлять до 1 при отображении витринного аналога. |

### 2.3. Что делать с региональным state

**Гипотеза:** WB **на ru-витрине** показывает рейтинг **только по `state="wbRu"`** отзывам. Отзывы из `wbBy/wbKz/wbKg` идут в рейтинг витрины Беларуси/Казахстана/Киргизии соответственно.

**Текущий фильтр (`state === "wbRu"`)** правильный для ru-витрины. **Не менять.**

Но логику документировать: «мы целимся в **ru-витрину**; если у продавца значимый трафик в Беларусь — нужен отдельный агрегат `ratingBy` с `state === "wbBy"`».

---

## 3. Implementation sketch

### 3.1. Pure aggregator — изменения в `aggregateFeedbacks`

```typescript
// lib/wb-ratings.ts

// ── Конфигурация формулы WB ───────────────────────────────────
// Параметризовано, чтобы менять без правок кода если WB меняет формулу.
export const WB_RATING_FORMULA = {
  FRESH_DAYS: 182,          // дней до начала затухания
  WINDOW_DAYS: 730,         // 2-летнее окно
  DECAY_DIVISOR: 1095,      // 730 × 1.5
  DECAY_BASE: 100,          // основание степени
  RECENT_FULL_WEIGHT: 15,   // сколько самых свежих имеют w=1 независимо от возраста
} as const

/**
 * Коэффициент затухания по официальной формуле WB:
 *   d ≤ 182  → 1
 *   d > 182  → 100^(-(d - 182) / 1095)
 *
 * Verified: d=200 → 0.9271, d=365 → 0.4632, d=730 → 0.0998, d=1095 → 0.0215
 * Source: https://seller.wildberries.ru/instructions/ru/ru/material/product-rating
 */
function wbDecayWeight(ageDays: number): number {
  const { FRESH_DAYS, DECAY_DIVISOR, DECAY_BASE } = WB_RATING_FORMULA
  if (ageDays <= FRESH_DAYS) return 1
  return Math.pow(DECAY_BASE, -(ageDays - FRESH_DAYS) / DECAY_DIVISOR)
}

// ── В aggregateFeedbacks ──────────────────────────────────────

export function aggregateFeedbacks(
  feedbacks: Feedback[],
  opts: { now?: number } = {}
): ProductRatingsResult {
  const now = opts.now ?? Date.now()
  const cutoff = now - TWO_YEARS_MS
  const MS_PER_DAY = 86_400_000

  // Шаг 1: отфильтровать невалидные (как сейчас).
  // Шаг 2: разбить по nmId, для каждого:
  //   a) sort by createdDate desc
  //   b) top RECENT_FULL_WEIGHT → w=1
  //   c) остальным w = wbDecayWeight(ageDays)
  //   d) rating = Σ(v × w) / Σ(w)

  // Группируем валидные feedbacks по nmId/imtId
  const byNmId = new Map<number, { feedback: Feedback; ageDays: number; v: number }[]>()
  const byImtId = new Map<number, { feedback: Feedback; ageDays: number; v: number }[]>()

  for (const fb of feedbacks) {
    // ... существующие фильтры state/valuation/age/nmId ...
    const created = Date.parse(fb.createdDate)
    const ageDays = (now - created) / MS_PER_DAY
    const v = Number(fb.productValuation)
    const nmId = fb.productDetails!.nmId
    const imtId = fb.productDetails?.imtId

    const entry = { feedback: fb, ageDays, v }
    pushTo(byNmId, nmId, entry)
    if (imtId && imtId > 0) pushTo(byImtId, imtId, entry)
  }

  const computeWeighted = (entries: typeof byNmId extends Map<unknown, infer T> ? T : never) => {
    // sort by ageDays asc = newest first (createdDate desc эквивалентно)
    const sorted = [...entries].sort((a, b) => a.ageDays - b.ageDays)
    let sumWeighted = 0
    let sumWeights = 0
    for (let i = 0; i < sorted.length; i++) {
      const w = i < WB_RATING_FORMULA.RECENT_FULL_WEIGHT ? 1 : wbDecayWeight(sorted[i].ageDays)
      sumWeighted += sorted[i].v * w
      sumWeights += w
    }
    return {
      rating: sumWeights > 0 ? round2(sumWeighted / sumWeights) : null,
      count: sorted.length,
      // diag для отладки:
      sumWeights: round2(sumWeights),
    }
  }

  // Сборка perNmId и perImtId через computeWeighted
  // ...
}
```

### 3.2. Главные дополнения к diagnostics

```typescript
export interface RatingsDiagnostics {
  // ... existing ...
  weightedRatingMethod: "wb-decay" | "simple-mean"  // флаг какой метод применён
  recentFullWeightCount: number      // обычно 15 (но при <15 отзывов = count)
  decayedFeedbackCount: number       // сколько отзывов получили вес < 1
  sumWeights: number                 // эффективный размер выборки (Σw)
  oldestIncludedDays: number         // самый старый учтённый отзыв в днях
}
```

`sumWeights` особенно полезен для мониторинга: если `count=1422` но `sumWeights=300` — это значит «эффективно учтено 300 отзывов с полным весом». Объясняет, почему добавление 100 старых отзывов почти не двигает рейтинг.

### 3.3. UI / отображение

- Хранить `rating` с точностью **2 знака** (для tooltip / debug).
- Для отображения витринного аналога — `rating.toFixed(1)` (как WB).
- В колонке таблицы показать `4.9` (округлённое), в hover-tooltip — `4.86 · 1360 отзывов · ∑w=287`.

---

## 4. Test cases

Все добавления в `tests/wb-ratings.test.ts`. NOW = `2026-05-15T00:00:00Z` (как уже зафиксировано).

### 4.1. Decay weight unit test (extract pure function)

```typescript
import { WB_RATING_FORMULA } from "@/lib/wb-ratings"

// Если экспортируем wbDecayWeight отдельно:
describe("wbDecayWeight", () => {
  it("d ≤ 182 → 1", () => {
    expect(wbDecayWeight(0)).toBe(1)
    expect(wbDecayWeight(100)).toBe(1)
    expect(wbDecayWeight(182)).toBe(1)
  })

  it("d > 182 → exp decay (verified WB constants)", () => {
    expect(wbDecayWeight(200)).toBeCloseTo(0.9271, 3)
    expect(wbDecayWeight(365)).toBeCloseTo(0.4632, 3)
    expect(wbDecayWeight(730)).toBeCloseTo(0.0998, 3)
    expect(wbDecayWeight(1095)).toBeCloseTo(0.0215, 3)
  })
})
```

### 4.2. Aggregator с decay

```typescript
it("применяет WB decay для отзывов >182 дней", () => {
  // 2 свежих 5★ + 1 старый 1★ (730 дней)
  // Без decay: avg = (5+5+1)/3 = 3.67
  // С decay: (5×1 + 5×1 + 1×0.1) / (1+1+0.1) = 10.1/2.1 ≈ 4.81
  const r = aggregateFeedbacks(
    [
      fb(1, 10, 5, { createdDate: "2026-05-14" }),  // d≈1
      fb(1, 10, 5, { createdDate: "2026-05-13" }),  // d≈2
      fb(1, 10, 1, { createdDate: "2024-05-15" }),  // d=730
    ],
    { now: NOW }
  )
  expect(r.perNmId.get(1)?.rating).toBeCloseTo(4.81, 2)
  expect(r.perNmId.get(1)?.count).toBe(3)  // count НЕ взвешен
})

it("первые 15 отзывов всегда w=1 (защита cold-start)", () => {
  // 20 отзывов 5★ за 730 дней назад. Без RECENT_FULL_WEIGHT все были бы с w≈0.1.
  // С 15-rule: первые 15 (свежие) w=1, остальные 5 w≈0.1.
  // rating всё равно = 5 (все оценки 5★).
  const recent15 = Array.from({ length: 15 }, (_, i) =>
    fb(1, 10, 5, { createdDate: "2026-05-14" })
  )
  const old5 = Array.from({ length: 5 }, () =>
    fb(1, 10, 5, { createdDate: "2024-05-15" })
  )
  const r = aggregateFeedbacks([...recent15, ...old5], { now: NOW })
  expect(r.perNmId.get(1)?.rating).toBe(5)
  expect(r.perNmId.get(1)?.count).toBe(20)
})

it("15-rule: 15 свежих 5★ + 1 старый 1★ → старый игнорируется почти", () => {
  // 15 свежих 5★ (w=1) + 1 старый 1★ d=730 (w=0.1)
  // (5×15 + 1×0.1) / (15+0.1) = 75.1/15.1 ≈ 4.97
  const recent = Array.from({ length: 15 }, () =>
    fb(1, 10, 5, { createdDate: "2026-05-14" })
  )
  const old1 = fb(1, 10, 1, { createdDate: "2024-05-15" })
  const r = aggregateFeedbacks([...recent, old1], { now: NOW })
  expect(r.perNmId.get(1)?.rating).toBeCloseTo(4.97, 2)
})

it("сортировка по дате: 15 ВЫШЕ по дате должны быть отобраны", () => {
  // 5 свежих 5★ + 12 старых 1★. По 15-rule 15 свежих идут с w=1.
  // У нас всего 17 — 5 свежих + 10 из старых попадут под «15 recent».
  // 5×5 + 10×1 (с w=1) = 35
  // 2×1 (с w≈0.1, оставшиеся 2 старых) ≈ 0.2
  // Σw = 5 + 10 + 0.2 = 15.2
  // rating = 35.2 / 15.2 ≈ 2.32
  const recent5 = Array.from({ length: 5 }, () =>
    fb(1, 10, 5, { createdDate: "2026-05-14" })
  )
  const old12 = Array.from({ length: 12 }, () =>
    fb(1, 10, 1, { createdDate: "2024-05-15" })
  )
  const r = aggregateFeedbacks([...recent5, ...old12], { now: NOW })
  expect(r.perNmId.get(1)?.rating).toBeCloseTo(2.32, 1)
})
```

### 4.3. Backwards-compat guards

```typescript
it("отзыв ровно d=182 → w=1 (граница)", () => {
  // создан 182 дня назад
  const date182 = new Date(NOW - 182 * 86_400_000).toISOString().slice(0, 10)
  const r = aggregateFeedbacks([fb(1, 10, 4, { createdDate: date182 })], { now: NOW })
  expect(r.perNmId.get(1)?.rating).toBe(4)
  expect(r.diagnostics.sumWeights).toBe(1)
})

it("отзыв на грани 2 лет (d=730) → исключается по age (как сейчас)", () => {
  // 730 дней — это РОВНО граница окна. Если стоит strict `<`, то 730 включён.
  const date730 = new Date(NOW - 730 * 86_400_000).toISOString().slice(0, 10)
  const r = aggregateFeedbacks([fb(1, 10, 4, { createdDate: date730 })], { now: NOW })
  // По текущему коду cutoff = now - 2*365*86400000, проверка `created < cutoff`.
  // 730 дней ≠ 2*365 (т.к. високосный); надо протестировать оба варианта.
  // Логически: WB говорит «за последние 2 года» — 730 дней (с учётом WB-документации).
  // Решение: либо менять TWO_YEARS_MS на 730*86400000, либо принять текущий 2*365 (=730 дней ровно).
})
```

### 4.4. Diagnostics

```typescript
it("diagnostics.sumWeights отражает эффективный размер выборки", () => {
  const r = aggregateFeedbacks([
    fb(1, 10, 5, { createdDate: "2026-05-14" }),  // w=1
    fb(1, 10, 5, { createdDate: "2025-05-14" }),  // d≈365, w≈0.46
    fb(1, 10, 5, { createdDate: "2024-05-15" }),  // d=730, w≈0.10
  ], { now: NOW })
  // По 15-rule все три попадают в «15 recent» → w=1 для всех!
  // Чтобы реально проверить decay, надо >15 отзывов в тесте.
  // Это важный edge case: 15-rule **переопределяет** decay для маленьких выборок.
  expect(r.diagnostics.sumWeights).toBe(3)
})
```

### 4.5. Integration test (если есть fixture с реальными WB feedback'ами)

Если есть test fixture для imt 1880284184:
```typescript
it("реплицирует WB rating 4.9 для imt 1880284184 (±0.1)", () => {
  const fixtures = JSON.parse(fs.readFileSync("tests/fixtures/imt-1880284184.json", "utf8"))
  const r = aggregateFeedbacks(fixtures, { now: Date.parse("2026-05-15") })
  const imtAgg = r.perImtId.get(1880284184)
  expect(imtAgg?.rating).toBeGreaterThanOrEqual(4.85)
  expect(imtAgg?.rating).toBeLessThanOrEqual(4.95)
})
```

---

## 5. Limitations & monitoring

### 5.1. Что мы GUESS vs знаем точно

| Аспект | Знание | Источник |
|--------|--------|----------|
| Формула decay coefficient | **KNOWN** | seller.wildberries.ru/instructions |
| 15-recent с w=1 | **KNOWN** | seller.wildberries.ru/instructions |
| 20 000 cap | **KNOWN, не релевантно для Zoiten** | seller.wildberries.ru/instructions |
| 2-year window | **KNOWN** | seller.wildberries.ru/instructions |
| Округление до 1 знака | **KNOWN** | seller.wildberries.ru/instructions |
| Фильтр «невалидных» (NLP) | **BLACK BOX** — не реплицировать | — |
| `state="wbRu"` = только ru-витрина | **GUESS HIGH** — логично, но не подтверждено WB | — |
| Дата = `createdDate` поля Feedbacks API | **GUESS HIGH** — но WB может использовать `publishedDate` (после модерации) | — |
| 15-recent выбирается **по publication date** или **по createdDate** | **GUESS** — мы используем createdDate (= то, что в API) | — |
| Region-aggregation: рейтинг ru-витрины считает только wbRu или **все** state-валидные | **GUESS HIGH** — выбрали wbRu | — |

### 5.2. Метрика для мониторинга «правильности» нашего расчёта

После реализации добавить в diagnostics:

```typescript
interface RatingDelta {
  imtId: number
  ourRating: number       // 4.86
  ourCount: number        // 1422
  wbRating: number        // 4.9 — если есть в БД (можно загрузить через Excel UI-отчёт)
  wbCount: number         // 1360
  deltaRating: number     // -0.04
  deltaCount: number      // 62
}
```

**Healthy state:**
- `|deltaRating|` ≤ 0.1 для 95%+ карточек
- `|deltaCount| / wbCount` ≤ 5% для 95%+ карточек

**Warning signal:**
- `deltaRating < -0.2` consistently → возможно WB поменял формулу или мы упускаем что-то
- `deltaCount > 10%` → возможно WB начал ещё агрессивнее фильтровать «невалидные»

**Где взять wbRating/wbCount для сравнения:** [отчёт «Оценка товара»](https://seller.wildberries.ru/instructions/ru/ru/material/item-ratings) — UI-only CSV из кабинета продавца. Можно ввести опциональный «sanity import» — загрузить раз в неделю и посчитать delta.

### 5.3. Что НЕ делать

- **Не добавлять «дополнительный» фильтр** на «бессодержательные» отзывы regex'ом (≥3 повторных символов и т.п.) — это NLP-задача, и наш regex наверняка отсечёт **не те же** отзывы, что WB. Лучше +5% known gap, чем -10% по другой причине.
- **Не пытаться угадать публикационную дату из `createdDate + X дней`** — `createdDate` в API всегда есть, оно достаточно близко к реальной публикации (модерация WB обычно <24ч).
- **Не подгонять параметры** (например, `FRESH_DAYS = 90` вместо 182) — это reverse-engineering и сломается при следующем изменении WB. Использовать **документированные константы**, и если WB их меняет — менять в одном месте.

### 5.4. Risk: формула может молча измениться

WB не уведомляет об изменении формулы (release notes WB не упоминали изменения с 2022 года). Если внезапно у всех карточек одновременно появится систематический `deltaRating` — первое, что проверить, это формула на seller-странице.

---

## Sources

### Primary (HIGH confidence)
- [WB Partners — Рейтинг товара](https://seller.wildberries.ru/instructions/ru/ru/material/product-rating) — официальная документация формулы (verified WebFetch)
- [WB Partners — Отчёт «Оценка товара»](https://seller.wildberries.ru/instructions/ru/ru/material/item-ratings) — UI-only альтернатива для sanity check
- Локальная numeric verification формулы (см. Bash run выше) — coefficients d=200→0.9271, d=365→0.4632, d=730→0.0998 совпадают с guruseller

### Secondary (MEDIUM confidence)
- [Guru Seller — Рейтинг товара на Wildberries: алгоритм расчёта](https://guruseller.ru/reyting-tovara-na-wildberries-algoritm-raschyota-ves-otzyvov-i-vliyanie-vremeni/) — независимая таблица коэффициентов, совпадает с моим расчётом
- [Habr Q&A — Рейтинг по отзывам Wildberries](https://qna.habr.com/q/1394812) — продавец репортит тот же gap (≈4.84 нам vs 4.6 WB), подтверждает что фильтр «невалидных» — black box
- [tech.news.am — Wildberries launches new method 2022](https://tech.news.am/eng/news/2777/wildberries-launches-new-method-of-calculating-product-ratings.html) — исторический анонс time-decay системы

### Tertiary (для контекста)
- [betapro.ru — Правила расчета рейтинга на Wildberries](https://betapro.ru/blog/novye-pravila-rascheta-rejtinga-na-wildberries-kak-uvelichit-vykupaemost-zakazov/) — конференция и продавец-overview
- [vc.ru — Тайна раскрыта: как WB исключает отзывы](https://vc.ru/trade/269655-tayna-raskryta-kak-wildberries-isklyuchaet-otzyvy-iz-reytinga) — старый пост о фильтре «невалидных»

---

## Metadata

**Confidence breakdown:**
- Time decay formula: **HIGH** — официальная WB-документация + numeric verification
- 15-recent override: **HIGH** — официальная WB-документация
- 2-year window: **HIGH** — уже реализован, формула подтверждает
- Filter невалидных: **black box, accept residual** — НИКТО не реплицировал успешно
- imt-level расчёт: **medium** — формула та же, но WB не публикует как именно агрегирует склейку (берёт ли он все nmId или их перевзвешивает)

**Что осталось проверить empirically (Wave 0 для PLAN.md):**
1. После реализации запустить sync, замерить `deltaRating` для всех карточек, есть ли он < 0.1
2. Проверить distribution по `state`: реально ли почти все feedback'и в `wbRu` или значимая часть в `wbBy`/др.
3. Распределение `ageDays` среди excluded-by-age — есть ли скачок около границы 730 дней (может WB использует точно 730, не 2*365)

**Research date:** 2026-05-15
**Valid until:** 2026-08-15 (формула стабильна с 2022, WB документация не менялась)
