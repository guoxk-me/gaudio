// @env browser

/**
 * Optional HLS adapter entry point with lazy `hls.js` loading.
 *
 * @module adapters/hls
 */

import type { HlsConfig } from 'hls.js'
import type { HlsAdapterOptions, HlsAdapterRuntime, HlsAudioAdapter } from './hls-audio-adapter'
import { GAudioError } from '../../errors/errors'
import { hlsMimeTypes } from '../../source/audio-protocol'
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
    ManagedMediaSource?: typeof MediaSource
    WebKitMediaSource?: typeof MediaSource
    WebKitSourceBuffer?: typeof SourceBuffer
  }
  if (typeof mediaGlobal.Audio !== 'function') {
    return false
  }

  const mediaSource = mediaGlobal.ManagedMediaSource
    ?? mediaGlobal.MediaSource
    ?? mediaGlobal.WebKitMediaSource
  if (typeof mediaSource !== 'function' || typeof mediaSource.isTypeSupported !== 'function') {
    return false
  }

  const sourceBuffer = mediaGlobal.SourceBuffer ?? mediaGlobal.WebKitSourceBuffer
  if (
    sourceBuffer
    && (
      !sourceBuffer.prototype
      || typeof sourceBuffer.prototype.appendBuffer !== 'function'
      || typeof sourceBuffer.prototype.remove !== 'function'
    )
  ) {
    return false
  }

  try {
    // AI modified: mirror hls.js capability requirements so synchronous routing never reports partial MSE as playable.
    return [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=av01.0.01M.08',
      'video/mp4;codecs=vp09.00.50.08',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4;codecs=fLaC',
    ].some(mimeType => mediaSource.isTypeSupported(mimeType))
  }
  catch {
    return false
  }
}

function hasNativeHlsSupport(): boolean {
  // AI modified: capability checks must be safe during SSR where browser media globals do not exist.
  if (typeof globalThis.Audio !== 'function') {
    return false
  }

  try {
    const audioElement = new Audio()
    return typeof audioElement.canPlayType === 'function'
      // AI modified: probe the same aliases accepted by source routing so capability results cannot disagree.
      && hlsMimeTypes.some(mimeType => audioElement.canPlayType(mimeType) !== '')
  }
  catch {
    return false
  }
}

async function loadHlsRuntime(): Promise<HlsAdapterRuntime> {
  // AI modified: cache the optional peer so native HLS playback avoids loading hls.js.
  const runtimePromise = hlsRuntimePromise ?? import('hls.js')
    .then((hlsModule: HlsModule) => {
      const HlsConstructor = hlsModule.default
      return {
        createHls: (config: Partial<HlsConfig>) => new HlsConstructor(config),
        events: hlsModule.Events,
        errorTypes: hlsModule.ErrorTypes,
        isSupported: () => HlsConstructor.isSupported(),
      }
    })
  hlsRuntimePromise = runtimePromise

  try {
    return await runtimePromise
  }
  catch (cause) {
    if (hlsRuntimePromise === runtimePromise) {
      // AI modified: transient chunk failures may retry without discarding a newer successful runtime request.
      hlsRuntimePromise = undefined
    }
    throw new GAudioError(
      'ADAPTER_UNAVAILABLE',
      'Unable to load the optional "hls.js" peer dependency. Install hls.js to use the HLS adapter.',
      cause,
    )
  }
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
    hasNativeHlsSupport,
  })
}
