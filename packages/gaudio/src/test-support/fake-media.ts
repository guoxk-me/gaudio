import type { TimeRange } from '../engine/audio-engine-types'

export class FakeTimeRanges implements TimeRanges {
  constructor(private readonly ranges: readonly TimeRange[] = []) {}

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

interface FakeAudioElementOptions {
  nativeHlsSupport?: CanPlayTypeResult
  playableMimeTypes?: Readonly<Record<string, CanPlayTypeResult>>
}

// AI modified: shared test media fakes keep browser behavior consistent across engine and adapter tests.
export class FakeAudioElement extends EventTarget {
  src = ''
  preload = 'metadata'
  volume = 1
  muted = false
  loop = false
  autoplay = false
  preservesPitch = true
  playbackRate = 1
  currentTime = 0
  duration = 120
  paused = true
  ended = false
  seeking = false
  buffered: TimeRanges = new FakeTimeRanges()
  seekable: TimeRanges = new FakeTimeRanges()
  played: TimeRanges = new FakeTimeRanges()
  error: MediaError | null = null
  loadCalls = 0
  playCalls = 0
  fastSeekCalls: number[] = []
  fastSeek?: (seconds: number) => void

  private readonly nativeHlsSupport: CanPlayTypeResult
  private readonly playableMimeTypes: Readonly<Record<string, CanPlayTypeResult>>

  constructor(options: FakeAudioElementOptions = {}) {
    super()
    this.nativeHlsSupport = options.nativeHlsSupport ?? ''
    this.playableMimeTypes = options.playableMimeTypes ?? { 'audio/mpeg': 'probably' }
  }

  load(): void {
    this.loadCalls += 1
  }

  async play(): Promise<void> {
    this.playCalls += 1
    this.paused = false
  }

  pause(): void {
    this.paused = true
  }

  canPlayType(mimeType: string): CanPlayTypeResult {
    return mimeType.includes('mpegurl')
      ? this.nativeHlsSupport
      : this.playableMimeTypes[mimeType] ?? ''
  }

  removeAttribute(name: string): void {
    if (name === 'src') {
      this.src = ''
    }
  }
}
