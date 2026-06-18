import type {
  MediaPlayerClass,
  MediaPlayerEvents,
  MediaPlayerSettingClass,
  Representation,
} from 'dashjs'
import type { AudioEngineEvents } from '../../engine/audio-engine'
import { describe, expect, it } from 'vitest'
import { HttpAudioSource } from '../../source/http-audio-source'
import { FakeAudioElement } from '../../test-support/fake-media'
import { AdaptivePlaybackPreset } from '../adaptive-audio-types'
import { DashAudioAdapterImpl } from './dash-audio-adapter'

type DashListener = (payload: unknown) => void

const dashEvents: MediaPlayerEvents = {
  ERROR: 'error',
  FRAGMENT_LOADING_COMPLETED: 'fragmentLoadingCompleted',
  FRAGMENT_LOADING_STARTED: 'fragmentLoadingStarted',
  MANIFEST_LOADED: 'manifestLoaded',
  QUALITY_CHANGE_RENDERED: 'qualityChangeRendered',
  STREAM_INITIALIZED: 'streamInitialized',
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
  preset?: AdaptivePlaybackPreset
} = {}): DashHarness {
  const audioElements: FakeAudioElement[] = []
  const dashPlayers: FakeDashPlayer[] = []
  const adapter = new DashAudioAdapterImpl({
    settings: options.settings,
    preset: options.preset,
  }, {
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
    dashPlayer.emit(dashEvents.STREAM_INITIALIZED, { error: null, streamInfo: { id: 'stream-1' } })
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
    const loadExpectation = expect(load).rejects.toMatchObject({ code: 'MANIFEST_ERROR' })
    await Promise.resolve()

    harness.dashPlayers[0].emit(dashEvents.ERROR, {
      error: 'manifestError',
      event: { id: 'parse', message: 'invalid manifest' },
    })
    await loadExpectation

    expect(errorCodes).toEqual(['MANIFEST_ERROR'])
  })

  it('rejects manifest download failures as fatal errors', async () => {
    const harness = dashHarness()
    const engine = harness.adapter.createEngine()
    const load = engine.load(new HttpAudioSource('/stream.mpd'))
    const loadExpectation = expect(load).rejects.toMatchObject({ code: 'MANIFEST_ERROR' })
    await Promise.resolve()

    harness.dashPlayers[0].emit(dashEvents.ERROR, {
      error: 'download',
      event: { id: 'manifest', url: '/stream.mpd' },
    })

    await loadExpectation
  })
})
