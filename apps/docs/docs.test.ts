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
      mergeReadme?: boolean
      readme?: string
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
    expect(typeDocConfig.readme).toBe('api-overview.md')
    expect(typeDocConfig.mergeReadme).toBe(true)
  })

  it('curates the generated API entry page', async () => {
    const apiOverview = await readFile(resolve(docsRoot, 'api-overview.md'), 'utf8')

    // AI modified: guard the TypeDoc overview source so /api/ stays useful after regeneration.
    expect(apiOverview).toContain('## Start Here')
    expect(apiOverview).toContain('AudioPlayer')
    expect(apiOverview).toContain('Adaptive Playback')
    expect(apiOverview).toContain('gaudio/hls')
    expect(apiOverview).toContain('gaudio/dash')
  })

  it('ships bilingual guide pages without migration documentation', async () => {
    const [englishGuideFiles, chineseGuideFiles, englishHome, chineseHome] = await Promise.all([
      readdir(resolve(docsRoot, 'guide')),
      readdir(resolve(docsRoot, 'zh/guide')),
      readFile(resolve(docsRoot, 'index.md'), 'utf8'),
      readFile(resolve(docsRoot, 'zh/index.md'), 'utf8'),
    ])

    expect(englishGuideFiles).not.toContain('migration.md')
    expect(chineseGuideFiles).not.toContain('migration.md')
    expect(englishGuideFiles).toEqual(expect.arrayContaining([
      'getting-started.md',
      'configuration.md',
      'recipes.md',
      'adaptive-playback.md',
      'events.md',
      'api-reference.md',
    ]))
    expect(chineseGuideFiles).toEqual(expect.arrayContaining([
      'getting-started.md',
      'configuration.md',
      'recipes.md',
      'adaptive-playback.md',
      'events.md',
      'api-reference.md',
    ]))
    expect(englishHome).toContain('Pre-release')
    // AI modified: keep the home page focused on the library capability surface.
    expect(englishHome).toContain('Capability Map')
    expect(englishHome).toContain('Source lifecycle')
    expect(englishHome).toContain('Adaptive delivery')
    expect(englishHome).toContain('<HomeMiniPlayer />')
    expect(chineseHome).toContain('预发布')
    expect(chineseHome).toContain('能力地图')
    expect(chineseHome).toContain('Source 生命周期')
    expect(chineseHome).toContain('自适应分发')
    expect(chineseHome).toContain('<HomeMiniPlayer />')
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

  it('documents complete configuration and scenario recipes in both languages', async () => {
    const [englishConfiguration, chineseConfiguration, englishRecipes, chineseRecipes, englishEvents, chineseEvents] = await Promise.all([
      readFile(resolve(docsRoot, 'guide/configuration.md'), 'utf8'),
      readFile(resolve(docsRoot, 'zh/guide/configuration.md'), 'utf8'),
      readFile(resolve(docsRoot, 'guide/recipes.md'), 'utf8'),
      readFile(resolve(docsRoot, 'zh/guide/recipes.md'), 'utf8'),
      readFile(resolve(docsRoot, 'guide/events.md'), 'utf8'),
      readFile(resolve(docsRoot, 'zh/guide/events.md'), 'utf8'),
    ])

    expect(englishConfiguration).toContain('Player options')
    expect(englishConfiguration).toContain('Media Session configuration')
    expect(englishConfiguration).toContain('Adaptive adapter configuration')
    expect(chineseConfiguration).toContain('Player 参数')
    expect(chineseConfiguration).toContain('Media Session 配置')
    expect(chineseConfiguration).toContain('自适应 adapter 配置')
    expect(englishRecipes).toContain('Signed URL source')
    expect(englishRecipes).toContain('Canvas spectrum visualizer')
    expect(englishRecipes).toContain('Runtime adaptive tuning')
    expect(chineseRecipes).toContain('签名 URL source')
    expect(chineseRecipes).toContain('Canvas 频谱可视化')
    expect(chineseRecipes).toContain('运行时自适应调优')
    expect(englishEvents).toContain('manual')
    expect(chineseEvents).toContain('manual')
  })
})
