import { requireSection } from "@/lib/rbac"
import { ComingSoon } from "@/components/ui/ComingSoon"

export default async function SalesPlanPage() {
  await requireSection("SALES")
  return <ComingSoon sectionName="План продаж" />
}
