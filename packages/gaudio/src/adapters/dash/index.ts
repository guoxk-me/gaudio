// @env browser

import type { MediaPlayerClass, MediaPlayerEvents } from 'dashjs'
import type { DashAdapterOptions, DashAudioAdapter } from './dash-audio-adapter'
import { DashAudioAdapterImpl } from './dash-audio-adapter'

export type { DashAdapterOptions, DashAudioAdapter } from './dash-audio-adapter'
export type { MediaPlayerClass, MediaPlayerSettingClass } from 'dashjs'

type DashModule = typeof import('dashjs')

interface DashRuntime {
  createDashPlayer: () => MediaPlayerClass
  events: MediaPlayerEvents
}

let dashRuntimePromise: Promise<DashRuntime> | undefined

function hasMediaSourceSupport(): boolean {
  const mediaGlobal = globalThis as typeof globalThis & {
    ManagedMediaSource?: unknown
    WebKitMediaSource?: unknown
  }
  return typeof mediaGlobal.MediaSource !== 'undefined'
    || typeof mediaGlobal.ManagedMediaSource !== 'undefined'
    || typeof mediaGlobal.WebKitMediaSource !== 'undefined'
}

async function loadDashRuntime(): Promise<DashRuntime> {
  dashRuntimePromise ??= import('dashjs').then((dashModule: DashModule) => ({
    createDashPlayer: () => dashModule.MediaPlayer().create(),
    events: dashModule.MediaPlayer.events,
  }))
  return dashRuntimePromise
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
