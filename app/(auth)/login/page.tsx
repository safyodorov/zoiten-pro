// app/(auth)/login/page.tsx
// Login page wrapper — centered card with branding and LoginForm
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoginForm } from "@/components/auth/LoginForm"

export default function LoginPage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl text-center">Zoiten ERP</CardTitle>
        <p className="text-sm text-muted-foreground text-center">
          Время для жизни, свобода от рутины
        </p>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  )
}
