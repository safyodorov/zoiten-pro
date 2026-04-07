// components/layout/Sidebar.tsx
// Navigation sidebar — filters nav items by user section access
import { NavLinks } from "@/components/layout/NavLinks"
import {
  Package,
  CreditCard,
  Tag,
  LayoutGrid,
  Boxes,
  Calculator,
  ShoppingCart,
  TrendingUp,
  Headphones,
  Users,
  Settings,
} from "lucide-react"

interface SidebarProps {
  userRole: string
  allowedSections: string[]
}

const NAV_ITEMS = [
  { section: "PRODUCTS", href: "/products", label: "Товары", icon: "Package" },
  { section: "PRODUCTS", href: "/cards", label: "Карточки товаров", icon: "CreditCard" },
  { section: "PRICES", href: "/prices", label: "Управление ценами", icon: "Tag" },
  { section: "WEEKLY_CARDS", href: "/weekly", label: "Недельные карточки", icon: "LayoutGrid" },
  { section: "STOCK", href: "/inventory", label: "Управление остатками", icon: "Boxes" },
  { section: "COST", href: "/batches", label: "Себестоимость партий", icon: "Calculator" },
  { section: "PROCUREMENT", href: "/purchase-plan", label: "План закупок", icon: "ShoppingCart" },
  { section: "SALES", href: "/sales-plan", label: "План продаж", icon: "TrendingUp" },
  { section: "SUPPORT", href: "/support", label: "Служба поддержки", icon: "Headphones" },
  { section: "USER_MANAGEMENT", href: "/admin/users", label: "Пользователи", icon: "Users" },
  { section: "USER_MANAGEMENT", href: "/admin/settings", label: "Настройки", icon: "Settings" },
]

export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Package,
  CreditCard,
  Tag,
  LayoutGrid,
  Boxes,
  Calculator,
  ShoppingCart,
  TrendingUp,
  Headphones,
  Users,
  Settings,
}

export function Sidebar({ userRole, allowedSections }: SidebarProps) {
  const isSuperadmin = userRole === "SUPERADMIN"

  const visibleItems = NAV_ITEMS.filter(
    (item) => isSuperadmin || allowedSections.includes(item.section)
  )

  return (
    <aside className="w-56 bg-card border-r border-border flex flex-col shrink-0">
      <a href="/dashboard" className="h-14 flex items-center px-4 border-b border-border hover:bg-accent/50 transition-colors">
        <span className="font-bold text-lg text-primary">Zoiten</span>
        <span className="font-light text-lg text-foreground ml-1">ERP</span>
      </a>
      <nav className="flex-1 py-2 overflow-y-auto">
        <NavLinks items={visibleItems} />
      </nav>
    </aside>
  )
}
