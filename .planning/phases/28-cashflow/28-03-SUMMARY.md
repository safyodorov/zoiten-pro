---
phase: 28-cashflow
plan: "03"
subsystem: finance
tags: [cashflow, assumptions-bar, methodology, zod, server-action, rbac, appsetting]

requires:
  - phase: 28-cashflow
    plan: "01"
    provides: lib/finance-cashflow/engine.ts, types.ts, data.ts
  - phase: 28-cashflow
    plan: "02"
    provides: app/(dashboard)/finance/cashflow/page.tsx, CashflowKpiCards, CashflowChart, CashflowMatrix

provides:
  - lib/cashflow-schemas.ts — pure zod-схемы + CASHFLOW_SETTING_KEYS/DEFAULTS (без 'use server', vitest-загружаемый)
  - app/actions/cashflow.ts — updateCashflowSetting (MANAGE-гейт + zod + upsert + revalidatePath)
  - components/finance/CashflowAssumptionsBar.tsx — дебаунснутый редактор 4 допущений (MANAGE-only)
  - components/finance/CashflowMethodologyDialog.tsx — диалог «Как считается» ПДДС (всем)
  - docs/finance-cashflow-methodology.md — методология притоков/оттоков/тайминга/параметров
  - app/(dashboard)/finance/cashflow/page.tsx — дополнен canManage + initialSettings + оба компонента

affects: [/finance/cashflow]

tech-stack:
  added: []
  patterns:
    - "cashflow-schemas.ts — pure zod (паттерн pricing-schemas.ts): отдельно от 'use server' action"
    - "updateCashflowSetting — паттерн updateAppSetting: ActionResult + handleAuthError + safeParse + upsert updatedAt"
    - "CashflowAssumptionsBar — паттерн GlobalRatesBar: useRef-таймеры per-поле, debounce 500ms, startTransition, router.refresh"
    - "CashflowMethodologyDialog — паттерн BalanceMethodologyDialog: render-prop, sm:max-w, max-h overflow-y-auto"
    - "Двойная RBAC-защита: RSC canManage (бар не рендерится) + server action requireSection MANAGE (T-28-07)"

key-files:
  created:
    - lib/cashflow-schemas.ts
    - app/actions/cashflow.ts
    - components/finance/CashflowAssumptionsBar.tsx
    - components/finance/CashflowMethodologyDialog.tsx
    - docs/finance-cashflow-methodology.md
  modified:
    - app/(dashboard)/finance/cashflow/page.tsx

key-decisions:
  - "cashflow-schemas.ts — pure файл без 'use server': Next.js 15 не экспортирует sync-значения из 'use server'-файлов; отдельный schema-файл — паттерн pricing-schemas (vitest-загружаемый)"
  - "Двойная RBAC-защита T-28-07: canManage в page.tsx → бар не рендерится для VIEW; server action requireSection('FINANCE','MANAGE') → прямой вызов из VIEW-сессии отклоняется"
  - "initialSettings с fallback: Number(raw) + isFinite проверка + CASHFLOW_SETTING_DEFAULTS — защита от NaN при отсутствии AppSetting записи"

requirements-completed: []

duration: "402s (~7 мин)"
completed: "2026-07-05"
---

# Phase 28 Plan 03: Допущения ПДДС — AssumptionsBar + Методология

**Редактируемые допущения ПДДС (MANAGE-only): cashflow-schemas zod + updateCashflowSetting action + CashflowAssumptionsBar 500ms-дебаунс + CashflowMethodologyDialog + docs; интеграция в page.tsx через canManage.**

## Performance

- **Duration:** ~7 мин (402 сек)
- **Started:** 2026-07-05T19:53:51Z
- **Completed:** 2026-07-05T20:00:33Z
- **Tasks:** 3
- **Files modified:** 6 (создано 5, изменено 1)

## Accomplishments

- `lib/cashflow-schemas.ts` — pure zod (без 'use server'), 4 ключа CASHFLOW_SETTING_KEYS, per-ключ границы (payout 0-100, лаг 0-8 int, opex/gap 0..1e9), cashflowSettingSchema superRefine+transform, isValidCashflowSettingKey allow-list.
- `app/actions/cashflow.ts` — updateCashflowSetting: requireSection("FINANCE","MANAGE") + cashflowSettingSchema.safeParse + upsert (key/value/updatedAt, без createdAt) + revalidatePath("/finance/cashflow"). ActionResult + handleAuthError — паттерн pricing.ts.
- `components/finance/CashflowAssumptionsBar.tsx` — 4 поля (wbPayoutPct/wbPayoutLagWeeks/opexMonthlyRub/gapThresholdRub), useRef-таймеры per-поле debounce 500ms, startTransition, router.refresh() — паттерн GlobalRatesBar.
- `components/finance/CashflowMethodologyDialog.tsx` — sm:max-w-3xl, render-prop (не asChild), max-h-[70vh] overflow-y-auto, статический контент: притоки/оттоки/параметры/ограничения v1.
- `docs/finance-cashflow-methodology.md` — формула ядра, WB-тайминг (понедельник+лаг), wbPayoutPct 55% первое приближение, оттоки (закупки реал/вирт антидвойной счёт / кредиты / налоги 7%+1% / опекс), параметры таблицей, ограничения v1.
- `app/(dashboard)/finance/cashflow/page.tsx` — getSectionRole("FINANCE")→canManage, CASHFLOW_SETTING_KEYS в findMany, initialSettings с fallback на дефолты, CashflowMethodologyDialog в панели (всем), CashflowAssumptionsBar только при canManage.
- `npm run build` зелёный: /finance/cashflow = ƒ 11.7 kB (dynamic).
- `npx vitest run tests/finance-cashflow-engine.test.ts` — 5/5 green (движок не тронут).

## Task Commits

1. **Task 1: cashflow-schemas.ts (zod) + actions/cashflow.ts (MANAGE)** — `58e6387` (feat)
2. **Task 2: CashflowAssumptionsBar + CashflowMethodologyDialog + docs** — `2a8087e` (feat)
3. **Task 3: интеграция AssumptionsBar + MethodologyDialog в page.tsx** — `e27d918` (feat)

## Files Created/Modified

- `lib/cashflow-schemas.ts` — pure zod-схемы + ключи + дефолты допущений ПДДС
- `app/actions/cashflow.ts` — server action updateCashflowSetting (MANAGE + zod + upsert)
- `components/finance/CashflowAssumptionsBar.tsx` — дебаунснутый редактор 4 допущений
- `components/finance/CashflowMethodologyDialog.tsx` — диалог «Как считается» ПДДС
- `docs/finance-cashflow-methodology.md` — методология ПДДС (притоки/оттоки/параметры)
- `app/(dashboard)/finance/cashflow/page.tsx` — canManage + initialSettings + AssumptionsBar + MethodologyDialog

## Decisions Made

- **pure cashflow-schemas.ts** (без 'use server'): паттерн pricing-schemas.ts — Next.js 15 'use server' файлы не экспортируют sync-значения; vitest не может загружать auth chain
- **Двойная RBAC-защита T-28-07**: RSC canManage (бар не рендерится для VIEW) + server action requireSection("FINANCE","MANAGE") (прямой вызов из VIEW-сессии отклоняется на сервере)
- **initialSettings с NaN-fallback**: `Number.isFinite(n) && raw != null ? n : CASHFLOW_SETTING_DEFAULTS[key]` — защита от отсутствующих AppSetting записей (сид может не применяться на dev)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] grep-гейт: `asChild` в комментарии CashflowMethodologyDialog.tsx**
- **Found during:** Task 2 (проверка acceptance criteria)
- **Issue:** Первоначальный header-комментарий содержал строку «НЕ asChild» — grep-c "asChild" давал 1 вместо 0.
- **Fix:** Перефразирован комментарий: «render-prop (base-ui render-prop; sm:max-w-Nx обязателен)» без слова asChild.
- **Files modified:** `components/finance/CashflowMethodologyDialog.tsx`
- **Committed in:** `2a8087e` (Task 2 commit)

**2. [Rule 1 - Cleanup] Удалён неиспользуемый импорт `isValidCashflowSettingKey` из page.tsx**
- **Found during:** Task 3 (TypeScript check)
- **Issue:** Импорт `isValidCashflowSettingKey` добавлен согласно плану, но в page.tsx итерация идёт по `CASHFLOW_SETTING_KEYS` напрямую — функция не нужна.
- **Fix:** Убран из импортов page.tsx (TypeScript strict-mode не выдаёт ошибку на неиспользуемый import в Next.js RSC, но лишние импорты — плохая практика).
- **Files modified:** `app/(dashboard)/finance/cashflow/page.tsx`
- **Committed in:** `e27d918` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (Rule 1 — grep-гейт и неиспользуемый импорт)
**Impact on plan:** Минимальный — функциональность не менялась, только чистота кода.

## Threat Surface Scan

Угрозы T-28-07, T-28-08, T-28-09 покрыты:
- T-28-07: двойная защита реализована — canManage в page.tsx + requireSection("FINANCE","MANAGE") в action.
- T-28-08: isValidCashflowSettingKey allow-list + cashflowSettingSchema per-ключ границы (payout 0-100, лаг 0-8 int, opex/gap 0..1e9).
- T-28-09: updateCashflowSetting — единственная точка записи finance.cashflow.* ключей в фазе.

Новых угроз, не в threat_model, не обнаружено.

## Self-Check: PASSED

- [x] `lib/cashflow-schemas.ts` — существует
- [x] `app/actions/cashflow.ts` — существует
- [x] `components/finance/CashflowAssumptionsBar.tsx` — существует
- [x] `components/finance/CashflowMethodologyDialog.tsx` — существует
- [x] `docs/finance-cashflow-methodology.md` — существует
- [x] Коммиты 58e6387, 2a8087e, e27d918 — в git log
- [x] `npx tsc --noEmit` — 0 ошибок
- [x] `npm run build` — зелёный, /finance/cashflow = ƒ 11.7 kB
- [x] `npx vitest run tests/finance-cashflow-engine.test.ts` — 5/5 green

---
*Phase: 28-cashflow*
*Completed: 2026-07-05*
