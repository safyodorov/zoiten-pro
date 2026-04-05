// components/users/UserDialog.tsx
"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { UserForm, type UserRow } from "./UserForm"

interface UserDialogProps {
  // Controlled from parent (UserTable passes setEditUser + open state via these callbacks)
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: UserRow // undefined = create mode
}

export function UserDialog({ open, onOpenChange, user }: UserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {user ? "Редактировать пользователя" : "Новый пользователь"}
          </DialogTitle>
        </DialogHeader>
        {/* key forces re-mount on user change → form.reset() not needed (Pitfall 1) */}
        <UserForm
          key={user?.id ?? "create"}
          user={user}
          onSuccess={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
