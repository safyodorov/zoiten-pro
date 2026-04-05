// app/(dashboard)/unauthorized/page.tsx
// 403 page — shown when user lacks section access (per D-07)
// Has back-to-dashboard link
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"

export default function UnauthorizedPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-xl">Нет доступа</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            У вас нет доступа к этому разделу. Обратитесь к администратору для
            получения разрешений.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            Вернуться на главную
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
