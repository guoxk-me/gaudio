import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/.vitepress/**',
      '**/dist/**',
      '**/e2e/**',
    ],
  },
})
