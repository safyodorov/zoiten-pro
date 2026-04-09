// components/users/UserDialog.tsx
"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { UserForm, type UserRow, type EmployeeOption } from "./UserForm"

interface UserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: UserRow // undefined = create mode
  availableEmployees: EmployeeOption[]
}

export function UserDialog({ open, onOpenChange, user, availableEmployees }: UserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {user ? "Редактировать пользователя" : "Новый пользователь"}
          </DialogTitle>
        </DialogHeader>
        <UserForm
          key={user?.id ?? "create"}
          user={user}
          availableEmployees={availableEmployees}
          onSuccess={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
