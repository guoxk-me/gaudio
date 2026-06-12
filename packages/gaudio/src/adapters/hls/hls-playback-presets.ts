import type { HlsConfig } from 'hls.js'
import { AdaptivePlaybackPreset } from '../../types'
import { settingsWithChanges } from '../settings-with-changes'
import { hlsVodDefaults } from './hls-vod-defaults'

export function hlsConfigForPreset(preset: AdaptivePlaybackPreset): Partial<HlsConfig> {
  const vodDefaults = hlsVodDefaults()

  switch (preset) {
    case AdaptivePlaybackPreset.FastStart:
      return settingsWithChanges(vodDefaults, {
        maxBufferLength: 12,
        maxMaxBufferLength: 30,
        backBufferLength: 15,
        maxBufferSize: 16 * 1024 * 1024,
        abrEwmaDefaultEstimate: 256_000,
        abrBandWidthFactor: 0.9,
        abrBandWidthUpFactor: 0.7,
        maxStarvationDelay: 2,
        maxLoadingDelay: 2,
        manifestLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 6_000,
            maxLoadTimeMs: 12_000,
            timeoutRetry: { maxNumRetry: 1 },
            errorRetry: { maxNumRetry: 1, retryDelayMs: 500, maxRetryDelayMs: 2_000 },
          },
        },
        playlistLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 6_000,
            maxLoadTimeMs: 12_000,
            timeoutRetry: { maxNumRetry: 1 },
            errorRetry: { maxNumRetry: 1, retryDelayMs: 500, maxRetryDelayMs: 2_000 },
          },
        },
        fragLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 6_000,
            maxLoadTimeMs: 30_000,
            timeoutRetry: { maxNumRetry: 2 },
            errorRetry: { maxNumRetry: 2, retryDelayMs: 500, maxRetryDelayMs: 4_000 },
          },
        },
        keyLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 6_000,
            maxLoadTimeMs: 15_000,
            timeoutRetry: { maxNumRetry: 1 },
            errorRetry: { maxNumRetry: 2, maxRetryDelayMs: 5_000 },
          },
        },
      })
    case AdaptivePlaybackPreset.Stable:
      return settingsWithChanges(vodDefaults, {
        maxBufferLength: 60,
        maxMaxBufferLength: 180,
        backBufferLength: 60,
        maxBufferSize: 48 * 1024 * 1024,
        abrEwmaDefaultEstimate: 256_000,
        abrBandWidthFactor: 0.8,
        abrBandWidthUpFactor: 0.55,
        maxStarvationDelay: 8,
        maxLoadingDelay: 8,
        manifestLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 15_000,
            maxLoadTimeMs: 30_000,
            timeoutRetry: { maxNumRetry: 3, maxRetryDelayMs: 15_000 },
            errorRetry: { maxNumRetry: 4, maxRetryDelayMs: 15_000 },
          },
        },
        playlistLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 15_000,
            maxLoadTimeMs: 30_000,
            timeoutRetry: { maxNumRetry: 3, maxRetryDelayMs: 15_000 },
            errorRetry: { maxNumRetry: 4, maxRetryDelayMs: 15_000 },
          },
        },
        fragLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 15_000,
            maxLoadTimeMs: 120_000,
            timeoutRetry: { maxNumRetry: 4, maxRetryDelayMs: 15_000 },
            errorRetry: { maxNumRetry: 6, maxRetryDelayMs: 15_000 },
          },
        },
        keyLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 10_000,
            maxLoadTimeMs: 30_000,
            timeoutRetry: { maxNumRetry: 2, maxRetryDelayMs: 15_000 },
            errorRetry: { maxNumRetry: 6, maxRetryDelayMs: 15_000 },
          },
        },
      })
    case AdaptivePlaybackPreset.Balanced:
    default:
      return vodDefaults
  }
}
