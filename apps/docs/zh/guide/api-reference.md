# API 参考

本页列出用户可以 import 的公共 API，以及集成 GAudio 时常用的类型。[TypeDoc 参考](/zh/api/)提供声明级细节。

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
| `setSource(source)` | `void` | 接收 `AudioSourceInput`，卸载 active engine，并把状态重置为 `idle`。Analyzer dispose 和 engine unload 错误会保留原始对象。 |
| `load()` | `Promise<void>` | 打开当前 source，并在 metadata 可用后 resolve。Adapter/analyzer 创建阶段的非 `GAudioError` 失败会包装为 `ENGINE_ERROR` 并保留原始 `cause`；加载前 analyzer 清理错误保持原样。 |
| `play()` | `Promise<void>` | 开始或恢复播放；`idle` 时会先加载。 |
| `dispose()` | `void` | 永久禁用 player 并开始清理。清理可在返回后继续；首个清理错误可能抛出，重复 `dispose()` 会重试保留的未完成工作。 |

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

`setPlaylist()`、`selectPlaylistTrack()`、`next()`、`previous()` 和 `selectAudioTrack()` 在选择 track 时会替换 active source。替换期间 analyzer dispose 或 engine unload 失败会以原始错误对象 throw 或 reject。

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
| `canPlayType(mimeType)` | `AudioFormatSupport` | 原生媒体支持加已注册 HLS/DASH 的浏览器能力探测：`''`、`'maybe'` 或 `'probably'`。自适应结果不会预检可选 peer import。 |
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

// AI modified: adapter variant 顺序不代表音质排名。
const highestBitrateVariant = [...variants]
  .sort((leftVariant, rightVariant) => rightVariant.bitrate - leftVariant.bitrate)[0]
if (highestBitrateVariant) {
  await player.setAdaptiveQuality(highestBitrateVariant.id)
}
```

Variant 顺序由 implementation 决定。按音质排名选择前，应先按 `bitrate` 排序。

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
| `BlobAudioSourceOptions` | 为 Blob/File 路由提供可选 `protocol` 和 `mimeType` hint。 |
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

对于自定义 `AudioSource`，`close()` 可能在 `open()` settle 前执行，也可能在同步或异步失败后重试。它必须取消或失效化 pending work、让迟到的 open 结果不可用、保留失败的清理状态，并保证重复调用安全。

播放列表类型：

| 类型 | 字段 |
| --- | --- |
| `AudioPlaylistTrack` | `source`, `fallbackSources?`, `metadata?`, `audioTracks?`, `defaultAudioTrackId?` |
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

在 `AudioPlayer` 边界，adapter `createEngine()` 和 analyzer factory 抛出的非 `GAudioError` 失败会包装为 `ENGINE_ERROR`；原始值保存在 `cause` 中，player 还会通过 `error` 事件发布同一个包装对象。直接调用 adapter `createEngine()` 或 `MediaElementAudioEngine` 扩展 hook 时，仍可能原样收到扩展自己的错误。Source replacement 清理和显式加载前的 analyzer 清理也会保留原始错误。

直接委托给注入式自定义 `AudioEngine` 的构造设置与订阅、`pause()`、`stop()`、由 engine 支撑的设置和查询，以及 `canPlayType()`，都会保留原始抛出值。上述直接调用的失败不会自动发布 player `error` 事件。

<!-- AI modified: 记录生命周期竞态，保证注入式 engine 的异步操作都能终止。 -->
对于 player 管理的异步操作，engine 结果与生命周期结果中先发生的一方生效。当前 `load()` 或 `play()` 会发布其保留或包装后的 engine 失败；`seek()`、`fastSeek()` 和 `setAdaptiveQuality()` 的普通 engine rejection 则仍只由委托调用返回。Dispose 会立即以 `ENGINE_ERROR` 和 `Audio operation was interrupted by player disposal` 拒绝所有进行中的操作；dispose 与取消本身不会新增 player `error`。Terminal engine `error` 会使用向 listener 仅发布一次的同一个 `GAudioError` 实例拒绝操作（`load()` 仅在 source fallback 耗尽后如此）。

| 操作 | Engine 结果 | 抢占结果 |
| --- | --- | --- |
| `load()` | 无 source 时以 `SOURCE_UNAVAILABLE` 和 `Audio source is required before loading` 拒绝。Engine 的 `GAudioError` 原样保留；其他 rejection 会包装为 `ENGINE_ERROR`，消息为 `Audio source could not be loaded`。 | `setSource()` 以 `LOAD_ABORTED` 和 `Audio operation was superseded by a replacement source` 拒绝；更新的 `load()` 使用 `Audio operation was superseded by a newer load`。 |
| `play()` | Engine 的 `GAudioError` 原样保留；其他 rejection 会包装为 `ENGINE_ERROR`，消息为 `Audio playback failed`。Fatal engine `error` 会立即以已发布的同一个实例拒绝。 | `engine.play()` 已开始后，`pause()`、`stop()`、`setSource()` 或更新的 `load()` 会静默抢占，公开 promise resolve。迟到的 settlement 仍会被观察，迟到的成功还会重新落实最新的 pause/stop 意图。仍在等待前置 load 的 play 则继承该 load 的 `LOAD_ABORTED`。 |
| `seek()` / `fastSeek()` | 注入式 engine 自身的 rejection 原样保留。 | 更新的 seek 以 `LOAD_ABORTED` 和 `Audio seek was superseded by a newer seek` 拒绝；`stop()` 使用 `Audio seek was superseded by stop`；source replacement 与更新的 load 使用上面的通用消息。 |
| `setAdaptiveQuality()` | 能力缺失时以 `PROTOCOL_UNSUPPORTED` 拒绝；否则注入式 engine 自身的 rejection 原样保留。 | 更新的 selection 以 `LOAD_ABORTED` 和 `Adaptive quality selection was superseded by a newer selection` 拒绝；source replacement 与更新的 load 使用上面的通用消息。 |
| Playlist 与 audio-track 导航 | `next()`、`previous()`、`selectPlaylistTrack()` 和 `selectAudioTrack()` 继承其 `load()`、`seek()` 或 `play()` 阶段的结果。 | 采用当前阶段对应的规则。 |

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
| `AdaptivePlaybackPreset` | `FastStart`、`Balanced`、`Stable` 三种音频缓冲 profile。 |
| `AdaptiveContentType` | 自适应 adapter 的 `'vod'`、`'long-form'` 或 `'live'` 内容类型调优。 |
| `AdaptiveAudioProtocol` | `'hls' \| 'dash'`。 |
| `AdaptivePlaybackImplementation` | `'native' \| 'hls.js' \| 'dash.js'`。 |
| `AdaptivePlaybackInfo` | 当前自适应协议和实现。 |
| `AdaptiveManifestUpdate` | Manifest URL 和发现的 variants。 |
| `AdaptiveVariant` | Variant id、bitrate 和可选 codecs。 |
| `AdaptiveVariantUpdate` | 初始、自动或手动自适应 variant 选择，并包含对应 `reason`。 |
| `AdaptiveQualitySelection` | `'auto'` 或手动 variant id。 |
| `AdaptiveSegmentUpdate` | 可用时包含 segment request URL、variant 和 duration。 |
| `AdaptiveStreamError` | 可恢复或 fatal 自适应失败信息。 |

Adapter contract：

| 类型 | 用途 |
| --- | --- |
| `AudioEngineAdapter` | 为 HLS、DASH 或未来协议创建 `AudioEngine` 的 adapter contract。 |
| `AudioEngine` | `AudioPlayer` 和 adapters 使用的低阶 engine contract。 |
| `MediaElementAudioEngine` | 内置 `HTMLAudioElement` engine，也是唯一保证继承兼容性的导出类；子类可以依赖其 public 和 protected 成员。 |

`AudioPlayer`、`AudioAnalyzer` 和 `EventEmitter` 是供直接使用或组合的具体工具类，不承诺子类兼容性。扩展 GAudio 时应优先使用 `AudioEngine`、`AudioEngineAdapter`、`AudioSource`、analyzer factory 和事件 API。

## HLS 入口

从 `gaudio/hls` 导入。

| API 或类型 | 用途 |
| --- | --- |
| `createHlsAdapter(options?)` | 创建用于 `AudioPlayerOptions.adapters` 的 HLS adapter。 |
| `HlsAudioAdapter` | Adapter instance，包含 `hlsInstance`、`implementation`、`getConfig()`、`updateConfig()` 和 adapter 方法。 |
| `HlsAdapterOptions` | `contentType`、`preset`、`playbackStrategy` 和初始 `config`。 |
| `HlsPlaybackStrategy` | `'native-first' \| 'hls-first' \| 'native-only' \| 'hls-only'`。 |
| `HlsAdapterConfig` | Partial `hls.js` 构造配置；只有 manifest、playlist、fragment 与 key load policy 接受嵌套 partial 覆盖。 |
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
| `DashSettingsChanges` | `DashAdapterOptions.settings` 和 `updateSettings()` 接受的递归稀疏 dash.js settings。 |
| `MediaPlayerClass` | 从 `dashjs` re-export。 |
| `MediaPlayerSettingClass` | 从 `dashjs` re-export。 |

## EventEmitter

`EventEmitter<Events>` 可用于应用自己的小型类型化事件通道。

`emit()` 会同步调用监听器，同时隔离每个监听器的失败，确保后续监听器仍会运行；异常会在可用时交给 `globalThis.reportError`。如果宿主没有该 API，异常会在排队的 microtask 中重新抛出；若 reporter 自身失败，则会排队抛出包含两项错误的 `AggregateError`。

| API | 返回 |
| --- | --- |
| `on(eventName, handler)` | `() => void` |
| `once(eventName, handler)` | `() => void` |
| `off(eventName, handler)` | `void` |
| `emit(eventName, payload)` | `void` |
| `clear(eventName?)` | `void` |
