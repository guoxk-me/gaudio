# gaudio

A browser-first TypeScript audio streaming library with optional HLS and DASH adapters.

## Install

```bash
pnpm add gaudio
```

Install only the adaptive dependency your application uses:

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
})

await player.load()
await player.play()
```

Adaptive playback uses explicit optional adapters:

```ts
import { AdaptivePlaybackPreset, AudioPlayer } from 'gaudio'
import { createHlsAdapter } from 'gaudio/hls'

const player = new AudioPlayer({
  adapters: [
    createHlsAdapter({ preset: AdaptivePlaybackPreset.Balanced }),
  ],
})
```

`Balanced` is used when `preset` is omitted. Choose `FastStart` for smaller startup buffers or `Stable` for weak and variable networks. Presets configure audio VOD loading, buffering, memory limits, ABR, request retries, timeouts, and stall recovery. Explicit vendor configuration overrides the selected preset, including nested HLS request-policy fields.

See the [gaudio documentation](https://guoxk.github.io/gaudio/) for guides, API reference, migration notes, and interactive examples.
