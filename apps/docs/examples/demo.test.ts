import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const examplesRoot = resolve(import.meta.dirname)

describe('interactive audio example', () => {
  it('loads through public package exports and remains safe during SSR', async () => {
    const [examplePage, demoComponent, demoComposable, demoSamples] = await Promise.all([
      readFile(resolve(examplesRoot, 'index.md'), 'utf8'),
      readFile(resolve(examplesRoot, 'AudioPlayerDemo.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'use-gaudio-demo.ts'), 'utf8'),
      readFile(resolve(examplesRoot, 'demo-samples.ts'), 'utf8'),
    ])

    expect(examplePage).toContain('<ClientOnly>')
    expect(examplePage).toContain('AudioPlayerDemo')
    expect(demoComponent).toContain('DemoCatalog')
    expect(demoComponent).toContain('DemoControls')
    expect(demoComponent).toContain('DemoStatus')
    expect(demoComposable).toContain('from \'gaudio\'')
    expect(demoComposable).toContain('from \'gaudio/hls\'')
    expect(demoComposable).toContain('from \'gaudio/dash\'')
    expect(demoComposable).not.toContain('packages/gaudio/src')
    expect(demoComposable).toContain('onMounted')
    expect(demoComposable).toContain('new AudioPlayer')
    expect(demoSamples).toContain('import.meta.env.BASE_URL')
  })
})
