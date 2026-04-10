// components/layout/Header.tsx
// Client header: section title by pathname + sidebar toggle + theme + user + logout
"use client"

import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { useSidebar } from "@/components/layout/DashboardShell"
import { getSectionTitle } from "@/components/layout/section-titles"
import type { ReactNode } from "react"

interface HeaderProps {
  user: {
    name?: string | null
    email?: string | null
    role: string
  }
  logoutForm: ReactNode
}

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Суперадмин",
  MANAGER: "Менеджер",
  VIEWER: "Просмотр",
}

export function Header({ user, logoutForm }: HeaderProps) {
  const pathname = usePathname()
  const { collapsed, toggle } = useSidebar()
  const title = getSectionTitle(pathname)

  const initials =
    user.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "??"

  return (
    <header className="h-14 border-b border-border bg-card px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
      {/* Left: toggle + section title */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          title={collapsed ? "Развернуть меню" : "Свернуть меню"}
          className="h-9 w-9 shrink-0"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
          <span className="sr-only">Переключить меню</span>
        </Button>
        {title && (
          <h1 className="text-lg font-semibold text-foreground truncate">{title}</h1>
        )}
      </div>

      {/* Right: theme + role + user + logout */}
      <div className="flex items-center gap-3 shrink-0">
        <ThemeToggle />
        <Badge variant="secondary" className="hidden sm:inline-flex">
          {ROLE_LABELS[user.role] ?? user.role}
        </Badge>
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium hidden md:block">
            {user.name ?? user.email}
          </span>
        </div>
        {logoutForm}
      </div>
    </header>
  )
}
