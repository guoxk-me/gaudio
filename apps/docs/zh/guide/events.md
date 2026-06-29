# 事件

`AudioPlayer.on(eventName, handler)` 会注册一个类型化监听器，并返回移除该监听器的函数。

```ts
const removePlayingListener = player.on('playing', () => {
  console.log('playing')
})

removePlayingListener()
```

事件不会回放历史状态。如果需要完整 source 生命周期，应在 `load()` 前注册监听器。

## 播放状态

`statechange` 报告公共 `PlaybackState`：

```ts
player.on('statechange', state => console.log(state))
```

| State | 含义 |
| --- | --- |
| `idle` | 没有 active loaded source。 |
| `loading` | `load()` 正在打开并附加 source。 |
| `ready` | Metadata 已可用，可以开始或恢复播放。 |
| `playing` | 正在播放。 |
| `paused` | 因用户或浏览器状态暂停。 |
| `buffering` | 播放正在等待更多媒体数据。 |
| `ended` | 非循环 source 播放到结尾。 |
| `error` | 已发布 fatal load、playback 或 adaptive 错误。 |

## 核心生命周期事件

这些事件遵循浏览器 media element 生命周期语义，也会通过自适应 engine 转发。

| 事件 | Payload | 触发时机 |
| --- | --- | --- |
| `loadstart` | `undefined` | Engine 开始加载已附加 source。 |
| `loadedmetadata` | `{ duration }` | Metadata 和 duration 可用。`duration` 单位为秒，未知时为 `0`。 |
| `canplay` | `undefined` | 浏览器报告可以开始播放。 |
| `play` | `undefined` | 播放被请求。 |
| `playing` | `undefined` | 播放正在推进。 |
| `pause` | `undefined` | 播放暂停。 |
| `waiting` | `undefined` | 播放等待更多数据。 |
| `ended` | `undefined` | 非循环 source 到达结尾。 |

```ts
player.on('loadstart', () => console.log('loading'))
player.on('loadedmetadata', ({ duration }) => console.log(duration))
player.on('playing', () => console.log('playing'))
player.on('waiting', () => console.log('buffering'))
```

## 时间与 range 事件

| 事件 | Payload | 字段 |
| --- | --- | --- |
| `seeking` | `TimeUpdate` | `currentTime`、`duration`，单位为秒。 |
| `seeked` | `TimeUpdate` | 跳转完成位置与 duration，单位为秒。 |
| `timeupdate` | `TimeUpdate` | 当前位置与 duration，单位为秒。 |
| `durationchange` | `DurationUpdate` | `duration`，单位为秒，未知时为 `0`。 |
| `bufferupdate` | `BufferUpdate` | `ranges`，按时间升序排列的 `{ start, end }` buffered ranges，单位为秒。 |

```ts
player.on('seeking', ({ currentTime }) => console.log(currentTime))
player.on('bufferupdate', ({ ranges }) => console.log(ranges))
```

`played` 和 `seekable` ranges 通过 getter 读取：

```ts
player.getPlayedRanges()
player.getSeekableRanges()
```

## 设置事件

| 事件 | Payload | 字段 |
| --- | --- | --- |
| `volumechange` | `VolumeUpdate` | `0` 到 `1` 的 `volume`，以及 `isMuted`。 |
| `ratechange` | `PlaybackRateUpdate` | `playbackRate`，`1` 是正常速度。 |

```ts
player.on('volumechange', ({ volume, isMuted }) => {
  console.log(volume, isMuted)
})

player.on('ratechange', ({ playbackRate }) => {
  console.log(playbackRate)
})
```

## 自适应事件

自适应事件为 HLS 和 DASH 使用协议中立 payload。

| 事件 | Payload | 触发时机 |
| --- | --- | --- |
| `adaptivechange` | `AdaptivePlaybackInfo` | Source 激活 HLS 或 DASH，并选择 `native`、`hls.js` 或 `dash.js`。 |
| `manifestloaded` | `AdaptiveManifestUpdate` | Vendor manifest 加载完成并暴露 variants。 |
| `variantchange` | `AdaptiveVariantUpdate` | 初始选择或自动 ABR 选择切换 variant。 |
| `segmentloadstart` | `AdaptiveSegmentUpdate` | Vendor 暴露的媒体分段请求开始。 |
| `segmentloaded` | `AdaptiveSegmentUpdate` | Vendor 暴露的媒体分段请求完成。 |
| `streamerror` | `AdaptiveStreamError` | Vendor 报告可恢复或 fatal 的自适应流错误。 |

```ts
player.on('adaptivechange', update => console.log(update.protocol, update.implementation))
player.on('manifestloaded', update => console.log(update.url, update.variants))
player.on('variantchange', update => console.log(update.variantId, update.bitrate, update.reason))
player.on('segmentloadstart', update => console.log(update.url))
player.on('segmentloaded', update => console.log(update.url, update.duration))
player.on('streamerror', update => console.log(update.category, update.isFatal, update.code))
```

`AdaptiveVariant` 字段：

| 字段 | 类型 | 描述 |
| --- | --- | --- |
| `id` | `string` | Vendor 提供的 variant 或 representation id。 |
| `bitrate` | `number` | Manifest 声明的码率，单位 bits per second。 |
| `codecs` | `string \| undefined` | Manifest 暴露 codec 声明时提供。 |

`AdaptiveVariantUpdate.reason` 在首次选择时为 `'initial'`，之后自动 ABR 切换时为 `'automatic'`。手动 vendor-level 音质切换仍可能产生 vendor 事件，但 GAudio 当前没有标准化 manual reason。

原生 HLS 通常只发出 `adaptivechange`；浏览器原生播放不会暴露与 `hls.js` 等价的 manifest、variant、segment 或可恢复错误细节。

## 错误

```ts
player.on('error', (error) => {
  console.error(error.code, error.message, error.cause)
})
```

| Code | 常见原因 |
| --- | --- |
| `SOURCE_UNAVAILABLE` | 配置 source 前调用了 `load()`。 |
| `ADAPTER_UNAVAILABLE` | Source 选择了 HLS 或 DASH，但没有注册匹配 adapter。 |
| `PROTOCOL_UNSUPPORTED` | 当前浏览器或 strategy 不支持选中的 adapter。 |
| `MANIFEST_ERROR` | HLS 或 DASH manifest 加载/解析 fatal 失败。 |
| `SEGMENT_ERROR` | 媒体分段加载 fatal 失败。 |
| `ADAPTIVE_STREAM_ERROR` | 其他 fatal adaptive vendor 错误。 |
| `LOAD_ABORTED` | 新 source 或 dispose 取代了 active load。 |
| `DECODE_FAILED` | 浏览器媒体解码失败。 |
| `PLAYBACK_BLOCKED` | 浏览器策略阻止播放，通常是缺少用户手势。 |
| `UNSUPPORTED_FORMAT` | 浏览器报告媒体格式不支持。 |
| `NETWORK_ERROR` | 浏览器 media element 报告网络失败。 |
| `ENGINE_ERROR` | 底层 engine 错误无法更具体分类。 |

可恢复的 adaptive vendor 错误会在 vendor 重试期间发出 `streamerror`。Fatal adaptive 错误还会发出 `error`，将状态切到 `error`，并 reject active `load()` 或 `play()` 操作。

交互 demo 会记录状态变化、媒体生命周期事件、时间 ranges、自适应 manifest 和音质事件、分段活动、工具预览和类型化错误码。
