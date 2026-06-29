// @env browser

import type Hls from 'hls.js'
import type { HlsConfig, LoaderConfig, RetryConfig } from 'hls.js'
import type { AudioEngine } from '../../engine/audio-engine'
import type { AudioEngineAdapter } from '../../engine/audio-engine-adapter'
import type { AdaptiveContentType } from '../adaptive-audio-types'
import { GAudioError } from '../../errors/errors'
import { AdaptivePlaybackPreset } from '../adaptive-audio-types'
import { settingsWithChanges } from '../settings-with-changes'
import { HlsAudioEngine } from './hls-audio-engine'
import { hlsConfigForPlayback } from './hls-playback-config'

/** Determines whether HLS prefers native playback or `hls.js`. */
export type HlsPlaybackStrategy = 'native-first' | 'hls-first' | 'native-only' | 'hls-only'

/** Partial retry settings accepted by an HLS request policy override. */
export type HlsRetryConfigChanges = Partial<RetryConfig>
/** Partial loader settings with independently mergeable retry branches. */
export type HlsLoaderConfigChanges = Omit<Partial<LoaderConfig>, 'timeoutRetry' | 'errorRetry'> & {
  timeoutRetry?: HlsRetryConfigChanges | null
  errorRetry?: HlsRetryConfigChanges | null
}
/** Partial default loader policy for one HLS request category. */
export interface HlsLoadPolicyChanges { default?: HlsLoaderConfigChanges }

/** HLS constructor settings with deep partial request policies. */
export type HlsAdapterConfig = Omit<
  Partial<HlsConfig>,
  'manifestLoadPolicy' | 'playlistLoadPolicy' | 'fragLoadPolicy' | 'keyLoadPolicy'
> & {
  manifestLoadPolicy?: HlsLoadPolicyChanges
  playlistLoadPolicy?: HlsLoadPolicyChanges
  fragLoadPolicy?: HlsLoadPolicyChanges
  keyLoadPolicy?: HlsLoadPolicyChanges
}

/** Controls when an HLS configuration update is applied. */
export interface HlsConfigUpdateOptions {
  /**
   * Apply on the next load or recreate the active `hls.js` engine immediately.
   *
   * @defaultValue `'next-load'`
   */
  apply?: 'next-load' | 'reload'
  /**
   * Restore the current playback position after an explicit reload.
   *
   * @defaultValue `true`
   */
  restorePosition?: boolean
  /** Resume playback after an explicit reload. Defaults to the pre-reload playback state. */
  resumePlayback?: boolean
}

/** Configures an adapter created by {@link createHlsAdapter}. */
export interface HlsAdapterOptions {
  /**
   * Content shape used to tune buffering, live latency, and retry behavior.
   *
   * @defaultValue `'vod'`
   */
  contentType?: AdaptiveContentType
  /**
   * Audio configuration profile applied before content type tuning and explicit `config` overrides.
   *
   * @defaultValue {@link AdaptivePlaybackPreset.Balanced}
   */
  preset?: AdaptivePlaybackPreset
  /**
   * Native and `hls.js` selection order.
   *
   * @defaultValue `'native-first'`
   */
  playbackStrategy?: HlsPlaybackStrategy
  /** Initial `hls.js` constructor configuration. Ignored when native HLS is selected. */
  config?: HlsAdapterConfig
}

/** HLS adapter with runtime configuration and implementation diagnostics. */
export interface HlsAudioAdapter extends AudioEngineAdapter {
  /** Active `hls.js` instance, or `undefined` before loading and during native HLS playback. */
  readonly hlsInstance: Hls | undefined
  /** Selected implementation for the active engine, or `undefined` when no engine is active. */
  readonly implementation: 'native' | 'hls.js' | undefined
  /** @returns An isolated readonly copy of the configuration used for future `hls.js` engines. */
  getConfig: () => Readonly<Partial<HlsConfig>>
  /**
   * Updates configuration for future loads and optionally recreates the active `hls.js` engine.
   *
   * Reloading interrupts playback and does not preserve buffered segments, requests, estimates, or retry state.
   *
   * @param config `hls.js` settings to merge into the current configuration.
   * @param options Application timing and reload restoration behavior.
   * @returns A promise that resolves after an optional reload completes.
   */
  updateConfig: (config: HlsAdapterConfig, options?: HlsConfigUpdateOptions) => Promise<void>
}

interface HlsAdapterDependencies {
  audioElementFactory: () => HTMLAudioElement
  createHls: (config: Partial<HlsConfig>) => Hls
  isHlsSupported: () => boolean
}

export class HlsAudioAdapterImpl implements HlsAudioAdapter {
  readonly protocol = 'hls'
  hlsInstance: Hls | undefined
  implementation: 'native' | 'hls.js' | undefined

  private readonly playbackStrategy: HlsPlaybackStrategy
  private readonly dependencies: HlsAdapterDependencies
  private config: Partial<HlsConfig>
  private activeEngine?: HlsAudioEngine

  constructor(options: HlsAdapterOptions = {}, dependencies: HlsAdapterDependencies) {
    this.playbackStrategy = options.playbackStrategy ?? 'native-first'
    // AI modified: request policy overrides merge deeply without altering vendor callbacks or classes.
    this.config = settingsWithChanges(
      hlsConfigForPlayback(
        options.preset ?? AdaptivePlaybackPreset.Balanced,
        options.contentType ?? 'vod',
      ),
      options.config ?? {},
    )
    this.dependencies = dependencies
  }

  isSupported(): boolean {
    return this.selectImplementation(false) !== undefined
  }

  createEngine(): AudioEngine {
    const implementation = this.selectImplementation(true)
    if (!implementation) {
      throw new GAudioError('PROTOCOL_UNSUPPORTED', 'HLS playback is not supported in this browser')
    }

    const audioElement = this.dependencies.audioElementFactory()
    const engine = new HlsAudioEngine({
      implementation,
      config: settingsWithChanges<Partial<HlsConfig>>({}, this.config),
      audioElement,
      createHls: this.dependencies.createHls,
      onHlsInstanceChange: (instance) => {
        if (this.activeEngine === engine) {
          this.hlsInstance = instance
        }
      },
      onDispose: () => {
        if (this.activeEngine === engine) {
          this.activeEngine = undefined
          this.hlsInstance = undefined
          this.implementation = undefined
        }
      },
    })
    this.activeEngine = engine
    this.implementation = implementation
    return engine
  }

  getConfig(): Readonly<Partial<HlsConfig>> {
    return settingsWithChanges<Partial<HlsConfig>>({}, this.config)
  }

  async updateConfig(config: HlsAdapterConfig, options: HlsConfigUpdateOptions = {}): Promise<void> {
    this.config = settingsWithChanges(this.config, config)

    if (options.apply !== 'reload' || !this.activeEngine) {
      return
    }

    // AI modified: reload is explicit because many hls.js constructor options cannot change in place.
    await this.activeEngine.reload(settingsWithChanges<Partial<HlsConfig>>({}, this.config), {
      restorePosition: options.restorePosition ?? true,
      resumePlayback: options.resumePlayback,
    })
  }

  private selectImplementation(shouldThrow: boolean): 'native' | 'hls.js' | undefined {
    const nativeSupported = this.supportsNativeHls()
    const hlsSupported = this.dependencies.isHlsSupported()

    switch (this.playbackStrategy) {
      case 'native-first':
        return nativeSupported ? 'native' : hlsSupported ? 'hls.js' : undefined
      case 'hls-first':
        return hlsSupported ? 'hls.js' : nativeSupported ? 'native' : undefined
      case 'native-only':
        if (nativeSupported) {
          return 'native'
        }
        break
      case 'hls-only':
        if (hlsSupported) {
          return 'hls.js'
        }
        break
    }

    if (shouldThrow) {
      throw new GAudioError('PROTOCOL_UNSUPPORTED', `HLS strategy ${this.playbackStrategy} is not supported in this browser`)
    }
    return undefined
  }

  private supportsNativeHls(): boolean {
    const audioElement = this.dependencies.audioElementFactory()
    return audioElement.canPlayType('application/vnd.apple.mpegurl') !== ''
      || audioElement.canPlayType('application/x-mpegurl') !== ''
  }
}
