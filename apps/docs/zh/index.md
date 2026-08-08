---
layout: home
title: GAudio — 浏览器优先的 TypeScript 音频流播放库
titleTemplate: false
description: 面向浏览器的类型化音频播放器，覆盖原生媒体、播放列表、Web Audio 分析、Media Session，以及可选的 HLS/DASH 自适应流。

hero:
  name: GAudio
  text: 浏览器优先的音频流播放库
  tagline: 预发布阶段的 TypeScript 播放器，覆盖原生媒体、播放列表、source 生命周期、Web Audio 分析、Media Session 控制，以及可选的 HLS/DASH 自适应播放。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/getting-started
    - theme: alt
      text: 交互示例
      link: /zh/examples/

features:
  - title: 一个类型化播放器
    details: 通过 AudioPlayer 管理加载、播放、暂停、停止、seek、fast seek、循环、静音、音量、倍速、保真音高、preload、autoplay、range 和生命周期状态。
  - title: Source 生命周期
    details: 支持 URL 字符串、显式描述、HttpAudioSource、BlobAudioSource，也支持为签名 URL、本地文件、object URL 清理和应用资源租约定制 lazy source。
  - title: 产品级播放列表
    details: 建模队列、fallback CDN、自动续播、Media Session metadata，以及多语言或 companion audio 等可保持时间线的 alternate audio tracks。
  - title: 可选自适应播放
    details: 只在需要时接入 HLS 或 DASH，并提供音频向 presets、VOD/长音频/直播调优、manifest 事件、segment 事件、variant 上报和可用时的手动清晰度控制。
  - title: 音频分析
    details: 为可视化启用 player 持有的频域与波形采样，也可以通过 AudioAnalyzer 和 analyzer factory 接入自定义 Web Audio 图。
  - title: 浏览器集成
    details: 通过 Media Session 连接浏览器、键盘、耳机和操作系统媒体控制，同时保留类型化事件与稳定的 GAudioError code 供 telemetry 使用。
---

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

// AI modified: keep the audio player out of every non-home documentation entry.
const HomeMiniPlayer = defineAsyncComponent(() => import('../.vitepress/theme/components/HomeMiniPlayer.vue'))
</script>

<ClientOnly>
  <HomeMiniPlayer />
</ClientOnly>

# 能力地图

GAudio 面向应用里的音频产品能力，而不只是给 `<audio>` 套一层薄封装。核心包覆盖原生媒体和产品播放流程；自适应 adapter 放在 subpath import 后面，所以简单的 MP3、AAC、WAV、OGG 播放器不需要加载 HLS 或 DASH 代码。

| 领域 | 可以构建什么 |
| --- | --- |
| 原生播放 | 音乐播放器、播客播放器、试听预览、本地文件播放、浏览器支持的媒体格式，以及系统媒体控制。 |
| 内容库和队列 | 有序播放列表、上一首/下一首、自动续播、fallback source、曲目 metadata，以及保持时间线的 alternate audio 选择。 |
| 受保护或本地媒体 | 签名 URL 刷新、无后缀媒体路由、本地 `File` 预览、object URL 所有权，以及通过 `AudioSource` 做自定义清理。 |
| 视觉体验 | Canvas 频谱可视化、波形仪表，以及连接到当前 player 信号的自定义 Web Audio analyzer 图。 |
| 自适应分发 | HLS 和 DASH 音频 VOD、长音频节目、直播流、音频向 buffer presets、运行时 vendor 调优、variant telemetry，以及 active implementation 支持时的手动质量选择。 |
| 可观测性 | 类型化 player 事件、自适应 manifest/segment/variant 事件、稳定错误码、buffered/seekable/played ranges、source 检查、active adaptive playback 检查，以及确定性的 dispose。 |

## 集成入口

大多数应用从 `AudioPlayer` 开始。应用持有鉴权或清理逻辑时使用 source；产品持有曲目顺序时使用 playlist；需要浏览器或系统媒体控制时打开 Media Session；source 是 HLS 或 DASH 时再接入 adapter。

```ts
import { AdaptivePlaybackPreset, AudioPlayer, BlobAudioSource } from 'gaudio'
import { createHlsAdapter } from 'gaudio/hls'

const player = new AudioPlayer({
  source: new BlobAudioSource(file),
  preload: 'metadata',
  mediaSession: true,
  analyzer: { fftSize: 1024 },
  adapters: [
    createHlsAdapter({
      contentType: 'long-form',
      preset: AdaptivePlaybackPreset.Stable,
    }),
  ],
})

player.on('variantchange', updateQualityBadge)
player.on('error', reportAudioFailure)

await player.load()
await player.play()
```

## 下一步

- 读[快速开始](./guide/getting-started.md)：安装、source 输入、浏览器能力、autoplay 行为和 analyzer 设置。
- 读[配置总览](./guide/configuration.md)：player 参数、Media Session metadata、source 参数和自适应 adapter 设置。
- 读[场景示例](./guide/recipes.md)：播放列表、签名 URL、本地文件、HLS/DASH 质量控制、直播流、telemetry 和 canvas 可视化。
- 读[自适应播放](./guide/adaptive-playback.md)：选择 HLS 或 DASH preset、content type、vendor settings 和质量行为。
- 读[API 参考](./guide/api-reference.md)：公共 API 地图和生成的 declaration reference。
