// @env browser

/**
 * Optional DASH adapter entry point with lazy `dashjs` loading.
 *
 * @module adapters/dash
 */

import type { DashAdapterOptions, DashAudioAdapter } from './dash-audio-adapter'
import type { DashErrorCodes } from './dash-audio-engine'
import type { MediaPlayerClass, MediaPlayerEvents } from './dashjs-types'
import { GAudioError } from '../../errors/errors'
import { DashAudioAdapterImpl } from './dash-audio-adapter'

export type { DashAdapterOptions, DashAudioAdapter } from './dash-audio-adapter'
export type { DashSettingsChanges, MediaPlayerClass, MediaPlayerSettingClass } from './dashjs-types'

type DashModule = typeof import('dashjs')

interface DashRuntime {
  createDashPlayer: () => MediaPlayerClass
  events: MediaPlayerEvents
  errorCodes: DashErrorCodes
}

let dashRuntimePromise: Promise<DashRuntime> | undefined

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
    // AI modified: reject partial MSE shims before the router advertises DASH playback support.
    return [
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4;codecs=ac-3',
      'audio/webm;codecs=opus',
      'audio/webm;codecs=vorbis',
    ].some(mimeType => mediaSource.isTypeSupported(mimeType))
  }
  catch {
    return false
  }
}

async function loadDashRuntime(): Promise<DashRuntime> {
  const runtimePromise = dashRuntimePromise ?? import('dashjs')
    .then((dashModule: DashModule) => ({
      createDashPlayer: () => dashModule.MediaPlayer().create(),
      events: dashModule.MediaPlayer.events,
      errorCodes: dashModule.MediaPlayer.errors,
    }))
  dashRuntimePromise = runtimePromise

  try {
    return await runtimePromise
  }
  catch (cause) {
    if (dashRuntimePromise === runtimePromise) {
      // AI modified: a failed optional-peer request must not poison future adapter creation for the page lifetime.
      dashRuntimePromise = undefined
    }
    throw new GAudioError(
      'ADAPTER_UNAVAILABLE',
      'Unable to load the optional "dashjs" peer dependency. Install dashjs to use the DASH adapter.',
      cause,
    )
  }
}

/**
 * Creates a DASH adapter for use in `AudioPlayerOptions.adapters`.
 *
 * Creating a DASH engine lazily imports the optional `dashjs` peer dependency.
 *
 * @param options Initial dash.js playback settings.
 * @returns A reusable DASH adapter. One adapter can be owned by only one active player router.
 */
export function createDashAdapter(options: DashAdapterOptions = {}): DashAudioAdapter {
  return new DashAudioAdapterImpl(options, {
    audioElementFactory: () => new Audio(),
    loadDashRuntime,
    isDashSupported: hasMediaSourceSupport,
  })
}
