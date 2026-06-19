import type { AdaptivePlaybackInfo, AdaptiveQualitySelection, AdaptiveVariant } from '../adapters/adaptive-audio-types'
import type { AudioAnalyzer } from '../analysis/audio-analyzer'
import type { AudioEngine, AudioEngineEvents } from '../engine/audio-engine'
import type { AudioFormatSupport, PreloadMode, TimeRange } from '../engine/audio-engine-types'
import type { AudioSource, AudioSourceInput } from '../source/audio-source'
import type { AudioPlayerEvents } from './audio-player-events'
import type { AudioPlayerAnalyzerOptions, AudioPlayerOptions, PlaybackState } from './audio-player-options'
import { audioEngineEventNames } from '../engine/audio-engine'
import { AudioEngineRouter } from '../engine/audio-engine-router'
import { GAudioError } from '../errors/errors'
import { EventEmitter } from '../events/event-emitter'
import { HttpAudioSource } from '../source/http-audio-source'

const defaultAnalyzerFftSize = 2048

/** High-level controller for loading, playing, observing, and switching audio sources. */
export class AudioPlayer {
  private readonly events = new EventEmitter<AudioPlayerEvents>()
  private readonly engine: AudioEngine
  private readonly analyzerOptions?: AudioPlayerAnalyzerOptions
  private analyzer?: AudioAnalyzer
  private source?: AudioSource
  private state: PlaybackState = 'idle'
  private loadRequestId = 0
  private hasLoadedSource = false
  private shouldAutoplay: boolean

  /**
   * Creates an audio player.
   *
   * @param options Initial source, playback settings, and adaptive adapters.
   * @param engine Optional custom engine. It cannot be combined with `options.adapters`.
   * @throws {TypeError} When both a custom engine and adaptive adapters are supplied.
   * @throws {RangeError} When the initial volume or playback rate is invalid.
   */
  constructor(options: AudioPlayerOptions = {}, engine?: AudioEngine) {
    if (engine && options.adapters?.length) {
      throw new TypeError('AudioPlayer cannot combine adapters with an explicit custom engine')
    }

    // AI modified: the router owns protocol engines only when callers do not inject a custom engine.
    this.engine = engine ?? new AudioEngineRouter({ adapters: options.adapters })
    this.analyzerOptions = this.playerAnalyzerOptions(options.analyzer)
    this.shouldAutoplay = options.autoplay ?? false

    try {
      if (options.source) {
        this.source = typeof options.source === 'string' || !('open' in options.source)
          ? new HttpAudioSource(options.source)
          : options.source
      }

      this.engine.setPreload(options.preload ?? 'metadata')
      // AI modified: disable engine-native autoplay so load() owns the observable playback attempt.
      this.engine.setAutoplay(false)
      this.engine.setMuted(options.muted ?? false)
      this.engine.setLoop(options.loop ?? false)
      this.setVolume(options.volume ?? 1)
      this.setPlaybackRate(options.playbackRate ?? 1)
      this.engine.setPreservesPitch(options.preservesPitch ?? true)

      // AI modified: derive public state from engine lifecycle events instead of method calls.
      this.connectEngineEvents()
    }
    catch (error) {
      // AI modified: failed construction must release adapters claimed by an internally owned router.
      if (!engine) {
        this.engine.dispose()
      }
      throw error
    }
  }

  /** @returns The current public playback lifecycle state. */
  getState(): PlaybackState {
    return this.state
  }

  /** @returns The current configured source, or `undefined` when none is configured. */
  getSource(): AudioSource | undefined {
    return this.source
  }

  /** @returns The current playback position in seconds. */
  getCurrentTime(): number {
    return this.engine.getCurrentTime()
  }

  /** @returns The media duration in seconds, or `0` when it is not known. */
  getDuration(): number {
    return this.engine.getDuration()
  }

  /** @returns The current browser preload hint. */
  getPreload(): PreloadMode {
    return this.engine.getPreload()
  }

  /**
   * Changes the browser preload hint for current and future sources.
   *
   * @param preload Amount of media data the browser should preload.
   */
  setPreload(preload: PreloadMode): void {
    this.engine.setPreload(preload)
  }

  /** @returns Whether future calls to {@link load} should attempt playback automatically. */
  getAutoplay(): boolean {
    return this.shouldAutoplay
  }

  /**
   * Controls whether future loads attempt playback after becoming ready.
   *
   * @param shouldAutoplay `true` to make {@link load} call {@link play} after loading.
   */
  setAutoplay(shouldAutoplay: boolean): void {
    // AI modified: player-managed autoplay keeps browser policy failures observable through load().
    this.shouldAutoplay = shouldAutoplay
  }

  /** @returns Linear output volume between `0` and `1`. */
  getVolume(): number {
    return this.engine.getVolume()
  }

  /**
   * Sets linear output volume.
   *
   * @param volume Volume between `0` and `1`.
   * @throws {RangeError} When `volume` is not finite or is outside `0` through `1`.
   */
  setVolume(volume: number): void {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      throw new RangeError('Volume must be a finite number between 0 and 1')
    }
    this.engine.setVolume(volume)
  }

  /** @returns Whether audio output is muted. */
  isMuted(): boolean {
    return this.engine.isMuted()
  }

  /**
   * Enables or disables muted output.
   *
   * @param isMuted `true` to suppress audio output without changing volume.
   */
  setMuted(isMuted: boolean): void {
    this.engine.setMuted(isMuted)
  }

  /** @returns Whether playback restarts automatically after reaching the end. */
  isLooping(): boolean {
    return this.engine.isLooping()
  }

  /**
   * Enables or disables playback looping.
   *
   * @param isLooping `true` to restart playback after the source ends.
   */
  setLoop(isLooping: boolean): void {
    this.engine.setLoop(isLooping)
  }

  /** @returns The playback speed multiplier, where `1` is normal speed. */
  getPlaybackRate(): number {
    return this.engine.getPlaybackRate()
  }

  /**
   * Sets the playback speed multiplier.
   *
   * @param rate Finite multiplier greater than `0`.
   * @throws {RangeError} When `rate` is not finite or is not greater than `0`.
   */
  setPlaybackRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new RangeError('Playback rate must be a finite number greater than 0')
    }
    this.engine.setPlaybackRate(rate)
  }

  /** @returns Whether pitch remains stable when playback speed changes. */
  getPreservesPitch(): boolean {
    return this.engine.getPreservesPitch()
  }

  /**
   * Controls pitch preservation during playback-rate changes.
   *
   * @param shouldPreservePitch `true` to preserve the original audio pitch.
   */
  setPreservesPitch(shouldPreservePitch: boolean): void {
    this.engine.setPreservesPitch(shouldPreservePitch)
  }

  /** @returns Whether the underlying media engine is currently paused. */
  isPaused(): boolean {
    return this.engine.isPaused()
  }

  /** @returns Whether playback has reached the end of the current source. */
  isEnded(): boolean {
    return this.engine.isEnded()
  }

  /** @returns Whether a seek operation is currently in progress. */
  isSeeking(): boolean {
    return this.engine.isSeeking()
  }

  /** @returns Buffered media ranges in seconds. */
  getBufferedRanges(): readonly TimeRange[] {
    return this.engine.getBufferedRanges()
  }

  /** @returns Media ranges that can currently be sought without failing. */
  getSeekableRanges(): readonly TimeRange[] {
    return this.engine.getSeekableRanges()
  }

  /** @returns Media ranges played during the current source lifecycle. */
  getPlayedRanges(): readonly TimeRange[] {
    return this.engine.getPlayedRanges()
  }

  /**
   * Checks browser support for an audio MIME type.
   *
   * @param mimeType MIME type with optional codec parameters.
   * @returns `''`, `'maybe'`, or `'probably'` using HTML media capability semantics.
   */
  canPlayType(mimeType: string): AudioFormatSupport {
    return this.engine.canPlayType(mimeType)
  }

  /**
   * Returns the analyzer created for the loaded source, when enabled and supported.
   *
   * The analyzer is created after a successful {@link load}. Custom engines can support this by exposing
   * `createAnalyzer`, or callers can provide `options.analyzer.createAnalyzer`.
   */
  getAnalyzer(): AudioAnalyzer | undefined {
    return this.analyzer
  }

  /** @returns Active adaptive playback implementation details, when an adaptive source is loaded. */
  getActiveAdaptivePlayback(): AdaptivePlaybackInfo | undefined {
    return this.engine.getActiveAdaptivePlayback?.()
  }

  /** @returns Variants discovered for the active adaptive source. */
  getAdaptiveVariants(): readonly AdaptiveVariant[] {
    return this.engine.getAdaptiveVariants?.() ?? []
  }

  /** @returns `'auto'` for automatic ABR or the selected variant identifier. */
  getAdaptiveQualitySelection(): AdaptiveQualitySelection {
    return this.engine.getAdaptiveQualitySelection?.() ?? 'auto'
  }

  /**
   * Selects automatic adaptive quality or a specific variant identifier.
   *
   * @param variantId `'auto'` for automatic ABR or a variant identifier from {@link getAdaptiveVariants}.
   */
  async setAdaptiveQuality(variantId: AdaptiveQualitySelection): Promise<void> {
    if (!this.engine.setAdaptiveQuality) {
      throw new GAudioError('PROTOCOL_UNSUPPORTED', 'Adaptive quality selection is unavailable for the active source')
    }

    await this.engine.setAdaptiveQuality(variantId)
  }

  /**
   * Replaces the current source without loading it.
   *
   * Any active load is cancelled, the current engine is unloaded, and state returns to `idle`.
   *
   * @param source URL, source description, or custom source implementation.
   */
  setSource(source: AudioSourceInput): void {
    this.loadRequestId += 1
    this.releaseAnalyzer()
    this.engine.unload()
    this.source = typeof source === 'string' || !('open' in source)
      ? new HttpAudioSource(source)
      : source
    this.hasLoadedSource = false
    this.setState('idle')
  }

  /**
   * Loads the configured source and resolves when it is ready.
   *
   * When autoplay is enabled, this method also attempts playback before resolving.
   *
   * @throws {@link GAudioError} When no source is configured, loading fails, loading is superseded, or autoplay is blocked.
   */
  async load(): Promise<void> {
    if (!this.source) {
      const error = new GAudioError('SOURCE_UNAVAILABLE', 'Audio source is required before loading')
      this.publishError(error)
      throw error
    }

    const loadRequestId = ++this.loadRequestId
    this.hasLoadedSource = false
    this.releaseAnalyzer()
    this.setState('loading')

    try {
      await this.engine.load(this.source)
    }
    catch (error) {
      if (error instanceof GAudioError && error.code === 'LOAD_ABORTED') {
        if (loadRequestId === this.loadRequestId) {
          this.setState('idle')
        }
        throw error
      }

      const playerError = error instanceof GAudioError
        ? error
        : new GAudioError('ENGINE_ERROR', 'Audio source could not be loaded', error)

      if (loadRequestId === this.loadRequestId && this.state !== 'error') {
        this.publishError(playerError)
      }
      throw playerError
    }

    if (loadRequestId === this.loadRequestId) {
      this.hasLoadedSource = true
      try {
        this.ensureAnalyzer()
      }
      catch (error) {
        const playerError = error instanceof GAudioError
          ? error
          : new GAudioError('ENGINE_ERROR', 'Audio analyzer could not be created', error)
        this.publishError(playerError)
        throw playerError
      }
      this.setState('ready')
      if (this.shouldAutoplay) {
        // AI modified: explicit playback surfaces autoplay rejection and preserves the loaded source.
        await this.play()
      }
    }
  }

  /**
   * Starts or resumes playback, loading first when the player is idle.
   *
   * @throws {@link GAudioError} When loading fails or the browser rejects playback.
   */
  async play(): Promise<void> {
    if (this.state === 'idle') {
      await this.load()
      if (this.shouldAutoplay) {
        // AI modified: load() already owns the autoplay attempt for idle playback.
        return
      }
    }

    try {
      await this.engine.play()
    }
    catch (error) {
      const playerError = error instanceof GAudioError
        ? error
        : new GAudioError('ENGINE_ERROR', 'Audio playback failed', error)
      this.publishError(playerError)
      throw playerError
    }
  }

  /** Pauses playback while retaining the current position and loaded source. */
  pause(): void {
    this.engine.pause()
  }

  /** Pauses playback and returns to `0` seconds while retaining the loaded source. */
  stop(): void {
    this.engine.stop()
    // AI modified: ready means a source is loaded and can resume without another load.
    this.setState(this.hasLoadedSource ? 'ready' : 'idle')
  }

  /**
   * Seeks to an exact playback position.
   *
   * @param seconds Non-negative target position in seconds.
   * @throws {RangeError} When `seconds` is negative or not finite.
   */
  async seek(seconds: number): Promise<void> {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError('Seek position must be a finite number greater than or equal to 0')
    }
    await this.engine.seek(seconds)
  }

  /**
   * Seeks using the browser's optimized seek operation when available.
   *
   * @param seconds Non-negative target position in seconds.
   * @throws {RangeError} When `seconds` is negative or not finite.
   */
  async fastSeek(seconds: number): Promise<void> {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError('Fast seek position must be a finite number greater than or equal to 0')
    }
    await this.engine.fastSeek(seconds)
  }

  /**
   * Registers a typed player event listener.
   *
   * @param eventName Event to observe.
   * @param handler Listener invoked with the event payload.
   * @returns A function that removes this listener.
   */
  on<EventName extends keyof AudioPlayerEvents>(
    eventName: EventName,
    handler: (payload: AudioPlayerEvents[EventName]) => void,
  ): () => void {
    return this.events.on(eventName, handler)
  }

  /**
   * Registers a typed listener that is removed after the next matching player event.
   *
   * @param eventName Event to observe once.
   * @param handler Listener invoked with the next event payload.
   * @returns A function that removes this listener before it runs.
   */
  once<EventName extends keyof AudioPlayerEvents>(
    eventName: EventName,
    handler: (payload: AudioPlayerEvents[EventName]) => void,
  ): () => void {
    return this.events.once(eventName, handler)
  }

  /**
   * Removes player event listeners.
   *
   * @param eventName Optional event name. When omitted, every player listener is removed.
   */
  removeAllListeners<EventName extends keyof AudioPlayerEvents>(eventName?: EventName): void {
    // AI modified: expose scoped listener cleanup without forcing applications to dispose playback.
    this.events.clear(eventName)
  }

  /**
   * Permanently releases the player, its active engine, source, and event listeners.
   *
   * Create a new player instance before attempting further playback.
   */
  dispose(): void {
    this.loadRequestId += 1
    this.releaseAnalyzer()
    this.engine.dispose()
    this.events.clear()
    this.source = undefined
    this.hasLoadedSource = false
    this.state = 'idle'
  }

  private playerAnalyzerOptions(
    analyzerOption: AudioPlayerOptions['analyzer'],
  ): AudioPlayerAnalyzerOptions | undefined {
    if (analyzerOption === undefined || analyzerOption === false) {
      return undefined
    }
    if (analyzerOption === true) {
      return { enabled: true, fftSize: defaultAnalyzerFftSize }
    }

    return analyzerOption.enabled === false
      ? undefined
      : {
          ...analyzerOption,
          fftSize: analyzerOption.fftSize ?? defaultAnalyzerFftSize,
        }
  }

  private ensureAnalyzer(): void {
    if (!this.analyzerOptions || this.analyzer) {
      return
    }

    const fftSize = this.analyzerOptions.fftSize ?? defaultAnalyzerFftSize
    // AI modified: player-level analyzer config supports both engine-native and caller-supplied Web Audio hooks.
    this.analyzer = this.analyzerOptions.createAnalyzer?.({
      engine: this.engine,
      fftSize,
    }) ?? this.engine.createAnalyzer?.({ fftSize })
  }

  private releaseAnalyzer(): void {
    this.analyzer?.dispose()
    this.analyzer = undefined
  }

  private connectEngineEvents(): void {
    for (const eventName of audioEngineEventNames) {
      switch (eventName) {
        case 'playing':
          this.engine.on(eventName, (payload) => {
            this.setState('playing')
            this.events.emit(eventName, payload)
          })
          break
        case 'pause':
          this.engine.on(eventName, (payload) => {
            this.setState('paused')
            this.events.emit(eventName, payload)
          })
          break
        case 'waiting':
          this.engine.on(eventName, (payload) => {
            this.setState('buffering')
            this.events.emit(eventName, payload)
          })
          break
        case 'ended':
          this.engine.on(eventName, (payload) => {
            this.setState('ended')
            this.events.emit(eventName, payload)
          })
          break
        case 'error':
          this.engine.on(eventName, error => this.publishError(error))
          break
        default:
          this.forwardEngineEvent(eventName)
      }
    }
  }

  private forwardEngineEvent<EventName extends keyof AudioEngineEvents>(eventName: EventName): void {
    this.engine.on(eventName, payload => this.events.emit(eventName, payload as AudioPlayerEvents[EventName]))
  }

  private publishError(error: GAudioError): void {
    this.setState('error')
    this.events.emit('error', error)
  }

  private setState(state: PlaybackState): void {
    if (this.state === state) {
      return
    }

    this.state = state
    this.events.emit('statechange', state)
  }
}
