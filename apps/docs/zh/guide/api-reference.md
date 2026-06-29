# API 参考

本页列出用户可以 import 的公共 API，以及集成 GAudio 时常用的类型。[TypeDoc 参考](/api/)提供声明级细节。

## 导入入口

| Import | 用途 |
| --- | --- |
| `gaudio` | 核心 player、source、analysis、events、errors、engine contract、共享自适应事件类型。 |
| `gaudio/hls` | HLS adapter factory 和 HLS 配置类型。需要 `hls.js`。 |
| `gaudio/dash` | DASH adapter factory 和 DASH 配置类型。需要 `dashjs`。 |

## AudioPlayer

`AudioPlayer` 是主要集成类。

```ts
const player = new AudioPlayer(options, customEngine)
```

构造输入：

| API | 类型 | 说明 |
| --- | --- | --- |
| `options` | `AudioPlayerOptions` | Source、adapters、播放默认值和 analyzer 设置。 |
| `customEngine` | `AudioEngine \| undefined` | 可选自定义 engine。不要和 `options.adapters` 同时使用。 |

Source API：

| API | 返回 | 说明 |
| --- | --- | --- |
| `setSource(source)` | `void` | 接收 `AudioSourceInput`，卸载 active engine，并把状态重置为 `idle`。 |
| `load()` | `Promise<void>` | 打开当前 source，并在 metadata 可用后 resolve。 |
| `play()` | `Promise<void>` | 开始或恢复播放；`idle` 时会先加载。 |
| `dispose()` | `void` | 释放 source 生命周期、engine、analyzer、vendor instance 和监听器。 |

播放列表 API：

| API | 返回 | 说明 |
| --- | --- | --- |
| `setPlaylist(playlist, options?)` | `void` | 选择一个播放列表 track，但不立即加载。空列表会清除当前 source。 |
| `getPlaylist()` | `readonly AudioPlaylistTrack[]` | 当前播放列表 tracks。 |
| `getPlaylistIndex()` | `number` | 当前选中的 track index；没有播放列表时为 `-1`。 |
| `selectPlaylistTrack(index, options?)` | `Promise<void>` | 按 index 选择并加载 track。 |
| `next(options?)` | `Promise<boolean>` | 加载下一首，并返回是否存在下一首。 |
| `previous(options?)` | `Promise<boolean>` | 加载上一首，并返回是否存在上一首。 |
| `getAudioTracks()` | `readonly AudioTrack[]` | 当前 playlist track 可选的多语言或备用音轨。 |
| `getSelectedAudioTrack()` | `AudioTrack \| undefined` | 当前选中的备用音轨。 |
| `selectAudioTrack(audioTrackId, options?)` | `Promise<void>` | 切换语言或备用音轨，默认保留当前时间。 |

```ts
player.setPlaylist([
  {
    source: 'https://example.com/episode-1.mp3',
    fallbackSources: ['https://cdn.example.com/episode-1.mp3'],
  },
  { source: 'https://example.com/episode-2.mp3' },
])

await player.load()
await player.next({ autoplay: true })
```

播放列表 track 在 `ended` 后会自动续播下一首。某个 track 加载失败时，GAudio 会按顺序尝试它的 `fallbackSources`，全部失败后才发出加载错误。

视频辅助音频或多语言配音应该放在同一个 playlist track 的 `audioTracks` 中：

```ts
player.setPlaylist([
  {
    source: 'https://example.com/episode.zh-CN.m4a',
    defaultAudioTrackId: 'zh-CN',
    audioTracks: [
      {
        id: 'zh-CN',
        label: '简体中文',
        language: 'zh-CN',
        source: 'https://example.com/episode.zh-CN.m4a',
      },
      {
        id: 'en',
        label: 'English',
        language: 'en',
        source: 'https://example.com/episode.en.m4a',
      },
    ],
  },
])

await player.selectAudioTrack('en')
```

`selectAudioTrack()` 默认保留当前时间和切换前的暂停/播放状态；如果需要，也可以通过 options 覆盖。

播放控制：

| API | 返回 | 说明 |
| --- | --- | --- |
| `pause()` | `void` | 暂停，但保留 source 和当前位置。 |
| `stop()` | `void` | 暂停、回到 `0`，并保持已加载 source 可继续播放。 |
| `seek(seconds)` | `Promise<void>` | 非负精确跳转。 |
| `fastSeek(seconds)` | `Promise<void>` | 浏览器支持时使用原生优化跳转。 |

设置：

| API | 返回 | 说明 |
| --- | --- | --- |
| `setPreload(preload)` / `getPreload()` | `void` / `PreloadMode` | 浏览器 preload hint。 |
| `setAutoplay(value)` / `getAutoplay()` | `void` / `boolean` | 对未来 load 生效的 player 层 autoplay。 |
| `setVolume(volume)` / `getVolume()` | `void` / `number` | `0` 到 `1` 的线性音量；非法值抛 `RangeError`。 |
| `setMuted(value)` / `isMuted()` | `void` / `boolean` | 输出静音状态。 |
| `setLoop(value)` / `isLooping()` | `void` / `boolean` | 非直播循环播放。 |
| `setPlaybackRate(rate)` / `getPlaybackRate()` | `void` / `number` | 播放速度，必须大于 `0`。 |
| `setPreservesPitch(value)` / `getPreservesPitch()` | `void` / `boolean` | 浏览器音高保持设置。 |

状态和能力 API：

| API | 返回 | 说明 |
| --- | --- | --- |
| `getState()` | `PlaybackState` | 公共生命周期状态。 |
| `getCurrentTime()` | `number` | 秒。 |
| `getDuration()` | `number` | 秒；未知时为 `0`。 |
| `isPaused()` | `boolean` | Engine 暂停状态。 |
| `isEnded()` | `boolean` | 当前 source 是否结束。 |
| `isSeeking()` | `boolean` | 原生 seeking 状态。 |
| `getBufferedRanges()` | `readonly TimeRange[]` | 已缓冲区间，单位秒。 |
| `getSeekableRanges()` | `readonly TimeRange[]` | 可跳转区间，单位秒。 |
| `getPlayedRanges()` | `readonly TimeRange[]` | 已播放区间，单位秒。 |
| `canPlayType(mimeType)` | `AudioFormatSupport` | 原生媒体支持加已注册 HLS/DASH adapter 支持：`''`、`'maybe'` 或 `'probably'`。 |
| `getAnalyzer()` | `AudioAnalyzer \| undefined` | 配置并支持 analyzer 时，在 `load()` 后返回 analyzer。 |
| `getMediaSessionMetadata()` | `AudioMediaSessionMetadata \| undefined` | direct source 和没有 metadata 的 playlist track 使用的默认 Media Session metadata。 |
| `setMediaSessionMetadata(metadata)` | `void` | 更新浏览器/系统媒体面板显示的 direct source 或 playlist fallback metadata。 |
| `getSource()` | `AudioSource \| undefined` | 当前配置的 source。 |

事件：

| API | 返回 | 说明 |
| --- | --- | --- |
| `on(eventName, handler)` | `() => void` | 注册类型化 `AudioPlayerEvents` 监听器，并返回取消函数。 |
| `once(eventName, handler)` | `() => void` | 只监听下一次匹配事件。 |
| `removeAllListeners(eventName?)` | `void` | 移除某个事件或全部 player 监听器。 |

自适应音质：

| API | 返回 | 说明 |
| --- | --- | --- |
| `getActiveAdaptivePlayback()` | `AdaptivePlaybackInfo \| undefined` | 当前 HLS/DASH 实现。 |
| `getAdaptiveVariants()` | `readonly AdaptiveVariant[]` | 当前 manifest 发现的 variants。 |
| `getAdaptiveQualitySelection()` | `AdaptiveQualitySelection` | `'auto'` 或已选择的 variant id。 |
| `setAdaptiveQuality(variantId)` | `Promise<void>` | 选择 `'auto'` ABR 或指定 variant id。原生 HLS 可能拒绝手动选择。 |

```ts
const variants = player.getAdaptiveVariants()
await player.setAdaptiveQuality('auto')
await player.setAdaptiveQuality(variants[0].id)
```

## AudioPlayerOptions

| 字段 | 类型 | 默认值 |
| --- | --- | --- |
| `source` | `AudioSourceInput` | `undefined` |
| `adapters` | `readonly AudioEngineAdapter[]` | `[]` |
| `analyzer` | `boolean \| AudioPlayerAnalyzerOptions` | `undefined` |
| `mediaSession` | `boolean \| AudioMediaSessionOptions` | `undefined` |
| `preload` | `PreloadMode` | `'metadata'` |
| `autoplay` | `boolean` | `false` |
| `muted` | `boolean` | `false` |
| `loop` | `boolean` | `false` |
| `volume` | `number` | `1` |
| `playbackRate` | `number` | `1` |
| `preservesPitch` | `boolean` | `true` |

Analyzer 类型：

| 类型 | 字段 |
| --- | --- |
| `AudioPlayerAnalyzerOptions` | `enabled?: boolean`、`fftSize?: number`、`createAnalyzer?: AudioPlayerAnalyzerFactory` |
| `AudioPlayerAnalyzerFactory` | `(context: AudioPlayerAnalyzerContext) => AudioAnalyzer \| undefined` |
| `AudioPlayerAnalyzerContext` | `engine: AudioEngine`、`fftSize: number` |
| `AudioAnalyzerOptions` | `fftSize?: number` |

使用 `analyzer: true` 可以走内置 player 分析路径；自定义 engine 或应用自持 Web Audio 图可使用 `createAnalyzer`。

Media Session options：

| 类型 | 字段 |
| --- | --- |
| `AudioMediaSessionOptions` | `enabled?: boolean`、`metadata?: AudioMediaSessionMetadata`、`seekOffset?: number` |
| `AudioMediaSessionMetadata` | `title?`、`artist?`、`album?`、`artwork?` |
| `AudioMediaSessionArtwork` | `src`、`sizes?`、`type?` |

当应用需要接入浏览器、键盘、耳机和操作系统媒体控制时，启用 `mediaSession`：

```ts
const player = new AudioPlayer({
  source: 'https://example.com/episode-1.mp3',
  mediaSession: {
    metadata: {
      title: 'Episode 1',
      artist: 'Example Studio',
      album: 'Example Podcast',
      artwork: [
        { src: '/cover-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
  },
})

player.setMediaSessionMetadata({
  title: 'Episode 2',
  artist: 'Example Studio',
})
```

系统动作会复用现有 player API：play、pause、stop、previous、next、seek backward、seek forward 和 seek to。浏览器不支持时会自动忽略，不改变播放行为。

## AudioAnalyzer

```ts
const analyzer = new AudioAnalyzer(audioContext, sourceNode, fftSize)
```

| API | 返回 | 说明 |
| --- | --- | --- |
| `connect(destinationNode)` | `void` | 把 analyzer 输出连接到另一个 Web Audio node。 |
| `getFrequencyData(options?)` | `Uint8Array` | 读取频域字节强度。`FrequencyDataOptions.binCount` 限制返回 bins。 |
| `getWaveformData(options?)` | `Uint8Array` | 读取时域波形字节。`WaveformDataOptions.sampleCount` 限制返回 samples。 |
| `dispose()` | `void` | 断开 source 输入和 analyzer 输出目标。 |

## Sources

| API 或类型 | 用途 |
| --- | --- |
| `HttpAudioSource` | URL-backed source class，字符串和 source description 会走这个包装。 |
| `BlobAudioSource` | Blob/File-backed source，会持有并释放自己的 object URL。 |
| `new HttpAudioSource(source)` | 接收 `string \| AudioSourceDescription`。 |
| `HttpAudioSource.open()` | 不发起网络请求，resolve `{ url }`。 |
| `HttpAudioSource.close()` | 普通 URL 的 no-op cleanup。 |
| `AudioSourceInput` | `string \| AudioSourceDescription \| AudioSource`。 |
| `AudioSourceDescription` | `{ url: string, protocol?: AudioProtocol, mimeType?: string }`。 |
| `AudioSource` | 自定义懒加载 source contract，包含 `kind`、可选 metadata、`open()` 和 `close()`。 |
| `AudioStreamHandle` | `{ readonly url: string }`。 |
| `AudioProtocol` | `'media' \| 'hls' \| 'dash'`。 |
| `AudioSourceKind` | `'url' \| 'blob'`。 |

`HttpAudioSource` 不管理 headers、credentials、签名 URL 刷新或 token 过期。需要加载前刷新 URL 时使用自定义 `AudioSource`；manifest 或 segment 请求在播放开始后仍需要鉴权时，使用 HLS/DASH vendor 的请求 hook。

播放列表类型：

| 类型 | 字段 |
| --- | --- |
| `AudioPlaylistTrack` | `source`, `fallbackSources?`, `metadata?` |
| `AudioPlaylistOptions` | `startIndex?` |
| `AudioPlaylistNavigationOptions` | `autoplay?` |
| `AudioTrack` | `id`, `label?`, `language?`, `source`, `fallbackSources?` |
| `AudioTrackSelectionOptions` | `preserveTime?`, `autoplay?` |

## 事件与错误

| 类型 | 用途 |
| --- | --- |
| `AudioPlayerEvents` | `AudioPlayer.on` 使用的 event-to-payload map。 |
| `AudioEngineEvents` | Player 和 router 转发的低阶 event-to-payload map。 |
| `PlaybackState` | `'idle'`、`'loading'`、`'ready'`、`'playing'`、`'paused'`、`'buffering'`、`'ended'` 或 `'error'`。 |
| `GAudioError` | 带稳定 `code`、message 和可选 `cause` 的错误类。 |
| `GAudioErrorCode` | 机器可读错误码 union。 |

Payload 类型：

| 类型 | 字段 |
| --- | --- |
| `TimeUpdate` | `currentTime`、`duration` |
| `DurationUpdate` | `duration` |
| `BufferUpdate` | `ranges` |
| `VolumeUpdate` | `volume`、`isMuted` |
| `PlaybackRateUpdate` | `playbackRate` |
| `TimeRange` | `start`、`end` |
| `PreloadMode` | `'none' \| 'metadata' \| 'auto'` |
| `AudioFormatSupport` | `'' \| 'maybe' \| 'probably'` |

## 自适应播放

从 `gaudio` 导出的共享自适应类型：

| 类型或值 | 用途 |
| --- | --- |
| `AdaptivePlaybackPreset` | `FastStart`、`Balanced`、`Stable` 三种音频 VOD profile。 |
| `AdaptiveContentType` | 自适应 adapter 的 `'vod'`、`'long-form'` 或 `'live'` 内容类型调优。 |
| `AdaptiveAudioProtocol` | `'hls' \| 'dash'`。 |
| `AdaptivePlaybackImplementation` | `'native' \| 'hls.js' \| 'dash.js'`。 |
| `AdaptivePlaybackInfo` | 当前自适应协议和实现。 |
| `AdaptiveManifestUpdate` | Manifest URL 和发现的 variants。 |
| `AdaptiveVariant` | Variant id、bitrate 和可选 codecs。 |
| `AdaptiveVariantUpdate` | 初始或自动自适应 variant 选择。 |
| `AdaptiveQualitySelection` | `'auto'` 或手动 variant id。 |
| `AdaptiveSegmentUpdate` | 可用时包含 segment request URL、variant 和 duration。 |
| `AdaptiveStreamError` | 可恢复或 fatal 自适应失败信息。 |

Adapter contract：

| 类型 | 用途 |
| --- | --- |
| `AudioEngineAdapter` | 为 HLS、DASH 或未来协议创建 `AudioEngine` 的 adapter contract。 |
| `AudioEngine` | `AudioPlayer` 和 adapters 使用的低阶 engine contract。 |
| `MediaElementAudioEngine` | 内置 `HTMLAudioElement` engine。大多数应用应直接使用 `AudioPlayer`。 |

## HLS 入口

从 `gaudio/hls` 导入。

| API 或类型 | 用途 |
| --- | --- |
| `createHlsAdapter(options?)` | 创建用于 `AudioPlayerOptions.adapters` 的 HLS adapter。 |
| `HlsAudioAdapter` | Adapter instance，包含 `hlsInstance`、`implementation`、`getConfig()`、`updateConfig()` 和 adapter 方法。 |
| `HlsAdapterOptions` | `contentType`、`preset`、`playbackStrategy` 和初始 `config`。 |
| `HlsPlaybackStrategy` | `'native-first' \| 'hls-first' \| 'native-only' \| 'hls-only'`。 |
| `HlsAdapterConfig` | 深度 partial `hls.js` 构造配置，带可合并 load policies。 |
| `HlsConfigUpdateOptions` | `apply`、`restorePosition` 和 `resumePlayback`。 |
| `HlsLoadPolicyChanges` | 部分请求策略覆盖。 |
| `HlsLoaderConfigChanges` | 部分 loader 设置和 retry 分支。 |
| `HlsRetryConfigChanges` | 部分 retry 设置。 |
| `HlsConfig` | 从 `hls.js` re-export。 |

## DASH 入口

从 `gaudio/dash` 导入。

| API 或类型 | 用途 |
| --- | --- |
| `createDashAdapter(options?)` | 创建用于 `AudioPlayerOptions.adapters` 的 DASH adapter。 |
| `DashAudioAdapter` | Adapter instance，包含 `dashInstance`、`getSettings()`、`updateSettings()` 和 adapter 方法。 |
| `DashAdapterOptions` | `contentType`、`preset` 和初始 dash.js `settings`。 |
| `MediaPlayerClass` | 从 `dashjs` re-export。 |
| `MediaPlayerSettingClass` | 从 `dashjs` re-export。 |

## EventEmitter

`EventEmitter<Events>` 可用于应用自己的小型类型化事件通道。

| API | 返回 |
| --- | --- |
| `on(eventName, handler)` | `() => void` |
| `once(eventName, handler)` | `() => void` |
| `off(eventName, handler)` | `void` |
| `emit(eventName, payload)` | `void` |
| `clear(eventName?)` | `void` |
