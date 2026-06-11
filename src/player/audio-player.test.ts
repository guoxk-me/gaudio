import type { AudioEngine, AudioEngineEvents } from '../engine/audio-engine'
import type { AudioEngineAdapter } from '../engine/audio-engine-adapter'
import type { AudioSource } from '../source/audio-source'
import type { AudioFormatSupport, PreloadMode, TimeRange } from '../types'
import { describe, expect, it } from 'vitest'
import { GAudioError } from '../errors/errors'
import { EventEmitter } from '../events/event-emitter'
import { AudioPlayer } from './audio-player'

class FakeAudioEngine implements AudioEngine {
  private readonly events = new EventEmitter<AudioEngineEvents>()
  private currentTime = 0
  private duration = 120
  private preload: PreloadMode = 'metadata'
  private autoplay = false
  private muted = false
  private looping = false
  private preservesPitch = true
  private seeking = false
  readonly loadedSources: AudioSource[] = []
  readonly bufferedRanges: TimeRange[] = [{ start: 0, end: 30 }]
  readonly seekableRanges: TimeRange[] = [{ start: 0, end: 120 }]
  readonly playedRanges: TimeRange[] = [{ start: 5, end: 25 }]
  readonly fastSeekCalls: number[] = []
  isPlaying = false
  isUnloaded = false
  playCalls = 0
  playError?: GAudioError
  volume = 1
  playbackRate = 1

  async load(source: AudioSource): Promise<void> {
    this.loadedSources.push(source)
    this.isUnloaded = false
  }

  unload(): void {
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
    return false
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
    return mimeType === 'audio/mpeg' ? 'probably' : ''
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
    this.events.clear()
  }
}

class FakeHlsAdapter implements AudioEngineAdapter {
  readonly protocol = 'hls'
  createCalls = 0

  constructor(private readonly engine: AudioEngine) {}

  createEngine(): AudioEngine {
    this.createCalls += 1
    return this.engine
  }

  isSupported(): boolean {
    return true
  }
}

describe('audioPlayer', () => {
  it('applies media options and exposes engine capabilities', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({
      preload: 'auto',
      autoplay: true,
      muted: true,
      loop: true,
      volume: 0.6,
      playbackRate: 1.5,
      preservesPitch: false,
    }, engine)

    expect(player.getPreload()).toBe('auto')
    expect(player.getAutoplay()).toBe(true)
    expect(player.getVolume()).toBe(0.6)
    expect(player.isMuted()).toBe(true)
    expect(player.isLooping()).toBe(true)
    expect(player.getPlaybackRate()).toBe(1.5)
    expect(player.getPreservesPitch()).toBe(false)
    expect(player.getBufferedRanges()).toEqual([{ start: 0, end: 30 }])
    expect(player.getSeekableRanges()).toEqual([{ start: 0, end: 120 }])
    expect(player.getPlayedRanges()).toEqual([{ start: 5, end: 25 }])
    expect(player.canPlayType('audio/mpeg')).toBe('probably')
  })

  it('updates autoplay and pitch preservation at runtime', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    player.setAutoplay(true)
    player.setPreservesPitch(false)

    expect(player.getAutoplay()).toBe(true)
    expect(player.getPreservesPitch()).toBe(false)
  })

  it('disables engine-native autoplay so player orchestration remains observable', () => {
    const engine = new FakeAudioEngine()
    engine.setAutoplay(true)

    const player = new AudioPlayer({ autoplay: true }, engine)

    expect(player.getAutoplay()).toBe(true)
    expect(engine.getAutoplay()).toBe(false)
  })

  it('fast seeks through the engine', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    await player.fastSeek(24)

    expect(engine.fastSeekCalls).toEqual([24])
    expect(player.getCurrentTime()).toBe(24)
  })

  it('loads a URL source and reports ready state', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const states: string[] = []

    player.on('statechange', (state) => {
      states.push(state)
    })

    await player.load()

    expect(engine.loadedSources).toHaveLength(1)
    expect(player.getState()).toBe('ready')
    expect(states).toEqual(['loading', 'ready'])
  })

  it('routes source descriptions through registered adapters', async () => {
    const engine = new FakeAudioEngine()
    const adapter = new FakeHlsAdapter(engine)
    const player = new AudioPlayer({ adapters: [adapter] })

    player.setSource({
      url: 'https://example.com/stream?id=1',
      protocol: 'hls',
    })
    await player.load()

    expect(adapter.createCalls).toBe(1)
    expect(engine.loadedSources[0]).toMatchObject({
      url: 'https://example.com/stream?id=1',
      protocol: 'hls',
    })
  })

  it('rejects adapters combined with an explicit custom engine', () => {
    const engine = new FakeAudioEngine()
    const adapter = new FakeHlsAdapter(new FakeAudioEngine())

    expect(() => new AudioPlayer({ adapters: [adapter] }, engine)).toThrow(TypeError)
  })

  it('forwards adaptive events and uses the error event for fatal state changes', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    const implementations: string[] = []
    const streamErrors: boolean[] = []

    player.on('adaptivechange', ({ implementation }) => implementations.push(implementation))
    player.on('streamerror', ({ isFatal }) => streamErrors.push(isFatal))

    engine.emit('adaptivechange', { protocol: 'hls', implementation: 'hls.js' })
    engine.emit('streamerror', {
      protocol: 'hls',
      implementation: 'hls.js',
      category: 'segment',
      isFatal: true,
    })

    expect(player.getState()).toBe('idle')

    engine.emit('error', new GAudioError('SEGMENT_ERROR', 'Segment loading failed'))

    expect(implementations).toEqual(['hls.js'])
    expect(streamErrors).toEqual([true])
    expect(player.getState()).toBe('error')
  })

  it('starts playback after loading when autoplay is enabled', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3', autoplay: true }, engine)

    await player.load()

    expect(engine.loadedSources).toHaveLength(1)
    expect(engine.playCalls).toBe(1)
  })

  it('keeps the loaded source available after autoplay is blocked', async () => {
    const engine = new FakeAudioEngine()
    engine.playError = new GAudioError('PLAYBACK_BLOCKED', 'Browser blocked audio playback')
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3', autoplay: true }, engine)
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))

    await expect(player.load()).rejects.toMatchObject({ code: 'PLAYBACK_BLOCKED' })
    expect(player.getState()).toBe('error')
    expect(errors).toHaveLength(1)

    engine.playError = undefined
    await player.play()

    expect(engine.loadedSources).toHaveLength(1)
    expect(engine.playCalls).toBe(2)
  })

  it('rejects invalid numeric controls before mutating the engine', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    expect(() => player.setVolume(Number.NaN)).toThrow(RangeError)
    expect(() => player.setVolume(1.1)).toThrow(RangeError)
    expect(() => player.setPlaybackRate(0)).toThrow(RangeError)
    await expect(player.seek(-1)).rejects.toThrow(RangeError)
    await expect(player.fastSeek(Number.POSITIVE_INFINITY)).rejects.toThrow(RangeError)

    expect(engine.volume).toBe(1)
    expect(engine.playbackRate).toBe(1)
    expect(player.getCurrentTime()).toBe(0)
    expect(engine.fastSeekCalls).toEqual([])
  })

  it('uses engine lifecycle events as the playback state source', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)

    await player.load()
    await player.play()
    expect(player.getState()).toBe('ready')

    engine.emit('playing', undefined)
    expect(player.getState()).toBe('playing')

    engine.emit('waiting', undefined)
    expect(player.getState()).toBe('buffering')

    engine.emit('playing', undefined)
    expect(player.getState()).toBe('playing')

    engine.emit('pause', undefined)
    expect(player.getState()).toBe('paused')
  })

  it('forwards typed lifecycle events', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    const receivedEvents: string[] = []

    player.on('seeking', ({ currentTime }) => receivedEvents.push(`seeking:${currentTime}`))
    player.on('volumechange', ({ volume, isMuted }) => receivedEvents.push(`volume:${volume}:${isMuted}`))
    player.on('ratechange', ({ playbackRate }) => receivedEvents.push(`rate:${playbackRate}`))

    engine.emit('seeking', { currentTime: 12, duration: 120 })
    engine.emit('volumechange', { volume: 0.5, isMuted: true })
    engine.emit('ratechange', { playbackRate: 1.25 })

    expect(receivedEvents).toEqual(['seeking:12', 'volume:0.5:true', 'rate:1.25'])
  })

  it('stops at ready without loading the source again', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)

    await player.load()
    engine.emit('playing', undefined)
    player.stop()
    await player.play()

    expect(player.getState()).toBe('ready')
    expect(engine.loadedSources).toHaveLength(1)
  })

  it('remains idle when stopped before a source is loaded', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)

    player.stop()

    expect(player.getState()).toBe('idle')
  })

  it('unloads the active engine when the source changes', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/first.mp3' }, engine)

    await player.load()
    player.setSource('https://example.com/second.mp3')

    expect(engine.isUnloaded).toBe(true)
    expect(player.getState()).toBe('idle')
  })

  it('throws a typed error when no source is available', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    await expect(player.load()).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
    })
    expect(player.getState()).toBe('error')
  })

  it('does not publish aborted loads as player errors', async () => {
    class AbortingEngine extends FakeAudioEngine {
      override async load(): Promise<void> {
        throw new GAudioError('LOAD_ABORTED', 'Superseded by a newer source')
      }
    }

    const engine = new AbortingEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))

    await expect(player.load()).rejects.toMatchObject({ code: 'LOAD_ABORTED' })

    expect(errors).toEqual([])
    expect(player.getState()).toBe('idle')
  })
})
