// @env browser

import type { HlsAdapterOptions, HlsAdapterRuntime, HlsAudioAdapter } from './hls-audio-adapter'
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

type HlsModule = typeof import('hls.js')

let hlsRuntimePromise: Promise<HlsAdapterRuntime> | undefined

function hasMediaSourceSupport(): boolean {
  const mediaGlobal = globalThis as typeof globalThis & {
    ManagedMediaSource?: unknown
    WebKitMediaSource?: unknown
  }
  return typeof mediaGlobal.MediaSource !== 'undefined'
    || typeof mediaGlobal.ManagedMediaSource !== 'undefined'
    || typeof mediaGlobal.WebKitMediaSource !== 'undefined'
}

async function loadHlsRuntime(): Promise<HlsAdapterRuntime> {
  // AI modified: cache the optional peer so native HLS playback avoids loading hls.js.
  hlsRuntimePromise ??= import('hls.js').then((hlsModule: HlsModule) => {
    const HlsConstructor = hlsModule.default
    return {
      createHls: config => new HlsConstructor(config),
      events: hlsModule.Events,
      errorTypes: hlsModule.ErrorTypes,
      isSupported: () => HlsConstructor.isSupported(),
    }
  })
  return hlsRuntimePromise
}

/**
 * Creates an HLS adapter for use in `AudioPlayerOptions.adapters`.
 *
 * Creating an HLS engine with `hls.js` lazily imports the optional `hls.js` peer dependency.
 *
 * @param options Playback strategy and initial `hls.js` configuration.
 * @returns A reusable HLS adapter. One adapter can be owned by only one active player router.
 */
export function createHlsAdapter(options: HlsAdapterOptions = {}): HlsAudioAdapter {
  return new HlsAudioAdapterImpl(options, {
    audioElementFactory: () => new Audio(),
    loadHlsRuntime,
    hasHlsRuntimeSupport: hasMediaSourceSupport,
  })
}
