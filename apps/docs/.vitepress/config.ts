import type { HeadConfig } from 'vitepress'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitepress'
import { docsBase, docsRoute } from '../lib/docs-base.ts'
import { thirdPartyLicenseCoverage } from '../lib/third-party-license-coverage.ts'

const docsProductionUrl = 'https://guoxk-me.github.io/gaudio/'
const gaudioPackageManifest = JSON.parse(readFileSync(
  fileURLToPath(new URL('../../../packages/gaudio/package.json', import.meta.url)),
  'utf8',
)) as { version?: unknown }

if (typeof gaudioPackageManifest.version !== 'string' || !/^[0-9a-z.+-]+$/i.test(gaudioPackageManifest.version)) {
  throw new TypeError('The GAudio package version is missing or unsafe for documentation metadata.')
}

const gaudioPackageVersion = gaudioPackageManifest.version
// AI modified: GitHub's immutable SHA is exposed in deployed footers without trusting arbitrary environment HTML.
const sourceCommit = /^[0-9a-f]{40}$/i.test(process.env.GITHUB_SHA ?? '')
  ? process.env.GITHUB_SHA
  : undefined

// AI modified: keep build-time fallback links safe when DOCS_BASE comes from the environment.
function escapeHtmlAttribute(attributeValue: string): string {
  return attributeValue
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

// AI modified: every locale exposes the edge channel, source revision, and third-party attribution from the site footer.
function releaseFooter(language: 'en' | 'zh') {
  const commitMarkup = sourceCommit
    ? `<a href="https://github.com/guoxk-me/gaudio/commit/${sourceCommit}"><code>${sourceCommit.slice(0, 7)}</code></a>`
    : '<code>local</code>'
  const licenseUrl = escapeHtmlAttribute(docsRoute('THIRD_PARTY_LICENSES.txt'))

  return language === 'zh'
    ? {
        message: `边缘文档 <code>main / npm next</code> · 包版本 <code>v${gaudioPackageVersion}</code> · commit ${commitMarkup}`,
        copyright: `<a href="${licenseUrl}">第三方许可</a>`,
      }
    : {
        message: `Edge documentation <code>main / npm next</code> · package <code>v${gaudioPackageVersion}</code> · commit ${commitMarkup}`,
        copyright: `<a href="${licenseUrl}">Third-party licenses</a>`,
      }
}

function productionUrlForPage(page: string): string {
  const cleanPagePath = page
    .replace(/(^|\/)index\.md$/, '$1')
    .replace(/\.md$/, '')

  return new URL(cleanPagePath, docsProductionUrl).href
}

function sitePageForUrl(pageUrl: string): string {
  const sitePage = pageUrl.startsWith(docsProductionUrl)
    ? pageUrl.slice(docsProductionUrl.length)
    : pageUrl

  return sitePage.replace(/^\/+/, '')
}

function isChineseApiMirror(pageUrl: string): boolean {
  return sitePageForUrl(pageUrl).startsWith('zh/api/')
}

function isTranslatedProductionUrl(pageUrl: string): boolean {
  const productionPage = sitePageForUrl(pageUrl)
  const englishPage = productionPage.startsWith('zh/')
    ? productionPage.slice('zh/'.length)
    : productionPage

  return englishPage === ''
    || englishPage === 'examples/'
    || englishPage.startsWith('guide/')
}

export default defineConfig({
  title: 'GAudio',
  description: 'A browser-first TypeScript audio streaming library.',
  lang: 'en-US',
  base: docsBase,
  cleanUrls: true,
  // AI modified: publish the production subpath in the generated sitemap even when local builds use another base.
  sitemap: {
    hostname: docsProductionUrl,
    transformItems(items) {
      return items
        // AI modified: untranslated Chinese API mirrors stay navigable but are not competing canonical sitemap entries.
        .filter(sitemapEntry => !isChineseApiMirror(sitemapEntry.url))
        .map(sitemapEntry => ({
          ...sitemapEntry,
          // AI modified: VitePress pairs every locale by default, so remove alternates from untranslated pages.
          links: isTranslatedProductionUrl(sitemapEntry.url) ? sitemapEntry.links : undefined,
        }))
    },
  },
  transformHead({ page, pageData }) {
    if (pageData.isNotFound || page === '404.md') {
      return
    }

    // AI modified: untranslated locale mirrors consolidate declaration search signals into the English API source.
    const canonicalPage = isChineseApiMirror(page)
      ? page.slice('zh/'.length)
      : page
    const pageHead: HeadConfig[] = [
      ['link', { rel: 'canonical', href: productionUrlForPage(canonicalPage) }],
    ]
    const englishPage = page.startsWith('zh/') ? page.slice('zh/'.length) : page
    const hasTranslatedPage = englishPage === 'index.md'
      || englishPage === 'examples/index.md'
      || englishPage.startsWith('guide/')

    if (hasTranslatedPage) {
      const englishUrl = productionUrlForPage(englishPage)

      // AI modified: only hand-translated pages are alternates; the English API mirror is not mislabeled as Chinese.
      pageHead.push(
        ['link', { rel: 'alternate', hreflang: 'en-US', href: englishUrl }],
        ['link', { rel: 'alternate', hreflang: 'zh-CN', href: productionUrlForPage(`zh/${englishPage}`) }],
        ['link', { rel: 'alternate', hreflang: 'x-default', href: englishUrl }],
      )
    }

    return pageHead
  },
  // AI modified: use contrast-safe Shiki palettes for both documentation appearances.
  markdown: {
    theme: {
      light: 'github-light-high-contrast',
      dark: 'github-dark-high-contrast',
    },
  },
  // AI modified: preserve static landmarks before hydration, including document-footer semantics.
  transformHtml(html, _fileName, context) {
    const documentInformationLabel = context.pageData.relativePath.startsWith('zh/')
      ? '页面信息'
      : 'Page information'
    const htmlWithDocumentFooterLandmarks = html
      .replace('<footer class="VPDocFooter"', '<footer role="group" class="VPDocFooter"')
      .replace(
        '<div class="edit-info"',
        `<div role="region" aria-label="${documentInformationLabel}" class="edit-info"`,
      )

    if (context.pageData.isNotFound) {
      const applicationRoot = '<div id="app"></div>'

      if (!htmlWithDocumentFooterLandmarks.includes(applicationRoot)) {
        throw new Error('Unable to expose the no-JavaScript not-found fallback.')
      }

      const englishHomeUrl = escapeHtmlAttribute(docsBase)
      const chineseHomeUrl = escapeHtmlAttribute(`${docsBase}zh/`)
      const noScriptFallback = `
    <noscript>
      <main class="no-script-not-found">
        <p class="no-script-not-found__code" aria-hidden="true">404</p>
        <h1>Page not found <span lang="zh-CN">/ 页面未找到</span></h1>
        <p>The requested page does not exist or has moved.</p>
        <p lang="zh-CN">你访问的页面不存在或已被移动。</p>
        <nav class="no-script-not-found__links" aria-label="Documentation home pages">
          <a href="${englishHomeUrl}">English home</a>
          <a href="${chineseHomeUrl}" lang="zh-CN">中文首页</a>
        </nav>
      </main>
    </noscript>`

      // The fallback stays outside #app so VitePress can hydrate its interactive 404 without a mismatch.
      return htmlWithDocumentFooterLandmarks.replace(applicationRoot, `${applicationRoot}${noScriptFallback}`)
    }

    if (context.pageData.frontmatter.layout !== 'home') {
      return htmlWithDocumentFooterLandmarks
    }

    const homeRoot = '<div class="VPHome"'

    if (!htmlWithDocumentFooterLandmarks.includes(homeRoot)) {
      throw new Error('Unable to expose the VitePress home main landmark.')
    }

    return htmlWithDocumentFooterLandmarks.replace(homeRoot, '<div class="VPHome" role="main"')
  },
  // AI modified: TypeDoc input and public asset notes are source records, not standalone site routes.
  srcExclude: ['api-overview.md', 'public/**'],
  // AI modified: expose the logo-inspired icon set through the generated docs head.
  head: [
    ['link', { rel: 'icon', href: `${docsBase}favicon.ico` }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: `${docsBase}apple-touch-icon.png` }],
    ['link', { rel: 'manifest', href: `${docsBase}site.webmanifest` }],
    ['meta', { name: 'theme-color', content: '#002040' }],
  ],
  lastUpdated: true,
  vite: {
    // AI modified: Tailwind uses Vite 8 plugin types while VitePress bundles Vite 5.
    plugins: [
      tailwindcss() as never,
      thirdPartyLicenseCoverage() as never,
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('..', import.meta.url)),
      },
    },
    build: {
      // AI modified: adaptive vendor chunks are client-only and intentionally exceed Vite's default threshold.
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        // AI modified: ignore only VueUse's misplaced pure annotations; preserve every other Rollup warning.
        onwarn(warning, defaultHandler) {
          if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('/@vueuse/core/')) {
            return
          }

          defaultHandler(warning)
        },
        output: {
          // AI modified: keep optional adaptive vendors out of the shared demo component chunk.
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
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      title: 'GAudio',
      description: 'A browser-first TypeScript audio streaming library.',
      themeConfig: {
        footer: releaseFooter('en'),
        darkModeSwitchLabel: 'Appearance',
        lightModeSwitchTitle: 'Switch to light theme',
        darkModeSwitchTitle: 'Switch to dark theme',
        nav: [
          { text: 'Guide', link: '/guide/getting-started' },
          { text: 'Examples', link: '/examples/' },
          { text: 'API', link: '/api/' },
          // AI modified: make repository governance and support routes discoverable from every English page.
          {
            text: 'Project',
            items: [
              { text: 'Repository', link: 'https://github.com/guoxk-me/gaudio' },
              { text: 'Issues', link: 'https://github.com/guoxk-me/gaudio/issues' },
              { text: 'Support', link: 'https://github.com/guoxk-me/gaudio/blob/main/SUPPORT.md' },
              { text: 'Security', link: 'https://github.com/guoxk-me/gaudio/security/policy' },
            ],
          },
        ],
        sidebar: {
          '/guide/': [
            {
              text: 'Guide',
              items: [
                { text: 'Getting Started', link: '/guide/getting-started' },
                // AI modified: expose complete configuration and scenario examples from the guide sidebar.
                { text: 'Configuration', link: '/guide/configuration' },
                { text: 'Recipes', link: '/guide/recipes' },
                { text: 'Adaptive Playback', link: '/guide/adaptive-playback' },
                { text: 'Events', link: '/guide/events' },
                { text: 'API Reference', link: '/guide/api-reference' },
              ],
            },
          ],
        },
      },
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      title: 'GAudio',
      description: '面向浏览器优先场景的 TypeScript 音频流库。',
      themeConfig: {
        footer: releaseFooter('zh'),
        outline: { label: '本页目录' },
        lastUpdated: { text: '最后更新于' },
        docFooter: {
          prev: '上一页',
          next: '下一页',
        },
        darkModeSwitchLabel: '外观',
        lightModeSwitchTitle: '切换到浅色主题',
        darkModeSwitchTitle: '切换到深色主题',
        sidebarMenuLabel: '菜单',
        returnToTopLabel: '返回顶部',
        langMenuLabel: '切换语言',
        skipToContentLabel: '跳转到内容',
        // AI modified: locale-specific 404 copy keeps missing Chinese routes inside the Chinese experience.
        notFound: {
          code: '404',
          title: '页面未找到',
          quote: '你访问的页面不存在或已被移动。',
          linkLabel: '返回 GAudio 中文首页',
          linkText: '返回首页',
        },
        nav: [
          { text: '指南', link: '/zh/guide/getting-started' },
          { text: '示例', link: '/zh/examples/' },
          { text: 'API', link: '/zh/api/' },
          // AI modified: keep project and support routes equally discoverable in the Chinese locale.
          {
            text: '项目',
            items: [
              { text: '代码仓库', link: 'https://github.com/guoxk-me/gaudio' },
              { text: '问题反馈', link: 'https://github.com/guoxk-me/gaudio/issues' },
              { text: '支持', link: 'https://github.com/guoxk-me/gaudio/blob/main/SUPPORT.md' },
              { text: '安全', link: 'https://github.com/guoxk-me/gaudio/security/policy' },
            ],
          },
        ],
        sidebar: {
          '/zh/guide/': [
            {
              text: '指南',
              items: [
                { text: '快速开始', link: '/zh/guide/getting-started' },
                // AI modified: expose complete configuration and scenario examples from the Chinese guide sidebar.
                { text: '配置总览', link: '/zh/guide/configuration' },
                { text: '场景示例', link: '/zh/guide/recipes' },
                { text: '自适应播放', link: '/zh/guide/adaptive-playback' },
                { text: '事件', link: '/zh/guide/events' },
                { text: 'API 参考', link: '/zh/guide/api-reference' },
              ],
            },
          ],
        },
      },
    },
  },
  themeConfig: {
    // AI modified: expose the canonical repository through VitePress's accessible social link.
    socialLinks: [
      { icon: 'github', link: 'https://github.com/guoxk-me/gaudio' },
    ],
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: {
                buttonText: '搜索',
                buttonAriaLabel: '搜索',
              },
              modal: {
                noResultsText: '没有结果',
                resetButtonTitle: '重置搜索',
                footer: {
                  selectText: '选择',
                  navigateText: '导航',
                  closeText: '关闭',
                },
              },
            },
          },
        },
      },
    },
  },
})
