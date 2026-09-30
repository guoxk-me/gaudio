<script setup lang="ts">
import { Activity, ArrowUpRight, Cable, SlidersHorizontal, Unplug } from '@lucide/vue'

const { isChinese } = useDocumentationLocale()
// AI modified: group APIs by the developer's adoption flow instead of protocol silos.
const capabilityGroups = computed(() => [
  { icon: Cable, name: 'Connect', title: isChinese.value ? '从你的音频开始。' : 'Start with your source.', body: isChinese.value ? '文件、URL、播放列表或自适应流。使用产品需要的来源。' : 'A file, a URL, a playlist, or an adaptive stream. Bring the source your product needs.', code: "player.setSource(source)", path: '/guide/configuration#source' },
  { icon: SlidersHorizontal, name: 'Control', title: isChinese.value ? '控制每一次播放。' : 'Make playback yours.', body: isChinese.value ? '播放、暂停、跳转、倍速和队列。构建你自己的 UI。' : 'Play, pause, seek, change speed, and manage a queue. Create your own interface.', code: 'await player.play()', path: '/guide/configuration' },
  { icon: Activity, name: 'Observe', title: isChinese.value ? '知道正在发生什么。' : 'Know what is happening.', body: isChinese.value ? '用强类型事件、状态、错误码和真实频谱驱动界面。' : 'Drive your UI with typed events, playback state, stable errors, and real spectrum data.', code: "player.on('statechange', onState)", path: '/guide/events' },
  { icon: Unplug, name: 'Extend', title: isChinese.value ? '需要时，再进一步。' : 'Go further, when you need.', body: isChinese.value ? '按需接入流媒体适配器、Media Session 和 Web Audio 分析器。' : 'Add streaming adapters, Media Session, and Web Audio analysis on your terms.', code: "import { createHlsAdapter } from 'gaudio/hls'", path: '/guide/adaptive-playback' },
])
</script>

<template>
  <section class="lifecycle-section workflow-section" aria-labelledby="workflow-title">
    <div class="lifecycle-heading"><p class="eyebrow">{{ isChinese ? '跟随你的开发流程' : 'FITS THE WAY YOU BUILD' }}</p><h2 id="workflow-title">{{ isChinese ? '足够简单，可以即刻开始。\n足够完整，支持继续构建。' : 'A small surface.\nRoom to build something great.' }}</h2></div>
    <div class="workflow-grid">
      <NuxtLink v-for="capability in capabilityGroups" :key="capability.name" class="workflow-card" :to="(isChinese ? '/zh' : '') + capability.path">
        <div class="workflow-card__top"><component :is="capability.icon" :size="21" stroke-width="1.5" aria-hidden="true" /><span>{{ capability.name }}</span><ArrowUpRight :size="15" aria-hidden="true" /></div>
        <h3>{{ capability.title }}</h3><p>{{ capability.body }}</p><code>{{ capability.code }}</code>
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.workflow-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 36px; }
.workflow-card { padding: 28px; border: 1px solid var(--border-default); border-radius: 12px; background: var(--surface-panel); text-decoration: none; transition: border-color 180ms, background 180ms; }
.workflow-card:hover { border-color: var(--brand-primary); background: var(--surface-soft); }
.workflow-card__top { display: flex; align-items: center; gap: 12px; color: var(--brand-primary); font: 11px 'Geist Mono Variable', monospace; }
.workflow-card__top > svg:last-child { margin-left: auto; color: var(--text-secondary); }
.workflow-card h3 { font-size: 20px; font-weight: 530; letter-spacing: -.03em; margin: 25px 0 9px; }
.workflow-card p { max-width: 450px; font-size: 13px; line-height: 1.8; color: var(--text-secondary); margin: 0; }
.workflow-card > code { display: block; margin-top: 25px; padding-top: 19px; border-top: 1px solid var(--border-default); font: 10px 'Geist Mono Variable', monospace; color: var(--text-secondary); overflow-wrap: anywhere; }
@media (max-width: 600px) { .workflow-grid { grid-template-columns: 1fr; } .workflow-card { padding: 24px; } }
</style>
