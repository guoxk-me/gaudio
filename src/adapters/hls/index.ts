// @env browser

import type { HlsAdapterOptions, HlsAudioAdapter } from './hls-audio-adapter'
import Hls from 'hls.js'
import { HlsAudioAdapterImpl } from './hls-audio-adapter'

export type {
  HlsAdapterOptions,
  HlsAudioAdapter,
  HlsConfigUpdateOptions,
  HlsPlaybackStrategy,
} from './hls-audio-adapter'
export type { HlsConfig } from 'hls.js'

export function createHlsAdapter(options: HlsAdapterOptions = {}): HlsAudioAdapter {
  return new HlsAudioAdapterImpl(options, {
    audioElementFactory: () => new Audio(),
    createHls: config => new Hls(config),
    isHlsSupported: () => Hls.isSupported(),
  })
}
