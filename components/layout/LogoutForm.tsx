// components/layout/LogoutForm.tsx
// Server component with inline signOut action — passed as ReactNode prop to client Header
import { signOut } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"

export function LogoutForm() {
  return (
    <form
      action={async () => {
        "use server"
        await signOut({ redirectTo: "/login" })
      }}
    >
      <Button type="submit" variant="ghost" size="icon" title="Выйти" className="h-9 w-9">
        <LogOut className="h-4 w-4" />
        <span className="sr-only">Выйти</span>
      </Button>
    </form>
  )
}
