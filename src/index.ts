export { AudioAnalyzer } from './analysis/audio-analyzer'
export type { AudioBackend, AudioBackendEvents } from './backend/audio-backend'
export { MediaElementBackend } from './backend/media-element-backend'
export { GAudioError } from './errors/errors'
export { EventEmitter } from './events/event-emitter'
export { AudioPlayer } from './player/audio-player'
export type { AudioSource, AudioSourceKind, AudioStreamHandle } from './source/audio-source'
export { HttpAudioSource } from './source/http-audio-source'
export type {
  AudioPlayerEvents,
  AudioPlayerOptions,
  BufferUpdate,
  FrequencyDataOptions,
  GAudioErrorCode,
  PlaybackState,
  PreloadMode,
  TimeUpdate,
  WaveformDataOptions,
} from './types'
