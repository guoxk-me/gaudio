import type { AdaptivePlaybackInfo, AdaptiveVariant } from '../adapters/adaptive-audio-types'
import type { AudioEngine, AudioEngineEvents } from '../engine/audio-engine'
import type { AudioFormatSupport, PreloadMode, TimeRange } from '../engine/audio-engine-types'
import type { GAudioError } from '../errors/errors'
import type { AudioSource } from '../source/audio-source'
import { EventEmitter } from '../events/event-emitter'

// AI modified: shared fake engine keeps player and router contract tests aligned.
export class FakeAudioEngine implements AudioEngine {
  private readonly events = new EventEmitter<AudioEngineEvents>()
  private readonly mimeTypeSupport: Readonly<Record<string, AudioFormatSupport>>

  readonly loadedSources: AudioSource[] = []
  readonly bufferedRanges: TimeRange[] = [{ start: 0, end: 30 }]
  readonly seekableRanges: TimeRange[] = [{ start: 0, end: 120 }]
  readonly playedRanges: TimeRange[] = [{ start: 5, end: 25 }]
  readonly fastSeekCalls: number[] = []
  readonly adaptiveVariants: AdaptiveVariant[] = []

  currentTime = 0
  duration = 120
  preload: PreloadMode = 'metadata'
  autoplay = false
  muted = false
  looping = false
  preservesPitch = true
  seeking = false
  ended = false
  isPlaying = false
  isUnloaded = false
  unloadCalls = 0
  playCalls = 0
  disposeCalls = 0
  playError?: GAudioError
  volume = 1
  playbackRate = 1
  adaptiveQualitySelection = 'auto'
  activeAdaptivePlayback?: AdaptivePlaybackInfo

  constructor(options: {
    mimeTypeSupport?: Readonly<Record<string, AudioFormatSupport>>
  } = {}) {
    this.mimeTypeSupport = options.mimeTypeSupport ?? { 'audio/mpeg': 'probably' }
  }

  async load(source: AudioSource): Promise<void> {
    this.loadedSources.push(source)
    this.isUnloaded = false
  }

  unload(): void {
    this.unloadCalls += 1
    this.isUnloaded = true
    this.isPlaying = false
  }

  async play(): Promise<void> {
    this.playCalls += 1
    if (this.playError) {
      throw this.playError
    }
    this.isPlaying = true
  }

  pause(): void {
    this.isPlaying = false
  }

  stop(): void {
    this.currentTime = 0
    this.isPlaying = false
  }

  async seek(seconds: number): Promise<void> {
    this.currentTime = seconds
  }

  async fastSeek(seconds: number): Promise<void> {
    this.fastSeekCalls.push(seconds)
    this.currentTime = seconds
  }

  setPreload(preload: PreloadMode): void {
    this.preload = preload
  }

  getPreload(): PreloadMode {
    return this.preload
  }

  setAutoplay(shouldAutoplay: boolean): void {
    this.autoplay = shouldAutoplay
  }

  getAutoplay(): boolean {
    return this.autoplay
  }

  setVolume(volume: number): void {
    this.volume = volume
  }

  getVolume(): number {
    return this.volume
  }

  setMuted(isMuted: boolean): void {
    this.muted = isMuted
  }

  isMuted(): boolean {
    return this.muted
  }

  setLoop(isLooping: boolean): void {
    this.looping = isLooping
  }

  isLooping(): boolean {
    return this.looping
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = rate
  }

  getPlaybackRate(): number {
    return this.playbackRate
  }

  setPreservesPitch(shouldPreservePitch: boolean): void {
    this.preservesPitch = shouldPreservePitch
  }

  getPreservesPitch(): boolean {
    return this.preservesPitch
  }

  getCurrentTime(): number {
    return this.currentTime
  }

  getDuration(): number {
    return this.duration
  }

  isPaused(): boolean {
    return !this.isPlaying
  }

  isEnded(): boolean {
    return this.ended
  }

  isSeeking(): boolean {
    return this.seeking
  }

  getBufferedRanges(): readonly TimeRange[] {
    return this.bufferedRanges
  }

  getSeekableRanges(): readonly TimeRange[] {
    return this.seekableRanges
  }

  getPlayedRanges(): readonly TimeRange[] {
    return this.playedRanges
  }

  canPlayType(mimeType: string): AudioFormatSupport {
    return this.mimeTypeSupport[mimeType] ?? ''
  }

  getAdaptiveVariants(): readonly AdaptiveVariant[] {
    return this.adaptiveVariants
  }

  getAdaptiveQualitySelection(): string {
    return this.adaptiveQualitySelection
  }

  async setAdaptiveQuality(variantId: 'auto' | string): Promise<void> {
    this.adaptiveQualitySelection = variantId
  }

  getActiveAdaptivePlayback(): AdaptivePlaybackInfo | undefined {
    return this.activeAdaptivePlayback
  }

  on<EventName extends keyof AudioEngineEvents>(
    eventName: EventName,
    handler: (payload: AudioEngineEvents[EventName]) => void,
  ): () => void {
    return this.events.on(eventName, handler)
  }

  emit<EventName extends keyof AudioEngineEvents>(
    eventName: EventName,
    payload: AudioEngineEvents[EventName],
  ): void {
    this.events.emit(eventName, payload)
  }

  dispose(): void {
    this.disposeCalls += 1
    this.events.clear()
  }
}
