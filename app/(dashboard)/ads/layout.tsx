// Phase 19 / Plan 19-05: layout раздела «Управление рекламой».
// RBAC enforcement на серверной стороне (Edge middleware уже проверяет, это вторая линия).
import { requireSection } from "@/lib/rbac"

export default async function AdsLayout({ children }: { children: React.ReactNode }) {
  await requireSection("ADS")
  return <>{children}</>
}
