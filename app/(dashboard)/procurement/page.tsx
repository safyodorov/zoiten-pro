// app/(dashboard)/procurement/page.tsx
// /procurement → redirect на /procurement/suppliers (D-10).
// Сам ничего не рендерит (Pitfall: don't render).
import { redirect } from "next/navigation"

export default function ProcurementIndexPage() {
  redirect("/procurement/suppliers")
}
