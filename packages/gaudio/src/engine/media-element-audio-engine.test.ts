import type { GAudioError, GAudioErrorCode } from '../errors/errors'
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

class DelayedResourceAudioSource implements AudioSource {
  readonly kind = 'url'
  closeCalls = 0
  releaseCalls = 0
  hasAllocatedResource = false
  private hasReleasedOpenOperation = false

  private finishOpen: (() => void) | undefined
  private readonly openGate = new Promise<void>((resolve) => {
    this.finishOpen = resolve
  })

  constructor(readonly url: string) {}

  async open(): Promise<AudioStreamHandle> {
    await this.openGate
    if (!this.hasReleasedOpenOperation) {
      this.hasAllocatedResource = true
    }
    return { url: this.url }
  }

  async close(): Promise<void> {
    this.closeCalls += 1
    if (!this.hasReleasedOpenOperation) {
      this.hasReleasedOpenOperation = true
      this.releaseCalls += 1
    }
    this.hasAllocatedResource = false
  }

  continueOpening(): void {
    this.finishOpen?.()
  }
}

class DelayedFailingResourceAudioSource implements AudioSource {
  readonly kind = 'url'
  closeCalls = 0
  hasAllocatedResource = false
  private hasReleasedOpenOperation = false
  private finishOpen: (() => void) | undefined
  private readonly openGate = new Promise<void>((resolve) => {
    this.finishOpen = resolve
  })

  constructor(readonly url: string) {}

  async open(): Promise<AudioStreamHandle> {
    await this.openGate
    if (!this.hasReleasedOpenOperation) {
      this.hasAllocatedResource = true
    }
    throw new Error('open failed after allocation')
  }

  async close(): Promise<void> {
    this.closeCalls += 1
    this.hasReleasedOpenOperation = true
    this.hasAllocatedResource = false
  }

  continueOpening(): void {
    this.finishOpen?.()
  }
}

class NeverSettlingAudioSource implements AudioSource {
  readonly kind = 'url'
  closeCalls = 0

  constructor(
    readonly url: string,
    private readonly closeError?: Error,
  ) {}

  open(): Promise<AudioStreamHandle> {
    return new Promise(() => {})
  }

  close(): Promise<void> {
    this.closeCalls += 1
    if (this.closeError) {
      throw this.closeError
    }
    return Promise.resolve()
  }
}

class DelayedCloseAudioSource extends FakeAudioSource {
  hasCloseStarted = false
  private continueClose: (() => void) | undefined
  private readonly closeGate = new Promise<void>((resolve) => {
    this.continueClose = resolve
  })

  override async close(): Promise<void> {
    this.closeCalls += 1
    this.hasCloseStarted = true
    await this.closeGate
  }

  finishClosing(): void {
    this.continueClose?.()
  }
}

class NeverClosingAudioSource extends FakeAudioSource {
  override close(): Promise<void> {
    this.closeCalls += 1
    return new Promise(() => {})
  }
}

class ObservedAudioSource extends FakeAudioSource {
  openCalls = 0

  override async open(): Promise<AudioStreamHandle> {
    this.openCalls += 1
    return super.open()
  }
}

class RetryingCloseAudioSource extends ObservedAudioSource {
  readonly closeError = new Error('source close failed')

  constructor(
    url: string,
    private readonly closeFailures: Array<'sync' | 'async'>,
  ) {
    super(url)
  }

  override close(): Promise<void> {
    this.closeCalls += 1
    const closeFailure = this.closeFailures.shift()
    if (closeFailure === 'sync') {
      throw this.closeError
    }
    if (closeFailure === 'async') {
      return Promise.reject(this.closeError)
    }
    return Promise.resolve()
  }
}

class ThrowingDetachAudioElement extends FakeAudioElement {
  readonly detachError = new Error('media detach failed')
  removeCalls = 0
  private shouldFailDetach = true

  override removeAttribute(name: string): void {
    this.removeCalls += 1
    if (this.shouldFailDetach) {
      this.shouldFailDetach = false
      throw this.detachError
    }
    super.removeAttribute(name)
  }
}

class ThrowingPauseAudioElement extends FakeAudioElement {
  readonly pauseError = new Error('media pause failed')
  private shouldFailPause = true

  override pause(): void {
    if (this.shouldFailPause) {
      this.shouldFailPause = false
      throw this.pauseError
    }
    super.pause()
  }
}

class ThrowingListenerRemovalAudioElement extends FakeAudioElement {
  readonly listenerRemovalError = new Error('listener removal failed')
  removalCalls = 0
  private shouldFailRemoval = false

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    this.removalCalls += 1
    if (this.shouldFailRemoval) {
      this.shouldFailRemoval = false
      throw this.listenerRemovalError
    }
    super.removeEventListener(type, callback, options)
  }

  failNextRemoval(): void {
    this.shouldFailRemoval = true
  }
}

class ThrowingListenerRegistrationAudioElement extends FakeAudioElement {
  readonly listenerRegistrationError = new Error('listener registration failed')
  registrationCalls = 0
  removalCalls = 0

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    this.registrationCalls += 1
    if (this.registrationCalls === 3) {
      throw this.listenerRegistrationError
    }
    super.addEventListener(type, callback, options)
  }

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    this.removalCalls += 1
    super.removeEventListener(type, callback, options)
  }
}

class AdversarialMetadataListenerAudioElement extends FakeAudioElement {
  readonly metadataRegistrationError = new Error('metadata listener registration failed')
  shouldThrowOnMetadataRegistration = false
  onMetadataRegistration?: () => void

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    const isMetadataWait = type === 'loadedmetadata'
      && typeof options === 'object'
      && options.signal !== undefined
    if (isMetadataWait && this.shouldThrowOnMetadataRegistration) {
      this.shouldThrowOnMetadataRegistration = false
      throw this.metadataRegistrationError
    }
    super.addEventListener(type, callback, options)
    if (isMetadataWait) {
      const onMetadataRegistration = this.onMetadataRegistration
      this.onMetadataRegistration = undefined
      onMetadataRegistration?.()
    }
  }
}

class AdversarialSeekListenerAudioElement extends FakeAudioElement {
  readonly seekRegistrationError = new Error('seek listener registration failed')
  lastSeekSignal?: AbortSignal
  shouldThrowOnSeekRegistration = false
  onSeekRegistration?: () => void

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    const isSeekWait = type === 'seeked'
      && typeof options === 'object'
      && options.signal !== undefined
    if (isSeekWait) {
      this.lastSeekSignal = options.signal
      if (this.shouldThrowOnSeekRegistration) {
        this.shouldThrowOnSeekRegistration = false
        throw this.seekRegistrationError
      }
    }
    super.addEventListener(type, callback, options)
    if (isSeekWait) {
      const onSeekRegistration = this.onSeekRegistration
      this.onSeekRegistration = undefined
      onSeekRegistration?.()
    }
  }
}

class ThrowingAttachedLoadAudioElement extends FakeAudioElement {
  readonly attachError = new Error('native load failed synchronously')
  shouldThrowOnAttachedLoad = true

  override load(): void {
    super.load()
    if (this.src && this.shouldThrowOnAttachedLoad) {
      this.shouldThrowOnAttachedLoad = false
      throw this.attachError
    }
  }
}

class ThrowingAttachAndPauseAudioElement extends ThrowingAttachedLoadAudioElement {
  readonly pauseError = new Error('media pause failed')
  private shouldFailPause = true

  override pause(): void {
    if (this.shouldFailPause) {
      this.shouldFailPause = false
      throw this.pauseError
    }
    super.pause()
  }
}

class PreloadedAudioElement extends FakeAudioElement {
  currentSrc = 'https://example.com/preloaded.mp3'

  constructor() {
    super()
    this.src = this.currentSrc
    this.paused = false
  }

  override removeAttribute(name: string): void {
    super.removeAttribute(name)
    if (name === 'src') {
      this.currentSrc = ''
    }
  }
}

class SourceAwareAudioElement extends FakeAudioElement {
  currentSrc = ''

  publishMetadata(url: string): void {
    this.currentSrc = url
    this.dispatchEvent(new Event('loadedmetadata'))
  }
}

class PreloadedSrcObjectAudioElement extends FakeAudioElement {
  readonly initialSrcObject = {} as MediaStream
  srcObject: HTMLMediaElement['srcObject'] = this.initialSrcObject

  constructor() {
    super()
    this.paused = false
  }
}

class QueuedDetachErrorAudioElement extends PreloadedAudioElement {
  readonly detachedSourceError = mediaError(2)
  readonly currentSourceError = mediaError(3)
  shouldCompleteMetadata = true

  constructor() {
    super()
    this.error = this.detachedSourceError
  }

  override load(): void {
    super.load()
    if (this.src) {
      this.currentSrc = this.src
      this.error = null
      // AI modified: tests can hold metadata open while exercising stale and current error ordering.
      if (this.shouldCompleteMetadata) {
        this.dispatchEvent(new Event('loadedmetadata'))
      }
    }
  }

  publishDetachedSourceError(): void {
    this.error = this.detachedSourceError
    this.dispatchEvent(new Event('error'))
  }

  publishCurrentSourceError(): void {
    this.error = this.currentSourceError
    this.dispatchEvent(new Event('error'))
  }
}

class DelayedPlayAudioElement extends FakeAudioElement {
  private continuePlaying: (() => void) | undefined
  private readonly playGate = new Promise<void>((resolve) => {
    this.continuePlaying = resolve
  })

  override async play(): Promise<void> {
    this.playCalls += 1
    await this.playGate
    this.paused = false
  }

  finishPlaying(): void {
    this.continuePlaying?.()
  }
}

class DelayedPlayWithLatePauseFailureAudioElement extends DelayedPlayAudioElement {
  readonly pauseError = new Error('late playback pause failed')
  pauseCalls = 0

  override pause(): void {
    this.pauseCalls += 1
    if (this.pauseCalls === 2) {
      throw this.pauseError
    }
    super.pause()
  }
}

class NeverSettlingPlayAudioElement extends FakeAudioElement {
  override play(): Promise<void> {
    this.playCalls += 1
    this.paused = false
    return new Promise(() => {})
  }
}

function expectDisposedEngineError(operation: () => unknown): void {
  let thrownError: unknown
  try {
    operation()
  }
  catch (error) {
    thrownError = error
  }

  expect(thrownError).toMatchObject({ code: 'ENGINE_ERROR' })
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

class RetryingAudioContext extends FakeAudioContext {
  readonly closeError = new Error('audio context close failed')

  constructor(private readonly closeFailures: Array<'sync' | 'async'>) {
    super()
  }

  override close(): Promise<void> {
    this.closeCalls += 1
    const closeFailure = this.closeFailures.shift()
    if (closeFailure === 'sync') {
      throw this.closeError
    }
    if (closeFailure === 'async') {
      return Promise.reject(this.closeError)
    }
    this.state = 'closed'
    return Promise.resolve()
  }
}

class NeverResumingAudioContext extends FakeAudioContext {
  override resume(): Promise<void> {
    this.resumeCalls += 1
    return new Promise(() => {})
  }
}

// AI modified: an external subclass may reuse names that belong only to the engine's native-private implementation.
class InheritableMediaElementAudioEngine extends MediaElementAudioEngine {
  private isDisposed = true

  private assertUsable(): boolean {
    return this.isDisposed
  }

  hasSubclassDisposalFlag(): boolean {
    return this.assertUsable()
  }
}

describe('mediaElementEngine', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('allows external subclasses to reuse implementation-private names', () => {
    const audioElement = new FakeAudioElement()
    const engine = new InheritableMediaElementAudioEngine(
      audioElement as unknown as HTMLAudioElement,
    )

    expect(engine.hasSubclassDisposalFlag()).toBe(true)
    expect(() => engine.setVolume(0.5)).not.toThrow()
    expect(audioElement.volume).toBe(0.5)
  })

  it('rolls back browser listeners when engine construction cannot register all of them', () => {
    const audioElement = new ThrowingListenerRegistrationAudioElement()

    expect(() => new MediaElementAudioEngine(
      audioElement as unknown as HTMLAudioElement,
    )).toThrow(audioElement.listenerRegistrationError)

    // AI modified: a failed constructor cannot leave its successfully registered prefix attached.
    expect(audioElement.removalCalls).toBe(2)
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
    expect(engine.getPlaybackRate()).toBe(0.1)
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

  it('keeps playback successful when the optional analysis context cannot resume', async () => {
    class RejectingAudioContext extends FakeAudioContext {
      override async resume(): Promise<void> {
        this.resumeCalls += 1
        throw new Error('resume failed')
      }
    }
    vi.stubGlobal('AudioContext', RejectingAudioContext)
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    engine.createAnalyzer()

    await expect(engine.play()).resolves.toBeUndefined()
    expect(audioElement.playCalls).toBe(1)
  })

  it('does not wait for a never-settling optional analysis resume', async () => {
    const audioContexts: NeverResumingAudioContext[] = []
    class TestAudioContext extends NeverResumingAudioContext {
      constructor() {
        super()
        audioContexts.push(this)
      }
    }
    vi.stubGlobal('AudioContext', TestAudioContext)
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    engine.createAnalyzer()

    await expect(engine.play()).resolves.toBeUndefined()

    expect(audioElement.playCalls).toBe(1)
    expect(audioContexts[0].resumeCalls).toBe(1)
  })

  it.each(['sync', 'async'] as const)(
    'retries a %s audio-context close failure on repeated disposal',
    async (closeFailure) => {
      const audioContexts: RetryingAudioContext[] = []
      class TestAudioContext extends RetryingAudioContext {
        constructor() {
          super([closeFailure])
          audioContexts.push(this)
        }
      }
      vi.stubGlobal('AudioContext', TestAudioContext)
      const audioElement = new FakeAudioElement()
      const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
      engine.createAnalyzer()
      const audioContext = audioContexts[0]

      expect(() => engine.dispose()).not.toThrow()
      await vi.waitFor(() => {
        expect(audioContext.closeCalls).toBe(1)
      })

      expect(() => engine.dispose()).not.toThrow()
      await vi.waitFor(() => {
        expect(audioContext.closeCalls).toBe(2)
      })
      expect(audioContext.state).toBe('closed')
    },
  )

  it('maps browser playback rejections to their stable error codes', async () => {
    const playbackFailures: Array<{ rejection: unknown, expectedCode: GAudioErrorCode }> = [
      {
        rejection: new DOMException('Autoplay requires user activation', 'NotAllowedError'),
        expectedCode: 'PLAYBACK_BLOCKED',
      },
      {
        rejection: new DOMException('Unsupported source', 'NotSupportedError'),
        expectedCode: 'UNSUPPORTED_FORMAT',
      },
      {
        rejection: new DOMException('Playback was interrupted', 'AbortError'),
        expectedCode: 'LOAD_ABORTED',
      },
      {
        // AI modified: iframe-originated DOMExceptions are identified by name rather than realm identity.
        rejection: Object.assign(new Error('Cross-realm autoplay rejection'), { name: 'NotAllowedError' }),
        expectedCode: 'PLAYBACK_BLOCKED',
      },
      {
        rejection: new Error('Unexpected playback failure'),
        expectedCode: 'ENGINE_ERROR',
      },
    ]

    for (const { rejection, expectedCode } of playbackFailures) {
      const audioElement = new FakeAudioElement()
      vi.spyOn(audioElement, 'play').mockRejectedValue(rejection)
      const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)

      await expect(engine.play()).rejects.toMatchObject({
        code: expectedCode,
        cause: rejection,
      })
    }
  })

  it('closes and relinquishes audio analysis when graph disconnection fails', () => {
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
    const disconnect = vi.spyOn(audioContext.sourceNodes[0], 'disconnect').mockImplementation(() => {
      throw new Error('graph disconnect failed')
    })

    expect(() => engine.dispose()).not.toThrow()
    engine.dispose()

    expect(disconnect).toHaveBeenCalledOnce()
    expect(audioContext.closeCalls).toBe(1)
  })

  it('uses native fast seek when available', async () => {
    const audioElement = new FakeAudioElement()
    audioElement.fastSeek = seconds => audioElement.fastSeekCalls.push(seconds)
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)

    await engine.fastSeek(12)

    expect(audioElement.fastSeekCalls).toEqual([12])
    expect(audioElement.currentTime).toBe(0)
  })

  it('resolves seek after the browser reports completion', async () => {
    const audioElement = new FakeAudioElement()
    audioElement.seeking = true
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    let hasSeekResolved = false

    const seek = engine.seek(25).then(() => {
      hasSeekResolved = true
    })
    await Promise.resolve()

    expect(audioElement.currentTime).toBe(25)
    expect(hasSeekResolved).toBe(false)

    audioElement.seeking = false
    audioElement.dispatchEvent(new Event('seeked'))
    await seek

    expect(hasSeekResolved).toBe(true)
  })

  it('rejects a superseded seek and resolves only the latest request', async () => {
    const audioElement = new FakeAudioElement()
    audioElement.seeking = true
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)

    const firstSeek = engine.seek(10)
    const firstSeekExpectation = expect(firstSeek).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    const secondSeek = engine.seek(20)

    await firstSeekExpectation
    expect(audioElement.currentTime).toBe(20)

    audioElement.seeking = false
    audioElement.dispatchEvent(new Event('seeked'))

    await expect(secondSeek).resolves.toBeUndefined()
  })

  it('ignores a superseded seek completion while the latest native seek is still active', async () => {
    const audioElement = new FakeAudioElement()
    audioElement.seeking = true
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const seekedTimes: number[] = []
    engine.on('seeked', ({ currentTime }) => seekedTimes.push(currentTime))

    const firstSeek = engine.seek(10)
    const firstSeekExpectation = expect(firstSeek).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    const queuedFirstCompletion = new Event('seeked')
    Object.defineProperty(queuedFirstCompletion, 'timeStamp', { value: 0 })
    let hasLatestSeekFinished = false
    const latestSeek = engine.seek(20).then(() => {
      hasLatestSeekFinished = true
    })
    await firstSeekExpectation

    audioElement.dispatchEvent(new Event('seeked'))
    await Promise.resolve()

    // AI modified: the first native task cannot complete or publish the replacement seek.
    expect(hasLatestSeekFinished).toBe(false)
    expect(seekedTimes).toEqual([])

    audioElement.seeking = false
    audioElement.dispatchEvent(queuedFirstCompletion)
    await Promise.resolve()

    expect(hasLatestSeekFinished).toBe(false)
    expect(seekedTimes).toEqual([])

    audioElement.dispatchEvent(new Event('seeked'))
    await latestSeek

    expect(hasLatestSeekFinished).toBe(true)
    expect(seekedTimes).toEqual([20])
  })

  it('keeps a current seek active after a queued detached-source error', async () => {
    const audioElement = new QueuedDetachErrorAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    await engine.load(new FakeAudioSource('https://example.com/replacement.mp3'))
    audioElement.seeking = true
    let reportedSeekError: unknown
    const seeking = engine.seek(25).catch((error) => {
      reportedSeekError = error
      throw error
    })
    const seekingExpectation = expect(seeking).rejects.toMatchObject({ code: 'DECODE_FAILED' })

    audioElement.publishDetachedSourceError()
    await Promise.resolve()

    // AI modified: the detached resource's queued error cannot settle the current source's seek.
    expect(reportedSeekError).toBeUndefined()

    audioElement.publishCurrentSourceError()
    await seekingExpectation
  })

  it.each([
    [
      'seek',
      (engine: MediaElementAudioEngine, _audioElement: QueuedDetachErrorAudioElement) => engine.seek(25),
    ],
    [
      'fastSeek',
      (engine: MediaElementAudioEngine, audioElement: QueuedDetachErrorAudioElement) => {
        audioElement.fastSeek = (seconds) => {
          audioElement.fastSeekCalls.push(seconds)
          audioElement.currentTime = seconds
        }
        return engine.fastSeek(25)
      },
    ],
  ] as const)(
    'publishes one current %s error and rejects with the same error instance',
    async (_operationName, startOperation) => {
      const audioElement = new QueuedDetachErrorAudioElement()
      const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
      await engine.load(new FakeAudioSource('https://example.com/replacement.mp3'))
      const publishedErrors: GAudioError[] = []
      engine.on('error', error => publishedErrors.push(error))
      audioElement.seeking = true

      const seeking = startOperation(engine, audioElement)
      let seekFailure: unknown
      void seeking.catch((error: unknown) => {
        seekFailure = error
      })
      audioElement.publishCurrentSourceError()
      await expect(seeking).rejects.toMatchObject({ code: 'DECODE_FAILED' })

      // AI modified: one browser failure has one identity across observable engine channels.
      expect(publishedErrors).toHaveLength(1)
      expect(publishedErrors[0]).toBe(seekFailure)
    },
  )

  it('cleans a seek request whose listener registration throws', async () => {
    const audioElement = new AdversarialSeekListenerAudioElement()
    audioElement.shouldThrowOnSeekRegistration = true
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)

    await expect(engine.seek(10)).rejects.toBe(audioElement.seekRegistrationError)

    // AI modified: failed listener setup aborts the partial seek session immediately.
    expect(audioElement.lastSeekSignal?.aborted).toBe(true)
    expect(audioElement.currentTime).toBe(0)
  })

  it('does not start a seek after listener registration reentrantly unloads it', async () => {
    const audioElement = new AdversarialSeekListenerAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    audioElement.onSeekRegistration = () => engine.unload()

    await expect(engine.seek(10)).rejects.toMatchObject({ code: 'LOAD_ABORTED' })

    // AI modified: the winning unload prevents the superseded seek from changing media position.
    expect(audioElement.currentTime).toBe(0)
  })

  it('does not clear a newer seek when the superseded seek starter throws', async () => {
    const audioElement = new FakeAudioElement()
    audioElement.seeking = true
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const starterError = new Error('obsolete fast seek failed')
    let latestSeek: Promise<void> | undefined
    audioElement.fastSeek = () => {
      latestSeek = engine.seek(20)
      throw starterError
    }

    await expect(engine.fastSeek(10)).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    expect(latestSeek).toBeDefined()

    audioElement.seeking = false
    audioElement.dispatchEvent(new Event('seeked'))

    // AI modified: the reentrant seek remains the sole owner after the obsolete starter unwinds.
    await expect(latestSeek).resolves.toBeUndefined()
    expect(audioElement.currentTime).toBe(20)
  })

  it('falls back to regular seek when native fast seek is unavailable', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)

    await engine.fastSeek(18)

    expect(audioElement.currentTime).toBe(18)
  })

  it('emits typed snapshots for media lifecycle events', () => {
    const audioElement = new PreloadedAudioElement()
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
    audioElement.seeking = true
    audioElement.dispatchEvent(new Event('seeking'))
    audioElement.dispatchEvent(new Event('volumechange'))
    audioElement.dispatchEvent(new Event('ratechange'))

    expect(events).toEqual(['metadata:120', 'seeking:12', 'volume:0.5:true', 'rate:1.25'])
  })

  it('ignores queued playback events that contradict current native state', () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const playbackEvents: string[] = []
    engine.on('canplay', () => playbackEvents.push('canplay'))
    engine.on('play', () => playbackEvents.push('play'))
    engine.on('playing', () => playbackEvents.push('playing'))
    engine.on('pause', () => playbackEvents.push('pause'))
    engine.on('ended', () => playbackEvents.push('ended'))

    audioElement.paused = true
    audioElement.readyState = 0
    audioElement.dispatchEvent(new Event('canplay'))
    audioElement.dispatchEvent(new Event('play'))
    audioElement.dispatchEvent(new Event('playing'))
    audioElement.paused = false
    audioElement.dispatchEvent(new Event('pause'))
    audioElement.ended = false
    audioElement.dispatchEvent(new Event('ended'))

    audioElement.readyState = 3
    audioElement.dispatchEvent(new Event('canplay'))
    audioElement.paused = false
    audioElement.dispatchEvent(new Event('play'))
    audioElement.dispatchEvent(new Event('playing'))
    audioElement.paused = true
    audioElement.dispatchEvent(new Event('pause'))
    audioElement.ended = true
    audioElement.dispatchEvent(new Event('ended'))

    expect(playbackEvents).toEqual(['canplay', 'play', 'playing', 'pause', 'ended'])
  })

  it('does not let an internal pause suppress a real pause after playback succeeds', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const pauseEvents: string[] = []
    engine.on('pause', () => pauseEvents.push('pause'))

    await engine.play()
    engine.stop()
    await engine.play()
    audioElement.dispatchEvent(new Event('pause'))
    engine.pause()
    audioElement.dispatchEvent(new Event('pause'))

    expect(pauseEvents).toEqual(['pause'])
  })

  it('keeps the old internal pause suppression when playback is rejected', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const pauseEvents: string[] = []
    engine.on('pause', () => pauseEvents.push('pause'))
    await engine.play()
    engine.stop()
    vi.spyOn(audioElement, 'play').mockRejectedValue(new DOMException('blocked', 'NotAllowedError'))

    await expect(engine.play()).rejects.toMatchObject({ code: 'PLAYBACK_BLOCKED' })
    audioElement.dispatchEvent(new Event('pause'))
    audioElement.dispatchEvent(new Event('pause'))

    expect(pauseEvents).toEqual(['pause'])
  })

  it('emits waiting only while active playback can actually buffer', () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const waitingEvents: string[] = []
    engine.on('waiting', () => waitingEvents.push('waiting'))

    audioElement.paused = true
    audioElement.dispatchEvent(new Event('waiting'))
    audioElement.paused = false
    audioElement.ended = true
    audioElement.dispatchEvent(new Event('waiting'))
    audioElement.ended = false
    audioElement.dispatchEvent(new Event('waiting'))

    expect(waitingEvents).toEqual(['waiting'])
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

  it('maps an error event without a MediaError to the engine fallback', () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const errorCodes: GAudioErrorCode[] = []
    engine.on('error', error => errorCodes.push(error.code))

    audioElement.dispatchEvent(new Event('error'))

    expect(errorCodes).toEqual(['ENGINE_ERROR'])
  })

  it('keeps load candidate errors on the load promise and closes the failed source', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/failing.mp3')
    const publishedErrors: GAudioErrorCode[] = []
    engine.on('error', error => publishedErrors.push(error.code))

    const loading = engine.load(source)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(source.url)
    })
    audioElement.error = mediaError(2)
    audioElement.dispatchEvent(new Event('error'))

    await expect(loading).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(publishedErrors).toEqual([])
    expect(source.closeCalls).toBe(1)
  })

  it('detaches a failed source even when pausing during error cleanup throws', async () => {
    const audioElement = new ThrowingPauseAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/failing.mp3')
    const loading = engine.load(source)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(source.url)
    })

    audioElement.error = mediaError(2)
    audioElement.dispatchEvent(new Event('error'))

    await expect(loading).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    // AI modified: every teardown obligation remains independent when the first browser operation fails.
    expect(audioElement.src).toBe('')
    expect(source.closeCalls).toBe(1)
  })

  it('aborts the previous load and closes its source when a newer load starts', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const firstSource = new FakeAudioSource('https://example.com/first.mp3')
    const secondSource = new FakeAudioSource('https://example.com/second.mp3')

    const firstLoad = engine.load(firstSource)
    const firstLoadExpectation = expect(firstLoad).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    const secondLoad = engine.load(secondSource)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(secondSource.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))

    await firstLoadExpectation
    await expect(secondLoad).resolves.toBeUndefined()
    expect(firstSource.closeCalls).toBe(1)
    expect(audioElement.src).toBe('https://example.com/second.mp3')
  })

  it('ignores queued metadata from a replaced source until the current source reports metadata', async () => {
    const audioElement = new SourceAwareAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const firstSource = new FakeAudioSource('https://example.com/first.mp3')
    const metadataDurations: number[] = []
    engine.on('loadedmetadata', ({ duration }) => metadataDurations.push(duration))
    audioElement.duration = 10
    const firstLoad = engine.load(firstSource)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(firstSource.url)
    })
    audioElement.publishMetadata(firstSource.url)
    await firstLoad

    const secondSource = new FakeAudioSource('https://example.com/second.mp3')
    const secondLoad = engine.load(secondSource)
    let hasSecondLoadFinished = false
    void secondLoad.then(() => {
      hasSecondLoadFinished = true
    })
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(secondSource.url)
    })

    audioElement.currentSrc = secondSource.url
    audioElement.readyState = 0
    // AI modified: a late old-resource task can be created after replacement, so timestamp and URL alone are insufficient.
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await Promise.resolve()
    expect(hasSecondLoadFinished).toBe(false)
    expect(metadataDurations).toEqual([10])

    audioElement.readyState = 1
    audioElement.duration = 20
    audioElement.publishMetadata(secondSource.url)
    await secondLoad
    expect(hasSecondLoadFinished).toBe(true)
    expect(metadataDurations).toEqual([10, 20])
  })

  it('does not carry internal pause suppression into playback of a replacement source', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const firstSource = new FakeAudioSource('https://example.com/first.mp3')
    const firstLoad = engine.load(firstSource)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(firstSource.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await firstLoad
    await engine.play()
    const pauseEvents: string[] = []
    engine.on('pause', () => pauseEvents.push('pause'))

    const secondSource = new FakeAudioSource('https://example.com/second.mp3')
    const secondLoad = engine.load(secondSource)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(secondSource.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await secondLoad
    await engine.play()
    engine.pause()
    audioElement.dispatchEvent(new Event('pause'))

    expect(pauseEvents).toEqual(['pause'])
  })

  it('detaches media already present on a caller-supplied element before opening a replacement', async () => {
    const audioElement = new PreloadedAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/replacement.mp3')
    const openSource = vi.spyOn(source, 'open').mockImplementation(async () => {
      expect(audioElement.paused).toBe(true)
      expect(audioElement.src).toBe('')
      return { url: source.url }
    })

    const loading = engine.load(source)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(source.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await loading

    expect(openSource).toHaveBeenCalledOnce()
    expect(audioElement.src).toBe(source.url)
  })

  it('clears srcObject media on a caller-supplied element before opening a replacement', async () => {
    const audioElement = new PreloadedSrcObjectAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/replacement.mp3')
    const openSource = vi.spyOn(source, 'open').mockImplementation(async () => {
      expect(audioElement.paused).toBe(true)
      expect(audioElement.srcObject).toBeNull()
      return { url: source.url }
    })

    const loading = engine.load(source)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(source.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await loading

    expect(openSource).toHaveBeenCalledOnce()
    expect(audioElement.srcObject).toBeNull()
    expect(audioElement.src).toBe(source.url)
  })

  it('ignores a queued error from the detached source without hiding a current-source error', async () => {
    const audioElement = new QueuedDetachErrorAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/replacement.mp3')
    const errorCodes: GAudioErrorCode[] = []
    engine.on('error', error => errorCodes.push(error.code))

    await engine.load(source)
    audioElement.publishDetachedSourceError()

    expect(errorCodes).toEqual([])
    expect(audioElement.currentSrc).toBe(source.url)

    audioElement.publishCurrentSourceError()

    expect(errorCodes).toEqual(['DECODE_FAILED'])
  })

  it('keeps waiting for a current-source error after a queued detached-source error', async () => {
    const audioElement = new QueuedDetachErrorAudioElement()
    audioElement.shouldCompleteMetadata = false
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/replacement.mp3')

    const loading = engine.load(source)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(source.url)
    })
    audioElement.publishDetachedSourceError()
    audioElement.publishCurrentSourceError()

    await expect(loading).rejects.toMatchObject({ code: 'DECODE_FAILED' })
    expect(source.closeCalls).toBe(1)
  })

  it('closes a source when metadata listener registration fails before attachment', async () => {
    const audioElement = new AdversarialMetadataListenerAudioElement()
    audioElement.shouldThrowOnMetadataRegistration = true
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/audio.mp3')

    await expect(engine.load(source)).rejects.toBe(audioElement.metadataRegistrationError)

    // AI modified: a browser listener setup failure cannot retain a source whose load already rejected.
    expect(audioElement.src).toBe('')
    expect(source.closeCalls).toBe(1)
  })

  it('does not attach a source after metadata listener registration reentrantly unloads it', async () => {
    const audioElement = new AdversarialMetadataListenerAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/audio.mp3')
    audioElement.onMetadataRegistration = () => engine.unload()

    await expect(engine.load(source)).rejects.toMatchObject({ code: 'LOAD_ABORTED' })

    // AI modified: listener registration reentrancy cannot revive a source closed by the winning lifecycle call.
    expect(audioElement.src).toBe('')
    expect(source.closeCalls).toBe(1)
  })

  it('releases resources when a cancelled source finishes opening later', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const firstSource = new DelayedResourceAudioSource('https://example.com/first.mp3')
    const secondSource = new FakeAudioSource('https://example.com/second.mp3')

    const firstLoad = engine.load(firstSource)
    const firstLoadExpectation = expect(firstLoad).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    const secondLoad = engine.load(secondSource)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(secondSource.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await secondLoad

    // AI modified: close cancels the in-flight open before that custom source settles.
    expect(firstSource.closeCalls).toBe(1)
    firstSource.continueOpening()
    await firstLoadExpectation

    expect(firstSource.closeCalls).toBe(1)
    expect(firstSource.releaseCalls).toBe(1)
    expect(firstSource.hasAllocatedResource).toBe(false)
  })

  it('cannot attach resources when disposal wins a pending source open', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new DelayedResourceAudioSource('https://example.com/audio.mp3')

    const loading = engine.load(source)
    const loadingExpectation = expect(loading).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    engine.dispose()
    expect(source.closeCalls).toBe(1)
    source.continueOpening()

    await loadingExpectation
    expect(source.closeCalls).toBe(1)
    expect(source.releaseCalls).toBe(1)
    expect(source.hasAllocatedResource).toBe(false)
    expect(audioElement.src).toBe('')
  })

  it('closes a cancelled source that allocates resources before its open rejects', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const firstSource = new DelayedFailingResourceAudioSource('https://example.com/first.mp3')
    const secondSource = new FakeAudioSource('https://example.com/second.mp3')

    const firstLoad = engine.load(firstSource)
    const firstLoadExpectation = expect(firstLoad).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    const secondLoad = engine.load(secondSource)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(secondSource.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await secondLoad

    expect(firstSource.closeCalls).toBe(1)
    firstSource.continueOpening()
    await firstLoadExpectation

    expect(firstSource.closeCalls).toBe(1)
    expect(firstSource.hasAllocatedResource).toBe(false)
  })

  it.each(['unload', 'dispose'] as const)(
    'closes a source whose open promise never settles during %s',
    async (operation) => {
      const audioElement = new FakeAudioElement()
      const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
      const source = new NeverSettlingAudioSource('https://example.com/pending.mp3')
      const loading = engine.load(source)
      const loadingExpectation = expect(loading).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
      await Promise.resolve()

      engine[operation]()
      await loadingExpectation
      engine.dispose()

      expect(source.closeCalls).toBe(1)
      expect(audioElement.src).toBe('')
    },
  )

  it('replaces a never-settling open after its close operation completes', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const pendingSource = new NeverSettlingAudioSource('https://example.com/pending.mp3')
    const replacementSource = new ObservedAudioSource('https://example.com/replacement.mp3')
    const pendingLoad = engine.load(pendingSource)
    const pendingLoadExpectation = expect(pendingLoad).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    await Promise.resolve()

    const replacementLoad = engine.load(replacementSource)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(replacementSource.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await replacementLoad
    await pendingLoadExpectation

    expect(pendingSource.closeCalls).toBe(1)
    expect(replacementSource.openCalls).toBe(1)
  })

  it.each(['unload', 'dispose'] as const)(
    'contains and retries a synchronous close failure during %s of a pending open',
    async (operation) => {
      const audioElement = new FakeAudioElement()
      const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
      const source = new NeverSettlingAudioSource(
        'https://example.com/pending.mp3',
        new Error('source close failed'),
      )
      const loading = engine.load(source)
      const loadingExpectation = expect(loading).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
      await Promise.resolve()

      expect(() => engine[operation]()).not.toThrow()
      await loadingExpectation
      engine.dispose()

      expect(source.closeCalls).toBe(2)
    },
  )

  it.each(['sync', 'async'] as const)(
    'retains a %s close failure until a later load cleans the source',
    async (closeFailure) => {
      const audioElement = new FakeAudioElement()
      const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
      const source = new RetryingCloseAudioSource(
        'https://example.com/first.mp3',
        [closeFailure, closeFailure],
      )
      const initialLoad = engine.load(source)
      await vi.waitFor(() => {
        expect(audioElement.src).toBe(source.url)
      })
      audioElement.dispatchEvent(new Event('loadedmetadata'))
      await initialLoad

      expect(() => engine.unload()).not.toThrow()
      await Promise.resolve()
      await Promise.resolve()
      expect(source.closeCalls).toBe(1)

      const blockedReplacement = new ObservedAudioSource('https://example.com/blocked.mp3')
      await expect(engine.load(blockedReplacement)).rejects.toBe(source.closeError)
      expect(source.closeCalls).toBe(2)
      expect(blockedReplacement.openCalls).toBe(0)

      const replacement = new ObservedAudioSource('https://example.com/replacement.mp3')
      const replacementLoad = engine.load(replacement)
      await vi.waitFor(() => {
        expect(audioElement.src).toBe(replacement.url)
      })
      audioElement.dispatchEvent(new Event('loadedmetadata'))
      await replacementLoad

      expect(source.closeCalls).toBe(3)
      expect(replacement.openCalls).toBe(1)
    },
  )

  it.each(['sync', 'async'] as const)(
    'lets repeated dispose retry a %s source close failure',
    async (closeFailure) => {
      const audioElement = new FakeAudioElement()
      const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
      const source = new RetryingCloseAudioSource(
        'https://example.com/audio.mp3',
        [closeFailure],
      )
      const loading = engine.load(source)
      await vi.waitFor(() => {
        expect(audioElement.src).toBe(source.url)
      })
      audioElement.dispatchEvent(new Event('loadedmetadata'))
      await loading

      expect(() => engine.dispose()).not.toThrow()
      await Promise.resolve()
      await Promise.resolve()
      expect(source.closeCalls).toBe(1)

      expect(() => engine.dispose()).not.toThrow()
      await Promise.resolve()

      expect(source.closeCalls).toBe(2)
    },
  )

  it('closes the source immediately when opening fails', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/audio.mp3')
    const sourceOpenError = new Error('open failed')
    source.openError = sourceOpenError

    // AI modified: the low-level engine preserves the custom source's exact open failure.
    await expect(engine.load(source)).rejects.toBe(sourceOpenError)

    expect(source.closeCalls).toBe(1)
  })

  it('cleans the source and preserves a synchronous native attachment error', async () => {
    const audioElement = new ThrowingAttachedLoadAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const firstSource = new FakeAudioSource('https://example.com/first.mp3')

    await expect(engine.load(firstSource)).rejects.toBe(audioElement.attachError)

    expect(firstSource.closeCalls).toBe(1)
    expect(audioElement.src).toBe('')

    const secondSource = new FakeAudioSource('https://example.com/second.mp3')
    const secondLoad = engine.load(secondSource)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(secondSource.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))

    await expect(secondLoad).resolves.toBeUndefined()
    engine.dispose()
    expect(firstSource.closeCalls).toBe(1)
    expect(secondSource.closeCalls).toBe(1)
  })

  it('detaches a synchronously rejected attachment even when cleanup pausing throws', async () => {
    const audioElement = new ThrowingAttachAndPauseAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/failing.mp3')

    await expect(engine.load(source)).rejects.toBe(audioElement.attachError)

    // AI modified: failed attachment cleanup must not leave its URL or source resource active.
    expect(audioElement.src).toBe('')
    expect(source.closeCalls).toBe(1)
  })

  it('waits for asynchronous source cleanup before opening its replacement', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const firstSource = new DelayedCloseAudioSource('https://example.com/first.mp3')
    const secondSource = new ObservedAudioSource('https://example.com/second.mp3')

    const firstLoad = engine.load(firstSource)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(firstSource.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await firstLoad
    await engine.play()
    audioElement.seeking = true
    const interruptedSeek = engine.seek(18)
    const interruptedSeekExpectation = expect(interruptedSeek).rejects.toMatchObject({ code: 'LOAD_ABORTED' })

    const secondLoad = engine.load(secondSource)
    await Promise.resolve()

    await interruptedSeekExpectation
    expect(firstSource.hasCloseStarted).toBe(true)
    expect(secondSource.openCalls).toBe(0)
    expect(audioElement.paused).toBe(true)
    expect(audioElement.src).toBe('')

    firstSource.finishClosing()
    await vi.waitFor(() => {
      expect(secondSource.openCalls).toBe(1)
    })
    audioElement.seeking = false
    audioElement.dispatchEvent(new Event('loadedmetadata'))

    await expect(secondLoad).resolves.toBeUndefined()
    expect(audioElement.src).toBe('https://example.com/second.mp3')
  })

  it('detaches and closes the old source even when replacement pausing fails', async () => {
    const audioElement = new ThrowingPauseAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const firstSource = new FakeAudioSource('https://example.com/first.mp3')
    const firstLoad = engine.load(firstSource)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(firstSource.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await firstLoad
    const blockedReplacement = new ObservedAudioSource('https://example.com/blocked.mp3')

    await expect(engine.load(blockedReplacement)).rejects.toBe(audioElement.pauseError)

    expect(firstSource.closeCalls).toBe(1)
    expect(blockedReplacement.openCalls).toBe(0)
    expect(audioElement.src).toBe('')
  })

  it('cancels a replacement load that is waiting on a never-settling close', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const firstSource = new NeverClosingAudioSource('https://example.com/first.mp3')
    const firstLoad = engine.load(firstSource)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(firstSource.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await firstLoad

    const replacementSource = new ObservedAudioSource('https://example.com/replacement.mp3')
    const replacementLoad = engine.load(replacementSource)
    const replacementExpectation = expect(replacementLoad).rejects.toMatchObject({ code: 'LOAD_ABORTED' })
    await vi.waitFor(() => {
      expect(firstSource.closeCalls).toBe(1)
    })
    expect(replacementSource.openCalls).toBe(0)

    engine.unload()
    await replacementExpectation

    expect(firstSource.closeCalls).toBe(1)
    expect(replacementSource.openCalls).toBe(0)
    expect(() => engine.dispose()).not.toThrow()
  })

  it('unloads the current source and removes event listeners on dispose', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/audio.mp3')
    const playingEvents: string[] = []
    engine.on('playing', () => playingEvents.push('playing'))

    const loading = engine.load(source)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(source.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await loading
    engine.dispose()
    audioElement.dispatchEvent(new Event('playing'))

    expect(source.closeCalls).toBe(1)
    expect(audioElement.src).toBe('')
    expect(playingEvents).toEqual([])
  })

  it('retries failed media detachment without repeating completed cleanup', async () => {
    const audioElement = new ThrowingDetachAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/audio.mp3')
    const loading = engine.load(source)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(source.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await loading

    expect(() => engine.dispose()).toThrow(audioElement.detachError)
    expect(source.closeCalls).toBe(1)
    expect(audioElement.src).toBe(source.url)
    expect(audioElement.removeCalls).toBe(1)

    expect(() => engine.dispose()).not.toThrow()
    expect(audioElement.src).toBe('')
    expect(audioElement.removeCalls).toBe(2)
    const loadCallsAfterCleanup = audioElement.loadCalls

    engine.dispose()
    expect(audioElement.removeCalls).toBe(2)
    expect(audioElement.loadCalls).toBe(loadCallsAfterCleanup)
  })

  it('still detaches and closes the source when pausing fails during disposal', async () => {
    const audioElement = new ThrowingPauseAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/audio.mp3')
    const loading = engine.load(source)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(source.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await loading

    expect(() => engine.dispose()).toThrow(audioElement.pauseError)
    expect(source.closeCalls).toBe(1)
    expect(audioElement.src).toBe('')

    expect(() => engine.dispose()).not.toThrow()
    expect(source.closeCalls).toBe(1)
  })

  it('continues disposal after listener removal fails and retries only that callback', async () => {
    const audioElement = new ThrowingListenerRemovalAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/audio.mp3')
    const loading = engine.load(source)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(source.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await loading
    const removalCallsBeforeDisposal = audioElement.removalCalls
    audioElement.failNextRemoval()

    expect(() => engine.dispose()).toThrow(audioElement.listenerRemovalError)
    expect(source.closeCalls).toBe(1)
    expect(audioElement.src).toBe('')
    expect(audioElement.removalCalls).toBe(removalCallsBeforeDisposal + 16)

    expect(() => engine.dispose()).not.toThrow()
    expect(audioElement.removalCalls).toBe(removalCallsBeforeDisposal + 17)
    engine.dispose()
    expect(audioElement.removalCalls).toBe(removalCallsBeforeDisposal + 17)
  })

  it('makes disposal idempotent and rejects every later control or registration', async () => {
    const audioElement = new FakeAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const source = new FakeAudioSource('https://example.com/audio.mp3')
    const loading = engine.load(source)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(source.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await loading

    engine.dispose()
    const loadCallsAfterDispose = audioElement.loadCalls
    engine.dispose()

    expect(source.closeCalls).toBe(1)
    expect(audioElement.loadCalls).toBe(loadCallsAfterDispose)

    const disposedOperations: Array<() => unknown> = [
      () => engine.unload(),
      () => engine.pause(),
      () => engine.stop(),
      () => engine.setPreload('auto'),
      () => engine.setAutoplay(true),
      () => engine.setVolume(0.5),
      () => engine.setMuted(true),
      () => engine.setLoop(true),
      () => engine.setPlaybackRate(1.25),
      () => engine.setPreservesPitch(false),
      () => engine.createAnalyzer(),
      () => engine.on('play', () => {}),
    ]
    for (const operation of disposedOperations) {
      expectDisposedEngineError(operation)
    }

    const unopenedSource = new ObservedAudioSource('https://example.com/replacement.mp3')
    await expect(engine.load(unopenedSource)).rejects.toMatchObject({ code: 'ENGINE_ERROR' })
    await expect(engine.play()).rejects.toMatchObject({ code: 'ENGINE_ERROR' })
    await expect(engine.seek(10)).rejects.toMatchObject({ code: 'ENGINE_ERROR' })
    await expect(engine.fastSeek(10)).rejects.toMatchObject({ code: 'ENGINE_ERROR' })
    expect(unopenedSource.openCalls).toBe(0)

    expect(() => engine.getPreload()).not.toThrow()
    expect(() => engine.getAutoplay()).not.toThrow()
    expect(() => engine.getVolume()).not.toThrow()
    expect(() => engine.isMuted()).not.toThrow()
    expect(() => engine.isLooping()).not.toThrow()
    expect(() => engine.getPlaybackRate()).not.toThrow()
    expect(() => engine.getPreservesPitch()).not.toThrow()
    expect(() => engine.getCurrentTime()).not.toThrow()
    expect(() => engine.getDuration()).not.toThrow()
    expect(() => engine.isPaused()).not.toThrow()
    expect(() => engine.isEnded()).not.toThrow()
    expect(() => engine.isSeeking()).not.toThrow()
    expect(() => engine.getBufferedRanges()).not.toThrow()
    expect(() => engine.getSeekableRanges()).not.toThrow()
    expect(() => engine.getPlayedRanges()).not.toThrow()
    expect(() => engine.canPlayType('audio/mpeg')).not.toThrow()
  })

  it('cannot resume playback when disposal wins an in-flight play request', async () => {
    const audioElement = new DelayedPlayAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)

    const playing = engine.play()
    engine.dispose()
    audioElement.finishPlaying()

    await expect(playing).rejects.toMatchObject({ code: 'ENGINE_ERROR' })
    expect(audioElement.paused).toBe(true)
  })

  it('reports and retries a failed pause after cancelled playback resolves late', async () => {
    const audioElement = new DelayedPlayWithLatePauseFailureAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const errorCodes: GAudioErrorCode[] = []
    const errorCauses: unknown[] = []
    engine.on('error', (error) => {
      errorCodes.push(error.code)
      errorCauses.push(error.cause)
    })
    const playing = engine.play()
    const playingExpectation = expect(playing).rejects.toMatchObject({ code: 'LOAD_ABORTED' })

    engine.pause()
    await playingExpectation
    audioElement.finishPlaying()
    await vi.waitFor(() => {
      expect(errorCodes).toEqual(['ENGINE_ERROR'])
    })

    // AI modified: one observable late-pause failure still gets a contained retry that restores paused state.
    expect(errorCauses).toEqual([audioElement.pauseError])
    expect(audioElement.pauseCalls).toBe(3)
    expect(audioElement.paused).toBe(true)
  })

  it.each([
    ['pause', 'LOAD_ABORTED'],
    ['stop', 'LOAD_ABORTED'],
    ['unload', 'LOAD_ABORTED'],
    ['dispose', 'ENGINE_ERROR'],
  ] as const)(
    'settles a never-resolving play request when %s interrupts it',
    async (operation, expectedCode) => {
      const audioElement = new NeverSettlingPlayAudioElement()
      const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
      const playbackOutcomes: unknown[] = []
      const playing = engine.play()
      void playing.then(
        () => playbackOutcomes.push('resolved'),
        error => playbackOutcomes.push(error),
      )

      engine[operation]()
      await vi.waitFor(() => {
        // AI modified: lifecycle cancellation cannot leave callers waiting on a browser play promise forever.
        expect(playbackOutcomes).toHaveLength(1)
      })
      expect(playbackOutcomes[0]).toMatchObject({ code: expectedCode })
      engine.dispose()
    },
  )

  it('cancels a pending source-less play before loading a new source', async () => {
    const audioElement = new NeverSettlingPlayAudioElement()
    const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)
    const playbackOutcomes: unknown[] = []
    void engine.play().then(
      () => playbackOutcomes.push('resolved'),
      error => playbackOutcomes.push(error),
    )

    const source = new FakeAudioSource('https://example.com/audio.mp3')
    const loading = engine.load(source)
    await vi.waitFor(() => {
      expect(audioElement.src).toBe(source.url)
    })
    audioElement.dispatchEvent(new Event('loadedmetadata'))
    await loading

    await vi.waitFor(() => {
      // AI modified: a new source generation supersedes playback started before any source was attached.
      expect(playbackOutcomes).toHaveLength(1)
    })
    expect(playbackOutcomes[0]).toMatchObject({ code: 'LOAD_ABORTED' })
  })
})
