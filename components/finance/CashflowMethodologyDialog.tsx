// components/finance/CashflowMethodologyDialog.tsx
// Phase 28-03: Справка «Как считается» для ПДДС (/finance/cashflow).
// Read-only модалка, доступна всем (VIEW и MANAGE).
// Паттерн Dialog: DialogTrigger render={...} (base-ui render-prop; sm:max-w-Nx обязателен).
// sm:max-w-Nx — обязателен sm-префикс (без него base-ui перебивает ширину).

"use client"

import type { ReactNode } from "react"
import { HelpCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(10rem,13rem)_1fr] sm:gap-3">
      <div className="font-medium text-foreground">{term}</div>
      <div className="text-muted-foreground">{children}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  )
}

export function CashflowMethodologyDialog() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" />
            Как считается
          </Button>
        }
      />

      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Как считается ПДДС</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-sm">
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">
              остаток(d) = остаток(d−1) + притоки(d) − оттоки(d)
            </span>{" "}
            — дневная симуляция за горизонт плана продаж (H2-2026). Стартовый остаток =
            банк (₽) + касса. Консолидация: все юрлица группы в одной симуляции.
          </p>

          {/* Оговорка — первое приближение */}
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs dark:bg-amber-950/30">
            <p className="font-medium text-amber-800 dark:text-amber-400">
              Первое приближение — параметры уточняются
            </p>
            <p className="mt-1 text-amber-700 dark:text-amber-500">
              Выплата WB 55% — оценочный коэффициент (forPay ~66% − реклама/ДРР ~12%). Налоги
              упрощены (7% + 1% квартального). В v2 — per-товар payout из юнит-экономики и
              разделение налоговых баз по юрлицам.
            </p>
          </div>

          {/* ПРИТОКИ */}
          <div className="space-y-2">
            <SectionTitle>Притоки</SectionTitle>

            <Item term="Выплаты Wildberries">
              Плановые выкупы (из активной версии плана продаж) × wbPayoutPct / 100.{" "}
              <strong>Тайминг:</strong> понедельник недели выкупа + 7 дней + wbPayoutLagWeeks × 7.
            </Item>
          </div>

          {/* ОТТОКИ */}
          <div className="space-y-2">
            <SectionTitle>Оттоки</SectionTitle>

            <Item term="Закупки (реальные)">
              Платежи PurchasePayment (статус PLANNED). Используется поле{" "}
              <code>amountRub</code> если задано, иначе <code>amount × rate</code> ЦБ на дату
              платежа.
            </Item>
            <Item term="Закупки (виртуальные)">
              Предложения виртуальных закупок из плана продаж. Антидвойной счёт: статус
              CONVERTED и DISMISSED не учитываются (конвертированные вошли в реальные).
              Тайминг: DEPOSIT = orderDate+3 дня, BALANCE = DEPOSIT + leadTimeDays; соотношение 30/70.
            </Item>
            <Item term="Кредиты">
              Плановые погашения тела и процентов (LoanPayment PRINCIPAL + INTEREST) на день
              симуляции.
            </Item>
            <Item term="Налоги (расчётно)">
              7% от плановых выкупов ежедневно + 1% в конце каждого квартала (Q3: 30.09.2026,
              Q4: 31.12.2026). Упрощённая модель v1.
            </Item>
            <Item term="Опекс">
              opexMonthlyRub ÷ дней в месяце — равномерное распределение постоянных расходов
              (ФОТ, аренда и т.п.).
            </Item>
          </div>

          {/* РАЗРЫВ */}
          <div className="space-y-2">
            <SectionTitle>Разрыв (Gap)</SectionTitle>

            <Item term="Порог тревоги">
              Если остаток &lt; gapThresholdRub — день помечается разрывом. Нулевой дефолт =
              реальный уход в минус. KPI «Первый разрыв» + красная линия на графике + подсветка
              строки «Остаток» в матрице.
            </Item>
          </div>

          {/* ПАРАМЕТРЫ */}
          <div className="space-y-2">
            <SectionTitle>Параметры модели</SectionTitle>

            <Item term="Выплата WB (%)">
              wbPayoutPct — доля выкупа, поступающая на счёт. Дефолт 55%. Редактируется.
            </Item>
            <Item term="Лаг выплаты (нед.)">
              wbPayoutLagWeeks — дополнительный лаг сверх базовой недели. Дефолт 1. Целое 0–8.
            </Item>
            <Item term="Опекс/мес (₽)">
              opexMonthlyRub — ежемесячные операционные расходы. Дефолт 0.
            </Item>
            <Item term="Порог тревоги (₽)">
              gapThresholdRub — минимальный остаток-порог. Дефолт 0.
            </Item>
          </div>

          {/* ОГРАНИЧЕНИЯ */}
          <div className="space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
            <SectionTitle>Ограничения v1</SectionTitle>
            <ul className="list-disc space-y-1 pl-4">
              <li>
                wbPayoutPct — первое приближение. v2: per-товар из юнит-экономики.
              </li>
              <li>
                Налоги упрощены: 7% + 1% квартального. v2: разделение per-юрлицо, НДС отдельно.
              </li>
              <li>
                Реклама зашита в коэффициент payout — не выделяется отдельной статьёй.
              </li>
              <li>
                Фактический ряд — только RUR банк + касса. CNY-счета не конвертируются (v1).
              </li>
              <li>
                Консолидация без межкомпанийских элиминаций — все юрлица в один котёл.
              </li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
