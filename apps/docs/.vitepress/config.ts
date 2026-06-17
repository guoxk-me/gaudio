import process from 'node:process'
import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'gaudio',
  description: 'A browser-first TypeScript audio streaming library.',
  lang: 'en-US',
  base: process.env.DOCS_BASE ?? '/gaudio/',
  cleanUrls: true,
  lastUpdated: true,
  vite: {
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
      title: 'gaudio',
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
                { text: 'Adaptive Playback', link: '/guide/adaptive-playback' },
                { text: 'Events', link: '/guide/events' },
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
      title: 'gaudio',
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
                { text: '自适应播放', link: '/zh/guide/adaptive-playback' },
                { text: '事件', link: '/zh/guide/events' },
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
