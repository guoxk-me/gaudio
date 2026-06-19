import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const examplesRoot = resolve(import.meta.dirname)

describe('interactive audio example', () => {
  it('loads through public package exports and remains safe during SSR', async () => {
    const [
      examplePage,
      demoComponent,
      demoCapabilities,
      demoPlayerSurface,
      demoVisualization,
      demoComposable,
      demoSamples,
      demoI18n,
    ] = await Promise.all([
      readFile(resolve(examplesRoot, 'index.md'), 'utf8'),
      readFile(resolve(examplesRoot, 'AudioPlayerDemo.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'DemoCapabilities.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'DemoPlayerSurface.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'DemoVisualization.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'use-gaudio-demo.ts'), 'utf8'),
      readFile(resolve(examplesRoot, 'demo-samples.ts'), 'utf8'),
      readFile(resolve(examplesRoot, 'demo-i18n.ts'), 'utf8'),
    ])

    expect(examplePage).toContain('<ClientOnly>')
    expect(examplePage).toContain('AudioPlayerDemo')
    expect(demoComponent).toContain('DemoCatalog')
    expect(demoComponent).toContain('DemoPlayerSurface')
    expect(demoComponent).toContain('DemoControls')
    expect(demoComponent).toContain('DemoStatus')
    expect(demoComponent).toContain('DemoCapabilities')
    expect(demoComponent).toContain('DemoVisualization')
    expect(demoComposable).toContain('from \'gaudio\'')
    expect(demoComposable).toContain('from \'gaudio/hls\'')
    expect(demoComposable).toContain('from \'gaudio/dash\'')
    expect(demoComposable).toContain('getAnalyzer')
    expect(demoComposable).toContain('EventEmitter')
    expect(demoComposable).toContain('HttpAudioSource')
    expect(demoComposable).toContain('AdaptivePlaybackPreset')
    expect(demoComposable).toContain('canPlayType')
    expect(demoComposable).toContain('updateConfig')
    expect(demoComposable).toContain('updateSettings')
    expect(demoComposable).toContain('setAdaptiveQuality')
    expect(demoComposable).toContain('adaptiveQualityChoices')
    expect(demoComposable).not.toContain('packages/gaudio/src')
    expect(demoComposable).toContain('onMounted')
    expect(demoComposable).toContain('new AudioPlayer')
    expect(demoSamples).toContain('import.meta.env.BASE_URL')
    expect(demoCapabilities).toContain('capabilityRows')
    expect(demoCapabilities).toContain('browserSupportRows')
    expect(demoPlayerSurface).toContain('Music player demo')
    expect(demoPlayerSurface).toContain('music-player__waveform')
    expect(demoVisualization).toContain('<canvas')
    expect(demoVisualization).toContain('AudioAnalyzer')
    expect(demoVisualization).toContain('requestAnimationFrame')
    expect(demoI18n).toContain('en:')
    expect(demoI18n).toContain('zh:')
    expect(demoI18n).toContain('apiCoverage')
    expect(demoI18n).toContain('Source object')
    expect(demoI18n).toContain('Audio quality')
    expect(demoI18n).toContain('Audio analyzer canvas')
  })
})
