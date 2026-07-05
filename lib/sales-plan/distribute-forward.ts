/**
 * lib/sales-plan/distribute-forward.ts
 * Чистый хелпер для автопротяжки месячного уровня вперёд (SP-15).
 * Вынесен в отдельный модуль (без "use server" / Next.js зависимостей)
 * чтобы можно было импортировать из тестов и клиентских модулей.
 */

/**
 * Возвращает список ДОПОЛНИТЕЛЬНЫХ месяцев (кроме targetMonth) горизонта > targetMonth,
 * у которых НЕТ собственного явного уровня (авто-месяцы) — куда протянуть value.
 * Месяцы из manualMonths (ручные, явный SalesPlanMonthLevel) исключаются (D-2).
 * targetMonth сам НЕ включается (его пишет вызывающий отдельно).
 */
export function distributeMonthLevelForward(args: {
  targetMonth: string          // "2026-08-01"
  horizonMonths: string[]      // все месяцы горизонта (из клиента / MONTHS)
  manualMonths: string[]       // месяцы с явным SalesPlanMonthLevel для этого товара
}): string[] {
  const manual = new Set(args.manualMonths)
  return args.horizonMonths.filter(
    (m) => m > args.targetMonth && !manual.has(m),
  )
}
