import { requireSection } from "@/lib/rbac"
import { ExternalLink } from "lucide-react"

export default async function SupportPage() {
  await requireSection("SUPPORT")
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-gray-900">Служба поддержки</h1>
        <p className="text-gray-500 max-w-md mx-auto">
          Интеграция AI-бота поддержки в процессе. Модуль будет доступен после
          деплоя сервиса ai-cs-zoiten.
        </p>
        <a
          href="https://github.com/safyodorov/ai-cs-zoiten"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline mt-2"
        >
          <ExternalLink className="w-4 h-4" />
          safyodorov/ai-cs-zoiten на GitHub
        </a>
      </div>
    </div>
  )
}
