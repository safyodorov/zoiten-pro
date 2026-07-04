// components/layout/nav-items.ts
// Shared navigation config — used by Sidebar (client) and section-title (client)
import {
  Package,
  CreditCard,
  Tag,
  Megaphone,
  LayoutGrid,
  Boxes,
  Calculator,
  ShoppingCart,
  Truck,
  PackageCheck,
  TrendingUp,
  Headphones,
  PackageX,
  FileText,
  Bot,
  BarChart3,
  UserCheck,
  Users,
  Settings,
  LineChart,
  Landmark,
  Building2,
  Wallet,
  Scale,
} from "lucide-react"

export interface NavItem {
  section: string
  href: string
  label: string
  icon: string
  /** Виден всем залогиненным без проверки RBAC-секции */
  public?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { section: "PRODUCTS", href: "/products", label: "Товары", icon: "Package" },
  { section: "PRODUCTS", href: "/cards", label: "Карточки товаров", icon: "CreditCard" },
  { section: "PRICES", href: "/prices", label: "Управление ценами", icon: "Tag" },
  { section: "ADS", href: "/ads", label: "Управление рекламой", icon: "Megaphone" },
  { section: "WEEKLY_CARDS", href: "/weekly", label: "Недельные карточки", icon: "LayoutGrid" },
  { section: "STOCK", href: "/stock", label: "Управление остатками", icon: "Boxes" },
  { section: "COST", href: "/batches", label: "Себестоимость партий", icon: "Calculator" },
  { section: "PROCUREMENT", href: "/procurement/suppliers", label: "Поставщики", icon: "Truck" },
  { section: "PROCUREMENT", href: "/procurement/purchases", label: "Закупки", icon: "PackageCheck" },
  // /procurement/plan и /purchase-plan деприкейтнуты (25-09 зачистка) — роуты доступны по прямым ссылкам, но убраны из sidebar
  { section: "SALES", href: "/sales-plan", label: "План продаж", icon: "TrendingUp" },
  { section: "CREDITS", href: "/credits", label: "Кредиты", icon: "Landmark" },
  { section: "BANK", href: "/bank", label: "Банковские счета", icon: "Building2" },
  { section: "CASH", href: "/cash", label: "Наличные расчёты", icon: "Wallet" },
  { section: "FINANCE", href: "/finance/balance", label: "Финансовая отчётность", icon: "Scale" },
  { section: "FINANCE_MODELS", href: "/finance-models", label: "Финансовые модели", icon: "LineChart", public: true },
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
  Megaphone,
  LayoutGrid,
  Boxes,
  Calculator,
  ShoppingCart,
  Truck,
  PackageCheck,
  TrendingUp,
  Headphones,
  PackageX,
  FileText,
  Bot,
  BarChart3,
  UserCheck,
  Users,
  Settings,
  LineChart,
  Landmark,
  Building2,
  Wallet,
  Scale,
}
