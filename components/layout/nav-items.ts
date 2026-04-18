// components/layout/nav-items.ts
// Shared navigation config — used by Sidebar (client) and section-title (client)
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
  PackageX,
  FileText,
  Bot,
  BarChart3,
  UserCheck,
  Users,
  Settings,
} from "lucide-react"

export interface NavItem {
  section: string
  href: string
  label: string
  icon: string
}

export const NAV_ITEMS: NavItem[] = [
  { section: "PRODUCTS", href: "/products", label: "Товары", icon: "Package" },
  { section: "PRODUCTS", href: "/cards", label: "Карточки товаров", icon: "CreditCard" },
  { section: "PRICES", href: "/prices", label: "Управление ценами", icon: "Tag" },
  { section: "WEEKLY_CARDS", href: "/weekly", label: "Недельные карточки", icon: "LayoutGrid" },
  { section: "STOCK", href: "/inventory", label: "Управление остатками", icon: "Boxes" },
  { section: "COST", href: "/batches", label: "Себестоимость партий", icon: "Calculator" },
  { section: "PROCUREMENT", href: "/purchase-plan", label: "План закупок", icon: "ShoppingCart" },
  { section: "SALES", href: "/sales-plan", label: "План продаж", icon: "TrendingUp" },
  { section: "SUPPORT", href: "/support", label: "Служба поддержки", icon: "Headphones" },
  { section: "SUPPORT", href: "/support/returns", label: "Возвраты", icon: "PackageX" },
  { section: "SUPPORT", href: "/support/templates", label: "Шаблоны ответов", icon: "FileText" },
  { section: "SUPPORT", href: "/support/auto-reply", label: "Автоответ", icon: "Bot" },
  { section: "SUPPORT", href: "/support/stats", label: "Статистика", icon: "BarChart3" },
  { section: "EMPLOYEES", href: "/employees", label: "Сотрудники", icon: "UserCheck" },
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
  PackageX,
  FileText,
  Bot,
  BarChart3,
  UserCheck,
  Users,
  Settings,
}
