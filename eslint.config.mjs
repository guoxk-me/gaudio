import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    '.turbo/**',
    'apps/docs/.vitepress/dist/**',
    'apps/docs/api/**',
    'dist/**',
    'packages/*/dist/**',
    'project/plans/**',
  ],
})
