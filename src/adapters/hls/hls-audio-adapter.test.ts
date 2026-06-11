import type Hls from 'hls.js'
import type { HlsConfig } from 'hls.js'
import type { AudioEngineEvents } from '../../engine/audio-engine'
import { ErrorDetails, ErrorTypes, Events } from 'hls.js'
import { describe, expect, it } from 'vitest'
import { HttpAudioSource } from '../../source/http-audio-source'
import { HlsAudioAdapterImpl } from './hls-audio-adapter'

class FakeTimeRanges implements TimeRanges {
  get length(): number {
    return 0
  }

  start(_index: number): number {
    throw new DOMException('Index out of bounds', 'IndexSizeError')
  }

  end(_index: number): number {
    throw new DOMException('Index out of bounds', 'IndexSizeError')
  }
}

class FakeAudioElement extends EventTarget {
  src = ''
  preload = 'metadata'
  volume = 1
  muted = false
  loop = false
  autoplay = false
  preservesPitch = true
  playbackRate = 1
  currentTime = 0
  duration = 120
  paused = true
  ended = false
  seeking = false
  buffered: TimeRanges = new FakeTimeRanges()
  seekable: TimeRanges = new FakeTimeRanges()
  played: TimeRanges = new FakeTimeRanges()
  error: MediaError | null = null
  loadCalls = 0
  playCalls = 0

  constructor(private readonly nativeHlsSupport: CanPlayTypeResult = '') {
    super()
  }

  load(): void {
    this.loadCalls += 1
  }

  async play(): Promise<void> {
    this.playCalls += 1
    this.paused = false
  }

  pause(): void {
    this.paused = true
  }

  canPlayType(mimeType: string): CanPlayTypeResult {
    return mimeType.includes('mpegurl') ? this.nativeHlsSupport : ''
  }

  removeAttribute(name: string): void {
    if (name === 'src') {
      this.src = ''
    }
  }
}

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
  config?: Partial<HlsConfig>
} = {}): AdapterHarness {
  const audioElements: FakeAudioElement[] = []
  const hlsInstances: FakeHls[] = []
  const adapter = new HlsAudioAdapterImpl({
    playbackStrategy: options.strategy,
    config: options.config,
  }, {
    audioElementFactory: () => {
      const audioElement = new FakeAudioElement(options.nativeSupport)
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
    await Promise.resolve()

    harness.hlsInstances[0].emit(Events.ERROR, {
      type: ErrorTypes.NETWORK_ERROR,
      details,
      fatal: true,
      error: new Error('fatal'),
    })
    harness.audioElements.at(-1)?.dispatchEvent(new Event('loadedmetadata'))
    await load

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
})
