// @env browser

import type { AdaptiveAudioProtocol } from '../adapters/adaptive-audio-types'
import type { AudioProtocol, AudioSource } from '../source/audio-source'
import type { AudioEngine, AudioEngineEvents } from './audio-engine'
import type { AudioEngineAdapter } from './audio-engine-adapter'
import type { AudioFormatSupport, PreloadMode, TimeRange } from './audio-engine-types'
import { GAudioError } from '../errors/errors'
import { EventEmitter } from '../events/event-emitter'
import { resolveAudioProtocol } from '../source/audio-protocol'
import { audioEngineEventNames } from './audio-engine'
import { MediaElementAudioEngine } from './media-element-audio-engine'

interface AudioEngineRouterOptions {
  adapters?: readonly AudioEngineAdapter[]
  mediaEngineFactory?: () => AudioEngine
}

interface MediaSettings {
  preload: PreloadMode
  autoplay: boolean
  volume: number
  isMuted: boolean
  isLooping: boolean
  playbackRate: number
  preservesPitch: boolean
}

const adapterOwners = new WeakMap<AudioEngineAdapter, AudioEngineRouter>()

export class AudioEngineRouter implements AudioEngine {
  private readonly adapters = new Map<AdaptiveAudioProtocol, AudioEngineAdapter>()
  private readonly events = new EventEmitter<AudioEngineEvents>()
  private readonly mediaEngineFactory: () => AudioEngine
  private readonly settings: MediaSettings = {
    preload: 'metadata',
    autoplay: false,
    volume: 1,
    isMuted: false,
    isLooping: false,
    playbackRate: 1,
    preservesPitch: true,
  }

  private activeEngine?: AudioEngine
  private activeProtocol?: AudioProtocol
  private engineGeneration = 0
  private removeEngineListeners: Array<() => void> = []

  constructor(options: AudioEngineRouterOptions = {}) {
    this.mediaEngineFactory = options.mediaEngineFactory ?? (() => new MediaElementAudioEngine())
    const adapters = options.adapters ?? []
    const protocols = new Set<AdaptiveAudioProtocol>()

    for (const adapter of adapters) {
      if (protocols.has(adapter.protocol)) {
        throw new TypeError(`Only one ${adapter.protocol} adapter can be registered`)
      }
      if (adapterOwners.has(adapter)) {
        throw new TypeError(`The ${adapter.protocol} adapter is already registered with another player`)
      }
      protocols.add(adapter.protocol)
    }

    for (const adapter of adapters) {
      adapterOwners.set(adapter, this)
      this.adapters.set(adapter.protocol, adapter)
    }
  }

  async load(source: AudioSource): Promise<void> {
    const protocol = resolveAudioProtocol(source)
    const engine = this.engineForProtocol(protocol)
    await engine.load(source)
  }

  unload(): void {
    this.activeEngine?.unload()
  }

  async play(): Promise<void> {
    await this.requireActiveEngine().play()
  }

  pause(): void {
    this.activeEngine?.pause()
  }

  stop(): void {
    this.activeEngine?.stop()
  }

  async seek(seconds: number): Promise<void> {
    await this.requireActiveEngine().seek(seconds)
  }

  async fastSeek(seconds: number): Promise<void> {
    await this.requireActiveEngine().fastSeek(seconds)
  }

  setPreload(preload: PreloadMode): void {
    this.settings.preload = preload
    this.activeEngine?.setPreload(preload)
  }

  getPreload(): PreloadMode {
    return this.activeEngine?.getPreload() ?? this.settings.preload
  }

  setAutoplay(shouldAutoplay: boolean): void {
    this.settings.autoplay = shouldAutoplay
    this.activeEngine?.setAutoplay(shouldAutoplay)
  }

  getAutoplay(): boolean {
    return this.activeEngine?.getAutoplay() ?? this.settings.autoplay
  }

  setVolume(volume: number): void {
    this.settings.volume = volume
    this.activeEngine?.setVolume(volume)
  }

  getVolume(): number {
    return this.activeEngine?.getVolume() ?? this.settings.volume
  }

  setMuted(isMuted: boolean): void {
    this.settings.isMuted = isMuted
    this.activeEngine?.setMuted(isMuted)
  }

  isMuted(): boolean {
    return this.activeEngine?.isMuted() ?? this.settings.isMuted
  }

  setLoop(isLooping: boolean): void {
    this.settings.isLooping = isLooping
    this.activeEngine?.setLoop(isLooping)
  }

  isLooping(): boolean {
    return this.activeEngine?.isLooping() ?? this.settings.isLooping
  }

  setPlaybackRate(rate: number): void {
    this.settings.playbackRate = rate
    this.activeEngine?.setPlaybackRate(rate)
  }

  getPlaybackRate(): number {
    return this.activeEngine?.getPlaybackRate() ?? this.settings.playbackRate
  }

  setPreservesPitch(shouldPreservePitch: boolean): void {
    this.settings.preservesPitch = shouldPreservePitch
    this.activeEngine?.setPreservesPitch(shouldPreservePitch)
  }

  getPreservesPitch(): boolean {
    return this.activeEngine?.getPreservesPitch() ?? this.settings.preservesPitch
  }

  getCurrentTime(): number {
    return this.activeEngine?.getCurrentTime() ?? 0
  }

  getDuration(): number {
    return this.activeEngine?.getDuration() ?? 0
  }

  isPaused(): boolean {
    return this.activeEngine?.isPaused() ?? true
  }

  isEnded(): boolean {
    return this.activeEngine?.isEnded() ?? false
  }

  isSeeking(): boolean {
    return this.activeEngine?.isSeeking() ?? false
  }

  getBufferedRanges(): readonly TimeRange[] {
    return this.activeEngine?.getBufferedRanges() ?? []
  }

  getSeekableRanges(): readonly TimeRange[] {
    return this.activeEngine?.getSeekableRanges() ?? []
  }

  getPlayedRanges(): readonly TimeRange[] {
    return this.activeEngine?.getPlayedRanges() ?? []
  }

  canPlayType(mimeType: string): AudioFormatSupport {
    return this.activeEngine?.canPlayType(mimeType) ?? ''
  }

  on<EventName extends keyof AudioEngineEvents>(
    eventName: EventName,
    handler: (payload: AudioEngineEvents[EventName]) => void,
  ): () => void {
    return this.events.on(eventName, handler)
  }

  dispose(): void {
    this.engineGeneration += 1
    this.removeActiveEngineListeners()
    this.activeEngine?.dispose()
    this.activeEngine = undefined
    this.activeProtocol = undefined
    for (const adapter of this.adapters.values()) {
      adapterOwners.delete(adapter)
    }
    this.events.clear()
  }

  private engineForProtocol(protocol: AudioProtocol): AudioEngine {
    if (this.activeEngine && this.activeProtocol === protocol) {
      return this.activeEngine
    }

    let engine: AudioEngine
    if (protocol === 'media') {
      engine = this.mediaEngineFactory()
    }
    else {
      const adapter = this.adapters.get(protocol)
      if (!adapter) {
        throw new GAudioError('ADAPTER_UNAVAILABLE', `No ${protocol.toUpperCase()} adapter is registered`)
      }
      if (!adapter.isSupported()) {
        throw new GAudioError('PROTOCOL_UNSUPPORTED', `${protocol.toUpperCase()} playback is not supported in this browser`)
      }
      engine = adapter.createEngine()
    }

    this.replaceActiveEngine(engine, protocol)
    return engine
  }

  private replaceActiveEngine(engine: AudioEngine, protocol: AudioProtocol): void {
    // AI modified: advance the generation before disposal so late vendor events cannot reach the player.
    this.engineGeneration += 1
    this.removeActiveEngineListeners()
    this.activeEngine?.dispose()
    this.activeEngine = engine
    this.activeProtocol = protocol
    this.applySettings(engine)
    this.bindActiveEngineEvents(engine, this.engineGeneration)
  }

  private applySettings(engine: AudioEngine): void {
    engine.setPreload(this.settings.preload)
    engine.setAutoplay(this.settings.autoplay)
    engine.setVolume(this.settings.volume)
    engine.setMuted(this.settings.isMuted)
    engine.setLoop(this.settings.isLooping)
    engine.setPlaybackRate(this.settings.playbackRate)
    engine.setPreservesPitch(this.settings.preservesPitch)
  }

  private bindActiveEngineEvents(engine: AudioEngine, generation: number): void {
    const forward = <EventName extends keyof AudioEngineEvents>(eventName: EventName): void => {
      const removeListener = engine.on(eventName, (payload) => {
        if (generation === this.engineGeneration) {
          this.events.emit(eventName, payload)
        }
      })
      this.removeEngineListeners.push(removeListener)
    }

    for (const eventName of audioEngineEventNames) {
      forward(eventName)
    }
  }

  private removeActiveEngineListeners(): void {
    for (const removeListener of this.removeEngineListeners) {
      removeListener()
    }
    this.removeEngineListeners = []
  }

  private requireActiveEngine(): AudioEngine {
    if (!this.activeEngine) {
      throw new GAudioError('SOURCE_UNAVAILABLE', 'Audio source is required before playback')
    }
    return this.activeEngine
  }
}
