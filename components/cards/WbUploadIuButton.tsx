"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"

export function WbUploadIuButton() {
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleFile(file: File) {
    setIsUploading(true)
    const formData = new FormData()
    formData.append("file", file)

    try {
      const res = await fetch("/api/wb-commission-iu", { method: "POST", body: formData })
      const data = await res.json()

      if (res.ok) {
        toast.success(`Загружено ${data.imported} записей ИУ`)
        router.refresh()
      } else {
        toast.error(data.error || "Ошибка загрузки")
      }
    } catch {
      toast.error("Ошибка сети")
    }
    setIsUploading(false)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        className="gap-1.5"
      >
        <Upload className="h-3.5 w-3.5" />
        {isUploading ? "Загрузка…" : "Загрузить ИУ"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ""
        }}
      />
    </>
  )
}
