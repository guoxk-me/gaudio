# Adaptive Playback

Install only the adaptive dependency your application uses:

```bash
pnpm add gaudio hls.js
pnpm add gaudio dashjs
```

Register adapters with the player:

```ts
import { AdaptivePlaybackPreset, AudioPlayer } from 'gaudio'
import { createDashAdapter } from 'gaudio/dash'
import { createHlsAdapter } from 'gaudio/hls'

const player = new AudioPlayer({
  adapters: [
    createHlsAdapter({
      playbackStrategy: 'native-first',
      preset: AdaptivePlaybackPreset.Balanced,
    }),
    createDashAdapter({ preset: AdaptivePlaybackPreset.Balanced }),
  ],
})

player.setSource('https://example.com/program.m3u8')
await player.load()
```

## Playback Presets

Both adaptive adapters use `AdaptivePlaybackPreset.Balanced` when no preset is specified:

- `FastStart` uses smaller buffers for quick startup and frequent source changes.
- `Balanced` is the default for general music, podcasts, and audiobooks.
- `Stable` uses larger buffers for weak or variable networks.

Each profile provides protocol-specific audio VOD defaults for:

- forward and backward buffering with mobile-safe memory limits;
- automatic bitrate estimation and switching;
- manifest, playlist, initialization, and media-segment retries and timeouts;
- small-gap and stalled-playback recovery;
- paused download scheduling and long-form audio buffering.

Live playback, low-latency live behavior, DRM, text tracks, interstitial playback, telemetry, server-directed optimization, and pure-video tuning remain outside the preset contract.

Vendor-specific configuration is applied after the preset, so explicit values take precedence:

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

The HLS preset is stored when native HLS is selected, but browser-native playback does not expose the `hls.js` configuration controls. It takes effect on a later load that selects `hls.js`. HLS request-policy overrides are recursively merged, so changing one retry value retains the profile's remaining timeout and backoff settings.

The player identifies protocols from explicit metadata, MIME type, then `.m3u8` or `.mpd` URL paths. Signed or extensionless URLs can specify their protocol:

```ts
player.setSource({
  url: 'https://example.com/media?id=42',
  protocol: 'dash',
  mimeType: 'application/dash+xml',
})
```

HLS strategies are `native-first`, `hls-first`, `native-only`, and `hls-only`. Runtime HLS configuration normally applies on the next load; constructor-only settings require an explicit reload. DASH settings use the vendor runtime update API.

Adaptive playback currently supports video-on-demand. Live playback, DRM, transcoding, offline media, playlists, and manual quality selection are outside the current package scope.
