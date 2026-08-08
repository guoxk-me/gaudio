# Configuration

This page collects the configuration surface in one place. Use it as a checklist before moving from a demo player to production playback.

## Install only what you use

The commands below target npm's `next` dist-tag. Before the first registry release is visible, clone this repository and use its `gaudio` workspace package instead.

```bash
pnpm add gaudio@next
```

Add adaptive vendors only when the application imports the matching adapter:

```bash
pnpm add gaudio@next hls.js
pnpm add gaudio@next dashjs
```

| Entry point | Dependency loaded | Use it for |
| --- | --- | --- |
| `gaudio` | none | Native browser audio, sources, playlists, events, Media Session, analysis, shared adaptive types. |
| `gaudio/hls` | `hls.js` | HLS manifests with native or `hls.js` playback. |
| `gaudio/dash` | `dashjs` | DASH manifests with dash.js playback. |

The root entry never imports `hls.js` or `dashjs`.

## Player options

```ts
import { AdaptivePlaybackPreset, AudioPlayer } from 'gaudio'
import { createDashAdapter } from 'gaudio/dash'
import { createHlsAdapter } from 'gaudio/hls'

const player = new AudioPlayer({
  source: {
    url: 'https://media.example.com/episode.m3u8',
    protocol: 'hls',
    mimeType: 'application/vnd.apple.mpegurl',
  },
  adapters: [
    createHlsAdapter({
      playbackStrategy: 'native-first',
      contentType: 'vod',
      preset: AdaptivePlaybackPreset.Balanced,
    }),
    createDashAdapter({
      contentType: 'vod',
      preset: AdaptivePlaybackPreset.Balanced,
    }),
  ],
  preload: 'metadata',
  autoplay: false,
  muted: false,
  loop: false,
  volume: 0.9,
  playbackRate: 1,
  preservesPitch: true,
  mediaSession: {
    seekOffset: 15,
    metadata: {
      title: 'Episode 1',
      artist: 'Example Studio',
      album: 'Example Podcast',
      artwork: [
        { src: '/cover-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
  },
  analyzer: {
    fftSize: 2048,
  },
})
```

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `source` | `AudioSourceInput` | `undefined` | Initial source. It opens only when `load()` or idle `play()` runs. |
| `adapters` | `readonly AudioEngineAdapter[]` | `[]` | Optional HLS, DASH, or future protocol adapters for the internal router. Do not combine with a custom engine. |
| `analyzer` | `boolean \| AudioPlayerAnalyzerOptions` | `undefined` | `true` enables player-owned Web Audio analysis with default `fftSize`. |
| `mediaSession` | `boolean \| AudioMediaSessionOptions` | `undefined` | Enables browser, keyboard, headset, and operating-system media controls when supported. |
| `preload` | `'none' \| 'metadata' \| 'auto'` | `'metadata'` | Browser preload hint for current and future sources. |
| `autoplay` | `boolean` | `false` | Makes `load()` attempt playback after metadata. Browser policy failures reject with `PLAYBACK_BLOCKED`. |
| `muted` | `boolean` | `false` | Initial mute state. |
| `loop` | `boolean` | `false` | Replays non-live sources after `ended`. |
| `volume` | `number` | `1` | Linear volume from `0` to `1`; invalid values throw `RangeError`. |
| `playbackRate` | `number` | `1` | Playback speed greater than `0`; invalid values throw `RangeError`. |
| `preservesPitch` | `boolean` | `true` | Requests stable pitch when rate changes, using browser media element support. |

## Source configuration

GAudio accepts five source shapes:

| Shape | Example | Best for |
| --- | --- | --- |
| URL string | `'https://example.com/audio.mp3'` | Ordinary files with a recognized URL pathname extension. |
| Source description | `{ url, protocol: 'hls', mimeType }` | Signed, extensionless, or gateway URLs that need explicit routing. |
| `HttpAudioSource` | `new HttpAudioSource({ url, protocol })` | Reusable URL-backed source objects. |
| `BlobAudioSource` | `new BlobAudioSource(file)` | Local `Blob` or `File` playback with owned object URL cleanup. |
| Custom `AudioSource` | `{ kind: 'url', open, close }` | Load-time signed URLs or app-owned resource leases. |

```ts
import { BlobAudioSource, HttpAudioSource } from 'gaudio'

player.setSource('https://cdn.example.com/song.mp3')

player.setSource({
  url: 'https://media.example.com/play?id=42',
  protocol: 'dash',
  mimeType: 'application/dash+xml',
})

player.setSource(new HttpAudioSource({
  url: 'https://cdn.example.com/program.m3u8',
  protocol: 'hls',
  mimeType: 'application/vnd.apple.mpegurl',
}))

player.setSource(new BlobAudioSource(file))
```

`HttpAudioSource` does not attach headers, set credentials, refresh tokens, or retry expired URLs. Use a custom source for a fresh URL before each `load()`, and use HLS/DASH vendor hooks when manifest or segment requests need authentication after playback starts.

GAudio can call `close()` while `open()` is still pending and can retry failed cleanup during a later lifecycle operation. Custom sources must invalidate late open results, retain cleanup ownership until it succeeds, and make repeated `close()` calls safe. For a complete signed-URL lease implementation, see the [signed URL recipe](/guide/recipes#signed-url-source).

## Playlist configuration

```ts
player.setPlaylist(
  [
    {
      source: 'https://cdn.example.com/episode-1.mp3',
      fallbackSources: ['https://backup.example.com/episode-1.mp3'],
      metadata: {
        title: 'Episode 1',
        artist: 'Example Studio',
        album: 'Example Podcast',
      },
    },
    {
      source: 'https://cdn.example.com/episode-2.mp3',
      metadata: {
        title: 'Episode 2',
        artist: 'Example Studio',
      },
    },
  ],
  { startIndex: 0 },
)
```

| Field or option | Type | Default | Notes |
| --- | --- | --- | --- |
| `AudioPlaylistTrack.source` | `AudioSourceInput` | required | Primary source for the track. |
| `fallbackSources` | `readonly AudioSourceInput[]` | `[]` | Tried in order if the primary source fails to load. |
| `metadata` | `AudioMediaSessionMetadata` | `undefined` | Track-specific Media Session metadata. |
| `audioTracks` | `readonly AudioTrack[]` | `undefined` | Alternate language or companion audio sources. |
| `defaultAudioTrackId` | `string` | first audio track | Initial alternate audio track when present. |
| `AudioPlaylistOptions.startIndex` | `number` | `0` | Zero-based track selected when the playlist is assigned. |
| `AudioPlaylistNavigationOptions.autoplay` | `boolean` | Player `autoplay` | Whether `next()`, `previous()`, or `selectPlaylistTrack()` starts playback after loading. An explicit value overrides the player setting. |
| `AudioTrackSelectionOptions.preserveTime` | `boolean` | `true` | Keeps the same program position when switching alternate audio. |
| `AudioTrackSelectionOptions.autoplay` | `boolean \| 'preserve'` | `'preserve'` | Preserves previous paused/playing state unless explicitly set. |

Playlist tracks automatically continue to the next track after a non-looping `ended`.

## Media Session configuration

```ts
const player = new AudioPlayer({
  source: 'https://cdn.example.com/episode.mp3',
  mediaSession: {
    enabled: true,
    seekOffset: 30,
    metadata: {
      title: 'Episode 1',
      artist: 'Example Studio',
      album: 'Example Podcast',
      artwork: [
        { src: '/cover-96.png', sizes: '96x96', type: 'image/png' },
        { src: '/cover-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
  },
})
```

| Field | Default | Notes |
| --- | --- | --- |
| `enabled` | `true` | Set `false` to disable Media Session even when metadata is present. |
| `metadata.title` | `undefined` | Track, program, or episode title. |
| `metadata.artist` | `undefined` | Artist, host, narrator, or creator. |
| `metadata.album` | `undefined` | Album, podcast, audiobook, or collection. |
| `metadata.artwork` | `undefined` | Artwork candidates for supported system surfaces. |
| `seekOffset` | `10` | Seconds moved by system seek-forward and seek-backward actions. |

Supported browsers route system actions through `play()`, `pause()`, `stop()`, `previous()`, `next()`, `seek()`, and `fastSeek()`. Unsupported browsers ignore the integration.

Media Session actions do not have a promise caller. GAudio-owned loading or playback failures remain observable through the player's `error` event and are not reported twice. Expected `LOAD_ABORTED` cancellations caused by newer source or lifecycle operations are ignored. Other synchronous and asynchronous action failures are contained and forwarded to the host's global error reporting (`globalThis.reportError`, with an uncaught microtask fallback).

## Analyzer configuration

```ts
const player = new AudioPlayer({
  source: 'https://cdn.example.com/song.mp3',
  analyzer: {
    enabled: true,
    fftSize: 1024,
  },
})

await player.load()

const analyzer = player.getAnalyzer()
const frequency = analyzer?.getFrequencyData({ binCount: 64 })
const waveform = analyzer?.getWaveformData({ sampleCount: 128 })
```

| Field | Default | Notes |
| --- | --- | --- |
| `enabled` | `true` | Set `false` to keep an analyzer configuration object without creating analysis. |
| `fftSize` | `2048` | Must be a browser-supported `AnalyserNode.fftSize` value. |
| `createAnalyzer` | engine factory | Use when a custom engine or app-owned Web Audio graph should provide analysis. |

Cross-origin media can play successfully but still return silent analyzer samples unless the media response allows Web Audio access through CORS.

## Adaptive adapter configuration

```ts
import { AdaptivePlaybackPreset } from 'gaudio'
import { createHlsAdapter } from 'gaudio/hls'

const hlsAdapter = createHlsAdapter({
  playbackStrategy: 'hls-first',
  contentType: 'long-form',
  preset: AdaptivePlaybackPreset.Stable,
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

| HLS option | Default | Notes |
| --- | --- | --- |
| `contentType` | `'vod'` | `'vod'`, `'long-form'`, or `'live'` content tuning. |
| `preset` | `AdaptivePlaybackPreset.Balanced` | `FastStart`, `Balanced`, or `Stable` audio profile. |
| `playbackStrategy` | `'native-first'` | `'native-first'`, `'hls-first'`, `'native-only'`, or `'hls-only'`. |
| `config` | `{}` | Partial `hls.js` constructor settings. Only manifest, playlist, fragment, and key load policies accept nested partial overrides. Ignored by native HLS playback. |

```ts
import { AdaptivePlaybackPreset } from 'gaudio'
import { createDashAdapter } from 'gaudio/dash'

const dashAdapter = createDashAdapter({
  contentType: 'live',
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

| DASH option | Default | Notes |
| --- | --- | --- |
| `contentType` | `'vod'` | `'vod'`, `'long-form'`, or `'live'` content tuning. |
| `preset` | `AdaptivePlaybackPreset.Balanced` | `FastStart`, `Balanced`, or `Stable` audio profile. |
| `settings` | `{}` | Recursively sparse `DashSettingsChanges`, applied when a DASH engine is created. |

Use [Adaptive Playback](./adaptive-playback.md) for preset values, content-type behavior, quality selection, and diagnostics.

## Runtime updates

```ts
await hlsAdapter.updateConfig({
  maxBufferLength: 48,
})

await hlsAdapter.updateConfig(
  { maxBufferLength: 60 },
  {
    apply: 'reload',
    restorePosition: true,
    resumePlayback: true,
  },
)

dashAdapter.updateSettings({
  streaming: {
    buffer: {
      bufferTimeDefault: 24,
    },
  },
})
```

HLS updates apply on the next load unless `apply: 'reload'` is set. Reloading interrupts playback and loses buffered segments, retry state, and bandwidth estimates. DASH `settings` and `updateSettings()` accept `DashSettingsChanges`, so one nested setting can change without supplying its siblings; runtime updates can apply while DASH playback is active.

## Recommended starting profiles

| Product shape | Core options | Adaptive options |
| --- | --- | --- |
| Music or short clips | `preload: 'metadata'`, `volume: 1`, `loop: false` | `contentType: 'vod'`, `preset: Balanced` |
| Preview cards | `preload: 'none'`, explicit user `play()` | `contentType: 'vod'`, `preset: FastStart` |
| Podcast or audiobook | `preload: 'metadata'`, Media Session metadata, playlist fallback | `contentType: 'long-form'`, `preset: Stable` on weak networks |
| Live radio or live event | `autoplay: false`, user gesture before `play()` | `contentType: 'live'`, strategy that enforces the vendor settings you need |
| Visualizer | `analyzer: { fftSize: 1024 }`, CORS-enabled media | Any adaptive profile, verified in target browsers |
