# 快速开始

gaudio 目前处于预发布阶段。公共 API 已有类型与文档，但首次正式发布前仍可能有主动调整。

## 安装

普通浏览器音频只需要安装核心包：

```bash
pnpm add gaudio
```

自适应播放只安装应用实际导入的 vendor 依赖：

```bash
pnpm add gaudio hls.js
pnpm add gaudio dashjs
```

## 导入入口

| Import | 包含内容 | Vendor 依赖 |
| --- | --- | --- |
| `gaudio` | `AudioPlayer`、`HttpAudioSource`、`AudioAnalyzer`、`EventEmitter`、核心类型、自适应事件类型、`AdaptivePlaybackPreset` | 无 |
| `gaudio/hls` | `createHlsAdapter`、HLS adapter 类型、`HlsConfig` re-export | `hls.js` |
| `gaudio/dash` | `createDashAdapter`、DASH adapter 类型、dash.js 类型 re-export | `dashjs` |

根入口不会导入 `hls.js` 或 `dashjs`。只播放 MP3、AAC、WAV、OGG 的应用不需要安装自适应 vendor。

## 创建播放器

```ts
import { AudioPlayer } from 'gaudio'

const player = new AudioPlayer({
  source: 'https://example.com/audio.mp3',
  preload: 'auto',
  volume: 0.8,
  playbackRate: 1,
  preservesPitch: true,
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
| `source` | `AudioSourceInput` | `undefined` | URL 字符串、source description、`HttpAudioSource` 或自定义 `AudioSource`。只有 `load()` 或 idle 状态下的 `play()` 才会真正加载。 |
| `adapters` | `readonly AudioEngineAdapter[]` | `[]` | 内部 engine router 使用的可选协议适配器，用于 HLS 和 DASH。注入自定义 engine 时不要同时传入。 |
| `analyzer` | `boolean \| AudioPlayerAnalyzerOptions` | `undefined` | `load()` 成功后启用 player 持有的 Web Audio 分析。传 `true` 使用默认值，也可以传 `fftSize` 和 `createAnalyzer`。 |
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
| `load()` | 打开配置的 source，并在 metadata 可用后 resolve。source、网络、解码、自适应或 autoplay 失败会以 `GAudioError` reject。 |
| `play()` | 开始或恢复播放。如果播放器是 `idle`，会先加载。 |
| `pause()` | 暂停，但保留当前位置与已加载 source。 |
| `stop()` | 暂停并回到 `0` 秒，但保留已加载 source。下一次 `play()` 会复用它。 |
| `seek(seconds)` | 跳转到非负的精确时间。非法值抛 `RangeError`。 |
| `fastSeek(seconds)` | 优先使用浏览器优化 seek 能力，不支持时回退到 `seek()`。 |
| `dispose()` | 释放当前 engine、source 生命周期、vendor instance 和事件监听器。dispose 后需要创建新的 player。 |

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

`AudioPlayer` 支持四种 source 形态：

| 形态 | 示例 | 使用场景 |
| --- | --- | --- |
| URL 字符串 | `'https://example.com/audio.mp3'` | URL 后缀或 MIME 判断已经足够路由。 |
| `AudioSourceDescription` | `{ url, protocol: 'hls', mimeType }` | 签名 URL、无后缀 URL 或网关 URL 需要显式协议 metadata。 |
| `HttpAudioSource` | `new HttpAudioSource({ url, protocol })` | 需要可复用的 URL-backed source 对象。 |
| 自定义 `AudioSource` | `{ kind: 'url', open, close }` | 需要刷新签名 URL、清理 object URL、本地 blob 或由应用管理资源生命周期。 |

```ts
import { AudioPlayer, HttpAudioSource } from 'gaudio'

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
```

自定义 source 是惰性的。`open()` 在 `load()` 期间执行，`close()` 会在 newer source 替换、加载被取消或 player dispose 时执行：

```ts
const signedSource = {
  kind: 'url' as const,
  protocol: 'media' as const,
  mimeType: 'audio/mpeg',
  async open() {
    const url = await fetch('/api/audio-url').then(response => response.text())

    return { url }
  },
  async close() {
    // 在这里释放 object URL 或服务端租约。
  },
}

player.setSource(signedSource)
await player.load()
```

## 浏览器能力

使用 `canPlayType()` 检查原生媒体支持：

```ts
const mp3Support = player.canPlayType('audio/mpeg')
const aacSupport = player.canPlayType('audio/mp4; codecs="mp4a.40.2"')
```

它返回 `''`、`'maybe'` 或 `'probably'`，语义与浏览器 media element 一致。HLS 与 DASH 支持取决于已注册 adapter 和当前浏览器，见[自适应播放](./adaptive-playback.md)。

## 自动播放行为

gaudio 在 player 层管理 autoplay，而不是直接依赖 media element 的 `autoplay` 属性。启用 `autoplay` 后，`load()` 会在 metadata ready 后尝试播放：

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
