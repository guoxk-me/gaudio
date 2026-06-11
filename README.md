# gaudio

A browser-first TypeScript audio streaming library.

## Install

```bash
pnpm add gaudio
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

## Core API

`AudioPlayer` provides playback controls plus typed media state:

- Playback: `load`, `play`, `pause`, `stop`, `seek`, `fastSeek`, and `dispose`.
- Media settings: preload, autoplay, volume, muted, loop, playback rate, and `preservesPitch` getters/setters.
- State queries: current time, duration, paused, ended, seeking, buffered ranges, seekable ranges, and `getPlayedRanges()`.
- Format checks: `canPlayType(mimeType)` returns `''`, `'maybe'`, or `'probably'`.
- Lifecycle events: loading, metadata, readiness, playback, buffering, seeking, time, duration, volume, rate, ending, and errors.

`stop()` pauses playback and returns to 0 seconds while retaining the loaded source. The player returns to `ready`, so the next `play()` does not reload the media.

When `autoplay` is enabled, `load()` explicitly attempts playback after the source becomes ready. Browser policy rejection is reported as `PLAYBACK_BLOCKED`; the loaded source is retained so a user-triggered `play()` can retry without another load. Changing autoplay at runtime affects future loads only.

Volume must be between 0 and 1, playback rate must be greater than 0, and seek positions must be non-negative. Non-finite or out-of-range values throw `RangeError` before reaching the engine.

## Demo

Run the browser demo from the project root:

```bash
pnpm run demo
```

Then open <http://localhost:4173/>. The Vue demo loads local MP3, WAV, AAC (M4A), and Opus (OGG) samples. It exercises loading, playback, regular and fast seeking, autoplay, pitch preservation, preload, mute, loop, volume, playback rate, media states, time ranges, and lifecycle events.

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

## Current Limits

- HLS and DASH protocol handling are not implemented.
- DRM and transcoding are outside the package scope.
- Custom codec decoding can be added later through a dedicated engine.
