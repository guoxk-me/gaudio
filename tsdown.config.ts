import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // AI modified: preserve the .js ESM output required by the package export contract.
  fixedExtension: false,
})
