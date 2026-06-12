import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const docsRoot = resolve(import.meta.dirname)

describe('documentation application', () => {
  it('is a private workspace consumer with a GitHub Pages build', async () => {
    const [packageJsonText, vitePressConfig, typeDocConfigText] = await Promise.all([
      readFile(resolve(docsRoot, 'package.json'), 'utf8'),
      readFile(resolve(docsRoot, '.vitepress/config.ts'), 'utf8'),
      readFile(resolve(docsRoot, 'typedoc.json'), 'utf8'),
    ])
    const packageJson = JSON.parse(packageJsonText) as {
      private?: boolean
      dependencies?: Record<string, string>
      scripts?: Record<string, string>
    }
    const typeDocConfig = JSON.parse(typeDocConfigText) as {
      entryFileName?: string
    }

    expect(packageJson.private).toBe(true)
    expect(packageJson.dependencies?.gaudio).toBe('workspace:*')
    expect(packageJson.scripts?.build).toContain('pnpm run api')
    expect(packageJson.scripts?.dev).toContain('pnpm run api')
    expect(packageJson.scripts).toHaveProperty('dev')
    expect(packageJson.scripts).toHaveProperty('lint')
    expect(packageJson.scripts).toHaveProperty('test')
    expect(packageJson.scripts).toHaveProperty('typecheck')
    expect(vitePressConfig).toContain('process.env.DOCS_BASE ?? \'/gaudio/\'')
    expect(typeDocConfig.entryFileName).toBe('index')
  })
})
