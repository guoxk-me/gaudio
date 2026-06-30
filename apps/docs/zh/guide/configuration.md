# 配置总览

这一页把 GAudio 的配置面集中放在一起。把 demo 播放器推进到生产集成前，可以用它做检查清单。

## 只安装实际使用的能力

```bash
pnpm add gaudio
```

只有应用导入对应 adapter 时才安装自适应 vendor：

```bash
pnpm add gaudio hls.js
pnpm add gaudio dashjs
```

| 入口 | 加载的依赖 | 适用场景 |
| --- | --- | --- |
| `gaudio` | 无 | 原生浏览器音频、source、播放列表、事件、Media Session、音频分析、共享自适应类型。 |
| `gaudio/hls` | `hls.js` | 使用原生 HLS 或 `hls.js` 播放 HLS manifest。 |
| `gaudio/dash` | `dashjs` | 使用 dash.js 播放 DASH manifest。 |

根入口永远不会导入 `hls.js` 或 `dashjs`。

## Player 参数

```ts
import { AdaptivePlaybackPreset, AudioPlayer } from 'gaudio'
import { createDashAdapter } from 'gaudio/dash'
import { createHlsAdapter } from 'gaudio/hls'

const player = new AudioPlayer({
  source: {
    url: 'https://media.example.com/episode.m3u8',
    protocol: 'hls',
    mimeType: 'application/vnd.apple.mpegurl',
  },
  adapters: [
    createHlsAdapter({
      playbackStrategy: 'native-first',
      contentType: 'vod',
      preset: AdaptivePlaybackPreset.Balanced,
    }),
    createDashAdapter({
      contentType: 'vod',
      preset: AdaptivePlaybackPreset.Balanced,
    }),
  ],
  preload: 'metadata',
  autoplay: false,
  muted: false,
  loop: false,
  volume: 0.9,
  playbackRate: 1,
  preservesPitch: true,
  mediaSession: {
    seekOffset: 15,
    metadata: {
      title: 'Episode 1',
      artist: 'Example Studio',
      album: 'Example Podcast',
      artwork: [
        { src: '/cover-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
  },
  analyzer: {
    fftSize: 2048,
  },
})
```

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `source` | `AudioSourceInput` | `undefined` | 初始 source。只有 `load()` 或 idle 状态下的 `play()` 会真正打开。 |
| `adapters` | `readonly AudioEngineAdapter[]` | `[]` | 内部 router 可用的 HLS、DASH 或未来协议 adapter。注入自定义 engine 时不要同时传入。 |
| `analyzer` | `boolean \| AudioPlayerAnalyzerOptions` | `undefined` | `true` 使用默认 `fftSize` 创建 player 持有的 Web Audio 分析器。 |
| `mediaSession` | `boolean \| AudioMediaSessionOptions` | `undefined` | 在支持的浏览器中接入浏览器、键盘、耳机和系统媒体控制。 |
| `preload` | `'none' \| 'metadata' \| 'auto'` | `'metadata'` | 应用于当前和后续 source 的浏览器 preload hint。 |
| `autoplay` | `boolean` | `false` | `load()` 在 metadata ready 后尝试播放。浏览器策略失败会以 `PLAYBACK_BLOCKED` reject。 |
| `muted` | `boolean` | `false` | 初始静音状态。 |
| `loop` | `boolean` | `false` | 非直播 source 播放结束后重新播放。 |
| `volume` | `number` | `1` | `0` 到 `1` 的线性音量；非法值抛 `RangeError`。 |
| `playbackRate` | `number` | `1` | 大于 `0` 的播放速度；非法值抛 `RangeError`。 |
| `preservesPitch` | `boolean` | `true` | 倍速变化时请求保持音高，依赖浏览器 media element 支持。 |

## Source 配置

GAudio 支持四种 source 形态：

| 形态 | 示例 | 适合场景 |
| --- | --- | --- |
| URL 字符串 | `'https://example.com/audio.mp3'` | 普通文件，URL 后缀或 MIME 推断已经足够。 |
| Source description | `{ url, protocol: 'hls', mimeType }` | 签名、无后缀或网关 URL 需要显式路由。 |
| `HttpAudioSource` | `new HttpAudioSource({ url, protocol })` | 可复用的 URL-backed source 对象。 |
| 自定义 `AudioSource` | `{ kind: 'url', open, close }` | load 时刷新签名 URL、清理 object URL、应用持有租约或本地资源。 |

```ts
import { BlobAudioSource, HttpAudioSource } from 'gaudio'

player.setSource('https://cdn.example.com/song.mp3')

player.setSource({
  url: 'https://media.example.com/play?id=42',
  protocol: 'dash',
  mimeType: 'application/dash+xml',
})

player.setSource(new HttpAudioSource({
  url: 'https://cdn.example.com/program.m3u8',
  protocol: 'hls',
  mimeType: 'application/vnd.apple.mpegurl',
}))

player.setSource(new BlobAudioSource(file))
```

`HttpAudioSource` 不会附加 headers、设置 credentials、刷新 token 或重试过期 URL。每次 `load()` 前需要新 URL 时使用自定义 source；manifest 或 segment 请求在播放过程中需要鉴权时，使用 HLS/DASH vendor hook。

```ts
interface SignedAudioUrl {
  url: string
  expiresAt: number
}

const signedProgramSource = {
  kind: 'url' as const,
  protocol: 'hls' as const,
  mimeType: 'application/vnd.apple.mpegurl',
  async open() {
    const signedAudioUrl = await fetch('/api/audio-url', {
      credentials: 'include',
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error('Failed to refresh audio URL')
      }

      return await response.json() as SignedAudioUrl
    })

    return { url: signedAudioUrl.url }
  },
  async close() {
    // 在这里释放应用持有的租约或 object URL。
  },
}
```

## 播放列表配置

```ts
player.setPlaylist(
  [
    {
      source: 'https://cdn.example.com/episode-1.mp3',
      fallbackSources: ['https://backup.example.com/episode-1.mp3'],
      metadata: {
        title: 'Episode 1',
        artist: 'Example Studio',
        album: 'Example Podcast',
      },
    },
    {
      source: 'https://cdn.example.com/episode-2.mp3',
      metadata: {
        title: 'Episode 2',
        artist: 'Example Studio',
      },
    },
  ],
  { startIndex: 0 },
)
```

| 字段或选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `AudioPlaylistTrack.source` | `AudioSourceInput` | 必填 | 当前曲目的 primary source。 |
| `fallbackSources` | `readonly AudioSourceInput[]` | `[]` | primary source 加载失败后按顺序尝试。 |
| `metadata` | `AudioMediaSessionMetadata` | `undefined` | 当前曲目的 Media Session metadata。 |
| `audioTracks` | `readonly AudioTrack[]` | `undefined` | 语言、配音或 companion audio source。 |
| `defaultAudioTrackId` | `string` | 第一个 audio track | 存在 alternate audio track 时的初始选择。 |
| `AudioPlaylistOptions.startIndex` | `number` | `0` | 赋值 playlist 时选择的零基曲目索引。 |
| `AudioPlaylistNavigationOptions.autoplay` | `boolean` | `false` | `next()`、`previous()` 或 `selectPlaylistTrack()` 加载后是否开始播放。 |
| `AudioTrackSelectionOptions.preserveTime` | `boolean` | `true` | 切换 alternate audio 时保持节目位置。 |
| `AudioTrackSelectionOptions.autoplay` | `boolean \| 'preserve'` | `'preserve'` | 除非显式设置，否则沿用切换前暂停/播放状态。 |

非循环曲目触发 `ended` 后，播放列表会自动继续下一首。

## Media Session 配置

```ts
const player = new AudioPlayer({
  source: 'https://cdn.example.com/episode.mp3',
  mediaSession: {
    enabled: true,
    seekOffset: 30,
    metadata: {
      title: 'Episode 1',
      artist: 'Example Studio',
      album: 'Example Podcast',
      artwork: [
        { src: '/cover-96.png', sizes: '96x96', type: 'image/png' },
        { src: '/cover-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
  },
})
```

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 即使有 metadata，也可以设为 `false` 禁用 Media Session。 |
| `metadata.title` | `undefined` | 曲目、节目或单集标题。 |
| `metadata.artist` | `undefined` | 艺术家、主播、朗读者或创作者。 |
| `metadata.album` | `undefined` | 专辑、播客、有声书或合集。 |
| `metadata.artwork` | `undefined` | 支持的系统界面可展示的封面候选。 |
| `seekOffset` | `10` | 系统快进/快退动作移动的秒数。 |

支持的浏览器会把系统动作路由到 `play()`、`pause()`、`stop()`、`previous()`、`next()`、`seek()` 和 `fastSeek()`。不支持的浏览器会忽略这项集成。

## Analyzer 配置

```ts
const player = new AudioPlayer({
  source: 'https://cdn.example.com/song.mp3',
  analyzer: {
    enabled: true,
    fftSize: 1024,
  },
})

await player.load()

const analyzer = player.getAnalyzer()
const frequency = analyzer?.getFrequencyData({ binCount: 64 })
const waveform = analyzer?.getWaveformData({ sampleCount: 128 })
```

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 设为 `false` 时可以保留配置对象，但不创建分析器。 |
| `fftSize` | `2048` | 必须是浏览器支持的 `AnalyserNode.fftSize` 值。 |
| `createAnalyzer` | engine factory | 自定义 engine 或应用自己的 Web Audio 图负责分析时使用。 |

跨域媒体可以正常播放，但如果响应没有通过 CORS 允许 Web Audio 访问，analyzer 仍可能返回静音样本。

## 自适应 adapter 配置

```ts
import { AdaptivePlaybackPreset } from 'gaudio'
import { createHlsAdapter } from 'gaudio/hls'

const hlsAdapter = createHlsAdapter({
  playbackStrategy: 'hls-first',
  contentType: 'long-form',
  preset: AdaptivePlaybackPreset.Stable,
  config: {
    maxBufferLength: 75,
    fragLoadPolicy: {
      default: {
        errorRetry: { maxNumRetry: 6 },
      },
    },
  },
})
```

| HLS 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `contentType` | `'vod'` | `'vod'`、`'long-form'` 或 `'live'` 内容调优。 |
| `preset` | `AdaptivePlaybackPreset.Balanced` | `FastStart`、`Balanced` 或 `Stable` 音频 profile。 |
| `playbackStrategy` | `'native-first'` | `'native-first'`、`'hls-first'`、`'native-only'` 或 `'hls-only'`。 |
| `config` | `{}` | 深度 partial 的 `hls.js` 构造配置。原生 HLS 播放会忽略它。 |

```ts
import { AdaptivePlaybackPreset } from 'gaudio'
import { createDashAdapter } from 'gaudio/dash'

const dashAdapter = createDashAdapter({
  contentType: 'live',
  preset: AdaptivePlaybackPreset.FastStart,
  settings: {
    streaming: {
      buffer: {
        bufferTimeDefault: 10,
      },
      abr: {
        autoSwitchBitrate: {
          audio: true,
        },
      },
    },
  },
})
```

| DASH 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `contentType` | `'vod'` | `'vod'`、`'long-form'` 或 `'live'` 内容调优。 |
| `preset` | `AdaptivePlaybackPreset.Balanced` | `FastStart`、`Balanced` 或 `Stable` 音频 profile。 |
| `settings` | `{}` | 创建 DASH engine 时应用的深度 partial dash.js settings。 |

Preset 数值、内容类型行为、音质选择和诊断见[自适应播放](./adaptive-playback.md)。

## 运行时更新

```ts
await hlsAdapter.updateConfig({
  maxBufferLength: 48,
})

await hlsAdapter.updateConfig(
  { maxBufferLength: 60 },
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
    },
  },
})
```

HLS update 默认在下一次 load 生效，除非设置 `apply: 'reload'`。Reload 会中断播放，并丢失 buffered segments、retry state 和带宽估计。DASH update 走 dash.js runtime settings，可以在 active 状态下应用。

## 推荐起始 profile

| 产品形态 | Core 参数 | 自适应参数 |
| --- | --- | --- |
| 音乐或短音频 | `preload: 'metadata'`、`volume: 1`、`loop: false` | `contentType: 'vod'`、`preset: Balanced` |
| 试听卡片 | `preload: 'none'`、由用户手势触发 `play()` | `contentType: 'vod'`、`preset: FastStart` |
| 播客或有声书 | `preload: 'metadata'`、Media Session metadata、playlist fallback | `contentType: 'long-form'`，弱网使用 `preset: Stable` |
| 直播电台或活动 | `autoplay: false`、用户手势后 `play()` | `contentType: 'live'`，使用能强制目标 vendor 设置的 strategy |
| 可视化播放器 | `analyzer: { fftSize: 1024 }`、媒体开启 CORS | 任意自适应 profile，但要在目标浏览器验证 |

