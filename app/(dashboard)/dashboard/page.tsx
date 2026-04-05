// app/(dashboard)/dashboard/page.tsx
// Dashboard — shows section navigation cards filtered by user access
// Per D-05: hide sections user cannot access (not disable)
// Per D-11: SUPERADMIN sees all sections
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const ALL_SECTIONS = [
  {
    section: "PRODUCTS",
    href: "/products",
    title: "Товары",
    description: "Управление каталогом товаров",
    icon: "📦",
  },
  {
    section: "PRICES",
    href: "/prices",
    title: "Управление ценами",
    description: "Ценообразование по маркетплейсам",
    icon: "💰",
  },
  {
    section: "WEEKLY_CARDS",
    href: "/weekly",
    title: "Недельные карточки",
    description: "Еженедельная аналитика",
    icon: "📅",
  },
  {
    section: "STOCK",
    href: "/inventory",
    title: "Управление остатками",
    description: "Остатки на складах",
    icon: "📊",
  },
  {
    section: "COST",
    href: "/batches",
    title: "Себестоимость партий",
    description: "Расчёт себестоимости",
    icon: "🧮",
  },
  {
    section: "PROCUREMENT",
    href: "/purchase-plan",
    title: "План закупок",
    description: "Планирование закупок",
    icon: "🛒",
  },
  {
    section: "SALES",
    href: "/sales-plan",
    title: "План продаж",
    description: "Планирование продаж",
    icon: "📈",
  },
  {
    section: "SUPPORT",
    href: "/support",
    title: "Служба поддержки",
    description: "Тикеты и обращения клиентов",
    icon: "🎧",
  },
]

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const isSuperadmin = session.user.role === "SUPERADMIN"
  const allowedSections = session.user.allowedSections ?? []

  // Show all sections for superadmin; filter for others (per D-05: hide, not disable)
  const visibleSections = ALL_SECTIONS.filter(
    (s) => isSuperadmin || allowedSections.includes(s.section)
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Добро пожаловать, {session.user.name}</h1>
        <p className="text-muted-foreground">Выберите раздел для работы</p>
      </div>

      {visibleSections.length === 0 ? (
        <div className="text-muted-foreground">
          У вас нет доступа ни к одному разделу. Обратитесь к администратору.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visibleSections.map((s) => (
            <a key={s.section} href={s.href}>
              <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="text-3xl mb-1">{s.icon}</div>
                  <CardTitle className="text-base">{s.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
