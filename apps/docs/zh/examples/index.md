# 交互 Demo

这个示例使用应用实际会导入的公共 package exports。它展示核心播放、Source 输入形态、浏览器能力检测、HLS 和 DASH 适配器、自适应事件、运行时适配器更新、`AudioAnalyzer`、`EventEmitter` 和类型化错误记录。

<ClientOnly>
  <AudioPlayerDemo />
</ClientOnly>

<script setup lang="ts">
import { defineClientComponent } from 'vitepress'

// AI modified: reuse the browser-only demo while inheriting the current VitePress locale.
const AudioPlayerDemo = defineClientComponent(() => import('../../examples/AudioPlayerDemo.vue'))
</script>
