// components/layout/Header.tsx
// Top header — shows user name/role and logout button
// Logout uses Server Action inline (per AUTH-03)
import { signOut } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { LogOut } from "lucide-react"

interface HeaderProps {
  user: {
    name?: string | null
    email?: string | null
    role: string
  }
}

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Суперадмин",
  MANAGER: "Менеджер",
  VIEWER: "Просмотр",
}

export function Header({ user }: HeaderProps) {
  const initials = user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "??"

  return (
    <header className="h-14 border-b bg-white px-6 flex items-center justify-between shrink-0">
      <div />
      <div className="flex items-center gap-3">
        <Badge variant="secondary">{ROLE_LABELS[user.role] ?? user.role}</Badge>
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium hidden sm:block">
            {user.name ?? user.email}
          </span>
        </div>
        <form
          action={async () => {
            "use server"
            await signOut({ redirectTo: "/login" })
          }}
        >
          <Button type="submit" variant="ghost" size="icon" title="Выйти">
            <LogOut className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </header>
  )
}
