# GAudio 0.4.0 Adaptive VOD Playback Design

## Goal

Add complete HLS and MPEG-DASH video-on-demand playback through optional adapters while keeping the core `gaudio` entry free of third-party runtime dependencies.

Version 0.4.0 provides automatic protocol selection, same-player protocol switching, unified adaptive-stream events, full vendor configuration access, and read-only access to active `hls.js` and `dash.js` instances. Live playback, DRM, offline media, playlists, and manual quality selection remain outside this iteration.

## Package Shape

The package exposes three entry points:

```ts
import { AudioPlayer } from 'gaudio'
import { createHlsAdapter } from 'gaudio/hls'
import { createDashAdapter } from 'gaudio/dash'
```

The root entry does not import `hls.js` or `dashjs`. The adapter entry points declare their vendor libraries as optional peer dependencies, and the project installs them as development dependencies for type checking and tests.

Consumers install only the protocols they need:

```bash
pnpm add gaudio hls.js
pnpm add gaudio dashjs
```

## Public Usage

```ts
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

player.setSource('/audio/program.m3u8')
await player.load()
```

When a URL does not contain a recognizable extension, callers can provide explicit metadata:

```ts
player.setSource({
  url: '/media?id=42',
  protocol: 'dash',
  mimeType: 'application/dash+xml',
})
```

## Source Description and Protocol Selection

The public source input becomes:

```ts
type AudioProtocol = 'media' | 'hls' | 'dash'

interface AudioSourceDescription {
  url: string
  protocol?: AudioProtocol
  mimeType?: string
}

type AudioSourceInput = string | AudioSourceDescription | AudioSource
```

Existing string and `AudioSource` inputs remain valid. `AudioSource` gains optional `protocol` and `mimeType` metadata so custom source implementations participate in the same selection rules.

Protocol selection uses this fixed priority:

1. Explicit `protocol` metadata.
2. Known MIME types: HLS MIME types select `hls`; `application/dash+xml` selects `dash`.
3. URL pathname extensions: `.m3u8` selects `hls`; `.mpd` selects `dash`.
4. Unknown sources select the existing media-element engine.

Query strings and fragments are ignored when checking extensions. If HLS or DASH is selected without a registered adapter, loading fails with `ADAPTER_UNAVAILABLE`. An adapter that cannot run in the current browser fails with `PROTOCOL_UNSUPPORTED`.

## Architecture

### AudioPlayer

`AudioPlayer` retains ownership of public state, validation, autoplay orchestration, and public event delivery. Existing custom `AudioEngine` injection remains supported.

When no custom engine is injected, the player creates an `AudioEngineRouter`. Passing both a custom engine and `options.adapters` is rejected because the ownership model would otherwise be ambiguous.

### AudioEngineRouter

The router implements `AudioEngine` and owns one active engine at a time. It:

- Registers the built-in media-element engine and user-provided adaptive adapters.
- Resolves the protocol when `load()` opens a source.
- Disposes the previous engine before activating a different one.
- Reapplies preload, volume, mute, loop, playback rate, and pitch settings to a new engine.
- Rebinds engine events and ignores events from engines that are no longer active.
- Preserves the existing player behavior for ordinary media URLs.

Switching protocols is not gapless. `setSource()` unloads the current source and the next `load()` creates the required engine.

### Adapter Contract

```ts
interface AudioEngineAdapter {
  readonly protocol: 'hls' | 'dash'
  createEngine: () => AudioEngine
  isSupported: () => boolean
}
```

Each adapter instance is registered with one player at a time. It owns the currently active vendor-backed engine and exposes its active vendor instance. Reusing the same adapter in concurrent players is rejected.

## HLS Adapter

The HLS adapter accepts:

```ts
type HlsPlaybackStrategy
  = | 'native-first'
    | 'hls-first'
    | 'native-only'
    | 'hls-only'

interface HlsAdapterOptions {
  playbackStrategy?: HlsPlaybackStrategy
  config?: Partial<HlsConfig>
}
```

`native-first` is the default. Native support is determined with `HTMLMediaElement.canPlayType()` for HLS MIME types. `hls.js` support is determined with `Hls.isSupported()`.

Strategy behavior is deterministic:

- `native-first`: native HLS, then `hls.js`.
- `hls-first`: `hls.js`, then native HLS.
- `native-only`: native HLS or `PROTOCOL_UNSUPPORTED`.
- `hls-only`: `hls.js` or `PROTOCOL_UNSUPPORTED`.

The adapter exposes:

```ts
interface HlsAudioAdapter extends AudioEngineAdapter {
  readonly hlsInstance: Hls | undefined
  readonly implementation: 'native' | 'hls.js' | undefined
  getConfig: () => Readonly<Partial<HlsConfig>>
  updateConfig: (
    config: Partial<HlsConfig>,
    options?: HlsConfigUpdateOptions,
  ) => Promise<void>
}
```

Native playback has no `Hls` instance and cannot emit vendor-only manifest, level, or fragment details. Standard media-element events remain available.

## DASH Adapter

The DASH adapter accepts official `dash.js` settings and exposes the active player instance:

```ts
interface DashAdapterOptions {
  settings?: Partial<MediaPlayerSettingClass>
}

interface DashAudioAdapter extends AudioEngineAdapter {
  readonly dashInstance: MediaPlayerClass | undefined
  getSettings: () => Readonly<Partial<MediaPlayerSettingClass>>
  updateSettings: (settings: Partial<MediaPlayerSettingClass>) => void
}
```

`updateSettings()` stores settings before activation and delegates to the official `dash.js` `updateSettings()` method while active. Unsupported browsers fail with `PROTOCOL_UNSUPPORTED` before attaching a source.

## Runtime Configuration

### HLS

`hls.js` does not provide one supported method for atomically updating every constructor option. The adapter therefore exposes explicit application modes:

```ts
interface HlsConfigUpdateOptions {
  apply?: 'next-load' | 'reload'
  restorePosition?: boolean
  resumePlayback?: boolean
}
```

- `next-load` is the default. It merges and stores configuration without interrupting active playback.
- `reload` rebuilds an active `hls.js` engine. It may re-download the manifest and segments and may visibly rebuffer.
- `restorePosition` defaults to `true` for reload and seeks to the previous finite VOD position after metadata is available.
- `resumePlayback` defaults to the pre-reload playing state.
- On the native HLS path, configuration is stored but has no effect until a later load selects `hls.js`.

Reload preserves public media settings through the router. It does not promise preservation of buffered media, in-flight requests, vendor retry state, or bandwidth estimates.

### DASH

DASH settings are incrementally merged through the vendor `updateSettings()` API. The adapter does not invent a separate reload mode. Consumers can use the exposed `dashInstance` for vendor features that are intentionally outside the unified API.

## Adaptive Playback Events

The player adds typed events with protocol-neutral payloads:

```ts
interface AdaptivePlaybackInfo {
  protocol: 'hls' | 'dash'
  implementation: 'native' | 'hls.js' | 'dash.js'
}

interface AdaptiveManifestUpdate extends AdaptivePlaybackInfo {
  url: string
  variants: readonly AdaptiveVariant[]
}

interface AdaptiveVariant {
  id: string
  bitrate: number
  codecs?: string
}

interface AdaptiveVariantUpdate extends AdaptivePlaybackInfo {
  previousVariantId?: string
  variantId?: string
  bitrate?: number
  reason: 'initial' | 'automatic'
}

interface AdaptiveSegmentUpdate extends AdaptivePlaybackInfo {
  url?: string
  variantId?: string
  duration?: number
}

interface AdaptiveStreamError extends AdaptivePlaybackInfo {
  category: 'manifest' | 'network' | 'media' | 'segment' | 'other'
  isFatal: boolean
  code?: string
  cause?: unknown
}
```

Events are:

- `adaptivechange`: active protocol implementation selected.
- `manifestloaded`: manifest metadata and available variants received.
- `variantchange`: initial or automatic variant selection changed.
- `segmentloadstart`: a media segment request started.
- `segmentloaded`: a media segment completed.
- `streamerror`: recoverable and fatal adaptive-stream errors.

Fatal vendor errors also publish the existing player `error` event with `ADAPTIVE_STREAM_ERROR` and move the player to `error`. Recoverable vendor errors only publish `streamerror`, allowing vendor retry behavior to continue.

Native HLS emits `adaptivechange` but cannot guarantee the vendor-specific manifest, variant, segment, or recoverable-error events.

## Error Codes

`GAudioErrorCode` gains:

- `ADAPTER_UNAVAILABLE`: the source protocol was identified but no adapter was registered.
- `PROTOCOL_UNSUPPORTED`: the selected adapter has no usable implementation in the browser.
- `MANIFEST_ERROR`: the manifest could not be loaded or parsed.
- `SEGMENT_ERROR`: media segment loading failed fatally.
- `ADAPTIVE_STREAM_ERROR`: another fatal vendor playback error occurred.

Vendor error payloads are retained as `cause` and in `streamerror`. Core code does not depend on vendor-specific error enum values outside the adapter modules.

## Lifecycle and Concurrency

- A source switch increments the existing load request identifier and unloads the active engine.
- Router event subscriptions are stored and removed before engine replacement.
- Late events from a disposed engine are ignored through an engine generation identifier.
- Failed activation leaves the player in `error`; a later `setSource()` starts from `idle`.
- `dispose()` destroys active vendor instances, releases adapter ownership, detaches media elements, and clears all events.
- A failed HLS configuration reload reports an error and leaves the player in `error`; it does not silently continue with partially applied configuration.

## Testing

Unit tests cover:

- Protocol selection priority, query-string handling, ordinary media fallback, and missing adapters.
- Router setting transfer, event rebinding, stale-event suppression, same-player protocol switching, and adapter ownership.
- Every HLS playback strategy and native/vendor fallback behavior.
- HLS manifest, variant, segment, recoverable-error, fatal-error, vendor-instance, configuration storage, and reload behavior.
- DASH initialization, settings updates before and during playback, manifest/variant/segment/error translation, and vendor-instance lifecycle.
- Player forwarding of all adaptive events and fatal error state transitions.
- Package subpath exports and proof that importing the core entry does not load either vendor library.
- Demo source selection for ordinary audio, HLS, and DASH plus adaptive status and event display.

Verification runs type checking, lint, all tests, demo production build, library build, package export checks, and `git diff --check`.

## Compatibility and Migration

Existing ordinary media usage and explicit custom-engine injection remain source-compatible. Custom `AudioEngine` implementations must add the new adaptive events only if the engine contract is extended with those event keys; they do not need to implement adaptive controls.

`hls.js` and `dashjs` are optional peer dependencies. Applications importing `gaudio/hls` or `gaudio/dash` must install the corresponding peer. Applications using only `gaudio` remain unaffected.
