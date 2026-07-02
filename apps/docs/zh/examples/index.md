---
pageClass: gaudio-example-page
---

# 交互 Demo

<ClientOnly>
  <AudioPlayerDemo />
</ClientOnly>

<script setup lang="ts">
import { defineClientComponent } from 'vitepress'

// AI modified: reuse the browser-only demo while inheriting the current VitePress locale.
const AudioPlayerDemo = defineClientComponent(() => import('../../examples/AudioPlayerDemo.vue'))
</script>

## 本 Demo 覆盖的 API 面

| 领域 | 在 Studio 中可以试什么 |
| --- | --- |
| 核心播放 | 播放、暂停、停止、seek、fast seek、音量、倍速、静音、循环、自动播放、预加载、保真音高 |
| Source | URL 字符串、`AudioSourceDescription`、`HttpAudioSource`、`BlobAudioSource`、自定义 `AudioSource` 生命周期 |
| Playlist 与会话 | `setPlaylist`、fallback source、audio tracks、Media Session metadata |
| 自适应流 | HLS/DASH adapter、manifest/variant/segment 事件、手动音质、运行时配置更新 |
| 分析 | Player 持有的 `AudioAnalyzer` canvas 可视化与样本采集 |
| 工具能力 | 类型化 `EventEmitter`、`GAudioError`、浏览器 `canPlayType`、实时事件日志 |

叙事文档请看[快速开始](/zh/guide/getting-started)、[配置总览](/zh/guide/configuration)和[场景示例](/zh/guide/recipes)。精确签名请看 [API 参考](/api/)。
