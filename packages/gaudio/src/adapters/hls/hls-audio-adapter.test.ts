import type Hls from 'hls.js'
import type { HlsConfig } from 'hls.js'
import type { AudioEngineEvents } from '../../engine/audio-engine'
import type { HlsAdapterConfig } from './hls-audio-adapter'
import { ErrorDetails, ErrorTypes, Events } from 'hls.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AudioPlayer } from '../../player/audio-player'
import { HttpAudioSource } from '../../source/http-audio-source'
import { FakeAudioElement } from '../../test-support/fake-media'
import { AdaptivePlaybackPreset } from '../adaptive-audio-types'
import { HlsAudioAdapterImpl } from './hls-audio-adapter'
import { createHlsAdapter } from './index'

type HlsListener = (event: Events, payload: unknown) => void

class FakeHls {
  readonly listeners = new Map<Events, HlsListener[]>()
  readonly loadedSources: string[] = []
  levels: Array<{ id: number, bitrate: number, codecSet: string }> = []
  loadLevel = -1
  nextLevel = -1
  attachedMedia?: HTMLMediaElement
  destroyCalls = 0
  destroyError?: Error
  sourceLoadError?: unknown

  constructor(readonly config: Partial<HlsConfig>) {}

  on(event: Events, listener: HlsListener): void {
    const listeners = this.listeners.get(event) ?? []
    listeners.push(listener)
    this.listeners.set(event, listeners)
  }

  attachMedia(media: HTMLMediaElement): void {
    this.attachedMedia = media
  }

  loadSource(url: string): void {
    this.loadedSources.push(url)
    if (this.sourceLoadError) {
      this.emit(Events.ERROR, this.sourceLoadError)
    }
  }

  destroy(): void {
    this.destroyCalls += 1
    if (this.destroyError) {
      throw this.destroyError
    }
  }

  emit(event: Events, payload: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(event, payload)
    }
  }
}

interface AdapterHarness {
  adapter: HlsAudioAdapterImpl
  audioElements: FakeAudioElement[]
  hlsInstances: FakeHls[]
  hlsRuntimeLoadCalls: () => number
}

function adapterHarness(options: {
  strategy?: 'native-first' | 'hls-first' | 'native-only' | 'hls-only'
  nativeSupport?: CanPlayTypeResult
  hlsSupport?: boolean
  mediaSourceSupport?: boolean
  config?: HlsAdapterConfig
  contentType?: 'vod' | 'long-form' | 'live'
  preset?: AdaptivePlaybackPreset
  sourceLoadError?: unknown
} = {}): AdapterHarness {
  const audioElements: FakeAudioElement[] = []
  const hlsInstances: FakeHls[] = []
  let hlsRuntimeLoadCalls = 0
  const adapter = new HlsAudioAdapterImpl({
    playbackStrategy: options.strategy,
    config: options.config,
    contentType: options.contentType,
    preset: options.preset,
  }, {
    audioElementFactory: () => {
      const audioElement = new FakeAudioElement({ nativeHlsSupport: options.nativeSupport })
      audioElements.push(audioElement)
      return audioElement as unknown as HTMLAudioElement
    },
    loadHlsRuntime: async () => {
      hlsRuntimeLoadCalls += 1
      return {
        createHls: (config) => {
          const hls = new FakeHls(config)
          hls.sourceLoadError = options.sourceLoadError
          hlsInstances.push(hls)
          return hls as unknown as Hls
        },
        events: Events,
        errorTypes: ErrorTypes,
        isSupported: () => options.hlsSupport ?? true,
      }
    },
    hasHlsRuntimeSupport: () => options.mediaSourceSupport ?? options.hlsSupport ?? true,
    hasNativeHlsSupport: () => options.nativeSupport !== undefined && options.nativeSupport !== '',
  })

  return {
    adapter,
    audioElements,
    hlsInstances,
    hlsRuntimeLoadCalls: () => hlsRuntimeLoadCalls,
  }
}

async function loadEngine(harness: AdapterHarness, url = '/stream.m3u8') {
  const engine = await harness.adapter.createEngine()
  const load = engine.load(new HttpAudioSource(url))
  await vi.waitFor(() => {
    expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
  })
  // AI modified: hls.js metadata belongs to the instance whose manifest has completed.
  harness.hlsInstances.at(-1)?.emit(Events.MANIFEST_PARSED, { levels: [] })
  harness.audioElements.at(-1)?.dispatchEvent(new Event('loadedmetadata'))
  await load
  return engine
}

describe('hlsAudioAdapter', () => {
  afterEach(() => {
    vi.doUnmock('hls.js')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('retries optional runtime loading after a transient dynamic import failure', async () => {
    class FakeMediaSource {
      static isTypeSupported(_mimeType: string): boolean {
        return true
      }
    }
    vi.stubGlobal('Audio', class extends FakeAudioElement {})
    vi.stubGlobal('MediaSource', FakeMediaSource)
    const runtimeLoadError = new Error('temporary HLS chunk failure')
    vi.doMock('hls.js', () => {
      throw runtimeLoadError
    })
    const adapter = createHlsAdapter({ playbackStrategy: 'hls-only' })

    await expect(adapter.createEngine()).rejects.toMatchObject({
      code: 'ADAPTER_UNAVAILABLE',
    })

    vi.doUnmock('hls.js')
    let runtimeLoadCalls = 0
    vi.doMock('hls.js', () => {
      runtimeLoadCalls += 1
      return {
        default: class {
          static isSupported(): boolean {
            return true
          }
        },
        ErrorTypes,
        Events,
      }
    })

    const [firstEngine, secondEngine] = await Promise.all([
      adapter.createEngine(),
      adapter.createEngine(),
    ])

    expect(runtimeLoadCalls).toBe(1)
    expect(adapter.implementation).toBe('hls.js')
    firstEngine.dispose()
    secondEngine.dispose()
  })

  it.each([
    [AdaptivePlaybackPreset.FastStart, 12, 30, 15, 16 * 1024 * 1024, 256_000, 0.9, 0.7, 2, 6_000, 30_000, 2],
    [AdaptivePlaybackPreset.Balanced, 30, 90, 30, 32 * 1024 * 1024, 384_000, 0.9, 0.65, 4, 10_000, 60_000, 4],
    [AdaptivePlaybackPreset.Stable, 60, 180, 60, 48 * 1024 * 1024, 256_000, 0.8, 0.55, 8, 15_000, 120_000, 6],
  ] as const)(
    'applies the %s audio VOD preset',
    (preset, maxBufferLength, maxMaxBufferLength, backBufferLength, maxBufferSize, abrEwmaDefaultEstimate, abrBandWidthFactor, abrBandWidthUpFactor, maxLoadingDelay, fragmentFirstByteTimeout, fragmentLoadTimeout, fragmentErrorRetries) => {
      const harness = adapterHarness({ preset })
      const config = harness.adapter.getConfig()

      expect(config).toMatchObject({
        maxBufferLength,
        maxMaxBufferLength,
        backBufferLength,
        maxBufferSize,
        abrEwmaDefaultEstimate,
        abrBandWidthFactor,
        abrBandWidthUpFactor,
        maxStarvationDelay: maxLoadingDelay,
        maxLoadingDelay,
        lowLatencyMode: false,
      })
      expect(config.fragLoadPolicy?.default).toMatchObject({
        maxTimeToFirstByteMs: fragmentFirstByteTimeout,
        maxLoadTimeMs: fragmentLoadTimeout,
        errorRetry: {
          maxNumRetry: fragmentErrorRetries,
          backoff: 'exponential',
        },
      })
    },
  )

  it('provides a complete balanced HLS audio VOD baseline', () => {
    const config = adapterHarness().adapter.getConfig()

    expect(config).toMatchObject({
      autoStartLoad: true,
      startPosition: -1,
      debug: false,
      preferManagedMediaSource: true,
      maxFragLookUpTolerance: 0.25,
      maxBufferHole: 0.1,
      detectStallWithCurrentTimeMs: 1250,
      highBufferWatchdogPeriod: 2,
      nudgeOffset: 0.1,
      nudgeMaxRetry: 3,
      enableWorker: true,
      enableSoftwareAES: true,
      startFragPrefetch: false,
      appendErrorMaxRetry: 3,
      ignorePlaylistParsingErrors: false,
      maxAudioFramesDrift: 1,
      abrEwmaFastVoD: 3,
      abrEwmaSlowVoD: 9,
      abrEwmaDefaultEstimateMax: 1_500_000,
      abrMaxWithRealBitrate: true,
      minAutoBitrate: 0,
      testBandwidth: true,
      progressive: false,
      useMediaCapabilities: true,
      preserveManualLevelOnError: false,
    })
    expect(config.manifestLoadPolicy?.default).toMatchObject({
      maxTimeToFirstByteMs: 10_000,
      maxLoadTimeMs: 20_000,
      timeoutRetry: { maxNumRetry: 2, backoff: 'exponential' },
      errorRetry: { maxNumRetry: 2, backoff: 'exponential' },
    })
    expect(config.playlistLoadPolicy?.default).toMatchObject({
      maxTimeToFirstByteMs: 10_000,
      maxLoadTimeMs: 20_000,
      timeoutRetry: { maxNumRetry: 2, backoff: 'exponential' },
      errorRetry: { maxNumRetry: 2, backoff: 'exponential' },
    })
    expect(config.keyLoadPolicy?.default).toMatchObject({
      maxTimeToFirstByteMs: 8_000,
      maxLoadTimeMs: 20_000,
      timeoutRetry: { maxNumRetry: 1, backoff: 'exponential' },
      errorRetry: { maxNumRetry: 4, backoff: 'exponential' },
    })
    for (const excludedSetting of [
      'initialLiveManifestSize',
      'liveSyncMode',
      'emeEnabled',
      'enableInterstitialPlayback',
      'capLevelToPlayerSize',
      'capLevelOnFPSDrop',
    ]) {
      expect(config).not.toHaveProperty(excludedSetting)
    }
  })

  it('deeply applies HLS request policy overrides at runtime', async () => {
    const harness = adapterHarness()

    await harness.adapter.updateConfig({
      fragLoadPolicy: {
        default: {
          errorRetry: { maxNumRetry: 9 },
        },
      },
    })

    expect(harness.adapter.getConfig().fragLoadPolicy?.default).toMatchObject({
      maxTimeToFirstByteMs: 10_000,
      maxLoadTimeMs: 60_000,
      timeoutRetry: { maxNumRetry: 3 },
      errorRetry: {
        maxNumRetry: 9,
        retryDelayMs: 1_000,
        maxRetryDelayMs: 8_000,
        backoff: 'exponential',
      },
    })
  })

  it('uses the balanced preset by default and lets caller config override it', () => {
    const harness = adapterHarness({ config: { maxBufferLength: 75 } })

    expect(harness.adapter.getConfig()).toMatchObject({
      maxBufferLength: 75,
      maxMaxBufferLength: 90,
      backBufferLength: 30,
      lowLatencyMode: false,
    })
  })

  it('applies the HLS long-form audio profile for extended playback', () => {
    const config = adapterHarness({ contentType: 'long-form' }).adapter.getConfig()

    expect(config).toMatchObject({
      maxBufferLength: 120,
      maxMaxBufferLength: 300,
      backBufferLength: 120,
      maxBufferSize: 64 * 1024 * 1024,
      maxStarvationDelay: 10,
      maxLoadingDelay: 10,
      lowLatencyMode: false,
    })
    expect(config.fragLoadPolicy?.default).toMatchObject({
      maxLoadTimeMs: 180_000,
      errorRetry: { maxNumRetry: 8 },
    })
  })

  it('applies the HLS live profile for low-latency recovery', () => {
    const config = adapterHarness({ contentType: 'live' }).adapter.getConfig()

    expect(config).toMatchObject({
      maxBufferLength: 18,
      maxMaxBufferLength: 45,
      backBufferLength: 45,
      liveBackBufferLength: 45,
      lowLatencyMode: true,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 8,
      maxStarvationDelay: 3,
      maxLoadingDelay: 3,
    })
    expect(config.playlistLoadPolicy?.default).toMatchObject({
      maxLoadTimeMs: 10_000,
      errorRetry: { maxNumRetry: 10 },
    })
    expect(config.fragLoadPolicy?.default).toMatchObject({
      maxLoadTimeMs: 30_000,
      errorRetry: { maxNumRetry: 10 },
    })
  })

  it('isolates HLS preset configuration between adapters', () => {
    const firstHarness = adapterHarness()
    const firstConfig = firstHarness.adapter.getConfig() as {
      maxBufferLength?: number
      fragLoadPolicy?: { default?: { errorRetry?: { maxNumRetry?: number } } }
    }
    firstConfig.maxBufferLength = 999
    if (firstConfig.fragLoadPolicy?.default?.errorRetry) {
      firstConfig.fragLoadPolicy.default.errorRetry.maxNumRetry = 999
    }

    expect(adapterHarness().adapter.getConfig()).toMatchObject({ maxBufferLength: 30 })
    expect(adapterHarness().adapter.getConfig().fragLoadPolicy?.default.errorRetry?.maxNumRetry).toBe(4)
  })

  it('isolates caller arrays and arrays returned by configuration snapshots', () => {
    const includeKeys = ['br']
    const harness = adapterHarness({
      config: {
        cmcd: { includeKeys },
      },
    })

    includeKeys.push('d')
    expect(harness.adapter.getConfig().cmcd?.includeKeys).toEqual(['br'])

    const snapshotKeys = harness.adapter.getConfig().cmcd?.includeKeys
    snapshotKeys?.push('ot')

    expect(harness.adapter.getConfig().cmcd?.includeKeys).toEqual(['br'])
  })

  it.each([
    ['native-first', 'probably', true, 'native'],
    ['native-first', '', true, 'hls.js'],
    ['hls-first', 'probably', true, 'hls.js'],
    ['hls-first', 'probably', false, 'native'],
    ['native-only', 'probably', true, 'native'],
    ['hls-only', 'probably', true, 'hls.js'],
  ] as const)('selects %s as %s', async (strategy, nativeSupport, hlsSupport, expected) => {
    const harness = adapterHarness({ strategy, nativeSupport, hlsSupport })
    const engine = await loadEngine(harness)

    expect(harness.adapter.implementation).toBe(expected)
    expect(harness.adapter.hlsInstance === undefined).toBe(expected === 'native')

    engine.dispose()
    expect(harness.adapter.hlsInstance).toBeUndefined()
  })

  it('does not load hls.js runtime for native-first native playback', async () => {
    const harness = adapterHarness({ strategy: 'native-first', nativeSupport: 'probably' })

    await loadEngine(harness)

    expect(harness.hlsRuntimeLoadCalls()).toBe(0)
    expect(harness.hlsInstances).toHaveLength(0)
    expect(harness.adapter.implementation).toBe('native')
  })

  it('keeps automatic quality idempotent for active native HLS playback', async () => {
    const harness = adapterHarness({ strategy: 'native-only', nativeSupport: 'probably' })
    const engine = await loadEngine(harness)

    await expect(engine.setAdaptiveQuality?.('auto')).resolves.toBeUndefined()
    await expect(engine.setAdaptiveQuality?.('manual')).rejects.toMatchObject({
      code: 'PROTOCOL_UNSUPPORTED',
    })

    expect(engine.getAdaptiveQualitySelection?.()).toBe('auto')
  })

  it('does not report partial MediaSource implementations as hls.js support', () => {
    class FakeMediaSource {
      static isTypeSupported(_mimeType: string): boolean {
        return true
      }
    }

    vi.stubGlobal('MediaSource', FakeMediaSource)
    vi.stubGlobal('Audio', undefined)

    const adapter = createHlsAdapter({ playbackStrategy: 'hls-only' })

    expect(adapter.isSupported()).toBe(false)

    vi.stubGlobal('Audio', {})
    expect(adapter.isSupported()).toBe(false)

    vi.stubGlobal('Audio', class {
      canPlayType(): string {
        return ''
      }
    })
    expect(adapter.isSupported()).toBe(true)

    vi.stubGlobal('MediaSource', {
      isTypeSupported: vi.fn(() => true),
    })
    expect(adapter.isSupported()).toBe(false)

    vi.stubGlobal('MediaSource', {})
    expect(adapter.isSupported()).toBe(false)
  })

  it.each([
    'audio/mpegurl',
    'audio/x-mpegurl',
    'application/mpegurl',
  ])('recognizes the %s native HLS capability', (supportedMimeType) => {
    const checkedMimeTypes: string[] = []
    vi.stubGlobal('Audio', class {
      canPlayType(mimeType: string): CanPlayTypeResult {
        checkedMimeTypes.push(mimeType)
        return mimeType === supportedMimeType ? 'probably' : ''
      }
    })

    const adapter = createHlsAdapter({ playbackStrategy: 'native-only' })

    expect(adapter.isSupported()).toBe(true)
    expect(checkedMimeTypes).toContain(supportedMimeType)
  })

  it('falls back to native playback when hls-first runtime support fails', async () => {
    const harness = adapterHarness({
      strategy: 'hls-first',
      nativeSupport: 'probably',
      mediaSourceSupport: true,
      hlsSupport: false,
    })

    await loadEngine(harness)

    expect(harness.hlsRuntimeLoadCalls()).toBe(1)
    expect(harness.hlsInstances).toHaveLength(0)
    expect(harness.adapter.implementation).toBe('native')
  })

  it.each([
    ['native-only', '', true],
    ['hls-only', 'probably', false],
  ] as const)('rejects unsupported %s playback', async (strategy, nativeSupport, hlsSupport) => {
    const harness = adapterHarness({ strategy, nativeSupport, hlsSupport })

    await expect(harness.adapter.createEngine()).rejects.toMatchObject({
      code: 'PROTOCOL_UNSUPPORTED',
    })
  })

  it('translates manifest, variant, segment, and recoverable error events', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await harness.adapter.createEngine()
    const manifests: AudioEngineEvents['manifestloaded'][] = []
    const variants: AudioEngineEvents['variantchange'][] = []
    const segmentStarts: AudioEngineEvents['segmentloadstart'][] = []
    const segmentLoads: AudioEngineEvents['segmentloaded'][] = []
    const streamErrors: AudioEngineEvents['streamerror'][] = []
    const fatalErrors: string[] = []
    engine.on('manifestloaded', payload => manifests.push(payload))
    engine.on('variantchange', payload => variants.push(payload))
    engine.on('segmentloadstart', payload => segmentStarts.push(payload))
    engine.on('segmentloaded', payload => segmentLoads.push(payload))
    engine.on('streamerror', payload => streamErrors.push(payload))
    engine.on('error', error => fatalErrors.push(error.code))

    const load = engine.load(new HttpAudioSource('/stream.m3u8'))
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })
    const hls = harness.hlsInstances[0]
    hls.levels = [
      { id: 0, bitrate: 64_000, codecSet: 'mp4a.40.2' },
      { id: 1, bitrate: 128_000, codecSet: 'mp4a.40.2' },
    ]
    hls.emit(Events.MANIFEST_PARSED, { levels: [] })
    hls.emit(Events.LEVEL_SWITCHED, { level: 1 })
    hls.emit(Events.FRAG_LOADING, { frag: { url: '/segment-1.m4s', level: 1, duration: 4 } })
    hls.emit(Events.FRAG_LOADED, { frag: { url: '/segment-1.m4s', level: 1, duration: 4 } })
    hls.emit(Events.ERROR, {
      type: ErrorTypes.NETWORK_ERROR,
      details: ErrorDetails.FRAG_LOAD_ERROR,
      fatal: false,
      error: new Error('retrying'),
    })
    harness.audioElements.at(-1)?.dispatchEvent(new Event('loadedmetadata'))
    await load

    expect(manifests[0]).toMatchObject({
      protocol: 'hls',
      implementation: 'hls.js',
      url: '/stream.m3u8',
      variants: [
        { id: '0', bitrate: 64_000, codecs: 'mp4a.40.2' },
        { id: '1', bitrate: 128_000, codecs: 'mp4a.40.2' },
      ],
    })
    expect(variants[0]).toMatchObject({ variantId: '1', bitrate: 128_000, reason: 'initial' })
    expect(segmentStarts[0]).toMatchObject({ url: '/segment-1.m4s', variantId: '1', duration: 4 })
    expect(segmentLoads[0]).toMatchObject({ url: '/segment-1.m4s', variantId: '1', duration: 4 })
    expect(streamErrors[0]).toMatchObject({ category: 'segment', isFatal: false })
    expect(fatalErrors).toEqual([])
  })

  it('maps playable runtime levels to public HLS variant IDs', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)
    const manifests: AudioEngineEvents['manifestloaded'][] = []
    const variantChanges: AudioEngineEvents['variantchange'][] = []
    const segmentStarts: AudioEngineEvents['segmentloadstart'][] = []
    const segmentLoads: AudioEngineEvents['segmentloaded'][] = []
    engine.on('manifestloaded', payload => manifests.push(payload))
    engine.on('variantchange', payload => variantChanges.push(payload))
    engine.on('segmentloadstart', payload => segmentStarts.push(payload))
    engine.on('segmentloaded', payload => segmentLoads.push(payload))
    const hls = harness.hlsInstances[0]
    hls.emit(Events.MANIFEST_LOADED, {
      url: '/stream.m3u8',
      levels: [
        { id: 10, bitrate: 32_000, audioCodec: 'mp4a.40.2' },
        { id: 99, bitrate: 96_000, audioCodec: 'mp4a.40.2' },
        { id: 20, bitrate: 192_000, audioCodec: 'mp4a.40.2' },
      ],
    })
    expect(engine.getAdaptiveVariants?.()).toEqual([])

    // hls.js can filter and reorder parsed manifest entries before exposing playable levels.
    hls.levels = [
      { id: 20, bitrate: 128_000, codecSet: 'mp4a.40.2' },
      { id: 10, bitrate: 64_000, codecSet: 'mp4a.40.2' },
    ]
    hls.emit(Events.MANIFEST_PARSED, { levels: [] })

    expect(engine.getAdaptiveVariants?.()).toEqual([
      { id: '20', bitrate: 128_000, codecs: 'mp4a.40.2' },
      { id: '10', bitrate: 64_000, codecs: 'mp4a.40.2' },
    ])
    expect(manifests).toHaveLength(1)

    hls.emit(Events.LEVEL_SWITCHED, { level: 0 })
    await engine.setAdaptiveQuality?.('10')

    expect(hls.nextLevel).toBe(1)
    expect(engine.getAdaptiveQualitySelection?.()).toBe('10')
    expect(variantChanges).toMatchObject([
      { variantId: '20', bitrate: 128_000, reason: 'initial' },
    ])

    hls.emit(Events.FRAG_LOADING, { frag: { url: '/manual.m4s', level: 1, duration: 4 } })
    hls.emit(Events.FRAG_LOADED, { frag: { url: '/manual.m4s', level: 1, duration: 4 } })
    hls.emit(Events.LEVEL_SWITCHED, { level: 1 })

    expect(variantChanges.at(-1)).toMatchObject({
      previousVariantId: '20',
      variantId: '10',
      bitrate: 64_000,
      reason: 'manual',
    })
    expect(segmentStarts).toMatchObject([{ variantId: '10' }])
    expect(segmentLoads).toMatchObject([{ variantId: '10' }])

    await engine.setAdaptiveQuality?.('auto')

    expect(hls.loadLevel).toBe(-1)
    expect(engine.getAdaptiveQualitySelection?.()).toBe('auto')
  })

  it('isolates HLS variant query and manifest snapshots from selection state', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)
    const manifests: AudioEngineEvents['manifestloaded'][] = []
    engine.on('manifestloaded', payload => manifests.push(payload))
    const hls = harness.hlsInstances[0]
    hls.levels = [
      { id: 10, bitrate: 64_000, codecSet: 'mp4a.40.2' },
      { id: 20, bitrate: 128_000, codecSet: 'mp4a.40.2' },
    ]
    hls.emit(Events.MANIFEST_PARSED, { levels: [] })
    const queriedVariants = engine.getAdaptiveVariants?.() ?? []
    const queriedVariant = queriedVariants[0]
    const manifestVariants = manifests[0]?.variants
    const manifestVariant = manifestVariants?.[1]
    if (!queriedVariant || !manifestVariants || !manifestVariant) {
      throw new Error('Expected HLS variant snapshots')
    }

    // Runtime mutation attempts model untyped JavaScript consumers of the readonly public API.
    Reflect.set(queriedVariant, 'bitrate', 1)
    Reflect.set(queriedVariants, 'length', 0)
    Reflect.set(manifestVariant, 'id', 'mutated')
    Reflect.set(manifestVariants, 'length', 0)

    expect(engine.getAdaptiveVariants?.()).toEqual([
      { id: '10', bitrate: 64_000, codecs: 'mp4a.40.2' },
      { id: '20', bitrate: 128_000, codecs: 'mp4a.40.2' },
    ])

    await engine.setAdaptiveQuality?.('20')
    expect(hls.nextLevel).toBe(1)
  })

  it('reports a requested first HLS level switch as manual', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)
    const variantChanges: AudioEngineEvents['variantchange'][] = []
    engine.on('variantchange', payload => variantChanges.push(payload))
    const hls = harness.hlsInstances[0]
    hls.levels = [
      { id: 10, bitrate: 64_000, codecSet: 'mp4a.40.2' },
      { id: 20, bitrate: 128_000, codecSet: 'mp4a.40.2' },
    ]
    hls.emit(Events.MANIFEST_PARSED, { levels: [] })

    await engine.setAdaptiveQuality?.('10')
    hls.emit(Events.LEVEL_SWITCHED, { level: 0 })

    expect(variantChanges).toMatchObject([{
      previousVariantId: undefined,
      variantId: '10',
      reason: 'manual',
    }])
  })

  it('preserves a reentrant manual quality request made by a variant listener', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)
    const variantChanges: AudioEngineEvents['variantchange'][] = []
    engine.on('variantchange', (variantChange) => {
      variantChanges.push(variantChange)
      if (variantChange.variantId === '20') {
        void engine.setAdaptiveQuality?.('10')
      }
    })
    const hls = harness.hlsInstances[0]
    hls.levels = [
      { id: 10, bitrate: 64_000, codecSet: 'mp4a.40.2' },
      { id: 20, bitrate: 128_000, codecSet: 'mp4a.40.2' },
    ]
    hls.emit(Events.MANIFEST_PARSED, { levels: [] })

    await engine.setAdaptiveQuality?.('20')
    hls.emit(Events.LEVEL_SWITCHED, { level: 1 })
    hls.emit(Events.LEVEL_SWITCHED, { level: 0 })

    expect(variantChanges).toMatchObject([
      { variantId: '20', reason: 'manual' },
      { variantId: '10', reason: 'manual' },
    ])
    expect(engine.getAdaptiveQualitySelection?.()).toBe('10')
  })

  it('replaces hls.js playback without accepting events from the destroyed instance', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness, '/first.m3u8')
    const manifests: AudioEngineEvents['manifestloaded'][] = []
    const errorCodes: string[] = []
    engine.on('manifestloaded', payload => manifests.push(payload))
    engine.on('error', error => errorCodes.push(error.code))
    const firstHls = harness.hlsInstances[0]

    const replacementLoad = engine.load(new HttpAudioSource('/second.m3u8'))
    await vi.waitFor(() => {
      expect(harness.hlsInstances).toHaveLength(2)
    })
    const replacementHls = harness.hlsInstances[1]

    firstHls.levels = [{ id: 5, bitrate: 48_000, codecSet: 'mp4a.40.2' }]
    firstHls.emit(Events.MANIFEST_PARSED, { levels: [] })
    firstHls.emit(Events.ERROR, {
      type: ErrorTypes.NETWORK_ERROR,
      details: ErrorDetails.MANIFEST_LOAD_ERROR,
      fatal: true,
      error: new Error('stale manifest failure'),
    })
    replacementHls.levels = [{ id: 42, bitrate: 128_000, codecSet: 'mp4a.40.2' }]
    replacementHls.emit(Events.MANIFEST_PARSED, { levels: [] })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))

    await replacementLoad

    expect(firstHls.destroyCalls).toBe(1)
    expect(harness.adapter.hlsInstance).toBe(replacementHls)
    expect(manifests).toMatchObject([{
      url: '/second.m3u8',
      variants: [{ id: '42', bitrate: 128_000 }],
    }])
    expect(errorCodes).toEqual([])
  })

  it.each([
    [ErrorDetails.MANIFEST_LOAD_ERROR, 'MANIFEST_ERROR'],
    [ErrorDetails.LEVEL_LOAD_ERROR, 'MANIFEST_ERROR'],
    [ErrorDetails.AUDIO_TRACK_LOAD_ERROR, 'MANIFEST_ERROR'],
    [ErrorDetails.FRAG_LOAD_ERROR, 'SEGMENT_ERROR'],
    [ErrorDetails.KEY_LOAD_ERROR, 'SEGMENT_ERROR'],
    [ErrorDetails.BUFFER_APPEND_ERROR, 'ADAPTIVE_STREAM_ERROR'],
  ] as const)('publishes fatal %s errors as %s', async (details, errorCode) => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await harness.adapter.createEngine()
    const errorCodes: string[] = []
    engine.on('error', error => errorCodes.push(error.code))
    const load = engine.load(new HttpAudioSource('/stream.m3u8'))
    const loadExpectation = expect(load).rejects.toMatchObject({ code: errorCode })
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })

    harness.hlsInstances[0].emit(Events.ERROR, {
      type: ErrorTypes.NETWORK_ERROR,
      details,
      fatal: true,
      error: new Error('fatal'),
    })
    await loadExpectation

    expect(errorCodes).toEqual([errorCode])
  })

  it.each([
    [ErrorDetails.LEVEL_LOAD_TIMEOUT, 'manifest'],
    [ErrorDetails.AUDIO_TRACK_LOAD_TIMEOUT, 'manifest'],
    [ErrorDetails.KEY_LOAD_TIMEOUT, 'segment'],
  ] as const)('classifies recoverable %s failures as %s errors', async (details, category) => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)
    const streamErrors: AudioEngineEvents['streamerror'][] = []
    engine.on('streamerror', error => streamErrors.push(error))

    harness.hlsInstances[0].emit(Events.ERROR, {
      type: ErrorTypes.NETWORK_ERROR,
      details,
      fatal: false,
      error: new Error('retrying'),
    })

    expect(streamErrors).toMatchObject([{ category, isFatal: false }])
  })

  it('classifies hls.js media failures as media errors', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)
    const streamErrors: AudioEngineEvents['streamerror'][] = []
    engine.on('streamerror', error => streamErrors.push(error))

    // AI modified: non-network vendor media failures must retain the public media category.
    harness.hlsInstances[0].emit(Events.ERROR, {
      type: ErrorTypes.MEDIA_ERROR,
      details: ErrorDetails.BUFFER_STALLED_ERROR,
      fatal: false,
      error: new Error('recoverable media failure'),
    })

    expect(streamErrors).toMatchObject([{
      category: 'media',
      isFatal: false,
      code: ErrorDetails.BUFFER_STALLED_ERROR,
    }])
  })

  it('keeps fatal handling stable when a stream listener mutates the vendor cause', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await harness.adapter.createEngine()
    const errorCodes: string[] = []
    engine.on('streamerror', (streamError) => {
      if (typeof streamError.cause === 'object' && streamError.cause !== null) {
        // Runtime mutation models an untyped consumer changing the diagnostic object.
        Reflect.set(streamError.cause, 'fatal', false)
        Reflect.set(streamError.cause, 'details', ErrorDetails.FRAG_LOAD_ERROR)
      }
    })
    engine.on('error', error => errorCodes.push(error.code))
    const load = engine.load(new HttpAudioSource('/stream.m3u8'))
    const loadExpectation = expect(load).rejects.toMatchObject({ code: 'MANIFEST_ERROR' })
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })

    harness.hlsInstances[0].emit(Events.ERROR, {
      type: ErrorTypes.NETWORK_ERROR,
      details: ErrorDetails.MANIFEST_LOAD_ERROR,
      fatal: true,
      error: new Error('fatal'),
    })

    await loadExpectation
    expect(errorCodes).toEqual(['MANIFEST_ERROR'])
  })

  it('rejects and closes a source when HLS fails synchronously during attachment', async () => {
    const harness = adapterHarness({
      strategy: 'hls-only',
      sourceLoadError: {
        type: ErrorTypes.NETWORK_ERROR,
        details: ErrorDetails.MANIFEST_LOAD_ERROR,
        fatal: true,
        error: new Error('synchronous manifest failure'),
      },
    })
    const engine = await harness.adapter.createEngine()
    const close = vi.fn(async () => {})
    const adaptiveChanges: AudioEngineEvents['adaptivechange'][] = []
    engine.on('adaptivechange', payload => adaptiveChanges.push(payload))

    await expect(engine.load({
      kind: 'url',
      url: '/stream.m3u8',
      open: async () => ({ url: '/stream.m3u8' }),
      close,
    })).rejects.toMatchObject({ code: 'MANIFEST_ERROR' })

    expect(close).toHaveBeenCalledOnce()
    expect(adaptiveChanges).toEqual([])
    expect(engine.getActiveAdaptivePlayback?.()).toBeUndefined()
    expect(harness.adapter.hlsInstance).toBeUndefined()
  })

  it('stores next-load config and explicitly reloads active hls.js playback', async () => {
    const harness = adapterHarness({
      strategy: 'hls-only',
      config: { maxBufferLength: 20 },
    })
    const engine = await loadEngine(harness)
    const variantChanges: AudioEngineEvents['variantchange'][] = []
    engine.on('variantchange', payload => variantChanges.push(payload))
    harness.hlsInstances[0].levels = [
      { id: 0, bitrate: 64_000, codecSet: 'mp4a.40.2' },
      { id: 1, bitrate: 128_000, codecSet: 'mp4a.40.2' },
    ]
    harness.hlsInstances[0].emit(Events.MANIFEST_PARSED, { levels: [] })
    harness.hlsInstances[0].emit(Events.LEVEL_SWITCHED, { level: 0 })
    const audioElement = harness.audioElements.at(-1)
    if (!audioElement) {
      throw new Error('Expected an active audio element')
    }
    audioElement.currentTime = 42
    audioElement.paused = false

    await harness.adapter.updateConfig({ maxBufferLength: 30 })
    expect(harness.hlsInstances).toHaveLength(1)
    expect(harness.adapter.getConfig()).toMatchObject({ maxBufferLength: 30 })

    const reload = harness.adapter.updateConfig({ backBufferLength: 15 }, { apply: 'reload' })
    await Promise.resolve()
    const reloadedHls = harness.hlsInstances.at(-1)
    if (!reloadedHls) {
      throw new Error('Expected a reloaded HLS instance')
    }
    reloadedHls.levels = [
      { id: 0, bitrate: 64_000, codecSet: 'mp4a.40.2' },
      { id: 1, bitrate: 128_000, codecSet: 'mp4a.40.2' },
    ]
    reloadedHls.emit(Events.MANIFEST_PARSED, { levels: [] })
    reloadedHls.emit(Events.LEVEL_SWITCHED, { level: 1 })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await reload

    expect(harness.hlsInstances).toHaveLength(2)
    expect(harness.hlsInstances[0].destroyCalls).toBe(1)
    expect(audioElement.currentTime).toBe(42)
    expect(audioElement.playCalls).toBe(1)
    expect(harness.adapter.getConfig()).toMatchObject({ maxBufferLength: 30, backBufferLength: 15 })
    expect(variantChanges).toMatchObject([
      { variantId: '0', reason: 'initial' },
      { previousVariantId: undefined, variantId: '1', reason: 'initial' },
    ])

    engine.dispose()
  })

  it('applies next-load config when a reused engine opens another HLS source', async () => {
    const harness = adapterHarness({
      strategy: 'hls-only',
      config: { maxBufferLength: 20 },
    })
    const engine = await loadEngine(harness)

    await harness.adapter.updateConfig({ maxBufferLength: 35 })
    const replacementLoad = engine.load(new HttpAudioSource('/replacement.m3u8'))
    await vi.waitFor(() => {
      expect(harness.hlsInstances).toHaveLength(2)
    })
    const replacementHls = harness.hlsInstances[1]
    replacementHls.emit(Events.MANIFEST_PARSED, { levels: [] })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await replacementLoad

    expect(replacementHls.config).toMatchObject({ maxBufferLength: 35 })
    expect(replacementHls.loadedSources).toEqual(['/replacement.m3u8'])

    engine.dispose()
  })

  it('updates player state when an HLS reload intentionally remains paused', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const player = new AudioPlayer({
      source: { url: '/stream.m3u8', protocol: 'hls' },
      adapters: [harness.adapter],
    })
    const load = player.load()
    await vi.waitFor(() => {
      expect(harness.hlsInstances).toHaveLength(1)
    })
    const audioElement = harness.audioElements[0]
    harness.hlsInstances[0].emit(Events.MANIFEST_PARSED, { levels: [] })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await load
    await player.play()
    audioElement.dispatchEvent(new Event('playing'))
    expect(player.getState()).toBe('playing')

    const reload = harness.adapter.updateConfig(
      { backBufferLength: 15 },
      { apply: 'reload', resumePlayback: false },
    )
    await vi.waitFor(() => {
      expect(harness.hlsInstances).toHaveLength(2)
    })
    audioElement.dispatchEvent(new Event('pause'))
    harness.hlsInstances[1].emit(Events.MANIFEST_PARSED, { levels: [] })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await reload

    expect(player.isPaused()).toBe(true)
    expect(player.getState()).toBe('paused')
    expect(audioElement.playCalls).toBe(1)

    player.dispose()
  })

  it('lets only the latest overlapping HLS reload restore position and playback', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)
    const audioElement = harness.audioElements[0]
    audioElement.currentTime = 17
    audioElement.paused = false
    const errorCodes: string[] = []
    engine.on('error', error => errorCodes.push(error.code))

    const firstReload = harness.adapter.updateConfig({ maxBufferLength: 40 }, { apply: 'reload' })
    const firstReloadExpectation = expect(firstReload).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    await vi.waitFor(() => {
      expect(harness.hlsInstances).toHaveLength(2)
    })
    audioElement.currentTime = 29

    const latestReload = harness.adapter.updateConfig({ backBufferLength: 12 }, { apply: 'reload' })
    await firstReloadExpectation
    await vi.waitFor(() => {
      expect(harness.hlsInstances).toHaveLength(3)
    })
    const supersededHls = harness.hlsInstances[1]
    const latestHls = harness.hlsInstances[2]
    supersededHls.emit(Events.ERROR, {
      type: ErrorTypes.NETWORK_ERROR,
      details: ErrorDetails.MANIFEST_LOAD_ERROR,
      fatal: true,
      error: new Error('superseded reload failed'),
    })
    latestHls.levels = [{ id: 7, bitrate: 96_000, codecSet: 'mp4a.40.2' }]
    latestHls.emit(Events.MANIFEST_PARSED, { levels: [] })
    audioElement.dispatchEvent(new Event('loadedmetadata'))

    await latestReload

    expect(errorCodes).toEqual([])
    expect(harness.hlsInstances[0].destroyCalls).toBe(1)
    expect(supersededHls.destroyCalls).toBe(1)
    expect(audioElement.currentTime).toBe(29)
    expect(audioElement.playCalls).toBe(1)
  })

  it('waits for current HLS metadata after ignoring a queued pre-reload event', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)
    const audioElement = harness.audioElements[0]
    let hasReloaded = false

    const reload = harness.adapter
      .updateConfig({ maxBufferLength: 42 }, { apply: 'reload' })
      .then(() => {
        hasReloaded = true
      })
    await vi.waitFor(() => {
      expect(harness.hlsInstances).toHaveLength(2)
    })

    harness.hlsInstances[1].emit(Events.MANIFEST_PARSED, { levels: [] })
    audioElement.readyState = 0
    // AI modified: a queued old-media task may be created after the new manifest, while the replacement still has no metadata.
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await Promise.resolve()
    expect(hasReloaded).toBe(false)

    audioElement.readyState = 1
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await reload

    expect(hasReloaded).toBe(true)
    engine.dispose()
  })

  it('does not let an old fatal event reject a reload started by its stream listener', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)
    const originalHls = harness.hlsInstances[0]
    const errorCodes: string[] = []
    let listenerReload: Promise<void> | undefined
    engine.on('error', error => errorCodes.push(error.code))
    engine.on('streamerror', ({ isFatal }) => {
      if (isFatal && !listenerReload) {
        listenerReload = harness.adapter.updateConfig(
          { maxBufferLength: 45 },
          { apply: 'reload' },
        )
      }
    })

    originalHls.emit(Events.ERROR, {
      type: ErrorTypes.NETWORK_ERROR,
      details: ErrorDetails.MANIFEST_LOAD_ERROR,
      fatal: true,
      error: new Error('old source failed'),
    })

    expect(listenerReload).toBeDefined()
    expect(harness.hlsInstances).toHaveLength(2)
    harness.hlsInstances[1].emit(Events.MANIFEST_PARSED, { levels: [] })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await listenerReload

    expect(errorCodes).toEqual([])
    expect(harness.adapter.hlsInstance).toBe(harness.hlsInstances[1])
  })

  it('does not let an old fatal event reject a reload started by its error listener', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)
    const originalHls = harness.hlsInstances[0]
    const errorCodes: string[] = []
    let listenerReload: Promise<void> | undefined
    engine.on('error', (error) => {
      errorCodes.push(error.code)
      if (!listenerReload) {
        listenerReload = harness.adapter.updateConfig(
          { maxBufferLength: 48 },
          { apply: 'reload' },
        )
      }
    })

    originalHls.emit(Events.ERROR, {
      type: ErrorTypes.NETWORK_ERROR,
      details: ErrorDetails.MANIFEST_LOAD_ERROR,
      fatal: true,
      error: new Error('old source failed'),
    })

    expect(listenerReload).toBeDefined()
    expect(harness.hlsInstances).toHaveLength(2)
    harness.hlsInstances[1].emit(Events.MANIFEST_PARSED, { levels: [] })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await listenerReload

    expect(errorCodes).toEqual(['MANIFEST_ERROR'])
    expect(harness.adapter.hlsInstance).toBe(harness.hlsInstances[1])
  })

  it('does not let an old level event pollute a reload started by its variant listener', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)
    const originalHls = harness.hlsInstances[0]
    originalHls.levels = [
      { id: 10, bitrate: 64_000, codecSet: 'mp4a.40.2' },
      { id: 20, bitrate: 128_000, codecSet: 'mp4a.40.2' },
    ]
    originalHls.emit(Events.MANIFEST_PARSED, { levels: [] })
    const variantChanges: AudioEngineEvents['variantchange'][] = []
    let listenerReload: Promise<void> | undefined
    let reloadedSelection: Promise<void> | undefined
    engine.on('variantchange', (variantChange) => {
      variantChanges.push(variantChange)
      if (variantChange.variantId === '20' && !listenerReload) {
        listenerReload = harness.adapter.updateConfig(
          { maxBufferLength: 50 },
          { apply: 'reload' },
        )
        const reloadedHls = harness.hlsInstances[1]
        reloadedHls.levels = [
          { id: 30, bitrate: 192_000, codecSet: 'mp4a.40.2' },
        ]
        reloadedHls.emit(Events.MANIFEST_PARSED, { levels: [] })
        reloadedSelection = engine.setAdaptiveQuality?.('30')
      }
    })

    await engine.setAdaptiveQuality?.('20')
    originalHls.emit(Events.LEVEL_SWITCHED, { level: 1 })

    expect(listenerReload).toBeDefined()
    expect(reloadedSelection).toBeDefined()
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await listenerReload
    await reloadedSelection
    harness.hlsInstances[1].emit(Events.LEVEL_SWITCHED, { level: 0 })

    expect(variantChanges).toMatchObject([
      {
        previousVariantId: undefined,
        variantId: '20',
        reason: 'manual',
      },
      {
        previousVariantId: undefined,
        variantId: '30',
        reason: 'manual',
      },
    ])
    expect(engine.getAdaptiveQualitySelection?.()).toBe('30')
  })

  it('retains a failed HLS teardown for retry before creating a replacement', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    await loadEngine(harness)
    const originalHls = harness.hlsInstances[0]
    const teardownError = new Error('hls destroy failed')
    originalHls.destroyError = teardownError

    await expect(harness.adapter.updateConfig(
      { maxBufferLength: 40 },
      { apply: 'reload' },
    )).rejects.toMatchObject({
      code: 'ADAPTIVE_STREAM_ERROR',
      cause: teardownError,
    })

    expect(originalHls.destroyCalls).toBe(1)
    expect(harness.hlsInstances).toHaveLength(1)
    expect(harness.adapter.hlsInstance).toBeUndefined()

    originalHls.destroyError = undefined
    const retry = harness.adapter.updateConfig(
      { backBufferLength: 12 },
      { apply: 'reload' },
    )
    await vi.waitFor(() => {
      expect(harness.hlsInstances).toHaveLength(2)
    })
    harness.hlsInstances[1].emit(Events.MANIFEST_PARSED, { levels: [] })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await retry

    expect(originalHls.destroyCalls).toBe(2)
    expect(harness.adapter.hlsInstance).toBe(harness.hlsInstances[1])
  })

  it('retries a failed HLS unload before the next source creates its instance', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await harness.adapter.createEngine()
    const closeSource = vi.fn(async () => {})
    const initialLoad = engine.load({
      kind: 'url',
      url: '/stream.m3u8',
      open: async () => ({ url: '/stream.m3u8' }),
      close: closeSource,
    })
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })
    harness.hlsInstances[0].emit(Events.MANIFEST_PARSED, { levels: [] })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await initialLoad
    const originalHls = harness.hlsInstances[0]
    const teardownError = new Error('hls destroy failed')
    originalHls.destroyError = teardownError

    expect(() => engine.unload()).toThrow(teardownError)
    expect(originalHls.destroyCalls).toBe(1)
    expect(harness.hlsInstances).toHaveLength(1)
    expect(harness.adapter.hlsInstance).toBeUndefined()

    await expect(engine.load(new HttpAudioSource('/blocked.m3u8'))).rejects.toBe(teardownError)
    expect(originalHls.destroyCalls).toBe(2)
    expect(harness.hlsInstances).toHaveLength(1)

    originalHls.destroyError = undefined
    const replacementLoad = engine.load(new HttpAudioSource('/replacement.m3u8'))
    await vi.waitFor(() => {
      expect(harness.hlsInstances).toHaveLength(2)
    })
    harness.hlsInstances[1].emit(Events.MANIFEST_PARSED, { levels: [] })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await replacementLoad

    expect(originalHls.destroyCalls).toBe(3)
    expect(harness.adapter.hlsInstance).toBe(harness.hlsInstances[1])
    expect(closeSource).toHaveBeenCalledOnce()
  })

  it('does not reload native playback when HLS config changes', async () => {
    const harness = adapterHarness({ strategy: 'native-only', nativeSupport: 'probably' })
    await loadEngine(harness)

    await harness.adapter.updateConfig({ maxBufferLength: 45 }, { apply: 'reload' })

    expect(harness.hlsInstances).toHaveLength(0)
    expect(harness.adapter.getConfig()).toMatchObject({ maxBufferLength: 45 })
  })

  it('destroys and hides a reload replacement when its manifest fails', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)

    const reload = harness.adapter.updateConfig({ maxBufferLength: 50 }, { apply: 'reload' })
    const reloadExpectation = expect(reload).rejects.toMatchObject({ code: 'MANIFEST_ERROR' })
    await Promise.resolve()
    const replacementHls = harness.hlsInstances.at(-1)
    replacementHls?.emit(Events.ERROR, {
      type: ErrorTypes.NETWORK_ERROR,
      details: ErrorDetails.MANIFEST_LOAD_ERROR,
      fatal: true,
      error: new Error('replacement failed'),
    })

    await reloadExpectation
    expect(replacementHls?.destroyCalls).toBe(1)
    expect(harness.adapter.hlsInstance).toBeUndefined()
    expect(engine.getActiveAdaptivePlayback?.()).toBeUndefined()
  })

  it('publishes one media error and rejects an HLS reload with the same error', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)
    const audioElement = harness.audioElements[0]
    const publishedErrors: AudioEngineEvents['error'][] = []
    engine.on('error', error => publishedErrors.push(error))

    const reload = harness.adapter.updateConfig({ maxBufferLength: 51 }, { apply: 'reload' })
    await vi.waitFor(() => {
      expect(harness.hlsInstances).toHaveLength(2)
    })
    audioElement.error = { code: 2, message: 'replacement media failed' } as MediaError
    audioElement.dispatchEvent(new Event('error'))
    const reloadError = await reload.then(
      () => undefined,
      (error: unknown) => error,
    )

    // AI modified: one browser failure has one public identity across event and promise channels.
    expect(publishedErrors).toHaveLength(1)
    expect(publishedErrors[0]).toMatchObject({ code: 'NETWORK_ERROR' })
    expect(reloadError).toBe(publishedErrors[0])
    expect(harness.hlsInstances[1].destroyCalls).toBe(1)
    expect(harness.adapter.hlsInstance).toBeUndefined()
    expect(engine.getActiveAdaptivePlayback?.()).toBeUndefined()
  })

  it('reuses a published media error when HLS position restoration fails', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)
    const audioElement = harness.audioElements[0]
    const publishedErrors: AudioEngineEvents['error'][] = []
    const addEventListener = vi.spyOn(audioElement, 'addEventListener')
    engine.on('error', error => publishedErrors.push(error))
    audioElement.currentTime = 37

    const reload = harness.adapter.updateConfig(
      { maxBufferLength: 52 },
      { apply: 'reload', restorePosition: true },
    )
    await vi.waitFor(() => {
      expect(harness.hlsInstances).toHaveLength(2)
    })
    harness.hlsInstances[1].emit(Events.MANIFEST_PARSED, { levels: [] })
    audioElement.seeking = true
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await vi.waitFor(() => {
      expect(addEventListener).toHaveBeenCalledWith(
        'seeked',
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    })
    audioElement.error = { code: 2, message: 'position restoration failed' } as MediaError
    audioElement.dispatchEvent(new Event('error'))
    const reloadError = await reload.then(
      () => undefined,
      (error: unknown) => error,
    )

    // AI modified: restoration failures retain one public identity across event and reload rejection.
    expect(publishedErrors).toHaveLength(1)
    expect(publishedErrors[0]).toMatchObject({ code: 'NETWORK_ERROR' })
    expect(reloadError).toBe(publishedErrors[0])
    expect(harness.adapter.hlsInstance).toBe(harness.hlsInstances[1])
  })

  it('destroys and hides a reload replacement when loadSource throws synchronously', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)
    const originalLoadSource = FakeHls.prototype.loadSource
    const sourceLoadError = new Error('replacement loadSource failed')
    vi.spyOn(FakeHls.prototype, 'loadSource').mockImplementation(function (this: FakeHls, url: string) {
      if (this !== harness.hlsInstances[0]) {
        throw sourceLoadError
      }
      originalLoadSource.call(this, url)
    })

    await expect(harness.adapter.updateConfig(
      { maxBufferLength: 51 },
      { apply: 'reload' },
    )).rejects.toMatchObject({
      code: 'ADAPTIVE_STREAM_ERROR',
      cause: sourceLoadError,
    })

    const replacementHls = harness.hlsInstances[1]
    expect(replacementHls.destroyCalls).toBe(1)
    expect(harness.adapter.hlsInstance).toBeUndefined()
    expect(engine.getActiveAdaptivePlayback?.()).toBeUndefined()
  })

  it('preserves a manifest error while retaining failed replacement cleanup for disposal retry', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)
    const reload = harness.adapter.updateConfig({ maxBufferLength: 52 }, { apply: 'reload' })
    const reloadExpectation = expect(reload).rejects.toMatchObject({ code: 'MANIFEST_ERROR' })
    await vi.waitFor(() => {
      expect(harness.hlsInstances).toHaveLength(2)
    })
    const replacementHls = harness.hlsInstances[1]
    const cleanupError = new Error('replacement cleanup failed')
    replacementHls.destroyError = cleanupError

    replacementHls.emit(Events.ERROR, {
      type: ErrorTypes.NETWORK_ERROR,
      details: ErrorDetails.MANIFEST_LOAD_ERROR,
      fatal: true,
      error: new Error('replacement manifest failed'),
    })

    await reloadExpectation
    expect(replacementHls.destroyCalls).toBe(1)
    expect(harness.adapter.hlsInstance).toBeUndefined()
    expect(engine.getActiveAdaptivePlayback?.()).toBeUndefined()

    replacementHls.destroyError = undefined
    expect(() => engine.dispose()).not.toThrow()
    expect(replacementHls.destroyCalls).toBe(2)
  })

  it.each(['seek', 'play'] as const)(
    'keeps a valid reload replacement when %s restoration fails after metadata',
    async (restoration) => {
      const harness = adapterHarness({ strategy: 'hls-only' })
      const engine = await loadEngine(harness)
      const restorationError = new Error(`${restoration} restoration failed`)
      if (restoration === 'seek') {
        vi.spyOn(engine, 'seek').mockRejectedValue(restorationError)
      }
      else {
        vi.spyOn(engine, 'play').mockRejectedValue(restorationError)
      }

      const reload = harness.adapter.updateConfig(
        { maxBufferLength: restoration === 'seek' ? 53 : 54 },
        {
          apply: 'reload',
          restorePosition: restoration === 'seek',
          resumePlayback: restoration === 'play',
        },
      )
      await vi.waitFor(() => {
        expect(harness.hlsInstances).toHaveLength(2)
      })
      const replacementHls = harness.hlsInstances[1]
      replacementHls.emit(Events.MANIFEST_PARSED, { levels: [] })
      harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))

      await expect(reload).rejects.toMatchObject({
        code: 'ADAPTIVE_STREAM_ERROR',
        cause: restorationError,
      })
      expect(replacementHls.destroyCalls).toBe(0)
      expect(harness.adapter.hlsInstance).toBe(replacementHls)
      expect(engine.getActiveAdaptivePlayback?.()).toEqual({
        protocol: 'hls',
        implementation: 'hls.js',
      })
    },
  )

  it('releases HLS adapter ownership when vendor disposal throws', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await harness.adapter.createEngine()
    const closeSource = vi.fn(async () => {})
    const load = engine.load({
      kind: 'url',
      url: '/stream.m3u8',
      open: async () => ({ url: '/stream.m3u8' }),
      close: closeSource,
    })
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })
    harness.hlsInstances[0].emit(Events.MANIFEST_PARSED, { levels: [] })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await load
    const disposalError = new Error('hls destroy failed')
    harness.hlsInstances[0].destroyError = disposalError

    expect(() => engine.dispose()).toThrow(disposalError)

    expect(harness.adapter.hlsInstance).toBeUndefined()
    expect(harness.adapter.implementation).toBeUndefined()

    harness.hlsInstances[0].destroyError = undefined
    expect(() => engine.dispose()).not.toThrow()
    expect(harness.hlsInstances[0].destroyCalls).toBe(2)
    expect(harness.adapter.hlsInstance).toBeUndefined()
    expect(closeSource).toHaveBeenCalledOnce()
  })

  it('retries source cleanup even while repeated HLS disposal still fails', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await harness.adapter.createEngine()
    const sourceCloseError = new Error('source close failed')
    let closeAttempts = 0
    const closeSource = vi.fn((): Promise<void> => {
      closeAttempts += 1
      if (closeAttempts === 1) {
        throw sourceCloseError
      }
      return Promise.resolve()
    })
    const load = engine.load({
      kind: 'url',
      url: '/stream.m3u8',
      open: async () => ({ url: '/stream.m3u8' }),
      close: closeSource,
    })
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })
    harness.hlsInstances[0].emit(Events.MANIFEST_PARSED, { levels: [] })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await load
    const hls = harness.hlsInstances[0]
    const vendorCleanupError = new Error('hls destroy failed')
    hls.destroyError = vendorCleanupError

    expect(() => engine.dispose()).toThrow(vendorCleanupError)
    expect(hls.destroyCalls).toBe(1)
    expect(closeSource).toHaveBeenCalledOnce()
    const browserLoadCalls = harness.audioElements[0].loadCalls

    // AI modified: a repeated vendor failure cannot short-circuit the base source retry.
    expect(() => engine.dispose()).toThrow(vendorCleanupError)
    await Promise.resolve()
    expect(hls.destroyCalls).toBe(2)
    expect(closeSource).toHaveBeenCalledTimes(2)
    expect(harness.audioElements[0].loadCalls).toBe(browserLoadCalls)

    hls.destroyError = undefined
    expect(() => engine.dispose()).not.toThrow()
    expect(hls.destroyCalls).toBe(3)
    expect(closeSource).toHaveBeenCalledTimes(2)
    expect(harness.audioElements[0].loadCalls).toBe(browserLoadCalls)
  })

  it('independently retries simultaneous HLS and native detachment failures', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = await loadEngine(harness)
    const hls = harness.hlsInstances[0]
    const audioElement = harness.audioElements[0]
    const vendorCleanupError = new Error('hls destroy failed')
    const nativeCleanupError = new Error('native detach failed')
    hls.destroyError = vendorCleanupError
    const removeAttribute = audioElement.removeAttribute.bind(audioElement)
    let nativeFailuresRemaining = 1
    const removeAttributeSpy = vi.spyOn(audioElement, 'removeAttribute').mockImplementation((name) => {
      if (nativeFailuresRemaining > 0) {
        nativeFailuresRemaining -= 1
        throw nativeCleanupError
      }
      removeAttribute(name)
    })

    expect(() => engine.dispose()).toThrow(vendorCleanupError)
    expect(hls.destroyCalls).toBe(1)
    expect(removeAttributeSpy).toHaveBeenCalledOnce()

    hls.destroyError = undefined
    expect(() => engine.dispose()).not.toThrow()
    expect(hls.destroyCalls).toBe(2)
    expect(removeAttributeSpy).toHaveBeenCalledTimes(2)
    const browserLoadCallsAfterCleanup = audioElement.loadCalls

    engine.dispose()
    expect(hls.destroyCalls).toBe(2)
    expect(removeAttributeSpy).toHaveBeenCalledTimes(2)
    expect(audioElement.loadCalls).toBe(browserLoadCallsAfterCleanup)
  })
})
