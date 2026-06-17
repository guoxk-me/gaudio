# Getting Started

gaudio is currently pre-release. Use the documented API directly, but expect intentional API adjustments before the first official release.

## Install

```bash
pnpm add gaudio
```

## Create a player

```ts
import { AudioPlayer } from 'gaudio'

const player = new AudioPlayer({
  source: 'https://example.com/audio.mp3',
  preload: 'auto',
  volume: 0.8,
})

player.on('statechange', state => console.log(state))
player.on('waiting', () => console.log('buffering'))

await player.load()
await player.play()
```

`stop()` pauses playback and returns to 0 seconds while retaining the loaded source. The next `play()` reuses that source.

## Playback settings

```ts
player.setMuted(true)
player.setLoop(true)
player.setPlaybackRate(1.25)
player.setPreservesPitch(true)
await player.fastSeek(30)
```

Volume must be between 0 and 1. Playback rate must be greater than 0, and seek positions must be non-negative.

## Source inputs

`AudioPlayer` accepts URL strings, explicit source descriptions, `HttpAudioSource`, or custom `AudioSource` implementations:

```ts
import { AudioPlayer, HttpAudioSource } from 'gaudio'

player.setSource('https://example.com/audio.mp3')
player.setSource({
  url: 'https://example.com/media?id=42',
  protocol: 'hls',
  mimeType: 'application/vnd.apple.mpegurl',
})
player.setSource(new HttpAudioSource('https://example.com/audio.ogg'))
```

Custom `AudioSource` objects expose `open()` and `close()` so applications can integrate signed URLs, local object URLs, or other lazy resource lifecycles.

## Autoplay

When autoplay is enabled, `load()` attempts playback after the source becomes ready. Browser policy rejection is reported as `PLAYBACK_BLOCKED`; the loaded source remains available for a user-triggered retry.

## Browser capabilities

Use `player.canPlayType(mimeType)` to inspect native media support. HLS and DASH support is provided through optional adapters when the browser and vendor library can create an engine.
