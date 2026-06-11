import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '..')

describe('browser demo', () => {
  it('documents and exercises the Vue demo app', async () => {
    const [demoHtml, appVue, composable, readme, packageJson] = await Promise.all([
      readFile(resolve(projectRoot, 'demo/index.html'), 'utf8'),
      readFile(resolve(projectRoot, 'demo/App.vue'), 'utf8'),
      readFile(resolve(projectRoot, 'demo/composables/use-gaudio-demo.ts'), 'utf8'),
      readFile(resolve(projectRoot, 'README.md'), 'utf8'),
      readFile(resolve(projectRoot, 'package.json'), 'utf8'),
    ])

    expect(demoHtml).toContain('/main.ts')
    expect(appVue).toContain('useGaudioDemo')
    expect(composable).toContain('new AudioPlayer')
    expect(composable).toContain('defaultDemoSampleUrl')
    expect(composable).toContain('selectTrack')
    expect(composable).toContain('selectFormat')
    expect(composable).toContain('player.on(\'seeking\'')
    expect(composable).toContain('setMuted')
    expect(composable).toContain('setLoop')
    expect(composable).toContain('setPreload')
    expect(appVue).toContain('selectFormat')
    expect(appVue).toContain('selectTrack')
    expect(appVue).toContain('Muted')
    expect(appVue).toContain('Loop')
    expect(appVue).toContain('Preload')
    expect(appVue).toContain('Seeking')
    expect(readme).toContain('pnpm run demo')
    expect(readme).toContain('Migration from 0.1.0')
    expect(packageJson).toContain('"demo"')
    expect(packageJson).toContain('"demo:build"')
    expect(packageJson).toContain('"version": "0.2.0"')
    expect(packageJson).toContain('vite')
    expect(packageJson).toContain('vue')
  })
})
