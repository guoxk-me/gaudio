# Events

`AudioPlayer.on(eventName, handler)` registers a typed listener and returns a function that removes that listener.

```ts
const removePlayingListener = player.on('playing', () => {
  console.log('playing')
})

removePlayingListener()
```

Events do not replay past state. Register listeners before `load()` when you need the full source lifecycle.

## Playback state

`statechange` reports the public `PlaybackState`:

```ts
player.on('statechange', state => console.log(state))
```

| State | Meaning |
| --- | --- |
| `idle` | No loaded source is active. |
| `loading` | `load()` is opening and attaching a source. |
| `ready` | Metadata is available and playback can be started or resumed. |
| `playing` | Playback is actively progressing. |
| `paused` | Playback is paused by user or browser state. |
| `buffering` | Playback is waiting for more media data. |
| `ended` | A non-looping source reached the end. |
| `error` | A fatal load, playback, or adaptive failure was published. |

## Core lifecycle events

These events follow browser media element lifecycle semantics and are also forwarded through adaptive engines.

| Event | Payload | When it fires |
| --- | --- | --- |
| `loadstart` | `undefined` | The engine starts loading the attached source. |
| `loadedmetadata` | `{ duration }` | Metadata and duration become available. `duration` is seconds or `0` when unknown. |
| `canplay` | `undefined` | The browser reports that playback can begin. |
| `play` | `undefined` | Playback has been requested. |
| `playing` | `undefined` | Playback is actively progressing. |
| `pause` | `undefined` | Playback pauses. |
| `waiting` | `undefined` | Playback waits for more data. |
| `ended` | `undefined` | A non-looping source reaches the end. |

```ts
player.on('loadstart', () => console.log('loading'))
player.on('loadedmetadata', ({ duration }) => console.log(duration))
player.on('playing', () => console.log('playing'))
player.on('waiting', () => console.log('buffering'))
```

## Time and range events

| Event | Payload | Fields |
| --- | --- | --- |
| `seeking` | `TimeUpdate` | `currentTime`, `duration` in seconds. |
| `seeked` | `TimeUpdate` | Seek completion position and duration in seconds. |
| `timeupdate` | `TimeUpdate` | Current position and duration in seconds. |
| `durationchange` | `DurationUpdate` | `duration` in seconds or `0` when unknown. |
| `bufferupdate` | `BufferUpdate` | `ranges`, an ordered list of `{ start, end }` buffered ranges in seconds. |

```ts
player.on('seeking', ({ currentTime }) => console.log(currentTime))
player.on('bufferupdate', ({ ranges }) => console.log(ranges))
```

`played` and `seekable` ranges are read through getters:

```ts
player.getPlayedRanges()
player.getSeekableRanges()
```

## Setting events

| Event | Payload | Fields |
| --- | --- | --- |
| `volumechange` | `VolumeUpdate` | `volume` from `0` to `1`, plus `isMuted`. |
| `ratechange` | `PlaybackRateUpdate` | `playbackRate`, where `1` is normal speed. |

```ts
player.on('volumechange', ({ volume, isMuted }) => {
  console.log(volume, isMuted)
})

player.on('ratechange', ({ playbackRate }) => {
  console.log(playbackRate)
})
```

## Adaptive events

Adaptive events use protocol-neutral payloads for HLS and DASH.

| Event | Payload | When it fires |
| --- | --- | --- |
| `adaptivechange` | `AdaptivePlaybackInfo` | A source activates HLS or DASH and selects `native`, `hls.js`, or `dash.js`. |
| `manifestloaded` | `AdaptiveManifestUpdate` | A vendor manifest loads and exposes variants. |
| `variantchange` | `AdaptiveVariantUpdate` | Initial or automatic ABR selection changes variant. |
| `segmentloadstart` | `AdaptiveSegmentUpdate` | A media segment request starts, when the vendor exposes it. |
| `segmentloaded` | `AdaptiveSegmentUpdate` | A media segment request completes, when the vendor exposes it. |
| `streamerror` | `AdaptiveStreamError` | A recoverable or fatal adaptive-stream failure is reported by the vendor. |

```ts
player.on('adaptivechange', update => console.log(update.protocol, update.implementation))
player.on('manifestloaded', update => console.log(update.url, update.variants))
player.on('variantchange', update => console.log(update.variantId, update.bitrate, update.reason))
player.on('segmentloadstart', update => console.log(update.url))
player.on('segmentloaded', update => console.log(update.url, update.duration))
player.on('streamerror', update => console.log(update.category, update.isFatal, update.code))
```

`AdaptiveVariant` fields:

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Vendor-provided variant or representation id. |
| `bitrate` | `number` | Declared bitrate in bits per second. |
| `codecs` | `string \| undefined` | Codec declaration when the manifest exposes it. |

`AdaptiveVariantUpdate.reason` is `'initial'` for the first selection and `'automatic'` for later ABR changes. Manual vendor-level quality changes can still arrive as vendor events, but gaudio does not currently standardize a manual reason.

Native HLS usually emits only `adaptivechange`; browser-native playback does not expose the same manifest, variant, segment, or recoverable-error details as `hls.js`.

## Errors

```ts
player.on('error', (error) => {
  console.error(error.code, error.message, error.cause)
})
```

| Code | Typical cause |
| --- | --- |
| `SOURCE_UNAVAILABLE` | `load()` ran before a source was configured. |
| `ADAPTER_UNAVAILABLE` | Source selected HLS or DASH but no matching adapter was registered. |
| `PROTOCOL_UNSUPPORTED` | The selected adapter cannot run in this browser or strategy. |
| `MANIFEST_ERROR` | HLS or DASH manifest loading/parsing failed fatally. |
| `SEGMENT_ERROR` | Media segment loading failed fatally. |
| `ADAPTIVE_STREAM_ERROR` | Another fatal adaptive vendor failure occurred. |
| `LOAD_ABORTED` | A newer source or disposal superseded an active load. |
| `DECODE_FAILED` | Browser media decode failed. |
| `PLAYBACK_BLOCKED` | Browser policy blocked playback, usually due to missing user gesture. |
| `UNSUPPORTED_FORMAT` | Browser reported the media format is unsupported. |
| `NETWORK_ERROR` | Browser media element reported a network failure. |
| `ENGINE_ERROR` | A lower-level engine error could not be classified more specifically. |

Recoverable adaptive vendor failures emit `streamerror` while the vendor retries. Fatal adaptive failures also emit `error`, move state to `error`, and reject the active `load()` or `play()` operation.

The interactive demo logs state changes, media lifecycle events, time ranges, adaptive manifest and quality events, segment activity, utility previews, and typed error codes.
