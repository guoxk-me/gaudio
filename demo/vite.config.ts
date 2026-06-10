import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [vue()],
  resolve: {
    alias: {
      // AI modified: resolve gaudio from source so demo dev does not require a prior library build.
      gaudio: resolve(import.meta.dirname, '../src/index.ts'),
    },
  },
  server: {
    port: 4173,
    // AI modified: fail fast when 4173 is occupied so demo never silently falls back to another port.
    strictPort: true,
    open: true,
  },
})
