// @env browser

import type { AudioAnalyzerOptions } from '../analysis/audio-analyzer'
import type { AudioSource } from '../source/audio-source'
import type { AudioEngine, AudioEngineEvents } from './audio-engine'
import type {
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
  hasOpenCompleted: boolean
  abortController?: AbortController
  reject?: (error: GAudioError) => void
}

type AudioContextConstructor = typeof AudioContext

interface WebAudioGlobal {
  AudioContext?: AudioContextConstructor
  webkitAudioContext?: AudioContextConstructor
}

/** {@link AudioEngine} implementation backed by an [HTMLAudioElement](https://developer.mozilla.org/docs/Web/API/HTMLAudioElement). */
export class MediaElementAudioEngine implements AudioEngine {
  /** Media element used for native loading and playback. */
  protected readonly audioElement: HTMLAudioElement
  /** Event channel used to publish browser media lifecycle updates. */
  protected readonly events = new EventEmitter<AudioEngineEvents>()
  private activeSourceSession?: ActiveSourceSession
  private audioContext?: AudioContext
  private mediaElementSource?: MediaElementAudioSourceNode
  private isMediaElementSourceAudible = false
  private shouldSuppressPause = false

  /**
   * Creates a media-element engine.
   *
   * @param audioElement Element to control. A new `Audio` element is created by default.
   */
  constructor(audioElement: HTMLAudioElement = new Audio()) {
    this.audioElement = audioElement
    this.addMediaEventListeners()
  }

  /**
   * Opens and loads a source until metadata is available.
   *
   * @param source Source to attach to the media element.
   * @throws {@link GAudioError} When loading fails or is superseded by another load.
   */
  async load(source: AudioSource): Promise<void> {
    this.cancelActiveSourceSession()

    const activeSourceSession: ActiveSourceSession = {
      source,
      isClosed: false,
      hasOpenCompleted: false,
    }
    this.activeSourceSession = activeSourceSession

    let streamHandle
    try {
      streamHandle = await source.open()
      activeSourceSession.hasOpenCompleted = true
    }
    catch (error) {
      if (this.activeSourceSession === activeSourceSession) {
        // AI modified: failed source opens must not leave stale sessions or leaked source resources.
        this.activeSourceSession = undefined
        this.closeSourceSession(activeSourceSession)
      }
      throw error
    }

    if (this.activeSourceSession !== activeSourceSession) {
      this.closeSourceSession(activeSourceSession)
      throw this.loadAbortedError()
    }

    this.attachSourceUrl(streamHandle.url)

    await new Promise<void>((resolve, reject) => {
      const abortController = new AbortController()
      activeSourceSession.abortController = abortController
      activeSourceSession.reject = reject

      const handleReady = (): void => {
        abortController.abort()
        activeSourceSession.abortController = undefined
        activeSourceSession.reject = undefined
        resolve()
      }

      const handleLoadError = (): void => {
        const error = mediaElementError(this.audioElement)
        abortController.abort()
        activeSourceSession.abortController = undefined
        activeSourceSession.reject = undefined
        reject(error)
      }

      this.audioElement.addEventListener('loadedmetadata', handleReady, {
        once: true,
        signal: abortController.signal,
      })
      this.audioElement.addEventListener('error', handleLoadError, {
        once: true,
        signal: abortController.signal,
      })
    })
  }

  /** Cancels loading, pauses playback, and detaches the current source. */
  unload(): void {
    this.cancelActiveSourceSession()
    this.pauseWithoutEvent()
    this.detachSourceUrl()
  }

  /**
   * Starts or resumes playback.
   *
   * @throws {@link GAudioError} With code `PLAYBACK_BLOCKED` when the browser rejects playback.
   */
  async play(): Promise<void> {
    try {
      await this.audioElement.play()
      // AI modified: Web Audio analysis contexts may need the same user gesture as media playback.
      await this.audioContext?.resume()
    }
    catch (error) {
      throw new GAudioError('PLAYBACK_BLOCKED', 'Browser blocked audio playback', error)
    }
  }

  /** Pauses playback without changing the current position. */
  pause(): void {
    this.audioElement.pause()
  }

  /** Pauses playback and returns to `0` seconds while retaining the source. */
  stop(): void {
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
    await this.seekMediaElement(Math.max(0, seconds), (targetTime) => {
      this.audioElement.currentTime = targetTime
    })
  }

  /**
   * Uses native fast seeking when available and otherwise falls back to {@link seek}.
   *
   * @param seconds Target position in seconds.
   */
  async fastSeek(seconds: number): Promise<void> {
    // AI modified: prefer optimized browser seeking while retaining a standard seek fallback.
    if (typeof this.audioElement.fastSeek === 'function') {
      await this.seekMediaElement(Math.max(0, seconds), targetTime => this.audioElement.fastSeek?.(targetTime))
      return
    }
    await this.seek(seconds)
  }

  /** @param preload Browser preload hint applied to the media element. */
  setPreload(preload: PreloadMode): void {
    this.audioElement.preload = preload
  }

  /** @returns The normalized browser preload hint. */
  getPreload(): PreloadMode {
    const preload = this.audioElement.preload
    return preload === 'none' || preload === 'auto' ? preload : 'metadata'
  }

  /** @param shouldAutoplay Whether the media element should use native autoplay. */
  setAutoplay(shouldAutoplay: boolean): void {
    this.audioElement.autoplay = shouldAutoplay
  }

  /** @returns Whether native media-element autoplay is enabled. */
  getAutoplay(): boolean {
    return this.audioElement.autoplay
  }

  /** @param volume Linear volume clamped to the `0` through `1` range. */
  setVolume(volume: number): void {
    this.audioElement.volume = Math.min(1, Math.max(0, volume))
  }

  /** @returns Linear output volume between `0` and `1`. */
  getVolume(): number {
    return this.audioElement.volume
  }

  /** @param isMuted Whether audio output should be muted. */
  setMuted(isMuted: boolean): void {
    this.audioElement.muted = isMuted
  }

  /** @returns Whether audio output is muted. */
  isMuted(): boolean {
    return this.audioElement.muted
  }

  /** @param isLooping Whether playback should restart after reaching the end. */
  setLoop(isLooping: boolean): void {
    this.audioElement.loop = isLooping
  }

  /** @returns Whether playback looping is enabled. */
  isLooping(): boolean {
    return this.audioElement.loop
  }

  /** @param rate Playback speed multiplier, clamped to at least `0.25`. */
  setPlaybackRate(rate: number): void {
    this.audioElement.playbackRate = Math.max(0.25, rate)
  }

  /** @returns The effective playback speed multiplier. */
  getPlaybackRate(): number {
    return this.audioElement.playbackRate
  }

  /** @param shouldPreservePitch Whether pitch should remain stable at non-default playback rates. */
  setPreservesPitch(shouldPreservePitch: boolean): void {
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
    const audioContext = this.mediaAudioContext()
    const mediaElementSource = this.mediaSourceNode(audioContext)

    return new AudioAnalyzer(audioContext, mediaElementSource, options.fftSize)
  }

  /**
   * Registers an engine event listener.
   *
   * @param eventName Event to observe.
   * @param handler Listener invoked with the event payload.
   * @returns A function that removes this listener.
   */
  on<EventName extends keyof AudioEngineEvents>(
    eventName: EventName,
    handler: (payload: AudioEngineEvents[EventName]) => void,
  ): () => void {
    return this.events.on(eventName, handler)
  }

  /** Removes browser listeners, unloads the source, and clears engine listeners. */
  dispose(): void {
    this.removeMediaEventListeners()
    this.unload()
    this.closeAudioAnalysis()
    this.events.clear()
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
    this.audioElement.removeAttribute('src')
    this.audioElement.load()
  }

  /**
   * Rejects the current load from a vendor-specific fatal error path.
   *
   * @param error Error used to reject the pending load.
   */
  protected rejectActiveLoad(error: GAudioError): void {
    const activeSourceSession = this.activeSourceSession
    if (!activeSourceSession?.reject) {
      return
    }

    // AI modified: vendor engines report fatal failures outside the media element error channel.
    this.activeSourceSession = undefined
    activeSourceSession.abortController?.abort()
    const reject = activeSourceSession.reject
    activeSourceSession.abortController = undefined
    activeSourceSession.reject = undefined
    this.closeSourceSession(activeSourceSession)
    reject(error)
  }

  private addMediaEventListeners(): void {
    this.audioElement.addEventListener('loadstart', this.handleLoadStart)
    this.audioElement.addEventListener('loadedmetadata', this.handleLoadedMetadata)
    this.audioElement.addEventListener('canplay', this.handleCanPlay)
    this.audioElement.addEventListener('play', this.handlePlay)
    this.audioElement.addEventListener('playing', this.handlePlaying)
    this.audioElement.addEventListener('pause', this.handlePause)
    this.audioElement.addEventListener('waiting', this.handleWaiting)
    this.audioElement.addEventListener('seeking', this.handleSeeking)
    this.audioElement.addEventListener('seeked', this.handleSeeked)
    this.audioElement.addEventListener('timeupdate', this.handleTimeUpdate)
    this.audioElement.addEventListener('durationchange', this.handleDurationChange)
    this.audioElement.addEventListener('progress', this.handleProgress)
    this.audioElement.addEventListener('volumechange', this.handleVolumeChange)
    this.audioElement.addEventListener('ratechange', this.handleRateChange)
    this.audioElement.addEventListener('ended', this.handleEnded)
    this.audioElement.addEventListener('error', this.handleError)
  }

  private removeMediaEventListeners(): void {
    this.audioElement.removeEventListener('loadstart', this.handleLoadStart)
    this.audioElement.removeEventListener('loadedmetadata', this.handleLoadedMetadata)
    this.audioElement.removeEventListener('canplay', this.handleCanPlay)
    this.audioElement.removeEventListener('play', this.handlePlay)
    this.audioElement.removeEventListener('playing', this.handlePlaying)
    this.audioElement.removeEventListener('pause', this.handlePause)
    this.audioElement.removeEventListener('waiting', this.handleWaiting)
    this.audioElement.removeEventListener('seeking', this.handleSeeking)
    this.audioElement.removeEventListener('seeked', this.handleSeeked)
    this.audioElement.removeEventListener('timeupdate', this.handleTimeUpdate)
    this.audioElement.removeEventListener('durationchange', this.handleDurationChange)
    this.audioElement.removeEventListener('progress', this.handleProgress)
    this.audioElement.removeEventListener('volumechange', this.handleVolumeChange)
    this.audioElement.removeEventListener('ratechange', this.handleRateChange)
    this.audioElement.removeEventListener('ended', this.handleEnded)
    this.audioElement.removeEventListener('error', this.handleError)
  }

  private cancelActiveSourceSession(): void {
    const activeSourceSession = this.activeSourceSession
    if (!activeSourceSession) {
      return
    }

    this.activeSourceSession = undefined
    activeSourceSession.abortController?.abort()
    activeSourceSession.reject?.(this.loadAbortedError())
    activeSourceSession.abortController = undefined
    activeSourceSession.reject = undefined
    if (activeSourceSession.hasOpenCompleted) {
      this.closeSourceSession(activeSourceSession)
    }
  }

  private closeSourceSession(activeSourceSession: ActiveSourceSession): void {
    if (activeSourceSession.isClosed) {
      return
    }

    // AI modified: cancelled pending opens are closed after open() completes so allocated resources are released once.
    activeSourceSession.isClosed = true
    void activeSourceSession.source.close()
  }

  private pauseWithoutEvent(): void {
    if (!this.audioElement.paused) {
      this.shouldSuppressPause = true
    }
    this.audioElement.pause()
  }

  private async seekMediaElement(targetTime: number, startSeek: (targetTime: number) => void): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const abortController = new AbortController()
      const finish = (): void => {
        abortController.abort()
        resolve()
      }
      const fail = (): void => {
        abortController.abort()
        reject(mediaElementError(this.audioElement))
      }

      this.audioElement.addEventListener('seeked', finish, {
        once: true,
        signal: abortController.signal,
      })
      this.audioElement.addEventListener('error', fail, {
        once: true,
        signal: abortController.signal,
      })

      try {
        // AI modified: seek promises now resolve after browser seek completion when one is reported.
        startSeek(targetTime)
      }
      catch (error) {
        abortController.abort()
        reject(error)
        return
      }
      if (!this.audioElement.seeking) {
        finish()
      }
    })
  }

  private timeUpdate(): { currentTime: number, duration: number } {
    return {
      currentTime: this.getCurrentTime(),
      duration: this.getDuration(),
    }
  }

  private loadAbortedError(): GAudioError {
    return new GAudioError('LOAD_ABORTED', 'Audio load was superseded by a newer source')
  }

  private mediaAudioContext(): AudioContext {
    if (this.audioContext) {
      return this.audioContext
    }

    const AudioContextClass = this.audioContextClass()
    if (!AudioContextClass) {
      throw new GAudioError('ENGINE_ERROR', 'Web Audio analysis is unavailable in this browser')
    }

    this.audioContext = new AudioContextClass()
    return this.audioContext
  }

  private mediaSourceNode(audioContext: AudioContext): MediaElementAudioSourceNode {
    if (!this.mediaElementSource) {
      // AI modified: reuse the single media element source allowed by the Web Audio API.
      this.mediaElementSource = audioContext.createMediaElementSource(this.audioElement)
    }

    if (!this.isMediaElementSourceAudible) {
      this.mediaElementSource.connect(audioContext.destination)
      this.isMediaElementSourceAudible = true
    }

    return this.mediaElementSource
  }

  private audioContextClass(): AudioContextConstructor | undefined {
    const webAudioGlobal = globalThis as typeof globalThis & WebAudioGlobal

    return webAudioGlobal.AudioContext ?? webAudioGlobal.webkitAudioContext
  }

  private closeAudioAnalysis(): void {
    this.mediaElementSource?.disconnect()
    this.mediaElementSource = undefined
    this.isMediaElementSourceAudible = false

    if (this.audioContext && this.audioContext.state !== 'closed') {
      // AI modified: disposal is synchronous, so close the owned AudioContext without delaying engine teardown.
      void this.audioContext.close()
    }
    this.audioContext = undefined
  }

  private readonly handleLoadStart = (): void => {
    this.events.emit('loadstart', undefined)
  }

  private readonly handleLoadedMetadata = (): void => {
    this.events.emit('loadedmetadata', { duration: this.getDuration() })
  }

  private readonly handleCanPlay = (): void => {
    this.events.emit('canplay', undefined)
  }

  private readonly handlePlay = (): void => {
    this.events.emit('play', undefined)
  }

  private readonly handlePlaying = (): void => {
    this.events.emit('playing', undefined)
  }

  private readonly handlePause = (): void => {
    if (this.shouldSuppressPause) {
      this.shouldSuppressPause = false
      return
    }
    this.events.emit('pause', undefined)
  }

  private readonly handleWaiting = (): void => {
    this.events.emit('waiting', undefined)
  }

  private readonly handleSeeking = (): void => {
    this.events.emit('seeking', this.timeUpdate())
  }

  private readonly handleSeeked = (): void => {
    this.events.emit('seeked', this.timeUpdate())
  }

  private readonly handleTimeUpdate = (): void => {
    this.events.emit('timeupdate', this.timeUpdate())
  }

  private readonly handleDurationChange = (): void => {
    this.events.emit('durationchange', { duration: this.getDuration() })
  }

  private readonly handleProgress = (): void => {
    this.events.emit('bufferupdate', { ranges: this.getBufferedRanges() })
  }

  private readonly handleVolumeChange = (): void => {
    this.events.emit('volumechange', {
      volume: this.getVolume(),
      isMuted: this.isMuted(),
    })
  }

  private readonly handleRateChange = (): void => {
    this.events.emit('ratechange', { playbackRate: this.getPlaybackRate() })
  }

  private readonly handleEnded = (): void => {
    this.events.emit('ended', undefined)
  }

  private readonly handleError = (): void => {
    this.events.emit('error', mediaElementError(this.audioElement))
  }
}
