// @env browser

import type { HlsAdapterOptions, HlsAudioAdapter } from './hls-audio-adapter'
import Hls from 'hls.js'
import { HlsAudioAdapterImpl } from './hls-audio-adapter'

export type {
  HlsAdapterConfig,
  HlsAdapterOptions,
  HlsAudioAdapter,
  HlsConfigUpdateOptions,
  HlsLoaderConfigChanges,
  HlsLoadPolicyChanges,
  HlsPlaybackStrategy,
  HlsRetryConfigChanges,
} from './hls-audio-adapter'
export type { HlsConfig } from 'hls.js'

/**
 * Creates an HLS adapter for use in `AudioPlayerOptions.adapters`.
 *
 * Importing this entry point requires the optional `hls.js` peer dependency.
 *
 * @param options Playback strategy and initial `hls.js` configuration.
 * @returns A reusable HLS adapter. One adapter can be owned by only one active player router.
 */
export function createHlsAdapter(options: HlsAdapterOptions = {}): HlsAudioAdapter {
  return new HlsAudioAdapterImpl(options, {
    audioElementFactory: () => new Audio(),
    createHls: config => new Hls(config),
    isHlsSupported: () => Hls.isSupported(),
  })
}
