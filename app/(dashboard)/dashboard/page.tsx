// app/(dashboard)/dashboard/page.tsx
// Dashboard — shows section navigation cards filtered by user access
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import {
  Package, Tag, LayoutGrid, Boxes, Calculator, ShoppingCart, TrendingUp, Headphones,
} from "lucide-react"

const ALL_SECTIONS = [
  { section: "PRODUCTS", href: "/products", title: "Товары", description: "Управление каталогом товаров", icon: Package },
  { section: "PRICES", href: "/prices", title: "Управление ценами", description: "Ценообразование по маркетплейсам", icon: Tag },
  { section: "WEEKLY_CARDS", href: "/weekly", title: "Недельные карточки", description: "Еженедельная аналитика", icon: LayoutGrid },
  { section: "STOCK", href: "/inventory", title: "Управление остатками", description: "Остатки на складах", icon: Boxes },
  { section: "COST", href: "/batches", title: "Себестоимость партий", description: "Расчёт себестоимости", icon: Calculator },
  { section: "PROCUREMENT", href: "/purchase-plan", title: "План закупок", description: "Планирование закупок", icon: ShoppingCart },
  { section: "SALES", href: "/sales-plan", title: "План продаж", description: "Планирование продаж", icon: TrendingUp },
  { section: "SUPPORT", href: "/support", title: "Служба поддержки", description: "Тикеты и обращения клиентов", icon: Headphones },
]

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const isSuperadmin = session.user.role === "SUPERADMIN"
  const allowedSections = session.user.allowedSections ?? []

  const visibleSections = ALL_SECTIONS.filter(
    (s) => isSuperadmin || allowedSections.includes(s.section)
  )

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Добро пожаловать, {session.user.name}</h1>
        <p className="text-muted-foreground">Выберите раздел для работы</p>
      </div>

      {visibleSections.length === 0 ? (
        <div className="text-muted-foreground">
          У вас нет доступа ни к одному разделу. Обратитесь к администратору.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visibleSections.map((s) => {
            const Icon = s.icon
            return (
              <a key={s.section} href={s.href} className="group">
                <div className="h-full rounded-2xl border border-border bg-card p-5 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 transition-all">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold mb-1">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
