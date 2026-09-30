# GAudio

A browser-first TypeScript audio streaming library with optional HLS and DASH adapters.

GAudio is currently pre-release. Use the documented API directly, but expect intentional API adjustments before the first official release.

## Install

The commands below target npm's `next` dist-tag. Before the first registry release is visible, clone this repository and use its `gaudio` workspace package instead.

```bash
pnpm add gaudio@next
```

Install only the adaptive dependency your application uses:

```bash
pnpm add gaudio@next hls.js@~1.6.16
pnpm add gaudio@next dashjs
```

## Entry points

| Import | Contents |
| --- | --- |
| `gaudio` | `AudioPlayer`, `HttpAudioSource`, `BlobAudioSource`, `AudioAnalyzer`, `EventEmitter`, core types, adaptive event types, `AdaptiveContentType`, `AdaptivePlaybackPreset` |
| `gaudio/hls` | `createHlsAdapter`, HLS adapter types, `HlsConfig` |
| `gaudio/dash` | `createDashAdapter`, `DashSettingsChanges`, DASH adapter types, dash.js type re-exports |

The root entry does not import `hls.js` or `dashjs`.

## Compatibility

- The built `gaudio` core and `gaudio/hls` entry points support Node.js 18 or newer for SSR imports and package-consumer tooling. Browser playback APIs still require a browser and should be created after client mount.
- `dashjs@5` itself requires Node.js 20 or newer when evaluated in Node.js. This does not change DASH playback support in compatible browsers.
- Published declarations support TypeScript 5.8 or newer and are verified with TypeScript 5.8.3 plus the current project compiler.
- `hls.js >=1.6.16 <1.7.0` and `dashjs ^5.2.0` remain optional peers. Install only the peer used by the corresponding subpath import. `hls.js` 1.7 is excluded because its published declarations do not pass the supported TypeScript consumer matrix.
- Browser support is capability-based. CI exercises the current Playwright-bundled Chromium, Firefox, and WebKit desktop engines plus a Pixel 5 Chromium emulation project; this is a tested-current matrix, not a minimum-version or real-device guarantee. Core playback requires `HTMLAudioElement`, and analysis requires Web Audio. HLS requires native HLS or Media Source Extensions compatible with hls.js. DASH requires Media Source Extensions compatible with dash.js and native `globalThis.structuredClone()`. GAudio does not ship browser polyfills.
- TypeScript consumers of `gaudio/dash` must use `node16`, `nodenext`, or `bundler` module resolution. Legacy `node10` resolution cannot resolve dash.js's transitive type packages.

Node.js 18 and 20 are end-of-life. Those numbers are artifact compatibility floors, not deployment recommendations; use a maintained Node.js release for SSR applications and tooling. GAudio itself develops and releases on Node.js 24 LTS.

## Capability map

GAudio combines a small high-level player with lower-level escape hatches for audio-heavy applications:

| Capability | APIs to reach for |
| --- | --- |
| Native browser playback | `AudioPlayer`, `MediaElementAudioEngine`, `canPlayType()`, `getBufferedRanges()`, `getSeekableRanges()`, `getPlayedRanges()` |
| Product playback controls | `load()`, `play()`, `pause()`, `stop()`, `seek()`, `fastSeek()`, volume, mute, loop, autoplay, preload, playback-rate, and pitch-preservation APIs |
| Queue and catalog flows | `setPlaylist()`, `next()`, `previous()`, `fallbackSources`, `metadata`, `audioTracks`, and `selectAudioTrack()` |
| Source ownership | URL strings, `AudioSourceDescription`, `HttpAudioSource`, `BlobAudioSource`, and custom lazy `AudioSource` objects with `open()` and `close()` |
| System media controls | `mediaSession`, `activateMediaSession()`, `setMediaSessionMetadata()`, browser action handlers, headset controls, keyboard media keys, and lock-screen metadata where supported |
| Visualization and metering | `analyzer: true`, `getAnalyzer()`, `AudioAnalyzer`, frequency data, waveform data, and custom analyzer factories |
| Adaptive audio streaming | `createHlsAdapter()`, `createDashAdapter()`, `AdaptivePlaybackPreset`, `contentType`, manifest events, segment events, variant events, and `setAdaptiveQuality()` |
| Observability and cleanup | Typed `AudioPlayerEvents`, `once()`, `removeAllListeners()`, `GAudioError` codes, active source inspection, active protocol inspection, and `dispose()` |

Core-only applications can stay on the root `gaudio` import. Adaptive applications opt into `gaudio/hls` or `gaudio/dash` so vendor code and configuration stay out of native-media bundles.

### Class extension policy

`MediaElementAudioEngine` is the only exported class with a supported inheritance contract. Subclasses may depend on its public and protected members, while its internal state remains private. Use `AudioPlayer`, `AudioAnalyzer`, and `EventEmitter` directly or through composition; subclassing those concrete utilities is not a compatibility contract. Prefer the public `AudioEngine`, `AudioEngineAdapter`, `AudioSource`, analyzer-factory, and event APIs for extensions.

<!-- AI modified: custom engines implement core playback while browser-only capabilities have explicit fallbacks. -->
Custom `AudioEngine` implementations are supported directly and through adapters. Core playback, events, cancellation, and asynchronous resource disposal remain required. The browser-specific members below are optional; existing complete implementations continue to work.

| Optional engine members | Player/router behavior when omitted |
| --- | --- |
| `fastSeek` | Calls `seek` with the same cancellation and error behavior. |
| `setPreload`, `getPreload` | Retains the requested hint; an engine without the setter chooses its own fetching policy. |
| `setAutoplay`, `getAutoplay` | Retains the native hint; `AudioPlayer` still owns application autoplay. Engines without the setter must load paused until `play()`. |
| `getSeekableRanges`, `getPlayedRanges` | Returns `[]`, meaning the ranges are unknown. |
| `canPlayType` | Returns `''`, meaning format support is unknown. |

Analysis and adaptive-quality methods remain optional capabilities. `load(source, options?: AudioEngineLoadOptions)` can receive a `crossOrigin` request policy; browser media engines apply it before fetching. Custom transports own how that policy applies to their requests.

An `HTMLAudioElement` passed directly to `MediaElementAudioEngine` may be empty or use its own `src`, but it must not contain child `<source>` elements. Pass ordered source candidates through `AudioPlayer` source and fallback APIs so browser-native selection cannot reactivate an old resource after engine cleanup.

Playback settings use last-accepted-change precedence. A successful `AudioPlayer` setting call becomes current immediately; later `volumechange` or `ratechange` events from the active native, adaptive, or custom engine become current before listeners are notified. Those current values are applied when playback changes protocol. Settings without an engine event—preload, autoplay, loop, and pitch preservation—change only through the player API.

## Quick start

```ts
import { AudioPlayer } from 'gaudio'

const player = new AudioPlayer({
  source: 'https://example.com/audio.mp3',
  preload: 'auto',
  volume: 0.8,
  mediaSession: {
    metadata: {
      title: 'Episode 1',
      artist: 'Example Studio',
      album: 'Example Podcast',
      artwork: [
        { src: '/cover-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
  },
  analyzer: true,
})

player.on('statechange', state => console.log(state))
player.on('error', error => console.error(error.code))

await player.load()
await player.play()
```

## Core controls

```ts
player.pause()
player.stop()
await player.seek(30)
await player.fastSeek(45)

player.setVolume(0.6)
player.setMuted(false)
player.setLoop(false)
player.setAutoplay(false)
player.setPlaybackRate(1.25)
player.setPreservesPitch(true)
player.setPreload('metadata')

player.getBufferedRanges()
player.getSeekableRanges()
player.getPlayedRanges()
player.getAnalyzer()
player.getSource()
await player.dispose()
```

Volume must be between `0` and `1`. Playback rate must be greater than `0`. Seek targets must be non-negative.

## Playlists and fallback sources

Use a playlist when an application owns track order, previous/next controls, and automatic continuation:

```ts
player.setPlaylist([
  {
    source: 'https://example.com/episode-1.mp3',
    fallbackSources: ['https://cdn.example.com/episode-1.mp3'],
    metadata: {
      title: 'Episode 1',
      artist: 'Example Studio',
    },
  },
  {
    source: 'https://example.com/episode-2.mp3',
    metadata: {
      title: 'Episode 2',
      artist: 'Example Studio',
    },
  },
])

await player.load()
await player.next()
await player.previous()
```

When a playlist track ends, GAudio automatically loads and plays the next track. If a track fails to load, its `fallbackSources` are attempted in order before an error is emitted. Because automatic continuation has no returned promise, an otherwise unreported source-replacement cleanup failure is published once as `ENGINE_ERROR`; a load failure already published by `load()` is not emitted again.

For video companion audio or dubbed language selection, put alternate audio tracks inside a playlist track:

```ts
player.setPlaylist([
  {
    source: 'https://example.com/episode.zh-CN.m4a',
    defaultAudioTrackId: 'zh-CN',
    audioTracks: [
      {
        id: 'zh-CN',
        label: '简体中文',
        language: 'zh-CN',
        source: 'https://example.com/episode.zh-CN.m4a',
      },
      {
        id: 'en',
        label: 'English',
        language: 'en',
        source: 'https://example.com/episode.en.m4a',
      },
    ],
  },
])

await player.selectAudioTrack('en')
```

`selectAudioTrack()` keeps the current time and previous paused/playing state by default, so language changes stay on the same program timeline.

## Browser Media Session

Enable `mediaSession` to connect GAudio with browser and operating-system media controls. Supported browsers can show title, artist, album, and artwork in lock-screen or system media surfaces, and headset or keyboard media keys can trigger play, pause, stop, previous, next, seek forward, seek backward, and seek-to actions.

```ts
const player = new AudioPlayer({
  source: 'https://example.com/audio.mp3',
  mediaSession: true,
})

player.setMediaSessionMetadata({
  title: 'Episode 1',
  artist: 'Example Studio',
  album: 'Example Podcast',
})
```

Playlist track `metadata` takes priority while that track is active. `setMediaSessionMetadata()` updates the default metadata used by direct sources and playlist tracks that do not provide their own metadata.

With multiple Media Session-enabled players, the most recently confirmed playing player owns system controls. Use `player.activateMediaSession()` to explicitly give a paused player ownership without starting playback. Awaiting disposal of the active owner restores the previous eligible player's metadata, playback state, position, and action handlers. A browser restoration failure rejects `dispose()` without committing the ownership change; repeat `dispose()` to retry the unfinished handoff safely.

Media Session actions do not have a promise caller. GAudio-owned loading or playback failures remain observable through the player's `error` event and are not reported twice. Expected `LOAD_ABORTED` cancellations caused by newer source or lifecycle operations are ignored. Other synchronous and asynchronous action failures are contained and forwarded to the host's global error reporting (`globalThis.reportError`, with an uncaught microtask fallback).

## Source inputs

```ts
import { AudioPlayer, BlobAudioSource, HttpAudioSource } from 'gaudio'

player.setSource('https://example.com/audio.mp3')

player.setSource({
  url: 'https://example.com/media?id=42',
  protocol: 'hls',
  mimeType: 'application/vnd.apple.mpegurl',
})

player.setSource(new HttpAudioSource({
  url: 'https://example.com/program.mpd',
  protocol: 'dash',
  mimeType: 'application/dash+xml',
}))

const fileSource = new BlobAudioSource(file)
player.setSource(fileSource)
```

`HttpAudioSource` is only a URL wrapper; it does not attach headers, set credentials, or refresh expired tokens. Custom `AudioSource` objects can lazily open signed URLs, local object URLs, or app-owned resources through `open()` and `close()`. GAudio may call `close()` before `open()` settles and may retry it after a cleanup failure. Custom sources must cancel or invalidate pending work, prevent late `open()` results from becoming usable, keep failed cleanup state for retry, and make repeated `close()` calls safe. For HLS/DASH manifests and segments that need authentication after playback starts, use the selected vendor's request hooks through the adapter configuration.

GAudio-owned failures use stable `GAudioError` codes. Extension callbacks can still propagate their original errors at documented boundaries. `AudioPlayer.load()` wraps non-`GAudioError` failures from adapter `createEngine()` calls and analyzer factories as `ENGINE_ERROR`, retaining the original error in `cause` and publishing that same wrapper through the player `error` event. Calling a custom adapter's `createEngine()` directly can still expose the adapter's own error.

An injected custom `AudioEngine` is also a direct extension boundary. Constructor setup and subscriptions, `pause()`, `stop()`, `seek()`, `fastSeek()`, engine-backed settings, `canPlayType()`, state and range queries, and adaptive-quality operations preserve the engine's original thrown or rejected value. A delegated failure alone is not automatically published through the player `error` event. `load()` and `play()` remain player-owned boundaries; they use the documented `GAudioError` contract, and a fatal engine `error` rejects an in-flight play or autoplay load.

Cleanup is a separate extension boundary. `setSource()`, `setPlaylist()`, `selectPlaylistTrack()`, `next()`, `previous()`, and `selectAudioTrack()` preserve the original analyzer-disposal or engine-unload error from source replacement; an explicit `load()` likewise preserves a caller-provided analyzer's disposal error before the new load starts. Direct `MediaElementAudioEngine` use preserves errors from custom `AudioSource.open()` / `close()` and underlying media-element or subclass hooks. Treat caught extension failures as `unknown` unless the callback contract narrows them.

## Adaptive playback

```ts
import { AdaptivePlaybackPreset, AudioPlayer } from 'gaudio'
import { createDashAdapter } from 'gaudio/dash'
import { createHlsAdapter } from 'gaudio/hls'

const hlsAdapter = createHlsAdapter({
  playbackStrategy: 'native-first',
  contentType: 'vod',
  preset: AdaptivePlaybackPreset.Balanced,
})

const dashAdapter = createDashAdapter({
  contentType: 'vod',
  preset: AdaptivePlaybackPreset.Balanced,
})

const player = new AudioPlayer({
  adapters: [hlsAdapter, dashAdapter],
})
```

`Balanced` is used when `preset` is omitted. Choose `FastStart` for smaller startup buffers or `Stable` for weak and variable networks. Use `contentType: 'long-form'` for audiobooks and multi-hour programs, or `contentType: 'live'` for HLS/DASH live streams with latency and reconnect tuning. Explicit vendor configuration overrides the selected preset and content type.

### Runtime adapter configuration

```ts
console.log(hlsAdapter.getConfig())

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

console.log(dashAdapter.getSettings())

dashAdapter.updateSettings({
  streaming: {
    buffer: {
      bufferTimeDefault: 24,
    },
  },
})
```

`DashAdapterOptions.settings` and `updateSettings()` accept `DashSettingsChanges`, a recursively sparse view of dash.js `MediaPlayerSettingClass`; callers can update one nested setting without supplying its siblings. `getConfig()` and `getSettings()` return isolated complete copies. HLS updates are stored for future loads by default; `apply: 'reload'` recreates the active `hls.js` engine, interrupts playback, and discards buffered data, retry state, and bandwidth estimates. DASH updates use the active dash.js runtime settings API.

Player controls issued during HLS reload take precedence over its saved playback and position: pause prevents automatic resume, stop also prevents restoring the old position, and newer seek/play requests keep ownership. Cancelling restoration after it has begun rejects the reload with `LOAD_ABORTED` while retaining the replacement engine.

GAudio reports adaptive quality through `manifestloaded` and `variantchange`. Use the player-level API for protocol-neutral quality controls:

```ts
const variants = player.getAdaptiveVariants()
await player.setAdaptiveQuality('auto')

// AI modified: adapter variant order is not a quality ranking.
const highestBitrateVariant = [...variants]
  .sort((leftVariant, rightVariant) => rightVariant.bitrate - leftVariant.bitrate)[0]
if (highestBitrateVariant) {
  await player.setAdaptiveQuality(highestBitrateVariant.id)
}
```

Variant order is implementation-owned. Sort by `bitrate` before selecting a quality by rank.

Native HLS still uses browser-owned ABR and does not expose manual variants. Advanced integrations can still inspect the exposed `hlsInstance` or `dashInstance` from adapter subpaths.

## Events

```ts
const unsubscribe = player.on('playing', () => console.log('playing'))

player.once('ended', () => console.log('done'))
player.removeAllListeners('timeupdate')
unsubscribe()
```

## Audio analysis

Use the player-level analyzer option for the built-in media element, HLS, and DASH engines:

```ts
const player = new AudioPlayer({
  source: 'https://example.com/audio.mp3',
  analyzer: {
    fftSize: 1024,
  },
})

await player.load()

const analyzer = player.getAnalyzer()
const frequency = analyzer?.getFrequencyData({ binCount: 64 })
const waveform = analyzer?.getWaveformData({ sampleCount: 128 })
```

Custom engines can expose `createAnalyzer`, or applications can pass `analyzer.createAnalyzer` to connect their own Web Audio graph.

<!-- AI modified: document the request policy required before connecting browser media to Web Audio. -->
Built-in player-owned analysis uses `crossOrigin: 'anonymous'` before loading media. The server must allow the page origin through CORS; cross-origin media fetched without CORS can silence the entire Web Audio output. Use `crossOrigin: 'use-credentials'` for native media that requires cookies, with an explicit allowed origin and `Access-Control-Allow-Credentials: true`. Injected custom engines and custom analyzer factories keep their own request policy unless `crossOrigin` is explicitly supplied. This option configures the media element; hls.js and dash.js manifest/segment credentials remain vendor adapter configuration.

For lower-level Web Audio usage, `AudioAnalyzer` reads frequency and waveform byte samples from an `AudioNode`:

```ts
import { AudioAnalyzer } from 'gaudio'

const audioContext = new AudioContext()
const oscillator = audioContext.createOscillator()
const analyzer = new AudioAnalyzer(audioContext, oscillator, 2048)

oscillator.start()

const frequency = analyzer.getFrequencyData({ binCount: 64 })
const waveform = analyzer.getWaveformData({ sampleCount: 128 })

analyzer.dispose()
oscillator.stop()
await audioContext.close()
```

See the [GAudio documentation](https://guoxk-me.github.io/gaudio/) for bilingual guides, API reference, and interactive examples with adaptive quality controls and a canvas spectrum visualizer.

## Support and security

Use the [support guide](https://github.com/guoxk-me/gaudio/blob/main/SUPPORT.md) for usage questions, reproducible defects, and the information to include in an issue.

Report undisclosed vulnerabilities through [GitHub private vulnerability reporting](https://github.com/guoxk-me/gaudio/security/advisories/new) and follow the [security policy](https://github.com/guoxk-me/gaudio/security/policy). Do not disclose a vulnerability in a public issue.
