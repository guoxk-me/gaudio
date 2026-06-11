import type { GAudioError } from './errors/errors'

export type PlaybackState
  = | 'idle'
    | 'loading'
    | 'ready'
    | 'playing'
    | 'paused'
    | 'buffering'
    | 'ended'
    | 'error'

export type PreloadMode = 'none' | 'metadata' | 'auto'

export type AudioFormatSupport = '' | 'maybe' | 'probably'

export type GAudioErrorCode
  = | 'SOURCE_UNAVAILABLE'
    | 'LOAD_ABORTED'
    | 'DECODE_FAILED'
    | 'PLAYBACK_BLOCKED'
    | 'UNSUPPORTED_FORMAT'
    | 'NETWORK_ERROR'
    | 'ENGINE_ERROR'

export interface TimeUpdate {
  currentTime: number
  duration: number
}

export interface TimeRange {
  start: number
  end: number
}

export interface BufferUpdate {
  ranges: readonly TimeRange[]
}

export interface DurationUpdate {
  duration: number
}

export interface VolumeUpdate {
  volume: number
  isMuted: boolean
}

export interface PlaybackRateUpdate {
  playbackRate: number
}

export interface AudioPlayerEvents {
  statechange: PlaybackState
  loadstart: undefined
  loadedmetadata: DurationUpdate
  canplay: undefined
  play: undefined
  playing: undefined
  pause: undefined
  waiting: undefined
  seeking: TimeUpdate
  seeked: TimeUpdate
  timeupdate: TimeUpdate
  durationchange: DurationUpdate
  bufferupdate: BufferUpdate
  volumechange: VolumeUpdate
  ratechange: PlaybackRateUpdate
  error: GAudioError
  ended: undefined
}

export interface AudioPlayerOptions {
  source?: string
  preload?: PreloadMode
  muted?: boolean
  loop?: boolean
  volume?: number
  playbackRate?: number
}

export interface FrequencyDataOptions {
  binCount?: number
}

export interface WaveformDataOptions {
  sampleCount?: number
}
