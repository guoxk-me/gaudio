import type { AudioEngineAdapter } from '../engine/audio-engine-adapter'
import type { PreloadMode } from '../engine/audio-engine-types'
import type { AudioSourceInput } from '../source/audio-source'

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
