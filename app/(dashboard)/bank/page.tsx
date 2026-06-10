import { requireSection } from "@/lib/rbac"

export default async function BankPage() {
  await requireSection("BANK")

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Банковские операции</h2>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-muted-foreground">
        Импорт выписок и таблица операций появятся здесь (этап 22-05).
      </div>
    </div>
  )
}
