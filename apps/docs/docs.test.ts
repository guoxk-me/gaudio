import type { Dirent } from 'node:fs'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, relative, resolve } from 'node:path'
import process from 'node:process'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const docsRoot = resolve(import.meta.dirname)
const demoTrackIds = ['aurora-loop', 'city-lantern', 'signal-bloom', 'warm-current'] as const

async function documentationMarkdownFiles(directory: string): Promise<string[]> {
  const directoryEntries = await readdir(directory, { withFileTypes: true })
  const markdownFiles = await Promise.all(directoryEntries.map(async (directoryEntry: Dirent) => {
    if (directoryEntry.name === 'api' && directory === docsRoot) {
      return []
    }

    const entryPath = resolve(directory, directoryEntry.name)

    if (directoryEntry.isDirectory()) {
      return documentationMarkdownFiles(entryPath)
    }

    return directoryEntry.isFile() && directoryEntry.name.endsWith('.md') ? [entryPath] : []
  }))

  return markdownFiles.flat()
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  }
  catch {
    return false
  }
}

async function directoryByteSize(directory: string): Promise<number> {
  const directoryEntries = await readdir(directory, { withFileTypes: true })
  const entryByteSizes = await Promise.all(directoryEntries.map(async (directoryEntry: Dirent) => {
    const entryPath = resolve(directory, directoryEntry.name)

    return directoryEntry.isDirectory()
      ? directoryByteSize(entryPath)
      : (await stat(entryPath)).size
  }))

  return entryByteSizes.reduce((totalBytes, entryBytes) => totalBytes + entryBytes, 0)
}

interface AudioAssetSnapshot {
  byteSize: number
  contentHash: string
  relativePath: string
}

interface SemanticDocumentationExample {
  documentationPath: string
  heading: string
  virtualFileName: string
}

async function audioAssetSnapshot(audioRoot: string, directory = audioRoot): Promise<AudioAssetSnapshot[]> {
  const directoryEntries = await readdir(directory, { withFileTypes: true })
  const assetSnapshots = await Promise.all(directoryEntries.map(async (directoryEntry: Dirent) => {
    const entryPath = resolve(directory, directoryEntry.name)

    if (directoryEntry.isDirectory()) {
      return audioAssetSnapshot(audioRoot, entryPath)
    }

    const assetBytes = await readFile(entryPath)

    return [{
      byteSize: assetBytes.byteLength,
      contentHash: createHash('sha256').update(assetBytes).digest('hex'),
      relativePath: relative(audioRoot, entryPath),
    }]
  }))

  return assetSnapshots.flat().sort((leftAsset, rightAsset) => (
    leftAsset.relativePath.localeCompare(rightAsset.relativePath)
  ))
}

function documentationTargets(sourceFile: string, linkTarget: string): string[] {
  const targetWithoutHash = linkTarget.split(/[?#]/)[0]
  const decodedTarget = decodeURIComponent(targetWithoutHash.replace(/^<|>$/g, ''))
  const targetPath = decodedTarget.startsWith('/')
    ? resolve(docsRoot, `.${decodedTarget}`)
    : resolve(dirname(sourceFile), decodedTarget)

  if (extname(targetPath)) {
    return [targetPath, resolve(docsRoot, 'public', `.${decodedTarget}`)]
  }

  return [
    `${targetPath}.md`,
    resolve(targetPath, 'index.md'),
    resolve(docsRoot, 'public', `.${decodedTarget}`),
  ]
}

function typescriptExampleUnderHeading(markdownSource: string, heading: string): string {
  const markdownLines = markdownSource.split(/\r?\n/)
  const headingLine = `## ${heading}`
  const headingLineIndex = markdownLines.findIndex(markdownLine => markdownLine === headingLine)
  if (headingLineIndex === -1) {
    throw new Error(`Documentation heading not found: ${headingLine}`)
  }

  const nextHeadingOffset = markdownLines
    .slice(headingLineIndex + 1)
    .findIndex(markdownLine => markdownLine.startsWith('## '))
  const sectionEndLineIndex = nextHeadingOffset === -1
    ? markdownLines.length
    : headingLineIndex + 1 + nextHeadingOffset
  const sectionLines = markdownLines.slice(headingLineIndex + 1, sectionEndLineIndex)
  const codeFenceLineIndex = sectionLines.findIndex(markdownLine => /^```(?:ts|typescript)$/.test(markdownLine))
  if (codeFenceLineIndex === -1) {
    throw new Error(`TypeScript example not found under ${headingLine}`)
  }

  const codeFenceEndOffset = sectionLines
    .slice(codeFenceLineIndex + 1)
    .findIndex(markdownLine => markdownLine === '```')
  if (codeFenceEndOffset === -1) {
    throw new Error(`TypeScript example is not closed under ${headingLine}`)
  }

  return sectionLines
    .slice(codeFenceLineIndex + 1, codeFenceLineIndex + 1 + codeFenceEndOffset)
    .join('\n')
}

function documentationDiagnosticMessage(diagnostic: ts.Diagnostic): string {
  const diagnosticMessage = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  if (!diagnostic.file || diagnostic.start === undefined) {
    return diagnosticMessage
  }

  const diagnosticPosition = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
  return `${relative(docsRoot, diagnostic.file.fileName)}:${diagnosticPosition.line + 1}:${diagnosticPosition.character + 1} ${diagnosticMessage}`
}

async function semanticDocumentationDiagnostics(
  semanticExamples: readonly SemanticDocumentationExample[],
): Promise<string[]> {
  const virtualSources = new Map<string, string>()
  for (const semanticExample of semanticExamples) {
    const documentationFile = resolve(docsRoot, semanticExample.documentationPath)
    const markdownSource = await readFile(documentationFile, 'utf8')
    virtualSources.set(
      resolve(docsRoot, semanticExample.virtualFileName),
      typescriptExampleUnderHeading(markdownSource, semanticExample.heading),
    )
  }

  const compilerOptions: ts.CompilerOptions = {
    allowSyntheticDefaultImports: true,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: false,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
  }
  const defaultCompilerHost = ts.createCompilerHost(compilerOptions, true)
  const compilerHost: ts.CompilerHost = {
    ...defaultCompilerHost,
    fileExists: fileName => virtualSources.has(fileName) || defaultCompilerHost.fileExists(fileName),
    getSourceFile: (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
      const virtualSource = virtualSources.get(fileName)
      return virtualSource === undefined
        ? defaultCompilerHost.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
        : ts.createSourceFile(fileName, virtualSource, languageVersion, true, ts.ScriptKind.TS)
    },
    readFile: fileName => virtualSources.get(fileName) ?? defaultCompilerHost.readFile(fileName),
  }
  const semanticExampleProgram = ts.createProgram({
    host: compilerHost,
    options: compilerOptions,
    rootNames: [...virtualSources.keys()],
  })

  return ts.getPreEmitDiagnostics(semanticExampleProgram).map(documentationDiagnosticMessage)
}

describe('documentation application', () => {
  it('is a private workspace consumer with a Vercel-compatible build', async () => {
    const [
      packageJsonText,
      nuxtConfig,
      typeDocConfigText,
      docsTypeScriptConfig,
      docsBaseConfiguration,
    ] = await Promise.all([
      readFile(resolve(docsRoot, 'package.json'), 'utf8'),
      readFile(resolve(docsRoot, 'nuxt.config.ts'), 'utf8'),
      readFile(resolve(docsRoot, 'typedoc.json'), 'utf8'),
      readFile(resolve(docsRoot, 'tsconfig.json'), 'utf8'),
      readFile(resolve(docsRoot, 'lib/docs-base.ts'), 'utf8'),
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
      requiredToBeDocumented?: string[]
      treatValidationWarningsAsErrors?: boolean
      validation?: {
        notDocumented?: boolean
      }
    }

    expect(packageJson.private).toBe(true)
    expect(packageJson.dependencies?.gaudio).toBe('workspace:*')
    expect(packageJson.scripts?.build).toBe('pnpm run generate')
    expect(packageJson.scripts?.generate).toContain('pnpm run api')
    expect(packageJson.scripts?.generate).toContain('nuxt generate')
    expect(packageJson.scripts?.['build:ssr']).toContain('nuxt build')
    expect(packageJson.scripts?.generate).toContain('check-built-links.mjs')
    expect(packageJson.scripts?.dev).toContain('pnpm run licenses')
    expect(packageJson.scripts?.dev).toContain('pnpm run api')
    expect(packageJson.scripts).toHaveProperty('dev')
    expect(packageJson.scripts).toHaveProperty('lint')
    expect(packageJson.scripts).toHaveProperty('test')
    expect(packageJson.scripts).toHaveProperty('typecheck')
    expect(nuxtConfig).toContain('import { docsBase } from \'./lib/docs-base.ts\'')
    expect(docsBaseConfiguration).toContain('process.env.DOCS_BASE ?? \'/gaudio/\'')
    expect(docsBaseConfiguration).toContain('export function resolveDocsBase(configuredBase: string): string')
    expect(docsBaseConfiguration).toContain('hasUnsafeDocsBaseStructure(configuredBase)')
    expect(docsBaseConfiguration).toContain('docsBaseWithLeadingSlash.endsWith(\'/\')')
    // AI modified: one Nuxt route tree owns both locales, static generation, and compatibility redirects.
    expect(nuxtConfig).toContain('modules: [[\'@nuxt/content\', contentOptions], \'@nuxtjs/sitemap\']')
    expect(nuxtConfig).toContain('\'/zh\'')
    expect(nuxtConfig).toContain('\'/zh/examples\'')
    expect(nuxtConfig).toContain('compatibilityRouteRules')
    expect(nuxtConfig).toContain('routeAliases.add(`/en')
    expect(nuxtConfig).toContain('routeAliases.add(`/docs')
    expect(nuxtConfig).toContain('payloadExtraction: false')
    expect(nuxtConfig).toContain('failOnError: true')
    expect(nuxtConfig).toContain('process.env.GITHUB_SHA')
    expect(typeDocConfig.entryFileName).toBe('index')
    expect(typeDocConfig.readme).toBe('api-overview.md')
    expect(typeDocConfig.mergeReadme).toBe(true)
    // AI modified: public API additions must include TSDoc before documentation builds can pass.
    expect(typeDocConfig.requiredToBeDocumented).toEqual(expect.arrayContaining([
      'Module',
      'EnumMember',
      'Function',
      'Class',
      'Interface',
      'Property',
      'Method',
      'Parameter',
      'TypeAlias',
    ]))
    expect(typeDocConfig.treatValidationWarningsAsErrors).toBe(true)
    expect(typeDocConfig.validation?.notDocumented).toBe(true)
    // AI modified: Nuxt-generated application types and strict authored source stay inside vue-tsc.
    expect(docsTypeScriptConfig).toContain('"./.nuxt/tsconfig.json"')
    expect(docsTypeScriptConfig).toContain('"strict": true')
  })

  it('reserves the contentinfo landmark for the site-wide footer', async () => {
    const [applicationLayout, siteFooter] = await Promise.all([
      readFile(resolve(docsRoot, 'app/layouts/default.vue'), 'utf8'),
      readFile(resolve(docsRoot, 'app/components/SiteFooter.vue'), 'utf8'),
    ])

    // AI modified: Nuxt renders exactly one shared footer outside page documents.
    expect(applicationLayout).toContain('<SiteFooter />')
    expect(siteFooter).toContain('<footer class="site-footer">')
    expect(siteFooter).toContain('Third-party licenses')
    expect(siteFooter).not.toContain('role="contentinfo"')
  })

  it('keeps repository release and deployment safeguards documented', async () => {
    const [
      dependabotConfiguration,
      continuousIntegrationWorkflow,
      documentationWorkflow,
      releaseWorkflow,
      playwrightConfiguration,
      vitePreviewConfiguration,
      audioDemoSpecification,
      turboConfiguration,
      securityPolicy,
      contributionGuide,
      releaseGuide,
      projectRecordsGuide,
      rootPackageJsonText,
      rootReadme,
      packageReadme,
    ] = await Promise.all([
      readFile(resolve(docsRoot, '../../.github/dependabot.yml'), 'utf8'),
      readFile(resolve(docsRoot, '../../.github/workflows/ci.yml'), 'utf8'),
      readFile(resolve(docsRoot, '../../.github/workflows/docs.yml'), 'utf8'),
      readFile(resolve(docsRoot, '../../.github/workflows/release.yml'), 'utf8'),
      readFile(resolve(docsRoot, '../../playwright.config.ts'), 'utf8'),
      readFile(resolve(docsRoot, 'vite.preview.config.ts'), 'utf8'),
      readFile(resolve(docsRoot, 'e2e/audio-demo.spec.ts'), 'utf8'),
      readFile(resolve(docsRoot, '../../turbo.json'), 'utf8'),
      readFile(resolve(docsRoot, '../../SECURITY.md'), 'utf8'),
      readFile(resolve(docsRoot, '../../CONTRIBUTING.md'), 'utf8'),
      readFile(resolve(docsRoot, '../../RELEASING.md'), 'utf8'),
      readFile(resolve(docsRoot, '../../project/README.md'), 'utf8'),
      readFile(resolve(docsRoot, '../../package.json'), 'utf8'),
      readFile(resolve(docsRoot, '../../README.md'), 'utf8'),
      readFile(resolve(docsRoot, '../../packages/gaudio/README.md'), 'utf8'),
    ])

    // AI modified: keep dependency automation limited to reviewed development patch updates.
    expect(dependabotConfiguration).toContain('applies-to: version-updates')
    expect(dependabotConfiguration).toContain('dependency-type: development')
    expect(dependabotConfiguration).toContain('update-types:\n          - patch')
    // AI modified: direct pushes to both shared branches must receive the complete verification job.
    const pushTriggerIndex = continuousIntegrationWorkflow.indexOf('  push:')
    const mainBranchIndex = continuousIntegrationWorkflow.indexOf('      - main', pushTriggerIndex)
    const developmentBranchIndex = continuousIntegrationWorkflow.indexOf('      - dev', mainBranchIndex)
    expect(pushTriggerIndex).toBeGreaterThanOrEqual(0)
    expect(mainBranchIndex).toBeGreaterThan(pushTriggerIndex)
    expect(developmentBranchIndex).toBeGreaterThan(mainBranchIndex)

    // AI modified: a Vercel artifact is publishable only after ref validation and full project verification.
    expect(documentationWorkflow).toContain('if [ "$GITHUB_REF" != "refs/heads/main" ]; then')
    expect(documentationWorkflow.indexOf('Validate deployment ref')).toBeLessThan(documentationWorkflow.indexOf('actions/checkout@'))
    expect(documentationWorkflow).toContain('pnpm audit --audit-level high')
    expect(documentationWorkflow).toContain('pnpm run typecheck')
    expect(documentationWorkflow).toContain('pnpm run lint')
    expect(documentationWorkflow).toContain('pnpm run test')
    expect(documentationWorkflow).toContain('pnpm run coverage')
    expect(documentationWorkflow).toContain('pnpm run build')
    expect(documentationWorkflow).not.toContain('pnpm run docs:build')
    expect(documentationWorkflow).toContain('pnpm exec playwright install --with-deps chromium firefox webkit')
    expect(documentationWorkflow).toContain('pnpm --filter @gaudio/docs build:ssr')
    expect(documentationWorkflow).toContain('pnpm --filter @gaudio/docs e2e')
    expect(documentationWorkflow).toContain('DOCS_E2E_USE_EXISTING_BUILD: "true"')
    expect(documentationWorkflow).toContain('pnpm dlx vercel@59.1.4 build --prod')
    expect(documentationWorkflow).toContain('pnpm dlx vercel@59.1.4 deploy --prebuilt --prod')
    expect(documentationWorkflow).toContain('pnpm dlx vercel@59.1.4 deploy --prebuilt --yes')
    expect(documentationWorkflow).toMatch(/DOCS_SITE_URL: \$\{\{ vars\.DOCS_SITE_URL \}\}/)
    expect(documentationWorkflow).toMatch(/VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}/)
    expect(documentationWorkflow).not.toContain('actions/deploy-pages@')
    expect(playwrightConfiguration).toContain('process.env.DOCS_E2E_USE_EXISTING_BUILD === \'true\'')
    // AI modified: Turbo must forward the CI and reuse flags so browser policy survives task isolation.
    expect(turboConfiguration).toContain('"CI"')
    expect(turboConfiguration).toContain('"DOCS_E2E_USE_EXISTING_BUILD"')
    const rootPackageJson = JSON.parse(rootPackageJsonText) as {
      scripts?: Record<string, string>
      type?: string
    }
    // AI modified: the root Playwright config must share the docs suite's ESM loader and compilation cache.
    expect(rootPackageJson.type).toBe('module')
    // AI modified: ignored root E2E configuration must be linted explicitly by the repository gate.
    expect(rootPackageJson.scripts?.lint).toContain('eslint --no-ignore eslint.config.mjs playwright.config.ts')
    expect(playwrightConfiguration).toContain('const workspaceRoot = import.meta.dirname')
    expect(playwrightConfiguration).not.toContain('__filename')
    expect(playwrightConfiguration).toContain('forbidOnly: isContinuousIntegration')
    expect(playwrightConfiguration).toContain('retries: isContinuousIntegration ? 1 : 0')
    expect(playwrightConfiguration).toContain('trace: \'retain-on-failure\'')
    expect(playwrightConfiguration).toContain('outputDir: \'output/playwright/results\'')
    expect(playwrightConfiguration).toContain('outputFolder: \'output/playwright/report\'')
    expect(playwrightConfiguration).toContain('command: docsPreviewCommand')
    // AI modified: the preview server must honor loopback binding and serve only the verified Nuxt output.
    expect(playwrightConfiguration).toContain('pnpm exec vite preview . --config vite.preview.config.ts')
    expect(playwrightConfiguration).not.toContain('vitepress preview')
    expect(playwrightConfiguration).toContain('DOCS_PREVIEW_PORT must be an integer from 1 to 65535')
    expect(playwrightConfiguration).toContain('docsRoute(\'examples/\')')
    expect(vitePreviewConfiguration).toContain('import { docsBase } from \'./lib/docs-base.ts\'')
    expect(vitePreviewConfiguration).toContain('const docsOutput = resolve(import.meta.dirname, \'.output/public\')')
    // AI modified: optimized previews must serve Nuxt's generated 404 instead of hydrating the home document.
    expect(vitePreviewConfiguration).toContain('appType: \'mpa\'')
    expect(vitePreviewConfiguration).toContain('plugins: [documentationNotFoundPreview()]')
    expect(vitePreviewConfiguration).toContain('readFileSync(resolve(outputDirectory, \'404.html\'), \'utf8\')')
    expect(vitePreviewConfiguration).toContain('response.statusCode = 404')
    expect(vitePreviewConfiguration).toContain('response.setHeader(\'Content-Length\', Buffer.byteLength(notFoundHtml))')
    expect(vitePreviewConfiguration).toContain('server.middlewares.use(documentationCleanPageMiddleware(outputDirectory))')
    expect(vitePreviewConfiguration).toContain('return () => {')
    expect(vitePreviewConfiguration).toContain('host: \'127.0.0.1\'')
    expect(vitePreviewConfiguration).toContain('strictPort: true')
    // AI modified: custom documentation bases must flow into every browser route and asset assertion.
    expect(audioDemoSpecification).toContain('import { docsBase, docsRoute } from \'../lib/docs-base.ts\'')
    expect(audioDemoSpecification).toContain('docsRoute(\'audio/hls/signal-bloom.m3u8\')')
    expect(audioDemoSpecification).not.toContain('\'/gaudio/')

    // AI modified: every workflow that launches browsers must retain its report and failed-attempt traces.
    for (const browserWorkflow of [continuousIntegrationWorkflow, documentationWorkflow, releaseWorkflow]) {
      expect(browserWorkflow).toContain('Upload Playwright diagnostics')
      expect(browserWorkflow).toContain('if: always()')
      expect(browserWorkflow).toContain('output/playwright/report')
      expect(browserWorkflow).toContain('output/playwright/results')
      expect(browserWorkflow).toContain('if-no-files-found: ignore')
    }
    expect(continuousIntegrationWorkflow).toContain('DOCS_E2E_USE_EXISTING_BUILD: "true"')
    expect(releaseWorkflow).toContain('DOCS_E2E_USE_EXISTING_BUILD: "true"')

    expect(securityPolicy).toContain('current `main` branch')
    expect(contributionGuide).toContain('pnpm audit --audit-level high')
    expect(contributionGuide).toContain('Node.js 18 is EOL')
    expect(contributionGuide).toContain('DOCS_E2E_USE_EXISTING_BUILD=true')
    expect(contributionGuide).toContain('DOCS_PREVIEW_PORT=4174')
    expect(contributionGuide).toContain('output/playwright/')
    expect(projectRecordsGuide).toContain('**Historical roadmap snapshot:**')
    expect(rootReadme).toContain('[`packages/gaudio/CHANGELOG.md`](packages/gaudio/CHANGELOG.md)')
    expect(rootReadme).toContain('[`CONTRIBUTING.md`](CONTRIBUTING.md)')
    expect(rootReadme).toContain('[`SUPPORT.md`](SUPPORT.md)')
    expect(rootReadme).toContain('[`SECURITY.md`](SECURITY.md)')
    // AI modified: npm readers need direct support and private vulnerability-reporting routes.
    expect(packageReadme).toContain('https://github.com/guoxk-me/gaudio/blob/main/SUPPORT.md')
    expect(packageReadme).toContain('https://github.com/guoxk-me/gaudio/security/advisories/new')
    expect(packageReadme).toContain('https://github.com/guoxk-me/gaudio/security/policy')

    expect(releaseGuide).toContain('Read and write')
    expect(releaseGuide).toContain('Bypass 2FA')
    expect(releaseGuide).toContain('at most 90 days')
    expect(releaseGuide).toContain('Organization or user: `guoxk-me`')
    expect(releaseGuide).toContain('Repository: `gaudio`')
    expect(releaseGuide).toContain('Workflow filename: `release.yml`')
    expect(releaseGuide).toContain('Environment: `npm`')
    expect(releaseGuide).toContain('Allowed action: `npm publish`')
    expect(releaseGuide).toContain('npm CLI 11.5.1 or newer')
    expect(releaseGuide).toContain('real, non-future UTC date recorded for that release')
    expect(releaseGuide).toContain('Keep that date unchanged when retrying the same reviewed tag')
    expect(releaseGuide).toContain('pnpm exec playwright install chromium firefox webkit')
    expect(contributionGuide).toContain('pnpm exec playwright install chromium firefox webkit')
    // AI modified: first-time Pages activation retains a human playback check beyond HTTP-only smoke coverage.
    expect(releaseGuide).toContain('automated post-deploy smoke')
    expect(releaseGuide).toContain('Play both the HLS and DASH sample')
    expect(releaseGuide).toContain('revoke the bootstrap token')
  })

  it('curates the generated API entry page', async () => {
    const [apiOverview, coreEntryPoint] = await Promise.all([
      readFile(resolve(docsRoot, 'api-overview.md'), 'utf8'),
      readFile(resolve(docsRoot, '../../packages/gaudio/src/index.ts'), 'utf8'),
    ])

    // AI modified: guard the TypeDoc overview source so /api/ stays useful after regeneration.
    expect(apiOverview).toContain('## Start Here')
    expect(apiOverview).toContain('AudioPlayer')
    expect(apiOverview).toContain('Adaptive Playback')
    expect(apiOverview).toContain('gaudio/hls')
    expect(apiOverview).toContain('gaudio/dash')
    // AI modified: the core module must not regenerate the client-ambiguous /api/index route.
    expect(coreEntryPoint).toContain('@module core')
    expect(apiOverview).toContain('/api/core/classes/AudioPlayer')
    expect(apiOverview).not.toContain('/api/index/')
  })

  it('keeps generated API navigation inside the active Chinese locale', async () => {
    const [nuxtConfig, documentationPage, navigationConfiguration] = await Promise.all([
      readFile(resolve(docsRoot, 'nuxt.config.ts'), 'utf8'),
      readFile(resolve(docsRoot, 'app/pages/[...slug].vue'), 'utf8'),
      readFile(resolve(docsRoot, 'app/config/documentation-navigation.ts'), 'utf8'),
    ])

    expect(nuxtConfig).toContain('...apiRoutes.map(routePath => `/zh')
    expect(nuxtConfig).toContain('exclude: [\'/zh/api/**\', \'/__docs/**\']')
    // AI modified: English declarations remain canonical while the Nuxt page mirrors links inside /zh/api.
    expect(documentationPage).toContain('const isChineseApiMirror')
    expect(documentationPage).toContain('contentPath.value.toLocaleLowerCase()')
    expect(documentationPage).toContain('const canonicalPath = computed')
    expect(documentationPage).toContain(':lang="isChineseApiMirror ? \'en-US\' : undefined"')
    expect(documentationPage).toContain('const localePrefix = isChinese.value')
    expect(navigationConfiguration).toContain('const chineseGuideLinks')
  })

  it('keeps generated audio samples within the static deployment budget', async () => {
    const audioRoot = resolve(docsRoot, 'public/audio')
    const standardFormats = [
      { folder: 'mp3', extension: '.mp3' },
      { folder: 'wav', extension: '.wav' },
      { folder: 'm4a', extension: '.m4a' },
      { folder: 'ogg', extension: '.ogg' },
    ] as const
    const standardAssetFiles: string[] = []

    for (const standardFormat of standardFormats) {
      const expectedFiles = demoTrackIds.map(trackId => `${trackId}${standardFormat.extension}`).sort()
      const actualFiles = (await readdir(resolve(audioRoot, standardFormat.folder))).sort()

      expect(actualFiles).toEqual(expectedFiles)
      standardAssetFiles.push(...actualFiles.map(fileName => resolve(audioRoot, standardFormat.folder, fileName)))
    }

    const waveByteSizes = await Promise.all(demoTrackIds.map(async trackId => (
      (await stat(resolve(audioRoot, 'wav', `${trackId}.wav`))).size
    )))
    const hlsRoot = resolve(audioRoot, 'hls')
    const hlsFiles = await readdir(hlsRoot)
    const hlsPlaylists = hlsFiles.filter(fileName => fileName.endsWith('.m3u8'))
    const hlsSegments = hlsFiles.filter(fileName => fileName.endsWith('.ts'))
    const hlsReferences = new Set<string>()

    for (const hlsPlaylist of hlsPlaylists) {
      const playlistSource = await readFile(resolve(hlsRoot, hlsPlaylist), 'utf8')
      const playlistReferences = playlistSource
        .split(/\r?\n/)
        .map(playlistLine => playlistLine.trim())
        .filter(playlistLine => playlistLine.length > 0 && !playlistLine.startsWith('#'))

      for (const playlistReference of playlistReferences) {
        hlsReferences.add(playlistReference)
        expect(hlsFiles).toContain(playlistReference)
      }
    }

    for (const trackId of demoTrackIds) {
      expect(hlsFiles).toContain(`${trackId}.m3u8`)
      expect(hlsPlaylists.filter(fileName => fileName.startsWith(`${trackId}-`))).toHaveLength(3)
    }

    const dashRoot = resolve(audioRoot, 'dash')
    const dashFiles = await readdir(dashRoot)
    const expectedDashFiles = demoTrackIds.flatMap(trackId => [
      `${trackId}.mpd`,
      ...[0, 1, 2].flatMap(representationId => [
        `${trackId}-init-${representationId}.m4s`,
        `${trackId}-segment-${representationId}-00001.m4s`,
        `${trackId}-segment-${representationId}-00002.m4s`,
      ]),
    ]).sort()

    expect(dashFiles.sort()).toEqual(expectedDashFiles)

    for (const trackId of demoTrackIds) {
      const manifestName = `${trackId}.mpd`
      const manifestSource = await readFile(resolve(dashRoot, manifestName), 'utf8')

      expect(dashFiles).toContain(manifestName)
      expect(manifestSource).toContain(`${trackId}-init-$RepresentationID$.m4s`)
      expect(manifestSource).toContain(`${trackId}-segment-$RepresentationID$-$Number%05d$.m4s`)

      for (const representationId of [0, 1, 2]) {
        expect(dashFiles).toContain(`${trackId}-init-${representationId}.m4s`)
      }
    }

    const adaptiveAssetFiles = [
      ...hlsFiles.map(fileName => resolve(hlsRoot, fileName)),
      ...dashFiles.map(fileName => resolve(dashRoot, fileName)),
    ]
    const generatedAssetFiles = [...standardAssetFiles, ...adaptiveAssetFiles]
    const generatedAssetByteSizes = await Promise.all(generatedAssetFiles.map(async assetFile => (
      (await stat(assetFile)).size
    )))

    // AI modified: guard every format and adaptive reference as well as the Pages deployment budget.
    expect(generatedAssetFiles).toHaveLength(108)
    expect(generatedAssetByteSizes.every(assetBytes => assetBytes > 0)).toBe(true)
    expect(hlsSegments.every(segmentName => hlsReferences.has(segmentName))).toBe(true)
    expect(hlsPlaylists.filter(fileName => /-(?:48k|96k|128k)\.m3u8$/.test(fileName)).every(playlistName => hlsReferences.has(playlistName))).toBe(true)
    expect(Math.max(...waveByteSizes)).toBeLessThan(1_500_000)
    expect(await directoryByteSize(audioRoot)).toBeLessThan(12_000_000)
  })

  it('preserves the published audio set when sample encoding fails', async () => {
    const audioRoot = resolve(docsRoot, 'public/audio')
    const generatorScript = resolve(docsRoot, 'scripts/generate-demo-audio.mjs')
    const publishedAssetsBeforeFailure = await audioAssetSnapshot(audioRoot)

    // AI modified: exercise the staging failure path so a missing encoder cannot corrupt published samples.
    const generatorExitCode = await new Promise<number>((resolveExitCode, rejectLaunch) => {
      const generatorProcess = spawn(process.execPath, [generatorScript], {
        cwd: docsRoot,
        env: {
          ...process.env,
          GAUDIO_FFMPEG_BINARY: process.execPath,
        },
        stdio: 'ignore',
      })

      generatorProcess.on('error', rejectLaunch)
      generatorProcess.on('close', exitCode => resolveExitCode(exitCode ?? -1))
    })
    const publishedAssetsAfterFailure = await audioAssetSnapshot(audioRoot)
    const publicDirectoryEntries = await readdir(resolve(docsRoot, 'public'))
    const incompleteAudioDirectories = publicDirectoryEntries.filter(directoryEntry => (
      directoryEntry.startsWith('.audio-staging-') || directoryEntry.startsWith('audio.previous-')
    ))

    expect(generatorExitCode).not.toBe(0)
    expect(publishedAssetsAfterFailure).toEqual(publishedAssetsBeforeFailure)
    expect(incompleteAudioDirectories).toEqual([])
  }, 30_000)

  it('ships bilingual guide pages without migration documentation', async () => {
    const [englishGuideFiles, chineseGuideFiles, homePage, homeHero, capabilities] = await Promise.all([
      readdir(resolve(docsRoot, 'guide')),
      readdir(resolve(docsRoot, 'zh/guide')),
      readFile(resolve(docsRoot, 'app/components/HomePage.vue'), 'utf8'),
      readFile(resolve(docsRoot, 'app/components/HomeHero.vue'), 'utf8'),
      readFile(resolve(docsRoot, 'app/components/HomeCapabilities.vue'), 'utf8'),
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
    // AI modified: locale-aware Nuxt components render the approved use-case-first home composition.
    expect(homeHero).toContain('<HomeMiniPlayer :controller="player" />')
    expect(homeHero).toContain('One player for browser audio, HLS, and DASH.')
    expect(homePage).toContain('<HomeCapabilities />')
    expect(homePage).toContain('浏览器音频、HLS 与 DASH 播放器')
    expect(homePage).toContain('Browser audio, HLS, and DASH player')
    expect(capabilities).toContain('Playback')
    expect(capabilities).toContain('播放')
    expect(capabilities).toContain('Observability')
    expect(capabilities).toContain('可观测性')
  })

  it('loads the homepage player only where rendered and keeps load and playback failures retryable', async () => {
    const [applicationLayout, homePage, homeHero, miniPlayer, miniPlayerState] = await Promise.all([
      readFile(resolve(docsRoot, 'app/layouts/default.vue'), 'utf8'),
      readFile(resolve(docsRoot, 'app/components/HomePage.vue'), 'utf8'),
      readFile(resolve(docsRoot, 'app/components/HomeHero.vue'), 'utf8'),
      readFile(resolve(docsRoot, 'app/components/HomeMiniPlayer.vue'), 'utf8'),
      readFile(resolve(docsRoot, 'app/composables/use-home-mini-player.ts'), 'utf8'),
    ])

    // AI modified: keep the media-owning mini player out of the global layout and defer browser code until interaction.
    expect(applicationLayout).not.toContain('HomeMiniPlayer')
    expect(homePage).toContain('<HomeHero />')
    expect(homeHero).toContain('<HomeMiniPlayer :controller="player" />')
    expect(miniPlayerState).toContain('await import(\'gaudio\')')
    expect(miniPlayerState).toContain('preload: \'none\'')
    expect(miniPlayerState).not.toContain('onMounted')
    expect(miniPlayerState).toContain('playerErrorKind')
    expect(miniPlayerState).toContain('playerErrorKind.value = isReady.value ? \'playback\' : \'load\'')
    expect(miniPlayerState).toContain('playerErrorKind.value = undefined')
    expect(miniPlayer).toContain('Playback failed — retry')
    expect(miniPlayer).toContain('Retry sample')
    expect(miniPlayer).not.toContain('hasLoadError')
  })

  it('implements the approved homepage hierarchy and interactive proof surfaces', async () => {
    const [homePage, homeHero, homeMiniPlayer, homeQuickStart, homeAdoptionPaths, homeBoundaries, miniPlayerState, mainStyles] = await Promise.all([
      readFile(resolve(docsRoot, 'app/components/HomePage.vue'), 'utf8'),
      readFile(resolve(docsRoot, 'app/components/HomeHero.vue'), 'utf8'),
      readFile(resolve(docsRoot, 'app/components/HomeMiniPlayer.vue'), 'utf8'),
      readFile(resolve(docsRoot, 'app/components/HomeQuickStart.vue'), 'utf8'),
      readFile(resolve(docsRoot, 'app/components/HomeAdoptionPaths.vue'), 'utf8'),
      readFile(resolve(docsRoot, 'app/components/HomeBoundaries.vue'), 'utf8'),
      readFile(resolve(docsRoot, 'app/composables/use-home-mini-player.ts'), 'utf8'),
      readFile(resolve(docsRoot, 'app/assets/css/main.css'), 'utf8'),
    ])

    // AI modified: lock the selected value → proof → adoption → boundary sequence from the final wireframe.
    expect(homePage.indexOf('<HomeQuickStart />')).toBeLessThan(homePage.indexOf('<HomeAdoptionPaths />'))
    expect(homePage.indexOf('<HomeAdoptionPaths />')).toBeLessThan(homePage.indexOf('<HomeCapabilities />'))
    expect(homePage.indexOf('<HomeCapabilities />')).toBeLessThan(homePage.indexOf('<HomeBoundaries />'))
    expect(homeMiniPlayer).toContain('waveformPeaks')
    expect(homeMiniPlayer).toContain('Loaded after interaction · autoplay off')
    expect(homeQuickStart).toContain('[\'pnpm\', \'npm\', \'yarn\', \'bun\']')
    expect(homeQuickStart).toContain('localStorage.setItem(\'gaudio-package-manager\'')
    expect(homeQuickStart).toContain('navigator.clipboard.writeText')
    expect(homeAdoptionPaths).toContain('packageName: \'gaudio/hls\'')
    expect(homeAdoptionPaths).toContain('packageName: \'gaudio/dash\'')
    expect(homeBoundaries).toContain('GAudio is a playback library')
    expect(miniPlayerState).toContain('analyzer: {')
    expect(miniPlayerState).toContain('fftSize: 2048')
    expect(miniPlayerState).toContain('getFrequencyData({ binCount: 64 })')
    expect(homeHero).toContain('class="home-wireframe-hero"')
    expect(mainStyles).toContain('--home-wireframe-max: 1200px')
    expect(mainStyles).toContain('.home-showcase-player__waveform')
    expect(mainStyles).toContain('.home-wireframe-package-tabs')
  })

  it('documents adaptive content types in both languages', async () => {
    const [
      englishAdaptiveGuide,
      chineseAdaptiveGuide,
      apiReference,
      chineseApiReference,
      audioProtocolSource,
    ] = await Promise.all([
      readFile(resolve(docsRoot, 'guide/adaptive-playback.md'), 'utf8'),
      readFile(resolve(docsRoot, 'zh/guide/adaptive-playback.md'), 'utf8'),
      readFile(resolve(docsRoot, 'guide/api-reference.md'), 'utf8'),
      readFile(resolve(docsRoot, 'zh/guide/api-reference.md'), 'utf8'),
      readFile(resolve(docsRoot, '../../packages/gaudio/src/source/audio-protocol.ts'), 'utf8'),
    ])

    expect(englishAdaptiveGuide).toContain('contentType')
    expect(englishAdaptiveGuide).toContain('long-form')
    expect(englishAdaptiveGuide).toContain('live')
    expect(chineseAdaptiveGuide).toContain('contentType')
    expect(chineseAdaptiveGuide).toContain('长音频')
    expect(chineseAdaptiveGuide).toContain('直播')
    // AI modified: capability probes must not be documented as optional-peer dependency checks.
    expect(englishAdaptiveGuide).toContain('does not load the optional')
    expect(englishAdaptiveGuide).toContain('ADAPTER_UNAVAILABLE')
    expect(chineseAdaptiveGuide).toContain('不会加载可选的')
    expect(chineseAdaptiveGuide).toContain('ADAPTER_UNAVAILABLE')
    // AI modified: configuration prose must not promise nested partial types beyond the four modeled HLS policies.
    expect(englishAdaptiveGuide).toContain('Only manifest, playlist, fragment, and key load policies accept nested partial overrides')
    expect(chineseAdaptiveGuide).toContain('只有 manifest、playlist、fragment 与 key load policy 接受嵌套 partial 覆盖')
    expect(englishAdaptiveGuide).not.toContain('Deep partial `hls.js`')
    expect(chineseAdaptiveGuide).not.toContain('深度 partial 的 `hls.js`')
    expect(apiReference).toContain('AdaptiveContentType')
    // AI modified: protocol documentation must track every alias accepted by the shared router.
    const hlsMimeTypeBlock = audioProtocolSource.match(/export const hlsMimeTypes = \[([\s\S]*?)\] as const/)?.[1] ?? ''
    const hlsMimeTypes = [...hlsMimeTypeBlock.matchAll(/'([^']+)'/g)].map(mimeTypeMatch => mimeTypeMatch[1])
    expect(hlsMimeTypes).toHaveLength(5)
    for (const hlsMimeType of hlsMimeTypes) {
      expect(englishAdaptiveGuide).toContain(hlsMimeType)
      expect(chineseAdaptiveGuide).toContain(hlsMimeType)
    }
    expect(audioProtocolSource).toContain('pathname.endsWith(\'.m3u\')')
    expect(englishAdaptiveGuide).toContain('legacy `.m3u`')
    expect(chineseAdaptiveGuide).toContain('旧式 `.m3u`')
    // AI modified: examples must select ranked quality explicitly instead of assuming vendor order.
    expect(englishAdaptiveGuide).toContain('Variant order is implementation-owned')
    expect(chineseAdaptiveGuide).toContain('Variant 顺序由 implementation 决定')
    expect(englishAdaptiveGuide).not.toContain('variants.at(-1)')
    expect(chineseAdaptiveGuide).not.toContain('variants.at(-1)')
    expect(apiReference).not.toContain('const preferredVariant = variants[0]')
    expect(chineseApiReference).not.toContain('const preferredVariant = variants[0]')
    expect(apiReference).toContain('highestBitrateVariant')
    expect(chineseApiReference).toContain('highestBitrateVariant')
    // AI modified: authored API references must match the injected-engine termination contract in public TSDoc.
    for (const localizedApiReference of [apiReference, chineseApiReference]) {
      expect(localizedApiReference).toContain('Audio operation was interrupted by player disposal')
      expect(localizedApiReference).toContain('Audio operation was superseded by a replacement source')
      expect(localizedApiReference).toContain('Audio operation was superseded by a newer load')
      expect(localizedApiReference).toContain('Audio source is required before loading')
      expect(localizedApiReference).toContain('Audio seek was superseded by a newer seek')
      expect(localizedApiReference).toContain('Audio seek was superseded by stop')
      expect(localizedApiReference).toContain('Adaptive quality selection was superseded by a newer selection')
      expect(localizedApiReference).toContain('Audio source could not be loaded')
      expect(localizedApiReference).toContain('Audio playback failed')
    }
    expect(apiReference).toContain('silently supersedes the attempt and the public promise resolves')
    expect(chineseApiReference).toContain('会静默抢占，公开 promise resolve')
  })

  it('documents advanced source cookbook boundaries in both languages', async () => {
    const [englishGuide, chineseGuide, englishApiReference, readme, rootReadme] = await Promise.all([
      readFile(resolve(docsRoot, 'guide/getting-started.md'), 'utf8'),
      readFile(resolve(docsRoot, 'zh/guide/getting-started.md'), 'utf8'),
      readFile(resolve(docsRoot, 'guide/api-reference.md'), 'utf8'),
      readFile(resolve(docsRoot, '../../packages/gaudio/README.md'), 'utf8'),
      readFile(resolve(docsRoot, '../../README.md'), 'utf8'),
    ])

    // AI modified: installation guidance must remain usable before the first registry release exists.
    expect(englishGuide).toContain('Before the first registry release is visible')
    expect(chineseGuide).toContain('在首次 registry release 可见之前')
    expect(readme).toContain('Before the first registry release is visible')
    expect(rootReadme).toContain('Before the first registry release is visible')
    // AI modified: installation snippets cannot resolve to the incompatible hls.js 1.7 declaration release.
    for (const installationGuide of [englishGuide, chineseGuide, readme]) {
      expect(installationGuide).toContain('hls.js@~1.6.16')
    }
    expect(rootReadme).toContain('hls.js >=1.6.16 <1.7.0')
    // AI modified: public compatibility claims distinguish tested engines from browser and resolver guarantees.
    for (const englishCompatibilityGuide of [englishGuide, readme, rootReadme]) {
      expect(englishCompatibilityGuide).toContain('tested-current matrix, not a minimum-version or real-device guarantee')
      expect(englishCompatibilityGuide).toContain('globalThis.structuredClone()')
      expect(englishCompatibilityGuide).toContain('does not ship browser polyfills')
      expect(englishCompatibilityGuide).toContain('Legacy `node10` resolution')
      expect(englishCompatibilityGuide).toContain('`node16`, `nodenext`, or `bundler`')
    }
    expect(chineseGuide).toContain('并不承诺最低版本或真实设备兼容')
    expect(chineseGuide).toContain('globalThis.structuredClone()')
    expect(chineseGuide).toContain('不提供浏览器 polyfill')
    expect(chineseGuide).toContain('旧式 `node10` 解析')
    expect(englishGuide).toContain('Source cookbook')
    expect(englishGuide).toContain('signed URL')
    expect(englishGuide).toContain('credentials')
    // AI modified: CORS guidance covers request mode and the complete output, not just analyzer samples.
    expect(englishGuide).toContain('crossOrigin: \'anonymous\'')
    expect(englishGuide).toContain('silence the entire Web Audio output')
    expect(englishGuide).not.toContain('MIME sniffing')
    expect(chineseGuide).toContain('Source cookbook')
    expect(chineseGuide).toContain('签名 URL')
    expect(chineseGuide).toContain('credentials')
    expect(chineseGuide).toContain('crossOrigin: \'anonymous\'')
    expect(chineseGuide).toContain('整个音频输出都可能静音')
    expect(chineseGuide).not.toContain('MIME 判断')
    // AI modified: keep extension error identity distinct from GAudio-owned stable error codes.
    expect(englishGuide).toContain('Extension callbacks remain an exception boundary')
    expect(chineseGuide).toContain('扩展回调仍是独立的异常边界')
    expect(englishApiReference).toContain('does not manage headers')
    expect(readme).toContain('does not attach headers')
    expect(readme).toContain('Extension callbacks can still propagate their original errors')
    // AI modified: npm-only readers need the same analyzer CORS boundary as the complete guide.
    expect(readme).toContain('silence the entire Web Audio output')
    expect(readme).toContain('crossOrigin: \'use-credentials\'')
    expect(readme).toContain('Access-Control-Allow-Credentials: true')
    expect(readme).not.toContain('const preferredVariant = variants[0]')
    expect(readme).toContain('highestBitrateVariant')
    // AI modified: the npm README must expose runtime configuration without hiding reload costs.
    expect(readme).toContain('Runtime adapter configuration')
    expect(readme).toContain('hlsAdapter.getConfig()')
    expect(readme).toContain('hlsAdapter.updateConfig(')
    expect(readme).toContain('dashAdapter.getSettings()')
    expect(readme).toContain('dashAdapter.updateSettings(')
    expect(readme).toContain('discards buffered data, retry state, and bandwidth estimates')
  })

  it('marks internal plans and specifications as records instead of live task lists', async () => {
    const projectRoot = resolve(docsRoot, '../../project')
    const recordDirectories = [resolve(projectRoot, 'plans'), resolve(projectRoot, 'specs')]
    const projectRecords = (await Promise.all(recordDirectories.map(async (recordDirectory) => {
      const recordNames = await readdir(recordDirectory)

      return Promise.all(recordNames
        .filter(recordName => recordName.endsWith('.md'))
        .map(recordName => readFile(resolve(recordDirectory, recordName), 'utf8')))
    }))).flat()
    const monorepoPlan = await readFile(resolve(projectRoot, 'plans/2026-06-12-monorepo-docs.md'), 'utf8')

    expect(projectRecords.length).toBeGreaterThan(10)
    expect(projectRecords.every(projectRecord => projectRecord.includes('> **Status:**'))).toBe(true)
    expect(monorepoPlan).toContain('**Superseded decision:**')
    expect(monorepoPlan).toContain('intentionally omitted')
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
    expect(englishConfiguration).not.toContain('MIME inference')
    expect(chineseConfiguration).not.toContain('MIME 推断')
    expect(englishRecipes).toContain('Signed URL source')
    expect(englishRecipes).toContain('Canvas spectrum visualizer')
    expect(englishRecipes).toContain('Runtime adaptive tuning')
    expect(chineseRecipes).toContain('签名 URL source')
    expect(chineseRecipes).toContain('Canvas 频谱可视化')
    expect(chineseRecipes).toContain('运行时自适应调优')
    // AI modified: signed HLS examples must register the adapter selected by their source metadata.
    const englishSignedUrlRecipe = englishRecipes.match(/## Signed URL source\n([\s\S]*?)\n## Local file preview/)?.[1] ?? ''
    const chineseSignedUrlRecipe = chineseRecipes.match(/## 签名 URL source\n([\s\S]*?)\n## 本地文件预览/)?.[1] ?? ''
    for (const signedUrlRecipe of [englishSignedUrlRecipe, chineseSignedUrlRecipe]) {
      expect(signedUrlRecipe).toContain('import { createHlsAdapter } from \'gaudio/hls\'')
      expect(signedUrlRecipe).toContain('adapters: [createHlsAdapter()]')
    }
    expect(englishRecipes).not.toContain('variants.at(-1)')
    expect(chineseRecipes).not.toContain('variants.at(-1)')
    expect(englishRecipes).toContain('highestBitrateVariant')
    expect(chineseRecipes).toContain('highestBitrateVariant')
    expect(englishEvents).toContain('manual')
    expect(chineseEvents).toContain('manual')
  })

  it('documents listener failure isolation across public event surfaces', async () => {
    const [
      eventEmitterSource,
      audioPlayerSource,
      mediaElementEngineSource,
      englishEvents,
      chineseEvents,
      englishApiReference,
      chineseApiReference,
    ] = await Promise.all([
      readFile(resolve(docsRoot, '../../packages/gaudio/src/events/event-emitter.ts'), 'utf8'),
      readFile(resolve(docsRoot, '../../packages/gaudio/src/player/audio-player.ts'), 'utf8'),
      readFile(resolve(docsRoot, '../../packages/gaudio/src/engine/media-element-audio-engine.ts'), 'utf8'),
      readFile(resolve(docsRoot, 'guide/events.md'), 'utf8'),
      readFile(resolve(docsRoot, 'zh/guide/events.md'), 'utf8'),
      readFile(resolve(docsRoot, 'guide/api-reference.md'), 'utf8'),
      readFile(resolve(docsRoot, 'zh/guide/api-reference.md'), 'utf8'),
    ])

    // AI modified: public event APIs must preserve the documented asynchronous error-reporting boundary.
    expect(eventEmitterSource).toContain('A listener exception does not escape this call or stop sibling listeners')
    expect(audioPlayerSource).toContain('A callback failure does not interrupt internal or sibling')
    expect(mediaElementEngineSource).toContain('A callback failure does not interrupt internal or sibling')
    for (const englishEventDocumentation of [englishEvents, englishApiReference]) {
      expect(englishEventDocumentation).toContain('globalThis.reportError')
      expect(englishEventDocumentation).toContain('queued microtask')
    }
    for (const chineseEventDocumentation of [chineseEvents, chineseApiReference]) {
      expect(chineseEventDocumentation).toContain('globalThis.reportError')
      expect(chineseEventDocumentation).toContain('排队的 microtask')
    }
  })

  // AI modified: cold TypeScript program creation can exceed Vitest's default timeout on loaded CI runners.
  it('type-checks self-contained public API documentation examples', async () => {
    const semanticExamples: SemanticDocumentationExample[] = [
      {
        documentationPath: '../../README.md',
        heading: 'Quick Start',
        virtualFileName: '.semantic-root-readme.ts',
      },
      {
        documentationPath: '../../packages/gaudio/README.md',
        heading: 'Quick start',
        virtualFileName: '.semantic-package-readme.ts',
      },
      {
        documentationPath: 'guide/configuration.md',
        heading: 'Player options',
        virtualFileName: '.semantic-player-options.ts',
      },
      {
        documentationPath: 'guide/recipes.md',
        heading: 'Local file preview',
        virtualFileName: '.semantic-blob-source.ts',
      },
      {
        documentationPath: 'guide/recipes.md',
        heading: 'HLS and DASH player with manual quality',
        virtualFileName: '.semantic-adaptive-player.ts',
      },
    ]

    // AI modified: a real Program catches public-export and signature drift that syntax-only transpilation cannot see.
    expect(await semanticDocumentationDiagnostics(semanticExamples)).toEqual([])
  }, 30_000)

  it('keeps TypeScript documentation examples syntactically executable', async () => {
    // AI modified: repository and npm landing-page examples are public documentation too.
    const markdownFiles = [
      ...await documentationMarkdownFiles(docsRoot),
      resolve(docsRoot, '../../README.md'),
      resolve(docsRoot, '../../packages/gaudio/README.md'),
    ]
    const syntaxFailures: string[] = []
    let checkedCodeBlocks = 0

    for (const markdownFile of markdownFiles) {
      const markdownSource = await readFile(markdownFile, 'utf8')

      for (const codeBlockMatch of markdownSource.matchAll(/```(?:ts|typescript)[^\S\r\n]*(?:\r\n|\n)([\s\S]*?)```/g)) {
        const codeBlock = codeBlockMatch[1]
        const typescriptOutput = ts.transpileModule(codeBlock, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ESNext,
          },
          fileName: `${markdownFile}.ts`,
          reportDiagnostics: true,
        })
        const errorDiagnostics = typescriptOutput.diagnostics?.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error) ?? []

        checkedCodeBlocks += 1
        syntaxFailures.push(...errorDiagnostics.map(diagnostic => (
          `${relative(docsRoot, markdownFile)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`
        )))
      }
    }

    expect(checkedCodeBlocks).toBeGreaterThan(100)
    expect(syntaxFailures).toEqual([])
  })

  it('resolves every local documentation link to source content or a public asset', async () => {
    const markdownFiles = await documentationMarkdownFiles(docsRoot)
    const unresolvedLinks: string[] = []
    let checkedLinks = 0

    for (const markdownFile of markdownFiles) {
      const markdownSource = await readFile(markdownFile, 'utf8')

      for (const linkMatch of markdownSource.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+['"][^'"]*['"])?\)/g)) {
        const linkTarget = linkMatch[1]

        if (/^(?:[a-z]+:|\/\/|#)/i.test(linkTarget)) {
          continue
        }

        const routePath = linkTarget.split(/[?#]/)[0]

        if (routePath.startsWith('/api/') || routePath === '/api/' || routePath.startsWith('/zh/api/') || routePath === '/zh/api/') {
          continue
        }

        checkedLinks += 1
        const targetCandidates = documentationTargets(markdownFile, linkTarget)
        const candidateChecks = await Promise.all(targetCandidates.map(pathExists))

        if (!candidateChecks.some(Boolean)) {
          unresolvedLinks.push(`${relative(docsRoot, markdownFile)} -> ${linkTarget}`)
        }
      }
    }

    expect(checkedLinks).toBeGreaterThan(10)
    expect(unresolvedLinks).toEqual([])
    // AI modified: Nuxt owns localized API mirrors through one route instead of a framework-specific loader.
    expect(await pathExists(resolve(docsRoot, 'zh/api/[path].paths.ts'))).toBe(false)
    expect(await pathExists(resolve(docsRoot, 'app/pages/[...slug].vue'))).toBe(true)
  })
})
