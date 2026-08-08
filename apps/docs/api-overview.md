# API Reference

<!-- AI modified: this overview keeps the generated API entry page useful after TypeDoc regenerates it. -->

This section is the generated declaration reference for GAudio. Use it when you need exact method signatures, option fields, event payloads, and adapter-specific types.

For narrative guidance and longer examples, start with the hand-written [API guide](/guide/api-reference). For Chinese documentation, see [API 参考](/zh/guide/api-reference).

## Start Here

| API | When to open it |
| --- | --- |
| [`AudioPlayer`](/api/core/classes/AudioPlayer) | Main class for loading sources, controlling playback, observing events, handling playlists, and switching adaptive quality. |
| [`AudioPlayerOptions`](/api/core/interfaces/AudioPlayerOptions) | Constructor options for sources, adapters, analyzer setup, Media Session integration, and playback defaults. |
| [`AudioPlayerEvents`](/api/core/interfaces/AudioPlayerEvents) | Event names and payloads emitted by `AudioPlayer.on()` and `AudioPlayer.once()`. |
| [`PlaybackState`](/api/core/type-aliases/PlaybackState) | Public lifecycle states for UI rendering and integration logic. |
| [`GAudioError`](/api/core/classes/GAudioError) | Stable error class and machine-readable error codes. |

## Core Player

`AudioPlayer` is the public API most applications should integrate with. It wraps native media playback, optional HLS/DASH adapters, playlists, alternate audio tracks, Media Session controls, and player-owned analysis.

Useful references:

- [`AudioPlayer`](/api/core/classes/AudioPlayer) for playback, seeking, volume, playlist, analyzer, and adaptive-quality methods.
- [`AudioPlayerOptions`](/api/core/interfaces/AudioPlayerOptions) for constructor configuration.
- [`AudioPlaylistTrack`](/api/core/interfaces/AudioPlaylistTrack), [`AudioTrack`](/api/core/interfaces/AudioTrack), and [`AudioTrackSelectionOptions`](/api/core/interfaces/AudioTrackSelectionOptions) for playlist and alternate-audio integrations.
- [`AudioMediaSessionOptions`](/api/core/interfaces/AudioMediaSessionOptions) and [`AudioMediaSessionMetadata`](/api/core/interfaces/AudioMediaSessionMetadata) for browser and operating-system media controls.

## Sources

Sources describe where audio comes from and when the final playable URL is opened. Simple strings are enough for static files. Custom sources are useful for signed URLs, Blob/File playback, or load-time URL refresh.

Useful references:

- [`AudioSourceInput`](/api/core/type-aliases/AudioSourceInput) for accepted player source values.
- [`AudioSource`](/api/core/interfaces/AudioSource) for custom lazy source implementations.
- [`AudioSourceDescription`](/api/core/interfaces/AudioSourceDescription) for URL, protocol, and MIME metadata.
- [`HttpAudioSource`](/api/core/classes/HttpAudioSource) and [`BlobAudioSource`](/api/core/classes/BlobAudioSource) for built-in source wrappers.

## Events And State

Use player events for UI updates, telemetry, playlist transitions, load failures, and adaptive-stream diagnostics. The event map is typed, so handlers receive the payload that matches the selected event name.

Useful references:

- [`AudioPlayerEvents`](/api/core/interfaces/AudioPlayerEvents) for player event names and payloads.
- [`TimeUpdate`](/api/core/interfaces/TimeUpdate), [`BufferUpdate`](/api/core/interfaces/BufferUpdate), [`VolumeUpdate`](/api/core/interfaces/VolumeUpdate), and [`PlaybackRateUpdate`](/api/core/interfaces/PlaybackRateUpdate) for common UI payloads.
- [`AdaptiveManifestUpdate`](/api/core/interfaces/AdaptiveManifestUpdate), [`AdaptiveVariantUpdate`](/api/core/interfaces/AdaptiveVariantUpdate), [`AdaptiveSegmentUpdate`](/api/core/interfaces/AdaptiveSegmentUpdate), and [`AdaptiveStreamError`](/api/core/interfaces/AdaptiveStreamError) for HLS/DASH diagnostics.
- [`EventEmitter`](/api/core/classes/EventEmitter) when an application needs a small typed event channel of its own.

## Analysis

GAudio can expose Web Audio analyzer data after a source loads. Use it for waveform previews, spectrum visualizers, and lightweight playback instrumentation.

Useful references:

- [`AudioAnalyzer`](/api/core/classes/AudioAnalyzer) for frequency and waveform reads.
- [`AudioPlayerAnalyzerOptions`](/api/core/interfaces/AudioPlayerAnalyzerOptions) for player-owned analyzer configuration.
- [`FrequencyDataOptions`](/api/core/interfaces/FrequencyDataOptions) and [`WaveformDataOptions`](/api/core/interfaces/WaveformDataOptions) for sample sizing.

## Adaptive Playback

Adaptive playback is split between shared player-level types and optional protocol adapters. Import shared types from `gaudio`, HLS-specific APIs from `gaudio/hls`, and DASH-specific APIs from `gaudio/dash`.

Shared references:

- [`AdaptivePlaybackPreset`](/api/core/enumerations/AdaptivePlaybackPreset) for fast-start, balanced, and stable tuning profiles.
- [`AdaptiveContentType`](/api/core/type-aliases/AdaptiveContentType) for VOD, long-form, and live tuning.
- [`AdaptivePlaybackInfo`](/api/core/interfaces/AdaptivePlaybackInfo), [`AdaptiveVariant`](/api/core/interfaces/AdaptiveVariant), and [`AdaptiveQualitySelection`](/api/core/type-aliases/AdaptiveQualitySelection) for active stream and quality state.
- [`AudioEngineAdapter`](/api/core/interfaces/AudioEngineAdapter) for extension points that add protocol engines.

Adapter entry points:

- [`createHlsAdapter`](/api/adapters/hls/functions/createHlsAdapter) and [`HlsAdapterOptions`](/api/adapters/hls/interfaces/HlsAdapterOptions) for HLS playback through native HLS or `hls.js`.
- [`createDashAdapter`](/api/adapters/dash/functions/createDashAdapter) and [`DashAdapterOptions`](/api/adapters/dash/interfaces/DashAdapterOptions) for DASH playback through `dashjs`.

## Advanced Extension Points

Most applications should stay at the `AudioPlayer` layer. The lower-level engine contracts are public for advanced integrations, test doubles, custom protocol support, and application-owned media pipelines.

Useful references:

- [`AudioEngine`](/api/core/interfaces/AudioEngine) for the low-level playback contract.
- [`AudioEngineEvents`](/api/core/interfaces/AudioEngineEvents) for engine lifecycle payloads.
- [`MediaElementAudioEngine`](/api/core/classes/MediaElementAudioEngine) for the built-in `HTMLAudioElement` implementation.
- [`AudioEngineAdapter`](/api/core/interfaces/AudioEngineAdapter) for routing a source protocol to a custom engine.

## Import Map

| Import | Contains |
| --- | --- |
| `gaudio` | Core player, source, analyzer, event, error, engine, playlist, Media Session, and shared adaptive playback APIs. |
| `gaudio/hls` | HLS adapter factory plus HLS strategy and `hls.js` configuration types. |
| `gaudio/dash` | DASH adapter factory plus DASH adapter and `dashjs` settings types. |
