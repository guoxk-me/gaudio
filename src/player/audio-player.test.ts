import type { AudioEngine, AudioEngineEvents } from '../engine/audio-engine'
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
  private muted = false
  private looping = false
  private seeking = false
  readonly loadedSources: AudioSource[] = []
  readonly bufferedRanges: TimeRange[] = [{ start: 0, end: 30 }]
  readonly seekableRanges: TimeRange[] = [{ start: 0, end: 120 }]
  isPlaying = false
  isUnloaded = false
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

  setPreload(preload: PreloadMode): void {
    this.preload = preload
  }

  getPreload(): PreloadMode {
    return this.preload
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

describe('audioPlayer', () => {
  it('applies media options and exposes engine capabilities', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({
      preload: 'auto',
      muted: true,
      loop: true,
      volume: 0.6,
      playbackRate: 1.5,
    }, engine)

    expect(player.getPreload()).toBe('auto')
    expect(player.getVolume()).toBe(0.6)
    expect(player.isMuted()).toBe(true)
    expect(player.isLooping()).toBe(true)
    expect(player.getPlaybackRate()).toBe(1.5)
    expect(player.getBufferedRanges()).toEqual([{ start: 0, end: 30 }])
    expect(player.getSeekableRanges()).toEqual([{ start: 0, end: 120 }])
    expect(player.canPlayType('audio/mpeg')).toBe('probably')
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
