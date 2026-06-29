import { readdir, readFile } from 'node:fs/promises'
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
    expect(vitePressConfig).toContain('locales:')
    expect(vitePressConfig).toContain('label: \'English\'')
    expect(vitePressConfig).toContain('label: \'简体中文\'')
    expect(vitePressConfig).toContain('link: \'/zh/\'')
    expect(vitePressConfig).not.toContain('Migration')
    expect(vitePressConfig).not.toContain('/guide/migration')
    expect(typeDocConfig.entryFileName).toBe('index')
  })

  it('ships bilingual guide pages without migration documentation', async () => {
    const [englishGuideFiles, chineseGuideFiles, englishHome, chineseHome, homeShowcase] = await Promise.all([
      readdir(resolve(docsRoot, 'guide')),
      readdir(resolve(docsRoot, 'zh/guide')),
      readFile(resolve(docsRoot, 'index.md'), 'utf8'),
      readFile(resolve(docsRoot, 'zh/index.md'), 'utf8'),
      readFile(resolve(docsRoot, '.vitepress/theme/components/HomeShowcase.vue'), 'utf8'),
    ])

    expect(englishGuideFiles).not.toContain('migration.md')
    expect(chineseGuideFiles).not.toContain('migration.md')
    expect(englishGuideFiles).toEqual(expect.arrayContaining([
      'getting-started.md',
      'adaptive-playback.md',
      'events.md',
      'api-reference.md',
    ]))
    expect(chineseGuideFiles).toEqual(expect.arrayContaining([
      'getting-started.md',
      'adaptive-playback.md',
      'events.md',
      'api-reference.md',
    ]))
    expect(englishHome).toContain('Pre-release')
    expect(englishHome).toContain('<HomeShowcase />')
    expect(homeShowcase).toContain('Core playback in one object')
    expect(homeShowcase).toContain('setAdaptiveQuality')
    expect(chineseHome).toContain('预发布')
  })

  it('documents adaptive content types in both languages', async () => {
    const [englishAdaptiveGuide, chineseAdaptiveGuide, apiReference] = await Promise.all([
      readFile(resolve(docsRoot, 'guide/adaptive-playback.md'), 'utf8'),
      readFile(resolve(docsRoot, 'zh/guide/adaptive-playback.md'), 'utf8'),
      readFile(resolve(docsRoot, 'guide/api-reference.md'), 'utf8'),
    ])

    expect(englishAdaptiveGuide).toContain('contentType')
    expect(englishAdaptiveGuide).toContain('long-form')
    expect(englishAdaptiveGuide).toContain('live')
    expect(chineseAdaptiveGuide).toContain('contentType')
    expect(chineseAdaptiveGuide).toContain('长音频')
    expect(chineseAdaptiveGuide).toContain('直播')
    expect(apiReference).toContain('AdaptiveContentType')
  })

  it('documents advanced source cookbook boundaries in both languages', async () => {
    const [englishGuide, chineseGuide, englishApiReference, readme] = await Promise.all([
      readFile(resolve(docsRoot, 'guide/getting-started.md'), 'utf8'),
      readFile(resolve(docsRoot, 'zh/guide/getting-started.md'), 'utf8'),
      readFile(resolve(docsRoot, 'guide/api-reference.md'), 'utf8'),
      readFile(resolve(docsRoot, '../../packages/gaudio/README.md'), 'utf8'),
    ])

    expect(englishGuide).toContain('Source cookbook')
    expect(englishGuide).toContain('signed URL')
    expect(englishGuide).toContain('credentials')
    expect(englishGuide).toContain('silent analyzer samples')
    expect(chineseGuide).toContain('Source cookbook')
    expect(chineseGuide).toContain('签名 URL')
    expect(chineseGuide).toContain('credentials')
    expect(chineseGuide).toContain('静音的 analyzer 样本')
    expect(englishApiReference).toContain('does not manage headers')
    expect(readme).toContain('does not attach headers')
  })
})
