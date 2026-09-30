import { resolve } from 'node:path'
import { defineCollection, defineContentConfig } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    docs: defineCollection({
      type: 'page',
      // AI modified: keep authored guides and generated TypeDoc pages at their established public paths.
      source: [
        { cwd: resolve(import.meta.dirname, 'guide'), include: '**/*.md', prefix: '/guide' },
        { cwd: resolve(import.meta.dirname, 'zh/guide'), include: '**/*.md', prefix: '/zh/guide' },
        { cwd: resolve(import.meta.dirname, 'api'), include: '**/*.md', prefix: '/api' },
      ],
    }),
  },
})
