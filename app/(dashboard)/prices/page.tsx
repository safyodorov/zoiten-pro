import { requireSection } from "@/lib/rbac"
import { ComingSoon } from "@/components/ui/ComingSoon"

export default async function PricesPage() {
  await requireSection("PRICES")
  return <ComingSoon sectionName="Управление ценами" />
}
