import { defineConfig } from "vitest/config"
import path from "path"

// Конфигурация vitest для Phase 07 (prices-wb) и последующих тестовых наборов.
// Alias `@` резолвит импорты в корень проекта, так как vitest не читает tsconfig paths автоматически.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
})
