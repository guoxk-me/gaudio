import type Hls from 'hls.js'
import type { HlsConfig } from 'hls.js'
import type { AudioEngineEvents } from '../../engine/audio-engine'
import type { HlsAdapterConfig } from './hls-audio-adapter'
import { ErrorDetails, ErrorTypes, Events } from 'hls.js'
import { describe, expect, it } from 'vitest'
import { HttpAudioSource } from '../../source/http-audio-source'
import { FakeAudioElement } from '../../test-support/fake-media'
import { AdaptivePlaybackPreset } from '../adaptive-audio-types'
import { HlsAudioAdapterImpl } from './hls-audio-adapter'

type HlsListener = (event: Events, payload: unknown) => void

class FakeHls {
  readonly listeners = new Map<Events, HlsListener[]>()
  readonly loadedSources: string[] = []
  levels: Array<{ id: number, bitrate: number, codecSet: string }> = []
  attachedMedia?: HTMLMediaElement
  destroyCalls = 0

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
  }

  destroy(): void {
    this.destroyCalls += 1
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
}

function adapterHarness(options: {
  strategy?: 'native-first' | 'hls-first' | 'native-only' | 'hls-only'
  nativeSupport?: CanPlayTypeResult
  hlsSupport?: boolean
  config?: HlsAdapterConfig
  preset?: AdaptivePlaybackPreset
} = {}): AdapterHarness {
  const audioElements: FakeAudioElement[] = []
  const hlsInstances: FakeHls[] = []
  const adapter = new HlsAudioAdapterImpl({
    playbackStrategy: options.strategy,
    config: options.config,
    preset: options.preset,
  }, {
    audioElementFactory: () => {
      const audioElement = new FakeAudioElement({ nativeHlsSupport: options.nativeSupport })
      audioElements.push(audioElement)
      return audioElement as unknown as HTMLAudioElement
    },
    createHls: (config) => {
      const hls = new FakeHls(config)
      hlsInstances.push(hls)
      return hls as unknown as Hls
    },
    isHlsSupported: () => options.hlsSupport ?? true,
  })

  return { adapter, audioElements, hlsInstances }
}

async function loadEngine(harness: AdapterHarness, url = '/stream.m3u8') {
  const engine = harness.adapter.createEngine()
  const load = engine.load(new HttpAudioSource(url))
  await Promise.resolve()
  harness.audioElements.at(-1)?.dispatchEvent(new Event('loadedmetadata'))
  await load
  return engine
}

describe('hlsAudioAdapter', () => {
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

  it.each([
    ['native-only', '', true],
    ['hls-only', 'probably', false],
  ] as const)('rejects unsupported %s playback', (strategy, nativeSupport, hlsSupport) => {
    const harness = adapterHarness({ strategy, nativeSupport, hlsSupport })

    expect(() => harness.adapter.createEngine()).toThrowError(expect.objectContaining({
      code: 'PROTOCOL_UNSUPPORTED',
    }))
  })

  it('translates manifest, variant, segment, and recoverable error events', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = harness.adapter.createEngine()
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
    await Promise.resolve()
    const hls = harness.hlsInstances[0]
    hls.levels = [
      { id: 0, bitrate: 64_000, codecSet: 'mp4a.40.2' },
      { id: 1, bitrate: 128_000, codecSet: 'mp4a.40.2' },
    ]
    hls.emit(Events.MANIFEST_LOADED, {
      url: '/stream.m3u8',
      levels: [
        { id: 0, bitrate: 64_000, audioCodec: 'mp4a.40.2' },
        { id: 1, bitrate: 128_000, audioCodec: 'mp4a.40.2' },
      ],
    })
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

  it.each([
    [ErrorDetails.MANIFEST_LOAD_ERROR, 'MANIFEST_ERROR'],
    [ErrorDetails.FRAG_LOAD_ERROR, 'SEGMENT_ERROR'],
    [ErrorDetails.BUFFER_APPEND_ERROR, 'ADAPTIVE_STREAM_ERROR'],
  ] as const)('publishes fatal %s errors as %s', async (details, errorCode) => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    const engine = harness.adapter.createEngine()
    const errorCodes: string[] = []
    engine.on('error', error => errorCodes.push(error.code))
    const load = engine.load(new HttpAudioSource('/stream.m3u8'))
    const loadExpectation = expect(load).rejects.toMatchObject({ code: errorCode })
    await Promise.resolve()

    harness.hlsInstances[0].emit(Events.ERROR, {
      type: ErrorTypes.NETWORK_ERROR,
      details,
      fatal: true,
      error: new Error('fatal'),
    })
    await loadExpectation

    expect(errorCodes).toEqual([errorCode])
  })

  it('stores next-load config and explicitly reloads active hls.js playback', async () => {
    const harness = adapterHarness({
      strategy: 'hls-only',
      config: { maxBufferLength: 20 },
    })
    const engine = await loadEngine(harness)
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
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await reload

    expect(harness.hlsInstances).toHaveLength(2)
    expect(harness.hlsInstances[0].destroyCalls).toBe(1)
    expect(audioElement.currentTime).toBe(42)
    expect(audioElement.playCalls).toBe(1)
    expect(harness.adapter.getConfig()).toMatchObject({ maxBufferLength: 30, backBufferLength: 15 })

    engine.dispose()
  })

  it('does not reload native playback when HLS config changes', async () => {
    const harness = adapterHarness({ strategy: 'native-only', nativeSupport: 'probably' })
    await loadEngine(harness)

    await harness.adapter.updateConfig({ maxBufferLength: 45 }, { apply: 'reload' })

    expect(harness.hlsInstances).toHaveLength(0)
    expect(harness.adapter.getConfig()).toMatchObject({ maxBufferLength: 45 })
  })

  it('rejects an HLS config reload when the replacement manifest fails', async () => {
    const harness = adapterHarness({ strategy: 'hls-only' })
    await loadEngine(harness)

    const reload = harness.adapter.updateConfig({ maxBufferLength: 50 }, { apply: 'reload' })
    const reloadExpectation = expect(reload).rejects.toMatchObject({ code: 'MANIFEST_ERROR' })
    await Promise.resolve()
    harness.hlsInstances.at(-1)?.emit(Events.ERROR, {
      type: ErrorTypes.NETWORK_ERROR,
      details: ErrorDetails.MANIFEST_LOAD_ERROR,
      fatal: true,
      error: new Error('replacement failed'),
    })

    await reloadExpectation
  })
})
