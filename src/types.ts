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

export type GAudioErrorCode
  = | 'SOURCE_UNAVAILABLE'
    | 'LOAD_ABORTED'
    | 'DECODE_FAILED'
    | 'PLAYBACK_BLOCKED'
    | 'UNSUPPORTED_FORMAT'
    | 'NETWORK_ERROR'
    | 'BACKEND_ERROR'

export interface TimeUpdate {
  currentTime: number
  duration: number
}

export interface BufferUpdate {
  bufferedStart: number
  bufferedEnd: number
}

export interface AudioPlayerEvents {
  statechange: PlaybackState
  timeupdate: TimeUpdate
  bufferupdate: BufferUpdate
  error: GAudioError
  ended: undefined
}

export interface AudioPlayerOptions {
  source?: string
  preload?: PreloadMode
  lowLatency?: boolean
}

export interface FrequencyDataOptions {
  binCount?: number
}

export interface WaveformDataOptions {
  sampleCount?: number
}
