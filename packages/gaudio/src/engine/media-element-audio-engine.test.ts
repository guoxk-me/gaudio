import type { GAudioErrorCode } from '../errors/errors'
import type { AudioSource, AudioStreamHandle } from '../source/audio-source'
import type { TimeRange } from './audio-engine-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeAudioElement, FakeTimeRanges } from '../test-support/fake-media'
import { MediaElementAudioEngine } from './media-element-audio-engine'

class FakeAudioSource implements AudioSource {
  readonly kind = 'url'
  closeCalls = 0
  openError?: Error

  constructor(readonly url: string) {}

  async open(): Promise<AudioStreamHandle> {
    if (this.openError) {
      throw this.openError
    }
    return { url: this.url }
  }

  async close(): Promise<void> {
    this.closeCalls += 1
  }
}

function mediaError(code: number): MediaError {
  return { code, message: 'media failed' } as MediaError
}

class FakeAudioGraphNode {
  readonly connectedNodes: AudioNode[] = []
  isDisconnected = false

  connect(destinationNode: AudioNode): AudioNode {
    this.connectedNodes.push(destinationNode)
    return destinationNode
  }

  disconnect(): void {
    this.isDisconnected = true
  }
}

class FakeAnalyserNode extends FakeAudioGraphNode {
  fftSize = 2048

  get frequencyBinCount(): number {
    return this.fftSize / 2
  }

  getByteFrequencyData(frequencyData: Uint8Array): void {
    for (let index = 0; index < frequencyData.length; index += 1) {
      frequencyData[index] = index + 20
    }
  }

  getByteTimeDomainData(waveformData: Uint8Array): void {
    for (let index = 0; index < waveformData.length; index += 1) {
      waveformData[index] = 120 + index
    }
  }
}

class FakeMediaElementSourceNode extends FakeAudioGraphNode {
  constructor(readonly audioElement: HTMLMediaElement) {
    super()
  }
}

class FakeAudioContext {
  readonly destination = new FakeAudioGraphNode() as unknown as AudioDestinationNode
  readonly analyserNode = new FakeAnalyserNode()
  readonly sourceNodes: FakeMediaElementSourceNode[] = []
  state: AudioContextState = 'running'
  resumeCalls = 0
  closeCalls = 0

  createMediaElementSource(audioElement: HTMLMediaElement): MediaElementAudioSourceNode {
    const sourceNode = new FakeMediaElementSourceNode(audioElement)
    this.sourceNodes.push(sourceNode)
    return sourceNode as unknown as MediaElementAudioSourceNode
  }

  createAnalyser(): AnalyserNode {
    return this.analyserNode as unknown as AnalyserNode
  }

  async resume(): Promise<void> {
    this.resumeCalls += 1
  }

  async close(): Promise<void> {
    this.closeCalls += 1
    this.state = 'closed'
  }
}

describe('mediaElementEngine', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

  it('exposes autoplay, pitch preservation, and played ranges', () => {
    const audioElement = new FakeAudioElement()
    audioElement.played = new FakeTimeRanges([{ start: 2, end: 8 }, { start: 12, end: 20 }])
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)

    engine.setAutoplay(true)
    engine.setPreservesPitch(false)

    expect(engine.getAutoplay()).toBe(true)
    expect(engine.getPreservesPitch()).toBe(false)
    expect(engine.getPlayedRanges()).toEqual([{ start: 2, end: 8 }, { start: 12, end: 20 }])
  })

  it('creates a Web Audio analyzer without muting media playback', () => {
    const audioContexts: FakeAudioContext[] = []
    class TestAudioContext extends FakeAudioContext {
      constructor() {
        super()
        audioContexts.push(this)
      }
    }
    vi.stubGlobal('AudioContext', TestAudioContext)
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)

    const analyzer = engine.createAnalyzer({ fftSize: 1024 })
    const audioContext = audioContexts[0]
    const sourceNode = audioContext.sourceNodes[0]

    expect(audioContext.analyserNode.fftSize).toBe(1024)
    expect(sourceNode.audioElement).toBe(audioElement)
    expect(sourceNode.connectedNodes).toContain(audioContext.destination)
    expect(sourceNode.connectedNodes).toContain(audioContext.analyserNode)
    expect([...analyzer.getFrequencyData({ binCount: 3 })]).toEqual([20, 21, 22])
    expect([...analyzer.getWaveformData({ sampleCount: 3 })]).toEqual([120, 121, 122])
  })

  it('resumes and closes the owned audio analysis context with engine lifecycle', async () => {
    const audioContexts: FakeAudioContext[] = []
    class TestAudioContext extends FakeAudioContext {
      constructor() {
        super()
        audioContexts.push(this)
      }
    }
    vi.stubGlobal('AudioContext', TestAudioContext)
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    engine.createAnalyzer()
    const audioContext = audioContexts[0]

    await engine.play()
    engine.dispose()

    expect(audioContext.resumeCalls).toBe(1)
    expect(audioContext.closeCalls).toBe(1)
    expect(audioContext.sourceNodes[0].isDisconnected).toBe(true)
  })

  it('uses native fast seek when available', async () => {
    const audioElement = new FakeAudioElement()
    audioElement.fastSeek = seconds => audioElement.fastSeekCalls.push(seconds)
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)

    await engine.fastSeek(12)

    expect(audioElement.fastSeekCalls).toEqual([12])
    expect(audioElement.currentTime).toBe(0)
  })

  it('falls back to regular seek when native fast seek is unavailable', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)

    await engine.fastSeek(18)

    expect(audioElement.currentTime).toBe(18)
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

  it('closes the source immediately when opening fails', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/audio.mp3')
    source.openError = new Error('open failed')

    await expect(engine.load(source)).rejects.toThrow('open failed')

    expect(source.closeCalls).toBe(1)
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
