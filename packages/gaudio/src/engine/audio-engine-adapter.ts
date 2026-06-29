import type { AdaptiveAudioProtocol } from '../adapters/adaptive-audio-types'
import type { AudioEngine } from './audio-engine'

/** Creates an engine for one adaptive streaming protocol. */
export interface AudioEngineAdapter {
  /** Adaptive protocol handled by this adapter. */
  readonly protocol: AdaptiveAudioProtocol
  /**
   * Creates a new engine for the adapter protocol.
   *
   * @returns An engine owned by the caller.
   * @throws `GAudioError` when the required playback implementation is unavailable.
   */
  createEngine: () => AudioEngine | Promise<AudioEngine>
  /**
   * Checks whether the current browser supports this adapter.
   *
   * @returns `true` when {@link createEngine} can create a usable engine.
   */
  isSupported: () => boolean
}
