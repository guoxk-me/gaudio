import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    hls: 'src/adapters/hls/index.ts',
    dash: 'src/adapters/dash/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // AI modified: validate package metadata and type entry points before npm publish.
  publint: true,
  attw: true,
  // AI modified: preserve the .js ESM output required by the package export contract.
  fixedExtension: false,
})
