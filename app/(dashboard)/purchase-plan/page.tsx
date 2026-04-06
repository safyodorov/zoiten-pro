import { requireSection } from "@/lib/rbac"
import { ComingSoon } from "@/components/ui/ComingSoon"

export default async function PurchasePlanPage() {
  await requireSection("PROCUREMENT")
  return <ComingSoon sectionName="План закупок" />
}
