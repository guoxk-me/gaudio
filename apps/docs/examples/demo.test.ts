import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { demoEventForDisplay, demoStatusForDisplay, demoText } from './demo-i18n'

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
      demoStatus,
      demoVisualization,
      demoComposable,
      demoSamples,
      demoI18n,
      homeHero,
      homeMiniPlayerComposable,
      demoUiStyles,
    ] = await Promise.all([
      readFile(resolve(examplesRoot, '../app/components/ExamplesPage.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'AudioPlayerDemo.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'DemoLibrarySidebar.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'DemoNowPlayingStage.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'DemoTransportBar.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'DemoFeatureTabs.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'DemoCapabilities.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'DemoStatus.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'DemoVisualization.vue'), 'utf8'),
      readFile(resolve(examplesRoot, 'use-gaudio-demo.ts'), 'utf8'),
      readFile(resolve(examplesRoot, 'demo-samples.ts'), 'utf8'),
      readFile(resolve(examplesRoot, 'demo-i18n.ts'), 'utf8'),
      readFile(resolve(examplesRoot, '../app/components/HomeHero.vue'), 'utf8'),
      readFile(resolve(examplesRoot, '../app/composables/use-home-mini-player.ts'), 'utf8'),
      readFile(resolve(examplesRoot, '../assets/css/demo-ui.css'), 'utf8'),
    ])

    expect(examplePage).toContain('<ClientOnly>')
    expect(examplePage).toContain('AudioPlayerDemo')
    expect(examplePage).toContain('GAudio Player Studio')
    expect(examplePage).toContain('useDocumentationHead')
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
    // AI modified: public media URLs must use Nuxt's runtime base on subpath deployments.
    expect(demoSamples).toContain('publicAssetBase')
    expect(demoSamples).not.toContain('import.meta.env.BASE_URL')
    expect(demoSamples).toContain('coverThumb')
    expect(demoSamples).toContain('demoCoverThumbUrl')
    expect(demoSamples).toContain('demoCoverArtUrl')
    expect(demoSamples).toContain('aurora-loop')
    expect(demoSamples).toContain('signal-bloom')
    expect(demoSamples).toContain('warm-current')
    expect(demoLibrary).toContain('demoTracks')
    expect(demoLibrary).toContain('selectTrack')
    expect(demoLibrary).toContain('demoCoverThumbUrl')
    expect(demoLibrary).toContain('alt=""')
    expect(demoLibrary).toContain(':aria-current="isActiveTrack(track.id)')
    expect(demoLibrary).toContain(':aria-pressed="isActiveFormat(formatGroup.folder)"')
    expect(demoLibrary).toContain('@click="selectFormat(formatGroup)"')
    expect(demoLibrary).not.toContain('track.title} cover`')
    expect(demoFeatureTabs).toContain('<TabsContent value="source"')
    expect(demoFeatureTabs).not.toContain('role="region"')
    expect(demoFeatureTabs).toContain('for="studio-protocol"')
    expect(demoFeatureTabs).toContain('role="alert"')
    expect(demoFeatureTabs).toContain('operationError')
    // AI modified: async controls expose both machine-readable busy state and an announced status.
    expect(demoFeatureTabs).toContain(':aria-busy="isBusy"')
    expect(demoFeatureTabs).toContain('role="status"')
    expect(demoFeatureTabs).toContain('aria-live="polite"')
    expect(demoFeatureTabs).toContain('text.controls.operationPending')
    expect(demoFeatureTabs).toContain('DemoStatus')
    expect(demoFeatureTabs).toContain('DemoCapabilities')
    expect(demoTransport).toContain('text.controls.ariaLabel')
    expect(demoTransport).toContain('@value-commit="onSeekCommit"')
    expect(demoTransport).toContain('seekValue.value = values[0]')
    expect(demoTransport).toContain(':disabled="!canSeek"')
    expect(demoTransport).toContain(':thumb-label="text.controls.seek"')
    expect(demoNowPlaying).toContain('DemoVisualization')
    expect(demoNowPlaying).toContain('activeCoverThumbUrl')
    expect(demoNowPlaying).toContain('alt=""')
    expect(demoNowPlaying).not.toContain('activeTrack.title} cover art`')
    // AI modified: the homepage proof now uses the real lazy-loaded GAudio mini player from the approved wireframe.
    expect(homeHero).toContain('<HomeMiniPlayer :controller="player" />')
    expect(homeHero).not.toContain('home-audio-reactor.png')
    expect(demoCapabilities).toContain('capabilityRows')
    expect(demoCapabilities).toContain('browserSupportRows')
    expect(demoCapabilities).toContain('role="region"')
    expect(demoCapabilities).toContain('tabindex="0"')
    expect(demoCapabilities).toContain(':aria-label="text.capabilities.title"')
    expect(demoVisualization).toContain('<canvas')
    expect(demoVisualization).toContain('playerAnalyzer')
    expect(demoVisualization).toContain('requestAnimationFrame')
    expect(demoVisualization).toContain('analyzerCanvas')
    expect(demoVisualization).toContain('IntersectionObserver')
    expect(demoVisualization).toContain('prefers-reduced-motion')
    expect(demoVisualization).toContain('window.addEventListener(\'resize\', handleCanvasResize')
    expect(demoUiStyles).toContain('@source "../../components"')
    expect(demoUiStyles).toContain('@source "../../examples"')
    expect(demoUiStyles).toContain('transition-duration: 0s')
    expect(demoVisualization).not.toContain('createOscillator')
    expect(demoComposable).toContain('response.ok')
    expect(demoComposable).toContain('sourceDescription')
    expect(demoComposable).toContain('resetAdaptivePlaybackStatus()')
    expect(demoComposable).toContain('reflectSourceOwnership')
    expect(demoComposable).toContain('syncPlayerSnapshot')
    expect(demoComposable).toContain('const canSeek = computed')
    expect(demoComposable).toContain('updatePlaybackPosition(player.getCurrentTime(), duration)')
    expect(demoComposable).toContain('operationError.value = errorMessage')
    expect(demoComposable).toMatch(/runPlaylistPreview[\s\S]+resetAdaptivePlaybackStatus\(\)[\s\S]+player\.setPlaylist/)
    expect(demoComposable).toContain('fallbackFormatGroup')
    expect(demoComposable).toContain('alternateFormatGroup')
    expect(demoComposable).toContain('timestamp: Date.now()')
    expect(demoComposable).toContain('id: \'alternate\'')
    expect(demoComposable).toContain('selectAudioTrack')
    expect(demoComposable).toContain('player.previous')
    expect(demoComposable).toContain('player.next')
    expect(demoFeatureTabs).toContain('selectAlternateAudioTrackPreview')
    expect(demoFeatureTabs).toContain('previousPreviewPlaylistTrack')
    expect(demoFeatureTabs).toContain('nextPreviewPlaylistTrack')
    expect(demoStatus).toContain('role="log"')
    expect(demoStatus).toContain('aria-live="polite"')
    expect(demoStatus).toContain('aria-relevant="additions text"')
    expect(demoStatus).toContain('Intl.DateTimeFormat')
    expect(demoStatus).toContain('demoEventForDisplay')
    expect(demoComposable).toContain('console.warn(\'GAudio demo cleanup failed\'')
    expect(homeMiniPlayerComposable).toContain('console.warn(\'GAudio homepage player cleanup failed\'')
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
    expect(demoI18n).toContain('Operation in progress…')
    expect(demoI18n).toContain('操作进行中…')
    expect(demoI18n).toContain('Spectrum')
    expect(demoI18n).toContain('Level meters')
    expect(demoI18n).toContain('Waveform')
    expect(demoI18n).toContain('选择 alternate audio')
  })

  it('localizes known dynamic status messages without translating API identifiers', () => {
    const chineseText = demoText.zh

    expect(demoStatusForDisplay('manual variant-1 · 96 kbps · mp4a.40.2', chineseText))
      .toBe('手动: variant-1 · 96 kbps · mp4a.40.2')
    expect(demoStatusForDisplay('loading /gaudio/audio/hls/segment-1.ts', chineseText))
      .toBe('正在加载 /gaudio/audio/hls/segment-1.ts')
    expect(demoStatusForDisplay('loaded /gaudio/audio/hls/segment-1.ts', chineseText))
      .toBe('已加载 /gaudio/audio/hls/segment-1.ts')
    expect(demoStatusForDisplay('fatal network error', chineseText))
      .toBe('网络 致命 错误')
    expect(demoStatusForDisplay('recoverable segment error', chineseText))
      .toBe('分段 可恢复 错误')
    expect(demoStatusForDisplay('captured 8 player samples', chineseText))
      .toBe('已采集播放器样本: 8')
    expect(demoStatusForDisplay('player analyzer unavailable', chineseText))
      .toBe('播放器 analyzer 不可用')
    expect(demoStatusForDisplay('listener received payload', chineseText))
      .toBe('监听器已收到 payload')
    expect(demoStatusForDisplay('GAudioError: SOURCE_UNAVAILABLE', chineseText))
      .toBe('GAudioError：Source 不可用（SOURCE_UNAVAILABLE）')
    expect(demoStatusForDisplay('hls / hls.js', chineseText)).toBe('hls / hls.js')
  })

  it('localizes event trace prose while preserving protocol and error identifiers', () => {
    const chineseText = demoText.zh

    expect(demoEventForDisplay('statechange: playing', chineseText))
      .toBe('状态变化: 播放中')
    expect(demoEventForDisplay('volumechange: 0.80 / muted true', chineseText))
      .toBe('音量变化: 0.80 / 静音 是')
    expect(demoEventForDisplay('manifestloaded: 3 variants', chineseText))
      .toBe('Manifest 已加载: 3 个档位')
    expect(demoEventForDisplay('loaded source via source-description', chineseText))
      .toBe('已通过以下模式加载 Source: Source object')
    expect(demoEventForDisplay('streamerror: network / fatal false', chineseText))
      .toBe('流错误: 网络 / 致命 否')
    expect(demoEventForDisplay('GAudioError preview: SOURCE_UNAVAILABLE', chineseText))
      .toBe('GAudioError 预览: SOURCE_UNAVAILABLE')
  })
})
