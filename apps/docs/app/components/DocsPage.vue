<script setup lang="ts">
import { ArrowRight, Search } from '@lucide/vue'

const { isChinese } = useDocumentationLocale()
const { openSearch } = useDocumentationSearch()
const runtimeConfig = useRuntimeConfig()
const quickPaths = computed(() => [
  { index: '01', title: isChinese.value ? '快速开始' : 'Getting started', description: isChinese.value ? '安装并创建第一个 AudioPlayer。' : 'Install GAudio and create your first AudioPlayer.', path: isChinese.value ? '/zh/guide/getting-started' : '/guide/getting-started' },
  { index: '02', title: isChinese.value ? '场景示例' : 'Recipes', description: isChinese.value ? '复制 Playlist、签名 URL 与可视化方案。' : 'Copy playlists, signed URLs, and visualization patterns.', path: isChinese.value ? '/zh/guide/recipes' : '/guide/recipes' },
  { index: '03', title: isChinese.value ? 'API 参考' : 'API reference', description: isChinese.value ? '查找类、接口、方法和稳定错误码。' : 'Find classes, interfaces, methods, and stable error codes.', path: isChinese.value ? '/zh/api' : '/api' },
  { index: '04', title: 'Player Studio', description: isChinese.value ? '在浏览器中验证真实播放链路。' : 'Validate real playback flows in the browser.', path: '/player-studio' },
])
const learningPaths = computed(() => [
  { index: '01', title: isChinese.value ? '播放器基础' : 'Player foundations', description: isChinese.value ? '配置、播放控制、Source 输入与浏览器能力。' : 'Configuration, playback controls, sources, and browser capabilities.', count: isChinese.value ? '4 篇' : '4 guides', path: isChinese.value ? '/zh/guide/getting-started' : '/guide/getting-started' },
  { index: '02', title: isChinese.value ? '产品播放流' : 'Product playback', description: isChinese.value ? 'Playlist、Fallback、备用音轨与 Media Session。' : 'Playlists, fallbacks, alternate tracks, and Media Session.', count: isChinese.value ? '5 篇' : '5 guides', path: isChinese.value ? '/zh/guide/configuration' : '/guide/configuration' },
  { index: '03', title: isChinese.value ? '自适应播放' : 'Adaptive playback', description: isChinese.value ? 'HLS / DASH、ABR、直播、质量控制与故障恢复。' : 'HLS, DASH, ABR, live streams, quality control, and recovery.', count: isChinese.value ? '6 篇' : '6 guides', path: isChinese.value ? '/zh/guide/adaptive-playback' : '/guide/adaptive-playback' },
  { index: '04', title: isChinese.value ? '分析与遥测' : 'Analysis and telemetry', description: isChinese.value ? 'Analyzer、ranges、类型化事件与稳定错误码。' : 'Analyzer data, ranges, typed events, and stable error codes.', count: isChinese.value ? '4 篇' : '4 guides', path: isChinese.value ? '/zh/guide/events' : '/guide/events' },
])

useDocumentationHead({
  title: () => isChinese.value ? 'GAudio 文档' : 'GAudio Documentation',
  description: () => isChinese.value ? '指南、示例和 API 参考。' : 'Guides, examples, and API reference for GAudio.',
})
</script>

<template>
  <section class="docs-overview">
    <div class="docs-overview__hero">
      <div>
        <p class="eyebrow">
          DOCUMENTATION / v{{ runtimeConfig.public.docsVersion }} NEXT
        </p>
        <h1>{{ isChinese ? '从第一行代码，到可观测的播放体验' : 'From the first line of code to observable playback' }}</h1>
        <p class="docs-overview__intro">
          {{ isChinese ? '按任务学习 GAudio：先完成基础播放，再逐步加入 Source 生命周期、Playlist、自适应流、Media Session 与 Analyzer。' : 'Learn GAudio by task: begin with playback, then add source lifecycle, playlists, adaptive streams, Media Session, and Analyzer.' }}
        </p>
      </div>
      <aside class="docs-version-card">
        <span>{{ isChinese ? '当前文档版本' : 'Current documentation' }}</span>
        <strong>v{{ runtimeConfig.public.docsVersion }} · next</strong>
      </aside>
    </div>
    <button class="docs-overview__search" type="button" @click="openSearch">
      <Search :size="18" aria-hidden="true" />
      <span>{{ isChinese ? '搜索指南、API 与示例…' : 'Search guides, API, and examples…' }}</span>
      <kbd>⌘ K</kbd>
    </button>
    <div class="overview-grid">
      <NuxtLink v-for="quickPath in quickPaths" :key="quickPath.path" :to="quickPath.path">
        <span>{{ quickPath.index }}</span>
        <h2>{{ quickPath.title }}</h2>
        <p>{{ quickPath.description }}</p>
      </NuxtLink>
    </div>
    <div class="docs-overview__learning">
      <section class="learning-list">
        <h2>{{ isChinese ? '按主题学习' : 'Learn by topic' }}</h2>
        <NuxtLink v-for="learningPath in learningPaths" :key="learningPath.path" :to="learningPath.path">
          <span>{{ learningPath.index }}</span>
          <span><strong>{{ learningPath.title }}</strong><small>{{ learningPath.description }}</small></span>
          <span>{{ learningPath.count }} <ArrowRight :size="13" aria-hidden="true" /></span>
        </NuxtLink>
      </section>
      <aside class="release-panel">
        <p class="eyebrow">
          RELEASE CHANNEL
        </p>
        <h2>v{{ runtimeConfig.public.docsVersion }} · npm next</h2>
        <p>{{ isChinese ? '当前文档与 npm next 标签同步。升级前请阅读变更记录，并确认 TypeScript 与浏览器能力矩阵。' : 'These edge docs track npm next. Review the changelog and compatibility matrix before upgrading.' }}</p>
        <dl>
          <div><dt>TypeScript</dt><dd>5.8+</dd></div>
          <div><dt>Node.js</dt><dd>24 LTS</dd></div>
          <div><dt>{{ isChinese ? '浏览器' : 'Browsers' }}</dt><dd>Current matrix</dd></div>
          <div><dt>License</dt><dd>MIT</dd></div>
        </dl>
      </aside>
    </div>
  </section>
</template>
