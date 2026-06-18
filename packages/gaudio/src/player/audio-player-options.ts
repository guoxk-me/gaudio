import type { AudioAnalyzer } from '../analysis/audio-analyzer'
import type { AudioEngine } from '../engine/audio-engine'
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

/** Context passed to custom player analyzer factories. */
export interface AudioPlayerAnalyzerContext {
  /** Engine currently owned by the player. */
  engine: AudioEngine
  /** Effective FFT size requested by player configuration. */
  fftSize: number
}

/** Creates a custom analyzer for an {@link AudioPlayer}. */
export type AudioPlayerAnalyzerFactory = (context: AudioPlayerAnalyzerContext) => AudioAnalyzer | undefined

/** Configures player-owned audio analysis. */
export interface AudioPlayerAnalyzerOptions {
  /**
   * Whether player-owned analysis should be created after a source loads.
   *
   * @defaultValue `true`
   */
  enabled?: boolean
  /**
   * FFT window size passed to the default or custom analyzer.
   *
   * @defaultValue `2048`
   */
  fftSize?: number
  /**
   * Custom analyzer factory for engines or Web Audio graphs owned by the application.
   *
   * When omitted, the player asks the active engine to create an analyzer.
   */
  createAnalyzer?: AudioPlayerAnalyzerFactory
}

/** Configures a new {@link AudioPlayer}. */
export interface AudioPlayerOptions {
  /** Initial source. It is not loaded until {@link AudioPlayer.load} or {@link AudioPlayer.play} runs. */
  source?: AudioSourceInput
  /** Adaptive protocol adapters available to the internally managed engine router. */
  adapters?: readonly AudioEngineAdapter[]
  /**
   * Enables player-owned audio analysis.
   *
   * Use `true` for the default media-element analyzer, or pass options for FFT sizing and custom engine integration.
   */
  analyzer?: boolean | AudioPlayerAnalyzerOptions
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
