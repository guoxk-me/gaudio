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

## Preset Values

The presets intentionally override only settings with clear value for audio VOD. ABR algorithms, workers, request timeout policies, retry policies, gap handling, and other vendor behavior retain the defaults of the installed vendor version.

| Preset | HLS `maxBufferLength` | HLS `maxMaxBufferLength` | HLS `backBufferLength` | DASH `bufferTimeDefault` | DASH `bufferTimeAtTopQuality` | DASH `bufferTimeAtTopQualityLongForm` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `FastStart` | 10 | 30 | 15 | 8 | 12 | 20 |
| `Balanced` | 30 | 90 | 30 | 18 | 30 | 60 |
| `Stable` | 60 | 180 | 60 | 30 | 60 | 120 |

All HLS presets set `lowLatencyMode: false` because the package currently supports VOD only. All DASH presets set `streaming.scheduling.scheduleWhilePaused: false` to avoid continuing segment downloads while playback is paused. DASH retains the vendor default long-form threshold of 600 seconds.

Native HLS playback does not expose equivalent controls. The adapter stores the selected preset configuration, but it only affects a load that selects `hls.js`.

## Configuration Ownership

Preset factories return fresh objects so callers and vendor libraries cannot mutate shared defaults.

The effective initial configuration is calculated in this order:

1. Selected preset, or `Balanced` when omitted.
2. Caller-provided `config` or `settings`, with caller values taking precedence.

HLS constructor configuration is shallow by vendor design, so caller fields replace matching preset fields. DASH settings are nested and are deep-merged with the existing settings merge behavior.

`getConfig()` and `getSettings()` return the effective preset plus caller overrides. Runtime `updateConfig()` and `updateSettings()` continue to merge only the fields supplied by the caller.

## Internal Structure

The shared enum remains vendor-independent and is exported by the root entry. Each adapter module owns its vendor-specific preset mapping so importing `gaudio` never imports `hls.js` or `dashjs`.

The HLS adapter resolves a fresh `Partial<HlsConfig>` before creating an engine. The DASH adapter resolves a fresh `MediaPlayerSettingClass` and then uses the existing structured-clone and deep-merge behavior.

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
- nested DASH settings retain untouched preset fields;
- returned settings are isolated from external mutation;
- existing runtime update behavior remains intact;
- root exports the enum without importing optional vendor dependencies.

Verification includes package tests, type checking, linting, and build output inspection.

## Scope

This change does not add live playback, low-latency playback, manual quality selection, DRM configuration, or automatic network-profile switching. Presets are explicit static starting points for the existing audio VOD adapters.
