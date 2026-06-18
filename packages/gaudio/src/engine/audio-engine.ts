import type {
  AdaptiveManifestUpdate,
  AdaptivePlaybackInfo,
  AdaptiveSegmentUpdate,
  AdaptiveStreamError,
  AdaptiveVariantUpdate,
} from '../adapters/adaptive-audio-types'
import type { AudioAnalyzer, AudioAnalyzerOptions } from '../analysis/audio-analyzer'
import type { GAudioError } from '../errors/errors'
import type { AudioSource } from '../source/audio-source'
import type {
  AudioFormatSupport,
  BufferUpdate,
  DurationUpdate,
  PlaybackRateUpdate,
  PreloadMode,
  TimeRange,
  TimeUpdate,
  VolumeUpdate,
} from './audio-engine-types'

/** Maps low-level engine events to the payload delivered to listeners. */
export interface AudioEngineEvents {
  /** Emitted when source loading starts. */
  loadstart: undefined
  /** Emitted when metadata and duration become available. */
  loadedmetadata: DurationUpdate
  /** Emitted when playback can begin. */
  canplay: undefined
  /** Emitted when playback is requested. */
  play: undefined
  /** Emitted when playback is actively progressing. */
  playing: undefined
  /** Emitted when playback pauses. */
  pause: undefined
  /** Emitted when playback waits for more media data. */
  waiting: undefined
  /** Emitted when seeking begins. */
  seeking: TimeUpdate
  /** Emitted when seeking completes. */
  seeked: TimeUpdate
  /** Emitted when the playback position changes. */
  timeupdate: TimeUpdate
  /** Emitted when the known duration changes. */
  durationchange: DurationUpdate
  /** Emitted when buffered media ranges change. */
  bufferupdate: BufferUpdate
  /** Emitted when volume or mute state changes. */
  volumechange: VolumeUpdate
  /** Emitted when playback speed changes. */
  ratechange: PlaybackRateUpdate
  /** Emitted when an adaptive implementation becomes active. */
  adaptivechange: AdaptivePlaybackInfo
  /** Emitted when an adaptive manifest and its variants have loaded. */
  manifestloaded: AdaptiveManifestUpdate
  /** Emitted when adaptive bitrate selection changes variants. */
  variantchange: AdaptiveVariantUpdate
  /** Emitted before an adaptive media segment starts loading. */
  segmentloadstart: AdaptiveSegmentUpdate
  /** Emitted after an adaptive media segment finishes loading. */
  segmentloaded: AdaptiveSegmentUpdate
  /** Emitted for recoverable and fatal adaptive streaming failures. */
  streamerror: AdaptiveStreamError
  /** Emitted when playback reaches the end of a non-looping source. */
  ended: undefined
  /** Emitted when loading or playback fails. */
  error: GAudioError
}

// AI modified: shared event names keep router and player forwarding aligned with the event contract.
export const audioEngineEventNames = [
  'loadstart',
  'loadedmetadata',
  'canplay',
  'play',
  'playing',
  'pause',
  'waiting',
  'seeking',
  'seeked',
  'timeupdate',
  'durationchange',
  'bufferupdate',
  'volumechange',
  'ratechange',
  'adaptivechange',
  'manifestloaded',
  'variantchange',
  'segmentloadstart',
  'segmentloaded',
  'streamerror',
  'ended',
  'error',
] as const satisfies readonly (keyof AudioEngineEvents)[]

/** Playback engine contract used by {@link AudioPlayer} and adaptive adapters. */
export interface AudioEngine {
  /**
   * Loads a source and resolves when its metadata is available.
   *
   * @param source Source to open and attach to the engine.
   */
  load: (source: AudioSource) => Promise<void>
  /** Cancels loading and detaches the current source. */
  unload: () => void
  /** Starts or resumes playback. */
  play: () => Promise<void>
  /** Pauses playback without changing the current position. */
  pause: () => void
  /** Pauses playback and returns to the beginning while retaining the source. */
  stop: () => void
  /** @param seconds Target playback position in seconds. */
  seek: (seconds: number) => Promise<void>
  /** @param seconds Target playback position in seconds for the optimized seek path. */
  fastSeek: (seconds: number) => Promise<void>
  /** @param preload Browser preload hint for current and future sources. */
  setPreload: (preload: PreloadMode) => void
  /** Returns the current browser preload hint. */
  getPreload: () => PreloadMode
  /** @param shouldAutoplay Whether engine-native autoplay should be enabled. */
  setAutoplay: (shouldAutoplay: boolean) => void
  /** Returns whether engine-native autoplay is enabled. */
  getAutoplay: () => boolean
  /** @param volume Linear output volume between `0` and `1`. */
  setVolume: (volume: number) => void
  /** Returns linear output volume between `0` and `1`. */
  getVolume: () => number
  /** @param isMuted Whether audio output should be muted. */
  setMuted: (isMuted: boolean) => void
  /** Returns whether output is muted. */
  isMuted: () => boolean
  /** @param isLooping Whether playback should restart after reaching the end. */
  setLoop: (isLooping: boolean) => void
  /** Returns whether playback looping is enabled. */
  isLooping: () => boolean
  /** @param rate Playback speed multiplier, where `1` is normal speed. */
  setPlaybackRate: (rate: number) => void
  /** Returns the playback speed multiplier. */
  getPlaybackRate: () => number
  /** @param shouldPreservePitch Whether pitch should remain stable when playback speed changes. */
  setPreservesPitch: (shouldPreservePitch: boolean) => void
  /** Returns whether pitch preservation is enabled. */
  getPreservesPitch: () => boolean
  /** Returns the current playback position in seconds. */
  getCurrentTime: () => number
  /** Returns media duration in seconds, or `0` when unknown. */
  getDuration: () => number
  /** Returns whether playback is paused. */
  isPaused: () => boolean
  /** Returns whether playback has reached the end. */
  isEnded: () => boolean
  /** Returns whether a seek operation is in progress. */
  isSeeking: () => boolean
  /** Returns currently buffered media ranges in seconds. */
  getBufferedRanges: () => readonly TimeRange[]
  /** Returns currently seekable media ranges in seconds. */
  getSeekableRanges: () => readonly TimeRange[]
  /** Returns media ranges played during the current source lifecycle. */
  getPlayedRanges: () => readonly TimeRange[]
  /**
   * Reports whether the engine can play a MIME type.
   *
   * @param mimeType MIME type with optional codec parameters.
   */
  canPlayType: (mimeType: string) => AudioFormatSupport
  /**
   * Creates an analyzer for the active engine signal when supported.
   *
   * Engines that do not expose a Web Audio signal can omit this method.
   *
   * @param options Analyzer node configuration.
   */
  createAnalyzer?: (options?: AudioAnalyzerOptions) => AudioAnalyzer | undefined
  /**
   * Registers an engine event listener.
   *
   * @param eventName Event to observe.
   * @param handler Listener invoked with the event payload.
   * @returns A function that removes this listener.
   */
  on: <EventName extends keyof AudioEngineEvents>(
    eventName: EventName,
    handler: (payload: AudioEngineEvents[EventName]) => void,
  ) => () => void
  /** Releases listeners, active loads, sources, and vendor resources. */
  dispose: () => void
}
