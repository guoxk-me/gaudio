import type { AudioSource } from '../source/audio-source'
import type { AudioFormatSupport, PreloadMode, TimeRange } from '../types'
import type { AudioEngine, AudioEngineEvents } from './audio-engine'
import type { AudioEngineAdapter } from './audio-engine-adapter'
import { describe, expect, it } from 'vitest'
import { EventEmitter } from '../events/event-emitter'
import { HttpAudioSource } from '../source/http-audio-source'
import { AudioEngineRouter } from './audio-engine-router'

class FakeAudioEngine implements AudioEngine {
  private readonly events = new EventEmitter<AudioEngineEvents>()
  readonly loadedSources: AudioSource[] = []
  disposeCalls = 0
  unloadCalls = 0
  volume = 1
  playbackRate = 1
  preload: PreloadMode = 'metadata'
  autoplay = false
  muted = false
  looping = false
  preservesPitch = true
  currentTime = 0

  async load(source: AudioSource): Promise<void> {
    this.loadedSources.push(source)
  }

  unload(): void {
    this.unloadCalls += 1
  }

  async play(): Promise<void> {}
  pause(): void {}
  stop(): void {}

  async seek(seconds: number): Promise<void> {
    this.currentTime = seconds
  }

  async fastSeek(seconds: number): Promise<void> {
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
    return 120
  }

  isPaused(): boolean {
    return true
  }

  isEnded(): boolean {
    return false
  }

  isSeeking(): boolean {
    return false
  }

  getBufferedRanges(): readonly TimeRange[] {
    return []
  }

  getSeekableRanges(): readonly TimeRange[] {
    return []
  }

  getPlayedRanges(): readonly TimeRange[] {
    return []
  }

  canPlayType(_mimeType: string): AudioFormatSupport {
    return ''
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
  }
}

class FakeAdapter implements AudioEngineAdapter {
  createCalls = 0

  constructor(
    readonly protocol: 'hls' | 'dash',
    private readonly engine: FakeAudioEngine,
    private readonly supported = true,
  ) {}

  createEngine(): AudioEngine {
    this.createCalls += 1
    return this.engine
  }

  isSupported(): boolean {
    return this.supported
  }
}

describe('audioEngineRouter', () => {
  it('routes adaptive and ordinary sources to matching engines', async () => {
    const mediaEngine = new FakeAudioEngine()
    const hlsEngine = new FakeAudioEngine()
    const dashEngine = new FakeAudioEngine()
    const hlsAdapter = new FakeAdapter('hls', hlsEngine)
    const dashAdapter = new FakeAdapter('dash', dashEngine)
    const router = new AudioEngineRouter({
      adapters: [hlsAdapter, dashAdapter],
      mediaEngineFactory: () => mediaEngine,
    })

    await router.load(new HttpAudioSource('/stream.m3u8'))
    expect(hlsAdapter.createCalls).toBe(1)
    expect(hlsEngine.loadedSources).toHaveLength(1)

    await router.load(new HttpAudioSource('/stream.mpd'))
    expect(dashAdapter.createCalls).toBe(1)
    expect(dashEngine.loadedSources).toHaveLength(1)

    await router.load(new HttpAudioSource('/episode.mp3'))
    expect(mediaEngine.loadedSources).toHaveLength(1)
  })

  it('transfers media settings before loading a replacement engine', async () => {
    const hlsEngine = new FakeAudioEngine()
    const dashEngine = new FakeAudioEngine()
    const router = new AudioEngineRouter({
      adapters: [new FakeAdapter('hls', hlsEngine), new FakeAdapter('dash', dashEngine)],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })

    router.setPreload('auto')
    router.setVolume(0.4)
    router.setMuted(true)
    router.setLoop(true)
    router.setPlaybackRate(1.5)
    router.setPreservesPitch(false)
    await router.load(new HttpAudioSource('/stream.m3u8'))
    await router.load(new HttpAudioSource('/stream.mpd'))

    expect(dashEngine.preload).toBe('auto')
    expect(dashEngine.volume).toBe(0.4)
    expect(dashEngine.muted).toBe(true)
    expect(dashEngine.looping).toBe(true)
    expect(dashEngine.playbackRate).toBe(1.5)
    expect(dashEngine.preservesPitch).toBe(false)
    expect(hlsEngine.disposeCalls).toBe(1)
  })

  it('fails clearly when a selected adapter is missing or unsupported', async () => {
    const missingRouter = new AudioEngineRouter({
      adapters: [],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })
    const unsupportedRouter = new AudioEngineRouter({
      adapters: [new FakeAdapter('dash', new FakeAudioEngine(), false)],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })

    await expect(missingRouter.load(new HttpAudioSource('/stream.m3u8'))).rejects.toMatchObject({
      code: 'ADAPTER_UNAVAILABLE',
    })
    await expect(unsupportedRouter.load(new HttpAudioSource('/stream.mpd'))).rejects.toMatchObject({
      code: 'PROTOCOL_UNSUPPORTED',
    })
  })

  it('rejects duplicate protocols and concurrent adapter ownership', async () => {
    const sharedAdapter = new FakeAdapter('hls', new FakeAudioEngine())

    expect(() => new AudioEngineRouter({
      adapters: [sharedAdapter, new FakeAdapter('hls', new FakeAudioEngine())],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })).toThrow(TypeError)

    const firstRouter = new AudioEngineRouter({
      adapters: [sharedAdapter],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })
    expect(() => new AudioEngineRouter({
      adapters: [sharedAdapter],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })).toThrow(TypeError)

    firstRouter.dispose()

    expect(() => new AudioEngineRouter({
      adapters: [sharedAdapter],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })).not.toThrow()
  })

  it('forwards only events from the active engine', async () => {
    const hlsEngine = new FakeAudioEngine()
    const dashEngine = new FakeAudioEngine()
    const router = new AudioEngineRouter({
      adapters: [new FakeAdapter('hls', hlsEngine), new FakeAdapter('dash', dashEngine)],
      mediaEngineFactory: () => new FakeAudioEngine(),
    })
    const durations: number[] = []
    router.on('durationchange', ({ duration }) => durations.push(duration))

    await router.load(new HttpAudioSource('/stream.m3u8'))
    hlsEngine.emit('durationchange', { duration: 10 })
    await router.load(new HttpAudioSource('/stream.mpd'))
    hlsEngine.emit('durationchange', { duration: 20 })
    dashEngine.emit('durationchange', { duration: 30 })

    expect(durations).toEqual([10, 30])
  })
})
