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
} from '../types'

export interface AudioEngineEvents {
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
  ended: undefined
  error: GAudioError
}

export interface AudioEngine {
  load: (source: AudioSource) => Promise<void>
  unload: () => void
  play: () => Promise<void>
  pause: () => void
  stop: () => void
  seek: (seconds: number) => Promise<void>
  setPreload: (preload: PreloadMode) => void
  getPreload: () => PreloadMode
  setVolume: (volume: number) => void
  getVolume: () => number
  setMuted: (isMuted: boolean) => void
  isMuted: () => boolean
  setLoop: (isLooping: boolean) => void
  isLooping: () => boolean
  setPlaybackRate: (rate: number) => void
  getPlaybackRate: () => number
  getCurrentTime: () => number
  getDuration: () => number
  isPaused: () => boolean
  isEnded: () => boolean
  isSeeking: () => boolean
  getBufferedRanges: () => readonly TimeRange[]
  getSeekableRanges: () => readonly TimeRange[]
  canPlayType: (mimeType: string) => AudioFormatSupport
  on: <EventName extends keyof AudioEngineEvents>(
    eventName: EventName,
    handler: (payload: AudioEngineEvents[EventName]) => void,
  ) => () => void
  dispose: () => void
}
