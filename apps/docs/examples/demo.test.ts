import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const examplesRoot = resolve(import.meta.dirname)

describe('interactive audio example', () => {
  it('loads through public package exports and remains safe during SSR', async () => {
    const [
      examplePage,
      demoComponent,
      demoLibrary,
      demoNowPlaying,
      demoTransport,
      demoFeatureTabs,
      demoCapabilities,
      demoVisualization,
      demoComposable,
      demoSamples,
      demoI18n,
    ] = await Promise.all([
      readFile(resolve(examplesRoot, 'index.md'), 'utf8'),
      readFile(resolve(examplesRoot, 'AudioPlayerDemo.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'DemoLibrarySidebar.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'DemoNowPlayingStage.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'DemoTransportBar.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'DemoFeatureTabs.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'DemoCapabilities.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'DemoVisualization.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'use-gaudio-demo.ts'), 'utf8'),
      readFile(resolve(examplesRoot, 'demo-samples.ts'), 'utf8'),
      readFile(resolve(examplesRoot, 'demo-i18n.ts'), 'utf8'),
    ])

    expect(examplePage).toContain('<ClientOnly>')
    expect(examplePage).toContain('AudioPlayerDemo')
    expect(examplePage).toContain('API Surface In This Demo')
    expect(demoComponent).toContain('gaudio-studio')
    expect(demoComponent).toContain('DemoLibrarySidebar')
    expect(demoComponent).toContain('DemoNowPlayingStage')
    expect(demoComponent).toContain('DemoTransportBar')
    expect(demoComponent).toContain('DemoFeatureTabs')
    expect(demoComponent).not.toContain('DemoHeroPlayer')
    expect(demoComposable).toContain('from \'gaudio\'')
    expect(demoComposable).toContain('from \'gaudio/hls\'')
    expect(demoComposable).toContain('from \'gaudio/dash\'')
    expect(demoComposable).toContain('getAnalyzer')
    expect(demoComposable).toContain('EventEmitter')
    expect(demoComposable).toContain('HttpAudioSource')
    expect(demoComposable).toContain('BlobAudioSource')
    expect(demoComposable).toContain('AdaptivePlaybackPreset')
    expect(demoComposable).toContain('canPlayType')
    expect(demoComposable).toContain('updateConfig')
    expect(demoComposable).toContain('updateSettings')
    expect(demoComposable).toContain('setAdaptiveQuality')
    expect(demoComposable).toContain('selectAdaptiveQuality')
    expect(demoComposable).toContain('playbackStrategy: \'hls-first\'')
    expect(demoComposable).toContain('setPlaylist')
    expect(demoComposable).toContain('getMediaSessionMetadata')
    expect(demoComposable).toContain('adaptiveQualityChoices')
    expect(demoComposable).toContain('activeCoverThumbUrl')
    expect(demoComposable).toContain('activeCoverArtUrl')
    expect(demoComposable).not.toContain('packages/gaudio/src')
    expect(demoComposable).toContain('onMounted')
    expect(demoComposable).toContain('new AudioPlayer')
    expect(demoSamples).toContain('import.meta.env.BASE_URL')
    expect(demoSamples).toContain('coverThumb')
    expect(demoSamples).toContain('demoCoverThumbUrl')
    expect(demoSamples).toContain('demoCoverArtUrl')
    expect(demoSamples).toContain('aurora-loop')
    expect(demoSamples).toContain('signal-bloom')
    expect(demoSamples).toContain('warm-current')
    expect(demoLibrary).toContain('demoTracks')
    expect(demoLibrary).toContain('selectTrack')
    expect(demoLibrary).toContain('demoCoverThumbUrl')
    expect(demoFeatureTabs).toContain('aria-label="Source"')
    expect(demoFeatureTabs).toContain('DemoStatus')
    expect(demoFeatureTabs).toContain('DemoCapabilities')
    expect(demoTransport).toContain('Music player demo')
    expect(demoNowPlaying).toContain('DemoVisualization')
    expect(demoNowPlaying).toContain('activeCoverThumbUrl')
    expect(demoCapabilities).toContain('capabilityRows')
    expect(demoCapabilities).toContain('browserSupportRows')
    expect(demoVisualization).toContain('<canvas')
    expect(demoVisualization).toContain('playerAnalyzer')
    expect(demoVisualization).toContain('requestAnimationFrame')
    expect(demoVisualization).toContain('analyzerCanvas')
    expect(demoVisualization).not.toContain('createOscillator')
    expect(demoI18n).toContain('en:')
    expect(demoI18n).toContain('zh:')
    expect(demoI18n).toContain('studio')
    expect(demoI18n).toContain('homeMini')
    expect(demoI18n).toContain('panels')
    expect(demoI18n).toContain('BlobAudioSource')
    expect(demoI18n).toContain('Playlist and media session')
    expect(demoI18n).toContain('createHlsAdapter')
    expect(demoI18n).toContain('createDashAdapter')
    expect(demoI18n).toContain('Source object')
    expect(demoI18n).toContain('Audio quality')
    expect(demoI18n).toContain('Adaptive bitrate')
    expect(demoI18n).toContain('active AudioPlayer analyzer')
    expect(demoI18n).toContain('Spectrum')
    expect(demoI18n).toContain('Level meters')
    expect(demoI18n).toContain('Waveform')
  })
})
