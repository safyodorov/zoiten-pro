// components/users/UserTable.tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Pencil, Trash2, Plus, Eye, EyeOff, Copy } from "lucide-react"
import { UserDialog } from "./UserDialog"
import { type UserRow, type EmployeeOption } from "./UserForm"
import { deleteUser } from "@/app/actions/users"
import { SECTION_OPTIONS } from "@/lib/section-labels"

interface UserTableProps {
  users: UserRow[]
  availableEmployees: EmployeeOption[]
}

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Суперадмин",
  MANAGER: "Менеджер",
  VIEWER: "Просмотр",
}

const ACCESS_LABELS: Record<string, string> = {
  MANAGE: "Управление",
  VIEW: "Просмотр",
}

function sectionLabel(value: string): string {
  return SECTION_OPTIONS.find((o) => o.value === value)?.label ?? value
}

// ── Компонент ячейки с паролем ────────────────────────────────────

function PasswordCell({ plainPassword }: { plainPassword: string | null }) {
  const [visible, setVisible] = useState(false)

  if (!plainPassword) {
    return <span className="text-sm text-muted-foreground">—</span>
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(plainPassword!)
      toast.success("Пароль скопирован")
    } catch {
      toast.error("Не удалось скопировать")
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-mono">
        {visible ? plainPassword : "••••••••"}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Скрыть" : "Показать"}
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={handleCopy}
        aria-label="Копировать"
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ── Основная таблица ──────────────────────────────────────────────

export function UserTable({ users, availableEmployees }: UserTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserRow | undefined>(undefined)

  function openCreate() {
    setEditUser(undefined)
    setDialogOpen(true)
  }

  function openEdit(user: UserRow) {
    setEditUser(user)
    setDialogOpen(true)
  }

  async function handleDelete(user: UserRow) {
    if (!confirm(`Удалить пользователя ${user.name}?`)) return
    const result = await deleteUser(user.id)
    if (result.ok) {
      toast.success("Пользователь удалён")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Добавить пользователя
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Имя</TableHead>
              <TableHead>Фамилия</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Пароль</TableHead>
              <TableHead>Роль</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Разделы</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Пользователи не найдены
                </TableCell>
              </TableRow>
            )}
            {users.map((user) => (
              <TableRow
                key={user.id}
                className={!user.isActive ? "opacity-50" : undefined}
              >
                <TableCell className="font-medium">{user.firstName ?? user.name}</TableCell>
                <TableCell>{user.lastName ?? "—"}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <PasswordCell plainPassword={user.plainPassword} />
                </TableCell>
                <TableCell>
                  <Badge variant={user.role === "SUPERADMIN" ? "default" : "secondary"}>
                    {ROLE_LABELS[user.role] ?? user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={user.isActive ? "default" : "outline"}>
                    {user.isActive ? "Активен" : "Деактивирован"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {user.role === "SUPERADMIN" ? (
                    <span className="text-sm text-muted-foreground">Все разделы</span>
                  ) : Object.keys(user.sectionRoles).length === 0 ? (
                    <span className="text-sm text-muted-foreground">Нет доступа</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(user.sectionRoles).map(([section, role]) => (
                        <Badge
                          key={section}
                          variant={role === "MANAGE" ? "default" : "outline"}
                          className="text-xs"
                          title={ACCESS_LABELS[role]}
                        >
                          {sectionLabel(section)}
                          <span className="ml-1 opacity-70">
                            {role === "MANAGE" ? "✎" : "👁"}
                          </span>
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(user)}
                      aria-label="Редактировать"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(user)}
                      aria-label="Удалить"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={editUser}
        availableEmployees={availableEmployees}
      />
    </div>
  )
}
