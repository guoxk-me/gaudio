import type { AudioProtocol } from '../source/audio-source'

/** Identifies a manifest-based adaptive streaming protocol. */
export type AdaptiveAudioProtocol = Exclude<AudioProtocol, 'media'>

/** Identifies the active native or vendor-backed adaptive playback implementation. */
export type AdaptivePlaybackImplementation = 'native' | 'hls.js' | 'dash.js'

/** Selects the content shape used to tune adaptive buffering, latency, and recovery. */
export type AdaptiveContentType = 'vod' | 'long-form' | 'live'

// AI modified: shared presets keep HLS and DASH playback profiles aligned.
/** Selects a vendor-specific adaptive audio configuration profile. */
export enum AdaptivePlaybackPreset {
  FastStart = 'fast-start',
  Balanced = 'balanced',
  Stable = 'stable',
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
  reason: 'initial' | 'automatic' | 'manual'
}

/** Identifies automatic adaptive selection or a manually selected variant. */
export type AdaptiveQualitySelection = 'auto' | string

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
