# Adaptive Playback

gaudio keeps adaptive streaming optional. Importing the root `gaudio` entry never loads `hls.js` or `dashjs`; those vendors are only needed when your application imports `gaudio/hls` or `gaudio/dash`.

## Install

Install only the protocol dependency you use:

```bash
pnpm add gaudio hls.js
pnpm add gaudio dashjs
```

## Register adapters

```ts
import { AdaptivePlaybackPreset, AudioPlayer } from 'gaudio'
import { createDashAdapter } from 'gaudio/dash'
import { createHlsAdapter } from 'gaudio/hls'

const hlsAdapter = createHlsAdapter({
  playbackStrategy: 'native-first',
  preset: AdaptivePlaybackPreset.Balanced,
})

const dashAdapter = createDashAdapter({
  preset: AdaptivePlaybackPreset.Balanced,
})

const player = new AudioPlayer({
  adapters: [hlsAdapter, dashAdapter],
})

player.setSource('https://example.com/program.m3u8')
await player.load()
```

The same player can switch between ordinary media, HLS, and DASH by calling `setSource()` and then `load()`. Switching protocols is not gapless; the active engine is unloaded and the next engine is created for the new protocol.

## Protocol selection

gaudio selects an engine in this order:

| Priority | Source metadata | Result |
| --- | --- | --- |
| 1 | Explicit `protocol` on `AudioSourceDescription` or custom `AudioSource` | Uses `media`, `hls`, or `dash` exactly as requested. |
| 2 | Known MIME type | HLS MIME types select `hls`; `application/dash+xml` selects `dash`. |
| 3 | URL pathname extension | `.m3u8` selects `hls`; `.mpd` selects `dash`; query strings and fragments are ignored. |
| 4 | No match | Falls back to the built-in media element engine. |

Use explicit metadata for signed URLs, CDN routing URLs, or extensionless endpoints:

```ts
player.setSource({
  url: 'https://example.com/media?id=42',
  protocol: 'dash',
  mimeType: 'application/dash+xml',
})
```

If a source selects `hls` or `dash` without a registered adapter, loading fails with `ADAPTER_UNAVAILABLE`. If the adapter cannot run in the current browser, loading fails with `PROTOCOL_UNSUPPORTED`.

## HLS adapter options

```ts
const hlsAdapter = createHlsAdapter({
  preset: AdaptivePlaybackPreset.Stable,
  playbackStrategy: 'hls-first',
  config: {
    maxBufferLength: 75,
    fragLoadPolicy: {
      default: {
        errorRetry: { maxNumRetry: 6 },
      },
    },
  },
})
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `preset` | `AdaptivePlaybackPreset` | `Balanced` | Applies an audio VOD configuration profile before explicit `config` overrides. |
| `playbackStrategy` | `'native-first' \| 'hls-first' \| 'native-only' \| 'hls-only'` | `'native-first'` | Chooses whether browser-native HLS or `hls.js` is preferred. |
| `config` | `HlsAdapterConfig` | `{}` | Deep partial `hls.js` constructor configuration. Explicit fields override the selected preset. |

Strategies are deterministic:

| Strategy | Behavior |
| --- | --- |
| `native-first` | Use native HLS when available, otherwise use `hls.js`. |
| `hls-first` | Use `hls.js` when supported, otherwise use native HLS. |
| `native-only` | Use only native HLS, otherwise fail with `PROTOCOL_UNSUPPORTED`. |
| `hls-only` | Use only `hls.js`, otherwise fail with `PROTOCOL_UNSUPPORTED`. |

When native HLS is selected, the adapter stores the preset and `config`, but the browser does not expose `hls.js` controls. Those settings take effect on a later load that selects `hls.js`.

HLS request policy overrides are recursively merged. Changing one retry value keeps the preset's remaining timeout, retry, and backoff fields.

## DASH adapter options

```ts
const dashAdapter = createDashAdapter({
  preset: AdaptivePlaybackPreset.FastStart,
  settings: {
    streaming: {
      buffer: {
        bufferTimeDefault: 10,
      },
      abr: {
        autoSwitchBitrate: {
          audio: true,
        },
      },
    },
  },
})
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `preset` | `AdaptivePlaybackPreset` | `Balanced` | Applies an audio VOD dash.js settings profile before explicit `settings` overrides. |
| `settings` | `MediaPlayerSettingClass` | `{}` | Deep partial dash.js settings applied when a DASH engine is created. |

DASH settings are merged recursively and passed through dash.js `updateSettings()` while active.

## Playback presets

Both adaptive adapters use `AdaptivePlaybackPreset.Balanced` when no preset is specified.

| Preset | Intended use | Buffer behavior | Network behavior |
| --- | --- | --- | --- |
| `FastStart` | Quick startup, previews, frequent source changes | Smaller buffers and shorter back buffer | Fails and retries faster |
| `Balanced` | General music, podcasts, audiobooks | Moderate buffers and memory use | Default retry and stall recovery profile |
| `Stable` | Weak or variable networks, long-form listening | Larger buffers and longer retention | Longer timeouts and more retries |

Key HLS profile values:

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

Key DASH profile values:

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

Presets configure audio VOD buffering, memory limits, ABR estimation, request timeouts, retries, small-gap recovery, stalled-playback recovery, paused download scheduling, and long-form audio buffering.

They do not configure live playback, low-latency live behavior, DRM, text tracks, interstitial playback, telemetry, server-directed optimization, or video-only tuning.

## Automatic quality switching

HLS and DASH vendor engines own ABR decisions. gaudio reports those decisions through protocol-neutral events:

```ts
player.on('manifestloaded', ({ variants }) => {
  console.log(variants.map(variant => ({
    id: variant.id,
    bitrate: variant.bitrate,
    codecs: variant.codecs,
  })))
})

player.on('variantchange', ({ variantId, bitrate, reason }) => {
  console.log(variantId, bitrate, reason) // reason is 'initial' or 'automatic'
})
```

Native HLS can emit `adaptivechange`, but it does not expose vendor-level manifest, variant, segment, or recoverable-error details.

## Manual quality experiments

gaudio currently does not provide a unified public `setQuality()` API. Manual quality is vendor-specific and should be treated as an advanced integration through the exposed vendor instances.

For `hls.js`, use the active `hlsInstance`:

```ts
player.on('manifestloaded', ({ variants }) => {
  const firstVariant = variants[0]
  const levelIndex = hlsAdapter.hlsInstance?.levels.findIndex((level, index) => {
    return String(level.id ?? index) === firstVariant.id
  })

  if (hlsAdapter.hlsInstance && levelIndex !== undefined && levelIndex >= 0) {
    hlsAdapter.hlsInstance.nextLevel = levelIndex
  }
})

// Return to automatic ABR.
hlsAdapter.hlsInstance!.loadLevel = -1
```

For dash.js, disable audio ABR and select a representation:

```ts
dashAdapter.updateSettings({
  streaming: {
    abr: {
      autoSwitchBitrate: {
        audio: false,
      },
    },
  },
})

dashAdapter.dashInstance?.setRepresentationForTypeById('audio', 'representation-id', true)

// Return to automatic ABR.
dashAdapter.updateSettings({
  streaming: {
    abr: {
      autoSwitchBitrate: {
        audio: true,
      },
    },
  },
})
```

The interactive demo exposes this as a quality selector after an HLS or DASH manifest loads. Manual controls are unavailable for native HLS because the browser does not expose equivalent level controls.

## Runtime configuration updates

HLS updates are stored for future loads by default:

```ts
await hlsAdapter.updateConfig({
  maxBufferLength: 48,
})
```

`hls.js` constructor options cannot all change atomically at runtime, so immediate application requires an explicit reload:

```ts
await hlsAdapter.updateConfig(
  { maxBufferLength: 48 },
  {
    apply: 'reload',
    restorePosition: true,
    resumePlayback: true,
  },
)
```

`reload` may re-download the manifest and segments, interrupt playback, and lose buffered data, retry state, and bandwidth estimates.

DASH settings use dash.js runtime updates:

```ts
dashAdapter.updateSettings({
  streaming: {
    buffer: {
      bufferTimeDefault: 24,
    },
  },
})
```

`getConfig()` and `getSettings()` return isolated copies of the effective preset plus caller overrides.

## Diagnostics

Adapters expose support and active vendor instances:

```ts
hlsAdapter.isSupported()
hlsAdapter.implementation // 'native', 'hls.js', or undefined
hlsAdapter.hlsInstance
hlsAdapter.getConfig()

dashAdapter.isSupported()
dashAdapter.dashInstance
dashAdapter.getSettings()
```

One adapter instance should be owned by one active player router at a time.

## Scope

Adaptive playback currently targets audio video-on-demand. Live playback, low-latency live behavior, DRM, transcoding, offline media, playlist management, and a protocol-neutral manual quality API are outside the current package scope.
