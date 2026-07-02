import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitepress'

const configuredDocsBase = process.env.DOCS_BASE ?? '/gaudio/'
const docsBase = configuredDocsBase.endsWith('/') ? configuredDocsBase : `${configuredDocsBase}/`

export default defineConfig({
  title: 'GAudio',
  description: 'A browser-first TypeScript audio streaming library.',
  lang: 'en-US',
  base: docsBase,
  cleanUrls: true,
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
    plugins: [tailwindcss() as never],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('..', import.meta.url)),
      },
    },
    build: {
      // AI modified: adaptive vendor chunks are client-only and intentionally exceed Vite's default threshold.
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
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
        nav: [
          { text: 'Guide', link: '/guide/getting-started' },
          { text: 'Examples', link: '/examples/' },
          { text: 'API', link: '/api/' },
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
        nav: [
          { text: '指南', link: '/zh/guide/getting-started' },
          { text: '示例', link: '/zh/examples/' },
          { text: 'API', link: '/api/' },
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
