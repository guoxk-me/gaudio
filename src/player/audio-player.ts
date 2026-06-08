import type { AudioBackend } from '../backend/audio-backend'
import type { AudioSource } from '../source/audio-source'
import type { AudioPlayerEvents, AudioPlayerOptions, PlaybackState } from '../types'
import { MediaElementBackend } from '../backend/media-element-backend'
import { GAudioError } from '../errors/errors'
import { EventEmitter } from '../events/event-emitter'
import { HttpAudioSource } from '../source/http-audio-source'

export class AudioPlayer {
  private readonly events = new EventEmitter<AudioPlayerEvents>()
  private readonly backend: AudioBackend
  private source?: AudioSource
  private state: PlaybackState = 'idle'

  constructor(options: AudioPlayerOptions = {}, backend: AudioBackend = new MediaElementBackend()) {
    this.backend = backend
    this.source = options.source ? new HttpAudioSource(options.source) : undefined

    // AI modified: keep player state and public events stable across backend implementations.
    this.backend.on('timeupdate', (timeUpdate) => {
      this.events.emit('timeupdate', timeUpdate)
    })

    this.backend.on('bufferupdate', (bufferUpdate) => {
      this.events.emit('bufferupdate', bufferUpdate)
    })

    this.backend.on('ended', () => {
      this.setState('ended')
      this.events.emit('ended', undefined)
    })

    this.backend.on('error', (error) => {
      this.setState('error')
      this.events.emit('error', error)
    })
  }

  getState(): PlaybackState {
    return this.state
  }

  getCurrentTime(): number {
    return this.backend.getCurrentTime()
  }

  getDuration(): number {
    return this.backend.getDuration()
  }

  setSource(source: string | AudioSource): void {
    this.source = typeof source === 'string' ? new HttpAudioSource(source) : source
    this.setState('idle')
  }

  async load(): Promise<void> {
    if (!this.source) {
      const error = new GAudioError('SOURCE_UNAVAILABLE', 'Audio source is required before loading')
      this.setState('error')
      this.events.emit('error', error)
      throw error
    }

    this.setState('loading')
    await this.backend.load(this.source)
    this.setState('ready')
  }

  async play(): Promise<void> {
    if (this.state === 'idle') {
      await this.load()
    }

    await this.backend.play()
    this.setState('playing')
  }

  pause(): void {
    this.backend.pause()
    this.setState('paused')
  }

  stop(): void {
    this.backend.stop()
    this.setState('idle')
  }

  async seek(seconds: number): Promise<void> {
    await this.backend.seek(seconds)
  }

  setVolume(volume: number): void {
    this.backend.setVolume(volume)
  }

  setPlaybackRate(rate: number): void {
    this.backend.setPlaybackRate(rate)
  }

  on<EventName extends keyof AudioPlayerEvents>(
    eventName: EventName,
    handler: (payload: AudioPlayerEvents[EventName]) => void,
  ): () => void {
    return this.events.on(eventName, handler)
  }

  dispose(): void {
    this.backend.dispose()
    this.events.clear()
    this.source = undefined
    this.state = 'idle'
  }

  private setState(state: PlaybackState): void {
    if (this.state === state) {
      return
    }

    this.state = state
    this.events.emit('statechange', state)
  }
}
