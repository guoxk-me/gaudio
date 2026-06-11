import type {
  MediaPlayerClass,
  MediaPlayerEvents,
  MediaPlayerSettingClass,
  Representation,
} from 'dashjs'
import type { AudioEngineEvents } from '../../engine/audio-engine'
import { describe, expect, it } from 'vitest'
import { HttpAudioSource } from '../../source/http-audio-source'
import { DashAudioAdapterImpl } from './dash-audio-adapter'

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

  load(): void {}
  async play(): Promise<void> {
    this.paused = false
  }

  pause(): void {
    this.paused = true
  }

  canPlayType(_mimeType: string): CanPlayTypeResult {
    return ''
  }

  removeAttribute(name: string): void {
    if (name === 'src') {
      this.src = ''
    }
  }
}

type DashListener = (payload: unknown) => void

const dashEvents: MediaPlayerEvents = {
  ERROR: 'error',
  FRAGMENT_LOADING_COMPLETED: 'fragmentLoadingCompleted',
  FRAGMENT_LOADING_STARTED: 'fragmentLoadingStarted',
  MANIFEST_LOADED: 'manifestLoaded',
  QUALITY_CHANGE_RENDERED: 'qualityChangeRendered',
} as MediaPlayerEvents

class FakeDashPlayer {
  readonly listeners = new Map<string, DashListener[]>()
  readonly initializeCalls: Array<{ media: HTMLMediaElement, url: string, autoplay: boolean }> = []
  readonly settingsUpdates: MediaPlayerSettingClass[] = []
  representations: Representation[] = []
  resetCalls = 0

  initialize(media: HTMLMediaElement, url: string, autoplay: boolean): void {
    this.initializeCalls.push({ media, url, autoplay })
  }

  on(eventName: string, listener: DashListener): void {
    const listeners = this.listeners.get(eventName) ?? []
    listeners.push(listener)
    this.listeners.set(eventName, listeners)
  }

  updateSettings(settings: MediaPlayerSettingClass): void {
    this.settingsUpdates.push(settings)
  }

  getRepresentationsByType(_type: string): Representation[] {
    return this.representations
  }

  reset(): void {
    this.resetCalls += 1
  }

  emit(eventName: string, payload: unknown): void {
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener(payload)
    }
  }
}

interface DashHarness {
  adapter: DashAudioAdapterImpl
  audioElements: FakeAudioElement[]
  dashPlayers: FakeDashPlayer[]
}

function dashHarness(options: {
  supported?: boolean
  settings?: MediaPlayerSettingClass
} = {}): DashHarness {
  const audioElements: FakeAudioElement[] = []
  const dashPlayers: FakeDashPlayer[] = []
  const adapter = new DashAudioAdapterImpl({ settings: options.settings }, {
    audioElementFactory: () => {
      const audioElement = new FakeAudioElement()
      audioElements.push(audioElement)
      return audioElement as unknown as HTMLAudioElement
    },
    createDashPlayer: () => {
      const dashPlayer = new FakeDashPlayer()
      dashPlayers.push(dashPlayer)
      return dashPlayer as unknown as MediaPlayerClass
    },
    events: dashEvents,
    isDashSupported: () => options.supported ?? true,
  })

  return { adapter, audioElements, dashPlayers }
}

async function loadDashEngine(harness: DashHarness) {
  const engine = harness.adapter.createEngine()
  const load = engine.load(new HttpAudioSource('/stream.mpd'))
  await Promise.resolve()
  harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
  await load
  return engine
}

describe('dashAudioAdapter', () => {
  it('initializes dash.js with autoplay disabled and exposes its instance', async () => {
    const harness = dashHarness()
    const engine = await loadDashEngine(harness)

    expect(harness.adapter.dashInstance).toBe(harness.dashPlayers[0])
    expect(harness.dashPlayers[0].initializeCalls[0]).toMatchObject({
      url: '/stream.mpd',
      autoplay: false,
    })

    engine.dispose()
    expect(harness.dashPlayers[0].resetCalls).toBe(1)
    expect(harness.adapter.dashInstance).toBeUndefined()
  })

  it('rejects unsupported browsers', () => {
    const harness = dashHarness({ supported: false })

    expect(harness.adapter.isSupported()).toBe(false)
    expect(() => harness.adapter.createEngine()).toThrowError(expect.objectContaining({
      code: 'PROTOCOL_UNSUPPORTED',
    }))
  })

  it('stores deeply merged settings and updates the active player', async () => {
    const harness = dashHarness({
      settings: {
        streaming: {
          buffer: {
            bufferTimeDefault: 20,
            bufferTimeAtTopQuality: 30,
          },
        },
      },
    })

    harness.adapter.updateSettings({
      streaming: {
        buffer: {
          bufferTimeDefault: 40,
        },
      },
    })
    const engine = await loadDashEngine(harness)

    expect(harness.dashPlayers[0].settingsUpdates[0]).toMatchObject({
      streaming: {
        buffer: {
          bufferTimeDefault: 40,
          bufferTimeAtTopQuality: 30,
        },
      },
    })

    harness.adapter.updateSettings({
      streaming: {
        buffer: {
          bufferTimeAtTopQuality: 60,
        },
      },
    })

    expect(harness.dashPlayers[0].settingsUpdates.at(-1)).toMatchObject({
      streaming: {
        buffer: {
          bufferTimeAtTopQuality: 60,
        },
      },
    })
    expect(harness.adapter.getSettings()).toMatchObject({
      streaming: {
        buffer: {
          bufferTimeDefault: 40,
          bufferTimeAtTopQuality: 60,
        },
      },
    })

    engine.dispose()
  })

  it('translates manifest, quality, segment, and recoverable errors', async () => {
    const harness = dashHarness()
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

    const load = engine.load(new HttpAudioSource('/stream.mpd'))
    await Promise.resolve()
    const dashPlayer = harness.dashPlayers[0]
    dashPlayer.representations = [
      { id: 'audio-64', bandwidth: 64_000, codecs: 'mp4a.40.2' } as Representation,
      { id: 'audio-128', bandwidth: 128_000, codecs: 'mp4a.40.2' } as Representation,
    ]
    dashPlayer.emit(dashEvents.MANIFEST_LOADED, { data: {} })
    dashPlayer.emit(dashEvents.QUALITY_CHANGE_RENDERED, {
      mediaType: 'audio',
      oldRepresentation: dashPlayer.representations[0],
      newRepresentation: dashPlayer.representations[1],
    })
    const request = {
      url: '/segment-1.m4s',
      representationId: 'audio-128',
      duration: 4,
      mediaType: 'audio',
    }
    dashPlayer.emit(dashEvents.FRAGMENT_LOADING_STARTED, { request })
    dashPlayer.emit(dashEvents.FRAGMENT_LOADING_COMPLETED, { request })
    dashPlayer.emit(dashEvents.ERROR, {
      error: 'download',
      event: { id: 'content', url: '/segment-1.m4s' },
    })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await load

    expect(manifests[0]).toMatchObject({
      protocol: 'dash',
      implementation: 'dash.js',
      url: '/stream.mpd',
      variants: [
        { id: 'audio-64', bitrate: 64_000, codecs: 'mp4a.40.2' },
        { id: 'audio-128', bitrate: 128_000, codecs: 'mp4a.40.2' },
      ],
    })
    expect(variants[0]).toMatchObject({
      previousVariantId: 'audio-64',
      variantId: 'audio-128',
      bitrate: 128_000,
      reason: 'automatic',
    })
    expect(segmentStarts[0]).toMatchObject({ url: '/segment-1.m4s', variantId: 'audio-128', duration: 4 })
    expect(segmentLoads[0]).toMatchObject({ url: '/segment-1.m4s', variantId: 'audio-128', duration: 4 })
    expect(streamErrors[0]).toMatchObject({ category: 'segment', isFatal: false })
    expect(fatalErrors).toEqual([])
  })

  it('publishes fatal manifest errors', async () => {
    const harness = dashHarness()
    const engine = harness.adapter.createEngine()
    const errorCodes: string[] = []
    engine.on('error', error => errorCodes.push(error.code))
    const load = engine.load(new HttpAudioSource('/stream.mpd'))
    await Promise.resolve()

    harness.dashPlayers[0].emit(dashEvents.ERROR, {
      error: 'manifestError',
      event: { id: 'parse', message: 'invalid manifest' },
    })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await load

    expect(errorCodes).toEqual(['MANIFEST_ERROR'])
  })
})
