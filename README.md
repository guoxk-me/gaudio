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
  volume: 0.8,
  muted: false,
  loop: false,
  playbackRate: 1,
})

player.on('statechange', state => console.log(state))
player.on('waiting', () => console.log('buffering'))
player.on('seeking', ({ currentTime }) => console.log('seeking', currentTime))
player.on('bufferupdate', ({ ranges }) => console.log('buffered', ranges))

await player.load()
await player.play()

player.setMuted(true)
player.setLoop(true)
await player.seek(30)
```

## Core API

`AudioPlayer` provides playback controls plus typed media state:

- Playback: `load`, `play`, `pause`, `stop`, `seek`, `dispose`.
- Media settings: preload, volume, muted, loop, and playback rate getters/setters.
- State queries: current time, duration, paused, ended, seeking, buffered ranges, and seekable ranges.
- Format checks: `canPlayType(mimeType)` returns `''`, `'maybe'`, or `'probably'`.
- Lifecycle events: loading, metadata, readiness, playback, buffering, seeking, time, duration, volume, rate, ending, and errors.

`stop()` pauses playback and returns to 0 seconds while retaining the loaded source. The player returns to `ready`, so the next `play()` does not reload the media.

## Demo

Run the browser demo from the project root:

```bash
pnpm run demo
```

Then open <http://localhost:4173/>. The Vue demo loads local MP3, WAV, AAC (M4A), and Opus (OGG) samples. It exercises loading, playback, seeking, preload, mute, loop, volume, playback rate, media states, time ranges, and lifecycle events.

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

## Current Limits

- HLS and DASH protocol handling are not implemented.
- DRM and transcoding are outside the package scope.
- Autoplay, `preservesPitch`, `fastSeek`, and `played` ranges are not exposed yet.
- Custom codec decoding can be added later through a dedicated engine.
