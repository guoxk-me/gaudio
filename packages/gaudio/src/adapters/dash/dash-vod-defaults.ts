import type { MediaPlayerSettingClass } from 'dashjs'

export function dashVodDefaults(): MediaPlayerSettingClass {
  return {
    streaming: {
      abandonLoadTimeout: 10_000,
      cacheInitSegments: true,
      cacheInitSegmentsLimit: 20,
      enableManifestDurationMismatchFix: true,
      capabilities: {
        useMediaCapabilitiesApi: true,
        filterAudioChannelConfiguration: false,
      },
      buffer: {
        fastSwitchEnabled: true,
        flushBufferAtTrackSwitch: false,
        reuseExistingSourceBuffers: true,
        bufferPruningInterval: 10,
        bufferToKeep: 30,
        bufferTimeAtTopQuality: 30,
        bufferTimeAtTopQualityLongForm: 60,
        bufferTimeDefault: 18,
        longFormContentDurationThreshold: 600,
        stallThreshold: 0.3,
        useAppendWindow: true,
        setStallState: true,
        avoidCurrentTimeRangePruning: false,
        useChangeType: true,
        mediaSourceDurationInfinity: true,
        resetSourceBuffersForTrackSwitch: false,
        syntheticStallEvents: {
          enabled: false,
          ignoreReadyState: false,
        },
      },
      gaps: {
        jumpGaps: true,
        jumpLargeGaps: true,
        smallGapLimit: 1.5,
        threshold: 0.3,
        enableSeekFix: true,
        enableStallFix: true,
        stallSeek: 0.1,
        seekOffset: 0,
      },
      scheduling: {
        defaultTimeout: 500,
        scheduleWhilePaused: false,
      },
      lastBitrateCachingInfo: {
        enabled: true,
        ttl: 360_000,
      },
      lastMediaSettingsCachingInfo: {
        enabled: true,
        ttl: 360_000,
      },
      saveLastMediaSettingsForCurrentStreamingSession: true,
      cacheLoadThresholds: {
        audio: 5,
      },
      trackSwitchMode: {
        audio: 'alwaysReplace',
      },
      includePreselectionsForInitialTrackSelection: false,
      ignoreSelectionPriority: false,
      prioritizeRoleMain: true,
      assumeDefaultRoleAsMain: true,
      blacklistExpiryTime: 60,
      fragmentRequestTimeout: 20_000,
      fragmentRequestProgressTimeout: 12_000,
      manifestRequestTimeout: 10_000,
      retryIntervals: {
        MPD: 500,
        XLinkExpansion: 500,
        MediaSegment: 1_000,
        InitializationSegment: 1_000,
        BitstreamSwitchingSegment: 1_000,
        IndexSegment: 1_000,
        other: 1_000,
      },
      retryAttempts: {
        MPD: 3,
        XLinkExpansion: 1,
        MediaSegment: 3,
        InitializationSegment: 3,
        BitstreamSwitchingSegment: 3,
        IndexSegment: 3,
        other: 3,
      },
      abr: {
        limitBitrateByPortal: false,
        usePixelRatioInLimitBitrateByPortal: false,
        limitBitrateByPortalMinimum: 0,
        enableSupplementalPropertyAdaptationSetSwitching: true,
        rules: {
          throughputRule: { active: true },
          bolaRule: { active: true },
          insufficientBufferRule: {
            active: true,
            parameters: {
              throughputSafetyFactor: 0.7,
              segmentIgnoreCount: 2,
            },
          },
          switchHistoryRule: {
            active: true,
            parameters: {
              sampleSize: 8,
              switchPercentageThreshold: 0.075,
            },
          },
          droppedFramesRule: { active: false },
          abandonRequestsRule: {
            active: true,
            parameters: {
              abandonDurationMultiplier: 1.8,
              minSegmentDownloadTimeThresholdInMs: 500,
              minThroughputSamplesThreshold: 6,
            },
          },
          l2ARule: { active: false },
          loLPRule: { active: false },
        },
        throughput: {
          averageCalculationMode: 'throughputCalculationModeEwma',
          useResourceTimingApi: true,
          useNetworkInformationApi: {
            xhr: false,
            fetch: false,
          },
          useDeadTimeLatency: true,
          bandwidthSafetyFactor: 0.9,
          sampleSettings: {
            vod: 4,
            enableSampleSizeAdjustment: true,
            decreaseScale: 0.7,
            increaseScale: 1.3,
            maxMeasurementsToKeep: 20,
            averageLatencySampleAmount: 4,
          },
          ewma: {
            throughputSlowHalfLifeSeconds: 8,
            throughputFastHalfLifeSeconds: 3,
            latencySlowHalfLifeCount: 2,
            latencyFastHalfLifeCount: 1,
          },
        },
        maxBitrate: { audio: -1 },
        minBitrate: { audio: -1 },
        initialBitrate: { audio: -1 },
        autoSwitchBitrate: { audio: true },
      },
    },
    errors: {
      recoverAttempts: {
        mediaErrorDecode: 5,
      },
    },
  }
}
