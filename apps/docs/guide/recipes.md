# Recipes

These examples show complete integration shapes that can be copied into an application and trimmed down. They use public package exports only.

## Basic browser player

```ts
import { AudioPlayer } from 'gaudio'

const player = new AudioPlayer({
  source: 'https://cdn.example.com/song.mp3',
  preload: 'metadata',
  volume: 0.8,
  mediaSession: true,
})

player.on('statechange', state => console.log('state', state))
player.on('error', error => console.error(error.code, error.message))

await player.load()
await player.play()
```

Use this for MP3, AAC, WAV, OGG, and other formats the browser can play natively. Add HLS or DASH adapters only when source routing needs them.

## Playlist with fallback CDN and Media Session metadata

```ts
import { AudioPlayer } from 'gaudio'

const player = new AudioPlayer({
  mediaSession: {
    seekOffset: 15,
    metadata: {
      artist: 'Example Studio',
      album: 'Example Podcast',
    },
  },
})

player.setPlaylist([
  {
    source: 'https://cdn-a.example.com/episode-1.mp3',
    fallbackSources: ['https://cdn-b.example.com/episode-1.mp3'],
    metadata: {
      title: 'Episode 1',
      artist: 'Example Studio',
      album: 'Example Podcast',
      artwork: [
        { src: '/episode-1.png', sizes: '512x512', type: 'image/png' },
      ],
    },
  },
  {
    source: 'https://cdn-a.example.com/episode-2.mp3',
    fallbackSources: ['https://cdn-b.example.com/episode-2.mp3'],
    metadata: {
      title: 'Episode 2',
      artist: 'Example Studio',
      album: 'Example Podcast',
    },
  },
])

await player.load()
await player.next({ autoplay: true })
```

The player tries each track's `fallbackSources` before emitting a load error. When a non-looping track ends, GAudio loads and plays the next playlist track.

## Dubbed or alternate audio tracks

```ts
player.setPlaylist([
  {
    source: 'https://cdn.example.com/story.zh-CN.m4a',
    defaultAudioTrackId: 'zh-CN',
    audioTracks: [
      {
        id: 'zh-CN',
        label: '简体中文',
        language: 'zh-CN',
        source: 'https://cdn.example.com/story.zh-CN.m4a',
      },
      {
        id: 'en',
        label: 'English',
        language: 'en',
        source: 'https://cdn.example.com/story.en.m4a',
        fallbackSources: ['https://backup.example.com/story.en.m4a'],
      },
    ],
  },
])

await player.load()
await player.selectAudioTrack('en', {
  preserveTime: true,
  autoplay: 'preserve',
})
```

Use alternate audio tracks when each language or companion track shares the same program timeline. `preserveTime` keeps the listener in the same place.

## Signed URL source

```ts
import { AudioPlayer } from 'gaudio'

interface SignedAudioUrl {
  url: string
  expiresAt: number
}

const signedSource = {
  kind: 'url' as const,
  protocol: 'hls' as const,
  mimeType: 'application/vnd.apple.mpegurl',
  async open() {
    const signedAudioUrl = await fetch('/api/audio-url', {
      credentials: 'include',
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error('Failed to create signed audio URL')
      }

      return await response.json() as SignedAudioUrl
    })

    return { url: signedAudioUrl.url }
  },
  async close() {
    await fetch('/api/audio-url/release', { method: 'POST' }).catch(() => {})
  },
}

const player = new AudioPlayer({
  source: signedSource,
})
```

This refreshes the top-level URL before each load. For HLS or DASH manifests whose segment requests also need authentication, configure the selected vendor through `createHlsAdapter({ config })` or `createDashAdapter({ settings })`.

## Local file preview

```ts
import { AudioPlayer, BlobAudioSource } from 'gaudio'

const player = new AudioPlayer({
  preload: 'metadata',
  analyzer: true,
})

async function previewAudioFile(file: File) {
  player.setSource(new BlobAudioSource(file, {
    mimeType: file.type || 'audio/mpeg',
  }))

  await player.load()
  await player.play()
}
```

`BlobAudioSource` owns the object URL and revokes it when a newer source replaces it or the player is disposed.

## HLS and DASH player with manual quality

```ts
import { AdaptivePlaybackPreset, AudioPlayer } from 'gaudio'
import { createDashAdapter } from 'gaudio/dash'
import { createHlsAdapter } from 'gaudio/hls'

const hlsAdapter = createHlsAdapter({
  playbackStrategy: 'hls-first',
  contentType: 'vod',
  preset: AdaptivePlaybackPreset.Balanced,
})

const dashAdapter = createDashAdapter({
  contentType: 'vod',
  preset: AdaptivePlaybackPreset.Balanced,
})

const player = new AudioPlayer({
  adapters: [hlsAdapter, dashAdapter],
})

player.on('manifestloaded', ({ variants }) => {
  console.table(variants)
})

player.on('variantchange', ({ variantId, bitrate, reason }) => {
  console.log('quality', variantId, bitrate, reason)
})

player.setSource({
  url: 'https://media.example.com/program.m3u8',
  protocol: 'hls',
  mimeType: 'application/vnd.apple.mpegurl',
})

await player.load()

const variants = player.getAdaptiveVariants()
const highestVariant = variants.at(-1)

if (highestVariant) {
  await player.setAdaptiveQuality(highestVariant.id)
}

await player.setAdaptiveQuality('auto')
```

Manual selection works when the active vendor exposes quality controls. Browser-native HLS can reject manual selection with `PROTOCOL_UNSUPPORTED`.

## Live stream profile

```ts
import { AdaptivePlaybackPreset, AudioPlayer } from 'gaudio'
import { createHlsAdapter } from 'gaudio/hls'

const hlsAdapter = createHlsAdapter({
  playbackStrategy: 'hls-first',
  contentType: 'live',
  preset: AdaptivePlaybackPreset.FastStart,
  config: {
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 6,
  },
})

const player = new AudioPlayer({
  adapters: [hlsAdapter],
  source: {
    url: 'https://radio.example.com/live.m3u8',
    protocol: 'hls',
    mimeType: 'application/vnd.apple.mpegurl',
  },
})

player.on('streamerror', ({ category, isFatal, code }) => {
  console.warn(category, isFatal, code)
})

await player.load()
```

Use `hls-first` or `hls-only` when the live behavior must come from `hls.js` settings. Native HLS is browser-owned and does not apply `hls.js` constructor config.

## Runtime adaptive tuning

```ts
await hlsAdapter.updateConfig({
  maxBufferLength: 45,
})

await hlsAdapter.updateConfig(
  {
    maxBufferLength: 60,
    backBufferLength: 45,
  },
  {
    apply: 'reload',
    restorePosition: true,
    resumePlayback: true,
  },
)

dashAdapter.updateSettings({
  streaming: {
    buffer: {
      bufferTimeDefault: 24,
      bufferToKeep: 45,
    },
  },
})
```

Prefer next-load HLS updates for non-urgent tuning. Use reload only when the user-visible interruption is acceptable.

## Event telemetry

```ts
const removeListeners = [
  player.on('statechange', state => analytics.track('audio_state', { state })),
  player.on('loadedmetadata', ({ duration }) => analytics.track('audio_metadata', { duration })),
  player.on('waiting', () => analytics.track('audio_waiting')),
  player.on('variantchange', ({ variantId, bitrate, reason }) => {
    analytics.track('audio_quality', { variantId, bitrate, reason })
  }),
  player.on('error', error => analytics.track('audio_error', {
    code: error.code,
    message: error.message,
  })),
]

function disposeAudioTelemetry() {
  for (const removeListener of removeListeners) {
    removeListener()
  }
}
```

Register listeners before `load()` when you need the complete lifecycle for a source.

## Canvas spectrum visualizer

```ts
import { AudioPlayer } from 'gaudio'

const player = new AudioPlayer({
  source: 'https://cdn.example.com/song.mp3',
  analyzer: {
    fftSize: 1024,
  },
})

await player.load()

const canvas = document.querySelector<HTMLCanvasElement>('#spectrum')
const context = canvas?.getContext('2d')

function paintSpectrum() {
  if (!canvas || !context) {
    return
  }

  const analyzer = player.getAnalyzer()
  const frequency = analyzer?.getFrequencyData({ binCount: 48 })

  context.clearRect(0, 0, canvas.width, canvas.height)

  if (frequency) {
    const barWidth = canvas.width / frequency.length

    frequency.forEach((level, index) => {
      const height = (level / 255) * canvas.height
      context.fillRect(index * barWidth, canvas.height - height, barWidth - 2, height)
    })
  }

  requestAnimationFrame(paintSpectrum)
}

paintSpectrum()
```

For remote media, verify CORS in target browsers. A file can play normally while Web Audio analysis still returns silent samples.

