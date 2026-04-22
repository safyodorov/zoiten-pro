"use client"

// app/global-error.tsx
// Catch-all error boundary. Важный случай — ChunkLoadError:
// браузер держит HTML со ссылками на chunk hashes от старого билда,
// которые удаляются при next build. Вместо "Application error" — авто-reload.

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    const isChunkLoadError =
      error.name === "ChunkLoadError" ||
      /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module/i.test(
        error.message,
      )

    if (isChunkLoadError && typeof window !== "undefined") {
      // Принудительно обходим кеш и подтягиваем свежий HTML → актуальные chunk hashes
      window.location.reload()
    }
  }, [error])

  return (
    <html lang="ru">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            fontFamily: "system-ui, sans-serif",
            backgroundColor: "#fff",
            color: "#111",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
            Произошла ошибка
          </h1>
          <p style={{ color: "#666", marginBottom: "1.5rem", maxWidth: "32rem", textAlign: "center" }}>
            Приложение перезагружается автоматически. Если страница не обновилась — нажмите кнопку ниже или{" "}
            <kbd style={{ padding: "0 0.25rem", border: "1px solid #ccc", borderRadius: 4 }}>Ctrl+Shift+R</kbd>.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: 6,
              backgroundColor: "#111",
              color: "#fff",
              border: 0,
              cursor: "pointer",
            }}
          >
            Попробовать снова
          </button>
          {error.digest && (
            <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "#999" }}>
              digest: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
