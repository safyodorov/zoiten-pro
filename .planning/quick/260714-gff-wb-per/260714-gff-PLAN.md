---
phase: quick-260714-gff
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/finance-weekly/types.ts
  - lib/finance-weekly/engine.ts
  - lib/finance-weekly/jem-option.ts
  - lib/finance-weekly/data.ts
  - app/actions/finance-weekly.ts
  - components/finance/WeeklyFinReportControls.tsx
  - app/(dashboard)/finance/weekly/page.tsx
  - tests/finance-weekly-engine.test.ts
  - tests/finance-weekly-jem-option.test.ts
autonomous: true
requirements: [JEM-01, JEM-02, JEM-03, JEM-04, JEM-05]

must_haves:
  truths:
    - "Эффективная комиссия обоих сценариев (ИУ и Оферта) в отчёте = базовая комиссия + Опция Джем"
    - "Ставка Опции Джем задаётся per неделя (default 0.75 п.п.) с carry-forward с предыдущей заданной недели"
    - "MANAGE-пользователь редактирует «Опция Джем, %» в шапке /finance/weekly и сохраняет per неделя"
    - "Golden-тест nmId 165967746 (ИУ +523.6 / Оферта −2176.7) НЕ меняется — движок default jemOption = 0"
    - "Существующие 83+ finance-weekly теста остаются зелёными"
  artifacts:
    - path: "lib/finance-weekly/jem-option.ts"
      provides: "Pure carry-forward resolver + ключ AppSetting + дефолт 0.75"
      exports: ["DEFAULT_JEM_OPTION_PCT", "JEM_OPTION_PREFIX", "financeWeeklyJemOptionKey", "resolveJemOptionPct"]
    - path: "lib/finance-weekly/engine.ts"
      provides: "Аддитивное применение jemOptionPct к комиссии обоих сценариев"
      contains: "jemOptionPct"
    - path: "tests/finance-weekly-jem-option.test.ts"
      provides: "Unit-тест carry-forward логики"
  key_links:
    - from: "lib/finance-weekly/data.ts"
      to: "lib/finance-weekly/jem-option.ts"
      via: "resolveJemOptionPct(jemRows, weekStartISO) из AppSetting prefix"
      pattern: "resolveJemOptionPct"
    - from: "lib/finance-weekly/engine.ts"
      to: "commIuPct/commStdPct"
      via: "commPct + (c.jemOptionPct ?? 0)"
      pattern: "jemOptionPct"
    - from: "components/finance/WeeklyFinReportControls.tsx"
      to: "app/actions/finance-weekly.ts saveWeeklyPools"
      via: "opts.jemOptionPct → upsert financeWeekly.jemOptionPct.<week>"
      pattern: "jemOptionPct"
---

<objective>
Добавить в понедельный WB фин-отчёт (/finance/weekly) «Опцию Джем» — надбавку к комиссии WB (default 0.75 п.п.), которую компания платит WB за склейку карточек / общие отзывы. Надбавка прибавляется к базовой комиссии в ОБОИХ сценариях (ИУ и Оферта). Ставка редактируется per неделя без правок кода, с carry-forward с ближайшей предыдущей заданной недели.

Purpose: наши недельные комиссии сейчас на 0.74–0.75 п.п. НИЖЕ чем у экономиста в Excel (у него J уже включает опцию Джема). После внедрения комиссии обоих миров сойдутся с Excel копейка-в-копейку.

Output: pure carry-forward резолвер + аддитивное поле движка + редактируемое поле в шапке отчёта + тесты. Движок остаётся pure, контракт расширяется ТОЛЬКО аддитивно (diff-guard на engine.ts в гейтах проекта — не менять существующие формулы/поля).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- Ключевые контракты. Executor использует их напрямую — исследование кодовой базы не требуется. -->

lib/finance-weekly/types.ts — WeeklyConstants (движок применяет `{ ...DEFAULT_WEEKLY_CONSTANTS, ...inputs.constants }`):
```typescript
export interface WeeklyConstants {
  taxPct: number        // налог (% от K)
  jemPct: number        // тариф Джем (% от K) — СУЩЕСТВУЮЩЕЕ поле, per-unit статья, НЕ трогать
  defectPct: number     // брак (% от закупки O)
  acquiringPct: number  // эквайринг (% от K)
}
export const DEFAULT_WEEKLY_CONSTANTS: WeeklyConstants = { taxPct: 8, jemPct: 1, defectPct: 2, acquiringPct: 2.87 }
```
⚠ `jemPct` (тариф Джем, per-unit % от K) — это ДРУГАЯ сущность. Новое поле «Опция Джем» = надбавка к КОМИССИИ; назвать отчётливо `jemOptionPct`, не путать с `jemPct`.

lib/finance-weekly/engine.ts — точка входа + место применения комиссии:
```typescript
export function computeWeeklyFinReport(inputs: WeeklyFinReportInputs): WeeklyFinReportOutput {
  const c: WeeklyConstants = { ...DEFAULT_WEEKLY_CONSTANTS, ...inputs.constants }
  // ...
  // в цикле по article:
  const iuBreakdown  = computeScenario(article, common, article.commIuPct,  article.logisticsIuPerUnit)
  const stdBreakdown = computeScenario(article, common, article.commStdPct, article.logisticsStdPerUnit)
}
// computeScenario(article, common, commPct, logisticsPerUnit) —
//   cutPricePerUnit = K*(100-commPct)/100;  возвращает commissionPct: commPct
```

lib/finance-weekly/data.ts — возвращает WeeklyFinReportPageData; три return-сайта (нет marketplace / нет linkedNmIds / основной) все содержат `constants: DEFAULT_WEEKLY_CONSTANTS`. AppSetting: `{ key String @id, value String }`, Prisma `where: { key: { startsWith } }` доступен.

lib/finance-weekly/live.ts (НЕ менять): передаёт `constants: data.constants` в движок — jemOptionPct поедет автоматически через data.constants.

app/actions/finance-weekly.ts — образец `saveWeeklyPools(weekStartISO, pools, opts?: { clothingOverheadFixedRub?: number })`: RBAC `requireSection("FINANCE", "MANAGE")`, ISO_DATE_RE guard, upsert AppSetting, revalidatePath("/finance/weekly"). opts.clothingOverheadFixedRub — прецедент дополнительного ключа в том же action.

app/(dashboard)/finance/weekly/page.tsx — два render-пути: снапшот (props из `payload.*`) и live (props из `data.*`). Оба рендерят `<WeeklyFinReportControls>`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure-слой — jemOptionPct в движке + carry-forward резолвер + тесты</name>
  <files>lib/finance-weekly/types.ts, lib/finance-weekly/engine.ts, lib/finance-weekly/jem-option.ts, tests/finance-weekly-engine.test.ts, tests/finance-weekly-jem-option.test.ts</files>
  <behavior>
    Движок (finance-weekly-engine.test.ts, добавить describe-блок):
    - jemOptionPct=0.75 → breakdown.commissionPct ИУ = 32.25 (31.5+0.75), Оферта = 26.25 (25.5+0.75)
    - cutPricePerUnit падает ровно на K×0.75/100 = 88.116 ₽ в ОБОИХ сценариях против golden без опции
    - profit соответственно падает; golden БЕЗ constants (jemOptionPct отсутствует) — прежние значения (523.6 / −2176.7) НЕ меняются
    Carry-forward (новый tests/finance-weekly-jem-option.test.ts):
    - точный ключ недели задан → его значение
    - ключ недели отсутствует, есть предыдущая неделя → значение ближайшей ПРЕДЫДУЩЕЙ (max key < weekStart)
    - будущие недели (key > weekStart) игнорируются
    - ничего не задано → DEFAULT_JEM_OPTION_PCT (0.75)
    - нечисловое/повреждённое value → пропускается (не роняет резолв)
  </behavior>
  <action>
    1. lib/finance-weekly/types.ts — в интерфейс WeeklyConstants добавить ОПЦИОНАЛЬНОЕ поле (после acquiringPct):
       `jemOptionPct?: number  // Опция Джем — надбавка к комиссии WB (п.п.), обе сценария; движок default 0`
       НЕ добавлять его в DEFAULT_WEEKLY_CONSTANTS (default в движке = 0 через coalesce), чтобы golden-тест не менялся.
    2. lib/finance-weekly/engine.ts — в computeWeeklyFinReport, в цикле по article, ПЕРЕД вызовами computeScenario:
       `const jemOpt = c.jemOptionPct ?? 0`
       и передать эффективную комиссию: `computeScenario(article, common, article.commIuPct + jemOpt, ...)` и `article.commStdPct + jemOpt` для std. computeScenario НЕ менять — он уже отражает commissionPct = переданной эффективной комиссии и считает cutPricePerUnit от неё. Комментарий: «Опция Джем — аддитивная надбавка к комиссии обоих сценариев (совпадение с Excel J экономиста)».
    3. Создать lib/finance-weekly/jem-option.ts (PURE, БЕЗ импортов prisma/react/next — паттерн lib/finance-weekly/bank-pools.ts):
       - `export const DEFAULT_JEM_OPTION_PCT = 0.75`
       - `export const JEM_OPTION_PREFIX = "financeWeekly.jemOptionPct."`
       - `export function financeWeeklyJemOptionKey(weekStartISO: string): string { return JEM_OPTION_PREFIX + weekStartISO }`
       - `export function resolveJemOptionPct(rows: { key: string; value: string }[], weekStartISO: string): number` — среди rows с префиксом JEM_OPTION_PREFIX и конечным числовым value: если есть точный ключ недели → его значение; иначе взять значение строки с максимальным (лексикографически, ISO-даты сортируются как строки) ключом-датой < weekStartISO; иначе DEFAULT_JEM_OPTION_PCT. Отрицательные значения приводить к валидным ≥ 0 или пропускать (документировать выбор в комментарии).
    4. tests/finance-weekly-engine.test.ts — добавить describe-блок по behavior выше (goldenInputs + `constants: { jemOptionPct: 0.75 }`).
    5. tests/finance-weekly-jem-option.test.ts — новый файл, покрыть carry-forward по behavior выше.
  </action>
  <verify>
    <automated>npx vitest run tests/finance-weekly-engine.test.ts tests/finance-weekly-jem-option.test.ts</automated>
  </verify>
  <done>Оба тест-файла зелёные; golden-кейсы (523.6/−2176.7) не изменились; jem-option carry-forward покрыт; engine.ts расширен только аддитивно (существующие поля/формулы не тронуты).</done>
</task>

<task type="auto">
  <name>Task 2: Wiring — data.ts резолв + server action + поле в шапке + page.tsx</name>
  <files>lib/finance-weekly/data.ts, app/actions/finance-weekly.ts, components/finance/WeeklyFinReportControls.tsx, app/(dashboard)/finance/weekly/page.tsx</files>
  <action>
    1. lib/finance-weekly/data.ts:
       - import `{ resolveJemOptionPct, JEM_OPTION_PREFIX }` из "@/lib/finance-weekly/jem-option" и тип WeeklyConstants (уже импортируется).
       - Сразу после вычисления weekStartISO/weekEndISO подгрузить ключи-даты опции Джема и резолвнуть:
         `const jemRows = await prisma.appSetting.findMany({ where: { key: { startsWith: JEM_OPTION_PREFIX } }, select: { key: true, value: true } })`
         `const jemOptionPct = resolveJemOptionPct(jemRows, weekStartISO)`
         `const constants: WeeklyConstants = { ...DEFAULT_WEEKLY_CONSTANTS, jemOptionPct }`
         (Можно объединить с существующим первым await через Promise.all с marketplace findFirst — по усмотрению; главное, чтобы значение было доступно во ВСЕХ трёх return-сайтах.)
       - В интерфейс WeeklyFinReportPageData добавить `jemOptionPct: number  // Опция Джем — надбавка к комиссии (п.п.), для UI-шапки`.
       - Во ВСЕХ трёх return-объектах заменить `constants: DEFAULT_WEEKLY_CONSTANTS` на `constants` (локальную) и добавить поле `jemOptionPct`.
    2. app/actions/finance-weekly.ts — расширить saveWeeklyPools: сигнатура opts → `{ clothingOverheadFixedRub?: number; jemOptionPct?: number }`. После блока clothingOverheadFixedRub добавить симметричный блок: если `opts?.jemOptionPct !== undefined` и `Number.isFinite`, то `const jem = Math.max(0, Number(opts.jemOptionPct))` и upsert AppSetting по ключу `financeWeeklyJemOptionKey(weekStartISO)` (импортировать из "@/lib/finance-weekly/jem-option"), value = String(jem). ISO_DATE_RE guard уже есть в начале. revalidatePath уже есть. RBAC MANAGE уже есть.
    3. components/finance/WeeklyFinReportControls.tsx:
       - Добавить в Props `jemOptionPct: number`.
       - `const [jemOption, setJemOption] = useState(jemOptionPct)`.
       - В handleSave прокинуть в opts: `saveWeeklyPools(weekStartISO, pools, { clothingOverheadFixedRub: fixedCloth, jemOptionPct: jemOption })`.
       - Внутри редактора пулов (блок `canManage && !snapshot`), рядом с пулами (например в группе «Общее» или отдельной строкой перед пулами) добавить редактируемое поле «Опция Джем, %»: native `<input type="number" step="any">` (CLAUDE.md — НЕ base-ui), onChange → setJemOption(Number.isFinite(n)?n:0), с подписью-хинтом «надбавка к комиссии WB, обе сценария; по неделям» (стиль как у clothingOverheadFixedRub). Не смешивать с полями ManualPools (это не пул).
    4. app/(dashboard)/finance/weekly/page.tsx:
       - Live-путь: добавить проп `jemOptionPct={data.jemOptionPct}`.
       - Снапшот-путь: `jemOptionPct={payload.constants.jemOptionPct ?? 0.75}` (редактор в снапшот-режиме скрыт, значение используется только для инициализации при live-fallback — безопасный дефолт).
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run tests/finance-weekly-engine.test.ts tests/finance-weekly-jem-option.test.ts tests/finance-weekly-snapshot.test.ts</automated>
  </verify>
  <done>tsc чист; data.ts резолвит jemOptionPct с carry-forward и прокидывает в constants (→ движок через live.ts) и в PageData; saveWeeklyPools пишет ключ текущей недели; поле «Опция Джем, %» видно и сохраняется MANAGE-пользователю; снапшот-путь компилируется и рендерит без пересчёта.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` — без ошибок.
- `npm run test` — все finance-weekly тесты (83+) зелёные, включая golden (523.6 / −2176.7) и новый jem-option.
- Ручная сверка (после деплоя, пользователь): комиссии недели 06.07–12.07 в /finance/weekly совпадают с Excel экономиста (J у нас теперь = его J), профит обоих миров сходится.
- Движок расширен только аддитивно — diff-guard engine.ts в гейтах проекта проходит (существующие формулы/поля не тронуты).
</verification>

<success_criteria>
- Опция Джем прибавляется к комиссии обоих сценариев (ИУ и Оферта); дефолт движка = 0 (golden неизменен).
- Ставка per неделя из AppSetting `financeWeekly.jemOptionPct.<weekISO>`, carry-forward с ближайшей предыдущей недели, дефолт 0.75.
- Редактируемое поле «Опция Джем, %» в шапке /finance/weekly, RBAC FINANCE MANAGE, сохранение per текущая неделя, revalidatePath.
- Снапшот-режим не сломан (rows уже посчитаны; live-путь прокидывает jemOptionPct через data.constants).
- Все существующие тесты зелёные + новый carry-forward unit-тест.
</success_criteria>

<output>
После завершения создать `.planning/quick/260714-gff-wb-per/260714-gff-SUMMARY.md`.
</output>
