import type { HlsConfig } from 'hls.js'
import type { AdaptiveContentType, AdaptivePlaybackPreset } from '../adaptive-audio-types'
import { settingsWithChanges } from '../settings-with-changes'
import { hlsContentTypeConfig } from './hls-content-type-config'
import { hlsPresetConfig } from './hls-playback-presets'
import { hlsVodDefaults } from './hls-vod-defaults'

export function hlsConfigForPlayback(
  preset: AdaptivePlaybackPreset,
  contentType: AdaptiveContentType = 'vod',
): Partial<HlsConfig> {
  // AI modified: playback config composition keeps baseline, preset, and content type concerns separate.
  return settingsWithChanges(
    settingsWithChanges(hlsVodDefaults(), hlsPresetConfig(preset)),
    hlsContentTypeConfig(contentType),
  )
}
