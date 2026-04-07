import { requireSection } from "@/lib/rbac"
import { ComingSoon } from "@/components/ui/ComingSoon"

export default async function EmployeesPage() {
  await requireSection("EMPLOYEES")
  return <ComingSoon sectionName="Сотрудники" />
}
