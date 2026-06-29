# gaudio

A browser-first TypeScript audio streaming library with optional HLS and DASH adapters.

gaudio provides a small player API for native media playback, playlists, fallback sources, browser Media Session integration, audio analysis, and adaptive playback through optional `hls.js` and `dashjs` adapters.

The package is currently pre-release. Use the documented API directly, but expect intentional API adjustments before the first official release.

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
