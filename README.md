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
})

player.on('statechange', (state) => {
  console.log(state)
})

await player.load()
await player.play()

player.setVolume(0.8)
await player.seek(30)
```

## Demo

Run the browser demo from the project root:

```bash
pnpm run demo
```

Then open <http://localhost:4173/>. The Vue demo loads local samples from `demo/public/` in MP3, WAV, AAC (M4A), and Opus (OGG) formats. Switch tracks and formats in the UI to test loading, playback, seeking, volume, playback rate, and player events without requiring an external audio URL.

## Version 1 Scope

- Browser URL audio playback.
- Typed playback events.
- Basic playback controls.
- Stable error codes.
- Web Audio frequency and waveform access.

## Version 1 Limits

- HLS and DASH are not implemented in the first version.
- DRM and transcoding are outside the package scope.
- Custom codec decoding can be added later through a dedicated backend.
