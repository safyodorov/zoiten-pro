import { requireSection } from "@/lib/rbac"
import { ComingSoon } from "@/components/ui/ComingSoon"

export default async function BatchesPage() {
  await requireSection("COST")
  return <ComingSoon sectionName="Себестоимость партий" />
}
