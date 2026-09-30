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
import type { AudioSource } from 'gaudio'
import { AudioPlayer } from 'gaudio'
import { createHlsAdapter } from 'gaudio/hls'

interface SignedAudioLease {
  url: string
  expiresAt: number
}

interface SignedOpenOperation {
  requestId: string
  controller: AbortController
  isCancelled: boolean
  isReleased: boolean
  releaseCompletion?: Promise<void>
}

let activeOperation: SignedOpenOperation | undefined

async function releaseSignedOperation(operation: SignedOpenOperation): Promise<void> {
  if (operation.isReleased) {
    return
  }

  operation.releaseCompletion ??= fetch('/api/audio-url/release', {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: operation.requestId }),
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to release audio URL: HTTP ${response.status}`)
    }

    operation.isReleased = true
  }).finally(() => {
    // 清理失败时保留 operation，供下一次 close() 重试。
    operation.releaseCompletion = undefined
  })

  await operation.releaseCompletion
  if (activeOperation === operation && operation.isReleased) {
    activeOperation = undefined
  }
}

const signedSource = {
  kind: 'url' as const,
  protocol: 'hls' as const,
  mimeType: 'application/vnd.apple.mpegurl',
  async open() {
    if (activeOperation && !activeOperation.isReleased) {
      throw new Error('The previous signed URL operation has not closed')
    }

    const operation: SignedOpenOperation = {
      requestId: crypto.randomUUID(),
      controller: new AbortController(),
      isCancelled: false,
      isReleased: false,
    }
    activeOperation = operation

    const response = await fetch('/api/audio-url/open', {
      method: 'POST',
      credentials: 'include',
      signal: operation.controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: operation.requestId }),
    })

    if (!response.ok) {
      throw new Error(`Failed to create signed audio URL: HTTP ${response.status}`)
    }

    const signedAudioLease = await response.json() as SignedAudioLease
    if (operation.isCancelled || activeOperation !== operation) {
      await releaseSignedOperation(operation)
      throw new DOMException('Audio source open was cancelled', 'AbortError')
    }

    return { url: signedAudioLease.url }
  },
  async close() {
    const operation = activeOperation
    if (!operation) {
      return
    }

    // 先标记取消，避免被忽略或迟到的 fetch 发布 URL。
    operation.isCancelled = true
    operation.controller.abort()
    await releaseSignedOperation(operation)
  },
} satisfies AudioSource

const player = new AudioPlayer({
  source: signedSource,
  adapters: [createHlsAdapter()],
})
```

`AbortController` 只能让浏览器停止等待，不能证明服务端没有创建租约。应把 `requestId` 当作幂等键：open endpoint 先以 `opening` 状态预留该 key，创建租约后，仅当记录仍是 `opening` 时才原子更新为 `active`；release endpoint 先原子 upsert 持久化的 `released` tombstone，再撤销已有租约，并对重复请求返回成功。如果 release 在 open commit 前获胜，open 必须撤销已经创建的资源，且不能返回可用 URL。

tombstone 的保留时间至少要覆盖租约或签名 URL 的最长有效期；每次请求都必须按当前用户校验权限；只有撤销已完成或已可靠写入可重试队列后，release 才能返回成功。如果 HLS 或 DASH manifest 内部的 segment 请求也需要鉴权，需要通过 `createHlsAdapter({ config })` 或 `createDashAdapter({ settings })` 配置所选 vendor。

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
// AI modified: adapter variant 顺序不代表音质排名。
const highestBitrateVariant = [...variants]
  .sort((leftVariant, rightVariant) => rightVariant.bitrate - leftVariant.bitrate)[0]

if (highestBitrateVariant) {
  await player.setAdaptiveQuality(highestBitrateVariant.id)
}

await player.setAdaptiveQuality('auto')
```

Variant 顺序由 implementation 决定。按音质排名选择前，应先按 `bitrate` 排序。

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

<!-- AI modified: document the request policy required before connecting browser media to Web Audio. -->
内置播放器启用默认分析时，会在加载媒体前使用 `crossOrigin: 'anonymous'`。服务端仍须通过 CORS 允许页面 origin；未启用 CORS 的跨域媒体接入 Web Audio 后，整个音频输出都可能静音。原生媒体需要 Cookie 时，可设置 `crossOrigin: 'use-credentials'`，同时让响应明确允许页面 origin 并包含 `Access-Control-Allow-Credentials: true`。注入的自定义引擎与自定义 analyzer factory 默认保留自己的请求策略，只有显式传入 `crossOrigin` 才会改变。此选项控制 media element；hls.js、dash.js 清单与分片请求的 credentials 仍由各自 adapter 配置决定。
