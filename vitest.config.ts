import { defineConfig } from "vitest/config"
import path from "path"

// Конфигурация vitest для Phase 07 (prices-wb) и последующих тестовых наборов.
// Alias `@` резолвит импорты в корень проекта, так как vitest не читает tsconfig paths автоматически.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    // Windows + Node.js 24: default "threads" pool имеет проблему с runner-контекстом.
    // vmForks изолирует каждый тест-файл в отдельный fork с VM-контекстом — стабильно на win32.
    pool: "vmForks",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
})
