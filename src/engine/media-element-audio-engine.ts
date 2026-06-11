// @env browser

import type { AudioSource } from '../source/audio-source'
import type {
  AudioFormatSupport,
  GAudioErrorCode,
  PreloadMode,
  TimeRange,
} from '../types'
import type { AudioEngine, AudioEngineEvents } from './audio-engine'
import { GAudioError } from '../errors/errors'
import { EventEmitter } from '../events/event-emitter'

interface ActiveLoad {
  source: AudioSource
  isClosed: boolean
  abortController?: AbortController
  reject?: (error: GAudioError) => void
}

export class MediaElementAudioEngine implements AudioEngine {
  protected readonly audioElement: HTMLAudioElement
  protected readonly events = new EventEmitter<AudioEngineEvents>()
  private activeLoad?: ActiveLoad
  private activeSource?: AudioSource
  private shouldSuppressPause = false

  constructor(audioElement: HTMLAudioElement = new Audio()) {
    this.audioElement = audioElement
    this.addMediaEventListeners()
  }

  async load(source: AudioSource): Promise<void> {
    this.cancelActiveLoad()

    const activeLoad: ActiveLoad = {
      source,
      isClosed: false,
    }
    this.activeLoad = activeLoad
    this.activeSource = source

    const streamHandle = await source.open()

    if (this.activeLoad !== activeLoad) {
      throw this.loadAbortedError()
    }

    this.attachSourceUrl(streamHandle.url)

    await new Promise<void>((resolve, reject) => {
      const abortController = new AbortController()
      activeLoad.abortController = abortController
      activeLoad.reject = reject

      const handleReady = (): void => {
        abortController.abort()
        activeLoad.abortController = undefined
        activeLoad.reject = undefined
        resolve()
      }

      const handleLoadError = (): void => {
        const error = this.mediaElementError()
        abortController.abort()
        activeLoad.abortController = undefined
        activeLoad.reject = undefined
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

  unload(): void {
    this.cancelActiveLoad()
    this.pauseWithoutEvent()
    this.detachSourceUrl()
    this.activeSource = undefined
  }

  async play(): Promise<void> {
    try {
      await this.audioElement.play()
    }
    catch (error) {
      throw new GAudioError('PLAYBACK_BLOCKED', 'Browser blocked audio playback', error)
    }
  }

  pause(): void {
    this.audioElement.pause()
  }

  stop(): void {
    // AI modified: suppress the native pause event because stop has a distinct ready state.
    this.pauseWithoutEvent()
    this.audioElement.currentTime = 0
  }

  async seek(seconds: number): Promise<void> {
    this.audioElement.currentTime = Math.max(0, seconds)
  }

  async fastSeek(seconds: number): Promise<void> {
    // AI modified: prefer optimized browser seeking while retaining a standard seek fallback.
    if (typeof this.audioElement.fastSeek === 'function') {
      this.audioElement.fastSeek(seconds)
      return
    }
    await this.seek(seconds)
  }

  setPreload(preload: PreloadMode): void {
    this.audioElement.preload = preload
  }

  getPreload(): PreloadMode {
    const preload = this.audioElement.preload
    return preload === 'none' || preload === 'auto' ? preload : 'metadata'
  }

  setAutoplay(shouldAutoplay: boolean): void {
    this.audioElement.autoplay = shouldAutoplay
  }

  getAutoplay(): boolean {
    return this.audioElement.autoplay
  }

  setVolume(volume: number): void {
    this.audioElement.volume = Math.min(1, Math.max(0, volume))
  }

  getVolume(): number {
    return this.audioElement.volume
  }

  setMuted(isMuted: boolean): void {
    this.audioElement.muted = isMuted
  }

  isMuted(): boolean {
    return this.audioElement.muted
  }

  setLoop(isLooping: boolean): void {
    this.audioElement.loop = isLooping
  }

  isLooping(): boolean {
    return this.audioElement.loop
  }

  setPlaybackRate(rate: number): void {
    this.audioElement.playbackRate = Math.max(0.25, rate)
  }

  getPlaybackRate(): number {
    return this.audioElement.playbackRate
  }

  setPreservesPitch(shouldPreservePitch: boolean): void {
    this.audioElement.preservesPitch = shouldPreservePitch
  }

  getPreservesPitch(): boolean {
    return this.audioElement.preservesPitch
  }

  getCurrentTime(): number {
    return this.audioElement.currentTime
  }

  getDuration(): number {
    return Number.isFinite(this.audioElement.duration) ? this.audioElement.duration : 0
  }

  isPaused(): boolean {
    return this.audioElement.paused
  }

  isEnded(): boolean {
    return this.audioElement.ended
  }

  isSeeking(): boolean {
    return this.audioElement.seeking
  }

  getBufferedRanges(): readonly TimeRange[] {
    return this.timeRanges(this.audioElement.buffered)
  }

  getSeekableRanges(): readonly TimeRange[] {
    return this.timeRanges(this.audioElement.seekable)
  }

  getPlayedRanges(): readonly TimeRange[] {
    return this.timeRanges(this.audioElement.played)
  }

  canPlayType(mimeType: string): AudioFormatSupport {
    return this.audioElement.canPlayType(mimeType)
  }

  on<EventName extends keyof AudioEngineEvents>(
    eventName: EventName,
    handler: (payload: AudioEngineEvents[EventName]) => void,
  ): () => void {
    return this.events.on(eventName, handler)
  }

  dispose(): void {
    this.removeMediaEventListeners()
    this.unload()
    this.events.clear()
  }

  protected attachSourceUrl(url: string): void {
    this.audioElement.src = url
    this.audioElement.load()
  }

  protected detachSourceUrl(): void {
    this.audioElement.removeAttribute('src')
    this.audioElement.load()
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

  private cancelActiveLoad(): void {
    const activeLoad = this.activeLoad
    if (!activeLoad) {
      if (this.activeSource) {
        void this.activeSource.close()
        this.activeSource = undefined
      }
      return
    }

    this.activeLoad = undefined
    activeLoad.abortController?.abort()
    activeLoad.reject?.(this.loadAbortedError())
    activeLoad.abortController = undefined
    activeLoad.reject = undefined
    this.closeLoadSource(activeLoad)

    if (this.activeSource === activeLoad.source) {
      this.activeSource = undefined
    }
  }

  private closeLoadSource(activeLoad: ActiveLoad): void {
    if (activeLoad.isClosed) {
      return
    }

    activeLoad.isClosed = true
    void activeLoad.source.close()
  }

  private pauseWithoutEvent(): void {
    if (!this.audioElement.paused) {
      this.shouldSuppressPause = true
    }
    this.audioElement.pause()
  }

  private timeRanges(timeRanges: TimeRanges): readonly TimeRange[] {
    const ranges: TimeRange[] = []
    for (let index = 0; index < timeRanges.length; index += 1) {
      ranges.push({
        start: timeRanges.start(index),
        end: timeRanges.end(index),
      })
    }
    return ranges
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

  private mediaElementError(): GAudioError {
    const mediaError = this.audioElement.error
    const errorCode: GAudioErrorCode = mediaError ? this.errorCode(mediaError.code) : 'ENGINE_ERROR'
    return new GAudioError(errorCode, mediaError?.message || 'Audio element reported a playback error', mediaError ?? undefined)
  }

  private errorCode(mediaErrorCode: number): GAudioErrorCode {
    switch (mediaErrorCode) {
      case 1:
        return 'LOAD_ABORTED'
      case 2:
        return 'NETWORK_ERROR'
      case 3:
        return 'DECODE_FAILED'
      case 4:
        return 'UNSUPPORTED_FORMAT'
      default:
        return 'ENGINE_ERROR'
    }
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
    this.events.emit('error', this.mediaElementError())
  }
}
