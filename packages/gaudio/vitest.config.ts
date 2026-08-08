import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      // AI modified: enforce production-source coverage without counting tests or test harnesses.
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/test-support/**',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 88,
        lines: 88,
        functions: 82,
        branches: 75,
      },
    },
  },
})
