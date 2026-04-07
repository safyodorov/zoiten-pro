"use client"

import { motion } from "motion/react"
import Link from "next/link"
import {
  Package, Tag, LayoutGrid, Boxes, Calculator, ShoppingCart, TrendingUp, Headphones,
} from "lucide-react"
import { SECTION_OPTIONS } from "@/lib/section-labels"
import { ThemeToggle } from "@/components/theme-toggle"

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  PRODUCTS: Package, PRICES: Tag, WEEKLY_CARDS: LayoutGrid, STOCK: Boxes,
  COST: Calculator, PROCUREMENT: ShoppingCart, SALES: TrendingUp, SUPPORT: Headphones,
}
const SECTION_PATHS: Record<string, string> = {
  PRODUCTS: "/products", PRICES: "/prices", WEEKLY_CARDS: "/weekly", STOCK: "/inventory",
  COST: "/batches", PROCUREMENT: "/purchase-plan", SALES: "/sales-plan", SUPPORT: "/support",
}

export function GlassmorphismLanding() {
  const cards = SECTION_OPTIONS.filter((s) => s.value !== "USER_MANAGEMENT")

  return (
    <div className="h-screen flex flex-col overflow-hidden relative bg-gradient-to-br from-orange-50 via-white to-amber-50 dark:from-gray-950 dark:via-orange-950/20 dark:to-gray-950">
      {/* Background orbs — smooth flowing animation across entire screen */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute w-[500px] h-[500px] bg-orange-400 rounded-full opacity-20 dark:opacity-12 blur-[120px] orb-1" />
        <div className="absolute w-[400px] h-[400px] bg-red-400 rounded-full opacity-18 dark:opacity-10 blur-[100px] orb-2" />
        <div className="absolute w-[450px] h-[450px] bg-amber-300 rounded-full opacity-15 dark:opacity-10 blur-[110px] orb-3" />
        <div className="absolute w-[350px] h-[350px] bg-rose-400 rounded-full opacity-15 dark:opacity-8 blur-[90px] orb-4" />
        <div className="absolute w-[300px] h-[300px] bg-yellow-300 rounded-full opacity-12 dark:opacity-8 blur-[80px] orb-5" />
        <div className="absolute w-[380px] h-[380px] bg-orange-300 rounded-full opacity-14 dark:opacity-9 blur-[100px] orb-6" />
      </div>
      <style jsx>{`
        .orb-1 {
          animation: drift1 20s ease-in-out infinite;
        }
        .orb-2 {
          animation: drift2 25s ease-in-out infinite;
        }
        .orb-3 {
          animation: drift3 22s ease-in-out infinite;
        }
        .orb-4 {
          animation: drift4 28s ease-in-out infinite;
        }
        .orb-5 {
          animation: drift5 18s ease-in-out infinite;
        }
        .orb-6 {
          animation: drift6 24s ease-in-out infinite;
        }
        @keyframes drift1 {
          0% { top: -10%; left: -10%; transform: scale(1); }
          25% { top: 20%; left: 60%; transform: scale(1.1); }
          50% { top: 60%; left: 80%; transform: scale(0.9); }
          75% { top: 70%; left: 20%; transform: scale(1.05); }
          100% { top: -10%; left: -10%; transform: scale(1); }
        }
        @keyframes drift2 {
          0% { top: 80%; right: -5%; left: auto; transform: scale(1); }
          20% { top: 40%; right: 30%; left: auto; transform: scale(1.15); }
          40% { top: 10%; right: 60%; left: auto; transform: scale(0.85); }
          60% { top: -5%; right: 20%; left: auto; transform: scale(1.1); }
          80% { top: 50%; right: -10%; left: auto; transform: scale(0.95); }
          100% { top: 80%; right: -5%; left: auto; transform: scale(1); }
        }
        @keyframes drift3 {
          0% { top: 30%; left: 50%; transform: scale(1) rotate(0deg); }
          33% { top: -5%; left: 10%; transform: scale(1.2) rotate(120deg); }
          66% { top: 60%; left: 70%; transform: scale(0.8) rotate(240deg); }
          100% { top: 30%; left: 50%; transform: scale(1) rotate(360deg); }
        }
        @keyframes drift4 {
          0% { bottom: -10%; left: 30%; top: auto; transform: scale(1); }
          25% { bottom: 40%; left: 70%; top: auto; transform: scale(1.1); }
          50% { bottom: 70%; left: 10%; top: auto; transform: scale(0.9); }
          75% { bottom: 20%; left: 50%; top: auto; transform: scale(1.15); }
          100% { bottom: -10%; left: 30%; top: auto; transform: scale(1); }
        }
        @keyframes drift5 {
          0% { top: 60%; left: -5%; transform: scale(1); }
          20% { top: 10%; left: 30%; transform: scale(1.2); }
          40% { top: -10%; left: 70%; transform: scale(0.9); }
          60% { top: 40%; left: 90%; transform: scale(1.1); }
          80% { top: 80%; left: 50%; transform: scale(0.85); }
          100% { top: 60%; left: -5%; transform: scale(1); }
        }
        @keyframes drift6 {
          0% { top: 10%; right: 10%; left: auto; transform: scale(1); }
          30% { top: 50%; right: 50%; left: auto; transform: scale(1.15); }
          60% { top: 80%; right: 5%; left: auto; transform: scale(0.9); }
          100% { top: 10%; right: 10%; left: auto; transform: scale(1); }
        }
      `}</style>

      {/* Header - glass */}
      <header className="relative z-20 h-16 mx-4 mt-4 px-6 flex items-center justify-between shrink-0 rounded-2xl bg-white/40 dark:bg-white/5 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-lg shadow-black/5">
        <span className="text-orange-700 dark:text-orange-400 font-bold text-xl tracking-wide">
          Zoiten
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className="px-5 py-2 text-sm font-medium bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl hover:from-orange-600 hover:to-red-600 transition-all shadow-lg shadow-orange-500/30"
          >
            Войти
          </Link>
        </div>
      </header>

      {/* Hero - glass card */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4">
        <motion.div
          className="text-center p-12 rounded-3xl bg-white/30 dark:bg-white/5 backdrop-blur-2xl border border-white/50 dark:border-white/10 shadow-2xl shadow-orange-500/10 max-w-2xl"
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
            <span className="text-white font-black text-2xl">Z</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-black tracking-tight bg-gradient-to-r from-orange-600 via-red-500 to-orange-600 dark:from-orange-400 dark:via-red-400 dark:to-orange-400 bg-clip-text text-transparent mb-4">
            ZOITEN
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 italic font-light">
            Время для жизни, свобода от рутины
          </p>
        </motion.div>
      </div>

      {/* Module grid - glass cards */}
      <motion.div
        className="relative z-20 px-4 pb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2 max-w-4xl mx-auto">
          {cards.map((s, i) => {
            const Icon = SECTION_ICONS[s.value]
            return (
              <motion.a
                key={s.value}
                href={SECTION_PATHS[s.value] ?? "/"}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.05 }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white/40 dark:bg-white/5 backdrop-blur-xl border border-white/50 dark:border-white/10 hover:bg-white/70 dark:hover:bg-white/10 hover:shadow-lg hover:shadow-orange-500/10 transition-all group cursor-pointer"
              >
                {Icon && <Icon className="w-5 h-5 text-orange-600 dark:text-orange-400 group-hover:scale-110 transition-transform" />}
                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400 text-center leading-tight">
                  {s.label}
                </span>
              </motion.a>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}
