# API Reference

This page lists the public API users can import and the types they commonly need while integrating gaudio. The generated [TypeDoc reference](/api/) contains declaration-level details.

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
| `setSource(source)` | `void` | Accepts `AudioSourceInput`, unloads the active engine, and resets state to `idle`. |
| `load()` | `Promise<void>` | Opens the current source and resolves after metadata is available. |
| `play()` | `Promise<void>` | Starts or resumes playback; loads first when state is `idle`. |
| `dispose()` | `void` | Releases source lifecycle, engine, analyzer, vendor instances, and listeners. |

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
| `canPlayType(mimeType)` | `AudioFormatSupport` | Native media support plus registered HLS/DASH adapter support: `''`, `'maybe'`, or `'probably'`. |
| `getAnalyzer()` | `AudioAnalyzer \| undefined` | Analyzer created after `load()` when configured and supported. |
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
await player.setAdaptiveQuality(variants[0].id)
```

## AudioPlayerOptions

| Field | Type | Default |
| --- | --- | --- |
| `source` | `AudioSourceInput` | `undefined` |
| `adapters` | `readonly AudioEngineAdapter[]` | `[]` |
| `analyzer` | `boolean \| AudioPlayerAnalyzerOptions` | `undefined` |
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
| `new HttpAudioSource(source)` | Accepts `string \| AudioSourceDescription`. |
| `HttpAudioSource.open()` | Resolves `{ url }` without making a network request. |
| `HttpAudioSource.close()` | No-op cleanup for plain URLs. |
| `AudioSourceInput` | `string \| AudioSourceDescription \| AudioSource`. |
| `AudioSourceDescription` | `{ url: string, protocol?: AudioProtocol, mimeType?: string }`. |
| `AudioSource` | Custom lazy source contract with `kind`, optional metadata, `open()`, and `close()`. |
| `AudioStreamHandle` | `{ readonly url: string }`. |
| `AudioProtocol` | `'media' \| 'hls' \| 'dash'`. |
| `AudioSourceKind` | `'url' \| 'blob'`. |

## Events And Errors

| Type | Purpose |
| --- | --- |
| `AudioPlayerEvents` | Event-to-payload map accepted by `AudioPlayer.on`. |
| `AudioEngineEvents` | Lower-level event-to-payload map forwarded by player and router. |
| `PlaybackState` | `'idle'`, `'loading'`, `'ready'`, `'playing'`, `'paused'`, `'buffering'`, `'ended'`, or `'error'`. |
| `GAudioError` | Error class with stable `code`, message, and optional `cause`. |
| `GAudioErrorCode` | Machine-readable failure code union. |

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
| `AdaptivePlaybackPreset` | `FastStart`, `Balanced`, and `Stable` audio VOD profiles. |
| `AdaptiveAudioProtocol` | `'hls' \| 'dash'`. |
| `AdaptivePlaybackImplementation` | `'native' \| 'hls.js' \| 'dash.js'`. |
| `AdaptivePlaybackInfo` | Active adaptive protocol and implementation. |
| `AdaptiveManifestUpdate` | Manifest URL and discovered variants. |
| `AdaptiveVariant` | Variant id, bitrate, and optional codecs. |
| `AdaptiveVariantUpdate` | Initial or automatic adaptive variant selection. |
| `AdaptiveQualitySelection` | `'auto'` or a manual variant id. |
| `AdaptiveSegmentUpdate` | Segment request URL, variant, and duration when available. |
| `AdaptiveStreamError` | Recoverable or fatal adaptive failure information. |

Adapter contract:

| Type | Purpose |
| --- | --- |
| `AudioEngineAdapter` | Adapter contract for creating an `AudioEngine` for HLS, DASH, or future protocols. |
| `AudioEngine` | Low-level engine contract used by `AudioPlayer` and adapters. |
| `MediaElementAudioEngine` | Built-in `HTMLAudioElement` engine. Most apps should use `AudioPlayer` instead. |

## HLS Entry

Import from `gaudio/hls`.

| API or type | Purpose |
| --- | --- |
| `createHlsAdapter(options?)` | Creates an HLS adapter for `AudioPlayerOptions.adapters`. |
| `HlsAudioAdapter` | Adapter instance with `hlsInstance`, `implementation`, `getConfig()`, `updateConfig()`, and adapter methods. |
| `HlsAdapterOptions` | `preset`, `playbackStrategy`, and initial `config`. |
| `HlsPlaybackStrategy` | `'native-first' \| 'hls-first' \| 'native-only' \| 'hls-only'`. |
| `HlsAdapterConfig` | Deep partial `hls.js` constructor configuration with mergeable load policies. |
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
| `DashAdapterOptions` | `preset` and initial dash.js `settings`. |
| `MediaPlayerClass` | Re-export from `dashjs`. |
| `MediaPlayerSettingClass` | Re-export from `dashjs`. |

## EventEmitter

`EventEmitter<Events>` is exported for small app-owned typed event channels.

| API | Returns |
| --- | --- |
| `on(eventName, handler)` | `() => void` |
| `once(eventName, handler)` | `() => void` |
| `off(eventName, handler)` | `void` |
| `emit(eventName, payload)` | `void` |
| `clear(eventName?)` | `void` |
