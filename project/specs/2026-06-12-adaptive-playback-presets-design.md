# Adaptive Playback Presets Design

## Goal

Provide three shared adaptive playback presets so HLS and DASH audio VOD playback works well without vendor-specific configuration. Applications can still override individual `hls.js` or `dash.js` settings.

## Public API

Export one runtime enum from the root `gaudio` entry:

```ts
export enum AdaptivePlaybackPreset {
  FastStart = 'fast-start',
  Balanced = 'balanced',
  Stable = 'stable',
}
```

Both adaptive adapters accept the enum through a new optional `preset` property:

```ts
createHlsAdapter({
  preset: AdaptivePlaybackPreset.Stable,
  config: {
    maxBufferLength: 75,
  },
})

createDashAdapter({
  preset: AdaptivePlaybackPreset.FastStart,
  settings: {
    streaming: {
      buffer: {
        bufferTimeDefault: 10,
      },
    },
  },
})
```

`AdaptivePlaybackPreset.Balanced` is used when `preset` is omitted. Existing calls remain source compatible.

## Configuration Layers

Each protocol resolves configuration in three layers:

1. Complete audio VOD baseline for the installed vendor version.
2. `FastStart`, `Balanced`, or `Stable` profile differences.
3. Caller-provided `config` or `settings` overrides.

The baseline explicitly owns audio VOD buffering, memory limits, ABR, request timeouts, retries, stall recovery, paused scheduling, caching, and audio track selection. It excludes live playback, low-latency live behavior, DRM, text tracks, interstitial playback, telemetry, server-directed optimization, and settings that only affect video rendering.

This provides stable package behavior while avoiding configuration fields that have no meaning for the supported playback scope.

## HLS Audio VOD Baseline

Every HLS profile explicitly configures:

- automatic loading, worker processing, initial bandwidth testing, and disabled fragment prefetch;
- VOD buffering, byte-based memory limits, back-buffer eviction, and small-gap tolerance;
- playback-stall detection, watchdog timing, nudge recovery, append retry, and audio timestamp drift;
- VOD ABR estimation, conservative upgrade thresholds, real fragment bitrate accounting, starvation limits, and loading delay;
- manifest, media-playlist, and fragment first-byte timeout, total timeout, timeout retry, error retry, and exponential backoff;
- `lowLatencyMode: false` because the package supports VOD only.

The HLS preset differences are:

| Setting | `FastStart` | `Balanced` | `Stable` |
| --- | ---: | ---: | ---: |
| `maxBufferLength` | 12 s | 30 s | 60 s |
| `maxMaxBufferLength` | 30 s | 90 s | 180 s |
| `backBufferLength` | 15 s | 30 s | 60 s |
| `maxBufferSize` | 16 MiB | 32 MiB | 48 MiB |
| `abrEwmaDefaultEstimate` | 256 kbps | 384 kbps | 256 kbps |
| `abrBandWidthFactor` | 0.9 | 0.9 | 0.8 |
| `abrBandWidthUpFactor` | 0.7 | 0.65 | 0.55 |
| `maxStarvationDelay` | 2 s | 4 s | 8 s |
| `maxLoadingDelay` | 2 s | 4 s | 8 s |
| Fragment first-byte timeout | 6 s | 10 s | 15 s |
| Fragment total timeout | 30 s | 60 s | 120 s |
| Fragment error retries | 2 | 4 | 6 |

Manifest and playlist request policies follow the same profile direction: `FastStart` fails sooner, `Balanced` uses moderate limits, and `Stable` waits and retries longer on variable networks.

## DASH Audio VOD Baseline

Every DASH profile explicitly configures:

- buffer targets, long-form threshold, buffer cleanup, back-buffer retention, stall threshold, append windows, and source-buffer reuse;
- stopped scheduling while paused, predictable normal scheduling cadence, and initialization-segment caching;
- audio ABR with throughput, BOLA, insufficient-buffer, switch-history, and abandoned-request rules;
- disabled dropped-frame and low-latency ABR rules because they do not serve audio VOD;
- throughput measurement, audio automatic switching, unrestricted audio bitrate range, and conservative bandwidth safety;
- MPD, initialization-segment, media-segment, index-segment, and other request timeouts, retry intervals, and retry counts;
- small-gap jumping, large-gap jumping, seek repair, stall recovery, and blacklist expiry;
- recent bitrate and media-selection caching, main-role prioritization, and lowest-startup-delay initial audio selection.

The DASH preset differences are:

| Setting | `FastStart` | `Balanced` | `Stable` |
| --- | ---: | ---: | ---: |
| `bufferTimeDefault` | 8 s | 18 s | 30 s |
| `bufferTimeAtTopQuality` | 12 s | 30 s | 60 s |
| `bufferTimeAtTopQualityLongForm` | 20 s | 60 s | 120 s |
| `bufferToKeep` | 15 s | 30 s | 60 s |
| `bufferPruningInterval` | 5 s | 10 s | 15 s |
| Throughput safety factor | 0.95 | 0.9 | 0.8 |
| VOD throughput samples | 3 | 4 | 6 |
| Manifest timeout | 8 s | 10 s | 15 s |
| Fragment timeout | 15 s | 20 s | 30 s |
| MPD retries | 2 | 3 | 5 |
| Media-segment retries | 2 | 3 | 5 |

All DASH profiles classify content longer than 600 seconds as long-form and stop downloading new segments while paused.

Native HLS playback does not expose equivalent controls. The adapter stores the selected preset configuration, but it only affects a load that selects `hls.js`.

## Configuration Ownership

Preset factories return fresh objects so callers and vendor libraries cannot mutate shared defaults.

The effective initial configuration is calculated in baseline, profile, then caller order. `Balanced` is selected when the caller omits `preset`.

Both HLS and DASH use recursive object merging. A caller can override one nested retry value without replacing the remaining baseline policy. Arrays, class instances, functions, regular expressions, and primitive values are replaced rather than recursively merged.

`getConfig()` and `getSettings()` return the effective preset plus caller overrides. Runtime `updateConfig()` and `updateSettings()` continue to merge only the fields supplied by the caller.

## Internal Structure

The shared enum remains vendor-independent and is exported by the root entry. Each adapter module owns a version-specific audio VOD baseline and a separate profile-difference mapping, so importing `gaudio` never imports `hls.js` or `dashjs`.

The implementation uses these focused files:

- `hls-vod-defaults.ts` for complete HLS audio VOD behavior;
- `hls-playback-presets.ts` for HLS profile differences and final resolution;
- `dash-vod-defaults.ts` for complete DASH audio VOD behavior;
- `dash-playback-presets.ts` for DASH profile differences and final resolution.

Shared recursive merge behavior remains internal to the protocol adapter area. Each resolution returns a fresh object before a vendor instance receives it.

No vendor global defaults are mutated.

## Documentation

The adaptive playback guide documents:

- the three presets and their intended use;
- `Balanced` as the default;
- caller overrides taking precedence;
- native HLS not applying `hls.js` settings.

The package README quick-start example imports and uses the enum.

## Testing

Adapter tests verify:

- omitted presets resolve to `Balanced`;
- all three presets resolve to the expected vendor settings;
- caller configuration overrides preset values;
- nested HLS and DASH overrides retain untouched baseline and preset fields;
- returned settings are isolated from external mutation;
- excluded live, DRM, text, interstitial, telemetry, and video-only settings are absent;
- existing runtime update behavior remains intact;
- root exports the enum without importing optional vendor dependencies.

Verification includes package tests, type checking, linting, and build output inspection.

## Scope

This change does not add live playback, low-latency playback, manual quality selection, DRM configuration, or automatic network-profile switching. Presets are explicit static starting points for the existing audio VOD adapters.
