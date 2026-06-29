import type { AdaptiveContentType } from '../adaptive-audio-types'

const hlsContentTypeChanges: Record<AdaptiveContentType, object> = {
  'vod': {},
  'long-form': {
    maxBufferLength: 120,
    maxMaxBufferLength: 300,
    backBufferLength: 120,
    maxBufferSize: 64 * 1024 * 1024,
    maxStarvationDelay: 10,
    maxLoadingDelay: 10,
    lowLatencyMode: false,
    fragLoadPolicy: {
      default: {
        maxLoadTimeMs: 180_000,
        errorRetry: { maxNumRetry: 8, maxRetryDelayMs: 20_000 },
      },
    },
  },
  'live': {
    maxBufferLength: 18,
    maxMaxBufferLength: 45,
    backBufferLength: 45,
    liveBackBufferLength: 45,
    lowLatencyMode: true,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 8,
    maxStarvationDelay: 3,
    maxLoadingDelay: 3,
    playlistLoadPolicy: {
      default: {
        maxLoadTimeMs: 10_000,
        timeoutRetry: { maxNumRetry: 4, retryDelayMs: 500, maxRetryDelayMs: 4_000 },
        errorRetry: { maxNumRetry: 10, retryDelayMs: 1_000, maxRetryDelayMs: 10_000 },
      },
    },
    fragLoadPolicy: {
      default: {
        maxLoadTimeMs: 30_000,
        timeoutRetry: { maxNumRetry: 4, retryDelayMs: 500, maxRetryDelayMs: 4_000 },
        errorRetry: { maxNumRetry: 10, retryDelayMs: 1_000, maxRetryDelayMs: 10_000 },
      },
    },
  },
}

export function hlsContentTypeConfig(contentType: AdaptiveContentType): object {
  return hlsContentTypeChanges[contentType]
}
