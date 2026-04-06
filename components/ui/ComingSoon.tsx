// components/ui/ComingSoon.tsx
// Reusable placeholder for ERP modules not yet implemented (per D-08, D-09)
import { Clock } from "lucide-react"

interface ComingSoonProps {
  sectionName: string
  description?: string
}

export function ComingSoon({ sectionName, description }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
      <div className="rounded-full bg-gray-100 p-6">
        <Clock className="w-12 h-12 text-gray-400" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">{sectionName}</h1>
        <p className="text-lg text-gray-500">В разработке</p>
        {description && (
          <p className="text-sm text-gray-400 max-w-md mx-auto">{description}</p>
        )}
      </div>
    </div>
  )
}
