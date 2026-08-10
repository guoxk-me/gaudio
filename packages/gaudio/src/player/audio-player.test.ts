import type { AdaptivePlaybackInfo, AdaptiveVariant } from '../adapters/adaptive-audio-types'
import type { AudioAnalyzer } from '../analysis/audio-analyzer'
import type { AudioEngine, AudioEngineEvents } from '../engine/audio-engine'
import type { AudioEngineAdapter } from '../engine/audio-engine-adapter'
import type { AudioFormatSupport, PreloadMode, TimeRange } from '../engine/audio-engine-types'
import type { PlaybackState } from './audio-player-options'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { audioEngineEventNames } from '../engine/audio-engine'
import { MediaElementAudioEngine } from '../engine/media-element-audio-engine'
import { GAudioError } from '../errors/errors'
import { FakeAudioEngine } from '../test-support/fake-audio-engine'
import { FakeAudioElement } from '../test-support/fake-media'
import { AudioPlayer } from './audio-player'
import { BrowserMediaSession } from './browser-media-session'

class FakeHlsAdapter implements AudioEngineAdapter {
  readonly protocol = 'hls'
  createCalls = 0

  constructor(private readonly engine: AudioEngine) {}

  createEngine(): AudioEngine {
    this.createCalls += 1
    return this.engine
  }

  isSupported(): boolean {
    return true
  }
}

class DelayedHlsAdapter implements AudioEngineAdapter {
  readonly protocol = 'hls'
  createCalls = 0
  private continueCreation: (() => void) | undefined
  private readonly creationGate = new Promise<void>((resolve) => {
    this.continueCreation = resolve
  })

  constructor(private readonly engine: AudioEngine) {}

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

class FakeDashAdapter implements AudioEngineAdapter {
  readonly protocol = 'dash'
  createCalls = 0

  constructor(private readonly engine: AudioEngine) {}

  createEngine(): AudioEngine {
    this.createCalls += 1
    return this.engine
  }

  isSupported(): boolean {
    return true
  }
}

class FakeAnalyzer {
  disposeCalls = 0

  connect(): void {}

  getFrequencyData(): Uint8Array {
    return new Uint8Array()
  }

  getWaveformData(): Uint8Array {
    return new Uint8Array()
  }

  dispose(): void {
    this.disposeCalls += 1
  }
}

class AnalyzerAudioEngine extends FakeAudioEngine {
  readonly analyzers: FakeAnalyzer[] = []
  readonly analyzerFftSizes: Array<number | undefined> = []

  createAnalyzer(options: { fftSize?: number } = {}): AudioAnalyzer {
    const analyzer = new FakeAnalyzer()
    this.analyzers.push(analyzer)
    this.analyzerFftSizes.push(options.fftSize)
    return analyzer as unknown as AudioAnalyzer
  }
}

class DisposalStrictAudioEngine extends FakeAudioEngine {
  queryCalls = 0
  disposalError?: Error
  private hasDisposedResources = false

  override getPreload(): PreloadMode {
    this.assertQueryAvailable()
    return super.getPreload()
  }

  override getAutoplay(): boolean {
    this.assertQueryAvailable()
    return super.getAutoplay()
  }

  override getVolume(): number {
    this.assertQueryAvailable()
    return super.getVolume()
  }

  override isMuted(): boolean {
    this.assertQueryAvailable()
    return super.isMuted()
  }

  override isLooping(): boolean {
    this.assertQueryAvailable()
    return super.isLooping()
  }

  override getPlaybackRate(): number {
    this.assertQueryAvailable()
    return super.getPlaybackRate()
  }

  override getPreservesPitch(): boolean {
    this.assertQueryAvailable()
    return super.getPreservesPitch()
  }

  override getCurrentTime(): number {
    this.assertQueryAvailable()
    return super.getCurrentTime()
  }

  override getDuration(): number {
    this.assertQueryAvailable()
    return super.getDuration()
  }

  override isPaused(): boolean {
    this.assertQueryAvailable()
    return super.isPaused()
  }

  override isEnded(): boolean {
    this.assertQueryAvailable()
    return super.isEnded()
  }

  override isSeeking(): boolean {
    this.assertQueryAvailable()
    return super.isSeeking()
  }

  override getBufferedRanges(): readonly TimeRange[] {
    this.assertQueryAvailable()
    return super.getBufferedRanges()
  }

  override getSeekableRanges(): readonly TimeRange[] {
    this.assertQueryAvailable()
    return super.getSeekableRanges()
  }

  override getPlayedRanges(): readonly TimeRange[] {
    this.assertQueryAvailable()
    return super.getPlayedRanges()
  }

  override canPlayType(mimeType: string): AudioFormatSupport {
    this.assertQueryAvailable()
    return super.canPlayType(mimeType)
  }

  override getAdaptiveVariants(): readonly AdaptiveVariant[] {
    this.assertQueryAvailable()
    return super.getAdaptiveVariants()
  }

  override getAdaptiveQualitySelection(): string {
    this.assertQueryAvailable()
    return super.getAdaptiveQualitySelection()
  }

  override getActiveAdaptivePlayback(): AdaptivePlaybackInfo | undefined {
    this.assertQueryAvailable()
    return super.getActiveAdaptivePlayback()
  }

  override dispose(): void {
    super.dispose()
    this.hasDisposedResources = true
    if (this.disposalError) {
      throw this.disposalError
    }
  }

  private assertQueryAvailable(): void {
    this.queryCalls += 1
    if (this.hasDisposedResources) {
      throw new Error('Disposed engine cannot be queried')
    }
  }
}

class ThrowingUnloadAudioEngine extends FakeAudioEngine {
  unloadError?: Error

  override unload(): void {
    super.unload()
    if (this.unloadError) {
      throw this.unloadError
    }
  }
}

class RetryableUnsubscribeAudioEngine extends FakeAudioEngine {
  readonly unsubscribeError = new Error('engine unsubscribe failed')
  unsubscribeCalls = 0
  private shouldFailUnsubscribe = true

  constructor(private readonly failedEventName: keyof AudioEngineEvents = 'loadstart') {
    super()
  }

  override on<EventName extends keyof AudioEngineEvents>(
    eventName: EventName,
    handler: (payload: AudioEngineEvents[EventName]) => void,
  ): () => void {
    const removeListener = super.on(eventName, handler)
    return () => {
      this.unsubscribeCalls += 1
      if (eventName === this.failedEventName && this.shouldFailUnsubscribe) {
        this.shouldFailUnsubscribe = false
        throw this.unsubscribeError
      }
      removeListener()
    }
  }

  override dispose(): void {
    // AI modified: keep subscriptions observable so player-owned unsubscribe retries are tested independently.
    this.disposeCalls += 1
  }
}

class DelayedLoadAudioEngine extends FakeAudioEngine {
  private continueLoading: (() => void) | undefined
  private failLoadingRequest: ((error: Error) => void) | undefined
  private readonly loadGate = new Promise<void>((resolve, reject) => {
    this.continueLoading = resolve
    this.failLoadingRequest = reject
  })

  private hasFinishedLoading = false

  readonly controlsBeforeReady: string[] = []

  override async load(source: Parameters<FakeAudioEngine['load']>[0]): Promise<void> {
    await super.load(source)
    await this.loadGate
  }

  override async play(): Promise<void> {
    if (!this.hasFinishedLoading) {
      this.controlsBeforeReady.push('play')
    }
    await super.play()
  }

  override pause(): void {
    if (!this.hasFinishedLoading) {
      this.controlsBeforeReady.push('pause')
    }
    super.pause()
  }

  override stop(): void {
    if (!this.hasFinishedLoading) {
      this.controlsBeforeReady.push('stop')
    }
    super.stop()
  }

  finishLoading(): void {
    this.hasFinishedLoading = true
    this.continueLoading?.()
  }

  failLoading(error: Error): void {
    this.failLoadingRequest?.(error)
  }
}

class FailingPendingStopAudioEngine extends DelayedLoadAudioEngine {
  stopError?: Error

  override stop(): void {
    if (this.stopError) {
      throw this.stopError
    }
    super.stop()
  }
}

class DelayedReplacementAudioEngine extends FakeAudioEngine {
  private finishReplacement?: () => void
  private readonly replacementGate = new Promise<void>((resolve) => {
    this.finishReplacement = resolve
  })

  override async load(source: Parameters<FakeAudioEngine['load']>[0]): Promise<void> {
    await super.load(source)
    if (this.loadedSources.length > 1) {
      await this.replacementGate
    }
  }

  finishReplacementLoad(): void {
    this.finishReplacement?.()
  }
}

class DeferredPlayAudioEngine extends FakeAudioEngine {
  private finishPlaybackRequest?: () => void
  private failPlaybackRequest?: (error: GAudioError) => void

  pauseCalls = 0
  stopCalls = 0

  override play(): Promise<void> {
    this.playCalls += 1
    return new Promise<void>((resolve, reject) => {
      this.finishPlaybackRequest = () => {
        this.isPlaying = true
        this.emit('playing', undefined)
        resolve()
      }
      this.failPlaybackRequest = reject
    })
  }

  override pause(): void {
    this.pauseCalls += 1
    super.pause()
    this.emit('pause', undefined)
  }

  override stop(): void {
    this.stopCalls += 1
    super.stop()
  }

  finishPlayback(): void {
    this.finishPlaybackRequest?.()
  }

  failPlayback(error: GAudioError): void {
    this.failPlaybackRequest?.(error)
  }
}

class DeferredAsyncControlAudioEngine extends FakeAudioEngine {
  private finishSeekRequest?: () => void
  private failSeekRequest?: (error: Error) => void
  private finishFastSeekRequest?: () => void
  private failFastSeekRequest?: (error: Error) => void
  private finishQualityRequest?: () => void
  private failQualityRequest?: (error: Error) => void

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

  finishSeek(): void {
    this.finishSeekRequest?.()
  }

  finishFastSeek(): void {
    this.finishFastSeekRequest?.()
  }

  finishQualitySelection(): void {
    this.finishQualityRequest?.()
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

class DeferredPositionQueryErrorAudioEngine extends DeferredAsyncControlAudioEngine {
  positionQueryError?: GAudioError

  override getDuration(): number {
    const positionQueryError = this.positionQueryError
    this.positionQueryError = undefined
    if (positionQueryError) {
      this.emit('error', positionQueryError)
    }
    return super.getDuration()
  }
}

class DelayedLoadPositionQueryErrorAudioEngine extends DelayedLoadAudioEngine {
  positionQueryError?: GAudioError

  override getDuration(): number {
    const positionQueryError = this.positionQueryError
    this.positionQueryError = undefined
    if (positionQueryError) {
      this.emit('error', positionQueryError)
    }
    return super.getDuration()
  }
}

class ErroringSeekAudioElement extends FakeAudioElement {
  readonly seekError = {
    code: 3,
    message: 'Audio decoding failed',
    MEDIA_ERR_ABORTED: 1,
    MEDIA_ERR_NETWORK: 2,
    MEDIA_ERR_DECODE: 3,
    MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
  } as MediaError

  publishSeekError(): void {
    this.error = this.seekError
    this.dispatchEvent(new Event('error'))
  }
}

class ConcurrentDeferredPlayAudioEngine extends FakeAudioEngine {
  private readonly playbackRejections: Array<(error: GAudioError) => void> = []

  override play(): Promise<void> {
    this.playCalls += 1
    return new Promise<void>((_resolve, reject) => {
      this.playbackRejections.push(reject)
    })
  }

  failPendingPlayback(error: GAudioError): void {
    for (const rejectPlayback of this.playbackRejections.splice(0)) {
      rejectPlayback(error)
    }
  }

  failPlaybackRequest(requestIndex: number, error: GAudioError): void {
    this.playbackRejections[requestIndex]?.(error)
  }
}

class SynchronousSettingEventsAudioEngine extends FakeAudioEngine {
  override setVolume(volume: number): void {
    super.setVolume(volume)
    this.emit('volumechange', { volume: this.volume, isMuted: this.muted })
  }

  override setMuted(isMuted: boolean): void {
    super.setMuted(isMuted)
    this.emit('volumechange', { volume: this.volume, isMuted: this.muted })
  }

  override setPlaybackRate(rate: number): void {
    super.setPlaybackRate(rate)
    this.emit('ratechange', { playbackRate: this.playbackRate })
  }
}

class SubscriptionTrackingAudioEngine extends FakeAudioEngine {
  subscriptionCalls = 0
  removalCalls = 0
  failAtSubscription?: number

  override on<EventName extends keyof AudioEngineEvents>(
    eventName: EventName,
    handler: (payload: AudioEngineEvents[EventName]) => void,
  ): () => void {
    this.subscriptionCalls += 1
    if (this.subscriptionCalls === this.failAtSubscription) {
      throw new Error('engine subscription failed')
    }

    const removeListener = super.on(eventName, handler)
    let hasRemovedListener = false
    return () => {
      if (!hasRemovedListener) {
        hasRemovedListener = true
        this.removalCalls += 1
      }
      removeListener()
    }
  }
}

class FakeMediaMetadata implements MediaMetadata {
  album: string
  artist: string
  artwork: MediaImage[]
  title: string

  constructor(init: MediaMetadataInit = {}) {
    this.album = init.album ?? ''
    this.artist = init.artist ?? ''
    this.artwork = init.artwork ? [...init.artwork] : []
    this.title = init.title ?? ''
  }
}

class FakeMediaSession implements MediaSession {
  readonly actionHandlers = new Map<MediaSessionAction, MediaSessionActionHandler>()
  readonly rejectedActionRegistrations = new Set<MediaSessionAction>()
  readonly metadataErrors: Error[] = []
  positionState?: MediaPositionState
  playbackStateError?: Error
  private currentMetadata: MediaMetadata | null = null
  private currentPlaybackState: MediaSessionPlaybackState = 'none'

  get metadata(): MediaMetadata | null {
    return this.currentMetadata
  }

  set metadata(metadata: MediaMetadata | null) {
    const metadataError = this.metadataErrors.shift()
    if (metadataError) {
      throw metadataError
    }
    this.currentMetadata = metadata
  }

  get playbackState(): MediaSessionPlaybackState {
    return this.currentPlaybackState
  }

  set playbackState(state: MediaSessionPlaybackState) {
    const playbackStateError = this.playbackStateError
    this.playbackStateError = undefined
    if (playbackStateError) {
      throw playbackStateError
    }
    this.currentPlaybackState = state
  }

  setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void {
    // AI modified: tests can model browsers that reject only one replacement action registration.
    if (handler && this.rejectedActionRegistrations.has(action)) {
      throw new Error(`Media Session rejected ${action}`)
    }
    if (handler) {
      this.actionHandlers.set(action, handler)
      return
    }

    this.actionHandlers.delete(action)
  }

  async setCameraActive(): Promise<void> {}

  async setMicrophoneActive(): Promise<void> {}

  setPositionState(state?: MediaPositionState): void {
    this.positionState = state
  }

  runAction(action: MediaSessionAction, details: Partial<MediaSessionActionDetails> = {}): void {
    this.actionHandlers.get(action)?.({
      action,
      ...details,
    })
  }
}

async function waitForMediaSessionAction(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('audioPlayer', () => {
  it('applies media options and exposes engine capabilities', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({
      preload: 'auto',
      autoplay: true,
      muted: true,
      loop: true,
      volume: 0.6,
      playbackRate: 1.5,
      preservesPitch: false,
    }, engine)

    expect(player.getPreload()).toBe('auto')
    expect(player.getAutoplay()).toBe(true)
    expect(player.getVolume()).toBe(0.6)
    expect(player.isMuted()).toBe(true)
    expect(player.isLooping()).toBe(true)
    expect(player.getPlaybackRate()).toBe(1.5)
    expect(player.getPreservesPitch()).toBe(false)
    expect(player.getBufferedRanges()).toEqual([{ start: 0, end: 30 }])
    expect(player.getSeekableRanges()).toEqual([{ start: 0, end: 120 }])
    expect(player.getPlayedRanges()).toEqual([{ start: 5, end: 25 }])
    expect(player.canPlayType('audio/mpeg')).toBe('probably')

    const bufferedRanges = player.getBufferedRanges()
    const bufferedRange = bufferedRanges[0]
    if (!bufferedRange) {
      throw new Error('Expected a buffered range snapshot')
    }
    Reflect.set(bufferedRange, 'end', 1)
    Reflect.set(bufferedRanges, 'length', 0)
    expect(engine.bufferedRanges).toEqual([{ start: 0, end: 30 }])
    expect(player.getBufferedRanges()).toEqual([{ start: 0, end: 30 }])
  })

  it('updates autoplay and pitch preservation at runtime', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    player.setAutoplay(true)
    player.setPreservesPitch(false)

    expect(player.getAutoplay()).toBe(true)
    expect(player.getPreservesPitch()).toBe(false)
  })

  it('reports effective engine settings until disposal, then uses player-owned settings', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({
      preload: 'auto',
      volume: 0.4,
      muted: true,
      loop: true,
      playbackRate: 1.5,
      preservesPitch: false,
    }, engine)
    engine.preload = 'none'
    engine.volume = 0.7
    engine.muted = false
    engine.looping = false
    engine.playbackRate = 1.25
    engine.preservesPitch = true

    expect([
      player.getPreload(),
      player.getVolume(),
      player.isMuted(),
      player.isLooping(),
      player.getPlaybackRate(),
      player.getPreservesPitch(),
    ]).toEqual(['none', 0.7, false, false, 1.25, true])

    player.dispose()

    expect([
      player.getPreload(),
      player.getVolume(),
      player.isMuted(),
      player.isLooping(),
      player.getPlaybackRate(),
      player.getPreservesPitch(),
    ]).toEqual(['auto', 0.4, true, true, 1.5, false])
  })

  it('keeps disposal-safe setting snapshots aligned after synchronous setter re-entry', () => {
    const engine = new SynchronousSettingEventsAudioEngine()
    const player = new AudioPlayer({}, engine)
    let hasReenteredVolume = false
    let hasReenteredMute = false
    let hasReenteredRate = false

    player.on('volumechange', ({ volume, isMuted }) => {
      if (volume === 0.5 && !hasReenteredVolume) {
        hasReenteredVolume = true
        player.setVolume(0.8)
      }
      if (isMuted && !hasReenteredMute) {
        hasReenteredMute = true
        player.setMuted(false)
      }
    })
    player.on('ratechange', ({ playbackRate }) => {
      if (playbackRate === 1.5 && !hasReenteredRate) {
        hasReenteredRate = true
        player.setPlaybackRate(1.25)
      }
    })

    player.setVolume(0.5)
    player.setMuted(true)
    player.setPlaybackRate(1.5)

    expect([engine.volume, engine.muted, engine.playbackRate]).toEqual([0.8, false, 1.25])

    player.dispose()

    expect([player.getVolume(), player.isMuted(), player.getPlaybackRate()]).toEqual([0.8, false, 1.25])
  })

  it('keeps non-event setting snapshots aligned after synchronous setter re-entry', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    const setPreload = engine.setPreload.bind(engine)
    const setLoop = engine.setLoop.bind(engine)
    const setPreservesPitch = engine.setPreservesPitch.bind(engine)
    vi.spyOn(engine, 'setPreload').mockImplementationOnce((preload) => {
      setPreload(preload)
      player.setPreload('none')
    })
    vi.spyOn(engine, 'setLoop').mockImplementationOnce((isLooping) => {
      setLoop(isLooping)
      player.setLoop(false)
    })
    vi.spyOn(engine, 'setPreservesPitch').mockImplementationOnce((shouldPreservePitch) => {
      setPreservesPitch(shouldPreservePitch)
      player.setPreservesPitch(false)
    })

    player.setPreload('auto')
    player.setLoop(true)
    player.setPreservesPitch(true)

    expect([engine.preload, engine.looping, engine.preservesPitch]).toEqual(['none', false, false])

    player.dispose()

    expect([player.getPreload(), player.isLooping(), player.getPreservesPitch()]).toEqual(['none', false, false])
  })

  it('creates a configured analyzer after a source loads', async () => {
    const engine = new AnalyzerAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      analyzer: {
        fftSize: 1024,
      },
    }, engine)

    expect(player.getAnalyzer()).toBeUndefined()

    await player.load()

    expect(player.getAnalyzer()).toBe(engine.analyzers[0])
    expect(engine.analyzerFftSizes).toEqual([1024])
  })

  it('uses the default analyzer configuration for boolean analyzer options', async () => {
    const engine = new AnalyzerAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      analyzer: true,
    }, engine)

    await player.load()

    expect(player.getAnalyzer()).toBe(engine.analyzers[0])
    expect(engine.analyzerFftSizes).toEqual([2048])
  })

  it('supports custom analyzer factories for injected engines', async () => {
    const engine = new FakeAudioEngine()
    const analyzer = new FakeAnalyzer()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      analyzer: {
        fftSize: 512,
        createAnalyzer: (context) => {
          expect(context.engine).toBe(engine)
          expect(context.fftSize).toBe(512)
          return analyzer as unknown as AudioAnalyzer
        },
      },
    }, engine)

    await player.load()

    expect(player.getAnalyzer()).toBe(analyzer)
  })

  it('does not fall back when a custom analyzer factory declines to create one', async () => {
    const engine = new AnalyzerAudioEngine()
    const createAnalyzer = vi.fn(() => undefined)
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      analyzer: {
        createAnalyzer,
      },
    }, engine)

    await player.load()

    expect(createAnalyzer).toHaveBeenCalledOnce()
    expect(engine.analyzers).toEqual([])
    expect(player.getAnalyzer()).toBeUndefined()
  })

  it('releases player analyzers when sources change or the player is disposed', async () => {
    const engine = new AnalyzerAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/first.mp3',
      analyzer: true,
    }, engine)

    await player.load()
    const firstAnalyzer = engine.analyzers[0]

    player.setSource('https://example.com/second.mp3')

    expect(firstAnalyzer.disposeCalls).toBe(1)
    expect(player.getAnalyzer()).toBeUndefined()

    await player.load()
    const secondAnalyzer = engine.analyzers[1]
    player.dispose()

    expect(secondAnalyzer.disposeCalls).toBe(1)
  })

  it('keeps the loaded source usable when analyzer release prevents a reload', async () => {
    const analyzerReleaseError = new Error('analyzer release failed')
    class FailingReleaseAnalyzer extends FakeAnalyzer {
      override dispose(): void {
        super.dispose()
        throw analyzerReleaseError
      }
    }
    const engine = new FakeAudioEngine()
    const analyzer = new FailingReleaseAnalyzer()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      analyzer: {
        createAnalyzer: () => analyzer as unknown as AudioAnalyzer,
      },
    }, engine)
    await player.load()

    await expect(player.load()).rejects.toBe(analyzerReleaseError)
    await player.play()
    engine.emit('playing', undefined)

    expect(engine.loadedSources).toHaveLength(1)
    expect(player.getState()).toBe('playing')
  })

  it('preserves analyzer cleanup error identity when setSource replaces a loaded source', async () => {
    const analyzerReleaseError = new Error('analyzer release failed during replacement')
    class FailingReleaseAnalyzer extends FakeAnalyzer {
      override dispose(): void {
        super.dispose()
        throw analyzerReleaseError
      }
    }
    const engine = new FakeAudioEngine()
    const analyzer = new FailingReleaseAnalyzer()
    const player = new AudioPlayer({
      source: 'https://example.com/first.mp3',
      analyzer: {
        createAnalyzer: () => analyzer as unknown as AudioAnalyzer,
      },
    }, engine)
    await player.load()
    let replacementFailure: unknown

    try {
      player.setSource('https://example.com/second.mp3')
    }
    catch (error) {
      replacementFailure = error
    }

    // AI modified: source replacement exposes the caller-owned cleanup error without wrapping it.
    expect(replacementFailure).toBe(analyzerReleaseError)
    expect(analyzer.disposeCalls).toBe(1)
    expect(engine.unloadCalls).toBe(1)
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/second.mp3' })
  })

  it('wraps custom analyzer factory failures and publishes the same player error', async () => {
    const analyzerCreationError = new Error('custom analyzer creation failed')
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      analyzer: {
        createAnalyzer: () => {
          throw analyzerCreationError
        },
      },
    }, engine)
    const publishedErrors: GAudioError[] = []
    player.on('error', error => publishedErrors.push(error))
    let loadFailure: unknown

    try {
      await player.load()
    }
    catch (error) {
      loadFailure = error
    }

    // AI modified: player-level analyzer factories share the stable load error boundary.
    expect(loadFailure).toMatchObject({
      code: 'ENGINE_ERROR',
      cause: analyzerCreationError,
    })
    expect(publishedErrors).toHaveLength(1)
    expect(publishedErrors[0]).toBe(loadFailure)
    expect(player.getState()).toBe('error')
  })

  it('rejects a load when analyzer creation emits a fatal engine error before returning', async () => {
    const engine = new AnalyzerAudioEngine()
    const analyzerError = new GAudioError('ENGINE_ERROR', 'Analyzer creation reported a fatal engine error')
    const createAnalyzer = engine.createAnalyzer.bind(engine)
    vi.spyOn(engine, 'createAnalyzer').mockImplementation((options) => {
      const analyzer = createAnalyzer(options)
      engine.emit('error', analyzerError)
      return analyzer
    })
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      analyzer: true,
    }, engine)
    const publishedErrors: GAudioError[] = []
    const states: PlaybackState[] = []
    player.on('error', error => publishedErrors.push(error))
    player.on('statechange', state => states.push(state))

    await expect(player.load()).rejects.toBe(analyzerError)

    // AI modified: a fatal analyzer-time engine event remains owned by the joining load.
    expect(player.getState()).toBe('error')
    expect(states).toEqual(['loading', 'error'])
    expect(publishedErrors).toEqual([analyzerError])
  })

  it('keeps a source replacement started by analyzer disposal', async () => {
    const engine = new FakeAudioEngine()
    const analyzer = new FakeAnalyzer()
    const disposeAnalyzer = analyzer.dispose.bind(analyzer)
    let player!: AudioPlayer
    analyzer.dispose = () => {
      disposeAnalyzer()
      player.setSource('https://example.com/analyzer-replacement.mp3')
    }
    player = new AudioPlayer({
      source: 'https://example.com/first.mp3',
      analyzer: {
        createAnalyzer: () => analyzer as unknown as AudioAnalyzer,
      },
    }, engine)
    await player.load()

    player.setSource('https://example.com/obsolete-replacement.mp3')

    expect(analyzer.disposeCalls).toBe(1)
    expect(engine.unloadCalls).toBe(1)
    expect(player.getSource()).toMatchObject({
      url: 'https://example.com/analyzer-replacement.mp3',
    })
    expect(player.getState()).toBe('idle')
  })

  it('keeps a source replacement started by engine unload', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/first.mp3',
    }, engine)
    const unload = engine.unload.bind(engine)
    vi.spyOn(engine, 'unload').mockImplementationOnce(() => {
      unload()
      player.setSource('https://example.com/engine-replacement.mp3')
    })

    player.setSource('https://example.com/obsolete-replacement.mp3')

    expect(engine.unloadCalls).toBe(2)
    expect(player.getSource()).toMatchObject({
      url: 'https://example.com/engine-replacement.mp3',
    })
    expect(player.getState()).toBe('idle')
  })

  it('does not let superseded playlist navigation load the replacement source', async () => {
    const engine = new FakeAudioEngine()
    const analyzer = new FakeAnalyzer()
    const disposeAnalyzer = analyzer.dispose.bind(analyzer)
    let player!: AudioPlayer
    analyzer.dispose = () => {
      disposeAnalyzer()
      player.setSource('https://example.com/listener-replacement.mp3')
    }
    player = new AudioPlayer({
      analyzer: {
        createAnalyzer: () => analyzer as unknown as AudioAnalyzer,
      },
    }, engine)
    player.setPlaylist([
      { source: 'https://example.com/first.mp3' },
      { source: 'https://example.com/obsolete-navigation.mp3' },
    ])
    await player.load()

    await expect(player.selectPlaylistTrack(1, { autoplay: true })).rejects.toMatchObject({
      code: 'LOAD_ABORTED',
    })

    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/first.mp3',
    ])
    expect(engine.playCalls).toBe(0)
    expect(player.getSource()).toMatchObject({
      url: 'https://example.com/listener-replacement.mp3',
    })
    expect(player.getPlaylist()).toEqual([])
    expect(player.getState()).toBe('idle')
  })

  it('does not let analyzer disposal revive a superseded reload', async () => {
    const engine = new FakeAudioEngine()
    const analyzer = new FakeAnalyzer()
    const disposeAnalyzer = analyzer.dispose.bind(analyzer)
    let shouldReplaceSource = false
    let player!: AudioPlayer

    analyzer.dispose = () => {
      disposeAnalyzer()
      if (shouldReplaceSource) {
        player.setSource('https://example.com/replacement.mp3')
      }
    }
    player = new AudioPlayer({
      source: 'https://example.com/first.mp3',
      analyzer: {
        createAnalyzer: () => analyzer as unknown as AudioAnalyzer,
      },
    }, engine)

    await player.load()
    shouldReplaceSource = true

    await expect(player.load()).rejects.toMatchObject({ code: 'LOAD_ABORTED' })

    expect(analyzer.disposeCalls).toBe(1)
    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/first.mp3',
    ])
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/replacement.mp3' })
    expect(player.getState()).toBe('idle')
  })

  it('releases an analyzer returned after its factory disposes the player', async () => {
    const engine = new FakeAudioEngine()
    const analyzer = new FakeAnalyzer()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      analyzer: {
        createAnalyzer: () => {
          player.dispose()
          return analyzer as unknown as AudioAnalyzer
        },
      },
    }, engine)

    await expect(player.load()).rejects.toMatchObject({ code: 'ENGINE_ERROR' })

    expect(analyzer.disposeCalls).toBe(1)
    expect(player.getAnalyzer()).toBeUndefined()
    expect(player.getState()).toBe('idle')
    expect(engine.disposeCalls).toBe(1)
  })

  it('releases an analyzer returned after its factory replaces the source', async () => {
    const engine = new FakeAudioEngine()
    const analyzer = new FakeAnalyzer()
    const player = new AudioPlayer({
      source: 'https://example.com/first.mp3',
      analyzer: {
        createAnalyzer: () => {
          player.setSource('https://example.com/second.mp3')
          return analyzer as unknown as AudioAnalyzer
        },
      },
    }, engine)

    await expect(player.load()).rejects.toMatchObject({ code: 'LOAD_ABORTED' })

    expect(analyzer.disposeCalls).toBe(1)
    expect(player.getAnalyzer()).toBeUndefined()
    expect(player.getState()).toBe('idle')
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/second.mp3' })
  })

  it('does not create analyzer when analyzer options are disabled', async () => {
    const engine = new AnalyzerAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      analyzer: {
        enabled: false,
      },
    }, engine)

    await player.load()

    expect(player.getAnalyzer()).toBeUndefined()
    expect(engine.analyzers).toHaveLength(0)
  })

  it('publishes Media Session metadata, playback state, and position when enabled', async () => {
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      mediaSession: {
        metadata: {
          title: 'Episode 1',
          artist: 'GAudio',
          album: 'Browser Integration',
          artwork: [
            { src: 'https://example.com/cover.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      },
    }, engine)

    expect(player.getMediaSessionMetadata()).toMatchObject({
      title: 'Episode 1',
      artist: 'GAudio',
      album: 'Browser Integration',
    })
    expect(mediaSession.metadata).toMatchObject({
      title: 'Episode 1',
      artist: 'GAudio',
      album: 'Browser Integration',
      artwork: [
        { src: 'https://example.com/cover.png', sizes: '512x512', type: 'image/png' },
      ],
    })
    expect(mediaSession.playbackState).toBe('none')

    await player.load()

    expect(mediaSession.playbackState).toBe('paused')
    expect(mediaSession.positionState).toEqual({
      duration: 120,
      playbackRate: 1,
      position: 0,
    })

    engine.currentTime = 25
    engine.emit('timeupdate', { currentTime: 25, duration: 120 })
    await player.play()
    engine.emit('playing', undefined)

    expect(mediaSession.playbackState).toBe('playing')
    expect(mediaSession.positionState).toEqual({
      duration: 120,
      playbackRate: 1,
      position: 25,
    })

    player.pause()
    engine.emit('pause', undefined)
    player.dispose()

    expect(mediaSession.playbackState).toBe('none')
    expect(mediaSession.metadata).toBeNull()
    expect(mediaSession.positionState).toBeUndefined()
    expect(mediaSession.actionHandlers.size).toBe(0)
  })

  it('contains runtime Media Session presentation failures without interrupting player state', async () => {
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      mediaSession: true,
    }, new FakeAudioEngine())
    const states: PlaybackState[] = []
    player.on('statechange', state => states.push(state))

    mediaSession.playbackStateError = new Error('playback state unavailable')
    await expect(player.load()).resolves.toBeUndefined()

    expect(player.getState()).toBe('ready')
    expect(states).toEqual(['loading', 'ready'])
    expect(mediaSession.playbackState).toBe('paused')

    const metadataError = new Error('metadata unavailable')
    // AI modified: the first assignment and showMetadata()'s null fallback both fail.
    mediaSession.metadataErrors.push(metadataError, metadataError)
    expect(() => player.setMediaSessionMetadata({ title: 'Retained title' })).not.toThrow()
    expect(player.getMediaSessionMetadata()).toMatchObject({ title: 'Retained title' })

    player.setMediaSessionMetadata({ title: 'Published title' })
    expect(mediaSession.metadata).toMatchObject({ title: 'Published title' })

    player.dispose()
  })

  it('updates Media Session metadata from playlist tracks and default metadata', async () => {
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({
      mediaSession: {
        metadata: {
          title: 'Default title',
          artist: 'Default artist',
        },
      },
    }, engine)

    player.setPlaylist([
      {
        source: 'https://example.com/first.mp3',
        metadata: {
          title: 'First track',
          artist: 'GAudio',
        },
      },
      {
        source: 'https://example.com/second.mp3',
        metadata: {
          title: 'Second track',
          artist: 'GAudio',
        },
      },
    ])

    expect(mediaSession.metadata).toMatchObject({ title: 'First track' })

    await player.next()

    expect(mediaSession.metadata).toMatchObject({ title: 'Second track' })

    player.setPlaylist([])

    expect(mediaSession.metadata).toMatchObject({ title: 'Default title' })

    player.setMediaSessionMetadata({
      title: 'Direct source title',
      artist: 'Direct source artist',
    })

    expect(mediaSession.metadata).toMatchObject({ title: 'Direct source title' })
  })

  it('handles Media Session system media actions through the player API', async () => {
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({
      mediaSession: {
        seekOffset: 15,
      },
    }, engine)

    player.setPlaylist([
      { source: 'https://example.com/first.mp3' },
      { source: 'https://example.com/second.mp3' },
    ])
    await player.load()

    mediaSession.runAction('play')
    await waitForMediaSessionAction()

    expect(engine.playCalls).toBe(1)

    mediaSession.runAction('pause')

    expect(engine.isPlaying).toBe(false)

    engine.currentTime = 20
    mediaSession.runAction('seekforward')
    await waitForMediaSessionAction()

    expect(engine.currentTime).toBe(35)

    mediaSession.runAction('seekbackward', { seekOffset: 50 })
    await waitForMediaSessionAction()

    expect(engine.currentTime).toBe(0)

    mediaSession.runAction('seekto', { seekTime: 44, fastSeek: true })
    await waitForMediaSessionAction()

    expect(engine.fastSeekCalls).toEqual([44])
    expect(engine.currentTime).toBe(44)

    mediaSession.runAction('nexttrack')
    await waitForMediaSessionAction()

    expect(player.getPlaylistIndex()).toBe(1)
    expect(engine.playCalls).toBe(2)

    mediaSession.runAction('previoustrack')
    await waitForMediaSessionAction()

    expect(player.getPlaylistIndex()).toBe(0)
    expect(engine.playCalls).toBe(3)
  })

  it('disables engine-native autoplay so player orchestration remains observable', () => {
    const engine = new FakeAudioEngine()
    engine.setAutoplay(true)

    const player = new AudioPlayer({ autoplay: true }, engine)

    expect(player.getAutoplay()).toBe(true)
    expect(engine.getAutoplay()).toBe(false)
  })

  it('fast seeks through the engine', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    await player.fastSeek(24)

    expect(engine.fastSeekCalls).toEqual([24])
    expect(player.getCurrentTime()).toBe(24)
  })

  it.each([
    [
      'seek',
      (player: AudioPlayer) => player.seek(24),
      (engine: DeferredAsyncControlAudioEngine, error: Error) => engine.failSeek(error),
    ],
    [
      'fastSeek',
      (player: AudioPlayer) => player.fastSeek(24),
      (engine: DeferredAsyncControlAudioEngine, error: Error) => engine.failFastSeek(error),
    ],
  ] as const)(
    'rejects %s promptly on disposal and observes a late rejection without updating Media Session',
    async (_operationName, startOperation, failOperation) => {
      const mediaSession = new FakeMediaSession()
      vi.stubGlobal('navigator', { mediaSession })
      vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
      const positionUpdates = vi.spyOn(BrowserMediaSession.prototype, 'setPositionState')
      const engine = new DeferredAsyncControlAudioEngine()
      const player = new AudioPlayer({ mediaSession: true }, engine)
      const errors: GAudioError[] = []
      player.on('error', error => errors.push(error))
      positionUpdates.mockClear()

      const operation = startOperation(player)
      const operationExpectation = expect(operation).rejects.toMatchObject({ code: 'ENGINE_ERROR' })
      player.dispose()
      const updateCallsAfterDisposal = positionUpdates.mock.calls.length

      // AI modified: position cancellation does not wait for the engine and its late rejection stays observed.
      await operationExpectation
      failOperation(engine, new Error('Late position rejection after disposal'))
      await Promise.resolve()
      expect(positionUpdates).toHaveBeenCalledTimes(updateCallsAfterDisposal)
      expect(errors).toEqual([])
      expect(player.getState()).toBe('idle')
    },
  )

  it('rejects adaptive quality selection promptly on disposal and observes its late rejection', async () => {
    const engine = new DeferredAsyncControlAudioEngine()
    const player = new AudioPlayer({}, engine)
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))

    const qualitySelection = player.setAdaptiveQuality('high')
    const selectionExpectation = expect(qualitySelection).rejects.toMatchObject({ code: 'ENGINE_ERROR' })
    player.dispose()

    // AI modified: adaptive cancellation does not wait for the adapter and observes its late rejection.
    await selectionExpectation
    engine.failQualitySelection(new Error('Late adaptive rejection after disposal'))
    await Promise.resolve()
    expect(errors).toEqual([])
    expect(player.getAdaptiveQualitySelection()).toBe('auto')
  })

  it('rejects adaptive quality selection when the active engine does not expose it', async () => {
    const engine = new FakeAudioEngine()
    Reflect.set(engine, 'setAdaptiveQuality', undefined)
    const player = new AudioPlayer({}, engine)
    const publishedErrors: GAudioError[] = []
    player.on('error', error => publishedErrors.push(error))

    // AI modified: the optional public control has a stable unsupported boundary without publishing a fatal event.
    await expect(player.setAdaptiveQuality('high')).rejects.toMatchObject({
      code: 'PROTOCOL_UNSUPPORTED',
    })
    expect(publishedErrors).toEqual([])

    player.dispose()
  })

  it.each([
    [
      'seek',
      (player: AudioPlayer) => player.seek(24),
      (engine: DeferredAsyncControlAudioEngine, error: Error) => engine.failSeek(error),
    ],
    [
      'fastSeek',
      (player: AudioPlayer) => player.fastSeek(24),
      (engine: DeferredAsyncControlAudioEngine, error: Error) => engine.failFastSeek(error),
    ],
    [
      'setAdaptiveQuality',
      (player: AudioPlayer) => player.setAdaptiveQuality('high'),
      (engine: DeferredAsyncControlAudioEngine, error: Error) => engine.failQualitySelection(error),
    ],
  ] as const)(
    'rejects a never-settling %s with the exact fatal engine error',
    async (_operationName, startOperation, failOperation) => {
      const engine = new DeferredAsyncControlAudioEngine()
      const player = new AudioPlayer({}, engine)
      const fatalError = new GAudioError('ENGINE_ERROR', 'Async engine control failed')
      const publishedErrors: GAudioError[] = []
      player.on('error', error => publishedErrors.push(error))

      const operation = startOperation(player)
      engine.emit('error', fatalError)

      // AI modified: fatal events settle controls with their canonical error before engine promises reject.
      await expect(operation).rejects.toBe(fatalError)
      expect(publishedErrors).toEqual([fatalError])
      failOperation(engine, new Error('Late private control rejection'))
      await Promise.resolve()
    },
  )

  it.each([
    [
      'seek',
      (player: AudioPlayer) => player.seek(24),
      (engine: DeferredAsyncControlAudioEngine) => engine.finishSeek(),
    ],
    [
      'fastSeek',
      (player: AudioPlayer) => player.fastSeek(24),
      (engine: DeferredAsyncControlAudioEngine) => engine.finishFastSeek(),
    ],
    [
      'setAdaptiveQuality',
      (player: AudioPlayer) => player.setAdaptiveQuality('high'),
      (engine: DeferredAsyncControlAudioEngine) => engine.finishQualitySelection(),
    ],
  ] as const)(
    'rejects post-success %s bookkeeping with the exact intervening fatal error',
    async (_operationName, startOperation, finishOperation) => {
      const engine = new DeferredAsyncControlAudioEngine()
      const player = new AudioPlayer({}, engine)
      const fatalError = new GAudioError('ENGINE_ERROR', 'Engine failed after control completion')
      const publishedErrors: GAudioError[] = []
      player.on('error', error => publishedErrors.push(error))

      const operation = startOperation(player)
      finishOperation(engine)
      // AI modified: the fatal event runs after the engine gate resolves but before the public async continuation resumes.
      queueMicrotask(() => engine.emit('error', fatalError))

      await expect(operation).rejects.toBe(fatalError)
      expect(publishedErrors).toEqual([fatalError])
      expect(player.getState()).toBe('error')

      player.dispose()
    },
  )

  it.each([
    [
      'seek',
      (player: AudioPlayer) => player.seek(24),
      (engine: DeferredPositionQueryErrorAudioEngine) => engine.finishSeek(),
    ],
    [
      'fastSeek',
      (player: AudioPlayer) => player.fastSeek(24),
      (engine: DeferredPositionQueryErrorAudioEngine) => engine.finishFastSeek(),
    ],
  ] as const)(
    'rejects %s when post-engine Media Session bookkeeping emits a fatal error',
    async (_operationName, startOperation, finishOperation) => {
      const mediaSession = new FakeMediaSession()
      vi.stubGlobal('navigator', { mediaSession })
      vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
      const engine = new DeferredPositionQueryErrorAudioEngine()
      const player = new AudioPlayer({ mediaSession: true }, engine)
      const fatalError = new GAudioError('ENGINE_ERROR', 'Position query failed')
      const publishedErrors: GAudioError[] = []
      player.on('error', error => publishedErrors.push(error))

      const operation = startOperation(player)
      engine.positionQueryError = fatalError
      finishOperation(engine)

      // AI modified: player bookkeeping remains inside the exact fatal-error identity boundary.
      await expect(operation).rejects.toBe(fatalError)
      expect(publishedErrors).toEqual([fatalError])
      expect(player.getState()).toBe('error')
    },
  )

  it.each([
    [
      'seek',
      (player: AudioPlayer) => player.seek(24),
      (engine: DeferredAsyncControlAudioEngine, error: Error) => engine.failSeek(error),
    ],
    [
      'fastSeek',
      (player: AudioPlayer) => player.fastSeek(24),
      (engine: DeferredAsyncControlAudioEngine, error: Error) => engine.failFastSeek(error),
    ],
    [
      'setAdaptiveQuality',
      (player: AudioPlayer) => player.setAdaptiveQuality('high'),
      (engine: DeferredAsyncControlAudioEngine, error: Error) => engine.failQualitySelection(error),
    ],
  ] as const)(
    'rejects a never-settling %s when source replacement takes ownership',
    async (_operationName, startOperation, failOperation) => {
      const engine = new DeferredAsyncControlAudioEngine()
      const player = new AudioPlayer({ source: 'https://example.com/first.mp3' }, engine)
      const publishedErrors: GAudioError[] = []
      player.on('error', error => publishedErrors.push(error))

      const operation = startOperation(player)
      player.setSource('https://example.com/second.mp3')

      // AI modified: source replacement settles old controls without waiting for their engine promises.
      await expect(operation).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
      failOperation(engine, new Error('Late old-source control rejection'))
      await Promise.resolve()
      expect(publishedErrors).toEqual([])
    },
  )

  it.each([
    ['seek', (player: AudioPlayer) => player.seek(24)],
    ['setAdaptiveQuality', (player: AudioPlayer) => player.setAdaptiveQuality('high')],
  ] as const)(
    'a newer %s promptly supersedes its never-settling predecessor',
    async (_operationName, startOperation) => {
      const engine = new DeferredAsyncControlAudioEngine()
      const player = new AudioPlayer({}, engine)

      const firstOperation = startOperation(player)
      const secondOperation = startOperation(player)
      const secondExpectation = expect(secondOperation).rejects.toMatchObject({ code: 'ENGINE_ERROR' })

      await expect(firstOperation).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
      player.dispose()
      await secondExpectation
    },
  )

  it('loads a URL source and reports ready state', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const states: string[] = []

    player.on('statechange', (state) => {
      states.push(state)
    })

    await player.load()

    expect(engine.loadedSources).toHaveLength(1)
    expect(player.getState()).toBe('ready')
    expect(states).toEqual(['loading', 'ready'])
  })

  it('rejects a never-settling load promptly on player disposal and observes its late rejection', async () => {
    const engine = new DelayedLoadAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))

    const loading = player.load()
    const loadingExpectation = expect(loading).rejects.toMatchObject({ code: 'ENGINE_ERROR' })
    await vi.waitFor(() => expect(engine.loadedSources).toHaveLength(1))
    player.dispose()

    // AI modified: permanent disposal terminates load without waiting for custom-engine cooperation.
    await loadingExpectation
    engine.failLoading(new Error('Late load rejection after disposal'))
    await Promise.resolve()
    expect(errors).toEqual([])
  })

  it('rejects a never-settling load promptly when its source is replaced', async () => {
    const engine = new DelayedLoadAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/first.mp3' }, engine)
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))

    const loading = player.load()
    const loadingExpectation = expect(loading).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    await vi.waitFor(() => expect(engine.loadedSources).toHaveLength(1))
    player.setSource('https://example.com/second.mp3')

    // AI modified: source ownership changes terminate the old load while its engine request remains pending.
    await loadingExpectation
    engine.failLoading(new Error('Late old-source load rejection'))
    await Promise.resolve()
    expect(errors).toEqual([])
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/second.mp3' })
  })

  it('rejects a never-settling load with the exact fatal engine error', async () => {
    const engine = new DelayedLoadAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const fatalError = new GAudioError('NETWORK_ERROR', 'Audio load failed')
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))

    const loading = player.load()
    await vi.waitFor(() => expect(engine.loadedSources).toHaveLength(1))
    engine.emit('error', fatalError)

    // AI modified: a fatal load event owns the promise with the same published error identity.
    await expect(loading).rejects.toBe(fatalError)
    expect(errors).toEqual([fatalError])
    engine.failLoading(new Error('Late private load rejection'))
    await Promise.resolve()
  })

  it.each([
    ['load', (player: AudioPlayer): Promise<unknown> => {
      player.setSource('https://example.com/audio.mp3')
      return player.load()
    }],
    ['play', (player: AudioPlayer): Promise<unknown> => {
      player.setSource('https://example.com/audio.mp3')
      return player.play()
    }],
    ['selectPlaylistTrack', (player: AudioPlayer): Promise<unknown> => {
      player.setPlaylist([
        { source: 'https://example.com/first.mp3' },
        { source: 'https://example.com/second.mp3' },
      ])
      return player.selectPlaylistTrack(1)
    }],
    ['next', (player: AudioPlayer): Promise<unknown> => {
      player.setPlaylist([
        { source: 'https://example.com/first.mp3' },
        { source: 'https://example.com/second.mp3' },
      ])
      return player.next()
    }],
    ['previous', (player: AudioPlayer): Promise<unknown> => {
      player.setPlaylist([
        { source: 'https://example.com/first.mp3' },
        { source: 'https://example.com/second.mp3' },
      ], { startIndex: 1 })
      return player.previous()
    }],
    ['selectAudioTrack', (player: AudioPlayer): Promise<unknown> => {
      player.setPlaylist([{
        source: 'https://example.com/program.en.mp3',
        audioTracks: [
          { id: 'en', source: 'https://example.com/program.en.mp3' },
          { id: 'ko', source: 'https://example.com/program.ko.mp3' },
        ],
      }])
      return player.selectAudioTrack('ko')
    }],
  ] as const)(
    'rejects %s when its ready observer disposes the player',
    async (_operationName, startOperation) => {
      const engine = new FakeAudioEngine()
      const player = new AudioPlayer({}, engine)
      const errors: GAudioError[] = []
      player.on('error', error => errors.push(error))
      player.on('statechange', (state) => {
        if (state === 'ready') {
          player.dispose()
        }
      })

      // AI modified: reentrant disposal at the ready boundary terminates every load-backed public operation.
      await expect(startOperation(player)).rejects.toMatchObject({ code: 'ENGINE_ERROR' })
      expect(errors).toEqual([])
      expect(player.getState()).toBe('idle')
    },
  )

  it('rejects load with the fatal engine error emitted by a ready observer', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const fatalError = new GAudioError('ENGINE_ERROR', 'Ready observer detected engine failure')
    const publishedErrors: GAudioError[] = []
    player.on('error', error => publishedErrors.push(error))
    player.on('statechange', (state) => {
      if (state === 'ready') {
        engine.emit('error', fatalError)
      }
    })

    // AI modified: the ready transition stays inside load()'s fatal-error identity boundary.
    await expect(player.load()).rejects.toBe(fatalError)
    expect(publishedErrors).toEqual([fatalError])
    expect(player.getState()).toBe('error')
  })

  it('treats an empty constructor source the same as setSource', async () => {
    const constructorEngine = new FakeAudioEngine()
    const constructorPlayer = new AudioPlayer({ source: '' }, constructorEngine)
    const setterEngine = new FakeAudioEngine()
    const setterPlayer = new AudioPlayer({}, setterEngine)
    setterPlayer.setSource('')

    await Promise.all([constructorPlayer.load(), setterPlayer.load()])

    expect(constructorEngine.loadedSources.map(source => source.url)).toEqual([''])
    expect(setterEngine.loadedSources.map(source => source.url)).toEqual([''])
  })

  it('routes source descriptions through registered adapters', async () => {
    const engine = new FakeAudioEngine()
    const adapter = new FakeHlsAdapter(engine)
    const player = new AudioPlayer({ adapters: [adapter] })

    player.setSource({
      url: 'https://example.com/stream?id=1',
      protocol: 'hls',
    })
    await player.load()

    expect(adapter.createCalls).toBe(1)
    expect(engine.loadedSources[0]).toMatchObject({
      url: 'https://example.com/stream?id=1',
      protocol: 'hls',
    })
  })

  it('wraps custom adapter creation failures and publishes the same player error', async () => {
    const adapterCreationError = new Error('custom adapter creation failed')
    const adapter: AudioEngineAdapter = {
      protocol: 'hls',
      isSupported: () => true,
      createEngine: () => {
        throw adapterCreationError
      },
    }
    const player = new AudioPlayer({
      source: {
        url: 'https://example.com/audio.m3u8',
        protocol: 'hls',
      },
      adapters: [adapter],
    })
    const publishedErrors: GAudioError[] = []
    player.on('error', error => publishedErrors.push(error))
    let loadFailure: unknown

    try {
      await player.load()
    }
    catch (error) {
      loadFailure = error
    }

    // AI modified: direct adapter errors become one observable player-owned load failure.
    expect(loadFailure).toMatchObject({
      code: 'ENGINE_ERROR',
      cause: adapterCreationError,
    })
    expect(publishedErrors).toHaveLength(1)
    expect(publishedErrors[0]).toBe(loadFailure)
    expect(player.getState()).toBe('error')
  })

  it('switches between HLS and DASH sources through the registered adapters', async () => {
    const hlsEngine = new FakeAudioEngine()
    const dashEngine = new FakeAudioEngine()
    const hlsAdapter = new FakeHlsAdapter(hlsEngine)
    const dashAdapter = new FakeDashAdapter(dashEngine)
    const player = new AudioPlayer({ adapters: [hlsAdapter, dashAdapter] })

    player.setSource({ url: 'https://example.com/audio.m3u8', protocol: 'hls' })
    await player.load()
    player.setSource({ url: 'https://example.com/audio.mpd', protocol: 'dash' })
    await player.load()

    expect(hlsAdapter.createCalls).toBe(1)
    expect(dashAdapter.createCalls).toBe(1)
    expect(hlsEngine.loadedSources).toHaveLength(1)
    expect(dashEngine.loadedSources).toHaveLength(1)
    expect(hlsEngine.isUnloaded).toBe(true)
    expect(hlsEngine.disposeCalls).toBe(1)
    expect(player.getState()).toBe('ready')
  })

  it('does not transfer an adapter setting rejected through the public player API', async () => {
    const settingError = new Error('active engine rejected volume')
    const hlsEngine = new FakeAudioEngine()
    const dashEngine = new FakeAudioEngine()
    const player = new AudioPlayer({
      adapters: [new FakeHlsAdapter(hlsEngine), new FakeDashAdapter(dashEngine)],
    })
    player.setSource({ url: 'https://example.com/audio.m3u8', protocol: 'hls' })
    await player.load()
    vi.spyOn(hlsEngine, 'setVolume').mockImplementation(() => {
      throw settingError
    })

    expect(() => player.setVolume(0.25)).toThrow(settingError)
    expect(player.getVolume()).toBe(1)
    player.setSource({ url: 'https://example.com/audio.mpd', protocol: 'dash' })
    await player.load()

    // AI modified: rejected adapter state must not reappear after a protocol transition.
    expect(dashEngine.volume).toBe(1)
  })

  it('rejects adapters combined with an explicit custom engine', () => {
    const engine = new FakeAudioEngine()
    const adapter = new FakeHlsAdapter(new FakeAudioEngine())

    expect(() => new AudioPlayer({ adapters: [adapter] }, engine)).toThrow(TypeError)
  })

  it('releases adapter ownership when player construction fails', () => {
    const adapter = new FakeHlsAdapter(new FakeAudioEngine())

    expect(() => new AudioPlayer({ adapters: [adapter], volume: 2 })).toThrow(RangeError)

    const player = new AudioPlayer({ adapters: [adapter] })
    player.dispose()
  })

  it('forwards adaptive events and uses the error event for fatal state changes', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    const implementations: string[] = []
    const streamErrors: boolean[] = []

    player.on('adaptivechange', ({ implementation }) => implementations.push(implementation))
    player.on('streamerror', ({ isFatal }) => streamErrors.push(isFatal))

    engine.emit('adaptivechange', { protocol: 'hls', implementation: 'hls.js' })
    engine.emit('streamerror', {
      protocol: 'hls',
      implementation: 'hls.js',
      category: 'segment',
      isFatal: true,
    })

    expect(player.getState()).toBe('idle')

    engine.emit('error', new GAudioError('SEGMENT_ERROR', 'Segment loading failed'))

    expect(implementations).toEqual(['hls.js'])
    expect(streamErrors).toEqual([true])
    expect(player.getState()).toBe('error')
  })

  it('starts playback after loading when autoplay is enabled', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3', autoplay: true }, engine)

    await player.load()

    expect(engine.loadedSources).toHaveLength(1)
    expect(engine.playCalls).toBe(1)
  })

  it('does not duplicate playback when play loads with autoplay enabled', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3', autoplay: true }, engine)

    await player.play()

    expect(engine.loadedSources).toHaveLength(1)
    expect(engine.playCalls).toBe(1)
  })

  it('keeps the loaded source available after autoplay is blocked', async () => {
    const engine = new FakeAudioEngine()
    engine.playError = new GAudioError('PLAYBACK_BLOCKED', 'Browser blocked audio playback')
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3', autoplay: true }, engine)
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))

    await expect(player.load()).rejects.toMatchObject({ code: 'PLAYBACK_BLOCKED' })
    expect(player.getState()).toBe('error')
    expect(errors).toHaveLength(1)

    engine.playError = undefined
    await player.play()

    expect(engine.loadedSources).toHaveLength(1)
    expect(engine.playCalls).toBe(2)
  })

  it('rejects a pending play with the fatal engine error when engine play also rejects', async () => {
    const engine = new DeferredPlayAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const playbackError = new GAudioError('ENGINE_ERROR', 'Engine playback failed')
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))
    await player.load()

    const playing = player.play()
    engine.emit('error', playbackError)

    // AI modified: a fatal engine event settles play even while the engine request remains pending.
    await expect(playing).rejects.toBe(playbackError)
    engine.failPlayback(new GAudioError('ENGINE_ERROR', 'Late private playback rejection'))
    await Promise.resolve()
    expect(player.getState()).toBe('error')
    expect(errors).toEqual([playbackError])
  })

  it('rejects a pending play when player disposal terminates the engine request', async () => {
    class DisposalRejectingAudioEngine extends DeferredPlayAudioEngine {
      readonly disposalError = new GAudioError('ENGINE_ERROR', 'Engine playback was disposed')

      override dispose(): void {
        this.failPlayback(this.disposalError)
        super.dispose()
      }
    }

    const engine = new DisposalRejectingAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))
    await player.load()
    const playing = player.play()
    const playbackExpectation = expect(playing).rejects.toMatchObject({ code: 'ENGINE_ERROR' })

    player.dispose()

    // AI modified: player disposal owns the public result before engine teardown settles its private request.
    await playbackExpectation
    expect(errors).toEqual([])
    expect(player.getState()).toBe('idle')
  })

  it('rejects a pending play that resolves only after player disposal', async () => {
    const engine = new DeferredPlayAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))
    await player.load()
    const playing = player.play()
    const playbackExpectation = expect(playing).rejects.toMatchObject({ code: 'ENGINE_ERROR' })

    player.dispose()

    // AI modified: disposal remains terminal without waiting for a custom engine to settle.
    await playbackExpectation
    engine.finishPlayback()
    await Promise.resolve()
    expect(errors).toEqual([])
    expect(player.getState()).toBe('idle')
  })

  it('rejects autoplay load when engine play resolves after emitting a fatal error', async () => {
    const engine = new DeferredPlayAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      autoplay: true,
    }, engine)
    const playbackError = new GAudioError('ENGINE_ERROR', 'Engine playback failed')
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))

    const loading = player.load()
    await vi.waitFor(() => expect(engine.playCalls).toBe(1))
    engine.emit('error', playbackError)

    // AI modified: the engine error terminates autoplay without waiting for the play promise.
    await expect(loading).rejects.toBe(playbackError)
    engine.finishPlayback()
    await vi.waitFor(() => expect(engine.pauseCalls).toBe(1))
    expect(engine.pauseCalls).toBe(1)
    expect(engine.isPlaying).toBe(false)
    expect(player.getState()).toBe('error')
    expect(errors).toEqual([playbackError])
  })

  it('rejects autoplay load when source replacement silently releases its pending play', async () => {
    const engine = new DeferredPlayAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/first.mp3',
      autoplay: true,
    }, engine)
    const publishedErrors: GAudioError[] = []
    player.on('error', error => publishedErrors.push(error))

    const loading = player.load()
    await vi.waitFor(() => expect(engine.playCalls).toBe(1))
    player.setSource('https://example.com/second.mp3')

    // AI modified: silent play supersession cannot turn its owning obsolete load into success.
    await expect(loading).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    engine.failPlayback(new GAudioError('LOAD_ABORTED', 'Late obsolete autoplay rejection'))
    await Promise.resolve()
    expect(publishedErrors).toEqual([])
  })

  it('rejects every concurrent pending play with the shared fatal engine error', async () => {
    const engine = new ConcurrentDeferredPlayAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const playbackError = new GAudioError('ENGINE_ERROR', 'Concurrent playback failed')
    await player.load()

    const firstPlayback = player.play()
    const secondPlayback = player.play()
    const firstExpectation = expect(firstPlayback).rejects.toBe(playbackError)
    const secondExpectation = expect(secondPlayback).rejects.toBe(playbackError)
    engine.emit('error', playbackError)

    // AI modified: one fatal engine event terminates all in-flight plays before their promises reject.
    await Promise.all([firstExpectation, secondExpectation])
    engine.failPendingPlayback(new GAudioError('ENGINE_ERROR', 'Late concurrent playback rejection'))
    await Promise.resolve()
    expect(player.getState()).toBe('error')
  })

  it('does not assign a replacement source error to its superseded pending play', async () => {
    const engine = new ConcurrentDeferredPlayAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/first.mp3' }, engine)
    await player.load()

    const supersededPlayback = player.play()
    player.setSource('https://example.com/second.mp3')
    await expect(supersededPlayback).resolves.toBeUndefined()
    await player.load()
    const currentPlayback = player.play()
    const currentError = new GAudioError('ENGINE_ERROR', 'Replacement playback failed')
    const currentExpectation = expect(currentPlayback).rejects.toBe(currentError)

    engine.emit('error', currentError)
    engine.failPlaybackRequest(1, currentError)
    engine.failPlaybackRequest(0, new GAudioError('LOAD_ABORTED', 'Old playback was superseded'))

    // AI modified: terminal playback errors are scoped to the source generation that emitted them.
    await currentExpectation
    expect(player.getState()).toBe('error')
  })

  it('reloads before playing after the previous source load failed', async () => {
    class RetriableLoadAudioEngine extends FakeAudioEngine {
      shouldFailLoading = true

      override async load(source: Parameters<FakeAudioEngine['load']>[0]): Promise<void> {
        await super.load(source)
        if (this.shouldFailLoading) {
          throw new GAudioError('NETWORK_ERROR', 'Source loading failed')
        }
      }
    }

    const engine = new RetriableLoadAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)

    await expect(player.load()).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(player.getState()).toBe('error')

    engine.shouldFailLoading = false
    await player.play()

    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/audio.mp3',
      'https://example.com/audio.mp3',
    ])
    expect(engine.playCalls).toBe(1)
    expect(player.getState()).toBe('ready')
  })

  it('does not publish an error when pause supersedes a pending play rejection', async () => {
    const engine = new DeferredPlayAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))
    await player.load()

    const playing = player.play()
    player.pause()

    // AI modified: pause silently releases play without waiting for the engine's pending rejection.
    await expect(playing).resolves.toBeUndefined()
    engine.failPlayback(new GAudioError('PLAYBACK_BLOCKED', 'Playback was interrupted by pause'))
    await Promise.resolve()
    expect(player.getState()).toBe('paused')
    expect(errors).toEqual([])
  })

  it('keeps a current playback failure from being overwritten by its queued pause event', async () => {
    const engine = new FakeAudioEngine()
    engine.playError = new GAudioError('PLAYBACK_BLOCKED', 'Browser blocked audio playback')
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const pauseEvents: string[] = []
    player.on('pause', () => pauseEvents.push('pause'))
    await player.load()

    await expect(player.play()).rejects.toMatchObject({ code: 'PLAYBACK_BLOCKED' })
    engine.emit('pause', undefined)

    expect(player.getState()).toBe('error')
    expect(pauseEvents).toEqual([])
  })

  it('does not overwrite a retry started by a playback error state listener', async () => {
    const engine = new FakeAudioEngine()
    engine.playError = new GAudioError('PLAYBACK_BLOCKED', 'Browser blocked audio playback')
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    let retryPlayback: Promise<void> | undefined
    player.on('statechange', (state) => {
      if (state === 'error' && !retryPlayback) {
        engine.playError = undefined
        retryPlayback = player.play()
      }
    })
    await player.load()

    await expect(player.play()).rejects.toMatchObject({ code: 'PLAYBACK_BLOCKED' })
    await retryPlayback
    engine.emit('playing', undefined)

    expect(engine.playCalls).toBe(2)
    expect(player.getState()).toBe('playing')
  })

  it.each(['pause', 'stop'] as const)('reapplies %s when a superseded play resolves late', async (control) => {
    const engine = new DeferredPlayAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    await player.load()

    const playing = player.play()
    player[control]()
    await expect(playing).resolves.toBeUndefined()
    engine.finishPlayback()

    await vi.waitFor(() => {
      expect(control === 'pause' ? engine.pauseCalls : engine.stopCalls).toBe(2)
    })
    expect(engine.isPlaying).toBe(false)
    expect(player.getState()).toBe(control === 'pause' ? 'paused' : 'ready')
  })

  it('publishes a synchronous late-play stop error after the superseded play settles silently', async () => {
    const engine = new DeferredPlayAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const stopError = new GAudioError('ENGINE_ERROR', 'Engine stop failed')
    const errors: GAudioError[] = []
    let stopInvocationCount = 0
    const stop = engine.stop.bind(engine)
    vi.spyOn(engine, 'stop').mockImplementation(() => {
      stop()
      stopInvocationCount += 1
      if (stopInvocationCount === 2) {
        engine.emit('error', stopError)
      }
    })
    player.on('error', error => errors.push(error))
    await player.load()

    const playing = player.play()
    player.stop()
    await expect(playing).resolves.toBeUndefined()
    engine.finishPlayback()

    // AI modified: background stop enforcement still reports failure after stop promptly releases play().
    await vi.waitFor(() => expect(errors).toEqual([stopError]))
    expect(engine.stopCalls).toBe(2)
    expect(player.getState()).toBe('error')
  })

  it.each([
    ['GAudioError', new GAudioError('ENGINE_ERROR', 'Late stop failed')],
    ['raw error', new Error('Late stop failed')],
  ] as const)('publishes a synchronous %s from late-play stop enforcement after play is superseded', async (
    _errorKind,
    stopError,
  ) => {
    const engine = new DeferredPlayAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const publishedErrors: GAudioError[] = []
    let stopInvocationCount = 0
    const stop = engine.stop.bind(engine)
    vi.spyOn(engine, 'stop').mockImplementation(() => {
      stopInvocationCount += 1
      if (stopInvocationCount === 2) {
        throw stopError
      }
      stop()
    })
    player.on('error', error => publishedErrors.push(error))
    await player.load()

    const playing = player.play()
    player.stop()
    await expect(playing).resolves.toBeUndefined()
    engine.finishPlayback()

    // AI modified: internal late-play correction remains observable after the public play wait is released.
    await vi.waitFor(() => expect(publishedErrors).toHaveLength(1))
    const [publishedError] = publishedErrors
    if (stopError instanceof GAudioError) {
      expect(publishedError).toBe(stopError)
    }
    else {
      expect(publishedError).toMatchObject({
        code: 'ENGINE_ERROR',
        cause: stopError,
      })
    }
    expect(player.getState()).toBe('error')
  })

  it('does not publish a late-play enforcement failure superseded by a reentrant replacement', async () => {
    const engine = new DeferredPlayAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/first.mp3' }, engine)
    const enforcementError = new Error('Obsolete late stop failed')
    const publishedErrors: GAudioError[] = []
    let stopInvocationCount = 0
    const stop = engine.stop.bind(engine)
    vi.spyOn(engine, 'stop').mockImplementation(() => {
      stopInvocationCount += 1
      if (stopInvocationCount === 2) {
        player.setSource('https://example.com/replacement.mp3')
        throw enforcementError
      }
      stop()
    })
    player.on('error', error => publishedErrors.push(error))
    await player.load()

    const playing = player.play()
    player.stop()
    engine.finishPlayback()

    // AI modified: the reentrant replacement owns state after invalidating late-play enforcement.
    await expect(playing).resolves.toBeUndefined()
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/replacement.mp3' })
    expect(player.getState()).toBe('idle')
    expect(publishedErrors).toEqual([])
  })

  it('does not let a pending play start a replacement source', async () => {
    const engine = new DeferredPlayAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/first.mp3' }, engine)

    await player.load()
    const obsoletePlayback = player.play()
    player.setSource('https://example.com/second.mp3')
    await expect(obsoletePlayback).resolves.toBeUndefined()
    await player.load()
    engine.finishPlayback()
    await Promise.resolve()

    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/first.mp3',
      'https://example.com/second.mp3',
    ])
    expect(engine.pauseCalls).toBe(1)
    expect(engine.isPlaying).toBe(false)
    expect(player.getState()).toBe('paused')
  })

  it('rejects invalid numeric controls before mutating the engine', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    expect(() => player.setVolume(Number.NaN)).toThrow(RangeError)
    expect(() => player.setVolume(1.1)).toThrow(RangeError)
    expect(() => player.setPlaybackRate(0)).toThrow(RangeError)
    await expect(player.seek(-1)).rejects.toThrow(RangeError)
    await expect(player.fastSeek(Number.POSITIVE_INFINITY)).rejects.toThrow(RangeError)

    expect(engine.volume).toBe(1)
    expect(engine.playbackRate).toBe(1)
    expect(player.getCurrentTime()).toBe(0)
    expect(engine.fastSeekCalls).toEqual([])
  })

  it('uses engine lifecycle events as the playback state source', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)

    await player.load()
    await player.play()
    expect(player.getState()).toBe('ready')

    engine.emit('playing', undefined)
    expect(player.getState()).toBe('playing')

    engine.emit('waiting', undefined)
    expect(player.getState()).toBe('buffering')

    engine.emit('playing', undefined)
    expect(player.getState()).toBe('playing')

    player.pause()
    engine.emit('pause', undefined)
    expect(player.getState()).toBe('paused')
  })

  it('ignores queued playing and waiting events after a newer pause request', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const playbackEvents: string[] = []
    player.on('playing', () => playbackEvents.push('playing'))
    player.on('waiting', () => playbackEvents.push('waiting'))

    await player.load()
    await player.play()
    player.pause()

    engine.emit('playing', undefined)
    engine.emit('waiting', undefined)

    expect(player.getState()).toBe('ready')
    expect(playbackEvents).toEqual([])

    engine.emit('pause', undefined)
    expect(player.getState()).toBe('paused')
  })

  it('keeps a terminal engine error from being revived by queued playback events', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const playbackEvents: string[] = []
    player.on('playing', () => playbackEvents.push('playing'))
    player.on('waiting', () => playbackEvents.push('waiting'))
    player.on('ended', () => playbackEvents.push('ended'))

    await player.load()
    await player.play()
    engine.emit('playing', undefined)
    expect(player.getState()).toBe('playing')
    playbackEvents.length = 0

    engine.emit('error', new GAudioError('NETWORK_ERROR', 'Playback failed'))
    expect(player.getState()).toBe('error')

    engine.emit('waiting', undefined)
    engine.emit('playing', undefined)
    engine.ended = true
    engine.emit('ended', undefined)

    expect(player.getState()).toBe('error')
    expect(playbackEvents).toEqual([])
  })

  it('ignores a queued pause event after a newer play request', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const pauseEvents: string[] = []
    player.on('pause', () => pauseEvents.push('pause'))

    await player.load()
    player.pause()
    engine.emit('pause', undefined)
    expect(pauseEvents).toEqual(['pause'])

    await player.play()
    engine.emit('pause', undefined)

    expect(player.getState()).toBe('paused')
    expect(pauseEvents).toEqual(['pause'])

    engine.emit('playing', undefined)
    expect(player.getState()).toBe('playing')
  })

  it('ignores queued playback events after stop and does not advance the playlist', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    const staleEvents: string[] = []
    player.setPlaylist([
      { source: 'https://example.com/first.mp3' },
      { source: 'https://example.com/second.mp3' },
    ])
    player.on('playing', () => staleEvents.push('playing'))
    player.on('pause', () => staleEvents.push('pause'))
    player.on('ended', () => staleEvents.push('ended'))

    await player.load()
    await player.play()
    engine.ended = true
    player.stop()
    engine.ended = false

    engine.emit('playing', undefined)
    engine.emit('pause', undefined)
    engine.emit('ended', undefined)
    await Promise.resolve()

    expect(staleEvents).toEqual([])
    expect(player.getState()).toBe('ready')
    expect(player.getPlaylistIndex()).toBe(0)
    expect(engine.loadedSources).toHaveLength(1)
  })

  it.each([
    ['playing', 'playing'],
    ['pause', 'paused'],
    ['waiting', 'buffering'],
    ['ended', 'ended'],
  ] as const)('does not publish a stale %s event after a state observer replaces the source', async (eventName, state) => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/first.mp3' }, engine)
    const publishedEvents: string[] = []
    player.on(eventName, () => publishedEvents.push(eventName))
    player.on('statechange', (nextState) => {
      if (nextState === state) {
        player.setSource('https://example.com/replacement.mp3')
      }
    })

    await player.load()
    if (eventName === 'pause') {
      player.pause()
    }
    else {
      await player.play()
    }
    if (eventName === 'ended') {
      engine.ended = true
    }
    engine.emit(eventName, undefined)

    expect(publishedEvents).toEqual([])
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/replacement.mp3' })
    expect(player.getState()).toBe('idle')
  })

  it('does not publish a stale lifecycle event after a state observer stops playback', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const playingEvents: string[] = []
    player.on('playing', () => playingEvents.push('playing'))
    player.on('statechange', (state) => {
      if (state === 'playing') {
        player.stop()
      }
    })

    await player.load()
    await player.play()
    engine.emit('playing', undefined)

    expect(playingEvents).toEqual([])
    expect(player.getState()).toBe('ready')
  })

  it('does not publish a stale error after its state observer replaces the source', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/first.mp3' }, engine)
    const publishedErrors: GAudioError[] = []
    player.on('error', error => publishedErrors.push(error))
    player.on('statechange', (state) => {
      if (state === 'error') {
        player.setSource('https://example.com/replacement.mp3')
      }
    })

    engine.emit('error', new GAudioError('NETWORK_ERROR', 'The previous source failed'))

    expect(publishedErrors).toEqual([])
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/replacement.mp3' })
    expect(player.getState()).toBe('idle')
  })

  it('forwards typed lifecycle events', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    const receivedEvents: string[] = []

    player.on('seeking', ({ currentTime }) => receivedEvents.push(`seeking:${currentTime}`))
    player.on('volumechange', ({ volume, isMuted }) => receivedEvents.push(`volume:${volume}:${isMuted}`))
    player.on('ratechange', ({ playbackRate }) => receivedEvents.push(`rate:${playbackRate}`))

    engine.emit('seeking', { currentTime: 12, duration: 120 })
    engine.emit('volumechange', { volume: 0.5, isMuted: true })
    engine.emit('ratechange', { playbackRate: 1.25 })

    expect(receivedEvents).toEqual(['seeking:12', 'volume:0.5:true', 'rate:1.25'])
  })

  it('returns the current source object', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)

    expect(player.getSource()).toMatchObject({
      url: 'https://example.com/audio.mp3',
      kind: 'url',
    })

    player.setSource({
      url: 'https://example.com/stream.m3u8',
      protocol: 'hls',
    })

    expect(player.getSource()).toMatchObject({
      url: 'https://example.com/stream.m3u8',
      protocol: 'hls',
    })
  })

  it('commits a replacement source when engine teardown reports a failure', async () => {
    const teardownError = new Error('vendor teardown failed')
    const engine = new ThrowingUnloadAudioEngine()
    const player = new AudioPlayer({ source: '/old.mp3' }, engine)
    await player.load()
    engine.emit('playing', undefined)
    engine.unloadError = teardownError
    let replacementFailure: unknown

    try {
      player.setSource('/new.mp3')
    }
    catch (error) {
      replacementFailure = error
    }

    // AI modified: engine teardown identity is part of the source-replacement exception boundary.
    expect(replacementFailure).toBe(teardownError)
    expect(engine.isUnloaded).toBe(true)
    expect(player.getSource()).toMatchObject({ url: '/new.mp3' })
    expect(player.getPlaylist()).toEqual([])
    expect(player.getPlaylistIndex()).toBe(-1)
    expect(player.getState()).toBe('idle')
  })

  it('clears playlist state when engine teardown reports a failure', async () => {
    const teardownError = new Error('vendor teardown failed')
    const engine = new ThrowingUnloadAudioEngine()
    const player = new AudioPlayer({}, engine)
    player.setPlaylist([{ source: '/old.mp3' }])
    await player.load()
    engine.emit('playing', undefined)
    engine.unloadError = teardownError
    let replacementFailure: unknown

    try {
      player.setPlaylist([])
    }
    catch (error) {
      replacementFailure = error
    }

    // AI modified: playlist replacement preserves the same engine cleanup error object.
    expect(replacementFailure).toBe(teardownError)
    expect(engine.isUnloaded).toBe(true)
    expect(player.getSource()).toBeUndefined()
    expect(player.getPlaylist()).toEqual([])
    expect(player.getPlaylistIndex()).toBe(-1)
    expect(player.getAudioTracks()).toEqual([])
    expect(player.getState()).toBe('idle')
  })

  it('reports adapter MIME support before an adaptive source is loaded', () => {
    const hlsAdapter = new FakeHlsAdapter(new FakeAudioEngine())
    const dashAdapter = new FakeDashAdapter(new FakeAudioEngine())
    const player = new AudioPlayer({ adapters: [hlsAdapter, dashAdapter] })

    expect(player.canPlayType('application/vnd.apple.mpegurl')).toBe('probably')
    expect(player.canPlayType('application/dash+xml')).toBe('probably')
    expect(player.canPlayType('audio/unknown')).toBe('')
  })

  it('exposes active adaptive playback and unified quality selection', async () => {
    const engine = new FakeAudioEngine()
    engine.activeAdaptivePlayback = { protocol: 'hls', implementation: 'hls.js' }
    engine.adaptiveVariants.push(
      { id: 'low', bitrate: 64_000, codecs: 'mp4a.40.2' },
      { id: 'high', bitrate: 192_000, codecs: 'mp4a.40.2' },
    )
    const player = new AudioPlayer({}, engine)

    expect(player.getActiveAdaptivePlayback()).toEqual({ protocol: 'hls', implementation: 'hls.js' })
    const activeAdaptivePlayback = player.getActiveAdaptivePlayback()
    if (!activeAdaptivePlayback) {
      throw new Error('Expected active adaptive playback')
    }
    Reflect.set(activeAdaptivePlayback, 'protocol', 'dash')
    expect(engine.activeAdaptivePlayback).toEqual({ protocol: 'hls', implementation: 'hls.js' })
    expect(player.getActiveAdaptivePlayback()).toEqual({ protocol: 'hls', implementation: 'hls.js' })
    expect(player.getAdaptiveVariants()).toEqual([
      { id: 'low', bitrate: 64_000, codecs: 'mp4a.40.2' },
      { id: 'high', bitrate: 192_000, codecs: 'mp4a.40.2' },
    ])
    const variants = player.getAdaptiveVariants()
    const firstVariant = variants[0]
    if (!firstVariant) {
      throw new Error('Expected a player variant snapshot')
    }
    Reflect.set(firstVariant, 'bitrate', 1)
    Reflect.set(variants, 'length', 0)
    expect(engine.adaptiveVariants[0]?.bitrate).toBe(64_000)
    expect(player.getAdaptiveVariants()).toEqual([
      { id: 'low', bitrate: 64_000, codecs: 'mp4a.40.2' },
      { id: 'high', bitrate: 192_000, codecs: 'mp4a.40.2' },
    ])
    expect(player.getAdaptiveQualitySelection()).toBe('auto')

    await player.setAdaptiveQuality('high')

    expect(player.getAdaptiveQualitySelection()).toBe('high')
  })

  it('supports one-time player event listeners', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const states: string[] = []

    await player.load()
    await player.play()
    player.once('statechange', state => states.push(state))

    engine.emit('playing', undefined)
    player.pause()
    engine.emit('pause', undefined)

    expect(states).toEqual(['playing'])
  })

  it('removes player listeners by event name or all at once', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    const states: string[] = []
    const playEvents: string[] = []

    player.on('statechange', state => states.push(state))
    player.on('play', () => playEvents.push('play'))

    player.removeAllListeners('statechange')
    engine.emit('playing', undefined)
    engine.emit('play', undefined)

    expect(states).toEqual([])
    expect(playEvents).toEqual(['play'])

    player.removeAllListeners()
    engine.emit('play', undefined)

    expect(playEvents).toEqual(['play'])
  })

  it('stops at ready without loading the source again', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)

    await player.load()
    engine.emit('playing', undefined)
    player.stop()
    await player.play()

    expect(player.getState()).toBe('ready')
    expect(engine.loadedSources).toHaveLength(1)
  })

  it('does not overwrite a synchronous stop error with ready state', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const stopError = new GAudioError('ENGINE_ERROR', 'Engine stop failed')
    const errors: GAudioError[] = []
    const stop = engine.stop.bind(engine)
    vi.spyOn(engine, 'stop').mockImplementation(() => {
      stop()
      engine.emit('error', stopError)
    })
    player.on('error', error => errors.push(error))
    await player.load()

    player.stop()

    // AI modified: a synchronous engine error owns the state reached during stop().
    expect(player.getState()).toBe('error')
    expect(errors).toEqual([stopError])
  })

  it('does not overwrite a synchronous stop error with idle state before loading', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const stopError = new GAudioError('ENGINE_ERROR', 'Engine stop failed')
    const errors: GAudioError[] = []
    const stop = engine.stop.bind(engine)
    vi.spyOn(engine, 'stop').mockImplementation(() => {
      stop()
      engine.emit('error', stopError)
    })
    player.on('error', error => errors.push(error))

    player.stop()

    // AI modified: the unloaded stop path preserves the same synchronous error ownership.
    expect(player.getState()).toBe('error')
    expect(errors).toEqual([stopError])
  })

  it('remains idle when stopped before a source is loaded', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)

    player.stop()

    expect(player.getState()).toBe('idle')
  })

  it('unloads the active engine when the source changes', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/first.mp3' }, engine)

    await player.load()
    player.setSource('https://example.com/second.mp3')

    expect(engine.isUnloaded).toBe(true)
    expect(player.getState()).toBe('idle')
  })

  it('throws a typed error when no source is available', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    await expect(player.load()).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
    })
    expect(player.getState()).toBe('error')
  })

  it('does not publish aborted loads as player errors', async () => {
    class AbortingEngine extends FakeAudioEngine {
      override async load(): Promise<void> {
        throw new GAudioError('LOAD_ABORTED', 'Superseded by a newer source')
      }
    }

    const engine = new AbortingEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))

    await expect(player.load()).rejects.toMatchObject({ code: 'LOAD_ABORTED' })

    expect(errors).toEqual([])
    expect(player.getState()).toBe('idle')
  })

  it('does not let an obsolete fallback overwrite a newer source', async () => {
    class SupersededFallbackEngine extends FakeAudioEngine {
      private rejectPrimaryLoad?: (error: GAudioError) => void

      override async load(source: Parameters<FakeAudioEngine['load']>[0]): Promise<void> {
        await super.load(source)
        if (source.url === 'https://example.com/old-primary.mp3') {
          await new Promise<void>((_resolve, reject) => {
            this.rejectPrimaryLoad = reject
          })
        }
      }

      failPrimaryLoad(): void {
        this.rejectPrimaryLoad?.(new GAudioError('NETWORK_ERROR', 'Old primary source failed'))
      }
    }

    const engine = new SupersededFallbackEngine()
    const player = new AudioPlayer({}, engine)
    player.setPlaylist([{
      source: 'https://example.com/old-primary.mp3',
      fallbackSources: ['https://example.com/old-fallback.mp3'],
    }])

    const obsoleteLoad = player.load()
    await vi.waitFor(() => expect(engine.loadedSources).toHaveLength(1))
    player.setSource('https://example.com/new.mp3')
    await player.load()
    engine.failPrimaryLoad()

    await expect(obsoleteLoad).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/old-primary.mp3',
      'https://example.com/new.mp3',
    ])
    expect(player.getSource()?.url).toBe('https://example.com/new.mp3')
    expect(player.getState()).toBe('ready')
  })

  it('selects playlist tracks with next and previous', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    player.setPlaylist([
      { source: 'https://example.com/first.mp3' },
      { source: 'https://example.com/second.mp3' },
      { source: 'https://example.com/third.mp3' },
    ])

    expect(player.getPlaylistIndex()).toBe(0)
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/first.mp3' })

    await player.load()
    await player.next()
    await player.previous()

    expect(player.getPlaylist().map(track => track.source)).toEqual([
      'https://example.com/first.mp3',
      'https://example.com/second.mp3',
      'https://example.com/third.mp3',
    ])
    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/first.mp3',
      'https://example.com/second.mp3',
      'https://example.com/first.mp3',
    ])
    expect(player.getPlaylistIndex()).toBe(0)
  })

  it('reports playlist boundaries without loading or changing the active track', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    const playlist = [
      { source: 'https://example.com/first.mp3' },
      { source: 'https://example.com/second.mp3' },
    ]

    player.setPlaylist(playlist)
    // AI modified: boundary navigation is a successful no-op instead of an invalid load attempt.
    await expect(player.previous()).resolves.toBe(false)
    expect(player.getPlaylistIndex()).toBe(0)

    player.setPlaylist(playlist, { startIndex: 1 })
    await expect(player.next()).resolves.toBe(false)
    expect(player.getPlaylistIndex()).toBe(1)
    expect(engine.loadedSources).toEqual([])

    player.dispose()
  })

  it('isolates playlist, audio-track, and Media Session metadata query snapshots', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    player.setMediaSessionMetadata({
      title: 'Fallback title',
      artwork: [{ src: '/fallback.png' }],
    })
    player.setPlaylist([{
      source: '/main.mp3',
      fallbackSources: ['/main-fallback.mp3'],
      metadata: {
        title: 'Track title',
        artwork: [{ src: '/track.png' }],
      },
      defaultAudioTrackId: 'en',
      audioTracks: [
        { id: 'zh', source: '/zh.mp3', fallbackSources: ['/zh-fallback.mp3'] },
        { id: 'en', source: '/en.mp3', fallbackSources: ['/en-fallback.mp3'] },
      ],
    }])
    const playlist = player.getPlaylist()
    const playlistTrack = playlist[0]
    const playlistFallbacks = playlistTrack?.fallbackSources
    const playlistMetadata = playlistTrack?.metadata
    const playlistArtwork = playlistMetadata?.artwork
    const playlistAudioTracks = playlistTrack?.audioTracks
    const playlistAudioTrack = playlistAudioTracks?.[1]
    const audioTracks = player.getAudioTracks()
    const audioTrack = audioTracks[1]
    const selectedAudioTrack = player.getSelectedAudioTrack()
    const metadata = player.getMediaSessionMetadata()
    const metadataArtwork = metadata?.artwork
    if (
      !playlistTrack
      || !playlistFallbacks
      || !playlistMetadata
      || !playlistArtwork
      || !playlistAudioTracks
      || !playlistAudioTrack
      || !audioTrack
      || !selectedAudioTrack
      || !metadata
      || !metadataArtwork
    ) {
      throw new Error('Expected complete player query snapshots')
    }

    Reflect.set(playlistTrack, 'source', '/mutated-main.mp3')
    Reflect.set(playlistFallbacks, 'length', 0)
    Reflect.set(playlistMetadata, 'title', 'Mutated track')
    Reflect.set(playlistArtwork[0], 'src', '/mutated-track.png')
    Reflect.set(playlistAudioTrack, 'source', '/mutated-en.mp3')
    Reflect.set(playlistAudioTracks, 'length', 0)
    Reflect.set(playlist, 'length', 0)
    Reflect.set(audioTrack, 'id', 'mutated')
    Reflect.set(audioTracks, 'length', 0)
    Reflect.set(selectedAudioTrack, 'id', 'mutated')
    Reflect.set(metadata, 'title', 'Mutated fallback')
    Reflect.set(metadataArtwork[0], 'src', '/mutated-fallback.png')
    Reflect.set(metadataArtwork, 'length', 0)

    expect(player.getPlaylist()).toMatchObject([{
      source: '/main.mp3',
      fallbackSources: ['/main-fallback.mp3'],
      metadata: {
        title: 'Track title',
        artwork: [{ src: '/track.png' }],
      },
      audioTracks: [
        { id: 'zh', source: '/zh.mp3', fallbackSources: ['/zh-fallback.mp3'] },
        { id: 'en', source: '/en.mp3', fallbackSources: ['/en-fallback.mp3'] },
      ],
    }])
    expect(player.getAudioTracks().map(track => track.id)).toEqual(['zh', 'en'])
    expect(player.getSelectedAudioTrack()?.id).toBe('en')
    expect(player.getMediaSessionMetadata()).toMatchObject({
      title: 'Fallback title',
      artwork: [{ src: '/fallback.png' }],
    })

    await player.load()
    expect(engine.loadedSources.map(source => source.url)).toEqual(['/en.mp3'])
  })

  it('isolates URL source descriptions at playlist input and query boundaries', async () => {
    const firstSource = { url: '/first.mp3', mimeType: 'audio/mpeg' }
    const secondSource = { url: '/second.m3u8', protocol: 'hls' as const }
    const secondFallback = { url: '/second-fallback.m3u8', protocol: 'hls' as const }
    const alternateSource = { url: '/second.en.mpd', protocol: 'dash' as const }
    const alternateFallback = { url: '/second.en-fallback.mpd', protocol: 'dash' as const }
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    player.setPlaylist([
      { source: firstSource },
      {
        source: secondSource,
        fallbackSources: [secondFallback],
        defaultAudioTrackId: 'en',
        audioTracks: [{
          id: 'en',
          source: alternateSource,
          fallbackSources: [alternateFallback],
        }],
      },
    ])

    const playlistSnapshot = player.getPlaylist()
    const secondTrackSnapshot = playlistSnapshot[1]
    const secondSourceSnapshot = secondTrackSnapshot?.source
    const secondFallbackSnapshot = secondTrackSnapshot?.fallbackSources?.[0]
    const alternateSourceSnapshot = secondTrackSnapshot?.audioTracks?.[0]?.source
    const alternateFallbackSnapshot = secondTrackSnapshot?.audioTracks?.[0]?.fallbackSources?.[0]
    const sourceSnapshots = [
      secondSourceSnapshot,
      secondFallbackSnapshot,
      alternateSourceSnapshot,
      alternateFallbackSnapshot,
    ]
    if (sourceSnapshots.some(sourceSnapshot => (
      typeof sourceSnapshot !== 'object' || sourceSnapshot === null || 'open' in sourceSnapshot
    ))) {
      throw new Error('Expected URL source description snapshots')
    }

    for (const sourceSnapshot of sourceSnapshots) {
      Reflect.set(sourceSnapshot as object, 'url', '/query-mutated')
    }

    expect(secondSource.url).toBe('/second.m3u8')
    expect(secondFallback.url).toBe('/second-fallback.m3u8')
    expect(alternateSource.url).toBe('/second.en.mpd')
    expect(alternateFallback.url).toBe('/second.en-fallback.mpd')

    Reflect.set(firstSource, 'url', '/caller-mutated-first')
    Reflect.set(secondSource, 'url', '/caller-mutated-second')
    Reflect.set(secondFallback, 'url', '/caller-mutated-fallback')
    Reflect.set(alternateSource, 'url', '/caller-mutated-alternate')
    Reflect.set(alternateFallback, 'url', '/caller-mutated-alternate-fallback')

    expect(player.getPlaylist()).toMatchObject([
      { source: { url: '/first.mp3', mimeType: 'audio/mpeg' } },
      {
        source: { url: '/second.m3u8', protocol: 'hls' },
        fallbackSources: [{ url: '/second-fallback.m3u8', protocol: 'hls' }],
        audioTracks: [{
          id: 'en',
          source: { url: '/second.en.mpd', protocol: 'dash' },
          fallbackSources: [{ url: '/second.en-fallback.mpd', protocol: 'dash' }],
        }],
      },
    ])

    await player.selectPlaylistTrack(1)

    expect(engine.loadedSources.map(source => source.url)).toEqual(['/second.en.mpd'])
  })

  it('continues with the next playlist track after playback ends', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    player.setPlaylist([
      { source: 'https://example.com/first.mp3' },
      { source: 'https://example.com/second.mp3' },
    ])

    await player.load()
    await player.play()
    engine.ended = true
    engine.emit('ended', undefined)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(player.getPlaylistIndex()).toBe(1)
    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/first.mp3',
      'https://example.com/second.mp3',
    ])
    expect(engine.playCalls).toBe(2)
  })

  it('publishes an ended auto-next cleanup failure that has no promise caller', async () => {
    const engine = new ThrowingUnloadAudioEngine()
    const player = new AudioPlayer({}, engine)
    const cleanupError = new Error('vendor cleanup failed')
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))
    player.setPlaylist([
      { source: 'https://example.com/first.mp3' },
      { source: 'https://example.com/second.mp3' },
    ])
    await player.load()
    await player.play()
    engine.unloadError = cleanupError
    engine.ended = true

    engine.emit('ended', undefined)

    // AI modified: background queue continuation exposes raw cleanup failure through one player error.
    await vi.waitFor(() => expect(errors).toHaveLength(1))
    expect(errors[0]).toMatchObject({
      code: 'ENGINE_ERROR',
      cause: cleanupError,
    })
    expect(player.getState()).toBe('error')
    expect(player.getPlaylistIndex()).toBe(1)
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/second.mp3' })
  })

  it('does not duplicate an ended auto-next load error', async () => {
    const nextTrackError = new GAudioError('NETWORK_ERROR', 'Next track failed')

    class FailingNextTrackAudioEngine extends FakeAudioEngine {
      override async load(source: Parameters<FakeAudioEngine['load']>[0]): Promise<void> {
        await super.load(source)
        if (this.loadedSources.length === 2) {
          this.emit('error', nextTrackError)
          throw nextTrackError
        }
      }
    }

    const engine = new FailingNextTrackAudioEngine()
    const player = new AudioPlayer({}, engine)
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))
    player.setPlaylist([
      { source: 'https://example.com/first.mp3' },
      { source: 'https://example.com/second.mp3' },
    ])
    await player.load()
    await player.play()
    engine.ended = true

    engine.emit('ended', undefined)

    // AI modified: auto-next suppresses only the rejection already published by load().
    await vi.waitFor(() => expect(errors).toHaveLength(1))
    await Promise.resolve()
    expect(errors).toEqual([nextTrackError])
    expect(player.getState()).toBe('error')
  })

  it.each(['next', 'selectPlaylistTrack'] as const)(
    'does not advance twice when an ended listener calls %s',
    async (navigationMethod) => {
      const engine = new FakeAudioEngine()
      const player = new AudioPlayer({}, engine)
      player.setPlaylist([
        { source: 'https://example.com/first.mp3' },
        { source: 'https://example.com/second.mp3' },
        { source: 'https://example.com/third.mp3' },
      ])
      await player.load()
      await player.play()
      engine.ended = true
      let listenerNavigation: Promise<unknown> | undefined
      player.on('ended', () => {
        listenerNavigation = navigationMethod === 'next'
          ? player.next()
          : player.selectPlaylistTrack(1)
      })

      engine.emit('ended', undefined)
      await listenerNavigation
      await Promise.resolve()

      expect(player.getPlaylistIndex()).toBe(1)
      expect(player.getSource()).toMatchObject({ url: 'https://example.com/second.mp3' })
      expect(engine.loadedSources.map(source => source.url)).toEqual([
        'https://example.com/first.mp3',
        'https://example.com/second.mp3',
      ])
    },
  )

  it.each(['pause', 'stop'] as const)(
    'does not continue the playlist when an ended listener calls %s',
    async (control) => {
      const engine = new FakeAudioEngine()
      const player = new AudioPlayer({}, engine)
      player.setPlaylist([
        { source: 'https://example.com/first.mp3' },
        { source: 'https://example.com/second.mp3' },
      ])
      await player.load()
      await player.play()
      engine.ended = true
      player.on('ended', () => player[control]())

      engine.emit('ended', undefined)
      await Promise.resolve()

      expect(player.getPlaylistIndex()).toBe(0)
      expect(player.getSource()).toMatchObject({ url: 'https://example.com/first.mp3' })
      expect(engine.loadedSources.map(source => source.url)).toEqual([
        'https://example.com/first.mp3',
      ])
      expect(engine.playCalls).toBe(1)
    },
  )

  it('loads a playlist fallback source when the primary source fails', async () => {
    class FallbackAudioEngine extends FakeAudioEngine {
      override async load(source: Parameters<FakeAudioEngine['load']>[0]): Promise<void> {
        await super.load(source)

        if (source.url === 'https://example.com/primary.mp3') {
          throw new GAudioError('NETWORK_ERROR', 'Primary source failed')
        }
      }
    }

    const engine = new FallbackAudioEngine()
    const player = new AudioPlayer({}, engine)
    const errors: GAudioError[] = []

    player.on('error', error => errors.push(error))
    player.setPlaylist([
      {
        source: 'https://example.com/primary.mp3',
        fallbackSources: ['https://example.com/fallback.mp3'],
      },
    ])

    await player.load()

    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/primary.mp3',
      'https://example.com/fallback.mp3',
    ])
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/fallback.mp3' })
    expect(player.getPlaylistIndex()).toBe(0)
    expect(errors).toEqual([])
  })

  it('does not use primary playlist fallbacks for a selected audio track', async () => {
    const engine = new FakeAudioEngine()
    const loadSource = engine.load.bind(engine)
    vi.spyOn(engine, 'load').mockImplementation(async (source) => {
      await loadSource(source)
      if (source.url === 'https://example.com/episode.ko.m4a') {
        throw new GAudioError('NETWORK_ERROR', 'Selected audio track failed')
      }
    })
    const player = new AudioPlayer({}, engine)
    player.setPlaylist([{
      source: 'https://example.com/episode.en.m4a',
      fallbackSources: ['https://example.com/episode.en-fallback.m4a'],
      defaultAudioTrackId: 'ko',
      audioTracks: [{
        id: 'ko',
        source: 'https://example.com/episode.ko.m4a',
      }],
    }])

    // AI modified: a selected language track cannot silently inherit the primary language fallback.
    await expect(player.load()).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(player.getSelectedAudioTrack()?.id).toBe('ko')
    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/episode.ko.m4a',
    ])
  })

  it('uses the selected audio track fallback instead of the primary playlist fallback', async () => {
    const engine = new FakeAudioEngine()
    const loadSource = engine.load.bind(engine)
    vi.spyOn(engine, 'load').mockImplementation(async (source) => {
      await loadSource(source)
      if (source.url === 'https://example.com/episode.ko.m4a') {
        throw new GAudioError('NETWORK_ERROR', 'Selected audio track failed')
      }
    })
    const player = new AudioPlayer({}, engine)
    player.setPlaylist([{
      source: 'https://example.com/episode.en.m4a',
      fallbackSources: ['https://example.com/episode.en-fallback.m4a'],
      defaultAudioTrackId: 'ko',
      audioTracks: [{
        id: 'ko',
        source: 'https://example.com/episode.ko.m4a',
        fallbackSources: ['https://example.com/episode.ko-fallback.m4a'],
      }],
    }])

    await expect(player.load()).resolves.toBeUndefined()
    expect(player.getSelectedAudioTrack()?.id).toBe('ko')
    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/episode.ko.m4a',
      'https://example.com/episode.ko-fallback.m4a',
    ])
  })

  it('selects the default audio track for a playlist track', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    player.setPlaylist([
      {
        source: 'https://example.com/episode.zh-CN.m4a',
        defaultAudioTrackId: 'en',
        audioTracks: [
          {
            id: 'zh-CN',
            label: '简体中文',
            language: 'zh-CN',
            source: 'https://example.com/episode.zh-CN.m4a',
          },
          {
            id: 'en',
            label: 'English',
            language: 'en',
            source: 'https://example.com/episode.en.m4a',
          },
        ],
      },
    ])

    expect(player.getAudioTracks().map(audioTrack => audioTrack.id)).toEqual(['zh-CN', 'en'])
    expect(player.getSelectedAudioTrack()).toMatchObject({ id: 'en', language: 'en' })
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/episode.en.m4a' })

    await player.load()

    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/episode.en.m4a',
    ])
  })

  it('rejects an unavailable audio track without changing playlist ownership', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    player.setPlaylist([{
      source: 'https://example.com/main.m4a',
      audioTracks: [
        { id: 'en', source: 'https://example.com/en.m4a' },
      ],
    }])
    const selectedAudioTrack = player.getSelectedAudioTrack()
    const source = player.getSource()

    // AI modified: invalid alternate-track input fails before source or selection state can mutate.
    await expect(player.selectAudioTrack('missing')).rejects.toThrow(RangeError)
    expect(player.getSelectedAudioTrack()).toEqual(selectedAudioTrack)
    expect(player.getSource()).toBe(source)
    expect(engine.loadedSources).toEqual([])

    player.dispose()
  })

  it('supports an empty string audio track identifier', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    player.setPlaylist([{
      source: 'https://example.com/main.m4a',
      defaultAudioTrackId: '',
      audioTracks: [
        { id: 'en', source: 'https://example.com/en.m4a' },
        { id: '', source: 'https://example.com/empty-id.m4a' },
      ],
    }])

    expect(player.getSelectedAudioTrack()?.id).toBe('')
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/empty-id.m4a' })
    await player.load()
    await player.selectAudioTrack('en')
    await player.selectAudioTrack('')

    expect(player.getSelectedAudioTrack()?.id).toBe('')
    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/empty-id.m4a',
      'https://example.com/en.m4a',
      'https://example.com/empty-id.m4a',
    ])
  })

  it('switches audio tracks while preserving time and playback state', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    player.setPlaylist([
      {
        source: 'https://example.com/episode.zh-CN.m4a',
        audioTracks: [
          {
            id: 'zh-CN',
            label: '简体中文',
            language: 'zh-CN',
            source: 'https://example.com/episode.zh-CN.m4a',
          },
          {
            id: 'ko',
            label: '한국어',
            language: 'ko',
            source: 'https://example.com/episode.ko.m4a',
          },
        ],
      },
    ])

    await player.load()
    await player.play()
    await player.seek(42)

    await player.selectAudioTrack('ko')

    expect(player.getSelectedAudioTrack()).toMatchObject({ id: 'ko' })
    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/episode.zh-CN.m4a',
      'https://example.com/episode.ko.m4a',
    ])
    expect(player.getCurrentTime()).toBe(42)
    expect(engine.playCalls).toBe(2)
  })

  it('does not restore alternate-track position after stop wins during loading', async () => {
    const engine = new DelayedReplacementAudioEngine()
    const player = new AudioPlayer({}, engine)
    player.setPlaylist([{
      source: 'https://example.com/episode.en.m4a',
      audioTracks: [
        { id: 'en', source: 'https://example.com/episode.en.m4a' },
        { id: 'ko', source: 'https://example.com/episode.ko.m4a' },
      ],
    }])
    await player.load()
    await player.play()
    await player.seek(42)

    const audioTrackSelection = player.selectAudioTrack('ko')
    await vi.waitFor(() => {
      expect(engine.loadedSources).toHaveLength(2)
    })
    player.stop()
    engine.finishReplacementLoad()
    await audioTrackSelection

    expect(player.getCurrentTime()).toBe(0)
    expect(player.getState()).toBe('ready')
    expect(engine.playCalls).toBe(1)
  })

  it('rejects alternate-track selection when a ready listener replaces its source', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    player.setPlaylist([{
      source: 'https://example.com/episode.en.m4a',
      audioTracks: [
        { id: 'en', source: 'https://example.com/episode.en.m4a' },
        { id: 'ko', source: 'https://example.com/episode.ko.m4a' },
      ],
    }])
    await player.load()
    await player.seek(42)
    const seek = vi.spyOn(engine, 'seek')
    seek.mockClear()
    let hasReplacedSource = false
    player.on('statechange', (state) => {
      if (state === 'ready' && player.getSelectedAudioTrack()?.id === 'ko' && !hasReplacedSource) {
        hasReplacedSource = true
        player.setSource('https://example.com/replacement.mp3')
      }
    })

    // AI modified: navigation inherits the superseded load's LOAD_ABORTED result.
    await expect(player.selectAudioTrack('ko')).rejects.toMatchObject({ code: 'LOAD_ABORTED' })

    expect(hasReplacedSource).toBe(true)
    expect(seek).not.toHaveBeenCalled()
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/replacement.mp3' })
    expect(player.getState()).toBe('idle')
  })

  it.each([
    ['the default preserve behavior', undefined],
    ['an explicit false option', { autoplay: false }],
  ] as const)('lets %s override player autoplay for alternate tracks', async (_label, options) => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ autoplay: true }, engine)
    player.setPlaylist([{
      source: 'https://example.com/episode.en.m4a',
      audioTracks: [
        { id: 'en', source: 'https://example.com/episode.en.m4a' },
        { id: 'ko', source: 'https://example.com/episode.ko.m4a' },
      ],
    }])

    await player.selectAudioTrack('ko', options)

    expect(engine.playCalls).toBe(0)
    expect(player.isPaused()).toBe(true)
  })

  it.each(['pause', 'stop'] as const)('does not autoplay when %s wins during loading', async (control) => {
    const engine = new DelayedLoadAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      autoplay: true,
    }, engine)

    const loading = player.load()
    await Promise.resolve()
    player[control]()
    engine.finishLoading()
    await loading

    expect(engine.playCalls).toBe(0)
    expect(engine.controlsBeforeReady).toEqual([])
    expect(player.getState()).toBe('ready')
  })

  it('aborts a loading-time stop when its synchronous engine listener replaces the source', async () => {
    const engine = new DelayedLoadAudioEngine()
    const stop = engine.stop.bind(engine)
    vi.spyOn(engine, 'stop').mockImplementation(() => {
      stop()
      engine.emit('timeupdate', { currentTime: 0, duration: engine.duration })
    })
    const player = new AudioPlayer({
      source: 'https://example.com/first.mp3',
    }, engine)
    player.on('timeupdate', () => {
      player.setSource('https://example.com/listener-replacement.mp3')
    })

    const loading = player.load()
    await Promise.resolve()
    player.stop()
    engine.finishLoading()

    await expect(loading).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    expect(player.getSource()).toMatchObject({
      url: 'https://example.com/listener-replacement.mp3',
    })
    expect(player.getState()).toBe('idle')
    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/first.mp3',
    ])
  })

  it('does not overwrite a fatal pending-stop Media Session query with ready state', async () => {
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    const engine = new DelayedLoadPositionQueryErrorAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      mediaSession: true,
    }, engine)
    const fatalError = new GAudioError('ENGINE_ERROR', 'Stopped position query failed')
    const publishedErrors: GAudioError[] = []
    player.on('error', error => publishedErrors.push(error))

    const loading = player.load()
    await vi.waitFor(() => expect(engine.loadedSources).toHaveLength(1))
    player.stop()
    engine.positionQueryError = fatalError
    engine.finishLoading()

    // AI modified: pending-stop bookkeeping remains part of the joining load's terminal boundary.
    await expect(loading).rejects.toBe(fatalError)
    expect(publishedErrors).toEqual([fatalError])
    expect(player.getState()).toBe('error')
  })

  it('rejects a loading-time stop with a synchronously emitted engine error', async () => {
    const engine = new DelayedLoadAudioEngine()
    const stopError = new GAudioError('ENGINE_ERROR', 'Pending engine stop failed')
    const errors: GAudioError[] = []
    const stop = engine.stop.bind(engine)
    vi.spyOn(engine, 'stop').mockImplementation(() => {
      stop()
      engine.emit('error', stopError)
    })
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
    }, engine)
    player.on('error', error => errors.push(error))

    const loading = player.load()
    await Promise.resolve()
    player.stop()
    engine.finishLoading()

    // AI modified: a pending stop cannot overwrite its synchronous fatal error with ready state.
    await expect(loading).rejects.toBe(stopError)
    expect(player.getState()).toBe('error')
    expect(errors).toEqual([stopError])
  })

  it('reports a pending stop failure and leaves the loaded source retryable', async () => {
    const stopFailure = new Error('pending stop failed')
    const engine = new FailingPendingStopAudioEngine()
    engine.stopError = stopFailure
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
    }, engine)
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))

    const loading = player.load()
    await Promise.resolve()
    player.stop()
    engine.finishLoading()

    await expect(loading).rejects.toMatchObject({
      code: 'ENGINE_ERROR',
      cause: stopFailure,
    })
    expect(player.getState()).toBe('error')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      code: 'ENGINE_ERROR',
      cause: stopFailure,
    })

    engine.stopError = undefined
    await player.play()
    engine.emit('playing', undefined)

    expect(engine.loadedSources).toHaveLength(1)
    expect(player.getState()).toBe('playing')
  })

  it('applies a reentrant ready-state stop only once', async () => {
    const engine = new DelayedLoadAudioEngine()
    engine.currentTime = 42
    const stop = vi.spyOn(engine, 'stop')
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
    }, engine)
    player.on('statechange', (state) => {
      if (state === 'ready') {
        player.stop()
      }
    })

    const loading = player.load()
    await Promise.resolve()
    engine.finishLoading()
    await loading

    expect(stop).toHaveBeenCalledOnce()
    expect(player.getCurrentTime()).toBe(0)
    expect(player.getState()).toBe('ready')
  })

  it('lets a ready-state play supersede a stop requested during loading', async () => {
    const engine = new DelayedLoadAudioEngine()
    engine.currentTime = 42
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
    }, engine)
    let readyPosition = -1
    let readyPlayback: Promise<void> | undefined
    player.on('statechange', (state) => {
      if (state === 'ready') {
        readyPosition = player.getCurrentTime()
        readyPlayback = player.play()
      }
    })

    const loading = player.load()
    await Promise.resolve()
    player.stop()
    engine.finishLoading()
    await loading
    await readyPlayback

    expect(readyPosition).toBe(0)
    expect(player.getCurrentTime()).toBe(0)
    expect(player.isPaused()).toBe(false)
    expect(engine.playCalls).toBe(1)
  })

  it('does not restore alternate-track time over a newer seek', async () => {
    const engine = new DelayedReplacementAudioEngine()
    const player = new AudioPlayer({}, engine)
    player.setPlaylist([{
      source: 'https://example.com/episode.en.m4a',
      audioTracks: [
        { id: 'en', source: 'https://example.com/episode.en.m4a' },
        { id: 'ko', source: 'https://example.com/episode.ko.m4a' },
      ],
    }])
    await player.load()
    await player.play()
    await player.seek(42)

    let newerSeek: Promise<void> | undefined
    player.on('statechange', (state) => {
      if (state === 'ready' && player.getSelectedAudioTrack()?.id === 'ko') {
        newerSeek = player.seek(10)
      }
    })
    const audioTrackSelection = player.selectAudioTrack('ko')
    await vi.waitFor(() => {
      expect(engine.loadedSources).toHaveLength(2)
    })
    engine.finishReplacementLoad()
    await audioTrackSelection
    await newerSeek

    expect(player.getCurrentTime()).toBe(10)
  })

  it('waits for the active load when play is requested before the engine is ready', async () => {
    const engine = new DelayedLoadAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
    }, engine)

    const loading = player.load()
    await Promise.resolve()
    let hasPlayResolved = false
    const playing = player.play().then(() => {
      hasPlayResolved = true
    })
    await Promise.resolve()

    expect(player.getState()).toBe('loading')
    expect(engine.playCalls).toBe(0)
    expect(engine.controlsBeforeReady).toEqual([])
    expect(hasPlayResolved).toBe(false)

    engine.finishLoading()
    await Promise.all([loading, playing])

    expect(hasPlayResolved).toBe(true)
    expect(engine.playCalls).toBe(1)
  })

  it('does not let future autoplay configuration cancel an explicit play during loading', async () => {
    const engine = new DelayedLoadAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
    }, engine)

    const loading = player.load()
    await Promise.resolve()
    const playing = player.play()
    player.setAutoplay(false)
    engine.finishLoading()

    await Promise.all([loading, playing])

    expect(engine.playCalls).toBe(1)
    expect(player.getState()).toBe('ready')
  })

  it('rejects when a custom engine resolves load after emitting a fatal error', async () => {
    const loadError = new GAudioError('NETWORK_ERROR', 'Source load failed')

    class ResolvingFatalLoadAudioEngine extends FakeAudioEngine {
      override async load(source: Parameters<FakeAudioEngine['load']>[0]): Promise<void> {
        await super.load(source)
        this.emit('error', loadError)
      }
    }

    const engine = new ResolvingFatalLoadAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))

    const loading = player.load()

    // AI modified: a fatal load event owns the result even when the custom load promise resolves.
    await expect(loading).rejects.toBe(loadError)
    expect(player.getState()).toBe('error')
    expect(errors).toEqual([loadError])
  })

  it('publishes no fatal error when a playlist fallback succeeds after an emitted load error', async () => {
    class EmittingFallbackAudioEngine extends FakeAudioEngine {
      override async load(source: Parameters<FakeAudioEngine['load']>[0]): Promise<void> {
        await super.load(source)
        if (source.url === 'https://example.com/primary.mp3') {
          const error = new GAudioError('NETWORK_ERROR', 'Primary source failed')
          this.emit('error', error)
        }
      }
    }

    const engine = new EmittingFallbackAudioEngine()
    const player = new AudioPlayer({}, engine)
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))
    player.setPlaylist([{
      source: 'https://example.com/primary.mp3',
      fallbackSources: ['https://example.com/fallback.mp3'],
    }])

    await player.load()

    expect(player.getState()).toBe('ready')
    expect(player.getSource()?.url).toBe('https://example.com/fallback.mp3')
    expect(errors).toEqual([])
  })

  it('keeps the previous playlist unchanged when a replacement index is invalid', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    player.setPlaylist([
      { source: 'https://example.com/first.mp3' },
      { source: 'https://example.com/second.mp3' },
    ], { startIndex: 1 })
    const unloadCalls = engine.unloadCalls

    expect(() => player.setPlaylist([
      { source: 'https://example.com/replacement.mp3' },
    ], { startIndex: 2 })).toThrow(RangeError)

    expect(player.getPlaylist().map(track => track.source)).toEqual([
      'https://example.com/first.mp3',
      'https://example.com/second.mp3',
    ])
    expect(player.getPlaylistIndex()).toBe(1)
    expect(player.getSource()?.url).toBe('https://example.com/second.mp3')
    expect(engine.unloadCalls).toBe(unloadCalls)
  })

  it('does not duplicate navigation playback when player autoplay is also enabled', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ autoplay: true }, engine)
    player.setPlaylist([
      { source: 'https://example.com/first.mp3' },
      { source: 'https://example.com/second.mp3' },
    ])

    await player.selectPlaylistTrack(1, { autoplay: true })

    expect(engine.playCalls).toBe(1)
  })

  it('lets an explicit navigation autoplay false override player autoplay', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ autoplay: true }, engine)
    player.setPlaylist([
      { source: 'https://example.com/first.mp3' },
      { source: 'https://example.com/second.mp3' },
    ])

    await player.selectPlaylistTrack(1, { autoplay: false })

    expect(engine.playCalls).toBe(0)
  })

  it('does not duplicate alternate-track playback when player autoplay is enabled', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ autoplay: true }, engine)
    player.setPlaylist([{
      source: 'https://example.com/program.zh.mp3',
      audioTracks: [
        { id: 'zh', source: 'https://example.com/program.zh.mp3' },
        { id: 'en', source: 'https://example.com/program.en.mp3' },
      ],
    }])

    await player.selectAudioTrack('en', { autoplay: true })

    expect(engine.playCalls).toBe(1)
  })

  it('keeps playlist continuation running when a consumer listener throws', async () => {
    const reportedErrors: unknown[] = []
    vi.stubGlobal('reportError', (error: unknown) => reportedErrors.push(error))
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    player.setPlaylist([
      { source: 'https://example.com/first.mp3' },
      { source: 'https://example.com/second.mp3' },
    ])
    await player.load()
    await player.play()
    engine.ended = true
    player.on('statechange', () => {
      throw new Error('consumer listener failed')
    })

    engine.emit('ended', undefined)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(player.getPlaylistIndex()).toBe(1)
    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/first.mp3',
      'https://example.com/second.mp3',
    ])
    expect(reportedErrors.length).toBeGreaterThan(0)
  })

  it('keeps a newer Media Session owner active when an older player is disposed', () => {
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    const firstPlayer = new AudioPlayer({
      mediaSession: { metadata: { title: 'First player' } },
    }, new FakeAudioEngine())
    const secondPlayer = new AudioPlayer({
      mediaSession: { metadata: { title: 'Second player' } },
    }, new FakeAudioEngine())
    const actionCount = mediaSession.actionHandlers.size

    firstPlayer.dispose()

    expect(mediaSession.metadata).toMatchObject({ title: 'Second player' })
    expect(mediaSession.actionHandlers.size).toBe(actionCount)
    secondPlayer.dispose()
    expect(mediaSession.actionHandlers.size).toBe(0)
  })

  it('restores the previous Media Session owner after the latest player is disposed', async () => {
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    const firstEngine = new FakeAudioEngine()
    const secondEngine = new FakeAudioEngine()
    const firstPlayer = new AudioPlayer({
      source: 'https://example.com/first.mp3',
      mediaSession: { metadata: { title: 'First player' } },
    }, firstEngine)
    const secondPlayer = new AudioPlayer({
      source: 'https://example.com/second.mp3',
      mediaSession: { metadata: { title: 'Second player' } },
    }, secondEngine)

    firstPlayer.setMediaSessionMetadata({ title: 'First player updated' })
    secondPlayer.dispose()

    expect(mediaSession.metadata).toMatchObject({ title: 'First player updated' })
    expect(mediaSession.actionHandlers.size).toBeGreaterThan(0)

    mediaSession.runAction('play')
    await waitForMediaSessionAction()

    expect(firstEngine.loadedSources).toHaveLength(1)
    expect(firstEngine.playCalls).toBe(1)
    expect(secondEngine.playCalls).toBe(0)

    firstPlayer.dispose()
    expect(mediaSession.actionHandlers.size).toBe(0)
  })

  it('makes a retained previous-owner Media Session handler inert', () => {
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    const firstEngine = new FakeAudioEngine()
    const secondEngine = new FakeAudioEngine()
    const firstPause = vi.spyOn(firstEngine, 'pause')
    const secondPause = vi.spyOn(secondEngine, 'pause')
    const firstPlayer = new AudioPlayer({ mediaSession: true }, firstEngine)
    mediaSession.rejectedActionRegistrations.add('pause')
    const secondPlayer = new AudioPlayer({ mediaSession: true }, secondEngine)

    mediaSession.runAction('pause')

    expect(firstPause).not.toHaveBeenCalled()
    expect(secondPause).not.toHaveBeenCalled()

    mediaSession.rejectedActionRegistrations.delete('pause')
    secondPlayer.dispose()
    mediaSession.runAction('pause')

    expect(firstPause).toHaveBeenCalledOnce()
    expect(secondPause).not.toHaveBeenCalled()

    firstPlayer.dispose()
  })

  it('reports synchronous Media Session pause and stop failures without throwing into the dispatcher', () => {
    const reportedErrors: unknown[] = []
    const pauseError = new Error('pause failed')
    const stopError = new Error('stop failed')
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    vi.stubGlobal('reportError', (error: unknown) => reportedErrors.push(error))
    const engine = new FakeAudioEngine()
    const pause = vi.spyOn(engine, 'pause').mockImplementation(() => {
      throw pauseError
    })
    const stop = vi.spyOn(engine, 'stop').mockImplementation(() => {
      throw stopError
    })
    const player = new AudioPlayer({ mediaSession: true }, engine)

    expect(() => mediaSession.runAction('pause')).not.toThrow()
    expect(() => mediaSession.runAction('stop')).not.toThrow()
    expect(() => mediaSession.runAction('pause')).not.toThrow()

    expect(pause).toHaveBeenCalledTimes(2)
    expect(stop).toHaveBeenCalledOnce()
    expect(reportedErrors).toEqual([pauseError, stopError, pauseError])

    player.dispose()
  })

  it('queues a Media Session action failure when the host has no error reporter', () => {
    const actionError = new Error('Media Session pause failed')
    const queuedMicrotasks: Array<() => void> = []
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    vi.stubGlobal('reportError', undefined)
    vi.stubGlobal('queueMicrotask', (callback: () => void) => queuedMicrotasks.push(callback))
    const engine = new FakeAudioEngine()
    vi.spyOn(engine, 'pause').mockImplementation(() => {
      throw actionError
    })
    const player = new AudioPlayer({ mediaSession: true }, engine)

    expect(() => mediaSession.runAction('pause')).not.toThrow()
    expect(queuedMicrotasks).toHaveLength(1)

    let queuedError: unknown
    try {
      // AI modified: capture the host fallback without leaking an uncaught microtask into Vitest.
      queuedMicrotasks[0]?.()
    }
    catch (error) {
      queuedError = error
    }
    expect(queuedError).toBe(actionError)

    player.dispose()
  })

  it('queues both failures when the Media Session host error reporter throws', () => {
    const actionError = new Error('Media Session stop failed')
    const reportingError = new Error('Host error reporter failed')
    const queuedMicrotasks: Array<() => void> = []
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    vi.stubGlobal('reportError', () => {
      throw reportingError
    })
    vi.stubGlobal('queueMicrotask', (callback: () => void) => queuedMicrotasks.push(callback))
    const engine = new FakeAudioEngine()
    vi.spyOn(engine, 'stop').mockImplementation(() => {
      throw actionError
    })
    const player = new AudioPlayer({ mediaSession: true }, engine)

    expect(() => mediaSession.runAction('stop')).not.toThrow()
    expect(queuedMicrotasks).toHaveLength(1)

    let queuedError: unknown
    try {
      // AI modified: a broken reporter retains both causal failures in one deferred diagnostic.
      queuedMicrotasks[0]?.()
    }
    catch (error) {
      queuedError = error
    }
    expect(queuedError).toBeInstanceOf(AggregateError)
    expect((queuedError as AggregateError).errors).toEqual([actionError, reportingError])

    player.dispose()
  })

  it('reports asynchronous Media Session navigation failures without an unhandled rejection', async () => {
    const reportedErrors: unknown[] = []
    const cleanupError = new Error('vendor cleanup failed')
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    vi.stubGlobal('reportError', (error: unknown) => reportedErrors.push(error))
    const engine = new ThrowingUnloadAudioEngine()
    const player = new AudioPlayer({ mediaSession: true }, engine)
    player.setPlaylist([
      { source: 'https://example.com/first.mp3' },
      { source: 'https://example.com/second.mp3' },
    ])
    await player.load()
    engine.unloadError = cleanupError

    expect(() => mediaSession.runAction('nexttrack')).not.toThrow()
    await waitForMediaSessionAction()

    // AI modified: browser-owned navigation still exposes a raw custom-engine cleanup failure.
    expect(reportedErrors).toEqual([cleanupError])
    expect(player.getPlaylistIndex()).toBe(1)
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/second.mp3' })

    engine.unloadError = undefined
    player.dispose()
  })

  it('does not globally report a Media Session play failure already published by the player', async () => {
    const reportedErrors: unknown[] = []
    const publishedErrors: GAudioError[] = []
    const playbackError = new GAudioError('PLAYBACK_BLOCKED', 'Browser blocked audio playback')
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    vi.stubGlobal('reportError', (error: unknown) => reportedErrors.push(error))
    const engine = new FakeAudioEngine()
    engine.playError = playbackError
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      mediaSession: true,
    }, engine)
    player.on('error', error => publishedErrors.push(error))

    mediaSession.runAction('play')
    await waitForMediaSessionAction()

    // AI modified: a single failed system play retains one player-facing diagnostic channel.
    expect(publishedErrors).toEqual([playbackError])
    expect(reportedErrors).toEqual([])
    expect(player.getState()).toBe('error')

    player.dispose()
  })

  it.each([
    ['seek', false],
    ['fast seek', true],
  ] as const)(
    'does not globally duplicate a Media Session %s error already published by the player',
    async (_operationName, shouldFastSeek) => {
      const reportedErrors: unknown[] = []
      const publishedErrors: GAudioError[] = []
      const mediaSession = new FakeMediaSession()
      vi.stubGlobal('navigator', { mediaSession })
      vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
      vi.stubGlobal('reportError', (error: unknown) => reportedErrors.push(error))
      const audioElement = new ErroringSeekAudioElement()
      if (shouldFastSeek) {
        audioElement.fastSeek = (seconds) => {
          audioElement.fastSeekCalls.push(seconds)
          audioElement.currentTime = seconds
        }
      }
      const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
      const player = new AudioPlayer({ mediaSession: true }, engine)
      player.on('error', error => publishedErrors.push(error))
      audioElement.seeking = true

      mediaSession.runAction('seekto', { seekTime: 44, fastSeek: shouldFastSeek })
      audioElement.publishSeekError()
      await waitForMediaSessionAction()

      // AI modified: the event and action rejection share identity, so one player error is the only diagnostic.
      expect(publishedErrors).toHaveLength(1)
      expect(publishedErrors[0]).toMatchObject({ code: 'DECODE_FAILED' })
      expect(reportedErrors).toEqual([])
      player.dispose()
    },
  )

  it.each([
    [
      'seek',
      false,
      (engine: DeferredAsyncControlAudioEngine, error: Error) => engine.failSeek(error),
    ],
    [
      'fast seek',
      true,
      (engine: DeferredAsyncControlAudioEngine, error: Error) => engine.failFastSeek(error),
    ],
  ] as const)(
    'settles a never-ending Media Session %s action from one fatal player error',
    async (_operationName, shouldFastSeek, failOperation) => {
      const reportedErrors: unknown[] = []
      const publishedErrors: GAudioError[] = []
      const mediaSession = new FakeMediaSession()
      vi.stubGlobal('navigator', { mediaSession })
      vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
      vi.stubGlobal('reportError', (error: unknown) => reportedErrors.push(error))
      const engine = new DeferredAsyncControlAudioEngine()
      const player = new AudioPlayer({ mediaSession: true }, engine)
      const fatalError = new GAudioError('ENGINE_ERROR', 'Media Session seek failed')
      player.on('error', error => publishedErrors.push(error))

      mediaSession.runAction('seekto', { seekTime: 44, fastSeek: shouldFastSeek })
      engine.emit('error', fatalError)
      await waitForMediaSessionAction()

      // AI modified: the action ends from the published canonical error while its engine promise stays pending.
      expect(publishedErrors).toEqual([fatalError])
      expect(reportedErrors).toEqual([])
      failOperation(engine, new Error('Late Media Session control rejection'))
      await Promise.resolve()
      player.dispose()
    },
  )

  it('does not globally report a Media Session play superseded by a newer source', async () => {
    const reportedErrors: unknown[] = []
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    vi.stubGlobal('reportError', (error: unknown) => reportedErrors.push(error))
    const engine = new DelayedLoadAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/first.mp3',
      mediaSession: true,
    }, engine)

    mediaSession.runAction('play')
    await Promise.resolve()
    player.setSource('https://example.com/second.mp3')
    await waitForMediaSessionAction()

    // AI modified: expected LOAD_ABORTED cancellation ends the action before the old load promise settles.
    expect(reportedErrors).toEqual([])
    expect(player.getState()).toBe('idle')
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/second.mp3' })
    engine.failLoading(new Error('Late Media Session load rejection'))
    await Promise.resolve()

    player.dispose()
  })

  it.each([
    [
      'seek',
      false,
      (engine: DeferredAsyncControlAudioEngine, error: Error) => engine.failSeek(error),
    ],
    [
      'fast seek',
      true,
      (engine: DeferredAsyncControlAudioEngine, error: Error) => engine.failFastSeek(error),
    ],
  ] as const)(
    'does not globally report a late Media Session %s cancellation after disposal',
    async (_operationName, shouldFastSeek, failOperation) => {
      const reportedErrors: unknown[] = []
      const mediaSession = new FakeMediaSession()
      vi.stubGlobal('navigator', { mediaSession })
      vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
      vi.stubGlobal('reportError', (error: unknown) => reportedErrors.push(error))
      const engine = new DeferredAsyncControlAudioEngine()
      const player = new AudioPlayer({ mediaSession: true }, engine)

      mediaSession.runAction('seekto', { seekTime: 44, fastSeek: shouldFastSeek })
      player.dispose()
      await waitForMediaSessionAction()

      // AI modified: a released Media Session action ends silently without waiting for its engine promise.
      expect(reportedErrors).toEqual([])
      expect(player.getState()).toBe('idle')
      failOperation(engine, new Error('Late Media Session rejection after disposal'))
      await Promise.resolve()
    },
  )

  it('clears a newer Media Session position when restoring an owner without a timeline', () => {
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    const firstEngine = new FakeAudioEngine()
    firstEngine.duration = 0
    const secondEngine = new FakeAudioEngine()
    secondEngine.currentTime = 55
    const firstPlayer = new AudioPlayer({ mediaSession: true }, firstEngine)
    const secondPlayer = new AudioPlayer({ mediaSession: true }, secondEngine)

    expect(mediaSession.positionState).toEqual({
      duration: 120,
      playbackRate: 1,
      position: 55,
    })

    secondPlayer.dispose()

    expect(mediaSession.positionState).toBeUndefined()

    firstPlayer.dispose()
    expect(mediaSession.positionState).toBeUndefined()
  })

  it('rolls back failed Media Session ownership and removes injected engine listeners', () => {
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    const firstPlayer = new AudioPlayer({
      mediaSession: { metadata: { title: 'First player' } },
    }, new FakeAudioEngine())
    const failedEngine = new SubscriptionTrackingAudioEngine()
    const activationFailure = new Error('Media Session activation failed')
    mediaSession.playbackStateError = activationFailure

    expect(() => new AudioPlayer({
      mediaSession: { metadata: { title: 'Failed player' } },
    }, failedEngine)).toThrow(activationFailure)

    expect(failedEngine.removalCalls).toBe(failedEngine.subscriptionCalls)
    expect(failedEngine.disposeCalls).toBe(0)
    expect(mediaSession.metadata).toMatchObject({ title: 'First player' })

    firstPlayer.setMediaSessionMetadata({ title: 'First player updated' })
    expect(mediaSession.metadata).toMatchObject({ title: 'First player updated' })

    firstPlayer.dispose()
    expect(mediaSession.actionHandlers.size).toBe(0)
  })

  it('clears Media Session presentation when initial ownership activation fails', () => {
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    const engine = new SubscriptionTrackingAudioEngine()
    const activationFailure = new Error('Initial Media Session activation failed')
    mediaSession.playbackStateError = activationFailure

    expect(() => new AudioPlayer({
      mediaSession: { metadata: { title: 'Failed initial player' } },
    }, engine)).toThrow(activationFailure)

    // AI modified: failed first-owner construction cannot leave host presentation or action ownership behind.
    expect(mediaSession.metadata).toBeNull()
    expect(mediaSession.playbackState).toBe('none')
    expect(mediaSession.positionState).toBeUndefined()
    expect(mediaSession.actionHandlers.size).toBe(0)
    expect(engine.removalCalls).toBe(engine.subscriptionCalls)

    const replacementPlayer = new AudioPlayer({
      mediaSession: { metadata: { title: 'Replacement player' } },
    }, new FakeAudioEngine())
    expect(mediaSession.metadata).toMatchObject({ title: 'Replacement player' })
    replacementPlayer.dispose()
  })

  it('removes earlier injected engine listeners when subscription setup fails', () => {
    const engine = new SubscriptionTrackingAudioEngine()
    engine.failAtSubscription = 3

    expect(() => new AudioPlayer({}, engine)).toThrow('engine subscription failed')

    expect(engine.subscriptionCalls).toBe(3)
    expect(engine.removalCalls).toBe(2)
    expect(engine.disposeCalls).toBe(0)
  })

  it('attempts every cleanup and retries only unfinished engine disposal', async () => {
    const analyzerFailure = new Error('analyzer disposal failed')
    const mediaSessionFailure = new Error('Media Session disposal failed')
    const engineFailure = new Error('engine disposal failed')

    class FailingAnalyzer extends FakeAnalyzer {
      override dispose(): void {
        super.dispose()
        throw analyzerFailure
      }
    }

    class FailingEngine extends FakeAudioEngine {
      private shouldFailDisposal = true

      override dispose(): void {
        super.dispose()
        if (this.shouldFailDisposal) {
          this.shouldFailDisposal = false
          throw engineFailure
        }
      }
    }

    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    const analyzer = new FailingAnalyzer()
    const engine = new FailingEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      analyzer: {
        createAnalyzer: () => analyzer as unknown as AudioAnalyzer,
      },
      mediaSession: true,
    }, engine)
    await player.load()
    const originalMediaSessionDispose = BrowserMediaSession.prototype.dispose
    const mediaSessionDisposeSpy = vi
      .spyOn(BrowserMediaSession.prototype, 'dispose')
      .mockImplementation(function (this: BrowserMediaSession): void {
        originalMediaSessionDispose.call(this)
        throw mediaSessionFailure
      })
    let observedDisposalFailure: unknown

    try {
      player.dispose()
    }
    catch (error) {
      observedDisposalFailure = error
    }

    expect(observedDisposalFailure).toBe(analyzerFailure)
    expect(analyzer.disposeCalls).toBe(1)
    expect(player.getAnalyzer()).toBeUndefined()
    expect(mediaSessionDisposeSpy).toHaveBeenCalledTimes(1)
    expect(mediaSession.actionHandlers.size).toBe(0)
    expect(engine.disposeCalls).toBe(1)
    expect(player.getSource()).toBeUndefined()
    expect(player.getState()).toBe('idle')

    engine.emit('playing', undefined)
    expect(player.getState()).toBe('idle')

    expect(() => player.dispose()).not.toThrow()
    expect(analyzer.disposeCalls).toBe(1)
    expect(mediaSessionDisposeSpy).toHaveBeenCalledTimes(1)
    expect(engine.disposeCalls).toBe(2)

    player.dispose()
    expect(engine.disposeCalls).toBe(2)
  })

  it('retries failed adapter engine cleanup through the player and router disposal chain', async () => {
    const disposalError = new Error('vendor cleanup failed')
    class RetryableAdapterEngine extends FakeAudioEngine {
      private shouldFailDisposal = true

      override dispose(): void {
        super.dispose()
        if (this.shouldFailDisposal) {
          this.shouldFailDisposal = false
          throw disposalError
        }
      }
    }

    const adapterEngine = new RetryableAdapterEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/stream.m3u8',
      adapters: [new FakeHlsAdapter(adapterEngine)],
    })
    await player.load()

    expect(() => player.dispose()).toThrow(disposalError)
    expect(adapterEngine.disposeCalls).toBe(1)

    expect(() => player.dispose()).not.toThrow()
    expect(adapterEngine.disposeCalls).toBe(2)

    player.dispose()
    expect(adapterEngine.disposeCalls).toBe(2)
  })

  it('retries a failed custom-engine unsubscribe after the remaining player cleanup finishes', () => {
    const engine = new RetryableUnsubscribeAudioEngine()
    const player = new AudioPlayer({}, engine)

    expect(() => player.dispose()).toThrow(engine.unsubscribeError)
    expect(engine.disposeCalls).toBe(1)

    expect(() => player.dispose()).not.toThrow()
    expect(engine.disposeCalls).toBe(1)
    expect(engine.unsubscribeCalls).toBe(audioEngineEventNames.length + 1)

    engine.emit('playing', undefined)
    expect(player.getState()).toBe('idle')
  })

  it('keeps disposed query snapshots immutable while a failed engine unsubscribe awaits retry', () => {
    const engine = new RetryableUnsubscribeAudioEngine('volumechange')
    const player = new AudioPlayer({}, engine)
    player.setVolume(0.4)
    player.setMuted(false)

    expect(() => player.dispose()).toThrow(engine.unsubscribeError)

    engine.emit('volumechange', { volume: 0.9, isMuted: true })

    expect(player.getVolume()).toBe(0.4)
    expect(player.isMuted()).toBe(false)
    expect(() => player.dispose()).not.toThrow()
  })

  it('rechecks router cleanup when a stale factory finishes after player disposal', async () => {
    const disposalError = new Error('late vendor cleanup failed')
    class LateAdapterEngine extends FakeAudioEngine {
      private shouldFailDisposal = true

      override dispose(): void {
        super.dispose()
        if (this.shouldFailDisposal) {
          this.shouldFailDisposal = false
          throw disposalError
        }
      }
    }

    const adapterEngine = new LateAdapterEngine()
    const adapter = new DelayedHlsAdapter(adapterEngine)
    const player = new AudioPlayer({
      source: 'https://example.com/stream.m3u8',
      adapters: [adapter],
    })
    const loading = player.load()
    const loadingExpectation = expect(loading).rejects.toMatchObject({ code: 'ENGINE_ERROR' })
    await vi.waitFor(() => {
      expect(adapter.createCalls).toBe(1)
    })

    expect(() => player.dispose()).not.toThrow()
    adapter.finishCreation()
    await loadingExpectation
    expect(adapterEngine.disposeCalls).toBe(1)

    expect(() => player.dispose()).not.toThrow()
    expect(adapterEngine.disposeCalls).toBe(2)
  })

  it('keeps every read-only player query safe without touching a disposed custom engine', () => {
    const disposalError = new Error('strict engine disposal failed')
    const engine = new DisposalStrictAudioEngine()
    engine.currentTime = 45
    engine.duration = 300
    engine.isPlaying = true
    engine.ended = true
    engine.seeking = true
    engine.activeAdaptivePlayback = { protocol: 'hls', implementation: 'hls.js' }
    engine.adaptiveVariants.push({ id: 'high', bitrate: 192_000 })
    engine.adaptiveQualitySelection = 'high'
    engine.disposalError = disposalError
    const player = new AudioPlayer({
      preload: 'auto',
      autoplay: true,
      volume: 0.4,
      muted: true,
      loop: true,
      playbackRate: 1.5,
      preservesPitch: false,
      mediaSession: {
        enabled: false,
        metadata: {
          title: 'Disposal-safe metadata',
          artwork: [{ src: '/cover.png' }],
        },
      },
    }, engine)
    player.setPlaylist([{
      source: '/main.mp3',
      defaultAudioTrackId: 'en',
      audioTracks: [
        { id: 'zh', source: '/zh.mp3' },
        { id: 'en', source: '/en.mp3' },
      ],
    }])

    expect(() => player.dispose()).toThrow(disposalError)
    const queryCallsAfterDisposal = engine.queryCalls

    expect(player.getState()).toBe('idle')
    expect(player.getSource()).toBeUndefined()
    expect(player.getPlaylist()).toHaveLength(1)
    expect(player.getPlaylistIndex()).toBe(0)
    expect(player.getAudioTracks().map(audioTrack => audioTrack.id)).toEqual(['zh', 'en'])
    expect(player.getSelectedAudioTrack()?.id).toBe('en')
    expect(player.getCurrentTime()).toBe(0)
    expect(player.getDuration()).toBe(0)
    expect(player.getPreload()).toBe('auto')
    expect(player.getAutoplay()).toBe(true)
    expect(player.getVolume()).toBe(0.4)
    expect(player.isMuted()).toBe(true)
    expect(player.isLooping()).toBe(true)
    expect(player.getPlaybackRate()).toBe(1.5)
    expect(player.getPreservesPitch()).toBe(false)
    expect(player.isPaused()).toBe(true)
    expect(player.isEnded()).toBe(false)
    expect(player.isSeeking()).toBe(false)
    expect(player.getBufferedRanges()).toEqual([])
    expect(player.getSeekableRanges()).toEqual([])
    expect(player.getPlayedRanges()).toEqual([])
    expect(player.canPlayType('audio/mpeg')).toBe('')
    expect(player.getAnalyzer()).toBeUndefined()
    expect(player.getMediaSessionMetadata()).toEqual({
      title: 'Disposal-safe metadata',
      artist: undefined,
      album: undefined,
      artwork: [{
        src: '/cover.png',
        sizes: undefined,
        type: undefined,
      }],
    })
    expect(player.getActiveAdaptivePlayback()).toBeUndefined()
    expect(player.getAdaptiveVariants()).toEqual([])
    expect(player.getAdaptiveQualitySelection()).toBe('auto')
    expect(engine.queryCalls).toBe(queryCallsAfterDisposal)

    engine.disposalError = undefined
    expect(() => player.dispose()).not.toThrow()
    expect(engine.disposeCalls).toBe(2)
    expect(engine.queryCalls).toBe(queryCallsAfterDisposal)
  })

  it('rejects control operations after disposal and disposes only once', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)

    player.dispose()
    player.dispose()

    expect(() => player.setSource('https://example.com/replacement.mp3')).toThrow('disposed')
    expect(() => player.on('play', () => {})).toThrow('disposed')
    expect(() => player.once('play', () => {})).toThrow('disposed')
    expect(() => player.removeAllListeners()).not.toThrow()
    await expect(player.load()).rejects.toMatchObject({ code: 'ENGINE_ERROR' })
    await expect(player.play()).rejects.toMatchObject({ code: 'ENGINE_ERROR' })
    expect(player.getState()).toBe('idle')
    expect(player.getSource()).toBeUndefined()
    expect(engine.disposeCalls).toBe(1)
  })
})
