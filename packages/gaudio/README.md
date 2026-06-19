# gaudio

A browser-first TypeScript audio streaming library with optional HLS and DASH adapters.

gaudio is currently pre-release. Use the documented API directly, but expect intentional API adjustments before the first official release.

## Install

```bash
pnpm add gaudio
```

Install only the adaptive dependency your application uses:

```bash
pnpm add gaudio hls.js
pnpm add gaudio dashjs
```

## Entry points

| Import | Contents |
| --- | --- |
| `gaudio` | `AudioPlayer`, `HttpAudioSource`, `BlobAudioSource`, `AudioAnalyzer`, `EventEmitter`, core types, adaptive event types, `AdaptivePlaybackPreset` |
| `gaudio/hls` | `createHlsAdapter`, HLS adapter types, `HlsConfig` |
| `gaudio/dash` | `createDashAdapter`, DASH adapter types, dash.js type re-exports |

The root entry does not import `hls.js` or `dashjs`.

## Quick start

```ts
import { AudioPlayer } from 'gaudio'

const player = new AudioPlayer({
  source: 'https://example.com/audio.mp3',
  preload: 'auto',
  volume: 0.8,
  analyzer: true,
})

player.on('statechange', state => console.log(state))
player.on('error', error => console.error(error.code))

await player.load()
await player.play()
```

## Core controls

```ts
player.pause()
player.stop()
await player.seek(30)
await player.fastSeek(45)

player.setVolume(0.6)
player.setMuted(false)
player.setLoop(false)
player.setAutoplay(false)
player.setPlaybackRate(1.25)
player.setPreservesPitch(true)
player.setPreload('metadata')

player.getBufferedRanges()
player.getSeekableRanges()
player.getPlayedRanges()
player.getAnalyzer()
player.getSource()
player.dispose()
```

Volume must be between `0` and `1`. Playback rate must be greater than `0`. Seek targets must be non-negative.

## Playlists and fallback sources

Use a playlist when an application owns track order, previous/next controls, and automatic continuation:

```ts
player.setPlaylist([
  {
    source: 'https://example.com/episode-1.mp3',
    fallbackSources: ['https://cdn.example.com/episode-1.mp3'],
  },
  { source: 'https://example.com/episode-2.mp3' },
])

await player.load()
await player.next()
await player.previous()
```

When a playlist track ends, gaudio automatically loads and plays the next track. If a track fails to load, its `fallbackSources` are attempted in order before an error is emitted.

## Source inputs

```ts
import { AudioPlayer, BlobAudioSource, HttpAudioSource } from 'gaudio'

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

const fileSource = new BlobAudioSource(file)
player.setSource(fileSource)
```

Custom `AudioSource` objects can lazily open signed URLs, local object URLs, or app-owned resources through `open()` and `close()`.

## Adaptive playback

```ts
import { AdaptivePlaybackPreset, AudioPlayer } from 'gaudio'
import { createDashAdapter } from 'gaudio/dash'
import { createHlsAdapter } from 'gaudio/hls'

const hlsAdapter = createHlsAdapter({
  playbackStrategy: 'native-first',
  preset: AdaptivePlaybackPreset.Balanced,
})

const dashAdapter = createDashAdapter({
  preset: AdaptivePlaybackPreset.Balanced,
})

const player = new AudioPlayer({
  adapters: [hlsAdapter, dashAdapter],
})
```

`Balanced` is used when `preset` is omitted. Choose `FastStart` for smaller startup buffers or `Stable` for weak and variable networks. Presets configure audio VOD loading, buffering, memory limits, ABR, request retries, timeouts, and stall recovery. Explicit vendor configuration overrides the selected preset.

gaudio reports adaptive quality through `manifestloaded` and `variantchange`. Use the player-level API for protocol-neutral quality controls:

```ts
const variants = player.getAdaptiveVariants()
await player.setAdaptiveQuality('auto')
await player.setAdaptiveQuality(variants[0].id)
```

Native HLS still uses browser-owned ABR and does not expose manual variants. Advanced integrations can still inspect the exposed `hlsInstance` or `dashInstance` from adapter subpaths.

## Events

```ts
const unsubscribe = player.on('playing', () => console.log('playing'))

player.once('ended', () => console.log('done'))
player.removeAllListeners('timeupdate')
unsubscribe()
```

## Audio analysis

Use the player-level analyzer option for the built-in media element, HLS, and DASH engines:

```ts
const player = new AudioPlayer({
  source: 'https://example.com/audio.mp3',
  analyzer: {
    fftSize: 1024,
  },
})

await player.load()

const analyzer = player.getAnalyzer()
const frequency = analyzer?.getFrequencyData({ binCount: 64 })
const waveform = analyzer?.getWaveformData({ sampleCount: 128 })
```

Custom engines can expose `createAnalyzer`, or applications can pass `analyzer.createAnalyzer` to connect their own Web Audio graph.

For lower-level Web Audio usage, `AudioAnalyzer` reads frequency and waveform byte samples from an `AudioNode`:

```ts
import { AudioAnalyzer } from 'gaudio'

const audioContext = new AudioContext()
const oscillator = audioContext.createOscillator()
const analyzer = new AudioAnalyzer(audioContext, oscillator, 2048)

oscillator.start()

const frequency = analyzer.getFrequencyData({ binCount: 64 })
const waveform = analyzer.getWaveformData({ sampleCount: 128 })

analyzer.dispose()
oscillator.stop()
await audioContext.close()
```

See the [gaudio documentation](https://guoxk.github.io/gaudio/) for bilingual guides, API reference, and interactive examples with adaptive quality controls and a canvas spectrum visualizer.
