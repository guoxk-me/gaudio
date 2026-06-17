# 自适应播放

只安装应用实际使用的自适应依赖：

```bash
pnpm add gaudio hls.js
pnpm add gaudio dashjs
```

把适配器注册到播放器：

```ts
import { AdaptivePlaybackPreset, AudioPlayer } from 'gaudio'
import { createDashAdapter } from 'gaudio/dash'
import { createHlsAdapter } from 'gaudio/hls'

const player = new AudioPlayer({
  adapters: [
    createHlsAdapter({
      playbackStrategy: 'native-first',
      preset: AdaptivePlaybackPreset.Balanced,
    }),
    createDashAdapter({ preset: AdaptivePlaybackPreset.Balanced }),
  ],
})

player.setSource('https://example.com/program.m3u8')
await player.load()
```

## 播放预设

两个自适应适配器在未指定 preset 时都会使用 `AdaptivePlaybackPreset.Balanced`：

- `FastStart` 使用更小缓冲，适合快速启动和频繁切换 source。
- `Balanced` 是音乐、播客和有声书的一般默认选择。
- `Stable` 使用更大缓冲，适合弱网或波动网络。

每个 profile 会为音频 VOD 场景设置协议相关默认值，包括：

- 前向与后向缓冲，以及移动端安全的内存限制；
- 自动码率估计和切换；
- manifest、playlist、初始化分段和媒体分段的重试与超时；
- 小间隙和播放卡顿恢复；
- 暂停状态下载调度和长音频缓冲。

直播、低延迟直播、DRM、字幕、插播、遥测、服务端优化和纯视频调优不属于当前 preset 合约。

显式供应商配置会在 preset 后应用，因此会覆盖预设值：

```ts
createHlsAdapter({
  preset: AdaptivePlaybackPreset.Stable,
  config: {
    maxBufferLength: 75,
  },
})

createDashAdapter({
  preset: AdaptivePlaybackPreset.FastStart,
  settings: {
    streaming: {
      buffer: {
        bufferTimeDefault: 10,
      },
    },
  },
})
```

HLS 选择原生播放时会保存 preset，但浏览器原生 HLS 不暴露 `hls.js` 配置控制。之后如果加载路径选择 `hls.js`，配置才会生效。HLS 请求策略覆盖是递归合并的，修改一个 retry 值不会丢掉 profile 中其余 timeout 和 backoff 设置。

播放器会按显式 metadata、MIME type、再到 `.m3u8` 或 `.mpd` URL 后缀识别协议。签名 URL 或无后缀 URL 可以指定协议：

```ts
player.setSource({
  url: 'https://example.com/media?id=42',
  protocol: 'dash',
  mimeType: 'application/dash+xml',
})
```

HLS strategy 包括 `native-first`、`hls-first`、`native-only` 和 `hls-only`。运行时 HLS 配置通常在下一次 load 时生效；只允许构造时传入的设置需要显式 reload。DASH settings 使用供应商运行时 update API。

```ts
const hlsAdapter = createHlsAdapter({ preset: AdaptivePlaybackPreset.Balanced })
const dashAdapter = createDashAdapter({ preset: AdaptivePlaybackPreset.Balanced })

await hlsAdapter.updateConfig({ maxBufferLength: 48 }, { apply: 'next-load' })
dashAdapter.updateSettings({
  streaming: {
    buffer: {
      bufferTimeDefault: 24,
    },
  },
})
```

自适应播放当前支持 VOD。直播、DRM、转码、离线媒体、播放列表和手动清晰度选择不属于当前包范围。
