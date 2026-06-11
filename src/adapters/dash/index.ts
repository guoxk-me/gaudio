// @env browser

import type { DashAdapterOptions, DashAudioAdapter } from './dash-audio-adapter'
import { MediaPlayer, supportsMediaSource } from 'dashjs'
import { DashAudioAdapterImpl } from './dash-audio-adapter'

export type { DashAdapterOptions, DashAudioAdapter } from './dash-audio-adapter'
export type { MediaPlayerClass, MediaPlayerSettingClass } from 'dashjs'

export function createDashAdapter(options: DashAdapterOptions = {}): DashAudioAdapter {
  return new DashAudioAdapterImpl(options, {
    audioElementFactory: () => new Audio(),
    createDashPlayer: () => MediaPlayer().create(),
    events: MediaPlayer.events,
    isDashSupported: () => supportsMediaSource(),
  })
}
