"use client"

import { motion } from "motion/react"
import {
  Package,
  Tag,
  LayoutGrid,
  Boxes,
  Calculator,
  ShoppingCart,
  TrendingUp,
  Headphones,
} from "lucide-react"
import { SECTION_OPTIONS } from "@/lib/section-labels"

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  PRODUCTS: Package,
  PRICES: Tag,
  WEEKLY_CARDS: LayoutGrid,
  STOCK: Boxes,
  COST: Calculator,
  PROCUREMENT: ShoppingCart,
  SALES: TrendingUp,
  SUPPORT: Headphones,
}

const SECTION_PATHS: Record<string, string> = {
  PRODUCTS: "/products",
  PRICES: "/prices",
  WEEKLY_CARDS: "/weekly",
  STOCK: "/inventory",
  COST: "/batches",
  PROCUREMENT: "/purchase-plan",
  SALES: "/sales-plan",
  SUPPORT: "/support",
}

export function SectionCards() {
  const cards = SECTION_OPTIONS.filter((s) => s.value !== "USER_MANAGEMENT")

  return (
    <div>
      <p className="text-white/60 text-sm uppercase tracking-widest mb-6">
        Модули системы
      </p>
      <motion.div
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {cards.map((section) => {
          const Icon = SECTION_ICONS[section.value]
          const path = SECTION_PATHS[section.value] ?? "/"
          return (
            <motion.a
              key={section.value}
              href={path}
              variants={itemVariants}
              className="rounded-xl border border-white/10 bg-white/5 p-6 hover:bg-white/10 transition-colors flex flex-col items-center gap-3 cursor-pointer"
            >
              {Icon && <Icon className="w-8 h-8 text-violet-400" />}
              <span className="text-sm text-gray-300 text-center">{section.label}</span>
            </motion.a>
          )
        })}
      </motion.div>
    </div>
  )
}
