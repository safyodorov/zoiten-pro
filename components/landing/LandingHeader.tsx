"use client"

import Link from "next/link"

export function LandingHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-sm border-b border-white/10">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <span className="text-violet-400 font-bold text-xl tracking-wide">
          Zoiten
        </span>
        <Link
          href="/login"
          className="px-4 py-2 text-sm font-medium text-white border border-white/20 rounded-lg hover:bg-white/10 hover:border-white/40 transition-colors"
        >
          Войти
        </Link>
      </div>
    </header>
  )
}
