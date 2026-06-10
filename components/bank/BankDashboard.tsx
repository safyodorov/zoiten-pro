// components/bank/BankDashboard.tsx
// Phase 22 (22-06): Дашборд-сводка банковского раздела.
// Агрегаты вычисляются на сервере в page.tsx и передаются как props.
// Показывает: остатки по счетам per-компания (по валютам), приход/расход
// за 7 и 30 дней, дату последнего обновления.
// Pure server component — нет состояния и client-only API.

// ── Types ─────────────────────────────────────────────────────────────────

export interface CompanyBalances {
  companyName: string
  /** Сумма closingBalance по счетам компании, разбитая по валютам */
  balancesByCurrency: Partial<Record<string, number>>
}

export interface CompanyFlow {
  companyName: string
  /** Приход за 7 дней (RUR), руб */
  income7d: number
  /** Расход за 7 дней (RUR), руб */
  expense7d: number
  /** Приход за 30 дней (RUR), руб */
  income30d: number
  /** Расход за 30 дней (RUR), руб */
  expense30d: number
}

export interface BankDashboardData {
  /** Дата последнего обновления (MAX balanceDate или MAX tx.date) */
  anchorDate: string | null
  /** Остатки per-компания (только счета с closingBalance != null) */
  companyBalances: CompanyBalances[]
  /** Суммарный остаток по всем компаниям, разбитый по валютам */
  grandTotalByCurrency: Partial<Record<string, number>>
  /** Приход/расход per-компания за 7 и 30 дней (только RUR) */
  companyFlows: CompanyFlow[]
  /** Суммарный приход/расход (RUR) по всем компаниям */
  grandFlow: {
    income7d: number
    expense7d: number
    income30d: number
    expense30d: number
  }
}

// ── Форматирование ────────────────────────────────────────────────────────

const RUB_FMT = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })
const CNY_FMT = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })

function fmtRub(v: number): string {
  return RUB_FMT.format(v) + " ₽"
}

function fmtCny(v: number): string {
  return CNY_FMT.format(v) + " ¥"
}

function fmtByCurrency(currency: string, v: number): string {
  if (currency === "CNY") return fmtCny(v)
  return fmtRub(v)
}

// ── Component ──────────────────────────────────────────────────────────────

export function BankDashboard({ data }: { data: BankDashboardData }) {
  const { anchorDate, companyBalances, grandTotalByCurrency, companyFlows, grandFlow } = data

  // Определяем показываемые валюты — всегда RUR первой, CNY если есть
  const allCurrencies = Object.keys(grandTotalByCurrency).sort((a, b) => {
    if (a === "RUR") return -1
    if (b === "RUR") return 1
    return a.localeCompare(b)
  })

  // Список всех компаний (объединение balances + flows для полноты)
  const allCompanyNames = Array.from(
    new Set([
      ...companyBalances.map((c) => c.companyName),
      ...companyFlows.map((c) => c.companyName),
    ]),
  ).sort()

  // Вспомогательные геттеры
  function getBalance(companyName: string): Partial<Record<string, number>> {
    return companyBalances.find((c) => c.companyName === companyName)?.balancesByCurrency ?? {}
  }
  function getFlow(companyName: string): CompanyFlow {
    return (
      companyFlows.find((c) => c.companyName === companyName) ?? {
        companyName,
        income7d: 0,
        expense7d: 0,
        income30d: 0,
        expense30d: 0,
      }
    )
  }

  const hasRur = allCurrencies.includes("RUR")
  const hasCny = allCurrencies.some((c) => c === "CNY")

  return (
    <div className="flex flex-col gap-2">
      {/* ── Строка заголовка с датой ─────────────────────────────────────── */}
      {anchorDate && (
        <div className="text-xs text-muted-foreground">
          Обновлено:{" "}
          <span className="font-medium text-foreground">
            {new Date(anchorDate).toLocaleDateString("ru-RU", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              timeZone: "Europe/Moscow",
            })}
          </span>
        </div>
      )}

      {/* ── Карточки-сводки ──────────────────────────────────────────────── */}
      <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
        {/* Общий остаток RUR */}
        {hasRur && (
          <div className="rounded-md border bg-card px-2.5 py-1.5">
            <div className="text-[11px] leading-tight text-muted-foreground">Общий остаток</div>
            <div className="text-base font-semibold tabular-nums mt-0.5 text-orange-600 dark:text-orange-400">
              {fmtRub(grandTotalByCurrency["RUR"] ?? 0)}
            </div>
            <div className="text-[10px] text-muted-foreground">RUR по всем компаниям</div>
          </div>
        )}

        {/* Общий остаток CNY (если есть) */}
        {hasCny && (
          <div className="rounded-md border bg-card px-2.5 py-1.5">
            <div className="text-[11px] leading-tight text-muted-foreground">Остаток CNY</div>
            <div className="text-base font-semibold tabular-nums mt-0.5 text-orange-600 dark:text-orange-400">
              {fmtCny(grandTotalByCurrency["CNY"] ?? 0)}
            </div>
            <div className="text-[10px] text-muted-foreground">CNY по всем компаниям</div>
          </div>
        )}

        {/* Приход за 30 дней (RUR) */}
        {hasRur && (
          <div className="rounded-md border bg-card px-2.5 py-1.5">
            <div className="text-[11px] leading-tight text-muted-foreground">Приход 30 дней</div>
            <div className="text-base font-semibold tabular-nums mt-0.5 text-emerald-600 dark:text-emerald-400">
              {fmtRub(grandFlow.income30d)}
            </div>
            <div className="text-[10px] text-muted-foreground">всего RUR</div>
          </div>
        )}

        {/* Расход за 30 дней (RUR) */}
        {hasRur && (
          <div className="rounded-md border bg-card px-2.5 py-1.5">
            <div className="text-[11px] leading-tight text-muted-foreground">Расход 30 дней</div>
            <div className="text-base font-semibold tabular-nums mt-0.5 text-red-600 dark:text-red-400">
              {fmtRub(grandFlow.expense30d)}
            </div>
            <div className="text-[10px] text-muted-foreground">всего RUR</div>
          </div>
        )}
      </div>

      {/* ── Компактная таблица per-компания ──────────────────────────────── */}
      {allCompanyNames.length > 0 && (
        <div className="overflow-auto rounded-md border">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead className="bg-muted">
              <tr>
                <th className="sticky top-0 bg-muted border-b px-3 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap">
                  Компания
                </th>
                {/* Колонки остатка per валюта */}
                {allCurrencies.map((cur) => (
                  <th
                    key={cur}
                    className="sticky top-0 bg-muted border-b px-3 py-1.5 text-right font-semibold text-muted-foreground whitespace-nowrap"
                  >
                    Остаток {cur}
                  </th>
                ))}
                <th className="sticky top-0 bg-muted border-b px-3 py-1.5 text-right font-semibold text-muted-foreground whitespace-nowrap">
                  Приход 7д
                </th>
                <th className="sticky top-0 bg-muted border-b px-3 py-1.5 text-right font-semibold text-muted-foreground whitespace-nowrap">
                  Расход 7д
                </th>
                <th className="sticky top-0 bg-muted border-b px-3 py-1.5 text-right font-semibold text-muted-foreground whitespace-nowrap">
                  Приход 30д
                </th>
                <th className="sticky top-0 bg-muted border-b px-3 py-1.5 text-right font-semibold text-muted-foreground whitespace-nowrap">
                  Расход 30д
                </th>
              </tr>
            </thead>
            <tbody>
              {allCompanyNames.map((companyName) => {
                const balance = getBalance(companyName)
                const flow = getFlow(companyName)
                return (
                  <tr key={companyName} className="hover:bg-muted/40">
                    <td className="px-3 py-1.5 border-b border-border/40 whitespace-nowrap font-medium">
                      {companyName}
                    </td>
                    {allCurrencies.map((cur) => (
                      <td
                        key={cur}
                        className="px-3 py-1.5 border-b border-border/40 text-right tabular-nums whitespace-nowrap"
                      >
                        {balance[cur] !== undefined ? fmtByCurrency(cur, balance[cur]!) : "—"}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 border-b border-border/40 text-right tabular-nums whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                      {flow.income7d > 0 ? fmtRub(flow.income7d) : "—"}
                    </td>
                    <td className="px-3 py-1.5 border-b border-border/40 text-right tabular-nums whitespace-nowrap text-red-600 dark:text-red-400">
                      {flow.expense7d > 0 ? fmtRub(flow.expense7d) : "—"}
                    </td>
                    <td className="px-3 py-1.5 border-b border-border/40 text-right tabular-nums whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                      {flow.income30d > 0 ? fmtRub(flow.income30d) : "—"}
                    </td>
                    <td className="px-3 py-1.5 border-b border-border/40 text-right tabular-nums whitespace-nowrap text-red-600 dark:text-red-400">
                      {flow.expense30d > 0 ? fmtRub(flow.expense30d) : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* ── Итого-строка (bold, сплошной фон) ── */}
            <tfoot>
              <tr className="bg-muted font-semibold">
                <td className="px-3 py-1.5 whitespace-nowrap">Итого</td>
                {allCurrencies.map((cur) => (
                  <td
                    key={cur}
                    className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-orange-600 dark:text-orange-400"
                  >
                    {grandTotalByCurrency[cur] !== undefined
                      ? fmtByCurrency(cur, grandTotalByCurrency[cur]!)
                      : "—"}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                  {grandFlow.income7d > 0 ? fmtRub(grandFlow.income7d) : "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-red-600 dark:text-red-400">
                  {grandFlow.expense7d > 0 ? fmtRub(grandFlow.expense7d) : "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                  {grandFlow.income30d > 0 ? fmtRub(grandFlow.income30d) : "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-red-600 dark:text-red-400">
                  {grandFlow.expense30d > 0 ? fmtRub(grandFlow.expense30d) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
