---
phase: quick-260703-qze
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/balance-data.ts
  - tests/balance-sheet.test.ts
autonomous: true
requirements: [QZE-RECEIVABLES-SPLIT]

must_haves:
  truths:
    - "В группе «Дебиторка» отображаются две строки: «Баланс WB (к перечислению)» и «Незакрытая неделя (продажи)»"
    - "Сумма двух строк = subtotalRub группы «Дебиторка» = totalRub снапшота (значение группы не меняется)"
    - "Когда снапшот на дату отсутствует, остаётся прежняя одна приблизительная строка «Дебиторка Wildberries»"
    - "npm run test — balance-sheet тест проходит"
  artifacts:
    - path: "lib/balance-data.ts"
      provides: "Две BalanceLine для дебиторки WB при наличии снапшота"
      contains: "receivables-wb-current"
    - path: "tests/balance-sheet.test.ts"
      provides: "Мок снапшота с balanceCurrentRub + weeklyTailRub"
      contains: "balanceCurrentRub"
  key_links:
    - from: "lib/balance-data.ts"
      to: "receivablesSnapshot.balanceCurrentRub / weeklyTailRub"
      via: "Number() приведение Decimal → number в amountRub"
      pattern: "receivablesSnapshot\\.(balanceCurrentRub|weeklyTailRub)"
---

<objective>
Разбить единственную строку «Дебиторка Wildberries» в балансе (`/finance/balance`) на две строки внутри группы «Дебиторка»:
1. Баланс WB к перечислению = `FinanceReceivablesSnapshot.balanceCurrentRub` (то, что видно в кабинете WB, ~35.76М ₽)
2. Хвост незакрытой недели = `FinanceReceivablesSnapshot.weeklyTailRub` (~10.37М ₽)

Итог группы «Дебиторка» (`subtotalRub`) НЕ меняется: `current + tail = totalRub`. Изменение чисто визуальное — детализация внутри группы.

Purpose: Пользователь видит, какая часть дебиторки уже подтверждена кабинетом WB (к перечислению), а какая — расчётный хвост незакрытой недели.
Output: Обновлённый `lib/balance-data.ts` + актуализированный мок в `tests/balance-sheet.test.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@lib/balance-data.ts
@tests/balance-sheet.test.ts

<interfaces>
<!-- Контракты из кодовой базы. Использовать напрямую — исследование не требуется. -->

Из lib/balance-data.ts (строки 99-107):
```typescript
export interface BalanceLine {
  key: string
  label: string
  amountRub: number
  currency?: "RUB" | "CNY"
  approximate?: boolean
  note?: string
}
```

Из lib/balance-data.ts (строки 143-146):
```typescript
/** Σ строк группы БЕЗ CNY-справочных строк (m4/Pitfall 2 — не в рублёвых итогах). */
function sumRubLines(lines: BalanceLine[]): number {
  return round2(lines.filter((l) => l.currency !== "CNY").reduce((s, l) => s + l.amountRub, 0))
}
```

Из prisma/schema.prisma (model FinanceReceivablesSnapshot, все поля Decimal(14,2)):
```
balanceCurrentRub     // Balance API `current`  → строка "к перечислению"
balanceForWithdrawRub // Balance API `for_withdraw` (не используется здесь)
weeklyTailRub         // Σ forPay незакрытой недели → строка "хвост"
totalRub              // current + weeklyTail (D-14) → subtotal группы
```

ТЕКУЩИЙ код (lib/balance-data.ts, строки 337-352) — заменяется в Задаче 1:
```typescript
const receivablesLine: BalanceLine = receivablesSnapshot
  ? { key: "receivables-wb", label: "Дебиторка Wildberries", amountRub: Number(receivablesSnapshot.totalRub) }
  : {
      key: "receivables-wb",
      label: "Дебиторка Wildberries",
      amountRub: 0,
      note: "нет снапшота на дату",
      approximate: true,
    }

const receivablesGroup: BalanceGroup = {
  key: "receivables",
  label: "Дебиторка",
  lines: [receivablesLine],
  subtotalRub: sumRubLines([receivablesLine]),
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Разбить строку дебиторки WB на current + tail в balance-data</name>
  <files>lib/balance-data.ts</files>
  <action>
Заменить блок построения `receivablesLine` + `receivablesGroup` (строки ~337-352) так, чтобы при наличии `receivablesSnapshot` группа «Дебиторка» содержала ДВЕ строки, а при отсутствии — прежнюю одну приблизительную строку.

Логика:
- Ветка `receivablesSnapshot != null` → массив `receivablesLines: BalanceLine[]` из двух элементов:
  - `{ key: "receivables-wb-current", label: "Баланс WB (к перечислению)", amountRub: Number(receivablesSnapshot.balanceCurrentRub) }`
  - `{ key: "receivables-wb-tail", label: "Незакрытая неделя (продажи)", amountRub: Number(receivablesSnapshot.weeklyTailRub) }`
- Ветка `receivablesSnapshot == null` → массив из одной прежней строки БЕЗ изменений:
  - `{ key: "receivables-wb", label: "Дебиторка Wildberries", amountRub: 0, note: "нет снапшота на дату", approximate: true }`

Затем:
```typescript
const receivablesGroup: BalanceGroup = {
  key: "receivables",
  label: "Дебиторка",
  lines: receivablesLines,
  subtotalRub: sumRubLines(receivablesLines),
}
```

`label` группы остаётся "Дебиторка". `subtotalRub` через `sumRubLines(receivablesLines)` естественно = current + tail = totalRub (обе строки RUB, не CNY). `Number()` приводит Prisma Decimal → number, как в текущем коде.

Комментарии/строки на русском по конвенции проекта. Компонент-рендерер `components/finance/BalanceSheetTable.tsx` НЕ трогать — он итерирует `group.lines` дженерик, ключи сравнения `${group.key}:${line.key}` работают per-line на обе даты.
  </action>
  <verify>
    <automated>npx vitest run tests/balance-sheet.test.ts</automated>
  </verify>
  <done>В `lib/balance-data.ts` при наличии снапшота группа «Дебиторка» содержит две строки с ключами `receivables-wb-current` и `receivables-wb-tail`; `subtotalRub` = current + tail; ветка без снапшота не изменена; тест balance-sheet проходит (после Task 2).</done>
</task>

<task type="auto">
  <name>Task 2: Обновить мок снапшота дебиторки в balance-sheet тесте</name>
  <files>tests/balance-sheet.test.ts</files>
  <action>
В моке `prisma.financeReceivablesSnapshot.findUnique` (строки ~144-147) сейчас резолвится `{ date: ASOF, totalRub: 8000 }`. Добавить поля, из которых теперь строятся две строки:

```typescript
vi.mocked(prisma.financeReceivablesSnapshot.findUnique).mockResolvedValueOnce({
  date: ASOF,
  balanceCurrentRub: 5000,
  weeklyTailRub: 3000,
  totalRub: 8000,
} as unknown as never)
```

Сумма `5000 + 3000 = 8000` — существующая проверка `receivables subtotal === 8000` (строка ~208) остаётся валидной.

Добавить проверку детализации в подходящий `it(...)` (например рядом с проверкой subtotal дебиторки): группа `receivables` теперь содержит ровно 2 строки с ключами `receivables-wb-current` (5000) и `receivables-wb-tail` (3000). Пример:
```typescript
const rec = sheet.assets.groups.find((g) => g.key === "receivables")!
expect(rec.lines).toHaveLength(2)
expect(rec.lines.find((l) => l.key === "receivables-wb-current")!.amountRub).toBeCloseTo(5000, 2)
expect(rec.lines.find((l) => l.key === "receivables-wb-tail")!.amountRub).toBeCloseTo(3000, 2)
```
Использовать доступ к `sheet` тем же способом, что и соседние проверки (внутри `it` вызывается `await loadBalanceSheet(ASOF)`).
  </action>
  <verify>
    <automated>npx vitest run tests/balance-sheet.test.ts</automated>
  </verify>
  <done>Мок снапшота содержит `balanceCurrentRub: 5000, weeklyTailRub: 3000, totalRub: 8000`; добавлена проверка на 2 строки дебиторки с новыми ключами; тест balance-sheet проходит.</done>
</task>

</tasks>

<verification>
- `npx vitest run tests/balance-sheet.test.ts` проходит (все проверки balance-sheet, включая golden-инварианты капитал = активы − пассивы).
- Ручная проверка (опц.): `/finance/balance` — в группе «Дебиторка» две строки, их сумма = прежнему значению дебиторки.

Примечание: в репозитории есть ПРЕДСУЩЕСТВУЮЩИЕ падения тестов, не связанные с этим изменением (см. CLAUDE.md/deferred). Verify скоупится на файл `tests/balance-sheet.test.ts`, а не на полностью зелёный `npm run test`.
</verification>

<success_criteria>
- Группа «Дебиторка» на `/finance/balance` показывает две строки: «Баланс WB (к перечислению)» (= balanceCurrentRub) и «Незакрытая неделя (продажи)» (= weeklyTailRub).
- `subtotalRub` группы не изменился (= totalRub снапшота).
- Ветка без снапшота работает как раньше (одна приблизительная строка).
- `tests/balance-sheet.test.ts` зелёный.
</success_criteria>

<output>
После завершения создать `.planning/quick/260703-qze-receivables-split-current-tail/260703-qze-SUMMARY.md`
</output>
