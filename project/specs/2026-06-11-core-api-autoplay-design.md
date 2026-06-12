# GAudio 0.3.0 Core API and Autoplay Design

## Goal

Complete the browser media APIs that are still missing from `AudioPlayer` and add predictable autoplay behavior without expanding into adaptive streaming or playlist management.

## Scope

Version 0.3.0 adds:

- `autoplay` configuration and runtime accessors.
- `preservesPitch` configuration and runtime accessors.
- `fastSeek(seconds)` with a standard seek fallback.
- `getPlayedRanges()`.
- Explicit validation for volume, playback rate, and seek positions.
- Matching engine contracts, media element behavior, tests, demo controls, and documentation.

Version 0.3.0 does not add HLS, DASH, playlists, custom decoding, or dependencies.

## Public API

`AudioPlayerOptions` gains:

```ts
interface AudioPlayerOptions {
  autoplay?: boolean
  preservesPitch?: boolean
}
```

`AudioPlayer` gains:

```ts
interface AudioPlayer {
  getAutoplay: () => boolean
  setAutoplay: (shouldAutoplay: boolean) => void
  getPreservesPitch: () => boolean
  setPreservesPitch: (shouldPreservePitch: boolean) => void
  fastSeek: (seconds: number) => Promise<void>
  getPlayedRanges: () => readonly TimeRange[]
}
```

The same capabilities are added to `AudioEngine` so custom engines remain substitutable.

## Behavior

### Autoplay

`AudioPlayer` owns autoplay orchestration instead of relying on the media element's native `autoplay` attribute. After `load()` successfully establishes a ready source, the player calls `engine.play()` when autoplay is enabled.

If playback is blocked by browser policy, `load()` rejects with `GAudioError` code `PLAYBACK_BLOCKED` and emits the existing `error` event. The source remains loaded so a later user-triggered `play()` can retry without loading it again. The player enters `error` through the existing error publication behavior; a subsequent successful engine `playing` event moves it to `playing`.

Changing autoplay at runtime only affects future loads. Enabling it does not immediately start an already loaded source.

### Fast Seek

`fastSeek(seconds)` validates the target, then asks the engine to use the browser's native `fastSeek` capability. When unavailable, `MediaElementAudioEngine` falls back to its regular asynchronous `seek()` behavior. The fallback preserves the same completion and error semantics as `seek()`.

### Pitch Preservation

`preservesPitch` delegates to `HTMLMediaElement.preservesPitch`. It defaults to `true`, matching browser behavior. The value can be configured before loading and changed during playback.

### Played Ranges

`getPlayedRanges()` returns every range from `HTMLMediaElement.played` as immutable `TimeRange` snapshots, using the same representation as buffered and seekable ranges.

## Validation

Invalid numeric inputs fail before mutating engine state:

- Volume must be finite and within `0` through `1`.
- Playback rate must be finite and greater than `0`.
- Seek and fast-seek positions must be finite and greater than or equal to `0`.

These programming errors throw `RangeError`. Existing browser or engine failures continue to use `GAudioError`.

## Implementation Boundaries

- `AudioPlayer` coordinates options, validation, state, and autoplay.
- `AudioEngine` defines the runtime contract.
- `MediaElementAudioEngine` provides browser property access, time ranges, and fast-seek fallback.
- No helper is introduced solely to copy fields. Existing time-range conversion logic may be shared where it removes duplication.
- Logic and structural changes receive concise nearby AI modification comments as required by the repository instructions.

## Testing

Unit tests cover:

- Option defaults and forwarding for autoplay and pitch preservation.
- Runtime getters and setters.
- Autoplay success and blocked-playback behavior.
- Retry after autoplay blocking without reloading.
- Native fast seek and fallback seek paths.
- Complete played ranges.
- Numeric validation and proof that invalid calls do not mutate the engine.

The demo exposes autoplay and pitch-preservation controls and displays played ranges. Verification runs Type Check, Lint, Tests, Demo Build, and library Build.

## Compatibility

The additions are backward-compatible for consumers that use `AudioPlayer` and the bundled engine. Custom `AudioEngine` implementations must implement the new methods, creating an intentional compile-time migration that will be documented in the minor-version migration notes.
