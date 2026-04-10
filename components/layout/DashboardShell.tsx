// components/layout/DashboardShell.tsx
// Client wrapper with SidebarContext for collapse/expand state (persisted in localStorage)
"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { Sidebar } from "@/components/layout/Sidebar"
import { Header } from "@/components/layout/Header"
import type { NavItem } from "@/components/layout/nav-items"

interface SidebarCtx {
  collapsed: boolean
  toggle: () => void
  mounted: boolean
}

const SidebarContext = createContext<SidebarCtx>({
  collapsed: false,
  toggle: () => {},
  mounted: false,
})

export const useSidebar = () => useContext(SidebarContext)

const STORAGE_KEY = "zoiten.sidebar.collapsed"

interface DashboardShellProps {
  user: {
    name?: string | null
    email?: string | null
    role: string
  }
  navItems: NavItem[]
  logoutForm: ReactNode
  children: ReactNode
}

export function DashboardShell({ user, navItems, logoutForm, children }: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === "1") setCollapsed(true)
    } catch {
      // localStorage unavailable — ignore
    }
    setMounted(true)
  }, [])

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
      } catch {
        // ignore
      }
      return next
    })
  }

  return (
    <SidebarContext.Provider value={{ collapsed, toggle, mounted }}>
      <div className="flex h-screen bg-background">
        <Sidebar items={navItems} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header user={user} logoutForm={logoutForm} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </SidebarContext.Provider>
  )
}
