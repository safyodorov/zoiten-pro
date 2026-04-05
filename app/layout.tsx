import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Zoiten ERP",
  description: "Время для жизни, свобода от рутины",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
