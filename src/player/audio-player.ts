import type { AudioEngine } from '../engine/audio-engine'
import type { AudioSource } from '../source/audio-source'
import type {
  AudioFormatSupport,
  AudioPlayerEvents,
  AudioPlayerOptions,
  PlaybackState,
  PreloadMode,
  TimeRange,
} from '../types'
import { MediaElementAudioEngine } from '../engine/media-element-audio-engine'
import { GAudioError } from '../errors/errors'
import { EventEmitter } from '../events/event-emitter'
import { HttpAudioSource } from '../source/http-audio-source'

export class AudioPlayer {
  private readonly events = new EventEmitter<AudioPlayerEvents>()
  private readonly engine: AudioEngine
  private source?: AudioSource
  private state: PlaybackState = 'idle'
  private loadRequestId = 0
  private hasLoadedSource = false
  private shouldAutoplay: boolean

  constructor(options: AudioPlayerOptions = {}, engine: AudioEngine = new MediaElementAudioEngine()) {
    this.engine = engine
    this.source = options.source ? new HttpAudioSource(options.source) : undefined
    this.shouldAutoplay = options.autoplay ?? false

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

  getState(): PlaybackState {
    return this.state
  }

  getCurrentTime(): number {
    return this.engine.getCurrentTime()
  }

  getDuration(): number {
    return this.engine.getDuration()
  }

  getPreload(): PreloadMode {
    return this.engine.getPreload()
  }

  setPreload(preload: PreloadMode): void {
    this.engine.setPreload(preload)
  }

  getAutoplay(): boolean {
    return this.shouldAutoplay
  }

  setAutoplay(shouldAutoplay: boolean): void {
    // AI modified: player-managed autoplay keeps browser policy failures observable through load().
    this.shouldAutoplay = shouldAutoplay
  }

  getVolume(): number {
    return this.engine.getVolume()
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      throw new RangeError('Volume must be a finite number between 0 and 1')
    }
    this.engine.setVolume(volume)
  }

  isMuted(): boolean {
    return this.engine.isMuted()
  }

  setMuted(isMuted: boolean): void {
    this.engine.setMuted(isMuted)
  }

  isLooping(): boolean {
    return this.engine.isLooping()
  }

  setLoop(isLooping: boolean): void {
    this.engine.setLoop(isLooping)
  }

  getPlaybackRate(): number {
    return this.engine.getPlaybackRate()
  }

  setPlaybackRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new RangeError('Playback rate must be a finite number greater than 0')
    }
    this.engine.setPlaybackRate(rate)
  }

  getPreservesPitch(): boolean {
    return this.engine.getPreservesPitch()
  }

  setPreservesPitch(shouldPreservePitch: boolean): void {
    this.engine.setPreservesPitch(shouldPreservePitch)
  }

  isPaused(): boolean {
    return this.engine.isPaused()
  }

  isEnded(): boolean {
    return this.engine.isEnded()
  }

  isSeeking(): boolean {
    return this.engine.isSeeking()
  }

  getBufferedRanges(): readonly TimeRange[] {
    return this.engine.getBufferedRanges()
  }

  getSeekableRanges(): readonly TimeRange[] {
    return this.engine.getSeekableRanges()
  }

  getPlayedRanges(): readonly TimeRange[] {
    return this.engine.getPlayedRanges()
  }

  canPlayType(mimeType: string): AudioFormatSupport {
    return this.engine.canPlayType(mimeType)
  }

  setSource(source: string | AudioSource): void {
    this.loadRequestId += 1
    this.engine.unload()
    this.source = typeof source === 'string' ? new HttpAudioSource(source) : source
    this.hasLoadedSource = false
    this.setState('idle')
  }

  async load(): Promise<void> {
    if (!this.source) {
      const error = new GAudioError('SOURCE_UNAVAILABLE', 'Audio source is required before loading')
      this.publishError(error)
      throw error
    }

    const loadRequestId = ++this.loadRequestId
    this.hasLoadedSource = false
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
      this.setState('ready')
      if (this.shouldAutoplay) {
        // AI modified: explicit playback surfaces autoplay rejection and preserves the loaded source.
        await this.play()
      }
    }
  }

  async play(): Promise<void> {
    if (this.state === 'idle') {
      await this.load()
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

  pause(): void {
    this.engine.pause()
  }

  stop(): void {
    this.engine.stop()
    // AI modified: ready means a source is loaded and can resume without another load.
    this.setState(this.hasLoadedSource ? 'ready' : 'idle')
  }

  async seek(seconds: number): Promise<void> {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError('Seek position must be a finite number greater than or equal to 0')
    }
    await this.engine.seek(seconds)
  }

  async fastSeek(seconds: number): Promise<void> {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError('Fast seek position must be a finite number greater than or equal to 0')
    }
    await this.engine.fastSeek(seconds)
  }

  on<EventName extends keyof AudioPlayerEvents>(
    eventName: EventName,
    handler: (payload: AudioPlayerEvents[EventName]) => void,
  ): () => void {
    return this.events.on(eventName, handler)
  }

  dispose(): void {
    this.loadRequestId += 1
    this.engine.dispose()
    this.events.clear()
    this.source = undefined
    this.hasLoadedSource = false
    this.state = 'idle'
  }

  private connectEngineEvents(): void {
    this.engine.on('loadstart', payload => this.events.emit('loadstart', payload))
    this.engine.on('loadedmetadata', payload => this.events.emit('loadedmetadata', payload))
    this.engine.on('canplay', payload => this.events.emit('canplay', payload))
    this.engine.on('play', payload => this.events.emit('play', payload))

    this.engine.on('playing', (payload) => {
      this.setState('playing')
      this.events.emit('playing', payload)
    })

    this.engine.on('pause', (payload) => {
      this.setState('paused')
      this.events.emit('pause', payload)
    })

    this.engine.on('waiting', (payload) => {
      this.setState('buffering')
      this.events.emit('waiting', payload)
    })

    this.engine.on('seeking', payload => this.events.emit('seeking', payload))
    this.engine.on('seeked', payload => this.events.emit('seeked', payload))
    this.engine.on('timeupdate', payload => this.events.emit('timeupdate', payload))
    this.engine.on('durationchange', payload => this.events.emit('durationchange', payload))
    this.engine.on('bufferupdate', payload => this.events.emit('bufferupdate', payload))
    this.engine.on('volumechange', payload => this.events.emit('volumechange', payload))
    this.engine.on('ratechange', payload => this.events.emit('ratechange', payload))

    this.engine.on('ended', (payload) => {
      this.setState('ended')
      this.events.emit('ended', payload)
    })

    this.engine.on('error', error => this.publishError(error))
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
