/** Controls how much media data the browser should preload. */
export type PreloadMode = 'none' | 'metadata' | 'auto'

/** Indicates the browser's confidence that it can play a MIME type. */
export type AudioFormatSupport = '' | 'maybe' | 'probably'

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
