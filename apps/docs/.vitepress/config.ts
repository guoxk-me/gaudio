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
            { text: 'Migration', link: '/guide/migration' },
          ],
        },
      ],
    },
    search: {
      provider: 'local',
    },
  },
})
