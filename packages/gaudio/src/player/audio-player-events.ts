import type { AudioEngineEvents } from '../engine/audio-engine'
import type { PlaybackState } from './audio-player-options'

/** Maps each {@link AudioPlayer} event name to its listener payload. */
export interface AudioPlayerEvents extends AudioEngineEvents {
  /** Emitted whenever the public playback state changes. */
  statechange: PlaybackState
}
