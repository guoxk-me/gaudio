# Getting Started

gaudio is currently pre-release. The public API is typed and documented, but intentional API adjustments can still happen before the first official release.

## Install

Install the core package for ordinary browser audio:

```bash
pnpm add gaudio
```

Install only the adaptive dependency your application actually imports:

```bash
pnpm add gaudio hls.js
pnpm add gaudio dashjs
```

## Import paths

| Import | What it contains | Vendor dependency |
| --- | --- | --- |
| `gaudio` | `AudioPlayer`, `HttpAudioSource`, `AudioAnalyzer`, `EventEmitter`, core types, adaptive event types, `AdaptivePlaybackPreset` | none |
| `gaudio/hls` | `createHlsAdapter`, HLS adapter types, `HlsConfig` re-export | `hls.js` |
| `gaudio/dash` | `createDashAdapter`, DASH adapter types, dash.js type re-exports | `dashjs` |

The root entry does not import `hls.js` or `dashjs`. Applications that only play MP3, AAC, WAV, or OGG do not need adaptive vendors.

## Create a player

```ts
import { AudioPlayer } from 'gaudio'

const player = new AudioPlayer({
  source: 'https://example.com/audio.mp3',
  preload: 'auto',
  volume: 0.8,
  playbackRate: 1,
  preservesPitch: true,
})

player.on('statechange', state => console.log(state))
player.on('waiting', () => console.log('buffering'))
player.on('error', error => console.error(error.code, error.message))

await player.load()
await player.play()
```

`play()` loads automatically when the player is still `idle`. Calling `load()` first is useful when you want metadata, duration, buffered ranges, or autoplay failure handling before a user-visible play command.

## Constructor options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `source` | `AudioSourceInput` | `undefined` | URL string, source description, `HttpAudioSource`, or custom `AudioSource`. Not loaded until `load()` or idle `play()`. |
| `adapters` | `readonly AudioEngineAdapter[]` | `[]` | Optional protocol adapters used by the internal engine router for HLS and DASH. Do not pass when injecting a custom engine. |
| `preload` | `'none' \| 'metadata' \| 'auto'` | `'metadata'` | Browser preload hint applied to current and future sources. |
| `autoplay` | `boolean` | `false` | Makes `load()` attempt `play()` after the source is ready. Browser policy rejection becomes `PLAYBACK_BLOCKED`. |
| `muted` | `boolean` | `false` | Starts with muted output. |
| `loop` | `boolean` | `false` | Restarts playback after the end of a non-live source. |
| `volume` | `number` | `1` | Linear volume between `0` and `1`. Invalid values throw `RangeError`. |
| `playbackRate` | `number` | `1` | Playback speed multiplier greater than `0`. Invalid values throw `RangeError`. |
| `preservesPitch` | `boolean` | `true` | Keeps pitch stable when playback speed changes, using the browser media element capability. |

## Playback controls

| API | Description |
| --- | --- |
| `load()` | Opens the configured source and resolves after metadata is available. Rejects with `GAudioError` for source, network, decode, adaptive, or autoplay failures. |
| `play()` | Starts or resumes playback. If the player is `idle`, it loads first. |
| `pause()` | Pauses while retaining the current position and loaded source. |
| `stop()` | Pauses and returns to `0` seconds while retaining the loaded source. The next `play()` reuses it. |
| `seek(seconds)` | Seeks to a non-negative exact position. Invalid values throw `RangeError`. |
| `fastSeek(seconds)` | Uses the browser optimized seek path when available, otherwise falls back to `seek()`. |
| `dispose()` | Releases the active engine, source lifecycle, vendor instances, and event listeners. Create a new player after disposal. |

## Playback settings

```ts
player.setMuted(true)
player.setLoop(true)
player.setAutoplay(false)
player.setPlaybackRate(1.25)
player.setPreservesPitch(true)
player.setPreload('metadata')
player.setVolume(0.6)
```

Runtime getters mirror the setters:

```ts
player.getVolume()
player.isMuted()
player.isLooping()
player.getAutoplay()
player.getPlaybackRate()
player.getPreservesPitch()
player.getPreload()
```

## Time and range state

```ts
const currentTime = player.getCurrentTime()
const duration = player.getDuration()
const buffered = player.getBufferedRanges()
const seekable = player.getSeekableRanges()
const played = player.getPlayedRanges()
const state = player.getState()
```

`TimeRange` values use seconds:

```ts
interface TimeRange {
  start: number
  end: number
}
```

`getDuration()` returns `0` when the browser has not reported a finite duration yet.

## Source inputs

`AudioPlayer` accepts four source shapes:

| Shape | Example | Use it when |
| --- | --- | --- |
| URL string | `'https://example.com/audio.mp3'` | The URL extension or MIME sniffing is enough for routing. |
| `AudioSourceDescription` | `{ url, protocol: 'hls', mimeType }` | Signed, extensionless, or routed URLs need explicit protocol metadata. |
| `HttpAudioSource` | `new HttpAudioSource({ url, protocol })` | You want a reusable URL-backed source object. |
| Custom `AudioSource` | `{ kind: 'url', open, close }` | You need signed URL refresh, object URL cleanup, local blobs, or application-owned resource lifecycle. |

```ts
import { AudioPlayer, HttpAudioSource } from 'gaudio'

player.setSource('https://example.com/audio.mp3')

player.setSource({
  url: 'https://example.com/media?id=42',
  protocol: 'hls',
  mimeType: 'application/vnd.apple.mpegurl',
})

player.setSource(new HttpAudioSource({
  url: 'https://example.com/program.mpd',
  protocol: 'dash',
  mimeType: 'application/dash+xml',
}))
```

Custom sources are lazy. `open()` runs during `load()`, and `close()` runs when a newer source replaces it, loading is cancelled, or the player is disposed:

```ts
const signedSource = {
  kind: 'url' as const,
  protocol: 'media' as const,
  mimeType: 'audio/mpeg',
  async open() {
    const url = await fetch('/api/audio-url').then(response => response.text())

    return { url }
  },
  async close() {
    // Release object URLs or server-side leases here.
  },
}

player.setSource(signedSource)
await player.load()
```

## Browser capabilities

Use `canPlayType()` for native media support:

```ts
const mp3Support = player.canPlayType('audio/mpeg')
const aacSupport = player.canPlayType('audio/mp4; codecs="mp4a.40.2"')
```

It returns `''`, `'maybe'`, or `'probably'` using browser media semantics. HLS and DASH support depends on registered adapters and the current browser; see [Adaptive Playback](./adaptive-playback.md).

## Autoplay behavior

gaudio manages autoplay at the player level instead of relying on the media element `autoplay` attribute. When `autoplay` is enabled, `load()` attempts playback after metadata is ready:

```ts
player.setAutoplay(true)

try {
  await player.load()
}
catch (error) {
  // Browser policy can block playback until a user gesture.
}
```

If browser policy blocks playback, `load()` rejects with `GAudioError` code `PLAYBACK_BLOCKED`. The source remains loaded, so a later user-triggered `play()` can retry without another `load()`.

## Audio analysis

`AudioAnalyzer` reads frequency-domain and waveform bytes from a Web Audio graph. It analyzes an `AudioNode` that your application owns; `AudioPlayer` does not expose its internal media element as an analyzer source.

```ts
import { AudioAnalyzer } from 'gaudio'

const audioContext = new AudioContext()
const oscillator = audioContext.createOscillator()
const gain = audioContext.createGain()
const analyzer = new AudioAnalyzer(audioContext, oscillator, 2048)

gain.gain.value = 0
analyzer.connect(gain)
gain.connect(audioContext.destination)
oscillator.start()

const frequency = analyzer.getFrequencyData({ binCount: 64 })
const waveform = analyzer.getWaveformData({ sampleCount: 128 })

analyzer.dispose()
oscillator.stop()
await audioContext.close()
```

The interactive demo includes a canvas visualizer that continuously paints analyzer samples.
