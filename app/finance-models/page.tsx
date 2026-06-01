// app/finance-models/page.tsx
// Раздел «Финансовые модели» — standalone (без привязки к RBAC-sections).
// Доступен любому залогиненному пользователю (middleware требует только аутентификации).

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { FinanceModelView } from "@/components/finance-models/FinanceModelView"

export const metadata = {
  title: "Финансовые модели — Zoiten ERP",
}

export default function FinanceModelsPage() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-8">
      <header className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Дашборд
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Финансовые модели</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Запуск 9 товаров на Wildberries — денежные потоки и прибыль на 1 год (старт 1 июня 2026),
          три варианта финансирования. Оценка потребности в кредитных средствах.
        </p>
      </header>

      <details className="mb-6 rounded-lg border bg-muted/30 p-4 text-sm">
        <summary className="cursor-pointer font-medium">Методология и допущения</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
          <li><b>Реализация = Заказы × Выкуп</b> (87%): заказ ≠ выкуп; только выкупленные дают выручку и расходуют товар.</li>
          <li><b>Выручка</b> = Реализация × Цена. <b>Чистая прибыль</b> = Рентабельность продаж × Выручка (маржа уже учитывает выкуп и брак).</li>
          <li><b>Платёж поставщику 20 / 50 / 30%</b>: при заказе / перед отгрузкой (после производства+инспекции) / при прибытии на таможню (после логистики Китая). В себестоимость входят товар, логистика и таможня.</li>
          <li><b>Отсрочка WB</b>: деньги приходят через 4 недели после понедельника-отчёта за неделю продажи.</li>
          <li>При выплате WB на р/с поступает возврат себестоимости проданного + чистая прибыль (подрядчики/комиссия/налоги нетируются в тот же день).</li>
          <li><b>Реинвест прибыли 30%</b> удерживается в обороте, <b>70% выводится собственнику</b> (в т.ч. при непогашенном кредите).</li>
          <li><b>Ставка кредита 25% годовых</b>; кредит добирается при дефиците ДС и гасится при профиците.</li>
          <li>Объёмы продаж фиксированы на уровнях вводной; все товары стартуют одновременно 1 июня 2026.</li>
          <li>Варианты: собств. средства <b>10 / 20 / 30 млн ₽</b>, рентабельность <b>база +1пп / база / база −1пп</b>. Вариант 2 — базовый.</li>
        </ul>
        <p className="mt-3 text-muted-foreground">
          Все параметры редактируемы ниже — таблицы пересчитываются мгновенно.
        </p>
      </details>

      <FinanceModelView />
    </div>
  )
}
