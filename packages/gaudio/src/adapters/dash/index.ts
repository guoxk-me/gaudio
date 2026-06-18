// @env browser

import type { DashAdapterOptions, DashAudioAdapter } from './dash-audio-adapter'
import { MediaPlayer, supportsMediaSource } from 'dashjs'
import { DashAudioAdapterImpl } from './dash-audio-adapter'

export type { DashAdapterOptions, DashAudioAdapter } from './dash-audio-adapter'
export type { MediaPlayerClass, MediaPlayerSettingClass } from 'dashjs'

/**
 * Creates a DASH adapter for use in `AudioPlayerOptions.adapters`.
 *
 * Importing this entry point requires the optional `dashjs` peer dependency.
 *
 * @param options Initial dash.js playback settings.
 * @returns A reusable DASH adapter. One adapter can be owned by only one active player router.
 */
export function createDashAdapter(options: DashAdapterOptions = {}): DashAudioAdapter {
  return new DashAudioAdapterImpl(options, {
    audioElementFactory: () => new Audio(),
    createDashPlayer: () => MediaPlayer().create(),
    events: MediaPlayer.events,
    isDashSupported: () => supportsMediaSource(),
  })
}
