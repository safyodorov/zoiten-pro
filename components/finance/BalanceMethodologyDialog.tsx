"use client"

// components/finance/BalanceMethodologyDialog.tsx
// Справка по методологии баланса (/finance/balance) — read-only модалка, доступна всем
// (VIEW и MANAGE). Построчный разбор источников и правил каждой статьи + оговорки.
// Источник правил: lib/balance-data.ts (loadBalanceSheet). Разбор дебиторки:
// .planning/debug/wb-receivables-double-count.md. Паттерн Dialog — как TaxSettingsModal
// (base-ui: DialogTrigger render={...} NOT asChild).

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
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(9rem,12rem)_1fr] sm:gap-3">
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

export function BalanceMethodologyDialog() {
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

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Как считается баланс</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-sm">
          <p className="text-muted-foreground">
            Управленческий баланс на выбранную дату:{" "}
            <span className="font-medium text-foreground">Активы = Пассивы + Капитал</span>{" "}
            (Капитал — балансирующая строка). Часть статей берётся из ночного снапшота, часть
            вычисляется на лету на выбранную дату.
          </p>

          {/* Ключевая оговорка — дебиторка */}
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs dark:bg-amber-950/30">
            <p className="font-medium text-amber-800 dark:text-amber-400">
              Дебиторка WB = «Баланс» из кабинета WB (реальное время)
            </p>
            <p className="mt-1 text-amber-700 dark:text-amber-500">
              Это поле <code>current</code> из Balance API — деньги, которые WB уже должна
              продавцу. Обновляется постоянно по мере выкупов и{" "}
              <span className="font-medium">уже включает выкупы текущей недели</span>. Поэтому
              незакрытая неделя отдельно НЕ прибавляется — иначе те же выкупы посчитались бы
              дважды. Не путать с «Суммой к выводу» (это меньшая величина — сколько можно вывести
              сейчас).
            </p>
          </div>

          {/* АКТИВЫ */}
          <div className="space-y-2">
            <SectionTitle>Активы</SectionTitle>

            <Item term="Банковские счета (₽)">
              Остаток рублёвых счетов на дату: закрывающий баланс выписки ± банковские транзакции
              до выбранной даты.
            </Item>
            <Item term="Банковские счета (CNY)">
              Справочно, НЕ входит в рублёвый итог — валютная переоценка не выполняется (v1).
            </Item>
            <Item term="Касса">Приходы − расходы кассы на выбранную дату.</Item>
            <Item term="Дебиторка Wildberries">
              = <code>current</code> из Balance API WB (см. плашку выше). Берётся из ночного
              снапшота дебиторки; если снапшота на дату нет — строка помечается «нет снапшота».
            </Item>
            <Item term="Запасы (склады)">
              Склады WB / в пути к клиенту / в пути от клиента / Иваново — количество из снапшота
              остатков × себестоимость товара на дату. Товары без себестоимости в сумму не
              входят (см. плашку «Без оценки» под таблицей).
            </Item>
            <Item term="Товар в пути из Китая">
              Оплаченные закупки на этапе «Отгрузка»/«Транзит» (ещё не приняты на склад). Оплата
              приводится в рубли по курсу ЦБ на дату платежа.
            </Item>
            <Item term="Авансы поставщикам">
              Оплаченные закупки ДО отгрузки (этап «Производство»/«Инспекция» или без этапа).
            </Item>
            <Item term="Ручные статьи">
              Введённые вручную корректировки-активы (действуют с указанной даты).
            </Item>
          </div>

          {/* ПАССИВЫ */}
          <div className="space-y-2">
            <SectionTitle>Пассивы</SectionTitle>

            <Item term="Кредиты и займы">
              Остаток по кредитам на дату (тело кредита − погашенная часть). Кредит, не выданный
              на выбранную дату, не учитывается.
            </Item>
            <Item term="Отложенные налоги (расчётно)">
              Начислено (выкупы × ставки НДС и налога на доходы) − уплачено (платежи с категорией
              «Налоги» в банке и кассе). Для закрытых кварталов можно ввести факт. Приближённая
              оценка.
            </Item>
            <Item term="Ручные статьи">Введённые вручную корректировки-пассивы.</Item>
          </div>

          {/* КАПИТАЛ */}
          <div className="space-y-2">
            <SectionTitle>Капитал</SectionTitle>
            <Item term="Капитал">
              = Активы − Пассивы (балансирующая строка, «чистая стоимость»).
            </Item>
          </div>

          {/* ОГОВОРКИ */}
          <div className="space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
            <SectionTitle>Оговорки и приближения</SectionTitle>
            <ul className="list-disc space-y-1 pl-4">
              <li>
                Снапшоты (остатки и дебиторка) пишутся ночным заданием в 06:00 МСК за
                предыдущий день; остальные статьи считаются на лету на выбранную дату.
              </li>
              <li>История снапшотов ведётся с 01.07.2026 — ретроспектива раньше не восстанавливается.</li>
              <li>
                Курсы валют — ЦБ РФ, накапливаются с 09.06.2026; для более ранних дат берётся
                самый ранний известный курс (приближение).
              </li>
              <li>
                Себестоимость — текущая (истории нет). Кнопка «Пересчитать дату» переоценивает
                остатки снапшота по свежей себестоимости.
              </li>
              <li>Колонки «на дату» и «сравнение» + дельты Δ₽/Δ% — для отслеживания динамики.</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
