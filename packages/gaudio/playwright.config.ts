import { resolve } from 'node:path'
import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const workspaceRoot = resolve(import.meta.dirname, '../..')

export default defineConfig({
  testDir: './e2e',
  forbidOnly: process.env.CI === 'true',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: resolve(workspaceRoot, 'output/playwright/core-report') }],
  ],
  outputDir: resolve(workspaceRoot, 'output/playwright/core-results'),
  timeout: 15_000,
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // AI modified: browser media request policy and decoded analysis must work across the supported desktop engines.
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
})
