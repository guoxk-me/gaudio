# Getting Started

GAudio is currently pre-release. The public API is typed and documented, but intentional API adjustments can still happen before the first official release.

## Install

The commands below target npm's `next` dist-tag. Before the first registry release is visible, clone this repository and use its `gaudio` workspace package instead.

Install the core package for ordinary browser audio:

```bash
pnpm add gaudio@next
```

Install only the adaptive dependency your application actually imports:

```bash
pnpm add gaudio@next hls.js
pnpm add gaudio@next dashjs
```

## Import paths

| Import | What it contains | Vendor dependency |
| --- | --- | --- |
| `gaudio` | `AudioPlayer`, `HttpAudioSource`, `AudioAnalyzer`, `EventEmitter`, core types, adaptive event types, `AdaptivePlaybackPreset` | none |
| `gaudio/hls` | `createHlsAdapter`, HLS adapter types, `HlsConfig` re-export | `hls.js` |
| `gaudio/dash` | `createDashAdapter`, DASH adapter types, dash.js type re-exports | `dashjs` |

The root entry does not import `hls.js` or `dashjs`. Applications that only play MP3, AAC, WAV, or OGG do not need adaptive vendors.

## Compatibility

The built core and HLS entry points can be imported by Node.js 18 or newer; `dashjs@5` requires Node.js 20 or newer when evaluated in Node.js. Browser playback still requires DOM media APIs, so create players and adapters after client mount in SSR applications. Published declarations support TypeScript 5.8 or newer and are verified with TypeScript 5.8.3 plus the current project compiler.

Browser support is capability-based. CI exercises the current Playwright-bundled Chromium, Firefox, and WebKit desktop engines plus a Pixel 5 Chromium emulation project; this is a tested-current matrix, not a minimum-version or real-device guarantee. Core playback requires `HTMLAudioElement`, and analysis requires Web Audio. HLS requires native HLS or Media Source Extensions compatible with hls.js. DASH requires Media Source Extensions compatible with dash.js and native `globalThis.structuredClone()`. GAudio does not ship browser polyfills.

TypeScript consumers of `gaudio/dash` must use `node16`, `nodenext`, or `bundler` module resolution. Legacy `node10` resolution cannot resolve dash.js's transitive type packages.

Node.js 18 and 20 are end-of-life. They remain package-compatibility floors only; use a maintained release for SSR deployments and tooling. GAudio development and releases use Node.js 24 LTS.

## Create a player

```ts
import { AudioPlayer } from 'gaudio'

const player = new AudioPlayer({
  source: 'https://example.com/audio.mp3',
  preload: 'auto',
  volume: 0.8,
  playbackRate: 1,
  preservesPitch: true,
  mediaSession: true,
  analyzer: true,
})

player.on('statechange', state => console.log(state))
player.on('waiting', () => console.log('buffering'))
player.on('error', error => console.error(error.code, error.message))

await player.load()
await player.play()
```

`play()` loads automatically when the player is still `idle`. Calling `load()` first is useful when you want metadata, duration, buffered ranges, or autoplay failure handling before a user-visible play command.

## Constructor options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `source` | `AudioSourceInput` | `undefined` | URL string, source description, `HttpAudioSource`, `BlobAudioSource`, or custom `AudioSource`. Not loaded until `load()` or idle `play()`. |
| `adapters` | `readonly AudioEngineAdapter[]` | `[]` | Optional protocol adapters used by the internal engine router for HLS and DASH. Do not pass when injecting a custom engine. |
| `analyzer` | `boolean \| AudioPlayerAnalyzerOptions` | `undefined` | Enables player-owned Web Audio analysis after `load()`. Use `true` for defaults or pass `fftSize` and `createAnalyzer`. |
| `mediaSession` | `boolean \| AudioMediaSessionOptions` | `undefined` | Enables browser and operating-system media controls; pass metadata and seek-offset options when needed. |
| `preload` | `'none' \| 'metadata' \| 'auto'` | `'metadata'` | Browser preload hint applied to current and future sources. |
| `autoplay` | `boolean` | `false` | Makes `load()` attempt `play()` after the source is ready. Browser policy rejection becomes `PLAYBACK_BLOCKED`. |
| `muted` | `boolean` | `false` | Starts with muted output. |
| `loop` | `boolean` | `false` | Restarts playback after the end of a non-live source. |
| `volume` | `number` | `1` | Linear volume between `0` and `1`. Invalid values throw `RangeError`. |
| `playbackRate` | `number` | `1` | Playback speed multiplier greater than `0`. Invalid values throw `RangeError`. |
| `preservesPitch` | `boolean` | `true` | Keeps pitch stable when playback speed changes, using the browser media element capability. |

## Playback controls

| API | Description |
| --- | --- |
| `load()` | Opens the configured source and resolves after metadata is available. GAudio-owned source, network, decode, adaptive, and autoplay failures reject with `GAudioError`. |
| `play()` | Starts or resumes playback. If the player is `idle`, it loads first. |
| `pause()` | Pauses while retaining the current position and loaded source. |
| `stop()` | Pauses and returns to `0` seconds while retaining the loaded source. The next `play()` reuses it. |
| `seek(seconds)` | Seeks to a non-negative exact position. Invalid values throw `RangeError`. |
| `fastSeek(seconds)` | Uses the browser optimized seek path when available, otherwise falls back to `seek()`. |
| `dispose()` | Permanently disables the player and starts cleanup. Cleanup may continue after return; a cleanup error can throw, and a repeated call retries retained work. Create a new player and fresh adapters after disposal. |

Extension callbacks remain an exception boundary. `AudioPlayer.load()` wraps non-`GAudioError` failures from adapter `createEngine()` calls and analyzer factories as `ENGINE_ERROR`, keeps the original error in `cause`, and publishes the same wrapper through the player `error` event. Calling a custom adapter's `createEngine()` directly can still reject with that adapter's own error.

An injected custom `AudioEngine` is also a direct extension boundary. Constructor setup and subscriptions, `pause()`, `stop()`, `seek()`, `fastSeek()`, engine-backed settings, `canPlayType()`, state and range queries, and adaptive-quality operations preserve the engine's original thrown or rejected value. A delegated failure alone is not automatically published through the player `error` event. `load()` and `play()` remain player-owned boundaries; they use the documented `GAudioError` contract, and a fatal engine `error` rejects an in-flight play or autoplay load.

Cleanup remains a separate extension boundary. `setSource()`, `setPlaylist()`, `selectPlaylistTrack()`, `next()`, `previous()`, and `selectAudioTrack()` preserve the original analyzer-disposal or engine-unload error from source replacement. An explicit `AudioPlayer.load()` also preserves an error thrown while disposing a caller-provided analyzer before the new load starts. At the lower `MediaElementAudioEngine` layer, custom `AudioSource.open()` / `close()` methods and underlying media-element or subclass hooks preserve their original error identity. Catch these extension failures as `unknown`; stable `GAudioError.code` values describe failures owned by the player boundary and built-in adapters.

## Playback settings

```ts
player.setMuted(true)
player.setLoop(true)
player.setAutoplay(false)
player.setPlaybackRate(1.25)
player.setPreservesPitch(true)
player.setPreload('metadata')
player.setVolume(0.6)
```

Runtime getters mirror the setters:

```ts
player.getVolume()
player.isMuted()
player.isLooping()
player.getAutoplay()
player.getPlaybackRate()
player.getPreservesPitch()
player.getPreload()
```

## Time and range state

```ts
const currentTime = player.getCurrentTime()
const duration = player.getDuration()
const buffered = player.getBufferedRanges()
const seekable = player.getSeekableRanges()
const played = player.getPlayedRanges()
const state = player.getState()
const analyzer = player.getAnalyzer()
```

`TimeRange` values use seconds:

```ts
interface TimeRange {
  start: number
  end: number
}
```

`getDuration()` returns `0` when the browser has not reported a finite duration yet.

## Source inputs

`AudioPlayer` accepts five source shapes:

| Shape | Example | Use it when |
| --- | --- | --- |
| URL string | `'https://example.com/audio.mp3'` | The URL pathname extension is enough for routing. |
| `AudioSourceDescription` | `{ url, protocol: 'hls', mimeType }` | Signed, extensionless, or routed URLs need explicit protocol metadata. |
| `HttpAudioSource` | `new HttpAudioSource({ url, protocol })` | You want a reusable URL-backed source object. |
| `BlobAudioSource` | `new BlobAudioSource(file)` | You need a local `Blob` or `File` with object URL ownership and cleanup. |
| Custom `AudioSource` | `{ kind: 'url', open, close }` | You need signed URL refresh or application-owned resource lifecycle. |

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

player.setSource(new BlobAudioSource(file))
```

Custom sources are lazy. `open()` runs during `load()`, and `close()` runs when a newer source replaces it, loading is cancelled, or the player is disposed.

GAudio treats each `open()` call and its matching cleanup as one source operation. `close()` can run before `open()` settles, including after a synchronous throw or rejected promise, and GAudio can retry failed cleanup during a later `load()`, `unload()`, or `dispose()`. A custom source must therefore cancel or invalidate pending work, prevent a late `open()` result from becoming usable, and make repeated `close()` calls safe. Do not discard cleanup state until `close()` resolves. See the [signed URL recipe](/guide/recipes#signed-url-source) for a complete cancellation-safe lease implementation.

## Source cookbook

`HttpAudioSource` is intentionally a URL wrapper. It does not fetch media itself, attach custom request headers, set `credentials`, refresh signed URLs, or retry expired tokens. The selected browser or adaptive engine owns the actual media requests after `open()` returns `{ url }`.

Use a custom `AudioSource` when your app needs a fresh URL for every load. The [signed URL recipe](/guide/recipes#signed-url-source) shows client cancellation, idempotent server release, late-open invalidation, and cleanup retry without hiding failures.

For bearer tokens or custom headers, prefer returning a short-lived signed URL from your application backend. Native media elements do not expose per-request header hooks for ordinary MP3/AAC/WAV/OGG playback. If a token can expire during active HLS or DASH playback, refresh it before calling `load()` or use the selected vendor's request hooks through `createHlsAdapter({ config })` or `createDashAdapter({ settings })`, because manifest and segment requests happen after the source URL is attached.

For cookie-based auth, keep media on an origin that can receive the browser's credentials and configure CORS accordingly. The media response must allow the application origin, and credentialed cross-origin requests cannot use a wildcard `Access-Control-Allow-Origin`.

Analyzer data has an extra browser restriction. Cross-origin media can play successfully but still produce silent analyzer samples unless the media is CORS-enabled for Web Audio use. When you need `analyzer: true`, serve media with CORS headers that allow the page origin and test the analyzer path in the target browsers.

## Browser capabilities

Use `canPlayType()` for native media support:

```ts
const mp3Support = player.canPlayType('audio/mpeg')
const aacSupport = player.canPlayType('audio/mp4; codecs="mp4a.40.2"')
```

It returns `''`, `'maybe'`, or `'probably'` using browser media semantics. HLS and DASH support depends on registered adapters and the current browser; see [Adaptive Playback](./adaptive-playback.md).

## Autoplay behavior

GAudio manages autoplay at the player level instead of relying on the media element `autoplay` attribute. When `autoplay` is enabled, `load()` attempts playback after metadata is ready:

```ts
player.setAutoplay(true)

try {
  await player.load()
}
catch (error) {
  // Browser policy can block playback until a user gesture.
}
```

If browser policy blocks playback, `load()` rejects with `GAudioError` code `PLAYBACK_BLOCKED`. The source remains loaded, so a later user-triggered `play()` can retry without another `load()`.

## Audio analysis

Enable player-owned analysis when you want frequency-domain or waveform bytes for the active media source:

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

The built-in media element, HLS, and DASH engines create a Web Audio media-element source when analysis is enabled. Cross-origin media must allow audio analysis through CORS, otherwise browsers can return silent sample data.

Custom engines can support the simple `analyzer: true` path by exposing `createAnalyzer`. Applications that own a separate Web Audio graph can pass a custom factory:

```ts
const player = new AudioPlayer({
  source: 'https://example.com/audio.mp3',
  analyzer: {
    fftSize: 2048,
    createAnalyzer: ({ fftSize }) => new AudioAnalyzer(audioContext, sourceNode, fftSize),
  },
}, customEngine)
```

For lower-level usage, `AudioAnalyzer` can analyze any `AudioNode` that your application owns:

```ts
import { AudioAnalyzer } from 'gaudio'

const audioContext = new AudioContext()
const oscillator = audioContext.createOscillator()
const gain = audioContext.createGain()
const analyzer = new AudioAnalyzer(audioContext, oscillator, 2048)

gain.gain.value = 0
analyzer.connect(gain)
gain.connect(audioContext.destination)
oscillator.start()

const frequency = analyzer.getFrequencyData({ binCount: 64 })
const waveform = analyzer.getWaveformData({ sampleCount: 128 })

analyzer.dispose()
oscillator.stop()
await audioContext.close()
```

The interactive demo includes a canvas visualizer that continuously paints analyzer samples.
