// Временная заглушка — план 07-08 заменит полноценной RSC страницей с PriceCalculatorTable.
import { requireSection } from "@/lib/rbac"

export default async function PricesWbPage() {
  await requireSection("PRICES")

  return (
    <div className="py-8 text-center text-muted-foreground">
      <p className="text-sm">Страница «Управление ценами WB» в разработке.</p>
      <p className="text-xs mt-2">Будет заполнена в плане 07-08.</p>
    </div>
  )
}
