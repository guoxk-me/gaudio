import type { AdaptiveContentType } from '../adaptive-audio-types'

const dashContentTypeChanges: Record<AdaptiveContentType, object> = {
  'vod': {},
  'long-form': {
    streaming: {
      buffer: {
        bufferTimeDefault: 45,
        bufferTimeAtTopQuality: 90,
        bufferTimeAtTopQualityLongForm: 180,
        bufferToKeep: 180,
        longFormContentDurationThreshold: 120,
      },
      fragmentRequestTimeout: 60_000,
      fragmentRequestProgressTimeout: 30_000,
      retryAttempts: {
        MediaSegment: 8,
        InitializationSegment: 8,
      },
    },
  },
  'live': {
    streaming: {
      delay: {
        useSuggestedPresentationDelay: true,
        liveDelayFragmentCount: 4,
      },
      liveCatchup: {
        enabled: true,
        maxDrift: 12,
        playbackRate: {
          min: -0.1,
          max: 0.1,
        },
      },
      buffer: {
        bufferTimeDefault: 6,
        bufferTimeAtTopQuality: 12,
        bufferToKeep: 45,
      },
      manifestRequestTimeout: 8_000,
      fragmentRequestTimeout: 20_000,
      retryAttempts: {
        MPD: 10,
        MediaSegment: 10,
      },
    },
  },
}

export function dashContentTypeSettings(contentType: AdaptiveContentType): object {
  return dashContentTypeChanges[contentType]
}
