// @env browser

import type { AudioSource } from '../source/audio-source'
import type { AudioBackend, AudioBackendEvents } from './audio-backend'
import { GAudioError } from '../errors/errors'
import { EventEmitter } from '../events/event-emitter'

export class MediaElementBackend implements AudioBackend {
  private readonly audioElement: HTMLAudioElement
  private readonly events = new EventEmitter<AudioBackendEvents>()
  private activeSource?: AudioSource

  constructor(audioElement: HTMLAudioElement = new Audio()) {
    this.audioElement = audioElement
    this.audioElement.addEventListener('timeupdate', this.handleTimeUpdate)
    this.audioElement.addEventListener('progress', this.handleProgress)
    this.audioElement.addEventListener('ended', this.handleEnded)
    this.audioElement.addEventListener('error', this.handleError)
  }

  async load(source: AudioSource): Promise<void> {
    this.activeSource = source
    const streamHandle = await source.open()

    this.audioElement.src = streamHandle.url
    this.audioElement.load()

    await new Promise<void>((resolve, reject) => {
      const abortController = new AbortController()

      const handleReady = (): void => {
        abortController.abort()
        resolve()
      }

      const handleError = (): void => {
        abortController.abort()
        reject(new GAudioError('SOURCE_UNAVAILABLE', 'Audio source could not be loaded'))
      }

      this.audioElement.addEventListener('loadedmetadata', handleReady, { once: true, signal: abortController.signal })
      this.audioElement.addEventListener('error', handleError, { once: true, signal: abortController.signal })
    })
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
    this.audioElement.pause()
    this.audioElement.currentTime = 0
  }

  async seek(seconds: number): Promise<void> {
    this.audioElement.currentTime = Math.max(0, seconds)
  }

  setVolume(volume: number): void {
    this.audioElement.volume = Math.min(1, Math.max(0, volume))
  }

  setPlaybackRate(rate: number): void {
    this.audioElement.playbackRate = Math.max(0.25, rate)
  }

  getCurrentTime(): number {
    return this.audioElement.currentTime
  }

  getDuration(): number {
    return Number.isFinite(this.audioElement.duration) ? this.audioElement.duration : 0
  }

  on<EventName extends keyof AudioBackendEvents>(
    eventName: EventName,
    handler: (payload: AudioBackendEvents[EventName]) => void,
  ): () => void {
    return this.events.on(eventName, handler)
  }

  dispose(): void {
    this.audioElement.pause()
    this.audioElement.removeAttribute('src')
    this.audioElement.load()
    this.audioElement.removeEventListener('timeupdate', this.handleTimeUpdate)
    this.audioElement.removeEventListener('progress', this.handleProgress)
    this.audioElement.removeEventListener('ended', this.handleEnded)
    this.audioElement.removeEventListener('error', this.handleError)
    this.events.clear()
    void this.activeSource?.close()
    this.activeSource = undefined
  }

  private readonly handleTimeUpdate = (): void => {
    this.events.emit('timeupdate', {
      currentTime: this.getCurrentTime(),
      duration: this.getDuration(),
    })
  }

  private readonly handleProgress = (): void => {
    const buffered = this.audioElement.buffered

    if (buffered.length === 0) {
      return
    }

    this.events.emit('bufferupdate', {
      bufferedStart: buffered.start(0),
      bufferedEnd: buffered.end(buffered.length - 1),
    })
  }

  private readonly handleEnded = (): void => {
    this.events.emit('ended', undefined)
  }

  private readonly handleError = (): void => {
    this.events.emit('error', new GAudioError('BACKEND_ERROR', 'Audio element reported a playback error'))
  }
}
