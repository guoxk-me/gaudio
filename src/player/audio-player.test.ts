import type { AudioBackend, AudioBackendEvents } from '../backend/audio-backend'
import type { AudioSource } from '../source/audio-source'
import { describe, expect, it } from 'vitest'
import { EventEmitter } from '../events/event-emitter'
import { AudioPlayer } from './audio-player'

class FakeAudioBackend implements AudioBackend {
  private readonly events = new EventEmitter<AudioBackendEvents>()
  private currentTime = 0
  private duration = 120
  readonly loadedSources: AudioSource[] = []
  isPlaying = false
  volume = 1
  playbackRate = 1

  async load(source: AudioSource): Promise<void> {
    this.loadedSources.push(source)
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

  setVolume(volume: number): void {
    this.volume = volume
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = rate
  }

  getCurrentTime(): number {
    return this.currentTime
  }

  getDuration(): number {
    return this.duration
  }

  on<EventName extends keyof AudioBackendEvents>(
    eventName: EventName,
    handler: (payload: AudioBackendEvents[EventName]) => void,
  ): () => void {
    return this.events.on(eventName, handler)
  }

  dispose(): void {
    this.events.clear()
  }
}

describe('audioPlayer', () => {
  it('loads a URL source and reports ready state', async () => {
    const backend = new FakeAudioBackend()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, backend)
    const states: string[] = []

    player.on('statechange', (state) => {
      states.push(state)
    })

    await player.load()

    expect(backend.loadedSources).toHaveLength(1)
    expect(player.getState()).toBe('ready')
    expect(states).toEqual(['loading', 'ready'])
  })

  it('loads automatically before first play', async () => {
    const backend = new FakeAudioBackend()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, backend)

    await player.play()

    expect(backend.loadedSources).toHaveLength(1)
    expect(backend.isPlaying).toBe(true)
    expect(player.getState()).toBe('playing')
  })

  it('throws a typed error when no source is available', async () => {
    const backend = new FakeAudioBackend()
    const player = new AudioPlayer({}, backend)

    await expect(player.load()).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
    })
    expect(player.getState()).toBe('error')
  })
})
