import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '..')

describe('package exports', () => {
  it('publishes isolated HLS and DASH entry points with optional peers', async () => {
    const [packageJsonText, tsdownConfig, rootEntry] = await Promise.all([
      readFile(resolve(projectRoot, 'package.json'), 'utf8'),
      readFile(resolve(projectRoot, 'tsdown.config.ts'), 'utf8'),
      readFile(resolve(projectRoot, 'src/index.ts'), 'utf8'),
    ])
    const packageJson = JSON.parse(packageJsonText) as {
      exports: Record<string, unknown>
      peerDependencies: Record<string, string>
      peerDependenciesMeta: Record<string, { optional?: boolean }>
    }

    expect(packageJson.exports).toHaveProperty('./hls')
    expect(packageJson.exports).toHaveProperty('./dash')
    expect(packageJson.peerDependencies['hls.js']).toMatch(/^\^1\./)
    expect(packageJson.peerDependencies.dashjs).toMatch(/^\^5\./)
    expect(packageJson.peerDependenciesMeta['hls.js']?.optional).toBe(true)
    expect(packageJson.peerDependenciesMeta.dashjs?.optional).toBe(true)
    expect(tsdownConfig).toContain('hls: \'src/adapters/hls/index.ts\'')
    expect(tsdownConfig).toContain('dash: \'src/adapters/dash/index.ts\'')
    expect(rootEntry).not.toContain('from \'hls.js\'')
    expect(rootEntry).not.toContain('from \'dashjs\'')
  })
})
