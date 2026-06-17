import type { MediaPlayerSettingClass } from 'dashjs'
import { AdaptivePlaybackPreset } from '../adaptive-audio-types'
import { settingsWithChanges } from '../settings-with-changes'
import { dashVodDefaults } from './dash-vod-defaults'

const dashPresetChanges: Record<AdaptivePlaybackPreset, object> = {
  [AdaptivePlaybackPreset.FastStart]: {
    streaming: {
      abandonLoadTimeout: 5_000,
      buffer: {
        bufferTimeDefault: 8,
        bufferTimeAtTopQuality: 12,
        bufferTimeAtTopQualityLongForm: 20,
        bufferToKeep: 15,
        bufferPruningInterval: 5,
      },
      scheduling: { defaultTimeout: 250 },
      blacklistExpiryTime: 30,
      fragmentRequestTimeout: 15_000,
      fragmentRequestProgressTimeout: 8_000,
      manifestRequestTimeout: 8_000,
      retryIntervals: {
        MPD: 300,
        XLinkExpansion: 300,
        MediaSegment: 500,
        InitializationSegment: 500,
        BitstreamSwitchingSegment: 500,
        IndexSegment: 500,
        other: 500,
      },
      retryAttempts: {
        MPD: 2,
        MediaSegment: 2,
        InitializationSegment: 2,
        BitstreamSwitchingSegment: 2,
        IndexSegment: 2,
        other: 2,
      },
      abr: {
        rules: {
          insufficientBufferRule: {
            parameters: {
              throughputSafetyFactor: 0.8,
              segmentIgnoreCount: 1,
            },
          },
        },
        throughput: {
          bandwidthSafetyFactor: 0.95,
          sampleSettings: { vod: 3 },
        },
      },
    },
  },
  [AdaptivePlaybackPreset.Balanced]: {},
  [AdaptivePlaybackPreset.Stable]: {
    streaming: {
      abandonLoadTimeout: 15_000,
      buffer: {
        bufferTimeDefault: 30,
        bufferTimeAtTopQuality: 60,
        bufferTimeAtTopQualityLongForm: 120,
        bufferToKeep: 60,
        bufferPruningInterval: 15,
      },
      scheduling: { defaultTimeout: 750 },
      blacklistExpiryTime: 120,
      fragmentRequestTimeout: 30_000,
      fragmentRequestProgressTimeout: 20_000,
      manifestRequestTimeout: 15_000,
      retryIntervals: {
        MPD: 1_000,
        XLinkExpansion: 1_000,
        MediaSegment: 1_500,
        InitializationSegment: 1_500,
        BitstreamSwitchingSegment: 1_500,
        IndexSegment: 1_500,
        other: 1_500,
      },
      retryAttempts: {
        MPD: 5,
        XLinkExpansion: 2,
        MediaSegment: 5,
        InitializationSegment: 5,
        BitstreamSwitchingSegment: 5,
        IndexSegment: 5,
        other: 5,
      },
      abr: {
        rules: {
          insufficientBufferRule: {
            parameters: {
              throughputSafetyFactor: 0.6,
              segmentIgnoreCount: 3,
            },
          },
        },
        throughput: {
          bandwidthSafetyFactor: 0.8,
          sampleSettings: { vod: 6 },
        },
      },
    },
  },
}

export function dashSettingsForPreset(preset: AdaptivePlaybackPreset): MediaPlayerSettingClass {
  return settingsWithChanges(dashVodDefaults(), dashPresetChanges[preset])
}
