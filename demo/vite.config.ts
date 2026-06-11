import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [vue()],
  resolve: {
    alias: [
      { find: 'gaudio/hls', replacement: resolve(import.meta.dirname, '../src/adapters/hls/index.ts') },
      { find: 'gaudio/dash', replacement: resolve(import.meta.dirname, '../src/adapters/dash/index.ts') },
      // AI modified: resolve gaudio from source so demo dev does not require a prior library build.
      { find: 'gaudio', replacement: resolve(import.meta.dirname, '../src/index.ts') },
    ],
  },
  server: {
    port: 4173,
    // AI modified: fail fast when 4173 is occupied so demo never silently falls back to another port.
    strictPort: true,
    open: true,
  },
})
