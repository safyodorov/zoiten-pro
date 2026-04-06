import { requireSection } from "@/lib/rbac"
import { ComingSoon } from "@/components/ui/ComingSoon"

export default async function WeeklyPage() {
  await requireSection("WEEKLY_CARDS")
  return <ComingSoon sectionName="Недельные карточки" />
}
