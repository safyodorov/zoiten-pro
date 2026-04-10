---
phase: quick/260410-leh-wb-globalratesbar
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - components/prices/PriceCalculatorTable.tsx
  - components/prices/GlobalRatesBar.tsx
autonomous: false
requirements:
  - FIX-WB-COL-WIDTH
  - FIX-GLOBAL-RATES-LAYOUT
must_haves:
  truths:
    - "На странице /prices/wb колонка Фото занимает ровно ~128px и картинка товара рендерится в w-28 h-[150px] (112×150) без сжатия"
    - "Колонка Сводка занимает ровно ~200px (уже чем прежние w-60=240px, но достаточно для 3 строк текста)"
    - "Колонка Ярлык занимает ~72px, колонка Артикул ~112px"
    - "Sticky offsets согласованы с реальными ширинами: Сводка left=128, Ярлык left=328, Артикул left=400, конец sticky-зоны=512px"
    - "Блок GlobalRatesBar не растягивается на всю ширину экрана — 6 полей сидят слева flex-wrap'ом с естественной шириной"
  artifacts:
    - path: "components/prices/PriceCalculatorTable.tsx"
      provides: "Фиксированные min-width на th/td + согласованные sticky left offsets"
      contains: "min-w-[128px]"
    - path: "components/prices/GlobalRatesBar.tsx"
      provides: "flex flex-wrap layout для 6 input-полей"
      contains: "flex flex-wrap"
  key_links:
    - from: "th.Фото (PriceCalculatorTable.tsx L218)"
      to: "td.Фото (L290-292)"
      via: "одинаковый min-w-[128px] + sticky left-0"
      pattern: "min-w-\\[128px\\]"
    - from: "th.Сводка (L222)"
      to: "td.Сводка (L311-313)"
      via: "одинаковый min-w-[200px] + sticky left-[128px]"
      pattern: "min-w-\\[200px\\]"
    - from: "GlobalRatesBar.tsx L97"
      to: "visual layout"
      via: "flex flex-wrap вместо grid-cols-3/6"
      pattern: "flex flex-wrap"
---

<objective>
Починить две UI-проблемы на production странице https://zoiten.pro/prices/wb:

1. **Ширина sticky-колонок таблицы PriceCalculatorTable** — колонки Фото/Сводка/Ярлык/Артикул не соблюдают заданные `w-32`/`w-60`/`w-20`/`w-28` из-за `table-layout: auto`. Фактически Фото сжимается до 47px (вместо 128px), картинка товара рендерится 30×150 вместо 112×150. Сводка (w-60=240px) по словам пользователя слишком широкая — нужно 200px.

2. **GlobalRatesBar растягивается на всю ширину** — `grid grid-cols-3 md:grid-cols-6` раскидывает 6 полей через весь экран. Нужно собрать их слева `flex flex-wrap`'ом.

Purpose: Страница управления ценами WB становится визуально корректной и удобной для работы.
Output: 2 изменённых файла, задеплоено на VPS, визуально проверено через Chrome MCP.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@components/prices/PriceCalculatorTable.tsx
@components/prices/GlobalRatesBar.tsx

# Контекст задачи
- Production URL: https://zoiten.pro/prices/wb
- Деплой: `ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"`
- Фаза 7 (prices-wb) полностью завершена, это post-release полировка UI
- Язык коммитов/комментариев: русский

# Диагностика ширин (измерено через Chrome MCP getBoundingClientRect)
- Фото: 47px (ожидалось 128px) — картинка 30×150 вместо 112×150
- Сводка: 112px (ожидалось 240px, но пользователь просит сузить до 200px)
- Ярлык: 63px (ожидалось 80px)
- Артикул: 76px (ожидалось 112px)

# Причина
`<table>` без явного `table-layout: fixed` использует auto-layout, который распределяет ширину по содержимому. Классы `w-32`/`w-60` на `<th>`/`<td>` работают только как hint, а не constraint. Решение — использовать `min-w-[...]` (минимальная ширина не даёт колонке сжиматься ниже порога).

# Sticky offsets arithmetic (новые значения)
- Фото:    left=0,      width=128 → sticky left-0
- Сводка:  left=128,    width=200 → sticky left-[128px] (было left-32 = 128px, совпадает)
- Ярлык:   left=328,    width=72  → sticky left-[328px] (было left-[368px])
- Артикул: left=400,    width=112 → sticky left-[400px] (было left-[448px])
- Конец sticky-зоны: 512px

# Почему именно min-w-[...], а не table-layout: fixed
Table-layout: fixed требует явных ширин всех колонок (включая 26 расчётных), иначе они делят остаток поровну. Min-width на конкретных th/td — минимальное вмешательство, остальные колонки продолжают auto-распределяться.
</context>

<tasks>

<task type="auto">
  <name>Задача 1: Починить ширины sticky-колонок в PriceCalculatorTable.tsx</name>
  <files>components/prices/PriceCalculatorTable.tsx</files>
  <action>
Открыть `components/prices/PriceCalculatorTable.tsx` и внести следующие точечные изменения через Edit tool:

**1. Заголовки таблицы (thead, строки 217-232):**

L218 (th Фото) — заменить `w-32` на `min-w-[128px] w-[128px]`:
```
className="sticky left-0 z-40 bg-background border-r min-w-[128px] w-[128px] px-2 py-2 text-xs font-medium text-muted-foreground text-left"
```

L222 (th Сводка) — заменить `left-32 ... w-60` на `left-[128px] ... min-w-[200px] w-[200px]`:
```
className="sticky left-[128px] z-40 bg-background border-r min-w-[200px] w-[200px] px-3 py-2 text-xs font-medium text-muted-foreground text-left"
```

L226 (th Ярлык) — заменить `left-[368px] ... w-20` на `left-[328px] ... min-w-[72px] w-[72px]`:
```
className="sticky left-[328px] z-40 bg-background border-r min-w-[72px] w-[72px] px-2 py-2 text-xs font-medium text-muted-foreground text-left"
```

L230 (th Артикул) — заменить `left-[448px] ... w-28` на `left-[400px] ... min-w-[112px] w-[112px]`:
```
className="sticky left-[400px] z-40 bg-background border-r min-w-[112px] w-[112px] px-2 py-2 text-xs font-medium text-muted-foreground text-left"
```

Также обновить комментарии над каждым th (строки 217, 221, 225, 229) чтобы числа в них соответствовали новой раскладке:
- L217: `{/* Sticky 1: Фото (128px) */}`
- L221: `{/* Sticky 2: Сводка (left 128, width 200 → 328) */}`
- L225: `{/* Sticky 3: Ярлык (left 328, width 72 → 400) */}`
- L229: `{/* Sticky 4: Артикул (left 400, width 112 → 512) */}`

**2. Tbody ячейки (td, строки 289-357):**

L290-292 (td Фото) — заменить `w-32` на `min-w-[128px] w-[128px]`:
```
className="sticky left-0 z-10 bg-background border-r min-w-[128px] w-[128px] align-top p-2 group-hover:bg-muted/50"
```

L311-313 (td Сводка) — заменить `left-32 ... w-60` на `left-[128px] ... min-w-[200px] w-[200px]`:
```
className="sticky left-[128px] z-10 bg-background border-r min-w-[200px] w-[200px] align-top p-3 group-hover:bg-muted/50"
```

L339-341 (td Ярлык) — заменить `left-[368px] ... w-20` на `left-[328px] ... min-w-[72px] w-[72px]`:
```
className="sticky left-[328px] z-10 bg-background border-r min-w-[72px] w-[72px] align-top p-2 text-sm group-hover:bg-muted/50"
```

L351-353 (td Артикул) — заменить `left-[448px] ... w-28` на `left-[400px] ... min-w-[112px] w-[112px]`:
```
className="sticky left-[400px] z-10 bg-background border-r min-w-[112px] w-[112px] align-top p-2 font-mono text-xs group-hover:bg-muted/50"
```

**Важные примечания:**
- Оба класса `min-w-[...]` и `w-[...]` нужны: `min-w` не даёт сжиматься при нехватке места, `w-` устанавливает preferred width для table auto-layout
- `w-28` для картинки товара внутри td Фото (L300 `<img className="w-28 h-[150px] ...">`) не меняется — 112px картинка внутри 128px td с padding p-2 помещается корректно
- НЕ трогать другие классы (z-index, bg-background, border-r, padding, text-alignment) — только width/left

**Верификация изменений:**
После правок проверь grep'ом что старых значений нет:
- `left-32` — должно остаться только в tailwind standard (проверь что это sticky `left-[128px]`)
- `left-[368px]`, `left-[448px]`, `w-60`, `w-32` (на sticky колонках), `w-20` (на sticky Ярлык), `w-28` (на sticky Артикул) — не должно остаться

Запустить type-check для подтверждения что JSX корректен.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -E "PriceCalculatorTable|error TS" | head -20</automated>
  </verify>
  <done>
- Все 4 пары th/td используют `min-w-[...] w-[...]` вместо `w-32`/`w-60`/`w-20`/`w-28`
- Sticky left offsets: 0 / 128 / 328 / 400 (согласованы с новыми ширинами 128/200/72/112)
- `npx tsc --noEmit` не выдаёт новых ошибок в PriceCalculatorTable.tsx
- Grep подтверждает отсутствие старых offsets (`left-[368px]`, `left-[448px]`)
  </done>
</task>

<task type="auto">
  <name>Задача 2: Собрать GlobalRatesBar слева через flex flex-wrap</name>
  <files>components/prices/GlobalRatesBar.tsx</files>
  <action>
Открыть `components/prices/GlobalRatesBar.tsx` и через Edit tool заменить на L97:

**Было:**
```tsx
<div className="grid grid-cols-3 md:grid-cols-6 gap-4">
```

**Стало:**
```tsx
<div className="flex flex-wrap gap-4">
```

Это изменение позволит 6 полям-редакторам ставок (каждый с `w-20` input внутри) сесть слева компактной группой с естественной шириной вместо растягивания через всю ширину экрана:
- На широких экранах: все 6 полей в одном ряду слева, справа остаётся пустое место
- На узких экранах: flex-wrap автоматически переносит поля на следующую строку

Остальные классы внутри (`Card className="p-4 bg-muted/30 border"`, `flex flex-col gap-1` для каждого поля, `w-20` на Input) — НЕ трогать.

Запустить type-check для подтверждения.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -E "GlobalRatesBar|error TS" | head -20</automated>
  </verify>
  <done>
- L97 содержит `className="flex flex-wrap gap-4"` вместо grid layout
- `npx tsc --noEmit` не выдаёт новых ошибок
  </done>
</task>

<task type="auto">
  <name>Задача 3: Коммит + деплой на VPS</name>
  <files>components/prices/PriceCalculatorTable.tsx, components/prices/GlobalRatesBar.tsx</files>
  <action>
**Шаг 1 — Запустить полный type-check и build sanity:**
```bash
npx tsc --noEmit
```
Если есть ошибки — остановиться и показать пользователю.

**Шаг 2 — Создать коммит** через gsd-tools:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "fix(prices-wb): починить ширины колонок таблицы + собрать GlobalRatesBar слева

- PriceCalculatorTable: заменить w-32/w-60/w-20/w-28 на min-w-[...] w-[...] для sticky колонок
  (table-layout: auto игнорировал width классы, Фото сжималось до 47px вместо 128px)
- Сузить колонку Сводка с 240px до 200px по фидбеку пользователя
- Пересчитать sticky left offsets: 0 / 128 / 328 / 400 (раньше 0 / 128 / 368 / 448)
- GlobalRatesBar: заменить grid grid-cols-3/6 на flex flex-wrap — 6 полей собраны слева
  вместо растягивания на всю ширину экрана" --files components/prices/PriceCalculatorTable.tsx components/prices/GlobalRatesBar.tsx
```

**Шаг 3 — Запушить на remote** (если GSD настроен на auto-push, шаг пропускается, иначе):
```bash
git push
```

**Шаг 4 — Задеплоить на VPS:**
```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
```

Деплой обычно занимает 2-4 минуты (git pull, npm ci --omit=dev, next build, systemctl restart zoiten-erp). Дождись завершения команды.

**Шаг 5 — Проверить что сервис поднялся:**
```bash
ssh root@85.198.97.89 "systemctl is-active zoiten-erp && curl -sI https://zoiten.pro/prices/wb | head -3"
```

Ожидаемый результат: `active` + `HTTP/2 200` (или 307 redirect на login если сессии нет — это тоже OK, значит сервер живой).
  </action>
  <verify>
    <automated>ssh root@85.198.97.89 "systemctl is-active zoiten-erp"</automated>
  </verify>
  <done>
- Коммит создан с сообщением на русском языке
- Деплой прошёл без ошибок (сервис active)
- https://zoiten.pro/prices/wb отвечает 200/307
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Задача 4: Визуальная проверка через Chrome MCP + подтверждение пользователя</name>
  <what-built>
Зафикшены две UI-проблемы на /prices/wb:
1. Ширины sticky-колонок таблицы PriceCalculatorTable (Фото 128px / Сводка 200px / Ярлык 72px / Артикул 112px) с согласованными sticky offsets
2. GlobalRatesBar: 6 полей собраны слева через flex flex-wrap вместо растягивания на всю ширину
  </what-built>
  <how-to-verify>
**Через Chrome MCP (автоматическая часть проверки перед передачей пользователю):**

1. Открыть https://zoiten.pro/prices/wb в Chrome MCP
2. Выполнить в evaluate:
```js
const photoTh = document.querySelector('th.sticky.left-0');
const svodkaTh = document.querySelector('th.sticky.left-\\[128px\\]');
const yarlykTh = document.querySelector('th.sticky.left-\\[328px\\]');
const artikulTh = document.querySelector('th.sticky.left-\\[400px\\]');
const img = document.querySelector('td.sticky.left-0 img');
const ratesBar = document.querySelector('[class*="flex-wrap"]');
JSON.stringify({
  photo: photoTh?.getBoundingClientRect().width,
  svodka: svodkaTh?.getBoundingClientRect().width,
  yarlyk: yarlykTh?.getBoundingClientRect().width,
  artikul: artikulTh?.getBoundingClientRect().width,
  img: img ? { w: img.getBoundingClientRect().width, h: img.getBoundingClientRect().height } : null,
  ratesBarFound: !!ratesBar,
});
```

**Ожидаемые значения:**
- photo ≈ 128 (±2 от padding)
- svodka ≈ 200
- yarlyk ≈ 72
- artikul ≈ 112
- img: { w: ~112, h: 150 }
- ratesBarFound: true

3. Сделать скриншот страницы и приложить к резюме.

**Передать пользователю для финального подтверждения:**

Показать пользователю:
- Метрики ширин из Chrome MCP
- Скриншот таблицы (sticky-колонки + первые 2-3 не-sticky)
- Скриншот GlobalRatesBar в контексте всей страницы (чтобы увидеть что не растягивается)

Задать вопросы:
- «Фото теперь корректной ширины (≈128px)? Картинка не сжата?»
- «Сводка 200px — в самый раз или надо ещё сузить/расширить?»
- «GlobalRatesBar сидит слева как ожидалось?»
- «Горизонтальный скролл работает? Sticky колонки остаются на месте?»
  </how-to-verify>
  <resume-signal>Пользователь пишет «ок» / «approved» / описывает что ещё нужно поправить</resume-signal>
</task>

</tasks>

<verification>
После выполнения всех задач:
- [ ] `npx tsc --noEmit` проходит без новых ошибок
- [ ] Коммит в git содержит только 2 файла (PriceCalculatorTable.tsx + GlobalRatesBar.tsx)
- [ ] Деплой на VPS прошёл, сервис `zoiten-erp` в статусе `active`
- [ ] Chrome MCP подтверждает ширины колонок (128 / 200 / 72 / 112 ±2px)
- [ ] Картинка товара рендерится 112×150 (не 30×150)
- [ ] GlobalRatesBar использует flex-wrap и не растягивается
- [ ] Пользователь подтвердил визуально
</verification>

<success_criteria>
- Ширина Фото на /prices/wb ≈ 128px (ранее 47px) — картинки товаров видны нормально
- Ширина Сводки ≈ 200px (ранее 112px фактически, 240px декларативно) — достаточно для 3 строк текста без излишеств
- Ширины Ярлык ≈ 72px, Артикул ≈ 112px — согласованы с sticky offsets
- Sticky-колонки остаются на своих местах при горизонтальном скролле расчётной области
- GlobalRatesBar занимает столько ширины, сколько нужно 6 полям + gap'ам (не растягивается на всю ширину)
- Production https://zoiten.pro/prices/wb работает, пользователь подтвердил визуально
</success_criteria>

<output>
После завершения создать `.planning/quick/260410-leh-wb-globalratesbar/260410-leh-SUMMARY.md` с:
- Списком изменений по каждому файлу
- Метриками ширин «до» и «после» из Chrome MCP
- Хэшем коммита и временем деплоя
- Скриншотами (если были сохранены)
- Фидбеком пользователя (если запросил доп. корректировки)
</output>
