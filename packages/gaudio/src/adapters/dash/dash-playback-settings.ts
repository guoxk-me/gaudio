import type { MediaPlayerSettingClass } from 'dashjs'
import type { AdaptiveContentType, AdaptivePlaybackPreset } from '../adaptive-audio-types'
import { settingsWithChanges } from '../settings-with-changes'
import { dashContentTypeSettings } from './dash-content-type-settings'
import { dashPresetSettings } from './dash-playback-presets'
import { dashVodDefaults } from './dash-vod-defaults'

export function dashSettingsForPlayback(
  preset: AdaptivePlaybackPreset,
  contentType: AdaptiveContentType = 'vod',
): MediaPlayerSettingClass {
  // AI modified: playback settings composition keeps baseline, preset, and content type concerns separate.
  return settingsWithChanges(
    settingsWithChanges(dashVodDefaults(), dashPresetSettings(preset)),
    dashContentTypeSettings(contentType),
  )
}
