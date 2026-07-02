# GAudio

A browser-first TypeScript audio streaming library with optional HLS and DASH adapters.

GAudio gives browser audio applications one typed player for native media, playlists, alternate audio tracks, fallback sources, browser Media Session integration, Web Audio analysis, and adaptive playback through optional `hls.js` and `dashjs` adapters.

The package is currently pre-release. Use the documented API directly, but expect intentional API adjustments before the first official release.

## Capability Map

GAudio is designed for product audio surfaces that need more than a bare `<audio>` element:

| Area | What GAudio provides |
| --- | --- |
| Player lifecycle | Typed states, loading, play/pause/stop, exact seek, fast seek, preload, autoplay handling, loop, volume, mute, playback rate, pitch preservation, buffered/seekable/played ranges |
| Source management | URL strings, explicit source descriptions, reusable `HttpAudioSource`, local `BlobAudioSource`, and custom lazy sources for signed URLs or app-owned cleanup |
| Playlists | Ordered track playback, automatic next-track continuation, fallback CDN sources, alternate language or companion audio tracks, and time-preserving audio-track selection |
| Browser integration | Media Session metadata and action handlers for browser, keyboard, headset, and operating-system media controls |
| Analysis | Player-owned frequency and waveform sampling for visualizers, plus lower-level `AudioAnalyzer` support for custom Web Audio graphs |
| Adaptive streaming | Optional HLS/DASH routing, audio-focused presets, VOD/long-form/live tuning, manifest and segment events, variant reporting, and protocol-neutral quality selection where vendors support it |
| Operations | Typed events, stable `GAudioError` codes, teardown through `dispose()`, and tree-shakeable entry points that keep adaptive vendors out of core-only builds |

Use the core package for MP3, AAC, WAV, OGG, local files, podcast-style queues, and system media controls. Add the HLS or DASH subpath only when a source needs adaptive streaming, manifest events, or runtime quality controls.

## Install

```bash
pnpm add gaudio
```

Install only the adaptive dependency your application uses:

```bash
pnpm add gaudio hls.js
pnpm add gaudio dashjs
```

## Entry Points

| Import | Contents |
| --- | --- |
| `gaudio` | `AudioPlayer`, source helpers, analyzer, event emitter, core types, and protocol-neutral adaptive APIs |
| `gaudio/hls` | `createHlsAdapter`, HLS adapter types, and `HlsConfig` |
| `gaudio/dash` | `createDashAdapter`, DASH adapter types, and dash.js type re-exports |

The root entry does not import `hls.js` or `dashjs`.

## Quick Start

```ts
import { AudioPlayer } from 'gaudio'

const player = new AudioPlayer({
  source: 'https://example.com/audio.mp3',
  preload: 'auto',
  mediaSession: true,
  analyzer: true,
})

player.on('statechange', state => console.log(state))
player.on('error', error => console.error(error.code))

await player.load()
await player.play()
```

## Documentation

- Package README: [`packages/gaudio/README.md`](packages/gaudio/README.md)
- English docs: [`apps/docs/index.md`](apps/docs/index.md)
- Chinese docs: [`apps/docs/zh/index.md`](apps/docs/zh/index.md)

## Development

```bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```
