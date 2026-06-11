# gaudio

A browser-first TypeScript audio streaming library.

## Install

```bash
pnpm add gaudio
```

Install only the adaptive-stream dependency your application uses:

```bash
pnpm add gaudio hls.js
pnpm add gaudio dashjs
```

## Quick Start

```ts
import { AudioPlayer } from 'gaudio'

const player = new AudioPlayer({
  source: 'https://example.com/audio.mp3',
  preload: 'auto',
  autoplay: false,
  volume: 0.8,
  muted: false,
  loop: false,
  playbackRate: 1,
  preservesPitch: true,
})

player.on('statechange', state => console.log(state))
player.on('waiting', () => console.log('buffering'))
player.on('seeking', ({ currentTime }) => console.log('seeking', currentTime))
player.on('bufferupdate', ({ ranges }) => console.log('buffered', ranges))

await player.load()
await player.play()

player.setMuted(true)
player.setLoop(true)
await player.fastSeek(30)
console.log(player.getPlayedRanges())
```

## HLS and DASH VOD

Adaptive playback uses optional adapters, so importing `gaudio` alone does not load `hls.js` or `dashjs`:

```ts
import { AudioPlayer } from 'gaudio'
import { createDashAdapter } from 'gaudio/dash'
import { createHlsAdapter } from 'gaudio/hls'

const hlsAdapter = createHlsAdapter({
  playbackStrategy: 'native-first',
  config: {
    maxBufferLength: 60,
  },
})

const dashAdapter = createDashAdapter({
  settings: {
    streaming: {
      buffer: {
        bufferTimeDefault: 30,
      },
    },
  },
})

const player = new AudioPlayer({
  adapters: [hlsAdapter, dashAdapter],
})

player.setSource('https://example.com/program.m3u8')
await player.load()
```

The player selects a protocol from explicit metadata, MIME type, then the `.m3u8` or `.mpd` URL pathname. Signed or extensionless URLs can specify the protocol:

```ts
player.setSource({
  url: 'https://example.com/media?id=42',
  protocol: 'dash',
  mimeType: 'application/dash+xml',
})
```

One player can switch between ordinary media, HLS, and DASH sources. Protocol changes dispose the previous engine and are not gapless.

### HLS Strategy

`createHlsAdapter()` supports four deterministic strategies:

- `native-first` (default): native HLS, then `hls.js`.
- `hls-first`: `hls.js`, then native HLS.
- `native-only`: reject when native HLS is unavailable.
- `hls-only`: reject when `hls.js` cannot run.

The adapter exposes the active implementation and read-only vendor instance:

```ts
console.log(hlsAdapter.implementation)
console.log(hlsAdapter.hlsInstance)
console.log(dashAdapter.dashInstance)
```

`hlsInstance` is `undefined` on the native HLS path. Native playback also cannot provide the detailed manifest, variant, segment, and recoverable-error events emitted by `hls.js`.

### Adaptive Events

The player exposes protocol-neutral adaptive events:

```ts
player.on('adaptivechange', update => console.log(update))
player.on('manifestloaded', update => console.log(update.variants))
player.on('variantchange', update => console.log(update.variantId, update.bitrate))
player.on('segmentloadstart', update => console.log(update.url))
player.on('segmentloaded', update => console.log(update.url))
player.on('streamerror', update => console.log(update.category, update.isFatal))
```

Recoverable vendor failures emit `streamerror` while the vendor retries. Fatal failures also emit the existing `error` event with a typed `GAudioError` code.

### Runtime Configuration

HLS configuration updates default to the next load and do not interrupt playback:

```ts
await hlsAdapter.updateConfig({ maxBufferLength: 90 })
```

Constructor-only `hls.js` settings require an explicit reload:

```ts
await hlsAdapter.updateConfig(
  { backBufferLength: 30 },
  {
    apply: 'reload',
    restorePosition: true,
    resumePlayback: true,
  },
)
```

Reloading destroys and recreates the active `Hls` instance. It may interrupt playback and rebuffer; buffered segments, in-flight requests, bandwidth estimates, and retry state are not preserved.

DASH settings use the official runtime update API:

```ts
dashAdapter.updateSettings({
  streaming: {
    buffer: {
      bufferTimeDefault: 45,
    },
  },
})
```

## Core API

`AudioPlayer` provides playback controls plus typed media state:

- Playback: `load`, `play`, `pause`, `stop`, `seek`, `fastSeek`, and `dispose`.
- Media settings: preload, autoplay, volume, muted, loop, playback rate, and `preservesPitch` getters/setters.
- State queries: current time, duration, paused, ended, seeking, buffered ranges, seekable ranges, and `getPlayedRanges()`.
- Format checks: `canPlayType(mimeType)` returns `''`, `'maybe'`, or `'probably'`.
- Lifecycle events: loading, metadata, readiness, playback, buffering, seeking, time, duration, volume, rate, ending, adaptive streaming, and errors.

`stop()` pauses playback and returns to 0 seconds while retaining the loaded source. The player returns to `ready`, so the next `play()` does not reload the media.

When `autoplay` is enabled, `load()` explicitly attempts playback after the source becomes ready. Browser policy rejection is reported as `PLAYBACK_BLOCKED`; the loaded source is retained so a user-triggered `play()` can retry without another load. Changing autoplay at runtime affects future loads only.

Volume must be between 0 and 1, playback rate must be greater than 0, and seek positions must be non-negative. Non-finite or out-of-range values throw `RangeError` before reaching the engine.

## Demo

Run the browser demo from the project root:

```bash
pnpm run demo
```

Then open <http://localhost:4173/>. The Vue demo loads local MP3, WAV, AAC (M4A), and Opus (OGG) samples and accepts external HLS/DASH VOD URLs. It exercises protocol selection, adaptive status/events, loading, playback, regular and fast seeking, autoplay, pitch preservation, preload, mute, loop, volume, playback rate, media states, and time ranges.

Verify the production Demo build with:

```bash
pnpm run demo:build
```

## Migration from 0.1.0

- Remove `lowLatency` from `AudioPlayerOptions`; the media element engine cannot guarantee low-latency playback.
- Update custom `AudioEngine` implementations for the expanded media settings, state queries, time ranges, unload behavior, and lifecycle events.
- Read buffered information from `BufferUpdate.ranges` instead of `bufferedStart` and `bufferedEnd`.
- Expect playback state changes to follow engine media events. `play()` resolves before the browser necessarily emits `playing`.
- Expect `stop()` to leave the player in `ready` instead of `idle`.

## Migration from 0.2.0

- Add `fastSeek`, autoplay accessors, pitch-preservation accessors, and `getPlayedRanges` to custom `AudioEngine` implementations.
- Expect `load()` to attempt playback when autoplay is enabled and to reject with `PLAYBACK_BLOCKED` when browser policy prevents it.
- Handle `RangeError` for invalid volume, playback rate, `seek`, and `fastSeek` arguments.

## Migration from 0.3.0

- Install `hls.js` or `dashjs` only when importing `gaudio/hls` or `gaudio/dash`; both are optional peers.
- Register adaptive adapters through `AudioPlayerOptions.adapters`.
- Use an explicit source `protocol` when MIME type and URL pathname cannot identify an extensionless stream.
- Handle the new adaptive events and fatal error codes when observing HLS/DASH playback.
- Do not combine `options.adapters` with an explicitly injected custom `AudioEngine`.

## Current Limits

- HLS and DASH support is limited to video-on-demand playback; live playback is not implemented.
- DRM, transcoding, offline media, playlists, and manual quality selection are outside the current package scope.
- Custom codec decoding can be added later through a dedicated engine.
