import { requireSection } from "@/lib/rbac"

export default async function CashPage() {
  await requireSection("CASH")
  return (
    <div className="h-full flex flex-col gap-3">
      <div className="text-sm text-muted-foreground">
        Касса группы компаний — раздел в разработке (таблица и форма добавятся в 23-04).
      </div>
    </div>
  )
}
