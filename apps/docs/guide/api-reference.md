# API Reference

This page lists the public API users can import and the types they commonly need while integrating GAudio. The generated [TypeDoc reference](/api/) contains declaration-level details.

## Entry points

| Import | Use it for |
| --- | --- |
| `gaudio` | Core player, sources, analysis, events, errors, engine contracts, shared adaptive event types. |
| `gaudio/hls` | HLS adapter factory and HLS-specific configuration types. Requires `hls.js`. |
| `gaudio/dash` | DASH adapter factory and DASH-specific configuration types. Requires `dashjs`. |

## AudioPlayer

`AudioPlayer` is the main integration class.

```ts
const player = new AudioPlayer(options, customEngine)
```

Constructor inputs:

| API | Type | Notes |
| --- | --- | --- |
| `options` | `AudioPlayerOptions` | Source, adapters, playback defaults, and analyzer setup. |
| `customEngine` | `AudioEngine \| undefined` | Optional engine injection. Do not combine with `options.adapters`. |

Source APIs:

| API | Returns | Notes |
| --- | --- | --- |
| `setSource(source)` | `void` | Accepts `AudioSourceInput`, unloads the active engine, and resets state to `idle`. Analyzer-disposal and engine-unload errors retain their original identity. |
| `load()` | `Promise<void>` | Opens the current source and resolves after metadata is available. Non-`GAudioError` adapter/analyzer creation failures become `ENGINE_ERROR` with the original `cause`; pre-load analyzer cleanup retains its original error. |
| `play()` | `Promise<void>` | Starts or resumes playback; loads first when state is `idle`. |
| `dispose()` | `void` | Permanently disables the player and starts cleanup. Cleanup may continue after return; the first cleanup error can throw, and repeated `dispose()` retries retained work. |

Playlist APIs:

| API | Returns | Notes |
| --- | --- | --- |
| `setPlaylist(playlist, options?)` | `void` | Selects a playlist track without loading it. Empty playlists clear the active source. |
| `getPlaylist()` | `readonly AudioPlaylistTrack[]` | Current playlist tracks. |
| `getPlaylistIndex()` | `number` | Selected track index, or `-1` when no playlist is active. |
| `selectPlaylistTrack(index, options?)` | `Promise<void>` | Selects and loads a track by index. |
| `next(options?)` | `Promise<boolean>` | Loads the next track and returns whether one existed. |
| `previous(options?)` | `Promise<boolean>` | Loads the previous track and returns whether one existed. |
| `getAudioTracks()` | `readonly AudioTrack[]` | Alternate audio tracks for the selected playlist track. |
| `getSelectedAudioTrack()` | `AudioTrack \| undefined` | Current alternate audio track. |
| `selectAudioTrack(audioTrackId, options?)` | `Promise<void>` | Switches language or alternate audio while preserving time by default. |

`setPlaylist()`, `selectPlaylistTrack()`, `next()`, `previous()`, and `selectAudioTrack()` replace the active source when they select a track. Analyzer-disposal or engine-unload failures during that replacement reject or throw with the original error object.

```ts
player.setPlaylist([
  {
    source: 'https://example.com/episode-1.mp3',
    fallbackSources: ['https://cdn.example.com/episode-1.mp3'],
  },
  { source: 'https://example.com/episode-2.mp3' },
])

await player.load()
await player.next({ autoplay: true })
```

Playlist tracks automatically continue to the next track after `ended`. A track's `fallbackSources` are attempted in order before GAudio emits a load error.

Use `audioTracks` for dubbed languages or companion audio that share the same program timeline:

```ts
player.setPlaylist([
  {
    source: 'https://example.com/episode.zh-CN.m4a',
    defaultAudioTrackId: 'zh-CN',
    audioTracks: [
      {
        id: 'zh-CN',
        label: '简体中文',
        language: 'zh-CN',
        source: 'https://example.com/episode.zh-CN.m4a',
      },
      {
        id: 'en',
        label: 'English',
        language: 'en',
        source: 'https://example.com/episode.en.m4a',
      },
    ],
  },
])

await player.selectAudioTrack('en')
```

`selectAudioTrack()` preserves current time and previous paused/playing state unless options override that behavior.

Playback controls:

| API | Returns | Notes |
| --- | --- | --- |
| `pause()` | `void` | Pauses while keeping source and position. |
| `stop()` | `void` | Pauses, seeks to `0`, and keeps the loaded source ready. |
| `seek(seconds)` | `Promise<void>` | Exact non-negative seek. |
| `fastSeek(seconds)` | `Promise<void>` | Uses native optimized seeking when available. |

Settings:

| API | Returns | Notes |
| --- | --- | --- |
| `setPreload(preload)` / `getPreload()` | `void` / `PreloadMode` | Browser preload hint. |
| `setAutoplay(value)` / `getAutoplay()` | `void` / `boolean` | Player-managed autoplay for future loads. |
| `setVolume(volume)` / `getVolume()` | `void` / `number` | Linear `0` to `1`; invalid values throw `RangeError`. |
| `setMuted(value)` / `isMuted()` | `void` / `boolean` | Output mute state. |
| `setLoop(value)` / `isLooping()` | `void` / `boolean` | Non-live repeat behavior. |
| `setPlaybackRate(rate)` / `getPlaybackRate()` | `void` / `number` | Rate must be greater than `0`. |
| `setPreservesPitch(value)` / `getPreservesPitch()` | `void` / `boolean` | Browser pitch-preservation setting. |

State and capability APIs:

| API | Returns | Notes |
| --- | --- | --- |
| `getState()` | `PlaybackState` | Public lifecycle state. |
| `getCurrentTime()` | `number` | Seconds. |
| `getDuration()` | `number` | Seconds, or `0` when unknown. |
| `isPaused()` | `boolean` | Engine pause state. |
| `isEnded()` | `boolean` | Ended state for current source. |
| `isSeeking()` | `boolean` | Native seeking state. |
| `getBufferedRanges()` | `readonly TimeRange[]` | Buffered ranges in seconds. |
| `getSeekableRanges()` | `readonly TimeRange[]` | Seekable ranges in seconds. |
| `getPlayedRanges()` | `readonly TimeRange[]` | Played ranges in seconds. |
| `canPlayType(mimeType)` | `AudioFormatSupport` | Native media support plus registered HLS/DASH browser-capability probes: `''`, `'maybe'`, or `'probably'`. Adaptive results do not preflight optional peer imports. |
| `getAnalyzer()` | `AudioAnalyzer \| undefined` | Analyzer created after `load()` when configured and supported. |
| `getMediaSessionMetadata()` | `AudioMediaSessionMetadata \| undefined` | Default Media Session metadata for direct sources and playlist tracks without metadata. |
| `setMediaSessionMetadata(metadata)` | `void` | Updates browser/system media metadata for direct sources or playlist fallback metadata. |
| `getSource()` | `AudioSource \| undefined` | Current configured source. |

Events:

| API | Returns | Notes |
| --- | --- | --- |
| `on(eventName, handler)` | `() => void` | Registers a typed `AudioPlayerEvents` listener and returns an unsubscribe function. |
| `once(eventName, handler)` | `() => void` | Registers a typed listener for the next matching event. |
| `removeAllListeners(eventName?)` | `void` | Removes listeners for one event or all player listeners. |

Adaptive quality:

| API | Returns | Notes |
| --- | --- | --- |
| `getActiveAdaptivePlayback()` | `AdaptivePlaybackInfo \| undefined` | Active HLS/DASH implementation. |
| `getAdaptiveVariants()` | `readonly AdaptiveVariant[]` | Variants discovered from the current manifest. |
| `getAdaptiveQualitySelection()` | `AdaptiveQualitySelection` | `'auto'` or the selected variant id. |
| `setAdaptiveQuality(variantId)` | `Promise<void>` | Selects `'auto'` ABR or a variant id. Native HLS may reject manual selection. |

```ts
const variants = player.getAdaptiveVariants()
await player.setAdaptiveQuality('auto')

// AI modified: adapter variant order is not a quality ranking.
const highestBitrateVariant = [...variants]
  .sort((leftVariant, rightVariant) => rightVariant.bitrate - leftVariant.bitrate)[0]
if (highestBitrateVariant) {
  await player.setAdaptiveQuality(highestBitrateVariant.id)
}
```

Variant order is implementation-owned. Sort by `bitrate` before selecting a quality by rank.

## AudioPlayerOptions

| Field | Type | Default |
| --- | --- | --- |
| `source` | `AudioSourceInput` | `undefined` |
| `adapters` | `readonly AudioEngineAdapter[]` | `[]` |
| `analyzer` | `boolean \| AudioPlayerAnalyzerOptions` | `undefined` |
| `mediaSession` | `boolean \| AudioMediaSessionOptions` | `undefined` |
| `preload` | `PreloadMode` | `'metadata'` |
| `autoplay` | `boolean` | `false` |
| `muted` | `boolean` | `false` |
| `loop` | `boolean` | `false` |
| `volume` | `number` | `1` |
| `playbackRate` | `number` | `1` |
| `preservesPitch` | `boolean` | `true` |

Analyzer options:

| Type | Fields |
| --- | --- |
| `AudioPlayerAnalyzerOptions` | `enabled?: boolean`, `fftSize?: number`, `createAnalyzer?: AudioPlayerAnalyzerFactory` |
| `AudioPlayerAnalyzerFactory` | `(context: AudioPlayerAnalyzerContext) => AudioAnalyzer \| undefined` |
| `AudioPlayerAnalyzerContext` | `engine: AudioEngine`, `fftSize: number` |
| `AudioAnalyzerOptions` | `fftSize?: number` |

Use `analyzer: true` for the built-in player path, or `createAnalyzer` when a custom engine or app-owned Web Audio graph should provide the analyzer.

Media Session options:

| Type | Fields |
| --- | --- |
| `AudioMediaSessionOptions` | `enabled?: boolean`, `metadata?: AudioMediaSessionMetadata`, `seekOffset?: number` |
| `AudioMediaSessionMetadata` | `title?`, `artist?`, `album?`, `artwork?` |
| `AudioMediaSessionArtwork` | `src`, `sizes?`, `type?` |

Enable `mediaSession` when the app should integrate with browser, keyboard, headset, and operating-system media controls:

```ts
const player = new AudioPlayer({
  source: 'https://example.com/episode-1.mp3',
  mediaSession: {
    metadata: {
      title: 'Episode 1',
      artist: 'Example Studio',
      album: 'Example Podcast',
      artwork: [
        { src: '/cover-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
  },
})

player.setMediaSessionMetadata({
  title: 'Episode 2',
  artist: 'Example Studio',
})
```

System actions are routed through the existing player APIs: play, pause, stop, previous, next, seek backward, seek forward, and seek to a specific time. Unsupported browsers ignore the integration without changing playback behavior.

## AudioAnalyzer

```ts
const analyzer = new AudioAnalyzer(audioContext, sourceNode, fftSize)
```

| API | Returns | Notes |
| --- | --- | --- |
| `connect(destinationNode)` | `void` | Connects analyzer output to another Web Audio node. |
| `getFrequencyData(options?)` | `Uint8Array` | Reads byte frequency magnitudes. `FrequencyDataOptions.binCount` limits returned bins. |
| `getWaveformData(options?)` | `Uint8Array` | Reads byte time-domain waveform data. `WaveformDataOptions.sampleCount` limits returned samples. |
| `dispose()` | `void` | Disconnects the source input and analyzer output destinations. |

## Sources

| API or type | Purpose |
| --- | --- |
| `HttpAudioSource` | URL-backed source class used internally for strings and source descriptions. |
| `BlobAudioSource` | Blob/File-backed source that owns and revokes its object URL. |
| `BlobAudioSourceOptions` | Optional `protocol` and `mimeType` hints for Blob/File-backed routing. |
| `new HttpAudioSource(source)` | Accepts `string \| AudioSourceDescription`. |
| `HttpAudioSource.open()` | Resolves `{ url }` without making a network request. |
| `HttpAudioSource.close()` | No-op cleanup for plain URLs. |
| `AudioSourceInput` | `string \| AudioSourceDescription \| AudioSource`. |
| `AudioSourceDescription` | `{ url: string, protocol?: AudioProtocol, mimeType?: string }`. |
| `AudioSource` | Custom lazy source contract with `kind`, optional metadata, `open()`, and `close()`. |
| `AudioStreamHandle` | `{ readonly url: string }`. |
| `AudioProtocol` | `'media' \| 'hls' \| 'dash'`. |
| `AudioSourceKind` | `'url' \| 'blob'`. |

`HttpAudioSource` does not manage headers, credentials, signed URL refresh, or token expiry. Use a custom `AudioSource` for load-time URL refresh, and use HLS/DASH vendor request hooks when manifest or segment requests need authentication after playback starts.

For a custom `AudioSource`, `close()` may run before `open()` settles and may be retried after a synchronous or asynchronous failure. It must cancel or invalidate pending work, make late open results unusable, retain failed cleanup state, and be safe to call repeatedly.

Playlist types:

| Type | Fields |
| --- | --- |
| `AudioPlaylistTrack` | `source`, `fallbackSources?`, `metadata?`, `audioTracks?`, `defaultAudioTrackId?` |
| `AudioPlaylistOptions` | `startIndex?` |
| `AudioPlaylistNavigationOptions` | `autoplay?` |
| `AudioTrack` | `id`, `label?`, `language?`, `source`, `fallbackSources?` |
| `AudioTrackSelectionOptions` | `preserveTime?`, `autoplay?` |

## Events And Errors

| Type | Purpose |
| --- | --- |
| `AudioPlayerEvents` | Event-to-payload map accepted by `AudioPlayer.on`. |
| `AudioEngineEvents` | Lower-level event-to-payload map forwarded by player and router. |
| `PlaybackState` | `'idle'`, `'loading'`, `'ready'`, `'playing'`, `'paused'`, `'buffering'`, `'ended'`, or `'error'`. |
| `GAudioError` | Error class with stable `code`, message, and optional `cause`. |
| `GAudioErrorCode` | Machine-readable failure code union. |

At the `AudioPlayer` boundary, non-`GAudioError` adapter `createEngine()` and analyzer-factory failures are wrapped as `ENGINE_ERROR`; the original value is available as `cause`, and the player publishes the same wrapper through its `error` event. Direct adapter `createEngine()` calls and direct `MediaElementAudioEngine` extension hooks can expose their own errors unchanged. Source-replacement cleanup and explicit pre-load analyzer cleanup also preserve their original errors.

Direct calls into an injected custom `AudioEngine` preserve original thrown values for constructor setup and subscriptions, `pause()`, `stop()`, engine-backed settings and queries, and `canPlayType()`. Failures from those listed direct calls are not automatically player `error` events.

<!-- AI modified: document the lifecycle race that guarantees injected-engine operations always terminate. -->
For player-owned asynchronous operations, the first engine or lifecycle outcome wins. A current `load()` or `play()` publishes its preserved or wrapped engine failure, while `seek()`, `fastSeek()`, and `setAdaptiveQuality()` keep ordinary engine rejections delegated-only. Disposal rejects every in-flight operation immediately with `ENGINE_ERROR` and `Audio operation was interrupted by player disposal`; disposal and cancellation do not publish a new player `error`. A terminal engine `error` rejects with the exact `GAudioError` instance published once to listeners (for `load()`, only after source fallbacks are exhausted).

| Operation | Engine result | Supersession result |
| --- | --- | --- |
| `load()` | No source rejects with `SOURCE_UNAVAILABLE` and `Audio source is required before loading`. An engine `GAudioError` is preserved; another rejection becomes `ENGINE_ERROR` with `Audio source could not be loaded`. | `setSource()` rejects with `LOAD_ABORTED` and `Audio operation was superseded by a replacement source`; a newer `load()` uses `Audio operation was superseded by a newer load`. |
| `play()` | An engine `GAudioError` is preserved; another rejection becomes `ENGINE_ERROR` with `Audio playback failed`. A fatal engine `error` rejects immediately with the published instance. | After `engine.play()` starts, `pause()`, `stop()`, `setSource()`, or a newer `load()` silently supersedes the attempt and the public promise resolves. Late settlement is still observed, and late success reapplies the latest pause/stop intent. A play still awaiting its prerequisite load inherits that load's `LOAD_ABORTED`. |
| `seek()` / `fastSeek()` | The injected engine's own rejection is preserved. | A newer seek rejects with `LOAD_ABORTED` and `Audio seek was superseded by a newer seek`; `stop()` uses `Audio seek was superseded by stop`; source replacement and a newer load use the general messages above. |
| `setAdaptiveQuality()` | A missing capability rejects with `PROTOCOL_UNSUPPORTED`; otherwise the injected engine's own rejection is preserved. | A newer selection rejects with `LOAD_ABORTED` and `Adaptive quality selection was superseded by a newer selection`; source replacement and a newer load use the general messages above. |
| Playlist and audio-track navigation | `next()`, `previous()`, `selectPlaylistTrack()`, and `selectAudioTrack()` inherit the result of their `load()`, `seek()`, or `play()` stage. | The active stage's rule applies. |

Payload types:

| Type | Fields |
| --- | --- |
| `TimeUpdate` | `currentTime`, `duration` |
| `DurationUpdate` | `duration` |
| `BufferUpdate` | `ranges` |
| `VolumeUpdate` | `volume`, `isMuted` |
| `PlaybackRateUpdate` | `playbackRate` |
| `TimeRange` | `start`, `end` |
| `PreloadMode` | `'none' \| 'metadata' \| 'auto'` |
| `AudioFormatSupport` | `'' \| 'maybe' \| 'probably'` |

## Adaptive Playback

Shared adaptive exports from `gaudio`:

| Type or value | Purpose |
| --- | --- |
| `AdaptivePlaybackPreset` | `FastStart`, `Balanced`, and `Stable` audio buffering profiles. |
| `AdaptiveContentType` | `'vod'`, `'long-form'`, or `'live'` content tuning for adaptive adapters. |
| `AdaptiveAudioProtocol` | `'hls' \| 'dash'`. |
| `AdaptivePlaybackImplementation` | `'native' \| 'hls.js' \| 'dash.js'`. |
| `AdaptivePlaybackInfo` | Active adaptive protocol and implementation. |
| `AdaptiveManifestUpdate` | Manifest URL and discovered variants. |
| `AdaptiveVariant` | Variant id, bitrate, and optional codecs. |
| `AdaptiveVariantUpdate` | Initial, automatic, or manual adaptive variant selection, including its `reason`. |
| `AdaptiveQualitySelection` | `'auto'` or a manual variant id. |
| `AdaptiveSegmentUpdate` | Segment request URL, variant, and duration when available. |
| `AdaptiveStreamError` | Recoverable or fatal adaptive failure information. |

Adapter contract:

| Type | Purpose |
| --- | --- |
| `AudioEngineAdapter` | Adapter contract for creating an `AudioEngine` for HLS, DASH, or future protocols. |
| `AudioEngine` | Low-level engine contract used by `AudioPlayer` and adapters. |
| `MediaElementAudioEngine` | Built-in `HTMLAudioElement` engine and the only exported class with a supported inheritance contract. Subclasses may rely on public and protected members. |

`AudioPlayer`, `AudioAnalyzer`, and `EventEmitter` are concrete utilities intended for direct use or composition; subclassing them is not a compatibility contract. Extend GAudio through `AudioEngine`, `AudioEngineAdapter`, `AudioSource`, analyzer factories, and event APIs.

## HLS Entry

Import from `gaudio/hls`.

| API or type | Purpose |
| --- | --- |
| `createHlsAdapter(options?)` | Creates an HLS adapter for `AudioPlayerOptions.adapters`. |
| `HlsAudioAdapter` | Adapter instance with `hlsInstance`, `implementation`, `getConfig()`, `updateConfig()`, and adapter methods. |
| `HlsAdapterOptions` | `contentType`, `preset`, `playbackStrategy`, and initial `config`. |
| `HlsPlaybackStrategy` | `'native-first' \| 'hls-first' \| 'native-only' \| 'hls-only'`. |
| `HlsAdapterConfig` | Partial `hls.js` constructor configuration; only manifest, playlist, fragment, and key load policies accept nested partial overrides. |
| `HlsConfigUpdateOptions` | `apply`, `restorePosition`, and `resumePlayback`. |
| `HlsLoadPolicyChanges` | Partial request policy override. |
| `HlsLoaderConfigChanges` | Partial loader settings and retry branches. |
| `HlsRetryConfigChanges` | Partial retry settings. |
| `HlsConfig` | Re-export from `hls.js`. |

## DASH Entry

Import from `gaudio/dash`.

| API or type | Purpose |
| --- | --- |
| `createDashAdapter(options?)` | Creates a DASH adapter for `AudioPlayerOptions.adapters`. |
| `DashAudioAdapter` | Adapter instance with `dashInstance`, `getSettings()`, `updateSettings()`, and adapter methods. |
| `DashAdapterOptions` | `contentType`, `preset`, and initial dash.js `settings`. |
| `DashSettingsChanges` | Recursively sparse dash.js settings accepted by `DashAdapterOptions.settings` and `updateSettings()`. |
| `MediaPlayerClass` | Re-export from `dashjs`. |
| `MediaPlayerSettingClass` | Re-export from `dashjs`. |

## EventEmitter

`EventEmitter<Events>` is exported for small app-owned typed event channels.

`emit()` invokes listeners synchronously, isolates each listener failure so later listeners still run, and reports failures through `globalThis.reportError` when available. Without that host API, the failure is rethrown from a queued microtask; a failing reporter produces a queued `AggregateError` with both errors.

| API | Returns |
| --- | --- |
| `on(eventName, handler)` | `() => void` |
| `once(eventName, handler)` | `() => void` |
| `off(eventName, handler)` | `void` |
| `emit(eventName, payload)` | `void` |
| `clear(eventName?)` | `void` |
