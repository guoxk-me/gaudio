import { dirname, resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const workspaceRoot = dirname(__filename)
const docsRoot = resolve(workspaceRoot, 'apps/docs')

export default defineConfig({
  testDir: './apps/docs/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm run api && pnpm exec vitepress dev . --host 127.0.0.1 --port 4173',
    cwd: docsRoot,
    url: 'http://127.0.0.1:4173/gaudio/examples/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
