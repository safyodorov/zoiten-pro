---
phase: quick-260708-mdd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - components/prices/PriceCalculatorTable.tsx
  - components/prices/PricingCalculatorDialog.tsx
autonomous: true
requirements:
  - QUICK-260708-mdd
must_haves:
  truths:
    - "На /prices/wb в таблице сразу после колонки «Комиссия ИУ, руб.» идут 2 новые колонки: «Комиссия оферта, %» и «Комиссия оферта, руб.»"
    - "Прежние колонки комиссии переименованы: «Комиссия, %» → «Комиссия ИУ, %», «Комиссия, руб.» → «Комиссия ИУ, руб.» (ключи commFbwPct/commissionAmount НЕ меняются)"
    - "Комиссия оферта % берётся из row.stdContext.commStdPct, Комиссия оферта руб. — из row.computedStd.commissionAmount"
    - "В модалке юнит-экономики строка «Комиссия» переименована в «Комиссия (ИУ)», input «Комиссия» → «Комиссия ИУ», а в std-блоке добавлена строка «Комиссия (оферта)»"
    - "Число ячеек thead === число td tbody (таблица не разъезжается): |SCROLL_COLUMNS| === |render-row|, обе +2"
  artifacts:
    - path: "components/prices/PriceCalculatorTable.tsx"
      provides: "2 новые std-колонки комиссии + переименование ИУ-колонок"
      contains: "commStdPct"
    - path: "components/prices/PricingCalculatorDialog.tsx"
      provides: "строка «Комиссия (оферта)» в std-блоке + переименование ИУ-меток"
      contains: "Комиссия (оферта)"
  key_links:
    - from: "SCROLL_COLUMNS (thead)"
      to: "render-row массив (tbody)"
      via: "идентичный порядок ColumnKey (commStdPct, commStdAmount после commissionAmount)"
      pattern: "commStdPct.*commStdAmount"
    - from: "render-row массив"
      to: "row.stdContext / row.computedStd"
      via: "commStdPct ?? 0 и commissionAmount ?? 0"
      pattern: "row\\.stdContext\\?\\.commStdPct"
---

<objective>
Показать на `/prices/wb` ОБЕ комиссии рядом: индивидуальные условия (ИУ) и оферту (стандартную). Прежние колонки/строки комиссии явно помечаются как «ИУ», рядом добавляются std-значения оферты.

Purpose: пользователь видит и договорную (ИУ), и офертную (стандартную) комиссию в одном месте — сравнение условий без переключений.
Output: изменённые `components/prices/PriceCalculatorTable.tsx` + `components/prices/PricingCalculatorDialog.tsx`, задеплоено на прод.

**Значения уже посчитаны и прокинуты** (`row.stdContext.commStdPct` = оферта %, `row.computedStd.commissionAmount` = оферта ₽). Задача — только отображение. НЕ трогать `page.tsx`-резолвинг, `lib/pricing-math.ts`, движок расчёта.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- Поля уже существуют, только читаем (подтверждено чтением кода): -->
<!-- PriceRow.stdContext.commStdPct: number (PriceCalculatorTable.tsx ~130) -->
<!-- PriceRow.computedStd?: PricingOutputs (опционально; page.tsx всегда заполняет) -->
<!-- PricingOutputs.commissionAmount: number (уже используется в таблице и модалке) -->

Табличные хелперы (PriceCalculatorTable.tsx):
- fmtPctSimple(n: number | null | undefined) → "12.3%" | "—"
- fmtMoneyInt(n: number) → целые рубли, ру-локаль

Модалочные хелперы (PricingCalculatorDialog.tsx, локальные):
- fmtMoney(n) → 2 знака, ру-локаль | "—"
- fmtPct(n) → "12.3%" | "—"
- liveOutputsStd = row.stdContext ? calculatePricingStandard(...) : null (внутри блока `{liveOutputsStd && (...)}` row.stdContext гарантированно есть)
</interfaces>

<current_structure>
<!-- ── PriceCalculatorTable.tsx ── (номера строк могут сдвинуться на ±пару) -->
1. COLUMN_KEYS (~280-312): хвост секции комиссии `..."commFbwPct", "commissionAmount", "drrPct"...`.
   Вставка 2 ключей МЕЖДУ `"commissionAmount"` и `"drrPct"`.
2. DEFAULT_WIDTHS (~318-356): `commFbwPct: 90, commissionAmount: 100, drrPct: 70,`.
   Вставка 2 ширин между `commissionAmount: 100` и `drrPct: 70`.
3. HIDEABLE_COLUMN_KEYS (~365-398): `..."commFbwPct", "commissionAmount", "drrPct"...`.
   Вставка 2 ключей между `"commissionAmount"` и `"drrPct"` (видимы по умолчанию — в default-hidden НЕ добавляем).
4. SCROLL_COLUMNS (~402-436, thead):
   `{ key: "commFbwPct", label: "Комиссия, %" }, { key: "commissionAmount", label: "Комиссия, руб." }, { key: "drrPct", ... }`.
   Переименовать 2 label + вставить 2 объекта ПОСЛЕ `commissionAmount`.
5. render-row массив в tbody (~1374-1410) — `[ColumnKey, string, string?][]`, порядок td СТРОГО === SCROLL_COLUMNS:
   `["commFbwPct", fmtPctSimple(row.commFbwPct)], ["commissionAmount", fmtMoneyInt(row.computed.commissionAmount)], ["drrPct", ...]`.
   Вставка 2 НЕЙТРАЛЬНЫХ ячеек (без 3-го элемента → нейтральный CELL_CLASS) ПОСЛЕ `commissionAmount`.
   `.filter(([k]) => !hiddenColumns.has(k))` подхватит новые ключи автоматически.

<!-- ── PricingCalculatorDialog.tsx ── -->
6. EDITABLE_PARAMS (~70): `{ key: "commissionPct", label: "Комиссия", unit: "%", ... }` → label "Комиссия ИУ".
7. OutputRow «Комиссия» (~551-554): `<OutputRow label="Комиссия" value={fmtMoney(liveOutputs.commissionAmount)} />` → label "Комиссия (ИУ)".
8. std-блок (~614-636): внутри `{liveOutputsStd && (...)}` есть `<dl className="space-y-1 ...">` со строками «Логистика туда/эфф./Хранение/Обратная логистика». Добавить «Комиссия (оферта)» ПЕРВОЙ строкой в этом `<dl>` (перед «Логистика туда»).
</current_structure>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Обе комиссии (ИУ + оферта) в таблице и модалке /prices/wb + деплой</name>
  <files>components/prices/PriceCalculatorTable.tsx, components/prices/PricingCalculatorDialog.tsx</files>
  <action>
Только отображение — данные (`row.stdContext.commStdPct`, `row.computedStd.commissionAmount`) уже прокинуты. НЕ трогать `lib/pricing-math.ts`, `page.tsx`-резолвинг, движок.

## Файл A — components/prices/PriceCalculatorTable.tsx (5 точек, инвариант |SCROLL_COLUMNS| === |render-row|)

**A1 — SCROLL_COLUMNS: переименовать ИУ-labels + вставить 2 новых объекта.**
Найти:
```
  { key: "commFbwPct", label: "Комиссия, %" },
  { key: "commissionAmount", label: "Комиссия, руб." },
```
Заменить на (ключи commFbwPct/commissionAmount НЕ меняются, только label; 2 новых объекта СРАЗУ ПОСЛЕ commissionAmount):
```
  { key: "commFbwPct", label: "Комиссия ИУ, %" },
  { key: "commissionAmount", label: "Комиссия ИУ, руб." },
  { key: "commStdPct", label: "Комиссия оферта, %" },
  { key: "commStdAmount", label: "Комиссия оферта, руб." },
```

**A2 — COLUMN_KEYS: вставить 2 ключа между `"commissionAmount"` и `"drrPct"`.**
```
  "commissionAmount",
  "commStdPct",
  "commStdAmount",
  "drrPct",
```

**A3 — DEFAULT_WIDTHS: вставить 2 ширины между `commissionAmount: 100,` и `drrPct: 70,`** (labels длиннее → чуть шире):
```
  commissionAmount: 100,
  commStdPct: 120,
  commStdAmount: 130,
  drrPct: 70,
```

**A4 — HIDEABLE_COLUMN_KEYS: вставить 2 ключа между `"commissionAmount"` и `"drrPct"`** (видимы по умолчанию — в default-hidden НЕ добавляем):
```
  "commissionAmount",
  "commStdPct",
  "commStdAmount",
  "drrPct",
```

**A5 — render-row массив (tbody): вставить 2 НЕЙТРАЛЬНЫЕ ячейки СРАЗУ ПОСЛЕ `commissionAmount`** (без 3-го элемента / без profitClass; nullable-safe `?? 0`, без `!`):
```
                        ["commissionAmount", fmtMoneyInt(row.computed.commissionAmount)],
                        ["commStdPct", fmtPctSimple(row.stdContext?.commStdPct ?? 0)],
                        ["commStdAmount", fmtMoneyInt(row.computedStd?.commissionAmount ?? 0)],
                        ["drrPct", fmtPctInt(row.drrPct)],
```
(Отступ = как у соседних элементов массива, ~24 пробела.)

**Инвариант (проверить глазами):** число объектов SCROLL_COLUMNS === число элементов render-row массива, обе +2. Порядок 2 новых ключей `commStdPct`, `commStdAmount` ОДИНАКОВ в COLUMN_KEYS / HIDEABLE / SCROLL_COLUMNS / render-row (в DEFAULT_WIDTHS порядок Record не важен, но оба ключа должны присутствовать — Record<ColumnKey,number> заставит tsc поймать пропуск).

## Файл B — components/prices/PricingCalculatorDialog.tsx (3 точки)

**B1 — EDITABLE_PARAMS (~70): input «Комиссия» → «Комиссия ИУ»** (ключ commissionPct НЕ меняется):
```
  { key: "commissionPct", label: "Комиссия ИУ", unit: "%", max: 100, step: "0.01" },
```

**B2 — OutputRow «Комиссия» (~551-554): label → «Комиссия (ИУ)»** (value без изменений):
```
                <OutputRow
                  label="Комиссия (ИУ)"
                  value={fmtMoney(liveOutputs.commissionAmount)}
                />
```

**B3 — std-блок (~619, внутри `{liveOutputsStd && (...)}`): добавить «Комиссия (оферта)» ПЕРВОЙ строкой в `<dl>`** (перед `<OutputRow label="Логистика туда" .../>`). commStdPct из row.stdContext (defensive `?? 0`), сумма из liveOutputsStd.commissionAmount; отдельного `fmt()` нет — inline через fmtPct + fmtMoney:
```
                  <dl className="space-y-1 text-xs tabular-nums">
                    <OutputRow
                      label="Комиссия (оферта)"
                      value={`${fmtPct(row.stdContext?.commStdPct ?? 0)} · ${fmtMoney(liveOutputsStd.commissionAmount)}`}
                    />
                    <OutputRow
                      label="Логистика туда"
                      value={fmtMoney(liveOutputsStd.logisticsToAmount ?? 0)}
                    />
```
(row.stdContext внутри `{liveOutputsStd && ...}` гарантированно есть — liveOutputsStd truthy только при row.stdContext; `?? 0` — страховка.)

НЕ трогать: `lib/pricing-math.ts`, `page.tsx`, ИУ-логику расчёта, sticky-колонки (photo/svodka/yarlyk/artikul), прочие std-строки (Логистика/Хранение/Обратная лог./Прибыль-std/ROI-std/Re-std).

## Гейты и деплой (деплой ДЕЛЕГИРОВАН, финальный шаг — правила CLAUDE.md «Правила деплоя»)
1. `npx tsc --noEmit` — 0 ошибок (Record<ColumnKey,number> поймает забытый ключ ширины).
2. `npm run test` — golden pricing-math (nmId 800750522) + sales-plan зелёные (регресс; движок не меняли).
3. Деплой:
   - `ssh root@85.198.97.89 "df -h /"` → минимум 5GB свободно.
   - `git add -A && git commit -m "feat(prices/wb): обе комиссии — ИУ + оферта (таблица + модалка)"` (заканчивая строкой Co-Authored-By как обычно).
   - `git push origin main`.
   - Деплой ТОЛЬКО detached: `ssh root@85.198.97.89 "cd /opt/zoiten-pro && nohup bash deploy.sh > /var/log/zoiten-deploy.log 2>&1 &"`.
   - Следить за логом до `==> Done`: `ssh root@85.198.97.89 "tail -f /var/log/zoiten-deploy.log"`.
   - `curl -so /dev/null -w "%{http_code}" https://zoiten.pro` → `200`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run test</automated>
  </verify>
  <done>
- `npx tsc --noEmit` — 0 ошибок; `npm run test` — все тесты зелёные (golden pricing-math nmId 800750522 + sales-plan без изменений).
- PriceCalculatorTable.tsx: ключи `commStdPct`/`commStdAmount` присутствуют в COLUMN_KEYS, DEFAULT_WIDTHS, HIDEABLE_COLUMN_KEYS, SCROLL_COLUMNS и render-row массиве — все между `commissionAmount` и `drrPct`. Labels commFbwPct/commissionAmount = «Комиссия ИУ, %»/«Комиссия ИУ, руб.». Новые: «Комиссия оферта, %» (fmtPctSimple(row.stdContext?.commStdPct ?? 0)), «Комиссия оферта, руб.» (fmtMoneyInt(row.computedStd?.commissionAmount ?? 0)), нейтральные ячейки, без non-null `!`.
- Число объектов SCROLL_COLUMNS === элементов render-row массива (thead/tbody совпадают, обе +2).
- PricingCalculatorDialog.tsx: input commissionPct label = «Комиссия ИУ»; OutputRow = «Комиссия (ИУ)»; в начале std-`<dl>` строка «Комиссия (оферта)» = fmtPct(commStdPct) · fmtMoney(liveOutputsStd.commissionAmount).
- Задеплоено: коммит запушен в origin/main, deploy.sh дошёл до `==> Done`, `curl https://zoiten.pro` → 200.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` — типы целы (Record<ColumnKey,number> заставит объявить ширины обоих новых ключей).
- `npm run test` — регресс pricing-math golden + sales-plan (движок расчёта не менялся).
- Прод: `curl https://zoiten.pro` → 200; на `/prices/wb` после «Комиссия ИУ, руб.» видны «Комиссия оферта, %» и «Комиссия оферта, руб.»; в модалке std-блок начинается со строки «Комиссия (оферта)».
</verification>

<success_criteria>
- Таблица /prices/wb показывает 4 колонки комиссии подряд: «Комиссия ИУ, %», «Комиссия ИУ, руб.», «Комиссия оферта, %», «Комиссия оферта, руб.» — офертные из row.stdContext.commStdPct / row.computedStd.commissionAmount.
- Модалка: строка/input комиссии помечены «(ИУ)», в std-блоке добавлена «Комиссия (оферта)».
- Ключи commFbwPct/commissionAmount/commissionPct не менялись; таблица не разъезжается (thead === tbody); tsc и тесты зелёные; задеплоено на прод (200).
</success_criteria>

<output>
После завершения создать `.planning/quick/260708-mdd-prices-wb/260708-mdd-SUMMARY.md`.
</output>
