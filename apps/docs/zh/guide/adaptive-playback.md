# 自适应播放

gaudio 把自适应流作为可选能力。导入根入口 `gaudio` 不会加载 `hls.js` 或 `dashjs`；只有应用导入 `gaudio/hls` 或 `gaudio/dash` 时才需要对应 vendor。

## 安装

只安装实际使用的协议依赖：

```bash
pnpm add gaudio hls.js
pnpm add gaudio dashjs
```

## 注册适配器

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

player.setSource('https://example.com/program.m3u8')
await player.load()
```

同一个 player 可以通过 `setSource()` 再 `load()` 在普通媒体、HLS 和 DASH 之间切换。协议切换不是 gapless：当前 engine 会被卸载，新协议会创建新的 engine。

## 协议识别

gaudio 按下面顺序选择 engine：

| 优先级 | Source metadata | 结果 |
| --- | --- | --- |
| 1 | `AudioSourceDescription` 或自定义 `AudioSource` 上的显式 `protocol` | 严格使用指定的 `media`、`hls` 或 `dash`。 |
| 2 | 已知 MIME type | HLS MIME type 选择 `hls`；`application/dash+xml` 选择 `dash`。 |
| 3 | URL pathname 后缀 | `.m3u8` 选择 `hls`；`.mpd` 选择 `dash`；query string 和 fragment 会被忽略。 |
| 4 | 没有匹配 | 回退到内置 media element engine。 |

签名 URL、CDN 网关 URL 或无后缀 endpoint 应使用显式 metadata：

```ts
player.setSource({
  url: 'https://example.com/media?id=42',
  protocol: 'dash',
  mimeType: 'application/dash+xml',
})
```

如果 source 选择了 `hls` 或 `dash`，但没有注册对应 adapter，加载会失败并返回 `ADAPTER_UNAVAILABLE`。如果 adapter 在当前浏览器不可用，加载会失败并返回 `PROTOCOL_UNSUPPORTED`。

## HLS adapter 参数

```ts
const hlsAdapter = createHlsAdapter({
  preset: AdaptivePlaybackPreset.Stable,
  playbackStrategy: 'hls-first',
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

| 参数 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `preset` | `AdaptivePlaybackPreset` | `Balanced` | 在显式 `config` 覆盖前应用音频 VOD 配置 profile。 |
| `playbackStrategy` | `'native-first' \| 'hls-first' \| 'native-only' \| 'hls-only'` | `'native-first'` | 决定优先使用浏览器原生 HLS 还是 `hls.js`。 |
| `config` | `HlsAdapterConfig` | `{}` | 深度 partial 的 `hls.js` 构造配置。显式字段会覆盖 preset。 |

Strategy 行为是确定性的：

| Strategy | 行为 |
| --- | --- |
| `native-first` | 优先使用原生 HLS，不可用时使用 `hls.js`。 |
| `hls-first` | 优先使用 `hls.js`，不可用时使用原生 HLS。 |
| `native-only` | 只使用原生 HLS，不可用则 `PROTOCOL_UNSUPPORTED`。 |
| `hls-only` | 只使用 `hls.js`，不可用则 `PROTOCOL_UNSUPPORTED`。 |

选择原生 HLS 时，adapter 会保存 preset 和 `config`，但浏览器不会暴露 `hls.js` 控制项。这些设置只有之后某次 load 选择 `hls.js` 时才会生效。

HLS request policy 覆盖会递归合并。只修改一个 retry 值，不会丢掉 preset 中剩余 timeout、retry 和 backoff 字段。

## DASH adapter 参数

```ts
const dashAdapter = createDashAdapter({
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

| 参数 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `preset` | `AdaptivePlaybackPreset` | `Balanced` | 在显式 `settings` 覆盖前应用音频 VOD dash.js settings profile。 |
| `settings` | `MediaPlayerSettingClass` | `{}` | 深度 partial 的 dash.js settings，在创建 DASH engine 时应用。 |

DASH settings 会递归合并，active 状态下通过 dash.js `updateSettings()` 应用。

## 播放预设

两个自适应 adapter 在未指定 preset 时都会使用 `AdaptivePlaybackPreset.Balanced`。

| Preset | 适用场景 | 缓冲行为 | 网络行为 |
| --- | --- | --- | --- |
| `FastStart` | 快速启动、试听、频繁切换 source | 更小缓冲、更短 back buffer | 更快失败与重试 |
| `Balanced` | 常规音乐、播客、有声书 | 中等缓冲和内存占用 | 默认重试与卡顿恢复 profile |
| `Stable` | 弱网、网络波动、长时间收听 | 更大缓冲、更长保留 | 更长超时和更多重试 |

HLS 关键 profile 数值：

| Setting | `FastStart` | `Balanced` | `Stable` |
| --- | ---: | ---: | ---: |
| `maxBufferLength` | 12 s | 30 s | 60 s |
| `maxMaxBufferLength` | 30 s | 90 s | 180 s |
| `backBufferLength` | 15 s | 30 s | 60 s |
| `maxBufferSize` | 16 MiB | 32 MiB | 48 MiB |
| `abrEwmaDefaultEstimate` | 256 kbps | 384 kbps | 256 kbps |
| `abrBandWidthFactor` | 0.9 | 0.9 | 0.8 |
| `abrBandWidthUpFactor` | 0.7 | 0.65 | 0.55 |
| `maxStarvationDelay` | 2 s | 4 s | 8 s |
| `maxLoadingDelay` | 2 s | 4 s | 8 s |
| Fragment first-byte timeout | 6 s | 10 s | 15 s |
| Fragment total timeout | 30 s | 60 s | 120 s |
| Fragment error retries | 2 | 4 | 6 |

DASH 关键 profile 数值：

| Setting | `FastStart` | `Balanced` | `Stable` |
| --- | ---: | ---: | ---: |
| `bufferTimeDefault` | 8 s | 18 s | 30 s |
| `bufferTimeAtTopQuality` | 12 s | 30 s | 60 s |
| `bufferTimeAtTopQualityLongForm` | 20 s | 60 s | 120 s |
| `bufferToKeep` | 15 s | 30 s | 60 s |
| `bufferPruningInterval` | 5 s | 10 s | 15 s |
| Throughput safety factor | 0.95 | 0.9 | 0.8 |
| VOD throughput samples | 3 | 4 | 6 |
| Manifest timeout | 8 s | 10 s | 15 s |
| Fragment timeout | 15 s | 20 s | 30 s |
| MPD retries | 2 | 3 | 5 |
| Media-segment retries | 2 | 3 | 5 |

Preset 会配置音频 VOD 的缓冲、内存限制、ABR 估计、请求超时、重试、小间隙恢复、播放卡顿恢复、暂停状态下载调度和长音频缓冲。

它们不配置直播、低延迟直播、DRM、字幕、插播、遥测、服务端优化或只对视频有意义的调优项。

## 自动音质切换

HLS 和 DASH vendor engine 负责 ABR 决策。gaudio 通过协议中立事件报告这些决策：

```ts
player.on('manifestloaded', ({ variants }) => {
  console.log(variants.map(variant => ({
    id: variant.id,
    bitrate: variant.bitrate,
    codecs: variant.codecs,
  })))
})

player.on('variantchange', ({ variantId, bitrate, reason }) => {
  console.log(variantId, bitrate, reason) // reason 是 'initial' 或 'automatic'
})
```

原生 HLS 可以发出 `adaptivechange`，但通常不暴露 vendor 级 manifest、variant、segment 或可恢复错误细节。

## 手动音质实验

gaudio 当前没有提供统一的公共 `setQuality()` API。手动音质是 vendor-specific 高级集成，应通过暴露的 vendor instance 使用。

`hls.js` 可以使用 active `hlsInstance`：

```ts
player.on('manifestloaded', ({ variants }) => {
  const firstVariant = variants[0]
  const levelIndex = hlsAdapter.hlsInstance?.levels.findIndex((level, index) => {
    return String(level.id ?? index) === firstVariant.id
  })

  if (hlsAdapter.hlsInstance && levelIndex !== undefined && levelIndex >= 0) {
    hlsAdapter.hlsInstance.nextLevel = levelIndex
  }
})

// 回到自动 ABR。
hlsAdapter.hlsInstance!.loadLevel = -1
```

dash.js 可以关闭 audio ABR 后选择 representation：

```ts
dashAdapter.updateSettings({
  streaming: {
    abr: {
      autoSwitchBitrate: {
        audio: false,
      },
    },
  },
})

dashAdapter.dashInstance?.setRepresentationForTypeById('audio', 'representation-id', true)

// 回到自动 ABR。
dashAdapter.updateSettings({
  streaming: {
    abr: {
      autoSwitchBitrate: {
        audio: true,
      },
    },
  },
})
```

交互 demo 在 HLS 或 DASH manifest 加载后会显示质量选择器。原生 HLS 无法手动控制，因为浏览器没有暴露等价 level 控制。

## 运行时配置更新

HLS update 默认只保存到后续 load：

```ts
await hlsAdapter.updateConfig({
  maxBufferLength: 48,
})
```

`hls.js` 构造参数不能全部原子化运行时修改，因此立即应用需要显式 reload：

```ts
await hlsAdapter.updateConfig(
  { maxBufferLength: 48 },
  {
    apply: 'reload',
    restorePosition: true,
    resumePlayback: true,
  },
)
```

`reload` 可能重新下载 manifest 和 segment，可能中断播放，并且不会保留 buffered 数据、retry state 或带宽估计。

DASH settings 使用 dash.js 运行时更新：

```ts
dashAdapter.updateSettings({
  streaming: {
    buffer: {
      bufferTimeDefault: 24,
    },
  },
})
```

`getConfig()` 和 `getSettings()` 返回有效 preset 加显式覆盖后的隔离副本。

## 诊断

Adapter 会暴露支持状态和 active vendor instance：

```ts
hlsAdapter.isSupported()
hlsAdapter.implementation // 'native', 'hls.js', or undefined
hlsAdapter.hlsInstance
hlsAdapter.getConfig()

dashAdapter.isSupported()
dashAdapter.dashInstance
dashAdapter.getSettings()
```

一个 adapter instance 应只被一个 active player router 持有。

## 范围

自适应播放当前面向音频 VOD。直播、低延迟直播、DRM、转码、离线媒体、播放列表管理，以及协议中立的手动音质 API 不在当前包范围内。
