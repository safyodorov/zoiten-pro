"use client"

import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"

export function LandingHeader() {
  return (
    <header className="h-16 border-b border-border/50 bg-background/80 backdrop-blur-sm px-6 flex items-center justify-between shrink-0 z-50">
      <span className="text-primary font-bold text-xl tracking-wide">
        Zoiten
      </span>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Link
          href="/login"
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          Войти
        </Link>
      </div>
    </header>
  )
}
