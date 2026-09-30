import type {
  MediaPlayerClass,
  MediaPlayerEvents,
  MediaPlayerSettingClass,
  Representation,
} from 'dashjs'
import type { AudioEngineEvents } from '../../engine/audio-engine'
import type { DashErrorCodes } from './dash-audio-engine'
import type { DashSettingsChanges } from './index'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { HttpAudioSource } from '../../source/http-audio-source'
import { FakeAudioElement } from '../../test-support/fake-media'
import { AdaptivePlaybackPreset } from '../adaptive-audio-types'
import { settingsWithChanges } from '../settings-with-changes'
import { DashAudioAdapterImpl } from './dash-audio-adapter'
import { createDashAdapter } from './index'

type DashListener = (payload: unknown) => void

const dashEvents: MediaPlayerEvents = {
  ERROR: 'error',
  FRAGMENT_LOADING_COMPLETED: 'fragmentLoadingCompleted',
  FRAGMENT_LOADING_STARTED: 'fragmentLoadingStarted',
  MANIFEST_LOADED: 'manifestLoaded',
  QUALITY_CHANGE_RENDERED: 'qualityChangeRendered',
  STREAM_INITIALIZED: 'streamInitialized',
  STREAM_UPDATED: 'streamUpdated',
} as MediaPlayerEvents

const dashErrorCodes = {
  DOWNLOAD_ERROR_ID_CONTENT_CODE: 27,
  DOWNLOAD_ERROR_ID_INITIALIZATION_CODE: 28,
  DOWNLOAD_ERROR_ID_MANIFEST_CODE: 25,
  DOWNLOAD_ERROR_ID_SIDX_CODE: 26,
  DOWNLOAD_ERROR_ID_XLINK_CODE: 29,
  FRAGMENT_LOADER_LOADING_FAILURE_ERROR_CODE: 17,
  FRAGMENT_LOADER_NULL_REQUEST_ERROR_CODE: 18,
  MANIFEST_ERROR_ID_MULTIPLEXED_CODE: 34,
  MANIFEST_ERROR_ID_NOSTREAMS_CODE: 32,
  MANIFEST_ERROR_ID_PARSE_CODE: 31,
  MANIFEST_LOADER_LOADING_FAILURE_ERROR_CODE: 11,
  MANIFEST_LOADER_PARSING_FAILURE_ERROR_CODE: 10,
  SEGMENT_BASE_LOADER_ERROR_CODE: 15,
  TIME_SYNC_FAILED_ERROR_CODE: 16,
  XLINK_LOADER_LOADING_FAILURE_ERROR_CODE: 12,
} as const satisfies DashErrorCodes

class FakeDashPlayer {
  readonly listeners = new Map<string, DashListener[]>()
  readonly initializeCalls: Array<{ media: HTMLMediaElement, url: string, autoplay: boolean }> = []
  readonly settingsUpdates: MediaPlayerSettingClass[] = []
  readonly representationSelections: Array<{ type: string, id: string, shouldSwitch: boolean }> = []
  representations: Representation[] = []
  activeStreamId = 'stream-1'
  currentRepresentation: Representation | null = null
  private settings: MediaPlayerSettingClass = {}
  resetCalls = 0
  resetError?: Error
  initializationError?: unknown
  representationSelectionError?: Error

  initialize(media: HTMLMediaElement, url: string, autoplay: boolean): void {
    this.initializeCalls.push({ media, url, autoplay })
    if (this.initializationError) {
      this.emit(dashEvents.ERROR, this.initializationError)
    }
  }

  on(eventName: string, listener: DashListener): void {
    const listeners = this.listeners.get(eventName) ?? []
    listeners.push(listener)
    this.listeners.set(eventName, listeners)
  }

  updateSettings(settings: MediaPlayerSettingClass): void {
    this.settingsUpdates.push(settings)
    this.settings = settingsWithChanges(this.settings, settings)
  }

  getSettings(): MediaPlayerSettingClass {
    return settingsWithChanges({}, this.settings)
  }

  getCurrentRepresentationForType(_type: string): Representation | null {
    return this.currentRepresentation
  }

  getRepresentationsByType(_type: string): Representation[] {
    return this.representations
  }

  getActiveStream(): { getStreamId: () => string } {
    return { getStreamId: () => this.activeStreamId }
  }

  setRepresentationForTypeById(type: string, id: string, shouldSwitch: boolean): void {
    this.representationSelections.push({ type, id, shouldSwitch })
    if (this.representationSelectionError) {
      throw this.representationSelectionError
    }
  }

  reset(): void {
    this.resetCalls += 1
    if (this.resetError) {
      throw this.resetError
    }
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
  contentType?: 'vod' | 'long-form' | 'live'
  settings?: DashSettingsChanges
  preset?: AdaptivePlaybackPreset
  initializationError?: unknown
} = {}): DashHarness {
  const audioElements: FakeAudioElement[] = []
  const dashPlayers: FakeDashPlayer[] = []
  const adapter = new DashAudioAdapterImpl({
    contentType: options.contentType,
    settings: options.settings,
    preset: options.preset,
  }, {
    audioElementFactory: () => {
      const audioElement = new FakeAudioElement()
      audioElements.push(audioElement)
      return audioElement as unknown as HTMLAudioElement
    },
    loadDashRuntime: () => ({
      createDashPlayer: () => {
        const dashPlayer = new FakeDashPlayer()
        dashPlayer.initializationError = options.initializationError
        dashPlayers.push(dashPlayer)
        return dashPlayer as unknown as MediaPlayerClass
      },
      events: dashEvents,
      errorCodes: dashErrorCodes,
    }),
    isDashSupported: () => options.supported ?? true,
  })

  return { adapter, audioElements, dashPlayers }
}

async function loadDashEngine(harness: DashHarness) {
  const engine = await harness.adapter.createEngine()
  const load = engine.load(new HttpAudioSource('/stream.mpd'))
  await vi.waitFor(() => {
    expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
  })
  harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
  await load
  return engine
}

describe('dashAudioAdapter', () => {
  afterEach(() => {
    vi.doUnmock('dashjs')
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
    const runtimeLoadError = new Error('temporary DASH chunk failure')
    vi.doMock('dashjs', () => {
      throw runtimeLoadError
    })
    const adapter = createDashAdapter()

    await expect(adapter.createEngine()).rejects.toMatchObject({
      code: 'ADAPTER_UNAVAILABLE',
    })

    vi.doUnmock('dashjs')
    let runtimeLoadCalls = 0
    vi.doMock('dashjs', () => {
      runtimeLoadCalls += 1
      return {
        MediaPlayer: Object.assign(
          () => ({
            create: () => new FakeDashPlayer(),
          }),
          { events: dashEvents, errors: dashErrorCodes },
        ),
      }
    })

    const [firstEngine, secondEngine] = await Promise.all([
      adapter.createEngine(),
      adapter.createEngine(),
    ])

    expect(runtimeLoadCalls).toBe(1)
    expect(firstEngine.getActiveAdaptivePlayback?.()).toBeUndefined()
    firstEngine.dispose()
    secondEngine.dispose()
  })

  it.each([
    [AdaptivePlaybackPreset.FastStart, 8, 12, 20, 15, 5, 0.95, 3, 8_000, 15_000, 2, 30],
    [AdaptivePlaybackPreset.Balanced, 18, 30, 60, 30, 10, 0.9, 4, 10_000, 20_000, 3, 60],
    [AdaptivePlaybackPreset.Stable, 30, 60, 120, 60, 15, 0.8, 6, 15_000, 30_000, 5, 120],
  ] as const)(
    'applies the %s audio VOD preset',
    (preset, bufferTimeDefault, bufferTimeAtTopQuality, bufferTimeAtTopQualityLongForm, bufferToKeep, bufferPruningInterval, bandwidthSafetyFactor, vodSamples, manifestRequestTimeout, fragmentRequestTimeout, requestAttempts, blacklistExpiryTime) => {
      const harness = dashHarness({ preset })
      const settings = harness.adapter.getSettings()

      expect(settings).toMatchObject({
        streaming: {
          buffer: {
            bufferTimeDefault,
            bufferTimeAtTopQuality,
            bufferTimeAtTopQualityLongForm,
            bufferToKeep,
            bufferPruningInterval,
          },
          scheduling: {
            scheduleWhilePaused: true,
          },
          abr: {
            throughput: {
              bandwidthSafetyFactor,
              sampleSettings: { vod: vodSamples },
            },
          },
          manifestRequestTimeout,
          fragmentRequestTimeout,
          retryAttempts: {
            MPD: requestAttempts,
            MediaSegment: requestAttempts,
          },
          blacklistExpiryTime,
        },
      })
    },
  )

  it('provides a complete balanced DASH audio VOD baseline', () => {
    const settings = dashHarness().adapter.getSettings()

    expect(settings).toMatchObject({
      streaming: {
        abandonLoadTimeout: 10_000,
        cacheInitSegments: true,
        cacheInitSegmentsLimit: 20,
        enableManifestDurationMismatchFix: true,
        capabilities: {
          useMediaCapabilitiesApi: true,
          filterAudioChannelConfiguration: false,
        },
        buffer: {
          fastSwitchEnabled: true,
          flushBufferAtTrackSwitch: false,
          reuseExistingSourceBuffers: true,
          longFormContentDurationThreshold: 600,
          stallThreshold: 0.3,
          useAppendWindow: true,
          setStallState: true,
          avoidCurrentTimeRangePruning: false,
          useChangeType: true,
          mediaSourceDurationInfinity: true,
          resetSourceBuffersForTrackSwitch: false,
          syntheticStallEvents: { enabled: false, ignoreReadyState: false },
        },
        gaps: {
          jumpGaps: true,
          jumpLargeGaps: true,
          smallGapLimit: 1.5,
          threshold: 0.3,
          enableSeekFix: true,
          enableStallFix: true,
          stallSeek: 0.1,
          seekOffset: 0,
        },
        scheduling: { defaultTimeout: 500, scheduleWhilePaused: true },
        lastBitrateCachingInfo: { enabled: true, ttl: 360_000 },
        lastMediaSettingsCachingInfo: { enabled: true, ttl: 360_000 },
        saveLastMediaSettingsForCurrentStreamingSession: true,
        cacheLoadThresholds: { audio: 5 },
        trackSwitchMode: { audio: 'alwaysReplace' },
        includePreselectionsForInitialTrackSelection: false,
        ignoreSelectionPriority: false,
        prioritizeRoleMain: true,
        assumeDefaultRoleAsMain: true,
        fragmentRequestProgressTimeout: 12_000,
        retryIntervals: {
          MPD: 500,
          MediaSegment: 1_000,
          InitializationSegment: 1_000,
          IndexSegment: 1_000,
        },
        abr: {
          rules: {
            throughputRule: { active: true },
            bolaRule: { active: true },
            insufficientBufferRule: {
              active: true,
              parameters: { throughputSafetyFactor: 0.7, segmentIgnoreCount: 2 },
            },
            switchHistoryRule: { active: true },
            droppedFramesRule: { active: false },
            abandonRequestsRule: { active: true },
            l2ARule: { active: false },
            loLPRule: { active: false },
          },
          throughput: {
            averageCalculationMode: 'throughputCalculationModeEwma',
            useResourceTimingApi: true,
            useNetworkInformationApi: { xhr: false, fetch: false },
            useDeadTimeLatency: true,
          },
          maxBitrate: { audio: -1 },
          minBitrate: { audio: -1 },
          initialBitrate: { audio: -1 },
          autoSwitchBitrate: { audio: true },
        },
      },
      errors: { recoverAttempts: { mediaErrorDecode: 5 } },
    })
    for (const excludedSetting of ['delay', 'protection', 'text', 'liveCatchup', 'cmcd', 'cmsd', 'enhancement']) {
      expect(settings.streaming).not.toHaveProperty(excludedSetting)
    }
    expect(settings.streaming?.abr?.maxBitrate).not.toHaveProperty('video')
    expect(settings.streaming?.abr?.autoSwitchBitrate).not.toHaveProperty('video')
  })

  it('uses the balanced preset by default and deeply applies caller settings', () => {
    const harness = dashHarness({
      settings: {
        streaming: {
          buffer: {
            bufferTimeDefault: 24,
          },
        },
      },
    })

    expect(harness.adapter.getSettings()).toMatchObject({
      streaming: {
        buffer: {
          bufferTimeDefault: 24,
          bufferTimeAtTopQuality: 30,
          bufferTimeAtTopQualityLongForm: 60,
        },
        scheduling: {
          scheduleWhilePaused: true,
        },
      },
    })
  })

  it('applies the DASH long-form audio profile for extended playback', () => {
    const settings = dashHarness({ contentType: 'long-form' }).adapter.getSettings()

    expect(settings).toMatchObject({
      streaming: {
        buffer: {
          bufferTimeDefault: 45,
          bufferTimeAtTopQuality: 90,
          bufferTimeAtTopQualityLongForm: 180,
          bufferToKeep: 180,
          longFormContentDurationThreshold: 120,
        },
        fragmentRequestTimeout: 60_000,
        fragmentRequestProgressTimeout: 30_000,
        retryAttempts: {
          MediaSegment: 8,
          InitializationSegment: 8,
        },
      },
    })
  })

  it('applies the DASH live profile for latency catch-up and reconnects', () => {
    const settings = dashHarness({ contentType: 'live' }).adapter.getSettings()

    expect(settings).toMatchObject({
      streaming: {
        delay: {
          useSuggestedPresentationDelay: true,
          liveDelayFragmentCount: 4,
        },
        liveCatchup: {
          enabled: true,
          maxDrift: 12,
          playbackRate: {
            min: -0.1,
            max: 0.1,
          },
        },
        buffer: {
          bufferTimeDefault: 6,
          bufferTimeAtTopQuality: 12,
          bufferToKeep: 45,
        },
        manifestRequestTimeout: 8_000,
        fragmentRequestTimeout: 20_000,
        retryAttempts: {
          MPD: 10,
          MediaSegment: 10,
        },
      },
    })
  })

  it('isolates DASH preset settings between adapters', () => {
    const firstSettings = dashHarness().adapter.getSettings() as {
      streaming?: { buffer?: { bufferTimeDefault?: number } }
    }
    if (!firstSettings.streaming?.buffer) {
      throw new Error('Expected preset buffer settings')
    }
    firstSettings.streaming.buffer.bufferTimeDefault = 999

    expect(dashHarness().adapter.getSettings()).toMatchObject({
      streaming: { buffer: { bufferTimeDefault: 18 } },
    })
  })

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

  it('replaces dash.js playback without accepting events from the reset player', async () => {
    const harness = dashHarness()
    const engine = await loadDashEngine(harness)
    const manifests: AudioEngineEvents['manifestloaded'][] = []
    const errorCodes: string[] = []
    engine.on('manifestloaded', payload => manifests.push(payload))
    engine.on('error', error => errorCodes.push(error.code))
    const firstDashPlayer = harness.dashPlayers[0]

    const replacementLoad = engine.load(new HttpAudioSource('/second.mpd'))
    await vi.waitFor(() => {
      expect(harness.dashPlayers).toHaveLength(2)
    })
    const replacementDashPlayer = harness.dashPlayers[1]

    firstDashPlayer.representations = [
      { id: 'stale', bandwidth: 48_000, codecs: 'mp4a.40.2' } as Representation,
    ]
    firstDashPlayer.emit(dashEvents.STREAM_INITIALIZED, { error: null, streamInfo: { id: 'stale' } })
    firstDashPlayer.emit(dashEvents.ERROR, {
      error: 'manifestError',
      event: { id: 'parse', message: 'stale manifest failure' },
    })
    replacementDashPlayer.representations = [
      { id: 'current', bandwidth: 128_000, codecs: 'mp4a.40.2' } as Representation,
    ]
    replacementDashPlayer.emit(dashEvents.STREAM_INITIALIZED, {
      error: null,
      streamInfo: { id: 'current' },
    })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))

    await replacementLoad

    expect(firstDashPlayer.resetCalls).toBe(1)
    expect(harness.adapter.dashInstance).toBe(replacementDashPlayer)
    expect(manifests).toMatchObject([{
      url: '/second.mpd',
      variants: [{ id: 'current', bitrate: 128_000 }],
    }])
    expect(errorCodes).toEqual([])
  })

  it('rejects unsupported browsers', async () => {
    const harness = dashHarness({ supported: false })

    expect(harness.adapter.isSupported()).toBe(false)
    await expect(harness.adapter.createEngine()).rejects.toMatchObject({
      code: 'PROTOCOL_UNSUPPORTED',
    })
  })

  it('rejects partial DASH media environments before routing playback', () => {
    class FakeMediaSource {
      static isTypeSupported(_mimeType: string): boolean {
        return true
      }
    }
    class FakeSourceBuffer {
      appendBuffer(): void {
        return undefined
      }

      remove(): void {
        return undefined
      }
    }

    vi.stubGlobal('MediaSource', FakeMediaSource)
    expect(createDashAdapter().isSupported()).toBe(false)

    vi.stubGlobal('Audio', {})
    expect(createDashAdapter().isSupported()).toBe(false)

    vi.stubGlobal('Audio', class {})
    vi.stubGlobal('MediaSource', {})
    expect(createDashAdapter().isSupported()).toBe(false)

    vi.stubGlobal('MediaSource', FakeMediaSource)
    vi.stubGlobal('SourceBuffer', {
      prototype: {
        appendBuffer: vi.fn(),
      },
    })
    expect(createDashAdapter().isSupported()).toBe(false)

    vi.stubGlobal('SourceBuffer', FakeSourceBuffer)
    expect(createDashAdapter().isSupported()).toBe(true)
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

  it('keeps manual DASH quality when an unrelated playback setting changes', async () => {
    const harness = dashHarness()
    const engine = await loadDashEngine(harness)
    const dashPlayer = harness.dashPlayers[0]
    dashPlayer.representations = [
      { id: 'audio-low', bandwidth: 64_000 } as Representation,
      { id: 'audio-high', bandwidth: 192_000 } as Representation,
    ]
    dashPlayer.emit(dashEvents.STREAM_INITIALIZED, { streamInfo: { id: 'stream-1' } })
    await engine.setAdaptiveQuality?.('audio-high')

    harness.adapter.updateSettings({ streaming: { buffer: { bufferToKeep: 15 } } })

    expect(engine.getAdaptiveQualitySelection?.()).toBe('audio-high')
    expect(dashPlayer.getSettings()).toMatchObject({
      streaming: { abr: { autoSwitchBitrate: { audio: false } }, buffer: { bufferToKeep: 15 } },
    })
    await engine.dispose()
  })

  it('reflects explicit DASH ABR mode changes in the public quality selection', async () => {
    const harness = dashHarness()
    const engine = await loadDashEngine(harness)
    const dashPlayer = harness.dashPlayers[0]
    const variantChanges: AudioEngineEvents['variantchange'][] = []
    engine.on('variantchange', variant => variantChanges.push(variant))
    const highRepresentation = { id: 'audio-high', bandwidth: 192_000 } as Representation
    dashPlayer.representations = [highRepresentation]
    dashPlayer.currentRepresentation = highRepresentation
    dashPlayer.emit(dashEvents.STREAM_INITIALIZED, { streamInfo: { id: 'stream-1' } })

    harness.adapter.updateSettings({ streaming: { abr: { autoSwitchBitrate: { audio: false } } } })
    expect(engine.getAdaptiveQualitySelection?.()).toBe('audio-high')

    await engine.setAdaptiveQuality?.('audio-high')
    harness.adapter.updateSettings({ streaming: { abr: { autoSwitchBitrate: { audio: true } } } })
    expect(engine.getAdaptiveQualitySelection?.()).toBe('auto')
    expect(dashPlayer.getSettings()).toMatchObject({
      streaming: { abr: { autoSwitchBitrate: { audio: true } } },
    })
    dashPlayer.emit(dashEvents.QUALITY_CHANGE_RENDERED, {
      mediaType: 'audio',
      oldRepresentation: highRepresentation,
      newRepresentation: highRepresentation,
    })
    expect(variantChanges.at(-1)).toMatchObject({ variantId: 'audio-high', reason: 'automatic' })
    await engine.dispose()
  })

  it('reports an initially fixed DASH representation once the stream is initialized', async () => {
    const harness = dashHarness({
      settings: { streaming: { abr: { autoSwitchBitrate: { audio: false } } } },
    })
    const engine = await loadDashEngine(harness)
    const dashPlayer = harness.dashPlayers[0]
    const representation = { id: 'auto', bandwidth: 128_000 } as Representation
    dashPlayer.representations = [representation]
    dashPlayer.currentRepresentation = representation
    dashPlayer.emit(dashEvents.STREAM_INITIALIZED, { streamInfo: { id: 'stream-1' } })

    expect(engine.getAdaptiveQualitySelection?.()).toBe('auto:0')
    await engine.dispose()
  })

  it('accepts sparse nested settings while retaining vendor atomic value types', () => {
    const sparseSettings = {
      streaming: {
        abr: {
          throughput: {
            bandwidthSafetyFactor: 0.75,
          },
        },
      },
    } satisfies DashSettingsChanges
    const harness = dashHarness({ settings: sparseSettings })

    harness.adapter.updateSettings({
      streaming: {
        abr: {
          throughput: {
            useDeadTimeLatency: false,
          },
        },
      },
    })

    expect(harness.adapter.getSettings()).toMatchObject({
      streaming: {
        abr: {
          throughput: {
            bandwidthSafetyFactor: 0.75,
            sampleSettings: { vod: 4 },
            ewma: { throughputSlowHalfLifeSeconds: 8 },
            useDeadTimeLatency: false,
          },
        },
      },
    })

    type DashStreamingSettings = NonNullable<MediaPlayerSettingClass['streaming']>
    type DashStreamingChanges = NonNullable<DashSettingsChanges['streaming']>
    type DashCapabilitySettings = NonNullable<DashStreamingSettings['capabilities']>
    type DashCapabilityChanges = NonNullable<DashStreamingChanges['capabilities']>
    type EssentialPropertySettings = NonNullable<DashCapabilitySettings['supportedEssentialProperties']>
    type EssentialPropertyChanges = NonNullable<DashCapabilityChanges['supportedEssentialProperties']>

    expectTypeOf<EssentialPropertyChanges>().toEqualTypeOf<EssentialPropertySettings>()
    expectTypeOf<EssentialPropertyChanges[0]['value']>().toEqualTypeOf<RegExp | undefined>()
  })

  it('applies updated settings when a reused engine opens another DASH source', async () => {
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
    const engine = await loadDashEngine(harness)

    harness.adapter.updateSettings({
      streaming: {
        buffer: {
          bufferTimeDefault: 45,
        },
      },
    })
    const replacementLoad = engine.load(new HttpAudioSource('/replacement.mpd'))
    await vi.waitFor(() => {
      expect(harness.dashPlayers).toHaveLength(2)
    })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await replacementLoad

    expect(harness.dashPlayers[1].settingsUpdates[0]).toMatchObject({
      streaming: {
        buffer: {
          bufferTimeDefault: 45,
          bufferTimeAtTopQuality: 30,
        },
      },
    })

    engine.dispose()
  })

  it('accepts metadata for a browser-resolved relative DASH URL', async () => {
    vi.stubGlobal('location', { href: 'https://example.com/docs/' })
    const harness = dashHarness()
    const engine = await harness.adapter.createEngine()

    const loading = engine.load(new HttpAudioSource('/stream.mpd'))
    await vi.waitFor(() => {
      expect(harness.dashPlayers).toHaveLength(1)
    })
    expect(harness.dashPlayers[0].initializeCalls[0]?.url).toBe('https://example.com/stream.mpd')
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))

    await expect(loading).resolves.toBeUndefined()
    engine.dispose()
  })

  it('translates manifest, quality, segment, and recoverable errors', async () => {
    const harness = dashHarness()
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

    const load = engine.load(new HttpAudioSource('/stream.mpd'))
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })
    const dashPlayer = harness.dashPlayers[0]
    dashPlayer.representations = [
      { id: 'audio-64', bandwidth: 64_000, codecs: 'mp4a.40.2' } as Representation,
      { id: 'audio-128', bandwidth: 128_000, codecs: 'mp4a.40.2' } as Representation,
    ]
    dashPlayer.emit(dashEvents.STREAM_INITIALIZED, { error: null, streamInfo: { id: 'stream-1' } })
    dashPlayer.emit(dashEvents.QUALITY_CHANGE_RENDERED, {
      mediaType: 'video',
      oldRepresentation: dashPlayer.representations[0],
      newRepresentation: dashPlayer.representations[1],
    })
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
    dashPlayer.emit(dashEvents.FRAGMENT_LOADING_STARTED, {
      request: { ...request, mediaType: 'video' },
    })
    dashPlayer.emit(dashEvents.FRAGMENT_LOADING_COMPLETED, {
      request: { ...request, mediaType: 'video' },
    })
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

  it('publishes segmentloaded only after a failed DASH fragment is successfully retried', async () => {
    const harness = dashHarness()
    const engine = await loadDashEngine(harness)
    const segmentLoads: AudioEngineEvents['segmentloaded'][] = []
    engine.on('segmentloaded', segment => segmentLoads.push(segment))
    const request = {
      url: '/retried-segment.m4s',
      representationId: 'audio-128',
      duration: 4,
      mediaType: 'audio',
    }
    const dashPlayer = harness.dashPlayers[0]

    try {
      // AI modified: dash.js publishes completion for both failed requests and successful retries.
      dashPlayer.emit(dashEvents.FRAGMENT_LOADING_COMPLETED, {
        request,
        response: null,
        error: { code: dashErrorCodes.FRAGMENT_LOADER_LOADING_FAILURE_ERROR_CODE, message: '404' },
      })
      expect(segmentLoads).toEqual([])

      dashPlayer.emit(dashEvents.FRAGMENT_LOADING_COMPLETED, {
        request,
        response: new ArrayBuffer(8),
        error: null,
      })
      expect(segmentLoads).toEqual([{
        protocol: 'dash',
        implementation: 'dash.js',
        url: request.url,
        variantId: request.representationId,
        duration: request.duration,
      }])
    }
    finally {
      await engine.dispose()
    }
  })

  it('selects DASH variants through the unified adaptive quality API', async () => {
    const harness = dashHarness()
    const engine = await harness.adapter.createEngine()
    await expect(engine.setAdaptiveQuality?.('auto')).rejects.toMatchObject({
      code: 'PROTOCOL_UNSUPPORTED',
    })
    const variantChanges: AudioEngineEvents['variantchange'][] = []
    engine.on('variantchange', payload => variantChanges.push(payload))
    const load = engine.load(new HttpAudioSource('/stream.mpd'))
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })
    const dashPlayer = harness.dashPlayers[0]
    dashPlayer.representations = [
      { id: 'audio-low', bandwidth: 64_000, codecs: 'mp4a.40.2' } as Representation,
      { id: 'audio-mid', bandwidth: 128_000, codecs: 'mp4a.40.2' } as Representation,
      { id: 'audio-high', bandwidth: 192_000, codecs: 'mp4a.40.2' } as Representation,
    ]
    dashPlayer.emit(dashEvents.STREAM_INITIALIZED, { error: null, streamInfo: { id: 'stream-1' } })
    harness.audioElements.at(-1)?.dispatchEvent(new Event('loadedmetadata'))
    await load

    expect(engine.getAdaptiveVariants?.()).toEqual([
      { id: 'audio-low', bitrate: 64_000, codecs: 'mp4a.40.2' },
      { id: 'audio-mid', bitrate: 128_000, codecs: 'mp4a.40.2' },
      { id: 'audio-high', bitrate: 192_000, codecs: 'mp4a.40.2' },
    ])
    await expect(engine.setAdaptiveQuality?.('missing')).rejects.toMatchObject({
      code: 'ADAPTIVE_STREAM_ERROR',
    })

    await engine.setAdaptiveQuality?.('audio-high')

    expect(dashPlayer.settingsUpdates.at(-1)).toMatchObject({
      streaming: {
        abr: {
          autoSwitchBitrate: {
            audio: false,
          },
        },
      },
    })
    expect(dashPlayer.representationSelections).toEqual([
      { type: 'audio', id: 'audio-high', shouldSwitch: true },
    ])
    expect(engine.getAdaptiveQualitySelection?.()).toBe('audio-high')
    expect(variantChanges).toEqual([])

    dashPlayer.emit(dashEvents.QUALITY_CHANGE_RENDERED, {
      mediaType: 'audio',
      oldRepresentation: dashPlayer.representations[0],
      newRepresentation: dashPlayer.representations[1],
    })
    dashPlayer.emit(dashEvents.QUALITY_CHANGE_RENDERED, {
      mediaType: 'audio',
      oldRepresentation: dashPlayer.representations[1],
      newRepresentation: dashPlayer.representations[2],
    })
    dashPlayer.emit(dashEvents.QUALITY_CHANGE_RENDERED, {
      mediaType: 'audio',
      oldRepresentation: dashPlayer.representations[2],
      newRepresentation: dashPlayer.representations[1],
    })

    expect(variantChanges).toMatchObject([{
      variantId: 'audio-mid',
      bitrate: 128_000,
      reason: 'automatic',
    }, {
      variantId: 'audio-high',
      bitrate: 192_000,
      reason: 'manual',
    }, {
      variantId: 'audio-mid',
      bitrate: 128_000,
      reason: 'automatic',
    }])

    await engine.setAdaptiveQuality?.('audio-high')
    await engine.setAdaptiveQuality?.('auto')
    dashPlayer.emit(dashEvents.QUALITY_CHANGE_RENDERED, {
      mediaType: 'audio',
      oldRepresentation: dashPlayer.representations[1],
      newRepresentation: dashPlayer.representations[2],
    })

    expect(engine.getAdaptiveQualitySelection?.()).toBe('auto')
    expect(variantChanges.at(-1)).toMatchObject({
      variantId: 'audio-high',
      reason: 'automatic',
    })
    expect(dashPlayer.settingsUpdates.at(-1)).toMatchObject({
      streaming: {
        abr: {
          autoSwitchBitrate: {
            audio: true,
          },
        },
      },
    })
  })

  it('maps a vendor auto representation to a stable selectable public identifier', async () => {
    const harness = dashHarness()
    const engine = await harness.adapter.createEngine()
    const variantChanges: AudioEngineEvents['variantchange'][] = []
    const segmentStarts: AudioEngineEvents['segmentloadstart'][] = []
    const segmentLoads: AudioEngineEvents['segmentloaded'][] = []
    engine.on('variantchange', payload => variantChanges.push(payload))
    engine.on('segmentloadstart', payload => segmentStarts.push(payload))
    engine.on('segmentloaded', payload => segmentLoads.push(payload))
    const load = engine.load(new HttpAudioSource('/stream.mpd'))
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })
    const dashPlayer = harness.dashPlayers[0]
    dashPlayer.representations = [
      { id: 'auto', bandwidth: 64_000, codecs: 'mp4a.40.2' } as Representation,
      { id: 'auto:0', bandwidth: 128_000, codecs: 'mp4a.40.2' } as Representation,
      { id: 'audio-high', bandwidth: 192_000, codecs: 'mp4a.40.2' } as Representation,
    ]
    dashPlayer.emit(dashEvents.STREAM_INITIALIZED, { error: null, streamInfo: { id: 'stream-1' } })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await load

    expect(engine.getAdaptiveVariants?.()).toEqual([
      { id: 'auto:1', bitrate: 64_000, codecs: 'mp4a.40.2' },
      { id: 'auto:0', bitrate: 128_000, codecs: 'mp4a.40.2' },
      { id: 'audio-high', bitrate: 192_000, codecs: 'mp4a.40.2' },
    ])

    await engine.setAdaptiveQuality?.('auto:1')
    expect(dashPlayer.representationSelections.at(-1)).toEqual({
      type: 'audio',
      id: 'auto',
      shouldSwitch: true,
    })
    expect(engine.getAdaptiveQualitySelection?.()).toBe('auto:1')

    dashPlayer.representations = [
      { id: 'auto:1', bandwidth: 96_000, codecs: 'mp4a.40.2' } as Representation,
      { id: 'audio-high', bandwidth: 192_000, codecs: 'mp4a.40.2' } as Representation,
      { id: 'auto', bandwidth: 64_000, codecs: 'mp4a.40.2' } as Representation,
    ]
    // AI modified: dash.js refreshes an existing Period through STREAM_UPDATED, not initialization.
    dashPlayer.emit(dashEvents.STREAM_UPDATED, { streamInfo: { id: 'stream-1' } })

    expect(engine.getAdaptiveVariants?.()).toEqual([
      { id: 'auto:1:0', bitrate: 96_000, codecs: 'mp4a.40.2' },
      { id: 'audio-high', bitrate: 192_000, codecs: 'mp4a.40.2' },
      { id: 'auto:1', bitrate: 64_000, codecs: 'mp4a.40.2' },
    ])

    dashPlayer.emit(dashEvents.QUALITY_CHANGE_RENDERED, {
      mediaType: 'audio',
      oldRepresentation: dashPlayer.representations[1],
      newRepresentation: dashPlayer.representations[0],
    })
    dashPlayer.emit(dashEvents.QUALITY_CHANGE_RENDERED, {
      mediaType: 'audio',
      oldRepresentation: dashPlayer.representations[0],
      newRepresentation: dashPlayer.representations[2],
    })
    const request = {
      url: '/segment-auto.m4s',
      representationId: 'auto',
      duration: 4,
      mediaType: 'audio',
    }
    dashPlayer.emit(dashEvents.FRAGMENT_LOADING_STARTED, { request })
    dashPlayer.emit(dashEvents.FRAGMENT_LOADING_COMPLETED, { request })

    expect(variantChanges.slice(-2)).toMatchObject([{
      previousVariantId: 'audio-high',
      variantId: 'auto:1:0',
      reason: 'automatic',
    }, {
      previousVariantId: 'auto:1:0',
      variantId: 'auto:1',
      reason: 'manual',
    }])
    expect(segmentStarts.at(-1)).toMatchObject({ variantId: 'auto:1' })
    expect(segmentLoads.at(-1)).toMatchObject({ variantId: 'auto:1' })

    await engine.setAdaptiveQuality?.('audio-high')
    dashPlayer.representations = [
      { id: 'auto:1', bandwidth: 96_000, codecs: 'mp4a.40.2' } as Representation,
      { id: 'auto', bandwidth: 64_000, codecs: 'mp4a.40.2' } as Representation,
    ]
    dashPlayer.emit(dashEvents.STREAM_UPDATED, { streamInfo: { id: 'stream-1' } })

    expect(engine.getAdaptiveQualitySelection?.()).toBe('auto')
    expect(dashPlayer.settingsUpdates.at(-1)).toMatchObject({
      streaming: {
        abr: {
          autoSwitchBitrate: {
            audio: true,
          },
        },
      },
    })
    await expect(engine.setAdaptiveQuality?.('audio-high')).rejects.toMatchObject({
      code: 'ADAPTIVE_STREAM_ERROR',
    })
    await engine.setAdaptiveQuality?.('auto')

    expect(engine.getAdaptiveQualitySelection?.()).toBe('auto')
    expect(dashPlayer.settingsUpdates.at(-1)).toMatchObject({
      streaming: {
        abr: {
          autoSwitchBitrate: {
            audio: true,
          },
        },
      },
    })
  })

  it('ignores DASH updates before initialization and for an inactive Period', async () => {
    const harness = dashHarness({ contentType: 'live' })
    const engine = await loadDashEngine(harness)
    const dashPlayer = harness.dashPlayers[0]
    const manifests: AudioEngineEvents['manifestloaded'][] = []
    engine.on('manifestloaded', manifest => manifests.push(manifest))
    dashPlayer.representations = [
      { id: 'audio-low', bandwidth: 64_000 } as Representation,
    ]

    dashPlayer.emit(dashEvents.STREAM_UPDATED, { streamInfo: { id: 'stream-1' } })
    expect(manifests).toHaveLength(0)

    dashPlayer.emit(dashEvents.STREAM_INITIALIZED, { streamInfo: { id: 'stream-1' } })
    dashPlayer.representations = [
      { id: 'audio-high', bandwidth: 192_000 } as Representation,
    ]
    dashPlayer.emit(dashEvents.STREAM_UPDATED, { streamInfo: { id: 'future-period' } })
    expect(manifests).toHaveLength(1)
    expect(engine.getAdaptiveVariants?.()).toMatchObject([{ id: 'audio-low' }])

    dashPlayer.emit(dashEvents.STREAM_UPDATED, { streamInfo: { id: 'stream-1' } })
    expect(engine.getAdaptiveVariants?.()).toMatchObject([{ id: 'audio-high' }])
    await engine.dispose()
  })

  it('isolates DASH variant query and manifest snapshots from selection state', async () => {
    const harness = dashHarness()
    const engine = await harness.adapter.createEngine()
    const manifests: AudioEngineEvents['manifestloaded'][] = []
    engine.on('manifestloaded', payload => manifests.push(payload))
    const load = engine.load(new HttpAudioSource('/stream.mpd'))
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })
    const dashPlayer = harness.dashPlayers[0]
    dashPlayer.representations = [
      { id: 'audio-low', bandwidth: 64_000, codecs: 'mp4a.40.2' } as Representation,
      { id: 'audio-high', bandwidth: 192_000, codecs: 'mp4a.40.2' } as Representation,
    ]
    dashPlayer.emit(dashEvents.STREAM_INITIALIZED, { error: null, streamInfo: { id: 'stream-1' } })
    harness.audioElements.at(-1)?.dispatchEvent(new Event('loadedmetadata'))
    await load
    const queriedVariants = engine.getAdaptiveVariants?.() ?? []
    const queriedVariant = queriedVariants[0]
    const manifestVariants = manifests[0]?.variants
    const manifestVariant = manifestVariants?.[1]
    if (!queriedVariant || !manifestVariants || !manifestVariant) {
      throw new Error('Expected DASH variant snapshots')
    }

    // Runtime mutation attempts model untyped JavaScript consumers of the readonly public API.
    Reflect.set(queriedVariant, 'bitrate', 1)
    Reflect.set(queriedVariants, 'length', 0)
    Reflect.set(manifestVariant, 'id', 'mutated')
    Reflect.set(manifestVariants, 'length', 0)

    expect(engine.getAdaptiveVariants?.()).toEqual([
      { id: 'audio-low', bitrate: 64_000, codecs: 'mp4a.40.2' },
      { id: 'audio-high', bitrate: 192_000, codecs: 'mp4a.40.2' },
    ])

    await engine.setAdaptiveQuality?.('audio-high')
    expect(dashPlayer.representationSelections.at(-1)).toEqual({
      type: 'audio',
      id: 'audio-high',
      shouldSwitch: true,
    })
  })

  it('restores automatic DASH selection when the vendor rejects a manual request', async () => {
    const harness = dashHarness()
    const engine = await harness.adapter.createEngine()
    const load = engine.load(new HttpAudioSource('/stream.mpd'))
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })
    const dashPlayer = harness.dashPlayers[0]
    dashPlayer.representations = [
      { id: 'audio-low', bandwidth: 64_000, codecs: 'mp4a.40.2' } as Representation,
      { id: 'audio-high', bandwidth: 192_000, codecs: 'mp4a.40.2' } as Representation,
    ]
    dashPlayer.emit(dashEvents.STREAM_INITIALIZED, { error: null, streamInfo: { id: 'stream-1' } })
    harness.audioElements.at(-1)?.dispatchEvent(new Event('loadedmetadata'))
    await load
    const selectionError = new Error('dash.js rejected the representation')
    dashPlayer.representationSelectionError = selectionError

    await expect(engine.setAdaptiveQuality?.('audio-high')).rejects.toBe(selectionError)

    expect(engine.getAdaptiveQualitySelection?.()).toBe('auto')
    expect(dashPlayer.settingsUpdates.at(-1)).toMatchObject({
      streaming: {
        abr: {
          autoSwitchBitrate: {
            audio: true,
          },
        },
      },
    })
  })

  it('publishes fatal manifest errors', async () => {
    const harness = dashHarness()
    const engine = await harness.adapter.createEngine()
    const errorCodes: string[] = []
    engine.on('error', error => errorCodes.push(error.code))
    const load = engine.load(new HttpAudioSource('/stream.mpd'))
    const loadExpectation = expect(load).rejects.toMatchObject({ code: 'MANIFEST_ERROR' })
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })

    harness.dashPlayers[0].emit(dashEvents.ERROR, {
      error: 'manifestError',
      event: { id: 'parse', message: 'invalid manifest' },
    })
    await loadExpectation

    expect(errorCodes).toEqual(['MANIFEST_ERROR'])
  })

  // AI modified: failed UTC synchronization and XLink defaults can recover during initialization or later manifest work.
  it.each([
    ['loading', 'UTC synchronization', dashErrorCodes.TIME_SYNC_FAILED_ERROR_CODE],
    ['playing', 'UTC synchronization', dashErrorCodes.TIME_SYNC_FAILED_ERROR_CODE],
    ['loading', 'XLink download', dashErrorCodes.DOWNLOAD_ERROR_ID_XLINK_CODE],
    ['playing', 'XLink download', dashErrorCodes.DOWNLOAD_ERROR_ID_XLINK_CODE],
  ] as const)('keeps DASH %s usable after %s fails', async (phase, operation, vendorErrorCode) => {
    const harness = dashHarness({ contentType: 'live' })
    const engine = await harness.adapter.createEngine()
    const streamErrors: AudioEngineEvents['streamerror'][] = []
    const fatalErrors: AudioEngineEvents['error'][] = []
    engine.on('streamerror', error => streamErrors.push(error))
    engine.on('error', error => fatalErrors.push(error))
    const loadCompletion = engine.load(new HttpAudioSource('/live.mpd')).then(
      () => undefined,
      (error: unknown) => error,
    )
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })
    if (phase === 'playing') {
      harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
      expect(await loadCompletion).toBeUndefined()
      await engine.play()
    }

    const dashPlayer = harness.dashPlayers[0]
    const vendorError = {
      error: {
        code: vendorErrorCode,
        message: `${operation} failed`,
      },
    }
    dashPlayer.emit(dashEvents.ERROR, vendorError)
    if (phase === 'loading') {
      harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    }

    try {
      expect(await loadCompletion).toBeUndefined()
      expect(streamErrors).toMatchObject([{
        isFatal: false,
        code: String(vendorErrorCode),
        cause: vendorError,
      }])
      expect(fatalErrors).toEqual([])
      expect(dashPlayer.resetCalls).toBe(0)
      expect(harness.adapter.dashInstance).toBe(dashPlayer)
      await engine.play()
      expect(engine.isPaused()).toBe(false)
    }
    finally {
      await engine.dispose()
    }
  })

  it.each([
    [dashErrorCodes.MANIFEST_LOADER_PARSING_FAILURE_ERROR_CODE, 'manifest', 'MANIFEST_ERROR'],
    [dashErrorCodes.FRAGMENT_LOADER_LOADING_FAILURE_ERROR_CODE, 'segment', 'SEGMENT_ERROR'],
    // AI modified: unknown structured codes remain terminal media failures at the public boundary.
    [999_999, 'media', 'ADAPTIVE_STREAM_ERROR'],
  ] as const)(
    'maps structured dash.js error %s to fatal %s / %s semantics',
    async (vendorErrorCode, category, playerErrorCode) => {
      const harness = dashHarness()
      const engine = await harness.adapter.createEngine()
      const streamErrors: AudioEngineEvents['streamerror'][] = []
      const errorCodes: string[] = []
      engine.on('streamerror', error => streamErrors.push(error))
      engine.on('error', error => errorCodes.push(error.code))
      const load = engine.load(new HttpAudioSource('/stream.mpd'))
      const loadExpectation = expect(load).rejects.toMatchObject({ code: playerErrorCode })
      await vi.waitFor(() => {
        expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
      })

      harness.dashPlayers[0].emit(dashEvents.ERROR, {
        error: {
          code: vendorErrorCode,
          message: 'structured dash.js failure',
          data: {},
        },
      })

      await loadExpectation
      expect(streamErrors).toMatchObject([{
        category,
        isFatal: true,
        code: String(vendorErrorCode),
      }])
      expect(errorCodes).toEqual([playerErrorCode])
    },
  )

  it('does not publish an old terminal error after a stream listener replaces the source', async () => {
    const harness = dashHarness()
    const engine = await loadDashEngine(harness)
    const originalDashPlayer = harness.dashPlayers[0]
    const errorCodes: string[] = []
    let replacementLoad: Promise<void> | undefined
    engine.on('streamerror', ({ isFatal }) => {
      if (isFatal && !replacementLoad) {
        replacementLoad = engine.load(new HttpAudioSource('/replacement.mpd'))
      }
    })
    engine.on('error', error => errorCodes.push(error.code))

    originalDashPlayer.emit(dashEvents.ERROR, {
      error: 'manifestError',
      event: { id: 'parse', message: 'old manifest failed' },
    })

    expect(replacementLoad).toBeDefined()
    await vi.waitFor(() => {
      expect(harness.dashPlayers).toHaveLength(2)
    })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await replacementLoad

    expect(errorCodes).toEqual([])
    expect(originalDashPlayer.resetCalls).toBe(1)
    expect(harness.adapter.dashInstance).toBe(harness.dashPlayers[1])
  })

  it('does not let an old error handler reject a load started by its error listener', async () => {
    const harness = dashHarness()
    const engine = await loadDashEngine(harness)
    const originalDashPlayer = harness.dashPlayers[0]
    const rejectActiveLoad = vi.spyOn(
      engine as unknown as { rejectActiveLoad: (error: unknown) => void },
      'rejectActiveLoad',
    )
    const errorCodes: string[] = []
    let replacementLoad: Promise<void> | undefined
    engine.on('error', (error) => {
      errorCodes.push(error.code)
      if (!replacementLoad) {
        replacementLoad = engine.load(new HttpAudioSource('/replacement.mpd'))
      }
    })

    originalDashPlayer.emit(dashEvents.ERROR, {
      error: 'manifestError',
      event: { id: 'parse', message: 'old manifest failed' },
    })

    expect(replacementLoad).toBeDefined()
    expect(rejectActiveLoad).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(harness.dashPlayers).toHaveLength(2)
    })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await replacementLoad

    expect(errorCodes).toEqual(['MANIFEST_ERROR'])
    expect(harness.adapter.dashInstance).toBe(harness.dashPlayers[1])
  })

  it('rejects manifest download failures as fatal errors', async () => {
    const harness = dashHarness()
    const engine = await harness.adapter.createEngine()
    const load = engine.load(new HttpAudioSource('/stream.mpd'))
    const loadExpectation = expect(load).rejects.toMatchObject({ code: 'MANIFEST_ERROR' })
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })

    harness.dashPlayers[0].emit(dashEvents.ERROR, {
      error: 'download',
      event: { id: 'manifest', url: '/stream.mpd' },
    })

    await loadExpectation
  })

  it('rejects and closes a source when DASH fails synchronously during attachment', async () => {
    const harness = dashHarness({
      initializationError: {
        error: 'manifestError',
        event: { id: 'parse', message: 'synchronous manifest failure' },
      },
    })
    const engine = await harness.adapter.createEngine()
    const close = vi.fn(async () => {})
    const adaptiveChanges: AudioEngineEvents['adaptivechange'][] = []
    engine.on('adaptivechange', payload => adaptiveChanges.push(payload))

    await expect(engine.load({
      kind: 'url',
      url: '/stream.mpd',
      open: async () => ({ url: '/stream.mpd' }),
      close,
    })).rejects.toMatchObject({ code: 'MANIFEST_ERROR' })

    expect(close).toHaveBeenCalledOnce()
    expect(adaptiveChanges).toEqual([])
    expect(engine.getActiveAdaptivePlayback?.()).toBeUndefined()
    expect(harness.adapter.dashInstance).toBeUndefined()
  })

  it('releases DASH adapter ownership when vendor disposal throws', async () => {
    const harness = dashHarness()
    const engine = await harness.adapter.createEngine()
    const closeSource = vi.fn(async () => {})
    const load = engine.load({
      kind: 'url',
      url: '/stream.mpd',
      open: async () => ({ url: '/stream.mpd' }),
      close: closeSource,
    })
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await load
    const disposalError = new Error('dash reset failed')
    harness.dashPlayers[0].resetError = disposalError

    await expect(engine.dispose()).rejects.toBe(disposalError)

    expect(harness.adapter.dashInstance).toBeUndefined()

    harness.dashPlayers[0].resetError = undefined
    await expect(engine.dispose()).resolves.toBeUndefined()
    expect(harness.dashPlayers[0].resetCalls).toBe(2)
    expect(harness.adapter.dashInstance).toBeUndefined()
    expect(closeSource).toHaveBeenCalledOnce()
  })

  it('retries asynchronous source cleanup even while repeated DASH disposal still fails', async () => {
    const harness = dashHarness()
    const engine = await harness.adapter.createEngine()
    const sourceCloseError = new Error('source close failed')
    let closeAttempts = 0
    const closeSource = vi.fn((): Promise<void> => {
      closeAttempts += 1
      return closeAttempts === 1
        ? Promise.reject(sourceCloseError)
        : Promise.resolve()
    })
    const load = engine.load({
      kind: 'url',
      url: '/stream.mpd',
      open: async () => ({ url: '/stream.mpd' }),
      close: closeSource,
    })
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await load
    const dashPlayer = harness.dashPlayers[0]
    const vendorCleanupError = new Error('dash reset failed')
    dashPlayer.resetError = vendorCleanupError

    await expect(engine.dispose()).rejects.toBe(vendorCleanupError)
    expect(dashPlayer.resetCalls).toBe(1)
    expect(closeSource).toHaveBeenCalledOnce()
    const browserLoadCalls = harness.audioElements[0].loadCalls

    // AI modified: a repeated vendor failure cannot short-circuit the base source retry.
    await expect(engine.dispose()).rejects.toBe(vendorCleanupError)
    expect(dashPlayer.resetCalls).toBe(2)
    expect(closeSource).toHaveBeenCalledTimes(2)
    expect(harness.audioElements[0].loadCalls).toBe(browserLoadCalls)

    dashPlayer.resetError = undefined
    await expect(engine.dispose()).resolves.toBeUndefined()
    expect(dashPlayer.resetCalls).toBe(3)
    expect(closeSource).toHaveBeenCalledTimes(2)
    expect(harness.audioElements[0].loadCalls).toBe(browserLoadCalls)
  })

  it('independently retries simultaneous DASH and native detachment failures', async () => {
    const harness = dashHarness()
    const engine = await loadDashEngine(harness)
    const dashPlayer = harness.dashPlayers[0]
    const audioElement = harness.audioElements[0]
    const vendorCleanupError = new Error('dash reset failed')
    const nativeCleanupError = new Error('native detach failed')
    dashPlayer.resetError = vendorCleanupError
    const removeAttribute = audioElement.removeAttribute.bind(audioElement)
    let nativeFailuresRemaining = 1
    const removeAttributeSpy = vi.spyOn(audioElement, 'removeAttribute').mockImplementation((name) => {
      if (nativeFailuresRemaining > 0) {
        nativeFailuresRemaining -= 1
        throw nativeCleanupError
      }
      removeAttribute(name)
    })

    await expect(engine.dispose()).rejects.toBe(vendorCleanupError)
    expect(dashPlayer.resetCalls).toBe(1)
    expect(removeAttributeSpy).toHaveBeenCalledOnce()

    dashPlayer.resetError = undefined
    await expect(engine.dispose()).resolves.toBeUndefined()
    expect(dashPlayer.resetCalls).toBe(2)
    expect(removeAttributeSpy).toHaveBeenCalledTimes(2)
    const browserLoadCallsAfterCleanup = audioElement.loadCalls

    await engine.dispose()
    expect(dashPlayer.resetCalls).toBe(2)
    expect(removeAttributeSpy).toHaveBeenCalledTimes(2)
    expect(audioElement.loadCalls).toBe(browserLoadCallsAfterCleanup)
  })

  it('retries a failed DASH unload before the next source creates its player', async () => {
    const harness = dashHarness()
    const engine = await harness.adapter.createEngine()
    const closeSource = vi.fn(async () => {})
    const initialLoad = engine.load({
      kind: 'url',
      url: '/stream.mpd',
      open: async () => ({ url: '/stream.mpd' }),
      close: closeSource,
    })
    await vi.waitFor(() => {
      expect(engine.getActiveAdaptivePlayback?.()).toBeDefined()
    })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await initialLoad
    const originalDashPlayer = harness.dashPlayers[0]
    const teardownError = new Error('dash reset failed')
    originalDashPlayer.resetError = teardownError

    expect(() => engine.unload()).toThrow(teardownError)
    expect(originalDashPlayer.resetCalls).toBe(1)
    expect(harness.dashPlayers).toHaveLength(1)
    expect(harness.adapter.dashInstance).toBeUndefined()

    await expect(engine.load(new HttpAudioSource('/blocked.mpd'))).rejects.toBe(teardownError)
    expect(originalDashPlayer.resetCalls).toBe(2)
    expect(harness.dashPlayers).toHaveLength(1)

    originalDashPlayer.resetError = undefined
    const replacementLoad = engine.load(new HttpAudioSource('/replacement.mpd'))
    await vi.waitFor(() => {
      expect(harness.dashPlayers).toHaveLength(2)
    })
    harness.audioElements[0].dispatchEvent(new Event('loadedmetadata'))
    await replacementLoad

    expect(originalDashPlayer.resetCalls).toBe(3)
    expect(harness.adapter.dashInstance).toBe(harness.dashPlayers[1])
    expect(closeSource).toHaveBeenCalledOnce()
  })

  it('contains rejected Firefox MediaKeys cleanup promises during DASH reset', async () => {
    const harness = dashHarness()
    const engine = await loadDashEngine(harness)
    const audioElement = harness.audioElements[0] as FakeAudioElement & {
      setMediaKeys: (mediaKeys: MediaKeys | null) => Promise<void>
    }
    const rejectedCleanup = Promise.reject(new DOMException('MediaKeys cleanup failed', 'NotSupportedError'))
    const setMediaKeys = vi.fn(() => rejectedCleanup)
    let guardedCleanup: Promise<void> | undefined
    audioElement.setMediaKeys = setMediaKeys
    harness.dashPlayers[0].reset = () => {
      harness.dashPlayers[0].resetCalls += 1
      guardedCleanup = audioElement.setMediaKeys(null)
    }

    engine.dispose()

    await expect(guardedCleanup).resolves.toBeUndefined()
    expect(setMediaKeys).toHaveBeenCalledWith(null)
    expect(audioElement.setMediaKeys).toBe(setMediaKeys)
  })
})
