import type { AudioEngineAdapter } from './engine/audio-engine-adapter'
import type { GAudioError } from './errors/errors'
import type { AudioSourceInput } from './source/audio-source'

/** Describes the current lifecycle state of an {@link AudioPlayer}. */
export type PlaybackState
  = | 'idle'
    | 'loading'
    | 'ready'
    | 'playing'
    | 'paused'
    | 'buffering'
    | 'ended'
    | 'error'

/** Controls how much media data the browser should preload. */
export type PreloadMode = 'none' | 'metadata' | 'auto'

/** Indicates the browser's confidence that it can play a MIME type. */
export type AudioFormatSupport = '' | 'maybe' | 'probably'

/** Identifies the transport or manifest protocol used by an audio source. */
export type AudioProtocol = 'media' | 'hls' | 'dash'

/** Identifies a manifest-based adaptive streaming protocol. */
export type AdaptiveAudioProtocol = Exclude<AudioProtocol, 'media'>

/** Identifies the active native or vendor-backed adaptive playback implementation. */
export type AdaptivePlaybackImplementation = 'native' | 'hls.js' | 'dash.js'

// AI modified: shared presets keep HLS and DASH playback profiles aligned.
/** Selects a vendor-specific adaptive audio VOD configuration profile. */
export enum AdaptivePlaybackPreset {
  FastStart = 'fast-start',
  Balanced = 'balanced',
  Stable = 'stable',
}

/** Describes a URL-backed audio source and optional protocol hints. */
export interface AudioSourceDescription {
  /** URL passed to the selected playback engine. */
  url: string
  /** Explicit protocol override for URLs that cannot be identified by MIME type or extension. */
  protocol?: AudioProtocol
  /** MIME type used for protocol selection and browser capability checks. */
  mimeType?: string
}

/** Identifies a failure reported by gaudio. */
export type GAudioErrorCode
  = | 'SOURCE_UNAVAILABLE'
    | 'ADAPTER_UNAVAILABLE'
    | 'PROTOCOL_UNSUPPORTED'
    | 'MANIFEST_ERROR'
    | 'SEGMENT_ERROR'
    | 'ADAPTIVE_STREAM_ERROR'
    | 'LOAD_ABORTED'
    | 'DECODE_FAILED'
    | 'PLAYBACK_BLOCKED'
    | 'UNSUPPORTED_FORMAT'
    | 'NETWORK_ERROR'
    | 'ENGINE_ERROR'

/** Reports the playback position and media duration in seconds. */
export interface TimeUpdate {
  /** Current playback position in seconds. */
  currentTime: number
  /** Media duration in seconds, or `0` when it is not known. */
  duration: number
}

/** Describes a continuous media time range in seconds. */
export interface TimeRange {
  /** Inclusive start time in seconds. */
  start: number
  /** End time in seconds. */
  end: number
}

/** Reports the currently buffered media ranges. */
export interface BufferUpdate {
  /** Buffered ranges in ascending playback order. */
  ranges: readonly TimeRange[]
}

/** Reports the current media duration. */
export interface DurationUpdate {
  /** Media duration in seconds, or `0` when it is not known. */
  duration: number
}

/** Reports the effective volume and mute state. */
export interface VolumeUpdate {
  /** Linear volume between `0` and `1`. */
  volume: number
  /** Whether audio output is muted. */
  isMuted: boolean
}

/** Reports the effective playback speed. */
export interface PlaybackRateUpdate {
  /** Playback speed multiplier, where `1` is the normal rate. */
  playbackRate: number
}

/** Identifies the adaptive protocol and implementation serving the active source. */
export interface AdaptivePlaybackInfo {
  /** Adaptive streaming protocol used by the source. */
  protocol: AdaptiveAudioProtocol
  /** Native or vendor library implementation used for playback. */
  implementation: AdaptivePlaybackImplementation
}

/** Describes a bitrate variant declared by an adaptive manifest. */
export interface AdaptiveVariant {
  /** Vendor-provided identifier for the variant. */
  id: string
  /** Declared bitrate in bits per second. */
  bitrate: number
  /** Codec declaration reported by the manifest, when available. */
  codecs?: string
}

/** Reports that an adaptive manifest has loaded. */
export interface AdaptiveManifestUpdate extends AdaptivePlaybackInfo {
  /** Manifest URL used for the active load. */
  url: string
  /** Audio variants discovered in the manifest. */
  variants: readonly AdaptiveVariant[]
}

/** Reports an initial or automatic adaptive quality selection. */
export interface AdaptiveVariantUpdate extends AdaptivePlaybackInfo {
  /** Previously selected variant identifier, when known. */
  previousVariantId?: string
  /** Newly selected variant identifier, when known. */
  variantId?: string
  /** Newly selected bitrate in bits per second, when known. */
  bitrate?: number
  /** Reason the implementation selected the variant. */
  reason: 'initial' | 'automatic'
}

/** Reports the start or completion of an adaptive media segment request. */
export interface AdaptiveSegmentUpdate extends AdaptivePlaybackInfo {
  /** Segment URL, when exposed by the playback implementation. */
  url?: string
  /** Variant identifier associated with the segment, when known. */
  variantId?: string
  /** Segment duration in seconds, when reported by the implementation. */
  duration?: number
}

/** Describes a recoverable or fatal adaptive streaming failure. */
export interface AdaptiveStreamError extends AdaptivePlaybackInfo {
  /** Broad failure category that is independent of the vendor library. */
  category: 'manifest' | 'network' | 'media' | 'segment' | 'other'
  /** Whether playback cannot continue without replacing or reloading the source. */
  isFatal: boolean
  /** Vendor-specific error code, when available. */
  code?: string
  /** Original error or vendor event supplied for diagnostics. */
  cause?: unknown
}

/** Maps each {@link AudioPlayer} event name to its listener payload. */
export interface AudioPlayerEvents {
  /** Emitted whenever the public playback state changes. */
  statechange: PlaybackState
  /** Emitted when the active engine starts loading a source. */
  loadstart: undefined
  /** Emitted after media metadata, including duration, becomes available. */
  loadedmetadata: DurationUpdate
  /** Emitted when enough media is available to begin playback. */
  canplay: undefined
  /** Emitted when playback has been requested by the media engine. */
  play: undefined
  /** Emitted when playback is actively progressing. */
  playing: undefined
  /** Emitted when playback pauses. */
  pause: undefined
  /** Emitted when playback is waiting for more media data. */
  waiting: undefined
  /** Emitted when a seek operation begins. */
  seeking: TimeUpdate
  /** Emitted when a seek operation completes. */
  seeked: TimeUpdate
  /** Emitted when the current playback position changes. */
  timeupdate: TimeUpdate
  /** Emitted when the known media duration changes. */
  durationchange: DurationUpdate
  /** Emitted when the browser's buffered ranges change. */
  bufferupdate: BufferUpdate
  /** Emitted when volume or mute state changes. */
  volumechange: VolumeUpdate
  /** Emitted when the playback speed changes. */
  ratechange: PlaybackRateUpdate
  /** Emitted when an adaptive source selects its playback implementation. */
  adaptivechange: AdaptivePlaybackInfo
  /** Emitted when an adaptive manifest has loaded and its variants are known. */
  manifestloaded: AdaptiveManifestUpdate
  /** Emitted when adaptive bitrate selection changes the active variant. */
  variantchange: AdaptiveVariantUpdate
  /** Emitted immediately before an adaptive media segment starts loading. */
  segmentloadstart: AdaptiveSegmentUpdate
  /** Emitted after an adaptive media segment finishes loading. */
  segmentloaded: AdaptiveSegmentUpdate
  /** Emitted for recoverable and fatal adaptive streaming failures. */
  streamerror: AdaptiveStreamError
  /** Emitted when loading or playback encounters a gaudio error. */
  error: GAudioError
  /** Emitted when playback reaches the end of a non-looping source. */
  ended: undefined
}

/** Configures a new {@link AudioPlayer}. */
export interface AudioPlayerOptions {
  /** Initial source. It is not loaded until {@link AudioPlayer.load} or {@link AudioPlayer.play} runs. */
  source?: AudioSourceInput
  /** Adaptive protocol adapters available to the internally managed engine router. */
  adapters?: readonly AudioEngineAdapter[]
  /**
   * Browser preload hint.
   *
   * @defaultValue `'metadata'`
   */
  preload?: PreloadMode
  /**
   * Whether {@link AudioPlayer.load} should attempt playback after loading.
   *
   * @defaultValue `false`
   */
  autoplay?: boolean
  /**
   * Whether audio output starts muted.
   *
   * @defaultValue `false`
   */
  muted?: boolean
  /**
   * Whether playback restarts automatically after reaching the end.
   *
   * @defaultValue `false`
   */
  loop?: boolean
  /**
   * Initial linear volume between `0` and `1`.
   *
   * @defaultValue `1`
   */
  volume?: number
  /**
   * Initial playback speed multiplier greater than `0`.
   *
   * @defaultValue `1`
   */
  playbackRate?: number
  /**
   * Whether pitch should remain stable when playback speed changes.
   *
   * @defaultValue `true`
   */
  preservesPitch?: boolean
}

/** Configures frequency-domain samples returned by {@link AudioAnalyzer.getFrequencyData}. */
export interface FrequencyDataOptions {
  /** Number of frequency bins to return. Defaults to the analyzer node's `frequencyBinCount`. */
  binCount?: number
}

/** Configures time-domain samples returned by {@link AudioAnalyzer.getWaveformData}. */
export interface WaveformDataOptions {
  /** Number of waveform samples to return. Defaults to the analyzer node's `fftSize`. */
  sampleCount?: number
}
