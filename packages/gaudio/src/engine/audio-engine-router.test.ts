import type { AudioAnalyzer } from '../analysis/audio-analyzer'
import type { AudioSource, AudioStreamHandle } from '../source/audio-source'
import type { AudioEngine, AudioEngineEvents } from './audio-engine'
import type { AudioEngineAdapter } from './audio-engine-adapter'
import type { AudioEngineLoadOptions } from './audio-engine-types'
import { describe, expect, it, vi } from 'vitest'
import { GAudioError } from '../errors/errors'
import { AudioPlayer } from '../player/audio-player'
import { HttpAudioSource } from '../source/http-audio-source'
import { FakeAudioEngine } from '../test-support/fake-audio-engine'
import { FakeAudioElement } from '../test-support/fake-media'
import { AudioEngineRouter } from './audio-engine-router'
import { MediaElementAudioEngine } from './media-element-audio-engine'

class FakeAdapter implements AudioEngineAdapter {
  createCalls = 0

  constructor(
    readonly protocol: 'hls' | 'dash',
    private readonly engine: AudioEngine,
    private readonly supported = true,
  ) {}

  createEngine(): AudioEngine {
    this.createCalls += 1
    return this.engine
  }

  isSupported(): boolean {
    return this.supported
  }
}

class NeverSettlingAdapter implements AudioEngineAdapter {
  readonly protocol = 'hls'
  createCalls = 0

  createEngine(): Promise<AudioEngine> {
    this.createCalls += 1
    return new Promise(() => {})
  }

  isSupported(): boolean {
    return true
  }
}

class ReentrantSupportAdapter implements AudioEngineAdapter {
  readonly protocol = 'hls'
  readonly engine = new FakeAudioEngine()
  createCalls = 0
  onSupportCheck?: () => void

  createEngine(): AudioEngine {
    this.createCalls += 1
    return this.engine
  }

  isSupported(): boolean {
    this.onSupportCheck?.()
    return true
  }
}

class ThrowingSupportAdapter implements AudioEngineAdapter {
  readonly protocol = 'hls'
  readonly supportError = new Error('adapter support check failed')

  createEngine(): AudioEngine {
    return new FakeAudioEngine()
  }

  isSupported(): boolean {
    throw this.supportError
  }
}

class SingleReadProtocolAdapter implements AudioEngineAdapter {
  protocolReads = 0

  get protocol(): 'dash' {
    this.protocolReads += 1
    if (this.protocolReads > 1) {
      throw new Error('adapter protocol was read more than once')
    }
    return 'dash'
  }

  createEngine(): AudioEngine {
    return new FakeAudioEngine()
  }

  isSupported(): boolean {
    return true
  }
}

class DeferredCloseAudioSource implements AudioSource {
  readonly kind = 'url'
  closeCalls = 0
  openCalls = 0
  private finishClose: (() => void) | undefined
  private readonly closeGate = new Promise<void>((resolve) => {
    this.finishClose = resolve
  })

  constructor(readonly url: string) {}

  async open(): Promise<AudioStreamHandle> {
    this.openCalls += 1
    return { url: this.url }
  }

  async close(): Promise<void> {
    this.closeCalls += 1
    await this.closeGate
  }

  completeClose(): void {
    this.finishClose?.()
  }
}

class RetryingCloseAudioSource implements AudioSource {
  readonly kind = 'url'
  readonly closeError = new Error('source close failed')
  closeCalls = 0

  constructor(readonly url: string) {}

  async open(): Promise<AudioStreamHandle> {
    return { url: this.url }
  }

  close(): Promise<void> {
    this.closeCalls += 1
    if (this.closeCalls === 1) {
      throw this.closeError
    }
    return Promise.resolve()
  }
}

class DelayedAdapter implements AudioEngineAdapter {
  readonly protocol = 'hls'
  createCalls = 0
  private continueCreation: (() => void) | undefined
  private readonly creationGate = new Promise<void>((resolve) => {
    this.continueCreation = resolve
  })

  constructor(private readonly engine: FakeAudioEngine) {}

  async createEngine(): Promise<AudioEngine> {
    this.createCalls += 1
    await this.creationGate
    return this.engine
  }

  isSupported(): boolean {
    return true
  }

  finishCreation(): void {
    this.continueCreation?.()
  }
}

class DelayedRejectingAdapter implements AudioEngineAdapter {
  readonly protocol = 'hls'
  readonly creationError = new Error('adapter creation failed')
  createCalls = 0
  private rejectCreation: ((error: Error) => void) | undefined
  private readonly creation = new Promise<AudioEngine>((_resolve, reject) => {
    this.rejectCreation = reject
  })

  createEngine(): Promise<AudioEngine> {
    this.createCalls += 1
    return this.creation
  }

  isSupported(): boolean {
    return true
  }

  failCreation(): void {
    this.rejectCreation?.(this.creationError)
  }
}

class DelayedRejectingLoadEngine extends FakeAudioEngine {
  readonly loadError = new Error('engine load failed')
  private rejectLoad: ((error: Error) => void) | undefined

  override async load(source: Parameters<FakeAudioEngine['load']>[0]): Promise<void> {
    await super.load(source)
    await new Promise<void>((_resolve, reject) => {
      this.rejectLoad = reject
    })
  }

  failLoad(): void {
    this.rejectLoad?.(this.loadError)
  }
}

class DeferredRouterControlEngine extends FakeAudioEngine {
  private finishPlaybackRequest?: () => void
  private failPlaybackRequest?: (error: Error) => void
  private finishSeekRequest?: () => void
  private failSeekRequest?: (error: Error) => void
  private finishFastSeekRequest?: () => void
  private failFastSeekRequest?: (error: Error) => void
  private finishQualityRequest?: () => void
  private failQualityRequest?: (error: Error) => void

  override play(): Promise<void> {
    this.playCalls += 1
    return new Promise<void>((resolve, reject) => {
      this.finishPlaybackRequest = resolve
      this.failPlaybackRequest = reject
    })
  }

  override seek(seconds: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.finishSeekRequest = () => {
        this.currentTime = seconds
        resolve()
      }
      this.failSeekRequest = reject
    })
  }

  override fastSeek(seconds: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.finishFastSeekRequest = () => {
        this.fastSeekCalls.push(seconds)
        this.currentTime = seconds
        resolve()
      }
      this.failFastSeekRequest = reject
    })
  }

  override setAdaptiveQuality(variantId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.finishQualityRequest = () => {
        this.adaptiveQualitySelection = variantId
        resolve()
      }
      this.failQualityRequest = reject
    })
  }

  finishPlayback(): void {
    this.finishPlaybackRequest?.()
  }

  finishSeek(): void {
    this.finishSeekRequest?.()
  }

  finishFastSeek(): void {
    this.finishFastSeekRequest?.()
  }

  finishQualitySelection(): void {
    this.finishQualityRequest?.()
  }

  failPlayback(error: Error): void {
    this.failPlaybackRequest?.(error)
  }

  failSeek(error: Error): void {
    this.failSeekRequest?.(error)
  }

  failFastSeek(error: Error): void {
    this.failFastSeekRequest?.(error)
  }

  failQualitySelection(error: Error): void {
    this.failQualityRequest?.(error)
  }
}

class ThrowingUnsubscribeAudioEngine extends FakeAudioEngine {
  readonly removalError = new Error('listener removal failed')
  removalCalls = 0
  private shouldThrowOnRemoval = true

  override on<EventName extends keyof AudioEngineEvents>(
    eventName: EventName,
    handler: (payload: AudioEngineEvents[EventName]) => void,
  ): () => void {
    const removeListener = super.on(eventName, handler)
    return () => {
      this.removalCalls += 1
      removeListener()
      if (this.shouldThrowOnRemoval) {
        this.shouldThrowOnRemoval = false
        throw this.removalError
      }
    }
  }
}

class PartiallyThrowingBindAudioEngine extends FakeAudioEngine {
  readonly bindingError = new Error('event binding failed')
  removalCalls = 0
  private bindingCalls = 0
  private shouldThrowOnBinding = true

  override on<EventName extends keyof AudioEngineEvents>(
    eventName: EventName,
    handler: (payload: AudioEngineEvents[EventName]) => void,
  ): () => void {
    this.bindingCalls += 1
    if (this.shouldThrowOnBinding && this.bindingCalls === 3) {
      this.shouldThrowOnBinding = false
      throw this.bindingError
    }
    const removeListener = super.on(eventName, handler)
    return () => {
      this.removalCalls += 1
      removeListener()
    }
  }
}

class ReentrantBindAudioEngine extends FakeAudioEngine {
  removalCalls = 0
  onFirstRegistration?: () => void

  override on<EventName extends keyof AudioEngineEvents>(
    eventName: EventName,
    handler: (payload: AudioEngineEvents[EventName]) => void,
  ): () => void {
    const removeListener = super.on(eventName, handler)
    const onFirstRegistration = this.onFirstRegistration
    this.onFirstRegistration = undefined
    onFirstRegistration?.()
    return () => {
      this.removalCalls += 1
      removeListener()
    }
  }
}

class ReentrantSettingsAudioEngine extends FakeAudioEngine {
  readonly settingsError = new Error('obsolete settings failed')
  onPreloadChange?: () => void

  override setPreload(preload: Parameters<FakeAudioEngine['setPreload']>[0]): void {
    super.setPreload(preload)
    const onPreloadChange = this.onPreloadChange
    this.onPreloadChange = undefined
    if (onPreloadChange) {
      onPreloadChange()
      throw this.settingsError
    }
  }
}

class ReentrantVolumeFailureAudioEngine extends FakeAudioEngine {
  readonly volumeError = new Error('obsolete volume change failed')
  onVolumeChange?: () => void

  override setVolume(volume: number): void {
    super.setVolume(volume)
    const onVolumeChange = this.onVolumeChange
    this.onVolumeChange = undefined
    if (onVolumeChange) {
      // AI modified: model a newer accepted setting before the outer engine call reports failure.
      onVolumeChange()
      throw this.volumeError
    }
  }
}

interface RejectedMediaSettingCase {
  readonly settingName: string
  readonly rejectSetting: (engine: FakeAudioEngine, settingError: Error) => void
  readonly updateSetting: (router: AudioEngineRouter) => void
  readonly currentSetting: (engine: FakeAudioEngine) => unknown
  readonly initialSetting: unknown
}

const rejectedMediaSettingCases = [
  {
    settingName: 'preload',
    rejectSetting: (engine, settingError) => {
      vi.spyOn(engine, 'setPreload').mockImplementation(() => {
        throw settingError
      })
    },
    updateSetting: router => router.setPreload('auto'),
    currentSetting: engine => engine.preload,
    initialSetting: 'metadata',
  },
  {
    settingName: 'autoplay',
    rejectSetting: (engine, settingError) => {
      vi.spyOn(engine, 'setAutoplay').mockImplementation(() => {
        throw settingError
      })
    },
    updateSetting: router => router.setAutoplay(true),
    currentSetting: engine => engine.autoplay,
    initialSetting: false,
  },
  {
    settingName: 'volume',
    rejectSetting: (engine, settingError) => {
      vi.spyOn(engine, 'setVolume').mockImplementation(() => {
        throw settingError
      })
    },
    updateSetting: router => router.setVolume(0.25),
    currentSetting: engine => engine.volume,
    initialSetting: 1,
  },
  {
    settingName: 'muted',
    rejectSetting: (engine, settingError) => {
      vi.spyOn(engine, 'setMuted').mockImplementation(() => {
        throw settingError
      })
    },
    updateSetting: router => router.setMuted(true),
    currentSetting: engine => engine.muted,
    initialSetting: false,
  },
  {
    settingName: 'loop',
    rejectSetting: (engine, settingError) => {
      vi.spyOn(engine, 'setLoop').mockImplementation(() => {
        throw settingError
      })
    },
    updateSetting: router => router.setLoop(true),
    currentSetting: engine => engine.looping,
    initialSetting: false,
  },
  {
    settingName: 'playback rate',
    rejectSetting: (engine, settingError) => {
      vi.spyOn(engine, 'setPlaybackRate').mockImplementation(() => {
        throw settingError
      })
    },
    updateSetting: router => router.setPlaybackRate(1.5),
    currentSetting: engine => engine.playbackRate,
    initialSetting: 1,
  },
  {
    settingName: 'pitch preservation',
    rejectSetting: (engine, settingError) => {
      vi.spyOn(engine, 'setPreservesPitch').mockImplementation(() => {
        throw settingError
      })
    },
    updateSetting: router => router.setPreservesPitch(false),
    currentSetting: engine => engine.preservesPitch,
    initialSetting: true,
  },
] satisfies readonly RejectedMediaSettingCase[]

class FakeAnalyzer {
  dispose(): void {}

  connect(): void {}

  getFrequencyData(): Uint8Array {
    return new Uint8Array()
  }

  getWaveformData(): Uint8Array {
    return new Uint8Array()
  }
}

class AnalyzerAudioEngine extends FakeAudioEngine {
  readonly analyzerFftSizes: Array<number | undefined> = []

  createAnalyzer(options: { fftSize?: number } = {}): AudioAnalyzer {
    this.analyzerFftSizes.push(options.fftSize)
    return new FakeAnalyzer() as unknown as AudioAnalyzer
  }
}

class RetryableDisposeAudioEngine extends FakeAudioEngine {
  readonly disposalError = new Error('engine disposal failed')
  private disposalFailuresRemaining = 1

  override async dispose(): Promise<void> {
    await super.dispose()
    if (this.disposalFailuresRemaining > 0) {
      this.disposalFailuresRemaining -= 1
      throw this.disposalError
    }
  }
}

class DeferredDisposeAudioEngine extends FakeAudioEngine {
  private finishCleanup: (() => void) | undefined
  private readonly cleanup = new Promise<void>((resolve) => {
    this.finishCleanup = resolve
  })

  override async dispose(): Promise<void> {
    await super.dispose()
    await this.cleanup
  }

  completeCleanup(): void {
    this.finishCleanup?.()
  }
}

class AdversarialCapabilityAudioEngine extends FakeAudioEngine {
  readonly capabilityError = new Error('engine capability check failed')
  onCapabilityCheck?: () => void
  shouldThrowOnCapabilityCheck = false

  override canPlayType(mimeType: string): ReturnType<FakeAudioEngine['canPlayType']> {
    this.onCapabilityCheck?.()
    if (this.shouldThrowOnCapabilityCheck) {
      throw this.capabilityError
    }
    return super.canPlayType(mimeType)
  }
}

describe('audioEngineRouter', () => {
  it('routes adaptive and ordinary sources to matching engines', async () => {
    const mediaEngine = new FakeAudioEngine()
    const hlsEngine = new FakeAudioEngine()
    const dashEngine = new FakeAudioEngine()
    const hlsAdapter = new FakeAdapter('hls', hlsEngine)
    const dashAdapter = new FakeAdapter('dash', dashEngine)
    const router = new AudioEngineRouter({
      adapters: [hlsAdapter, dashAdapter],
      mediaEngineFactory: () => mediaEngine,
    })

    await router.load(new HttpAudioSource('/stream.m3u8'))
    expect(hlsAdapter.createCalls).toBe(1)
    expect(hlsEngine.loadedSources).toHaveLength(1)

    await router.load(new HttpAudioSource('/stream.mpd'))
    expect(dashAdapter.createCalls).toBe(1)
    expect(dashEngine.loadedSources).toHaveLength(1)

    await router.load(new HttpAudioSource('/episode.mp3'))
    expect(mediaEngine.loadedSources).toHaveLength(1)
  })

  it('rejects a never-settling routed load with the exact fatal engine error', async () => {
    const engine = new DelayedRejectingLoadEngine()
    const router = new AudioEngineRouter({ mediaEngineFactory: () => engine })
    const fatalError = new GAudioError('ENGINE_ERROR', 'Routed load failed')
    const publishedErrors: GAudioError[] = []
    router.on('error', error => publishedErrors.push(error))

    const loading = router.load(new HttpAudioSource('/episode.mp3'))
    await vi.waitFor(() => expect(engine.loadedSources).toHaveLength(1))
    engine.emit('error', fatalError)

    // AI modified: the load session abort gate preserves canonical fatal identity without engine settlement.
    await expect(loading).rejects.toBe(fatalError)
    expect(publishedErrors).toEqual([fatalError])
    engine.failLoad()
    await Promise.resolve()
  })

  it('rejects a new load after disposal without creating another engine', async () => {
    const mediaEngineFactory = vi.fn(() => new FakeAudioEngine())
    const router = new AudioEngineRouter({ mediaEngineFactory })
    router.dispose()

    // AI modified: permanent disposal must reject before any source or browser resource is created.
    await expect(router.load(new HttpAudioSource('/episode.mp3'))).rejects.toMatchObject({
      code: 'ENGINE_ERROR',
    })
    expect(mediaEngineFactory).not.toHaveBeenCalled()
  })

  it('rejects a load that reentrantly aborts before the router starts waiting', async () => {
    const engine = new FakeAudioEngine()
    const router = new AudioEngineRouter({ mediaEngineFactory: () => engine })
    vi.spyOn(engine, 'load').mockImplementation(() => {
      router.unload()
      return new Promise<void>(() => {})
    })

    // AI modified: synchronous engine reentrancy must not strand an already-aborted router wait.
    await expect(router.load(new HttpAudioSource('/episode.mp3'))).rejects.toMatchObject({
      code: 'LOAD_ABORTED',
    })
    expect(engine.unloadCalls).toBe(1)
  })

  it.each([
    [
      'play',
      (router: AudioEngineRouter) => router.play(),
      (engine: DeferredRouterControlEngine, error: Error) => engine.failPlayback(error),
    ],
    [
      'seek',
      (router: AudioEngineRouter) => router.seek(24),
      (engine: DeferredRouterControlEngine, error: Error) => engine.failSeek(error),
    ],
    [
      'fastSeek',
      (router: AudioEngineRouter) => router.fastSeek(24),
      (engine: DeferredRouterControlEngine, error: Error) => engine.failFastSeek(error),
    ],
    [
      'setAdaptiveQuality',
      (router: AudioEngineRouter) => router.setAdaptiveQuality('high'),
      (engine: DeferredRouterControlEngine, error: Error) => engine.failQualitySelection(error),
    ],
  ] as const)(
    'rejects %s promptly on router disposal and observes a late engine rejection',
    async (_operationName, startOperation, failOperation) => {
      const engine = new DeferredRouterControlEngine()
      const router = new AudioEngineRouter({ mediaEngineFactory: () => engine })
      await router.load(new HttpAudioSource('/episode.mp3'))

      const operation = startOperation(router)
      const operationExpectation = expect(operation).rejects.toMatchObject({ code: 'ENGINE_ERROR' })
      router.dispose()

      // AI modified: disposal does not wait for custom-engine cooperation and late rejection stays observed.
      await operationExpectation
      failOperation(engine, new Error('Late engine rejection after router disposal'))
      await Promise.resolve()
      await expect(startOperation(router)).rejects.toMatchObject({ code: 'ENGINE_ERROR' })
    },
  )

  it('rejects a delayed routed control after a replacement source takes ownership', async () => {
    const hlsEngine = new DeferredRouterControlEngine()
    const mediaEngine = new FakeAudioEngine()
    const router = new AudioEngineRouter({
      adapters: [new FakeAdapter('hls', hlsEngine)],
      mediaEngineFactory: () => mediaEngine,
    })
    await router.load(new HttpAudioSource('/stream.m3u8'))

    const playing = router.play()
    const playbackExpectation = expect(playing).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    await router.load(new HttpAudioSource('/episode.mp3'))

    // AI modified: a new source terminates the old control before its engine promise settles.
    await playbackExpectation
    hlsEngine.failPlayback(new Error('Late old-source playback rejection'))
    await Promise.resolve()
    expect(mediaEngine.loadedSources.map(source => source.url)).toEqual(['/episode.mp3'])
  })

  it('does not report control success after a replacement source takes ownership', async () => {
    const hlsEngine = new FakeAudioEngine()
    const mediaEngine = new FakeAudioEngine()
    const router = new AudioEngineRouter({
      adapters: [new FakeAdapter('hls', hlsEngine)],
      mediaEngineFactory: () => mediaEngine,
    })
    await router.load(new HttpAudioSource('/stream.m3u8'))
    let finishPlayback: () => void = () => {}
    const enginePlayback = new Promise<void>((resolve) => {
      finishPlayback = resolve
    })
    vi.spyOn(hlsEngine, 'play').mockReturnValue(enginePlayback)

    const playing = router.play()
    let replacementLoad: Promise<void> | undefined
    void enginePlayback.then(() => {
      replacementLoad = router.load(new HttpAudioSource('/episode.mp3'))
    })
    finishPlayback()

    // AI modified: a settled engine control is still rejected when its routed ownership is no longer current.
    await expect(playing).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    await vi.waitFor(() => expect(replacementLoad).toBeDefined())
    await replacementLoad
    expect(mediaEngine.loadedSources.map(source => source.url)).toEqual(['/episode.mp3'])
  })

  it.each([
    [
      'play',
      (router: AudioEngineRouter) => router.play(),
      (engine: DeferredRouterControlEngine) => engine.finishPlayback(),
    ],
    [
      'seek',
      (router: AudioEngineRouter) => router.seek(24),
      (engine: DeferredRouterControlEngine) => engine.finishSeek(),
    ],
    [
      'fastSeek',
      (router: AudioEngineRouter) => router.fastSeek(24),
      (engine: DeferredRouterControlEngine) => engine.finishFastSeek(),
    ],
    [
      'setAdaptiveQuality',
      (router: AudioEngineRouter) => router.setAdaptiveQuality('high'),
      (engine: DeferredRouterControlEngine) => engine.finishQualitySelection(),
    ],
  ] as const)(
    'rejects a never-settling routed %s with the exact fatal engine error',
    async (_operationName, startOperation, finishOperation) => {
      const engine = new DeferredRouterControlEngine()
      const router = new AudioEngineRouter({ mediaEngineFactory: () => engine })
      const fatalError = new GAudioError('ENGINE_ERROR', 'Routed control failed')
      const publishedErrors: GAudioError[] = []
      router.on('error', error => publishedErrors.push(error))
      await router.load(new HttpAudioSource('/episode.mp3'))

      const operation = startOperation(router)
      engine.emit('error', fatalError)

      // AI modified: the fatal event independently settles the public control with canonical identity.
      await expect(operation).rejects.toBe(fatalError)
      expect(publishedErrors).toEqual([fatalError])
      finishOperation(engine)
      await Promise.resolve()
    },
  )

  it.each(['pause', 'stop'] as const)(
    '%s promptly supersedes a never-settling routed play',
    async (control) => {
      const engine = new DeferredRouterControlEngine()
      const router = new AudioEngineRouter({ mediaEngineFactory: () => engine })
      await router.load(new HttpAudioSource('/episode.mp3'))

      const playing = router.play()
      router[control]()

      await expect(playing).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
      engine.failPlayback(new Error(`Late playback rejection after ${control}`))
      await Promise.resolve()
    },
  )

  it('transfers media settings before loading a replacement engine', async () => {
    const hlsEngine = new FakeAudioEngine()
    const dashEngine = new FakeAudioEngine()
    const router = new AudioEngineRouter({
      adapters: [new FakeAdapter('hls', hlsEngine), new FakeAdapter('dash', dashEngine)],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })

    router.setPreload('auto')
    router.setVolume(0.4)
    router.setMuted(true)
    router.setLoop(true)
    router.setPlaybackRate(1.5)
    router.setPreservesPitch(false)
    await router.load(new HttpAudioSource('/stream.m3u8'))
    await router.load(new HttpAudioSource('/stream.mpd'))

    expect(dashEngine.preload).toBe('auto')
    expect(dashEngine.volume).toBe(0.4)
    expect(dashEngine.muted).toBe(true)
    expect(dashEngine.looping).toBe(true)
    expect(dashEngine.playbackRate).toBe(1.5)
    expect(dashEngine.preservesPitch).toBe(false)
    expect(hlsEngine.disposeCalls).toBe(1)
  })

  it.each(rejectedMediaSettingCases)(
    'does not transfer a rejected $settingName change to a replacement engine',
    async ({ rejectSetting, updateSetting, currentSetting, initialSetting }) => {
      const hlsEngine = new FakeAudioEngine()
      const dashEngine = new FakeAudioEngine()
      const router = new AudioEngineRouter({
        adapters: [new FakeAdapter('hls', hlsEngine), new FakeAdapter('dash', dashEngine)],
      })
      await router.load(new HttpAudioSource('/stream.m3u8'))
      const settingError = new Error('engine rejected media setting')
      rejectSetting(hlsEngine, settingError)

      expect(() => updateSetting(router)).toThrow(settingError)
      await router.load(new HttpAudioSource('/stream.mpd'))

      // AI modified: a failed engine write must not become the next protocol engine's initial state.
      expect(currentSetting(dashEngine)).toBe(initialSetting)
    },
  )

  it('preserves a newer reentrant media setting when the older engine call throws', async () => {
    const hlsEngine = new ReentrantVolumeFailureAudioEngine()
    const dashEngine = new FakeAudioEngine()
    const router = new AudioEngineRouter({
      adapters: [new FakeAdapter('hls', hlsEngine), new FakeAdapter('dash', dashEngine)],
    })
    await router.load(new HttpAudioSource('/stream.m3u8'))
    hlsEngine.onVolumeChange = () => router.setVolume(0.75)

    expect(() => router.setVolume(0.25)).toThrow(hlsEngine.volumeError)
    await router.load(new HttpAudioSource('/stream.mpd'))

    expect(dashEngine.volume).toBe(0.75)
  })

  it('restores the original media setting when nested and outer reentrant writes both fail', async () => {
    const hlsEngine = new FakeAudioEngine()
    const dashEngine = new FakeAudioEngine()
    const router = new AudioEngineRouter({
      adapters: [new FakeAdapter('hls', hlsEngine), new FakeAdapter('dash', dashEngine)],
    })
    await router.load(new HttpAudioSource('/stream.m3u8'))
    const outerSettingError = new Error('outer media setting failed')
    const nestedSettingError = new Error('nested media setting failed')
    const applyVolume = hlsEngine.setVolume.bind(hlsEngine)
    let observedNestedError: unknown
    vi.spyOn(hlsEngine, 'setVolume').mockImplementation((volume) => {
      if (volume === 0.25) {
        applyVolume(volume)
        try {
          router.setVolume(0.75)
        }
        catch (error) {
          observedNestedError = error
        }
        throw outerSettingError
      }
      if (volume === 0.75) {
        throw nestedSettingError
      }
      applyVolume(volume)
    })

    expect(() => router.setVolume(0.25)).toThrow(outerSettingError)
    expect(observedNestedError).toBe(nestedSettingError)
    await router.load(new HttpAudioSource('/stream.mpd'))

    // AI modified: nested rejection hands cache ownership back so the outer rejection can restore the original value.
    expect(dashEngine.volume).toBe(1)
  })

  it('does not create a replacement until the previous engine retires successfully', async () => {
    const hlsEngine = new RetryableDisposeAudioEngine()
    const dashEngine = new RetryableDisposeAudioEngine()
    const mediaEngine = new FakeAudioEngine()
    const router = new AudioEngineRouter({
      adapters: [
        new FakeAdapter('hls', hlsEngine),
        new FakeAdapter('dash', dashEngine),
      ],
      mediaEngineFactory: () => mediaEngine,
    })
    await router.load(new HttpAudioSource('/stream.m3u8'))

    await expect(router.load(new HttpAudioSource('/stream.mpd'))).rejects.toBe(hlsEngine.disposalError)

    expect(hlsEngine.disposeCalls).toBe(1)
    expect(dashEngine.disposeCalls).toBe(0)
    await expect(router.play()).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' })

    await router.load(new HttpAudioSource('/episode.mp3'))
    // AI modified: the next load retries the failed owner before creating any replacement.
    expect(hlsEngine.disposeCalls).toBe(2)
    expect(dashEngine.disposeCalls).toBe(0)
    expect(mediaEngine.loadedSources.map(source => source.url)).toEqual(['/episode.mp3'])
  })

  it('fails clearly when a selected adapter is missing or unsupported', async () => {
    const missingRouter = new AudioEngineRouter({
      adapters: [],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })
    const unsupportedRouter = new AudioEngineRouter({
      adapters: [new FakeAdapter('dash', new FakeAudioEngine(), false)],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })

    await expect(missingRouter.load(new HttpAudioSource('/stream.m3u8'))).rejects.toMatchObject({
      code: 'ADAPTER_UNAVAILABLE',
    })
    await expect(unsupportedRouter.load(new HttpAudioSource('/stream.mpd'))).rejects.toMatchObject({
      code: 'PROTOCOL_UNSUPPORTED',
    })
  })

  it('rejects duplicate protocols and concurrent adapter ownership', async () => {
    const sharedAdapter = new FakeAdapter('hls', new FakeAudioEngine())

    expect(() => new AudioEngineRouter({
      adapters: [sharedAdapter, new FakeAdapter('hls', new FakeAudioEngine())],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })).toThrow(TypeError)

    const firstRouter = new AudioEngineRouter({
      adapters: [sharedAdapter],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })
    expect(() => new AudioEngineRouter({
      adapters: [sharedAdapter],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })).toThrow(TypeError)

    await firstRouter.dispose()

    expect(() => new AudioEngineRouter({
      adapters: [sharedAdapter],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })).not.toThrow()
  })

  it('forwards only events from the active engine', async () => {
    const hlsEngine = new FakeAudioEngine()
    const dashEngine = new FakeAudioEngine()
    const router = new AudioEngineRouter({
      adapters: [new FakeAdapter('hls', hlsEngine), new FakeAdapter('dash', dashEngine)],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })
    const durations: number[] = []
    router.on('durationchange', ({ duration }) => durations.push(duration))

    await router.load(new HttpAudioSource('/stream.m3u8'))
    hlsEngine.emit('durationchange', { duration: 10 })
    await router.load(new HttpAudioSource('/stream.mpd'))
    hlsEngine.emit('durationchange', { duration: 20 })
    dashEngine.emit('durationchange', { duration: 30 })

    expect(durations).toEqual([10, 30])
  })

  it('rolls back a partially bound custom engine event session', async () => {
    const hlsEngine = new PartiallyThrowingBindAudioEngine()
    const router = new AudioEngineRouter({ adapters: [new FakeAdapter('hls', hlsEngine)] })
    const durations: number[] = []
    router.on('durationchange', ({ duration }) => durations.push(duration))

    await expect(router.load(new HttpAudioSource('/stream.m3u8'))).rejects.toBe(hlsEngine.bindingError)
    hlsEngine.emit('durationchange', { duration: 10 })

    expect(hlsEngine.removalCalls).toBe(2)
    expect(durations).toEqual([])

    await router.load(new HttpAudioSource('/replacement.m3u8'))
    hlsEngine.emit('durationchange', { duration: 20 })
    expect(durations).toEqual([20])
  })

  it('does not load after a reentrant unload supersedes event binding', async () => {
    const engine = new ReentrantBindAudioEngine()
    const adapter = new FakeAdapter('hls', engine)
    const router = new AudioEngineRouter({ adapters: [adapter] })
    engine.onFirstRegistration = () => router.unload()

    await expect(router.load(new HttpAudioSource('/stream.m3u8'))).rejects.toMatchObject({
      code: 'LOAD_ABORTED',
    })

    expect(engine.loadedSources).toEqual([])
    expect(engine.unloadCalls).toBe(1)
    expect(engine.removalCalls).toBe(1)
  })

  it('does not dispose an engine claimed by a newer load when obsolete settings throw', async () => {
    const engine = new ReentrantSettingsAudioEngine()
    const router = new AudioEngineRouter({
      adapters: [new FakeAdapter('hls', engine)],
    })
    let replacementLoad: Promise<void> | undefined
    engine.onPreloadChange = () => {
      replacementLoad = router.load(new HttpAudioSource('/replacement.m3u8'))
    }

    const obsoleteLoad = router.load(new HttpAudioSource('/obsolete.m3u8'))
    await expect(obsoleteLoad).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    expect(replacementLoad).toBeDefined()
    await expect(replacementLoad).resolves.toBeUndefined()

    // AI modified: the current load retains its engine when an obsolete settings stack unwinds.
    expect(engine.disposeCalls).toBe(0)
    await expect(router.play()).resolves.toBeUndefined()
  })

  it('keeps a delayed older adapter from replacing the latest engine', async () => {
    const delayedEngine = new FakeAudioEngine()
    const mediaEngine = new FakeAudioEngine()
    const delayedAdapter = new DelayedAdapter(delayedEngine)
    const router = new AudioEngineRouter({
      adapters: [delayedAdapter],
      mediaEngineFactory: () => mediaEngine,
    })

    const olderLoad = router.load(new HttpAudioSource('/stream.m3u8'))
    const olderLoadExpectation = expect(olderLoad).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    await vi.waitFor(() => {
      expect(delayedAdapter.createCalls).toBe(1)
    })
    await router.load(new HttpAudioSource('/episode.mp3'))
    delayedAdapter.finishCreation()

    await olderLoadExpectation
    await vi.waitFor(() => {
      expect(delayedEngine.disposeCalls).toBe(1)
    })
    expect(mediaEngine.disposeCalls).toBe(0)
    expect(mediaEngine.loadedSources.map(source => source.url)).toEqual(['/episode.mp3'])
  })

  it('retries disposal of a stale factory engine during the next lifecycle operation', async () => {
    const delayedEngine = new RetryableDisposeAudioEngine()
    const mediaEngine = new FakeAudioEngine()
    const delayedAdapter = new DelayedAdapter(delayedEngine)
    const router = new AudioEngineRouter({
      adapters: [delayedAdapter],
      mediaEngineFactory: () => mediaEngine,
    })

    const obsoleteLoad = router.load(new HttpAudioSource('/stream.m3u8'))
    const obsoleteLoadExpectation = expect(obsoleteLoad).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    await vi.waitFor(() => {
      expect(delayedAdapter.createCalls).toBe(1)
    })
    await router.load(new HttpAudioSource('/episode.mp3'))
    delayedAdapter.finishCreation()
    await obsoleteLoadExpectation

    await vi.waitFor(() => {
      expect(delayedEngine.disposeCalls).toBe(1)
    })
    await Promise.resolve()
    await Promise.resolve()

    router.unload()

    await vi.waitFor(() => {
      expect(delayedEngine.disposeCalls).toBe(2)
    })
    expect(mediaEngine.unloadCalls).toBe(1)
  })

  it('reports a delayed obsolete adapter rejection as an aborted load', async () => {
    const delayedAdapter = new DelayedRejectingAdapter()
    const mediaEngine = new FakeAudioEngine()
    const router = new AudioEngineRouter({
      adapters: [delayedAdapter],
      mediaEngineFactory: () => mediaEngine,
    })

    const olderLoad = router.load(new HttpAudioSource('/stream.m3u8'))
    const olderLoadExpectation = expect(olderLoad).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    await vi.waitFor(() => {
      expect(delayedAdapter.createCalls).toBe(1)
    })
    await router.load(new HttpAudioSource('/episode.mp3'))
    delayedAdapter.failCreation()

    await olderLoadExpectation
    expect(mediaEngine.loadedSources.map(source => source.url)).toEqual(['/episode.mp3'])
  })

  it('invalidates old engine events while a newer adapter factory is pending or fails', async () => {
    const delayedAdapter = new DelayedRejectingAdapter()
    const mediaEngine = new FakeAudioEngine()
    const router = new AudioEngineRouter({
      adapters: [delayedAdapter],
      mediaEngineFactory: () => mediaEngine,
    })
    const durations: number[] = []
    router.on('durationchange', ({ duration }) => durations.push(duration))
    await router.load(new HttpAudioSource('/episode.mp3'))
    mediaEngine.emit('durationchange', { duration: 10 })

    const replacementLoad = router.load(new HttpAudioSource('/stream.m3u8'))
    mediaEngine.emit('durationchange', { duration: 20 })
    delayedAdapter.failCreation()
    await expect(replacementLoad).rejects.toBe(delayedAdapter.creationError)
    mediaEngine.emit('durationchange', { duration: 30 })

    expect(durations).toEqual([10])

    await router.load(new HttpAudioSource('/replacement.mp3'))
    mediaEngine.emit('durationchange', { duration: 40 })
    expect(durations).toEqual([10, 40])
  })

  it('reports a delayed obsolete engine load rejection as an aborted load', async () => {
    const delayedEngine = new DelayedRejectingLoadEngine()
    const mediaEngine = new FakeAudioEngine()
    const router = new AudioEngineRouter({
      adapters: [new FakeAdapter('hls', delayedEngine)],
      mediaEngineFactory: () => mediaEngine,
    })

    const olderLoad = router.load(new HttpAudioSource('/stream.m3u8'))
    const olderLoadExpectation = expect(olderLoad).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    await Promise.resolve()
    await router.load(new HttpAudioSource('/episode.mp3'))
    delayedEngine.failLoad()

    await olderLoadExpectation
    expect(mediaEngine.loadedSources.map(source => source.url)).toEqual(['/episode.mp3'])
  })

  it('disposes an engine whose creation finishes after router disposal', async () => {
    const delayedEngine = new FakeAudioEngine()
    const delayedAdapter = new DelayedAdapter(delayedEngine)
    const router = new AudioEngineRouter({ adapters: [delayedAdapter] })

    const loading = router.load(new HttpAudioSource('/stream.m3u8'))
    const loadingExpectation = expect(loading).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    await vi.waitFor(() => {
      expect(delayedAdapter.createCalls).toBe(1)
    })
    const disposal = router.dispose()
    delayedAdapter.finishCreation()

    await loadingExpectation
    await vi.waitFor(() => {
      expect(delayedEngine.disposeCalls).toBe(1)
    })
    await disposal
    expect(delayedEngine.loadedSources).toEqual([])
  })

  it('forwards each load request policy to the selected engine without retaining it', async () => {
    const engine = new FakeAudioEngine()
    const loadSource = vi.fn<AudioEngine['load']>(async () => {})
    engine.load = loadSource
    const router = new AudioEngineRouter({ adapters: [new FakeAdapter('hls', engine)] })
    const source = new HttpAudioSource('/stream.m3u8')
    const options: AudioEngineLoadOptions = { crossOrigin: 'use-credentials' }

    await router.load(source, options)
    await router.load(source)

    expect(loadSource.mock.calls[0]?.[0]).toBe(source)
    expect(loadSource.mock.calls[0]?.[1]).toBe(options)
    expect(loadSource).toHaveBeenLastCalledWith(source, undefined)
    await router.dispose()
  })

  it.each(Array.from({ length: 20 }, (_, microtasks) => microtasks))(
    'retains player engine ownership when disposed after %i microtasks',
    async (microtasks) => {
      const engine = new FakeAudioEngine()
      const adapter = new FakeAdapter('hls', engine)
      const player = new AudioPlayer({ source: '/stream.m3u8', adapters: [adapter] })
      const loading = player.load().catch(() => {})

      // AI modified: cancellation at each asynchronous handoff must still retire every created engine.
      for (let turn = 0; turn < microtasks; turn += 1) {
        await Promise.resolve()
      }
      await player.dispose()
      await loading

      expect(engine.disposeCalls).toBe(adapter.createCalls)
      const nextPlayer = new AudioPlayer({ adapters: [adapter] })
      await nextPlayer.dispose()
    },
  )

  it.each(Array.from({ length: 12 }, (_, microtasks) => microtasks))(
    'retains native engine ownership when disposed after %i microtasks',
    async (microtasks) => {
      const engine = new FakeAudioEngine()
      const createEngine = vi.fn(() => engine)
      const router = new AudioEngineRouter({ mediaEngineFactory: createEngine })
      const loading = router.load(new HttpAudioSource('/episode.mp3')).catch(() => {})

      for (let turn = 0; turn < microtasks; turn += 1) {
        await Promise.resolve()
      }
      await router.dispose()
      await loading

      expect(engine.disposeCalls).toBe(createEngine.mock.calls.length)
    },
  )

  it('waits for engine cleanup when disposal reenters an adapter factory', async () => {
    const engine = new DeferredDisposeAudioEngine()
    const adapter = new FakeAdapter('hls', engine)
    const router = new AudioEngineRouter({ adapters: [adapter] })
    let disposal: Promise<void> | undefined
    let hasDisposed = false
    vi.spyOn(adapter, 'createEngine').mockImplementation(() => {
      disposal = router.dispose().then(() => {
        hasDisposed = true
      })
      return engine
    })

    await expect(router.load(new HttpAudioSource('/stream.m3u8'))).rejects.toMatchObject({
      code: 'LOAD_ABORTED',
    })
    await vi.waitFor(() => expect(engine.disposeCalls).toBe(1))

    expect(hasDisposed).toBe(false)
    expect(() => new AudioEngineRouter({ adapters: [adapter] })).toThrow(TypeError)
    engine.completeCleanup()
    await disposal
    expect(hasDisposed).toBe(true)
    const nextRouter = new AudioEngineRouter({ adapters: [adapter] })
    await nextRouter.dispose()
  })

  it('retries engine cleanup when disposal reenters an adapter factory', async () => {
    const engine = new RetryableDisposeAudioEngine()
    const adapter = new FakeAdapter('hls', engine)
    const router = new AudioEngineRouter({ adapters: [adapter] })
    let disposalFailure: unknown
    let disposal: Promise<void> | undefined
    vi.spyOn(adapter, 'createEngine').mockImplementation(() => {
      disposal = router.dispose().catch((error: unknown) => {
        disposalFailure = error
      })
      return engine
    })

    await expect(router.load(new HttpAudioSource('/stream.m3u8'))).rejects.toMatchObject({
      code: 'LOAD_ABORTED',
    })
    await disposal

    expect(disposalFailure).toBe(engine.disposalError)
    expect(() => new AudioEngineRouter({ adapters: [adapter] })).toThrow(TypeError)
    await expect(router.dispose()).resolves.toBeUndefined()
    expect(engine.disposeCalls).toBe(2)
    const nextRouter = new AudioEngineRouter({ adapters: [adapter] })
    await nextRouter.dispose()
  })

  it('keeps a pending factory load cancelled and its adapter exclusively owned', async () => {
    const adapter = new NeverSettlingAdapter()
    const router = new AudioEngineRouter({ adapters: [adapter] })
    const loading = router.load(new HttpAudioSource('/stream.m3u8'))
    const loadingExpectation = expect(loading).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    await vi.waitFor(() => {
      expect(adapter.createCalls).toBe(1)
    })

    void router.dispose()
    await loadingExpectation

    expect(() => new AudioEngineRouter({ adapters: [adapter] })).toThrow(TypeError)
  })

  it('releases a pending-factory adapter only after its late engine is cleaned', async () => {
    const delayedEngine = new RetryableDisposeAudioEngine()
    const adapter = new DelayedAdapter(delayedEngine)
    const router = new AudioEngineRouter({ adapters: [adapter] })
    const loading = router.load(new HttpAudioSource('/stream.m3u8'))
    const loadingExpectation = expect(loading).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    await vi.waitFor(() => {
      expect(adapter.createCalls).toBe(1)
    })

    const disposalExpectation = expect(router.dispose()).rejects.toBe(delayedEngine.disposalError)
    await loadingExpectation
    expect(() => new AudioEngineRouter({ adapters: [adapter] })).toThrow(TypeError)

    adapter.finishCreation()
    await vi.waitFor(() => {
      expect(delayedEngine.disposeCalls).toBe(1)
    })
    await disposalExpectation
    expect(() => new AudioEngineRouter({ adapters: [adapter] })).toThrow(TypeError)

    await expect(router.dispose()).resolves.toBeUndefined()
    const replacementRouter = new AudioEngineRouter({ adapters: [adapter] })
    await Promise.resolve()
    expect(() => new AudioEngineRouter({ adapters: [adapter] })).toThrow(TypeError)
    replacementRouter.dispose()
  })

  it('captures each adapter protocol once before claiming ownership', () => {
    const adapter = new SingleReadProtocolAdapter()

    const router = new AudioEngineRouter({ adapters: [adapter] })

    // AI modified: registration validation and ownership use one stable protocol snapshot.
    expect(adapter.protocolReads).toBe(1)
    router.dispose()
  })

  it('does not create an adapter engine after a support check transfers router ownership', async () => {
    const adapter = new ReentrantSupportAdapter()
    const router = new AudioEngineRouter({ adapters: [adapter] })
    let replacementRouter: AudioEngineRouter | undefined
    adapter.onSupportCheck = () => {
      router.dispose()
      replacementRouter = new AudioEngineRouter({ adapters: [adapter] })
    }

    await expect(router.load(new HttpAudioSource('/stream.m3u8'))).rejects.toMatchObject({
      code: 'LOAD_ABORTED',
    })

    // AI modified: a disposed router cannot create resources through an adapter now owned by its replacement.
    expect(adapter.createCalls).toBe(0)
    replacementRouter?.dispose()
  })

  it('waits for custom engine disposal before loading a cross-protocol replacement', async () => {
    const hlsEngine = new DeferredDisposeAudioEngine()
    const mediaEngine = new FakeAudioEngine()
    const router = new AudioEngineRouter({
      adapters: [new FakeAdapter('hls', hlsEngine)],
      mediaEngineFactory: () => mediaEngine,
    })
    await router.load(new HttpAudioSource('/stream.m3u8'))

    const replacementLoad = router.load(new HttpAudioSource('/episode.mp3'))
    await vi.waitFor(() => {
      expect(hlsEngine.disposeCalls).toBe(1)
    })
    expect(mediaEngine.loadedSources).toEqual([])

    hlsEngine.completeCleanup()
    await replacementLoad

    expect(mediaEngine.loadedSources.map(source => source.url)).toEqual(['/episode.mp3'])
  })

  it('waits for built-in source cleanup before creating a cross-protocol engine', async () => {
    const audioElement = new FakeAudioElement()
    const mediaEngine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const hlsEngine = new FakeAudioEngine()
    const hlsAdapter = new FakeAdapter('hls', hlsEngine)
    const router = new AudioEngineRouter({
      adapters: [hlsAdapter],
      mediaEngineFactory: () => mediaEngine,
    })
    const firstSource = new DeferredCloseAudioSource('/episode.mp3')
    const firstLoad = router.load(firstSource)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(firstSource.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await firstLoad

    const replacementLoad = router.load(new HttpAudioSource('/stream.m3u8'))
    await vi.waitFor(() => {
      expect(firstSource.closeCalls).toBe(1)
    })
    expect(hlsAdapter.createCalls).toBe(0)

    firstSource.completeClose()
    await replacementLoad

    expect(hlsAdapter.createCalls).toBe(1)
    expect(hlsEngine.loadedSources.map(source => source.url)).toEqual(['/stream.m3u8'])
  })

  it('reports failed built-in cleanup before creating a replacement and retries it', async () => {
    const audioElement = new FakeAudioElement()
    const mediaEngine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const hlsEngine = new FakeAudioEngine()
    const hlsAdapter = new FakeAdapter('hls', hlsEngine)
    const router = new AudioEngineRouter({
      adapters: [hlsAdapter],
      mediaEngineFactory: () => mediaEngine,
    })
    const source = new RetryingCloseAudioSource('/episode.mp3')
    const loading = router.load(source)
    await vi.waitFor(() => expect(audioElement.src).toBe(source.url))
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await loading

    // AI modified: a replacement cannot bypass failed source cleanup retained by the retired engine.
    await expect(router.load(new HttpAudioSource('/stream.m3u8'))).rejects.toBe(source.closeError)
    expect(source.closeCalls).toBe(1)
    expect(hlsAdapter.createCalls).toBe(0)

    await expect(router.load(new HttpAudioSource('/stream.m3u8'))).resolves.toBeUndefined()
    expect(source.closeCalls).toBe(2)
    expect(hlsAdapter.createCalls).toBe(1)
    expect(hlsEngine.loadedSources.map(loadedSource => loadedSource.url)).toEqual(['/stream.m3u8'])
  })

  it('reports a synchronous built-in source cleanup failure and retries it', async () => {
    const audioElement = new FakeAudioElement()
    const mediaEngine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const router = new AudioEngineRouter({ mediaEngineFactory: () => mediaEngine })
    const source = new RetryingCloseAudioSource('/episode.mp3')
    const loading = router.load(source)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(source.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await loading

    await expect(router.dispose()).rejects.toBe(source.closeError)
    expect(source.closeCalls).toBe(1)

    await expect(router.dispose()).resolves.toBeUndefined()
    expect(source.closeCalls).toBe(2)
  })

  it('retains adapter ownership until a failed active-engine disposal is retried', async () => {
    const activeEngine = new RetryableDisposeAudioEngine()
    const mediaCapabilityEngine = new FakeAudioEngine()
    const sharedAdapter = new FakeAdapter('hls', activeEngine)
    const router = new AudioEngineRouter({
      adapters: [sharedAdapter],
      mediaEngineFactory: () => mediaCapabilityEngine,
    })
    expect(router.canPlayType('audio/mpeg')).toBe('probably')
    await router.load(new HttpAudioSource('/stream.m3u8'))

    await expect(router.dispose()).rejects.toBe(activeEngine.disposalError)

    expect(activeEngine.disposeCalls).toBe(1)
    expect(mediaCapabilityEngine.disposeCalls).toBe(1)
    expect(() => new AudioEngineRouter({
      adapters: [sharedAdapter],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })).toThrow(TypeError)
    await expect(router.dispose()).resolves.toBeUndefined()
    expect(activeEngine.disposeCalls).toBe(2)
    const replacementRouter = new AudioEngineRouter({
      adapters: [sharedAdapter],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })
    replacementRouter.dispose()
  })

  it('invalidates events when unloading and rebinds them for a later same-protocol load', async () => {
    const hlsEngine = new FakeAudioEngine()
    const router = new AudioEngineRouter({ adapters: [new FakeAdapter('hls', hlsEngine)] })
    const durations: number[] = []
    router.on('durationchange', ({ duration }) => durations.push(duration))

    await router.load(new HttpAudioSource('/first.m3u8'))
    router.unload()
    hlsEngine.emit('durationchange', { duration: 10 })
    await router.load(new HttpAudioSource('/second.m3u8'))
    hlsEngine.emit('durationchange', { duration: 20 })

    expect(durations).toEqual([20])
  })

  it('unloads the active engine even when an event unsubscribe callback throws', async () => {
    const hlsEngine = new ThrowingUnsubscribeAudioEngine()
    const router = new AudioEngineRouter({ adapters: [new FakeAdapter('hls', hlsEngine)] })
    await router.load(new HttpAudioSource('/stream.m3u8'))

    expect(() => router.unload()).toThrow(hlsEngine.removalError)
    expect(hlsEngine.unloadCalls).toBe(1)
  })

  it('retains adapter ownership until failed listener cleanup is retried', async () => {
    const engine = new ThrowingUnsubscribeAudioEngine()
    const adapter = new FakeAdapter('hls', engine)
    const router = new AudioEngineRouter({ adapters: [adapter] })
    await router.load(new HttpAudioSource('/stream.m3u8'))

    await expect(router.dispose()).rejects.toBe(engine.removalError)
    expect(engine.disposeCalls).toBe(1)
    expect(() => new AudioEngineRouter({ adapters: [adapter] })).toThrow(TypeError)

    await expect(router.dispose()).resolves.toBeUndefined()
    expect(engine.disposeCalls).toBe(1)
    const replacementRouter = new AudioEngineRouter({ adapters: [adapter] })
    replacementRouter.dispose()
  })

  it('reports native MIME support before loading a media source', () => {
    const mediaEngine = new FakeAudioEngine({
      mimeTypeSupport: { 'audio/mpeg': 'probably' },
    })
    const router = new AudioEngineRouter({ mediaEngineFactory: () => mediaEngine })

    expect(router.canPlayType('audio/mpeg')).toBe('probably')
  })

  it('returns no support when an adapter capability probe throws', () => {
    const adapter = new ThrowingSupportAdapter()
    const router = new AudioEngineRouter({ adapters: [adapter] })

    // AI modified: capability probes stay total even when custom adapter detection is faulty.
    expect(router.canPlayType('application/vnd.apple.mpegurl')).toBe('')
    router.dispose()
  })

  it('returns no support when the active engine capability probe throws', async () => {
    const mediaEngine = new AdversarialCapabilityAudioEngine({
      mimeTypeSupport: { 'audio/mpeg': 'probably' },
    })
    const router = new AudioEngineRouter({ mediaEngineFactory: () => mediaEngine })
    await router.load(new HttpAudioSource('/episode.mp3'))
    mediaEngine.shouldThrowOnCapabilityCheck = true

    // AI modified: a custom engine failure does not escape a read-only support query.
    expect(router.canPlayType('audio/mpeg')).toBe('')
    router.dispose()
  })

  it('does not return support from an active engine that reentrantly disposes the router', async () => {
    const mediaEngine = new AdversarialCapabilityAudioEngine({
      mimeTypeSupport: { 'audio/mpeg': 'probably' },
    })
    const router = new AudioEngineRouter({ mediaEngineFactory: () => mediaEngine })
    await router.load(new HttpAudioSource('/episode.mp3'))
    mediaEngine.onCapabilityCheck = () => router.dispose()

    expect(router.canPlayType('audio/mpeg')).toBe('')
    // AI modified: a capability result cannot outlive the routed engine that produced it.
    expect(mediaEngine.disposeCalls).toBe(1)
  })

  it('disposes a media capability engine returned after its factory disposes the router', () => {
    const mediaEngine = new FakeAudioEngine({
      mimeTypeSupport: { 'audio/mpeg': 'probably' },
    })
    const router = new AudioEngineRouter({
      mediaEngineFactory: () => {
        router.dispose()
        return mediaEngine
      },
    })

    expect(router.canPlayType('audio/mpeg')).toBe('')
    // AI modified: a reentrant capability factory cannot install an engine after permanent disposal.
    expect(mediaEngine.disposeCalls).toBe(1)
  })

  it('does not report native adaptive MIME support when no matching adapter is registered', async () => {
    const mediaEngine = new FakeAudioEngine({
      mimeTypeSupport: { 'audio/mpeg': 'probably', 'audio/mpegurl': 'probably' },
    })
    const router = new AudioEngineRouter({ mediaEngineFactory: () => mediaEngine })
    await router.load(new HttpAudioSource('/episode.mp3'))

    expect(router.canPlayType('audio/mpegurl')).toBe('')
    expect(router.canPlayType('audio/mpeg')).toBe('probably')
  })

  it('creates analyzers from the active routed engine', async () => {
    const mediaEngine = new AnalyzerAudioEngine()
    const hlsEngine = new AnalyzerAudioEngine()
    const router = new AudioEngineRouter({
      adapters: [new FakeAdapter('hls', hlsEngine)],
      mediaEngineFactory: () => mediaEngine,
    })

    expect(router.createAnalyzer({ fftSize: 512 })).toBeUndefined()

    await router.load(new HttpAudioSource('/episode.mp3'))
    expect(router.createAnalyzer({ fftSize: 1024 })).toBeDefined()
    await router.load(new HttpAudioSource('/stream.m3u8'))
    expect(router.createAnalyzer({ fftSize: 2048 })).toBeDefined()

    expect(mediaEngine.analyzerFftSizes).toEqual([1024])
    expect(hlsEngine.analyzerFftSizes).toEqual([2048])
  })

  it('forwards adaptive quality controls to the active routed engine', async () => {
    const hlsEngine = new FakeAudioEngine()
    hlsEngine.activeAdaptivePlayback = { protocol: 'hls', implementation: 'hls.js' }
    hlsEngine.adaptiveVariants.push({ id: '128k', bitrate: 128_000 })
    const router = new AudioEngineRouter({
      adapters: [new FakeAdapter('hls', hlsEngine)],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })

    expect(router.getAdaptiveVariants()).toEqual([])
    expect(router.getAdaptiveQualitySelection()).toBe('auto')
    expect(router.getActiveAdaptivePlayback()).toBeUndefined()

    await router.load(new HttpAudioSource('/stream.m3u8'))
    await router.setAdaptiveQuality('128k')

    expect(router.getActiveAdaptivePlayback()).toEqual({ protocol: 'hls', implementation: 'hls.js' })
    const activePlayback = router.getActiveAdaptivePlayback()
    if (!activePlayback) {
      throw new Error('Expected routed adaptive playback diagnostics')
    }
    Reflect.set(activePlayback, 'protocol', 'dash')
    Reflect.set(activePlayback, 'implementation', 'dash.js')
    expect(hlsEngine.activeAdaptivePlayback).toEqual({ protocol: 'hls', implementation: 'hls.js' })
    expect(router.getActiveAdaptivePlayback()).toEqual({ protocol: 'hls', implementation: 'hls.js' })
    expect(router.getAdaptiveVariants()).toEqual([{ id: '128k', bitrate: 128_000 }])
    const variants = router.getAdaptiveVariants()
    const firstVariant = variants[0]
    if (!firstVariant) {
      throw new Error('Expected a routed variant snapshot')
    }
    Reflect.set(firstVariant, 'bitrate', 1)
    Reflect.set(variants, 'length', 0)
    expect(router.getAdaptiveVariants()).toEqual([{ id: '128k', bitrate: 128_000 }])
    expect(router.getAdaptiveQualitySelection()).toBe('128k')
  })

  it('isolates range snapshots returned by a custom active engine', async () => {
    const hlsEngine = new FakeAudioEngine()
    const router = new AudioEngineRouter({
      adapters: [new FakeAdapter('hls', hlsEngine)],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })
    await router.load(new HttpAudioSource('/stream.m3u8'))
    const bufferedRanges = router.getBufferedRanges()
    const bufferedRange = bufferedRanges[0]
    if (!bufferedRange) {
      throw new Error('Expected a routed buffered range snapshot')
    }

    Reflect.set(bufferedRange, 'end', 1)
    Reflect.set(bufferedRanges, 'length', 0)

    expect(hlsEngine.bufferedRanges).toEqual([{ start: 0, end: 30 }])
    expect(router.getBufferedRanges()).toEqual([{ start: 0, end: 30 }])
  })
})
