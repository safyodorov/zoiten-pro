// components/products/ProductSearchInput.tsx
// Debounced search input — updates URL ?q= param after 300ms
// Preserves status, brands, categories filters
"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"

interface ProductSearchInputProps {
  defaultValue: string
}

export function ProductSearchInput({ defaultValue }: ProductSearchInputProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [inputValue, setInputValue] = useState(defaultValue)
  const isFirstRun = useRef(true)

  const pushUrl = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete("page") // reset pagination on search
      if (value.trim()) {
        params.set("q", value.trim())
      } else {
        params.delete("q")
      }
      const qs = params.toString()
      router.push(`/products${qs ? `?${qs}` : ""}`)
    },
    [router, searchParams]
  )

  useEffect(() => {
    // Skip initial mount — иначе при переходе на page 2 компонент re-mounts
    // и pushUrl("") сбрасывает ?page= обратно к page 1
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    const timer = setTimeout(() => {
      pushUrl(inputValue)
    }, 300)
    return () => clearTimeout(timer)
  }, [inputValue, pushUrl])

  return (
    <Input
      placeholder="Поиск по названию..."
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      className="max-w-sm"
    />
  )
}
