# 快速开始

GAudio 目前处于预发布阶段。公共 API 已有类型与文档，但首次正式发布前仍可能有主动调整。

## 安装

以下命令使用 npm registry 的 `next` dist-tag。在首次 registry release 可见之前，请 clone 本仓库并使用其中的 `gaudio` workspace package。

普通浏览器音频只需要安装核心包：

```bash
pnpm add gaudio@next
```

自适应播放只安装应用实际导入的 vendor 依赖：

```bash
pnpm add gaudio@next hls.js
pnpm add gaudio@next dashjs
```

## 导入入口

| Import | 包含内容 | Vendor 依赖 |
| --- | --- | --- |
| `gaudio` | `AudioPlayer`、`HttpAudioSource`、`AudioAnalyzer`、`EventEmitter`、核心类型、自适应事件类型、`AdaptivePlaybackPreset` | 无 |
| `gaudio/hls` | `createHlsAdapter`、HLS adapter 类型、`HlsConfig` re-export | `hls.js` |
| `gaudio/dash` | `createDashAdapter`、DASH adapter 类型、dash.js 类型 re-export | `dashjs` |

根入口不会导入 `hls.js` 或 `dashjs`。只播放 MP3、AAC、WAV、OGG 的应用不需要安装自适应 vendor。

## 兼容性

构建后的核心入口与 HLS 入口可由 Node.js 18 或更高版本 import；`dashjs@5` 在 Node.js 中执行时要求 Node.js 20 或更高版本。浏览器播放仍依赖 DOM media API，因此 SSR 应用应在客户端 mount 后再创建 player 和 adapter。发布的声明文件支持 TypeScript 5.8 或更高版本，并同时使用 TypeScript 5.8.3 与项目当前编译器验证。

浏览器支持按能力判断。CI 会在 Playwright 当前捆绑的 Chromium、Firefox、WebKit 桌面引擎以及 Pixel 5 Chromium 模拟项目上运行；这只表示当前引擎已验证，并不承诺最低版本或真实设备兼容。核心播放依赖 `HTMLAudioElement`，分析功能依赖 Web Audio。HLS 需要浏览器原生 HLS 或与 hls.js 兼容的 Media Source Extensions；DASH 需要与 dash.js 兼容的 Media Source Extensions 和原生 `globalThis.structuredClone()`。GAudio 不提供浏览器 polyfill。

使用 `gaudio/dash` 的 TypeScript 项目必须选择 `node16`、`nodenext` 或 `bundler` 模块解析；旧式 `node10` 解析无法解析 dash.js 的传递类型包。

Node.js 18 与 20 已停止维护；这里的版本号仅表示产物兼容下限，不是部署建议。SSR 部署与工具链应使用仍受维护的版本；GAudio 的开发和发布基线是 Node.js 24 LTS。

## 创建播放器

```ts
import { AudioPlayer } from 'gaudio'

const player = new AudioPlayer({
  source: 'https://example.com/audio.mp3',
  preload: 'auto',
  volume: 0.8,
  playbackRate: 1,
  preservesPitch: true,
  mediaSession: true,
  analyzer: true,
})

player.on('statechange', state => console.log(state))
player.on('waiting', () => console.log('buffering'))
player.on('error', error => console.error(error.code, error.message))

await player.load()
await player.play()
```

如果播放器仍是 `idle`，`play()` 会先加载 source。显式调用 `load()` 适合先拿 metadata、duration、buffered ranges，或需要在播放按钮前处理 autoplay 失败的场景。

## 构造参数

| 参数 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `source` | `AudioSourceInput` | `undefined` | URL 字符串、source description、`HttpAudioSource`、`BlobAudioSource` 或自定义 `AudioSource`。只有 `load()` 或 idle 状态下的 `play()` 才会真正加载。 |
| `adapters` | `readonly AudioEngineAdapter[]` | `[]` | 内部 engine router 使用的可选协议适配器，用于 HLS 和 DASH。注入自定义 engine 时不要同时传入。 |
| `analyzer` | `boolean \| AudioPlayerAnalyzerOptions` | `undefined` | `load()` 成功后启用 player 持有的 Web Audio 分析。传 `true` 使用默认值，也可以传 `fftSize` 和 `createAnalyzer`。 |
| `mediaSession` | `boolean \| AudioMediaSessionOptions` | `undefined` | 接入浏览器与操作系统媒体控制；需要时可传 metadata 和 seek offset。 |
| `preload` | `'none' \| 'metadata' \| 'auto'` | `'metadata'` | 应用于当前和后续 source 的浏览器 preload hint。 |
| `autoplay` | `boolean` | `false` | 让 `load()` 在 source 就绪后尝试 `play()`。浏览器策略拦截会变成 `PLAYBACK_BLOCKED`。 |
| `muted` | `boolean` | `false` | 初始静音。 |
| `loop` | `boolean` | `false` | 非直播 source 播完后自动回到开头。 |
| `volume` | `number` | `1` | `0` 到 `1` 的线性音量。非法值抛 `RangeError`。 |
| `playbackRate` | `number` | `1` | 大于 `0` 的播放速度倍率。非法值抛 `RangeError`。 |
| `preservesPitch` | `boolean` | `true` | 播放速度变化时保持音高，依赖浏览器 media element 能力。 |

## 播放控制

| API | 描述 |
| --- | --- |
| `load()` | 打开配置的 source，并在 metadata 可用后 resolve。由 GAudio 管理的 source、网络、解码、自适应或 autoplay 失败会以 `GAudioError` reject。 |
| `play()` | 开始或恢复播放。如果播放器是 `idle`，会先加载。 |
| `pause()` | 暂停，但保留当前位置与已加载 source。 |
| `stop()` | 暂停并回到 `0` 秒，但保留已加载 source。下一次 `play()` 会复用它。 |
| `seek(seconds)` | 跳转到非负的精确时间。非法值抛 `RangeError`。 |
| `fastSeek(seconds)` | 优先使用浏览器优化 seek 能力，不支持时回退到 `seek()`。 |
| `dispose()` | 永久禁用 player 并开始清理。清理可在返回后继续；清理错误可能抛出，重复调用会重试保留的工作。dispose 后请创建新的 player 和 adapter。 |

扩展回调仍是独立的异常边界。`AudioPlayer.load()` 会把 adapter `createEngine()` 和 analyzer factory 抛出的非 `GAudioError` 失败包装为 `ENGINE_ERROR`，在 `cause` 中保留原始错误，并通过 player `error` 事件发布同一个包装错误。直接调用自定义 adapter 的 `createEngine()` 时，仍可能收到 adapter 自己的原始错误。

注入的自定义 `AudioEngine` 同样属于直接扩展边界。构造阶段的设置与事件订阅、`pause()`、`stop()`、`seek()`、`fastSeek()`、由 engine 支撑的设置项、`canPlayType()`、状态与时间范围查询，以及自适应质量操作，都会保留 engine 原始抛出或 reject 的值。仅有直接委托失败时，player 不会自动通过 `error` 事件重复发布；`load()` 和 `play()` 仍属于 player 管理的边界，遵循已记录的 `GAudioError` 契约，而 fatal engine `error` 会使进行中的 play 或 autoplay load reject。

清理是另一个独立的扩展边界。`setSource()`、`setPlaylist()`、`selectPlaylistTrack()`、`next()`、`previous()` 和 `selectAudioTrack()` 会保留 source replacement 期间 analyzer dispose 或 engine unload 的原始错误；新一轮加载开始前，如果调用方提供的 analyzer 在 dispose 时抛错，显式调用的 `AudioPlayer.load()` 同样会保留该错误。在更底层的 `MediaElementAudioEngine` 中，自定义 `AudioSource.open()` / `close()`，以及底层 media-element 或子类 hook 也会保留原始错误对象。捕获这些扩展错误时应先按 `unknown` 处理；稳定的 `GAudioError.code` 描述的是 player 边界和内置 adapter 管理的失败。

## 播放设置

```ts
player.setMuted(true)
player.setLoop(true)
player.setAutoplay(false)
player.setPlaybackRate(1.25)
player.setPreservesPitch(true)
player.setPreload('metadata')
player.setVolume(0.6)
```

运行时 getter 与 setter 对应：

```ts
player.getVolume()
player.isMuted()
player.isLooping()
player.getAutoplay()
player.getPlaybackRate()
player.getPreservesPitch()
player.getPreload()
```

## 时间与 range 状态

```ts
const currentTime = player.getCurrentTime()
const duration = player.getDuration()
const buffered = player.getBufferedRanges()
const seekable = player.getSeekableRanges()
const played = player.getPlayedRanges()
const state = player.getState()
const analyzer = player.getAnalyzer()
```

`TimeRange` 使用秒作为单位：

```ts
interface TimeRange {
  start: number
  end: number
}
```

当浏览器还没有报告有限 duration 时，`getDuration()` 返回 `0`。

## Source 输入

`AudioPlayer` 支持五种 source 形态：

| 形态 | 示例 | 使用场景 |
| --- | --- | --- |
| URL 字符串 | `'https://example.com/audio.mp3'` | URL pathname 后缀已经足够路由。 |
| `AudioSourceDescription` | `{ url, protocol: 'hls', mimeType }` | 签名 URL、无后缀 URL 或网关 URL 需要显式协议 metadata。 |
| `HttpAudioSource` | `new HttpAudioSource({ url, protocol })` | 需要可复用的 URL-backed source 对象。 |
| `BlobAudioSource` | `new BlobAudioSource(file)` | 需要播放本地 `Blob` 或 `File`，并让 source 管理 object URL 清理。 |
| 自定义 `AudioSource` | `{ kind: 'url', open, close }` | 需要刷新签名 URL 或由应用管理资源生命周期。 |

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

player.setSource(new BlobAudioSource(file))
```

自定义 source 是惰性的。`open()` 在 `load()` 期间执行，`close()` 会在 newer source 替换、加载被取消或 player dispose 时执行。

GAudio 将每次 `open()` 及其对应清理视为一个 source operation。`close()` 可能在 `open()` settle 之前执行，也可能在 `open()` 同步抛错或 Promise reject 后执行；失败的清理还可能在后续 `load()`、`unload()` 或 `dispose()` 中重试。因此，自定义 source 必须取消或失效化 pending work，阻止迟到的 `open()` 结果重新变为可用，并保证重复调用 `close()` 安全。在 `close()` resolve 前不要丢弃后续重试所需的清理状态。完整的取消安全租约实现见[签名 URL source](/zh/guide/recipes#签名-url-source)。

## Source cookbook

`HttpAudioSource` 有意保持为 URL 包装。它不会自行 fetch 媒体、附加自定义请求头、设置 `credentials`、刷新签名 URL，或重试过期 token。`open()` 返回 `{ url }` 后，真正的媒体请求由浏览器或自适应播放 engine 负责。

当应用需要每次加载前刷新 URL 时，使用自定义 `AudioSource`。[签名 URL source](/zh/guide/recipes#签名-url-source)给出了 client 取消、服务端幂等 release、迟到 open 失效化，以及不吞掉失败的清理重试方案。

如果需要 bearer token 或自定义 headers，优先让应用后端返回短期签名 URL。普通 MP3/AAC/WAV/OGG 播放走原生 media element，浏览器不提供逐请求 header hook。如果 token 可能在 HLS 或 DASH 播放过程中失效，应在 `load()` 前刷新，或通过 `createHlsAdapter({ config })` / `createDashAdapter({ settings })` 使用所选 vendor 的请求 hook，因为 manifest 和 segment 请求发生在 source URL attach 之后。

Cookie 鉴权需要把媒体放在浏览器可携带 credentials 的 origin 上，并正确配置 CORS。媒体响应必须允许应用所在 origin；带 credentials 的跨域请求不能使用通配符 `Access-Control-Allow-Origin`。

Analyzer 还有额外的浏览器限制。跨域媒体可能能正常播放，但如果没有为 Web Audio 开启 CORS，浏览器仍可能返回静音的 analyzer 样本。需要 `analyzer: true` 时，请让媒体响应包含允许页面 origin 的 CORS headers，并在目标浏览器中验证 analyzer 路径。

## 浏览器能力

使用 `canPlayType()` 检查原生媒体支持：

```ts
const mp3Support = player.canPlayType('audio/mpeg')
const aacSupport = player.canPlayType('audio/mp4; codecs="mp4a.40.2"')
```

它返回 `''`、`'maybe'` 或 `'probably'`，语义与浏览器 media element 一致。HLS 与 DASH 支持取决于已注册 adapter 和当前浏览器，见[自适应播放](./adaptive-playback.md)。

## 自动播放行为

GAudio 在 player 层管理 autoplay，而不是直接依赖 media element 的 `autoplay` 属性。启用 `autoplay` 后，`load()` 会在 metadata ready 后尝试播放：

```ts
player.setAutoplay(true)

try {
  await player.load()
}
catch (error) {
  // 浏览器策略可能要求用户手势后才能播放。
}
```

如果浏览器策略阻止播放，`load()` 会用 `GAudioError` code `PLAYBACK_BLOCKED` reject。source 仍保持已加载状态，之后用户点击触发的 `play()` 可以不重新 `load()` 直接重试。

## 音频分析

如果需要读取当前媒体 source 的频域或波形字节，可以启用 player 持有的 analyzer：

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

内置 media element、HLS 和 DASH engine 会在开启分析时创建 Web Audio media-element source。跨域媒体需要通过 CORS 允许音频分析，否则浏览器可能返回静音样本。

自定义 engine 可以暴露 `createAnalyzer` 来支持简单的 `analyzer: true` 路径。应用如果自己持有 Web Audio 图，也可以传自定义工厂：

```ts
const player = new AudioPlayer({
  source: 'https://example.com/audio.mp3',
  analyzer: {
    fftSize: 2048,
    createAnalyzer: ({ fftSize }) => new AudioAnalyzer(audioContext, sourceNode, fftSize),
  },
}, customEngine)
```

低阶使用时，`AudioAnalyzer` 仍然可以分析应用自己持有的任意 `AudioNode`：

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

交互 demo 中包含一个 canvas 可视化，会持续绘制 analyzer 采集到的样本。
