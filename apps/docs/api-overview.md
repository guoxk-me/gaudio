# API Reference

<!-- AI modified: this overview keeps the generated API entry page useful after TypeDoc regenerates it. -->

This section is the generated declaration reference for GAudio. Use it when you need exact method signatures, option fields, event payloads, and adapter-specific types.

For narrative guidance and longer examples, start with the hand-written [API guide](/guide/api-reference). For Chinese documentation, see [API 参考](/zh/guide/api-reference).

## Start Here

| API | When to open it |
| --- | --- |
| [`AudioPlayer`](/api/index/classes/AudioPlayer) | Main class for loading sources, controlling playback, observing events, handling playlists, and switching adaptive quality. |
| [`AudioPlayerOptions`](/api/index/interfaces/AudioPlayerOptions) | Constructor options for sources, adapters, analyzer setup, Media Session integration, and playback defaults. |
| [`AudioPlayerEvents`](/api/index/interfaces/AudioPlayerEvents) | Event names and payloads emitted by `AudioPlayer.on()` and `AudioPlayer.once()`. |
| [`PlaybackState`](/api/index/type-aliases/PlaybackState) | Public lifecycle states for UI rendering and integration logic. |
| [`GAudioError`](/api/index/classes/GAudioError) | Stable error class and machine-readable error codes. |

## Core Player

`AudioPlayer` is the public API most applications should integrate with. It wraps native media playback, optional HLS/DASH adapters, playlists, alternate audio tracks, Media Session controls, and player-owned analysis.

Useful references:

- [`AudioPlayer`](/api/index/classes/AudioPlayer) for playback, seeking, volume, playlist, analyzer, and adaptive-quality methods.
- [`AudioPlayerOptions`](/api/index/interfaces/AudioPlayerOptions) for constructor configuration.
- [`AudioPlaylistTrack`](/api/index/interfaces/AudioPlaylistTrack), [`AudioTrack`](/api/index/interfaces/AudioTrack), and [`AudioTrackSelectionOptions`](/api/index/interfaces/AudioTrackSelectionOptions) for playlist and alternate-audio integrations.
- [`AudioMediaSessionOptions`](/api/index/interfaces/AudioMediaSessionOptions) and [`AudioMediaSessionMetadata`](/api/index/interfaces/AudioMediaSessionMetadata) for browser and operating-system media controls.

## Sources

Sources describe where audio comes from and when the final playable URL is opened. Simple strings are enough for static files. Custom sources are useful for signed URLs, Blob/File playback, or load-time URL refresh.

Useful references:

- [`AudioSourceInput`](/api/index/type-aliases/AudioSourceInput) for accepted player source values.
- [`AudioSource`](/api/index/interfaces/AudioSource) for custom lazy source implementations.
- [`AudioSourceDescription`](/api/index/interfaces/AudioSourceDescription) for URL, protocol, and MIME metadata.
- [`HttpAudioSource`](/api/index/classes/HttpAudioSource) and [`BlobAudioSource`](/api/index/classes/BlobAudioSource) for built-in source wrappers.

## Events And State

Use player events for UI updates, telemetry, playlist transitions, load failures, and adaptive-stream diagnostics. The event map is typed, so handlers receive the payload that matches the selected event name.

Useful references:

- [`AudioPlayerEvents`](/api/index/interfaces/AudioPlayerEvents) for player event names and payloads.
- [`TimeUpdate`](/api/index/interfaces/TimeUpdate), [`BufferUpdate`](/api/index/interfaces/BufferUpdate), [`VolumeUpdate`](/api/index/interfaces/VolumeUpdate), and [`PlaybackRateUpdate`](/api/index/interfaces/PlaybackRateUpdate) for common UI payloads.
- [`AdaptiveManifestUpdate`](/api/index/interfaces/AdaptiveManifestUpdate), [`AdaptiveVariantUpdate`](/api/index/interfaces/AdaptiveVariantUpdate), [`AdaptiveSegmentUpdate`](/api/index/interfaces/AdaptiveSegmentUpdate), and [`AdaptiveStreamError`](/api/index/interfaces/AdaptiveStreamError) for HLS/DASH diagnostics.
- [`EventEmitter`](/api/index/classes/EventEmitter) when an application needs a small typed event channel of its own.

## Analysis

GAudio can expose Web Audio analyzer data after a source loads. Use it for waveform previews, spectrum visualizers, and lightweight playback instrumentation.

Useful references:

- [`AudioAnalyzer`](/api/index/classes/AudioAnalyzer) for frequency and waveform reads.
- [`AudioPlayerAnalyzerOptions`](/api/index/interfaces/AudioPlayerAnalyzerOptions) for player-owned analyzer configuration.
- [`FrequencyDataOptions`](/api/index/interfaces/FrequencyDataOptions) and [`WaveformDataOptions`](/api/index/interfaces/WaveformDataOptions) for sample sizing.

## Adaptive Playback

Adaptive playback is split between shared player-level types and optional protocol adapters. Import shared types from `gaudio`, HLS-specific APIs from `gaudio/hls`, and DASH-specific APIs from `gaudio/dash`.

Shared references:

- [`AdaptivePlaybackPreset`](/api/index/enumerations/AdaptivePlaybackPreset) for fast-start, balanced, and stable tuning profiles.
- [`AdaptiveContentType`](/api/index/type-aliases/AdaptiveContentType) for VOD, long-form, and live tuning.
- [`AdaptivePlaybackInfo`](/api/index/interfaces/AdaptivePlaybackInfo), [`AdaptiveVariant`](/api/index/interfaces/AdaptiveVariant), and [`AdaptiveQualitySelection`](/api/index/type-aliases/AdaptiveQualitySelection) for active stream and quality state.
- [`AudioEngineAdapter`](/api/index/interfaces/AudioEngineAdapter) for extension points that add protocol engines.

Adapter entry points:

- [`createHlsAdapter`](/api/adapters/hls/functions/createHlsAdapter) and [`HlsAdapterOptions`](/api/adapters/hls/interfaces/HlsAdapterOptions) for HLS playback through native HLS or `hls.js`.
- [`createDashAdapter`](/api/adapters/dash/functions/createDashAdapter) and [`DashAdapterOptions`](/api/adapters/dash/interfaces/DashAdapterOptions) for DASH playback through `dashjs`.

## Advanced Extension Points

Most applications should stay at the `AudioPlayer` layer. The lower-level engine contracts are public for advanced integrations, test doubles, custom protocol support, and application-owned media pipelines.

Useful references:

- [`AudioEngine`](/api/index/interfaces/AudioEngine) for the low-level playback contract.
- [`AudioEngineEvents`](/api/index/interfaces/AudioEngineEvents) for engine lifecycle payloads.
- [`MediaElementAudioEngine`](/api/index/classes/MediaElementAudioEngine) for the built-in `HTMLAudioElement` implementation.
- [`AudioEngineAdapter`](/api/index/interfaces/AudioEngineAdapter) for routing a source protocol to a custom engine.

## Import Map

| Import | Contains |
| --- | --- |
| `gaudio` | Core player, source, analyzer, event, error, engine, playlist, Media Session, and shared adaptive playback APIs. |
| `gaudio/hls` | HLS adapter factory plus HLS strategy and `hls.js` configuration types. |
| `gaudio/dash` | DASH adapter factory plus DASH adapter and `dashjs` settings types. |
