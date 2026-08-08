import { resolve } from 'node:path'
import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'
import { docsRoute } from './apps/docs/lib/docs-base.ts'

// AI modified: ESM loading keeps shared docs helpers out of Playwright's incompatible CommonJS cache path.
const workspaceRoot = import.meta.dirname
const docsRoot = resolve(workspaceRoot, 'apps/docs')
const isContinuousIntegration = process.env.CI === 'true'
// AI modified: allow isolated E2E ports when another local preview already owns the default.
const docsPreviewPort = Number(process.env.DOCS_PREVIEW_PORT ?? '4173')
if (!Number.isInteger(docsPreviewPort) || docsPreviewPort < 1 || docsPreviewPort > 65_535) {
  // AI modified: reject malformed ports before they can enter the preview command or URL.
  throw new TypeError('DOCS_PREVIEW_PORT must be an integer from 1 to 65535')
}
const docsPreviewOrigin = `http://127.0.0.1:${docsPreviewPort}`
// AI modified: deployment checks can preview the already verified build without rebuilding the documentation.
const shouldUseExistingDocsBuild = process.env.DOCS_E2E_USE_EXISTING_BUILD === 'true'
const vitePreviewCommand = `pnpm exec vite preview . --config vite.preview.config.ts --port ${docsPreviewPort}`
const docsPreviewCommand = shouldUseExistingDocsBuild
  ? vitePreviewCommand
  : `pnpm run build && ${vitePreviewCommand}`

export default defineConfig({
  testDir: './apps/docs/e2e',
  forbidOnly: isContinuousIntegration,
  retries: isContinuousIntegration ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'output/playwright/report' }],
  ],
  outputDir: 'output/playwright/results',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: docsPreviewOrigin,
    // AI modified: first-attempt failures retain diagnostics even when CI retries the test.
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    // AI modified: browser checks exercise the same optimized VitePress output deployed to GitHub Pages.
    command: docsPreviewCommand,
    cwd: docsRoot,
    url: `${docsPreviewOrigin}${docsRoute('examples/')}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
