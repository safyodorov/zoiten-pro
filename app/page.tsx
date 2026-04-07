// app/page.tsx
// Public landing page — Glassmorphism style
import { auth } from "@/lib/auth"
import { GlassmorphismLanding } from "@/components/landing/variants/Glassmorphism"

export default async function LandingPage() {
  const session = await auth()
  const user = session?.user
    ? { name: session.user.name ?? session.user.email ?? "" }
    : null

  return <GlassmorphismLanding user={user} />
}
