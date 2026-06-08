import type { GAudioError } from '../errors/errors'
import type { AudioSource } from '../source/audio-source'
import type { BufferUpdate, TimeUpdate } from '../types'

export interface AudioBackendEvents {
  timeupdate: TimeUpdate
  bufferupdate: BufferUpdate
  ended: undefined
  error: GAudioError
}

export interface AudioBackend {
  load: (source: AudioSource) => Promise<void>
  play: () => Promise<void>
  pause: () => void
  stop: () => void
  seek: (seconds: number) => Promise<void>
  setVolume: (volume: number) => void
  setPlaybackRate: (rate: number) => void
  getCurrentTime: () => number
  getDuration: () => number
  on: <EventName extends keyof AudioBackendEvents>(
    eventName: EventName,
    handler: (payload: AudioBackendEvents[EventName]) => void,
  ) => () => void
  dispose: () => void
}
