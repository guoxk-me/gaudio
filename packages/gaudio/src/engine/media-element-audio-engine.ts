// @env browser

import type { AudioAnalyzerOptions } from '../analysis/audio-analyzer'
import type { AudioSource, AudioStreamHandle } from '../source/audio-source'
import type { AudioEngine, AudioEngineEvents } from './audio-engine'
import type {
  AudioEngineLoadOptions,
  AudioFormatSupport,
  PreloadMode,
  TimeRange,
} from './audio-engine-types'
import { AudioAnalyzer } from '../analysis/audio-analyzer'
import { GAudioError } from '../errors/errors'
import { EventEmitter } from '../events/event-emitter'
import { mediaElementError } from './media-element-errors'
import { mediaTimeRanges } from './media-element-ranges'

interface ActiveSourceSession {
  source: AudioSource
  isClosed: boolean
  attachedUrl?: string
  closePromise?: Promise<SourceCloseOutcome>
  abortController?: AbortController
  metadataEventStartTime?: number
  resolve?: () => void
  reject?: (error: GAudioError) => void
}

type SourceCloseOutcome
  = { isSuccessful: true }
    | { isSuccessful: false, error: unknown }

interface MediaResourceRelease {
  hasError: boolean
  sourceCleanup?: Promise<SourceCloseOutcome>
  error?: unknown
}

interface ActiveSeekRequest {
  abortController: AbortController
  eventStartTime: number
  loadGeneration: number
  publishedError?: GAudioError
  reject: (error: GAudioError) => void
}

interface ObservedNativeSeek {
  eventStartTime: number
  loadGeneration: number
}

type AudioContextConstructor = typeof AudioContext

interface WebAudioGlobal {
  AudioContext?: AudioContextConstructor
  webkitAudioContext?: AudioContextConstructor
}

/**
 * {@link AudioEngine} implementation backed by an [HTMLAudioElement](https://developer.mozilla.org/docs/Web/API/HTMLAudioElement).
 *
 * This is GAudio's only supported class-inheritance surface. Subclasses may depend on documented
 * public and protected members only; implementation state remains ECMAScript-private.
 */
export class MediaElementAudioEngine implements AudioEngine {
  /** Media element used for native loading and playback. */
  protected readonly audioElement: HTMLAudioElement
  /** Event channel used to publish browser media lifecycle updates. */
  protected readonly events = new EventEmitter<AudioEngineEvents>()
  // AI modified: native private names keep internal state outside the supported subclass namespace.
  #activeSourceSession?: ActiveSourceSession
  #audioContext?: AudioContext
  #pendingAudioContextCleanup?: AudioContext
  #audioContextClosePromise?: Promise<SourceCloseOutcome>
  #mediaElementSource?: MediaElementAudioSourceNode
  #isMediaElementSourceAudible = false
  readonly #detachedMediaErrors = new WeakSet<MediaError>()
  #shouldSuppressPause = false
  #pendingSourceCleanup?: ActiveSourceSession
  #activeSeekRequest?: ActiveSeekRequest
  #observedNativeSeek?: ObservedNativeSeek
  #activeLoadAbortController?: AbortController
  readonly #activePlayAbortControllers = new Set<AbortController>()
  #playbackIntentId = 0
  #requestedMediaPlayback: 'play' | 'pause' = 'pause'
  #loadGeneration = 0
  #hasAttachedSource = false
  #hasRemovedMediaEventListeners = false
  #hasFinishedDisposal = false
  #activeDisposal?: Promise<void>
  #pendingMediaEventListenerRemovals?: Array<() => void>
  // AI modified: a permanent guard prevents disposed engines from recreating browser resources.
  #isDisposed = false

  /**
   * Creates a media-element engine.
   *
   * @param audioElement Element to control. A new `Audio` element is created by default.
   * @throws {TypeError} When the element contains child `<source>` candidates owned by the browser.
   */
  constructor(audioElement: HTMLAudioElement = new Audio()) {
    // AI modified: one source owner prevents native child candidates from reviving after engine cleanup.
    if (Array.from(audioElement.children).some(child => child.localName === 'source')) {
      throw new TypeError(
        'MediaElementAudioEngine requires an audio element without child <source> elements; pass sources through AudioPlayer or load() instead',
      )
    }
    this.audioElement = audioElement
    // AI modified: a caller-supplied element with existing media joins the same replacement teardown lifecycle.
    this.#hasAttachedSource = ('srcObject' in audioElement && audioElement.srcObject !== null)
      || Boolean(audioElement.currentSrc)
      || (
        typeof audioElement.getAttribute === 'function'
        && audioElement.getAttribute('src') !== null
      )
    this.#addMediaEventListeners()
  }

  /**
   * Opens and loads a source until metadata is available.
   *
   * Reported `MediaError` events and superseded operations use stable {@link GAudioError} codes.
   * Errors thrown by custom source lifecycle methods or underlying media-element and subclass hooks are preserved.
   *
   * @param source Source to attach to the media element.
   * @param options CORS request policy applied before attachment; omission preserves the current element policy.
   * @throws {@link GAudioError} When the media element reports a load failure or a newer operation supersedes this load.
   * @throws The original error when custom source lifecycle or media-element and subclass hook code fails.
   */
  async load(source: AudioSource, options?: AudioEngineLoadOptions): Promise<void> {
    this.#assertUsable()
    const crossOrigin = options?.crossOrigin
    if (crossOrigin !== undefined && crossOrigin !== 'anonymous' && crossOrigin !== 'use-credentials') {
      throw new TypeError('crossOrigin must be anonymous or use-credentials')
    }
    this.#activeLoadAbortController?.abort()
    const loadAbortController = new AbortController()
    this.#activeLoadAbortController = loadAbortController
    const loadGeneration = ++this.#loadGeneration
    try {
      const cancelledSourceSession = this.#cancelActiveSourceSession()
      this.cancelActiveSeek()
      // AI modified: detach playback before awaiting source cleanup so replacement loads cannot overlap old media or vendors.
      let sourceDetachError: unknown
      let hasSourceDetachError = false
      const shouldPausePreviousPlayback = this.#hasAttachedSource
        || this.#activePlayAbortControllers.size > 0
        || !this.audioElement.paused
      if (shouldPausePreviousPlayback) {
        try {
          // AI modified: loading also cancels playback requested before any source URL was attached.
          this.pauseWithoutEvent()
        }
        catch (error) {
          hasSourceDetachError = true
          sourceDetachError = error
        }
      }
      if (this.#hasAttachedSource) {
        try {
          // AI modified: a pause failure cannot leave the superseded URL attached to the media element.
          this.#detachActiveSourceUrl()
        }
        catch (error) {
          if (!hasSourceDetachError) {
            hasSourceDetachError = true
            sourceDetachError = error
          }
        }
      }
      const previousSourceCleanup = this.#closeCancelledSourceSession(cancelledSourceSession)
      let previousSourceCloseOutcome: SourceCloseOutcome | undefined
      if (previousSourceCleanup) {
        // AI modified: cancellation can promptly supersede a load without bypassing the shared cleanup barrier.
        previousSourceCloseOutcome = await this.#waitForLoadOperation(previousSourceCleanup, loadAbortController)
      }
      if (loadGeneration !== this.#loadGeneration) {
        throw this.#loadAbortedError()
      }
      if (hasSourceDetachError) {
        throw sourceDetachError
      }
      if (previousSourceCloseOutcome && !previousSourceCloseOutcome.isSuccessful) {
        // AI modified: replacement never overlaps a source whose cleanup still needs a later retry.
        throw previousSourceCloseOutcome.error
      }

      const activeSourceSession: ActiveSourceSession = {
        source,
        isClosed: false,
      }
      this.#activeSourceSession = activeSourceSession

      let streamHandle
      try {
        streamHandle = await this.#waitForSourceOpen(activeSourceSession)
      }
      catch (error) {
        if (this.#activeSourceSession === activeSourceSession) {
          this.#activeSourceSession = undefined
        }
        if (loadGeneration !== this.#loadGeneration) {
          // AI modified: the cancelling lifecycle operation already owns cleanup, avoiding an immediate duplicate retry.
          throw this.#loadAbortedError()
        }
        // AI modified: an open failure can allocate resources before rejecting, so its source is always closed.
        const sourceCleanup = this.#closeSourceSession(activeSourceSession)
        await this.#waitForLoadOperation(sourceCleanup, loadAbortController)
        throw error
      }

      if (this.#activeSourceSession !== activeSourceSession) {
        // AI modified: a source that settles alongside cancellation cannot delay the superseded load result.
        void this.#closeSourceSession(activeSourceSession)
        throw this.#loadAbortedError()
      }

      // AI modified: install the load waiter before vendor attachment so synchronous failures cannot be lost.
      let metadataReady: Promise<void>
      try {
        activeSourceSession.attachedUrl = streamHandle.url
        metadataReady = this.#waitForSourceMetadata(activeSourceSession, streamHandle.url)
      }
      catch (error) {
        if (this.#activeSourceSession === activeSourceSession) {
          this.#activeSourceSession = undefined
        }
        // AI modified: listener setup failures release the opened source before the load rejects.
        await this.#waitForLoadOperation(this.#closeSourceSession(activeSourceSession), loadAbortController)
        throw error
      }
      if (
        this.#isDisposed
        || loadGeneration !== this.#loadGeneration
        || this.#activeSourceSession !== activeSourceSession
      ) {
        this.#finishSourceMetadataWait(activeSourceSession)
        void metadataReady.catch(() => {})
        // AI modified: registration reentrancy cannot attach after a newer lifecycle operation closed the source.
        void this.#closeSourceSession(activeSourceSession)
        throw this.#loadAbortedError()
      }
      try {
        // AI modified: Web Audio needs a CORS-enabled request before media is fetched, not after metadata loads.
        if (crossOrigin !== undefined) {
          this.audioElement.crossOrigin = crossOrigin
        }
        if (
          loadGeneration === this.#loadGeneration
          && !this.#isDisposed
          && this.#activeSourceSession === activeSourceSession
        ) {
          // AI modified: only the surviving source may attach after synchronous CORS callbacks.
          this.#hasAttachedSource = true
          activeSourceSession.metadataEventStartTime = new Event('gaudio-source-attachment').timeStamp
          this.attachSourceUrl(streamHandle.url)
        }
      }
      catch (error) {
        this.#finishSourceMetadataWait(activeSourceSession)
        void metadataReady.catch(() => {})
        if (loadGeneration !== this.#loadGeneration || this.#isDisposed) {
          // AI modified: the winning lifecycle owns cleanup; an obsolete setter cannot pause or detach its replacement.
          throw this.#loadAbortedError()
        }
        if (this.#activeSourceSession === activeSourceSession) {
          this.#activeSourceSession = undefined
        }
        try {
          this.pauseWithoutEvent()
        }
        catch {
          // The original attach error remains the actionable failure.
        }
        try {
          // AI modified: a failed pause cannot leave a synchronously rejected attachment active.
          this.#detachActiveSourceUrl()
        }
        catch {
          // The original attach error remains the actionable failure.
        }
        // AI modified: synchronous native or adapter attachment failures release the opened source before rejecting.
        await this.#waitForLoadOperation(this.#closeSourceSession(activeSourceSession), loadAbortController)
        throw error
      }

      await this.#waitForLoadOperation(metadataReady, loadAbortController)

      if (this.#isDisposed || this.#activeSourceSession !== activeSourceSession) {
        // AI modified: the winning lifecycle operation owns cleanup while this superseded load rejects promptly.
        void this.#closeSourceSession(activeSourceSession)
        throw this.#isDisposed ? this.#disposedError() : this.#loadAbortedError()
      }
    }
    finally {
      if (this.#activeLoadAbortController === loadAbortController) {
        this.#activeLoadAbortController = undefined
      }
    }
  }

  /** Cancels loading, pauses playback, and detaches the current source. */
  unload(): void {
    this.#assertUsable()
    const release = this.#releaseMediaResources()
    if (release.hasError) {
      throw release.error
    }
  }

  #releaseMediaResources(): MediaResourceRelease {
    this.#activeLoadAbortController?.abort()
    this.#activeLoadAbortController = undefined
    this.#loadGeneration += 1
    const cancelledSourceSession = this.#cancelActiveSourceSession()
    this.cancelActiveSeek()
    let firstReleaseError: unknown
    let hasReleaseError = false
    try {
      this.pauseWithoutEvent()
    }
    catch (error) {
      hasReleaseError = true
      firstReleaseError = error
    }
    if (this.#hasAttachedSource) {
      try {
        this.#detachActiveSourceUrl()
      }
      catch (error) {
        if (!hasReleaseError) {
          hasReleaseError = true
          firstReleaseError = error
        }
      }
    }
    // AI modified: pause, detachment, and source cleanup are independent teardown obligations.
    const sourceCleanup = this.#closeCancelledSourceSession(cancelledSourceSession)
    return {
      hasError: hasReleaseError,
      sourceCleanup,
      ...(hasReleaseError ? { error: firstReleaseError } : {}),
    }
  }

  /**
   * Starts or resumes playback.
   *
   * @throws {@link GAudioError} With a stable code describing the browser playback rejection.
   */
  async play(): Promise<void> {
    this.#assertUsable()
    try {
      await this.#waitForPlaybackOperation(() => this.audioElement.play())
    }
    catch (error) {
      if (error instanceof GAudioError) {
        throw error
      }
      if (this.#isDisposed) {
        throw this.#disposedError()
      }
      // AI modified: inspect the standard name structurally because iframe DOMExceptions cross realm boundaries.
      const playbackErrorName = typeof error === 'object'
        && error !== null
        && 'name' in error
        && typeof error.name === 'string'
        ? error.name
        : undefined
      switch (playbackErrorName) {
        case 'NotAllowedError':
          throw new GAudioError('PLAYBACK_BLOCKED', 'Browser blocked audio playback', error)
        case 'NotSupportedError':
          throw new GAudioError('UNSUPPORTED_FORMAT', 'Browser does not support the active audio source', error)
        case 'AbortError':
          throw new GAudioError('LOAD_ABORTED', 'Audio playback was interrupted by a newer media operation', error)
      }
      throw new GAudioError('ENGINE_ERROR', 'Audio playback failed', error)
    }

    // AI modified: successful playback invalidates suppression left by an older internal pause task.
    this.#shouldSuppressPause = false
    if (this.#isDisposed) {
      this.pauseWithoutEvent()
      throw this.#disposedError()
    }

    const audioContext = this.#audioContext
    if (audioContext) {
      try {
        // AI modified: best-effort analyzer activation cannot keep successful media playback pending.
        void audioContext.resume().catch(() => {})
      }
      catch {
        // Analysis failure must not report successful audible playback as blocked.
      }
    }

    if (this.#isDisposed) {
      this.pauseWithoutEvent()
      throw this.#disposedError()
    }
  }

  /** Pauses playback without changing the current position. */
  pause(): void {
    this.#assertUsable()
    // AI modified: explicit playback interruption settles browser play requests that never complete themselves.
    this.#cancelActivePlayRequests()
    this.audioElement.pause()
  }

  /** Pauses playback and returns to `0` seconds while retaining the source. */
  stop(): void {
    this.#assertUsable()
    // AI modified: resetting the timeline owns the next seeked event, so an earlier seek must reject first.
    this.cancelActiveSeek()
    // AI modified: suppress the native pause event because stop has a distinct ready state.
    this.pauseWithoutEvent()
    this.audioElement.currentTime = 0
  }

  /**
   * Seeks to a playback position.
   *
   * @param seconds Target position in seconds. Negative values are clamped to `0`.
   */
  async seek(seconds: number): Promise<void> {
    this.#assertUsable()
    await this.#seekMediaElement(Math.max(0, seconds), (targetTime) => {
      this.audioElement.currentTime = targetTime
    })
  }

  /**
   * Uses native fast seeking when available and otherwise falls back to {@link seek}.
   *
   * @param seconds Target position in seconds.
   */
  async fastSeek(seconds: number): Promise<void> {
    this.#assertUsable()
    // AI modified: prefer optimized browser seeking while retaining a standard seek fallback.
    if (typeof this.audioElement.fastSeek === 'function') {
      await this.#seekMediaElement(Math.max(0, seconds), targetTime => this.audioElement.fastSeek?.(targetTime))
      return
    }
    await this.seek(seconds)
  }

  /**
   * Applies the fetch hint that the browser uses for the attached media element.
   *
   * @param preload Browser preload hint applied to the media element.
   */
  setPreload(preload: PreloadMode): void {
    this.#assertUsable()
    this.audioElement.preload = preload
  }

  /** @returns The normalized browser preload hint. */
  getPreload(): PreloadMode {
    const preload = this.audioElement.preload
    return preload === 'none' || preload === 'auto' ? preload : 'metadata'
  }

  /**
   * Delegates automatic playback after loading to the media element.
   *
   * @param shouldAutoplay Whether the media element should use native autoplay.
   */
  setAutoplay(shouldAutoplay: boolean): void {
    this.#assertUsable()
    this.audioElement.autoplay = shouldAutoplay
  }

  /** @returns Whether native media-element autoplay is enabled. */
  getAutoplay(): boolean {
    return this.audioElement.autoplay
  }

  /**
   * Applies safe linear gain directly to the media element.
   *
   * @param volume Linear volume clamped to the `0` through `1` range.
   */
  setVolume(volume: number): void {
    this.#assertUsable()
    this.audioElement.volume = Math.min(1, Math.max(0, volume))
  }

  /** @returns Linear output volume between `0` and `1`. */
  getVolume(): number {
    return this.audioElement.volume
  }

  /**
   * Silences output without discarding the media element's volume.
   *
   * @param isMuted Whether audio output should be muted.
   */
  setMuted(isMuted: boolean): void {
    this.#assertUsable()
    this.audioElement.muted = isMuted
  }

  /** @returns Whether audio output is muted. */
  isMuted(): boolean {
    return this.audioElement.muted
  }

  /**
   * Lets the media element restart the source automatically after it ends.
   *
   * @param isLooping Whether playback should restart after reaching the end.
   */
  setLoop(isLooping: boolean): void {
    this.#assertUsable()
    this.audioElement.loop = isLooping
  }

  /** @returns Whether playback looping is enabled. */
  isLooping(): boolean {
    return this.audioElement.loop
  }

  /**
   * Applies the requested timeline speed to the media element.
   *
   * @param rate Positive playback speed multiplier.
   */
  setPlaybackRate(rate: number): void {
    this.#assertUsable()
    // AI modified: preserve the public positive-rate contract instead of silently changing low values.
    this.audioElement.playbackRate = rate
  }

  /** @returns The effective playback speed multiplier. */
  getPlaybackRate(): number {
    return this.audioElement.playbackRate
  }

  /**
   * Controls the browser's pitch correction during non-default playback rates.
   *
   * @param shouldPreservePitch Whether pitch should remain stable at non-default playback rates.
   */
  setPreservesPitch(shouldPreservePitch: boolean): void {
    this.#assertUsable()
    this.audioElement.preservesPitch = shouldPreservePitch
  }

  /** @returns Whether pitch preservation is enabled. */
  getPreservesPitch(): boolean {
    return this.audioElement.preservesPitch
  }

  /** @returns The current playback position in seconds. */
  getCurrentTime(): number {
    return this.audioElement.currentTime
  }

  /** @returns Media duration in seconds, or `0` when it is not finite. */
  getDuration(): number {
    return Number.isFinite(this.audioElement.duration) ? this.audioElement.duration : 0
  }

  /** @returns Whether the media element is paused. */
  isPaused(): boolean {
    return this.audioElement.paused
  }

  /** @returns Whether playback has reached the end of the source. */
  isEnded(): boolean {
    return this.audioElement.ended
  }

  /** @returns Whether the media element is currently seeking. */
  isSeeking(): boolean {
    return this.audioElement.seeking
  }

  /** @returns Buffered media ranges in seconds. */
  getBufferedRanges(): readonly TimeRange[] {
    return mediaTimeRanges(this.audioElement.buffered)
  }

  /** @returns Seekable media ranges in seconds. */
  getSeekableRanges(): readonly TimeRange[] {
    return mediaTimeRanges(this.audioElement.seekable)
  }

  /** @returns Media ranges played during the current source lifecycle. */
  getPlayedRanges(): readonly TimeRange[] {
    return mediaTimeRanges(this.audioElement.played)
  }

  /**
   * Checks native media-element support for a MIME type.
   *
   * @param mimeType MIME type with optional codec parameters.
   * @returns `''`, `'maybe'`, or `'probably'`.
   */
  canPlayType(mimeType: string): AudioFormatSupport {
    return this.audioElement.canPlayType(mimeType)
  }

  /**
   * Creates an analyzer for the media element output.
   *
   * The media element source is also connected to the context destination so enabling analysis does not mute playback.
   *
   * @param options Analyzer node configuration.
   */
  createAnalyzer(options: AudioAnalyzerOptions = {}): AudioAnalyzer {
    this.#assertUsable()
    const audioContext = this.#mediaAudioContext()
    const mediaElementSource = this.#mediaSourceNode(audioContext)

    return new AudioAnalyzer(audioContext, mediaElementSource, options.fftSize)
  }

  /**
   * Registers an engine event listener.
   *
   * Listener callbacks run synchronously. A callback failure does not interrupt internal or sibling
   * listeners; it is passed to `globalThis.reportError` when available or rethrown from a queued microtask.
   *
   * @typeParam EventName Event key whose payload type is delivered to the handler.
   * @param eventName Event to observe.
   * @param handler Listener invoked with the event payload.
   * @returns A function that removes this listener.
   */
  on<EventName extends keyof AudioEngineEvents>(
    eventName: EventName,
    handler: (payload: AudioEngineEvents[EventName]) => void,
  ): () => void {
    this.#assertUsable()
    return this.events.on(eventName, handler)
  }

  /** Removes browser listeners, unloads the source, and waits for owned asynchronous cleanup. */
  dispose(): Promise<void> {
    if (this.#hasFinishedDisposal) {
      return Promise.resolve()
    }
    if (this.#activeDisposal) {
      return this.#activeDisposal
    }

    const cleanup = this.#disposeOwnedResources()
    // AI modified: one disposal attempt owns all in-flight browser cleanup and failed attempts remain retryable.
    const activeDisposal = cleanup.finally(() => {
      if (this.#activeDisposal === activeDisposal) {
        this.#activeDisposal = undefined
      }
    })
    this.#activeDisposal = activeDisposal
    return activeDisposal
  }

  async #disposeOwnedResources(): Promise<void> {
    const isRepeatedDisposal = this.#isDisposed
    this.#isDisposed = true
    const cleanupErrors: unknown[] = []
    try {
      this.#removeMediaEventListeners()
    }
    catch (error) {
      cleanupErrors.push(error)
    }
    // AI modified: repeated disposal retries detach and source cleanup while successful browser work stays skipped.
    const mediaRelease = this.#releaseMediaResources()
    if (mediaRelease.hasError) {
      cleanupErrors.push(mediaRelease.error)
    }
    const audioAnalysisCleanup = this.#closeAudioAnalysis()
    if (!isRepeatedDisposal) {
      this.events.clear()
    }

    const cleanupOutcomes = await Promise.all([
      mediaRelease.sourceCleanup ?? Promise.resolve<SourceCloseOutcome>({ isSuccessful: true }),
      audioAnalysisCleanup ?? Promise.resolve<SourceCloseOutcome>({ isSuccessful: true }),
    ])
    for (const cleanupOutcome of cleanupOutcomes) {
      if (!cleanupOutcome.isSuccessful) {
        cleanupErrors.push(cleanupOutcome.error)
      }
    }
    if (cleanupErrors.length > 0) {
      throw cleanupErrors[0]
    }
    this.#hasFinishedDisposal = true
  }

  /**
   * Attaches a source URL and starts native media loading.
   *
   * @param url URL to assign to the media element.
   */
  protected attachSourceUrl(url: string): void {
    this.audioElement.src = url
    this.audioElement.load()
  }

  /** Removes the current media URL and resets native media loading state. */
  protected detachSourceUrl(): void {
    let firstDetachError: unknown
    let hasDetachError = false
    try {
      // AI modified: caller-owned stream objects must not remain selected ahead of a replacement URL.
      this.audioElement.srcObject = null
    }
    catch (error) {
      hasDetachError = true
      firstDetachError = error
    }
    try {
      this.audioElement.removeAttribute('src')
    }
    catch (error) {
      if (!hasDetachError) {
        hasDetachError = true
        firstDetachError = error
      }
    }
    try {
      this.audioElement.load()
    }
    catch (error) {
      if (!hasDetachError) {
        hasDetachError = true
        firstDetachError = error
      }
    }
    if (hasDetachError) {
      // AI modified: failed native detachment remains retryable by a later lifecycle operation.
      throw firstDetachError
    }
    this.#hasAttachedSource = false
  }

  /**
   * Checks whether a metadata event belongs to the source currently being loaded.
   *
   * @param event Metadata event received from the media element.
   * @param expectedUrl URL assigned for the active source session.
   * @param eventStartTime Earliest event timestamp accepted for the active source session.
   * @returns `true` when the event can complete the active source load.
   */
  protected isSourceMetadataCurrent(
    event: Event,
    expectedUrl: string,
    eventStartTime: number | undefined,
  ): boolean {
    // AI modified: late old-resource events cannot finish replacement loading while it still has no metadata.
    if (
      !this.isMediaEventCurrent(event, eventStartTime)
      || !this.hasMediaMetadata()
    ) {
      return false
    }
    const currentUrl = this.audioElement.currentSrc || this.audioElement.src
    if (!currentUrl) {
      return true
    }
    const baseUrl = globalThis.document?.baseURI ?? globalThis.location?.href
    if (!baseUrl) {
      return currentUrl === expectedUrl
    }
    try {
      return new URL(currentUrl, baseUrl).href === new URL(expectedUrl, baseUrl).href
    }
    catch {
      return currentUrl === expectedUrl
    }
  }

  /**
   * Checks whether a media event was created after an operation started.
   *
   * @param event Media event to inspect.
   * @param eventStartTime Earliest timestamp accepted by the operation.
   * @returns `true` when the event is eligible for the active operation.
   */
  protected isMediaEventCurrent(event: Event, eventStartTime: number | undefined): boolean {
    return eventStartTime !== undefined && event.timeStamp >= eventStartTime
  }

  /**
   * Reports whether the active media resource has exposed its metadata.
   *
   * @returns `true` at `HAVE_METADATA` or a later HTML media ready state.
   */
  protected hasMediaMetadata(): boolean {
    // AI modified: URL and event timing alone cannot prove that a replacement resource reached metadata readiness.
    return this.audioElement.readyState >= 1
  }

  #detachActiveSourceUrl(): void {
    const mediaError = this.audioElement.error
    if (mediaError) {
      // AI modified: remember the detached resource's error so its queued event cannot fail a newer source.
      this.#detachedMediaErrors.add(mediaError)
    }
    this.detachSourceUrl()
  }

  /**
   * Rejects the current load from a vendor-specific fatal error path.
   *
   * @param error Error used to reject the pending load.
   */
  protected rejectActiveLoad(error: GAudioError): void {
    const activeSourceSession = this.#activeSourceSession
    if (!activeSourceSession?.reject) {
      return
    }

    // AI modified: vendor engines report fatal failures outside the media element error channel.
    this.#activeSourceSession = undefined
    activeSourceSession.abortController?.abort()
    const reject = activeSourceSession.reject
    activeSourceSession.abortController = undefined
    activeSourceSession.resolve = undefined
    activeSourceSession.reject = undefined
    // AI modified: vendor load failures join the same teardown and source-cleanup lifecycle as native failures.
    this.#releaseFailedSourceSession(activeSourceSession, error, reject)
  }

  #addMediaEventListeners(): void {
    const listenerRegistrations: Array<readonly [string, EventListener]> = [
      ['loadstart', this.#handleLoadStart],
      ['loadedmetadata', this.#handleLoadedMetadata],
      ['canplay', this.#handleCanPlay],
      ['play', this.#handlePlay],
      ['playing', this.#handlePlaying],
      ['pause', this.#handlePause],
      ['waiting', this.#handleWaiting],
      ['seeking', this.#handleSeeking],
      ['seeked', this.#handleSeeked],
      ['timeupdate', this.#handleTimeUpdate],
      ['durationchange', this.#handleDurationChange],
      ['progress', this.#handleProgress],
      ['volumechange', this.#handleVolumeChange],
      ['ratechange', this.#handleRateChange],
      ['ended', this.#handleEnded],
      ['error', this.#handleError],
    ]
    const completedRegistrations: Array<readonly [string, EventListener]> = []
    try {
      for (const [eventName, handler] of listenerRegistrations) {
        this.audioElement.addEventListener(eventName, handler)
        completedRegistrations.push([eventName, handler])
      }
    }
    catch (error) {
      // AI modified: constructor failure rolls back every browser listener registered before it.
      for (const [eventName, handler] of completedRegistrations.reverse()) {
        try {
          this.audioElement.removeEventListener(eventName, handler)
        }
        catch {
          // Preserve the registration failure that prevented construction.
        }
      }
      throw error
    }
  }

  #removeMediaEventListeners(): void {
    if (this.#hasRemovedMediaEventListeners) {
      return
    }
    const listenerRemovals = this.#pendingMediaEventListenerRemovals ?? [
      () => this.audioElement.removeEventListener('loadstart', this.#handleLoadStart),
      () => this.audioElement.removeEventListener('loadedmetadata', this.#handleLoadedMetadata),
      () => this.audioElement.removeEventListener('canplay', this.#handleCanPlay),
      () => this.audioElement.removeEventListener('play', this.#handlePlay),
      () => this.audioElement.removeEventListener('playing', this.#handlePlaying),
      () => this.audioElement.removeEventListener('pause', this.#handlePause),
      () => this.audioElement.removeEventListener('waiting', this.#handleWaiting),
      () => this.audioElement.removeEventListener('seeking', this.#handleSeeking),
      () => this.audioElement.removeEventListener('seeked', this.#handleSeeked),
      () => this.audioElement.removeEventListener('timeupdate', this.#handleTimeUpdate),
      () => this.audioElement.removeEventListener('durationchange', this.#handleDurationChange),
      () => this.audioElement.removeEventListener('progress', this.#handleProgress),
      () => this.audioElement.removeEventListener('volumechange', this.#handleVolumeChange),
      () => this.audioElement.removeEventListener('ratechange', this.#handleRateChange),
      () => this.audioElement.removeEventListener('ended', this.#handleEnded),
      () => this.audioElement.removeEventListener('error', this.#handleError),
    ]
    const failedListenerRemovals: Array<() => void> = []
    let firstRemovalError: unknown
    let hasRemovalError = false
    for (const removeListener of listenerRemovals) {
      try {
        removeListener()
      }
      catch (error) {
        if (!hasRemovalError) {
          hasRemovalError = true
          firstRemovalError = error
        }
        failedListenerRemovals.push(removeListener)
      }
    }
    if (hasRemovalError) {
      // AI modified: later disposal retries only callbacks whose browser removal did not finish.
      this.#pendingMediaEventListenerRemovals = failedListenerRemovals
      throw firstRemovalError
    }
    this.#pendingMediaEventListenerRemovals = undefined
    this.#hasRemovedMediaEventListeners = true
  }

  #cancelActiveSourceSession(): ActiveSourceSession | undefined {
    const activeSourceSession = this.#activeSourceSession
    if (!activeSourceSession) {
      return undefined
    }

    this.#activeSourceSession = undefined
    activeSourceSession.abortController?.abort()
    activeSourceSession.reject?.(this.#loadAbortedError())
    activeSourceSession.abortController = undefined
    activeSourceSession.resolve = undefined
    activeSourceSession.reject = undefined
    return activeSourceSession
  }

  #waitForSourceOpen(activeSourceSession: ActiveSourceSession): Promise<AudioStreamHandle> {
    return new Promise((resolve, reject) => {
      let hasFinishedOpenWait = false
      const finishOpenWait = (openResult: AudioStreamHandle | undefined, error?: unknown): void => {
        if (hasFinishedOpenWait) {
          return
        }
        hasFinishedOpenWait = true
        activeSourceSession.reject = undefined
        if (openResult) {
          resolve(openResult)
        }
        else {
          reject(error)
        }
      }
      const rejectOpenWait = (error: GAudioError): void => finishOpenWait(undefined, error)
      activeSourceSession.reject = rejectOpenWait
      try {
        // AI modified: observe both late outcomes so a cancelled custom open cannot create an unhandled rejection.
        void activeSourceSession.source.open().then(
          openResult => finishOpenWait(openResult),
          error => finishOpenWait(undefined, error),
        )
      }
      catch (error) {
        finishOpenWait(undefined, error)
      }
    })
  }

  #waitForSourceMetadata(
    activeSourceSession: ActiveSourceSession,
    expectedUrl: string,
  ): Promise<void> {
    let resolveMetadata: () => void = () => {}
    let rejectMetadata: (error: GAudioError) => void = () => {}
    const metadataReady = new Promise<void>((resolve, reject) => {
      resolveMetadata = resolve
      rejectMetadata = reject
    })
    const abortController = new AbortController()
    activeSourceSession.abortController = abortController
    activeSourceSession.resolve = resolveMetadata
    activeSourceSession.reject = rejectMetadata

    const handleReady = (event: Event): void => {
      if (
        this.#activeSourceSession !== activeSourceSession
        || !this.isSourceMetadataCurrent(
          event,
          expectedUrl,
          activeSourceSession.metadataEventStartTime,
        )
      ) {
        return
      }
      abortController.abort()
      activeSourceSession.abortController = undefined
      activeSourceSession.resolve = undefined
      activeSourceSession.reject = undefined
      resolveMetadata()
    }

    const handleLoadError = (): void => {
      if (this.#isDetachedMediaError()) {
        return
      }
      const error = mediaElementError(this.audioElement)
      abortController.abort()
      activeSourceSession.abortController = undefined
      activeSourceSession.resolve = undefined
      activeSourceSession.reject = undefined
      if (this.#activeSourceSession === activeSourceSession) {
        this.#activeSourceSession = undefined
      }
      // AI modified: a failed candidate releases native and vendor playback before fallback loading begins.
      this.#releaseFailedSourceSession(activeSourceSession, error, rejectMetadata)
    }

    try {
      this.audioElement.addEventListener('loadedmetadata', handleReady, {
        signal: abortController.signal,
      })
      this.audioElement.addEventListener('error', handleLoadError, {
        // AI modified: a stale detached-source error must not consume the current source's error listener.
        signal: abortController.signal,
      })
    }
    catch (error) {
      abortController.abort()
      activeSourceSession.abortController = undefined
      activeSourceSession.resolve = undefined
      activeSourceSession.reject = undefined
      throw error
    }
    return metadataReady
  }

  #finishSourceMetadataWait(activeSourceSession: ActiveSourceSession): void {
    const resolve = activeSourceSession.resolve
    activeSourceSession.abortController?.abort()
    activeSourceSession.abortController = undefined
    activeSourceSession.resolve = undefined
    activeSourceSession.reject = undefined
    resolve?.()
  }

  #closeCancelledSourceSession(
    activeSourceSession: ActiveSourceSession | undefined,
  ): Promise<SourceCloseOutcome> | undefined {
    const pendingSourceCleanup = this.#pendingSourceCleanup
    if (pendingSourceCleanup && pendingSourceCleanup !== activeSourceSession) {
      return this.#closeSourceSession(pendingSourceCleanup).then((closeOutcome) => {
        if (!closeOutcome.isSuccessful || !activeSourceSession) {
          return closeOutcome
        }
        return this.#closeSourceSession(activeSourceSession)
      })
    }
    if (activeSourceSession) {
      // AI modified: close owns cancellation of the current open operation, including one whose promise is still pending.
      return this.#closeSourceSession(activeSourceSession)
    }
    return pendingSourceCleanup
      ? this.#closeSourceSession(pendingSourceCleanup)
      : undefined
  }

  #releaseFailedSourceSession(
    activeSourceSession: ActiveSourceSession,
    error: GAudioError,
    reject: (error: GAudioError) => void,
  ): void {
    this.cancelActiveSeek()
    try {
      this.pauseWithoutEvent()
    }
    catch {
      // The original media or vendor error remains the actionable load failure.
    }
    try {
      // AI modified: source detachment remains mandatory when the preceding pause operation fails.
      this.#detachActiveSourceUrl()
    }
    catch {
      // The original media or vendor error remains the actionable load failure.
    }
    void this.#closeSourceSession(activeSourceSession).then(() => reject(error))
  }

  #closeSourceSession(activeSourceSession: ActiveSourceSession): Promise<SourceCloseOutcome> {
    if (activeSourceSession.isClosed) {
      return Promise.resolve({ isSuccessful: true })
    }
    if (activeSourceSession.closePromise) {
      return activeSourceSession.closePromise
    }

    let finishClose: (closeOutcome: SourceCloseOutcome) => void = () => {}
    let hasFinishedClose = false
    const closePromise = new Promise<SourceCloseOutcome>((resolve) => {
      finishClose = (closeOutcome): void => {
        if (hasFinishedClose) {
          return
        }
        hasFinishedClose = true
        activeSourceSession.closePromise = undefined
        if (closeOutcome.isSuccessful) {
          activeSourceSession.isClosed = true
          if (this.#pendingSourceCleanup === activeSourceSession) {
            this.#pendingSourceCleanup = undefined
          }
        }
        else {
          // AI modified: failed cleanup retains source ownership so a later load, unload, or dispose can retry it.
          this.#pendingSourceCleanup = activeSourceSession
        }
        resolve(closeOutcome)
      }
    })
    activeSourceSession.closePromise = closePromise
    this.#pendingSourceCleanup = activeSourceSession
    try {
      const sourceClose = activeSourceSession.source.close()
      void sourceClose.then(
        () => {
          finishClose({ isSuccessful: true })
        },
        (error) => {
          finishClose({ isSuccessful: false, error })
        },
      )
    }
    catch (error) {
      finishClose({ isSuccessful: false, error })
    }
    return closePromise
  }

  #waitForLoadOperation<OperationResult>(
    operation: Promise<OperationResult>,
    loadAbortController: AbortController,
  ): Promise<OperationResult> {
    return new Promise<OperationResult>((resolve, reject) => {
      let hasFinishedWait = false
      let handleAbort = (): void => {}
      const finishWait = (
        hasOperationResult: boolean,
        operationResult: OperationResult | undefined,
        error?: unknown,
      ): void => {
        if (hasFinishedWait) {
          return
        }
        hasFinishedWait = true
        loadAbortController.signal.removeEventListener('abort', handleAbort)
        if (hasOperationResult) {
          resolve(operationResult as OperationResult)
        }
        else {
          reject(error)
        }
      }
      handleAbort = (): void => finishWait(false, undefined, this.#loadAbortedError())
      loadAbortController.signal.addEventListener('abort', handleAbort, { once: true })
      if (loadAbortController.signal.aborted) {
        handleAbort()
      }
      void operation.then(
        operationResult => finishWait(true, operationResult),
        error => finishWait(false, undefined, error),
      )
    })
  }

  #waitForPlaybackOperation(startPlayback: () => Promise<void>): Promise<void> {
    const playAbortController = new AbortController()
    const playbackIntentId = ++this.#playbackIntentId
    this.#requestedMediaPlayback = 'play'
    this.#activePlayAbortControllers.add(playAbortController)
    let playback: Promise<void>
    try {
      playback = startPlayback()
    }
    catch (error) {
      this.#activePlayAbortControllers.delete(playAbortController)
      if (playbackIntentId === this.#playbackIntentId) {
        this.#requestedMediaPlayback = 'pause'
      }
      return Promise.reject(error)
    }

    const completion = new Promise<void>((resolve, reject) => {
      let hasFinishedWait = false
      let handleAbort = (): void => {}
      const finishWait = (isSuccessful: boolean, error?: unknown): void => {
        if (hasFinishedWait) {
          return
        }
        hasFinishedWait = true
        playAbortController.signal.removeEventListener('abort', handleAbort)
        if (isSuccessful) {
          resolve()
        }
        else {
          reject(error)
        }
      }
      handleAbort = (): void => finishWait(
        false,
        this.#isDisposed
          ? this.#disposedError()
          : new GAudioError('LOAD_ABORTED', 'Audio playback was interrupted by a newer media operation'),
      )
      playAbortController.signal.addEventListener('abort', handleAbort, { once: true })
      if (playAbortController.signal.aborted) {
        handleAbort()
      }
      void playback.then(
        () => {
          if (playAbortController.signal.aborted && this.#requestedMediaPlayback === 'pause') {
            // AI modified: a cancelled browser promise cannot restart media after its lifecycle call has settled.
            this.#enforceCancelledPlaybackPause()
          }
          finishWait(true)
        },
        (error) => {
          if (playbackIntentId === this.#playbackIntentId) {
            this.#requestedMediaPlayback = 'pause'
          }
          finishWait(false, error)
        },
      )
    })

    return completion.finally(() => {
      this.#activePlayAbortControllers.delete(playAbortController)
    })
  }

  #enforceCancelledPlaybackPause(): void {
    const playbackIntentId = this.#playbackIntentId
    try {
      this.pauseWithoutEvent()
    }
    catch (cause) {
      if (
        this.#playbackIntentId !== playbackIntentId + 1
        || this.#requestedMediaPlayback !== 'pause'
      ) {
        return
      }

      // AI modified: late asynchronous pause failures use the error channel because the cancelling call already returned.
      const failedPauseIntentId = this.#playbackIntentId
      this.events.emit(
        'error',
        new GAudioError(
          'ENGINE_ERROR',
          'Cancelled audio playback could not be paused',
          cause,
        ),
      )
      if (
        this.#playbackIntentId !== failedPauseIntentId
        || this.#requestedMediaPlayback !== 'pause'
      ) {
        return
      }

      try {
        // AI modified: retry once so a transient custom-element pause failure cannot leave cancelled playback audible.
        this.pauseWithoutEvent()
      }
      catch {
        // The first failure already owns the fatal boundary; repeated custom-element failures stay contained.
      }
    }
  }

  #cancelActivePlayRequests(): void {
    this.#playbackIntentId += 1
    this.#requestedMediaPlayback = 'pause'
    for (const playAbortController of this.#activePlayAbortControllers) {
      playAbortController.abort()
    }
    this.#activePlayAbortControllers.clear()
  }

  /** Pauses the element while suppressing the corresponding engine pause event. */
  protected pauseWithoutEvent(): void {
    this.#cancelActivePlayRequests()
    if (!this.audioElement.paused) {
      this.#shouldSuppressPause = true
    }
    this.audioElement.pause()
  }

  async #seekMediaElement(targetTime: number, startSeek: (targetTime: number) => void): Promise<void> {
    this.cancelActiveSeek()

    await new Promise<void>((resolve, reject) => {
      const abortController = new AbortController()
      const activeSeekRequest: ActiveSeekRequest = {
        abortController,
        eventStartTime: new Event('gaudio-seek').timeStamp,
        loadGeneration: this.#loadGeneration,
        reject,
      }
      this.#activeSeekRequest = activeSeekRequest
      const finish = (event?: Event): void => {
        if (!this.#isCurrentSeekCompletion(event, activeSeekRequest)) {
          // AI modified: a queued completion from the superseded native seek cannot settle its replacement.
          return
        }
        this.#activeSeekRequest = undefined
        abortController.abort()
        resolve()
      }
      const fail = (): void => {
        if (this.#activeSeekRequest !== activeSeekRequest) {
          return
        }
        if (this.#isDetachedMediaError()) {
          // AI modified: a queued detached-source error cannot fail a seek owned by the current source.
          return
        }
        this.#activeSeekRequest = undefined
        abortController.abort()
        // AI modified: the seek promise reuses the exact error already published by the permanent listener.
        reject(activeSeekRequest.publishedError ?? mediaElementError(this.audioElement))
      }

      try {
        this.audioElement.addEventListener('seeked', finish, {
          // AI modified: a stale seeked event may be ignored, so the listener remains until current native completion.
          signal: abortController.signal,
        })
        if (this.#activeSeekRequest !== activeSeekRequest) {
          // AI modified: listener registration reentrancy cannot continue a superseded seek.
          return
        }
        this.audioElement.addEventListener('error', fail, {
          // AI modified: ignoring a detached error must keep the current seek's error listener active.
          signal: abortController.signal,
        })
        if (this.#activeSeekRequest !== activeSeekRequest) {
          return
        }
      }
      catch (error) {
        if (this.#activeSeekRequest === activeSeekRequest) {
          this.#activeSeekRequest = undefined
        }
        // AI modified: partial listener setup is always aborted before its seek promise rejects.
        abortController.abort()
        reject(error)
        return
      }

      try {
        // AI modified: seek promises now resolve after browser seek completion when one is reported.
        startSeek(targetTime)
      }
      catch (error) {
        if (this.#activeSeekRequest !== activeSeekRequest) {
          // AI modified: a reentrant seek owns its request even when the superseded starter later throws.
          abortController.abort()
          return
        }
        this.#activeSeekRequest = undefined
        abortController.abort()
        reject(error)
        return
      }
      if (!this.audioElement.seeking) {
        finish()
      }
    })
  }

  /** Rejects and releases the currently pending seek operation, when present. */
  protected cancelActiveSeek(): void {
    this.#observedNativeSeek = undefined
    const activeSeekRequest = this.#activeSeekRequest
    if (!activeSeekRequest) {
      return
    }

    // AI modified: a newer seek or unload explicitly rejects the superseded seek instead of resolving both together.
    this.#activeSeekRequest = undefined
    activeSeekRequest.abortController.abort()
    activeSeekRequest.reject(new GAudioError('LOAD_ABORTED', 'Audio seek was superseded by a newer operation'))
  }

  #timeUpdate(): { currentTime: number, duration: number } {
    return {
      currentTime: this.getCurrentTime(),
      duration: this.getDuration(),
    }
  }

  #isCurrentSeekCompletion(event: Event | undefined, activeSeekRequest: ActiveSeekRequest): boolean {
    return this.#activeSeekRequest === activeSeekRequest
      && activeSeekRequest.loadGeneration === this.#loadGeneration
      && !this.audioElement.seeking
      && (event === undefined || this.isMediaEventCurrent(event, activeSeekRequest.eventStartTime))
  }

  #isCurrentMediaLifecycleEvent(event: Event): boolean {
    const activeSourceSession = this.#activeSourceSession
    if (!activeSourceSession) {
      return this.#hasAttachedSource && this.hasMediaMetadata()
    }

    return activeSourceSession.attachedUrl !== undefined
      && this.isSourceMetadataCurrent(
        event,
        activeSourceSession.attachedUrl,
        activeSourceSession.metadataEventStartTime,
      )
  }

  #loadAbortedError(): GAudioError {
    return new GAudioError('LOAD_ABORTED', 'Audio load was superseded by a newer source')
  }

  #disposedError(): GAudioError {
    return new GAudioError('ENGINE_ERROR', 'MediaElementAudioEngine has been disposed')
  }

  #assertUsable(): void {
    if (this.#isDisposed) {
      throw this.#disposedError()
    }
  }

  #mediaAudioContext(): AudioContext {
    if (this.#audioContext) {
      return this.#audioContext
    }

    const AudioContextClass = this.#audioContextClass()
    if (!AudioContextClass) {
      throw new GAudioError('ENGINE_ERROR', 'Web Audio analysis is unavailable in this browser')
    }

    this.#audioContext = new AudioContextClass()
    return this.#audioContext
  }

  #mediaSourceNode(audioContext: AudioContext): MediaElementAudioSourceNode {
    if (!this.#mediaElementSource) {
      // AI modified: reuse the single media element source allowed by the Web Audio API.
      this.#mediaElementSource = audioContext.createMediaElementSource(this.audioElement)
    }

    if (!this.#isMediaElementSourceAudible) {
      this.#mediaElementSource.connect(audioContext.destination)
      this.#isMediaElementSourceAudible = true
    }

    return this.#mediaElementSource
  }

  #audioContextClass(): AudioContextConstructor | undefined {
    const webAudioGlobal = globalThis as typeof globalThis & WebAudioGlobal

    return webAudioGlobal.AudioContext ?? webAudioGlobal.webkitAudioContext
  }

  #closeAudioAnalysis(): Promise<SourceCloseOutcome> | undefined {
    const mediaElementSource = this.#mediaElementSource
    this.#mediaElementSource = undefined
    this.#isMediaElementSourceAudible = false
    try {
      mediaElementSource?.disconnect()
    }
    catch {
      // AI modified: a failed graph disconnection cannot retain or prevent closing the owned AudioContext.
    }

    const audioContext = this.#audioContext ?? this.#pendingAudioContextCleanup
    this.#audioContext = undefined
    if (!audioContext) {
      return undefined
    }
    if (audioContext.state === 'closed') {
      this.#pendingAudioContextCleanup = undefined
      return Promise.resolve({ isSuccessful: true })
    }
    if (this.#audioContextClosePromise) {
      return this.#audioContextClosePromise
    }

    this.#pendingAudioContextCleanup = audioContext
    let finishClose: (closeOutcome: SourceCloseOutcome) => void = () => {}
    let hasFinishedClose = false
    const closePromise = new Promise<SourceCloseOutcome>((resolve) => {
      finishClose = (closeOutcome): void => {
        if (hasFinishedClose) {
          return
        }
        hasFinishedClose = true
        this.#audioContextClosePromise = undefined
        if (closeOutcome.isSuccessful && this.#pendingAudioContextCleanup === audioContext) {
          this.#pendingAudioContextCleanup = undefined
        }
        resolve(closeOutcome)
      }
    })
    this.#audioContextClosePromise = closePromise
    try {
      const contextClose = audioContext.close()
      void contextClose.then(
        () => {
          finishClose({ isSuccessful: true })
        },
        (error) => {
          finishClose({ isSuccessful: false, error })
        },
      )
    }
    catch (error) {
      finishClose({ isSuccessful: false, error })
    }
    return closePromise
  }

  readonly #handleLoadStart = (): void => {
    this.events.emit('loadstart', undefined)
  }

  readonly #handleLoadedMetadata = (event: Event): void => {
    if (!this.#isCurrentMediaLifecycleEvent(event)) {
      // AI modified: a detached source's queued metadata cannot leak through the permanent event channel.
      return
    }
    this.events.emit('loadedmetadata', { duration: this.getDuration() })
  }

  readonly #handleCanPlay = (): void => {
    if (this.audioElement.readyState >= 3) {
      // AI modified: a queued canplay event cannot claim readiness after the element returned to HAVE_NOTHING.
      this.events.emit('canplay', undefined)
    }
  }

  readonly #handlePlay = (): void => {
    if (!this.audioElement.paused) {
      // AI modified: a queued play event cannot revive a source that is currently paused.
      this.events.emit('play', undefined)
    }
  }

  readonly #handlePlaying = (): void => {
    if (!this.audioElement.paused) {
      // AI modified: native autoplay also clears suppression retained by an older source task.
      this.#shouldSuppressPause = false
      // AI modified: queued playing events cannot revive playback after a synchronous pause or stop.
      this.events.emit('playing', undefined)
    }
  }

  readonly #handlePause = (): void => {
    if (this.#shouldSuppressPause) {
      this.#shouldSuppressPause = false
      return
    }
    if (this.audioElement.paused) {
      // AI modified: queued pause events cannot override playback that has already resumed.
      this.events.emit('pause', undefined)
    }
  }

  readonly #handleWaiting = (): void => {
    if (!this.audioElement.paused && !this.audioElement.ended) {
      // AI modified: queued waiting events cannot report buffering after pause, stop, or completion.
      this.events.emit('waiting', undefined)
    }
  }

  readonly #handleSeeking = (event: Event): void => {
    const activeSeekRequest = this.#activeSeekRequest
    const isCurrentApiSeek = activeSeekRequest !== undefined
      && activeSeekRequest.loadGeneration === this.#loadGeneration
      && this.isMediaEventCurrent(event, activeSeekRequest.eventStartTime)
    if (
      this.audioElement.seeking
      && (isCurrentApiSeek || this.#isCurrentMediaLifecycleEvent(event))
    ) {
      this.#observedNativeSeek = {
        eventStartTime: event.timeStamp,
        loadGeneration: this.#loadGeneration,
      }
      // AI modified: queued seeking events cannot describe a native seek that has already completed.
      this.events.emit('seeking', this.#timeUpdate())
    }
  }

  readonly #handleSeeked = (event: Event): void => {
    const activeSeekRequest = this.#activeSeekRequest
    const observedNativeSeek = this.#observedNativeSeek
    const isCurrentApiSeek = activeSeekRequest !== undefined
      && this.#isCurrentSeekCompletion(event, activeSeekRequest)
    const isCurrentNativeSeek = observedNativeSeek !== undefined
      && observedNativeSeek.loadGeneration === this.#loadGeneration
      && !this.audioElement.seeking
      && this.isMediaEventCurrent(event, observedNativeSeek.eventStartTime)
    if (isCurrentApiSeek || isCurrentNativeSeek) {
      this.#observedNativeSeek = undefined
      // AI modified: publish completion only for an active request or a native seek observed by this engine.
      this.events.emit('seeked', this.#timeUpdate())
    }
  }

  readonly #handleTimeUpdate = (): void => {
    this.events.emit('timeupdate', this.#timeUpdate())
  }

  readonly #handleDurationChange = (): void => {
    this.events.emit('durationchange', { duration: this.getDuration() })
  }

  readonly #handleProgress = (): void => {
    this.events.emit('bufferupdate', { ranges: this.getBufferedRanges() })
  }

  readonly #handleVolumeChange = (): void => {
    this.events.emit('volumechange', {
      volume: this.getVolume(),
      isMuted: this.isMuted(),
    })
  }

  readonly #handleRateChange = (): void => {
    this.events.emit('ratechange', { playbackRate: this.getPlaybackRate() })
  }

  readonly #handleEnded = (): void => {
    if (this.audioElement.ended) {
      // AI modified: queued ended events cannot advance consumers after the media timeline was reset.
      this.events.emit('ended', undefined)
    }
  }

  readonly #handleError = (): void => {
    if (this.#isDetachedMediaError()) {
      return
    }
    if (this.#activeSourceSession?.reject) {
      // AI modified: the load promise owns candidate failures so successful fallbacks do not emit fatal errors.
      return
    }
    const error = mediaElementError(this.audioElement)
    const activeSeekRequest = this.#activeSeekRequest
    if (activeSeekRequest?.loadGeneration === this.#loadGeneration) {
      // AI modified: one canonical media error owns both the event channel and an in-flight seek rejection.
      activeSeekRequest.publishedError = error
    }
    this.events.emit('error', error)
  }

  #isDetachedMediaError(): boolean {
    const mediaError = this.audioElement.error
    // AI modified: suppress only identity-proven old errors; null retains the current-source fallback contract.
    return mediaError !== null && this.#detachedMediaErrors.has(mediaError)
  }
}
