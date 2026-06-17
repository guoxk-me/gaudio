import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    '.turbo/**',
    'apps/docs/.vitepress/dist/**',
    'apps/docs/api/**',
    // AI modified: HLS transport-stream fixtures use .ts as media files, not TypeScript source.
    'apps/docs/public/audio/**',
    'dist/**',
    'packages/*/dist/**',
    'project/plans/**',
  ],
})
