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
  visible: { transition: { staggerChildren: 0.05 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
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
    <div className="px-6 pb-6 pt-4">
      <p className="text-muted-foreground text-xs uppercase tracking-widest mb-3 text-center">
        Модули системы
      </p>
      <motion.div
        className="flex flex-wrap justify-center gap-3 max-w-5xl mx-auto"
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
              className="rounded-xl border border-border bg-card/80 backdrop-blur-sm px-5 py-3 hover:bg-accent hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 transition-all duration-200 flex items-center gap-2.5 cursor-pointer group"
            >
              {Icon && (
                <Icon className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
              )}
              <span className="text-sm font-medium text-foreground">
                {section.label}
              </span>
            </motion.a>
          )
        })}
      </motion.div>
    </div>
  )
}
