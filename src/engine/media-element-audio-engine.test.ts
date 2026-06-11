import type { AudioSource, AudioStreamHandle } from '../source/audio-source'
import type { GAudioErrorCode, TimeRange } from '../types'
import { describe, expect, it } from 'vitest'
import { MediaElementAudioEngine } from './media-element-audio-engine'

class FakeTimeRanges implements TimeRanges {
  constructor(private readonly ranges: readonly TimeRange[]) {}

  get length(): number {
    return this.ranges.length
  }

  start(index: number): number {
    const range = this.ranges[index]
    if (!range) {
      throw new DOMException('Index out of bounds', 'IndexSizeError')
    }
    return range.start
  }

  end(index: number): number {
    const range = this.ranges[index]
    if (!range) {
      throw new DOMException('Index out of bounds', 'IndexSizeError')
    }
    return range.end
  }
}

class FakeAudioElement extends EventTarget {
  src = ''
  preload = ''
  volume = 1
  muted = false
  loop = false
  playbackRate = 1
  currentTime = 0
  duration = 120
  paused = true
  ended = false
  seeking = false
  buffered: TimeRanges = new FakeTimeRanges([])
  seekable: TimeRanges = new FakeTimeRanges([])
  error: MediaError | null = null
  loadCalls = 0

  load(): void {
    this.loadCalls += 1
  }

  async play(): Promise<void> {
    this.paused = false
  }

  pause(): void {
    this.paused = true
  }

  canPlayType(mimeType: string): CanPlayTypeResult {
    return mimeType === 'audio/mpeg' ? 'probably' : ''
  }

  removeAttribute(name: string): void {
    if (name === 'src') {
      this.src = ''
    }
  }
}

class FakeAudioSource implements AudioSource {
  readonly kind = 'url'
  closeCalls = 0

  constructor(private readonly url: string) {}

  async open(): Promise<AudioStreamHandle> {
    return { url: this.url }
  }

  async close(): Promise<void> {
    this.closeCalls += 1
  }
}

function mediaError(code: number): MediaError {
  return { code, message: 'media failed' } as MediaError
}

describe('mediaElementEngine', () => {
  it('exposes media properties and complete time ranges', () => {
    const audioElement = new FakeAudioElement()
    audioElement.buffered = new FakeTimeRanges([{ start: 0, end: 10 }, { start: 20, end: 30 }])
    audioElement.seekable = new FakeTimeRanges([{ start: 0, end: 120 }])
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)

    engine.setPreload('auto')
    engine.setVolume(2)
    engine.setMuted(true)
    engine.setLoop(true)
    engine.setPlaybackRate(0.1)

    expect(engine.getPreload()).toBe('auto')
    expect(engine.getVolume()).toBe(1)
    expect(engine.isMuted()).toBe(true)
    expect(engine.isLooping()).toBe(true)
    expect(engine.getPlaybackRate()).toBe(0.25)
    expect(engine.getBufferedRanges()).toEqual([{ start: 0, end: 10 }, { start: 20, end: 30 }])
    expect(engine.getSeekableRanges()).toEqual([{ start: 0, end: 120 }])
    expect(engine.canPlayType('audio/mpeg')).toBe('probably')
  })

  it('emits typed snapshots for media lifecycle events', () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const events: string[] = []

    engine.on('loadedmetadata', ({ duration }) => events.push(`metadata:${duration}`))
    engine.on('seeking', ({ currentTime }) => events.push(`seeking:${currentTime}`))
    engine.on('volumechange', ({ volume, isMuted }) => events.push(`volume:${volume}:${isMuted}`))
    engine.on('ratechange', ({ playbackRate }) => events.push(`rate:${playbackRate}`))

    audioElement.currentTime = 12
    audioElement.volume = 0.5
    audioElement.muted = true
    audioElement.playbackRate = 1.25
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    audioElement.dispatchEvent(new Event('seeking'))
    audioElement.dispatchEvent(new Event('volumechange'))
    audioElement.dispatchEvent(new Event('ratechange'))

    expect(events).toEqual(['metadata:120', 'seeking:12', 'volume:0.5:true', 'rate:1.25'])
  })

  it('emits all buffered ranges on progress', () => {
    const audioElement = new FakeAudioElement()
    audioElement.buffered = new FakeTimeRanges([{ start: 0, end: 10 }, { start: 30, end: 40 }])
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const updates: TimeRange[][] = []
    engine.on('bufferupdate', ({ ranges }) => updates.push([...ranges]))

    audioElement.dispatchEvent(new Event('progress'))

    expect(updates).toEqual([[{ start: 0, end: 10 }, { start: 30, end: 40 }]])
  })

  it.each([
    [1, 'LOAD_ABORTED'],
    [2, 'NETWORK_ERROR'],
    [3, 'DECODE_FAILED'],
    [4, 'UNSUPPORTED_FORMAT'],
    [99, 'ENGINE_ERROR'],
  ] as const)('maps media error %s to %s', (mediaErrorCode, expectedCode) => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const errorCodes: GAudioErrorCode[] = []
    engine.on('error', error => errorCodes.push(error.code))
    audioElement.error = mediaError(mediaErrorCode)

    audioElement.dispatchEvent(new Event('error'))

    expect(errorCodes).toEqual([expectedCode])
  })

  it('aborts the previous load and closes its source when a newer load starts', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const firstSource = new FakeAudioSource('https://example.com/first.mp3')
    const secondSource = new FakeAudioSource('https://example.com/second.mp3')

    const firstLoad = engine.load(firstSource)
    const firstLoadExpectation = expect(firstLoad).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    const secondLoad = engine.load(secondSource)
    await Promise.resolve()
    audioElement.dispatchEvent(new Event('loadedmetadata'))

    await firstLoadExpectation
    await expect(secondLoad).resolves.toBeUndefined()
    expect(firstSource.closeCalls).toBe(1)
    expect(audioElement.src).toBe('https://example.com/second.mp3')
  })

  it('unloads the current source and removes event listeners on dispose', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/audio.mp3')
    const playingEvents: string[] = []
    engine.on('playing', () => playingEvents.push('playing'))

    const loading = engine.load(source)
    await Promise.resolve()
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await loading
    engine.dispose()
    audioElement.dispatchEvent(new Event('playing'))

    expect(source.closeCalls).toBe(1)
    expect(audioElement.src).toBe('')
    expect(playingEvents).toEqual([])
  })
})
