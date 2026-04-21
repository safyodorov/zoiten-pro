"use client"

import { motion } from "motion/react"
import Link from "next/link"
import {
  Package, Tag, LayoutGrid, Boxes, Calculator, ShoppingCart, TrendingUp, Headphones, UserCheck,
} from "lucide-react"
import { SECTION_OPTIONS } from "@/lib/section-labels"
import { ThemeToggle } from "@/components/theme-toggle"

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  PRODUCTS: Package, PRICES: Tag, WEEKLY_CARDS: LayoutGrid, STOCK: Boxes,
  COST: Calculator, PROCUREMENT: ShoppingCart, SALES: TrendingUp, SUPPORT: Headphones, EMPLOYEES: UserCheck,
}
const SECTION_PATHS: Record<string, string> = {
  PRODUCTS: "/products", PRICES: "/prices", WEEKLY_CARDS: "/weekly", STOCK: "/stock",
  COST: "/batches", PROCUREMENT: "/purchase-plan", SALES: "/sales-plan", SUPPORT: "/support", EMPLOYEES: "/employees",
}

interface Props {
  user?: { name: string } | null
}

export function GlassmorphismLanding({ user }: Props) {
  const cards = SECTION_OPTIONS.filter((s) => s.value !== "USER_MANAGEMENT")

  return (
    <div className="h-screen flex flex-col overflow-hidden relative bg-gradient-to-br from-orange-50 via-white to-amber-50 dark:from-gray-950 dark:via-orange-950/20 dark:to-gray-950">
      {/* Background orbs — smooth flowing, reduced on mobile to prevent flicker */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none orbs-container">
        <div className="absolute w-[500px] h-[500px] bg-orange-400 rounded-full opacity-20 dark:opacity-12 blur-[120px] orb orb-1" />
        <div className="absolute w-[400px] h-[400px] bg-red-400 rounded-full opacity-18 dark:opacity-10 blur-[100px] orb orb-2" />
        <div className="absolute w-[450px] h-[450px] bg-amber-300 rounded-full opacity-15 dark:opacity-10 blur-[110px] orb orb-3" />
        <div className="absolute w-[350px] h-[350px] bg-rose-400 rounded-full opacity-15 dark:opacity-8 blur-[90px] orb orb-4 hidden md:block" />
        <div className="absolute w-[300px] h-[300px] bg-yellow-300 rounded-full opacity-12 dark:opacity-8 blur-[80px] orb orb-5 hidden md:block" />
        <div className="absolute w-[380px] h-[380px] bg-orange-300 rounded-full opacity-14 dark:opacity-9 blur-[100px] orb orb-6 hidden lg:block" />
      </div>
      <style jsx>{`
        /* Use will-change and GPU-only transforms to prevent mobile flicker */
        .orb {
          will-change: transform;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .orb-1 { animation: drift1 20s ease-in-out infinite; }
        .orb-2 { animation: drift2 25s ease-in-out infinite; }
        .orb-3 { animation: drift3 22s ease-in-out infinite; }
        .orb-4 { animation: drift4 28s ease-in-out infinite; }
        .orb-5 { animation: drift5 18s ease-in-out infinite; }
        .orb-6 { animation: drift6 24s ease-in-out infinite; }
        /* Mobile: slower, simpler animations */
        @media (max-width: 768px) {
          .orb-1 { animation-duration: 30s; }
          .orb-2 { animation-duration: 35s; }
          .orb-3 { animation-duration: 32s; }
        }
        @keyframes drift1 {
          0%   { transform: translate(-10%, -10%) scale(1); }
          25%  { transform: translate(40%, 15%) scale(1.1); }
          50%  { transform: translate(60%, 50%) scale(0.9); }
          75%  { transform: translate(10%, 60%) scale(1.05); }
          100% { transform: translate(-10%, -10%) scale(1); }
        }
        @keyframes drift2 {
          0%   { transform: translate(80%, 70%) scale(1); }
          20%  { transform: translate(30%, 30%) scale(1.15); }
          40%  { transform: translate(-10%, 5%) scale(0.85); }
          60%  { transform: translate(20%, -10%) scale(1.1); }
          80%  { transform: translate(70%, 40%) scale(0.95); }
          100% { transform: translate(80%, 70%) scale(1); }
        }
        @keyframes drift3 {
          0%   { transform: translate(40%, 20%) scale(1); }
          33%  { transform: translate(5%, -10%) scale(1.2); }
          66%  { transform: translate(60%, 55%) scale(0.8); }
          100% { transform: translate(40%, 20%) scale(1); }
        }
        @keyframes drift4 {
          0%   { transform: translate(20%, 80%) scale(1); }
          25%  { transform: translate(60%, 30%) scale(1.1); }
          50%  { transform: translate(5%, -5%) scale(0.9); }
          75%  { transform: translate(40%, 50%) scale(1.15); }
          100% { transform: translate(20%, 80%) scale(1); }
        }
        @keyframes drift5 {
          0%   { transform: translate(-5%, 50%) scale(1); }
          20%  { transform: translate(25%, 5%) scale(1.2); }
          40%  { transform: translate(60%, -10%) scale(0.9); }
          60%  { transform: translate(80%, 35%) scale(1.1); }
          80%  { transform: translate(40%, 70%) scale(0.85); }
          100% { transform: translate(-5%, 50%) scale(1); }
        }
        @keyframes drift6 {
          0%   { transform: translate(70%, 5%) scale(1); }
          30%  { transform: translate(30%, 40%) scale(1.15); }
          60%  { transform: translate(5%, 70%) scale(0.9); }
          100% { transform: translate(70%, 5%) scale(1); }
        }
      `}</style>

      {/* Header - glass */}
      <header className="relative z-20 h-16 mx-4 mt-4 px-6 flex items-center justify-between shrink-0 rounded-2xl bg-white/40 dark:bg-white/5 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-lg shadow-black/5">
        <span className="text-orange-700 dark:text-orange-400 font-bold text-xl tracking-wide">
          Zoiten
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl hover:from-orange-600 hover:to-red-600 transition-all shadow-lg shadow-orange-500/30"
            >
              <span>{user.name}</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="px-5 py-2 text-sm font-medium bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl hover:from-orange-600 hover:to-red-600 transition-all shadow-lg shadow-orange-500/30"
            >
              Войти
            </Link>
          )}
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
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg shadow-orange-500/30 p-3">
            <svg viewBox="0 0 512 512" className="w-[50px] h-[50px]">
              <g transform="translate(256,256)" fill="none" stroke="#ffffff" strokeWidth="24" strokeLinecap="round">
                <circle cx="0" cy="0" r="195"/>
                <circle cx="0" cy="0" r="120"/>
                <line x1="0" y1="-195" x2="0" y2="195"/>
                <path d="M 0,-120 C -66,-120 -120,-66 -120,0" strokeWidth="26"/>
                <path d="M -120,0 C -120,66 -66,120 0,120" strokeWidth="26"/>
                <path d="M 0,-120 C 66,-120 120,-66 120,0" strokeWidth="26"/>
                <path d="M 120,0 C 120,66 66,120 0,120" strokeWidth="26"/>
              </g>
            </svg>
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
        <div className="flex flex-wrap justify-center gap-2 md:gap-4 max-w-6xl mx-auto">
          {cards.map((s, i) => {
            const Icon = SECTION_ICONS[s.value]
            return (
              <motion.a
                key={s.value}
                href={SECTION_PATHS[s.value] ?? "/"}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.05 }}
                className="flex items-center gap-2 md:gap-3 px-3.5 py-2.5 md:px-7 md:py-4 rounded-xl md:rounded-2xl bg-white/40 dark:bg-white/5 backdrop-blur-xl border border-white/50 dark:border-white/10 hover:bg-white/70 dark:hover:bg-white/10 hover:shadow-lg hover:shadow-orange-500/10 transition-all group cursor-pointer"
              >
                {Icon && <Icon className="w-4 h-4 md:w-6 md:h-6 text-orange-600 dark:text-orange-400 group-hover:scale-110 transition-transform" />}
                <span className="text-xs md:text-base font-medium text-gray-700 dark:text-gray-300">
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
