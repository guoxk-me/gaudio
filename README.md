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

The commands below target npm's `next` dist-tag. Before the first registry release is visible, clone this repository and use its `gaudio` workspace package instead.

```bash
pnpm add gaudio@next
```

Install only the adaptive dependency your application uses:

```bash
pnpm add gaudio@next hls.js
pnpm add gaudio@next dashjs
```

## Entry Points

| Import | Contents |
| --- | --- |
| `gaudio` | `AudioPlayer`, source helpers, analyzer, event emitter, core types, and protocol-neutral adaptive APIs |
| `gaudio/hls` | `createHlsAdapter`, HLS adapter types, and `HlsConfig` |
| `gaudio/dash` | `createDashAdapter`, `DashSettingsChanges`, DASH adapter types, and dash.js type re-exports |

The root entry does not import `hls.js` or `dashjs`.

## Compatibility

| Surface | Supported environment |
| --- | --- |
| `gaudio` core runtime and package imports | Node.js 18 or newer; playback APIs require browser media globals |
| `gaudio/hls` | Browser-native HLS or Media Source Extensions with optional `hls.js ^1.6.16`; SSR import and capability checks are safe |
| `gaudio/dash` | Media Source Extensions with optional `dashjs ^5.2.0`; dash.js tooling itself declares Node.js 20 or newer |
| Type declarations | TypeScript 5.8 or newer; verified with TypeScript 5.8.3 and the current project compiler |

Node.js 18 CI intentionally consumes the packed artifact without optional adaptive peers. This is an SSR/package-import compatibility floor only: Node.js 18 is EOL and is not recommended for new secure deployments. Maintained Node.js 24 is the development and release baseline. HLS and DASH playback are browser capabilities and are not advertised as server-side media engines.

Browser support is capability-based. CI exercises the current Playwright-bundled Chromium, Firefox, and WebKit desktop engines plus a Pixel 5 Chromium emulation project; this is a tested-current matrix, not a minimum-version or real-device guarantee. Core playback requires `HTMLAudioElement`, and analysis requires Web Audio. HLS requires native HLS or Media Source Extensions compatible with hls.js. DASH requires Media Source Extensions compatible with dash.js and native `globalThis.structuredClone()`. GAudio does not ship browser polyfills.

TypeScript consumers of `gaudio/dash` must use `node16`, `nodenext`, or `bundler` module resolution. Legacy `node10` resolution cannot resolve dash.js's transitive type packages.

`MediaElementAudioEngine` is the only exported class with a supported inheritance contract; subclasses may rely on its public and protected members. Use `AudioPlayer`, `AudioAnalyzer`, and `EventEmitter` directly or through composition rather than subclassing them.

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
- Package changelog: [`packages/gaudio/CHANGELOG.md`](packages/gaudio/CHANGELOG.md)
- English docs: [`apps/docs/index.md`](apps/docs/index.md)
- Chinese docs: [`apps/docs/zh/index.md`](apps/docs/zh/index.md)
- Contributing guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Support policy: [`SUPPORT.md`](SUPPORT.md)
- Security policy: [`SECURITY.md`](SECURITY.md)
- Maintainer release runbook: [`RELEASING.md`](RELEASING.md)

## Development

```bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run coverage
pnpm run build
```
