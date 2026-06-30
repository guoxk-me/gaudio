# 场景示例

这些示例展示可以直接放进应用再裁剪的完整集成形态。示例只使用公共 package exports。

## 基础浏览器播放器

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

适合 MP3、AAC、WAV、OGG，以及浏览器可以原生播放的其他格式。只有 source routing 需要时才添加 HLS 或 DASH adapter。

## 带备用 CDN 和 Media Session metadata 的播放列表

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

播放器会先尝试每个曲目的 `fallbackSources`，全部失败后才发出 load error。非循环曲目结束后，GAudio 会加载并播放下一首。

## 配音或 alternate audio tracks

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

当每种语言或 companion track 共享同一条节目时间线时，使用 alternate audio tracks。`preserveTime` 会让听众停留在同一位置。

## 签名 URL source

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

这个 source 会在每次 load 前刷新顶层 URL。如果 HLS 或 DASH manifest 内部的 segment 请求也需要鉴权，需要通过 `createHlsAdapter({ config })` 或 `createDashAdapter({ settings })` 配置所选 vendor。

## 本地文件预览

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

`BlobAudioSource` 持有 object URL，并在新的 source 替换它或 player dispose 时 revoke。

## 带手动音质的 HLS 和 DASH 播放器

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

当前 vendor 暴露音质控制时可以手动选择。浏览器原生 HLS 可能以 `PROTOCOL_UNSUPPORTED` 拒绝手动选择。

## 直播流 profile

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

直播行为必须来自 `hls.js` settings 时，使用 `hls-first` 或 `hls-only`。原生 HLS 由浏览器接管，不会应用 `hls.js` 构造配置。

## 运行时自适应调优

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

非紧急 HLS 调优优先使用 next-load update。只有用户可接受播放中断时才使用 reload。

## 事件遥测

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

如果需要完整 source 生命周期，应在 `load()` 前注册监听器。

## Canvas 频谱可视化

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

远程媒体需要在目标浏览器验证 CORS。文件可能能正常播放，但 Web Audio 分析仍返回静音样本。

