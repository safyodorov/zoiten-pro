// components/products/ProductSearchInput.tsx
// Debounced search input — updates URL ?q= param after 300ms
"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useState, useEffect } from "react"
import { Input } from "@/components/ui/input"

interface ProductSearchInputProps {
  defaultValue: string
}

export function ProductSearchInput({ defaultValue }: ProductSearchInputProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [inputValue, setInputValue] = useState(defaultValue)

  const pushUrl = useCallback(
    (value: string) => {
      const currentStatus = searchParams.get("status") ?? "IN_STOCK"
      const params = new URLSearchParams()
      params.set("status", currentStatus)
      if (value.trim()) {
        params.set("q", value.trim())
      }
      router.push(`/products?${params.toString()}`)
    },
    [router, searchParams]
  )

  useEffect(() => {
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
