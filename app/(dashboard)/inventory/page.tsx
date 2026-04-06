import { requireSection } from "@/lib/rbac"
import { ComingSoon } from "@/components/ui/ComingSoon"

export default async function InventoryPage() {
  await requireSection("STOCK")
  return <ComingSoon sectionName="Управление остатками" />
}
