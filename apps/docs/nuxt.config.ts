import type { ModuleOptions as ContentModuleOptions } from '@nuxt/content'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineNuxtConfig } from 'nuxt/config'
import { docsBase } from './lib/docs-base.ts'
import { docsSiteUrl } from './lib/docs-site.ts'
import { thirdPartyLicenseCoverage } from './lib/third-party-license-coverage.ts'

const docsRoot = fileURLToPath(new URL('.', import.meta.url))
const packageManifest = JSON.parse(readFileSync(resolve(docsRoot, '../../packages/gaudio/package.json'), 'utf8')) as {
  version?: unknown
}

if (typeof packageManifest.version !== 'string') {
  throw new TypeError('The GAudio package version is required for documentation metadata.')
}

function markdownRoutes(rootDirectory: string, directory: string, routePrefix: string): string[] {
  const routes: string[] = []

  for (const directoryEntry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, directoryEntry.name)

    if (directoryEntry.isDirectory()) {
      routes.push(...markdownRoutes(rootDirectory, entryPath, routePrefix))
      continue
    }

    if (!directoryEntry.isFile() || extname(directoryEntry.name) !== '.md') {
      continue
    }

    const markdownPath = relative(rootDirectory, entryPath).split(sep).join('/')
    const routeSuffix = markdownPath === 'index.md'
      ? ''
      : markdownPath.replace(/\/index\.md$/, '').replace(/\.md$/, '')
    routes.push(routeSuffix ? `${routePrefix}/${routeSuffix}` : routePrefix)
  }

  return routes
}

function documentationRoutes(): string[] {
  const guideRoot = resolve(docsRoot, 'guide')
  const chineseGuideRoot = resolve(docsRoot, 'zh/guide')
  const apiRoot = resolve(docsRoot, 'api')
  const guideRoutes = markdownRoutes(guideRoot, guideRoot, '/guide')
  const chineseGuideRoutes = markdownRoutes(chineseGuideRoot, chineseGuideRoot, '/zh/guide')
  const apiRoutes = markdownRoutes(apiRoot, apiRoot, '/api')

  // AI modified: Chinese API mirrors reuse generated English declarations without duplicating Markdown.
  return [...new Set([
    '/',
    '/docs',
    '/examples',
    '/player-studio',
    '/zh',
    '/zh/docs',
    '/zh/examples',
    '/zh/player-studio',
    ...guideRoutes,
    ...chineseGuideRoutes,
    ...apiRoutes,
    ...apiRoutes.map(routePath => `/zh${routePath}`),
  ])]
}

function compatibilityRouteRules(routes: string[]) {
  const redirects: Record<string, { redirect: { statusCode: 301, to: string } }> = {}

  for (const routePath of routes) {
    const routeAliases = new Set<string>()
    const basePrefix = docsBase === '/' ? '' : docsBase.slice(0, -1)
    // AI modified: static redirect artifacts must retain the configured deployment subpath.
    const redirectTarget = routePath === '/' ? docsBase : `${basePrefix}${routePath}`

    if (routePath === '/') {
      routeAliases.add('/en')
    }
    else {
      routeAliases.add(`${routePath}.html`)
      routeAliases.add(`${routePath}.md`)
      // AI modified: legacy /en aliases represent English pages and must never duplicate the Chinese tree.
      if (!routePath.startsWith('/zh')) {
        routeAliases.add(`/en${routePath}`)
      }
    }

    if (routePath.startsWith('/guide') || routePath.startsWith('/api')) {
      routeAliases.add(`/docs${routePath}`)
    }

    for (const routeAlias of routeAliases) {
      redirects[routeAlias] = { redirect: { statusCode: 301, to: redirectTarget } }
    }
  }

  return redirects
}

const publishedRoutes = documentationRoutes()
const compatibilityRules = compatibilityRouteRules(publishedRoutes)

const contentOptions = {
  build: {
    markdown: {
      highlight: {
        theme: {
          default: 'github-light-high-contrast',
          dark: 'github-dark-high-contrast',
        },
      },
      toc: { depth: 3, searchDepth: 3 },
    },
  },
  renderer: {
    anchorLinks: {
      h1: false,
      h2: true,
      h3: true,
      h4: true,
      h5: true,
      h6: true,
    },
  },
} satisfies Partial<ContentModuleOptions>

export default defineNuxtConfig({
  compatibilityDate: '2026-08-20',
  // AI modified: inline options preserve Content's module typing with Nuxt 4's app directory.
  modules: [['@nuxt/content', contentOptions], '@nuxtjs/sitemap'],
  app: {
    baseURL: docsBase,
    head: {
      htmlAttrs: { lang: 'en-US' },
      // AI modified: resolve theme before CSS paints to avoid flashing the opposite surface.
      script: [{ innerHTML: `(function(){try{var p=localStorage.getItem('gaudio-color-mode');document.documentElement.classList.toggle('dark',p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))}catch(e){document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches)}})()`, tagPosition: 'head' }],
      link: [
        { rel: 'icon', href: `${docsBase}favicon.ico` },
        { rel: 'apple-touch-icon', sizes: '180x180', href: `${docsBase}apple-touch-icon.png` },
        { rel: 'manifest', href: `${docsBase}site.webmanifest` },
      ],
      meta: [{ name: 'theme-color', content: '#6338ed' }],
    },
  },
  alias: {
    '@': docsRoot,
  },
  components: [
    { path: resolve(docsRoot, 'app/components'), pathPrefix: false },
    { path: resolve(docsRoot, 'examples'), pathPrefix: false },
  ],
  css: [
    '~/assets/css/main.css',
    '~~/assets/css/demo-ui.css',
  ],
  devtools: { enabled: false },
  experimental: {
    // AI modified: inline route payloads avoid base-prefixed prefetch 404s on static subpath deployments.
    payloadExtraction: false,
  },
  nitro: {
    prerender: {
      crawlLinks: true,
      failOnError: true,
      ignore: [
        // AI modified: crawler-discovered slash redirects must not overwrite canonical directory indexes.
        routePath => routePath !== '/' && routePath.endsWith('/'),
        // AI modified: base-prefixed links map to the artifact root on static hosts and must not become duplicate files.
        routePath => docsBase !== '/' && routePath.startsWith(docsBase),
      ],
      // AI modified: prerender canonical documents and compatibility redirects for static hosting.
      routes: [...publishedRoutes, ...Object.keys(compatibilityRules)],
    },
  },
  routeRules: {
    ...compatibilityRules,
    '/__docs/content-stress': { robots: false },
  },
  runtimeConfig: {
    public: {
      docsSiteUrl,
      docsVersion: packageManifest.version,
      sourceCommit: /^[0-9a-f]{40}$/i.test(process.env.GITHUB_SHA ?? '')
        ? process.env.GITHUB_SHA
        : 'local',
    },
  },
  site: {
    // AI modified: Vercel's production origin is injected independently from Nuxt's deployment path.
    url: new URL(docsSiteUrl).origin,
    name: 'GAudio Documentation',
  },
  sitemap: {
    // AI modified: asset discovery drops Nuxt's base prefix, so omit nonessential image entries from the route sitemap.
    discoverImages: false,
    exclude: ['/zh/api/**', '/__docs/**'],
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
  vite: {
    plugins: [tailwindcss(), thirdPartyLicenseCoverage()],
    build: {
      chunkSizeWarningLimit: 1_000,
      rollupOptions: {
        output: {
          // AI modified: optional adaptive vendors remain separate from the shared documentation shell.
          manualChunks(moduleId) {
            if (moduleId.includes('/dashjs/')) {
              return 'dash'
            }

            if (moduleId.includes('/hls.js/')) {
              return 'hls'
            }
          },
        },
      },
    },
  },
})
