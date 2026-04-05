// components/layout/Sidebar.tsx
// Navigation sidebar — filters nav items by user section access (per D-05: hide inaccessible)
// SUPERADMIN sees all items
import Link from "next/link"

interface SidebarProps {
  userRole: string
  allowedSections: string[]
}

const NAV_ITEMS = [
  { section: "PRODUCTS", href: "/products", label: "Товары" },
  { section: "PRICES", href: "/prices", label: "Управление ценами" },
  { section: "WEEKLY_CARDS", href: "/weekly", label: "Недельные карточки" },
  { section: "STOCK", href: "/inventory", label: "Управление остатками" },
  { section: "COST", href: "/batches", label: "Себестоимость партий" },
  { section: "PROCUREMENT", href: "/purchase-plan", label: "План закупок" },
  { section: "SALES", href: "/sales-plan", label: "План продаж" },
  { section: "SUPPORT", href: "/support", label: "Служба поддержки" },
  // USER_MANAGEMENT shown only to superadmin
  { section: "USER_MANAGEMENT", href: "/admin/users", label: "Пользователи" },
]

export function Sidebar({ userRole, allowedSections }: SidebarProps) {
  const isSuperadmin = userRole === "SUPERADMIN"

  const visibleItems = NAV_ITEMS.filter(
    (item) => isSuperadmin || allowedSections.includes(item.section)
  )

  return (
    <aside className="w-56 bg-white border-r flex flex-col shrink-0">
      <div className="h-14 flex items-center px-4 border-b font-bold text-lg">
        Zoiten ERP
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {visibleItems.map((item) => (
          <Link
            key={item.section}
            href={item.href}
            className="flex items-center px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
