import type { AdaptiveAudioProtocol } from '../adapters/adaptive-audio-types'
import type { AudioEngine } from './audio-engine'

/**
 * Creates an engine for one adaptive streaming protocol.
 *
 * An adapter instance can belong to only one live or still-cleaning-up router.
 * Registering it elsewhere before the owning router finishes cleanup throws `TypeError`.
 */
export interface AudioEngineAdapter {
  /** Adaptive protocol handled by this adapter. */
  readonly protocol: AdaptiveAudioProtocol
  /**
   * Creates a new engine for the adapter protocol.
   *
   * @returns An engine owned by the caller.
   * @throws Built-in adapters use `GAudioError` when the required playback implementation is unavailable. Custom adapters can propagate their own errors.
   */
  createEngine: () => AudioEngine | Promise<AudioEngine>
  /**
   * Checks the current browser capabilities required by this adapter.
   *
   * This synchronous probe does not load an optional vendor peer. A later
   * {@link createEngine} call can still fail if that peer cannot be imported
   * or its runtime support check rejects the environment.
   *
   * @returns `true` when the browser exposes a potential native or vendor-backed playback path.
   */
  isSupported: () => boolean
}
