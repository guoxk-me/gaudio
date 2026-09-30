<script setup lang="ts">
import { ArrowRight, AudioLines, ListMusic, MonitorSmartphone, Play, Radio } from '@lucide/vue'

const { isChinese } = useDocumentationLocale()
const scenarios = computed(() => [
  { id: 'basic', name: isChinese.value ? '基础播放' : 'Basic playback', icon: Play, label: 'START HERE' },
  { id: 'playlist', name: isChinese.value ? '播放列表' : 'Playlists', icon: ListMusic, label: 'PLAYBACK' },
  { id: 'media-session', name: 'Media Session', icon: MonitorSmartphone, label: 'PLATFORM' },
  { id: 'analyzer', name: isChinese.value ? '音频分析器' : 'Audio analyzer', icon: AudioLines, label: 'WEB AUDIO' },
  { id: 'hls', name: 'HLS / DASH', icon: Radio, label: 'STREAMING' },
])
// AI modified: adoption links open a concrete runnable recipe, distinct from source diagnostics.
</script>

<template>
  <section class="lifecycle-section scenario-section" aria-labelledby="examples-title">
    <div class="scenario-section__heading"><div class="lifecycle-heading"><p class="eyebrow">{{ isChinese ? '从一个真实示例出发' : 'LESS GUESSWORK. MORE PLAY.' }}</p><h2 id="examples-title">{{ isChinese ? '听到效果。看到代码。' : 'Hear it. See how it works.' }}</h2><p>{{ isChinese ? '可运行的配方，为下一个播放体验提供起点。' : 'Working recipes for the audio experience you have in mind.' }}</p></div><NuxtLink :to="isChinese ? '/zh/examples' : '/examples'">{{ isChinese ? '浏览示例' : 'Explore examples' }}<ArrowRight :size="16" aria-hidden="true" /></NuxtLink></div>
    <div class="scenario-list"><NuxtLink v-for="scenario in scenarios" :key="scenario.id" :to="{ path: isChinese ? '/zh/examples' : '/examples', query: { recipe: scenario.id } }"><component :is="scenario.icon" :size="23" stroke-width="1.5" aria-hidden="true" /><span>{{ scenario.name }}</span><code>{{ scenario.label }}</code><ArrowRight :size="14" aria-hidden="true" /></NuxtLink></div>
  </section>
</template>

<style scoped>
.scenario-section__heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 30px; }
.scenario-section__heading > a { display: flex; align-items: center; gap: 9px; flex-shrink: 0; padding-bottom: 4px; color: var(--brand-primary); text-decoration: none; font-size: 12px; }
.scenario-list { display: grid; grid-template-columns: repeat(5, 1fr); margin-top: 34px; border: 1px solid var(--border-default); border-radius: 12px; overflow: hidden; }
.scenario-list a { position: relative; display: flex; align-items: flex-start; flex-direction: column; min-width: 0; padding: 24px 22px; text-decoration: none; border-right: 1px solid var(--border-default); background: var(--surface-panel); transition: background 180ms; }
.scenario-list a:last-child { border: 0; }
.scenario-list a:hover { background: var(--brand-soft); }
.scenario-list a > svg:first-child { color: var(--brand-primary); margin-bottom: 24px; }
.scenario-list a > span { font-size: 13px; font-weight: 550; }
.scenario-list a > code { margin-top: 6px; font: 8px 'Geist Mono Variable', monospace; letter-spacing: .04em; color: var(--text-secondary); }
.scenario-list a > svg:last-child { position: absolute; right: 17px; top: 28px; color: var(--text-secondary); }
@media (max-width: 900px) { .scenario-list { grid-template-columns: 1fr; } .scenario-list a { display: grid; grid-template-columns: 26px 1fr auto 16px; align-items: center; gap: 18px; padding: 20px; border-right: 0; border-bottom: 1px solid var(--border-default); } .scenario-list a > svg:first-child, .scenario-list a > code { margin: 0; } .scenario-list a > svg:last-child { position: static; } }
@media (max-width: 600px) { .scenario-section__heading { align-items: flex-start; flex-direction: column; gap: 20px; } }
</style>
