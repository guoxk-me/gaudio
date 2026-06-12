# Migration

## From 0.1.0

- Remove `lowLatency` from `AudioPlayerOptions`.
- Update custom `AudioEngine` implementations for expanded media settings, state queries, time ranges, unload behavior, and lifecycle events.
- Read buffered information from `BufferUpdate.ranges`.
- Expect `stop()` to leave the player in `ready` instead of `idle`.

## From 0.2.0

- Add `fastSeek`, autoplay accessors, pitch-preservation accessors, and `getPlayedRanges` to custom engines.
- Handle `PLAYBACK_BLOCKED` when browser policy prevents autoplay.
- Handle `RangeError` for invalid volume, playback rate, and seek arguments.

## From 0.3.0

- Install `hls.js` or `dashjs` only when importing the matching subpath.
- Register adaptive adapters through `AudioPlayerOptions.adapters`.
- Use explicit source protocol metadata for extensionless streams.
- Handle adaptive events and fatal adaptive error codes.
- Do not combine `options.adapters` with an explicitly injected custom engine.
