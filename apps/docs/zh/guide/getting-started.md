# 快速开始

gaudio 目前处于预发布阶段。可以直接使用当前文档中的 API，但在首次正式发布前，API 仍可能有主动调整。

## 安装

```bash
pnpm add gaudio
```

## 创建播放器

```ts
import { AudioPlayer } from 'gaudio'

const player = new AudioPlayer({
  source: 'https://example.com/audio.mp3',
  preload: 'auto',
  volume: 0.8,
})

player.on('statechange', state => console.log(state))
player.on('waiting', () => console.log('buffering'))

await player.load()
await player.play()
```

`stop()` 会暂停播放并回到 0 秒，但保留已加载的 source。下一次 `play()` 会复用这个 source。

## 播放设置

```ts
player.setMuted(true)
player.setLoop(true)
player.setPlaybackRate(1.25)
player.setPreservesPitch(true)
await player.fastSeek(30)
```

音量必须在 0 到 1 之间。播放速度必须大于 0，跳转位置必须为非负数。

## Source 输入

`AudioPlayer` 支持 URL 字符串、显式 source description、`HttpAudioSource` 或自定义 `AudioSource`：

```ts
import { AudioPlayer, HttpAudioSource } from 'gaudio'

player.setSource('https://example.com/audio.mp3')
player.setSource({
  url: 'https://example.com/media?id=42',
  protocol: 'hls',
  mimeType: 'application/vnd.apple.mpegurl',
})
player.setSource(new HttpAudioSource('https://example.com/audio.ogg'))
```

自定义 `AudioSource` 通过 `open()` 和 `close()` 接入签名 URL、本地 object URL 或其他延迟资源生命周期。

## 自动播放

启用 autoplay 后，`load()` 会在 source 就绪后尝试播放。浏览器策略拒绝时会报告 `PLAYBACK_BLOCKED`，已加载的 source 仍可用于用户手动触发的重试。

## 浏览器能力

使用 `player.canPlayType(mimeType)` 检查原生媒体支持。HLS 和 DASH 支持由可选适配器提供，前提是浏览器和供应商库可以创建对应 engine。
