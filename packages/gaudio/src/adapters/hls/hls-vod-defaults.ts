import type { HlsConfig } from 'hls.js'

export function hlsVodDefaults(): Partial<HlsConfig> {
  return {
    autoStartLoad: true,
    startPosition: -1,
    debug: false,
    preferManagedMediaSource: true,
    maxBufferLength: 30,
    maxMaxBufferLength: 90,
    backBufferLength: 30,
    maxBufferSize: 32 * 1024 * 1024,
    maxFragLookUpTolerance: 0.25,
    maxBufferHole: 0.1,
    detectStallWithCurrentTimeMs: 1250,
    highBufferWatchdogPeriod: 2,
    nudgeOffset: 0.1,
    nudgeMaxRetry: 3,
    enableWorker: true,
    enableSoftwareAES: true,
    startFragPrefetch: false,
    appendErrorMaxRetry: 3,
    ignorePlaylistParsingErrors: false,
    maxAudioFramesDrift: 1,
    abrEwmaFastVoD: 3,
    abrEwmaSlowVoD: 9,
    abrEwmaDefaultEstimate: 384_000,
    abrEwmaDefaultEstimateMax: 1_500_000,
    abrBandWidthFactor: 0.9,
    abrBandWidthUpFactor: 0.65,
    abrMaxWithRealBitrate: true,
    maxStarvationDelay: 4,
    maxLoadingDelay: 4,
    minAutoBitrate: 0,
    testBandwidth: true,
    progressive: false,
    lowLatencyMode: false,
    useMediaCapabilities: true,
    preserveManualLevelOnError: false,
    manifestLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 10_000,
        maxLoadTimeMs: 20_000,
        timeoutRetry: {
          maxNumRetry: 2,
          retryDelayMs: 500,
          maxRetryDelayMs: 4_000,
          backoff: 'exponential',
        },
        errorRetry: {
          maxNumRetry: 2,
          retryDelayMs: 1_000,
          maxRetryDelayMs: 8_000,
          backoff: 'exponential',
        },
      },
    },
    playlistLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 10_000,
        maxLoadTimeMs: 20_000,
        timeoutRetry: {
          maxNumRetry: 2,
          retryDelayMs: 500,
          maxRetryDelayMs: 4_000,
          backoff: 'exponential',
        },
        errorRetry: {
          maxNumRetry: 2,
          retryDelayMs: 1_000,
          maxRetryDelayMs: 8_000,
          backoff: 'exponential',
        },
      },
    },
    fragLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 10_000,
        maxLoadTimeMs: 60_000,
        timeoutRetry: {
          maxNumRetry: 3,
          retryDelayMs: 500,
          maxRetryDelayMs: 8_000,
          backoff: 'exponential',
        },
        errorRetry: {
          maxNumRetry: 4,
          retryDelayMs: 1_000,
          maxRetryDelayMs: 8_000,
          backoff: 'exponential',
        },
      },
    },
    keyLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 8_000,
        maxLoadTimeMs: 20_000,
        timeoutRetry: {
          maxNumRetry: 1,
          retryDelayMs: 1_000,
          maxRetryDelayMs: 10_000,
          backoff: 'exponential',
        },
        errorRetry: {
          maxNumRetry: 4,
          retryDelayMs: 1_000,
          maxRetryDelayMs: 10_000,
          backoff: 'exponential',
        },
      },
    },
  }
}
